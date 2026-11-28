---
title: ci-queue-guard — CI-Queue-Guard gegen p95-Ausreisser
domains: [ci, testing]
status: staged
goal: ci-queue-guard
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# ci-queue-guard — Implementation Plan

Spec: `.agents/goals/ci-queue-guard/GOAL.md` (Plan traegt Goal).
Base: `origin/main`, Branch `fix/ci-queue-guard`.
Reproducer: `proposal.md` (p95-Befund mit Befehl und sortierten Deltas).
Design-Entscheide: D1 nur Guard ohne Split, D2 Nachweis via workflow_dispatch.

## File Structure

- Modify: `.github/workflows/ci.yml`
- New: `tests/py/spec/ci_cd_specs/test_ci_queue_guard.py`

## Task 1: RED-Beleg sichern (Guard faellt vor dem Fix)

**Files:**
- New: `tests/py/spec/ci_cd_specs/test_ci_queue_guard.py`

Lege den Guard-Test an (Pruefmodus Quelltext, wie test_e2e_runner_image_pin.py):
concurrency-Gruppe fuer schedule vorhanden, kein cancel auf main,
schedule-Cron vorhanden.

```bash
bash scripts/pytest-run.sh tests/py/spec/ci_cd_specs/test_ci_queue_guard.py
```

Run: `bash scripts/pytest-run.sh tests/py/spec/ci_cd_specs/test_ci_queue_guard.py`
Expected: FAIL with 2 failing tests (concurrency-Gruppe fehlt, schedule-Schutz fehlt).

## Task 2: Queue-Guard landen und verifizieren (letzter Task)

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `tests/py/spec/ci_cd_specs/test_ci_queue_guard.py`

Ergaenze in ci.yml den schedule-spezifischen concurrency-Kommentar plus
rerun-Hinweis, halte alle bestehenden Jobs unveraendert. Danach Guard gruen.

```bash
bash scripts/pytest-run.sh tests/py/spec/ci_cd_specs/test_ci_queue_guard.py
```

Run: `bash scripts/pytest-run.sh tests/py/spec/ci_cd_specs/test_ci_queue_guard.py`
Expected: PASS.

Verify: task test:changed; task freshness:regenerate; task freshness:check
