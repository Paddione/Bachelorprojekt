/**
 * scripts/factory/pipeline-partials.cjs
 *
 * tasks.d/ partial-plan parser + fan-out prompt builder + rotation/PR-gate
 * helpers for the Software Factory pipeline. Pure CommonJS — no ESM imports,
 * no DB/API layer imports (S2): every input arrives as a parameter. Reached
 * host-side from pipeline-runner.js via require(); the sandboxed pipeline.js
 * consumes the results through the runner (it has no fs/require of its own).
 *
 * Offline lint: node --check scripts/factory/pipeline-partials.cjs
 */

const fs = require('fs')
const path = require('path')
const { validateDisjoint } = require('./pipeline-decompose.cjs')

// Parse the `## Partials` manifest table out of the tasks.md index.
//   | <id> | tasks.d/pX-<name>.md | impl|tests | <target_files, comma-sep> |
// Returns [{ id, file, role, target_files: [] }] (header/separator rows skipped).
function parsePartialsManifest(indexMd) {
  const lines = String(indexMd || '').split('\n')
  const rows = []
  let inSection = false
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '')
    if (/^##\s+Partials\b/.test(line)) { inSection = true; continue }
    if (inSection && /^##\s/.test(line)) break
    if (!inSection) continue
    if (!/^\|/.test(line)) continue
    if (!line.includes('tasks.d/')) continue // skips header + separator rows
    const cells = line.replace(/^\|\s*/, '').replace(/\s*\|\s*$/, '').split('|').map((c) => c.trim())
    if (cells.length < 4) continue
    const target_files = cells[3].split(',')
      .map((t) => t.replace(/`/g, '').trim())
      .filter(Boolean)
    rows.push({ id: cells[0], file: cells[1].replace(/`/g, ''), role: cells[2], target_files })
  }
  return rows
}

// Read tasks.md + tasks.d/*.md for a change dir and map to the batch
// sub_features shape ({ id, title, description, assignedFiles }). Runs the
// runtime disjointness double-check (validateDisjoint throws on overlap).
// Returns { partials:false } when the change has no tasks.d/ dir.
function readPartials(changeDir) {
  const tasksDir = path.join(changeDir, 'tasks.d')
  const indexPath = path.join(changeDir, 'tasks.md')
  if (!fs.existsSync(tasksDir) || !fs.existsSync(indexPath)) return { partials: false }
  const indexMd = fs.readFileSync(indexPath, 'utf8')
  const manifest = parsePartialsManifest(indexMd)
  if (!manifest.length) return { partials: false }
  const sub_features = manifest.map((m) => {
    let description = ''
    const pf = path.join(changeDir, m.file)
    try { if (fs.existsSync(pf)) description = fs.readFileSync(pf, 'utf8') } catch { /* keep empty */ }
    return {
      id: m.id,
      title: `${m.role}: ${m.file}`,
      role: m.role,
      description,
      assignedFiles: m.target_files,
    }
  })
  validateDisjoint(sub_features) // throws on a file assigned to two partials
  return { partials: true, sub_features }
}

// Build the implement prompt for one partial sub-feature (extracted from
// pipeline.js so the workflow script only keeps the agent() call). ctx carries
// the runtime paths the sandbox knows: { repo, workWt, workBranch, brand, slug }.
function buildPartialPrompt(sf, ctx) {
  const c = ctx || {}
  const repo = c.repo || '/home/patrick/Bachelorprojekt'
  const files = (sf.assignedFiles || []).join(', ')
  const isTests = sf.role === 'tests'
  const roleLine = isTests
    ? 'This is the TESTS partial: write the rot→grün failing test FIRST (expected: FAIL), then the implementation.'
    : 'Follow TDD (red-green).'
  return `Liveness: \`bash ${repo}/scripts/ticket.sh touch --id ${c.ticketId || ''}\`.
Implement partial ${sf.id} — ${sf.title} in the shared worktree ${c.workWt}
(branch ${c.workBranch}, already exists — do NOT run \`git worktree add\` again).
Target files (ONLY these — disjoint from other partials): ${files}.
Description:
${sf.description || ''}
${roleLine}
DARK-LAUNCH: gate new user-visible behavior behind isFeatureEnabled('${c.brand}', '${c.slug}').
After implementing: bash ${repo}/scripts/factory/sandbox-run.sh ${c.workWt} 'task workspace:validate && task test:all && task freshness:regenerate'
Then commit: cd ${c.workWt} && git add -A && git commit -m ${JSON.stringify(`feat(${c.slug}): ${sf.id} [partial-factory]`)}
COMPLETION PROTOCOL: end with a one-line JSON result {"partial":"${sf.id}","tests":"pass|fail"} so the pipeline can emit a partial-done phase event.
Return a summary of the diff and local test result.`
}

// Rotation gate (Design §4): true once every impl-role partial has reported a
// partial-done event. doneIds = array of partial ids seen; manifest = the
// parsed partial list. The tests partial rotates to reviewer only after this.
function rotationReady(doneIds, manifest) {
  const done = new Set(doneIds || [])
  const implPartials = (manifest || []).filter((m) => m.role !== 'tests')
  if (!implPartials.length) return false
  return implPartials.every((m) => done.has(m.id))
}

// PR-gate (Design §4b / Task 14): true only when a verify/pr-ready phase event
// exists. Pure — the caller passes the ticket's phase events in.
function prGateSatisfied(phaseEvents) {
  return (phaseEvents || []).some(
    (e) => e && e.phase === 'verify' && e.state === 'pr-ready',
  )
}

// Build the Deploy-phase agent prompt (extracted from pipeline.js — B1b net
// shrink). The CI retry loop now lives in scripts/factory/pr-babysit-ticket.sh
// (Task 15). ctx: { repo, workBranch, workWt, ticketId, maxDiff, titlePrefix,
// slug, title, deployStepCmd, resolvedPlanFile, timestamp }.
function buildDeployPrompt(ctx) {
  const c = ctx || {}
  const R = c.repo || '/home/patrick/Bachelorprojekt'
  return `/goal Deploy feature branch ${c.workBranch} to both brands.
   Liveness: \`bash ${R}/scripts/ticket.sh touch --id ${c.ticketId}\`.
   Deploy to both brands. Operate from MAIN repo ${R} (NOT ${c.workWt}).

   HARD GUARDS — STOP on any failure:
   a. Branch: WORK_BRANCH must match ^(feature|fix|chore)/ .
      printf '%s' "${c.workBranch}" | grep -Eq '^(feature|fix|chore)/' || { echo "BLOCK: WORK_BRANCH ${c.workBranch} not feature/*|fix/*|chore/*"; exit 1; }
   b. Diff-size cap: source ${R}/scripts/factory/guards.sh
      GUARDS_REPO=${R} guard_check_diff_size ${c.maxDiff || '800'} ${c.workBranch}
   c. CWD: every command MUST run from ${R}, never ${c.workWt} (T000342).
   d. Explicit ENV: use ENV=mentolder/ENV=korczewski — never bare kubectl.

   If guard (a) or (b) fails: bash ${R}/scripts/ticket.sh update-status --id ${c.ticketId} --status blocked
   then PushNotification: title "Factory Deploy blocked: ${c.ticketId}", message which guard failed.
   Return JSON: { "status": "blocked", "reason": "deploy-guard" }.

   Steps:
   1. git push -u origin ${c.workBranch}
   2. Open PR: gh pr create --title "${c.titlePrefix}(${c.slug}): ${c.title}" --base main
      PR=$(gh pr view --json number -q .number); bash ${R}/scripts/ticket.sh add-comment --id ${c.ticketId} --body "Factory: PR #$PR opened (phase=Deploy)."
      bash ${R}/scripts/ticket.sh add-pr-link --id ${c.ticketId} --pr "$PR"
   3. Ticket-scoped CI babysit (watch → classify → fix-subagent → re-check → requeue → merge),
      which on green auto-merge also closes the ticket and archives the plan (T002074):
        bash ${R}/scripts/factory/pr-babysit-ticket.sh ${c.ticketId} "$PR"
      If it exits non-zero: bash ${R}/scripts/ticket.sh update-status --id ${c.ticketId} --status blocked
        && bash ${R}/scripts/ticket.sh phase ${c.ticketId} verify blocked --driver factory --detail "gate=ci result=fail" || true
        && add-comment "CI red after retries"; then return.
   4. PR_NUM=$(gh pr view "$PR" --json number -q '.number' 2>/dev/null || echo "$PR")
      bash ${R}/scripts/ticket.sh archive-plan --id ${c.ticketId} --slug ${c.slug} --branch ${c.workBranch} --plan-file ${c.resolvedPlanFile} || true
   5b. bash ${R}/scripts/ticket.sh feature-flag set --brand mentolder --key ${c.slug} --enabled false --set-by factory
       bash ${R}/scripts/ticket.sh feature-flag set --brand korczewski --key ${c.slug} --enabled false --set-by factory
   6. ${c.deployStepCmd}
   7. kubectl --context fleet rollout status deployment/website -n website --timeout=300s
      kubectl --context fleet rollout status deployment/website -n website-korczewski --timeout=300s
   8. LAYER-4 CANARY per brand (mentolder korczewski):
      SERVICE=website TARGET=<brand> source ${R}/scripts/feature-promote.sh
      observe_prod <brand> "$(svc_image_repo website <brand>):${c.timestamp}"
      If RED: output CANARY_RED <brand>

   Report the merged PR number and deploy outputs.`
}

module.exports = {
  parsePartialsManifest,
  readPartials,
  buildPartialPrompt,
  rotationReady,
  prGateSatisfied,
  buildDeployPrompt,
}
