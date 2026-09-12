---
title: "GitHub SDLC: complete issue and PR snapshot reconciler"
ticket_id: "T900161"
domains: ["tracking", "db", "ci"]
status: "plan_staged"
---

# GitHub SDLC: complete issue and PR snapshot reconciler Implementation Plan [T900161]

## File Structure

- `components/website/src/lib/tickets-schema.ts`: Database schema definition for GitHub issue snapshots, PR snapshots, and sync cursors.
- `components/website/src/lib/tickets/github-snapshot-reconciler.ts`: Core GitHub Issue & PR snapshot reconciliation module.
- `components/website/src/lib/tickets/github-pr-events-compat.ts`: Legacy `pr_events` projection compatibility wrapper.
- `components/website/src/lib/tickets/github-snapshot-reconciler.test.ts`: Vitest PostgreSQL integration suite for snapshot reconciliation.
- `tests/unit/tickets-pr-snapshots.bats`: BATS schema definition and table structure test suite.

## Partials

| Partial | Task File | Role | Goal |
|---|---|---|---|
| p1-schema | tasks.d/p1-schema.md | schema | Add database tables for GitHub issue & PR snapshots and cursors |
| p2-reconciler | tasks.d/p2-reconciler.md | reconciler | Implement snapshot reconciler logic and pr_events compatibility |
| p3-tests | tasks.d/p3-tests.md | tests | Write Vitest integration & BATS tests and run final verification |

---

## Task Details

### Partial 1: Database Schema Additions (`tasks.d/p1-schema.md`)
- [ ] Add `tickets.github_issue_snapshots`, `tickets.github_pr_snapshots`, and `tickets.github_sync_cursors` tables in `components/website/src/lib/tickets-schema.ts`.

### Partial 2: Snapshot Reconciler and Compatibility (`tasks.d/p2-reconciler.md`)
- [ ] Implement `reconcileGitHubIssueSnapshots` and `reconcileGitHubPRSnapshots` in `components/website/src/lib/tickets/github-snapshot-reconciler.ts`.
- [ ] Implement `projectSnapshotToPREvents` in `components/website/src/lib/tickets/github-pr-events-compat.ts`.

### Partial 3: Test Suite & Final Verification (`tasks.d/p3-tests.md`)
- [ ] Run failing test step before implementation: execute `GITHUB_IDENTITY_TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres pnpm --dir components/website exec vitest run src/lib/tickets/github-snapshot-reconciler.test.ts` (expected: FAIL).
- [ ] Add `github-snapshot-reconciler.test.ts` and `tests/unit/tickets-pr-snapshots.bats`.
- [ ] Final verification: run `task test:changed`, `task freshness:regenerate`, and `task freshness:check`.
