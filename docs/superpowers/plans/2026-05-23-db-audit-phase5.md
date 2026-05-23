---
ticket_id: T000150
title: DB Audit Phase 5 — Runtime-Informed Comprehensive Audit
domains: [db, infra, ops]
status: active
pr_number: null
---

# DB Audit Phase 5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-05-23-db-audit-phase5-design.md`

**Goal:** Identify and remove unneeded database structures and bring existing ones to best practice on both `mentolder` and `korczewski` shared-db, using empirical `pg_stat_user_*` evidence + structural checks + cross-cluster drift detection. Produces a Markdown findings report and a categorized set of additive SQL migrations; DROP migrations are gated on per-item user approval.

**Architecture:** Read-only pipeline (collect → analyze → report → apply additive → DROP gate → apply approved DROPs → regenerate ER diagram). 5 detection modules (orphans / runtime stats / structural / hygiene / cross-cluster drift). All migrations are idempotent + transactional + applied to both clusters with verification between.

**Tech Stack:** Bash, `task workspace:psql`, `task workspace:backup`, kubectl context-aware operations, `scripts/db-schema-diagram.py` for ER regeneration, `bachelorprojekt-db` sub-agent for query authoring/review.

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `docs/db-audit/2026-05-23-phase5/README.md` | Index + summary metrics |
| Create | `docs/db-audit/2026-05-23-phase5/findings.md` | Categorized findings report |
| Create | `docs/db-audit/2026-05-23-phase5/decision-log.md` | Per-DROP approval record |
| Create | `docs/db-audit/2026-05-23-phase5/evidence/pg_stat_tables.mentolder.csv` | Module 2 raw evidence |
| Create | `docs/db-audit/2026-05-23-phase5/evidence/pg_stat_tables.korczewski.csv` | Module 2 raw evidence |
| Create | `docs/db-audit/2026-05-23-phase5/evidence/pg_stat_indexes.mentolder.csv` | Module 2 raw evidence |
| Create | `docs/db-audit/2026-05-23-phase5/evidence/pg_stat_indexes.korczewski.csv` | Module 2 raw evidence |
| Create | `docs/db-audit/2026-05-23-phase5/evidence/stats_reset.json` | Module 2 gate timestamp |
| Create | `docs/db-audit/2026-05-23-phase5/evidence/orphan-candidates.json` | Module 1 output |
| Create | `docs/db-audit/2026-05-23-phase5/evidence/structural-findings.json` | Module 3 output |
| Create | `docs/db-audit/2026-05-23-phase5/evidence/schema-hygiene.json` | Module 4 output |
| Create | `docs/db-audit/2026-05-23-phase5/evidence/grant-matrix.csv` | Module 4 output |
| Create | `docs/db-audit/2026-05-23-phase5/evidence/migration-inventory.md` | Module 4 output |
| Create | `docs/db-audit/2026-05-23-phase5/evidence/drift.json` | Module 5 output |
| Create | `scripts/db-audit/phase5/collect-pg-stats.sh` | Read-only stats query runner |
| Create | `scripts/db-audit/phase5/collect-structural.sh` | Read-only structural query runner |
| Create | `scripts/db-audit/phase5/collect-drift.sh` | Cross-cluster diff runner |
| Create | `scripts/db-audit/phase5/grep-orphans.sh` | Code-grep helper for Module 1 |
| Create | `scripts/db-audit/phase5/aggregate-findings.sh` | Evidence → findings.md aggregator |
| Create | `scripts/datamodel/2026-05-23-audit-phase5-add-fk-indexes.sql` | Phase C autonomous |
| Create | `scripts/datamodel/2026-05-23-audit-phase5-add-fk-constraints.sql` | Phase C autonomous |
| Create | `scripts/datamodel/2026-05-23-audit-phase5-add-not-null.sql` | Phase C autonomous |
| Create | `scripts/datamodel/2026-05-23-audit-phase5-add-comments.sql` | Phase C autonomous |
| Create | `scripts/datamodel/2026-05-23-audit-phase5-cold-index-drops.sql` | Phase C autonomous (cold indexes only) |
| Create | `scripts/datamodel/2026-05-23-audit-phase5-bring-cross-cluster.sql` | Phase C autonomous drift fix |
| Create | `scripts/datamodel/2026-05-23-audit-phase5-drop-orphans.sql` | Phase D after approval |
| Modify | `docs/db-schema-diagram.md` | Regenerated at end via `task db:diagram` |

---

## Task 1: Pre-flight & environment setup

**Files:**
- Create: `scripts/db-audit/phase5/` (directory)
- Create: `docs/db-audit/2026-05-23-phase5/evidence/` (directory)

- [ ] **Step 1.1: Verify both cluster contexts are reachable**

```bash
kubectl --context mentolder get pod -n workspace -l app=shared-db -o name | head -1
kubectl --context korczewski get pod -n workspace-korczewski -l app=shared-db -o name | head -1
```
Expected: one pod name per cluster. If either fails, abort and surface to user.

- [ ] **Step 1.2: Verify pg_stat_statements availability**

```bash
task workspace:psql ENV=mentolder -- website <<'SQL'
SELECT extname, extversion FROM pg_extension WHERE extname = 'pg_stat_statements';
SQL
task workspace:psql ENV=korczewski -- website <<'SQL'
SELECT extname, extversion FROM pg_extension WHERE extname = 'pg_stat_statements';
SQL
```
If extension is absent on either cluster, note in `evidence/stats_reset.json` — Module 2 falls back to `pg_stat_user_tables` only.

- [ ] **Step 1.3: Snapshot `stats_reset` timestamp for both clusters**

```bash
for ENV in mentolder korczewski; do
  task workspace:psql ENV=$ENV -- website -At -F, <<'SQL' \
    > /tmp/stats_reset_$ENV.csv
SELECT datname, stats_reset
FROM pg_stat_database
WHERE datname IN ('website','postgres');
SQL
done
```
Write `evidence/stats_reset.json` with both timestamps and a derived `eligible_for_drop_proposals` boolean (true only if BOTH clusters have stats_reset >30 days ago).

- [ ] **Step 1.4: Create scripts directory + evidence directory**

```bash
mkdir -p scripts/db-audit/phase5
mkdir -p docs/db-audit/2026-05-23-phase5/evidence
```

---

## Task 2: Module 2 — Runtime statistics collection (Phase A)

**Files:**
- Create: `scripts/db-audit/phase5/collect-pg-stats.sh`
- Create: `docs/db-audit/2026-05-23-phase5/evidence/pg_stat_tables.{mentolder,korczewski}.csv`
- Create: `docs/db-audit/2026-05-23-phase5/evidence/pg_stat_indexes.{mentolder,korczewski}.csv`

- [ ] **Step 2.1: Write the collection script**

`scripts/db-audit/phase5/collect-pg-stats.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
ENV="${1:?usage: $0 <mentolder|korczewski>}"
OUT_DIR="${2:-docs/db-audit/2026-05-23-phase5/evidence}"
mkdir -p "$OUT_DIR"

# pg_stat_user_tables — all user schemas across both DBs (website + postgres)
for DB in website postgres; do
  task workspace:psql ENV="$ENV" -- "$DB" -At -F, <<'SQL' \
    >> "$OUT_DIR/pg_stat_tables.$ENV.csv"
SELECT current_database() AS db, schemaname, relname,
       n_live_tup, n_dead_tup, seq_scan, seq_tup_read,
       idx_scan, n_tup_ins, n_tup_upd, n_tup_del,
       last_vacuum, last_autovacuum, last_analyze, last_autoanalyze
FROM pg_stat_user_tables
ORDER BY schemaname, relname;
SQL
done

# pg_stat_user_indexes
for DB in website postgres; do
  task workspace:psql ENV="$ENV" -- "$DB" -At -F, <<'SQL' \
    >> "$OUT_DIR/pg_stat_indexes.$ENV.csv"
SELECT current_database() AS db, schemaname, relname AS tablename,
       indexrelname AS indexname,
       idx_scan, idx_tup_read, idx_tup_fetch,
       pg_relation_size(indexrelid) AS size_bytes
FROM pg_stat_user_indexes
ORDER BY schemaname, relname, indexrelname;
SQL
done
```

- [ ] **Step 2.2: Run for both clusters in parallel via subagent fan-out**

Use `superpowers:dispatching-parallel-agents` with two sibling tasks:
- Subagent A: `bash scripts/db-audit/phase5/collect-pg-stats.sh mentolder`
- Subagent B: `bash scripts/db-audit/phase5/collect-pg-stats.sh korczewski`

Each subagent gets explicit kubectl context. Both write to disjoint files; no merge needed.

- [ ] **Step 2.3: Verify**

```bash
wc -l docs/db-audit/2026-05-23-phase5/evidence/pg_stat_tables.*.csv
wc -l docs/db-audit/2026-05-23-phase5/evidence/pg_stat_indexes.*.csv
```
Expect at least ~80 lines per tables file (≥87 tables × 2 DBs may overlap) and significantly more lines per indexes file.

---

## Task 3: Module 1 — Orphan detection (Phase A)

**Files:**
- Create: `scripts/db-audit/phase5/grep-orphans.sh`
- Create: `docs/db-audit/2026-05-23-phase5/evidence/orphan-candidates.json`

- [ ] **Step 3.1: Build the removed-feature keyword list**

In `scripts/db-audit/phase5/grep-orphans.sh`, hard-code the keyword list from spec Section 2:
```bash
REMOVED_FEATURES=(
  "stripe"
  "invoice_ninja|invoiceninja"
  "mattermost"
  "argocd|argo_cd"
  "tracking_import|track_pr"
)
```

- [ ] **Step 3.2: Query live schema for matches on both clusters**

For each keyword, run:
```sql
SELECT current_database(), table_schema, table_name
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog','information_schema','pg_toast')
  AND (table_name ~* '<keyword>' OR table_schema ~* '<keyword>');
```

- [ ] **Step 3.3: For every match, grep the source tree**

```bash
for table in "${MATCHES[@]}"; do
  refs=$(grep -rln --include='*.{ts,js,tsx,jsx,astro,svelte,py,sh,sql,yaml,yml,json}' \
    -E "\\b${table}\\b" \
    website/src/ arena-server/src/ brett/ scripts/ k3d/ prod*/ \
    2>/dev/null | wc -l)
  # record: {cluster, schema, table, feature, code_refs, row_count, ddl_size_bytes}
done
```

- [ ] **Step 3.4: Augment with zero-row + no-code-refs tables**

Cross-reference Task 2 output (`pg_stat_tables.*.csv`) with code refs. Any table with `n_live_tup == 0` AND zero code references gets added to orphan-candidates regardless of feature-keyword match.

- [ ] **Step 3.5: Write `evidence/orphan-candidates.json`**

Format per entry: `{cluster, schema, table, matched_feature, code_refs, row_count, ddl_size_bytes, recommendation: "drop"|"investigate"}`.

---

## Task 4: Module 3 — Structural integrity collection (Phase A)

**Files:**
- Create: `scripts/db-audit/phase5/collect-structural.sh`
- Create: `docs/db-audit/2026-05-23-phase5/evidence/structural-findings.json`

- [ ] **Step 4.1: Write structural query batch**

In `collect-structural.sh`, run these queries against both clusters and emit JSON:

```sql
-- Missing FK indexes
SELECT current_database(), c.conrelid::regclass AS table,
       a.attname AS column, c.confrelid::regclass AS referenced
FROM pg_constraint c
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
WHERE c.contype = 'f'
  AND NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = c.conrelid
      AND a.attnum = ANY(i.indkey)
  );

-- TEXT-typed columns that look like UUIDs by name
SELECT table_schema, table_name, column_name, data_type
FROM information_schema.columns
WHERE column_name ~ '_(id|uuid)$'
  AND data_type IN ('text','character varying')
  AND table_schema NOT IN ('pg_catalog','information_schema');

-- Nullable columns with zero actual nulls (sampled per table)
-- Generated dynamically — for each (schema,table,column) in information_schema.columns
-- where is_nullable='YES', run: SELECT COUNT(*) FILTER (WHERE col IS NULL) FROM table

-- Redundant indexes (same column prefix)
SELECT schemaname, tablename,
       array_agg(indexname ORDER BY array_length(indkey,1))
FROM (
  SELECT schemaname, tablename, indexname, string_to_array(indkey::text,' ') AS indkey
  FROM pg_indexes i
  JOIN pg_class c ON c.relname = i.indexname
  JOIN pg_index ix ON ix.indexrelid = c.oid
) sub
GROUP BY schemaname, tablename
HAVING count(*) > 1;
```

- [ ] **Step 4.2: For TEXT-as-UUID candidates, verify value format**

```sql
SELECT COUNT(*) FILTER (WHERE col !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') AS non_uuid_count
FROM <schema>.<table>;
```
Only propose `ALTER COLUMN TYPE UUID` if non_uuid_count == 0.

- [ ] **Step 4.3: Emit `evidence/structural-findings.json`**

Tag each entry with `action_class: autonomous|approval` per spec Module 3 rules.

---

## Task 5: Module 4 — Schema hygiene collection (Phase A)

**Files:**
- Create additions to `scripts/db-audit/phase5/collect-structural.sh` (reuse)
- Create: `docs/db-audit/2026-05-23-phase5/evidence/schema-hygiene.json`
- Create: `docs/db-audit/2026-05-23-phase5/evidence/grant-matrix.csv`
- Create: `docs/db-audit/2026-05-23-phase5/evidence/migration-inventory.md`

- [ ] **Step 5.1: List tables in `public` schema**

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
```
For each, classify against the 8 domain map in `docs/db-schema-diagram.md`. Output suggested target schema or `keep_public`.

- [ ] **Step 5.2: Inventory missing comments**

```sql
SELECT n.nspname AS schema, c.relname AS table,
       obj_description(c.oid, 'pg_class') AS table_comment
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
  AND obj_description(c.oid, 'pg_class') IS NULL
ORDER BY n.nspname, c.relname;
```
Generate proposed COMMENTs by table name + domain context.

- [ ] **Step 5.3: Build grant matrix**

```sql
SELECT grantee, table_schema, privilege_type
FROM information_schema.role_table_grants
WHERE grantee NOT IN ('postgres','PUBLIC')
ORDER BY grantee, table_schema, privilege_type;
```
Emit CSV: rows=grantee×schema, columns=privileges. Compare against expected role-per-service intent.

- [ ] **Step 5.4: Migration directory inventory**

```bash
{
  echo "# Migration directory inventory"
  for dir in scripts/migrations scripts/datamodel scripts/one-shot/archive \
             website/src/db/migrations arena-server/src/db/migrations; do
    echo "## $dir"
    ls "$dir" 2>/dev/null | grep -E '\.sql$' | sed 's/^/- /'
    echo
  done
} > docs/db-audit/2026-05-23-phase5/evidence/migration-inventory.md
```

---

## Task 6: Module 5 — Cross-cluster drift collection (Phase A)

**Files:**
- Create: `scripts/db-audit/phase5/collect-drift.sh`
- Create: `docs/db-audit/2026-05-23-phase5/evidence/drift.json`

- [ ] **Step 6.1: Snapshot full schema metadata per cluster**

```bash
for ENV in mentolder korczewski; do
  for DB in website postgres; do
    task workspace:psql ENV="$ENV" -- "$DB" -At -F'|' <<'SQL' \
      > "/tmp/schema_${ENV}_${DB}.csv"
SELECT 'table' AS kind, table_schema, table_name, '' AS column, '' AS extra
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog','information_schema','pg_toast');

SELECT 'column', table_schema, table_name, column_name,
       data_type || '|' || is_nullable
FROM information_schema.columns
WHERE table_schema NOT IN ('pg_catalog','information_schema','pg_toast');

SELECT 'index', schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname NOT IN ('pg_catalog','information_schema');

SELECT 'constraint', table_schema, table_name, constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_schema NOT IN ('pg_catalog','information_schema');
SQL
  done
done
```

- [ ] **Step 6.2: Diff per kind**

```bash
diff <(sort /tmp/schema_mentolder_website.csv) <(sort /tmp/schema_korczewski_website.csv) \
  > /tmp/drift_website.diff
diff <(sort /tmp/schema_mentolder_postgres.csv) <(sort /tmp/schema_korczewski_postgres.csv) \
  > /tmp/drift_postgres.diff
```

- [ ] **Step 6.3: Convert diff to structured `drift.json`**

Each entry: `{kind, schema, name, column?, present_on: ["mentolder"|"korczewski"|"both"], expected_action, action_class}`.

Apply tiering rules from spec Module 5:
- One-sided table missing on other for >30 days → approval (could be by-design like `arena` on korczewski)
- One-sided nullable column or column-with-default → autonomous
- Type mismatch → report only
- Missing index/constraint → autonomous

Flag the `arena` schema on korczewski with `expected_action: ignore_by_design` per spec out-of-band note.

---

## Task 7: Phase B — Aggregate evidence into findings.md

**Files:**
- Create: `scripts/db-audit/phase5/aggregate-findings.sh`
- Create: `docs/db-audit/2026-05-23-phase5/findings.md`
- Create: `docs/db-audit/2026-05-23-phase5/README.md`
- Create: `docs/db-audit/2026-05-23-phase5/decision-log.md`

- [ ] **Step 7.1: Author the aggregator script**

`aggregate-findings.sh` reads all JSON/CSV evidence files and emits `findings.md` in the format from spec Section 3:

```markdown
### F-NNN · [severity] · Module N · action_class
**Title:** ...
**Clusters:** mentolder ⏳ korczewski ⏳
**Evidence:** ...
**Proposed SQL:** ...
**Rollback:** ...
**Status:** Pending
```

Numbering: F-001 through F-NNN, ordered by (module, severity, schema, name).

- [ ] **Step 7.2: Author `README.md` summary**

```markdown
# DB Audit Phase 5 — 2026-05-23
## Summary
- Total findings: NN
- Autonomous: NN (will apply in Phase C)
- Approval required: NN (DROP candidates in Phase D)
- Cross-cluster drift items: NN
- Stats reset: mentolder=<date>, korczewski=<date>, eligible_for_drops=<bool>
## How to read
... (links to findings.md and evidence/)
```

- [ ] **Step 7.3: Initialise empty `decision-log.md`**

```markdown
# Phase 5 DROP Decision Log
| Finding | Decision | Approver | Backup ref | Applied at |
|---|---|---|---|---|
(rows added during Phase D)
```

- [ ] **Step 7.4: REPORT-ONLY COMMIT**

```bash
git add docs/db-audit/2026-05-23-phase5/ scripts/db-audit/phase5/
git commit -m "chore(db-audit): phase5 findings report [T000150]"
```
The report is now reviewable independent of any DB change. **Push immediately** so the PR can show this commit by itself.

```bash
git push -u origin feature/db-audit-phase5
```

---

## Task 8: Phase C — Author autonomous additive migrations

**Files:** seven SQL files in `scripts/datamodel/2026-05-23-audit-phase5-*.sql`

- [ ] **Step 8.1: Generate `add-fk-indexes.sql`**

From `evidence/structural-findings.json` (Module 3 FK-index findings), emit one CREATE INDEX statement per finding inside a single transaction:
```sql
BEGIN;
CREATE INDEX IF NOT EXISTS idx_<table>_<col> ON <schema>.<table>(<col>);
-- ...
COMMIT;
```

- [ ] **Step 8.2: Generate `add-fk-constraints.sql`**

Only for unambiguous-target findings (single matching table). Use `NOT VALID` to avoid long lock + later VALIDATE:
```sql
BEGIN;
ALTER TABLE <schema>.<table>
  ADD CONSTRAINT fk_<table>_<col>
  FOREIGN KEY (<col>) REFERENCES <ref_schema>.<ref_table>(id)
  NOT VALID;
COMMIT;
-- Follow-up: ALTER TABLE ... VALIDATE CONSTRAINT fk_...  (in a separate small transaction)
```

- [ ] **Step 8.3: Generate `add-not-null.sql`**

From the nullable-with-zero-nulls findings:
```sql
BEGIN;
ALTER TABLE <schema>.<table> ALTER COLUMN <col> SET NOT NULL;
COMMIT;
```

- [ ] **Step 8.4: Generate `add-comments.sql`**

```sql
BEGIN;
COMMENT ON TABLE <schema>.<table> IS '<derived description>';
COMMENT ON COLUMN <schema>.<table>.<col> IS '<derived description>';
COMMIT;
```

- [ ] **Step 8.5: Generate `cold-index-drops.sql`** (gated on stats_reset eligibility)

```sql
BEGIN;
DROP INDEX IF EXISTS <schema>.<indexname>;  -- last seen scanned: never (stats since <date>)
COMMIT;
```
Skip this file entirely if `eligible_for_drop_proposals = false`.

- [ ] **Step 8.6: Generate `bring-cross-cluster.sql`** (autonomous drift fixes)

From `evidence/drift.json` autonomous entries — e.g., missing nullable column, missing index on one side:
```sql
BEGIN;
ALTER TABLE <schema>.<table> ADD COLUMN IF NOT EXISTS <col> <type>;
CREATE INDEX IF NOT EXISTS <name> ON <schema>.<table>(<col>);
COMMIT;
```
This file may differ per cluster — write two variants if needed (`-mentolder.sql`, `-korczewski.sql`) but only generate the one(s) actually required.

---

## Task 9: Phase C — Apply autonomous migrations to mentolder + verify

**Files:** the same SQL files (read), `decision-log.md` (append status row per migration)

- [ ] **Step 9.1: For each SQL file in order (indexes → constraints → not-null → comments → cold-drops → drift):**

```bash
task workspace:psql ENV=mentolder -- website < scripts/datamodel/2026-05-23-audit-phase5-<name>.sql 2>&1 | tee /tmp/migrate-<name>-mentolder.log
```

- [ ] **Step 9.2: Verify each migration**

```bash
task workspace:psql ENV=mentolder -- website <<SQL
\d <touched-object>
SQL
```
Record applied timestamp in `findings.md` status table per finding.

- [ ] **Step 9.3: Re-grant if any new tables/schemas were created**

```bash
task workspace:fix-tickets-grants ENV=mentolder
# Plus any schema-specific re-grant tasks introduced
```

- [ ] **Step 9.4: Smoke probe**

```bash
task workspace:verify ENV=mentolder
```
Must return green before proceeding to korczewski.

---

## Task 10: Phase C — Apply autonomous migrations to korczewski + verify

**Files:** same SQL files, `findings.md`

- [ ] **Step 10.1: Apply each SQL file** (same order as Task 9, `ENV=korczewski`)

- [ ] **Step 10.2: Verify each migration on korczewski** (mirror Task 9.2)

- [ ] **Step 10.3: Re-grant** (mirror Task 9.3 with `ENV=korczewski`)

- [ ] **Step 10.4: Smoke probe** (`task workspace:verify ENV=korczewski`)

- [ ] **Step 10.5: Commit Phase C**

```bash
git add scripts/datamodel/2026-05-23-audit-phase5-*.sql \
        docs/db-audit/2026-05-23-phase5/findings.md \
        docs/db-audit/2026-05-23-phase5/decision-log.md
git commit -m "chore(db-audit): phase5 additive fixes (indexes, FKs, comments, drift) [T000150]"
git push
```

---

## Task 11: Phase D — DROP candidate approval loop

**Files:** `decision-log.md`, `scripts/datamodel/2026-05-23-audit-phase5-drop-orphans.sql`

> **This task is interactive — pause for user approval per finding.**

- [ ] **Step 11.1: Present DROP candidates to user**

In the chat, post a table listing every DROP candidate from Module 1 (orphans) and Module 2 (cold tables, if eligible):

```
| Finding | Cluster | Schema.Table | Reason | Evidence | Row count |
|---|---|---|---|---|---|
| F-001 | both | public.stripe_customers | matches removed feature "stripe", 0 code refs | ... | 0 |
...
```

Ask via `AskUserQuestion`: per-item approval (approve / skip / defer-to-future-phase). Use multiSelect=true so user can batch-approve.

- [ ] **Step 11.2: For each approved DROP**

```bash
# Backup BOTH clusters first
task workspace:backup --context mentolder
task workspace:backup --context korczewski

# Record backup timestamps in decision-log.md
```

- [ ] **Step 11.3: Append to `drop-orphans.sql`**

```sql
BEGIN;
DROP TABLE IF EXISTS <schema>.<table> CASCADE;
COMMIT;
```

- [ ] **Step 11.4: Apply on mentolder → verify → korczewski → verify**

```bash
task workspace:psql ENV=mentolder -- website < scripts/datamodel/2026-05-23-audit-phase5-drop-orphans.sql
task workspace:psql ENV=mentolder -- website -c "SELECT count(*) FROM <schema>.<table>;" 2>&1 | grep "does not exist"
# repeat for korczewski
```

- [ ] **Step 11.5: Update `decision-log.md`**

| Finding | Decision | Approver | Backup ref | Applied at |
|---|---|---|---|---|
| F-001 | approved | patrick | mentolder:2026-05-23T15:01Z, korczewski:2026-05-23T15:03Z | 15:05Z mentolder, 15:07Z korczewski |

- [ ] **Step 11.6: Commit Phase D**

```bash
git add scripts/datamodel/2026-05-23-audit-phase5-drop-orphans.sql \
        docs/db-audit/2026-05-23-phase5/decision-log.md \
        docs/db-audit/2026-05-23-phase5/findings.md
git commit -m "chore(db-audit): phase5 approved DROPs [T000150]"
git push
```

If user defers all DROPs, this task skips the SQL file entirely (no empty commit).

---

## Task 12: Phase E — Regenerate ER diagram

**Files:** `docs/db-schema-diagram.md` (regenerated)

- [ ] **Step 12.1: Run the diagram task**

```bash
task db:diagram ENV=mentolder
```

This re-runs `scripts/db-schema-diagram.py` against live mentolder shared-db and rewrites `docs/db-schema-diagram.md`.

- [ ] **Step 12.2: Sanity-check the diff**

```bash
git diff docs/db-schema-diagram.md | head -100
```

Expect: removed entries for any DROP'd tables, added entries for any new structures, updated FK/index lists.

- [ ] **Step 12.3: Commit Phase E**

```bash
git add docs/db-schema-diagram.md
git commit -m "chore(db-audit): phase5 regenerate ER diagram [T000150]"
git push
```

---

## Task 13: Final verify + PR

**Files:** none changed

- [ ] **Step 13.1: Run cross-cluster verify**

```bash
task workspace:verify:all-prods
```
Must be green.

- [ ] **Step 13.2: Tail logs for 2 minutes**

```bash
timeout 120 task workspace:logs ENV=mentolder -- website 2>&1 | tee /tmp/logs-mentolder.log
timeout 120 task workspace:logs ENV=korczewski -- website 2>&1 | tee /tmp/logs-korczewski.log
```
Look for: schema-not-found errors, column-does-not-exist, FK violations. If any → roll back the offending migration on both clusters and update findings.

- [ ] **Step 13.3: Open PR**

```bash
gh pr create \
  --title "chore(db): audit phase 5 — runtime-informed cleanup + best-practice fixes [T000150]" \
  --body "$(cat <<'BODY'
## Summary
- Phase 5 of the multi-phase DB audit. Continuation of Phases 1-4.
- Read-only audit on both shared-db clusters → findings report (`docs/db-audit/2026-05-23-phase5/findings.md`).
- Applied autonomous additive fixes: FK indexes, FK constraints (NOT VALID), NOT NULL where safe, table/column comments, cold-index drops (where stats_reset eligible), cross-cluster drift fixes.
- Applied user-approved DROPs (per `decision-log.md`) for orphaned tables tied to removed features.
- Regenerated `docs/db-schema-diagram.md` against live mentolder.

## Test plan
- [x] `task workspace:verify:all-prods` green
- [x] 2-min log tail on both clusters — no schema errors
- [x] DROP candidates backed up before removal (timestamps in decision-log.md)
- [x] Both clusters in sync per `evidence/drift.json` regenerated post-changes
BODY
)"
```

- [ ] **Step 13.4: Auto-merge per user PR workflow**

```bash
gh pr merge --squash --delete-branch --auto
```
(`--auto` waits for CI green before merge.)

---

## Task 14: Post-execution

- [ ] **Step 14.1: Run skill-orchestrator post**

```bash
bash scripts/skill-orchestrator.sh .claude/skills/dev-flow-execute/SKILL.md post
```

This invokes `mishap-tracker` to ticket any side-quest anomalies caught during execution.

- [ ] **Step 14.2: Update parent ticket status**

```sql
UPDATE tickets.tickets SET status='resolved' WHERE external_id='T000150';
```

---

## Risks & Rollback

Per spec Section 8. Rollback per migration:
- Additive indexes: `DROP INDEX IF EXISTS <name>`
- Additive constraints: `ALTER TABLE ... DROP CONSTRAINT IF EXISTS <name>`
- NOT NULL added: `ALTER TABLE ... ALTER COLUMN <col> DROP NOT NULL`
- Comments: re-set to NULL via `COMMENT ON ... IS NULL`
- DROP'd tables: restore from the recorded backup timestamp in `decision-log.md`

For full rollback of the whole audit: `git revert <merge-commit>` plus restore from the latest pre-Phase-D backup on each cluster.

---

## Acceptance criteria

(From spec Section 6 — re-stated for plan tracking)

- [ ] `findings.md` exists with every finding scored, evidenced, and SQL'd
- [ ] All autonomous findings show ✅ ✅ on both clusters
- [ ] All approval findings either applied (with decision-log entry) or recorded as skipped
- [ ] `docs/db-schema-diagram.md` matches live schema
- [ ] `task workspace:verify:all-prods` green
- [ ] 5-minute log tail clean on both clusters
- [ ] PR merged via squash
- [ ] `mishap-tracker` invoked
