# p3 — Failing Test grün + Inventar (tests)

## Ziel

Der im Stage-Commit rote BATS-Test dreht nach p1+p2 vollständig auf grün;
Test-Inventar regeneriert und mitcommittet.

## Steps

- [ ] Rot→Grün-Nachweis — zuerst Rotstand aus dem Stage-Commit reproduzieren
      (expected: FAIL), dann nach p1+p2 grün bestätigen, jeweils mit Runner:
  ```bash
  ./tests/unit/lib/bats-core/bin/bats tests/spec/workspace-staging-db-tables.bats
  ```
  Rotstand (Stage-Commit): Tests 1–4 `not ok` (Ensure-Lücken + fehlende
  Fehlerpfade), Anker-Tests 5–6 `ok`. Grünstand: `6 passed` (alle `ok`).
- [ ] `task test:inventory` — regeneriert u. a. für die zwei neuen colocated
      Vitest-Dateien aus p2; `components/website/src/data/test-inventory.json`
      mitcommitten (exakter Guard-Pfad, CI-Inventar-Check).
- [ ] Betroffene BATS-Selection plus Website-Vitest gezielt nachziehen
      (`task test:changed` folgt im finalen Verify-Task von `tasks.md`).

## Akzeptanz

- `./tests/unit/lib/bats-core/bin/bats tests/spec/workspace-staging-db-tables.bats`
  meldet 6/6 `ok`.
- `git status` zeigt `test-inventory.json` als einzige Data-Änderung neben
  Plan + Tests.
