# DB Audit Phase 5 — Design Spec

**Date:** 2026-05-23
**Branch:** `chore/db-audit-phase5-2026-05-23`
**Status:** Draft (awaiting user review)
**Predecessors:** Phase 1 (`6488be6f` denormalized text cleanup), Phase 2 (`a5e46671` brands + FKs), Phase 3+4 (`2e167489` billing cleanup)
**Scope:** `shared-db` on both `mentolder` and `korczewski` clusters — `website` + `postgres` databases only. Vendor DBs (keycloak, nextcloud, vaultwarden, docuseal) are explicitly out of scope for structural changes.

---

## Overview

Continuation of the multi-phase DB audit. Goal: **identify and remove unneeded database structures, and bring existing structures up to best practice**, with empirical evidence (`pg_stat_user_*`) as the primary basis for "unneeded" claims so DROP decisions are defensible.

This phase combines five detection modules into a single read-only audit pipeline that produces a Markdown findings report and a set of additive SQL migrations. DROPs are gated on explicit per-item user approval after the report lands.

---

## 1. Motivation & non-goals

### Motivation

- **Known feature removals left orphans.** Stripe, ArgoCD, Mattermost, InvoiceNinja, the `tracking-import` CronJob (PR #788), and other deprecated features are gone from code but their tables may still exist.
- **Schema sprawl.** Migrations live in five separate directories (`scripts/migrations/`, `scripts/datamodel/`, `scripts/one-shot/archive/`, `website/src/db/migrations/`, `arena-server/src/db/migrations/`). Without a convention, finding "where does table X live?" is slow.
- **Cluster drift risk.** mentolder and korczewski each have their own `shared-db`. Earlier ticket fixes ([T000010], [T000019-21], [T000027-28], [T000077]) and the documented gotcha about scripts hardcoding `-n workspace` show this drift is real and recurring.
- **Best-practice gaps.** Postgres does not auto-create indexes on FK columns; large tables without supporting indexes silently degrade cascade deletes and joins.

### Non-goals

- No structural changes to vendor-managed schemas (keycloak, nextcloud, vaultwarden, docuseal).
- No migration of data between tables (refactor-level work is out of scope).
- No renames of existing tables/columns (touches application code; defer to a future phase).
- No grant/role changes for Keycloak realm roles (separate `keycloak-realm-sync` skill handles those).

---

## 2. Detection modules

Each module is a self-contained set of queries + analysis. All run read-only.

### Module 1 — Orphan detection (feature-removal aware)

**Input:** known feature-removal list + live `information_schema.tables` + code grep.

Known removed features (from memory + git history):
- **Stripe** — payments, subscriptions, customer billing identifiers
- **InvoiceNinja** — invoicing tables
- **Mattermost** — chat/message tables
- **ArgoCD** — `argocd` schema or ArgoCD-tracking tables (PR #782)
- **`tracking-import` CronJob** (PR #788) — last PR tracked was #787; check `v_timeline` source tables
- **DocuSeal billing-doc tables** — partially removed in Phase 3/4 (`2e167489`)

**Method:**
1. For each removed feature, derive a list of likely table-name prefixes/keywords (e.g. `stripe_*`, `invoice_*`, `mattermost_*`).
2. Query `information_schema.tables` for matches on each cluster.
3. For each match, grep across `website/src/`, `arena-server/src/`, `brett/`, `scripts/`, `k3d/`, `prod*/` for table-name references.
4. A table is an **orphan candidate** if: name matches a removed feature OR has zero code references in tracked source files.

**Output:** `evidence/orphan-candidates.json` (list of `{cluster, schema, table, feature, code_refs, ddl_size_bytes, row_count}`).

**Action class:** `approval` (DROP).

### Module 2 — Runtime statistics

**Input:** live `pg_stat_user_tables`, `pg_stat_user_indexes`, `pg_stat_statements` (if enabled), `pg_stat_database` (for `stats_reset` timestamp).

**Method:** snapshot stats from each cluster's `shared-db` pod via `task workspace:psql ENV=<env>`. Record:
- `n_live_tup`, `n_dead_tup`, `seq_scan`, `seq_tup_read`, `idx_scan`, `n_tup_ins/upd/del`, `last_*` timestamps per table.
- `idx_scan`, `idx_tup_read`, `idx_tup_fetch` per index.
- `stats_reset` timestamp from `pg_stat_database` (interpret zero-read findings against this).

**Tiering:**
- **Cold table** = `idx_scan == 0` AND `seq_scan <= 5` AND `n_live_tup > 0` AND `stats_reset` was >30 days ago → DROP candidate.
- **Cold index** (non-PK, non-UNIQUE) = `idx_scan == 0` AND `stats_reset` was >30 days ago → autonomous DROP (cold index drops are reversible — re-create from DDL if regression detected).
- **Empty table** = `n_live_tup == 0` AND `n_tup_ins == 0` for >30 days → strong DROP candidate.
- **Hot table without index** = `seq_tup_read > 100k` AND no matching index → propose CREATE INDEX (autonomous).

**Output:**
- `evidence/pg_stat_tables.<cluster>.csv`
- `evidence/pg_stat_indexes.<cluster>.csv`
- `evidence/stats_reset.json` (per-cluster timestamp + interpretation gate)

**Action class:** mixed (cold indexes = `autonomous`, cold tables = `approval`).

> **Caveat:** If `stats_reset` is <30 days on either cluster, Module 2 findings are advisory only — flagged in the report but no DROPs proposed.

### Module 3 — Structural integrity

**Input:** `information_schema.columns`, `information_schema.table_constraints`, `pg_indexes`.

**Checks:**
- **Missing FK indexes.** For each FK column without a supporting index → propose `CREATE INDEX`.
- **TEXT-for-UUID.** Columns named `*_id` or `*_uuid` typed `TEXT` where 100% of non-null values match the UUID regex → propose `ALTER COLUMN TYPE UUID USING ...::uuid`. (Application impact: usually transparent for read paths; mark as `approval` because of write-path risk.)
- **Missing NOT NULL.** Columns with `is_nullable = 'YES'` but where `COUNT(*) FILTER (WHERE col IS NULL) == 0` → propose `ALTER COLUMN SET NOT NULL`. Autonomous if row count > 0 and zero nulls observed.
- **Missing FK constraints.** Columns named `*_id` whose values are a strict subset of `<other_table>.id` → propose `ADD CONSTRAINT ... FOREIGN KEY`. Autonomous only if the candidate target is unambiguous (single matching table). Otherwise → report.
- **Redundant indexes.** Two indexes covering the same column prefix → propose dropping the narrower (autonomous after stat-read tier check).
- **Bloated indexes.** `pgstattuple` checks where extension is available (skip otherwise) → report only.

**Output:** `evidence/structural-findings.json`.

**Action class:** mostly `autonomous`; TEXT→UUID and ambiguous-FK = `approval`.

### Module 4 — Schema hygiene

**Input:** `information_schema.tables`, role inventory from `pg_roles`/`pg_class`.

**Checks:**
- **Tables in `public` that belong in a domain schema.** Compare table names against the 8 domains in `docs/db-schema-diagram.md`. A table in `public` whose name pattern matches a domain (e.g. `coaching_*`) → propose moving to that schema. **Action class: `approval` because schema moves require app-code updates.**
- **Missing comments.** Tables/columns without `COMMENT ON` → propose comments based on column name + domain context. Autonomous (purely cosmetic).
- **Role grant matrix.** For each schema, list which roles have which grants; flag asymmetry vs sibling schemas (e.g. `tickets` schema granted to `website` role on mentolder but not korczewski). Cross-cluster drift goes to Module 5; same-cluster gaps → autonomous re-grant.
- **Migration directory drift.** Inventory all SQL files across the 5 migration dirs and propose a canonical home (likely `scripts/datamodel/` for shared-db structure, keep per-service `*/src/db/migrations/` for service-owned). Report only — actual migration is too risky for this phase.

**Output:** `evidence/grant-matrix.csv`, `evidence/schema-hygiene.json`, `evidence/migration-inventory.md`.

**Action class:** mixed.

### Module 5 — Cross-cluster drift

**Input:** `information_schema.{tables, columns, table_constraints, key_column_usage}` from BOTH clusters.

**Method:** side-by-side diff of:
- Table set: `mentolder ∆ korczewski`
- Per shared table: column set diff, column type diff, NOT NULL diff
- Constraint diff (PK, FK, CHECK, UNIQUE)
- Index diff

**Tiering:**
- **One-sided table** (present on one cluster only) → report; if the cluster lacking it has not had it for >30 days, propose CREATE TABLE migration to bring it across. **Action class: `approval`** (could be intentional cluster-specific feature; korczewski has separate `arena` schema, mentolder does not).
- **Column added on one side** → propose ADD COLUMN on the other side. Autonomous if the column is nullable or has a default; approval if NOT NULL without default.
- **Type mismatch** → report only (resolution needs deliberation).
- **Missing index/constraint on one side** → autonomous re-create.

**Output:** `evidence/drift.json`.

**Action class:** mostly `approval` for tables/columns, `autonomous` for index/grant re-creation.

---

## 3. Output deliverables

```
docs/db-audit/2026-05-23-phase5/
├── README.md                          # Index + summary metrics + how to read
├── findings.md                        # The full categorized report
├── decision-log.md                    # Per-DROP approval record (filled during execution)
└── evidence/
    ├── pg_stat_tables.mentolder.csv
    ├── pg_stat_tables.korczewski.csv
    ├── pg_stat_indexes.mentolder.csv
    ├── pg_stat_indexes.korczewski.csv
    ├── stats_reset.json
    ├── orphan-candidates.json
    ├── structural-findings.json
    ├── schema-hygiene.json
    ├── migration-inventory.md
    ├── grant-matrix.csv
    └── drift.json
scripts/datamodel/
├── 2026-05-23-audit-phase5-add-fk-indexes.sql
├── 2026-05-23-audit-phase5-add-fk-constraints.sql
├── 2026-05-23-audit-phase5-add-not-null.sql
├── 2026-05-23-audit-phase5-add-comments.sql
├── 2026-05-23-audit-phase5-cold-index-drops.sql    # autonomous cold index drops
├── 2026-05-23-audit-phase5-bring-cross-cluster.sql # auto-fixable drift
└── 2026-05-23-audit-phase5-drop-orphans.sql        # only after approval
docs/db-schema-diagram.md                            # regenerated at end
```

### `findings.md` entry format

Each finding gets one section like:

```markdown
### F-014 · [med] · Module 3 · autonomous
**Title:** Missing FK index on `tickets.tickets.parent_ticket_id`
**Clusters:** mentolder ✅ korczewski ✅
**Evidence:** `tickets.tickets` has FK `parent_ticket_id → tickets.tickets(id)` but no index. Cascade-delete on a parent ticket currently triggers a sequential scan (62k rows on mentolder, 18k on korczewski).
**Proposed SQL:**
\`\`\`sql
CREATE INDEX IF NOT EXISTS idx_tickets_parent_ticket_id
  ON tickets.tickets(parent_ticket_id);
\`\`\`
**Rollback:** `DROP INDEX IF EXISTS tickets.idx_tickets_parent_ticket_id;`
**Status:** Pending → Applied (mentolder 14:22 UTC, korczewski 14:24 UTC)
```

DROP findings additionally include `**Approval:** required` and a `**Backup ref:**` slot filled in after backup completes.

---

## 4. Safety rails

1. **Cluster context guard.** Every psql invocation goes through `task workspace:psql ENV=<env>`. The skill never calls `kubectl` without explicit ENV mapping.
2. **Transactional + idempotent.** All migrations wrap in `BEGIN; ... COMMIT;` and use `IF EXISTS` / `IF NOT EXISTS`. Re-running a migration is a no-op.
3. **Backup before DROP.** `task workspace:backup` runs on each cluster BEFORE its corresponding DROP migration; backup timestamp is recorded in `decision-log.md`. Order: backup-mentolder → drop-mentolder → verify-mentolder → backup-korczewski → drop-korczewski → verify-korczewski.
4. **Verification per migration.** After each migration on each cluster:
   - `\d <object>` to confirm DDL state
   - For DROPs: `SELECT count(*) FROM removed_table` confirms 42P01 (table does not exist)
   - `task workspace:verify ENV=<env>` smoke probe runs after the migration batch
5. **Re-grant after schema work.** Any `CREATE TABLE` or schema-level change triggers `task workspace:fix-tickets-grants ENV=<env>` (or its generalized cousin) to keep service roles aligned.
6. **Stats-reset gate.** Module 2 DROP proposals require `stats_reset` to be >30 days old on BOTH clusters; otherwise the finding is downgraded to "advisory — insufficient data".
7. **Both clusters or neither.** A migration that succeeds on mentolder but fails on korczewski must be rolled back on mentolder (or the divergence escalated to the user immediately — there is no "we'll fix korczewski later" state in this phase).
8. **ER diagram regeneration.** `task db:diagram ENV=mentolder` runs at the end; the regenerated `docs/db-schema-diagram.md` is committed in the same PR.
9. **Mishap tracker hooked in.** Every anomaly noticed during the audit (unexpected pod state, dead grants, stuck pg_stat counter, drifted schema versions) is logged to `MISHAP_LOG` and ticketed at the end.

---

## 5. Execution plan summary

The full implementation plan is generated separately via `writing-plans` / `dev-flow-plan`. This spec sets the contract:

1. **Phase A — Collect (read-only, parallel both clusters).** Run module 1+2+3+4+5 query batches in parallel against each cluster; write evidence files.
2. **Phase B — Analyze + report.** Single-pass aggregation of evidence into `findings.md`. Commit the report alone first ("report-only" commit) so the audit is reviewable independent of any change.
3. **Phase C — Apply autonomous additive fixes.** Fan out one migration file per category. For each: apply mentolder → verify → apply korczewski → verify → re-grant if needed. Commit per category.
4. **Phase D — DROP approval loop.** Present DROP candidates here in chat. On approval: backup → migrate → verify on both clusters. Update `decision-log.md` per item. Commit per approved DROP (or batched if user prefers).
5. **Phase E — Wrap.** Regenerate ER diagram, run `task workspace:verify:all-prods`, final commit, open PR (`auto-merge` per user PR workflow), invoke `mishap-tracker`.

Each phase is its own commit so the PR diff is reviewable category-by-category.

---

## 6. Acceptance criteria

- [ ] `docs/db-audit/2026-05-23-phase5/findings.md` exists and lists every finding with: id, severity, module, action class, evidence excerpt, proposed SQL, rollback note.
- [ ] All `autonomous` findings applied to BOTH clusters; status table in `findings.md` shows ✅ ✅ per item.
- [ ] All `approval` findings either applied (with `decision-log.md` entry) or explicitly skipped (with reason recorded).
- [ ] `docs/db-schema-diagram.md` regenerated and matches live schema on both clusters.
- [ ] `task workspace:verify:all-prods` returns green after all changes.
- [ ] No application errors visible in `task workspace:logs ENV=<env> -- website` for 5 minutes post-deploy.
- [ ] PR opened, CI green, merged via squash.
- [ ] `mishap-tracker` invoked at end; any side-quest findings ticketed.

---

## 7. Open questions / decisions deferred

- **Migration directory consolidation** (Module 4) — report only in this phase. A follow-up phase can act on it once the inventory is in hand.
- **TEXT → UUID conversions** (Module 3) — flagged as `approval` per-item; user may want to defer all of these to a separate dedicated PR with extra app-side test coverage.
- **Schema moves from `public` → domain schemas** (Module 4) — `approval`; could be deferred to a future phase that also updates application code.
- **`pg_stat_statements`** — assumed available on both clusters. If not enabled, Module 2 falls back to `pg_stat_user_tables` only (less granular but sufficient for cold-table detection).

---

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| DROP table that turns out to have a quiet consumer (e.g. cron job, manual SQL script) | Pre-DROP backup; cold-table criteria requires zero idx_scan AND ≤5 seq_scan over 30+ days; user approval gate |
| Mentolder/korczewski drift gets worse during audit | Phase C runs strictly serially per migration; abort on first failure |
| Long-running scan locks production | All read queries use `SET statement_timeout = '30s'`; use `LOCK TABLE` only inside short transactions for DROPs |
| pg_stat counters reset mid-audit (e.g. pod restart) | Snapshot `stats_reset` first; abort Module 2 DROP proposals if reset happens mid-flight |
| Vendor schema accidentally touched | All queries filter `WHERE table_catalog IN ('website','postgres')`; migrations target named schemas only |
| Cross-session conflicts (parallel Claude) | Working in isolated git worktree; spec/plan/branch on dedicated `chore/db-audit-phase5-2026-05-23` |

---

## 9. Out-of-band notes

- Memory record `project_anthropic_key_rotation.md` (2026-05-12) flags an invalid Anthropic API key on mentolder — this audit does NOT depend on LLM calls, so unaffected.
- The recently-added `bachelorprojekt` and `superpowers` schemas (per Phase 1-4) are in scope.
- The `arena` schema is korczewski-only by design — this will surface as a Module 5 finding but is **expected drift** and gets a "ignore: by-design" flag in the report.
