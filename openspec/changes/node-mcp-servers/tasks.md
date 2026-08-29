---
title: "node-mcp-servers — Implementation Plan"
ticket_id: T-PENDING
domains: [ops]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# node-mcp-servers — Implementation Plan

## File Structure

```
scripts/brain-mcp-node/index.mjs                    (new)  P1
scripts/brain-mcp-node/server.mjs                   (new)  P1
scripts/brain-mcp-node/package.json                 (new)  P1
scripts/factory-mcp-node/server.mjs                 (new)  P2
scripts/factory-mcp-node/package.json               (new)  P2
scripts/ticket-mcp-node/server.mjs                  (new)  P3
scripts/ticket-mcp-node/runner.mjs                  (new)  P3
scripts/ticket-mcp-node/package.json                (new)  P3
docs/agent-guide/registry/mcp.yaml                  (edit) P4
scripts/mcp-sync.sh                                 (edit) P4
.mcp.json                                           (edit) P4
.opencode/opencode.jsonc                            (edit) P4
tests/spec/brain-mcp/bm25-search.bats               (new)  P5
tests/spec/brain-mcp/brain-read.bats                (new)  P5
tests/spec/brain-mcp/brain-mcp-tool-list.bats       (new)  P5
tests/spec/factory-mcp/factory-status.bats          (new)  P5
tests/spec/factory-mcp/factory-queue.bats           (new)  P5
tests/spec/factory-mcp/factory-trigger.bats         (new)  P5
tests/spec/ticket-mcp/ticket-mcp-node.bats          (new)  P5
scripts/ticket-mcp/go/                              (delete) P6
scripts/brain-mcp-server.py                         (delete) P6
scripts/brain-index.py                              (delete) P6
scripts/mcp-task-runner/runner.mjs                  (edit) P6  233/233 → 0 (import removed)
```

## Partial-Manifest

| Partial | Rolle | target_files |
|---|---|---|
| P1 | ops | `scripts/brain-mcp-node/index.mjs`, `server.mjs`, `package.json` |
| P2 | ops | `scripts/factory-mcp-node/server.mjs`, `package.json` |
| P3 | ops | `scripts/ticket-mcp-node/server.mjs`, `runner.mjs`, `package.json` |
| P4 | ops | `mcp.yaml`, `mcp-sync.sh`, `.mcp.json`, `.opencode/opencode.jsonc` |
| P5 | test | Alle BATS-Tests für brain/factory/ticket-mcp-node |
| P6 | ops | Löschungen: Go/Python-Quellen, runner.mjs import adjust |

## P1 — Brain-MCP Node.js Port

- `scripts/brain-mcp-node/index.mjs` anlegen:
  - BM25-Engine aus `scripts/brain-index.py` 1:1 übersetzen:
    - `BrainIndex` Klasse mit `__init__`, `_build_index`, `_ensure_fresh`
    - `_tokenize`: `re.findall(r"\w+", text)` → `text.match(/\w+/g) || []`
    - `BM25._score`: `math.log((N - df + 0.5) / (df + 0.5) + 1.0)` → `Math.log(...)`
    - `parse_frontmatter`: `---` Delimiter, Key:Value Parser
    - `freshness_for`: `datetime` Vergleich → `Date` Vergleich (UTC)
    - `search`: Token-Frequenz, IDF, Scoring, Top-K, Snippet-Extraktion
    - `read_page`: Slug-Lookup, Seiten-Rückgabe
  - `package.json`: `"name": "brain-mcp-node", "type": "module"`, keine deps
  - Unit-Tests: Tokenisierung, BM25-Scoring, Freshness-Filter, Frontmatter-Parsing

- `scripts/brain-mcp-node/server.mjs` anlegen:
  - `readline`-basiertes stdio MCP-Server-Template (identisch zu mcp-task-runner/server.mjs)
  - Tools: `brain_search`, `brain_read` — identische Schemata wie Python-Version
  - `BRAIN_WIKI_DIR` aus Environment lesen
  - RPC-Handler: `initialize`, `tools/list`, `tools/call`, `ping`
  - `package.json`: `"name": "brain-mcp-node", "type": "module"`, keine deps

## P2 — Factory-MCP Node.js Port

- `scripts/factory-mcp-node/server.mjs` anlegen:
  - `createServer` HTTP-Server (identisch zu bge-mcp/server.mjs Muster)
  - `/mcp`-Endpoint: JSON-RPC 2.0 Dispatcher (initialize, ping, tools/list, tools/call)
  - `/health`-Endpoint: `{ok: true, server: "factory-mcp", build, stale}`
  - CORS-Header (identisch zu Go-Version: `Access-Control-Allow-Origin: *`)
  - 7 Tool-Handler:
    - `factory_status`: `scripts/factory/queue.sh` + psql via `factory_resolve` + lock check
    - `factory_queue`: `scripts/factory/queue.sh` Output
    - `factory_enqueue`: `scripts/ticket.sh enqueue`
    - `factory_trigger`: `scripts/factory/wakeup.sh` (detached)
    - `factory_recent`: psql gegen `ticket_comments` LIMIT N
    - `openspec_find_similar`: HTTP GET zu `OPENSPEC_SEARCH_URL/api/openspec/search`
    - `factory_ask`: OpenAI-compatible `/chat/completions` POST mit reasoning extraction
  - `package.json`: `"name": "factory-mcp-node", "type": "module"`, keine deps

## P3 — Ticket-MCP Node.js Port

- `scripts/ticket-mcp-node/runner.mjs` anlegen:
  - `runTicket(args, env)` — `child_process.spawn('scripts/ticket.sh', args, {env})`
  - Arg-Validierung: `validateArg(value)` — alphanumerisch + `_:./-`, kein `-` prefix
  - Timeout: 15s default, konfigurierbar
  - Output-Buffering: stdout + stderr → String

- `scripts/ticket-mcp-node/server.mjs` anlegen:
  - `readline`-basiertes stdio MCP-Server-Template
  - 22 Tool-Handler (alle Thin-Wrappers um `runner.runTicket`):
    - `list_tickets`, `get_ticket`, `export_tickets`, `export_ticket_timeline`
    - `triage_ticket`, `backfill_ticket_id`
    - `set_plan_meta`, `set_readiness_flag`, `prepare_feature`
    - `transition_status`, `add_comment`, `update_fields`
    - `report_mishap`, `get_mishap_buffer`, `flush_mishap_buffer`
    - `link_tickets`, `get_ticket_links`
    - `record_phase_event`, `record_grill_answers`, `stage_plan`, `create_ticket`
    - `enqueue_ticket`, `set_touched_files`, `get_attachments`, `archive_plan`, `add_pr_link`
  - `package.json`: `"name": "ticket-mcp-node", "type": "module"`, keine deps

## P4 — Registry- und Harness-Sync

- `docs/agent-guide/registry/mcp.yaml`:
  - `ticket-mcp`: command → `node scripts/ticket-mcp-node/server.mjs`
  - `factory-mcp`: (bereits HTTP, nur command/bridge-Config prüfen)
  - `brain-mcp`: command → `node scripts/brain-mcp-node/server.mjs`
  - Alle harness-Einträge (.claude/.opencode/.agy/llamacpp) anpassen

- `scripts/mcp-sync.sh`:
  - stdio-Paths für die drei neuen Server eintragen
  - Alte Paths (ticket-mcp-go, python3 brain-mcp-server.py) entfernen

- `.mcp.json` (Claude Code):
  - Kommando-Pfade aktualisieren

- `.opencode/opencode.jsonc`:
  - Kommando-Pfade aktualisieren

## P5 — Tests

- `tests/spec/brain-mcp/bm25-search.bats`:
  - Tokenisierung gegen definierte Eingaben
  - BM25-Scoring gegen definierte Dokumentenkollektion
  - Freshness-Filter (stale/future/current)
  - Multi-Tag-Filter

- `tests/spec/brain-mcp/brain-read.bats`:
  - `brain_read` für existierende Slugs
  - `brain_read` für nicht-existierende Slugs → Fehler
  - Frontmatter-Metadata in Antwort

- `tests/spec/brain-mcp/brain-mcp-tool-list.bats`:
  - `tools/list` liefert genau 2 Tools
  - Tool-Schemata sind identisch zur Python-Version

- `tests/spec/factory-mcp/factory-status.bats`:
  - `factory_status` mit leerer Queue
  - `factory_status` mit Einträgen
  - `factory_status` stale-Binary-Erkennung

- `tests/spec/factory-mcp/factory-queue.bats`:
  - `factory_queue` gibt queue.sh-JSON zurück
  - Dispatch-Gates (lastenheft_locked etc.) sind im JSON enthalten

- `tests/spec/factory-mcp/factory-trigger.bats`:
  - `factory_trigger` startet wakeup.sh im Hintergrund
  - PID wird zurückgegeben

- `tests/spec/ticket-mcp/ticket-mcp-node.bats`:
  - Alle 22 Tools: schematische Validierung (Name, Schema, required args)
  - `create_ticket` mit plan_staged → Fehler (Guard)
  - `triage_ticket` mit plan_staged → Fehler (Guard)
  - `report_mishap` incident → Ticket-Erzeugung
  - `report_mishap` degraded → Buffer-Eintrag
  - Arg-Validierung: enum, required, length

## P6 — Cleanup

- `scripts/ticket-mcp/go/` löschen (komplettes Verzeichnis)
- `scripts/brain-mcp-server.py` löschen
- `scripts/brain-index.py` löschen
- `scripts/mcp-task-runner/runner.mjs`: Falls ein import auf ticket-mcp-Module
  existiert (nicht erwartet — runner.mjs ist eigenständig), bereinigen.
- `scripts/factory/mcp-go/` löschen (factory-mcp Go-Version)
- Alle verwaisten Go-Build-Targets in `Taskfile.yml` entfernen
