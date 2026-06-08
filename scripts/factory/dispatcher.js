/**
 * scripts/factory/dispatcher.js
 *
 * Software Factory Phase-2 Dispatcher (Tier 1) — Claude Code Workflow script.
 *
 * Model A: ONE bounded Workflow run per /loop tick that nests pipeline.js runs.
 * The harness injects agent/parallel/phase/log/workflow/args as TOP-LEVEL globals.
 * Run by the Workflow tool, NOT `node scripts/factory/dispatcher.js`.
 *
 * Offline lint:   node --check scripts/factory/dispatcher.js
 * Contract tests: ./tests/runner.sh local FA-SF-30
 *
 * Trigger: /loop self-paced (ScheduleWakeup) — the next wake is scheduled only
 * after this run ends, giving natural single-flight. Over-scheduling is
 * additionally bounded by schedule.sh's global cap + the atomic slot-claim
 * (a pg advisory lock would NOT survive separate kubectl-exec psql sessions).
 *
 * Usage (Workflow tool): args = { timestamp }  // ISO8601 passed in
 */

export const meta = {
  name: 'software-factory-dispatcher',
  description:
    'Phase-2 dispatcher: watchdog sweep → poll → conflict-gate + slot-claim → launch pipelines → metrics',
  phases: [{ title: 'Prep' }, { title: 'Launch' }, { title: 'Metrics' }],
}

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
  phase('Prep')
  const prep = await agent(
    `You are the Software Factory dispatcher PREP step. Run the deterministic scripts below from
     ${REPO} and report ONLY what the scripts decide — do not schedule by your own judgment.

     For EACH brand in [mentolder, korczewski]:
       0. HARD-GUARD GATE (read fresh per tick; fail-closed — on ANY non-zero exit other than the
          documented "not tripped" case, treat the guard as tripped and SKIP scheduling this brand):
            source ${REPO}/scripts/factory/guards.sh
            # kill-switch ON  → exit 0; record "killswitch" and SKIP this brand
            GUARDS_REPO=${REPO} guard_killswitch_on <brand>   ; KS=$?
            # daily-cap reached → exit 0; record "daily_cap" and SKIP this brand
            FACTORY_DAILY_DEPLOY_CAP=${A.FACTORY_DAILY_DEPLOY_CAP ?? '5'} GUARDS_REPO=${REPO} guard_daily_cap_reached <brand> ; CAP=$?
          If KS==0 (kill-switch ON) OR CAP==0 (daily cap reached): emit NO launch objects for this
          brand and append { brand, reason } to a "skipped" list. Otherwise continue to steps 1-2.
       1. Watchdog sweep (escalate stale runs, free their slots):
          BRAND=<brand> bash ${REPO}/scripts/factory/watchdog.sh
       2. Schedule (poll backlog + best-effort conflict gate + claim slots up to the global cap):
          BRAND=<brand> FACTORY_GLOBAL_CAP=3 bash ${REPO}/scripts/factory/schedule.sh
          (schedule.sh enforces the global cap across BOTH brands by summing occupied slots.)

     For EACH claimed external_id also enforce the per-ticket DRY-RUN-FIRST guard
     (a feature must have been dry-run at least once before it may ship live):
       GUARDS_REPO=${REPO} guard_dryrun_ok <external_id> ; DR=$?
       If DR != 0 (not yet dry-run), STILL launch it but force dry_run=true for THAT object only.

     For EACH claimed external_id also enforce the SESSION-COORDINATION guard [T000510]
     (never let the Factory duplicate work a live interactive Claude/Gemini session is doing):
       bash ${REPO}/scripts/agent-lock.sh check ticket <external_id> ; AL=$?
       If AL == 3 (a LIVE interactive session holds the ticket claim), DO NOT launch it:
         release its slot — BRAND=<brand> bash ${REPO}/scripts/ticket.sh release-slot --id <external_id>
         and append { brand: <brand>, reason: "claimed by live interactive session" } to "skipped".
       Any other AL value (0 = free/mine, 1) → proceed normally.

     Collect every {brand, external_id, slot} object that schedule.sh claimed across both brands.
     For each claimed external_id, fetch its details:
       BRAND=<brand> bash ${REPO}/scripts/ticket.sh get --id <external_id>
       Read .title and .plan_ref from the returned JSON.
       If .plan_ref contains a FACTORY-PLAN-REF comment, parse "branch=<value>" and "plan=<value>" from it.

     Return JSON: { "launch": [ {brand, external_id, slot, title, branch, plan_path, dry_run} ... ],
                    "skipped": [ {brand, reason} ... ] }.
     dry_run is true for objects that failed the dry-run-first guard, else inherit the tick policy.
     If a guard read errors (non-zero with no documented meaning), fail-closed: skip that brand.
     If a ticket has no plan reference, set branch and plan_path to null.
     If nothing was claimed across both brands, return { "launch": [], "skipped": [...] }.`,
    { label: 'prep', phase: 'Prep', schema: PLAN_SCHEMA },
  )

  log(
    `Dispatcher: ${prep.launch.length} feature(s) scheduled this tick (${A.timestamp ?? 'no timestamp'})`,
  )
  if (prep.launch.length === 0) {
    return
  }

  // ── ② Launch: nest one pipeline workflow per scheduled feature (Model A) ──────
  phase('Launch')
  const results = await parallel(
    prep.launch.map(
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
  const escalations = (results ?? []).filter(
    (r) => r && (r.error || (r.result && r.result.status === 'blocked')),
  )
  if (escalations.length) {
    await agent(
      `${escalations.length} pipeline run(s) ended in error or blocked this tick. Notify the operator
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
       Report what was notified and the ticket-comment output.`,
      { label: 'escalate', phase: 'Launch' },
    )
  } else {
    log(`Dispatcher: all ${results?.length ?? 0} pipeline run(s) completed without error/block.`)
  }

  // ── ③ Metrics: per-brand throughput summary on the Vorhaben ticket ────────────
  phase('Metrics')
  await agent(
    `Run the factory metrics summary for BOTH brands from ${REPO} and report stdout:
       BRAND=mentolder bash ${REPO}/scripts/factory/metrics.sh
       BRAND=korczewski bash ${REPO}/scripts/factory/metrics.sh
     (metrics.sh is best-effort: a missing Vorhaben ticket on a brand is a silent no-op.)`,
    { label: 'metrics', phase: 'Metrics' },
  )
}
await main();
