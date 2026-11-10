-- Normie control plane (metadata only; tenant business data lives in separate databases).
-- Idempotent: safe to run on every start.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  user_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  project_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID NOT NULL REFERENCES users ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  db_name      TEXT NOT NULL UNIQUE,
  role_prefix  TEXT NOT NULL UNIQUE,
  status       TEXT NOT NULL DEFAULT 'provisioning' CHECK (status IN ('provisioning','ready','failed','deleted')),
  auto_approve_low_risk BOOLEAN NOT NULL DEFAULT true,
  schema_version INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS projects_owner_name_live ON projects (owner_id, name) WHERE status <> 'deleted';

-- One row per Postgres login role of a tenant DB. Passwords encrypted with Fernet (CREDENTIALS_KEY).
CREATE TABLE IF NOT EXISTS db_credentials (
  project_id  UUID NOT NULL REFERENCES projects ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('owner','rw','ro')),
  db_user     TEXT NOT NULL,
  secret_enc  BYTEA NOT NULL,
  rotated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, kind)
);

-- Business roles designed by the Security agent (e.g. receptionist, doctor).
CREATE TABLE IF NOT EXISTS business_roles (
  project_id  UUID NOT NULL REFERENCES projects ON DELETE CASCADE,
  name        TEXT NOT NULL,
  db_role     TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  policy      JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, name)
);

CREATE TABLE IF NOT EXISTS schema_versions (
  project_id  UUID NOT NULL REFERENCES projects ON DELETE CASCADE,
  version     INT NOT NULL,
  summary     TEXT NOT NULL,
  up_sql      TEXT NOT NULL,
  down_sql    TEXT,
  applied_by  UUID REFERENCES users,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, version)
);

CREATE TABLE IF NOT EXISTS conversations (
  conversation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT 'New chat',
  -- full PydanticAI message history (ModelMessagesTypeAdapter JSON) so the agent keeps context
  history     JSONB NOT NULL DEFAULT '[]',
  -- UI transcript: user/assistant turns with tool-call cards, for re-rendering
  transcript  JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conversations_project_idx ON conversations (project_id, updated_at DESC);

-- Human-in-the-loop gate for every side-effecting action of medium/high risk.
CREATE TABLE IF NOT EXISTS approvals (
  approval_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects ON DELETE CASCADE,
  requested_by UUID REFERENCES users,
  source      TEXT NOT NULL CHECK (source IN ('agent','user')),
  kind        TEXT NOT NULL CHECK (kind IN ('migration','write','undo','role','restore')),
  risk        TEXT NOT NULL CHECK (risk IN ('low','medium','high')),
  summary     TEXT NOT NULL,
  sql_text    TEXT NOT NULL,
  down_sql    TEXT,
  preview     JSONB NOT NULL DEFAULT '{}',
  payload     JSONB NOT NULL DEFAULT '{}',   -- structured input for non-SQL actions (role spec, undo target, backup id)
  conversation_id UUID,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','failed')),
  result      JSONB,
  decided_by  UUID REFERENCES users,
  decided_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS approvals_project_idx ON approvals (project_id, status, created_at DESC);

-- Append-only audit trail of every statement executed against a tenant DB.
CREATE TABLE IF NOT EXISTS audit_log (
  audit_id     BIGSERIAL PRIMARY KEY,
  project_id   UUID NOT NULL REFERENCES projects ON DELETE CASCADE,
  user_id      UUID REFERENCES users,
  actor        TEXT NOT NULL CHECK (actor IN ('user','agent','system')),
  action       TEXT NOT NULL,             -- query|write|migration|undo|provision|rotate|role
  sql_text     TEXT,
  ok           BOOLEAN NOT NULL,
  error        TEXT,
  rows_affected INT,
  duration_ms  INT,
  undo         JSONB,                     -- {table, pk, kind, rows} enough to reverse a write
  undone_by    BIGINT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_project_idx ON audit_log (project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS backups (
  backup_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects ON DELETE CASCADE,
  label       TEXT NOT NULL,
  path        TEXT NOT NULL,
  size_bytes  BIGINT,
  schema_version INT,
  created_by  UUID REFERENCES users,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every agent run and tool call (AGENTS.md principle 5: everything is logged).
CREATE TABLE IF NOT EXISTS agent_events (
  event_id    BIGSERIAL PRIMARY KEY,
  project_id  UUID NOT NULL REFERENCES projects ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations ON DELETE CASCADE,
  run_id      UUID NOT NULL,
  kind        TEXT NOT NULL,              -- run_start|tool_call|tool_result|run_end|error
  tool        TEXT,
  payload     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_events_run_idx ON agent_events (run_id);

-- Enforce append-only audit: no DELETE, and UPDATE may only set undone_by once.
CREATE OR REPLACE FUNCTION audit_log_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'audit_log is append-only';
  END IF;
  IF (to_jsonb(NEW) - 'undone_by') IS DISTINCT FROM (to_jsonb(OLD) - 'undone_by') OR OLD.undone_by IS NOT NULL THEN
    RAISE EXCEPTION 'audit_log rows are immutable';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS audit_log_guard_trg ON audit_log;
CREATE TRIGGER audit_log_guard_trg BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_guard();
