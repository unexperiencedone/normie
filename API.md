# API.md
Base URL: `/api/v1`. JSON over HTTPS. Auth: `Authorization: Bearer <JWT>`. Writes accept `Idempotency-Key`.

## Auth
| Method | Path | Description |
|---|---|---|
| POST | `/auth/register` | Create user |
| POST | `/auth/login` | Returns JWT + refresh token |

## Tenants and Projects
| Method | Path | Description |
|---|---|---|
| POST | `/tenants` | Create tenant (provisions DB) |
| GET | `/projects` | List projects |
| POST | `/projects` | `{name, requirements_text}` starts Design Agent job |
| GET | `/projects/{id}` | State, stage, current artifacts |

## Design and Schema
| Method | Path | Description |
|---|---|---|
| POST | `/projects/{id}/design` | Re-run or refine design with feedback |
| PUT | `/projects/{id}/er` | Save edited ER model |
| POST | `/projects/{id}/er/approve` | Move to schema stage |
| POST | `/projects/{id}/fds` | Submit/confirm functional dependencies |
| POST | `/tools/closure` | `{attrs, fds}` -> closure (deterministic) |
| POST | `/tools/candidate-keys` | -> keys |
| POST | `/tools/normal-form` | -> highest NF + violations |
| POST | `/tools/decompose` | `{table, fds, target: "3nf"|"bcnf"}` |
| GET | `/projects/{id}/ddl` | Generated DDL and diff |
| POST | `/projects/{id}/deploy` | Provision and apply DDL |

## Security
| Method | Path | Description |
|---|---|---|
| POST | `/projects/{id}/roles` | Create from natural-language description |
| POST | `/projects/{id}/roles/{rid}/simulate` | `{sql}` -> allowed/denied + reason |

## Query and Transactions
| Method | Path | Description |
|---|---|---|
| POST | `/projects/{id}/query` | `{question}` -> `{algebra, sql, rows, plan, explanation}` |
| POST | `/projects/{id}/execute` | Validated write plan; returns dry-run or approval request |
| GET | `/approvals?status=pending` | List approvals |
| POST | `/approvals/{id}/decision` | `{decision: "approved"|"rejected"}` |

## Tuning, Evolution, Recovery
| Method | Path | Description |
|---|---|---|
| GET | `/projects/{id}/slow-queries` | Slow query list |
| POST | `/projects/{id}/tune` | Generates recommendations |
| POST | `/projects/{id}/evolve` | `{requirement}` -> migration plan |
| POST | `/projects/{id}/backups` | Create backup |
| POST | `/projects/{id}/restore` | `{backup_id | timestamp}` |
| POST | `/projects/{id}/undo/{audit_id}` | Undo supported action |

## Realtime
`WS /projects/{id}/events`: job progress, agent step stream, approval requests.

## Response Envelope
```json
{ "ok": true, "data": {}, "error": null, "request_id": "..." }
```

## Status Codes
`200/201` success, `202` job accepted (`job_id`), `400` validation, `401/403` auth, `409` conflict (version mismatch), `422` policy rejection, `429` rate limited (`Retry-After`), `503` upstream (LLM) unavailable.

## Example
```http
POST /api/v1/projects/8f.../query
{ "question": "Which students scored above 80 in Databases?" }
```
```json
{
  "ok": true,
  "data": {
    "algebra": "π name (σ course='Databases' ∧ grade>80 (Student ⋈ Enrollment ⋈ Course))",
    "sql": "SELECT s.name FROM student s JOIN enrollment e USING(student_id) JOIN course c USING(course_id) WHERE c.title='Databases' AND e.grade>80 LIMIT 1000",
    "rows": [["Asha"], ["Ravi"]],
    "plan": "Hash Join ...",
    "explanation": "Students enrolled in Databases with grade above 80."
  }
}
```
