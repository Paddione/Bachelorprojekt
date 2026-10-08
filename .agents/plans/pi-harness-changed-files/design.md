---
ticket_id: null
plan_ref: null
status: active
date: 2026-10-08
---

# Design: PI_WORKTREE-Naht gegen parallele Schreiber (T901070)

## Root Cause
`dirty_snapshot()` nutzt hartverdrahtet `$REPO_ROOT` als Vergleichsbaum.
Jede Datei, die zwischen den beiden Snapshots irgendwo im Checkout entsteht
oder sich aendert (parallele `bats -j`-Worker, andere Tests, Agent-Artefakte),
geht in `changed_files` ein. Der Zaehler misst „Repo-Delta", nicht „Lauf-Delta".

## Fix-Ansatz
1. **`scripts/pi-run.sh`**: `PI_WORKTREE="${PI_WORKTREE:-$REPO_ROOT}"` nahe der
   `REPO_ROOT`-Zuweisung (`:31`); `dirty_snapshot` nutzt `git -C "$PI_WORKTREE"`
   fuer `status` UND `hash-object` (relative Pfade loesen gegen `-C`-Dir auf —
   kein `cd`-Umbau noetig). Log-Verzeichnis (`$REPO_ROOT/.pi/runs`) bleibt
   unangetastet (gitignored, zaehlt nie mit). Diff: ca. +4 Zeilen.
2. **`tests/spec/pi-harness.bats`**:
   - Bestehender `changed_files`-Test wird hermetisch: `git init` in
     `$BATS_TEST_TMPDIR/worktree`, `PI_WORKTREE` dorthin exportieren,
     `PI_STUB_TOUCH` in dieses Worktree legen.
   - Neuer Regressionstest `... ignoriert parallele Schreiber`: Stub-`pi`
     legt zusaetzlich eine Stray-Datei im **echten** `$REPO_ROOT` ab
     (simuliert deterministisch einen parallelen `bats -j`-Schreiber zwischen
     den Snapshots — kein Timing-Glueck noetig); Assert `changed_files == 1`.
     Vor dem Fix: `2` → RED; nach dem Fix: `1` → GREEN.
   - `teardown` raeumt Stray-/Probe-Dateien weg (kein Schmutz im Checkout).
3. Kein neues Skript, kein neues Manifest → S4 unberuehrt; keine Domains → S3
   unberuehrt; keine TS/Svelte → CQ02/Vitest unberuehrt.

## Betroffene Subsysteme / Edge Cases
- `dirty_snapshot` bei `PI_WORKTREE` ohne Git-Repo: `git status` scheitert leise
  (`2>/dev/null`), Snapshots leer → `changed_files == 0`. Tests muessen daher
  `git init` ausfuehren (Guard im Test, kein `skip` — `git` ist in CI vorhanden).
- `hash-object "$f"` mit `-C`: relative Pfade aus `status --porcelain` loesen
  gegen das `-C`-Verzeichnis auf — verifiziert per manuellem Lauf im Worktree.
- `comm -3` mit leeren Snapshots: bereits via `grep -c . || true` abgesichert.
- T900793-Umbenennung (siehe Proposal): Portierung als Follow-up, kein Scope hier.
- Bestehende Tests erweitern statt neue Dateien anlegen (kein Inventar-Delta noetig,
  aber `task test:inventory` laeuft im Verify-Task zur Sicherheit mit).
