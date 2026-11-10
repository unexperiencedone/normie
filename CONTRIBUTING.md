# CONTRIBUTING.md

## Workflow
- Branch from `main`: `feat/<area>-<short-name>`, `fix/...`, `docs/...`.
- Small PRs (< 400 lines), one concern each. At least one review.
- Conventional commits: `feat(tools/fd): add minimal cover`.

## Code Style
- Python 3.12, type hints required, `ruff` + `mypy --strict` on `backend/tools` and `backend/guardrails`.
- Deterministic tools must be pure functions with no LLM or DB access.
- Every side-effecting tool is flagged and audited.

## Rules for Agent Changes
- Prompt changes live in `backend/agents/prompts/` and must pass the eval gates in `TESTING.md`.
- Never give an agent a tool it does not need.
- The SQL validator is the final authority; never bypass it.

## Tests
- New logic needs unit tests; new endpoints need integration tests.
- Run locally: `pytest -q`, `pytest tests/integration`, `make lint`.

## Docs
Update the relevant `.md` in the same PR. Architectural decisions get a line in the ADR table in `ARCHITECTURE.md`.

## Security
Report vulnerabilities privately to the maintainers; do not open public issues.
