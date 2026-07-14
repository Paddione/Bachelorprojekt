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

  // ── ① Prep: watchdog sweep + queue poll + conflict-gate + slot-claim ──────────
  // Deterministic prep logic is delegated to scripts/vda.sh factory-prep, which consolidates:
  // - watchdog.sh (watchdog sweep)
  // - schedule.sh (poll backlog + conflict-gate + slot-claim)
  // - ticket.sh get (fetch details for launch)
  // - scripts/factory/guards.sh (kill-switch via guard_killswitch_on, daily cap via guard_daily_cap_reached)
  phase('Prep')
  // T001812: factory-prep now runs in wakeup.sh (plain bash, before this Workflow
  // call), which writes the result to args.prep_file. Reading a file here is a
  // fast, synchronous op, unlike the T001810 approach of running factory-prep
  // (up to 300s worst case: watchdog sweep + schedule poll, both brands) via
  // child_process.execFileSync INSIDE this Workflow call — that made the call
  // slow enough to flip into the harness's async "launched in background" mode,
  // which a one-shot `claude -p` session never survives to see the notification
  // for (orphaned runs, no transcript ever written). Passing prep as a file path
  // instead of inline JSON also keeps T001809's original fix intact (small local
  // models drop fields like branch/plan_path when relaying a large JSON blob
  // verbatim through the prompt).
  const cp = require('child_process')
  const fs = require('fs')
  let prep = null
  try {
    if (!A.prep_file) throw new Error('args.prep_file missing — wakeup.sh must precompute it')
    const raw = fs.readFileSync(A.prep_file, 'utf8')
    prep = JSON.parse(raw)
  } catch (e) {
    log(
      `Dispatcher: factory-prep failed (${String(e && e.message ? e.message : e).slice(0, 300)}). ` +
        `No brands processed this tick. Retrying next tick.`,
    )
    return
  }

  // Fail-closed — record the outage and exit cleanly so the /loop can retry next tick.
  if (!prep || !Array.isArray(prep.launch)) {
    log(
      `Dispatcher: factory-prep returned an unexpected shape. No brands processed this tick. ` +
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

  // T001810: budget guard + estimates + blocked-cleanup run deterministically via
  // child_process — this is pure bash orchestration, no judgment needed.
  const ticketCmd = (brand, argv) => {
    cp.execFileSync('bash', [`${REPO}/scripts/ticket.sh`, ...argv], {
      stdio: 'ignore',
      timeout: 30000,
      env: { ...process.env, BRAND: brand },
    })
  }
  const budgetResult = { ok: [], blocked: [] }
  for (const f of prep.launch) {
    let withinBudget = true
    try {
      cp.execFileSync('bash', [`${REPO}/scripts/factory/budget-guard.sh`, f.brand], {
        stdio: 'ignore',
        timeout: 60000,
        env: { ...process.env, BRAND: f.brand },
      })
    } catch {
      withinBudget = false
    }
    if (withinBudget) {
      try {
        cp.execFileSync('bash', [`${REPO}/scripts/factory/budget-estimate.sh`, f.external_id, f.brand], {
          stdio: 'ignore',
          timeout: 120000,
          env: { ...process.env, BRAND: f.brand },
        })
      } catch (e) {
        log(`Dispatcher: budget-estimate failed for ${f.external_id} (non-fatal): ${String(e && e.message ? e.message : e).slice(0, 200)}`)
      }
      budgetResult.ok.push({ external_id: f.external_id, brand: f.brand })
    } else {
      log(`Dispatcher: budget-guard blocked ${f.external_id} (${f.brand})`)
      for (const argv of [
        ['update-status', '--id', f.external_id, '--status', 'blocked'],
        ['phase', f.external_id, 'scout', 'blocked', '--detail', 'daily budget exceeded'],
        ['release-slot', '--id', f.external_id],
      ]) {
        try { ticketCmd(f.brand, argv) } catch {}
      }
      budgetResult.blocked.push({ external_id: f.external_id, brand: f.brand, reason: 'daily budget exceeded' })
    }
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
  // T001810: deterministic check via child_process (pure bash, no judgment needed).
  let sentinel = { interactive_worker_active: false }
  try {
    const locks = cp.execFileSync('bash', [`${REPO}/scripts/agent-lock.sh`, 'list'], {
      encoding: 'utf8',
      timeout: 30000,
    })
    sentinel = { interactive_worker_active: /interactive-worker/.test(locks) }
  } catch {}

  let maxParallel = launches.length
  if (sentinel && sentinel.interactive_worker_active) {
    maxParallel = Math.max(1, launches.length - 1)
    log(`Dispatcher: interactive-worker detected, reducing slots to ${maxParallel}`)
  }

  const toLaunch = launches.slice(0, maxParallel)
  const deferred = launches.slice(maxParallel)
  if (deferred.length) {
    log(`Dispatcher: deferring ${deferred.length} feature(s) to next tick (interactive-worker yield)`)
    for (const f of deferred) {
      try { ticketCmd(f.brand, ['release-slot', '--id', f.external_id]) } catch {}
    }
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
