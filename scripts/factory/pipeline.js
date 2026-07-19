/**
 * scripts/factory/pipeline.js — Workflow script. Harness-injected globals:
 * agent, parallel, pipeline, phase, log, args.
 * args: { title, description, slug, ticket_id, brand, timestamp, batch_mode?, sub_features? }
 * Offline: node --check.
 *
 * The Workflow sandbox has no filesystem/Node-API access (no require/fs/child_process
 * — this is why we do NOT use args.timestamp for anything time-sensitive here beyond
 * pass-through, and never Date.now()/Math.random()). Anything that needs those APIs
 * (execFileSync, fs read/write, plan-lint, scout.sh, etc.) runs host-side in
 * pipeline-runner.js and is reached via runRunner(), which spawns an agent that shells
 * out to it and returns raw stdout.
 */

export const meta = {
  name: 'software-factory-pipeline',
  description: 'Phase-1 single-feature pipeline: Scout → Design → Plan → Implement → Verify → Deploy',
  phases: [
    { title: 'Scout' }, { title: 'Design' }, { title: 'Plan' },
    { title: 'Implement' }, { title: 'Verify' }, { title: 'Deploy' },
  ],
}

// Safety-net default (T001444): if a shelled-out ticket.sh call ever omits an explicit
// --driver, attribute it to factory. Guarded on `process` existing — the Workflow
// sandbox may not expose Node globals, and pipeline-runner.js sets this for its own
// process independently.
if (typeof process !== 'undefined' && !process.env.TICKET_PHASE_DRIVER) process.env.TICKET_PHASE_DRIVER = 'factory'

// Sandbox local routing that guarantees qwen3.6-14b-a3b-fablevibes is used for all
// factory routing. This replaces the old per-call provider-tier routing/slot-release
// machinery (opus/sonnet/haiku via route-provider.sh + factory_model_slots) —
// the factory now always runs against the local LM Studio model.
const FACTORY_MODEL = {
  provider: 'lmstudio',
  modelId: 'qwen3.6-14b-a3b-fablevibes',
  baseUrl: 'http://127.0.0.1:1234',
}

// Delegate any Node-API-requiring operation to pipeline-runner.js (host-side, has
// require/fs/child_process) by spawning an agent that shells out to it and returns
// its raw stdout. `command` picks the branch inside pipeline-runner.js's main().
async function runRunner(agentFn, command, payload) {
  const payloadStr = JSON.stringify(payload).replace(/'/g, "'\\''")
  const prompt = `EXECUTE ONLY — do NOT read files, grep, or do any research.
Run exactly this bash command and return ONLY its raw stdout. Nothing else.
\`\`\`
node scripts/factory/pipeline-runner.js ${command} '${payloadStr}'
\`\`\`
Return the command's stdout verbatim. If it fails, return the stderr. Do not explain or add commentary.`
  const result = await agentFn(prompt)
  return result ? result.trim() : ''
}

async function runTaskVerifyLoop(agentFn, t, maxLoop, WORK_WT, WORK_BRANCH, slug) {
  for (let i = 0; i < maxLoop; i++) {
    const verifyCmd = 'task workspace:validate && task test:all && task freshness:regenerate'
    const wrapSandbox = (workWt, cmd) => `bash /home/patrick/Bachelorprojekt/scripts/factory/sandbox-run.sh ${workWt} ${JSON.stringify(cmd)}`
    const prompt = i === 0
      ? `Self-verify task ${t.id} on ${WORK_BRANCH}: confirm acceptance: ${t.acceptance_criteria.join('; ')}. Report pass/fail.`
      : `/goal Fix task ${t.id} (attempt ${i + 1}/${maxLoop}). Acceptance: ${t.acceptance_criteria.join('; ')}. After fix: ${wrapSandbox(WORK_WT, verifyCmd)} && cd ${WORK_WT} && git add -A && git commit -m ${JSON.stringify(`feat(${slug}): ${t.id} iter ${i + 1} [factory]`)}. Return pass/fail.`
    const result = await agentFn(prompt, { label: `impl:${t.id}:${i}`, phase: 'Implement', model: FACTORY_MODEL })
    if (result) return result
  }
  return null
}

async function main() {

const A = args ?? {}
const slug = A.slug           // args.timestamp for resume-safe timestamps
const brand = A.brand ?? 'mentolder'
const REPO = '/home/patrick/Bachelorprojekt'
const WT = `${REPO}/.worktrees/${slug}`

async function phaseEvent(ph, state, detail) {
  await runRunner(agent, 'phase-event', { ticket_id: A.ticket_id, phase: ph, state, detail, brand })
}

// pipeline-runner.js shells out to `ticket.sh get-injections --id <id> --phase <ph>
// --consume ('--consume')` and materializes any asset payloads into assets-inbox.
async function consumeInjections(ph) {
  try {
    return await runRunner(agent, 'get-injections', { ticket_id: A.ticket_id, phase: ph, slug })
  } catch {
    return ''
  }
}

const DRY_RUN = A.dry_run === true || A.dry_run === 'true'
// Normalize "null" strings from dispatcher-bridge.sh (no branch/plan_path set) to actual null
const _normNull = (v) => (v && v !== 'null' && v !== 'undefined') ? v : null
let REUSE_BRANCH = _normNull(A.branch)
let REUSE_PLAN   = _normNull(A.plan_path)
let REUSE = !!(REUSE_BRANCH && REUSE_PLAN)

// ── Auto-detect FACTORY-PLAN-REF when REUSE is not explicitly set ──
// If dev-flow-plan staged a plan but the dispatcher didn't pass branch/plan_path,
// the ticket still carries a FACTORY-PLAN-REF comment. Parse it to enable REUSE
// and skip Scout/Design/Plan-creation — the human already did that work.
if (!REUSE && A.ticket_id) {
  try {
    const ticketJsonStr = await runRunner(agent, 'ticket-get', { ticket_id: A.ticket_id, brand })
    const planRef = (JSON.parse(ticketJsonStr).plan_ref) || ''
    const branchMatch = planRef.match(/branch=(\S+)/)
    const planMatch   = planRef.match(/plan=(\S+)/)
    if (branchMatch && planMatch) {
      REUSE_BRANCH = branchMatch[1]
      REUSE_PLAN   = planMatch[1]
      REUSE = true
      log(`Auto-detected FACTORY-PLAN-REF on ${A.ticket_id}: branch=${REUSE_BRANCH} plan=${REUSE_PLAN} — skipping Scout/Design/Plan-creation`)
    }
  } catch (e) {
    log(`FACTORY-PLAN-REF auto-detect failed for ${A.ticket_id} (non-fatal): ${e.message}`)
  }
}

// Ensure slug is never "null" — fall back to ticket-based slug
const safeSlug = (!slug || slug === 'null') ? `sf-${(A.ticket_id || '').toLowerCase()}` : slug
const WORK_BRANCH = REUSE ? REUSE_BRANCH : `feature/${safeSlug}`
const WORK_WT = REUSE ? `${REPO}/.worktrees/${safeSlug}-reuse` : WT
const titlePrefix = WORK_BRANCH.startsWith('chore/') ? 'chore' : 'feat'

let specPath = null
let tasks = []
let featureComplexity = null
let featureTouchedFiles = []
let planFilePath = REUSE ? REUSE_PLAN : null

try {

// ── Batch mode: parallel sub-features ──
if (A.batch_mode === true && Array.isArray(A.sub_features)) {
  phase('Implement')
  await phaseEvent('implement', 'entered', `Batch: ${A.sub_features.length} sub-features`)

  const wtSetup = await agent(
    `Liveness: \`bash ${REPO}/scripts/ticket.sh touch --id ${A.ticket_id}\`.
     From ${REPO}, create the isolated worktree for this batch feature:
       bash ${REPO}/scripts/worktree-create.sh ${WORK_BRANCH} ${WORK_WT} origin/main
     Report the FULL stdout and success/fail.`,
    { label: 'impl:batch-worktree', phase: 'Implement', model: FACTORY_MODEL },
  )
  if (!/ready on/.test(String(wtSetup ?? ''))) {
    await agent(
      `Batch worktree could not be created for ${A.ticket_id}.
       Record: bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status blocked
       Then PushNotification is DEFERRED: \`ToolSearch select:PushNotification\`, then:
         title "Factory batch worktree failed: ${A.ticket_id}"
         message "worktree-create.sh did not report success. ${String(wtSetup ?? '').slice(0, 240)}"
       Report what was notified.`,
      { label: 'impl:batch-worktree-escalate', phase: 'Implement', model: FACTORY_MODEL },
    )
    await phaseEvent('implement', 'blocked', 'batch-worktree')
    return { status: 'blocked', reason: 'worktree-setup', detail: String(wtSetup ?? '').slice(0, 400) }
  }

  const subResults = await parallel(A.sub_features.map((sf) => async () => {
    const sfProvJson = await runRunner(agent, 'provision', { complexity: sf.complexity || 'medium', role: 'implement', risk: (sf.assignedFiles?.some((f) => /\.sql$|^k3d\/|^environments\/|realm.*\.json/.test(f)) ? 'high' : 'low'), budgetRemaining: 1, ticketId: A.ticket_id, touchedFiles: sf.assignedFiles || [], gpuEmbeddings: false })
    let sfProv = {}
    try { sfProv = JSON.parse(sfProvJson) } catch {}
    const injections = await consumeInjections('implement')

    return agent(
      `Liveness: \`bash ${REPO}/scripts/ticket.sh touch --id ${A.ticket_id}\`.
       Implement sub-feature ${sf.id} — ${sf.title} in the shared worktree ${WORK_WT}
       (branch ${WORK_BRANCH}, already exists — do NOT run \`git worktree add\` again).
       Target files: ${(sf.assignedFiles || []).join(', ')}.
       Description: ${sf.description}.
       ${sf.shared_changes ? 'NOTE: shared files (configmap/schema/kustomization) — apply changes idempotently.' : ''}
       Follow TDD (red-green). DARK-LAUNCH: gate new user-visible behavior behind isFeatureEnabled('${brand}', '${slug}').
       After implementing: bash ${REPO}/scripts/factory/sandbox-run.sh ${WORK_WT} 'task workspace:validate && task test:all && task freshness:regenerate'
       Then commit: cd ${WORK_WT} && git add -A && git commit -m ${JSON.stringify(`feat(${slug}): ${sf.id} [batch-factory]`)}
       Return a summary of the diff and local test result.` + injections,
      { label: `batch:${sf.id}`, phase: 'Implement', model: FACTORY_MODEL },
    )
  }))

  const succeeded = subResults.filter(Boolean)
  log(`Batch: ${succeeded.length}/${A.sub_features.length} sub-features done, ${A.sub_features.length - succeeded.length} skipped`)

  // Skip Verify/Deploy in batch mode — each SF is verified individually.
  // Continue to Deploy so the parent gets a PR.
}

const REVIEW_SCHEMA = { type: 'object', required: ['findings'], properties: { findings: { type: 'array', items: { type: 'object', required: ['severity', 'file', 'description'], properties: { severity: { enum: ['low', 'medium', 'high', 'critical'] }, file: { type: 'string' }, line: { type: 'integer' }, description: { type: 'string' }, suggested_fix: { type: 'string' } } } }, summary: { type: 'string' } } }

if (!REUSE) {
phase('Scout')
await phaseEvent('scout', 'entered', 'Codebase-Analyse (deterministisch) gestartet')
await runRunner(agent, 'broadcast', { msg: `factory-pipeline: claiming ${A.ticket_id} (${A.title || A.slug})`, label: 'factory' })

// Deterministic scout: pipeline-runner.js runs scout.sh via execFileSync (no LLM scout
// agent call — the Workflow sandbox has no Node API, so pipeline.js can't execFileSync
// itself; the runner does it host-side), then applies the scout-quality-check gate.
const scoutResJson = await runRunner(agent, 'scout', { ticket_id: A.ticket_id, title: A.title, slug: A.slug, description: A.description, brand })
let scout
try {
  scout = JSON.parse(scoutResJson)
} catch (e) {
  throw new Error(`Scout output not valid JSON: ${String(scoutResJson).slice(0, 200)}`)
}
if (scout && scout.sqGateResult) {
  return scout.sqGateResult
}
if (!scout || typeof scout.complexity !== 'string'
    || !['simple', 'medium', 'complex'].includes(scout.complexity)
    || !Array.isArray(scout.touched_files)
    || !Array.isArray(scout.risk_areas)) {
  throw new Error(`Scout output invalid: ${String(scoutResJson).slice(0, 200)}`)
}

log(`Scout: complexity=${scout.complexity}, ${scout.touched_files.length} touched files`)
featureComplexity = scout.complexity
featureTouchedFiles = scout.touched_files

await phaseEvent('scout', 'done', `${(scout.touched_files || []).length} touched_files`)

const isSimple = scout.complexity === 'simple'

specPath = null
if (!isSimple) {
  phase('Design')
  await phaseEvent('design', 'entered', 'Spec-Generierung')
  const injections = await consumeInjections('design')
  const design = await agent(
    `/goal Generate design specification for feature "${A.title}".
     Liveness: \`bash ${REPO}/scripts/ticket.sh touch --id ${A.ticket_id}\`.
     Write a design spec for "${A.title}" following ARCH/GOALS/RISKS/DECISIONS structure.
     For medium/complex, include a "try to refute this design" section.
     Save the spec to: ${REPO}/docs/superpowers/specs/$(date +%F)-${slug}-design.md
     (compute YYYY-MM-DD with \`date +%F\` — do NOT use a literal "undefined").
     Then attach it: bash ${REPO}/scripts/ticket-attach.sh <uuid> <specfile>
     Return the spec file path (just the absolute path, nothing else).` + injections,
    { label: 'design', phase: 'Design', model: FACTORY_MODEL },
  )
  specPath = design.trim()
  await phaseEvent('design', 'done', 'Spec erstellt')
}

tasks = []
if (!isSimple) {
  phase('Plan')
  await phaseEvent('plan', 'entered', 'Plan-Erstellung')
  const conflict = await agent(
    `Liveness: \`bash ${REPO}/scripts/ticket.sh touch --id ${A.ticket_id}\`.
     Run the brand-aware conflict gate:
       BRAND=${brand} bash ${REPO}/scripts/factory/conflict-check.sh ${A.ticket_id} ${scout.touched_files.join(' ')}
     Report the exact stdout JSON and exit code.
     Exit 0 = no conflicts. Exit 1 = conflicts found (STOP). Exit 2 = error.`,
    { label: 'plan:conflict', phase: 'Plan', model: FACTORY_MODEL },
  )
  if (/\"T0/.test(conflict)) {
    log(`Conflict detected: ${conflict}`)
    await agent(
      `Release slot + return to queue:
       bash ${REPO}/scripts/ticket.sh release-slot --id ${A.ticket_id}
       bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status backlog
       Notify: PushNotification is DEFERRED — \`ToolSearch select:PushNotification\`,
       title "Factory conflict: ${A.ticket_id} (${brand})",
       message "Pipeline blocked on overlap. ${String(conflict).slice(0, 200)}"`,
      { label: 'conflict:escalate', phase: 'Plan', model: FACTORY_MODEL },
    )
    await phaseEvent('plan', 'blocked', 'file-overlap: ' + String(conflict).slice(0, 120))
    return { status: 'blocked', reason: 'file-overlap', conflict, released: true }
  }

  const injections = await consumeInjections('plan')
  const plan = await agent(
    `/goal Decompose specification into task list plan.
     Decompose the spec at ${specPath} into independent tasks where no two tasks
     touch the same file. For each task provide: id, target_files (array),
     acceptance_criteria (array of strings).

     Write the plan to ${REPO}/openspec/changes/${slug}/tasks.md
     (create the directory with mkdir -p ${REPO}/openspec/changes/${slug} first).
     Do NOT run the frontmatter hook (openspec tasks have no frontmatter).

     Return JSON { tasks: [...], plan_path: "<absolute path>" }` + injections,
    {
      model: FACTORY_MODEL,
      label: 'plan:decompose',
      phase: 'Plan',
      schema: { type: 'object', required: ['tasks', 'plan_path'], properties: { plan_path: { type: 'string' }, tasks: { type: 'array', items: { type: 'object', required: ['id', 'target_files', 'acceptance_criteria'], properties: { id: { type: 'string' }, target_files: { type: 'array', items: { type: 'string' } }, acceptance_criteria: { type: 'array', items: { type: 'string' } } } } } } },
    },
  )
  tasks = plan.tasks
  planFilePath = plan.plan_path
  await phaseEvent('plan', 'done', `${(plan.tasks || []).length} Tasks`)

  // Deterministic plan-lint gate (T000910) — fail-closed, no LLM. One fix iteration.
  const lintResJson = await runRunner(agent, 'plan-lint-check', { ticket_id: A.ticket_id, planFilePath })
  let lintRes = JSON.parse(lintResJson)
  if (lintRes.status === 'retry') {
    await agent(
      `The plan ${planFilePath} failed plan-lint with: ${String(lintRes.lintOut).slice(0, 400)}.
       Fix ONLY the reported hard-fails (frontmatter/STRUCT/P1/B1a) in place, then re-run.`,
      { label: 'plan:lint-fix', phase: 'Plan', model: FACTORY_MODEL },
    )
    const lintResJson2 = await runRunner(agent, 'plan-lint-check', { ticket_id: A.ticket_id, planFilePath })
    lintRes = JSON.parse(lintResJson2)
  }
  if (/"verdict"\s*:\s*"FAIL"/.test(lintRes.lintOut)) {
    await runRunner(agent, 'plan-lint-block', { ticket_id: A.ticket_id, lintOut: lintRes.lintOut })
    await phaseEvent('plan', 'blocked', 'plan-lint-fail')
    return { status: 'blocked', reason: 'plan-lint-fail', lint: lintRes.lintOut }
  }
}
}

if (REUSE) {
  phase('Plan')
  await phaseEvent('plan', 'entered', 'Plan-Reuse')
  const injections = await consumeInjections('plan')
  const reuse = await agent(
    `A human already planned this feature via dev-flow on ${WORK_BRANCH}.
     Read the plan file (git show "origin/${WORK_BRANCH}:${REUSE_PLAN}") and
     decompose into independent tasks where no two tasks touch the same file:
     each { id, target_files:[...], acceptance_criteria:[...] }.
     Do NOT write a new plan. Return { tasks: [...] }.` + injections,
    { label: 'plan:reuse', phase: 'Plan', model: FACTORY_MODEL, schema: { type: 'object', required: ['tasks'], properties: { tasks: { type: 'array', items: { type: 'object', required: ['id', 'target_files', 'acceptance_criteria'], properties: { id: { type: 'string' }, target_files: { type: 'array', items: { type: 'string' } }, acceptance_criteria: { type: 'array', items: { type: 'string' } } } } } } } },
  )
  tasks = reuse.tasks
  await phaseEvent('plan', 'done', `${(tasks || []).length} Tasks (reuse)`)
}

let implemented = []
if (tasks.length && !A.batch_mode) {
  phase('Implement')
  await phaseEvent('implement', 'entered', 'Implementierung gestartet')

  const wtSetup = await agent(
    `Liveness: \`bash ${REPO}/scripts/ticket.sh touch --id ${A.ticket_id}\`.
     From ${REPO}, create the isolated worktree:
       bash ${REPO}/scripts/worktree-create.sh ${WORK_BRANCH} ${WORK_WT} origin/main
     Report the FULL stdout and exit code. A success line contains "ready on".`,
    { label: 'impl:worktree-setup', phase: 'Implement', model: FACTORY_MODEL },
  )
  if (!/ready on/.test(String(wtSetup ?? ''))) {
    await agent(
      `Worktree could not be created for ${A.ticket_id}.
       Record: bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status blocked
       Then PushNotification is DEFERRED: \`ToolSearch select:PushNotification\`, then:
         title "Factory worktree failed: ${A.ticket_id} (${brand})"
         message "worktree-create.sh did not report success. ${String(wtSetup ?? '').slice(0, 240)}"
       Report what was notified.`,
      { label: 'impl:worktree-escalate', phase: 'Implement', model: FACTORY_MODEL },
    )
    await phaseEvent('implement', 'blocked', 'worktree-setup')
    return { status: 'blocked', reason: 'worktree-setup', detail: String(wtSetup ?? '').slice(0, 400) }
  }

  for (const t of tasks) {
    const injections = await consumeInjections('implement')
    const impl = await agent(
      `/goal Implement task ${t.id} for ticket ${A.ticket_id}.
       Liveness: \`bash ${REPO}/scripts/ticket.sh touch --id ${A.ticket_id}\`.
       Implement task ${t.id} on ${WORK_BRANCH} in the shared worktree at ${WORK_WT}
       (already exists — do NOT run \`git worktree add\`).
       Target files: ${t.target_files.join(', ')}.
       Follow TDD (red-green). Acceptance: ${t.acceptance_criteria.join('; ')}.
       DARK-LAUNCH: gate new behavior behind isFeatureEnabled('${brand}', '${slug}') (default OFF).
       After implementing: bash ${REPO}/scripts/factory/sandbox-run.sh ${WORK_WT} 'task workspace:validate && task test:all && task freshness:regenerate'
       Then commit: cd ${WORK_WT} && git add -A && git commit -m ${JSON.stringify(`feat(${slug}): ${t.id} [factory]`)}
       Return a summary of the diff and local test result (pass/fail).` + injections,
      { label: `impl:${t.id}`, phase: 'Implement', model: FACTORY_MODEL },
    )
    if (impl == null) continue

    const vr = await runTaskVerifyLoop(agent, t, parseInt(process.env.FACTORY_BUILD_LOOP_MAX || '3'), WORK_WT, WORK_BRANCH, slug)
    if (vr) implemented.push(vr)
  }
  await phaseEvent('implement', 'done', `${tasks.length} Tasks implementiert`)
}

phase('Verify')
await phaseEvent('verify', 'entered', 'Tests + Freshness')
const evalCtx = await runRunner(agent, 'eval-context', { ticket_id: A.ticket_id })
const cleanDiff = (await agent(
  `cd ${WORK_WT} (HEAD=${WORK_BRANCH}) then run \`bash ${REPO}/scripts/factory/filter-diff.sh origin/main...HEAD\`. Return its raw stdout ONLY (empty = all-noise diff).`,
  { label: 'verify:filter', phase: 'Verify', model: FACTORY_MODEL },
)) || ''
let reviews = []
let coordinatorVerdict = null
if (!cleanDiff || !String(cleanDiff).trim()) {
  log('Verify: filtered diff is empty (noise-only) — skipping review lenses.')
  await phaseEvent('verify', 'done', evalCtx || 'noise-only')
} else {
  const tierJson = (await agent(
    `cd ${WORK_WT} then run \`bash ${REPO}/scripts/factory/classify-risk.sh origin/main...HEAD\`. Return its raw JSON stdout ONLY.`,
    { label: 'verify:classify', phase: 'Verify', model: FACTORY_MODEL },
  )) || '{"tier":"full"}'
  let tier = 'full'
  try { tier = JSON.parse(tierJson).tier || 'full' } catch { tier = 'full' }
  log(`Verify: risk tier = ${tier}`)

  const ALL_LENSES = {
    bug: 'scripts/factory/review-bug-hunter.prompt.md',
    security: 'scripts/factory/review-security-auditor.prompt.md',
    pattern: 'scripts/factory/review-pattern-enforcer.prompt.md',
    perf: 'scripts/factory/review-perf-reviewer.prompt.md',
    'agents-md': 'scripts/factory/review-agents-md-staleness.prompt.md',
  }
  const tierLenses = tier === 'trivial' ? ['bug']
    : tier === 'lite' ? ['bug', 'security', 'pattern']
    : ['bug', 'security', 'pattern', 'perf', 'agents-md']
  const lenses = tierLenses.map((key) => ({ key, file: ALL_LENSES[key] }))

  reviews = (await parallel(lenses.map((l) => async () => {
    const injections = await consumeInjections('verify')
    return agent(
      `/goal Perform verification review lens: ${l.key}.
       Liveness: \`bash ${REPO}/scripts/ticket.sh touch --id ${A.ticket_id}\`. Then review at ${REPO}/${l.file} against: git -C ${WORK_WT} diff origin/main...HEAD. Return findings as JSON per the prompt's schema.` + injections,
      { label: `review:${l.key}`, phase: 'Verify', ...(l.key === 'agents-md' ? {} : { schema: REVIEW_SCHEMA }), model: FACTORY_MODEL },
    )
  }))).filter(Boolean)
  log(`Verify: ${reviews.length}/${lenses.length} lenses done, tier=${tier}`)

  const allFindings = reviews.flatMap((r) => r.findings || [])
  if (allFindings.length > 0 && cleanDiff) {
    try {
      const keptJson = await runRunner(agent, 'filter-findings', { ticket_id: A.ticket_id, cleanDiff, allFindings })
      const parsed = JSON.parse(keptJson)
      const kept = parsed.kept || []
      if (kept.length !== allFindings.length) {
        const keptSet = new Set(kept.map((f) => JSON.stringify(f)))
        for (const r of reviews) {
          r.findings = (r.findings || []).filter((f) => keptSet.has(JSON.stringify(f)))
        }
        log(`Verify: filtered findings — ${kept.length} kept, ${allFindings.length - kept.length} suppressed`)
      }
    } catch { /* fail-open: keep original reviews */ }
  }

  // T001814: qa-lens — executing QA (test:changed → staging deploy → dual
  // Playwright smoke), full tier only. Fail-open.
  if (tier === 'full' && (A.qa_lens || 'on') !== 'off') {
    try {
      const qaResJson = await runRunner(agent, 'run-qa-lens', { workWt: WORK_WT, workBranch: WORK_BRANCH, ticket_id: A.ticket_id })
      const qaResult = JSON.parse(qaResJson)
      reviews.push(qaResult)
      await phaseEvent('verify', 'qa', String(qaResult.summary || `${(qaResult.findings || []).length} finding(s)`).slice(0, 240))
    } catch (err) {
      reviews.push({ findings: [{ severity: 'medium', file: '(qa-lens)', description: `qa-lens spawn failed: ${String(err.message || err).slice(0, 300)}` }], summary: 'qa-lens spawn failed' })
      await phaseEvent('verify', 'qa', 'spawn failed')
    }
  }

  if (tier === 'full' && reviews.length >= 2) {
    const xml = '<reviews>\n' + reviews.map((r, i) =>
      `  <lens name="${(lenses[i] && lenses[i].key) || 'lens' + i}">${JSON.stringify(r)}</lens>`).join('\n') + '\n</reviews>'
    const COORDINATOR_SCHEMA = {
      type: 'object', required: ['verdict'],
      properties: {
        verdict: { type: 'string', enum: ['approved', 'approved_with_comments', 'minor_issues', 'requested_changes'] },
        summary: { type: 'string' },
        findings: { type: 'array', items: { type: 'object' } },
      },
    }
    const coord = await agent(
      `Read ${REPO}/scripts/factory/review-coordinator.prompt.md and apply to these lens findings. Return ONE consolidated JSON with "verdict" field.\n${xml}`,
      { label: 'review:coordinator', phase: 'Verify', schema: COORDINATOR_SCHEMA, model: FACTORY_MODEL },
    )
    if (coord && coord.verdict) {
      coordinatorVerdict = coord.verdict
    } else if (coord) {
      log('Verify: coordinator returned a result but verdict field is missing — falling back to rawBlocking.')
    }
    log(`Verify: coordinator verdict = ${coordinatorVerdict || 'none'}`)
  }

  await agent(
    `Record a breadcrumb: bash ${REPO}/scripts/ticket.sh add-comment --id ${A.ticket_id} --body ${JSON.stringify('Factory: phase=Verify, tier=' + tier + ', ' + reviews.flatMap(r => r.findings || []).length + ' finding(s).')}`,
    { label: 'verify:breadcrumb', phase: 'Verify', model: FACTORY_MODEL },
  )

  const rawBlocking = reviews.flatMap((r) => r.findings || []).filter((f) => f && (f.severity === 'high' || f.severity === 'critical'))
  const isBlocked = coordinatorVerdict ? (coordinatorVerdict === 'requested_changes') : (rawBlocking.length > 0)
  if (isBlocked) {
    const blocking = rawBlocking
    await agent(
      `Blocking review findings (verdict=${coordinatorVerdict || 'n/a'}).
       bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status blocked
       bash ${REPO}/scripts/ticket.sh add-comment --id ${A.ticket_id} --body ${JSON.stringify('Factory Verify blocked: ' + JSON.stringify(blocking))}
       PushNotification: \`ToolSearch select:PushNotification\`, then title "Factory Verify blocked: ${A.ticket_id} (${brand})" and message "${blocking.length} blocking finding(s) / verdict=${coordinatorVerdict || 'high-severity'}."`,
      { label: 'verify:escalate', phase: 'Verify', model: FACTORY_MODEL },
    )
    await phaseEvent('verify', 'blocked', (blocking.length || 1) + ' blocking finding(s)')
    return { status: 'blocked', reason: 'review-findings', blocking, verdict: coordinatorVerdict }
  }
  await phaseEvent('verify', 'done', evalCtx || 'Tests ✓')
}

phase('Deploy')
await phaseEvent('deploy', 'entered', 'PR erstellt · CI watch')
if (DRY_RUN) {
  const report = await agent(
    `DRY RUN — do NOT push, merge, or deploy. Work from WORKTREE (HEAD=${WORK_BRANCH}):
     1. Show planned diff: git -C ${WORK_WT} diff origin/main...HEAD --stat
     2. Summarise review findings (${reviews.length} lens result(s)).
     3. Mark dry-run-checked, release slot, return to queue:
        bash ${REPO}/scripts/ticket.sh dryrun-mark --id ${A.ticket_id}
        bash ${REPO}/scripts/ticket.sh release-slot --id ${A.ticket_id}
        bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status backlog
     Report the diff stat + one-line verdict. Take NO other action.`,
    { label: 'deploy:dry-run', phase: 'Deploy', model: FACTORY_MODEL },
  )
  await phaseEvent('deploy', 'done', 'dry-run')
  return { status: 'dry-run', report, reviews: reviews.length, tasks: tasks.length }
}

// pipeline-runner.js sources service-registry.sh and calls resolve_partial_services()
// to decide between a full `task workspace:deploy` and a scoped `task workspace:partial-deploy`.
const partialServices = await runRunner(agent, 'resolve-partial-services', { touchedFiles: featureTouchedFiles })
const deployStepCmd = partialServices
  ? `task workspace:partial-deploy ENV=mentolder PARTIAL_SERVICES=${partialServices} && task workspace:partial-deploy ENV=korczewski PARTIAL_SERVICES=${partialServices}`
  : `task workspace:deploy ENV=mentolder && task workspace:deploy ENV=korczewski`
log(`Deploy mode: ${partialServices ? `PARTIAL [${partialServices}]` : 'FULL'} (touched=${(featureTouchedFiles ?? []).length})`)
await phaseEvent('deploy', partialServices ? 'partial' : 'full', partialServices ? `services=${partialServices}` : 'full deploy')

const resolvedPlanFile = planFilePath || await runRunner(agent, 'resolve-task-source', { slug })
const injections = await consumeInjections('deploy')

const deploy = await agent(
  `/goal Deploy feature branch ${WORK_BRANCH} to both brands.
   Liveness: \`bash ${REPO}/scripts/ticket.sh touch --id ${A.ticket_id}\`.
   Deploy to both brands. Operate from MAIN repo ${REPO} (NOT ${WORK_WT}).

   HARD GUARDS — STOP on any failure:
   a. Branch: WORK_BRANCH must match ^(feature|fix|chore)/ .
      printf '%s' "${WORK_BRANCH}" | grep -Eq '^(feature|fix|chore)/' || { echo "BLOCK: WORK_BRANCH ${WORK_BRANCH} not feature/*|fix/*|chore/*"; exit 1; }
   b. Diff-size cap: source ${REPO}/scripts/factory/guards.sh
      GUARDS_REPO=${REPO} guard_check_diff_size ${process.env.FACTORY_MAX_DIFF ?? '800'} ${WORK_BRANCH}
   c. CWD: every command MUST run from ${REPO}, never ${WORK_WT} (T000342).
   d. Explicit ENV: use ENV=mentolder/ENV=korczewski — never bare kubectl.

   If guard (a) or (b) fails: bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status blocked
   then PushNotification: title "Factory Deploy blocked: ${A.ticket_id}", message which guard failed.
   Return JSON: { "status": "blocked", "reason": "deploy-guard" }.

   Steps:
   1. git push -u origin ${WORK_BRANCH}
   2. Open PR: gh pr create --title "${titlePrefix}(${slug}): ${A.title}" --base main
      PR=$(gh pr view --json number -q .number); bash ${REPO}/scripts/ticket.sh add-comment --id ${A.ticket_id} --body "Factory: PR #$PR opened (phase=Deploy)."
      bash ${REPO}/scripts/ticket.sh add-pr-link --id ${A.ticket_id} --pr "$PR"
   3. SELF-HEALING RETRY LOOP (≤2 fixes, NO raw SQL):
      a) gh pr checks "$PR" --watch --interval 20 --fail-fast > /tmp/factory-ci-${A.ticket_id}.status 2>&1; CI_RC=$?
         RC=$(bash ${REPO}/scripts/ticket.sh retry-count get --id ${A.ticket_id})
         If RC -ge 2 -> STOP: blocked, notify, return.
      b) gh run view --log-failed > /tmp/factory-ci-${A.ticket_id}.log 2>&1 || gh run view --log > /tmp/factory-ci-${A.ticket_id}.log 2>&1
      b2) Freshness fast-path: source ${REPO}/scripts/factory/classify-failure.sh; CLASS=$(classify_failure /tmp/factory-ci-${A.ticket_id}.log)
          If CLASS == freshness (first time only): cd ${WORK_WT} && task freshness:regenerate && git commit -am 'chore: refresh (factory)' && git push; re-run CI without incrementing retry.
      c) TWO-GATED auto-fix: source ${REPO}/scripts/factory/classify-failure.sh; CLASS=$(classify_failure /tmp/factory-ci-${A.ticket_id}.log)
         Gate 1: CLASS must be ci|test|lint. Gate 2: source ${REPO}/scripts/factory/classify-paths.sh; paths_are_escalate_class "${featureTouchedFiles.join(',')}" must exit 1.
         If EITHER fails -> blocked, notify, return.
      d) If both pass: make smallest fix for CLASS=${'${CLASS}'}, commit + push, then:
         bash ${REPO}/scripts/ticket.sh retry-count incr --id ${A.ticket_id}
         bash ${REPO}/scripts/ticket.sh add-comment --id ${A.ticket_id} \\
           --body "$(printf 'Factory retry %s/2 (class=%s)\\n--- diff ---\\n%s\\n--- ci log tail ---\\n%s' "$RC" "$CLASS" "$(git diff HEAD~1 --shortstat)" "$(tail -30 /tmp/factory-ci-${A.ticket_id}.log)")"
         Then re-run CI from (a).
      If RC -ge 2 or a gate failed: bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status blocked; bash ${REPO}/scripts/ticket.sh phase ${A.ticket_id} verify blocked --driver factory --detail "gate=ci result=fail" || true; add-comment "CI red after retries"; return.
   4. gh pr merge "$PR" --squash --delete-branch --auto
   5. PR_NUM=$(gh pr view "$PR" --json number -q '.number' 2>/dev/null || echo "$PR")
      bash ${REPO}/scripts/ticket.sh add-pr-link --id ${A.ticket_id} --pr "$PR_NUM" || true
      bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status done --resolution shipped
      bash ${REPO}/scripts/ticket.sh phase ${A.ticket_id} verify done --driver factory --detail "gate=ci result=pass" || true
      bash ${REPO}/scripts/ticket.sh archive-plan --id ${A.ticket_id} --slug ${slug} --branch ${WORK_BRANCH} --plan-file ${resolvedPlanFile}
   5b. bash ${REPO}/scripts/ticket.sh feature-flag set --brand mentolder --key ${slug} --enabled false --set-by factory
       bash ${REPO}/scripts/ticket.sh feature-flag set --brand korczewski --key ${slug} --enabled false --set-by factory
   6. ${deployStepCmd}
   7. kubectl --context fleet rollout status deployment/website -n website --timeout=300s
      kubectl --context fleet rollout status deployment/website -n website-korczewski --timeout=300s
   8. LAYER-4 CANARY per brand (mentolder korczewski):
      SERVICE=website TARGET=<brand> source ${REPO}/scripts/feature-promote.sh
      observe_prod <brand> "$(svc_image_repo website <brand>):${A.timestamp}"
      If RED: output CANARY_RED <brand>

   Report the merged PR number and deploy outputs.` + injections,
  { label: 'deploy', phase: 'Deploy', model: FACTORY_MODEL },
)

if (typeof deploy === 'string' && /blocked/i.test(deploy)) {
  if (deploy.includes('deploy-guard') || deploy.includes('BLOCK: WORK_BRANCH') || deploy.includes('diff exceeds FACTORY_MAX_DIFF')) {
    return { status: 'blocked', reason: 'deploy-guard' }
  }
  await agent(
    `Notify operator: self-healing exhausted.
     PushNotification: \`ToolSearch select:PushNotification\`, then:
       title "Factory: ${A.ticket_id} CI-blocked"
       body "Self-healing exhausted for \\"${A.title}\\" (${brand})."`,
    { label: 'notify:ci-blocked', phase: 'Deploy', model: FACTORY_MODEL },
  )
  return { status: 'blocked', reason: 'ci-red-after-retries', ticket: A.ticket_id }
}

const canaryRed = typeof deploy === 'string' ? [...deploy.matchAll(/CANARY_RED\s+(mentolder|korczewski)/g)].map(m => m[1]) : []
if (canaryRed.length) {
  for (const b of canaryRed) {
    await agent(
      `Canary RED on ${b} (rollback done). Dark-launch OFF:
       bash ${REPO}/scripts/ticket.sh feature-flag set --brand ${b} --key ${slug} --enabled false --set-by factory-canary
       bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status blocked
       bash ${REPO}/scripts/ticket.sh add-comment --id ${A.ticket_id} --body ${JSON.stringify(`Factory canary RED on ${b}: rolled back + flag '${slug}' disabled.`)}`,
      { label: `canary:rollback:${b}`, phase: 'Deploy', model: FACTORY_MODEL },
    )
  }
  await agent(
    `Notify operator: canary failed.
     PushNotification: \`ToolSearch select:PushNotification\`, then:
       title "Factory: ${A.ticket_id} canary RED"
       body "Live-prod canary failed on ${canaryRed.join(', ')} for \\"${A.title}\\"."`,
    { label: 'notify:canary-red', phase: 'Deploy', model: FACTORY_MODEL },
  )
  return { status: 'blocked', reason: 'canary-red', brands: canaryRed, ticket: A.ticket_id }
}

const deployTransJson = await runRunner(agent, 'decide-deploy', { isWebsite: slug?.includes('website') ?? false, deployOutput: deploy })
const { status: deployStatus, reason: deployReason } = JSON.parse(deployTransJson)
// Merge = Abschluss (T001092): the agent prompt (step 5) already set the ticket to
// done/shipped after the confirmed auto-merge. The Deploy phase-event records the
// merge; there is no separate awaiting_deploy resting state on the happy path.
await phaseEvent('deploy', deployStatus === 'blocked' ? 'blocked' : 'done', deployStatus === 'blocked' ? 'deploy blocked' : 'PR merged · done/shipped')
await runRunner(agent, 'broadcast', { msg: `factory-pipeline: ${A.ticket_id} finished (${deployStatus})`, label: 'factory' })
return { status: deployStatus, reason: deployReason, pr: deploy, reviews: reviews.length, tasks: tasks.length, implemented: implemented.length }

} finally {
  // eslint-disable-next-line no-unsafe-finally
  try { await agent(`bash ${REPO}/scripts/factory/cleanup.sh --branch '${WORK_BRANCH}' --worktree '${WORK_WT}'`, { label: 'cleanup', model: FACTORY_MODEL }) } catch (_) {}
}
}

export default main
await main()
