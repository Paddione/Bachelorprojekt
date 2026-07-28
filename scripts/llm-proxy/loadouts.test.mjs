// scripts/llm-proxy/loadouts.test.mjs
// Reine Validierungs- und Round-Trip-Tests. Kein Dateisystem ausser tmpdir.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseLoadouts, readLoadouts, writeLoadouts, findLoadout } from './loadouts.mjs'

const valid = {
  version: 1,
  modelRoots: ['~/models/gguf'],
  defaults: { host: '0.0.0.0' },
  loadouts: [{
    slug: 'gptoss-context',
    label: 'gpt-oss-20b',
    model: 'gptoss20/gpt-oss-20b-Q8_0.gguf',
    port: 8098,
    fit: { enabled: true, targetMarginMib: 2400, minCtx: 32768 },
    args: { ctx: null, ngl: null, parallel: 1, cacheTypeK: 'q8_0', cacheTypeV: 'q8_0',
            loadMode: 'mmap', flashAttention: true, jinja: true, metrics: true,
            reasoning: 'auto', reasoningBudget: null },
    speculative: { draftHfRepo: null, draftNgl: null },
    mcp: { serversConfig: null },
    extraArgs: [],
  }],
}

test('parseLoadouts: gueltiges Dokument kommt unveraendert zurueck', () => {
  const doc = parseLoadouts(JSON.stringify(valid))
  assert.equal(doc.loadouts.length, 1)
  assert.equal(doc.loadouts[0].slug, 'gptoss-context')
})

test('parseLoadouts: ctx null bleibt null und wird NICHT zu 0', () => {
  const doc = parseLoadouts(JSON.stringify(valid))
  assert.equal(doc.loadouts[0].args.ctx, null)
  assert.notEqual(doc.loadouts[0].args.ctx, 0)
})

test('parseLoadouts: doppelter Slug wird abgelehnt', () => {
  const bad = structuredClone(valid)
  bad.loadouts.push(structuredClone(valid.loadouts[0]))
  assert.throws(() => parseLoadouts(JSON.stringify(bad)), /slug.*gptoss-context/i)
})

test('parseLoadouts: fit.enabled=false ohne ctx wird abgelehnt', () => {
  const bad = structuredClone(valid)
  bad.loadouts[0].fit.enabled = false
  assert.throws(() => parseLoadouts(JSON.stringify(bad)), /fit/i)
})

test('parseLoadouts: fit.enabled=false mit ctx und ngl ist gueltig', () => {
  const ok = structuredClone(valid)
  ok.loadouts[0].fit.enabled = false
  ok.loadouts[0].args.ctx = 32768
  ok.loadouts[0].args.ngl = 24
  const doc = parseLoadouts(JSON.stringify(ok))
  assert.equal(doc.loadouts[0].args.ctx, 32768)
})

test('parseLoadouts: unbekanntes Feld im Loadout wird abgelehnt', () => {
  const bad = structuredClone(valid)
  bad.loadouts[0].bogusField = 1
  assert.throws(() => parseLoadouts(JSON.stringify(bad)), /bogusField/)
})

test('parseLoadouts: ungueltiger Slug wird abgelehnt', () => {
  const bad = structuredClone(valid)
  bad.loadouts[0].slug = 'Bad Slug!'
  assert.throws(() => parseLoadouts(JSON.stringify(bad)), /slug/i)
})

test('parseLoadouts: kaputtes JSON meldet Klartext', () => {
  assert.throws(() => parseLoadouts('{ nope'), /JSON/i)
})

test('Round-Trip lesen -> schreiben -> lesen ist idempotent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'loadouts-'))
  const p = join(dir, 'loadouts.json')
  writeFileSync(p, JSON.stringify(valid, null, 2))
  const first = readLoadouts(p)
  writeLoadouts(first.doc, p, first.mtimeMs)
  const second = readLoadouts(p)
  assert.deepEqual(second.doc, first.doc)
})

test('writeLoadouts: mtime-Konflikt wird abgelehnt', () => {
  const dir = mkdtempSync(join(tmpdir(), 'loadouts-'))
  const p = join(dir, 'loadouts.json')
  writeFileSync(p, JSON.stringify(valid, null, 2))
  const { doc } = readLoadouts(p)
  assert.throws(() => writeLoadouts(doc, p, 1), /geaendert|conflict/i)
})

test('findLoadout findet per Slug und liefert undefined sonst', () => {
  const doc = parseLoadouts(JSON.stringify(valid))
  assert.equal(findLoadout(doc, 'gptoss-context').port, 8098)
  assert.equal(findLoadout(doc, 'ghost'), undefined)
})

test('parseLoadouts: model path mit .. wird abgelehnt', () => {
  const bad = structuredClone(valid)
  bad.loadouts[0].model = '../../etc/passwd'
  assert.throws(() => parseLoadouts(JSON.stringify(bad)), /\.\./)
})
