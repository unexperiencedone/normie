# ROADMAP.md

| Phase | Weeks | Deliverables | Syllabus covered |
|---|---|---|---|
| **0. Setup** | 1 | Repo, CI, docker compose, control-plane schema, MockAdapter | Foundations |
| **1. Schema core** | 2-3 | ER model, validator, ER-to-relational, DDL generator, FD closure/keys/cover, normal-form checks, decomposition + property tests | ER, mapping, FDs, normalization |
| **2. Design agent + UI** | 4 | Design Agent, ER diagram view, FD editor, deploy to tenant DB | ER, SQL DDL |
| **3. Security** | 5 | Roles, views, GRANTs, access simulator | Authorization, views |
| **4. Query agent** | 6-7 | SQL validator, algebra generator, NL pipeline, query console | Relational algebra, SQL |
| **5. Transactions and audit** | 8 | Transaction Agent, dry-run, approvals, audit log, undo | ACID, recovery |
| **6. Tuning and evolution** | 9-10 | Index advisor, plan viewer, migration rehearsal | Indexing, optimization |
| **7. Scale and harden** | 11 | Redis cache, queue, rate limits, PgBouncer, metrics | Concurrency, scalability |
| **8. Stress and report** | 12 | Full stress suite, concurrency demos, final report | All |

## Milestone Checks
- **M1 (end wk 3):** Given FDs, all normalization tests pass.
- **M2 (end wk 5):** Describe a clinic and get a deployed, role-secured database.
- **M3 (end wk 7):** NL-to-SQL >= 80% on the eval set, zero policy bypasses.
- **M4 (end wk 10):** Index and migration demos working.
- **M5 (end wk 12):** Load test thresholds met; report complete.

## Minimum Viable Project (if time is short)
Phases 0-3 plus a basic read-only query agent. This already covers ER, mapping, FDs, normalization, DDL, and security.

## Later Ideas
Multi-engine support (MySQL, SQLite), data import from CSV with schema inference, visual query builder, per-region deployment.
