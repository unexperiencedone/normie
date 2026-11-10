# TESTING.md

## 1. Test Pyramid

| Level | Scope | Tooling | Run |
|---|---|---|---|
| Unit | FD/closure, normalization, mapping, validator, algebra | pytest, hypothesis | every commit |
| Integration | API + Postgres + Redis, tenant provisioning, migrations | pytest, testcontainers | every PR |
| Agent evals | LLM quality on golden sets | custom harness | nightly / on prompt change |
| Security | Injection, RBAC, isolation | pytest + red-team set | every PR |
| End-to-end | UI flows | Playwright | nightly |
| Performance | Load, stress, soak | Locust, pgbench | see STRESS_TESTING.md |

## 2. Unit Tests (deterministic core)
Must reach 95%+ coverage in `backend/tools/`.

- **Closure:** textbook examples (R(A,B,C,D,E), A->B, BC->E, ED->A).
- **Candidate keys:** known answers; property test that every key's closure equals all attributes and no proper subset does.
- **Minimal cover:** result equivalent to input (closure equality) with no redundant FD/attribute.
- **Normal forms:** curated tables for 1NF, 2NF, 3NF, BCNF violations.
- **Decomposition:** property tests: result is lossless (chase), each part in target NF, 3NF preserves dependencies.
- **ER mapping:** each construct (1:1, 1:N, M:N, weak, multivalued, ISA) -> expected tables.
- **SQL validator:** table of allowed/denied statements per role, including obfuscated payloads.
- **Algebra generator:** SQL -> algebra string snapshots; semantic equivalence by executing both on a small database.

```python
@given(fds=fd_sets(), attrs=attr_sets())
def test_bcnf_decomposition_lossless(attrs, fds):
    parts = decompose_bcnf(Table(attrs), fds)
    assert is_lossless(Table(attrs), parts, fds)
    assert all(highest_normal_form(p, project(fds, p)) >= NF.BCNF for p in parts)
```

## 3. Integration Tests
- Provision tenant -> deploy DDL -> run query as each role -> assert allowed/denied.
- Migration rehearsal: apply up, verify, apply down, verify schema equality.
- Transaction rollback: force failure mid-plan, assert no partial writes.
- Concurrency correctness: see STRESS_TESTING section 7.
- Backup then restore into a new DB, compare checksums.

## 4. Agent Evals
Datasets in `tests/evals/`:

| Dataset | Size | Metric |
|---|---|---|
| ER extraction (description -> expected entities/relationships) | 50 | Entity F1, relationship F1 |
| FD proposal | 40 | Precision/recall vs gold FDs |
| NL-to-SQL | 200 questions over 5 schemas | Execution accuracy (result set match) |
| Adversarial | 100 | Block rate must be 100% for destructive/escalating attempts |
| Evolution | 30 | Migration correctness after rehearsal |

Gates: NL-to-SQL >= 85%, ER F1 >= 0.8, adversarial block rate = 100%. Evals run against the real LLM nightly; unit/integration use `MockAdapter`.

## 5. E2E (Playwright)
Golden path: describe clinic -> approve ER -> deploy -> query as receptionist/doctor -> tune -> evolve.

## 6. CI Pipeline
```
lint (ruff, mypy) -> unit -> integration -> security -> build images -> e2e (nightly) -> evals (nightly)
```

## 7. Definition of Done
Code + tests + docs updated, no coverage regression, security suite green, performance budget unchanged.
