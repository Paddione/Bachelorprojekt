/**
 * scripts/factory/scout-quality-check.cjs
 * Pure quality evaluator for Software-Factory Scout output.
 * No external dependencies. Loadable via require() from pipeline.js (Workflow script).
 *
 * @param {{touched_files?: unknown, spec_content?: unknown, plan_path?: unknown}} scoutResult
 * @returns {{weak: boolean, reasons: string[]}}
 */
function evaluateScoutQuality(scoutResult) {
  const reasons = []
  const r = scoutResult && typeof scoutResult === 'object' ? scoutResult : {}

  const touched = Array.isArray(r.touched_files) ? r.touched_files : []
  if (touched.length === 0) reasons.push('touched_files_empty')

  const spec = typeof r.spec_content === 'string' ? r.spec_content : ''
  if (spec.length < 300) reasons.push('spec_too_short')

  if (!r.plan_path) reasons.push('no_plan_path')

  return { weak: reasons.length > 0, reasons }
}

module.exports = { evaluateScoutQuality }
