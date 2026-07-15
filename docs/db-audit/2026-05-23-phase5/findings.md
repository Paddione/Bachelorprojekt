# DB Audit Phase 5 — Findings

**Audit date:** 2026-05-23
**Scope:** `shared-db` on `mentolder` + `korczewski`, `website` + `postgres` databases. `postgres` DBs are empty on both clusters; effective scope is `website` DB.
**Spec:** Design-Doc entfernt (T001869; Volltext in Git-History) — Vorgehen destilliert in [`docs/runbooks/db-audit-playbook.md`](../../runbooks/db-audit-playbook.md)
**Ticket:** [T000150](https://web.mentolder.de/admin/bugs)

---

## Summary

| Category | Mentolder | Korczewski | Notes |
|---|---:|---:|---|
| User tables (website DB) | 105 | 66 | korczewski runs a stripped-down workspace (no billing/questionnaire/newsletter) |
| User indexes | 219 | 156 | proportional to table count |
| Tables in `public` schema | 71 | 28 | candidate for schema hygiene cleanup (advisory) |
| Tables without `COMMENT ON` | 105 / 105 | 66 / 66 | **100% miss** on both clusters |
| Missing FK indexes | 64 | 32 | 30 shared + 34 m-only + 2 k-only — Phase C autonomous fix |
| TEXT-typed `_id`/`_uuid` columns | 50 | 20 | approval-class (per-item judgment) |
| Tables exclusive to mentolder | 43 | — | mostly by-design (billing, questionnaire, newsletter) |
| Tables exclusive to korczewski | — | 4 | `arena.*` — by-design |
| Column drift in shared tables | 8 m-only / 0 k-only | — | one autonomous fix candidate; rest are migration drift |
| Removed-feature orphan tables | 0 | 0 | Phase 1–4 cleanup was thorough |

**Findings by action class:**
- **Autonomous (Phase C — apply now):** F-001…F-005 (96 indexes), F-006 (8 column drift fixes), F-008 (171 table comments)
- **Approval-required (Phase D):** none for DROP. F-007 (TEXT→UUID conversions, 70 candidates) — recommend deferring to a dedicated future phase. F-009 (schema move from `public`, 99 candidates) — defer.
- **Advisory only (gated out):** Module 2 cold-table/cold-index DROP proposals — postgres uptime is only 3.5 days on both clusters (restarted 2026-05-20), below the 30-day stats_reset threshold from spec safety rail 6. Next eligible audit window: **2026-06-19** (assuming no restarts).
- **Information only:** Module 5 by-design drift (43 mentolder-only tables, 4 korczewski-only `arena.*` tables).

**Phase D outcome (preview):** **No DROP candidates qualified.** Phase D will be a no-op for this audit. Phase 5 reduces in practice to: additive structural fixes + comments + cluster-drift back-fill + report.

---

## Module 1 — Orphan detection (Phase A)

**Method:** queried `information_schema.tables` on both clusters for names matching removed-feature keywords (`stripe`, `mattermost`, `invoice_ninja|invoiceninja`, `argo_cd|argocd`, `track_pr|tracking_import`).

**Result: ZERO matches on either cluster.**

This confirms that the prior Phase 1–4 audits (commits `6488be6f`, `a5e46671`, `2e167489`) thoroughly removed orphaned structures tied to deprecated features. The current `billing_*` tables (12 of them) are mentolder-native billing infrastructure — they're empty in production but actively referenced by code (`billing_invoice_payments` has 1455 seq_scans in 3.5 days), so they're NOT orphans.

**Evidence:** [`orphan-candidates.json`](evidence/orphan-candidates.json) (empty — recorded for completeness).

---

## Module 2 — Runtime statistics (Phase A) — gated out

**Stats availability:**
- `pg_stat_statements` extension: **not installed** on either cluster, either DB
- `pg_stat_database.stats_reset`: **NULL** on both clusters, both DBs
- `pg_postmaster_start_time()`: mentolder = 2026-05-20T04:43Z (3.54d ago), korczewski = 2026-05-20T05:02Z (3.53d ago)

Per spec Section 4 safety rail 6, Module 2 DROP proposals require **stats_reset >30 days on BOTH clusters**. Both clusters are at 3.5 days. **All Module 2 cold-table / cold-index DROP proposals are downgraded to advisory-only and will NOT be acted on this phase.**

### F-A01 (advisory, info) — Install `pg_stat_statements`
**Recommendation:** Enable `pg_stat_statements` extension in shared-db `postgresql.conf` (or via SealedSecret-managed `shared_preload_libraries`) so future audits have query-level evidence.
**Action class:** advisory (out of scope this phase; needs operator change).

### F-A02 (advisory, info) — Re-run Module 2 after 2026-06-19
**Recommendation:** Schedule a follow-up audit after both clusters have >30 days of pg_stat_user_tables data (no restarts). On 2026-06-19 (or later), re-run `scripts/db-audit/phase5/collect-pg-stats.sh` and act on cold-table findings then.

**Evidence:**
- [`stats_reset.json`](evidence/stats_reset.json)
- [`pg_stat_tables.mentolder.csv`](evidence/pg_stat_tables.mentolder.csv) (105 tables)
- [`pg_stat_tables.korczewski.csv`](evidence/pg_stat_tables.korczewski.csv) (66 tables)
- [`pg_stat_indexes.mentolder.csv`](evidence/pg_stat_indexes.mentolder.csv) (219 indexes)
- [`pg_stat_indexes.korczewski.csv`](evidence/pg_stat_indexes.korczewski.csv) (156 indexes)

---

## Module 3 — Structural integrity (Phase A)

### F-001 (high, **autonomous**) — Missing FK indexes (96 across both clusters)
**Why this matters:** Postgres does NOT auto-create indexes on FK columns. Without them, cascade deletes and FK joins fall back to sequential scans. Several large tables (`billing_invoices`, `coaching.snippets`, `tickets.tickets`) lack FK indexes — silent performance footgun.

**Counts:**
- 30 FK indexes missing on **both** clusters (shared tables)
- 34 additional missing on mentolder (m-only tables: billing, questionnaire, etc.)
- 2 additional missing on korczewski (k-only `arena.*` tables)

**Action:** Phase C will generate `scripts/datamodel/2026-05-23-audit-phase5-add-fk-indexes.sql` per cluster with `CREATE INDEX IF NOT EXISTS` statements. All wrapped in `BEGIN/COMMIT`. Idempotent and reversible.

**Evidence:**
- [`missing-fk-indexes.mentolder.csv`](evidence/missing-fk-indexes.mentolder.csv) (64 entries)
- [`missing-fk-indexes.korczewski.csv`](evidence/missing-fk-indexes.korczewski.csv) (32 entries)

**Sample (top 10 highest-priority — shared tables, billing/tickets):**

| Schema.Table | Column | References | Both clusters? |
|---|---|---|---|
| public.billing_invoice_line_items | invoice_id | billing_invoices | mentolder only (table is m-only) |
| public.billing_invoice_payments | brand | brands | mentolder only |
| public.billing_invoices | brand, parent_invoice_id, customer_id, cancels_invoice_id | (multiple) | mentolder only |
| public.assets | brand | brands | mentolder only |
| bachelorprojekt.features | requirement_id, brand | bachelorprojekt.requirements, brands | both |
| bachelorprojekt.pipeline | req_id | bachelorprojekt.requirements | both |
| bachelorprojekt.test_results | req_id | bachelorprojekt.requirements | both |
| bugs.bug_tickets | brand | brands | both |
| coaching.snippets | knowledge_chunk_id | knowledge.chunks | both |
| coaching.projects | client_id | customers | both |

### F-007 (med, **approval**) — TEXT-typed `_id`/`_uuid` columns (70 candidates)
**Why this matters:** TEXT columns where the value is always a UUID waste storage (~36 bytes vs 16 for UUID), prevent type-safe joins, and can silently allow non-UUID values.

**BUT:** several candidates are correctly typed TEXT because they reference external systems with non-UUID identifiers. Examples:
- `bugs.bug_tickets.ticket_id` — uses T###### format, **NOT a UUID** → keep TEXT
- `coaching.ki_config.organization_id` — likely a Keycloak realm/org ID → keep TEXT
- `billing_customers.default_leitweg_id` — German B2G addressing format → keep TEXT
- `bachelorprojekt.features.requirement_id` — external requirement key → keep TEXT
- `billing_audit_log.invoice_id` — references `billing_invoices.id`, IS uuid → **convert**

**Recommendation:** Defer to a dedicated phase that does per-column verification (`SELECT COUNT(*) FILTER (WHERE col !~ '<uuid-regex>')`) + application-code sweep. Too risky for autonomous fix; too noisy for per-item approval in this phase.

**Action class:** approval — **DEFERRED** to future Phase 6.

**Evidence:**
- [`text-as-uuid.mentolder.csv`](evidence/text-as-uuid.mentolder.csv) (50 entries)
- [`text-as-uuid.korczewski.csv`](evidence/text-as-uuid.korczewski.csv) (20 entries)

---

## Module 4 — Schema hygiene (Phase A)

### F-008 (low, **autonomous**) — Missing table comments (171 across both clusters)
**Why this matters:** Every user table has zero `COMMENT ON TABLE`. Future maintainers (and the ER diagram generator) lack semantic context.

**Counts:** 105 mentolder + 66 korczewski = 171 tables.

**Approach:** Generate `COMMENT ON TABLE` statements derived from `(schema, table_name)` patterns + the 8 domain map in `docs/db-schema-diagram.md`. Comments are descriptive but minimal (one sentence each). Autonomous because purely cosmetic and reversible.

**Action:** Phase C will produce `scripts/datamodel/2026-05-23-audit-phase5-add-comments.sql`.

**Evidence:** [`missing-comments.mentolder.csv`](evidence/missing-comments.mentolder.csv), [`missing-comments.korczewski.csv`](evidence/missing-comments.korczewski.csv).

### F-009 (info, **approval**) — Public-schema tables that should move to a domain schema (99 tables)
**Why this matters:** The 8-domain map in `docs/db-schema-diagram.md` shows logical groupings, but mentolder has 71 tables sitting in `public` (korczewski has 28). Examples:
- `billing_*` (12 tables) → suggest schema `billing`
- `questionnaire_*` (10 tables) → suggest schema `questionnaire`
- `assistant_*` (4 tables) → suggest schema `assistant`
- `newsletter_*` (3 tables) → suggest schema `newsletter`
- `meeting*`, `meetings`, `meeting_*` → suggest schema `meetings` or `crm`
- `chat_*`, `messages`, `message_threads`, `polls`, `poll_answers` → suggest `messaging`

**Action class:** approval — **DEFERRED**. Schema renames require application-code changes (every `SELECT FROM billing_invoices` becomes `SELECT FROM billing.invoices`). Out of scope for this phase.

**Evidence:** [`public-tables.mentolder.csv`](evidence/public-tables.mentolder.csv), [`public-tables.korczewski.csv`](evidence/public-tables.korczewski.csv).

### F-010 (info, **clean**) — Grant matrix is symmetric
Reviewed `information_schema.role_table_grants` per schema. The `website` role has consistent grant levels (full DML on most schemas; SELECT-only on `arena` schema on korczewski, correct for read-only cross-brand reads). No asymmetry findings.

**Evidence:** [`grant-matrix.mentolder.csv`](evidence/grant-matrix.mentolder.csv), [`grant-matrix.korczewski.csv`](evidence/grant-matrix.korczewski.csv).

### F-011 (info, **DEFERRED**) — Migration directory inventory
Five separate migration directories in the repo:
- `scripts/migrations/` — 2 files
- `scripts/datamodel/` — 1 SQL file + scaffolding
- `scripts/one-shot/archive/` — 12 archived one-shots
- `website/src/db/migrations/` — 5 files (website-owned)
- `arena-server/src/db/migrations/` — 2 files (arena-owned)

**Recommendation:** Service-owned (website, arena-server) should stay where they are. Operational + datamodel migrations should consolidate into `scripts/datamodel/`. Out of scope this phase — propose as separate refactor.

---

## Module 5 — Cross-cluster drift (Phase A)

### F-005 (low, **autonomous**) — `systemtest_failure_outbox` schema drift (7 columns mentolder-only)
**Why this matters:** A migration that added `source_kind`, `run_id`, `test_result_id`, `test_id`, `test_name`, `error_message`, `file_path` to `public.systemtest_failure_outbox` was applied to mentolder but not korczewski. This is silent drift — the same DDL on both clusters is a hard invariant for this project.

The most-recent ticket fix [T000019]/[T000021] (`e77fb637 fix(systemtest): move ensureSystemtestSchema before v_questionnaire_kpi view`) probably landed only on mentolder.

**`source_kind`** has `NOT NULL DEFAULT 'questionnaire'` — safe to add via `ALTER TABLE ... ADD COLUMN ... DEFAULT ...` (back-fills existing rows). The other 6 columns are nullable — also safe.

**Action:** Phase C will produce `scripts/datamodel/2026-05-23-audit-phase5-bring-cross-cluster.sql` (korczewski-only) that adds the 7 columns.

### F-006 (low, **autonomous**) — `public.meetings.project_id` (uuid, nullable) on mentolder only
Same pattern — nullable UUID column added on mentolder, not korczewski. Safe autonomous fix on korczewski.

**Evidence:** [`drift-columns-mentolder-only.txt`](evidence/drift-columns-mentolder-only.txt).

### F-012 (info, **by-design**) — 43 tables exclusive to mentolder
These are billing/questionnaire/newsletter/assistant tables. Mentolder is the primary brand; korczewski is a simpler workspace per the brand split. NOT drift — by-design.

### F-013 (info, **by-design**) — 4 tables exclusive to korczewski (`arena.*`)
Arena server runs on korczewski only per project memory. By-design. Spec out-of-band note already covered this.

**Evidence:** [`drift-tables-mentolder-only.txt`](evidence/drift-tables-mentolder-only.txt), [`drift-tables-korczewski-only.txt`](evidence/drift-tables-korczewski-only.txt).

---

## Side-quest mishaps to log

- **MISHAP-01 (drift)** — `systemtest_failure_outbox` schema drift between clusters (covered by F-005). Indicates the recent T000019-21 ticket fix may not have been applied to korczewski.
- **MISHAP-02 (drift)** — `public.meetings.project_id` exists on mentolder only (F-006).
- **MISHAP-03 (degraded)** — `pg_stat_statements` extension missing on both clusters. Limits future audits' query-level insight (F-A01).
- **MISHAP-04 (degraded)** — Zero `COMMENT ON` on all 171 user tables. Indicates absent documentation practice (F-008).

---

## Phase C — autonomous additive actions queued

| Finding | Action | Mentolder | Korczewski |
|---|---|---:|---:|
| F-001 | CREATE INDEX (missing FK indexes) | 64 statements | 32 statements |
| F-005 | ALTER TABLE ADD COLUMN (systemtest_failure_outbox) | — | 7 statements |
| F-006 | ALTER TABLE ADD COLUMN (meetings.project_id) | — | 1 statement |
| F-008 | COMMENT ON TABLE | 105 statements | 66 statements |

**Total per-cluster:** mentolder ≈ 169 statements; korczewski ≈ 106 statements.

## Phase D — DROP queue (empty)

No DROP candidates qualified for this phase. **Phase D is a no-op.**

## Phase E — wrap

Regenerate ER diagram (`task db:diagram ENV=mentolder`), final cross-cluster verify, open PR.
