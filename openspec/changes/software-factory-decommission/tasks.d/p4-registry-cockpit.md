---
title: "p4 — Update tool registry, MCP configs, and SDLC cockpit endpoints"
ticket_id: T900399
domains: [toolset-curate, website-specialist]
status: active
---

# p4 — Update tool registry, MCP configs, and SDLC cockpit endpoints

Files: `docs/agent-guide/registry/mcp.yaml`, `docs/agent-guide/registry/capabilities.yaml`, `docs/agent-guide/registry/skills.yaml`, `docs/agent-guide/registry/tools.yaml`, `docs/agent-guide/registry/goals.yaml`, `docs/agent-guide/registry/networks.yaml`, `docs/agent-guide/registry/agents.yaml`, `components/website/src/pages/sdlc/api/factory-control.ts`, `components/website/src/pages/sdlc/api/factory/force-tick.ts`, `components/website/src/pages/sdlc/api/factory/parallel-status.ts` (target_files dieses Partials; disjunkt zu p1–p3, p5).

## Task 4.1: Registry-Bereinigung & MCP-Synchronisation

1. In `docs/agent-guide/registry/`:
   - `mcp.yaml`: Eintrag `factory-mcp-node` entfernen.
   - `capabilities.yaml`: Capability `factory-steuerung` und `mcp:factory-mcp-node` entfernen.
   - `skills.yaml`: Referenzen auf `factory-mcp-node_*` Werkzeuge entfernen.
   - `tools.yaml`: Einträge `factory` und `factory-dispatch` entfernen.
   - `goals.yaml`: Goals `factory-feature-bauen` und `factory-autopilot` entfernen.
   - `networks.yaml`: Netzwerk `docker-factory-sandbox-egress` entfernen.
   - `agents.yaml`: Abschnitt `factory_roles` entfernen.
2. Synchronisation ausführen:
   ```bash
   task mcp:sync
   task mcp:check
   task agents:toolset:check
   ```

## Task 4.2: SDLC Cockpit API Endpunkte absichern / anpassen

1. `components/website/src/pages/sdlc/api/factory-control.ts`:
   - Sicherstellen, dass Anfragen neutral mit 410 Gone oder leerem JSON beantwortet werden, statt einen 500-Datenbankfehler zu werfen.
2. `components/website/src/pages/sdlc/api/factory/force-tick.ts`:
   - Rückbau bzw. Beantwortung mit Hinweis auf Decommissioning.
3. `components/website/src/pages/sdlc/api/factory/parallel-status.ts`:
   - Statische Rückgabe ohne Abfrage von `tickets.factory_control`.
4. Typ- und Unit-Tests der Website ausführen:
   ```bash
   pnpm --dir components/website test:unit
   ```
