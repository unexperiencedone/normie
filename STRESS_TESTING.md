# STRESS_TESTING.md
Scalability, load, stress, spike, soak, and concurrency testing for Normie.

## 1. Objectives
1. Verify the system meets the capacity targets in `SYSTEM_DESIGN.md`.
2. Find the breaking point and confirm it degrades gracefully (429/503, not crashes or data corruption).
3. Prove transactional correctness under concurrency.
4. Prove tenant isolation under load (noisy neighbor).

## 2. Test Types

| Type | Question answered | Shape |
|---|---|---|
| Smoke | Does it work at all? | 5 users, 1 min |
| Load | Does it meet targets at expected traffic? | Ramp to 1,000 users, hold 15 min |
| Stress | Where does it break? | Increase until errors > 5% or p95 > 10x target |
| Spike | Can it handle sudden bursts? | 50 to 1,000 users in 30 s |
| Soak | Leaks or degradation over time? | 300 users for 4-8 h |
| Scalability | Does adding replicas increase throughput linearly? | Same test at 1, 2, 4 API replicas |
| Concurrency correctness | Any lost updates/deadlock anomalies? | Many writers on hot rows |
| Noisy neighbor | Does one heavy tenant hurt others? | 1 abusive tenant + 20 normal |

## 3. Environment
- Dedicated environment mirroring production topology (API x N, worker x N, PgBouncer, Postgres primary + replica, Redis).
- **LLM mode `mock`** (MockAdapter with configurable latency, e.g., 800-2000 ms jitter and 2% failures) for repeatable runs; a short **`real`** run (50 users, 10 min) validates provider rate-limit handling and cost.
- Seed data: 100 tenants; each with the clinic or college schema; largest tables 1M-10M rows via generators.
- Load generators run on separate machines; monitor their CPU (< 70%).

## 4. Workload Model

| Scenario | Weight | Description |
|---|---|---|
| Browse schema / projects | 20% | GET endpoints |
| Deterministic tools | 15% | closure, normal-form check |
| NL read query (cache miss) | 20% | LLM path |
| NL read query (repeat) | 20% | Cache path |
| Write transaction | 15% | Insert/update with transaction |
| Approval flow | 5% | Dry-run + decision |
| Tuning / evolve (heavy) | 5% | Queue jobs |

Think time: 1-5 s uniform. Users are distributed across tenants with a Zipf distribution (a few tenants hot).

## 5. Tools
- **Locust** (`tests/stress/locustfile.py`): HTTP workload, user classes, custom shapes.
- **k6** (optional): CI-friendly thresholds.
- **pgbench**: raw Postgres baseline and tenant DB capacity.
- **Prometheus + Grafana**: dashboards; **Postgres exporter**, **Redis exporter**.
- **pg_stat_statements, pg_locks**: DB-side evidence.

## 6. Pass/Fail Thresholds (Load test at 1,000 users)

| Metric | Threshold |
|---|---|
| Error rate (5xx, excluding intentional 429) | < 1% |
| Deterministic API p95 | < 200 ms |
| Cached query p95 | < 500 ms |
| NL query p95 (mock LLM 2 s) | < 6 s |
| Write p95 | < 1 s |
| Throughput | >= 200 req/s sustained |
| API CPU | < 75% average |
| Postgres connections | < 80% of max |
| Queue wait p95 (interactive) | < 2 s |
| Deadlocks per 10k txns | < 5 and all auto-retried successfully |
| Memory growth (soak) | < 5% per hour after warmup |
| Cross-tenant data in any response | 0 |

## 7. Concurrency Correctness Tests

### 7.1 Lost update
100 workers each increment `account.balance` 100 times (`balance = balance + 1`).
- READ COMMITTED with read-modify-write in app code: demonstrates lost updates (final < 10,000).
- With `SELECT ... FOR UPDATE` or atomic `UPDATE ... SET balance = balance + 1`: final == 10,000.
- Assert and record both runs for the report.

### 7.2 Deadlock
Two transaction types lock rows A,B in opposite orders. Verify Postgres detects it (`40P01`), Normie retries with backoff, and 100% of logical operations eventually succeed. Then apply consistent lock ordering and verify deadlocks drop to 0.

### 7.3 Write skew
Doctor on-call constraint (at least one doctor on call). Run at REPEATABLE READ (violation possible) and SERIALIZABLE (violations prevented, `40001` retries succeed).

### 7.4 Atomicity under failure
Kill DB connections or inject failure mid-plan for 1,000 multi-statement transactions; assert zero partial writes.

### 7.5 Idempotency
Replay the same `Idempotency-Key` 50 times concurrently; exactly one effect.

## 8. Scalability Test Procedure
1. Baseline: 1 API replica, 1 worker group. Ramp users 100, 200, 400, 800, 1,600 (5 min each).
2. Record throughput, p50/p95/p99, error rate, CPU, DB connections at each step.
3. Repeat with 2 and 4 replicas.
4. Compute scaling efficiency: `throughput(N) / (N x throughput(1))`. Target >= 0.7 up to 4 replicas.
5. Plot the throughput-vs-users curve; the knee marks capacity.
6. Identify bottleneck from metrics (CPU, pool wait, lock waits, LLM queue).

## 9. Stress and Spike Procedure
- **Stress:** add 100 users every 2 minutes until a stop condition. Record the breaking point, then reduce load and confirm recovery within 2 minutes with no manual action.
- **Spike:** 50 users for 2 min -> 1,000 in 30 s -> hold 3 min -> back to 50. Expect `429` shed load, no 5xx storm, queue drains within 60 s.
- **Failure injection (chaos):** kill an API replica, restart Redis, add 500 ms DB latency, make the LLM return 503 for 60 s. Expect circuit breaker open, cached results served, clear errors, automatic recovery.

## 10. Noisy Neighbor Test
Tenant X floods 500 req/s with heavy joins; 20 normal tenants run baseline load. Pass if normal tenants' p95 degrades < 20% and X receives `429`/timeouts.

## 11. Running the Tests

```bash
pip install locust
# smoke
locust -f tests/stress/locustfile.py --headless -u 5 -r 1 -t 1m --host http://localhost:8000
# load
locust -f tests/stress/locustfile.py --headless -u 1000 -r 20 -t 20m --host http://staging:8000 --csv results/load
# stress shape (step load, defined in file)
LOAD_SHAPE=step locust -f tests/stress/locustfile.py --headless --host http://staging:8000 --csv results/stress
# web UI
locust -f tests/stress/locustfile.py --host http://localhost:8000
# raw DB baseline
pgbench -i -s 100 tenantdb && pgbench -c 100 -j 8 -T 300 tenantdb
```

## 12. Reporting Template
For each run record: date, commit SHA, topology, LLM mode, workload, results table (thresholds vs actual), graphs (throughput, latency percentiles, errors, CPU, DB connections, queue depth), bottleneck analysis, and actions. Store under `results/YYYY-MM-DD/`.

## 13. Tuning Playbook (if thresholds fail)

| Symptom | Likely cause | Fix |
|---|---|---|
| High API CPU | Serialization, sync code | More replicas, async I/O, profile |
| Pool wait high | Too few/many connections | PgBouncer, tune pool size |
| Rising p99 with lock waits | Hot rows | Shorter transactions, lock ordering, optimistic locking |
| Slow reads | Missing index/seq scan | Tuning agent, indexes, replica routing |
| Queue growth | LLM concurrency/limits | More workers, caching, fallback provider |
| Memory growth in soak | Leak, unbounded cache | Profile, TTLs, bounded structures |
