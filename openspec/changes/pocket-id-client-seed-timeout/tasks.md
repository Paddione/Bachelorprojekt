---
title: "pocket-id-client-seed: Init-Container-Timeout für Cold-Start erhöhen (T001327)"
ticket_id: T001327
domains: [infra, auth, ops]
status: active
file_locks: [k3d/pocket-id-client-seed.yaml, tests/spec/pocket-id-client-seed-timeout.bats, openspec/changes/pocket-id-client-seed-timeout/, docs/superpowers/specs/2026-06-30-pocket-id-client-seed-timeout-design.md, .lavish/pocket-id-client-seed-timeout-brainstorm.html]
shared_changes: true
batch_id: null
parent_feature: null
depends_on_plans: []
---

# pocket-id-client-seed-timeout — Implementation Plan

**Ticket:** T001327 (Root Cause von T001326)  
**Branch:** `fix/t001327-pocket-id-client-seed-timeout`  
**Worktree:** `/home/patrick/Bachelorprojekt/tmp/wt-pocket-id-seed`  
**Spec:** `docs/superpowers/specs/2026-06-30-pocket-id-client-seed-timeout-design.md`  
**Brainstorm:** `.lavish/pocket-id-client-seed-timeout-brainstorm.html`

## File Structure

**Geändert (1):**
- `k3d/pocket-id-client-seed.yaml` — Init-Container: Poll-Timeout `-ge 60` → `-ge 300` (600s statt 120s), `backoffLimit: 5` → `backoffLimit: 2`.

**Neu (1):**
- `tests/spec/pocket-id-client-seed-timeout.bats` — 2 BATS-Tests (RED: init timeout zu niedrig, backoffLimit zu hoch).

**Nicht geändert (SSOT-Schutz):**
- `k3d/pocket-id.yaml` — pocket-id Deployment (Keine Änderung nötig — wird durch readiness/liveness probes gesteuert)
- `k3d/kustomization.yaml` — registriert bereits pocket-id-client-seed.yaml
- `openspec/specs/fleet-operations.md` — Spezifikation, kein Delta nötig

## Vorgehen

- [ ] **Task 0: Failing-Test ist bereits rot im Branch — `tests/spec/pocket-id-client-seed-timeout.bats` (RED, Step 1)**
  - Branch enthält 2 BATS-Tests in `tests/spec/pocket-id-client-seed-timeout.bats`:
    - **Test 1 (RED)**: init container darf nicht `-ge 60` haben (Bug-Wert). Aktuell FAIL — der BUG: der Manifest hat noch den zu niedrigen Timeout.
    - **Test 2 (RED)**: backoffLimit darf nicht `5` sein (zu hoch für das erhöhte Init-Timeout). Aktuell FAIL — noch Bug-Wert.
  - **Step 1: verify test fails (RED-Sanity, reproduces the bug):**
    ```bash
    tests/unit/lib/bats-core/bin/bats tests/spec/pocket-id-client-seed-timeout.bats
    ```
    **expected: FAIL** — mindestens Test 1 und 2 scheitern, weil der Manifest noch den Bug-Wert enthält.

- [ ] **Task 1: Fix in `k3d/pocket-id-client-seed.yaml` anwenden (GREEN, Step 2)**
  - Datei: `k3d/pocket-id-client-seed.yaml`.
  - **Schritt 2a: Init-Container-Timeout erhöhen:** In der Init-Container-Logik den Schwellwert von 60 auf 300 ändern:
    ```bash
    if [ "$i" -ge 300 ]; then
      echo "pocket-id not healthy after 600s"; exit 1
    fi
    ```
  - **Schritt 2b: backoffLimit senken:** `backoffLimit: 5` → `backoffLimit: 2`. Da der Init-Container jetzt intern bis zu 600s wartet, braucht es weniger Pod-Restarts.
  - **Schritt 2c: Meldung im Init-Container anpassen:** `echo "waiting for pocket-id health ($i/300)..."` (optional, zur Konsistenz).

- [ ] **Task 2: GREEN-Sanity — die 2 neuen Tests sind jetzt grün**
  - **Step 2: run the test, expect PASS (GREEN) after fix is applied:**
    ```bash
    tests/unit/lib/bats-core/bin/bats tests/spec/pocket-id-client-seed-timeout.bats
    ```
    **expected: PASS** — beide Tests laufen grün durch, weil der Manifest die erhöhten Timeout-Werte enthält.

- [ ] **Task 3: Verifikation — alle Quality-Gates grün (Verify-Task)**
  - `task test:changed` — fokussierte Tests für die geänderten Dateien (`k3d/pocket-id-client-seed.yaml`, `tests/spec/pocket-id-client-seed-timeout.bats`). Expect PASS.
  - `task freshness:regenerate && task freshness:check` — generierte Artefakte (test-inventory.json, route-manifest, baseline.json) bleiben aktuell. Expect grün.
  - `task workspace:validate` — k3d-Kustomize-Manifests valid. Expect Exit 0.
  - `bash scripts/openspec.sh validate` — OpenSpec-Change-Struktur gültig. Expect Exit 0.

- [ ] **Task 4: Branch-Lock prüfen + Commit + Push + PR**
  - Branch-Lock steht bereits (`fix/t001327-pocket-id-client-seed-timeout` claimed via `agent-lock.sh`).
  - Commit-Message: `fix(infra): pocket-id-client-seed: Init-Timeout 120s→600s, backoffLimit 5→2 [T001327]`
  - `git push -u origin fix/t001327-pocket-id-client-seed-timeout` → PR via `gh-axi pr create`.
  - PR-Body muss verlinken: T001327 (this), T001326 (Root-Cause-of).
  - `agent-lock.sh release ticket T001327` und `release branch fix/t001327-pocket-id-client-seed-timeout` nach erfolgreichem Push.

> **Verifikations-Resultate (nach Task 3):**
> - `task test:changed`: ✓ (pocket-id-client-seed-timeout.bats: 2/2 PASS)
> - `task freshness:check`: ✓ 0 neue Violations
> - `task workspace:validate`: ✓ Exit 0
> - `bash scripts/openspec.sh validate pocket-id-client-seed-timeout`: ✓ keine Errors
