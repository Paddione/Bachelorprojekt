---
title: llm-proxy-devflow-tools
ticket_id: T901630
domains: [llm-proxy, devflow]
status: propose
---
# llm-proxy-devflow-tools — Implementation Plan

Devflow-Sandbox als llm-proxy-Tool (MVP): Python-Backend `scripts/devflow/`
mit Turbolint + Insta-CI, native Proxy-Routen `POST /tools/devflow/<verb>`
nach dem bge-Muster, Tasks mit Offline-Fallback. Details: `proposal.md`,
`design.md`, Partials in `tasks.d/`.

## File Structure

| path | status | purpose |
|------|--------|---------|
| `scripts/devflow/__init__.py` | neu | Paketmarker |
| `scripts/devflow/cli.py` | neu | einziger Einstieg, `python3 -m devflow <verb>` |
| `scripts/devflow/sandbox.py` | neu | create/activate/destroy, Manifest |
| `scripts/devflow/turbolint.py` | neu | paralleler Lint-Aggregator (V1: 3 Linter) |
| `scripts/devflow/instaci.py` | neu | lokales Required-Check-Replikat |
| `docs/code-quality/ci-map.yaml` | neu | SSOT CI-Jobname zu lokalem Kommando |
| `scripts/llm-proxy/devflow-tools.mjs` | neu | Proxy-Routen + Backend-Spawning |
| `scripts/llm-proxy/server.mjs` | bestehend | 2-Zeilen-Forward (bge-Muster) |
| `taskfiles/Taskfile.llm.yml` | bestehend | `llm:devflow:*` Tasks mit Fallback |
| `scripts/llm-proxy/devflow-tools.test.mjs` | neu | Routen-Tests (`node --test`) |
| `tests/py/spec/native_ported/spec/local-llm-proxy/test_devflow_backend.py` | neu | Backend-Tests (pytest) |

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-backend-core.md | impl | `scripts/devflow/__init__.py`, `scripts/devflow/cli.py`, `scripts/devflow/sandbox.py` |  |
| p2 | tasks.d/p2-lint-ci.md | impl | `scripts/devflow/turbolint.py`, `scripts/devflow/instaci.py`, `docs/code-quality/ci-map.yaml` | p1 |
| p3 | tasks.d/p3-proxy-frontend.md | impl | `scripts/llm-proxy/devflow-tools.mjs`, `scripts/llm-proxy/server.mjs`, `taskfiles/Taskfile.llm.yml` | p1 |
| p4 | tasks.d/p4-tests.md | tests | `scripts/llm-proxy/devflow-tools.test.mjs`, `tests/py/spec/native_ported/spec/local-llm-proxy/test_devflow_backend.py` | p1, p2, p3 |
