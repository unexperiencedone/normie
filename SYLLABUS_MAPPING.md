# SYLLABUS_MAPPING.md
Every DBMS syllabus topic mapped to a working component and a demo you can show your professor.

| # | Topic | Component | Demo |
|---|---|---|---|
| 1 | DBMS basics, 3-schema architecture | Control plane vs tenant DB; views as external schema | Show designer view vs role view of same data |
| 2 | ER model (entities, attributes, keys) | Design Agent + `validate_er` | Describe a clinic, get ER diagram |
| 3 | Cardinality, participation, weak entities, ISA | ER editor + mapping rules | Add weak entity "Dependent" |
| 4 | ER to relational mapping | `tools/mapping` | Click Approve, see tables and FKs |
| 5 | Relational model, keys, integrity constraints | DDL generator (PK, FK, UNIQUE, CHECK, NOT NULL) | Insert violating row, see rejection |
| 6 | Relational algebra | Query Agent intermediate step | Show sigma/pi/join expression per question |
| 7 | Relational calculus (TRC/DRC) | Optional display of TRC form | Toggle "calculus view" |
| 8 | SQL: DDL, DML, joins, subqueries, aggregates, views | Query Agent, DDL generator | Run generated SQL; division query ("students enrolled in all courses") |
| 9 | Functional dependencies, closure, cover | `tools/fd` | FD editor with closure result |
| 10 | Candidate keys, prime attributes | `candidate_keys` | Show keys for a table |
| 11 | Normalization 1NF to BCNF, 4NF/5NF note | `check_normal_form`, decomposers | Unnormalized table, anomalies, then fixed |
| 12 | Lossless join, dependency preservation | `is_lossless`, preservation check | Report after decomposition |
| 13 | Indexing, B/B+ trees, hashing | Tuning Agent | Before/after index timing on 5M rows |
| 14 | File organization, storage | Tuning Agent notes + `pg_relation_size`, page stats | Show table/index size and bloat |
| 15 | Query processing and optimization | `EXPLAIN ANALYZE` viewer, algebra push-down | Compare plans with/without index |
| 16 | Transactions, ACID | Transaction Agent | Fail mid-plan, show rollback |
| 17 | Schedules, serializability (conflict, view) | Concurrency demo with precedence graph | Two sessions, draw graph, show cycle |
| 18 | Concurrency control: 2PL, timestamp, MVCC | Isolation-level demo, `FOR UPDATE` | Lost update vs fixed (STRESS_TESTING 7.1) |
| 19 | Deadlocks | Deadlock test | Detect, retry (7.2) |
| 20 | Isolation levels and anomalies | Write-skew test | Dirty/non-repeatable/phantom/write-skew table |
| 21 | Recovery: log, checkpoints, undo/redo, WAL | Recovery Agent, audit log, PITR | Restore to a timestamp |
| 22 | Security: authorization, GRANT/REVOKE, roles | Security Agent | Receptionist vs doctor |
| 23 | Triggers, stored procedures | DDL generator | Audit trigger, validation trigger |
| 24 | Distributed DB, replication, sharding (overview) | Read replicas, tenant placement | Replica lag demo |
| 25 | NoSQL/CAP (overview) | ARCHITECTURE ADR discussion | Report section |

## Suggested Report Structure
1. Problem and motivation 2. Architecture (`ARCHITECTURE.md`) 3. DBMS theory implemented (this table) 4. Results of anomaly/index/concurrency demos 5. Stress test results (`STRESS_TESTING.md`) 6. Limitations and future work.
