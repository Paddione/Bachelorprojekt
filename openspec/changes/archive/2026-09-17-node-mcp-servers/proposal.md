# Proposal: node-mcp-servers

## Why

Drei custom MCP-Server-Implementierungen laufen in Nicht-Node-Sprachen (Go, Python),
während alle anderen Server im Repo entweder 3rd-party sind (kubernetes, postgres,
playwright, github, codebase-memory) oder bereits Node.js (bge-mcp, mcp-task-runner,
mcp-postgres-local).

Die Go/Python-Server sind **keine** separaten Codebasen — sie sind dünne Wrapper um
Shell-Skripte (`scripts/ticket.sh`, `scripts/factory/queue.sh`, `scripts/factory/wakeup.sh`)
bzw. ein reines stdlib-Python-Modul (`scripts/brain-index.py`). Der einzige Grund, warum
sie in Go/Python laufen, ist die historische Entscheidung, sie damals so zu schreiben.

**Vorteile der Portierung auf Node.js:**

1. **Einheitliche Laufzeit:** Alle custom Server in einem Stack (Node.js). Keine
   Go-Toolchain (GCC, CGO, `go mod vendor`) und keine Python-Installation mehr für
   MCP-Server. Der `mcp-sync.sh`-Synchronisationsprozess wird einfacher (keine
   Sprache-spezifischen Build-Schritte mehr).
2. **Keine externen Abhängigkeiten:** Alle drei Server nutzen ausschliesslich
   Node.js stdlib (fs, path, child_process, http, crypto, readline, json).
   Zero npm dependencies. Die Portierung ist damit kein neues Angriffsfläche.
3. **Einfachere Wartung:** Shell-Skript-Wrapper in Node.js sind besser lesbar für
   die meisten Contributors als Go `exec.Command` + `json.RawMessage`-Gepflege.
   Die Fehlerbehandlung ist direkter (kein `err != nil`-Chaining über 7 Tool-Dateien).
4. **Schnellerer Start:** stdio-Node.js-Prozesse starten in ~50ms; Go-Binaries
   brauchen ~100-150ms (jedes Mal, wenn ein Harness den Server startet).
   Der Brain-MCP-Server startet als Python-Subprocess von Python selbst —
   insgesamt langsamer und platformabhängig (`python3` muss im PATH sein).

**Was NICHT portiert wird (gezielt ausgeschlossen):**

- 3rd-party-Server: kubernetes, postgres, codebase-memory, playwright, github,
  sequential-thinking, docfork, webresearch — alle aktiv gepflegt, alle 3rd-party.
- Bereits Node.js: bge-mcp, mcp-task-runner, mcp-postgres-local.

## What

Portierung von drei custom MCP-Servern von Go/Python auf Node.js stdlib:

```
scripts/
├── brain-mcp-node/              # NEW: brain-mcp (Python → Node.js)
│   ├── server.mjs               # MCP stdio adapter
│   ├── index.mjs                # BM25 index engine (replaces brain-index.py)
│   └── package.json             # 0 dependencies
├── factory-mcp-node/            # NEW: factory-mcp (Go → Node.js)
│   ├── server.mjs               # HTTP MCP server + tool handlers
│   └── package.json             # 0 dependencies
├── ticket-mcp-node/             # NEW: ticket-mcp (Go → Node.js)
│   ├── server.mjs               # MCP stdio adapter
│   ├── runner.mjs               # ticket.sh executor (replaces Go runner)
│   └── package.json             # 0 dependencies
```

**Jeder Server ist eine eigenständige stdio/HTTP-Implementierung:**

- **brain-mcp** (2 tools): `brain_search` (BM25-Suche), `brain_read` (Seiten-Lese).
  Die BM25-Logik aus `brain-index.py` (229 Zeilen, stdlib-only) wird 1:1 in Node.js
  übersetzt. Keine npm-Pakete.

- **factory-mcp** (7 tools): `factory_status`, `factory_queue`, `factory_enqueue`,
  `factory_trigger`, `factory_recent`, `openspec_find_similar`, `factory_ask`.
  HTTP-Server auf Port 13003, alle Tools sind thin wrappers um Shell-Skripte oder
  ein LLM-Proxy. Keine npm-Pakete.

- **ticket-mcp** (22 tools): `list_tickets`, `get_ticket`, `export_tickets`,
  `export_ticket_timeline`, `triage_ticket`, `backfill_ticket_id`, `set_plan_meta`,
  `set_readiness_flag`, `prepare_feature`, `transition_status`, `add_comment`,
  `update_fields`, `report_mishap`, `get_mishap_buffer`, `flush_mishap_buffer`,
  `link_tickets`, `get_ticket_links`, `record_phase_event`, `record_grill_answers`,
  `stage_plan`, `create_ticket`, `enqueue_ticket`, `set_touched_files`,
  `get_attachments`, `archive_plan`, `add_pr_link`.
  stdio-Server, alle Tools sind thin wrappers um `scripts/ticket.sh`.
  Keine npm-Pakete.

**Registrierungs-Anpassungen:**

- `docs/agent-guide/registry/mcp.yaml`: Kommandos und Harness-Konfigurationen
  werden auf die neuen Node.js-Pfade aktualisiert.
- `.opencode/opencode.jsonc`: Entsprechende Einträge angepasst.
- `.mcp.json` (Claude Code): Entsprechende Einträge angepasst.
- `scripts/mcp-sync.sh`: Synchronisation der neuen stdio-Befehle.

**Bestehende Tests:**

- Alle vorhandenen BATS-Tests werden migriert:
  `tests/spec/ticket-mcp/*.bats` → testen gegen den neuen Server.
  `tests/spec/factory-mcp/*.bats` → testen gegen den neuen Server.
  Neue Tests für brain-mcp: `tests/spec/brain-mcp/*.bats`.
- Unit-Tests für die BM25-Logik (brain-mcp/index.mjs) und die Argument-Validierung
  (ticket-mcp/runner.mjs).

## Non-Goals

- **Keine neuen Tools:** Die Portierung ändert keine Tools, keine neuen Fähigkeiten,
  keine API-Änderungen. Jeder Tool-Name, jedes Schema, jede Antwortform ist identisch.
- **Keine 3rd-party-Portierung:** kubernetes, postgres, codebase-memory, playwright,
  github, sequential-thinking, docfork, webresearch bleiben 3rd-party.
- **Keine Architektur-Änderung:** Transport (stdio/HTTP), Endpunkte, Harness-Config
  bleiben gleich. Nur die Implementierungssprache ändert sich.
- **Keine Dependency-Erhöhung:** Alle drei Server bleiben 0-dependency (stdlib only).

_Non-Goal: Der alte Go/Python-Code wird nach erfolgreicher Migration und Testabdeckung
entfernt. Parallelbetrieb ist nur kurzfristig für die Migration nötig._

_Ticket: T-PENDING_
