// Thin typed client for the FastAPI backend (proxied at /api by next.config.ts).

export class ApiError extends Error {
  status: number;
  detail?: string | null;
  hint?: string | null;
  sqlstate?: string | null;
  position?: number | null;
  constructor(status: number, payload: Record<string, unknown>) {
    super(String(payload?.message ?? "Request failed"));
    this.status = status;
    this.detail = payload?.detail as string | null;
    this.hint = payload?.hint as string | null;
    this.sqlstate = payload?.sqlstate as string | null;
    this.position = payload?.position as number | null;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method,
    credentials: "same-origin",
    headers: {
      "X-Normie-Client": "web",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let payload: Record<string, unknown> = { message: res.statusText };
    try {
      const j = await res.json();
      payload = j.error ?? (typeof j.detail === "string" ? { message: j.detail } : { message: JSON.stringify(j.detail) });
    } catch {}
    if (res.status === 401 && typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- non-component module, full reload is intended
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    }
    throw new ApiError(res.status, payload);
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(p: string) => request<T>("GET", p),
  post: <T>(p: string, b?: unknown) => request<T>("POST", p, b ?? {}),
  patch: <T>(p: string, b?: unknown) => request<T>("PATCH", p, b ?? {}),
  del: <T>(p: string, b?: unknown) => request<T>("DELETE", p, b),
};

// ------------------------------------------------------------------ types

export type Risk = "low" | "medium" | "high";

export interface Project {
  project_id: string;
  name: string;
  description: string;
  status: string;
  schema_version: number;
  created_at: string;
  pending?: number;
  pending_approvals?: number;
  tables?: number | null;
  size_bytes?: number;
  auto_approve_low_risk?: boolean;
  db_name?: string;
}

export interface Column {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
  is_identity: boolean;
  is_generated: boolean;
  is_pk: boolean;
  is_fk: boolean;
}

export interface ForeignKey {
  name: string;
  columns: string[];
  ref_table: string;
  ref_columns: string[];
  on_delete: string;
  comment?: string | null;
}

export interface TableInfo {
  name: string;
  kind: "table" | "view" | "materialized view";
  row_estimate: number;
  size_bytes: number;
  comment: string | null;
  rls: boolean;
  columns: Column[];
  primary_key: string[];
  foreign_keys: ForeignKey[];
  unique: string[][];
  checks: string[];
  indexes: { name: string; definition: string; unique: boolean; primary: boolean; size_bytes: number }[];
}

export interface Schema {
  tables: TableInfo[];
  enums: { name: string; labels: string[] }[];
}

export interface QueryResult {
  columns: { name: string; type: string }[];
  rows: unknown[][];
  row_count: number;
  truncated: boolean;
  duration_ms: number;
  algebra?: string;
}

export interface SchemaDiff {
  tables_added: string[];
  tables_removed: string[];
  tables_changed: {
    table: string;
    columns_added: string[];
    columns_removed: string[];
    columns_retyped: string[];
    indexes_added: string[];
    indexes_removed: string[];
  }[];
  row_loss_risk: string[];
}

export interface Approval {
  approval_id: string;
  project_id: string;
  source: "agent" | "user";
  kind: "migration" | "write" | "undo" | "role" | "restore";
  risk: Risk;
  summary: string;
  sql_text: string;
  down_sql: string | null;
  preview: {
    rows_affected?: number;
    before?: Record<string, unknown>[];
    after?: Record<string, unknown>[];
    reversible?: boolean;
    diff?: SchemaDiff;
    statements?: { op: string; risk: Risk; notes: string[]; rows?: number | null }[];
    data_only?: boolean;
    notes?: string[];
    op?: string;
    table?: string;
    duration_ms?: number;
    views?: string[];
  };
  status: "pending" | "approved" | "rejected" | "failed";
  result: { ok: boolean; error?: { message: string; detail?: string; hint?: string }; [k: string]: unknown } | null;
  created_at: string;
  decided_at: string | null;
}

export type WriteResponse =
  | { status: "executed"; risk: Risk; result: { rows_affected: number; audit_id: number }; summary: string }
  | { status: "pending_approval"; approval: Approval };

export interface AuditEntry {
  audit_id: number;
  actor: "user" | "agent" | "system";
  action: string;
  sql_text: string | null;
  ok: boolean;
  error: string | null;
  rows_affected: number | null;
  duration_ms: number | null;
  reversible: boolean;
  undone_by: number | null;
  created_at: string;
  email: string | null;
}

export interface ExplainResult {
  text: string;
  analyzed: boolean;
  total_cost: number;
  execution_ms: number | null;
  planning_ms: number | null;
}
