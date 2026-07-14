/**
 * scripts/factory/pipeline.js — Workflow script. Harness-injected globals:
 * agent, parallel, pipeline, phase, log, args.
 * args: { title, description, slug, ticket_id, brand, timestamp, batch_mode?, sub_features? }
 * Offline: node --check.
 */

export const meta = {
  name: 'software-factory-pipeline',
  description: 'Phase-1 single-feature pipeline: Scout → Design → Plan → Implement → Verify → Deploy',
  phases: [
    { title: 'Scout' }, { title: 'Design' }, { title: 'Plan' },
    { title: 'Implement' }, { title: 'Verify' }, { title: 'Deploy' },
  ],
}

const path = require('path')
const D = require('./pipeline-decompose.cjs')
const BL = require('./build-loop.cjs')
const SQ = require('./scout-quality-check.cjs')
let _msgBridge = null
try { _msgBridge = require('./agent-msg-bridge.cjs') } catch (_) {}
const ACI = process.env.ACI_ENABLED === 'true' ? require('./aci.cjs') : null
const { decideDeployTransition } = require('./deploy-transition.cjs')
const { resolveTaskSource } = require('./task-source.cjs')
// Attribute all phase events emitted by shelled-out ticket.sh calls to the factory
// driver. The auto-emission dedup makes double-emission harmless; this is the
// safety net for driver attribution when dedup does not apply (T001444).
if (!process.env.TICKET_PHASE_DRIVER) process.env.TICKET_PHASE_DRIVER = 'factory'
function routeProviderSync(source, tier, phase) {
  if (tier === 'opus') {
    if (process.env.ANTHROPIC_MODEL) {
      return { provider: 'lmstudio', modelId: process.env.ANTHROPIC_MODEL,
               baseUrl: process.env.ANTHROPIC_BASE_URL || 'http://127.0.0.1:1234', slotId: null, ctx: 0, emergency: false }
    }
    return { provider: 'lmstudio', modelId: 'qwythos-9b-v2', baseUrl: 'http://127.0.0.1:1234', slotId: null, ctx: 0, emergency: false }
  }
  if (process.env.ANTHROPIC_MODEL) {
    return { provider: 'lmstudio', modelId: process.env.ANTHROPIC_MODEL,
             baseUrl: process.env.ANTHROPIC_BASE_URL || 'http://127.0.0.1:1234', slotId: null, ctx: 0, emergency: false }
  }
  try {
    const { execFileSync } = require('child_process')
    const args = [`${REPO}/scripts/factory/route-provider.sh`, source, tier]
    if (phase) args.push(phase)
    const out = execFileSync('bash', args,
      { encoding: 'utf8', timeout: 20000, env: { ...process.env, BRAND: brand } }).trim()
    return JSON.parse(out)
  } catch (e) {
    log(`routeProvider(${source},${tier},${phase || ''}) failed -> emergency local qwythos: ${e.message}`)
    return { provider: 'lmstudio', modelId: 'qwythos-9b-v2', baseUrl: 'http://127.0.0.1:1234', slotId: null, ctx: 0, emergency: true }
  }
}

function releaseSlotSync(slotId, success, ctx = 0) {
  if (!slotId) return
  try {
    const { execFileSync } = require('child_process')
    execFileSync('bash', [`${REPO}/scripts/factory/release-slot.sh`, String(slotId), success ? 'true' : 'false', String(ctx || 0)],
      { stdio: 'ignore', timeout: 20000, env: { ...process.env, BRAND: brand } })
  } catch (e) { log(`releaseSlot(${slotId}) failed (non-fatal): ${e.message}`) }
}

function routerSource(phaseKey) {
  return ({ scout: 'factory-scout', design: 'factory-plan', plan: 'factory-plan',
            implement: 'factory-implement', verify: 'factory-review', deploy: 'factory-implement' })[phaseKey] || '*'
}

function routerTier(model) { return model === 'opus' ? 'opus' : (model === 'haiku' ? 'haiku' : 'sonnet') }

async function main() {

const A = args ?? {}
const slug = A.slug           // args.timestamp for resume-safe timestamps
const brand = A.brand ?? 'mentolder'
const REPO = '/home/patrick/Bachelorprojekt'
const WT = `${REPO}/.worktrees/${slug}`

function phaseEvent(ph, state, detail) {
  try {
    const { execFileSync } = require('child_process')
    const a = [`${REPO}/scripts/ticket.sh`, 'phase', String(A.ticket_id), ph, state, '--driver', 'factory']
    if (detail) a.push('--detail', String(detail).slice(0, 240))
    execFileSync('bash', a, { stdio: 'ignore', timeout: 15000 })
  } catch {}
  try { require('./otel-emit.cjs').emitPhase(ph, state, { brand, ticket_id: A.ticket_id }); } catch {}
}

function consumeInjections(ph) {
  try {
    const { execFileSync } = require('child_process'), fs = require('fs'), path = require('path'), sh = (a, opt) => execFileSync('bash', [`${REPO}/scripts/ticket.sh`, ...a], opt)
    const rows = JSON.parse(sh(['get-injections', '--id', String(A.ticket_id), '--phase', ph, '--consume', '--format', 'json'], { encoding: 'utf8', timeout: 20000 }).trim() || '[]')
    if (!Array.isArray(rows) || !rows.length) return ''
    const inbox = path.join(WORK_WT, 'assets-inbox', String(A.ticket_id)), lines = [], files = (r) => r.target_files ? r.target_files.join(', ') : ''
    for (const r of rows) {
      if (r.kind === 'asset' && r.data_url && r.filename)
        try { fs.mkdirSync(inbox, { recursive: true }); const dest = path.join(inbox, path.basename(String(r.filename))); fs.writeFileSync(dest, Buffer.from(String(r.data_url).replace(/^data:[^;]+;base64,/, ''), 'base64')); lines.push(`ASSET available at ${dest}${files(r) ? ` (for: ${files(r)})` : ''}`) } catch {}
      else if (r.content || r.title) lines.push(`- ${r.title ? r.title + ': ' : ''}${r.content ?? ''}${files(r) ? ` [files: ${files(r)}]` : ''}`)
    }
    try { sh(['add-comment', '--id', String(A.ticket_id), '--author', 'factory', '--body', `consumed ${rows.length} @ ${ph}`], { stdio: 'ignore', timeout: 15000 }) } catch {}
    return lines.length ? `\n\nOPERATOR INJECTED CONTEXT — verbindlich berücksichtigen:\n${lines.join('\n')}\n` : ''
  } catch { return '' }
}

const DRY_RUN = A.dry_run === true || A.dry_run === 'true'
let REUSE_BRANCH = A.branch || null
let REUSE_PLAN   = A.plan_path || null
let REUSE = !!(REUSE_BRANCH && REUSE_PLAN)

// ── Auto-detect FACTORY-PLAN-REF when REUSE is not explicitly set ──
// If dev-flow-plan staged a plan but the dispatcher didn't pass branch/plan_path,
// the ticket still carries a FACTORY-PLAN-REF comment. Parse it to enable REUSE
// and skip Scout/Design/Plan-creation — the human already did that work.
if (!REUSE && A.ticket_id) {
  try {
    const cp2 = require('child_process')
    const ticketJson = cp2.execFileSync('bash',
      [`${REPO}/scripts/ticket.sh`, 'get', '--id', String(A.ticket_id)],
      { encoding: 'utf8', timeout: 15000, env: { ...process.env, BRAND: brand } })
    const planRef = JSON.parse(ticketJson).plan_ref || ''
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

const WORK_BRANCH = REUSE ? REUSE_BRANCH : `feature/${slug}`
const WORK_WT = REUSE ? `${REPO}/.worktrees/${slug}-reuse` : WT

let specPath = null
let tasks = []
let featureComplexity = null
let featureTouchedFiles = []
let planFilePath = REUSE ? REUSE_PLAN : null

// ── Batch mode: parallel sub-features ──
if (A.batch_mode === true && Array.isArray(A.sub_features)) {
  phase('Implement')
  phaseEvent('implement', 'entered', `Batch: ${A.sub_features.length} sub-features`)

  // Ensure shared worktree exists for the parent feature
  const wtSetup = await agent(
    `Liveness: \`bash ${REPO}/scripts/ticket.sh touch --id ${A.ticket_id}\`.
     From ${REPO}, create the isolated worktree for this batch feature:
       bash ${REPO}/scripts/worktree-create.sh ${WORK_BRANCH} ${WORK_WT} origin/main
     Report the FULL stdout and success/fail.`,
    { label: 'impl:batch-worktree', phase: 'Implement' },
  )
  if (!/ready on/.test(String(wtSetup ?? ''))) {
    await agent(
      `Batch worktree could not be created for ${A.ticket_id}.
       Record: bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status blocked
       Then PushNotification is DEFERRED: \`ToolSearch select:PushNotification\`, then:
         title "Factory batch worktree failed: ${A.ticket_id}"
         message "worktree-create.sh did not report success. ${String(wtSetup ?? '').slice(0, 240)}"
       Report what was notified.`,
      { label: 'impl:batch-worktree-escalate', phase: 'Implement' },
    )
    phaseEvent('implement', 'blocked', 'batch-worktree')
    return { status: 'blocked', reason: 'worktree-setup', detail: String(wtSetup ?? '').slice(0, 400) }
  }

  const subResults = await parallel(A.sub_features.map((sf) => () => {
    const sfProv = D.provision({ complexity: sf.complexity || 'medium', role: 'implement', risk: (sf.assignedFiles?.some((f) => /\.sql$|^k3d\/|^environments\/|realm.*\.json/.test(f)) ? 'high' : 'low'), budgetRemaining: 1, ticketId: A.ticket_id, touchedFiles: sf.assignedFiles || [], gpuEmbeddings: false })
    const sfRoute = routeProviderSync('factory-implement', routerTier(sfProv.model), 'implement')
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
       Return a summary of the diff and local test result.` + consumeInjections('implement'),
      { label: `batch:${sf.id}`, phase: 'Implement', model: BL.resolveAgentModel(sfRoute, routerTier(sfProv.model), log) },
    )
  }))

  const succeeded = subResults.filter(Boolean)
  log(`Batch: ${succeeded.length}/${A.sub_features.length} sub-features done, ${A.sub_features.length - succeeded.length} skipped`)

  // Skip Verify/Deploy in batch mode — each SF is verified individually.
  // Continue to Deploy so the parent gets a PR.
}

const REVIEW_SCHEMA = { type: 'object', required: ['findings'], properties: { findings: { type: 'array', items: { type: 'object', required: ['severity', 'file', 'description'], properties: { severity: { enum: ['low', 'medium', 'high', 'critical'] }, file: { type: 'string' }, line: { type: 'integer' }, description: { type: 'string' }, suggested_fix: { type: 'string' } } } }, summary: { type: 'string' } } }
try { if (!REUSE) {
phase('Scout')
phaseEvent('scout', 'entered', 'Codebase-Analyse (deterministisch) gestartet')
_msgBridge.broadcast(`factory-pipeline: claiming ${A.ticket_id} (${A.title || A.slug})`, 'factory')
const cp = require('child_process')
try { cp.execFileSync('bash', [`${REPO}/scripts/ticket.sh`, 'touch', '--id', String(A.ticket_id)], { stdio: 'ignore', timeout: 10000 }) } catch {}

const scoutJson = cp.execFileSync('bash',
  [`${REPO}/scripts/factory/scout.sh`,
   '--ticket-id',   String(A.ticket_id),
   '--title',       String(A.title),
   '--slug',        String(A.slug ?? ''),
   '--description', String(A.description ?? ''),
   '--repo',        REPO],
  { encoding: 'utf8', timeout: 60000 })

let scout
try {
  scout = JSON.parse(scoutJson)
} catch (e) {
  throw new Error(`Scout output not valid JSON: ${String(scoutJson).slice(0, 200)}`)
}
if (!scout || typeof scout.complexity !== 'string'
    || !['simple', 'medium', 'complex'].includes(scout.complexity)
    || !Array.isArray(scout.touched_files)
    || !Array.isArray(scout.risk_areas)
    || !Array.isArray(scout.similar_tickets)) {
  throw new Error(`Scout output invalid: ${String(scoutJson).slice(0, 200)}`)
}

log(`Scout: complexity=${scout.complexity}, ${scout.touched_files.length} touched files`)
featureComplexity = scout.complexity
featureTouchedFiles = scout.touched_files

try {
  cp.execFileSync('bash',
    [`${REPO}/scripts/ticket.sh`, 'set-touched-files',
     '--id', String(A.ticket_id),
     '--files', scout.touched_files.join(',')],
    { stdio: 'ignore', timeout: 15000 })
} catch (e) {
  log(`scout:persist set-touched-files failed (non-fatal): ${e.message}`)
}
phaseEvent('scout', 'done', `${(scout.touched_files || []).length} touched_files`)

const sqGate = SQ.runScoutGate({ ...scout, title: A.title, description: A.description }, A.ticket_id, REPO, cp, log, phaseEvent)
if (sqGate) return sqGate

let scsSuggestedFiles = []
try {
  const BASE_URL = process.env.WEBSITE_BASE_URL ?? 'http://website.workspace.svc.cluster.local:4321'
  const scsRes = await fetch(
    `${BASE_URL}/api/codesearch?q=${encodeURIComponent(A.title)}&limit=5`,
    { headers: { Cookie: process.env.ADMIN_COOKIE ?? '' }, signal: AbortSignal.timeout(8000) }
  )
  if (scsRes.ok) {
    const scsJson = await scsRes.json()
    scsSuggestedFiles = scsJson.results ?? []
    log(`SCS: ${scsSuggestedFiles.length} semantically related files found`)
    if (scsSuggestedFiles.length > 0) {
      scout.touched_files = scout.touched_files || []
      const existingSet = new Set(scout.touched_files)
      const scsPaths = scsSuggestedFiles.map(f => `${REPO}/${f.path}`)
      for (const p of scsPaths) {
        if (!existingSet.has(p)) {
          scout.touched_files.push(p)
          existingSet.add(p)
        }
      }
      featureTouchedFiles = scout.touched_files
      log(`SCS: merged ${scsSuggestedFiles.length} semantic paths into touched_files (now ${scout.touched_files.length})`)
    }
  }
} catch (scsErr) {
  log(`SCS: unavailable (graceful degradation) — ${scsErr.message ?? scsErr}`)
  scsSuggestedFiles = []
}

const isSimple = scout.complexity === 'simple'

specPath = null
if (!isSimple) {
  phase('Design')
  phaseEvent('design', 'entered', 'Spec-Generierung')
  const design = await agent(
    `/goal Generate design specification for feature "${A.title}".
     Liveness: \`bash ${REPO}/scripts/ticket.sh touch --id ${A.ticket_id}\`.
     Write a design spec for "${A.title}" following ARCH/GOALS/RISKS/DECISIONS structure.
     For medium/complex, include a "try to refute this design" section.
     Save the spec to: ${REPO}/docs/superpowers/specs/$(date +%F)-${slug}-design.md
     (compute YYYY-MM-DD with \`date +%F\` — do NOT use a literal "undefined").
     Then attach it: bash ${REPO}/scripts/ticket-attach.sh <uuid> <specfile>
     Return the spec file path (just the absolute path, nothing else).` + consumeInjections('design'),
    { label: 'design', phase: 'Design' },
  )
  specPath = design.trim()
  phaseEvent('design', 'done', 'Spec erstellt')
}

tasks = []
if (!isSimple) {
  phase('Plan')
  phaseEvent('plan', 'entered', 'Plan-Erstellung')
  const conflict = await agent(
    `Liveness: \`bash ${REPO}/scripts/ticket.sh touch --id ${A.ticket_id}\`.
     Run the brand-aware conflict gate:
       BRAND=${brand} bash ${REPO}/scripts/factory/conflict-check.sh ${A.ticket_id} ${scout.touched_files.join(' ')}
     Report the exact stdout JSON and exit code.
     Exit 0 = no conflicts. Exit 1 = conflicts found (STOP). Exit 2 = error.`,
    { label: 'plan:conflict', phase: 'Plan' },
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
      { label: 'conflict:escalate', phase: 'Plan' },
    )
    phaseEvent('plan', 'blocked', 'file-overlap: ' + String(conflict).slice(0, 120))
    return { status: 'blocked', reason: 'file-overlap', conflict, released: true }
  }

  const planProv = D.provision({ complexity: scout.complexity, role: 'plan', risk: (scout.risk_areas?.length ? 'high' : 'low'), budgetRemaining: 1, ticketId: A.ticket_id, touchedFiles: scout.touched_files, gpuEmbeddings: false })
  const planRoute = routeProviderSync('factory-plan', routerTier(planProv.model), 'plan')
  const plan = await agent(
    `/goal Decompose specification into task list plan.
     Decompose the spec at ${specPath} into independent tasks where no two tasks
     touch the same file. For each task provide: id, target_files (array),
     acceptance_criteria (array of strings).

     Write the plan to ${REPO}/openspec/changes/${slug}/tasks.md
     (create the directory with mkdir -p ${REPO}/openspec/changes/${slug} first).
     Do NOT run the frontmatter hook (openspec tasks have no frontmatter).

     Return JSON { tasks: [...], plan_path: "<absolute path>" }` + consumeInjections('plan'),
    {
      model: BL.resolveAgentModel(planRoute, routerTier(planProv.model), log),
      label: 'plan:decompose',
      phase: 'Plan',
      schema: { type: 'object', required: ['tasks', 'plan_path'], properties: { plan_path: { type: 'string' }, tasks: { type: 'array', items: { type: 'object', required: ['id', 'target_files', 'acceptance_criteria'], properties: { id: { type: 'string' }, target_files: { type: 'array', items: { type: 'string' } }, acceptance_criteria: { type: 'array', items: { type: 'string' } } } } } } },
    },
  )
  releaseSlotSync(planRoute.slotId, plan != null, planRoute.ctx)
  tasks = plan.tasks
  planFilePath = plan.plan_path
  phaseEvent('plan', 'done', `${(plan.tasks || []).length} Tasks`)

  // Deterministic plan-lint gate (T000910) — fail-closed, no LLM. One fix iteration.
  // Security (T000910 follow-up): every interpolated value below is either a sanitized
  // ticket id ([A-Za-z0-9_-] only) or base64-encoded before it reaches the shell, so
  // untrusted linter output / plan paths can never break out of the command string.
  const shSafeTicketId = String(A.ticket_id).replace(/[^A-Za-z0-9_-]/g, '')
  const shQuotedPlanPath = `'${String(planFilePath).replace(/'/g, "'\\''")}'`
  const lintOnce = async (note) => agent(
    `Run the deterministic plan linter and return ONLY its stdout:
     bash ${REPO}/scripts/plan-lint.sh --json ${shQuotedPlanPath}` + (note || ''),
    { label: 'plan:lint', phase: 'Plan' },
  )
  let lintOut = await lintOnce('')
  if (/"verdict"\s*:\s*"FAIL"/.test(lintOut)) {
    await agent(
      `The plan ${planFilePath} failed plan-lint with: ${String(lintOut).slice(0, 400)}.
       Fix ONLY the reported hard-fails (frontmatter/STRUCT/P1/B1a) in place, then re-run.`,
      { label: 'plan:lint-fix', phase: 'Plan' },
    )
    lintOut = await lintOnce(' (after fix iteration)')
  }
  if (/"verdict"\s*:\s*"FAIL"/.test(lintOut)) {
    // base64-encode the untrusted linter output; the shell decodes it back into a single
    // --body argument. base64's alphabet ([A-Za-z0-9+/=]) is safe inside single quotes,
    // so no token in lintOut (backtick, $(), ;, quote) can ever break out of the command.
    const reasonB64 = Buffer.from(`plan-lint FAIL: ${String(lintOut).slice(0, 300)}`, 'utf8').toString('base64')
    await agent(
      `Plan still fails plan-lint after one fix. Block enqueue + comment the ticket:
       bash ${REPO}/scripts/ticket.sh release-slot --id '${shSafeTicketId}'
       bash ${REPO}/scripts/ticket.sh update-status --id '${shSafeTicketId}' --status backlog
       bash ${REPO}/scripts/ticket.sh add-comment --id '${shSafeTicketId}' --body "$(printf %s '${reasonB64}' | base64 -d)"`,
      { label: 'plan:lint-block', phase: 'Plan' },
    )
    phaseEvent('plan', 'blocked', 'plan-lint-fail')
    return { status: 'blocked', reason: 'plan-lint-fail', lint: lintOut }
  }
}
}

if (REUSE) {
  phase('Plan')
  phaseEvent('plan', 'entered', 'Plan-Reuse')
  const reuse = await agent(
    `A human already planned this feature via dev-flow on ${WORK_BRANCH}.
     Read the plan file (git show "origin/${WORK_BRANCH}:${REUSE_PLAN}") and
     decompose into independent tasks where no two tasks touch the same file:
     each { id, target_files:[...], acceptance_criteria:[...] }.
     Do NOT write a new plan. Return { tasks: [...] }.` + consumeInjections('plan'),
    { label: 'plan:reuse', phase: 'Plan', schema: { type:'object', required:['tasks'], properties:{ tasks:{ type:'array', items:{ type:'object', required:['id','target_files','acceptance_criteria'], properties:{ id:{type:'string'}, target_files:{type:'array',items:{type:'string'}}, acceptance_criteria:{type:'array',items:{type:'string'}} } } } } } },
  )
  tasks = reuse.tasks
  phaseEvent('plan', 'done', `${(tasks || []).length} Tasks (reuse)`)
}

let implemented = []
if (tasks.length && !A.batch_mode) {
  phase('Implement')
  phaseEvent('implement', 'entered', 'Implementierung gestartet')

  const wtSetup = await agent(
    `Liveness: \`bash ${REPO}/scripts/ticket.sh touch --id ${A.ticket_id}\`.
     From ${REPO}, create the isolated worktree:
       bash ${REPO}/scripts/worktree-create.sh ${WORK_BRANCH} ${WORK_WT} origin/main
     Report the FULL stdout and exit code. A success line contains "ready on".`,
    { label: 'impl:worktree-setup', phase: 'Implement' },
  )
  if (!/ready on/.test(String(wtSetup ?? ''))) {
    await agent(
      `Worktree could not be created for ${A.ticket_id}.
       Record: bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status blocked
       Then PushNotification is DEFERRED: \`ToolSearch select:PushNotification\`, then:
         title "Factory worktree failed: ${A.ticket_id} (${brand})"
         message "worktree-create.sh did not report success. ${String(wtSetup ?? '').slice(0, 240)}"
       Report what was notified.`,
      { label: 'impl:worktree-escalate', phase: 'Implement' },
    )
    phaseEvent('implement', 'blocked', 'worktree-setup')
    return { status: 'blocked', reason: 'worktree-setup', detail: String(wtSetup ?? '').slice(0, 400) }
  }

  for (const t of tasks) {
    const prov = D.provision({ complexity: featureComplexity, role: 'implement', risk: (t.target_files?.some((f) => /\.sql$|^k3d\/|^environments\/|realm.*\.json/.test(f)) ? 'high' : 'low'), budgetRemaining: 1, ticketId: A.ticket_id, touchedFiles: t.target_files, gpuEmbeddings: false })
    const route = routeProviderSync('factory-implement', routerTier(prov.model), 'implement')
    const aciToolHint = ACI ? [
      'Use the ACI tool set for file operations:',
      '  aci_view <file> [start:end]  - view numbered lines (focused reading, max 80 lines)',
      '  aci_search <pattern> [glob]  - find pattern in files with line numbers',
      '  aci_edit <file> <start> <end> <replacement>  - edit with auto-syntax-validate + revert',
      '  aci_test [subset]  - run relevant tests for changed files',
      'Each aci_edit is validated automatically. If validation fails, the edit is reverted.',
    ].join('\n') : ''
    let impl = null
    try {
      impl = await agent(
        `/goal Implement task ${t.id} for ticket ${A.ticket_id}.
         Liveness: \`bash ${REPO}/scripts/ticket.sh touch --id ${A.ticket_id}\`.
         Implement task ${t.id} on ${WORK_BRANCH} in the shared worktree at ${WORK_WT}
         (already exists — do NOT run \`git worktree add\`).
         Target files: ${t.target_files.join(', ')}.
         Follow TDD (red-green). Acceptance: ${t.acceptance_criteria.join('; ')}.
         DARK-LAUNCH: gate new behavior behind isFeatureEnabled('${brand}', '${slug}') (default OFF).
         Context hints: ${prov.contextHints.join(' | ')}.
         ${aciToolHint}
         After implementing: bash ${REPO}/scripts/factory/sandbox-run.sh ${WORK_WT} 'task workspace:validate && task test:all && task freshness:regenerate'
         Then commit: cd ${WORK_WT} && git add -A && git commit -m ${JSON.stringify(`feat(${slug}): ${t.id} [factory]`)}
         Return a summary of the diff and local test result (pass/fail).` + consumeInjections('implement'),
        { label: `impl:${t.id}`, phase: 'Implement', model: BL.resolveAgentModel(route, routerTier(prov.model), log) },
      )
      releaseSlotSync(route.slotId, impl != null, route.ctx)
    } catch (err) {
      releaseSlotSync(route.slotId, false, route.ctx)
      throw err
    }
    if (impl == null) continue

    // ACI repair loop: validate target files, retry on failure
    if (ACI) {
      const MAX_REPAIR = parseInt(process.env.ACI_MAX_REPAIR || '3')
      for (let repair = 0; repair < MAX_REPAIR; repair++) {
        const failures = []
        for (const f of t.target_files) {
          const v = ACI.validate(path.join(WORK_WT, f))
          if (!v.valid) failures.push({ file: f, error: v.error, label: v.label })
        }
        if (failures.length === 0) break
        log(`ACI repair iteration ${repair + 1}/${MAX_REPAIR}: ${failures.length} file(s) invalid`)
        const repairResult = await agent(
          `/goal Fix validation errors for task ${t.id} in ${WORK_WT}.
           Files with validation errors:
           ${failures.map(f => `  ${f.file}: ${f.error}`).join('\n')}
           Use aci_view to inspect, aci_edit to fix. Each edit auto-validates.
           After fixes: cd ${WORK_WT} && git add -A && git commit --amend --no-edit.
           Report pass/fail.`,
          { label: `impl:${t.id}:repair-${repair}`, phase: 'Implement' },
        )
        if (!repairResult) break
      }
    }

    const vr = await BL.runTaskVerifyLoop({ t, maxLoop: parseInt(process.env.FACTORY_BUILD_LOOP_MAX || '3'), WORK_WT, WORK_BRANCH, slug, A, prov })
    if (vr) implemented.push(vr)
  }
  phaseEvent('implement', 'done', `${tasks.length} Tasks implementiert`)
}

phase('Verify')
phaseEvent('verify', 'entered', 'Tests + Freshness')
const cleanDiff = (await agent(
  `cd ${WORK_WT} (HEAD=${WORK_BRANCH}) then run \`bash ${REPO}/scripts/factory/filter-diff.sh origin/main...HEAD\`. Return its raw stdout ONLY (empty = all-noise diff).`,
  { label: 'verify:filter', phase: 'Verify' },
)) || ''
let reviews = []
let coordinatorVerdict = null
if (!cleanDiff || !String(cleanDiff).trim()) {
  log('Verify: filtered diff is empty (noise-only) — skipping review lenses.')
  phaseEvent('verify', 'done', 'noise-only')
} else {
  const tierJson = (await agent(
    `cd ${WORK_WT} then run \`bash ${REPO}/scripts/factory/classify-risk.sh origin/main...HEAD\`. Return its raw JSON stdout ONLY.`,
    { label: 'verify:classify', phase: 'Verify' },
  )) || '{"tier":"full"}'
  let tier = 'full'
  try { tier = (JSON.parse(typeof tierJson === 'string' ? tierJson : JSON.stringify(tierJson)).tier) || 'full' } catch { tier = 'full' }
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

  reviews = (await parallel(lenses.map((l) => () => {
    const route = routeProviderSync('factory-review', 'opus', 'verify')
    return agent(
      `/goal Perform verification review lens: ${l.key}.
       Liveness: \`bash ${REPO}/scripts/ticket.sh touch --id ${A.ticket_id}\`. Then review at ${REPO}/${l.file} against: git -C ${WORK_WT} diff origin/main...HEAD. Return findings as JSON per the prompt's schema.` + consumeInjections('verify'),
      { label: `review:${l.key}`, phase: 'Verify', ...(l.key === 'agents-md' ? {} : { schema: REVIEW_SCHEMA }), model: BL.resolveAgentModel(route, 'opus', log) },
    )
  }))).filter(Boolean)
  log(`Verify: ${reviews.length}/${lenses.length} lenses done, tier=${tier}`)

  const allFindings = reviews.flatMap((r) => r.findings || [])
  if (allFindings.length > 0 && cleanDiff) {
    try {
      const { execSync } = require('child_process')
      const fs = require('fs')
      const path = require('path')
      const tmpDir = '/tmp'
      const diffFile = path.join(tmpDir, `ci-filter-diff-${A.ticket_id}.diff`)
      fs.writeFileSync(diffFile, String(cleanDiff), 'utf8')
      let kept
      try {
        const raw = execSync(
          `node ${REPO}/scripts/factory/review-finding-filter.mjs --cli --diff ${diffFile} --stdin`,
          { input: JSON.stringify(allFindings), encoding: 'utf8', timeout: 10_000 }
        )
        const parsed = JSON.parse(raw)
        kept = parsed.kept || []
      } catch { kept = allFindings }
      finally { try { fs.unlinkSync(diffFile) } catch {} }
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
  // Playwright smoke), full tier only. Subprocess (not a prompt lens); fail-open.
  if (tier === 'full' && process.env.FACTORY_QA_LENS !== 'off') {
    try {
      const { execFileSync } = require('child_process')
      const raw = execFileSync('node', [
        `${REPO}/scripts/factory/qa-lens.mjs`,
        '--worktree', WORK_WT, '--branch', WORK_BRANCH, '--ticket', String(A.ticket_id),
        '--diff-range', 'origin/main...HEAD',
      ], { encoding: 'utf8', timeout: 40 * 60 * 1000 })
      const qaResult = JSON.parse(raw)
      reviews.push(qaResult)
      phaseEvent('verify', 'qa', String(qaResult.summary || `${(qaResult.findings || []).length} finding(s)`).slice(0, 240))
    } catch (err) {
      reviews.push({ findings: [{ severity: 'medium', file: '(qa-lens)', description: `qa-lens spawn failed: ${String(err.message || err).slice(0, 300)}` }], summary: 'qa-lens spawn failed' })
      phaseEvent('verify', 'qa', 'spawn failed')
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
    const coordRoute = routeProviderSync('factory-review', 'opus', 'verify')
    const coord = await agent(
      `Read ${REPO}/scripts/factory/review-coordinator.prompt.md and apply to these lens findings. Return ONE consolidated JSON with "verdict" field.\n${xml}`,
      { label: 'review:coordinator', phase: 'Verify', schema: COORDINATOR_SCHEMA, model: BL.resolveAgentModel(coordRoute, 'opus', log) },
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
    { label: 'verify:breadcrumb', phase: 'Verify' },
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
      { label: 'verify:escalate', phase: 'Verify' },
    )
    phaseEvent('verify', 'blocked', (blocking.length || 1) + ' blocking finding(s)')
    return { status: 'blocked', reason: 'review-findings', blocking, verdict: coordinatorVerdict }
  }
  phaseEvent('verify', 'done', 'Tests ✓')
}

phase('Deploy')
phaseEvent('deploy', 'entered', 'PR erstellt · CI watch')
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
    { label: 'deploy:dry-run', phase: 'Deploy' },
  )
  phaseEvent('deploy', 'done', 'dry-run')
  return { status: 'dry-run', report, reviews: reviews.length, tasks: tasks.length }
}

function resolvePartialServices(touched) {
  try {
    const { execFileSync } = require('child_process')
    const csv = (touched ?? []).join(',')
    const out = execFileSync('bash', ['-c',
      `source ${REPO}/scripts/factory/service-registry.sh && resolve_partial_services "$1"`,
      'bash', csv],
      { encoding: 'utf8' }).trim()
    return out.length > 0 ? out : null
  } catch {
    return null
  }
}
const partialServices = resolvePartialServices(featureTouchedFiles)
const deployStepCmd = partialServices
  ? `task workspace:partial-deploy ENV=mentolder PARTIAL_SERVICES=${partialServices} && task workspace:partial-deploy ENV=korczewski PARTIAL_SERVICES=${partialServices}`
  : `task workspace:deploy ENV=mentolder && task workspace:deploy ENV=korczewski`
log(`Deploy mode: ${partialServices ? `PARTIAL [${partialServices}]` : 'FULL'} (touched=${(featureTouchedFiles ?? []).length})`)
phaseEvent('deploy', partialServices ? 'partial' : 'full', partialServices ? `services=${partialServices}` : 'full deploy')

const deploy = await agent(
  `/goal Deploy feature branch ${WORK_BRANCH} to both brands.
   Liveness: \`bash ${REPO}/scripts/ticket.sh touch --id ${A.ticket_id}\`.
   Deploy to both brands. Operate from MAIN repo ${REPO} (NOT ${WORK_WT}).

   HARD GUARDS — STOP on any failure:
   a. Branch: WORK_BRANCH must match ^(feature|fix)/ .
      printf '%s' "${WORK_BRANCH}" | grep -Eq '^(feature|fix)/' || { echo "BLOCK: WORK_BRANCH ${WORK_BRANCH} not feature/*|fix/*"; exit 1; }
   b. Diff-size cap: source ${REPO}/scripts/factory/guards.sh
      GUARDS_REPO=${REPO} guard_check_diff_size ${process.env.FACTORY_MAX_DIFF ?? '800'} ${WORK_BRANCH}
   c. CWD: every command MUST run from ${REPO}, never ${WORK_WT} (T000342).
   d. Explicit ENV: use ENV=mentolder/ENV=korczewski — never bare kubectl.

   If guard (a) or (b) fails: bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status blocked
   then PushNotification: title "Factory Deploy blocked: ${A.ticket_id}", message which guard failed.
   Return JSON: { "status": "blocked", "reason": "deploy-guard" }.

   Steps:
   1. git push -u origin ${WORK_BRANCH}
   2. Open PR: gh pr create --title "feat(${slug}): ${A.title}" --base main
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
      d) If both pass: make smallest fix for CLASS=${CLASS}, commit + push, then:
         bash ${REPO}/scripts/ticket.sh retry-count incr --id ${A.ticket_id}
         bash ${REPO}/scripts/ticket.sh add-comment --id ${A.ticket_id} \
           --body "$(printf 'Factory retry %s/2 (class=%s)\n--- diff ---\n%s\n--- ci log tail ---\n%s' "$RC" "$CLASS" "$(git diff HEAD~1 --shortstat)" "$(tail -30 /tmp/factory-ci-${A.ticket_id}.log)")"
         Then re-run CI from (a).
      If RC -ge 2 or a gate failed: bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status blocked; bash ${REPO}/scripts/ticket.sh phase ${A.ticket_id} verify blocked --driver factory --detail "gate=ci result=fail" || true; add-comment "CI red after retries"; return.
   4. gh pr merge "$PR" --squash --delete-branch --auto
   5. PR_NUM=$(gh pr view "$PR" --json number -q '.number' 2>/dev/null || echo "$PR")
      bash ${REPO}/scripts/ticket.sh add-pr-link --id ${A.ticket_id} --pr "$PR_NUM" || true
      bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status done --resolution shipped
      bash ${REPO}/scripts/ticket.sh phase ${A.ticket_id} verify done --driver factory --detail "gate=ci result=pass" || true
      bash ${REPO}/scripts/ticket.sh archive-plan --id ${A.ticket_id} --slug ${slug} --branch ${WORK_BRANCH} --plan-file ${planFilePath ?? resolveTaskSource(slug, REPO)}
   5b. bash ${REPO}/scripts/ticket.sh feature-flag set --brand mentolder --key ${slug} --enabled false --set-by factory
       bash ${REPO}/scripts/ticket.sh feature-flag set --brand korczewski --key ${slug} --enabled false --set-by factory
   6. ${deployStepCmd}
   7. kubectl --context fleet rollout status deployment/website -n website --timeout=300s
      kubectl --context fleet rollout status deployment/website -n website-korczewski --timeout=300s
   8. LAYER-4 CANARY per brand (mentolder korczewski):
      SERVICE=website TARGET=<brand> source ${REPO}/scripts/feature-promote.sh
      observe_prod <brand> "$(svc_image_repo website <brand>):${A.timestamp}"
      If RED: output CANARY_RED <brand>

   Report the merged PR number and deploy outputs.` + consumeInjections('deploy'),
  { label: 'deploy', phase: 'Deploy' },
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
    { label: 'notify:ci-blocked', phase: 'Deploy' }
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
      { label: `canary:rollback:${b}`, phase: 'Deploy' },
    )
  }
  await agent(
    `Notify operator: canary failed.
     PushNotification: \`ToolSearch select:PushNotification\`, then:
       title "Factory: ${A.ticket_id} canary RED"
       body "Live-prod canary failed on ${canaryRed.join(', ')} for \\"${A.title}\\"."`,
    { label: 'notify:canary-red', phase: 'Deploy' }
  )
  return { status: 'blocked', reason: 'canary-red', brands: canaryRed, ticket: A.ticket_id }
}

const { status: deployStatus, reason: deployReason } = decideDeployTransition({ isWebsite: slug?.includes('website') ?? false, deployOutput: deploy })
// Merge = Abschluss (T001092): the agent prompt (step 5) already set the ticket to
// done/shipped after the confirmed auto-merge. The Deploy phase-event records the
// merge; there is no separate awaiting_deploy resting state on the happy path.
phaseEvent('deploy', deployStatus === 'blocked' ? 'blocked' : 'done', deployStatus === 'blocked' ? 'deploy blocked' : 'PR merged · done/shipped')
if (_msgBridge) _msgBridge.broadcast(`factory-pipeline: ${A.ticket_id} finished (${deployStatus})`, 'factory')
return { status: deployStatus, reason: deployReason, pr: deploy, reviews: reviews.length, tasks: tasks.length, implemented: implemented.length }
} finally { if (WORK_BRANCH || WORK_WT) { try { await agent(`bash ${REPO}/scripts/factory/cleanup.sh --branch '${WORK_BRANCH}' --worktree '${WORK_WT}'`, { label: 'cleanup' }) } catch (_) {} } } }
await main();
