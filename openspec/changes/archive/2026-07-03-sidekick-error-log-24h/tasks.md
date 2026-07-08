---
title: "sidekick-error-log-24h — Implementation Plan"
ticket_id: "T001594"
domains: [website, observability]
status: draft
---

# sidekick-error-log-24h — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Every building block is TDD: write the failing test first (`expected: FAIL`), then make it green. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist `level=error` entries from server (Pino), browser (`window.onerror`/`unhandledrejection`) and pod (only while a pod-log stream is actively open in the sidekick) into a new Postgres table `error_log`, expose them via an admin-gated 24h read API, add a "Live"/"Letzte 24h" mode toggle to `LogsSidekickView.svelte`, and enforce a real 7-day retention via a CronJob — additive to the existing in-memory live log bus, which stays unchanged.

**Architecture:** A fire-and-forget write path (`persistError`, modelled on `ai-metrics.ts` `logAiCall`) fed from three sources: server via an additional Pino multistream destination in `logger.ts`; browser + pod via `POST /api/admin/ops/error-log`. A small pure client helper (`error-report.ts`) centralises the POST/GET/pod-classification so `browser-collector.ts` and `LogsSidekickView.svelte` stay lean and unit-testable (S1/S2). Retention runs as a curl-triggered CronJob (`error-log-retention-cronjob.yaml`) hitting a `CRON_SECRET`-gated endpoint — the notify-unread HTTP-trigger pattern, not the unenforced Taskfile-only approach `ai_call_log` shipped with.

**Tech Stack:** Astro 5 + Svelte 5 (runes), TypeScript, Pino, `pg`, PostgreSQL 16 (`shared-db`), Kustomize + envsubst overlays, Vitest (node + jsdom projects), BATS.

## Global Constraints

- **S1 (line budgets):** None of the touched files are baselined (`docs/code-quality/baseline.json`), so the effective threshold is the static extension limit: `.ts` = 600, `.svelte` = 500. Per-file Ist/Budget is recorded in each task. New modules are cut small with growth reserve.
- **S2 (import cycles):** `error-report.ts` and `error-log-store.ts` are planned as leaf modules — `error-report.ts` imports only `log-types`/`log-format` (pure); `error-log-store.ts` imports only `pg` + `logger`. No back-import onto API/component layers.
- **S3 (hostnames):** No `*.mentolder.de` / `*.korczewski.de` literals in `website/src/**` or `k3d/`. The retention CronJob targets the in-cluster DNS name `website.website.svc.cluster.local` (same target the manifests.bats T000295 guard requires); the trigger endpoint path is brand-agnostic.
- **S4 (orphans):** `k3d/error-log-retention-cronjob.yaml` is registered in `k3d/kustomization.yaml`; no orphan scripts introduced.
- **CQ02 (any):** No net increase in explicit `any` in `website/src/**` (limit ≤ 200). All new exports are fully typed — no `as any`, no `catch (e: any)`.
- **Fail-soft invariant:** Every persistence path (`persistError`, browser POST, pod POST, the extra Pino stream) is fire-and-forget with an internal try/catch; an insert/network failure logs via `logger.error` and never propagates into the server response, browser error handling, or pod stream.

## File Structure

New files:

- `website/src/db/migrations/20260703_create_error_log.sql` — `error_log` table (columns per delta-spec), `CHECK (source IN ('server','browser','pod'))`, index `ts DESC`, `OWNER TO website` + grants (mirrors `20260621_create_ai_call_log.sql`).
- `website/src/db/migrations/error-log-schema.test.ts` — structural Vitest over the migration SQL (columns, CHECK, index, owner/grants).
- `website/src/lib/logging/error-log-store.ts` — `persistError(entry)`: fire-and-forget `INSERT` into `error_log`; internal try/catch + `logger.error`.
- `website/src/lib/logging/error-log-store.test.ts` — store unit test (SQL/params, insert failure does not throw).
- `website/src/lib/logging/error-report.ts` — pure/browser client helper: `postError(report)` (fire-and-forget `POST`), `fetchErrorHistory(sinceHours=24)` (`GET ?since=24h` → `LogEntry[]`), `podLineToError(raw, ns, pod)` (classify a pod line via `parsePodLine`; returns a `pod`-source report only for `level==='error'`, else `null`).
- `website/src/lib/logging/error-report.test.ts` — helper unit test (POST shape, GET windowing shape, `podLineToError` error-vs-non-error).
- `website/src/pages/api/admin/ops/error-log.ts` — `POST` (`{ source, message, meta? }` → `persistError`) + `GET ?since=24h` (rows within last 24h, `ts DESC`), both gated by `getSession` + `isAdmin` (401 otherwise).
- `website/src/pages/api/admin/ops/error-log.test.ts` — endpoint test (401 GET/POST, 24h windowing + ordering, POST validation + `persistError` call).
- `website/src/pages/api/cron/error-log-retention.ts` — `POST` gated by `Bearer $CRON_SECRET` (403 otherwise); `DELETE FROM error_log WHERE ts < now() - interval '7 days'`.
- `website/src/pages/api/cron/error-log-retention.test.ts` — endpoint test (403 without secret, deletes with the 7-day interval).
- `k3d/error-log-retention-cronjob.yaml` — daily curl CronJob (notify-unread pattern) → retention endpoint, `CRON_SECRET` from `workspace-secrets`.
- `tests/spec/centralized-logging.bats` — BATS structural test for the retention CronJob manifest (new spec file for the `centralized-logging` SSOT spec).

Modified files:

- `website/src/lib/logger.ts` (Ist 36, limit 600 → Budget 564) — add a third Pino multistream destination that persists `level>=error` lines via `persistError({ source: 'server' })`.
- `website/src/lib/logging/browser-collector.ts` (Ist 81, limit 600 → Budget 519) — after each local `add(makeEntry('error', …))`, also `postError({ source: 'browser', … })`.
- `website/src/lib/logging/browser-collector.test.ts` (existing) — extend with the browser-persist assertion.
- `website/src/components/assistant/LogsSidekickView.svelte` (Ist 240, limit 500 → Budget 260; post-change ~300, < 80% threshold 400) — pod-stream handler calls `postError(podLineToError(...))`; new "Live"/"Letzte 24h" mode toggle that `fetchErrorHistory()` on activation + a manual refresh button, rendered with existing `levelClass`/`levelLabel`; the two modes never share a list.
- `website/src/components/assistant/LogsSidekickView.test.ts` (new alongside existing component tests) — mode-toggle test (switching to 24h calls `fetchErrorHistory`; live SSE entry does not append to the 24h list).
- `k3d/kustomization.yaml` — register `error-log-retention-cronjob.yaml`.
- `prod-korczewski/patch-cronjob-urls.yaml` — add a strategic-merge patch document rewriting the retention CronJob's curl URL from `website.website.svc.cluster.local` to `website.website-korczewski.svc.cluster.local` (analogous to the existing `notify-unread` entry); without it the korczewski overlay's retention job would hit mentolder's website and never purge the korczewski `error_log`. Already registered wholesale via `- path: patch-cronjob-urls.yaml` in `prod-korczewski/kustomization.yaml`, so no per-CronJob entry there is required.
- `website/src/data/test-inventory.json` — regenerated after the test additions (`task test:inventory`).

## Task 1 — CREATE migration `error_log` table (Requirement: Persisted error_log table)

- [ ] Write `website/src/db/migrations/error-log-schema.test.ts` (S1: new `.ts`, limit 600) asserting the migration SQL contains: all seven columns (`id bigserial`, `ts timestamptz DEFAULT now()`, `source text`, `message text`, `namespace text`, `pod_name text`, `meta jsonb`), a `CHECK (source IN ('server','browser','pod'))`, an index on `error_log (ts DESC)`, `ALTER TABLE error_log OWNER TO website`, and `GRANT`s for `website`. Run `npx vitest run website/src/db/migrations/error-log-schema.test.ts` — `expected: FAIL` (migration file does not exist yet).
- [ ] Create `website/src/db/migrations/20260703_create_error_log.sql` (no S1 line limit for `.sql`) modelled on `20260621_create_ai_call_log.sql`: `CREATE TABLE IF NOT EXISTS error_log (...)` with the columns + `CHECK` above, `CREATE INDEX IF NOT EXISTS error_log_ts_idx ON error_log (ts DESC)`, `ALTER TABLE error_log OWNER TO website`, `GRANT SELECT, INSERT, DELETE ON error_log TO website`, `GRANT USAGE, SELECT ON SEQUENCE error_log_id_seq TO website`. Add a header comment noting deploy application via `task db:migrate` (or `kubectl exec` on the `shared-db` pod) and the enforced 7-day retention.
- [ ] Re-run the test — green.

_Deploy note (not a plan-verify step): apply the migration to `shared-db` via `task db:migrate` during rollout; the write paths are fail-soft if the table is briefly absent mid-rollout._

## Task 2 — CREATE `error-log-store.ts` fire-and-forget persistence (Requirement: Fire-and-forget error persistence)

- [ ] Write `website/src/lib/logging/error-log-store.test.ts` (S1: new `.ts`, limit 600): mock `pg` `Pool` + `./logger`; assert (a) a successful `persistError({ source:'server', message:'x', namespace, pod_name, meta })` calls `query` with the parameterised `INSERT INTO error_log (...)` and the right values; (b) when `query` rejects, `persistError(...)` resolves without throwing and calls `logger.error`. Run `npx vitest run website/src/lib/logging/error-log-store.test.ts` — `expected: FAIL` (module missing).
- [ ] Create `website/src/lib/logging/error-log-store.ts` (S1: new `.ts`, limit 600, target ~55 lines): export `interface ErrorLogEntry { source: 'server'|'browser'|'pod'; message: string; namespace?: string; pod_name?: string; meta?: Record<string, unknown> }` and `async function persistError(entry: ErrorLogEntry): Promise<void>` using a lazy `Pool` (like `ai-metrics.ts`), parameterised `INSERT`, internal try/catch → `logger.error({ err }, '[error-log] persistError insert failed')`. Fully typed (CQ02).
- [ ] Re-run the test — green.

## Task 3 — EXTEND `logger.ts` with server error persistence stream (Requirement: Fire-and-forget error persistence)

- [ ] Write `website/src/lib/logger.test.ts` (S1: new `.ts`, limit 600): mock `./logging/error-log-store` `persistError`; import `logger`, call `logger.error({ foo: 1 }, 'boom')`, assert `persistError` was called once with `source: 'server'`, `message: 'boom'` (meta carrying the residual bindings); assert `logger.info('ok')` does NOT call `persistError`. Run `npx vitest run website/src/lib/logger.test.ts` — `expected: FAIL` (no error stream yet).
- [ ] Edit `website/src/lib/logger.ts` (Ist 36 → ~54, Budget 564): add a third multistream destination `{ stream: errorPersistStream, level: 'error' }` whose `write(line)` parses the pino JSON line via `parsePinoLine(line, 'server')` and calls `void persistError({ source: 'server', message: entry.message, meta: entry.meta })`. Keep `stdout` + `bufferStream` unchanged. Guard the write in try/catch so a parse/persist error never breaks logging.
- [ ] Re-run the test — green.

## Task 4 — CREATE admin-gated `error-log.ts` API (Requirement: Admin-gated error log API)

- [ ] Write `website/src/pages/api/admin/ops/error-log.test.ts` (S1: new `.ts`, limit 600) modelled on `ai-quality.test.ts` (mock `pg`, `../../../../../lib/auth`, `../../../../../lib/logging/error-log-store`): (a) `GET` and `POST` return `401` without an admin session; (b) admin `GET ?since=24h` issues a query filtering `ts >= now() - interval '24 hours'` ordered `ts DESC` and returns the rows as `LogEntry[]`; (c) admin `POST { source:'browser', message:'TypeError: x' }` returns `2xx` and calls `persistError` with that payload; (d) `POST` with a missing/invalid `source` or empty `message` returns `400`. Run `npx vitest run website/src/pages/api/admin/ops/error-log.test.ts` — `expected: FAIL` (route missing).
- [ ] Create `website/src/pages/api/admin/ops/error-log.ts` (S1: new `.ts`, limit 600, target ~90 lines): `POST` + `GET` `APIRoute`s, both starting with the `getSession(cookie)` + `isAdmin` gate returning `401` (pattern from `server-logs/stream.ts`). `POST` validates `{ source ∈ {browser,pod}, message:non-empty, namespace?, pod_name?, meta? }` (400 on invalid) then `await persistError(...)`. `GET` reads `since` (only `24h` supported), queries `error_log` for the last 24h `ORDER BY ts DESC`, maps rows to `LogEntry` (`ts` → epoch ms, `level:'error'`), returns JSON. Fully typed (CQ02).
- [ ] Re-run the test — green.

## Task 5 — CREATE `error-report.ts` client helper (Requirements: Browser error capture persists to error_log; Pod stream error lines persist during active observation; 24h error history view)

- [ ] Write `website/src/lib/logging/error-report.test.ts` (S1: new `.ts`, limit 600, jsdom project): mock `fetch`; assert (a) `postError({ source:'browser', message:'m' })` issues one `POST /api/admin/ops/error-log` (`credentials:'same-origin'`, JSON body) and never throws even if `fetch` rejects; (b) `fetchErrorHistory()` calls `GET /api/admin/ops/error-log?since=24h` and returns the parsed `LogEntry[]`; (c) `podLineToError('...error...', 'workspace', 'website-abc')` returns `{ source:'pod', message, namespace:'workspace', pod_name:'website-abc' }` for an error line and `null` for a non-error line (via `parsePodLine`/`textToLevel`). Run `npx vitest run website/src/lib/logging/error-report.test.ts` — `expected: FAIL` (module missing).
- [ ] Create `website/src/lib/logging/error-report.ts` (S1: new `.ts`, limit 600, target ~55 lines): `postError(report)` (fire-and-forget `fetch` POST, internal `.catch()`), `async fetchErrorHistory(sinceHours = 24): Promise<LogEntry[]>` (GET, returns `[]` on non-OK), `podLineToError(raw, ns, pod): ErrorReport | null` (pure; uses `parsePodLine` from `log-format.ts`). Imports only `log-types`/`log-format` (S2 leaf). Fully typed (CQ02).
- [ ] Re-run the test — green.

## Task 6 — EXTEND `browser-collector.ts` to persist browser errors (Requirement: Browser error capture persists to error_log)

- [ ] Extend `website/src/lib/logging/browser-collector.test.ts` (existing; S1 stays under limit): mock `./error-report` `postError`; after dispatching a synthetic `error` (and `unhandledrejection`) event through the injected target, assert the local `add` is still called AND `postError` is called once with `source:'browser'` and the same message. Run `npx vitest run website/src/lib/logging/browser-collector.test.ts` — `expected: FAIL` (no `postError` wiring yet).
- [ ] Edit `website/src/lib/logging/browser-collector.ts` (Ist 81 → ~93, Budget 519): in `onError`/`onRejection`, after the existing `add(makeEntry('error', …))`, also call `postError({ source:'browser', message, meta })`. Import `postError` from `./error-report`. No behaviour change to the live-store path.
- [ ] Re-run the test — green.

## Task 7 — EXTEND `LogsSidekickView.svelte`: pod persistence + 24h mode (Requirements: Pod stream error lines persist during active observation; 24h error history view in the sidekick)

- [ ] Write `website/src/components/assistant/LogsSidekickView.test.ts` (S1: new `.ts`, limit 600, jsdom project) modelled on existing component tests (e.g. `PortalSidekick.test.ts`): mock `../../lib/logging/error-report` and `../../lib/logging/log-streams`; render the component, (a) assert a "Letzte 24h" toggle control exists and switching to it calls `fetchErrorHistory` and renders the returned entries; (b) assert that while in "Letzte 24h" mode a new live entry pushed into `logEntries` does NOT appear in the 24h list (modes stay separate). Run `npx vitest run website/src/components/assistant/LogsSidekickView.test.ts` — `expected: FAIL` (toggle/wiring missing).
- [ ] Edit `website/src/components/assistant/LogsSidekickView.svelte` (Ist 240 → ~300, Budget 260): (1) in the pod stream open path, pass a per-line callback that computes `postError(podLineToError(line, ns, selectedPod))` when non-null (only while the stream is open — no background capture); (2) add `let mode = $state<'live'|'history'>('live')` with a two-button toggle above the existing chips; in `'history'` mode fetch via `fetchErrorHistory()` on activation and on a manual "Aktualisieren" button, store results in a separate `$state` array (never merged into `$logEntries`), and render them with the existing `levelClass`/`levelLabel`/source styling; the live list renders only in `'live'` mode. Keep the change net under Budget 260 — if it would exceed, extract the history-panel markup/state into a child component `website/src/components/assistant/ErrorHistoryView.svelte` (S1 `.svelte` limit 500) rather than growing this file.
- [ ] Re-run the component test — green.

## Task 8 — CREATE `CRON_SECRET`-gated retention endpoint (Requirement: Automated error_log retention)

- [ ] Write `website/src/pages/api/cron/error-log-retention.test.ts` (S1: new `.ts`, limit 600) modelled on the notify-unread/cron auth pattern: mock `pg`; assert (a) `POST` without `Authorization: Bearer <CRON_SECRET>` returns `403`; (b) `POST` with the correct bearer issues `DELETE FROM error_log WHERE ts < now() - interval '7 days'` and returns a JSON `{ deleted }` `2xx`. Run `npx vitest run website/src/pages/api/cron/error-log-retention.test.ts` — `expected: FAIL` (route missing).
- [ ] Create `website/src/pages/api/cron/error-log-retention.ts` (S1: new `.ts`, limit 600, target ~40 lines): `POST` `APIRoute` reading `CRON_SECRET` from env, checking `Authorization` bearer (403 mismatch, pattern from `notify-unread.ts`), running the 7-day `DELETE`, returning `{ deleted: rowCount }` JSON; errors logged via the request logger, never thrown. Fully typed (CQ02).
- [ ] Re-run the test — green.

## Task 9 — CREATE retention CronJob manifest + Kustomize registration + BATS guard (Requirement: Automated error_log retention)

- [ ] Write `tests/spec/centralized-logging.bats` (new spec file for the `centralized-logging` SSOT spec) with a structural test asserting `k3d/error-log-retention-cronjob.yaml` exists, is `kind: CronJob` with a daily `schedule`, curls the retention endpoint at `website.website.svc.cluster.local/api/cron/error-log-retention` (not the `workspace` ns — mirrors the T000295 guard), and sources `CRON_SECRET` from `secretKeyRef`. Run `./tests/runner.sh local centralized-logging` (or `bats tests/spec/centralized-logging.bats`) — `expected: FAIL` (manifest missing).
- [ ] Create `k3d/error-log-retention-cronjob.yaml` (no S1 line limit for `.yaml`) modelled on `k3d/notify-unread-cronjob.yaml`: `namespace: workspace`, daily `schedule: '0 3 * * *'`, `concurrencyPolicy: Forbid`, hardened `securityContext` (runAsNonRoot 65534, drop ALL caps), `curlimages/curl` (pinned by digest), `curl -sf -X POST -H "Authorization: Bearer $CRON_SECRET" http://website.website.svc.cluster.local/api/cron/error-log-retention`, `CRON_SECRET` via `secretKeyRef: workspace-secrets`.
- [ ] Register the manifest in `k3d/kustomization.yaml` — add `- error-log-retention-cronjob.yaml` in the cronjobs block (next to `notify-unread-cronjob.yaml`).
- [ ] Add the korczewski URL-rewrite patch to `prod-korczewski/patch-cronjob-urls.yaml` (no S1 line limit for `.yaml`): append a new strategic-merge document (after the existing `notify-unread` entry, modelled on it) — `kind: CronJob`, `metadata.name: error-log-retention`, `namespace: workspace`, whose container `command` curls `http://website.website-korczewski.svc.cluster.local/api/cron/error-log-retention` (same container name and `Authorization: Bearer $CRON_SECRET` shape as the base manifest, so strategic-merge matches). This rewrites the base's hardcoded `website.website.svc.cluster.local` — the Kustomize `namespace:` transformer only rewrites real `namespace:` fields, not string literals in `command` args, so without this patch the korczewski overlay's retention job would call mentolder's website and never purge the korczewski `error_log`. No `prod-korczewski/kustomization.yaml` change is needed: `patch-cronjob-urls.yaml` is already registered wholesale via `- path: patch-cronjob-urls.yaml`, so the new document is consumed automatically.
- [ ] Run `task workspace:validate` to confirm the overlay renders; additionally build the korczewski overlay (`kubectl kustomize prod-korczewski` or the equivalent `task`) and confirm the `error-log-retention` CronJob's curl URL resolves to `website.website-korczewski.svc.cluster.local`; re-run the BATS test — green.

## Task 10 — Verify + freshness + inventory (final)

- [ ] Regenerate the test inventory after the new test files and commit it: `task test:inventory` then commit `website/src/data/test-inventory.json`.
- [ ] Run the mandatory verification commands and confirm each is green before opening the PR:

```bash
task test:changed          # targeted vitest --changed + BATS selection + quality for website/observability
task freshness:regenerate  # refresh generated artefacts (test-inventory, repo-index, …)
task freshness:check       # CI-equivalent: freshness + quality:check (S1–S4 ratchet) + baseline assertion
```

- [ ] Confirm the CQ02 any-budget did not grow:

```bash
bash -c "count=\$(grep -rn ': any\|<any>\|as any' website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l | tr -d ' '); echo \"any count: \$count (limit: 200)\"; [ \$count -le 200 ]"
```

- [ ] Confirm the OpenSpec change tree still validates: `task test:openspec` (or `bash scripts/openspec.sh validate`).
- [ ] Run `task workspace:validate` a final time (manifest change) and the logging spec BATS: `bats tests/spec/centralized-logging.bats`.
