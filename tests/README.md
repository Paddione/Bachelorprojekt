# tests/

Test framework for the Workspace MVP platform. Combines native pytest tests,
shell-based tier tests, and Playwright end-to-end tests. BATS was removed in T901392.

## Directory layout

| Directory | Content |
|-----------|---------|
| `py/` | pytest suite: `py/spec/` per area, `py/unit/` cross-cutting, `py/local/` live tests (only with `PYTEST_LOCAL=1`) |
| `spec/` | Fixtures and helpers used by the spec tests |
| `unit/` | Vitest cockpit tests and unit fixtures |
| `integration/` | Service integration tests (HTTP, SSO, DB) |
| `e2e/` | Playwright browser tests against live environments |
| `manual/` | Manual test checklists (not automated) |
| `fixtures/` | Shared test fixtures and seed data |
| `lib/` | Shared shell helpers for the tier tests (`assert.sh`, `report.sh`, ...) |

## Running tests

```bash
# Full local tier (requires devmesh kube context reachable)
./tests/runner.sh local

# Specific test IDs
./tests/runner.sh local FA-01 SA-03

# Full prod tier
./tests/runner.sh prod

# Regenerate Markdown report
./tests/runner.sh report

# Offline pytest suite (parallel)
bash scripts/pytest-run.sh
bash scripts/pytest-run.sh tests/py/spec/<area>
```

Via task oracle:

```bash
bash scripts/vda.sh oracle 'run all offline tests'
```

## CI

GitHub Actions (`ci.yml`) runs the pytest suite on every PR: `tests/py` without the specs in
the unit job, `tests/py/spec` sharded in four jobs. New tests are pytest modules under
`tests/py/spec/<area>/test_<slug>.py`; conventions are in `tests/CLAUDE.md`.
