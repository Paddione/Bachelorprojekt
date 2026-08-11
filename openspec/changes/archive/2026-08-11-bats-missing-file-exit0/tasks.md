---
title: "bats-missing-file-exit0 — Implementation Plan"
ticket_id: T003278
domains: [test, ci]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# bats-missing-file-exit0 — Implementation Plan

_Ticket: T003278_

## File Structure

```
scripts/lib/run-bats.sh                                    (neu — Wrapper mit Existenz-Guard)
tests/spec/e2e-test-infrastructure/bats-missing-file-exit0.bats  (neu — Rot/Grün-Test)
openspec/changes/bats-missing-file-exit0/specs/e2e-test-infrastructure.md  (Delta-Spec)
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Add the BATS test that reproduces the bug. The
      wrapper does not exist yet, so the test that calls it must FAIL on the
      current branch. Use the phrase `expected: FAIL` in the step body so
      plan-lint STRUCT2 picks it up.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/e2e-test-infrastructure/bats-missing-file-exit0.bats
# expected: FAIL (red — scripts/lib/run-bats.sh existiert noch nicht)
```

## Task 1 — Wrapper `scripts/lib/run-bats.sh` (GREEN)

- **Step 1.1:** `scripts/lib/run-bats.sh` anlegen (neu, ~60 LOC, S1-Limit 800 unterschritten): für jeden nicht-`-`-Arg
  (Datei- oder Verzeichnispfad, der nicht mit `-` beginnt und kein Option-Flag
  mit eigenem Wert ist) `test -e "$arg"` prüfen; bei Fehlen auf stderr melden
  (`run-bats: Testpfad existiert nicht: <path>`) und `exit 1`.
  Positiv: alle Pfade existieren → `exec tests/unit/lib/bats-core/bin/bats "$@"`
  (Exit-Propagation). Options-Artefakte (z.B. `-r`, `-j`, `--report-formatter`
  + Wert) dürfen die Prüfung nicht brechen — robuste Arg-Schleife statt
  blindem Pfad-Check über alle Positional-Args.
- **Step 1.2:** Test `tests/spec/e2e-test-infrastructure/bats-missing-file-exit0.bats`
  schreiben (neu, ~40 LOC): drei Szenarien aus der Delta-Spec:
  1. fehlende Datei → Exit != 0 (Reproduktion aus dem Ticket: `nicht-da.bats`),
  2. fehlendes Verzeichnis → Exit != 0,
  3. Positiv-Anker: existierender Testpfad läuft normal durch und der Exit-Code
     des zugrunde liegenden bats wird propagiert.
  Semantik statt Darstellung (T002716): Exit-Codes prüfen, nicht Ausgabe-Grep.
- **Step 1.3:** `bash scripts/plan-lint.sh openspec/changes/bats-missing-file-exit0/tasks.md`
  grün bekommen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/e2e-test-infrastructure/bats-missing-file-exit0.bats
# expected: PASS (green — der Wrapper existiert und greift)
```

## Task 2 — Bewerbung des Wrappers als Gate (nicht Umstellung aller Aufrufer)

- **Step 2.1:** In `Taskfile.yml` `test:spec` (Zeile ~804) den Aufruf über den Wrapper
  führen (`scripts/lib/run-bats.sh` statt direktem `./tests/unit/lib/bats-core/bin/bats`)
  — bewahrt die Shard-Semantik (Dateiliste via `find`, nicht `-r`). S1-Budget:
  Taskfile.yml ~2300 LOC, Ist ~2300 - Baseline 2279 = +21 → Budget bleibt unter Limit;
  nur der bats-Aufruf in einer Zeile wird ausgetauscht (+1/-1 Zeile, keine
  strukturelle Änderung).
- **Step 2.2:** `scripts/find-changed-tests.sh` unverändert lassen (eigener
  Umstellungspfad), aber im Abschlusskommentar des Changes die 114 Aufrufstellen
  als Follow-up dokumentieren (kein Scope-Drift in diesem Ticket).
- **Step 2.3:** Die drei CI-Gates in dieser Task-Schrittfolge ausführen:
  `task test:changed` (rot/gelb-grün Check), `task freshness:regenerate`
  (generierte Artefakte aktualisieren) und `task freshness:check`
  (Artefakte committet).

## Final Verification

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
