---
title: "pytest-test-harness — Implementation Plan"
ticket_id: T901211
domains: [tests, tooling, infra]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# pytest-test-harness — Implementation Plan

Einführung des Pytest-Testharness mit zentraler conftest.py (Subprocess-, YAML- und Repo-Fixtures), Requirements, Taskfile-Tasks und Pilot-Tests zur BATS-Ablösung.

_Ticket: T901211_

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `tests/py/conftest.py` | 0 (neu) | 800 |
| `tests/py/requirements-test.txt` | 0 (neu) | n/a (S1-ungated) |
| `tests/py/smoke/test_harness.py` | 0 (neu) | 800 |
| `tests/py/pilot/test_flux_validation.py` | 0 (neu) | 800 |
| `taskfiles/Taskfile.test.yml` | 970 | n/a (S1-ungated) |

<!-- vitest: kein neuer Test nötig, weil keine Datei unter components/website/src geändert wird -->

## Task: Failing Test bestätigen

```bash
uv run --with pytest --with pyyaml pytest tests/py/smoke/test_harness.py
```

expected: FAIL (vor der Implementierung).

## Task 1: Pytest Harness und Fixtures anlegen

1. `tests/py/requirements-test.txt` erstellen mit:
   - `pytest>=8.0.0`
   - `pyyaml>=6.0.0`
2. `tests/py/conftest.py` erstellen mit `repo_root`, `run_cmd` und `yaml_load`.

## Task 2: Taskfile-Integration

In `taskfiles/Taskfile.test.yml` Task `test:py` und `test:py:smoke` ergänzen.

## Task 3: Smoke- und Pilot-Tests implementieren

1. `tests/py/smoke/test_harness.py` implementieren.
2. `tests/py/pilot/test_flux_validation.py` implementieren.

## Task: Finale Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
