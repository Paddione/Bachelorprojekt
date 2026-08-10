---
title: "babysit-prs-live-lock-guard — Implementation Plan"
ticket_id: T003137
domains: [bachelorprojekt-test]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# babysit-prs-live-lock-guard — Implementation Plan

_Ticket: T003137_

## File Structure

```
tests/spec/software-factory/babysit-prs-live-lock-guard-T003137.bats   (neu, 166 Zeilen — bereits committed als RED-Test)
scripts/factory/babysit-prs.sh                                          (Ist 233 · Budget 800−233=567, nicht gebaselined)
```

## Kontext

`scripts/factory/cleanup.sh` prüft seit T002896 `agent-lock.sh check-branch-live "$BRANCH"`
unmittelbar vor jedem `git worktree remove`. `scripts/factory/babysit-prs.sh` (Zeile 222) führt
strukturell dieselbe Operation aus — legt für einen roten PR-Branch einen Fix-Worktree an
(Zeile 191) und entfernt ihn wieder (Zeile 222) — trägt aber keinen dieser Guards:

```bash
git worktree remove "$WT" --force >/dev/null 2>&1 || rm -rf "$WT"
```

Vollständige Root-Cause- und Fix-Ansatz-Herleitung inkl. des geprüften, unveränderten
Fehlerpfads bei fehlgeschlagenem `git worktree add` (Zeile 190-195): siehe
`openspec/changes/babysit-prs-live-lock-guard/design.md`.

## Tasks

### Task 1 — Failing-Test-Step (RED)

Bereits umgesetzt und committed: `tests/spec/software-factory/babysit-prs-live-lock-guard-T003137.bats`
baut ein echtes Bare-Origin+Klon-Repo, stubt `gh` (ein roter, nicht-draft PR, `class=freshness`)
und `task` (schreibt seinen Aufrufort — den Fix-Worktree — in `wt_path.txt`; simuliert im
Negativtest den Race aus dem Ticket, indem er kurz vor seinem Fehlschlag einen branch-scoped
Agent-Lock für den PR-Branch schreibt), und führt `scripts/factory/babysit-prs.sh` als echten
Kommandoaufruf aus. Geprüft wird die tatsächliche Existenz des Worktree-Verzeichnisses danach —
kein Source-Grep.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/babysit-prs-live-lock-guard-T003137.bats
# expected: FAIL — Test 2 ("... NICHT, wenn der Branch ... einen live Agent-Lock erhaelt")
# schlaegt fehl, weil babysit-prs.sh vor dem Removal (Zeile 222) noch keinen
# check-branch-live-Guard prueft. Test 1 (Positiv-Anker: kein Lock → Worktree wird entfernt)
# ist bereits GRUEN und beweist, dass der Removal-Pfad ueberhaupt erreicht wird.
```

### Task 2 — Fix-Step (GREEN): Guard vor Zeile 222 einziehen

In `scripts/factory/babysit-prs.sh` die Zeile

```bash
git worktree remove "$WT" --force >/dev/null 2>&1 || rm -rf "$WT"
```

ersetzen durch (Guard analog `scripts/factory/cleanup.sh` Zeile 43-52; `$HERE` ist im Skript
bereits Zeile 23 als `scripts/factory`-Verzeichnis definiert, `$BRANCH_NAME` ist seit Zeile 123
gesetzt):

```bash
# [T002896] Guard: skip worktree removal if the branch carries a live agent-lock —
# babysit-prs.sh must not delete a worktree another live session (or a factory
# candidate re-claimed mid-fix) actively holds. Mirrors scripts/factory/cleanup.sh.
if bash "${HERE}/../agent-lock.sh" check-branch-live "$BRANCH_NAME" >/dev/null 2>&1; then
  echo "babysit-prs: branch ${BRANCH_NAME} traegt einen live Agent-Lock — Worktree-Removal uebersprungen (T002896)" >&2
else
  git worktree remove "$WT" --force >/dev/null 2>&1 || rm -rf "$WT" 2>/dev/null || true
fi
```

Der `rm -rf`-Fallback bleibt **nur innerhalb** des Guards erhalten (für den Fall, dass
`git worktree remove` selbst nach bestätigtem "nicht live" scheitert) — er entfällt aus dem
ungeschützten Pfad.

**Nicht ändern:** den Fehlerpfad nach fehlgeschlagenem `git worktree add` (Zeile 190-195,
`rm -rf "$WT"` nach `worktree add` failed). Begründung (Design-Dokument): `$WT` ist dort ein
frisch selbst per `mktemp -d` angelegtes, nie als Git-Worktree registriertes Scratch-Verzeichnis
— `rm -rf` entfernt dort nie einen fremden, ggf. live geclaimten Worktree.

Nach dem Fix erneut ausführen — beide Tests müssen GRÜN sein:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/babysit-prs-live-lock-guard-T003137.bats
```

### Task 3 — Final Verification (CI-Gates)

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
