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

// ── Readiness (T002336) ───────────────────────────────────────────────
// /health meldete 200, solange der PROZESS lief — auch mit totem Backend.
// Am 2026-07-27 blieb llamacpp-gemma (:8091) drei Stunden weg, ohne dass
// irgendwo etwas rot wurde: deepseek war die ganze Zeit erreichbar, also
// war "mindestens ein Backend gesund" erfuellt. Genau deshalb reicht diese
// schwache Regel nicht — massgeblich sind die LOKALEN Prio-1-Backends.
// Ein Cloud-Fallback ist kein Ersatz fuer den lokalen Stack.
//
// Der dynamische Import ist Absicht: ein statischer named import auf einen
// noch nicht existierenden Export ist ein SyntaxError beim Modul-Laden und
// wuerde die GESAMTE Datei rot faerben statt nur diesen Test.
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

  // Re-seed fuer die uebrigen Tests (Muster wie im 503-Test oben)
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
