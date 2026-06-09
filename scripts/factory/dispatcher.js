/**
 * scripts/factory/dispatcher.js
 *
 * Software Factory Phase-2 Dispatcher (Tier 1) — Claude Code Workflow script.
 *
 * Model A: ONE bounded Workflow run per /loop tick that nests pipeline.js runs.
 * The harness injects agent/parallel/phase/log/workflow/args as TOP-LEVEL globals.
 * Run by the Workflow tool, NOT `node scripts/factory/dispatcher.js`.
 *
 * IMPORTANT: ALL agent() calls removed due to DeepSeek API conflict
 * (thinking.type=disabled + reasoning_effort → 400). The PREP logic now runs
 * via scripts/factory/prep.sh (deterministic bash) and results are passed in
 * as args.launchList. Escalate/Metrics are also replaced with in-script logic.
 *
 * Offline lint:   node --check scripts/factory/dispatcher.js
 * Contract tests: ./tests/runner.sh local FA-SF-30
 *
 * Usage (Workflow tool): args = { timestamp, launchList: [...], skipped: [...] }
 */

export const meta = {
  name: 'software-factory-dispatcher',
  description:
    'Phase-2 dispatcher: accepts pre-computed launch list, nests pipeline.js per ticket, reports results',
  phases: [{ title: 'Launch' }, { title: 'Report' }],
}

async function main() {
  const A = args ?? {}
  const REPO = '/home/patrick/Bachelorprojekt'

  const launchList = A.launchList ?? A.launch ?? []
  const skipped = A.skipped ?? []

  log(
    `Dispatcher: ${launchList.length} feature(s) scheduled, ${skipped.length} skipped (${A.timestamp ?? 'no timestamp'})`,
  )
  if (skipped.length > 0) {
    for (const s of skipped) {
      log(`  SKIPPED ${s.brand}: ${s.reason}`)
    }
  }

  if (launchList.length === 0) {
    log('Dispatcher: nothing to launch this tick — done.')
    return { scheduled: 0, launched: 0, skipped: skipped.length }
  }

  for (const f of launchList) {
    log(`  SCHEDULED ${f.brand}/${f.external_id} slot=${f.slot} dry_run=${f.dry_run ?? A.dry_run ?? true}`)
  }

  // ── ① Launch: nest one pipeline workflow per scheduled feature (Model A) ──────
  phase('Launch')
  const results = await parallel(
    launchList.map(
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

  // ── ② Report: log every pipeline result (no agent() call) ──────────────────
  phase('Report')
  const escalations = (results ?? []).filter(
    (r) => r && (r.error || (r.result && r.result.status === 'blocked')),
  )
  const successes = (results ?? []).filter(
    (r) => r && !r.error && (!r.result || r.result.status !== 'blocked'),
  )

  log(
    `Dispatcher summary: ${successes.length} succeeded, ${escalations.length} blocked/errored, ` +
    `${launchList.length} total this tick`,
  )

  if (escalations.length > 0) {
    for (const e of escalations) {
      const reason = e.error || (e.result && (e.result.reason || e.result.conflict)) || 'see ticket'
      log(`  ESCALATED ${e.brand}/${e.external_id}: ${reason}`)
    }
  }

  return {
    scheduled: launchList.length,
    launched: launchList.length,
    succeeded: successes.length,
    escalated: escalations.length,
    skipped: skipped.length,
  }
}
await main();
