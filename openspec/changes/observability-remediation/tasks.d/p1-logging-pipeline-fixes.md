---
title: "observability-remediation — P1 logging-pipeline-fixes"
ticket_id: T002151
domains: [observability, logging, monitoring]
status: planning
---

# observability-remediation — Implementation Plan (P1: logging-pipeline-fixes)

This is Partial **P1 (logging-pipeline-fixes)** of 5: **P1 logging-pipeline-fixes → P2
service-health-goals → P3 agent-tracing → P4 alertmanager-secret-fix → P5 tests**. P1 owns the
three live-reproduced logging bugs plus the factory-OTel dead-air diagnosis: the Promtail
pipeline (numeric→text `level` mapping + deterministic `brand` relabel order), the two error
dashboards that depend on the text `level` label, and `scripts/factory/otel-emit.cjs`. The
comprehensive BATS/vitest sweep and the CI test-wrapper wiring land in **P5 (tests always last)**;
P1 ships exactly one focused red→green BATS assertion against the rendered Promtail config plus one
additive unit assertion for the otel breadcrumb.

## File Structure

Existing files carry their **verified effective S1 budget** (`wc -l` vs. the extension limit in
`docs/code-quality/gates.yaml`; all four are `nicht-baselined`, so the effective threshold is the
static limit). `.yaml`/`.json`/`.bats` are **not** line-limited by S1 (no extension entry) — their
budget cells are `n/a`.

| `path` | ist | budget |
|--------|-----|--------|
| `k3d/monitoring/promtail-rendered.yaml` | 285 | n/a (.yaml — kein S1-Limit) |
| `k3d/monitoring/grafana-dashboards/log-explorer.json` | 37 | n/a (.json — kein S1-Limit) |
| `k3d/monitoring/grafana-dashboards/api-errors.json` | 44 | n/a (.json — kein S1-Limit) |
| `scripts/factory/otel-emit.cjs` | 91 | 109 |

Test partner (extended, not created): `tests/spec/centralized-logging.bats` (ist 78, `.bats` — kein
S1-Limit) gets **one** focused structural test in this partial; `scripts/factory/otel-emit.test.cjs`
(ist 55, `.cjs`-Limit 200 — reichlich Reserve) gets **one** additive breadcrumb assertion. All four
impact files are already referenced by a `kustomization.yaml`
(`k3d/monitoring/kustomization.yaml:21` for promtail, `.../grafana-dashboards/kustomization.yaml`
for the dashboards) or a runner, so **no S4 orphan** is introduced. `mentolder`/`korczewski` appear
only as **brand-name label values**, never as `*.mentolder.de`/`*.korczewski.de` host literals, so
**no S3** violation. No new `any` types (CQ02 untouched — this partial adds no `website/src` code).

### Diagnosis — factory-OTel dead-air (design.md flagged this as un-diagnosed; here is the root cause)

The design left `monitoring/otel-collector`'s "9 boot lines in 25 days, no payload" deliberately
un-diagnosed. Traced end-to-end:

- **Emit path is correct.** `scripts/factory/pipeline-runner.js:63,151` calls
  `otelEmit.emitPhase(phase, state, { brand, ticket_id })` on every phase transition, wrapped in
  `try { … } catch {}`. `otel-emit.cjs` builds a well-formed OTLP/HTTP-JSON payload, POSTs to
  `${endpoint}/v1/metrics`, parses `OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer …` into the
  `authorization` header, and names the counter `factory.phase.transition`. The collector
  (`k3d/monitoring/otel-collector.yaml`) receives OTLP/HTTP on `:4318` behind `bearertokenauth`,
  runs the `prometheus` exporter with `resource_to_telemetry_conversion: enabled`, so
  `factory.phase.transition` (a monotonic Sum) surfaces as `factory_phase_transition_total` on
  `:8889` — **exactly** the sample the spec scenario asserts. Payload shape is not the bug.
- **Root cause: the endpoint is never configured in the factory host env.** The factory runs
  host-side (`scripts/factory/wakeup.sh:33` sources `FACTORY_ENV_FILE` =
  `${HOME}/.config/factory/autopilot.env`). The only tracked template,
  `scripts/factory/autopilot.env.example:15`, ships the placeholder
  `OTEL_EXPORTER_OTLP_ENDPOINT="https://otel.example.invalid"`. On the live host that line was
  never overridden with the brand's real `otel.<brand-domain>` IngressRoute host
  (`k3d/monitoring/otel-ingressroute.yaml`), so `endpoint()` either returns `null` (unset →
  `emitPhase` returns `{ skipped: true }` before any POST) or resolves the bogus `*.invalid` host
  and the `fetch` NXDOMAINs into the `catch`. Either way the call is a **silent fire-and-forget
  no-op** — nothing reaches the collector, and `post()`/`emitPhase` swallow the outcome, which is
  why it went 25 days undetected.
- **What P1 fixes in-repo vs. what is a documented host action.** The genuine remediation — putting
  the real `https://otel.${OTEL_DOMAIN}` value + `FACTORY_OTLP_TOKEN` into the host's untracked
  `~/.config/factory/autopilot.env` — is an operator action **outside the repo** (same class as
  P4's manual Pushover credential). What P1 lands in-repo, scoped to `otel-emit.cjs`, is an **opt-in
  `OTEL_DEBUG` stderr breadcrumb** so a skipped/failed emit is visible in one line the next time,
  instead of another multi-week mystery. That change is purely additive (no return-value or
  `endpoint()` semantic change), so the five existing `otel-emit.test.cjs` cases — which deliberately
  use `https://otel.example.invalid` as their fetch-mock endpoint — stay green. The live delivery
  assertion (collector `:8889` exposes `factory_phase_transition_total`) is a documented manual
  verify in Task 6, mirroring design.md's testing strategy (Partial-level live-cluster checks are
  not CI-gated).

### Dashboard finding — both already filter on text `level` (the brief's "level=50" assumption was wrong)

Verified against the live files: `log-explorer.json` panel "Error Rate by App" already queries
`{level="error"}`, and `api-errors.json` both panels already query `{app="website", level="error"}`.
They were never numeric — they were simply **starved** because Promtail emitted `level="50"`, so
`level="error"` matched nothing (this *is* the "Error Rate by App returns no data" symptom). The
Promtail mapping stage (Task 2) alone makes them return data. The **only** real, non-cosmetic
dashboard change P1 makes (Task 4) is widening `level="error"` → `level=~"error|fatal"`: the mapping
introduces `fatal` (pino `60`) as a first-class text level that an exact `="error"` match would now
silently miss — a correctness improvement directly enabled by, and consistent with, the new mapping
stage (the spec's "consistent with the Promtail mapping" clause).

---

## Task 1 — Red test: assert the Promtail mapping stage + brand order (FAIL first)

Append two focused `@test`s to the **existing** `tests/spec/centralized-logging.bats` (auto-run in CI
via `task test:spec` → `tests/spec/*.bats`). They assert the two structural invariants against the
rendered config and **fail on the current branch** (no `template` stage exists; the `korczewski`
rule currently precedes the `mentolder` default). This is the red→green anchor for Tasks 2–3. The
comprehensive Promtail structural suite is P5's — this is one targeted pair.

```bash
# append to tests/spec/centralized-logging.bats
@test "promtail maps numeric pino levels to text before the level label is set" {
  local cfg=k3d/monitoring/promtail-rendered.yaml

  # A template pipeline stage must translate the numeric pino level (e.g. 50 -> error).
  grep -qE 'eq \.Value "50" *\}\}error' "$cfg" || fail "no numeric->text level mapping stage present"

  # ...and it must run BEFORE the labels stage that promotes `level` to a Loki label,
  # otherwise the raw numeric value would already be frozen as the label.
  local tmpl_line labels_line
  tmpl_line=$(grep -n 'source: level' "$cfg" | head -1 | cut -d: -f1)
  labels_line=$(grep -n -- '- labels:' "$cfg" | head -1 | cut -d: -f1)
  [ -n "$tmpl_line" ] || fail "no 'source: level' template stage found"
  [ "$tmpl_line" -lt "$labels_line" ] || fail "level mapping must precede the labels stage"
}

@test "promtail brand relabel: mentolder default precedes korczewski override (no clobber)" {
  local cfg=k3d/monitoring/promtail-rendered.yaml
  local mentolder_line korczewski_line
  mentolder_line=$(grep -n 'replacement: mentolder' "$cfg" | head -1 | cut -d: -f1)
  korczewski_line=$(grep -n 'replacement: korczewski' "$cfg" | head -1 | cut -d: -f1)
  [ -n "$mentolder_line" ] && [ -n "$korczewski_line" ] || fail "brand relabel rules missing"

  # The unconditional `.*`->mentolder default must come FIRST so the later, conditional
  # `.*-korczewski`->korczewski rule overrides it (and is not itself clobbered).
  [ "$mentolder_line" -lt "$korczewski_line" ] || fail "mentolder default must precede korczewski override"
}
```

Run it targeted — it must be red now:

```bash
cd /home/patrick/Bachelorprojekt/.worktrees/observability-remediation
./tests/unit/lib/bats-core/bin/bats tests/spec/centralized-logging.bats -f 'promtail'
# red: the first test fails (no template mapping stage), the second fails
# (korczewski currently precedes mentolder). Tasks 2-3 make both pass.
```

---

## Task 2 — Promtail: numeric→text `level` mapping stage (before the labels stage)

Edit the inline `promtail.yaml` config inside `k3d/monitoring/promtail-rendered.yaml` (the checked-in
rendered Secret, referenced at `k3d/monitoring/kustomization.yaml:21`). Insert a `template` stage
between the existing `json` extract stage and the `labels` promote stage. Promtail's `template` stage
runs a Go text/template over the extracted `level` field (`.Value` = its current value); the `json`
stage stores extracted values as strings, so pino's numeric `level` arrives as `"50"` and maps to
`error`. Non-matching values (already-text levels from Keycloak/Traefik, or the empty case for
non-JSON log lines) fall through the `{{ else }}{{ .Value }}{{ end }}` branch unchanged — and Loki
elides empty-valued labels at ingestion, so non-JSON lines still carry no `level` label.

Current lines 46–54:

```yaml
        pipeline_stages:
          - json:
              expressions:
                level: level
          - labels:
              level: null
          - match:
              action: drop
              selector: '{level="debug"}'
```

Replace with (new `template` stage inserted after `json`, before `labels`):

```yaml
        pipeline_stages:
          - json:
              expressions:
                level: level
          - template:
              source: level
              template: '{{ if eq .Value "10" }}trace{{ else if eq .Value "20" }}debug{{ else if eq .Value "30" }}info{{ else if eq .Value "40" }}warn{{ else if eq .Value "50" }}error{{ else if eq .Value "60" }}fatal{{ else }}{{ .Value }}{{ end }}'
          - labels:
              level: null
          - match:
              action: drop
              selector: '{level="debug"}'
```

Note the beneficial side effect: the trailing `match`/`drop` on `{level="debug"}` now actually fires
for pino `level: 20` (previously it saw `"20"` and never dropped debug lines) — consistent with the
stated intent of that stage.

---

## Task 3 — Promtail: make the `brand` relabel deterministic (reorder, don't delete)

Still in `k3d/monitoring/promtail-rendered.yaml`, fix the `relabel_configs` `brand` rules. Promtail
relabel rules execute sequentially: an `action: replace` rule whose (fully anchored) `regex` matches
the concatenated `source_labels` overwrites `target_label`; a non-match is a no-op. Today the
`korczewski` rule runs first and the unconditional `.*`→`mentolder` rule runs second, so **every**
namespace — including `website-korczewski` — is force-labeled `mentolder`, clobbering the first rule
(live-verified: korczewski website logs carry `brand="mentolder"`).

The fix is a **reorder**, not a deletion: put the unconditional `mentolder` default **first** (the
sane fallback for all namespaces), then the conditional `.*-korczewski`→`korczewski` rule **last** so
it overrides the default only for korczewski namespaces. RE2 (Go regex) has no negative lookahead, so
ordering — not a negated regex — is the clean, deterministic expression of "korczewski wins for
korczewski namespaces, mentolder otherwise". This satisfies the spec's "no later unconditional rule
overwrites this value with mentolder": after the swap the only *later* rule is the *conditional*
korczewski one.

Current lines 122–131:

```yaml
          - regex: .*-korczewski
            replacement: korczewski
            source_labels:
            - namespace
            target_label: brand
          - regex: .*
            replacement: mentolder
            source_labels:
            - namespace
            target_label: brand
```

Replace with (mentolder default first, korczewski override second):

```yaml
          - regex: .*
            replacement: mentolder
            source_labels:
            - namespace
            target_label: brand
          - regex: .*-korczewski
            replacement: korczewski
            source_labels:
            - namespace
            target_label: brand
```

Now re-run Task 1's targeted BATS — both tests must go **green**:

```bash
cd /home/patrick/Bachelorprojekt/.worktrees/observability-remediation
./tests/unit/lib/bats-core/bin/bats tests/spec/centralized-logging.bats -f 'promtail'
```

---

## Task 4 — Dashboards: include `fatal` alongside `error` (consistent with the mapping)

Both dashboards already filter on the text `level` label, so no numeric→text migration is needed
(see the Dashboard finding above). Make the one real change the new mapping enables: widen the
error filter from an exact `level="error"` match to `level=~"error|fatal"` so the newly-materialized
`fatal` (pino `60`) severity is included in the error views. RE2 label-regex is fully anchored, so
`=~"error|fatal"` matches exactly those two values.

`k3d/monitoring/grafana-dashboards/log-explorer.json` — panel id 2 "Error Rate by App":

```json
"expr": "sum by (app) (rate({level=~\"error|fatal\"}[5m]))",
```

(was `"expr": "sum by (app) (rate({level=\"error\"}[5m]))"`. The panel id 1 "Live Logs" query
`{namespace=~\"$namespace\", app=~\"$app\", level=~\"$level\", brand=~\"$brand\"}` and the `level`
templating variable `label_values(level)` need no change — the variable now enumerates the text
levels the mapping produces.)

`k3d/monitoring/grafana-dashboards/api-errors.json` — panel id 1 "Top 10 Failing Endpoints" and
panel id 2 "Error Frequency per Route":

```json
"expr": "topk(10, sum by (path) (count_over_time({app=\"website\", level=~\"error|fatal\"} | json | path != \"\" [1h])))",
```

```json
"expr": "sum by (path) (rate({app=\"website\", level=~\"error|fatal\"} | json | path != \"\" [5m]))",
```

(each was the same query with `level=\"error\"`. Panel id 3 "Search by Request ID" is static text —
unchanged.) Keep both files valid JSON — no trailing commas, escaped inner quotes preserved.

---

## Task 5 — otel-emit.cjs: opt-in `OTEL_DEBUG` breadcrumb + additive unit assertion

Make the silent no-op observable. Add a small `dbg()` helper and call it at the skip/failure points
of `scripts/factory/otel-emit.cjs`. Purely additive: no return value changes, no `endpoint()`
semantic change, so the five existing tests stay green. New size ≈ 99 lines (budget 109 → within the
200-line `.cjs` limit).

Add the helper just after `endpoint()`:

```js
// Opt-in stderr breadcrumb (OTEL_DEBUG=1). Diagnostics only — makes a silently-skipped
// or failed emit visible instead of a multi-week dead-air mystery. Never throws.
function dbg(msg) {
  if (process.env.OTEL_DEBUG === '1' || process.env.OTEL_DEBUG === 'true') {
    try { process.stderr.write(`[otel-emit] ${msg}\n`); } catch { /* ignore */ }
  }
}
```

Wire it into the three no-op / failure branches:

```js
// in emitMetric(): replace `if (!endpoint()) return { skipped: true };`
  if (!endpoint()) { dbg(`skip emitMetric(${name}): OTEL_EXPORTER_OTLP_ENDPOINT unset or OTEL_SDK_DISABLED`); return { skipped: true }; }
```

```js
// in emitPhase(): replace `if (!endpoint()) return { skipped: true };`
  if (!endpoint()) { dbg(`skip emitPhase(${phase}/${state}): OTEL_EXPORTER_OTLP_ENDPOINT unset or OTEL_SDK_DISABLED`); return { skipped: true }; }
```

```js
// in post(): annotate the two failure outcomes (keep the returned shapes identical)
    const res = await fetch(`${base}/v1/metrics`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    if (!(res && res.ok)) dbg(`post to ${base}/v1/metrics returned status=${res && res.status}`);
    return { skipped: false, ok: !!(res && res.ok), status: res && res.status };
  } catch {
    dbg(`post to ${base}/v1/metrics threw (endpoint unreachable — check autopilot.env)`);
    return { skipped: false, ok: false };
  }
```

Append one additive assertion to `scripts/factory/otel-emit.test.cjs` (the existing node:test suite):

```js
test('emits an OTEL_DEBUG breadcrumb to stderr when an emit is skipped', async () => {
  delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  process.env.OTEL_DEBUG = '1';
  const lines = [];
  const orig = process.stderr.write.bind(process.stderr);
  process.stderr.write = (s) => { lines.push(String(s)); return true; };
  try {
    const r = await otel.emitMetric('factory.tick.count', 1, {});
    assert.strictEqual(r.skipped, true);
  } finally {
    process.stderr.write = orig;
    delete process.env.OTEL_DEBUG;
  }
  assert.ok(lines.some((l) => /\[otel-emit\].*skip/i.test(l)), 'expected a skip breadcrumb on stderr');
});
```

Run the otel suite directly (there is no BATS wrapper for it yet — P5 adds an `FA-SF-*`-style
wrapper so it joins the standard sweep; here it is invoked directly):

```bash
cd /home/patrick/Bachelorprojekt/.worktrees/observability-remediation
node --test scripts/factory/otel-emit.test.cjs
# all six tests pass (five existing + the new breadcrumb assertion)
```

<!-- vitest: kein neuer Vitest-Test nötig, weil P1 keinen website/src-Code anfasst — die
     otel-emit-Änderung ist scripts/factory (.cjs) und wird per node:test abgedeckt; die
     Promtail-Struktur per BATS. -->

---

## Task 6 — Verify (mandatory gates) + live-apply notes

Run, in order, from the worktree, and confirm each passes before handing off to P2:

```bash
cd /home/patrick/Bachelorprojekt/.worktrees/observability-remediation

# 1. focused red->green proof for this partial (green now)
./tests/unit/lib/bats-core/bin/bats tests/spec/centralized-logging.bats -f 'promtail'
node --test scripts/factory/otel-emit.test.cjs

# 2. regenerate generated artefacts (test-inventory for the added BATS tests, repo-index, ...)
task test:inventory
task freshness:regenerate

# 3. mandatory CI-equivalent gates
task test:changed          # runs task test:spec (promtail BATS) + task test:factory + quality
task freshness:check       # freshness + quality:check (S1–S4 ratchet + baseline assertion)
```

- Commit the regenerated `website/src/data/test-inventory.json` alongside the BATS additions (CI
  fails on drift).
- `task freshness:check` is safe for P1: the four impact files are `.yaml`/`.json`/`.cjs` — the two
  dashboards and the Promtail Secret carry no S1 line limit, and `otel-emit.cjs` grows 91→~99, well
  under its 200 budget (109). No new import cycles (S2 — `otel-emit.cjs` still has no DB/API imports),
  no `*.mentolder.de`/`*.korczewski.de` host literals (S3), no orphan manifest/script (S4 — all four
  files already referenced).

**Live-apply notes (not CI-gated, for the deploy/verify step, decoupled per T001092):**

- The rendered Promtail Secret is edited in place; its DaemonSet `checksum/config` annotation
  (`promtail-rendered.yaml:215`) is a stale helm hash after a hand-edit — do **not** hand-fake it.
  After Flux reconciles (or a break-glass apply), roll the DaemonSet so it re-reads the Secret:
  `kubectl --context fleet -n monitoring rollout restart daemonset/promtail`.
- Confirm the label fix live: after new logs land, query Loki for a korczewski-namespace stream and
  assert `brand="korczewski"` and a text `level` (e.g. `error`, not `50`); confirm `detected_level`
  is no longer `unknown`.
- Factory-OTel manual step (host-side, outside the repo — like P4's Pushover credential): set the
  real endpoint + token in `~/.config/factory/autopilot.env`
  (`OTEL_EXPORTER_OTLP_ENDPOINT="https://otel.${OTEL_DOMAIN}"`, `FACTORY_OTLP_TOKEN=<collector token>`),
  run `OTEL_DEBUG=1` for one tick, and confirm the collector exposes the metric:
  `kubectl --context fleet -n monitoring exec deploy/otel-collector -- wget -qO- localhost:8889/metrics | grep factory_phase_transition_total`.
