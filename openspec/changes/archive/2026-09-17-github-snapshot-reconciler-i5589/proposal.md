# Proposal: github-snapshot-reconciler-i5589

## Why

Following I#5588 (PR #5603), which introduced database identity primitives (`tickets.github_objects`, `tickets.github_object_coordinates`, `tickets.work_item_refs`, `tickets.github_object_relations`), the platform requires a robust snapshot reconciler (I#5589) for complete GitHub Issue and Pull Request state. 

Currently, recent PR data is projected using bounded ephemeral structures or raw `pr_events` rows, missing complete issue history, state transitions, closing link mappings, labels, and transactional incremental cursor tracking. I#5589 completes the GitHub SDLC integration layer by storing complete, timestamped snapshots of Issues and PRs while maintaining 100% backward compatibility for existing `tickets.pr_events` and `pr_status` consumers.

## What

1. **Database Schema Additions (`tickets-schema.ts`):**
   - Table `tickets.github_issue_snapshots`: Stores node IDs, title, body, state (`OPEN`, `CLOSED`), state_reason, author, labels, timestamps (`created_at`, `updated_at`, `closed_at`), and `observed_at`.
   - Table `tickets.github_pr_snapshots`: Stores node IDs, title, body, state (`OPEN`, `CLOSED`, `MERGED`), draft flag, head/base refs, author, labels, timestamps (`created_at`, `updated_at`, `closed_at`, `merged_at`), merge commit SHA, and `observed_at`.
   - Table `tickets.github_sync_cursors`: Stores sync cursors (`id`, `cursor`, `last_synced_at`, `synced_count`) with transactional guarantees (cursor advances only upon transaction commit).
   - Compatibility view `tickets.v_pr_status` / projection support for `tickets.pr_events`.

2. **Reconciler Implementation (`components/website/src/lib/tickets/github-snapshot-reconciler.ts`):**
   - Paginated GitHub GraphQL / REST ingestion for initial backfill and incremental snapshot updates.
   - Automatic integration with `registerGitHubObject` and `recordGitHubRelation` (`closes` / `implements`) for native closing references.
   - Transactional snapshot updates with atomic cursor progression.

3. **Compatibility Layer (`components/website/src/lib/tickets/github-pr-events-compat.ts`):**
   - Projects merged PR snapshots into `tickets.pr_events` or maintains legacy format compatibility for `delivery-metrics.ts`, DORA metrics, and BATS tests.

4. **Testing Suite:**
   - Vitest suite `components/website/src/lib/tickets/github-snapshot-reconciler.test.ts` (using PostgreSQL integration).
   - BATS test suite `tests/unit/tickets-pr-snapshots.bats`.

_Ticket: T900161_

