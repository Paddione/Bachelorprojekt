---
ticket_id: T900479
plan_ref: openspec/changes/mcp-hygiene/tasks.md
status: active
date: 2026-09-26
---

# Design: mcp-hygiene

## Ausgangslage

Inventur vom 2026-09-26 (Ticket T900479): Nach Factory-Decommission (#5933),
K4-Surgery (#5956) und Auto-Docs-Removal (#5961) liegen tote MCP-Serverquellen,
veraltete Katalogspiegel und eine teilkuratierte Toolset-Registry vor. Zwei
Peer-Sessions arbeiten parallel (EPIC-Partials, u. a. PR #5966); dieser Change
wird nur gestagt (`--hold`) und nach deren Merge ausgeführt.

## Entscheidungen (Brainstorming-Protokoll, verdichtet)

### D1 — factory-mcp-node löschen statt reparieren

Der Server hat keine Registrierung mehr (Registry, `.mcp.json`, opencode-Bridge
sind bereinigt) und keinen Produktionsrufer. Drei Tests in
`native-server-startup-token.bats` führen ihn noch als Token-Guard-Fixture aus;
dieselbe Datei prüft denselben Guard bereits an bge-mcp und mcp-postgres-local.
Alternative „Server als Fixture behalten" verworfen: Sie konservierte 759 Zeilen
toten Codes für eine dreifach abgedeckte Assertion. Zwei weitere Testdateien
behaupten den Wegfall bereits (`glimmer-serving-profile.bats`,
`mcp-tooling.bats`) — die Löschung löst den Widerspruch auf.

### D2 — Hermes-Provisioning synchronisieren statt löschen

Erste Einschätzung „verwaist" war falsch: `hermes-delegate.sh` ist der
dokumentierte Tier-0-Delegationspfad (`subagent-provisioning.md`), und
`hermes-mcp-access.bats` (310 Zeilen) testet das Provisioning aktiv. Gelöscht
wird nichts; der Katalog wird mit der Registry synchronisiert (`factory-mcp`
raus, fehlende Server mit Denylist rein). Der SSOT-Pointer des Tests zeigt
künftig auf den archivierten Change (`2026-07-15-hermes-agent-mcp-access`),
da nie eine SSOT-Spec gemergt wurde.

### D3 — context7: MCP-Instanz sticht Plugin

`dokumentations-lookup` hält das Claude-Plugin als canonical, erlaubt aber nur
eine kanonische Instanz je Fähigkeit. Der Registry-Kommentar in `mcp.yaml`
belegt: Der Plugin-Endpoint verlangt Auth, der MCP-Server funktioniert anonym.
Also Plugin suppressen, `mcp:context7` canonical — gleiche `use_when`-Semantik,
bessere Erreichbarkeit.

### D4 — Plugin-Drifts: reviewed Reasons schlagen Settings

Beide suppressions (`playwright`, `skill-creator`) tragen geprüfte Begründungen
(Duplikat zu chrome-devtools-Pfad/CLI bzw. superpowers-Pfad). Die Settings-Seite
(aktiviert) hat keine Begründung. Also Settings an Registry angleichen
(deaktivieren, reversibel via `/plugin`). Umgekehrt bei
`learning-output-style`: Registry behauptet fälschlich „aktiver Ausgabestil",
Settings sagt deaktiviert — also Registry korrigieren.

### D5 — Skills: kein Rate-Verdikt

13 HuggingFace-Skills und 4 weitere ohne Beleg weder suppressen noch
canonicalisieren, sondern `unreviewed` mit konkretem Klärungsauftrag
(toolset-curate-Regel). Ausnahme mit Beleg: `sdlc-autopilot` und
`opencode-git-workflow` liegen im falschen Harness-Verzeichnis (suppressed);
`skill-creator` doppelt den per Registry gesetzten superpowers-Pfad
(suppressed); `freetoken-setup` stützt das live `:1919`-Backend (canonical);
`find-skills` ist der dokumentierte Discovery-Pfad (canonical, orchestrator).

### D6 — Keine neue SSOT-Spec

Der Change hängt sein Delta an `agentic-tooling-quality-goals.md`
(G-AGENTIC11/G-AGENTIC13-Beispiele nennen entfernte Server; plus eine
Orphan-Regel). Kein `--create-new`: Alle Spec-Wirkung passt unter bestehende
Requirements.

## Risiken

- **p3 touchiert `mcp-tool-guide.md`** (Hardlink beider Harnesse), dieselbe
  Datei bearbeitet PR #5966 (agent-routing-docs). Sequencing: p3 erst nach
  dessen Merge ausführen; Ticket bleibt bis dahin auf Hold.
- **Plugin-Deaktivierungen** ändern das lokale Claude-Verhalten des Operators;
  reversibel, im Plan pro Fall begründet.
- **Hermes-Katalog-Sync** braucht Denylist-Urteile für neue Server (bge-mcp,
  context7, warden); das Partial gibt die Entscheidungsregel vor
  (Registry-`tier` + Mutations-Annotations), kein Ermessen.

## Dateigruppen je Partial (disjunkt)

- p1: `scripts/factory-mcp-node/*`, Token-/Drift-/Worker-Test-Fixtures,
  `scripts/mcp-sync.sh`, `docs/code-quality/gates.yaml`.
- p2: `scripts/hermes-mcp-servers.yaml`, `scripts/hermes-mcp-provision.sh`,
  `tests/spec/hermes-mcp-access.bats`,
  `docs/agent-guide/registry/expected/agy-mcp-config.json`.
- p3: `capabilities.yaml`, `mcp.yaml`, `.claude/settings.json`,
  `mcp-tool-guide.md`, generierte Registry-Derivate.
- p-tests: `decommission-guard.bats`, `mcp-tooling.bats`.
