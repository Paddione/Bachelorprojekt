---
title: "mishap-t002137 — Implementation Plan"
ticket_id: T002137
domains: [docs, tests]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-t002137 — Implementation Plan

_Ticket: T002137_

Mishap-Bundle, 1 Doku-Fix: Übergangs-Gotcha nach T002135 (bats-Support-Libs von
Git-Submodulen auf vendorte Dateien umgestellt, PR #3167). Worktrees, die vor
diesem Merge angelegt wurden, verweigern `git worktree remove` wegen verwaister
per-Worktree-Submodul-Gitdirs unter `.git/worktrees/<name>/modules/` — der Fix
dokumentiert den sauberen Cleanup-Weg, ändert kein Skript-Verhalten.

## File Structure

```
docs/superpowers/references/gotchas-footguns.md   (.md — kein S1-Gate; Ist 132 Zeilen)
CLAUDE.md                                         (.md — kein S1-Gate; Ist 190 Zeilen)
tests/spec/dev-flow-plan.bats                      (.bats — kein S1-Gate; Ist 102 Zeilen)
```

Alle drei betroffenen Dateien sind `.md`/`.bats` — keine der beiden Extensions
trägt ein S1-Zeilenlimit (siehe `docs/code-quality/gates.yaml` → `s1.limits`),
daher entfällt die Budget-Tabelle für diesen Plan; die Ist-Zeilenzahlen oben
sind nur zur Nachvollziehbarkeit notiert.

## Task 1: Failing-Test zuerst (RED)

Füge in `tests/spec/dev-flow-plan.bats` einen neuen `@test` hinzu, der per
`grep` prüft, dass `docs/superpowers/references/gotchas-footguns.md` sowohl den
neuen Abschnittstitel „Alt-Worktrees nach T002135" als auch das Pfadmuster
`.git/worktrees/<name>/modules` enthält. Vor dem Fix existiert der Abschnitt
noch nicht — der Test muss rot sein.

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan.bats --filter "T002137"
# expected: FAIL (red — der neue Abschnitt existiert im aktuellen Stand noch nicht)
```

## Task 2: Fix-Step (GREEN) — Gotcha dokumentieren

1. In `docs/superpowers/references/gotchas-footguns.md`:
   - Neuer Eintrag `15.` im „Section Index" (nach dem bestehenden Eintrag 14
     „Brett"), verlinkt auf den neuen Abschnitt.
   - Neuer Unterabschnitt `### Alt-Worktrees nach T002135 — Submodul-Gitdir-Reste`
     am Dateiende mit zwei Hintergrundsätzen (bats-Support-Libs sind seit T002135
     / PR #3167 vendort statt Git-Submodule; betrifft nur Worktrees, die vor dem
     2026-07-23-Merge angelegt wurden, und erledigt sich mit deren Austausch) und
     dem Cleanup-Snippet:

     ```bash
     rm -rf .git/worktrees/<name>/modules   # verwaiste Submodul-Gitdirs
     git worktree remove .worktrees/<name>  # geht dann ohne --force
     ```
2. In `CLAUDE.md` unter „Gotchas & Footguns" → „Covered sub-topics": eine neue
   Zeile nach dem bestehenden Muster anhängen (Bold-Stichwort + kurzer
   Verweis), die auf den neuen Abschnitt zeigt.
3. Test aus Task 1 erneut ausführen — muss jetzt grün sein:

```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan.bats --filter "T002137"
```

## Task 3: Final Verification

Neuer `tests/spec`-`@test` ⇒ Test-Inventar mit regenerieren.

```bash
task test:changed
task test:inventory
task freshness:regenerate
task freshness:check
```
