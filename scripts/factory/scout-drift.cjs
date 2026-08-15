/**
 * scripts/factory/scout-drift.cjs
 * Pure helper — Jaccard distance, noise filter, and running average for scout
 * drift calculation.  No require() on DB/pipeline modules (S2).
 * 100% testable via node -e "require(...)".
 */
const NOISE_PATTERNS = [
  'docs/generated/',
  'docs/code-quality/repo-index.json',
  'components/website/src/data/test-inventory.json',
  'docs/superpowers/plans/',
  'docs/superpowers/specs/',
]

function filterNoise(paths) {
  if (!Array.isArray(paths)) return []
  return paths.filter((p) => {
    if (typeof p !== 'string' || p === '') return false
    return !NOISE_PATTERNS.some((prefix) => p.startsWith(prefix))
  })
}

function toSet(arr) {
  const s = new Set()
  for (const item of arr) {
    if (typeof item !== 'string') s.add(String(item))
    else s.add(item)
  }
  return s
}

function jaccardDistance(predicted, actual) {
  const P = Array.isArray(predicted) ? predicted : []
  const A = Array.isArray(actual) ? actual : []
  if (P.length === 0 && A.length === 0) return 0
  const pSet = toSet(P)
  const aSet = toSet(A)
  let intersect = 0
  for (const item of pSet) {
    if (aSet.has(item)) intersect++
  }
  const union = new Set([...pSet, ...aSet]).size
  if (union === 0) return 0
  return 1 - intersect / union
}

/**
 * Compute a running average over an array of numbers with a given window size.
 * Returns an array of the same length; the first (windowSize-1) elements use
 * whatever window is available (1, 2, ..., windowSize-1).
 *
 * @param {number[]} values  Input values
 * @param {number} [windowSize=3]  Smoothing window (default 3)
 * @returns {number[]}  Smoothed values
 */
function runningAverage(values, windowSize) {
  if (windowSize == null || windowSize < 1) windowSize = 3
  if (!Array.isArray(values) || values.length === 0) return []
  const result = []
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - windowSize + 1)
    const slice = values.slice(start, i + 1)
    const sum = slice.reduce((a, b) => a + b, 0)
    result.push(sum / slice.length)
  }
  return result
}

module.exports = { jaccardDistance, filterNoise, runningAverage }
