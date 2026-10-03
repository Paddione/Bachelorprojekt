---
title: "toolset-tool-level — Design"
ticket_id: T900983
domains: [agent-skills, dev-tooling, scripts]
status: plan_staged
---

# toolset-tool-level — Design

## Ausgangslage

Die Toolset-Kette kuratiert Instanzen (`capabilities.yaml`: `state`, `use_when`, `tier`, `roles`),
aber keine einzelnen Tools. `toolset.lock.yaml` ist ein leerer Stub, `probe.mjs` führt keine
Probes aus. Ein Server mit Mutationen gilt deshalb pauschal als `safe`, sobald die Instanz so
eingestuft ist (mcp-kubernetes: `pods_exec`, `resources_delete`).

## Messung (2026-10-03, WSL-Host, alle Clients aus `mcp.yaml`)

Erzeugt mit dem Prototyp des Clients aus diesem Change (`scripts/toolset/lib/mcp-client.mjs`):

```bash
# Stand: origin/main 672ea8eb2 + mcp-client.mjs aus diesem Branch
node scripts/toolset/probe.mjs --dry-run   # nach Task 3; vorher Prototyp im Scratchpad
```

| Server | Status | Tools | annotiert | destructiveHint |
|---|---|---|---|---|
| context7 | ok | 2 | 2 | – |
| mcp-kubernetes | ok | 19 | 19 | pods_delete, pods_exec, resources_create_or_update, resources_delete, resources_scale |
| mcp-postgres | ok | 1 | 0 | – |
| bge-mcp | ok | 2 | 0 | – |
| ticket-mcp-node | ok | 46 | 0 | – |
| mcp-task-runner | ok | 7 | 0 | – |
| codebase-memory-mcp | unreachable (EACCES) | – | – | Binary liegt in `~/.npm-global/bin`, nicht im Login-PATH — Folgeticket devflow-mcp |
| playwright | ok | 25 | 25 | 18 Tools |
| warden | ok | 53 | 53 | 7 Tools (`keychain_delete_*`, `keychain_send_delete`, `keychain_send_remove_password`) |

## Entscheidungen

- **D1 — Lock mit zwei Ebenen.** Je Server: gemessen `status`, `probed_at`, `server_info`,
  `tool_count`, `tools: {name: {hash, read_only?, destructive?}}` (schreibt `probe.mjs`);
  geprüft `reviewed: {name: hash}` (schreibt `probe.mjs --ack <server>`, nie ein normaler
  Probe-Lauf). `hash` = sha256 über Beschreibung + `inputSchema`, 12 Zeichen.
- **D2 — Unerreichbar ist ein Status, kein Löschen.** Ein Server, der nicht antwortet, behält
  `tools` und `reviewed`; nur `status`/`probed_at` ändern sich. Der Lock füllt sich so
  monoton und überlebt einen Lauf ohne Port-Forward.
- **D3 — `tool_tiers` an der mcp-Instanz.** Map Glob → Tier, erste passende Zeile gewinnt
  (Reihenfolge der YAML-Map). Nicht genannte Tools erben `tier` der Instanz, sonst `safe`.
  Nur an `mcp:`-Instanzen zulässig.
- **D4 — Gate.** fail-closed: ungültiger Tier, `tool_tiers` an Nicht-mcp-Instanz, Glob ohne
  Treffer bei gemessenem Server (veraltete Kuration). fail-open (Report): Tools in `tools`,
  aber nicht in `reviewed` (neu), in `reviewed`, aber nicht in `tools` (entfernt), Hash
  geändert; `destructiveHint` auf einem Tool, das zu `safe` auflöst. `check.mjs` bleibt
  offline: es liest nur den Lock.
- **D5 — Rendering.** `toolset-context.sh` nennt je mcp-Instanz Tools mit Tier ≥ `caution`
  einzeln (`name (tier)`), den Rest als `+N safe`. `--json` liefert `tools: [{name, tier}]`
  vollständig. Ohne Lock-Eintrag bleibt der Block wie bisher.
- **D6 — Lock-Pfad bei Fixtures.** Ohne `TOOLSET_LOCK` liegt der Lock neben der Registry
  (`dirname(TOOLSET_REGISTRY)/toolset.lock.yaml`). Fixture-Registries lesen damit nie den
  echten Lock.
- **D7 — Keine Tool-Unterdrückung in diesem Change.** `ticket-mcp-node.stage_plan` wird mit
  devflow-mcp `plan_stage` (Folgeticket) unterdrückt; die Durchsetzung über
  `permissions.deny` in `.claude/settings.json` gehört dorthin.

## Erstkuration (aus der Messung)

| Instanz | Tier | tool_tiers |
|---|---|---|
| mcp-kubernetes | safe | `pods_exec`, `pods_delete`, `resources_delete`: dangerous · `resources_create_or_update`, `resources_scale`, `pods_run`: caution |
| warden | caution | `keychain_delete_*`, `keychain_send_delete`, `keychain_send_remove_password`: dangerous |
| ticket-mcp-node | caution | Mutationen ohne Rücknahme (`archive_plan`, `flush_mishap_buffer`, `backfill_ticket_id`): dangerous; Lese-Tools (`get_*`, `list_*`, `export_*`): safe |
| playwright | (suppressed) | – |
