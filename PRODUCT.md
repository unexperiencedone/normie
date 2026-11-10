# PRODUCT.md

## 1. Vision
Make creating and running a correct, secure, well-designed relational database as easy as describing it. Normie is not a storage engine; it is an **agentic control layer** over engines like PostgreSQL that handles the full lifecycle: design, build, operate, evolve.

## 2. Problem
- Non-experts build spreadsheets-as-databases full of redundancy and anomalies.
- Even developers skip normalization, indexing, and access control under time pressure.
- Querying requires SQL knowledge; changing schemas safely requires migration expertise.

## 3. Target Users (Personas)

| Persona | Goal | Example |
|---|---|---|
| **Designer** | Create and maintain a domain database | Clinic admin, college IT staff, student building a project |
| **End User** | Read and write data in plain English | Receptionist, doctor, librarian |
| **Platform Admin** | Operate Normie itself | Manages tenants, quotas, health |

## 4. Core Features

### Designer side
- F1. Domain description to entities, attributes, relationships
- F2. ER diagram generation and editing
- F3. ER-to-relational mapping (1:1, 1:N, M:N, weak entities, specialization)
- F4. Functional dependency input, closure, candidate keys, minimal cover
- F5. Normalization analysis (1NF to BCNF) and lossless decomposition
- F6. DDL, index, view, and trigger generation
- F7. Role design and automatic GRANT/view generation
- F8. Deploy to an isolated tenant database
- F9. Schema evolution with migration preview and rollback
- F10. Tuning advisor (slow queries, index suggestions)

### End-user side
- F11. Natural language to relational algebra to SQL
- F12. Role-aware guardrails (RBAC, row/column limits)
- F13. Transactional writes with confirmation for risky actions
- F14. Result explanation and query plan viewer
- F15. Audit log, undo where possible

### Platform
- F16. Multi-tenant isolation, quotas, rate limits
- F17. Observability (metrics, traces, agent run history)
- F18. Backup and restore per tenant

## 5. Non-Functional Requirements

| Area | Requirement |
|---|---|
| Correctness | Normal-form checks, closure, and mapping are deterministic code, 100% unit-tested |
| Safety | No destructive SQL executes without policy pass + confirmation |
| Latency | p95 deterministic API < 200 ms; p95 NL query end-to-end < 6 s |
| Scalability | 1,000 concurrent end users, 100 tenants on reference deployment |
| Availability | 99.5% for demo/academic deployment |
| Isolation | One tenant can never read another tenant's data |
| Auditability | Every agent action and SQL statement logged immutably |

## 6. Out of Scope (v1)
Building a storage engine, NoSQL support, cross-database federation, sharding of a single tenant's data.

## 7. Success Metrics
- Time from description to deployed schema < 5 minutes
- NL-to-SQL execution accuracy >= 85% on the benchmark set
- 0 successful cross-tenant or policy-bypass attacks in the security suite
- Passes stress thresholds in `STRESS_TESTING.md`

## 8. Risks

| Risk | Mitigation |
|---|---|
| LLM generates wrong or dangerous SQL | AST validation, read-only default, dry-run, confirmation |
| LLM latency/cost under load | Caching, schema-context compression, queueing, mock mode for tests |
| Tenant data leak | Separate DB per tenant, scoped credentials, row-level security tests |
| Scope creep | Phased roadmap; first three phases already form a complete project |
