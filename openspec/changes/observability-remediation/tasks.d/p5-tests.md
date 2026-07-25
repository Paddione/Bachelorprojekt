# Partial 5: Tests (Pflicht-Partial)

Automated test suite covering Promtail/OTLP pipeline, Health-Goal DB persistence, Admin UI, and Alertmanager config acceptance.

## Target Files
`tests/spec/observability.bats`
`website/src/lib/__tests__/health-goals.test.ts`
`tests/e2e/observability-health.spec.ts`

## Tasks

- [ ] Task 5.1: Write BATS test `tests/spec/observability.bats` verifying Promtail values syntax and otel-emit.cjs module export contract. Run `bats tests/spec/observability.bats` before implementing fix (expected: FAIL).
- [ ] Task 5.2: Write Vitest unit test `website/src/lib/__tests__/health-goals.test.ts` verifying health metrics calculation logic.
- [ ] Task 5.3: Write Playwright test `tests/e2e/observability-health.spec.ts` for Admin UI health goals rendering.
