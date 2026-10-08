---
title: "PI_WORKTREE-Naht gegen parallele Schreiber im changed_files-Test"
ticket_id: "T901070"
domains: ["tests", "scripts"]
status: "staged"
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# pi-harness-changed-files — Implementation Plan

## File Structure

- `scripts/pi-run.sh` — `PI_WORKTREE`-Naht (`"${PI_WORKTREE:-$REPO_ROOT}"`) und
  `dirty_snapshot` auf den Worktree umstellen (statt hartverdrahtet `REPO_ROOT`).
- `tests/spec/pi-harness.bats` — bestehender `changed_files`-Test hermetisch auf
  Temp-Git-Repo stellen; neuer Regressionstest mit zwei deterministischen
  Stray-Schreibern im echten Checkout (bereits RED committet).

| `scripts/pi-run.sh` | 358 | 442 |
| (`tests/spec/pi-harness.bats` ist 241 Zeilen, Extension ohne S1-Limit — kein Budget nötig.)

## Kontext

- Root Cause siehe `.agents/plans/pi-harness-changed-files/proposal.md`, Design siehe
  `design.md`, Symbole siehe `intel.json` (Ziele: `scripts/pi-run.sh`,
  `tests/spec/pi-harness.bats`).
- Der RED-Test ist bereits im Branch committet (mit diesem Plan). Beide
  `changed_files`-Tests FAILen auf `origin/main`-Stand, erwartet `1`:
  der migrierte Alt-Test sieht die Probe ausserhalb des Baus nicht mehr (liest `0`),
  der neue Test zaehlt die zwei Stray-Schreiber mit (liest `2`).
- Kollision: `chore/omp-replaces-pi-T900793` benennt `pi-run.sh` zu `omp-run.sh`
  und `pi-harness.bats` zu `omp-harness.bats` um. Dieser Plan zielt auf die
  `pi-*`-Pfade; nach deren Merge ist die Naht zu portieren (Follow-up ausserhalb).

## Task 1 — RED-Test verifizieren (Rotphase, bereits committet)

- [ ] Im Worktree nur die beiden Tests ausfuehren und ROT bestaetigen
      (expected: FAIL — Flake-Mechanismus deterministisch reproduziert,
      kein Timing-Glueck):
```bash
tests/unit/lib/bats-core/bin/bats tests/spec/pi-harness.bats --filter "changed_files"
```
- [ ] Gate: beide Tests FAIL, kein Schmutz im Checkout
      (`git status --porcelain` zeigt nur `M tests/spec/pi-harness.bats`).

## Task 2 — `PI_WORKTREE`-Naht in `scripts/pi-run.sh` einziehen

- [ ] Direkt nach `REPO_ROOT=...` (`scripts/pi-run.sh:31`) einfuegen:
```bash
PI_WORKTREE="${PI_WORKTREE:-$REPO_ROOT}"
```
- [ ] `dirty_snapshot` (`:130-135`) auf `git -C "$PI_WORKTREE"` umstellen
      (fuer `status` UND `hash-object`; relative Pfade loesen gegen das
      `-C`-Verzeichnis auf — kein `cd`-Umbau, kein Touch an Log-Pfad,
      `.pi/runs` bleibt gitignored und zaehlt nie mit).
- [ ] Diff klein halten (ca. +4 Zeilen, Ist 358 + Delta klar unter Budget 442).
- [ ] ASCII-Konvention der Datei einhalten (keine Umlaute in neuem Code/Kommentar).
- [ ] Gate: `bash -n scripts/pi-run.sh` fehlerfrei; Default-Lauf ohne
      `PI_WORKTREE` verhaelt sich wie zuvor (Naht default-identisch).

## Task 3 — GRUEN drehen und Regression schliessen

- [ ] Erneut ausfuehren:
```bash
tests/unit/lib/bats-core/bin/bats tests/spec/pi-harness.bats --filter "changed_files"
```
- [ ] Gate: beide Tests PASS (`changed_files == 1` trotz zweier Stray-Schreiber
      im echten Checkout); `teardown` hat Stray-/Probe-Dateien entfernt
      (`git status --porcelain` ohne `pi-stray-*`/`pi-probe-*`).
- [ ] Volle Datei einmalig gruessen (kein Parallel-Einfluss ausblenden):
```bash
tests/unit/lib/bats-core/bin/bats tests/spec/pi-harness.bats
```
- [ ] Gate: alle Tests der Datei PASS.

## Task 4 — Verify (Pflicht-Gates)

- [ ] `task test:inventory` (Test-Aenderung — Inventar regenerieren,
      ggf. `components/website/src/data/test-inventory.json` mitcommitten).
- [ ] `task test:changed`
- [ ] `task freshness:regenerate`
- [ ] `task freshness:check` (darin `quality:check` mit S1-Ratchet:
      `scripts/pi-run.sh` Ist 358 + ca. 4 < Limit 800, Budget 442 reicht).
- [ ] Gate: alle vier Kommandos Exit 0.

<!-- vitest: kein neuer Test nötig, weil keine .ts/.svelte-Datei angefasst wird. -->
