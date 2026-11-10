# SYSTEM_DESIGN.md

## 1. Goals and Constraints
- Support many tenants, each with its own database and many concurrent end users.
- Keep deterministic endpoints fast while LLM-backed endpoints stay bounded.
- Never let one tenant degrade or access another.

## 2. Capacity Targets (reference deployment)

| Metric | Target |
|---|---|
| Tenants | 100 (stretch: 1,000 with schema-per-tenant) |
| Concurrent end users | 1,000 |
| Peak query requests | 200 req/s (cache hits and deterministic paths) |
| NL queries (LLM) | 30 req/s sustained, queued beyond |
| Write transactions | 100 TPS aggregate |
| Largest tenant table | 10M rows |

### Back-of-envelope
- 1,000 users x 1 request / 10 s = 100 req/s average; peak 2x = 200 req/s.
- LLM call ~2 s; 30 req/s needs ~60 concurrent LLM calls. Worker pool of 64 async tasks, provider rate limits respected.
- Postgres pool: each API replica holds a bounded pool (e.g., 20). With 4 replicas and PgBouncer in transaction mode, the server sees at most ~100 backend connections.

## 3. Request Classes

| Class | Example | Path | Latency goal |
|---|---|---|---|
| Deterministic | closure, normal-form check, schema fetch | API -> tools | p95 < 200 ms |
| Read query (cached plan) | repeated NL question | cache -> DB | p95 < 500 ms |
| NL query | new question | API -> queue/LLM -> DB | p95 < 6 s |
| Write | issue book | agent -> txn -> DB | p95 < 1 s (excl. approval) |
| Long job | design, migration | queue -> worker | async, progress via WebSocket |

## 4. Scaling Strategy

### Stateless tiers
API and workers are stateless; scale horizontally behind a load balancer. State lives in Postgres and Redis.

### Caching (Redis)
- Schema context per `(tenant, schema_version, role)`: TTL until version bump.
- NL question -> generated SQL cache keyed by normalized question + schema_version (validated again on use).
- Query result cache for read-only, short TTL (5-30 s), invalidated per-tenant on writes.

### Queues and backpressure
- Separate queues: `llm_high` (interactive), `llm_batch` (design), `maintenance` (backups, tuning).
- Bounded queue length; beyond it return `429` with `Retry-After`.
- Per-tenant token bucket (e.g., 20 req/s) and per-user limit to prevent noisy neighbors.

### Database tier
- PgBouncer between API and Postgres.
- Control plane on its own instance, separate from tenant data.
- Tenants placed on clusters by a `placement` table; heavy tenants move to dedicated clusters.
- Read replicas for read-only queries (replica lag budget 1 s; reads needing freshness go to primary).
- Statement timeout (default 5 s), row cap (default 1,000), `work_mem` limits per role.

### LLM tier
- Provider adapter with timeout, retry with jitter, circuit breaker, and fallback provider.
- Context compression and prompt caching to cut tokens.
- MockAdapter for load tests.

## 5. Concurrency Control (the DBMS theory in practice)

| Scenario | Mechanism |
|---|---|
| Two clerks update the same row | `SELECT ... FOR UPDATE` or optimistic version column |
| Lost update demo | READ COMMITTED vs REPEATABLE READ vs SERIALIZABLE |
| Deadlock | Consistent lock ordering, detection + retry with backoff |
| Write skew | SERIALIZABLE with retry on `40001` |
| Idempotency | `Idempotency-Key` header for write endpoints |

## 6. Failure Modes and Mitigations

| Failure | Impact | Mitigation |
|---|---|---|
| LLM provider down | NL and design stop | Circuit breaker, fallback provider, cached SQL, clear UX message |
| Redis down | No cache, no rate limits | Degrade to DB reads, local in-memory limiter |
| Tenant DB overloaded | Slow queries | Per-tenant limits, timeout, kill long queries, move tenant |
| Bad migration | Broken schema | Rehearse on clone, transactional DDL, auto-rollback, backup before apply |
| Worker crash mid-job | Lost job | Acks after completion, retries, idempotent steps |
| Prompt injection via data | Policy bypass | Data never treated as instructions; AST validator is the final authority |

## 7. Data Durability
- WAL archiving + nightly base backups (per cluster), point-in-time recovery.
- Per-tenant logical dump on demand.
- Audit log is append-only (revoked UPDATE/DELETE, hash-chained rows optional).

## 8. Observability
- Metrics: request rate, latency histograms per class, queue depth, LLM latency/tokens/cost, pool saturation, lock waits, deadlocks, cache hit ratio.
- Traces: one trace per request spanning orchestrator, agent, tool, DB.
- Alerts: p95 breach, error rate > 1%, queue depth > threshold, pool wait > 100 ms.

## 9. Bottleneck Analysis (expected order)
1. LLM latency/rate limits
2. Postgres connections (mitigated by PgBouncer)
3. Lock contention on hot rows in tenant data
4. Control-plane writes (audit log) -> batch inserts, partition by month

## 10. Evolution Path
Single node -> multi-replica API + PgBouncer -> read replicas -> tenant placement across clusters -> optional Citus or per-region deployment.
