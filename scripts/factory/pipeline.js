/**
 * scripts/factory/pipeline.js
 *
 * Software Factory Phase-1 pipeline — Claude Code Workflow script.
 *
 * CRITICAL: This is a Workflow script run by the Claude Code harness Workflow tool.
 * The globals `agent`, `parallel`, `pipeline`, `phase`, `log`, `args` are
 * HARNESS-INJECTED top-level globals — do NOT run this with `node scripts/factory/pipeline.js`.
 *
 * Offline lint only: `node --check scripts/factory/pipeline.js`
 * Contract tests:    `./tests/runner.sh local FA-SF-20`
 *
 * Usage (Workflow tool):
 *   args = {
 *     title:       string,   // feature title
 *     description: string,   // full feature description
 *     slug:        string,   // kebab-case slug (used for branch/worktree naming)
 *     ticket_id:   string,   // tickets.external_id (e.g. T000420)
 *     brand:       'mentolder' | 'korczewski',
 *     timestamp:   string,   // ISO8601 from the harness — use this, never Date.now()
 *   }
 *
 * Phases: Scout → Design → Plan → Implement → Verify → Deploy
 *
 * Out of scope (Phase 2): cron Dispatcher, queue polling, watchdog/slot manager,
 * Layer-4 canary smoke + auto-rollback, directory-level conflict heuristic.
 */

export const meta = {
  name: 'software-factory-pipeline',
  description: 'Phase-1 single-feature pipeline: Scout → Design → Plan → Implement → Verify → Deploy',
  phases: [
    { title: 'Scout' }, { title: 'Design' }, { title: 'Plan' },
    { title: 'Implement' }, { title: 'Verify' }, { title: 'Deploy' },
  ],
}

// Inlined from provision.js for Workflow compatibility (no ESM imports allowed in harness)
const ALWAYS_OPUS_ROLES = new Set(['review', 'security'])
const COMPLEXITY_TIER = {
  simple: 'haiku',
  medium: 'sonnet',
  complex: 'opus',
}

function chooseModel(complexity, role) {
  if (ALWAYS_OPUS_ROLES.has(role)) return 'opus'
  const tier = COMPLEXITY_TIER[complexity]
  return tier ?? null
}

const EFFORT_LADDER = ['quick', 'standard', 'ultra']
const COMPLEXITY_EFFORT_INDEX = {
  simple: 0,
  medium: 1,
  complex: 2,
}

function clampEffortIdx(i) {
  return Math.max(0, Math.min(EFFORT_LADDER.length - 1, i))
}
function chooseEffort(complexity, risk, budgetRemaining) {
  let idx = COMPLEXITY_EFFORT_INDEX[complexity]
  if (idx === undefined) idx = 1
  if (risk === 'high') idx = clampEffortIdx(idx + 1)
  const remaining = typeof budgetRemaining === 'number' ? budgetRemaining : 1
  if (remaining < 0.25) idx -= 1
  return EFFORT_LADDER[clampEffortIdx(idx)]
}

function buildContextHints(task) {
  const t = task ?? {}
  const hints = [
    'Vorhaben pack T000413: vision + repo conventions + footguns (compact)',
    'ticket spec + attachments via `ticket.sh get-attachments`',
    `touched_files: ${(t.touchedFiles ?? []).length} path(s)`,
    'relevant target-code excerpts only (no whole files)',
  ]
  if (t.gpuEmbeddings === true) {
    hints.push('similar-tickets (pgvector top-k, GPU embeddings)')
  }
  return hints
}

function provision(task) {
  const t = task ?? {}
  return {
    model: chooseModel(t.complexity, t.role),
    effort: chooseEffort(t.complexity, t.risk, t.budgetRemaining),
    contextHints: buildContextHints(t),
  }
}

// ── Inlined provider router (provider-router.js is the unit-tested SSOT; the
//    Workflow harness forbids ESM imports, so we shell out to the bash wrappers
//    which talk to tickets.provider_config / provider_health). opus → no DB. ──
// SPIKE VERDICT (Task 9): per-call `baseURL` override is NOT supported by the
// Workflow agent() API. ANTHROPIC_BASE_URL is set process-level via autopilot.env
// (sourced by wakeup.sh). Only `model` can vary per agent() call. The router
// still picks the provider/model per phase for slot claim/release (resilience),
// but baseUrl is fixed for the whole pipeline run.
function routeProviderSync(source, tier) {
  if (tier === 'opus') return { provider: 'anthropic', modelId: 'claude-opus-4-6', baseUrl: null, slotId: null, emergency: false }
  if (process.env.ANTHROPIC_MODEL) {
    return { provider: 'anthropic-compat', modelId: process.env.ANTHROPIC_MODEL,
             baseUrl: process.env.ANTHROPIC_BASE_URL || null, slotId: null, emergency: false }
  }
  try {
    const { execFileSync } = require('child_process')
    const out = execFileSync('bash', [`${REPO}/scripts/factory/route-provider.sh`, source, tier],
      { encoding: 'utf8', timeout: 20000, env: { ...process.env, BRAND: brand } }).trim()
    return JSON.parse(out)
  } catch (e) {
    log(`routeProvider(${source},${tier}) failed → emergency anthropic-sonnet: ${e.message}`)
    return { provider: 'anthropic', modelId: 'claude-sonnet-4-6', baseUrl: null, slotId: null, emergency: true }
  }
}
function releaseSlotSync(slotId, success) {
  if (!slotId) return
  try {
    const { execFileSync } = require('child_process')
    execFileSync('bash', [`${REPO}/scripts/factory/release-slot.sh`, String(slotId), success ? 'true' : 'false'],
      { stdio: 'ignore', timeout: 20000, env: { ...process.env, BRAND: brand } })
  } catch (e) { log(`releaseSlot(${slotId}) failed (non-fatal): ${e.message}`) }
}
function routerSource(phaseKey) {
  return ({ scout: 'factory-scout', design: 'factory-plan', plan: 'factory-plan',
            implement: 'factory-implement', verify: 'factory-review', deploy: 'factory-implement' })[phaseKey] || '*'
}
function routerTier(model) { return model === 'opus' ? 'opus' : (model === 'haiku' ? 'haiku' : 'sonnet') }

// Top-level globals injected by the harness: agent, parallel, pipeline, phase, log, args.
// args.timestamp (never Date.now()), args.slug, args.title, args.description, args.ticket_id, args.brand.

// Pipeline body runs as a top-level async function so that:
//   • `return` is valid (node --check passes)
//   • harness-injected globals are in scope without a harness-param destructure
async function main() {

// ─── Config ──────────────────────────────────────────────────────────────

const A = args ?? {}
const slug = A.slug
const brand = A.brand ?? 'mentolder'
const REPO = '/home/patrick/Bachelorprojekt'
const WT = `/tmp/wt-${slug}`

// Best-effort live-floor telemetry. NEVER throws — a failed insert must not kill
// the pipeline (T-FACTORY-FLOOR). One INSERT per phase boundary, driver=factory.
function phaseEvent(ph, state, detail) {
  try {
    const { execFileSync } = require('child_process')
    const a = [`${REPO}/scripts/ticket.sh`, 'phase', String(A.ticket_id), ph, state, '--driver', 'factory']
    if (detail) a.push('--detail', String(detail).slice(0, 240))
    execFileSync('bash', a, { stdio: 'ignore', timeout: 15000 }) // arg array → no shell injection via detail
  } catch { /* telemetry is best-effort; swallow */ }
}

// Factory injection consume (factory-injection): atomically consume this phase's (or NULL-phase)
// injections → binding prompt block ('' if none) + assets to assets-inbox/. Best-effort, NEVER throws.
function consumeInjections(ph) {
  try {
    const { execFileSync } = require('child_process'), fs = require('fs'), path = require('path'), sh = (a, opt) => execFileSync('bash', [`${REPO}/scripts/ticket.sh`, ...a], opt)
    const rows = JSON.parse(sh(['get-injections', '--id', String(A.ticket_id), '--phase', ph, '--consume', '--format', 'json'], { encoding: 'utf8', timeout: 20000 }).trim() || '[]')
    if (!Array.isArray(rows) || !rows.length) return ''
    const inbox = path.join(WORK_WT, 'assets-inbox', String(A.ticket_id)), lines = [], files = (r) => r.target_files ? r.target_files.join(', ') : ''
    for (const r of rows) {
      if (r.kind === 'asset' && r.data_url && r.filename)
        try { fs.mkdirSync(inbox, { recursive: true }); const dest = path.join(inbox, path.basename(String(r.filename))); fs.writeFileSync(dest, Buffer.from(String(r.data_url).replace(/^data:[^;]+;base64,/, ''), 'base64')); lines.push(`ASSET available at ${dest}${files(r) ? ` (for: ${files(r)})` : ''}`) } catch { /* best-effort */ }
      else if (r.content || r.title) lines.push(`- ${r.title ? r.title + ': ' : ''}${r.content ?? ''}${files(r) ? ` [files: ${files(r)}]` : ''}`)
    }
    try { sh(['add-comment', '--id', String(A.ticket_id), '--author', 'factory', '--body', `consumed ${rows.length} @ ${ph}`], { stdio: 'ignore', timeout: 15000 }) } catch {}
    return lines.length ? `\n\nOPERATOR INJECTED CONTEXT — verbindlich berücksichtigen:\n${lines.join('\n')}\n` : ''
  } catch { return '' } // best-effort: swallow everything
}

// Dry-run: skip the destructive Deploy actions (push/merge/prod-deploy). Passed
// in args by the dispatcher / task; default off. Lets us run Scout→Verify safely.
const DRY_RUN = A.dry_run === true || A.dry_run === 'true'

// Plan-reuse: when a human dev-flow plan is handed off, work on that branch and
// reuse its plan instead of self-planning (Scout/Design/Plan). Falsy → self-plan.
const REUSE_BRANCH = A.branch || null          // e.g. feature/<slug>
const REUSE_PLAN   = A.plan_path || null        // e.g. docs/superpowers/plans/<file>.md
const REUSE = !!(REUSE_BRANCH && REUSE_PLAN)
const WORK_BRANCH = REUSE ? REUSE_BRANCH : `feature/${slug}`
const WORK_WT = REUSE ? `/tmp/wt-${slug}-reuse` : WT

let specPath = null
let tasks = []
// Hoisted out of the `if (!REUSE)` Scout block so the Implement fan-out (which lives
// OUTSIDE that block) can read the feature complexity for adaptive provisioning.
// Stays null in the REUSE path → chooseModel returns null → the `model` key is omitted
// and the implementer inherits the main-loop default. Referencing block-local `scout`
// here would throw `ReferenceError: scout is not defined` (optional chaining does NOT
// guard an undeclared binding, only null/undefined values).
let featureComplexity = null
// Same hoist rationale: the Deploy phase's two-gated retry loop (outside the !REUSE block)
// feeds the touched-file list to paths_are_escalate_class. Stays [] in the REUSE path.
let featureTouchedFiles = []
// Plan file path: captured from the Plan agent's return (it stamps `date +%F` itself, as
// A.timestamp is unreliable). Used by Deploy's archive-plan. REUSE → the handed-off plan.
let planFilePath = REUSE ? REUSE_PLAN : null

// JSON schemas for structured agent outputs (compact one-liners; same shape).
const REVIEW_SCHEMA = { type: 'object', required: ['findings'], properties: { findings: { type: 'array', items: { type: 'object', required: ['severity', 'file', 'description'], properties: { severity: { enum: ['low', 'medium', 'high', 'critical'] }, file: { type: 'string' }, line: { type: 'integer' }, description: { type: 'string' }, suggested_fix: { type: 'string' } } } }, summary: { type: 'string' } } }
try { if (!REUSE) {
// ── ① Scout (deterministisch) ─────────────────────────────────────────────
phase('Scout')
phaseEvent('scout', 'entered', 'Codebase-Analyse (deterministisch) gestartet')

const cp = require('child_process')

// Liveness touch FIRST (separate, direct, best-effort) so a slow scout.sh
// similar-tickets lookup never starves the dispatcher watchdog.
try {
  cp.execFileSync('bash',
    [`${REPO}/scripts/ticket.sh`, 'touch', '--id', String(A.ticket_id)],
    { stdio: 'ignore', timeout: 10000 })
} catch { /* best-effort liveness ping */ }

// Deterministic scout: grep/find file discovery + complexity + risks + similar.
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
// Rudimentary schema validation (analogous to the harness SCOUT_SCHEMA check).
if (!scout || typeof scout.complexity !== 'string'
    || !['simple', 'medium', 'complex'].includes(scout.complexity)
    || !Array.isArray(scout.touched_files)
    || !Array.isArray(scout.risk_areas)
    || !Array.isArray(scout.similar_tickets)) {
  throw new Error(`Scout output invalid: ${String(scoutJson).slice(0, 200)}`)
}

log(`Scout: complexity=${scout.complexity}, ${scout.touched_files.length} touched files`)
featureComplexity = scout.complexity      // hoist for the out-of-block Implement fan-out provisioning
featureTouchedFiles = scout.touched_files // hoist for the out-of-block Deploy retry-loop escalate-class gate

// Persist touched_files onto the ticket (direct call, no LLM agent — was scout:persist).
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

// ── SCS: Semantic Code Search — suggest relevant files ──────────────────────
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
      scout.suggested_files = scsSuggestedFiles
      const scsPaths = scsSuggestedFiles.map(f => `${REPO}/${f.path}`)
      const existingSet = new Set(scout.touched_files)
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
  scout.suggested_files = []
}

// SIMPLE features skip Design/Plan/Implement and go straight to Verify→Deploy.
const isSimple = scout.complexity === 'simple'

// ── ② Design ───────────────────────────────────────────────────────────────
specPath = null
if (!isSimple) {
  phase('Design')
  phaseEvent('design', 'entered', 'Spec-Generierung')
  const design = await agent(
    `Record pipeline liveness first so the dispatcher watchdog does not flag this run as stale: run \`bash ${REPO}/scripts/ticket.sh touch --id ${A.ticket_id}\`. Then:
     Write a design spec for "${A.title}" following the structure in
     ${REPO}/scripts/factory/templates/design-template.md (if it exists) or using standard
     ARCH/GOALS/RISKS/DECISIONS structure. For medium/complex, include an adversarial
     "try to refute this design" section.

     Save the spec to: ${REPO}/docs/superpowers/specs/$(date +%F)-${slug}-design.md
     (compute the YYYY-MM-DD prefix yourself with \`date +%F\` — do NOT use a literal
     "undefined"; the harness does not always pass a timestamp arg.)

     Then attach it to the ticket:
     bash ${REPO}/scripts/ticket-attach.sh <uuid> <specfile>

     Return the spec file path (just the absolute path you wrote, nothing else).` + consumeInjections('design'),
    { label: 'design', phase: 'Design' },
  )
  specPath = design.trim()
  phaseEvent('design', 'done', 'Spec erstellt')
}

// ── ③ Plan (with conflict gate) ────────────────────────────────────────────
tasks = []
if (!isSimple) {
  phase('Plan')
  phaseEvent('plan', 'entered', 'Plan-Erstellung')
  // Brand-aware disjoint-files gate BEFORE fanning tasks.
  const conflict = await agent(
    `Record pipeline liveness first so the dispatcher watchdog does not flag this run as stale: run \`bash ${REPO}/scripts/ticket.sh touch --id ${A.ticket_id}\`. Then:
     Run the brand-aware conflict gate to ensure no active feature is already touching
     the files this feature needs to edit:
     BRAND=${brand} bash ${REPO}/scripts/factory/conflict-check.sh ${A.ticket_id} ${scout.touched_files.join(' ')}

     Report the exact stdout JSON and the exit code.
     Exit 0 = no conflicts (proceed). Exit 1 = conflicts found (STOP). Exit 2 = error.`,
    { label: 'plan:conflict', phase: 'Plan' },
  )
  if (/\"T0/.test(conflict)) {
    log(`Conflict detected: ${conflict}`)
    // Release slot + reset to backlog so the next tick can retry; without `backlog`
    // in conflict-check's active set, ≤1 overlapping ticket per tick serializes.
    await agent(
      `Release slot + return to queue (the next tick can retry — without backlog in the conflict-check active set, ≤1 overlapping ticket/tick):
       bash ${REPO}/scripts/ticket.sh release-slot --id ${A.ticket_id}
       bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status backlog
       Notify: PushNotification is DEFERRED — \`ToolSearch select:PushNotification\`,
       then call it once: title "Factory conflict: ${A.ticket_id} (${brand})",
       message "Pipeline blocked on overlap. ${String(conflict).slice(0, 200)}"`,
      { label: 'conflict:escalate', phase: 'Plan' },
    )
    phaseEvent('plan', 'blocked', 'file-overlap: ' + String(conflict).slice(0, 120))
    return { status: 'blocked', reason: 'file-overlap', conflict, released: true }
  }

  const planProv = provision({ complexity: scout.complexity, role: 'plan', risk: (scout.risk_areas?.length ? 'high' : 'low'), budgetRemaining: 1, ticketId: A.ticket_id, touchedFiles: scout.touched_files, gpuEmbeddings: false })
  const planRoute = routeProviderSync('factory-plan', routerTier(planProv.model))
  const plan = await agent(
    `Decompose the spec at ${specPath} into independent tasks where no two tasks
     touch the same file. For each task provide: id, target_files (array),
     acceptance_criteria (array of strings).

     Write the full plan to ${REPO}/docs/superpowers/plans/$(date +%F)-${slug}.md
     (compute the YYYY-MM-DD prefix yourself with \`date +%F\` — do NOT use a literal
     "undefined"; the harness does not always pass a timestamp arg.)

     Then run the frontmatter hook on the SAME file you just wrote:
     bash ${REPO}/scripts/plan-frontmatter-hook.sh <the-plan-file-you-wrote>

     Return a JSON object { tasks: [...], plan_path: "<absolute path of the plan file you wrote>" }
     matching the schema.` + consumeInjections('plan'),
    {
      model: planRoute.modelId,
      label: 'plan:decompose',
      phase: 'Plan',
      schema: { type: 'object', required: ['tasks', 'plan_path'], properties: { plan_path: { type: 'string' }, tasks: { type: 'array', items: { type: 'object', required: ['id', 'target_files', 'acceptance_criteria'], properties: { id: { type: 'string' }, target_files: { type: 'array', items: { type: 'string' } }, acceptance_criteria: { type: 'array', items: { type: 'string' } } } } } } },
    },
  )
  releaseSlotSync(planRoute.slotId, plan != null)
  tasks = plan.tasks
  planFilePath = plan.plan_path
  phaseEvent('plan', 'done', `${(plan.tasks || []).length} Tasks`)
}
}

if (REUSE) {
  phase('Plan')
  phaseEvent('plan', 'entered', 'Plan-Reuse')
  const reuse = await agent(
    `A human already planned this feature via dev-flow on the existing branch ${WORK_BRANCH}.
     Read the plan file WITHOUT creating a worktree (the Implement phase creates the shared
     worktree later) — from ${REPO} run: git show "origin/${WORK_BRANCH}:${REUSE_PLAN}"
     (fall back to \`git show "${WORK_BRANCH}:${REUSE_PLAN}"\` if the remote ref is absent).
     Decompose it into independent tasks where no two tasks touch the same file:
     each { id, target_files:[...], acceptance_criteria:[...] }.
     Do NOT write a new plan or spec — reuse the human one. Return { tasks: [...] }.` + consumeInjections('plan'),
    { label: 'plan:reuse', phase: 'Plan', schema: { type:'object', required:['tasks'], properties:{ tasks:{ type:'array', items:{ type:'object', required:['id','target_files','acceptance_criteria'], properties:{ id:{type:'string'}, target_files:{type:'array',items:{type:'string'}}, acceptance_criteria:{type:'array',items:{type:'string'}} } } } } } },
  )
  tasks = reuse.tasks
  phaseEvent('plan', 'done', `${(tasks || []).length} Tasks (reuse)`)
}

// ── ④ Implement (ONE shared git-crypt-safe worktree, tasks run sequentially) ──
// NOT the harness `isolation: 'worktree'` option: its raw `git worktree add` checkout
// runs the git-crypt smudge filter and dies (new gitdir has no key) — T000473/T000426.
// One shared worktree is made up front via scripts/worktree-create.sh; tasks run
// SEQUENTIALLY (shared tree → concurrent test/commit would race the index.lock; Plan
// guarantees disjoint files, so per-task worktrees+merge is a future optimization).
let implemented = []
if (tasks.length) {
  phase('Implement')
  phaseEvent('implement', 'entered', 'Implementierung gestartet')

  const wtSetup = await agent(
    `Record pipeline liveness: run \`bash ${REPO}/scripts/ticket.sh touch --id ${A.ticket_id}\`. Then:
     From ${REPO}, create the isolated worktree for this feature using the git-crypt-safe wrapper
     (do NOT run a raw \`git worktree add\` — it fails on git-crypt'd paths):
       bash ${REPO}/scripts/worktree-create.sh ${WORK_BRANCH} ${WORK_WT} origin/main
     Report the FULL stdout and the exit code. A success line contains "ready on".`,
    { label: 'impl:worktree-setup', phase: 'Implement' },
  )
  if (!/ready on/.test(String(wtSetup ?? ''))) {
    // Fail loudly so the dispatcher's escalation routing surfaces it (not a swallowed "green").
    await agent(
      `The git-crypt-safe worktree could not be created for ${A.ticket_id}; the pipeline cannot implement.
       Record it and notify: bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status blocked
       Then PushNotification is DEFERRED — run \`ToolSearch select:PushNotification\`, then call it once:
         title:   "Factory worktree setup failed: ${A.ticket_id} (${brand})"
         message: "scripts/worktree-create.sh did not report success. Detail: ${String(wtSetup ?? '').slice(0, 240)}"
       Report what was notified.`,
      { label: 'impl:worktree-escalate', phase: 'Implement' },
    )
    phaseEvent('implement', 'blocked', 'worktree-setup')
    return { status: 'blocked', reason: 'worktree-setup', detail: String(wtSetup ?? '').slice(0, 400) }
  }

  for (const t of tasks) {
    const prov = provision({ complexity: featureComplexity, role: 'implement', risk: (t.target_files?.some((f) => /\.sql$|^k3d\/|^environments\/|realm.*\.json/.test(f)) ? 'high' : 'low'), budgetRemaining: 1, ticketId: A.ticket_id, touchedFiles: t.target_files, gpuEmbeddings: false })
    const route = routeProviderSync('factory-implement', routerTier(prov.model))
    let impl = null
    try {
      impl = await agent(
        `Record pipeline liveness first so the dispatcher watchdog does not flag this run as stale: run \`bash ${REPO}/scripts/ticket.sh touch --id ${A.ticket_id}\`. Then:
         Implement task ${t.id} on branch ${WORK_BRANCH} in the SHARED worktree at ${WORK_WT}
         (it already exists and ${WORK_BRANCH} is checked out there — do NOT run \`git worktree add\`).
         Target files: ${t.target_files.join(', ')}.
         Follow TDD (red-green). Acceptance criteria: ${t.acceptance_criteria.join('; ')}.
         DARK-LAUNCH: gate every new user-visible behavior behind isFeatureEnabled('${brand}', '${slug}')
         (import from website/src/lib/tickets-db.ts). The flag defaults OFF, so the merge ships dark;
         do NOT enable it in code. The default-OFF feature_flags row is seeded in the Deploy phase.
         Provisioned context hints (assemble compactly, never raw-dump): ${prov.contextHints.join(' | ')}.
         After implementing, run locally:
           cd ${WORK_WT} && task workspace:validate && task test:all && task freshness:regenerate
         (freshness:regenerate keeps generated artifacts like test-inventory.json and route-manifest.json
         up to date so CI passes.)
         Finally COMMIT your work on ${WORK_BRANCH} (so the Verify/Deploy phases can diff it):
           cd ${WORK_WT} && git add -A && git commit -m ${JSON.stringify(`feat(${slug}): ${t.id} [factory]`)}
         Return a summary of the diff and the local test result (pass/fail).` + consumeInjections('implement'),
        { label: `impl:${t.id}`, phase: 'Implement', model: route.modelId },
      )
      releaseSlotSync(route.slotId, impl != null)
    } catch (err) {
      releaseSlotSync(route.slotId, false)
      throw err
    }
    if (impl == null) continue   // agent died (terminal API error) — skip its self-verify
    const verify = await agent(
      `Self-verify task ${t.id}: re-read the implementation diff in ${WORK_WT}
       (git -C ${WORK_WT} diff origin/main...HEAD) and confirm each acceptance criterion is met:
       ${t.acceptance_criteria.join('; ')}. Report pass/fail for each criterion.`,
      { label: `impl-verify:${t.id}`, phase: 'Implement' },
    )
    if (verify != null) implemented.push(verify)
  }
  phaseEvent('implement', 'done', `${tasks.length} Tasks implementiert`)
}

// ── ⑤ Verify (tiered adversarial review panel + coordinator) ────────────────
// filter noise → classify tier → tier-selected lenses (parallel) → coordinator
// (full tier) → verdict. `sh` here is bound to ticket.sh, so helpers run via agent().
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
    const route = routeProviderSync('factory-review', 'opus')
    return agent(
      `Record pipeline liveness so the dispatcher watchdog does not flag this run stale: \`bash ${REPO}/scripts/ticket.sh touch --id ${A.ticket_id}\`. Then read the review prompt at ${REPO}/${l.file} and apply it to: git -C ${WORK_WT} diff origin/main...HEAD (in the WORKTREE — ${REPO} HEAD is main → empty). Return findings as JSON per the prompt's schema.` + consumeInjections('verify'),
      { label: `review:${l.key}`, phase: 'Verify', ...(l.key === 'agents-md' ? {} : { schema: REVIEW_SCHEMA }), model: route.modelId },
    )
  }))).filter(Boolean)
  log(`Verify: ${reviews.length}/${lenses.length} lenses done, tier=${tier}`)

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
    const coordRoute = routeProviderSync('factory-review', 'opus')
    const coord = await agent(
      `Read the coordinator prompt at ${REPO}/scripts/factory/review-coordinator.prompt.md and apply it to these lens findings. Return ONE consolidated JSON with a "verdict" field.\n${xml}`,
      { label: 'review:coordinator', phase: 'Verify', schema: COORDINATOR_SCHEMA, model: coordRoute.modelId },
    )
    if (coord && coord.verdict) {
      coordinatorVerdict = coord.verdict
    } else if (coord) {
      log('Verify: coordinator returned a result but verdict field is missing — falling back to rawBlocking.')
    }
    log(`Verify: coordinator verdict = ${coordinatorVerdict || 'none'}`)
  }

  await agent(
    `Record a one-line factory status breadcrumb (non-blocking): bash ${REPO}/scripts/ticket.sh add-comment --id ${A.ticket_id} --body ${JSON.stringify('Factory: phase=Verify, tier=' + tier + ', ' + reviews.flatMap(r => r.findings || []).length + ' finding(s).')}`,
    { label: 'verify:breadcrumb', phase: 'Verify' },
  )

  // Blocking: coordinator verdict (full) OR raw high/critical findings (fallback).
  const rawBlocking = reviews.flatMap((r) => r.findings || []).filter((f) => f && (f.severity === 'high' || f.severity === 'critical'))
  const isBlocked = coordinatorVerdict ? (coordinatorVerdict === 'requested_changes') : (rawBlocking.length > 0)
  if (isBlocked) {
    const blocking = rawBlocking
    await agent(
      `The adversarial review panel found blocking issues (coordinator verdict=${coordinatorVerdict || 'n/a'}). Record the block then notify:
       bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status blocked
       bash ${REPO}/scripts/ticket.sh add-comment --id ${A.ticket_id} --body ${JSON.stringify('Factory Verify blocked: ' + JSON.stringify(blocking))}
       PushNotification is a DEFERRED tool — run \`ToolSearch select:PushNotification\` to load it, then call it once with title "Factory Verify blocked: ${A.ticket_id} (${brand})" and message "${blocking.length} blocking review finding(s) / verdict=${coordinatorVerdict || 'high-severity'}.". Report the command outputs.`,
      { label: 'verify:escalate', phase: 'Verify' },
    )
    phaseEvent('verify', 'blocked', (blocking.length || 1) + ' blocking finding(s)')
    return { status: 'blocked', reason: 'review-findings', blocking, verdict: coordinatorVerdict }
  }
  phaseEvent('verify', 'done', 'Tests ✓')
}

// ── ⑥ Deploy (auto-merge on green CI + both-brand explicit deploy) ──────────
phase('Deploy')
phaseEvent('deploy', 'entered', 'PR erstellt · CI watch')
if (DRY_RUN) {
  const report = await agent(
    `DRY RUN — do NOT push, merge, or deploy anything. Work from the WORKTREE (HEAD=${WORK_BRANCH}):
     1. Show the planned diff: git -C ${WORK_WT} diff origin/main...HEAD --stat
     2. Summarise the review findings already gathered (${reviews.length} review lens result(s)).
     3. Release the pipeline slot and return the ticket to the queue (nothing shipped):
        bash ${REPO}/scripts/ticket.sh release-slot --id ${A.ticket_id}
        bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status backlog
     Report the diff stat + a one-line verdict. Take NO other action.`,
    { label: 'deploy:dry-run', phase: 'Deploy' },
  )
  phaseEvent('deploy', 'done', 'dry-run')
  return { status: 'dry-run', report, reviews: reviews.length, tasks: tasks.length }
}

// ── Partial-deploy decision (T000591) ───────────────────────────────────────
// Source the bash service-registry SSOT and ask it whether the touched k3d files
// qualify for a partial deploy (≤5 services, no infra/unknown k3d files). If they
// do, we deploy only those `app:` slugs; otherwise we fall back to full
// workspace:deploy. featureTouchedFiles was hoisted in the Scout phase (line ~193).
function resolvePartialServices(touched) {
  try {
    const { execFileSync } = require('child_process')
    const csv = (touched ?? []).join(',')
    const out = execFileSync('bash', ['-c',
      `source ${REPO}/scripts/factory/service-registry.sh && resolve_partial_services "$1"`,
      'bash', csv],
      { encoding: 'utf8' }).trim()
    return out.length > 0 ? out : null  // empty stdout = no partial (caller falls back)
  } catch {
    return null  // resolver returned non-zero (infra/unknown/over-threshold) → full deploy
  }
}
const partialServices = resolvePartialServices(featureTouchedFiles)
// Per-brand deploy command injected into the Deploy agent's step 6.
const deployStepCmd = partialServices
  ? `task workspace:partial-deploy ENV=mentolder PARTIAL_SERVICES=${partialServices} && task workspace:partial-deploy ENV=korczewski PARTIAL_SERVICES=${partialServices}`
  : `task workspace:deploy ENV=mentolder && task workspace:deploy ENV=korczewski`
log(`Deploy mode: ${partialServices ? `PARTIAL [${partialServices}]` : 'FULL'} (touched=${(featureTouchedFiles ?? []).length})`)
phaseEvent('deploy', partialServices ? 'partial' : 'full', partialServices ? `services=${partialServices}` : 'full deploy')

const deploy = await agent(
  `Record pipeline liveness first so the dispatcher watchdog does not flag this run as stale: run \`bash ${REPO}/scripts/ticket.sh touch --id ${A.ticket_id}\`. Then:
   Deploy the feature to both brands. Operate from the MAIN repo at ${REPO}
   (NOT the worktree ${WORK_WT}) to avoid gotcha T000342 (merge conflicts from wrong CWD).

   HARD GUARDS — run these from ${REPO} and STOP (set the ticket blocked, notify, return) on any failure:
   a. Branch policy: WORK_BRANCH must match ^(feature|fix)/ .
      printf '%s' "${WORK_BRANCH}" | grep -Eq '^(feature|fix)/' || { echo "BLOCK: WORK_BRANCH ${WORK_BRANCH} not feature/*|fix/*"; exit 1; }
   b. Diff-size cap (HARD): from ${REPO},
      source ${REPO}/scripts/factory/guards.sh
      GUARDS_REPO=${REPO} guard_check_diff_size ${process.env.FACTORY_MAX_DIFF ?? '800'} ${WORK_BRANCH}
      If guard_check_diff_size returns non-zero, the diff exceeds FACTORY_MAX_DIFF — DO NOT push/merge/deploy.
   c. CWD assertion: every git/gh/task command below MUST run with cwd = ${REPO} (the MAIN repo),
      never the worktree ${WORK_WT} (gotcha T000342).
   d. Explicit ENV: prod deploys use ENV=mentolder and ENV=korczewski explicitly — NEVER a bare
      kubectl context. Context is resolved internally via \`source ${REPO}/scripts/env-resolve.sh <env>\`
      (→ ENV_CONTEXT=fleet); do not pass a bare cluster name.

   If guard (a) or (b) fails: run
     bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status blocked
   then load PushNotification (\`ToolSearch select:PushNotification\`) and notify
     title: "Factory Deploy blocked: ${A.ticket_id}"
     message: which guard failed (branch-policy or diff>FACTORY_MAX_DIFF) for brand ${brand}.
   Return JSON: { "status": "blocked", "reason": "deploy-guard" }.

   Steps:
   1. Push branch ${WORK_BRANCH} to origin:
      cd ${REPO} && git push -u origin ${WORK_BRANCH}
   2. Open a PR (if not open) and record its number immediately:
      gh pr create --title "feat(${slug}): ${A.title}" --base main
      PR=$(gh pr view --json number -q .number)
      bash ${REPO}/scripts/ticket.sh add-comment --id ${A.ticket_id} --body "Factory: PR #$PR opened (phase=Deploy)."
    3. STRUCTURED SELF-HEALING RETRY LOOP (≤2 fix attempts; NO raw SQL — use ticket.sh).
       Run CI to green using this exact loop. Per attempt:

       a) Wait for CI to finish and read its verdict DETERMINISTICALLY — never eyeball
          the PR page or guess. From ${REPO}:
            gh pr checks "$PR" --watch --interval 20 --fail-fast > /tmp/factory-ci-${A.ticket_id}.status 2>&1; CI_RC=$?
          CI_RC == 0  ⇒ every required check is GREEN → go to step 4 (merge).
          CI_RC != 0  ⇒ a required check failed or was cancelled → self-heal below.
          Read the current retry count (fail-closed → treat unreadable as 2):
            RC=$(bash ${REPO}/scripts/ticket.sh retry-count get --id ${A.ticket_id})
          If RC -ge 2 → STOP: this is the 3rd failure. Set blocked, notify, return.

       b) Capture the failing CI log to a file:
            gh run view --log-failed > /tmp/factory-ci-${A.ticket_id}.log 2>&1 || \
              gh run view --log > /tmp/factory-ci-${A.ticket_id}.log 2>&1

       b2) DETERMINISTIC freshness fast-path (no LLM guess, spends NO retry). Classify first:
            source ${REPO}/scripts/factory/classify-failure.sh
            CLASS=$(classify_failure /tmp/factory-ci-${A.ticket_id}.log)
          If CLASS == freshness AND you have not already regenerated once this run:
            the only failure is stale generated artifacts — regenerate deterministically in
            the worktree (${WORK_WT}, where ${WORK_BRANCH} is checked out):
              cd ${WORK_WT} && task freshness:regenerate \
                && git commit -am 'chore: refresh generated artifacts (factory)' && git push
            then re-run CI from (a) WITHOUT incrementing the retry count (deterministic
            regeneration, not a code fix). Do this AT MOST ONCE per run; if CLASS == freshness
            again afterwards, regeneration did not converge → treat as class "other" and BLOCK.

       c) TWO-GATED auto-fix decision. Auto-fix ONLY when BOTH gates pass:
          Gate 1 (failure class): source ${REPO}/scripts/factory/classify-failure.sh;
            CLASS=$(classify_failure /tmp/factory-ci-${A.ticket_id}.log)
            — must be one of: ci, test, lint.  (sql|manifest|secret|realm|other ⇒ NO auto-fix.)
          Gate 2 (path class): source ${REPO}/scripts/factory/classify-paths.sh;
            if paths_are_escalate_class "${featureTouchedFiles.join(',')}"  (exit 0 = escalate)
            ⇒ NO auto-fix (shared-state / secret / realm*.json / *.sql touched).
          If EITHER gate fails ⇒ do NOT auto-fix: set blocked, notify, return (escalate to human).

       d) If both gates pass: make the smallest fix that addresses CLASS=${CLASS} on
          branch ${WORK_BRANCH}, commit + push, then record the attempt:
            bash ${REPO}/scripts/ticket.sh retry-count incr --id ${A.ticket_id}
            bash ${REPO}/scripts/ticket.sh add-comment --id ${A.ticket_id} \
              --body "$(printf 'Factory retry %s/2 (class=%s)\n--- diff ---\n%s\n--- ci log tail ---\n%s' \
                "$RC" "$CLASS" "$(git diff HEAD~1 --shortstat)" "$(tail -30 /tmp/factory-ci-${A.ticket_id}.log)")"
          Then re-run CI and repeat from (a).

       If the loop exits because RC -ge 2 OR a gate failed, perform the BLOCK:
            bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status blocked
            bash ${REPO}/scripts/ticket.sh add-comment --id ${A.ticket_id} \
              --body "Factory blocked: CI red after ${A.ticket_id} retries (class gate or cap)."
          and report that the ticket is blocked. Take NO merge action.
   4. Squash-merge (from ${REPO}, NOT the worktree). With required status checks on
      main, --auto merges the instant the gate is green and refuses a red merge:
      cd ${REPO} && gh pr merge "$PR" --squash --delete-branch --auto
   5. Close the ticket and archive the plan:
      bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status qa_review
      bash ${REPO}/scripts/ticket.sh archive-plan --id ${A.ticket_id} --slug ${slug} \
        --branch ${WORK_BRANCH} --plan-file ${planFilePath ?? `${REPO}/docs/superpowers/plans/${slug}.md`}
   5b. Seed the dark-launch flag default-OFF for BOTH brands (mirrors the
       isFeatureEnabled('${slug}') gate added during Implement):
      bash ${REPO}/scripts/ticket.sh feature-flag set --brand mentolder --key ${slug} --enabled false --set-by factory
      bash ${REPO}/scripts/ticket.sh feature-flag set --brand korczewski --key ${slug} --enabled false --set-by factory
   6. Deploy BOTH brands explicitly (fleet cluster, push-based — no GitOps reconciler).
      DEPLOY MODE (pre-computed from touched_files): ${partialServices ? `PARTIAL — only services [${partialServices}]` : 'FULL'}.
      Website changes still auto-roll-out via CI (task feature:website); for the K8s/manifest
      deploy run EXACTLY this command (do not substitute a different one):
        ${deployStepCmd}
    7. Verify rollout on both brands:
       kubectl --context fleet rollout status deployment/website -n website --timeout=300s
       kubectl --context fleet rollout status deployment/website -n website-korczewski --timeout=300s
    8. LAYER-4 LIVE-PROD CANARY (per brand). For EACH brand in mentolder korczewski:
       observe the LIVE site for ~5 min using the canary helper:
         SERVICE=website TARGET=<brand> source ${REPO}/scripts/feature-promote.sh  # exposes observe_prod
         observe_prod <brand> "$(svc_image_repo website <brand>):${A.timestamp}"
       observe_prod re-probes web.<brand>.de /api/health + the unauth grep from
       tests/e2e/smoke/website.txt, and on RED captures the pre-deploy revision and
       rolls that brand back to it (exit 1). Record the per-brand verdict (GREEN/RED).
       If ANY brand returns RED, output a line containing exactly: CANARY_RED <brand>

    Report the merged PR number and the deploy command outputs.` + consumeInjections('deploy'),
  { label: 'deploy', phase: 'Deploy' },
)

// Self-healing retry loop may have ended in 'blocked' (CI red after ≤2 gated attempts).
if (typeof deploy === 'string' && /blocked/i.test(deploy)) {
  if (deploy.includes('deploy-guard') || deploy.includes('BLOCK: WORK_BRANCH') || deploy.includes('diff exceeds FACTORY_MAX_DIFF')) {
    return { status: 'blocked', reason: 'deploy-guard' }
  }
  await agent(
    `Notify the operator that self-healing was exhausted/escalated.
     PushNotification is a DEFERRED tool — you MUST first run \`ToolSearch select:PushNotification\` to load its schema, then call it ONCE with:
       title: "Factory: ${A.ticket_id} CI-blocked"
       body:  "Self-healing retry exhausted/escalated for \\"${A.title}\\" (${brand}). Human attention needed."`,
    { label: 'notify:ci-blocked', phase: 'Deploy' }
  )
  return { status: 'blocked', reason: 'ci-red-after-retries', ticket: A.ticket_id }
}

// Layer-4 canary: observe_prod (in feature-promote.sh) already captured the pre-deploy
// revision and rolled the failing brand back. Here we turn the feature flag OFF for that
// brand, mark blocked, and notify. PushNotification only from Workflow runtime.
const canaryRed = typeof deploy === 'string' ? [...deploy.matchAll(/CANARY_RED\s+(mentolder|korczewski)/g)].map(m => m[1]) : []
if (canaryRed.length) {
  for (const b of canaryRed) {
    await agent(
      `Canary went RED on ${b} (observe_prod already rolled the deployment back to the
       pre-deploy revision). Dark-launch the feature OFF for this brand and record it:
       bash ${REPO}/scripts/ticket.sh feature-flag set --brand ${b} --key ${slug} --enabled false --set-by factory-canary
       bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status blocked
       bash ${REPO}/scripts/ticket.sh add-comment --id ${A.ticket_id} --body ${JSON.stringify(`Factory canary RED on ${b}: rolled back + feature flag '${slug}' disabled.`)}
       Report the command outputs.`,
      { label: `canary:rollback:${b}`, phase: 'Deploy' },
    )
  }
  await agent(
    `Notify the operator that the canary failed and was rolled back.
     PushNotification is a DEFERRED tool — you MUST first run \`ToolSearch select:PushNotification\` to load its schema, then call it ONCE with:
       title: "Factory: ${A.ticket_id} canary RED"
       body:  "Live-prod canary failed on ${canaryRed.join(', ')} for \\"${A.title}\\". Rolled back + flag OFF."`,
    { label: 'notify:canary-red', phase: 'Deploy' }
  )
  return { status: 'blocked', reason: 'canary-red', brands: canaryRed, ticket: A.ticket_id }
}

if (deploy.includes('deploy-guard') || deploy.includes('"status": "blocked"') || deploy.includes("status: 'blocked'")) {
  phaseEvent('deploy', 'blocked', 'deploy-guard')
  return { status: 'blocked', reason: 'deploy-guard' }
}
phaseEvent('deploy', 'done', 'PR merged')
return { status: 'done', pr: deploy, reviews: reviews.length, tasks: tasks.length, implemented: implemented.length }
} finally { if (WORK_BRANCH || WORK_WT) { try { await agent(`bash ${REPO}/scripts/factory/cleanup.sh --branch '${WORK_BRANCH}' --worktree '${WORK_WT}'`, { label: 'cleanup' }) } catch (_) {} } }
}
await main();
