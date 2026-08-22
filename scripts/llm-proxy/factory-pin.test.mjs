import { test } from 'node:test'
import assert from 'node:assert/strict'
import { factoryModel, factoryLocked, parseLoadouts, serializeLoadouts } from './loadouts.mjs'

const loadout = { slug: 'local', label: 'Local', model: 'local.gguf', port: 8091,
  fit: { enabled: true }, args: { ctx: null, ngl: null } }
const base = { version: 1, modelRoots: [], loadouts: [loadout] }

test('factory reader defaults are optional and unlocked', () => {
  const doc = parseLoadouts(JSON.stringify(base))
  assert.equal(factoryModel(doc), null)
  assert.equal(factoryLocked(doc), false)
})

test('factory reader returns a validated pin', () => {
  const doc = parseLoadouts(JSON.stringify({ ...base, factory: { model: 'local', locked: true } }))
  assert.equal(factoryModel(doc), 'local')
  assert.equal(factoryLocked(doc), true)
  assert.equal(serializeLoadouts(doc), `${JSON.stringify(doc, null, 2)}\n`)
})

test('factory rejects unknown fields and non-boolean locks', () => {
  assert.throws(() => parseLoadouts(JSON.stringify({ ...base, factory: { model: 'local', tier: 'flash' } })), /tier/)
  assert.throws(() => parseLoadouts(JSON.stringify({ ...base, factory: { model: 'local', locked: 'true' } })), /Boolean/)
})
