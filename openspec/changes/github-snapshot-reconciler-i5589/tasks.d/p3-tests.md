# Partial 3: Test Suite & Verification

- [ ] **Run failing unit test before implementation (Rotphase)**
  - Run `GITHUB_IDENTITY_TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres pnpm --dir components/website exec vitest run src/lib/tickets/github-snapshot-reconciler.test.ts`
  - Verify that missing reconciler implementation fails with `expected: FAIL`.

- [ ] **Implement Vitest and BATS Test Suites**
  - Create `components/website/src/lib/tickets/github-snapshot-reconciler.test.ts`:
    - Test issue & PR snapshot ingestion in PostgreSQL
    - Test cursor update atomicity and rollback on error
    - Test auto-registration of objects, coordinates, and `closes` relations
    - Test `pr_events` projection compatibility
  - Create `tests/unit/tickets-pr-snapshots.bats`:
    - Test snapshot table existence and schema constraints

- [ ] **Final Verification**
  - Run `task test:changed`
  - Run `task freshness:regenerate`
  - Run `task freshness:check`
