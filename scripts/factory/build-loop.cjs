// scripts/factory/build-loop.cjs — bounded self-correcting build-loop decision helper.
// pure, require-able. node --check offline. No DB/API imports (S2).
// Shared contract with build-loop.sh.
const crypto = require('crypto')

const ESCALATE_CLASSES = new Set(['sealedsecret', 'secret', 'realm', 'sql', 'manifest'])
const ALLOWED_CLASSES = new Set(['ci', 'test', 'lint', 'freshness'])

const MAX_DEFAULT = 3

function normalize(logText) {
  if (typeof logText !== 'string') return ''
  return logText
    .split('\n')
    .map((l) => l
      .replace(/\/home\/[^/]+\/[^\s]+/g, '<PATH>')
      .replace(/tmp\/wt-[^\s/]+/g, '<WT>')
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^\s]*/g, '<TS>')
      .replace(/\[?\d{1,5}m?s\]?/g, '')
      .replace(/^\s+|\s+$/g, '')
    )
    .filter(Boolean)
    .join('\n')
}

function sigHash(logText) {
  return crypto.createHash('sha256').update(normalize(logText)).digest('hex')
}

function decide({ iteration, max, prevHash, hash, classify, escalatePaths }) {
  if (!ALLOWED_CLASSES.has(classify)) {
    return { action: 'abort', reason: 'escalate-gate', hash: null }
  }
  if (escalatePaths) {
    return { action: 'abort', reason: 'escalate-gate', hash: null }
  }
  if (prevHash && hash && prevHash === hash) {
    return { action: 'abort', reason: 'no-progress', hash }
  }
  const maxVal = (typeof max === 'number' && max > 0) ? max : MAX_DEFAULT
  if (iteration >= maxVal) {
    return { action: 'abort', reason: 'max-iterations', hash }
  }
  return { action: 'continue', reason: null, hash }
}

function feedbackBlock({ classify, logTail, attempts }) {
  const lines = []
  lines.push(`FAILURE CLASS: ${classify}`)
  if (logTail) lines.push(`LOG TAIL:\n${String(logTail).split('\n').slice(-30).join('\n')}`)
  if (attempts && attempts.length > 0) {
    lines.push(`PREVIOUS ATTEMPTS (${attempts.length}):`)
    attempts.forEach((a, i) => lines.push(`  ${i + 1}. ${a}`))
  }
  lines.push('Diagnose systematically, make the smallest possible fix, re-run tests.')
  return lines.join('\n')
}

const HARNESS_TIERS = new Set(['sonnet', 'opus', 'haiku', 'fable'])

function resolveAgentModel(route, fallbackTier, logFn) {
  if (!route) return fallbackTier
  if (HARNESS_TIERS.has(route.modelId) && !route.baseUrl) return route.modelId
  if (typeof logFn === 'function') logFn(`resolveAgentModel: block baseUrl passthrough — modelId=${route.modelId} baseUrl=${route.baseUrl}, falling back to ${fallbackTier}`)
  return fallbackTier
}

async function runTaskVerifyLoop({ t, maxLoop, WORK_WT, WORK_BRANCH, slug, A, prov }) {
  const agentFn = globalThis.agent
  if (!agentFn) return null
  for (let i = 0; i < maxLoop; i++) {
    const prompt = i === 0
      ? `Self-verify task ${t.id}: confirm acceptance: ${t.acceptance_criteria.join('; ')}. Report pass/fail.`
      : `/goal Fix task ${t.id} (attempt ${i + 1}/${maxLoop}). Acceptance: ${t.acceptance_criteria.join('; ')}. After fix: cd ${WORK_WT} && task workspace:validate && task test:all && task freshness:regenerate && git add -A && git commit -m ${JSON.stringify(`feat(${slug}): ${t.id} iter ${i + 1} [factory]`)}. Return pass/fail.`
    const result = await agentFn(prompt, { label: `impl:${t.id}:${i}`, phase: 'Implement', ...(prov && i === 0 ? { model: prov.modelId || prov.model } : {}) })
    if (result) return result
  }
  return null
}

module.exports = { normalize, sigHash, decide, feedbackBlock, runTaskVerifyLoop, resolveAgentModel, ESCALATE_CLASSES, ALLOWED_CLASSES, MAX_DEFAULT }
