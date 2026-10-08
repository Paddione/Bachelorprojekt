---
ticket_id: T901211
plan_ref: .agents/plans/pytest-test-harness/tasks.md
status: active
date: 2026-10-08
---

# Design Spec — Pytest Test-Harness und Taskfile-Integration

## Kontext & Problemstellung
Im Bachelorprojekt werden über 160 BATS-Testdateien betrieben, die CLI-Tools, Git-Hooks, Cluster-Manifeste und Datenbank-Schemata prüfen. BATS hat inhärente Grenzen bezüglich strukturierter Fehlerdiagnose, Fixture-Scoping und YAML-Parsing.
Als Vorbereitung für die schrittweise Ablösung von BATS wird ein modernes, hermetisches Pytest-Harness eingeführt.

## Architektur & Komponenten
1. **Zentrales Pytest-Setup (`tests/py/conftest.py`)**:
   - `repo_root`: Session-Scope Fixture, die den absoluten Pfad zur Repository-Wurzel liefert (`Path`).
   - `run_cmd`: Subprocess-Wrapper mit automatischem Timeout, Exit-Code-Assertion und lesbarem STDOUT/STDERR-Formatting.
   - `yaml_load`: Hilfsfunktion für sicheres YAML-Laden (PyYAML) zur Validierung von K8s/Flux-Manifesten.
2. **Requirements (`tests/py/requirements-test.txt`)**:
   - Deklariert `pytest>=8.0.0` und `pyyaml>=6.0.0`.
3. **Taskfile-Integration (`taskfiles/Taskfile.test.yml`)**:
   - `test:py`: Führt die Pytest-Suite via `uv run --with pytest --with pyyaml pytest tests/py` (mit Fallback auf `python3 -m pytest`) aus.
   - `test:py:smoke`: Führt `tests/py/smoke/` aus.
4. **Smoke- und Pilot-Tests**:
   - `tests/py/smoke/test_harness.py`: Schneller Smoke-Test, der die grundlegende Funktion der Fixtures (`repo_root`, `run_cmd`) validiert.
   - `tests/py/pilot/test_flux_validation.py`: Paritäts-Pilot für die ersten Validierungsprüfungen aus `tests/flux-validation.bats`.
