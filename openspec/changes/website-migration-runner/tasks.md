---
title: "website-migration-runner — automated SQL migration runner for website/src/db/migrations"
ticket_id: T001652
domains: [website, infra]
status: plan_staged
---

# website-migration-runner — Implementation Plan

Automated, idempotent, tracked migration runner for `website/src/db/migrations/*.sql`, wired into
`workspace:deploy` before the website rollout. Closes the T001652 gap where the website migration
directory had no runner (unlike `studio-server`, `brett`, `VideoVault`), causing Prod-DB drift
(`ai_call_log`, `error_log`, `platform_assets`, `generation_jobs`, `folder_templates`, `audit_log`,
`sessions_templates` missing on fleet/workspace/shared-db).

This plan satisfies both requirements in
`openspec/changes/website-migration-runner/specs/workspace-deploy.md`:
- **R1** — Website-DB-Migrationen laufen automatisiert vor dem website-Rollout (Tasks 1, 2, 5, 6).
- **R2** — Migrations-Runner erkennt bereits real angewendete, aber ungetrackte Migrationen via
  SQLSTATE 42P07/42710/42701 Allowlist (Tasks 2, 3).

## File Structure

New files:
- `website/src/db/migrations/20260708_create_schema_migrations.sql` — bootstrap tracking table
  `schema_migrations(filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`.
- `website/src/db/migrate.ts` — the runner. Exports `runMigrations(pool)` (testable) plus a CLI
  `main()` entrypoint that builds a `pg.Pool` from `DATABASE_URL`.
- `website/src/db/migrate.test.ts` — Vitest unit test (sort order, tracking/skip, backfill on
  42P07, abort on real error) against a mocked `pg.Pool`.

Modified files:
- `website/package.json` — new `db:migrate` script. Extension `.json`: no S1 line limit applies
  (S1 covers .ts/.js/.jsx/.py/.svelte/.sh/.mjs/.mts/.astro/.tsx/.java/.php/.bash/.cjs only);
  `nicht-baselined`. Budget: unconstrained by S1.
- `Taskfile.yml` — new `website:migrate` task + call inside `workspace:deploy` before the website
  rollout. Extension `.yml`: no S1 line limit applies; `nicht-baselined`. Budget: unconstrained
  by S1. Current size: 4662 lines.

New-file S1 budgets (all `nicht-baselined`, `.ts`/`.sql` — `.ts` limit 600, `.sql` unlisted → no
line limit): `migrate.ts` ~80 lines, `migrate.test.ts` ~140 lines, the SQL file ~10 lines — all
well under the `.ts` 600 limit with growth reserve.

CQ02 (`any`-types): the runner and test are fully typed against `pg` types (`Pool`, `QueryResult`).
No `: any`, `<any>`, `as any`, `catch (e: any)` — the caught error is narrowed via a typed
`isPgError` guard reading `.code`. Net `any` delta: 0.

<!-- vitest: neuer Test migrate.test.ts ist Pflicht (neue Datei in website/src/db mit Logik) und in Task 3 enthalten -->

## Reference patterns (read before implementing)

- `studio-server/src/db/migrate.ts` — the canonical `readdirSync().filter('.sql').sort()` +
  per-file transaction + tracking-table pattern this runner mirrors (adds the 42P07 backfill on
  top).
- `website/src/db/migrations/error-log-schema.test.ts` — existing website DB test using
  `pg-mem`; shows the migrations-dir test convention. This plan uses a **mocked `pg.Pool`**
  instead (Task 3 rationale) because we must assert exact SQLSTATE handling and call ordering,
  which pg-mem does not expose deterministically.
- `Taskfile.yml` `workspace:fix-tickets-grants` (~line 2898) — the exact prod DB-access pattern
  the `website:migrate` task reuses: read superuser password from `shared-db`, port-forward
  `svc/shared-db 5432:5432`, run the Node entrypoint with a `postgres://postgres:…@localhost:5432/website`
  URL. Superuser is required because the SQL files contain `ALTER TABLE … OWNER TO website` and
  `GRANT …` statements.
- `Taskfile.yml` `website:deploy` (~line 3451) and `workspace:deploy` (~line 2525) — the deploy
  tasks the migration step is wired into.

---

## Task 1 — Bootstrap migration `20260708_create_schema_migrations.sql`

Create `website/src/db/migrations/20260708_create_schema_migrations.sql`.

- Header comment block matching the directory convention (see
  `20260621_create_ai_call_log.sql`): ticket `T001652`, date `2026-07-08`, one-line purpose
  ("Tracking table for the website migration runner").
- Body:
  ```sql
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename   text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  );
  ```
- Optionally `ALTER TABLE schema_migrations OWNER TO website;` + `GRANT SELECT, INSERT ON
  schema_migrations TO website;` so a `website`-role connection can also read/track (superuser
  connection from the task owns it either way). Keep `IF NOT EXISTS` / idempotent so a re-run is a
  no-op.

**Verify:** `cat website/src/db/migrations/20260708_create_schema_migrations.sql` shows the file;
filename sorts lexicographically after `20260703_create_error_log.sql` (chronologically correct).

## Task 2 — Runner `website/src/db/migrate.ts`

Create `website/src/db/migrate.ts` modeled on `studio-server/src/db/migrate.ts`, extended for the
backfill requirement.

Structure:
- `export const ALREADY_EXISTS_SQLSTATES = new Set(['42P07', '42710', '42701']);` — relation /
  object / column already exists. Exported so the test asserts against the same set.
- `function isPgError(e: unknown): e is { code: string; message: string }` — typed guard reading
  `.code` (no `any`).
- `export async function runMigrations(pool: Pool): Promise<void>`:
  1. **Bootstrap before tracking query** (Henne-Ei): `await pool.query('CREATE TABLE IF NOT
     EXISTS schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT
     now())')` — so the tracking lookup never fails on a fresh DB.
  2. `const dir = join(__dirname, 'migrations')` (guard with `existsSync`, warn + return if
     missing, like studio-server). Use an `import.meta.url`→`fileURLToPath` dirname (ESM;
     `website` is `"type": "module"`) rather than `__dirname`.
  3. `const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort();` — filter to `.sql`
     only (excludes the sibling `error-log-schema.test.ts`).
  4. Load already-tracked filenames once: `SELECT filename FROM schema_migrations` → `Set`.
  5. For each file not in the tracked set, run in a transaction:
     - `BEGIN`; `await pool.query(readFileSync(join(dir, f), 'utf8'))`; `INSERT INTO
       schema_migrations (filename) VALUES ($1)`; `COMMIT`.
     - On error: `ROLLBACK`. Then:
       - If `isPgError(e) && ALREADY_EXISTS_SQLSTATES.has(e.code)` → log
         "already applied (backfill: `<code>`)", then track it in its own statement
         (`INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING`) and
         continue to the next file. (Track outside the rolled-back txn so the row persists.)
       - Else → `throw new Error(\`migration \${f} failed: \${e instanceof Error ? e.message :
         String(e)}\`)` (full message; aborts the whole run — file stays untracked).
- `async function main()`: build `new Pool({ connectionString: process.env.DATABASE_URL })`
  (fail fast with a clear message if `DATABASE_URL` is unset), `await runMigrations(pool)`,
  `await pool.end()`. Invoke `main()` only when run as the entrypoint (guard so importing the
  module in the test does not start a real connection), and `process.exit(1)` on rejection with
  the error printed.

**Verify:** `npx tsc --noEmit` (or `pnpm --dir website astro:check` scope) reports no type errors
for the new module.

## Task 3 — Failing test first, then green: `website/src/db/migrate.test.ts`

Follow test-driven order. Create `website/src/db/migrate.test.ts` **before** finalizing Task 2's
logic, so the first run fails against a not-yet-complete runner, then implement until green.

Use a **mocked `pg.Pool`**: a small `createMockPool()` helper returning an object with a
`vi.fn()` `query` whose behavior is scripted per test (records the ordered SQL/params it receives,
and can be told to throw a `{ code, message }` error for a given file's SQL). This is chosen over
`pg-mem` (used by `error-log-schema.test.ts`) because the tests must assert exact SQLSTATE
branching and call ordering, which a real/emulated engine does not surface deterministically.
Stub `readdirSync`/`readFileSync` via `vi.mock('node:fs', …)` to feed a controlled file list so
the test does not depend on the real directory contents.

Cases:
1. **Sort order** — given unsorted `readdirSync` output (`['20260703_b.sql', '20260520_a.sql']`),
   assert the runner executes them in lexicographic order (`20260520_a.sql` first). Also assert
   non-`.sql` entries (e.g. `error-log-schema.test.ts`) are filtered out.
2. **Tracking / no double-run** — seed the mock so `SELECT filename FROM schema_migrations`
   returns one file as already tracked; assert that file's SQL is never executed and only the
   untracked file runs + gets an `INSERT … schema_migrations`.
3. **Backfill on 42P07** — script the mock so a file's body query rejects with `{ code: '42P07' }`;
   assert the run does **not** throw, the file is still tracked (INSERT issued), and the next file
   still runs. Repeat parametrized for `42710` and `42701`.
4. **Abort on real error** — script the mock so a file's body query rejects with
   `{ code: '42601', message: 'syntax error' }` (outside the allowlist); assert `runMigrations`
   rejects, the error message contains the filename and `syntax error`, and the file is **not**
   tracked (no INSERT for it), and no later file runs.
5. **Bootstrap-before-tracking** — assert the first `query` call is the `CREATE TABLE IF NOT
   EXISTS schema_migrations …` bootstrap, issued before the `SELECT filename` tracking lookup.

Red→green step:
- First write the test against the runner's intended API and run it before the runner logic is
  complete. `pnpm --dir website exec vitest run src/db/migrate.test.ts` — **expected: FAIL**
  (module/behavior not yet complete). Then complete Task 2 until this test passes green.

**Verify:** `pnpm --dir website exec vitest run src/db/migrate.test.ts` passes all cases.

## Task 4 — `website/package.json` script

Add to the `scripts` block:
```json
"db:migrate": "tsx src/db/migrate.ts"
```
`tsx` is already a `devDependency` (v4.22.3), matching the repo's TS runner tooling. No new
dependency. `.json` extension → no S1 limit; `nicht-baselined`; net change +1 line.

**Verify:** `DATABASE_URL=postgres://invalid pnpm --dir website db:migrate` exits non-zero with the
clear "DATABASE_URL"/connection error message (proves the CLI wiring resolves and the entrypoint
runs), not a "script not found" error.

## Task 5 — `Taskfile.yml`: `website:migrate` task

Add a `website:migrate` task in the Website section (near `website:migrate:homepage-blocks`,
~line 3323), modeled on `workspace:fix-tickets-grants` (~line 2898) for prod DB access:

- `desc:` "Run website/src/db/migrations/*.sql against the target DB (idempotent, tracked in
  schema_migrations). ENV=dev|mentolder|korczewski."
- `vars: { ENV: '{{.ENV | default "dev"}}' }`.
- Body:
  - `source scripts/env-resolve.sh "{{.ENV}}"`.
  - `NS="${WORKSPACE_NAMESPACE:-workspace}"`; `ctx_flag=""`; for non-dev set
    `ctx_flag="--context $ENV_CONTEXT"`.
  - Read superuser password: `PG_PW=$(kubectl $ctx_flag -n "$NS" exec deploy/shared-db --
    printenv POSTGRES_PASSWORD | tr -d '\r\n')`; guard non-empty.
  - `kubectl $ctx_flag -n "$NS" rollout status deployment/shared-db --timeout=120s` before
    connecting.
  - Port-forward `svc/shared-db 5432:5432` in background with a `trap 'kill $PF' EXIT` cleanup and
    a short `sleep`, exactly like `workspace:fix-tickets-grants`.
  - `DATABASE_URL="postgres://postgres:${PG_PW}@localhost:5432/website" pnpm --dir website
    db:migrate`.
- No hardcoded `*.mentolder.de` / `*.korczewski.de` hostnames anywhere in the task (S3):
  everything routes through `ENV_CONTEXT` / `WORKSPACE_NAMESPACE` from `env-resolve.sh` and the
  in-cluster `shared-db` service name.

**Verify:** `task --dry-run website:migrate ENV=dev` resolves the task without error;
`bash scripts/vda.sh oracle --dry-run 'run website db migrations for mentolder'` (or
`task website:migrate ENV=dev` against the local k3d dev DB) applies the pending migrations and a
second run is a clean no-op (all files already in `schema_migrations`).

## Task 6 — Wire `website:migrate` into `workspace:deploy` before the website rollout

In `workspace:deploy` (~line 2525), add a `website:migrate` invocation that runs **after
shared-db is ready and after the SealedSecret/schema apply, but before the website Deployment is
rolled out**. Two integration points to reconcile:

- `workspace:deploy` applies the full overlay (which includes the website Deployment) via the
  `kustomize build … | kubectl apply` blocks. Insert the migration step **before** that apply for
  both the dev branch (after `kubectl rollout status deployment/shared-db … --timeout=120s`,
  ~line 2551) and the prod branch (after the `k3d/website-schema.yaml` apply + shared-db readiness,
  ~line 2663), so the schema is migrated before the new website pods start serving.
- Prefer a `- task: website:migrate` `cmds` entry with `vars: { ENV: "{{.ENV}}" }` over inlining,
  to keep the DB-access logic in one place (Task 5).

Because the website pod is also rolled out later by `website:deploy` / `website:redeploy` in the
`feature:website` path, add the same `website:migrate` pre-step at the top of `website:deploy`
(before `website:build` / the `kubectl apply` of the overlay, ~line 3459) so a website-only
redeploy also migrates first. Guard against double-run cost: the runner is idempotent (tracked),
so running it in both `workspace:deploy` and `website:deploy` is safe — the second run is a no-op.

**Verify:** `task --dry-run workspace:deploy ENV=dev` and `task --dry-run website:deploy ENV=dev`
both resolve and show the `website:migrate` step ordered before the website apply/rollout;
`task workspace:validate` stays green.

## Task 7 — Manual first-run backfill note (operational, no code)

Document in the change's `design.md` "Migration Plan" (already present) that the first prod run is
`task website:migrate ENV=mentolder` then `ENV=korczewski`, which backfills the ungetrackte, real
migrations (42P07 path) and closes the current drift. No code change — this task is a checklist
marker so the executor performs the one-time backfill after merge and verifies via
`SELECT filename FROM schema_migrations ORDER BY filename` that every file in the directory is
tracked.

**Verify:** after the manual run, `SELECT count(*) FROM schema_migrations` equals the number of
`.sql` files in `website/src/db/migrations/` (currently 16 including the new bootstrap file).

## Task 8 — Test inventory + final verification (mandatory gates)

1. Regenerate the test inventory (a new test file was added):
   ```bash
   task test:inventory
   ```
   Commit the updated `website/src/data/test-inventory.json` alongside the change.
2. Run the three mandatory verify commands:
   ```bash
   task test:changed          # vitest --changed (incl. migrate.test.ts) + BATS selection + quality
   task freshness:regenerate  # regenerate generated artefacts (test-inventory, repo-index, …)
   task freshness:check       # CI equivalent: freshness + quality:check (S1–S4 ratchet) + baseline assertion
   ```
3. Confirm the migration actually runs end-to-end (not only unit-tested): against the local k3d
   dev DB,
   ```bash
   task website:migrate ENV=dev
   task website:migrate ENV=dev   # second run must be a clean no-op
   ```
   and verify via `kubectl exec deploy/shared-db -- psql -U postgres -d website -c 'SELECT
   filename FROM schema_migrations ORDER BY filename'` that every `.sql` file in the directory is
   tracked and the second run reported zero newly-applied files.

**Verify:** all three `task` commands exit 0; the dev migration run applies the pending files and
the immediate re-run applies none; `any`-count check stays ≤ 200
(`grep -rn ': any\|<any>\|as any' website/src --include='*.ts' --include='*.svelte'
--include='*.astro' | wc -l`).
