---
title: "rollup-container-ephemeral — Implementation Plan"
ticket_id: T004898
domains: [scripts, factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# rollup-container-ephemeral — Implementation Plan

_Ticket: T004898_

## File Structure

| Datei | Ist | Budget |
|---|---|---|
| `scripts/ticket.sh` | 1122 | s1.ignore (sanktionierte Ein-Datei-CLI) |
| `scripts/factory/mishap-rollup.sh` | 265 | 535 |
| `scripts/factory/rollup-publish.sh` | 125 | 675 |
| `tests/spec/mishap-rollup/container-finds-blocked-status.bats` | neu (75) | neu, unter Limit |
| `tests/spec/mishap-rollup/rollup-branch-progress.bats` | ersetzt | entfällt zugunsten `rollup-cycle-push.bats` |
| `tests/spec/mishap-rollup/rollup-cycle-push.bats` | neu | neu, unter Limit |
| `openspec/changes/rollup-container-ephemeral/{proposal,design,tasks}.md` | neu | Plan-Artefakte |
| `openspec/changes/rollup-container-ephemeral/specs/mishap-rollup.md` | neu | Delta zum SSOT |
| `website/src/data/test-inventory.json` | generiert | via `task test:inventory` |

Hinweis: `rollup-branch-progress.bats` (182 Zeilen) pinnt das Amend-Verhalten, das mit
diesem Change ersatzlos entfällt — die Datei wird entfernt und durch einen Test für den
Zyklus-Push ersetzt. Das ist ein echter Shrink der Test-Suite, kein kosmetisches
Zusammenziehen.

## Task 1: RED — failing BATS-Test für die Container-Auflösung

- [ ] **Failing-Test-Step (RED).** Der Test
      `tests/spec/mishap-rollup/container-finds-blocked-status.bats` liegt bereits im
      Branch und schlägt gegen den aktuellen Code fehl: Die Auflösung emittiert eine
      positive Status-Allowlist, die `blocked`-Container (T003533) unsichtbar macht.
      Der Test prüft per kubectl-Mock (repo-Idiom aus
      `rollup-container-empty-list-selfheal.bats`) das emittierte WHERE-Prädikat.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mishap-rollup/container-finds-blocked-status.bats
# expected: FAIL (red — die Allowlist ist noch im Code)
```

## Task 2: GREEN — Suchfilter auf done/archived-Ausschluss umstellen

- [ ] In `scripts/ticket.sh` `cmd_rollup_container` die Suchzeile von
      `AND status IN ('triage','backlog','planning','plan_staged','in_progress')` auf
      `AND status NOT IN ('done','archived')` ändern. `ORDER BY created_at ASC`
      (ältester offener Container zuerst) bleibt unverändert; Step 2 (Anlegen) bleibt
      Fallback bei leerem Ergebnis. Die Kommentarzeile darüber („offene Status,
      done/archived ausgeschlossen") stimmt danach mit dem Code überein.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mishap-rollup/container-finds-blocked-status.bats
# expected: PASS (green — NOT IN ist im emittierten Prädikat)
```

## Task 3: Generator auf Zyklus-Branch und Container-Closure umstellen

- [ ] In `scripts/factory/mishap-rollup.sh` den festen Slug/Branch ersetzen:
      `SLUG="mishap-incident-rollup-<datum>"` (bei Kollision am selben Tag
      Container-ID-Suffix), `BRANCH="chore/${SLUG}"`, `CHANGE_DIR="openspec/changes/${SLUG}"`.
      Worktree-Handling wieder mit trap-cleanup (kein persistenter Worktree).
- [ ] Nach erfolgreichem Plan-Commit + Push den Container schließen:
      `ticket.sh update-status --id "$CONTAINER_ID" --status done --resolution obsolete`.
- [ ] Header-Kommentare anpassen (kein „bleibt dauerhaft offen", kein
      „Branch bleibt persistent"); die Zeile über den entfallenen Vorab-Rebase
      (T002931) entfernen.

## Task 4: Publisher vereinfachen — Amend-Maschinerie entfernen

- [ ] `scripts/factory/rollup-publish.sh` auf einen einfachen Push reduzieren:
      Commit übernimmt der Generator, der Publisher pusht mit
      `git push -u origin "$BRANCH"` ohne `--force-with-lease`. Amend-Erkennung,
      Lease-Expectation und die Rebase-/Reset-Konfliktbehandlung (T002914/T002931)
      entfernen. Header-Kommentar („Kette bleibt bei Laenge 1") aktualisieren.

## Task 5: Tests ersetzen und Inventory regenerieren

- [ ] `tests/spec/mishap-rollup/rollup-branch-progress.bats` entfernen und durch
      `tests/spec/mishap-rollup/rollup-cycle-push.bats` ersetzen: Wegwerf-Repo-Test,
      der belegt, dass der Publisher pro Zyklus normal pusht (kein Force-Reflog-Eintrag,
      Fremd-Commits bleiben unangetastet). Prüfmodus: Command-Output-Verifikation,
      Positiv-Anker-Pflicht beachten.
- [ ] `task test:inventory` ausführen und das regenerierte
      `website/src/data/test-inventory.json` committen.

## Task 6: Final Verification

- [ ] Alle betroffenen Tests grün:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/mishap-rollup tests/spec/mishap-bundle
```

- [ ] Die drei CI-Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] `bash scripts/openspec.sh validate rollup-container-ephemeral` bleibt OK.

Nach dem Merge dieses Changes (manuell, außerhalb dieses Plans):
Sammelbestand des permanenten Branchs einmalig per PR nach `main` mergen und
archivieren, dann `chore/mishap-incident-rollup` löschen — Sequenz im
`design.md` dieses Changes.
