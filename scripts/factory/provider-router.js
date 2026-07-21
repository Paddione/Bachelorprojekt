// scripts/factory/provider-router.js
//
// Central agent→provider routing + circuit-breaker. PURE-DECISION + injected-query
// SSOT. The Factory Workflow script (pipeline.js) cannot ESM-import this (harness
// forbids imports) — it INLINES an equivalent copy and shells out to the bash
// wrappers. dev-flow + website use the wrappers / website/src/lib/provider-config.ts.
//
// Offline lint:  node --check scripts/factory/provider-router.js
// Unit tests:    node --test scripts/factory/provider-router.test.mjs

export const OPUS_MODEL = 'qwythos-9b-v2'
export const EMERGENCY_FALLBACK = { provider: 'lmstudio', modelId: 'qwythos-9b-v2', baseUrl: 'http://127.0.0.1:1234' }
export const FAILURE_THRESHOLD = 3
export const COOLDOWN_MINUTES = 10
export const DEFAULT_MAX_CONCURRENT = 8

export function decideOpus() {
  return { provider: 'lmstudio', modelId: OPUS_MODEL, baseUrl: 'http://127.0.0.1:1234', releaseSlot: async () => {} }
}

/**
 * Order config rows: source-specific entries before wildcard '*', then priority asc.
 * @param {Array} rows  provider_config rows for source IN (source,'*') AND enabled.
 * @param {string} source
 */
export function orderCandidates(rows, source) {
  return [...rows].sort((a, b) => {
    const aSpecific = a.source === source ? 0 : 1
    const bSpecific = b.source === source ? 0 : 1
    if (aSpecific !== bSpecific) return aSpecific - bSpecific
    return a.priority - b.priority
  })
}

/** Circuit closed (not in cooldown) AND below the concurrency cap. */
export function isUsable(health, maxConcurrent) {
  const h = health ?? {}
  const inCooldown = h.cooldown_until != null && new Date(h.cooldown_until).getTime() > Date.now()
  if (inCooldown) return false
  const active = Number(h.active_agents ?? 0)
  return active < Number(maxConcurrent ?? DEFAULT_MAX_CONCURRENT)
}

/** Circuit breaker opens once failures reach the threshold. */
export function openCircuit(failureCount) {
  return Number(failureCount ?? 0) >= FAILURE_THRESHOLD
}

/** Budget guard: NULL budget = unbounded; else reserved + ctx must fit the budget. */
export function hasBudget(health, ctx, budget) {
  if (budget == null) return true
  const reserved = Number((health && health.reserved_tokens) ?? 0)
  return reserved + Number(ctx ?? 0) <= Number(budget)
}

/**
 * Claim a provider slot for (source, tier). `query` is an injected async fn
 * (kind, params) => { rows } so the same logic runs against the fake (tests) and
 * a factory_psql/pg adapter (wrappers). opus short-circuits to Anthropic (no DB).
 * Returns { provider, modelId, baseUrl, releaseSlot(success), emergency? }.
 */
export async function routeProvider(query, source, tier) {
  if (tier === 'opus') return decideOpus()

  const { rows: cfg } = await query('load-config', { source, tier })
  const candidates = orderCandidates((cfg ?? []).filter(r => r.tier === tier), source)

  for (const c of candidates) {
    const { rows: hrows } = await query('load-health', { provider: c.provider })
    const health = hrows && hrows[0]
    const cap = Number(c.max_concurrent ?? DEFAULT_MAX_CONCURRENT)
    const ctx = Number(c.context_window ?? 0)
    const budget = c.context_budget == null ? null : Number(c.context_budget)
    if (!isUsable(health, cap)) continue
    if (!hasBudget(health, ctx, budget)) continue
    const { rows: claimed } = await query('claim-slot', { provider: c.provider, maxConcurrent: cap, ctx, budget })
    if (!claimed || !claimed.length) continue
    const provider = c.provider
    return {
      provider,
      modelId: c.model_id,
      baseUrl: c.base_url ?? null,
      ctx,
      releaseSlot: (success) => releaseSlot(query, provider, success, ctx),
    }
  }

  return { ...EMERGENCY_FALLBACK, emergency: true, releaseSlot: async () => {} }
}

/** Release a claimed slot (always decrements); record a failure when success=false. */
export async function releaseSlot(query, provider, success, ctx = 0) {
  await query('release-slot', { provider, ctx })
  if (!success) await query('record-failure', { provider })
}
