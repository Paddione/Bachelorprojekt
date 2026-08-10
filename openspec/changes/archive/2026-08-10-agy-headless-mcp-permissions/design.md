---
title: agy Headless MCP Permissions Design
ticket_id: T002719
domains:
  - mcp-gateway
  - agent-harness
status: draft
---

# Design: agy Headless MCP Permissions

## Context & Root Cause

Im Headless-Betrieb (`agy -p '...'` / `agy --prompt '...'`) führt `agy` Prompts non-interaktiv aus. Sobald das Sprachmodell ein MCP-Tool aufrufen möchte, greift das `permission_manager.go` Subsystem von `agy`. Da kein interaktives Terminal zur Bestätigung zur Verfügung steht, schlägt die Rechteprüfung fehl und das Tool wird mit dem Fehler `user denied permission for mcp(<target>)` bzw. `a tool required the "mcp" permission that headless mode cannot prompt for` blockiert.

In der `agy`-Binary (Version 1.1.11) ist dafür ein explizites Flag integriert:
`--dangerously-skip-permissions` ("Auto-approve all tool permission requests without prompting").

Beim Start mit `agy --dangerously-skip-permissions -p '...'` wird die Berechtigungsprüfung im Print-Modus übersteuert (`Print mode: --dangerously-skip-permissions set, auto-approving all tool permissions`), sodass MCP-Tools wie `bge-mcp/bge_embed`, `codebase-memory-mcp`, `ticket-mcp` etc. reibungslos ausgeführt werden können.

## Design Decisions

1. **SSOT Specification (`openspec/specs/mcp-gateway.md`)**:
   - Ergänzung der SSOT-Spec um ein Requirement `Requirement: agy Headless MCP Tool Permission Bypass`.
   - Festschreibung des Verhaltens: Bei Headless-Aufrufen (`agy -p`) von subagentischen Workflows muss `--dangerously-skip-permissions` verwendet werden, um automatische Tool-Freigaben zu gewährleisten.

2. **Automatisierter BATS Test (`tests/spec/mcp-gateway/agy-mcp-permissions.bats`)**:
   - Erstellung eines isolierten BATS-Tests, der die CLI-Flags von `agy` und die Einbindung in `openspec/specs/mcp-gateway.md` prüft.

## Affected Components

- `openspec/specs/mcp-gateway.md`
- `tests/spec/mcp-gateway/agy-mcp-permissions.bats`
