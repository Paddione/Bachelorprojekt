export const meta = {
  name: 'software-factory-dispatcher',
  description:
    'Phase-2 dispatcher: watchdog sweep → poll → conflict-gate + slot-claim → launch pipelines → metrics',
  phases: [{ title: 'Prep' }, { title: 'Launch' }, { title: 'Metrics' }],
}

let _msgBridge
try { _msgBridge = require('./agent-msg-bridge.cjs') } catch (_) { _msgBridge = { broadcast: (msg, label) => log(`[broadcast:${label}] ${msg}`) } }

async function main() {
  const A = args ?? {}
  const REPO = '/home/patrick/Bachelorprojekt'

  const PLAN_SCHEMA = {
    type: 'object',
    required: ['launch'],
    properties: {
      launch: {
        type: 'array',
        items: {
          type: 'object',
          required: ['brand', 'external_id', 'slot'],
          properties: {
            brand: { enum: ['mentolder', 'korczewski'] },
            external_id: { type: 'string' },
            slot: { type: 'integer' },
            title: { type: 'string' },
            branch: { type: 'string' },
            plan_path: { type: 'string' },
            dry_run: { type: 'boolean' },
          },
        },
      },
      skipped: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            brand: { type: 'string' },
            reason: { type: 'string' },
          },
        },
      },
    },
  }

  // ── ① Prep: watchdog sweep + queue poll + conflict-gate + slot-claim ──────────
  // Deterministic prep logic is delegated to scripts/vda.sh factory-prep, which consolidates:
  // - watchdog.sh (watchdog sweep)
  // - schedule.sh (poll backlog + conflict-gate + slot-claim)
  // - ticket.sh get (fetch details for launch)
  // - scripts/factory/guards.sh (kill-switch via guard_killswitch_on, daily cap via guard_daily_cap_reached)
  phase('Prep')
  // T001808: prefer the deterministic prep JSON precomputed by wakeup.sh (args.prep) —
  // small local models fail the PREP subagent's StructuredOutput contract; the agent
  // call below survives only as fallback for invocations without a precomputed prep.
  let prep
  let prepPrecomputed = false
  if (A.prep && typeof A.prep === 'object' && Array.isArray(A.prep.launch)) {
    log('Dispatcher: using precomputed prep from args (deterministic wakeup handoff)')
    prep = A.prep
    prepPrecomputed = true
  } else {
    prep = await agent(
      `Run the unified Software Factory prep script from ${REPO} and return its JSON output:
         FACTORY_DAILY_DEPLOY_CAP=${A.FACTORY_DAILY_DEPLOY_CAP ?? '5'} FACTORY_GLOBAL_CAP=3 bash ${REPO}/scripts/vda.sh factory-prep
       Return the exact JSON output from this script and nothing else.`,
      { label: 'prep', phase: 'Prep', schema: PLAN_SCHEMA },
    )
  }

  // Guard: PREP agent returned null (API error, model config mismatch, or subagent failure).
  // Fail-closed — record the outage and exit cleanly so the /loop can retry next tick.
  if (!prep || !prep.launch) {
    log(
      `Dispatcher: PREP step returned null (agent error). No brands processed this tick. ` +
        `Raw prep value: ${JSON.stringify(prep)}. Retrying next tick.`,
    )
    return
  }

  log(
    `Dispatcher: ${prep.launch.length} feature(s) scheduled this tick (${A.timestamp ?? 'no timestamp'})`,
  )
  if (prep.launch.length === 0) {
    return
  }

  // Run budget guards and estimates (agent-based — Workflow scripts cannot execFileSync)
  const BUDGET_RESULT_SCHEMA = {
    type: 'object',
    required: ['ok', 'blocked'],
    properties: {
      ok: { type: 'array', items: { type: 'object', properties: { external_id: { type: 'string' }, brand: { type: 'string' } } } },
      blocked: { type: 'array', items: { type: 'object', properties: { external_id: { type: 'string' }, brand: { type: 'string' }, reason: { type: 'string' } } } },
      estimates: { type: 'array' },
    },
  }

  // T001809: with a precomputed prep the budget guard already ran deterministically
  // in wakeup.sh (blocked features were cleaned up and filtered out of prep.launch) —
  // skip the LLM step; small local models fail its StructuredOutput contract.
  let budgetResult
  if (prepPrecomputed) {
    log('Dispatcher: budget-guard precomputed in wakeup — prep.launch is pre-filtered')
    budgetResult = {
      ok: prep.launch.map((f) => ({ external_id: f.external_id, brand: f.brand })),
      blocked: [],
    }
  } else {
  budgetResult = await agent(
    `/goal Guard the Software Factory budget and estimate feature costs.
     You are the Software Factory budget guard. Process ONLY the features listed below.
     REPO=${REPO}

     For EACH feature in this list:
     ${JSON.stringify(prep.launch.map(f => ({ external_id: f.external_id, brand: f.brand })))}

     Step 1 — Budget guard (fail-closed):
       BRAND=<brand> bash ${REPO}/scripts/factory/budget-guard.sh <brand>
       If this exits non-zero: the feature is BLOCKED. Proceed to cleanup steps (2-4).
       If this exits zero: the feature is OK. Proceed to estimate then next feature.

     Step 2 — Estimate (best-effort, only for OK features):
       BRAND=<brand> bash ${REPO}/scripts/factory/budget-estimate.sh <external_id> <brand>
       Capture stdout; if it fails log the error but do NOT block the feature.

     For BLOCKED features, run these cleanup steps:
     Step 3 — Set ticket status to blocked:
       BRAND=<brand> bash ${REPO}/scripts/ticket.sh update-status --id <external_id> --status blocked
     Step 4 — Log phase event:
       BRAND=<brand> bash ${REPO}/scripts/ticket.sh phase <external_id> scout blocked --detail 'daily budget exceeded'
     Step 5 — Release slot:
       BRAND=<brand> bash ${REPO}/scripts/ticket.sh release-slot --id <external_id>

     Return JSON: { ok: [{external_id, brand}, ...], blocked: [{external_id, brand, reason}, ...], estimates: [...] }`,
    { label: 'budget-guard', phase: 'Launch', schema: BUDGET_RESULT_SCHEMA },
  )
  }

  const okIds = new Set((budgetResult?.ok ?? []).map(f => f.external_id))
  const launches = (prep.launch ?? []).filter(f => okIds.has(f.external_id))
  const blockedLaunches = (budgetResult?.blocked ?? []).map(b => ({
    external_id: b.external_id,
    brand: b.brand,
  }))

  // ── ② Launch: nest one pipeline workflow per scheduled feature (Model A) ──────
  phase('Launch')

  // ── Sentinel: an interactive worker is active → yield one parallel slot ──
  const SENTINEL_SCHEMA = {
    type: 'object',
    required: ['interactive_worker_active'],
    properties: { interactive_worker_active: { type: 'boolean' } },
  }
  // T001809: prefer the sentinel state precomputed by wakeup.sh (args.interactive_worker).
  let sentinel
  if (typeof A.interactive_worker === 'boolean') {
    sentinel = { interactive_worker_active: A.interactive_worker }
  } else {
    sentinel = await agent(
      `Run this and report the result as JSON ONLY:
         bash ${REPO}/scripts/agent-lock.sh list | grep -q interactive-worker && echo found || echo none
       If output is "found": return {"interactive_worker_active": true}
       If output is "none":  return {"interactive_worker_active": false}`,
      { label: 'sentinel-check', phase: 'Launch', schema: SENTINEL_SCHEMA },
    )
  }

  let maxParallel = launches.length
  if (sentinel && sentinel.interactive_worker_active) {
    maxParallel = Math.max(1, launches.length - 1)
    log(`Dispatcher: interactive-worker detected, reducing slots to ${maxParallel}`)
  }

  const toLaunch = launches.slice(0, maxParallel)
  const deferred = launches.slice(maxParallel)
  if (deferred.length) {
    log(`Dispatcher: deferring ${deferred.length} feature(s) to next tick (interactive-worker yield)`)
    await agent(
      `Release the slots for these deferred features so they re-queue cleanly next tick:
       ${JSON.stringify(deferred.map((f) => ({ external_id: f.external_id, brand: f.brand })))}
       For EACH: BRAND=<brand> bash ${REPO}/scripts/ticket.sh release-slot --id <external_id>
       Report which slots were released.`,
      { label: 'sentinel-defer', phase: 'Launch' },
    )
  }

  const results = await parallel(
    toLaunch.map(
      (f) => () =>
        workflow(
          { scriptPath: 'scripts/factory/pipeline.js' },
          {
            title: f.title ?? f.external_id,
            description: `Dispatched by the Software Factory dispatcher (slot ${f.slot}).`,
            slug: f.branch ? String(f.branch).replace(/^feature\//, '') : `sf-${String(f.external_id).toLowerCase()}`,
            ticket_id: f.external_id,
            brand: f.brand,
            timestamp: A.timestamp,
            dry_run: f.dry_run === true || A.dry_run === true || A.dry_run === 'true',
            branch: f.branch || null,
            plan_path: f.plan_path || null,
          },
        )
          .then((r) => ({ external_id: f.external_id, brand: f.brand, result: r }))
          .catch((e) => ({ external_id: f.external_id, brand: f.brand, error: String(e) })),
    ),
  )

  // ── ②b Escalation routing: surface every error / blocked pipeline (never silent) ──
  // The parallel() result was previously discarded (gotcha: dispatcher.js:88) which
  // swallowed both .catch errors (:105-106) and structured { status:'blocked' } returns.
  const blockedResults = blockedLaunches.map(f => ({
    external_id: f.external_id,
    brand: f.brand,
    result: { status: 'blocked', reason: 'daily budget exceeded' }
  }))
  const escalations = [
    ...blockedResults,
    ...(results ?? []).filter(
      (r) => r && (r.error || (r.result && r.result.status === 'blocked')),
    )
  ]
  if (escalations.length) {
    _msgBridge.broadcast(`factory-dispatch: ${escalations.length} run(s) blocked/escalated`, 'factory')
    await agent(
      `/goal Notify the operator about blocked or errored Software Factory pipelines and log them.
       ${escalations.length} pipeline run(s) ended in error or blocked this tick. Notify the operator
       and record it on the Vorhaben ticket. PushNotification is a DEFERRED tool — you MUST first run
       \`ToolSearch select:PushNotification\` to load its schema, then call it ONCE with a summary:
         title:   "Software Factory: ${escalations.length} run(s) blocked/errored"
         message: a compact per-run list of "<brand> <external_id>: <error|blocked reason>"
       Use this exact escalation payload (already serialised):
         ${JSON.stringify(
           escalations.map((r) => ({
             brand: r.brand,
             external_id: r.external_id,
             status: r.error ? 'error' : (r.result && r.result.status) || 'blocked',
             reason: r.error || (r.result && (r.result.reason || r.result.conflict)) || 'see ticket',
           })),
         )}
       After notifying, append ONE breadcrumb to the Vorhaben ticket:
       bash ${REPO}/scripts/ticket.sh add-comment --id T000413 \\
         --body ${JSON.stringify('Factory dispatcher: ' + escalations.length + ' run(s) escalated this tick.')}
       Report also emit escalation count via otel:
         bash ${REPO}/scripts/factory/otel-emit.sh metric factory.tick.escalations ${escalations.length}
       Report what was notified and the ticket-comment output.`,
      { label: 'escalate', phase: 'Launch' },
    )
  } else {
    log(`Dispatcher: all ${results?.length ?? 0} pipeline run(s) completed without error/block.`)
  }

  // ── ③ Metrics: per-brand throughput summary on the Vorhaben ticket ────────────
  phase('Metrics')
  await agent(
    `/goal Retrieve and report Software Factory metrics for both brands.
     Run the factory metrics summary for BOTH brands from ${REPO} and report stdout:
       BRAND=mentolder bash ${REPO}/scripts/factory/metrics.sh
       BRAND=korczewski bash ${REPO}/scripts/factory/metrics.sh
     (metrics.sh is best-effort: a missing Vorhaben ticket on a brand is a silent no-op.)
     Then emit factory tick metrics (best-effort, never fail the tick):
       bash ${REPO}/scripts/factory/otel-emit.sh metric factory.tick.count 1 brand=mentolder
       bash ${REPO}/scripts/factory/otel-emit.sh metric factory.tick.count 1 brand=korczewski
       bash ${REPO}/scripts/factory/otel-emit.sh metric factory.tick.launches ${launches.length}`,
    { label: 'metrics', phase: 'Metrics' },
  )
}
await main();
