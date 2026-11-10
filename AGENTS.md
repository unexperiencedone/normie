# AGENTS.md

## 1. Principles
1. **Deterministic where correctness matters, LLM where language matters.** Closure, normal-form checks, ER mapping, SQL validation are plain code exposed to agents as **tools**.
2. **Least privilege.** Each agent only sees the tools it needs.
3. **Human-in-the-loop for irreversible actions.** DROP, bulk DELETE/UPDATE, and schema migrations require approval.
4. **Shared state, not shared memory.** Agents communicate through a typed `ProjectState` stored in the control plane.
5. **Everything is logged.** Each run records prompt, tool calls, outputs, and decisions.

## 2. Orchestrator

**Role:** Classifies the request (design / query / tune / evolve / recover), selects the specialist, passes `ProjectState`, aggregates the response.

**Routing table**

| Intent | Agent |
|---|---|
| "I need a database for..." | Design -> Schema -> Security -> Deploy |
| "Show me / add / update..." | Query -> Transaction |
| "Why is this slow?" | Tuning |
| "We now also need..." | Evolution |
| "Undo / restore" | Recovery |

**State object (`ProjectState`)**
```json
{
  "project_id": "uuid",
  "tenant_id": "uuid",
  "stage": "design|schema|security|deployed|evolving",
  "requirements_text": "...",
  "er_model": {"entities": [], "relationships": []},
  "relational_schema": {"tables": [], "fds": []},
  "roles": [],
  "ddl_version": 3,
  "pending_approvals": []
}
```

## 3. Specialist Agents

### 3.1 Design Agent
- **Input:** requirements text, user clarifications
- **Output:** `er_model` (entities, attributes with types, keys, relationships with cardinality and participation, weak entities, ISA)
- **Tools:** `validate_er(er_model)`, `render_mermaid(er_model)`, `ask_user(question)`
- **Guardrails:** max 3 clarification rounds; every entity must have a key; rejects models failing `validate_er`.
- **Syllabus:** ER model, cardinality, participation, weak entities, generalization.

### 3.2 Schema Agent
- **Input:** approved `er_model`
- **Output:** tables, PK/FK, FDs, normalized schema, DDL
- **Tools:** `er_to_relational`, `attribute_closure(attrs, fds)`, `candidate_keys(attrs, fds)`, `minimal_cover(fds)`, `check_normal_form(table, fds)`, `decompose_3nf`, `decompose_bcnf`, `check_lossless(decomp)`, `check_dependency_preservation`, `generate_ddl`
- **Behavior:** LLM proposes FDs from the domain; the user confirms; code does all analysis; LLM only explains results in plain language.
- **Syllabus:** ER to relational mapping, keys, FDs, closure, 1NF-BCNF, decomposition.

### 3.3 Security Agent
- **Input:** role descriptions ("receptionist can book appointments but not see diagnoses")
- **Output:** roles, per-role views, GRANT/REVOKE statements, optional row-level-security policies
- **Tools:** `create_role`, `generate_view(role, columns, filter)`, `generate_grants`, `simulate_access(role, sql)`
- **Guardrail:** every generated policy is verified with `simulate_access` against sample statements before deploy.
- **Syllabus:** authorization, views, GRANT/REVOKE.

### 3.4 Query Agent
- **Pipeline:** question -> intent + entity linking -> **relational algebra** -> SQL -> validation -> execution
- **Tools:** `get_schema_context(role)`, `to_relational_algebra(sql_ast)`, `validate_sql(sql, role)`, `explain(sql)`, `run_readonly(sql)`
- **Guardrails:** operates through the role's views; SQL parsed via sqlglot; allow-list of statement types; row limit and statement timeout enforced; algebra and SQL must be semantically consistent (checked by round-trip).
- **Syllabus:** relational algebra (sigma, pi, join, union, difference, division, aggregation), SQL, joins, subqueries.

### 3.5 Transaction Agent
- **Input:** a validated write plan (one or more statements)
- **Behavior:** wraps in a transaction with the isolation level the designer configured; classifies risk (low/medium/high); asks approval for high risk; rolls back on any failure; records before-images for undo.
- **Tools:** `begin(isolation)`, `dry_run(sql)` (executes then rolls back, returns affected-row counts), `commit`, `rollback`, `lock_rows(sql)`
- **Syllabus:** ACID, isolation levels, locking, deadlock handling, serializability.

### 3.6 Tuning Agent
- **Input:** slow query log, `EXPLAIN (ANALYZE, BUFFERS)` plans
- **Output:** ranked recommendations (index, composite index order, rewrite, denormalization warning) with predicted and measured improvement
- **Tools:** `get_slow_queries`, `explain_analyze`, `hypopg_test_index` (hypothetical index), `create_index_concurrently`, `benchmark(sql, n)`
- **Guardrail:** index created only after a benchmark shows improvement and the designer approves.
- **Syllabus:** B+ trees, hashing, query optimization, cost models.

### 3.7 Evolution Agent
- **Input:** new requirement ("track prescriptions")
- **Output:** migration plan: updated ER diff, normalized schema diff, forward and backward migration scripts, impact report
- **Tools:** `diff_er`, `diff_schema`, `generate_migration`, `test_migration_on_clone`, `apply_migration`
- **Guardrail:** migration always rehearsed on a clone with data sampled from the tenant; requires approval.

### 3.8 Recovery Agent
- **Tools:** `list_audit`, `undo_action(action_id)`, `create_backup`, `restore_backup(point_in_time)`
- **Syllabus:** logging, WAL, checkpoints, recovery (undo/redo).

## 4. Tool Contract (all tools)
```python
class ToolResult(BaseModel):
    ok: bool
    data: dict | None
    error: str | None
    audit_id: str
```
- Tools are pure or explicitly side-effecting (flagged `side_effect=True`).
- Side-effecting tools require a `ProjectState.approvals` entry when risk >= medium.

## 5. Prompt Conventions
- System prompt = role + allowed tools + output JSON schema + refusal rules.
- Schema context is compressed: table names, columns, types, keys, FKs, short descriptions; sample values only when needed.
- Prompts live in `backend/agents/prompts/*.md` and are versioned.

## 6. Failure Handling

| Failure | Response |
|---|---|
| Invalid JSON from LLM | Retry up to 2x with error message, then escalate to user |
| Validator rejects SQL | Feed validator error back once; otherwise show the error |
| LLM timeout | Fall back to cached response or return a queued job id |
| Ambiguous request | Ask one clarifying question |

## 7. Agent Evaluation
See `TESTING.md` section "Agent Evals": golden datasets for ER extraction, FD proposal, NL-to-SQL accuracy, and adversarial prompt-injection cases.
