---
title: "freshness-check-base-mismatch — Implementation Plan"
ticket_id: T002561
domains: [bachelorprojekt-test]
status: staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# freshness-check-base-mismatch — Implementation Plan

_Ticket: T002561_

## Root Cause

`Taskfile.yml` `freshness:check` (Phase 0/1, ~line 1154) diffs generated artifacts only
against the local `HEAD` (`git diff --quiet "$f"` and `git diff --quiet HEAD -- "$f"`). No
line in that task references `origin/main` or `git rev-list`. CI runs the same task against
the PR merge commit, which already contains the current `origin/main` state. Both
measurements are individually correct but compare different bases — verified by source
inspection (T002448-M5), not an unverified hypothesis. See `design.md` for the full analysis.

## File Structure

```
Taskfile.yml                                             # freshness:check task: add origin/main
                                                          #   divergence warning + measured-HEAD note
tests/spec/ci-cd/freshness-check-base-mismatch.bats       # NEW — failing test (already added in
                                                          #   this stage commit, RED against main)
```

| path | ist | budget |
| --- | --- | --- |
| `Taskfile.yml` | 5049 | nicht-baselined (kein `.yml`-S1-Eintrag in `docs/code-quality/baseline.json`; S1-Ratchet trackt nur `website/src/**` — kein Budget-Constraint für diese Datei) |

## Tasks

- [x] **Task 1 (RED, bereits erledigt im Stage-Commit).** Failing BATS-Test hinzugefügt:
      `tests/spec/ci-cd/freshness-check-base-mismatch.bats`. Er prüft per Source-Grep (Taskfile.yml
      ist eine CI-Task-Definition ohne eigenen ausführbaren Output — Ausnahme aus dem
      Test-Resultats-Konvention-Absatz in CLAUDE.md), dass die `freshness:check`-Task-Definition
      einen `git rev-list --count HEAD..origin/main`-Aufruf sowie eine `origin/main`-Referenz
      enthält. Ein zweiter Kontroll-Test stellt sicher, dass `task: freshness:regenerate` weiter
      aufgerufen wird (kein Über-Fix).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/freshness-check-base-mismatch.bats
# expected: FAIL (red — verified: test 1 fails with "MISSING 'git rev-list --count
# HEAD..origin/main' divergence check in freshness:check task"; test 2 already passes as a
# control anchor)
```

- [x] **Task 2 (GREEN).** In `Taskfile.yml`, innerhalb der `freshness:check`-Task, direkt vor
      Phase 1 (dem bestehenden `ERRORS=0`-Diff-Check-Block, ca. Zeile 1177), einen neuen
      Shell-Block einfügen, der:
      1. `BEHIND=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo 0)` ermittelt
         (Fallback `0` bei fehlendem `origin/main`-Ref — kein harter Fehler, siehe
         `design.md` §Edge-Cases).
      2. Bei `BEHIND` > 0 eine Warnzeile ausgibt, die die Anzahl der Commits nennt und
         erklärt, dass CI gegen eine aktuellere Basis (Merge-Commit) prüft. Kein `exit 1` —
         reine Warnung, kein Gate.
      3. Den gemessenen `HEAD`-Kurz-SHA (`git rev-parse --short HEAD`) in einer Zeile
         ausgibt, die sowohl bei Erfolg als auch bei den bestehenden Fehlermeldungen sichtbar
         ist (z. B. vor dem bestehenden `echo "✓ All generated artifacts are fresh"` bzw. vor
         dem `ERROR: ... not committed`-Block).

      Nach diesem Task muss `tests/spec/ci-cd/freshness-check-base-mismatch.bats` grün sein.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/freshness-check-base-mismatch.bats
# expected: PASS (nach Task 2)
```

- [x] **Task 3 (Final Verification).** Regenerierte Artefakte + volle Gate-Kette:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
