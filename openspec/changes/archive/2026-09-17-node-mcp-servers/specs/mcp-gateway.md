# Spec: mcp-gateway

## MODIFIED Requirements

### Requirement: Custom MCP-Server-Implementierungen sind Node.js

Alle custom MCP-Server-Implementierungen im Repo MUSS Node.js sein und ausschliesslich
Node.js Core-Module verwenden (fs, path, child_process, http, crypto, readline, json,
util, events). Keine externen npm-Dependencies, keine Go- oder Python-Server mehr.

Gültige custom Server (nach Migration):
- `scripts/brain-mcp-node/server.mjs` — BM25-Wiki-Suche und Seiten-Lese
- `scripts/factory-mcp-node/server.mjs` — Software-Factory Queue und Status
- `scripts/ticket-mcp-node/server.mjs` — Ticket-Lifecycle (22 Tools)

Verbotene Sprachen für custom MCP-Server: Go, Python, Ruby, Java, Rust.
3rd-party-Server (kubernetes, postgres, codebase-memory, playwright, github) unterliegen
nicht dieser Regel — sie werden als externe Binaries behandelt.

#### Scenario: Neuer custom MCP-Server wird in Node.js implementiert

- **GIVEN** ein neuer custom MCP-Server soll zum Repo hinzugefügt werden
- **WHEN** der Server implementiert wird
- **THEN** MUSS er ausschliesslich Node.js Core-Module verwenden
- **AND** MUSS er 0 npm-Dependencies haben
- **AND** MUSS er unter `scripts/<server-name>/server.mjs` liegen
- **AND** MUSS er eine `package.json` mit `"type": "module"` haben

#### Scenario: Alter Go/Python MCP-Server wird nach Node.js portiert

- **GIVEN** ein Go- oder Python-MCP-Server existiert im Repo
- **WHEN** die Portierung auf Node.js abgeschlossen und getestet ist
- **THEN** MUSS die alte Go/Python-Quelle gelöscht werden
- **AND** MUSS die `mcp.yaml`-Registry auf den neuen Node.js-Pfad zeigen
- **AND** MUSS `mcp-sync.sh` den neuen Pfad synchronisieren
