# Plan: Fix T001948 — Unused Indexes idx_scan=0 (8 → 0)

## Context
8 unused indexes remain after T001928 dropped 89 of 93. These are partial UNIQUE indexes without formal `pg_constraint` entries (business invariants). The measurement query in `goals.md` needs `NOT indisunique` extension to avoid counting unloasable indexes.

## Tasks

1. **Update measurement query** in `.claude/lib/goals.md` G-DB10 section
   - Extend the `db_scalar` query to exclude `indisunique` indexes
   - Query: `SELECT count(*) FROM pg_stat_user_indexes s JOIN pg_index i ON i.indexrelid = s.indexrelid WHERE s.idx_scan = 0 AND i.indisready AND NOT i.indisprimary AND NOT i.indisunique AND s.indexrelid NOT IN (SELECT conindid FROM pg_constraint WHERE contype='u')`

2. **Identify the 8 remaining unused indexes**
   - Run the corrected query against the database
   - Classify each: which are true business-invariant UNIQUE constraints (cannot drop) vs truly unused

3. **Drop safely droppable indexes**
   - For each index confirmed as droppable (not enforcing a constraint): `DROP INDEX CONCURRENTLY <name>`
   - Verify no application code references the index name

4. **Update goals.md baseline**
   - Set G-DB10 current value to 0 (or new count after dropping)
   - Add Baseline-Update entry

## Verify
- `db_scalar "SELECT count(*) FROM pg_stat_user_indexes s JOIN pg_index i ON i.indexrelid = s.indexrelid WHERE s.idx_scan = 0 AND i.indisready AND NOT i.indisprimary AND NOT i.indisunique AND s.indexrelid NOT IN (SELECT conindid FROM pg_constraint WHERE contype='u')"` returns 0
- `bash scripts/health-goals-check.sh --only=G-DB10` shows target reached
