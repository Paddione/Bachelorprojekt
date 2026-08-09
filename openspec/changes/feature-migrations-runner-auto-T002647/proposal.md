---
title: "Automatic Database Migrations Runner"
ticket_id: T002647
domains: [db, infra]
status: draft
---

# Proposal: feature-migrations-runner-auto-T002647

## Why

Currently, migration files in `migrations/` are applied manually or tracked inconsistently across environments. Ticket T002647 requires an automated migration runner mechanism (`database/infra` / `scripts/migrate-factory.mjs`) that automatically tracks applied SQL migrations in a dedicated ledger table (e.g. `public.schema_migrations` or `public.factory_schema_migrations`) upon container startup or application deployment.

## What

1. Implement `scripts/migrate-factory.mjs` (or node-based runner script) to lexically sort and execute pending `.sql` migration files under `migrations/`.
2. Ensure schema migration tracking via a ledger table with `filename` UNIQUE primary key and `applied_at` timestamp.
3. Integrate migration runner into Taskfile (`task factory:migrate` or `task workspace:deploy`).
4. Ensure all existing migrations in `migrations/` are tracked and marked as applied to prevent re-execution.
5. Provide BATS test coverage verifying tracking, idempotency, and execution order.

_Ticket: T002647_
