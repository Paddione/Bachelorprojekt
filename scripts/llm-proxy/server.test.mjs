// scripts/llm-proxy/server.test.mjs
// Pure-function tests for proxy routing + request fixups. Zero deps, zero I/O.
// Run: node --test scripts/llm-proxy/server.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveModel, _testSeed } from './discovery.mjs'
import { applyFixups } from './fixups.mjs'

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
