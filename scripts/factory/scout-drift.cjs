/**
 * scripts/factory/scout-drift.cjs
 * Pure helper — Jaccard distance and noise filter for scout drift calculation.
 * No require() on DB/pipeline modules (S2).  100% testable via node -e "require(...)".
 */
const NOISE_PATTERNS = [
  'docs/generated/',
  'docs/code-quality/repo-index.json',
  'website/src/data/test-inventory.json',
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

module.exports = { jaccardDistance, filterNoise }
