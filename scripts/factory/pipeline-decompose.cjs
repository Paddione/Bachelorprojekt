/**
 * scripts/factory/pipeline-decompose.js
 *
 * Decompose helpers + file-assignment for the Software Factory pipeline. Used
 * by pipeline.js via require() (CommonJS). No ESM imports — Workflow constraint.
 *
 * Offline lint: node --check scripts/factory/pipeline-decompose.cjs
 */

// ── Inlined from provision.js for Workflow compatibility (no ESM imports) ──

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

// ── File assignment for batch sub-features ──────────────────────────────────

const SHARED_FILE_LIST = [
  'k3d/configmap-domains.yaml',
  'environments/schema.yaml',
  'k3d/kustomization.yaml',
]

function assignFiles(subFeatures, touchedFiles, sharedFileList) {
  const shared = sharedFileList || SHARED_FILE_LIST
  const sharedGiven = new Set()
  const assigned = new Set()

  return subFeatures.map((sf) => {
    if (!Array.isArray(sf.domains)) return { ...sf, assignedFiles: [] }

    const needed = touchedFiles.filter((f) =>
      sf.domains.some((d) => f.includes(d))
    )

    const sharedForThis = []
    const regularForThis = []

    for (const f of needed) {
      if (shared.includes(f)) {
        if (!sharedGiven.has(f)) {
          sharedForThis.push(f)
          sharedGiven.add(f)
        }
      } else {
        regularForThis.push(f)
      }
    }

    const result = []
    for (const f of [...sharedForThis, ...regularForThis]) {
      if (!assigned.has(f)) {
        result.push(f)
        assigned.add(f)
      }
    }

    return {
      ...sf,
      assignedFiles: result,
      shared_changes: sf.shared_changes || sharedForThis.length > 0,
    }
  })
}

function validateDisjoint(subFeatures) {
  const seen = new Map()
  for (const sf of subFeatures) {
    for (const f of (sf.assignedFiles || [])) {
      if (seen.has(f)) {
        throw new Error(`File assigned to multiple sub-features: ${f} (${seen.get(f)} and ${sf.id})`)
      }
      seen.set(f, sf.id)
    }
  }
}

module.exports = {
  chooseModel,
  chooseEffort,
  buildContextHints,
  provision,
  assignFiles,
  validateDisjoint,
}
