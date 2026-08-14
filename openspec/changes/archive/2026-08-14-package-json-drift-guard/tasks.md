---
title: "package-json-drift-guard — Implementation Plan"
ticket_id: T004611
domains: [ci]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# package-json-drift-guard — Implementation Plan

_Ticket: T004611_

## Why

Subagent-Dispatches führten am 2026-08-14 bei T004295 unbeabsichtigt `npm install` in
`.opencode/` aus (Plugin 1.18.16 → 1.18.18) und schleppten die Modifikation als Teil
eines Implementierungs-Commits ein — musste revertet werden (T004611). Der bestehende
T001434-Guard (`check-commit-vs-diff.sh`) blockt Implementierungs-Titel mit
Plan-/Test-only-Diffs, kennt aber `.opencode/package*.json` nicht als Dependency-Artefakt.

Fix: Guard um die Package-Artefakt-Klasse erweitern — blocken bei Implementierungs-Titel +
package.json-Rauschen, erlauben bei deklariertem Dependency-Update. Die leeren
Subagent-Returns selbst sind Infrastruktur-Last (M2/M3-Eskalation greift bereits); dieser
Change adressiert den reproduzierbaren Teil.

## File Structure

```
scripts/check-commit-vs-diff.sh                    — Guard-Erweiterung (Package-Artefakt-Klasse)
tests/unit/check-commit-vs-diff-package-drift.bats — BATS (RED, liegt bereits vor)
openspec/changes/package-json-drift-guard/         — proposal + delta (dieses Ticket)
```

## Tasks

### Task 1: Rot-Phase verifizieren (failing Test)

`tests/unit/check-commit-vs-diff-package-drift.bats` liegt bereits vor (4 Tests). Rot
bestätigen — der Defekt MUSS nachweisbar sein, bevor der Fix gebaut wird:

1. `bash tests/unit/lib/bats-core/bin/bats tests/unit/check-commit-vs-diff-package-drift.bats`
2. Verify Test 1 ("fix mit .opencode/package.json-Rauschen") fails — Exit 0 statt != 0.
3. Verify Test 2 ("fix mit package-lock.json-Rauschen") fails — Exit 0 statt != 0.
4. Positiv-Anker (Test 3 chore(deps), Test 4 ohne .opencode/) sind GRÜN.

### Task 2: Guard in check-commit-vs-diff.sh erweitern

`scripts/check-commit-vs-diff.sh`, in der Diff-Klassifikation (wo Test-/Plan-/Spec-Dateien
erkannt werden):

1. `.opencode/package.json` und `.opencode/package-lock.json` als eigene Artefakt-Klasse
   erkennen (`PACKAGE_DRIFT_RE='(^|/)\.opencode/package(-lock)?\.json$'`).
2. Logik: wenn die staged Diff-Menge Package-Artefakte enthält UND der Subject-Typ
   Implementierung ist (`fix|feat|refactor|perf`) UND der Subject-Scope KEIN Dependency-
   Update deklariert (`chore(deps)`/`fix(plugins)`/`build(deps)`) → Exit 1 mit Meldung
   im Stil der T001434-Meldung: nennt `package.json` und die erlaubten Präfixe.
3. `chore(deps)`/`fix(plugins)`/`build(deps)`-Titel → Exit 0 (legitimes Update).
4. Kein Package-Artefakt im Diff → bestehendes Verhalten unverändert.
5. Per-Commit-Modus (`git show --name-only`, CI) identisch behandeln — dieselbe
   Datei-Klassifikation nutzen.

### Task 3: Grün-Phase — eigenen Testlauf bestehen

1. `bash tests/unit/lib/bats-core/bin/bats tests/unit/check-commit-vs-diff-package-drift.bats`
2. Erwartung: ALLE 4 Tests grün.
3. Regression der bestehenden Suite:
   - `bash tests/unit/lib/bats-core/bin/bats tests/unit/check-commit-vs-diff.bats`
   - `bash scripts/check-commit-vs-diff.sh --self-test`
4. `task test:changed` — kein neuer Rot-Zustand.

### Task 4: Lint + Freshness + Finale

1. `bash scripts/plan-lint.sh openspec/changes/package-json-drift-guard/tasks.md`
2. `bash scripts/openspec.sh validate`
3. `task freshness:check`
4. Stage-Commit mit `chore(plans):`-Präfix (T001434 — NIEMALS `fix()`/`feat()`).
5. Push `fix/subagent-returns-leer-T004611`.

## Verify

1. `task test:changed` — Smart-Selektion grün.
2. `task freshness:regenerate` — generierte Artefakte neu erzeugen.
3. `task freshness:check` — keine uncommitteten generierten Artefakte.
4. `bash scripts/plan-lint.sh openspec/changes/package-json-drift-guard/tasks.md` — FAIL = 0.
5. `bash tests/unit/lib/bats-core/bin/bats tests/unit/check-commit-vs-diff-package-drift.bats` — 4/4 grün.
6. `stage-plan --hold` erfolgreich (Fix-Pfad: Factory-Dispatch zurückhalten).
7. Kein PR aus dem Plan-Stand (T002816).
