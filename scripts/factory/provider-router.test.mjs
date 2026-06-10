import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decideOpus, OPUS_MODEL, EMERGENCY_FALLBACK, orderCandidates, isUsable, openCircuit, routeProvider, releaseSlot } from './provider-router.js'

test('decideOpus returns hardcoded Anthropic with a no-op releaseSlot', async () => {
  const r = decideOpus()
  assert.equal(r.provider, 'anthropic')
  assert.equal(r.modelId, OPUS_MODEL)
  assert.equal(r.baseUrl, null)
  await r.releaseSlot(true)
  await r.releaseSlot(false)
})

test('EMERGENCY_FALLBACK is anthropic sonnet with no base url', () => {
  assert.equal(EMERGENCY_FALLBACK.provider, 'anthropic')
  assert.equal(EMERGENCY_FALLBACK.modelId, 'claude-sonnet-4-6')
  assert.equal(EMERGENCY_FALLBACK.baseUrl, null)
})

test('orderCandidates: source-specific before wildcard, then priority asc', () => {
  const rows = [
    { source: '*', tier: 'sonnet', priority: 1, provider: 'anthropic' },
    { source: 'factory-implement', tier: 'sonnet', priority: 2, provider: 'ollama' },
    { source: 'factory-implement', tier: 'sonnet', priority: 1, provider: 'deepseek' },
  ]
  const ordered = orderCandidates(rows, 'factory-implement')
  assert.deepEqual(ordered.map(r => r.provider), ['deepseek', 'ollama', 'anthropic'])
})

test('isUsable: false during cooldown', () => {
  const future = new Date(Date.now() + 60_000).toISOString()
  assert.equal(isUsable({ cooldown_until: future, active_agents: 0 }, 3), false)
})

test('isUsable: false at capacity', () => {
  assert.equal(isUsable({ cooldown_until: null, active_agents: 3 }, 3), false)
})

test('isUsable: true when healthy and below cap', () => {
  const past = new Date(Date.now() - 60_000).toISOString()
  assert.equal(isUsable({ cooldown_until: past, active_agents: 2 }, 3), true)
  assert.equal(isUsable({ cooldown_until: null, active_agents: 0 }, 3), true)
})

test('openCircuit: opens at threshold, stays closed below', () => {
  assert.equal(openCircuit(2), false)
  assert.equal(openCircuit(3), true)
  assert.equal(openCircuit(5), true)
})

function makeFakeDb(config, health) {
  const cfg = config
  const hp = new Map(health.map(h => [h.provider, { ...h }]))
  return {
    async query(kind, params) {
      if (kind === 'load-config') {
        const src = params.source
        return { rows: cfg.filter(r => (r.source === src || r.source === '*') && r.enabled !== false) }
      }
      if (kind === 'load-health') {
        const h = hp.get(params.provider) ?? { provider: params.provider, failure_count: 0, cooldown_until: null, active_agents: 0 }
        return { rows: [h] }
      }
      if (kind === 'claim-slot') {
        const h = hp.get(params.provider) ?? { provider: params.provider, failure_count: 0, cooldown_until: null, active_agents: 0 }
        if (Number(h.active_agents) >= Number(params.maxConcurrent)) return { rows: [] }
        h.active_agents = Number(h.active_agents) + 1
        hp.set(params.provider, h)
        return { rows: [{ provider: params.provider }] }
      }
      if (kind === 'release-slot') {
        const h = hp.get(params.provider); if (h) h.active_agents = Math.max(0, h.active_agents - 1)
        return { rows: [] }
      }
      if (kind === 'record-failure') {
        const h = hp.get(params.provider) ?? { provider: params.provider, failure_count: 0 }
        h.failure_count = Number(h.failure_count) + 1
        if (h.failure_count >= 3) h.cooldown_until = new Date(Date.now() + 600000).toISOString()
        hp.set(params.provider, h)
        return { rows: [] }
      }
      throw new Error('unknown kind ' + kind)
    },
    _health: hp,
  }
}

test('routeProvider picks highest-priority healthy provider and claims a slot', async () => {
  const db = makeFakeDb(
    [{ source: 'factory-implement', tier: 'sonnet', priority: 1, provider: 'deepseek', model_id: 'deepseek-chat', base_url: 'https://api.deepseek.com/v1', max_concurrent: 3, enabled: true }],
    [{ provider: 'deepseek', failure_count: 0, cooldown_until: null, active_agents: 0 }],
  )
  const r = await routeProvider(db.query.bind(db), 'factory-implement', 'sonnet')
  assert.equal(r.provider, 'deepseek')
  assert.equal(r.modelId, 'deepseek-chat')
  assert.equal(r.baseUrl, 'https://api.deepseek.com/v1')
  assert.equal(db._health.get('deepseek').active_agents, 1)
})

test('routeProvider skips a provider in cooldown, falls to next priority', async () => {
  const future = new Date(Date.now() + 600000).toISOString()
  const db = makeFakeDb(
    [
      { source: '*', tier: 'sonnet', priority: 1, provider: 'deepseek', model_id: 'deepseek-chat', base_url: 'x', max_concurrent: 3, enabled: true },
      { source: '*', tier: 'sonnet', priority: 2, provider: 'anthropic', model_id: 'claude-sonnet-4-6', base_url: null, max_concurrent: 3, enabled: true },
    ],
    [{ provider: 'deepseek', failure_count: 3, cooldown_until: future, active_agents: 0 }],
  )
  const r = await routeProvider(db.query.bind(db), 'factory-implement', 'sonnet')
  assert.equal(r.provider, 'anthropic')
})

test('routeProvider opus path never queries the DB', async () => {
  let called = false
  const r = await routeProvider(async () => { called = true; return { rows: [] } }, 'factory-plan', 'opus')
  assert.equal(r.provider, 'anthropic')
  assert.equal(called, false)
})

test('routeProvider emergency fallback when no provider usable', async () => {
  const future = new Date(Date.now() + 600000).toISOString()
  const db = makeFakeDb(
    [{ source: '*', tier: 'sonnet', priority: 1, provider: 'deepseek', model_id: 'deepseek-chat', base_url: 'x', max_concurrent: 3, enabled: true }],
    [{ provider: 'deepseek', failure_count: 3, cooldown_until: future, active_agents: 0 }],
  )
  const r = await routeProvider(db.query.bind(db), 'factory-implement', 'sonnet')
  assert.equal(r.provider, 'anthropic')
  assert.equal(r.modelId, EMERGENCY_FALLBACK.modelId)
  assert.equal(r.emergency, true)
})

test('releaseSlot(false) records a failure; (true) does not', async () => {
  const db = makeFakeDb([], [{ provider: 'deepseek', failure_count: 0, cooldown_until: null, active_agents: 1 }])
  await releaseSlot(db.query.bind(db), 'deepseek', true)
  assert.equal(db._health.get('deepseek').active_agents, 0)
  assert.equal(db._health.get('deepseek').failure_count, 0)
  await releaseSlot(db.query.bind(db), 'deepseek', false)
  assert.equal(db._health.get('deepseek').failure_count, 1)
})
