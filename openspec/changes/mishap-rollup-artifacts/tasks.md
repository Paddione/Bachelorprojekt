---
title: "mishap-rollup-artifacts — Implementation Plan"
ticket_id: T005031
domains: [scripts, factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-rollup-artifacts — Implementation Plan

_Ticket: T005031_

## File Structure

| Datei | Ist | Budget |
|---|---|---|
| `scripts/ticket.sh` | 1122 | s1.ignore (sanktionierte Ein-Datei-CLI) |
| `scripts/factory/mishap-rollup.sh` | 279 | 521 |
| `scripts/factory/mishap-rollup-artifacts.sh` | neu | neu, unter Limit |
| `tests/spec/mishap-rollup/container-create-description.bats` | neu | neu |
| `tests/spec/mishap-rollup/generator-cycle-artifacts.bats` | neu | neu |
| `openspec/changes/mishap-rollup-artifacts/{proposal,tasks}.md` | neu | Plan-Artefakte |
| `openspec/changes/mishap-rollup-artifacts/specs/mishap-rollup.md` | neu | Delta zum SSOT |
| `website/src/data/test-inventory.json` | generiert | via `task test:inventory` |

## Task 1: RED — failing Tests für Artefakt-Erzeugung und Beschreibungssemantik

- [ ] **Failing-Test-Step (RED).** Beide Tests liegen bereits im Branch und
      schlagen gegen den aktuellen Code fehl: `generator-cycle-artifacts.bats`
      (Skript `scripts/factory/mishap-rollup-artifacts.sh` fehlt → Exit 127) und
      `container-create-description.bats` (INSERT enthält noch „bleibt dauerhaft
      offen").

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mishap-rollup/container-create-description.bats tests/spec/mishap-rollup/generator-cycle-artifacts.bats
# expected: FAIL (red — Skript fehlt bzw. Boilerplate behauptet Permanenz)
```

## Task 2: GREEN — Artefakt-Skript implementieren und in den Generator hängen

- [ ] Neues Skript `scripts/factory/mishap-rollup-artifacts.sh`:
      Aufruf `--slug <slug> --change-dir <dir> --container <id>`, Batch-Body des
      Flushers via stdin. Schreibt `<dir>/.ticket` (Container-ID) und
      `<dir>/specs/<slug>.md` — die Einträge `**N. Titel** (typ, komponente)`
      werden als `ADDED Requirements` mit je einem Scenario übernommen; leere
      Eingabe ist ein Fehler (Exit 1), damit nie ein leeres Delta entsteht.
- [ ] In `scripts/factory/mishap-rollup.sh` nach der `tasks.md`-Generierung das
      Skript mit `$COMMENTS_FILE` als stdin aufrufen
      (`--slug "$SLUG" --change-dir "$WT/$CHANGE_DIR" --container "$CONTAINER_ID"`).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mishap-rollup/generator-cycle-artifacts.bats
# expected: PASS (green — .ticket und specs/<slug>.md entstehen)
```

## Task 3: GREEN — Container-Beschreibung auf ephemeren Lifecycle umstellen

- [ ] In `scripts/ticket.sh` `cmd_rollup_container` die Create-Beschreibung von
      „Fortlaufende Sammlung nicht-kritischer Mishaps. Dieses Ticket bleibt
      dauerhaft offen." umformulieren: „Fortlaufende Sammlung nicht-kritischer
      Mishaps. Der Container wird nach Verarbeitung seines Batches geschlossen."

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mishap-rollup/container-create-description.bats
# expected: PASS (green — keine Permanenz-Behauptung mehr)
```

## Task 4: Inventory und Verifikation

- [ ] `task test:inventory` ausführen und das regenerierte
      `website/src/data/test-inventory.json` committen.
- [ ] `bash scripts/openspec.sh validate mishap-rollup-artifacts` bleibt OK.

## Task 5: Final Verification

- [ ] Betroffene Tests beide Formen (T002696):

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/mishap-rollup tests/spec/mishap-bundle
```

- [ ] Die drei CI-Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
