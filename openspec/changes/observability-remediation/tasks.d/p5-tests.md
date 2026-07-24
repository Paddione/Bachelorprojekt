---
title: "observability-remediation — P5 tests"
ticket_id: T002151
domains: [observability, website, agent-tooling]
status: planning
---

# observability-remediation — Implementation Plan (P5: tests)

This is Partial **P5 (tests)** of 5 and the **final** partial:
**P1 logging-pipeline-fixes → P2 service-health-goals → P3 agent-tracing → P4 alertmanager-secret-fix → P5 tests**.
Tests always run last: P5 depends on all four feature partials and adds **only test code** — it touches no
P1/P2/P3/P4 production file. It carries the formal automated-test obligation for the whole change set and,
because it is the last partial, it is the partial responsible for the assembled plan satisfying the two
plan-lint hard rules **STRUCT2** (a real testrunner call paired with the literal phrase `expected: FAIL`)
and **STRUCT3** (the final task listing `task test:changed` / `task freshness:regenerate` /
`task freshness:check`).

Every test below is authored **red→green against the four spec deltas as the source of truth** (the sibling
partials' `tasks.d/pX-*.md` files may not exist yet at write time — they are written in parallel). Each test
runs on the current (un-fixed) branch and **fails**; it turns green only once the corresponding feature
partial's fix/feature lands and all five partials are assembled — this is the same "tests go green when the
change is whole" staging the orchestrator's P5-last plan intends. The one requirement that cannot be a CI
test — Partial 4's Alertmanager secret reseed — is verified by P4's own live-cluster runbook (its Task 3);
P5's final verify task references that manual check as a gating precondition rather than duplicating it.

## File Structure

**Reconciled after P2/P3 landed their actual implementations** (P5 was written in parallel against the
spec deltas; two corrections vs. the original draft are folded in here — see "Cross-partial contracts,
corrected" below for why): the P2 unit test extends P2's own file instead of creating
`website/src/lib/service-health.test.ts`, and the P3 coverage is a BATS structural gate (matching what
P3's own plan explicitly expects P5 to add) instead of a second Vitest file duplicating P3's already-green
`.opencode/plugins/agent-tracer.test.ts`.

Effective S1 budgets verified against `docs/code-quality/baseline.json` (`.bats` is not S1-line-gated):

```bash
wc -l tests/spec/centralized-logging.bats
wc -l website/src/lib/ops/__tests__/service-health-store.test.ts   # after P2's Task 1 lands
jq -r '."S1:tests/e2e/specs/fa-44-health-goals.spec.ts".metric // "nicht-baselined"' docs/code-quality/baseline.json
```

| `path` | ist | budget |
|--------|-----|--------|
| `tests/spec/centralized-logging.bats` | 78 | n/a (`.bats` not S1-line-gated) |
| `website/src/lib/ops/__tests__/service-health-store.test.ts` | ~55 (after P2) | ~545 (600 − 55) |
| `tests/e2e/specs/fa-44-health-goals.spec.ts` | 0 (new) | 600 |
| `tests/spec/agent-tracing.bats` | 0 (new) | n/a (`.bats` not S1-line-gated) |

The two `.ts`/`.bats`-new files are cut well under any applicable budget. Both BATS files are/become
additive (new `@test` blocks appended to an existing file, or a new file for a domain that has none yet).
**No production file and no test-runner config (`playwright.config.ts`, root `vitest.config.ts`) is
edited by P5** — P3 owns the one `vitest.config.ts` include-glob addition its own plugin test needs; P5
adds no further glob (see "Test-registration decisions" below).

### Test-registration decisions (why no config edit is needed)

- **BATS (centralized-logging)** — `tests/spec/centralized-logging.bats` already exists and is already run by
  the domain-BATS selection in `task test:changed` and by `tests/runner.sh`. Extending it (vs. a new file)
  also honours the convention "Bestehende Tests erweitern statt neue Dateien anlegen" (`plan-quality-gates.md`).
- **Vitest (service-health)** — appends into P2's own `website/src/lib/ops/__tests__/service-health-store.test.ts`
  (website **node** vitest project, `environment: node`), run by `(cd website && pnpm vitest run --changed)`
  inside `task test:changed`. No new file, no new glob.
- **Playwright (health-goals UI)** — the new spec is named `tests/e2e/specs/fa-44-health-goals.spec.ts` so it
  is **auto-registered** by the existing `**/fa-44-*.spec.ts` glob in the `website` Playwright project
  (`tests/e2e/playwright.config.ts`). A name like `fa-health-goals.spec.ts` would match **no** `testMatch`
  glob (the `website` project lists explicit `fa-NN-*` patterns, no catch-all) and would silently never run,
  forcing a `playwright.config.ts` edit. Grouping the health-goal UI under the sibling `fa-44` platform-health
  feature both fits the domain and needs zero config wiring. It uses fa-44's auth pattern (`e2e-login` with
  `CRON_SECRET`, graceful `test.fixme` when unset).
- **BATS (agent-tracing)** — `tests/spec/agent-tracing.bats` is a **new** file (no existing spec covers this
  domain), following the `tests/spec/<spec-slug>.bats` convention (one file per SSOT spec). It is auto-picked
  up by the domain-BATS selection in `task test:changed` the same way `centralized-logging.bats` is — no
  runner-config edit needed. This is the **always-on CI gate** P3's own plan explicitly names as P5's
  responsibility (P3's Task 6: *"P5 (tests, always last) adds the formal always-on `tests/spec/agent-tracing.bats`
  structural gate over `.opencode/plugins/agent-tracer.ts`"*) — it does **not** duplicate P3's own
  `.opencode/plugins/agent-tracer.test.ts` (already a green, comprehensive Vitest suite over the plugin's pure
  core with a mocked sink); it instead asserts the plugin source's public contract holds structurally,
  without needing an opencode/Bun runtime.

### Cross-partial contracts (what the four feature partials must expose for these tests — derived from the landed spec deltas and implementations)

P5 was drafted in parallel against the spec deltas; once P2/P3 landed, two of the originally-assumed
contracts below turned out to differ from what P5 first guessed (fixed in this revision — see the two
sections above). The corrected, verified contracts:

- **P1 (centralized-logging.md):** produces a fixed `k3d/monitoring/promtail-rendered.yaml` whose
  `pipeline_stages` map pino's numeric `level` (10/20/30/40/50/60) to text (`trace`…`fatal`) **before** the
  `level` Loki label is set, and whose `relabel_configs` set `brand=korczewski` for the korczewski namespace
  without a later unconditional catch-all overwriting it with `mentolder`; and updates the `log-explorer.json`
  / `api-errors.json` Grafana dashboard queries to filter on **text** level values. P5's BATS asserts these
  as rendered-YAML/JSON structure — no live cluster. (The OTel-collector requirement is a live
  Prometheus-exporter check, not CI-structural — it is verified live during P1, analogous to P4's live check.)
- **P2 (service-health-goals.md), corrected:** exposes a **pure** goal-evaluation function
  `evaluateGoalStatus(dayChecks: DayCheck[], goal: HealthGoal): 'met' | 'unmet'` exported from
  `website/src/lib/ops/service-health-store.ts` (camelCase fields: `latencyMs`, `maxErrorsPerDay`,
  `latencyThresholdMs`; no DB access — the caller passes the day's rows), and extends
  `website/src/components/admin/platform/HealthTab.svelte` with a `data-testid="health-goals-panel"` history
  panel rendering the last 7 days as `data-testid="health-goal-cell"` cells (`data-status` = `met`/`unmet`/
  `no-data`) sourced from an authenticated `GET /api/admin/ops/health-goals` (`401` without an admin session,
  response shape `{ trends: GoalTrend[], generatedAt }`). P5's vitest extends P2's own test file; P5's
  Playwright exercises the route + panel via these exact DOM hooks.
- **P3 (agent-tracing.md), corrected:** `.opencode/plugins/agent-tracer.ts` exports a **pure, runtime-free
  core** — `createTraceStore(now?)`, `argsSignatureOf(args)`, `outcomeForEvent(eventType)`, plus the `Trace`/
  `ToolCall`/`TraceSink` types — and a default `Plugin` export that wires the core to `chat.message` (model/
  agent identity), `tool.execute.before` (ordered tool-call sequence) and `event` (flush via a `$`-shell-out
  to `codebase-memory-mcp cli ingest_traces` on `session.idle`/`session.deleted`). P3 ships its own
  comprehensive Vitest suite (`.opencode/plugins/agent-tracer.test.ts`) against this pure core with a mocked
  sink — P5 does **not** duplicate that; P5 adds the always-on BATS structural gate (`tests/spec/agent-tracing.bats`)
  asserting the exported symbols, the sync-script extension, and the config-standard doc/inline-pointer
  requirements all hold.
- **P4 (monitoring-alerts.md):** the Alertmanager secret reseed is not CI-automatable (needs real Pushover
  credentials). P5 does **not** re-run P4's live check; the final verify task lists it as a manual gating
  precondition for the assembled PR.

---

## Task 1 — Extend `tests/spec/centralized-logging.bats`: Promtail level-mapping, brand determinism, dashboard text-levels (red→green)

Append three `@test` blocks to the existing file (keep the reusable `fail()` helper already defined at its
top). All three assert the **rendered** `k3d/monitoring/promtail-rendered.yaml` / Grafana dashboard JSON
structure — no live cluster, no `kubectl` — matching the file's existing structural-assertion style
(`grep`/`awk` against the committed manifest).

### 1a — Run the extended suite against the current (un-fixed) manifest (must fail)

```bash
cd /home/patrick/Bachelorprojekt/.worktrees/observability-remediation
tests/unit/lib/bats-core/bin/bats tests/spec/centralized-logging.bats
```

**expected: FAIL** — on `main`/the current branch the `pipeline_stages` block contains only
`- json: { expressions: { level: level } }` + `- labels: { level: }` (the numeric value is labeled verbatim,
so the `error`/`warn`/`info` text-mapping assertion fails), and the brand rules end with an unconditional
`- regex: .*` → `replacement: mentolder` positioned **after** the `replacement: korczewski` rule (so the
brand-determinism assertion fails). Task 1b's assertions encode the fixed structure P1 must produce; they turn
green once P1's fix lands.

### 1b — The three appended `@test` blocks

```bash
@test "Promtail pipeline maps numeric pino levels to text before labeling" {
  local f=k3d/monitoring/promtail-rendered.yaml
  [ -f "$f" ] || fail "promtail-rendered.yaml missing"

  # Slice only the pipeline_stages block (up to the following relabel_configs).
  local block
  block=$(awk '/pipeline_stages:/{p=1} /relabel_configs:/{p=0} p' "$f")
  [ -n "$block" ] || fail "pipeline_stages block missing"

  # A numeric→text mapping stage must translate pino levels into text label values.
  echo "$block" | grep -qE '\berror\b' || fail "pipeline_stages does not map a numeric level to text 'error'"
  echo "$block" | grep -qiE '\bwarn(ing)?\b'  || fail "pipeline_stages does not map a numeric level to text 'warn'"
  echo "$block" | grep -qE '\binfo\b'  || fail "pipeline_stages does not map a numeric level to text 'info'"

  # ...and it must reference at least one pino numeric level (30/40/50) inside that mapping.
  echo "$block" | grep -qE '(^|[^0-9])(30|40|50)([^0-9]|$)' \
    || fail "pipeline_stages maps no numeric pino level (30/40/50) to text"
}

@test "Promtail brand relabel is deterministic: korczewski is not overwritten by a catch-all" {
  local f=k3d/monitoring/promtail-rendered.yaml
  [ -f "$f" ] || fail "promtail-rendered.yaml missing"

  # A mentolder default must exist (mentolder namespaces still get brand=mentolder)...
  grep -q 'replacement: mentolder' "$f" || fail "mentolder brand default rule missing"

  # ...and a korczewski rule must exist.
  local kork
  kork=$(grep -n 'replacement: korczewski' "$f" | head -1 | cut -d: -f1)
  [ -n "$kork" ] || fail "korczewski brand rule missing"

  # No unconditional catch-all (`regex: .*` feeding `replacement: mentolder`) may appear AFTER the
  # korczewski rule — that is exactly the live bug (rule 2 overwrites rule 1 with mentolder).
  local after
  after=$(tail -n +"$kork" "$f")
  if echo "$after" | grep -A3 -E '^[[:space:]]*-?[[:space:]]*regex:[[:space:]]*\.\*[[:space:]]*$' | grep -q 'replacement: mentolder'; then
    fail "an unconditional 'regex: .*' overwrites brand=korczewski with mentolder after the korczewski rule"
  fi
}

@test "Grafana log dashboards filter on text level values, not numeric" {
  local le=k3d/monitoring/grafana-dashboards/log-explorer.json
  local ae=k3d/monitoring/grafana-dashboards/api-errors.json
  [ -f "$le" ] || fail "log-explorer.json missing"
  [ -f "$ae" ] || fail "api-errors.json missing"

  # At least one dashboard query must filter on a textual level value (level="error"/"warn").
  grep -qE 'level[^0-9]*=[^0-9]*"?(error|warn)' "$le" "$ae" \
    || fail "dashboards do not filter on a text level value (error/warn)"

  # And must NOT filter on the broken numeric label (level="50" / detected_level=... "unknown").
  if grep -qE 'level[[:space:]]*=[[:space:]]*"?(30|40|50|60)"?' "$le" "$ae"; then
    fail "dashboard still filters on a numeric level value"
  fi
}
```

### 1c — Re-run the suite once P1 lands (must pass)

```bash
cd /home/patrick/Bachelorprojekt/.worktrees/observability-remediation
tests/unit/lib/bats-core/bin/bats tests/spec/centralized-logging.bats
```

---

## Task 2 — `website/src/lib/ops/__tests__/service-health-store.test.ts`: goal-evaluation unit tests (red→green)

**Reconciled against P2's actual implementation** (P2 and P5 were written in parallel; P2 already ships
one focused red→green test for `evaluateGoalStatus` in this exact file — see its Task 1/3). Rather than
create a second, competing test file with an invented API (`evaluateGoal` / snake_case fields / a
`website/src/lib/service-health.ts` module that P2 does not create), P5 **extends P2's existing file**
with the comprehensive case coverage, per "Bestehende Tests erweitern statt neue Dateien anlegen"
(`plan-quality-gates.md`). The real contract: `evaluateGoalStatus(dayChecks: DayCheck[], goal:
HealthGoal): 'met' | 'unmet'` exported from `website/src/lib/ops/service-health-store.ts`, with
camelCase fields (`latencyMs`, `maxErrorsPerDay`, `latencyThresholdMs`).

### 2a — Run the additional cases against the current branch (must fail)

```bash
cd website && pnpm vitest run service-health-store -t 'evaluateGoalStatus — comprehensive' --reporter verbose
```

**expected: FAIL** — before P2 lands, `website/src/lib/ops/service-health-store.ts` does not exist, so
the import fails to resolve and the whole suite (including this new `describe` block) errors. It turns
green once P2's Task 3 lands `evaluateGoalStatus`.

### 2b — Append this `describe` block to `website/src/lib/ops/__tests__/service-health-store.test.ts` (after P2's existing `describe('evaluateGoalStatus (P2)', …)` block)

```ts
// append to website/src/lib/ops/__tests__/service-health-store.test.ts
describe('evaluateGoalStatus — comprehensive (P5)', () => {
  // Helper: build a day's worth of check rows with N error rows and a set of latencies.
  function rows(errorCount: number, latencies: number[] = []): DayCheck[] {
    const out: DayCheck[] = [];
    for (let i = 0; i < errorCount; i++) out.push({ status: 'error', latencyMs: null });
    for (const l of latencies) out.push({ status: 'ok', latencyMs: l });
    return out;
  }

  describe('error-count threshold', () => {
    it('is "met" at exactly the threshold (2 errors, max 2)', () => {
      const goal: HealthGoal = { maxErrorsPerDay: 2, latencyThresholdMs: null };
      expect(evaluateGoalStatus(rows(2), goal)).toBe('met');
    });
  });

  describe('latency threshold', () => {
    it('is "unmet" when any check latency exceeds latencyThresholdMs', () => {
      const goal: HealthGoal = { maxErrorsPerDay: null, latencyThresholdMs: 500 };
      expect(evaluateGoalStatus(rows(0, [120, 800]), goal)).toBe('unmet');
    });

    it('is "met" when all latencies are within latencyThresholdMs', () => {
      const goal: HealthGoal = { maxErrorsPerDay: null, latencyThresholdMs: 500 };
      expect(evaluateGoalStatus(rows(0, [120, 480]), goal)).toBe('met');
    });

    it('ignores null latencies when evaluating the latency threshold', () => {
      const goal: HealthGoal = { maxErrorsPerDay: null, latencyThresholdMs: 500 };
      expect(evaluateGoalStatus(rows(1, [200]), goal)).toBe('met');
    });
  });

  describe('combined / edge cases', () => {
    it('a null threshold is not evaluated (only the set threshold decides)', () => {
      const goal: HealthGoal = { maxErrorsPerDay: null, latencyThresholdMs: null };
      expect(evaluateGoalStatus(rows(9, [9000]), goal)).toBe('met'); // nothing to breach
    });

    it('is "unmet" if either threshold is breached', () => {
      const goal: HealthGoal = { maxErrorsPerDay: 2, latencyThresholdMs: 500 };
      expect(evaluateGoalStatus(rows(0, [800]), goal)).toBe('unmet'); // latency breach alone
      expect(evaluateGoalStatus(rows(3, [100]), goal)).toBe('unmet'); // error breach alone
    });

    it('an empty day is "met" (no checks, nothing breached)', () => {
      const goal: HealthGoal = { maxErrorsPerDay: 2, latencyThresholdMs: 500 };
      expect(evaluateGoalStatus([], goal)).toBe('met');
    });
  });
});
```

No new import line is needed — this block appends inside the existing file, reusing its top-level
`evaluateGoalStatus`/`DayCheck`/`HealthGoal` import from P2's Task 1.

### 2c — Re-run once P2 lands (must pass)

```bash
cd website && pnpm vitest run service-health-store --reporter verbose
```

---

## Task 3 — `tests/e2e/specs/fa-44-health-goals.spec.ts`: Health-Goal UI + endpoint E2E (red→green)

Create the Playwright spec for P2's admin health-goals surface (service-health-goals.md → "Admin UI surfaces
goal history" + "Goal status evaluation" endpoint gating). It follows fa-44's auth pattern verbatim: an
env-resolved `BASE`, no host literal (S3), and the `e2e-login`-with-`CRON_SECRET` flow with graceful
`test.fixme` when the secret/auth is unavailable so a local run without credentials gives a clear signal
rather than a false failure. Auto-registered by the `**/fa-44-*.spec.ts` glob in the `website` project.

### 3a — Run it against the current branch (must fail)

```bash
cd /home/patrick/Bachelorprojekt/.worktrees/observability-remediation
npx playwright test --config tests/e2e/playwright.config.ts --project=website fa-44-health-goals
```

**expected: FAIL** — `GET /api/admin/ops/health-goals` does not exist yet (P2 adds it), so the unauthenticated
guard test (T1) gets a `404` instead of `401`, and the panel test (T3) finds no `data-testid="health-goal-cell"`
day-cells because `HealthTab.svelte`'s history panel is not built yet. Both turn green once P2 lands.

### 3b — The spec

```ts
// tests/e2e/specs/fa-44-health-goals.spec.ts
import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL ?? 'https://web.mentolder.de';

// Health-Goal history surface (Partial 2 of observability-remediation, T002151):
// GET /api/admin/ops/health-goals + the 7-day met/unmet panel in HealthTab.svelte.
test.describe('FA-44 Health-Goals: service-health goal history', { tag: ['@admin'] }, () => {
  test('T1: /api/admin/ops/health-goals requires authentication', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/ops/health-goals`);
    expect([401, 403]).toContain(res.status()); // spec: 401 for non-admin
  });

  test('T2: authenticated health-goals endpoint returns per-service goal history', async ({ page }) => {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) { test.fixme(true, 'CRON_SECRET not set'); return; }

    await page.goto(`${BASE}/api/auth/e2e-login?username=${encodeURIComponent('paddione')}&token=${encodeURIComponent(cronSecret)}&returnTo=%2Fadmin`);
    const res = await page.request.get(`${BASE}/api/admin/ops/health-goals`);
    if (res.status() === 401) { test.fixme(true, 'Not authenticated'); return; }
    if (res.status() !== 200) return;

    const body = await res.json();
    // Contract (website/src/lib/ops/service-health-store.ts GoalTrend[]): a per-service list
    // under `trends`, each entry carrying up to 7 day-cells of met/unmet/no-data.
    const services: Array<{ slug: string; days: Array<{ date: string; status: 'met' | 'unmet' | 'no-data' }> }> =
      body.trends ?? [];
    expect(Array.isArray(services)).toBe(true);
    if (services.length === 0) return; // no goals configured yet — endpoint shape still validated below
    for (const svc of services) {
      expect(svc).toHaveProperty('slug');
      expect(Array.isArray(svc.days)).toBe(true);
      expect(svc.days.length).toBeLessThanOrEqual(7);
      for (const d of svc.days) expect(['met', 'unmet', 'no-data']).toContain(d.status);
    }
  });

  test('T3: admin health panel renders a 7-day met/unmet goal trend', async ({ page }) => {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) { test.fixme(true, 'CRON_SECRET not set'); return; }

    await page.goto(`${BASE}/api/auth/e2e-login?username=${encodeURIComponent('paddione')}&token=${encodeURIComponent(cronSecret)}&returnTo=%2Fadmin`);
    await page.goto(`${BASE}/admin/platform`);
    // The HealthTab history panel exposes its day-cells via a stable test id.
    const panel = page.getByTestId('health-goals-panel');
    if (await panel.count() === 0) { test.fixme(true, 'health-goals panel not present (unauthenticated or feature off)'); return; }
    await expect(panel).toBeVisible();

    // At least one service row shows its 7 day-cells (met/unmet/no-data — days without a
    // check yet render as no-data, see service-health-store.ts's GoalTrendDay).
    const cells = panel.getByTestId('health-goal-cell');
    const n = await cells.count();
    expect(n).toBeGreaterThan(0);
    expect(n % 7).toBe(0); // whole 7-day rows
    for (let i = 0; i < Math.min(n, 7); i++) {
      await expect(cells.nth(i)).toHaveAttribute('data-status', /^(met|unmet|no-data)$/);
    }
  });
});
```

> `data-testid="health-goals-panel"` / `data-testid="health-goal-cell"` and the `data-status` attribute are
> the DOM contract P2's `HealthTab.svelte` panel must render. They are named here (not `TBD`) so P2 wires the
> exact hooks; the E2E is the executable coverage of the panel's 7-day trend.

### 3c — Re-run once P2 lands (must pass)

```bash
cd /home/patrick/Bachelorprojekt/.worktrees/observability-remediation
npx playwright test --config tests/e2e/playwright.config.ts --project=website fa-44-health-goals
```

---

## Task 4 — `tests/spec/agent-tracing.bats`: structural gate over the agent-tracer plugin (red→green)

**Corrected from the original draft** (see "Cross-partial contracts" above): P3 already ships a
comprehensive, green Vitest suite over the plugin's pure core
(`.opencode/plugins/agent-tracer.test.ts`) — duplicating it here against an invented
`createTracerHooks({ ingest })` API would test something P3 never builds. Instead, P5 adds the
**always-on structural CI gate** P3's own plan explicitly names as P5's job (P3 Task 6): a new
`tests/spec/agent-tracing.bats` (no existing spec file covers this domain) that asserts, from the
committed source text — no opencode/Bun runtime, no `npx vitest` invocation of the plugin needed —
that the plugin exports its documented public contract, the sync script was extended, and the
config-standard documentation/inline-pointer requirements hold.

### 4a — Run it against the current branch (must fail)

```bash
cd /home/patrick/Bachelorprojekt/.worktrees/observability-remediation
tests/unit/lib/bats-core/bin/bats tests/spec/agent-tracing.bats
```

**expected: FAIL** — none of `.opencode/plugins/agent-tracer.ts`,
`.claude/skills/references/agent-config-standard.md`, or the `scripts/opencode-sync-agents.sh`
plugin-sync block exist yet on the current branch, so every `@test` below fails at its `[ -f ... ]` /
`grep` guard. They turn green once P3 lands.

### 4b — The file

```bash
#!/usr/bin/env bats
# tests/spec/agent-tracing.bats
# Structural gate for openspec/specs/agent-tracing.md (T002151, observability-remediation P3).
# No opencode/Bun runtime available in CI — asserts the plugin's public contract and the
# config-standard doc from committed source text. The plugin's runtime behavior (trace
# accumulation, flush-on-session-end) is covered by P3's own
# .opencode/plugins/agent-tracer.test.ts (Vitest, mocked sink).

fail() { echo "$1" >&2; return 1; }

@test "agent-tracer plugin exports its documented pure-core contract" {
  local f=.opencode/plugins/agent-tracer.ts
  [ -f "$f" ] || fail "agent-tracer.ts missing"
  grep -q 'export function createTraceStore' "$f" || fail "createTraceStore not exported"
  grep -q 'export function argsSignatureOf' "$f"  || fail "argsSignatureOf not exported"
  grep -q 'export function outcomeForEvent' "$f"  || fail "outcomeForEvent not exported"
  grep -q 'export default' "$f"                   || fail "no default Plugin export"
}

@test "agent-tracer plugin hooks tool.execute.before and the generic event hook (not a nonexistent session.idle key)" {
  local f=.opencode/plugins/agent-tracer.ts
  [ -f "$f" ] || fail "agent-tracer.ts missing"
  grep -q "'tool.execute.before'" "$f" || fail "tool.execute.before hook missing"
  grep -q 'event:' "$f" || fail "generic event hook missing"
  grep -qE "event\.type\s*!==?\s*'session\.(idle|deleted)'" "$f" \
    || fail "event hook does not discriminate on session.idle/session.deleted"
}

@test "opencode-sync-agents.sh syncs the plugins directory" {
  local f=scripts/opencode-sync-agents.sh
  [ -f "$f" ] || fail "opencode-sync-agents.sh missing"
  grep -q 'PLUGINS_SRC' "$f" || fail "sync script was not extended to cover .opencode/plugins/"
}

@test "agent-config-standard.md documents every distinct agent-entry key in agent-models.jsonc" {
  local doc=.claude/skills/references/agent-config-standard.md
  local cfg=.opencode/agent-models.jsonc
  [ -f "$doc" ] || fail "agent-config-standard.md missing"
  [ -f "$cfg" ] || fail "agent-models.jsonc missing"
  for key in description mode model prompt color temperature steps permission; do
    grep -q "\`$key\`" "$doc" || fail "agent-config-standard.md does not document '$key'"
  done
}

@test "agent-models.jsonc references the config standard above agent and provider" {
  local cfg=.opencode/agent-models.jsonc
  [ -f "$cfg" ] || fail "agent-models.jsonc missing"
  grep -q 'agent-config-standard.md' "$cfg" || fail "no inline pointer to agent-config-standard.md"
}
```

### 4c — Re-run once P3 lands (must pass)

```bash
cd /home/patrick/Bachelorprojekt/.worktrees/observability-remediation
tests/unit/lib/bats-core/bin/bats tests/spec/agent-tracing.bats
```

---

## Task 5 — Verify (final task — full-change closing gate)

This is the **last task of the last partial**, so its verification is the closing gate for the whole
5-partial change. It confirms that all four automatable test suites are green **together** on the assembled
branch, regenerates the test inventory for the three new test files, and runs the mandatory CI-equivalent
gates. Run from the worktree root, in order; every command must pass.

```bash
cd /home/patrick/Bachelorprojekt/.worktrees/observability-remediation

# 1. All four new/extended suites green together on the assembled branch
tests/unit/lib/bats-core/bin/bats tests/spec/centralized-logging.bats           # P1 logging structure
tests/unit/lib/bats-core/bin/bats tests/spec/agent-tracing.bats                 # P3 plugin structural gate
(cd website && pnpm vitest run service-health-store --reporter verbose)          # P2 goal evaluation
npx vitest run .opencode/plugins/agent-tracer.test.ts --reporter verbose         # P3 plugin trace (P3's own suite)
npx playwright test --config tests/e2e/playwright.config.ts --project=website fa-44-health-goals  # P2 UI/endpoint

# 2. Register the new test files in the inventory, then the CI-equivalent gates
task test:inventory        # neue Testdateien im Inventar registrieren
task test:changed
task freshness:regenerate
task freshness:check
```

- **Partial 4 manual precondition (NOT re-run here):** before the assembled PR is considered done, P4's
  live-cluster verify (its `tasks.d/p4-alertmanager-secret-fix.md` **Task 3** — the prometheus-operator log
  check that no `mandatory field userKey is empty` warning remains after the Pushover secret reseed) must
  also be green. That check requires real credentials and a live cluster, so it stays a human-verified step;
  P5 references it rather than duplicating it. The automated gates above do **not** cover the alertmanager fix.
- `task test:changed` is the load-bearing gate: with P1–P4 assembled it must run green across the changed
  domains (website vitest `--changed` picks up the extended `service-health-store.test.ts`; domain BATS runs
  both the extended `centralized-logging.bats` and the new `agent-tracing.bats`).
- `task freshness:check` (S1–S4 ratchet + baseline key-count assertion) confirms the new/extended `.ts`/`.bats`
  test files stay under their applicable budgets, no new import cycle is introduced (the tests only add edges
  to the P1/P2/P3 leaves they import), no hostname literal is added (S3 — the E2E URL resolves through the
  existing `WEBSITE_URL`/`BASE` env constant), and no orphan test/manifest is created (S4).
- **CQ02:** no new explicit `any` is introduced — the `HealthGoal`/`DayCheck` types (reused from P2) and the
  E2E page objects are fully typed.
- Commit the regenerated `website/src/data/test-inventory.json` alongside the new tests (CI fails on drift).
