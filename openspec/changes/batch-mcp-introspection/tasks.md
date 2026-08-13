---
title: "batch-mcp-introspection — Implementation Plan"
ticket_id: T003811
domains: [scripts]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# batch-mcp-introspection — Implementation Plan

_Ticket: T003811 — Batch: MCP-Introspektion liefert unvollstaendige Triage-Daten_

## File Structure

```
scripts/ticket-mcp/                    # MCP-Server-Code
scripts/vda/ticket/                    # ticket.sh Introspect
tests/spec/ticket-mcp/                 # Guards
```

## Tasks

### P1: MCP-Introspektion vervollstaendigen

**Dateien:** `scripts/ticket-mcp/`, `scripts/vda/ticket/`

### P2: Guard-Tests

**Datei:** `tests/spec/ticket-mcp/`

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** 6 von 9 Guards rot (T003803 x2, T003232 x3, T003406 x1); T003804-Guards gruen (kein Code-Gap), Positiv-Anker gruen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-mcp/
# expected: FAIL (rot — Introspektion noch unvollstaendig)
```

- [x] **Fix-Step (GREEN).** 9/9 Guards gruen: list.sh-Projektion (component, areas, depends_on, readiness, effort, planning_rank, desc_len, updated_at), URL-Defaults lokal (mcp-go/main.go, mcp-server.mjs, plan-context.sh), factoryAskTimeout=45s.

- [x] **Final Verification.**

```bash
task test:changed        # gruen bis auf Fremdbefund T002677-Vitest-Suite (403-Mocks) — Bug-Ticket T003963
task freshness:regenerate
task freshness:check     # gruen
```
