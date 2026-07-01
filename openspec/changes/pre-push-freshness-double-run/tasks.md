---
title: "pre-push-freshness-double-run — Implementation Plan"
ticket_id: T001388
domains: [ci, dev-flow-execute]
status: active
file_locks: [.githooks/pre-commit, tests/spec/pre-commit-freshness.bats, openspec/changes/pre-push-freshness-double-run/]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# pre-push-freshness-double-run — Implementation Plan

**Ticket:** T001388
**Branch:** `fix/t001388-pre-push-freshness-double-run`
**Worktree:** `tmp/wt-t001388`
**Spec:** `docs/superpowers/specs/2026-07-01-t001388-pre-push-freshness-double-run-design.md`

## File Structure

**Geändert (1):**
- `.githooks/pre-commit` — `_FRESHNESS_FILES`-Array um
  `website/src/data/openspec-status.json` und
  `docs/code-quality/loc-budget.json` erweitern. S1: Datei 69 Zeilen, neuer
  S1-Limit-Anteil ist 2 Zeilen → weit unter dem 500-Zeilen-Limit für
  `*.sh`/`*.bash`. Kein _ext_limit-Regression-Risiko.

**Neu (1):**
- `tests/spec/pre-commit-freshness.bats` — 3 BATS-Tests (RED-Sanity +
  Drift-Guard + Auto-Stage-Smoke gegen die zwei hinzugefügten Dateien).

**Nicht geändert (SSOT-Schutz):**
- `Taskfile.yml` — die `freshness:check`-`FILES`-Variable ist SSOT; der
  pre-commit-Hook listet sie explizit (kein Refactor in diesem Change,
  wäre ein eigenes größeres Refactor-Ticket).
- `scripts/check-loc-budget.mjs` — `countChanged`-Logik bleibt unverändert
  (siehe Spec §"Non-Goals": `measured_at`-Drift ist aktuell nicht
  reproduzierbar).
- `.githooks/pre-push` — bleibt Verify-only (kein Regen).
- `openspec/specs/ci-cd.md` — Delta-Spec in
  `openspec/changes/pre-push-freshness-double-run/specs/ci-cd.md`
  hinzugefügt; SSOT-Spec wird beim `archive`-Schritt konsolidiert.

## Vorgehen

- [ ] **Task 0: Failing-Test ist rot gegen `main` — `tests/spec/pre-commit-freshness.bats` (RED, Step 1)**
  - **Step 1: verify test fails against main's pre-commit hook (RED-Sanity, reproduces the bug):**
    ```bash
    tests/unit/lib/bats-core/bin/bats tests/spec/pre-commit-freshness.bats
    ```
    **expected: FAIL** — der Drift-Guard-Test stellt fest, dass
    `website/src/data/openspec-status.json` und/oder
    `docs/code-quality/loc-budget.json` in `.githooks/pre-commit`'s
    `_FRESHNESS_FILES`-Array fehlen. Das ist exakt der Bug, der zu
    "Amend + re-push nötig" führt.

- [ ] **Task 1: Fix in `.githooks/pre-commit` anwenden (GREEN, Step 2)**
  - Datei: `.githooks/pre-commit`.
  - **Schritt 2a:** Im `_FRESHNESS_FILES`-Array (Zeilen 35–54) die zwei
    fehlenden Pfade ergänzen, in der Reihenfolge, in der sie im
    `task freshness:regenerate`-Umbrella erzeugt werden (loc-budget
    zuletzt, nach openspec-status-map). Konkret:
    ```diff
       website/public/learning-assets/THIRD-PARTY-ASSETS.md
    +  website/src/data/openspec-status.json
       docs/code-quality/repo-index.json
    +  docs/code-quality/loc-budget.json
       docs/agent-guide/10-ziele.md
    ```
  - **Schritt 2b:** Kommentar im Hook (Zeile 32–33) präzisieren: aus
    "Prevents CI failures when new test/route/asset files are added
    without regenerating." wird "Prevents CI freshness failures by
    capturing every regen-produced file in the same commit (see
    T001388)."

- [ ] **Task 2: GREEN-Sanity — der neue Test ist jetzt grün**
  - **Step 2: run the test, expect PASS (GREEN) after fix is applied:**
    ```bash
    tests/unit/lib/bats-core/bin/bats tests/spec/pre-commit-freshness.bats
    ```
    **expected:** alle drei Tests `ok` (RED-Sanity, Drift-Guard, Auto-Stage-Smoke).

- [ ] **Task 3: Final Verification — mandatory CI gates**
  ```bash
  task test:changed
  task freshness:regenerate
  task freshness:check
  ```
  Erwartung: alle drei ohne Fehler. `freshness:check` muss insbesondere
  für `openspec-status.json` und `loc-budget.json` keinen Drift
  feststellen.

## Nach dem Merge (nicht Teil dieses PRs)

- Optionaler Follow-up-Refactor (separates Ticket): `_FRESHNESS_FILES` im
  pre-commit-Hook aus `Taskfile.yml freshness:check` `FILES` automatisch
  ableiten (Source-of-Truth-Disziplin, verhindert künftige Drift
  endgültig). Aktuell ist es eine manuelle, gewartete Liste — das ist
  fragil, aber für den Hotfix ausreichend.
- Beobachtung: `02197c8e` (`chore: auto-regenerate freshness artifacts
  [skip ci]`) deutet darauf hin, dass `loc-budget.json` in der
  Vergangenheit nachträglich außerhalb des Hooks korrigiert wurde. Falls
  nach diesem Fix ähnliche Nach-Korrektur-Commits auftauchen, wäre das
  ein Signal, dass die Root-Cause noch nicht vollständig adressiert ist
  (z. B. wenn `countChanged` doch `true` wird). Beobachten, nicht
  spekulativ fixen.
