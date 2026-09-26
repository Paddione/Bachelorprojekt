# Proposal: mcp-hygiene

## Why

Die MCP-Landschaft des Repos trägt tote Serverquellen, veraltete Spiegel und eine
unkuratierte Toolset-Registry mit sich. Konkret: `scripts/factory-mcp-node/` hat die
Factory-Stilllegung (#5933) überlebt, obwohl zwei Testdateien seinen Wegfall bereits
behaupten; das Hermes-MCP-Provisioning spiegelt einen Katalog mit dem toten Server
`factory-mcp` und veralteten Pfaden; `mcp:context7` und `mcp:warden` sind in beiden
Harnessen registriert, aber nie kuratiert (23 unreviewed Einträge im Toolset);
vier Plugin-Entscheidungen driften zwischen Registry und `.claude/settings.json`;
und die G-AGENTIC-Beispieltexte nennen entfernte Server (`factory-mcp-node`,
`brain-mcp-node`).

_Ticket: T900479_

## What Changes

1. **factory-mcp-node retirieren (p1):** `scripts/factory-mcp-node/` löschen; den
   Factory-Block aus `native-server-startup-token.bats` entfernen (bge-mcp und
   mcp-postgres decken denselben Token-Guard ab); Fixture-Referenzen in
   `token-drift-auto-sync.bats` und `glimmer-worker-mcp.bats` umhängen;
   `factory-mcp-node`-Lesestellen und -Kommentare aus `scripts/mcp-sync.sh`
   entfernen; tote `scripts/factory/*`-Einträge aus der S1-Ignore-Liste in
   `docs/code-quality/gates.yaml` streichen.
2. **Hermes-Provisioning synchronisieren (p2):** `factory-mcp` aus
   `scripts/hermes-mcp-servers.yaml` entfernen und den Katalog
   (Server + `tools.exclude`-Denylist) mit der Registry (`mcp.yaml`-Clients)
   abgleichen; `tests/spec/hermes-mcp-access.bats` (erwartete Servermenge,
   Denylist-Map, SSOT-Pointer aufs Archiv) nachziehen;
   `docs/agent-guide/registry/expected/agy-mcp-config.json` von `factory-mcp`
   und `task-master-ai` bereinigen. `hermes-delegate.sh` bleibt unangetastet
   (Tier-0-Delegation, siehe `subagent-provisioning.md`).
3. **Toolset-Registry kuratieren (p3):** `mcp:context7` als canonical unter
   `dokumentations-lookup` eintragen (dafür das Auth-pflichtige Plugin
   suppressen); `mcp:warden` als canonical unter neuer Fähigkeit
   `tresor-zugriff` eintragen; Skill-Triage (suppressed mit Begründung oder
   unreviewed mit Klärungsauftrag, kein Rate-Verdikt); vier Plugin-Drifts
   auflösen (zwei registry-seitig, zwei via Plugin-Toggle in
   `.claude/settings.json`); `Factory-Queue`-Krümel und P6-Kommentar
   korrigieren; Warden-Abschnitt in `mcp-tool-guide.md` ergänzen (G-AGENTIC12);
   `sync.mjs` + `check.mjs` + `emit-map.mjs` + `agent-guide:emit` laufen lassen.
4. **Guards (p-tests):** `decommission-guard.bats` um Abwesenheits-Assertions
   erweitern; `mcp-tooling.bats` um einen Orphan-Server-Guard erweitern
   (jede scripts-seitige MCP-Serverquelle löst sich in Registry oder
   User-Scope-Doku auf).

## Non-Goals

- Keine Änderung an lebenden Servern (ticket-mcp-node, mcp-task-runner,
  codebase-memory-mcp, mcp-kubernetes, mcp-postgres, bge-mcp, llm-proxy,
  warden, context7, playwright) oder ihren Harness-Registrierungen.
- Kein Entfernen von `hermes-delegate.sh`, `ticket-mcp/go` oder dem
  bge-mcp-Shim (alle belegt live).
- Keine User-Scope-Installationen (`glimmer-worker-mcp`, `comfy-image-mcp`,
  `mailbox-mcp`) — nur dokumentiert, nicht registriert.
- Keine SSOT-Spec für Hermes (nie gemergt, nur Archiv + Design-Doc).

## Impact

- **Tests:** 3 Factory-Block-Tests entfallen ersatzlos; Hermes-Suite schrumpft
  um den toten Server; 2 Guard-Dateien wachsen um neue Assertions.
- **Agents:** `mcp:context7` und `mcp:warden` werden erstmals in Toolset-Prompts
  injiziert (rollenbeschränkt); 2 Claude-Plugins werden deaktiviert.
- **Docs:** `toolset-map.md`, `20-werkzeuge.md`, `agent-guide.generated.json`
  werden neu generiert.
