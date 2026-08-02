// scripts/llm-proxy/server.test.mjs
// Pure-function tests for proxy routing + request fixups. Zero deps, zero I/O.
// Run: node --test scripts/llm-proxy/server.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveModel, _testSeed } from './discovery.mjs'
import { applyFixups } from './fixups.mjs'
import { parseLoadouts } from './loadouts.mjs'
import { readFileSync } from 'node:fs'

// Helper: create a getBackends function that returns the given array
const mockGet = (arr) => () => arr

const backendA = { name: 'a', baseUrl: 'http://a:1234/v1', kind: 'lmstudio', priority: 1, apiKeyEnv: '', fixups: ['bonsai-system-role-fixup'], modelAliases: { sonnet: 'm1' } }
const backendB = { name: 'b', baseUrl: 'http://b:1234/v1', kind: 'lmstudio', priority: 2, apiKeyEnv: '', fixups: [], modelAliases: {} }

// Seed internal catalog: a healthy with m1, b healthy with m2
_testSeed({ backends: [
  { name: 'a', priority: 1, healthy: true, models: ['m1'] },
  { name: 'b', priority: 2, healthy: true, models: ['m2'] },
] })

test('resolveModel: exact ID -> backendserving that model', () => {
  const r = resolveModel('m2', mockGet([backendA, backendB]))
  assert.equal(r.backend.name, 'b')
  assert.equal(r.servedModel, 'm2')
  assert.equal(r.substituted, false)
})

test('resolveModel: alias -> target model of highest-priority backend', () => {
  const r = resolveModel('sonnet', mockGet([backendA, backendB]))
  assert.equal(r.backend.name, 'a')
  assert.equal(r.servedModel, 'm1')
  assert.equal(r.substituted, true)
})

test('resolveModel: stale ID -> fallback to first model of highest-priority healthy backend', () => {
  const r = resolveModel('ghost', mockGet([backendA, backendB]))
  assert.equal(r.backend.name, 'a')
  assert.equal(r.servedModel, 'm1')
  assert.equal(r.substituted, true)
})

test('resolveModel: no healthy backend -> null (caller sends 503 no_backend)', () => {
  _testSeed({ backends: [] })
  const r = resolveModel('m1', mockGet([]))
  assert.equal(r, null)
  // Re-seed for other tests
  _testSeed({ backends: [
    { name: 'a', priority: 1, healthy: true, models: ['m1'] },
    { name: 'b', priority: 2, healthy: true, models: ['m2'] },
  ] })
})

// ── Readiness (T002336) ───────────────────────────────────────────────
test('evaluateReadiness: unhealthy enabled priority-1 backend -> not ready (T002336)', async () => {
  const mod = await import('./discovery.mjs')
  assert.equal(typeof mod.evaluateReadiness, 'function',
    'discovery.mjs muss evaluateReadiness(getBackends) exportieren')

  const gemma = { name: 'llamacpp-gemma', baseUrl: 'http://127.0.0.1:8091/v1', kind: 'llamacpp', priority: 1 }
  const deepseek = { name: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', kind: 'openai-remote', priority: 2 }
  _testSeed({ backends: [
    { name: 'llamacpp-gemma', priority: 1, healthy: false, models: [] },
    { name: 'deepseek', priority: 2, healthy: true, models: ['deepseek-chat'] },
  ] })

  const r = mod.evaluateReadiness(mockGet([gemma, deepseek]))
  assert.equal(r.ready, false, 'totes Prio-1-Backend muss ready=false ergeben, auch wenn ein Cloud-Fallback lebt')
  assert.deepEqual(r.degraded.map((d) => d.name), ['llamacpp-gemma'])

  _testSeed({ backends: [
    { name: 'a', priority: 1, healthy: true, models: ['m1'] },
    { name: 'b', priority: 2, healthy: true, models: ['m2'] },
  ] })
})

test('evaluateReadiness: only a lower-priority backend down -> still ready (T002336)', async () => {
  const mod = await import('./discovery.mjs')
  assert.equal(typeof mod.evaluateReadiness, 'function',
    'discovery.mjs muss evaluateReadiness(getBackends) exportieren')

  const gemma = { name: 'llamacpp-gemma', baseUrl: 'http://127.0.0.1:8091/v1', kind: 'llamacpp', priority: 1 }
  const deepseek = { name: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', kind: 'openai-remote', priority: 2 }
  _testSeed({ backends: [
    { name: 'llamacpp-gemma', priority: 1, healthy: true, models: ['gemma-4-12b'] },
    { name: 'deepseek', priority: 2, healthy: false, models: [] },
  ] })

  const r = mod.evaluateReadiness(mockGet([gemma, deepseek]))
  assert.equal(r.ready, true, 'ein ausgefallener Cloud-Fallback darf den Proxy nicht rot melden')
  assert.deepEqual(r.degraded.map((d) => d.name), ['deepseek'],
    'der Ausfall wird trotzdem berichtet — sichtbar, aber nicht blockierend')

  _testSeed({ backends: [
    { name: 'a', priority: 1, healthy: true, models: ['m1'] },
    { name: 'b', priority: 2, healthy: true, models: ['m2'] },
  ] })
})

test('applyFixups bonsai-system-role-fixup: mid-array system role is transformed', () => {
  const body = { messages: [
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'hi' },
    { role: 'system', content: 'mid' },
  ] }
  const out = applyFixups(['bonsai-system-role-fixup'], body)
  assert.equal(out.messages[0].role, 'system')
  assert.notEqual(out.messages[2].role, 'system')
})

test('applyFixups: empty fixup list leaves body unchanged (deep equal)', () => {
  const body = { messages: [{ role: 'system', content: 'x' }, { role: 'system', content: 'y' }] }
  assert.deepEqual(applyFixups([], body), body)
})

// --- Loadout-Registry: die ausgelieferte Datei muss gueltig sein -----------

test('scripts/llm/loadouts.json ist gueltig und portkollisionsfrei', () => {
  const doc = parseLoadouts(readFileSync('scripts/llm/loadouts.json', 'utf8'))
  assert.ok(doc.loadouts.length > 0)

  const withPort = doc.loadouts.filter((l) => l.port != null)
  assert.ok(withPort.length > 0, 'kein Loadout mit Port — der Test waere vakuos')

  const seen = new Map()
  for (const l of withPort) {
    const prev = seen.get(l.port)
    if (prev === undefined) {
      seen.set(l.port, l.exclusiveGroup ?? null)
      continue
    }
    assert.ok(
      prev != null && prev === l.exclusiveGroup,
      `${l.slug}: Port ${l.port} doppelt vergeben, aber nicht in derselben exclusiveGroup ` +
        `(${prev} vs ${l.exclusiveGroup}) — diese Loadouts koennten gleichzeitig laufen`,
    )
  }
})

test('kein Loadout MIT --fit pinnt ctx oder ngl', () => {
  const doc = parseLoadouts(readFileSync('scripts/llm/loadouts.json', 'utf8'))
  let checked = 0
  for (const l of doc.loadouts) {
    if (l.fit?.enabled !== true) continue
    checked++
    assert.equal(l.args.ctx, null, `${l.slug}: ctx darf nicht gepinnt sein`)
    assert.equal(l.args.ngl, null, `${l.slug}: ngl darf nicht gepinnt sein`)
  }
  assert.ok(checked > 0, 'kein einziges --fit-Loadout geprueft — der Test waere vakuos')
})

test('fit-freie Loadouts MUESSEN ctx und ngl setzen', () => {
  const doc = parseLoadouts(readFileSync('scripts/llm/loadouts.json', 'utf8'))
  for (const l of doc.loadouts) {
    if (l.fit?.enabled !== false) continue
    assert.notEqual(l.args.ctx, null, `${l.slug}: ctx muss ohne --fit gesetzt sein`)
    assert.notEqual(l.args.ngl, null, `${l.slug}: ngl muss ohne --fit gesetzt sein`)
  }
})

// ── T002483: Per-Slot Queuing ──────────────────────────────────────────

test('extractSlotId: null for missing header', async () => {
  const mod = await import('./slot-queue.mjs')
  const req = { headers: {} }
  const slotId = mod.extractSlotId(req)
  assert.equal(slotId, null)
})

test('extractSlotId: parses X-Slot-ID header as integer', async () => {
  const mod = await import('./slot-queue.mjs')
  const req = { headers: { 'x-slot-id': '2' } }
  const slotId = mod.extractSlotId(req)
  assert.equal(slotId, 2)
})

test('extractSlotId: rejects non-numeric header', async () => {
  const mod = await import('./slot-queue.mjs')
  const req = { headers: { 'x-slot-id': 'abc' } }
  const slotId = mod.extractSlotId(req)
  assert.equal(slotId, null)
})

test('extractSlotId: accepts slot-id 0', async () => {
  const mod = await import('./slot-queue.mjs')
  const req = { headers: { 'x-slot-id': '0' } }
  const slotId = mod.extractSlotId(req)
  assert.equal(slotId, 0)
})

test('enqueue: different slotIds create independent queues (no deadlock)', async () => {
  const mod = await import('./slot-queue.mjs')
  const backendName = 'test-mapping'

  const { run: r0 } = mod.enqueue(backendName, 1, () => Promise.resolve('slot0'), 0)
  const { run: r1 } = mod.enqueue(backendName, 1, () => Promise.resolve('slot1'), 1)

  const results = await Promise.all([r0, r1])
  assert.deepEqual(results, ['slot0', 'slot1'])
})
