---
title: "toolset-usage-injection — Implementation Plan"
ticket_id: T002592
domains: [infra, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# toolset-usage-injection — Implementation Plan

Erweitert `docs/agent-guide/registry/capabilities.yaml` vom Erlaubnis- zum Kurations-Register
(`use_when`, `avoid_when`, `fallback`, `roles`, `tier`, `deep_ref`), erfasst erstmals auch
`plugin:`, `skill:`, `cli:` und `agent:`, und liefert mit `scripts/toolset-context.sh <rolle>`
einen rollengefilterten Werkzeug-Block für Agent-Dispatches — als Pendant zu
`scripts/plan-context.sh`.

Begründung und verworfene Alternativen: `openspec/changes/toolset-usage-injection/proposal.md`.
Eingefrorene Feldnamen, Exit-Codes und Ausgabeformate:
`openspec/changes/toolset-usage-injection/CONTRACT.md`.

_Ticket: T002592_

## File Structure

| Datei | Ist | Budget |
| --- | --- | --- |
| `docs/agent-guide/registry/capabilities.yaml` | 71 | — |
| `scripts/toolset/check.mjs` | 64 | 736 |
| `scripts/toolset/collect.mjs` | 66 | 734 |
| `scripts/toolset/emit-map.mjs` | 28 | 772 |
| `scripts/toolset-context.sh` | neu | 800 |
| `docs/agent-guide/maps/toolset-map.md` | 65 | — |
| `.claude/skills/toolset-curate/SKILL.md` | 12 | — |
| `CLAUDE.md` | 215 | — |
| `AGENTS.md` | 160 | — |
| `tests/spec/toolset-registry/schema-gate.bats` | neu | — |
| `tests/spec/toolset-registry/collect-kinds.bats` | neu | — |
| `tests/spec/toolset-registry/context-injection.bats` | neu | — |
| `Taskfile.agents.yml` | 399 | — |
| `website/src/data/test-inventory.json` | generiert | — |

**S1-Budgets.** Gegatet sind nur die drei `.mjs`-Dateien und das neue `.sh`. Die wirksame
Schwelle ist überall das statische Limit aus `docs/code-quality/gates.yaml` (`.mjs: 800`,
`.sh: 800`), da keine dieser Dateien in `docs/code-quality/baseline.json` steht — die Spalte
**Budget** nennt den daraus verbleibenden Spielraum (Limit − Ist). Bei geschätzt +40 bis +90
Zeilen je Datei bleibt die Reserve durchgehend über 600 Zeilen. Kein Verkleinerungs- oder
Split-Schritt nötig.

Die übrigen Dateien liegen **außerhalb** der S1-Scan-Universe: `scan.code_roots` in `gates.yaml`
listet weder `docs`, noch `.claude`, noch die Repo-Wurzel, und `.bats`/`.yml`/`.yaml`/`.md` haben
keinen Eintrag unter `s1.limits`. Belegt durch
`grep -c '".claude/' docs/code-quality/repo-index.json` → 0.

Neue Datei mit S1-Gate: `scripts/toolset-context.sh` (Limit 800, geschätzt 120–160 Zeilen).

## Partials

| id | Datei | Rolle | target_files | depends_on |
| --- | --- | --- | --- | --- |
| p1 | `tasks.d/p1-registry.md` | impl | `docs/agent-guide/registry/capabilities.yaml` | |
| p2 | `tasks.d/p2-gate.md` | impl | `scripts/toolset/check.mjs` | |
| p3 | `tasks.d/p3-collect.md` | impl | `scripts/toolset/collect.mjs` | |
| p4 | `tasks.d/p4-inject.md` | impl | `scripts/toolset-context.sh`, `scripts/toolset/emit-map.mjs`, `docs/agent-guide/maps/toolset-map.md` | |
| p5 | `tasks.d/p5-skill-docs.md` | impl | `.claude/skills/toolset-curate/SKILL.md`, `CLAUDE.md`, `AGENTS.md` | |
| p6 | `tasks.d/p6-tests.md` | tests | `tests/spec/toolset-registry/schema-gate.bats`, `tests/spec/toolset-registry/collect-kinds.bats`, `tests/spec/toolset-registry/context-injection.bats`, `Taskfile.agents.yml`, `website/src/data/test-inventory.json` | p1, p2, p3, p4 |

Die Dateimengen sind disjunkt (D1). Der Schnitt folgt der **Datei**, nicht dem Werkzeug-Kind:
alle 88 Instanzen landen in einer einzigen `capabilities.yaml`, ein Schnitt nach
`mcp:`/`plugin:`/`skill:` hätte vier Partials auf dieselbe Datei gesetzt.

p1–p5 sind untereinander unabhängig, weil CONTRACT.md die Berührungspunkte — Feldnamen,
Rollen-Vokabular, Exit-Codes, Ausgabeformat — vorab festlegt. p6 hängt an p1–p4, weil die
Assertions gegen deren tatsächliche Ausgabe laufen; der rot→grün-Failing-Test-Step liegt in p6.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Die drei BATS-Dateien aus p6 anlegen, bevor p1–p5 umgesetzt
      sind. Sie müssen auf dem aktuellen Branch fehlschlagen: `scripts/toolset-context.sh`
      existiert nicht, `check.mjs` kennt die Schema-Prüfung nicht, `collect.mjs` liefert keine
      `plugin:`-Instanzen.

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/toolset-registry/
# expected: FAIL (rot — Skript und Prüfungen existieren noch nicht)
```

- [ ] **Fix-Step (GREEN).** p1–p5 umsetzen. Danach muss derselbe Aufruf grün sein, und der Gate
      läuft gegen die reale Registry durch:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/toolset-registry/
node scripts/toolset/check.mjs; echo "exit=$?"   # erwartet: exit=0
bash scripts/toolset-context.sh bachelorprojekt-db   # erwartet: DB-Werkzeuge, exit=0
```

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
