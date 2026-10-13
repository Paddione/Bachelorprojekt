#!/usr/bin/env bash
# Start the Devmesh Python Sandbox Worker FastAPI server
set -euo pipefail

PORT="${PORT:-8088}"
HOST="${HOST:-0.0.0.0}"

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export PYTHONPATH="${DIR}:${DIR}/components/python-sandbox"

echo "[sandbox-worker] Starting Devmesh Python Sandbox server on ${HOST}:${PORT}..."
exec python3 -m uvicorn components.python_sandbox.src.server:app --host "${HOST}" --port "${PORT}"
