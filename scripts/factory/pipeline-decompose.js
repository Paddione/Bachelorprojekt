/**
 * scripts/factory/pipeline-decompose.js
 *
 * Workflow-compatible decomposition module — no ESM import; CommonJS require OK.
 * Used by:
 *   • pipeline.js (batch_mode harness helpers)
 *   • dev-flow-batch SKILL context (decomposeFeature / assignFiles)
 *
 * Offline check: node --check scripts/factory/pipeline-decompose.js
 */

// ── Module-level constants ──
const ALWAYS_OPUS_ROLES = new Set(['review', 'security'])
const COMPLEXITY_TIER = { simple: 'haiku', medium: 'sonnet', complex: 'opus' }
const EFFORT_LADDER = ['quick', 'standard', 'ultra']
const COMPLEXITY_EFFORT_INDEX = { simple: 0, medium: 1, complex: 2 }
const SHARED_FILE_LIST = [
  'k3d/configmap-domains.yaml',
  'environments/schema.yaml',
  'k3d/kustomization.yaml',
]

// ── Pure helpers (no harness deps) ──
function clampEffortIdx(i) {
  return Math.max(0, Math.min(EFFORT_LADDER.length - 1, i))
}

function chooseModel(complexity, role) {
  if (ALWAYS_OPUS_ROLES.has(role)) return 'opus'
  return COMPLEXITY_TIER[complexity] ?? null
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

function routerSource(phaseKey) {
  return ({ scout: 'factory-scout', design: 'factory-plan', plan: 'factory-plan',
            implement: 'factory-implement', verify: 'factory-review', deploy: 'factory-implement' })[phaseKey] || '*'
}

function routerTier(model) {
  return model === 'opus' ? 'opus' : (model === 'haiku' ? 'haiku' : 'sonnet')
}

// ── Context-bound helpers (need brand/REPO/A/WORK_WT from the caller) ──

function createContextHelpers(ctx) {
  const { brand, REPO, A, WORK_WT } = ctx
  const logFn = ctx.log || globalThis.log || (() => {})

  return {
    routeProviderSync(source, tier) {
      if (tier === 'opus') {
        return { provider: 'anthropic', modelId: 'claude-opus-4-6', baseUrl: null, slotId: null, emergency: false }
      }
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
        logFn(`routeProvider(${source},${tier}) failed → emergency anthropic-sonnet: ${e.message}`)
        return { provider: 'anthropic', modelId: 'claude-sonnet-4-6', baseUrl: null, slotId: null, emergency: true }
      }
    },

    releaseSlotSync(slotId, success) {
      if (!slotId) return
      try {
        const { execFileSync } = require('child_process')
        execFileSync('bash', [`${REPO}/scripts/factory/release-slot.sh`, String(slotId), success ? 'true' : 'false'],
          { stdio: 'ignore', timeout: 20000, env: { ...process.env, BRAND: brand } })
      } catch (e) { logFn(`releaseSlot(${slotId}) failed (non-fatal): ${e.message}`) }
    },

    phaseEvent(ph, state, detail) {
      try {
        const { execFileSync } = require('child_process')
        const a = [`${REPO}/scripts/ticket.sh`, 'phase', String(A.ticket_id), ph, state, '--driver', 'factory']
        if (detail) a.push('--detail', String(detail).slice(0, 240))
        execFileSync('bash', a, { stdio: 'ignore', timeout: 15000 })
      } catch { /* telemetry is best-effort */ }
    },

    consumeInjections(ph) {
      try {
        const { execFileSync } = require('child_process'), fs = require('fs'), path = require('path')
        const sh = (a, opt) => execFileSync('bash', [`${REPO}/scripts/ticket.sh`, ...a], opt)
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
      } catch { return '' }
    },
  }
}

// ── Decompose: KI-based feature decomposition ──
// NOTE: Uses harness-injected global `agent()` — only call from Workflow context.

async function decomposeFeature(description, apiBalance) {
  const maxSubFeatures = Math.min(6, Math.max(1, Number(apiBalance) || 1))
  if (maxSubFeatures < 1) return []
  if (maxSubFeatures === 1) {
    return [{ id: 'single', title: String(description).slice(0, 60), description, domains: [], depends_on: [], shared_changes: false }]
  }

  const result = await agent(
    `Zerlege dieses Feature in maximal ${maxSubFeatures} unabhängige Sub-Features.

FEATURE:
${description}

Regeln:
- Jedes Sub-Feature muss für sich allein testbar und deploybar sein
- depends_on: slugs von Sub-Features die zuerst fertig sein müssen
- shared_changes: true bei Änderung an k3d/configmap-domains.yaml, environments/schema.yaml oder k3d/kustomization.yaml
- Maximal ${maxSubFeatures} Sub-Features
- parent_feature: kebab-case Slug für das Gesamt-Feature`,
    {
      label: 'decompose',
      phase: 'Plan',
      schema: {
        type: 'object',
        required: ['parent_feature', 'sub_features'],
        properties: {
          parent_feature: { type: 'string' },
          sub_features: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'title', 'description', 'domains', 'depends_on', 'shared_changes'],
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                description: { type: 'string' },
                domains: { type: 'array', items: { type: 'string' } },
                depends_on: { type: 'array', items: { type: 'string' } },
                shared_changes: { type: 'boolean' },
              },
            },
          },
        },
      },
    }
  )

  if (!result || !Array.isArray(result.sub_features)) return []
  return result.sub_features.slice(0, maxSubFeatures)
}

// ── Assign disjunct file lists to sub-features ──

function assignFiles(subFeatures, touchedFiles, sharedFileList) {
  if (!Array.isArray(subFeatures) || !subFeatures.length) return []

  const sharedSet = new Set(sharedFileList || SHARED_FILE_LIST)
  const sharedFiles = (touchedFiles || []).filter(f => sharedSet.has(f))
  const normalFiles = (touchedFiles || []).filter(f => !sharedSet.has(f))

  let sharedAssigned = false
  const result = subFeatures.map((sf, idx) => {
    const assigned = []
    if (!sharedAssigned && sf.shared_changes && sharedFiles.length > 0) {
      assigned.push(...sharedFiles)
      sharedAssigned = true
    }
    const perSF = normalFiles.length > 0 ? Math.ceil(normalFiles.length / subFeatures.length) : 0
    const start = idx * perSF
    const end = Math.min(start + perSF, normalFiles.length)
    for (let i = start; i < end; i++) assigned.push(normalFiles[i])
    return { ...sf, assignedFiles: assigned }
  })

  for (let i = 0; i < result.length; i++) {
    for (let j = i + 1; j < result.length; j++) {
      const overlap = result[i].assignedFiles.filter(f => result[j].assignedFiles.includes(f))
      if (overlap.length > 0) {
        throw new Error(`assignFiles: overlap between #${i} and #${j}: ${overlap.join(', ')}`)
      }
    }
  }

  return result
}

module.exports = {
  chooseModel,
  chooseEffort,
  buildContextHints,
  provision,
  routerSource,
  routerTier,
  createContextHelpers,
  decomposeFeature,
  assignFiles,
  SHARED_FILE_LIST,
}
