# Proposal: fix-db-missing-indexes-constraints

## Why

Address database health goals G-DB01 (missing FK indexes) and G-DB03 (missing brand check constraints) across platform schemas.

## What

- Add migration `20260821_add_missing_fk_indexes_and_brand_checks.sql` to index missing single-column foreign keys across all active schemas.
- Add brand check constraints on `public.customer_projects` and `tickets.cockpit_audit`.

_Ticket: T013031_

