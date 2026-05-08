# Unified Ticketing PR2/5 — features + requirements migration, PR ledger rename

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move thesis requirements (`bachelorprojekt.requirements`) into `tickets.tickets` (type='feature'), rename the PR ledger (`bachelorprojekt.features` → `tickets.pr_events`), and rebuild `bachelorprojekt.v_timeline` as a view over the new tables — all without breaking the Kore homepage timeline or the tracking-import cronjob.

**Architecture:** PR1 created the `tickets` schema. PR2 extends it with `tickets.pr_events` (the immutable PR ledger from spec §4) and migrates the two remaining `bachelorprojekt` tables. `bachelorprojekt.requirements`, `bachelorprojekt.features`, and `bachelorprojekt.v_timeline` are recreated as **back-compat views** over the new schema so any straggling reader (or PR3 code in transit) keeps working. `track-pr.mjs` is rewritten to write to `pr_events` + `ticket_links` directly, replacing the `bachelorprojekt.features` insert path.

**Tech Stack:** PostgreSQL 16, Node.js 20 (`pg` driver, ESM `.mjs`), TypeScript (Astro/Svelte website), BATS for unit tests, Playwright for E2E. Existing patterns from PR1 (`scripts/migrate-bugs-to-tickets.mjs`, `website/src/lib/tickets-db.ts`, `website/src/lib/tickets/transition.ts`) are mirrored verbatim.

---

## Why this is bite-sized

PR2 touches one DDL file, one migration script, one ingest script, three test files, and one runbook. It does **not** touch any UI — `/admin/projekte`, `/admin/bugs`, the Kore homepage, and `/api/timeline` keep their current code paths because the back-compat views preserve the column shapes they read.

Hard constraints:
1. **`v_timeline` shape is locked.** `website/src/lib/website-db.ts:76-84` selects `id, day, pr_number, title, description, category, scope, brand, requirement_id, requirement_name` plus joins `merged_at` for ORDER BY. The new view must emit those columns or `/api/timeline` (and the Kore homepage `KoreTimeline.svelte`) breaks.
2. **`tracking-import` cronjob runs every 5 minutes** (`k3d/tracking-import-cronjob.yaml:9`). The deploy → migration race window must be safe — see Task 8 runbook.
3. **Both clusters share migration runs.** Mentolder (`workspace`) and korczewski (`workspace-korczewski`) each have their own `shared-db` and need the migration applied independently.
4. **Deploy must NOT modify `prod/`** — sealed secrets are unchanged.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `website/src/lib/tickets-db.ts` | Modify | Add `tickets.pr_events` table + indexes to `initTicketsSchema()`. |
| `scripts/migrate-tracking-to-tickets.mjs` | Create | Idempotent migration: requirements→tickets, features→pr_events, ticket_links, view rebuilds. Mirrors `migrate-bugs-to-tickets.mjs` shape. |
| `scripts/track-pr.mjs` | Modify | Rewrite `writeRowToDb` to insert into `tickets.pr_events` and link requirements via `tickets.ticket_links` (kind='fixes'). |
| `tests/unit/tickets-tracking-migration.bats` | Create | Verifies migration row counts (requirements→tickets, features→pr_events, links). |
| `tests/unit/tickets-pr-events.bats` | Create | Verifies `tickets.pr_events` schema + back-compat views. |
| `tests/e2e/specs/fa-29-tracking.spec.ts` | Modify | Assert `/api/timeline` returns the same shape post-migration. |
| `docs/superpowers/plans/2026-05-08-unified-ticketing-pr2.md` | Self | This file. |

**No file is created in** `website/src/components/`, `website/src/pages/admin/`, or `prod*/` — UI and prod overlays are untouched.

---

## Task 1: Add `tickets.pr_events` table to `initTicketsSchema`

**Files:**
- Modify: `website/src/lib/tickets-db.ts:248-249` (just before the closing `schemaReady = true` line)

- [ ] **Step 1: Read `tickets-db.ts:1-250` to locate the insertion point.**

The pattern: every table is created via `await pool.query(\`CREATE TABLE IF NOT EXISTS …\`)` followed by `CREATE INDEX IF NOT EXISTS` lines. The new `pr_events` block goes immediately before `schemaReady = true;` so triggers and audit hooks land first.

- [ ] **Step 2: Insert `pr_events` table + indexes.**

Add this block in `website/src/lib/tickets-db.ts` between line 247 (after the `trg_tickets_audit_log` trigger) and line 249 (`schemaReady = true;`):

```ts
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets.pr_events (
      pr_number    INTEGER PRIMARY KEY,
      title        TEXT NOT NULL,
      description  TEXT,
      category     TEXT NOT NULL,
      scope        TEXT,
      brand        TEXT,
      merged_at    TIMESTAMPTZ NOT NULL,
      merged_by    TEXT,
      status       TEXT NOT NULL DEFAULT 'shipped'
                   CHECK (status IN ('planned','in_progress','shipped','reverted')),
      created_at   TIMESTAMPTZ DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS pr_events_merged_at_idx ON tickets.pr_events (merged_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS pr_events_brand_idx     ON tickets.pr_events (brand) WHERE brand IS NOT NULL`);
  await pool.query(`CREATE INDEX IF NOT EXISTS pr_events_category_idx  ON tickets.pr_events (category)`);
```

- [ ] **Step 3: Verify TypeScript still compiles.**

Run: `cd website && npx tsc --noEmit -p tsconfig.json`
Expected: zero errors. (Build step shared with the Astro container — same compiler.)

- [ ] **Step 4: Commit.**

```bash
git add website/src/lib/tickets-db.ts
git commit -m "feat(tickets): add tickets.pr_events table to schema init (PR2/5)"
```

---

## Task 2: Write the migration script `scripts/migrate-tracking-to-tickets.mjs`

**Files:**
- Create: `scripts/migrate-tracking-to-tickets.mjs`

**Pattern source:** `scripts/migrate-bugs-to-tickets.mjs:1-206`. Same `--apply` flag, same idempotency via `EXISTS` check, same `BEGIN`/`COMMIT`/`ROLLBACK` envelope.

- [ ] **Step 1: Create the migration file with the boilerplate (CLI + main()).**

```js
// scripts/migrate-tracking-to-tickets.mjs
//
// PR2/5: Migrates bachelorprojekt.requirements → tickets.tickets (type='feature')
// and bachelorprojekt.features → tickets.pr_events. For each feature row that
// referenced a requirement, writes a tickets.ticket_links row. Renames the
// legacy tables to *_legacy and replaces them with back-compat views over the
// new schema, then rebuilds bachelorprojekt.v_timeline.
//
// Idempotent: detects already-migrated rows by external_id / pr_number.
//
// Usage:
//   node scripts/migrate-tracking-to-tickets.mjs            # dry-run (default)
//   node scripts/migrate-tracking-to-tickets.mjs --apply    # execute changes
//
// Env: TRACKING_DB_URL or WEBSITE_DB_URL (Postgres connection string).
import pg from 'pg';

async function migrate(client, dryRun) {
  const out = { reqsMigrated: 0, reqsSkipped: 0,
                prsMigrated: 0,  prsSkipped: 0,
                linksCreated: 0, linksSkipped: 0 };

  // ── 1. requirements → tickets.tickets (type='feature') ──────────────
  const hasReqs = (await client.query(
    `SELECT to_regclass('bachelorprojekt.requirements') IS NOT NULL AS present`
  )).rows[0].present;
  const reqs = hasReqs ? (await client.query(`
    SELECT id, category, name, description, criteria, test_case, created_at
      FROM bachelorprojekt.requirements
     ORDER BY created_at`)).rows : [];

  // Per spec §9 PR2: status is derived from the latest pipeline.stage if present,
  // else 'backlog'. In practice `bachelorprojekt.pipeline` has never been written
  // to from application code (only DDL), so most rows hit the `backlog` default —
  // but we honor the spec for any manually-seeded stages.
  const STAGE_TO_STATUS = {
    idea:           { status: 'backlog',     resolution: null      },
    implementation: { status: 'in_progress', resolution: null      },
    testing:        { status: 'in_review',   resolution: null      },
    documentation:  { status: 'in_review',   resolution: null      },
    archive:        { status: 'done',        resolution: 'shipped' },
  };

  for (const r of reqs) {
    const exists = await client.query(
      `SELECT id FROM tickets.tickets WHERE external_id = $1`, [r.id]);
    if (exists.rowCount > 0) { out.reqsSkipped++; continue; }
    if (dryRun) { out.reqsMigrated++; continue; }

    // Look up latest pipeline stage; missing pipeline table or no stages → backlog.
    const hasPipeline = (await client.query(
      `SELECT to_regclass('bachelorprojekt.pipeline') IS NOT NULL AS present`
    )).rows[0].present;
    let mapped = { status: 'backlog', resolution: null };
    if (hasPipeline) {
      const stageRow = await client.query(
        `SELECT stage FROM bachelorprojekt.pipeline
          WHERE req_id = $1
          ORDER BY entered_at DESC LIMIT 1`, [r.id]);
      if (stageRow.rowCount > 0) {
        const known = STAGE_TO_STATUS[stageRow.rows[0].stage];
        if (known) mapped = known;
      }
    }

    const desc = [r.description, r.criteria && `\n\nKriterien:\n${r.criteria}`,
                  r.test_case  && `\n\nTestfall:\n${r.test_case}`]
                  .filter(Boolean).join('');
    await client.query(
      `INSERT INTO tickets.tickets
         (external_id, type, brand, title, description, thesis_tag,
          status, resolution, priority, created_at)
       VALUES ($1, 'feature', $2, $3, $4, $5, $6, $7, 'mittel', $8)`,
      [r.id, 'mentolder', r.name, desc || null, r.id,
       mapped.status, mapped.resolution, r.created_at]);
    out.reqsMigrated++;
  }

  // ── 2. features → tickets.pr_events ─────────────────────────────────
  const hasFeats = (await client.query(
    `SELECT to_regclass('bachelorprojekt.features') IS NOT NULL AS present`
  )).rows[0].present;
  // We must read from the *base table*, not a view (this script may run twice).
  const featsFromBase = hasFeats && (await client.query(
    `SELECT 1 FROM pg_tables WHERE schemaname='bachelorprojekt' AND tablename='features'`
  )).rowCount > 0;
  const feats = featsFromBase ? (await client.query(`
    SELECT pr_number, title, description, category, scope, brand,
           requirement_id, merged_at, merged_by, status, created_at
      FROM bachelorprojekt.features
     ORDER BY merged_at`)).rows : [];

  for (const f of feats) {
    if (f.pr_number == null) { out.prsSkipped++; continue; }
    const exists = await client.query(
      `SELECT pr_number FROM tickets.pr_events WHERE pr_number = $1`, [f.pr_number]);
    if (exists.rowCount > 0) { out.prsSkipped++; continue; }
    if (dryRun) { out.prsMigrated++; continue; }

    await client.query(
      `INSERT INTO tickets.pr_events
         (pr_number, title, description, category, scope, brand,
          merged_at, merged_by, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [f.pr_number, f.title, f.description, f.category, f.scope, f.brand,
       f.merged_at, f.merged_by, f.status, f.created_at]);
    out.prsMigrated++;
  }

  // ── 3. ticket_links: feature_ticket → self with kind='fixes' ───────
  // Same self-loop semantic as track-pr.mjs uses for bug references:
  // (from_id=ticket_id, to_id=ticket_id, kind='fixes', pr_number=N) means
  // "this ticket was fixed by PR N".
  if (!dryRun) {
    for (const f of feats) {
      if (!f.requirement_id || f.pr_number == null) continue;
      const t = await client.query(
        `SELECT id FROM tickets.tickets WHERE external_id = $1 AND type='feature'`,
        [f.requirement_id]);
      if (t.rowCount === 0) { out.linksSkipped++; continue; }
      const r = await client.query(
        `INSERT INTO tickets.ticket_links (from_id, to_id, kind, pr_number)
         VALUES ($1, $1, 'fixes', $2)
         ON CONFLICT (from_id, to_id, kind) DO NOTHING`,
        [t.rows[0].id, f.pr_number]);
      if (r.rowCount === 1) out.linksCreated++; else out.linksSkipped++;
    }
  } else {
    out.linksCreated = feats.filter(f => f.requirement_id && f.pr_number != null).length;
  }

  // ── 4. Rename legacy tables → back-compat views ─────────────────────
  if (!dryRun) {
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_tables WHERE schemaname='bachelorprojekt' AND tablename='features'
        ) THEN
          EXECUTE 'ALTER TABLE bachelorprojekt.features RENAME TO features_legacy';
        END IF;
        IF EXISTS (
          SELECT 1 FROM pg_tables WHERE schemaname='bachelorprojekt' AND tablename='requirements'
        ) THEN
          EXECUTE 'ALTER TABLE bachelorprojekt.requirements RENAME TO requirements_legacy';
        END IF;
      END $$
    `);

    // bachelorprojekt.requirements view
    await client.query(`
      CREATE OR REPLACE VIEW bachelorprojekt.requirements AS
      SELECT
        thesis_tag AS id,
        COALESCE(NULLIF(split_part(thesis_tag, '-', 1), ''), 'L') AS category,
        title AS name,
        description AS description,
        NULL::TEXT AS criteria,
        NULL::TEXT AS test_case,
        created_at
      FROM tickets.tickets
      WHERE type = 'feature' AND thesis_tag IS NOT NULL
    `);

    // bachelorprojekt.features view (preserves all columns the old timeline
    // and any straggling reader expected, including a synthetic `id` and a
    // single requirement_id chosen from the first 'fixes' link).
    await client.query(`
      CREATE OR REPLACE VIEW bachelorprojekt.features AS
      SELECT
        pe.pr_number  AS id,
        pe.pr_number,
        pe.title,
        pe.description,
        pe.category,
        pe.scope,
        pe.brand,
        req.thesis_tag AS requirement_id,
        pe.merged_at,
        pe.merged_by,
        pe.status,
        pe.created_at
      FROM tickets.pr_events pe
      LEFT JOIN LATERAL (
        SELECT t.thesis_tag
          FROM tickets.ticket_links tl
          JOIN tickets.tickets t ON t.id = tl.from_id
         WHERE tl.pr_number = pe.pr_number
           AND tl.kind = 'fixes'
           AND t.type = 'feature'
         ORDER BY tl.created_at LIMIT 1
      ) req ON true
    `);

    // bachelorprojekt.v_timeline view (same column shape as before:
    // id, day, merged_at, pr_number, title, description, category, scope,
    // brand, requirement_id, requirement_name, requirement_category)
    await client.query(`
      CREATE OR REPLACE VIEW bachelorprojekt.v_timeline AS
      SELECT
        pe.pr_number          AS id,
        pe.merged_at::date    AS day,
        pe.merged_at,
        pe.pr_number,
        pe.title,
        pe.description,
        pe.category,
        pe.scope,
        pe.brand,
        req.thesis_tag        AS requirement_id,
        req.title             AS requirement_name,
        COALESCE(NULLIF(split_part(req.thesis_tag, '-', 1), ''), NULL)
                              AS requirement_category
      FROM tickets.pr_events pe
      LEFT JOIN LATERAL (
        SELECT t.id, t.thesis_tag, t.title
          FROM tickets.ticket_links tl
          JOIN tickets.tickets t ON t.id = tl.from_id
         WHERE tl.pr_number = pe.pr_number
           AND tl.kind = 'fixes'
           AND t.type = 'feature'
         ORDER BY tl.created_at LIMIT 1
      ) req ON true
      ORDER BY pe.merged_at DESC
    `);
  }

  return out;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const url = process.env.TRACKING_DB_URL ?? process.env.WEBSITE_DB_URL
    ?? 'postgres://postgres:postgres@localhost:5432/website';
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    if (apply) await client.query('BEGIN');
    const r = await migrate(client, !apply);
    if (apply) await client.query('COMMIT');
    console.log(JSON.stringify({ ...r, mode: apply ? 'apply' : 'dry-run' }));
  } catch (err) {
    if (apply) await client.query('ROLLBACK').catch(() => {});
    await client.end().catch(() => {});
    console.error(err.message);
    process.exit(1);
  }
  await client.end();
}
main();
```

- [ ] **Step 2: Sanity-syntax-check the script.**

Run: `node --check scripts/migrate-tracking-to-tickets.mjs`
Expected: no output (success). Any syntax error blocks here.

- [ ] **Step 3: Dry-run against a port-forwarded mentolder DB.**

Use a tmux pane / second terminal:
```bash
task workspace:port-forward ENV=mentolder
```
Then in this terminal:
```bash
PG_PW=$(kubectl --context mentolder -n workspace get secret workspace-secrets \
  -o jsonpath='{.data.WEBSITE_DB_PASSWORD}' | base64 -d)
TRACKING_DB_URL="postgres://website:${PG_PW}@localhost:5432/website" \
  node scripts/migrate-tracking-to-tickets.mjs
```
Expected: a single JSON line like `{"reqsMigrated":N1,"reqsSkipped":0,"prsMigrated":N2,"prsSkipped":0,"linksCreated":N3,"linksSkipped":0,"mode":"dry-run"}` where N2 ≈ count of `bachelorprojekt.features` and N1 ≈ count of `bachelorprojekt.requirements` (likely 0 if requirements were never seeded — that's fine).

Sanity reference: `kubectl --context mentolder -n workspace exec -it sts/shared-db -- psql -U postgres -d website -c "SELECT COUNT(*) FROM bachelorprojekt.features;"` should match `prsMigrated`.

- [ ] **Step 4: Commit (still pre-apply — script only).**

```bash
git add scripts/migrate-tracking-to-tickets.mjs
git commit -m "feat(tickets): add scripts/migrate-tracking-to-tickets.mjs (PR2/5)"
```

---

## Task 3: BATS unit tests for the migration

**Files:**
- Create: `tests/unit/tickets-tracking-migration.bats`
- Create: `tests/unit/tickets-pr-events.bats`

**Pattern source:** `tests/unit/tickets-migration.bats`. Same `setup()`/`teardown()` shape, same prod-URL guard, same fixture-cleanup approach.

- [ ] **Step 1: Create `tests/unit/tickets-pr-events.bats`.**

```bash
#!/usr/bin/env bats
# Tests for tickets.pr_events table existence and shape (created by initTicketsSchema).
# Skips if no shared-db is reachable. Cleans up its own fixture rows.

load '../helpers/load.bash'

PSQL="psql -X -A -t -v ON_ERROR_STOP=1"

setup() {
  if [[ "${TRACKING_DB_URL:-}" == "" ]]; then
    skip "TRACKING_DB_URL not set"
  fi
  if [[ "${TRACKING_DB_URL}" == *"web.mentolder.de"* || "${TRACKING_DB_URL}" == *"web.korczewski.de"* ]]; then
    skip "refusing to run against prod URL"
  fi
}

@test "pr_events: table exists with expected columns" {
  run $PSQL "$TRACKING_DB_URL" -c \
    "SELECT column_name FROM information_schema.columns
      WHERE table_schema='tickets' AND table_name='pr_events' ORDER BY ordinal_position"
  [ "$status" -eq 0 ]
  [[ "$output" == *"pr_number"* ]]
  [[ "$output" == *"title"* ]]
  [[ "$output" == *"category"* ]]
  [[ "$output" == *"merged_at"* ]]
  [[ "$output" == *"status"* ]]
}

@test "pr_events: pr_number is PRIMARY KEY (rejects duplicates)" {
  $PSQL "$TRACKING_DB_URL" -c \
    "INSERT INTO tickets.pr_events (pr_number, title, category, merged_at)
     VALUES (-99001, 't', 'chore', now())"
  run $PSQL "$TRACKING_DB_URL" -c \
    "INSERT INTO tickets.pr_events (pr_number, title, category, merged_at)
     VALUES (-99001, 't2', 'chore', now())"
  [ "$status" -ne 0 ]
  [[ "$output" == *"duplicate"* || "$output" == *"unique"* ]]
}

@test "pr_events: status check constraint rejects bogus values" {
  run $PSQL "$TRACKING_DB_URL" -c \
    "INSERT INTO tickets.pr_events (pr_number, title, category, merged_at, status)
     VALUES (-99002, 't', 'chore', now(), 'bogus')"
  [ "$status" -ne 0 ]
}

teardown() {
  $PSQL "$TRACKING_DB_URL" -c \
    "DELETE FROM tickets.pr_events WHERE pr_number IN (-99001, -99002)" >/dev/null 2>&1 || true
}
```

- [ ] **Step 2: Create `tests/unit/tickets-tracking-migration.bats`.**

```bash
#!/usr/bin/env bats
# Tests for scripts/migrate-tracking-to-tickets.mjs.
# Skips if no shared-db is reachable. Cleans up its own fixture rows.

load '../helpers/load.bash'

PSQL="psql -X -A -t -v ON_ERROR_STOP=1"
SCRIPT="$BATS_TEST_DIRNAME/../../scripts/migrate-tracking-to-tickets.mjs"
EXT_REQ_FIX="MIGTEST-1"
EXT_PR_FIX="-99100"

setup() {
  if [[ "${TRACKING_DB_URL:-}" == "" ]]; then
    skip "TRACKING_DB_URL not set"
  fi
  if [[ "${TRACKING_DB_URL}" == *"web.mentolder.de"* || "${TRACKING_DB_URL}" == *"web.korczewski.de"* ]]; then
    skip "refusing to run against prod URL"
  fi
}

@test "migration: dry-run does not write" {
  local before
  before=$($PSQL "$TRACKING_DB_URL" -c "SELECT COUNT(*) FROM tickets.pr_events" | tr -d ' ')
  TRACKING_DB_URL="$TRACKING_DB_URL" node "$SCRIPT" >/dev/null
  local after
  after=$($PSQL "$TRACKING_DB_URL" -c "SELECT COUNT(*) FROM tickets.pr_events" | tr -d ' ')
  [ "$before" = "$after" ]
}

@test "migration: --apply moves a fresh requirement row into tickets.tickets" {
  $PSQL "$TRACKING_DB_URL" -c \
    "INSERT INTO bachelorprojekt.requirements (id, category, name, description, created_at)
     VALUES ('$EXT_REQ_FIX', 'FA', 'Migration test req', 'desc', now())
     ON CONFLICT DO NOTHING"
  TRACKING_DB_URL="$TRACKING_DB_URL" node "$SCRIPT" --apply >/dev/null
  run $PSQL "$TRACKING_DB_URL" -c \
    "SELECT type, thesis_tag, title FROM tickets.tickets WHERE external_id='$EXT_REQ_FIX'"
  [ "$status" -eq 0 ]
  [[ "$output" == *"feature"* ]]
  [[ "$output" == *"$EXT_REQ_FIX"* ]]
  [[ "$output" == *"Migration test req"* ]]
}

@test "migration: --apply twice is idempotent (no duplicates)" {
  TRACKING_DB_URL="$TRACKING_DB_URL" node "$SCRIPT" --apply >/dev/null
  TRACKING_DB_URL="$TRACKING_DB_URL" node "$SCRIPT" --apply >/dev/null
  run $PSQL "$TRACKING_DB_URL" -c \
    "SELECT COUNT(*) FROM tickets.tickets WHERE external_id='$EXT_REQ_FIX'"
  [ "$status" -eq 0 ]
  [[ "$output" =~ ^[[:space:]]*1[[:space:]]*$ ]]
}

@test "migration: bachelorprojekt.v_timeline preserves required columns" {
  run $PSQL "$TRACKING_DB_URL" -c \
    "SELECT column_name FROM information_schema.columns
      WHERE table_schema='bachelorprojekt' AND table_name='v_timeline'
      ORDER BY column_name"
  [ "$status" -eq 0 ]
  for col in id day merged_at pr_number title description category scope brand requirement_id requirement_name; do
    [[ "$output" == *"$col"* ]] || { echo "missing column: $col"; return 1; }
  done
}

@test "migration: ticket_links row created when feature row had requirement_id" {
  # Insert a base-table feature linked to our test requirement, then re-run migration.
  # If features is already a view, this test path is N/A (post-migration), so skip.
  local isTable
  isTable=$($PSQL "$TRACKING_DB_URL" -c \
    "SELECT count(*) FROM pg_tables WHERE schemaname='bachelorprojekt' AND tablename='features'" \
    | tr -d ' ')
  [ "$isTable" = "0" ] && skip "features already migrated to view; ticket_links path not exercisable here"

  $PSQL "$TRACKING_DB_URL" -c \
    "INSERT INTO bachelorprojekt.features (pr_number, title, category, requirement_id, merged_at)
     VALUES ($EXT_PR_FIX, 'pr', 'feat', '$EXT_REQ_FIX', now())
     ON CONFLICT (pr_number) DO NOTHING"
  TRACKING_DB_URL="$TRACKING_DB_URL" node "$SCRIPT" --apply >/dev/null

  run $PSQL "$TRACKING_DB_URL" -c \
    "SELECT 1 FROM tickets.ticket_links tl
       JOIN tickets.tickets t ON t.id = tl.from_id
      WHERE t.external_id='$EXT_REQ_FIX'
        AND tl.kind='fixes'
        AND tl.pr_number=$EXT_PR_FIX"
  [ "$status" -eq 0 ]
  [[ "$output" =~ ^[[:space:]]*1[[:space:]]*$ ]]
}

teardown() {
  $PSQL "$TRACKING_DB_URL" -c \
    "DELETE FROM tickets.ticket_links WHERE pr_number = $EXT_PR_FIX" >/dev/null 2>&1 || true
  $PSQL "$TRACKING_DB_URL" -c \
    "DELETE FROM tickets.pr_events WHERE pr_number = $EXT_PR_FIX" >/dev/null 2>&1 || true
  # Try both base table and view (only one will succeed)
  $PSQL "$TRACKING_DB_URL" -c \
    "DELETE FROM bachelorprojekt.features_legacy WHERE pr_number = $EXT_PR_FIX" >/dev/null 2>&1 || true
  $PSQL "$TRACKING_DB_URL" -c \
    "DELETE FROM tickets.tickets WHERE external_id='$EXT_REQ_FIX'" >/dev/null 2>&1 || true
  $PSQL "$TRACKING_DB_URL" -c \
    "DELETE FROM bachelorprojekt.requirements_legacy WHERE id='$EXT_REQ_FIX'" >/dev/null 2>&1 || true
  $PSQL "$TRACKING_DB_URL" -c \
    "DELETE FROM bachelorprojekt.requirements WHERE id='$EXT_REQ_FIX'" >/dev/null 2>&1 || true
}
```

- [ ] **Step 3: Run BATS locally against the port-forwarded DB.**

Run:
```bash
PG_PW=$(kubectl --context mentolder -n workspace get secret workspace-secrets \
  -o jsonpath='{.data.WEBSITE_DB_PASSWORD}' | base64 -d)
TRACKING_DB_URL="postgres://website:${PG_PW}@localhost:5432/website" \
  bats tests/unit/tickets-pr-events.bats tests/unit/tickets-tracking-migration.bats
```
Expected: all tests pass (or skip cleanly if `TRACKING_DB_URL` is unset). Note: tests assume `tickets.pr_events` already exists (from Task 1's schema-init). Run schema-init first by hitting any website page that calls `initTicketsSchema()`, OR run a helper SQL once.

- [ ] **Step 4: Add the new BATS files to `task test:unit`.**

`task test:unit` already globs `tests/unit/*.bats` (verified by reading `Taskfile.yml` test-unit task — no allowlist). No Taskfile change needed.

- [ ] **Step 5: Commit.**

```bash
git add tests/unit/tickets-pr-events.bats tests/unit/tickets-tracking-migration.bats
git commit -m "test(tickets): add BATS tests for pr_events + tracking migration (PR2/5)"
```

---

## Task 4: Rewrite `scripts/track-pr.mjs::writeRowToDb` for the new schema

**Files:**
- Modify: `scripts/track-pr.mjs:44-129` (the `writeRowToDb` function)

The PR1 version inserts to `bachelorprojekt.features` and self-loops bug links via raw SQL. PR2 changes:
- INSERT goes to `tickets.pr_events` instead of `bachelorprojekt.features`.
- The `requirement_id` becomes a `tickets.ticket_links` row (`kind='fixes'`, `pr_number=N`, `from_id = feature_ticket.id`) instead of a column.
- Bug-ref handling is unchanged (already writes to `tickets.tickets` + `tickets.ticket_links`).

- [ ] **Step 1: Replace lines 44–72 of `scripts/track-pr.mjs`.**

Find this block (lines 44–72):

```js
export async function writeRowToDb(row, pgClient) {
  // Drop requirement_id if it doesn't exist in bachelorprojekt.requirements —
  // otherwise the FK rejects the row and the PR never lands in the timeline.
  let requirementId = row.requirement_id;
  if (requirementId) {
    const { rowCount } = await pgClient.query(
      'SELECT 1 FROM bachelorprojekt.requirements WHERE id = $1',
      [requirementId]
    );
    if (rowCount === 0) requirementId = null;
  }

  await pgClient.query(
    `INSERT INTO bachelorprojekt.features
       (pr_number, title, description, category, scope, brand,
        requirement_id, merged_at, merged_by, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'shipped')
     ON CONFLICT (pr_number) DO UPDATE SET
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       category = EXCLUDED.category,
       scope = EXCLUDED.scope,
       brand = EXCLUDED.brand,
       requirement_id = EXCLUDED.requirement_id,
       merged_at = EXCLUDED.merged_at,
       merged_by = EXCLUDED.merged_by`,
    [row.pr_number, row.title, row.description, row.category, row.scope, row.brand,
     requirementId, row.merged_at, row.merged_by]
  );
```

Replace with:

```js
export async function writeRowToDb(row, pgClient) {
  // 1. Insert PR ledger row into tickets.pr_events (idempotent on pr_number).
  await pgClient.query(
    `INSERT INTO tickets.pr_events
       (pr_number, title, description, category, scope, brand,
        merged_at, merged_by, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'shipped')
     ON CONFLICT (pr_number) DO UPDATE SET
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       category = EXCLUDED.category,
       scope = EXCLUDED.scope,
       brand = EXCLUDED.brand,
       merged_at = EXCLUDED.merged_at,
       merged_by = EXCLUDED.merged_by`,
    [row.pr_number, row.title, row.description, row.category, row.scope, row.brand,
     row.merged_at, row.merged_by]
  );

  // 2. Requirement reference → tickets.ticket_links row (kind='fixes').
  // Mirrors the bug-ref pattern below: from_id=to_id=feature_ticket.id.
  if (row.requirement_id) {
    const t = await pgClient.query(
      `SELECT id FROM tickets.tickets
        WHERE type='feature' AND external_id = $1`,
      [row.requirement_id]);
    if (t.rowCount > 0) {
      await pgClient.query(
        `INSERT INTO tickets.ticket_links (from_id, to_id, kind, pr_number)
         VALUES ($1, $1, 'fixes', $2)
         ON CONFLICT (from_id, to_id, kind) DO NOTHING`,
        [t.rows[0].id, row.pr_number]);
    } else {
      console.log(`skip requirement link ${row.requirement_id}: feature ticket not found`);
    }
  }
```

(Note: lines 74–129 — the `bug_refs` handling — are unchanged.)

- [ ] **Step 2: Verify syntax.**

Run: `node --check scripts/track-pr.mjs`
Expected: no output.

- [ ] **Step 3: Smoke-test against the port-forwarded mentolder DB.**

Use a synthetic PR JSON. From the repo root with the port-forward still running and `TRACKING_DB_URL` set:

```bash
echo '{"number": -99200, "title": "test(tickets): pr2 smoke", "body": "FA-01 test", "mergedAt": "2026-05-08T00:00:00Z", "mergedBy": {"login": "test"}}' \
  | node scripts/track-pr.mjs --pr
node scripts/track-pr.mjs --ingest
```

Verify the row landed:
```bash
$PSQL "$TRACKING_DB_URL" -c "SELECT pr_number, title, category FROM tickets.pr_events WHERE pr_number = -99200"
```
Expected: one row, `category = test`.

Cleanup:
```bash
$PSQL "$TRACKING_DB_URL" -c "DELETE FROM tickets.ticket_links WHERE pr_number = -99200"
$PSQL "$TRACKING_DB_URL" -c "DELETE FROM tickets.pr_events WHERE pr_number = -99200"
rm -f tracking/pending/-99200.json
```

- [ ] **Step 4: Commit.**

```bash
git add scripts/track-pr.mjs
git commit -m "feat(tickets): track-pr.mjs writes to tickets.pr_events + ticket_links (PR2/5)"
```

---

## Task 5: Update FA-29 e2e test to assert the new view shape

**Files:**
- Modify: `tests/e2e/specs/fa-29-tracking.spec.ts`

The current test (lines 19–31) only checks that `/api/timeline` returns a JSON array. PR2 must additionally assert that each row has the columns `KoreTimeline.svelte` reads: `id`, `day`, `pr_number`, `title`, `description`, `category`, `scope`, `brand`. We're not asserting *how* they were computed — just that the API contract holds before and after the migration.

- [ ] **Step 1: Replace lines 19–31 of `tests/e2e/specs/fa-29-tracking.spec.ts`.**

Find:
```ts
  test('T3: /api/timeline returns JSON array', async ({ request }) => {
    const res = await request.get(`${TRACKING_URL}/api/timeline`).catch(() => null);
    if (res === null || res.status() === 404) {
      test.skip(true, 'Timeline API not available on this cluster');
      return;
    }
    expect([200, 401]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    }
  });
});
```

Replace with:
```ts
  test('T3: /api/timeline returns rows with required columns', async ({ request }) => {
    // The Kore homepage timeline reads /api/timeline and renders these columns;
    // PR2 rebuilt v_timeline as a view over tickets.pr_events + ticket_links —
    // the API contract must keep its shape.
    const res = await request.get(`${TRACKING_URL}/api/timeline?limit=5`).catch(() => null);
    if (res === null || res.status() === 404) {
      test.skip(true, 'Timeline API not available on this cluster');
      return;
    }
    expect([200, 401]).toContain(res.status());
    if (res.status() !== 200) return;

    const body = await res.json();
    // /api/timeline returns {rows: [...]}; tolerate either shape.
    const rows = Array.isArray(body) ? body : (body?.rows ?? []);
    expect(Array.isArray(rows)).toBe(true);
    if (rows.length === 0) return; // empty cluster — still valid

    const r = rows[0];
    for (const col of ['id', 'day', 'pr_number', 'title', 'category', 'brand']) {
      expect(r).toHaveProperty(col);
    }
    // day is YYYY-MM-DD (string), pr_number is a number (or null on legacy rows)
    expect(typeof r.day).toBe('string');
    expect(r.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
```

- [ ] **Step 2: Run the spec against mentolder prod (TRACKING_URL points at it).**

Run:
```bash
TRACKING_URL="https://web.mentolder.de" \
  npx playwright test tests/e2e/specs/fa-29-tracking.spec.ts --project=services
```
Expected: T1, T2, T3 all PASS. T3 may currently FAIL (returns `body.rows` not array) — that's why we're updating it.

- [ ] **Step 3: Commit.**

```bash
git add tests/e2e/specs/fa-29-tracking.spec.ts
git commit -m "test(fa-29): assert /api/timeline column shape post-PR2 (PR2/5)"
```

---

## Task 6: Open the PR and merge

**Files:** none (git/gh).

This is a single-PR shipping unit per spec §9. The migration script + back-compat views ride along; the deploy runbook (Task 8) actually applies the data move.

- [ ] **Step 1: Push the branch and open the PR.**

```bash
git push -u origin <branch-name>
gh pr create --title "feat(tickets): migrate features+requirements into tickets schema (PR2/5)" \
  --body "$(cat <<'EOF'
## Summary
Second of 5 unified-ticketing PRs. PR1 (#562) created the tickets schema and migrated bug_tickets; PR2 migrates the remaining two `bachelorprojekt` tables.

**Spec:** `docs/superpowers/specs/2026-05-08-unified-ticketing-design.md`
**Plan:** `docs/superpowers/plans/2026-05-08-unified-ticketing-pr2.md`

### What changes
- `tickets.pr_events` table added to `initTicketsSchema()` — the immutable PR ledger from spec §4 (`website/src/lib/tickets-db.ts`).
- `scripts/migrate-tracking-to-tickets.mjs` (new, idempotent, `--apply`-gated): copies `bachelorprojekt.requirements` → `tickets.tickets` (type='feature'), `bachelorprojekt.features` → `tickets.pr_events`, and creates a `tickets.ticket_links` row for every feature row that referenced a requirement. Then renames the legacy tables to `*_legacy` and replaces them with back-compat views, and rebuilds `bachelorprojekt.v_timeline` as a view over the new schema.
- `scripts/track-pr.mjs::writeRowToDb` writes to `tickets.pr_events` + `tickets.ticket_links` instead of `bachelorprojekt.features`.

### What stays unchanged
- `bachelorprojekt.v_timeline` columns and ordering — `KoreTimeline.svelte` and `/api/timeline` keep their shape.
- The tracking-import cronjob (it still calls `track-pr.mjs --ingest`).
- `pipeline` and `test_results` tables (kept as historical thesis artifacts per spec §9).
- `/admin/bugs`, `/admin/projekte` UIs (back-compat views handle any straggling reader).

### Required human follow-up (Deploy Runbook)
After this PR merges and ArgoCD rolls the website pod on both clusters:
1. `task workspace:backup` — manual safety backup.
2. **Per env**, with `task workspace:port-forward ENV=<env>` running:
   ```
   PG_PW=$(kubectl --context <env> -n workspace get secret workspace-secrets \
     -o jsonpath='{.data.WEBSITE_DB_PASSWORD}' | base64 -d)
   TRACKING_DB_URL="postgres://website:${PG_PW}@localhost:5432/website" \
     node scripts/migrate-tracking-to-tickets.mjs --apply
   ```
   Expected output: `{"reqsMigrated":N1,"reqsSkipped":0,"prsMigrated":N2,"prsSkipped":0,"linksCreated":N3,...,"mode":"apply"}`.
3. Smoke `https://web.<brand>.de/` — the Kore homepage timeline should render with the same row count.
4. `gh pr list --state merged --limit 5` — pick a recent PR and confirm it appears in the timeline within 5 min (cron tick).

### Migration risk-reduction
- Dry-run is the default; `--apply` is opt-in.
- Old `bachelorprojekt.requirements` and `bachelorprojekt.features` tables are renamed to `*_legacy` — rollback is `DROP VIEW + ALTER TABLE … RENAME` and re-deploy old code.
- `task workspace:backup` runs before `--apply` on prod.
- Race window between deploy and migration: any PR merged in the gap writes to `tickets.pr_events` directly via the new `track-pr.mjs`. Migration's `ON CONFLICT (pr_number) DO NOTHING` makes the catch-up safe.

## Test plan
- [ ] `task test:all` (BATS unit + manifest validation) green
- [ ] `tests/unit/tickets-pr-events.bats` and `tests/unit/tickets-tracking-migration.bats` pass against a port-forward
- [ ] `tests/e2e/specs/fa-29-tracking.spec.ts` passes against `web.mentolder.de` after migration
- [ ] `https://web.mentolder.de/` and `https://web.korczewski.de/` Kore timeline renders the same row count post-migration
- [ ] A test PR merged after migration appears in the timeline within 5 min
EOF
)"
```

- [ ] **Step 2: Watch CI and merge.**

```bash
gh pr checks --watch
gh pr merge --squash --delete-branch
```
Per repo memory `feedback_pr_workflow.md`, merge immediately on green.

---

## Task 7: Run the migration on both clusters

**Files:** none (operational).

This is the actual data move. Per spec §9 PR2 and the user's `feedback_live_environments.md` memory ("always work on live environments"), do this on both prod clusters back-to-back.

- [ ] **Step 1: Take a fresh backup.**

```bash
task workspace:backup
task workspace:backup:list | head -5
```
Expected: a new timestamp newer than 5 minutes ago.

- [ ] **Step 2: Migrate mentolder.**

In one terminal:
```bash
task workspace:port-forward ENV=mentolder
```

In another:
```bash
PG_PW=$(kubectl --context mentolder -n workspace get secret workspace-secrets \
  -o jsonpath='{.data.WEBSITE_DB_PASSWORD}' | base64 -d)

# 1. Dry-run first
TRACKING_DB_URL="postgres://website:${PG_PW}@localhost:5432/website" \
  node scripts/migrate-tracking-to-tickets.mjs

# 2. If dry-run output looks reasonable, apply.
TRACKING_DB_URL="postgres://website:${PG_PW}@localhost:5432/website" \
  node scripts/migrate-tracking-to-tickets.mjs --apply
```
Expected (dry-run): `{"reqsMigrated":N1,"reqsSkipped":0,"prsMigrated":N2,...,"mode":"dry-run"}` where N2 ≈ count of `bachelorprojekt.features`.
Expected (--apply): same numbers with `"mode":"apply"`.

Verify post-migration:
```bash
PSQL='psql -X -A -t'
$PSQL "postgres://website:${PG_PW}@localhost:5432/website" -c \
  "SELECT count(*) FROM tickets.pr_events"
$PSQL "postgres://website:${PG_PW}@localhost:5432/website" -c \
  "SELECT count(*) FROM bachelorprojekt.v_timeline"
```
Expected: both numbers equal (one row in v_timeline per pr_events row).

- [ ] **Step 3: Migrate korczewski.**

Stop the mentolder port-forward (Ctrl+C in its tmux pane). Repeat Step 2 with `ENV=korczewski` and `--context korczewski` everywhere.

```bash
task workspace:port-forward ENV=korczewski
```

In another terminal:
```bash
PG_PW=$(kubectl --context korczewski -n workspace-korczewski get secret workspace-secrets \
  -o jsonpath='{.data.WEBSITE_DB_PASSWORD}' | base64 -d)
TRACKING_DB_URL="postgres://website:${PG_PW}@localhost:5432/website" \
  node scripts/migrate-tracking-to-tickets.mjs
TRACKING_DB_URL="postgres://website:${PG_PW}@localhost:5432/website" \
  node scripts/migrate-tracking-to-tickets.mjs --apply
```
Note: `workspace-korczewski` namespace per repo memory `project_cluster_merge.md`.

- [ ] **Step 4: Smoke both brands.**

```bash
curl -sf "https://web.mentolder.de/api/timeline?limit=3" | jq '.rows[0] | {id,day,pr_number,title,category,brand}'
curl -sf "https://web.korczewski.de/api/timeline?limit=3" | jq '.rows[0] | {id,day,pr_number,title,category,brand}'
```
Expected: both return a row with all six fields populated. `day` matches `YYYY-MM-DD`.

Open both homepages in a browser and confirm the timeline renders identically.

- [ ] **Step 5: Verify the cron's next tick still ingests cleanly.**

After the next 5-min cron mark:
```bash
kubectl --context mentolder -n workspace logs -l app=tracking-import --tail=50
kubectl --context korczewski -n workspace-korczewski logs -l app=tracking-import --tail=50
```
Expected: `ingested N rows` or `no pending rows` — no errors.

---

## Task 8: Self-review checklist (run before declaring PR2 done)

**Files:** none (manual review).

- [ ] Spec coverage: every bullet in spec §9 PR2 (`docs/superpowers/specs/2026-05-08-unified-ticketing-design.md:370-376`) is implemented in Tasks 1–7.
- [ ] No reference to `bachelorprojekt.features` (base table) remains in `scripts/track-pr.mjs` or `website/src/lib/website-db.ts`. (View references are fine.)
- [ ] `bachelorprojekt.v_timeline` is a view, not a base table:
  ```bash
  $PSQL "$TRACKING_DB_URL" -c \
    "SELECT table_type FROM information_schema.tables
      WHERE table_schema='bachelorprojekt' AND table_name='v_timeline'"
  ```
  Expected: `VIEW`.
- [ ] `tickets.pr_events` row count == `bachelorprojekt.features_legacy` row count (per env).
- [ ] No PR merged during the deploy gap is missing from the timeline.
- [ ] `pipeline` and `test_results` tables untouched — they're explicitly left as historical artifacts.

---

## Open questions, deferred to PR3+

- **`assignee_id` on feature tickets:** PR2 leaves it NULL. PR3 (`projects/sub_projects/tasks` migration) will introduce admin assignee management.
- **Activity log for migrated tickets:** the trigger fires on every INSERT, so each migrated requirement gets a `_created` row in `ticket_activity`. This is desirable for auditability — flagged here so reviewers know the activity log will jump on migration day.
- **Reverting PR2:** `BEGIN; ALTER VIEW bachelorprojekt.requirements RENAME TO requirements_view; ALTER TABLE bachelorprojekt.requirements_legacy RENAME TO requirements; ALTER VIEW bachelorprojekt.features RENAME TO features_view; ALTER TABLE bachelorprojekt.features_legacy RENAME TO features; <recreate old v_timeline DDL from deploy/tracking/init.sql:106-122>; COMMIT;` — then redeploy the previous website image.
