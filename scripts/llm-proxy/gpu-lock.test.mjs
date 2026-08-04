// scripts/llm-proxy/gpu-lock.test.mjs
// Tests fuer die GPU-Arbitrierung (T002628):
//   - evaluateLock: PID-Liveness, fail-closed bei unlesbarer Datei
//   - resolveModel: gehaltener Lock nimmt llamacpp/lmstudio aus der Auswahl
//   - startDiscovery-Tick: Draining erzeugt keine unhealthy-Zeile
//   - findExclusiveConflict: externer Eintrag ist Gruppenmitglied
// Konvention: node:test, Funktionen aufrufen und Rueckgabe pruefen.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { evaluateLock } from './gpu-lock.mjs'
import { resolveModel, _testSeed } from './discovery.mjs'
import { findExclusiveConflict, parseLoadouts } from './loadouts.mjs'

function tmpLock() {
  const dir = mkdtempSync(join(tmpdir(), 'gpu-lock-'))
  const file = join(dir, 'lock.json')
  return { dir, file }
}

function withLockFile(file, obj) {
  writeFileSync(file, JSON.stringify(obj))
}

// ── evaluateLock: PID-Liveness ─────────────────────────────────────────────

test('evaluateLock: keine Lock-Datei -> kein Lock gehalten', () => {
  const { dir, file } = tmpLock()
  const r = evaluateLock(file)
  assert.equal(r.held, false)
  assert.ok(!r.pid)
})

test('evaluateLock: lebende PID -> Lock gilt', () => {
  const { file } = tmpLock()
  withLockFile(file, { pid: process.pid, started_at: '2026-08-04T00:00:00Z', reason: 'test' })
  const r = evaluateLock(file)
  assert.equal(r.held, true)
  assert.equal(r.pid, process.pid)
  assert.ok(r.drainingKinds.includes('llamacpp'))
  assert.ok(r.drainingKinds.includes('lmstudio'))
})

test('evaluateLock: tote PID -> Lock verworfen, Datei entfernt', () => {
  const { file } = tmpLock()
  withLockFile(file, { pid: 999999999, started_at: '2026-08-04T00:00:00Z', reason: 'dead' })
  const r = evaluateLock(file)
  assert.equal(r.held, false)
  assert.ok(!exists(file), 'tote-PID-Lock-Datei muss entfernt werden')
})

test('evaluateLock: PID 1 (fremd, lebend) gilt als gehalten statt verworfen (fail-closed)', () => {
  // PID 1 existiert immer und gehoert nicht dieser Test-Session. process.kill(1,0)
  // wirft EPERM (kein Signalrecht), NICHT ESRCH — die Lock-Datei muss erhalten
  // bleiben und der Lock als gehalten gelten. [P1-1]
  const { file } = tmpLock()
  withLockFile(file, { pid: 1, started_at: '2026-08-04T00:00:00Z', reason: 'init' })
  const r = evaluateLock(file)
  assert.equal(r.held, true, 'EPERM darf nicht als tote PID gewertet werden')
  assert.ok(exists(file), 'fremder lebender Lock darf nicht geloescht werden')
})

test('evaluateLock: unparsbare Datei -> gilt als gehalten (fail-closed)', () => {
  const { file } = tmpLock()
  writeFileSync(file, 'not-json{')
  const r = evaluateLock(file)
  assert.equal(r.held, true)
  assert.ok(r.unreadable)
})

test('evaluateLock: fehlende PID -> gilt als gehalten (fail-closed)', () => {
  const { file } = tmpLock()
  withLockFile(file, { started_at: 'x' })
  const r = evaluateLock(file)
  assert.equal(r.held, true)
  assert.ok(r.invalidPid)
})

function exists(p) {
  try { statSync(p); return true } catch { return false }
}

// ── resolveModel: draining schliesst lokale Backends aus ───────────────────

const backendLlamacpp = { name: 'llamacpp-gemma', baseUrl: 'http://127.0.0.1:8091/v1', kind: 'llamacpp', priority: 1, apiKeyEnv: '', fixups: [], modelAliases: {} }
const backendLmstudio = { name: 'lmstudio-local', baseUrl: 'http://127.0.0.1:1234/v1', kind: 'lmstudio', priority: 1, apiKeyEnv: '', fixups: [], modelAliases: {} }
const backendRemote = { name: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', kind: 'openai-remote', priority: 2, apiKeyEnv: '', fixups: [], modelAliases: {} }

test('resolveModel: gehaltener Lock nimmt llamacpp aus der Auswahl', () => {
  _testSeed({ lock: { held: true, drainingKinds: ['llamacpp', 'lmstudio'] }, backends: [
    { name: 'llamacpp-gemma', priority: 1, healthy: true, draining: true, models: ['gpt-oss-20b'] },
    { name: 'deepseek', priority: 2, healthy: true, models: ['deepseek-chat'] },
  ] })
  const r = resolveModel('gpt-oss-20b', () => [backendLlamacpp, backendRemote])
  assert.ok(r, 'es muss ein Backend gewaehlt werden (der Fallback)')
  assert.equal(r.backend.name, 'deepseek', 'llamacpp darf bei gehaltenem Lock nicht gewaehlt werden')
})

test('resolveModel: lmstudio drainet ebenfalls', () => {
  _testSeed({ lock: { held: true, drainingKinds: ['llamacpp', 'lmstudio'] }, backends: [
    { name: 'lmstudio-local', priority: 1, healthy: true, draining: true, models: ['m'] },
    { name: 'deepseek', priority: 2, healthy: true, models: ['deepseek-chat'] },
  ] })
  const r = resolveModel('m', () => [backendLmstudio, backendRemote])
  assert.ok(r)
  assert.equal(r.backend.name, 'deepseek')
})

test('resolveModel: ohne Lock wird das lokale Backend gewaehlt', () => {
  _testSeed({ lock: { held: false, drainingKinds: [] }, backends: [
    { name: 'llamacpp-gemma', priority: 1, healthy: true, models: ['gpt-oss-20b'] },
    { name: 'deepseek', priority: 2, healthy: true, models: ['deepseek-chat'] },
  ] })
  const r = resolveModel('gpt-oss-20b', () => [backendLlamacpp, backendRemote])
  assert.ok(r)
  assert.equal(r.backend.name, 'llamacpp-gemma')
})

// ── Draining erzeugt keine unhealthy-Zeile ─────────────────────────────────

test('draining darf nicht als unhealthy gemeldet werden', () => {
  // evaluateReadiness mit gehaltenem Lock: drainende Backends erscheinen NICHT
  // in degraded und der Proxy bleibt ready (Fallback bedient).
  return import('./discovery.mjs').then(async (mod) => {
    _testSeed({ lock: { held: true, drainingKinds: ['llamacpp'] }, backends: [
      { name: 'llamacpp-gemma', priority: 1, healthy: true, draining: true, models: ['gpt-oss-20b'] },
      { name: 'deepseek', priority: 2, healthy: true, models: ['deepseek-chat'] },
    ] })
    const r = mod.evaluateReadiness(() => [backendLlamacpp, backendRemote])
    assert.equal(r.ready, true, '/health bleibt gruen, solange ein Backend bedienen kann')
    assert.ok(!r.degraded.some((d) => d.name === 'llamacpp-gemma'),
      'drainende Backends sind nicht degraded (kein unhealthy-Gesicht)')
  })
})

test('/health ist nicht ready, wenn alle Prio-1-Backends drainen UND der Fallback tot ist', () => {
  return import('./discovery.mjs').then(async (mod) => {
    _testSeed({ lock: { held: true, drainingKinds: ['llamacpp'] }, backends: [
      { name: 'llamacpp-gemma', priority: 1, healthy: true, draining: true, models: ['gpt-oss-20b'] },
      { name: 'deepseek', priority: 2, healthy: false, models: [] },
    ] })
    const r = mod.evaluateReadiness(() => [
      backendLlamacpp,
      { name: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', kind: 'openai-remote', priority: 2 },
    ])
    assert.equal(r.ready, false,
      'ohne bedienbares Backend ist /health nicht ready — drainende Backends allein taugen nicht')
  })
})

// ── findExclusiveConflict: externer Eintrag ────────────────────────────────

test('findExclusiveConflict meldet den externen Studio-Eintrag als Gruppenmitglied', () => {
  const doc = parseLoadouts(`{
    "version": 1,
    "modelRoots": ["~/models/gguf"],
    "defaults": {"host": "0.0.0.0"},
    "loadouts": [
      {"slug": "gptoss-context", "label": "gpt-oss", "model": "gptoss20/gpt-oss-20b-Q8_0.gguf",
       "port": 8098, "fit": {"enabled": true, "targetMarginMib": 2400, "minCtx": 32768},
       "args": {}, "speculative": {}, "mcp": {}, "extraArgs": [], "exclusiveGroup": "chat-gpu"},
      {"slug": "unsloth-studio", "label": "Unsloth Studio", "model": "unsloth/inference",
       "port": 45013, "fit": {"enabled": true, "targetMarginMib": 0, "minCtx": 4096},
       "args": {}, "speculative": {}, "mcp": {}, "extraArgs": [], "exclusiveGroup": "chat-gpu",
       "managed": "external"}
    ]
  }`)
  const conflict = findExclusiveConflict(doc, 'gptoss-context', ['unsloth-studio'])
  assert.ok(conflict, 'externer Eintrag muss als Gruppenkonflikt gemeldet werden')
  assert.equal(conflict.conflictSlug, 'unsloth-studio')
  assert.equal(conflict.group, 'chat-gpu')
})

test('loadouts.mjs akzeptiert managed=external als gueltiges Feld', () => {
  const doc = parseLoadouts(`{
    "version": 1,
    "modelRoots": ["~/models/gguf"],
    "defaults": {"host": "0.0.0.0"},
    "loadouts": [
      {"slug": "unsloth-studio", "label": "Studio", "model": "unsloth/inference",
       "port": 45013, "fit": {"enabled": true, "targetMarginMib": 0, "minCtx": 4096},
       "args": {}, "speculative": {}, "mcp": {}, "extraArgs": [],
       "exclusiveGroup": "chat-gpu", "managed": "external"}
    ]
  }`)
  assert.equal(doc.loadouts[0].managed, 'external')
})
