---
ticket_id: T000488
---
# Plan: Fix Knowledge Ingest Bugs Schema Mismatch

The `ingest-bug-tickets.mjs` script in `k3d/knowledge-ingest-cronjob.yaml` is querying `id` and `title` columns from `bugs.bug_tickets`. These columns do not exist in the actual schema (they are `ticket_id` and the description serves as the main text).

## Proposed Changes

### Kubernetes Manifests
- Modify `k3d/knowledge-ingest-cronjob.yaml`:
    - Update `ingest-bug-tickets.mjs` SQL query to use `ticket_id` instead of `id` and `title`.
    - Update the text construction logic to use `row.ticket_id` as the title.

## Verification Plan

### Automated Tests
- Run `tests/unit/knowledge-ingest-bugs-schema.bats` to verify the script no longer contains the problematic column names and uses `ticket_id`.

### Manual Verification
- Deploy to `korczewski` cluster.
- Trigger `knowledge-ingest-bugs` manually.
- Verify pod completion.
