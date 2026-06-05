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

// Top-level globals injected by the harness: agent, parallel, pipeline, phase, log, args.
// args.timestamp (never Date.now()), args.slug, args.title, args.description, args.ticket_id, args.brand.

// Pipeline body runs as a top-level async IIFE so that:
//   • `return` is syntactically valid (node --check passes)
//   • `await` is valid at the call sites
//   • harness-injected globals (agent, parallel, pipeline, phase, log, args)
//     are in scope without any destructuring from a harness param
async function main() {

// ─── Config ──────────────────────────────────────────────────────────────

const A = args ?? {}
const slug = A.slug
const brand = A.brand ?? 'mentolder'
const REPO = '/home/patrick/Bachelorprojekt'
const WT = `/tmp/wt-${slug}`

// Dry-run: skip the destructive Deploy actions (push/merge/prod-deploy). Passed
// in args by the dispatcher / task; default off. Lets us run Scout→Verify safely.
const DRY_RUN = A.dry_run === true || A.dry_run === 'true'

// JSON schemas for structured agent outputs
const SCOUT_SCHEMA = {
  type: 'object',
  required: ['complexity', 'touched_files', 'risk_areas', 'similar_tickets', 'estimated_slots'],
  properties: {
    complexity: { enum: ['simple', 'medium', 'complex'] },
    touched_files: { type: 'array', items: { type: 'string' } },
    risk_areas: { type: 'array', items: { type: 'string' } },
    similar_tickets: { type: 'array', items: { type: 'string' } },
    estimated_slots: { type: 'integer' },
  },
}
const REVIEW_SCHEMA = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'file', 'description'],
        properties: {
          severity: { enum: ['low', 'medium', 'high', 'critical'] },
          file: { type: 'string' },
          line: { type: 'integer' },
          description: { type: 'string' },
          suggested_fix: { type: 'string' },
        },
      },
    },
    summary: { type: 'string' },
  },
}

// ── ① Scout ────────────────────────────────────────────────────────────────
phase('Scout')
const scout = await agent(
  `Record pipeline liveness first so the dispatcher watchdog does not flag this run as stale: run \`bash ${REPO}/scripts/ticket.sh touch --id ${A.ticket_id}\`. Then:
   Scout the feature "${A.title}" against the codebase at ${REPO}.
   Description: ${A.description}.

   1. Read the scout template at ${REPO}/scripts/factory/templates/scout-template.md.
   2. Find similar past tickets by running:
      \`cd ${REPO}/website && npx tsx scripts/find-similar-tickets.mjs "${A.title} ${A.description}" 5\`
      (fail-soft: [] is fine if the DB is empty or the GPU host is down).
   3. Identify which files this feature will edit (touched_files), the complexity
      (simple/medium/complex), risk_areas, and estimated_slots.

   Return a JSON object matching the scout schema.`,
  { label: 'scout', phase: 'Scout', schema: SCOUT_SCHEMA },
)

// Persist touched_files back onto the ticket via ticket.sh (NO raw SQL).
log(`Scout: complexity=${scout.complexity}, ${scout.touched_files.length} touched files`)
await agent(
  `Run the following command to record which files this feature touches on the ticket:
   bash ${REPO}/scripts/ticket.sh set-touched-files --id ${A.ticket_id} --files ${JSON.stringify(scout.touched_files.join(','))}
   Report the command output.`,
  { label: 'scout:persist', phase: 'Scout' },
)

// SIMPLE features skip Design/Plan/Implement and go straight to Verify→Deploy.
const isSimple = scout.complexity === 'simple'

// ── ② Design ───────────────────────────────────────────────────────────────
let specPath = null
if (!isSimple) {
  phase('Design')
  const design = await agent(
    `Record pipeline liveness first so the dispatcher watchdog does not flag this run as stale: run \`bash ${REPO}/scripts/ticket.sh touch --id ${A.ticket_id}\`. Then:
     Write a design spec for "${A.title}" following the structure in
     ${REPO}/scripts/factory/templates/design-template.md (if it exists) or using standard
     ARCH/GOALS/RISKS/DECISIONS structure. For medium/complex, include an adversarial
     "try to refute this design" section.

     Save the spec to: ${REPO}/docs/superpowers/specs/${A.timestamp}-${slug}-design.md

     Then attach it to the ticket:
     bash ${REPO}/scripts/ticket-attach.sh <uuid> <specfile>

     Return the spec file path (just the path, nothing else).`,
    { label: 'design', phase: 'Design' },
  )
  specPath = design.trim()
}

// ── ③ Plan (with conflict gate) ────────────────────────────────────────────
let tasks = []
if (!isSimple) {
  phase('Plan')
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
    return { status: 'blocked', reason: 'file-overlap', conflict }
  }

  const plan = await agent(
    `Decompose the spec at ${specPath} into independent tasks where no two tasks
     touch the same file. For each task provide: id, target_files (array),
     acceptance_criteria (array of strings).

     Write the full plan to:
     ${REPO}/docs/superpowers/plans/${A.timestamp}-${slug}.md

     Then run the frontmatter hook:
     bash ${REPO}/scripts/plan-frontmatter-hook.sh ${REPO}/docs/superpowers/plans/${A.timestamp}-${slug}.md

     Return a JSON object { tasks: [...] } matching the task schema.`,
    {
      label: 'plan:decompose',
      phase: 'Plan',
      schema: {
        type: 'object',
        required: ['tasks'],
        properties: {
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'target_files', 'acceptance_criteria'],
              properties: {
                id: { type: 'string' },
                target_files: { type: 'array', items: { type: 'string' } },
                acceptance_criteria: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      },
    },
  )
  tasks = plan.tasks
}

// ── ④ Implement (N parallel tasks, isolated worktrees) ─────────────────────
let implemented = []
if (!isSimple && tasks.length) {
  phase('Implement')
  implemented = (await pipeline(
    tasks,
    (t) => agent(
      `Record pipeline liveness first so the dispatcher watchdog does not flag this run as stale: run \`bash ${REPO}/scripts/ticket.sh touch --id ${A.ticket_id}\`. Then:
       Implement task ${t.id} on branch feature/${slug} in an isolated worktree at ${WT}.
       Target files: ${t.target_files.join(', ')}.
       Follow TDD (red-green). Acceptance criteria: ${t.acceptance_criteria.join('; ')}.
       After implementing, run locally:
         cd ${WT} && task workspace:validate && task test:all
       Return a summary of the diff and the local test result (pass/fail).`,
      { label: `impl:${t.id}`, phase: 'Implement', isolation: 'worktree' },
    ),
    (_res, t) => agent(
      `Self-verify task ${t.id}: re-read the implementation diff and confirm that each
       acceptance criterion is met: ${t.acceptance_criteria.join('; ')}.
       Report pass/fail for each criterion.`,
      { label: `impl-verify:${t.id}`, phase: 'Implement' },
    ),
  )).filter(Boolean)
}

// ── ⑤ Verify (adversarial review panel — three parallel lenses) ────────────
phase('Verify')
const lenses = [
  { key: 'bug',      file: 'scripts/factory/review-bug-hunter.prompt.md' },
  { key: 'security', file: 'scripts/factory/review-security-auditor.prompt.md' },
  { key: 'pattern',  file: 'scripts/factory/review-pattern-enforcer.prompt.md' },
]
const reviews = (await parallel(
  lenses.map((l) => () => agent(
    `Record pipeline liveness first so the dispatcher watchdog does not flag this run as stale: run \`bash ${REPO}/scripts/ticket.sh touch --id ${A.ticket_id}\`. Then:
     Read the review prompt at ${REPO}/${l.file} and apply it to the diff of
     branch feature/${slug} (run: git diff origin/main...HEAD in ${REPO}).
     Return your findings as JSON matching the review schema.`,
    { label: `review:${l.key}`, phase: 'Verify', schema: REVIEW_SCHEMA },
  )),
)).filter(Boolean)

const blocking = reviews.flatMap((r) => r.findings).filter((f) => f.severity === 'high' || f.severity === 'critical')
if (blocking.length) {
  await agent(
    `The adversarial review panel found HIGH/CRITICAL findings that block merge.
     Run these commands to record the block:
     bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status blocked
     bash ${REPO}/scripts/ticket.sh add-comment --id ${A.ticket_id} \
       --body ${JSON.stringify('Factory Verify blocked: ' + JSON.stringify(blocking))}
     Report the command outputs.`,
    { label: 'verify:escalate', phase: 'Verify' },
  )
  return { status: 'blocked', reason: 'review-findings', blocking }
}

// ── ⑥ Deploy (auto-merge on green CI + both-brand explicit deploy) ──────────
phase('Deploy')
if (DRY_RUN) {
  const report = await agent(
    `DRY RUN — do NOT push, merge, or deploy anything. From ${REPO}:
     1. Show the planned diff: git diff origin/main...HEAD (branch feature/${slug}).
     2. Summarise the review findings already gathered (${reviews.length} review lens result(s)).
     3. Release the pipeline slot and return the ticket to the queue (nothing shipped):
        bash ${REPO}/scripts/ticket.sh release-slot --id ${A.ticket_id}
        bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status backlog
     Report the diff stat + a one-line verdict. Take NO other action.`,
    { label: 'deploy:dry-run', phase: 'Deploy' },
  )
  return { status: 'dry-run', report, reviews: reviews.length, tasks: tasks.length }
}

const deploy = await agent(
  `Record pipeline liveness first so the dispatcher watchdog does not flag this run as stale: run \`bash ${REPO}/scripts/ticket.sh touch --id ${A.ticket_id}\`. Then:
   Deploy the feature to both brands. Operate from the MAIN repo at ${REPO}
   (NOT the worktree ${WT}) to avoid gotcha T000342 (merge conflicts from wrong CWD).

   Steps:
   1. Push branch feature/${slug} to origin:
      cd ${REPO} && git push -u origin feature/${slug}
   2. Open a PR (if not open):
      gh pr create --title "feat(${slug}): ${A.title}" --base main
   3. Wait for CI to go green. If CI is red after 2 fix attempts, set the ticket
      to blocked and STOP.
   4. Squash-merge (from ${REPO}, NOT the worktree):
      cd ${REPO} && gh pr merge --squash --delete-branch
   5. Close the ticket and archive the plan:
      bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status done --resolution shipped
      bash ${REPO}/scripts/ticket.sh archive-plan --id ${A.ticket_id} --slug ${slug} \
        --branch feature/${slug} --plan-file ${REPO}/docs/superpowers/plans/${A.timestamp}-${slug}.md
   6. Deploy BOTH brands explicitly (fleet cluster, push-based — no GitOps reconciler):
      Website changes: task feature:website (auto-rolls out via CI for both brands)
      K8s/manifest changes: task workspace:deploy ENV=mentolder && task workspace:deploy ENV=korczewski
      (Or use the umbrella if available: task feature:deploy)
   7. Verify rollout on both brands:
      kubectl --context fleet rollout status deployment/website -n website --timeout=300s
      kubectl --context fleet rollout status deployment/website -n website-korczewski --timeout=300s

   Report the merged PR number and the deploy command outputs.`,
  { label: 'deploy', phase: 'Deploy' },
)

return { status: 'done', pr: deploy, reviews: reviews.length, tasks: tasks.length, implemented: implemented.length }
}
await main();