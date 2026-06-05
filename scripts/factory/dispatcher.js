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

;(async () => {
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
       1. Watchdog sweep (escalate stale runs, free their slots):
          BRAND=<brand> bash ${REPO}/scripts/factory/watchdog.sh
       2. Schedule (poll backlog + best-effort conflict gate + claim slots up to the global cap):
          BRAND=<brand> FACTORY_GLOBAL_CAP=3 bash ${REPO}/scripts/factory/schedule.sh
          (schedule.sh enforces the global cap across BOTH brands by summing occupied slots.)

     Collect every {brand, external_id, slot} object that schedule.sh claimed across both brands.
     For each claimed external_id, fetch its title:
       BRAND=<brand> bash ${REPO}/scripts/ticket.sh get --id <external_id>   (read .title from the JSON)

     Return JSON: { "launch": [ {brand, external_id, slot, title} ... ] }. If nothing was claimed, return { "launch": [] }.`,
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
  await parallel(
    prep.launch.map(
      (f) => () =>
        workflow(
          { scriptPath: 'scripts/factory/pipeline.js' },
          {
            title: f.title ?? f.external_id,
            description: `Dispatched by the Software Factory dispatcher (slot ${f.slot}).`,
            slug: `sf-${String(f.external_id).toLowerCase()}`,
            ticket_id: f.external_id,
            brand: f.brand,
            timestamp: A.timestamp,
          },
        )
          .then((r) => ({ external_id: f.external_id, brand: f.brand, result: r }))
          .catch((e) => ({ external_id: f.external_id, brand: f.brand, error: String(e) })),
    ),
  )

  // ── ③ Metrics: per-brand throughput summary on the Vorhaben ticket ────────────
  phase('Metrics')
  await agent(
    `Run the factory metrics summary for BOTH brands from ${REPO} and report stdout:
       BRAND=mentolder bash ${REPO}/scripts/factory/metrics.sh
       BRAND=korczewski bash ${REPO}/scripts/factory/metrics.sh
     (metrics.sh is best-effort: a missing Vorhaben ticket on a brand is a silent no-op.)`,
    { label: 'metrics', phase: 'Metrics' },
  )
})()
