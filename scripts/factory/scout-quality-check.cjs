/**
 * scripts/factory/scout-quality-check.cjs
 * Pure quality evaluator for Software-Factory Scout output.
 * No external dependencies. Loadable via require() from pipeline.js (Workflow script).
 * Note: spec_too_short is handled by evaluateSpecPreGate (pre-gate), not here.
 *
 * @param {{touched_files?: unknown, plan_path?: unknown}} scoutResult
 * @returns {{weak: boolean, reasons: string[]}}
 */
function evaluateScoutQuality(scoutResult) {
  const reasons = []
  const r = scoutResult && typeof scoutResult === 'object' ? scoutResult : {}

  const touched = Array.isArray(r.touched_files) ? r.touched_files : []
  if (touched.length === 0) reasons.push('touched_files_empty')

  if (!r.plan_path) reasons.push('no_plan_path')

  return { weak: reasons.length > 0, reasons }
}

/**
 * Pre-gate that checks spec quality BEFORE invoking scout.sh.
 * Returns { weak: true, reasons: [...] } if the spec is too short and the
 * LLM fallback is not available to salvage it.
 *
 * @param {string} specContent  The spec/content text to check
 * @param {{ llmEnabled?: boolean, title?: string, slug?: string }} [options]
 * @returns {{ weak: boolean, reasons: string[] }}
 */
function evaluateSpecPreGate(specContent, options) {
  const reasons = []
  const opts = options || {}
  const content = typeof specContent === 'string' ? specContent : String(specContent || '')

  // Spec length check: min 300 chars
  if (content.length < 300) {
    // Allow bypass if LLM fallback is enabled — the LLM can salvage short specs
    // if the title+slug are descriptive enough
    if (opts.llmEnabled || process.env.SCOUT_LLM_ENABLED === 'true') {
      // Check if title or slug is descriptive enough for LLM fallback
      const title = opts.title || ''
      const slug = opts.slug || ''
      if (title.length > 20 || slug.length > 10) {
        // Descriptive enough — pass through
        return { weak: false, reasons: [] }
      }
    }
    reasons.push('spec_too_short')
  }

  return { weak: reasons.length > 0, reasons }
}

/**
 * Run the Scout quality gate with side effects.
 * Returns a scout_weak result object if weak (pipeline should return it), or null if ok.
 * @param {object} scout  Scout output (touched_files, etc.)
 * @param {string} ticketId  External ticket ID
 * @param {string} repo  Absolute repo path
 * @param {object} cp  require('child_process')
 * @param {Function} log  log function
 * @param {Function} phaseEvent  phaseEvent function
 * @returns {{status:string,ticket_id:string,reasons:string[]}|null}
 */
function runScoutGate(scout, ticketId, repo, cp, log, phaseEvent) {
  const sq = evaluateScoutQuality({
    touched_files: scout.touched_files,
    plan_path: 'pending',
  })
  if (!sq.weak) return null
  log(`Scout weak: ${sq.reasons.join(',')} — parking for interactive worker`)
  try {
    cp.execFileSync('bash', [
      `${repo}/scripts/ticket.sh`, 'add-comment',
      '--id', String(ticketId), '--author', 'factory', '--visibility', 'internal',
      '--body', `SCOUT_WEAK=true\ntouched_files=${(scout.touched_files||[]).length}\nreason=${sq.reasons[0]}`,
    ], { stdio: 'ignore', timeout: 15000 })
  } catch (e) { log(`scout_weak comment failed (non-fatal): ${e.message}`) }
  phaseEvent('scout', 'blocked', `scout_weak: ${sq.reasons.join(',')}`)
  return { status: 'scout_weak', ticket_id: ticketId, reasons: sq.reasons }
}

module.exports = { evaluateScoutQuality, runScoutGate, evaluateSpecPreGate }
