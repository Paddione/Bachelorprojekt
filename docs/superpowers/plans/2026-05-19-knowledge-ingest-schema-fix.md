---
ticket_id: T000487
---
# Plan: Fix Knowledge Ingest Schema Mismatch

The `ingest-prs.mjs` script in `k3d/knowledge-ingest-cronjob.yaml` is querying `body` and `labels` columns from `bachelorprojekt.features`. These columns do not exist in the schema defined in `k3d/website-schema.yaml`.

## Proposed Changes

### Kubernetes Manifests
- Modify `k3d/knowledge-ingest-cronjob.yaml`:
    - Update `ingest-prs.mjs` SQL query to remove `body` and `labels`.
    - Update the text construction logic to remove usage of `row.body` and `row.labels`.

## Verification Plan

### Automated Tests
- Run `tests/unit/knowledge-ingest-schema.bats` to verify the script no longer contains the problematic column names.

### Manual Verification
- Deploy to `korczewski` cluster.
- Trigger `knowledge-ingest-prs` manually.
- Verify pod completion.
