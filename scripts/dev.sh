#!/usr/bin/env bash
# Start the whole stack for development: FastAPI (8000, auto-reload) + Next.js (3000).
# Requires a reachable PostgreSQL superuser in DATABASE_URL (or run scripts/dev-db.sh for a local one).
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d .venv ] || uv sync
[ -d frontend/node_modules ] || (cd frontend && npm install)
trap 'kill 0' EXIT
uv run uvicorn backend.main:app --port 8000 --reload --reload-dir backend &
(cd frontend && npx next dev -p 3000) &
wait
