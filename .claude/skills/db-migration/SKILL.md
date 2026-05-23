---
name: db-migration
description: Use when adding new tables, columns, indexes, schemas, or roles to the shared PostgreSQL database — guides through writing migration SQL, applying to both clusters, re-granting permissions, verifying schema, and updating the ER diagram. Prevents the common mistake of applying only to one cluster.
---

> **Mishap Tracking:** As you execute this skill, maintain a running `MISHAP_LOG`.
> For every anomaly, unexpected state, broken component, security concern, or
> configuration drift you notice — even if unrelated to the current task — add
> an entry with: `type` (broken/degraded/suspicious/security/drift), `title`,
> `description`, and `component`. Invoke `mishap-tracker` at the very end.

# db-migration

Safe database schema migration across both production clusters.

---

## ⚠️ Both clusters are independent

mentolder and korczewski each have their own `shared-db`. A migration applied to one cluster does **not** propagate to the other. Always apply to both explicitly.

---

## Phase 1: Write the migration

Create a migration SQL file in `scripts/` or `scripts/datamodel/`:

```bash
# Example: scripts/datamodel/0042_add_coaching_sessions.sql
```

Migration conventions:
- Use `IF NOT EXISTS` for CREATE TABLE/INDEX/SCHEMA — makes migrations idempotent
- Use `IF EXISTS` for DROP statements
- Always wrap in a transaction:

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS coaching.sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    started_at TIMESTAMPTZ DEFAULT now(),
    ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_coaching_sessions_user_id
    ON coaching.sessions(user_id);

COMMIT;
```

- Never `DROP TABLE` in a migration that runs on prod without a confirmed backup
- For destructive changes: always `task workspace:backup` first

---

## Phase 2: Test on dev (if available)

```bash
task workspace:psql ENV=dev -- website < scripts/datamodel/<migration>.sql
```

Verify the result:
```bash
task workspace:psql ENV=dev -- website <<'SQL'
\d coaching.sessions
SQL
```

---

## Phase 3: Apply to mentolder

> **⚠️ Rollen-Eigentumshinweis:** `task workspace:psql` verbindet als `website`-Rolle. DDL auf `bachelorprojekt`, `coaching`, und `knowledge` Schemas (Tabellen gehören `postgres`) schlägt mit "must be owner of table" fehl. Für DDL auf diesen Schemas direkt mit `-U postgres` verbinden:
> ```bash
> PGPOD=$(kubectl get pod -n workspace --context mentolder -l app=shared-db -o name | head -1)
> kubectl exec -i "$PGPOD" -n workspace --context mentolder -- psql -U postgres -d website < migration.sql
> ```
> Für `public`-Schema DDL ist `task workspace:psql` ausreichend.

```bash
# Backup first for any destructive or large migration
task workspace:backup

# Apply
task workspace:psql ENV=mentolder -- website < scripts/datamodel/<migration>.sql

# Verify
task workspace:psql ENV=mentolder -- website <<'SQL'
\d <schema>.<table>
SQL
```

---

## Phase 4: Apply to korczewski

```bash
# Apply
task workspace:psql ENV=korczewski -- website < scripts/datamodel/<migration>.sql

# Verify
task workspace:psql ENV=korczewski -- website <<'SQL'
\d <schema>.<table>
SQL
```

---

## Phase 5: Re-grant permissions

After any schema or table creation, service roles may need explicit grants. Run:

```bash
task workspace:fix-tickets-grants ENV=mentolder
task workspace:fix-tickets-grants ENV=korczewski
```

For custom schemas or roles, check what grants the relevant services expect:

```bash
task workspace:psql ENV=mentolder -- website <<'SQL'
-- Check existing grants on a table
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = '<schema>' AND table_name = '<table>';
SQL
```

If a service role (e.g. `website`, `brett`, `tracking`) needs access to the new table:
```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON <schema>.<table> TO <role>;
GRANT USAGE ON SEQUENCE <schema>.<table>_id_seq TO <role>;  -- if using sequences
```

Apply the grant to both clusters.

---

## Phase 6: Update ER diagram

```bash
task db:diagram
```

Commit the updated diagram file alongside the migration SQL.

---

## Phase 7: Commit migration

```bash
git add scripts/datamodel/<migration>.sql
git add <diagram-output-path>
git commit -m "chore(db): add <table/column description> [<ticket-id>]"
```

---

## Common patterns

### Add a column with a default

```sql
ALTER TABLE coaching.chunks
    ADD COLUMN IF NOT EXISTS reviewed_by TEXT;

ALTER TABLE coaching.chunks
    ADD COLUMN IF NOT EXISTS quality_score FLOAT DEFAULT 0.0 NOT NULL;
```

### Create a new schema with role access

```sql
CREATE SCHEMA IF NOT EXISTS analytics;

GRANT USAGE ON SCHEMA analytics TO website;
ALTER DEFAULT PRIVILEGES IN SCHEMA analytics
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO website;
```

### Create a view

```sql
CREATE OR REPLACE VIEW bachelorprojekt.v_coaching_summary AS
SELECT ...;

GRANT SELECT ON bachelorprojekt.v_coaching_summary TO website;
```

### Migration already applied (idempotency check)

```sql
-- Check if column exists before adding
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'coaching' AND table_name = 'chunks'
          AND column_name = 'quality_score'
    ) THEN
        ALTER TABLE coaching.chunks ADD COLUMN quality_score FLOAT DEFAULT 0.0;
    END IF;
END $$;
```

---

## Rollback

PostgreSQL DDL is transactional — a `BEGIN`/`COMMIT` wrapped migration that errors is automatically rolled back. For already-applied migrations:

```sql
BEGIN;
ALTER TABLE coaching.chunks DROP COLUMN IF EXISTS quality_score;
COMMIT;
```

For dropped tables: restore from backup (`task workspace:restore -- <db> <timestamp>`).

---

## Post-Execution: Mishap Report

After completing all steps in this skill, invoke `mishap-tracker` with your
accumulated `MISHAP_LOG`. If no mishaps were found, `mishap-tracker` exits
cleanly with "No mishaps found."
