# Proposal: fix-systemtest-cronjobs-sdlc-T002644

## Why

Following the SDLC path migration (ADR-006 / T002624), the systemtest failure-loop CronJobs in `k3d/cronjob-systemtest-cleanup.yaml` are calling obsolete endpoints under `/api/admin/systemtest/*` which no longer exist as direct Astro pages/routes and generate 404 errors.

Specifically:
- `systemtest-cleanup` calls `/api/admin/systemtest/cleanup-fixtures`
- `systemtest-purge-all` calls `/api/admin/systemtest/purge-all-test-data`
- `systemtest-outbox` calls `/api/admin/systemtest/drain-outbox`

The underlying Astro routes live under `website/src/pages/sdlc/api/systemtest/`.

## What

Update `k3d/cronjob-systemtest-cleanup.yaml` to point to the correct SDLC API endpoints:
- `/sdlc/api/systemtest/cleanup-fixtures`
- `/sdlc/api/systemtest/purge-all-test-data`
- `/sdlc/api/systemtest/drain-outbox`

Also verify and update any references in documentation or tests where applicable.

_Ticket: T002644_
