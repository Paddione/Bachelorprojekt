---
title: "t2429-stdio-mcps-bridge — Implementation Plan"
ticket_id: T002429
domains: [llm, agents]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# t2429-stdio-mcps-bridge — Implementation Plan

_Ticket: T002429_

Acht stdio-MCPs (ticket-mcp, mcp-task-runner, codebase-memory-mcp, github-mcp, playwright,
docfork, sequential-thinking, webresearch) sind in der llama.cpp Web-UI nicht eintragbar,
weil diese ausschliesslich URLs akzeptiert. Die Brücke im llm-proxy macht jeden stdio-Server
unter `http://127.0.0.1:18235/mcp/<name>` als SSE-Endpunkt erreichbar.

Design: `openspec/changes/t2429-stdio-mcps-bridge/proposal.md`

## File Structure

| Path | Ist | Budget |
|---|---|---|
| `scripts/llm-proxy/mcp-bridge.mjs` | 0 | 800 |
| `scripts/llm-proxy/mcp-bridge.test.mjs` | 0 | 800 |
| `scripts/llm-proxy/server.mjs` | 381 | 419 |

## Tasks

### Task 1 — Failing Test (Vitest)

We will run the test suite for the mcp-bridge. Since `mcp-bridge.mjs` does not exist yet, the test runner should fail.

```bash
npx vitest run scripts/llm-proxy/mcp-bridge.test.mjs
# expected: FAIL
```

### Task 2 — Config-Datei `scripts/llm/mcp-bridge.json` anlegen

Die Brücke braucht eine eigene Config, getrennt von `loadouts.json` (das nur llama-server-Instanzen beschreibt). Wir legen `scripts/llm/mcp-bridge.json` an.

### Task 3 — Bridge-Modul `scripts/llm-proxy/mcp-bridge.mjs`

Implementierung der stdio-zu-HTTP/SSE-Brücke im llm-proxy.

### Task 4 — Bridge-Tests

Implementierung der Tests in `scripts/llm-proxy/mcp-bridge.test.mjs`.

### Task 5 — `scripts/llm-proxy/server.mjs` um /mcp-Routes erweitern

In der Route-Tabelle (server.mjs) vor dem `404`-Default zwei neue Pfade einfügen für GET/POST `/mcp/*`.

### Task 6 — Registry `docs/agent-guide/registry/mcp.yaml` aktualisieren

Pro stdio-Server einen `bridge:`-Block in `docs/agent-guide/registry/mcp.yaml` ergänzen.

### Task 7 — Verify (GREEN) and Gates

Verify that all tests pass and check the project's quality gates.

```bash
npx vitest run scripts/llm-proxy/mcp-bridge.test.mjs
# expected: PASS
```

The final verification task must execute all mandatory validation steps:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
