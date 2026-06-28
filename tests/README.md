# tests/

Test framework for the Workspace MVP platform. Combines BATS shell tests,
integration checks, Playwright end-to-end tests, and factory eval scripts.

## Directory layout

| Directory | Content |
|-----------|---------|
| `spec/` | BATS tests per OpenSpec SSOT spec (one `.bats` per `openspec/specs/*.md`) |
| `unit/` | BATS unit tests for cross-cutting concerns |
| `integration/` | Service integration tests (HTTP, SSO, DB) |
| `e2e/` | Playwright browser tests against live environments |
| `manual/` | Manual test checklists (not automated) |
| `factory-eval/` | Software Factory quality-gate eval scripts |
| `fixtures/` | Shared test fixtures and seed data |
| `lib/` | Shared BATS helper functions |

## Running tests

```bash
# Full local tier (requires k3d cluster running)
./tests/runner.sh local

# Specific test IDs
./tests/runner.sh local FA-01 SA-03

# Full prod tier
./tests/runner.sh prod

# Regenerate Markdown report
./tests/runner.sh report
```

Via task oracle:

```bash
bash scripts/vda.sh oracle 'run all offline tests'
```

## CI

GitHub Actions (`ci.yml`) runs `task test:all` on every PR.
New BATS entries belong in `tests/spec/<spec-slug>.bats`.
