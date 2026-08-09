---
ticket_id: T002730
plan_ref: openspec/changes/fa-59-e2e-spec-positive-assertion/tasks.md
status: active
date: 2026-08-09
---

# Design Spec: FA-59 E2E Spec Positive Assertion Fix

## Context & Objectives

The Playwright test specification `tests/e2e/specs/fa-59-systemtest-purge-endpoint.spec.ts` was introduced in T002728 to verify that the build-target allowlist preserves the `/sdlc/api/systemtest/` routes in SSR builds.
However, both test cases used weak negative assertions (`not.toBe(404)`). If an endpoint returns 500/502/503 during a deployment failure or code error, the tests still pass.

## Requirements

1. **Explicit Positive Assertions**: Replace `expect(response.status()).not.toBe(404)` with `expect(response.status()).toBe(403)` in `tests/e2e/specs/fa-59-systemtest-purge-endpoint.spec.ts`.
2. **Comment Alignment**: Update line 6 comment in `tests/e2e/specs/fa-59-systemtest-purge-endpoint.spec.ts` to explicitly state `403` (Forbidden) response for unauthenticated calls.
3. **BATS Test Enforcement**: Add a test in `tests/spec/e2e-testing.bats` to check that `fa-59-systemtest-purge-endpoint.spec.ts` uses `.toBe(403)` and not `not.toBe(404)`.

## Affected Files

- `tests/e2e/specs/fa-59-systemtest-purge-endpoint.spec.ts`
- `tests/spec/e2e-testing.bats`
