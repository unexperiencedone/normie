# DEPLOYMENT.md

## 1. Local (Docker Compose)
```bash
cp .env.example .env
docker compose up -d --build
docker compose exec api alembic upgrade head
docker compose exec api python -m dbforge.seed --tenants 3
```
Services: `api` (8000), `worker`, `web` (3000), `postgres` (5432), `pgbouncer` (6432), `redis` (6379), `prometheus` (9090), `grafana` (3001).

## 2. Environment Variables (`.env.example`)

| Variable | Example | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://dbforge:pw@pgbouncer:6432/control` | Control plane |
| `TENANT_CLUSTER_HOSTS` | `postgres:5432` | Comma-separated placement targets |
| `REDIS_URL` | `redis://redis:6379/0` | |
| `LLM_PROVIDER` | `openai` / `anthropic` / `mock` | Use `mock` for tests |
| `LLM_API_KEY` | | Never commit |
| `LLM_TIMEOUT_S` | `20` | |
| `JWT_SECRET` | | Random 32+ bytes |
| `STATEMENT_TIMEOUT_MS` | `5000` | Tenant query timeout |
| `ROW_LIMIT` | `1000` | |
| `RATE_LIMIT_TENANT_RPS` | `20` | |

## 3. Production Topology
```
Internet -> Load Balancer (TLS) -> API x N -> PgBouncer -> Postgres primary (+ replica)
                                    \-> Redis (HA)
                                    \-> Workers x M -> LLM provider
Prometheus/Grafana/Loki alongside
```
- Run API and workers as separate deployments; scale on CPU and queue depth.
- Control plane on its own Postgres instance.
- Enable WAL archiving to object storage; nightly base backup.

## 4. Release Process
Build image -> run migrations (expand step) -> roll out API -> roll out workers -> contract step later. Use blue/green or rolling with health checks (`/healthz`, `/readyz`).

## 5. Health Checks
`/healthz` process alive; `/readyz` checks control DB, Redis, and LLM circuit state.

## 6. Backup and Restore Drill
Monthly: restore latest base backup + WAL to a scratch instance, verify row counts and a sample query set.
