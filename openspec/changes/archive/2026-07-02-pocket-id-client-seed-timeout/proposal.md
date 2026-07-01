# Proposal: pocket-id-client-seed-timeout

## Why

The `pocket-id-client-seed` Job's init container had a poll timeout of 120s (60 iterations × 2s), which is too short for cold-start scenarios where pocket-id and shared-db need >2 minutes for DB migration + app init. This caused the seed job to fail repeatedly on fresh deploys, leaving OIDC client config in a drifted state (T001326).

## What

Increase the init container poll timeout from 120s to 600s (300 iterations × 2s) and reduce `backoffLimit` from 5 to 2 (redundant with longer internal timeout).

**Ticket:** T001327 (Root Cause von T001326)
