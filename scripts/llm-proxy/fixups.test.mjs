// scripts/llm-proxy/fixups.test.mjs
// Prueft das Ergebnis der Fixup-Funktionen (transformierter Body), nicht deren Implementierung.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fillMissingArrayItems, applyFixups, FIXUPS } from './fixups.mjs'

// Reproduktion des Fehlers, gegen den dieser Fixup gebaut ist:
// gpt-oss-20b bricht mit HTTP 500 ab ("Function is not a bool value"), wenn ein
// Tool-Schema `type: "array"` ohne `items` enthaelt — das Jinja-Template liest
// dann die gebundene Dict-Methode `.items` statt eines Wertes.
const toolWithBareArray = (props) => ({
  messages: [{ role: 'user', content: 'hi' }],
  tools: [{ type: 'function', function: { name: 't', parameters: { type: 'object', properties: props } } }],
})
const propsOf = (body) => body.tools[0].function.parameters.properties

test('array ohne items bekommt ein leeres items-Objekt', () => {
  const out = fillMissingArrayItems(toolWithBareArray({ xs: { type: 'array' } }))
  assert.deepEqual(propsOf(out).xs.items, {}, 'items muss ergaenzt werden')
})

test('vorhandenes items bleibt unveraendert', () => {
  const orig = { xs: { type: 'array', items: { type: 'string' } } }
  const out = fillMissingArrayItems(toolWithBareArray(orig))
  assert.deepEqual(propsOf(out).xs.items, { type: 'string' }, 'items darf nicht ueberschrieben werden')
})

test('verschachtelte arrays werden ebenfalls erfasst', () => {
  const out = fillMissingArrayItems(toolWithBareArray({
    outer: { type: 'array', items: { type: 'object', properties: { inner: { type: 'array' } } } },
  }))
  assert.deepEqual(propsOf(out).outer.items.properties.inner.items, {}, 'auch verschachtelt')
})

test('nicht-array-Typen bleiben unberuehrt', () => {
  const out = fillMissingArrayItems(toolWithBareArray({ s: { type: 'string' } }))
  assert.equal('items' in propsOf(out).s, false, 'string darf kein items bekommen')
})

test('Body ohne tools wird unveraendert durchgereicht', () => {
  const body = { messages: [{ role: 'user', content: 'hi' }] }
  assert.equal(fillMissingArrayItems(body), body, 'ohne tools identische Referenz')
})

test('Eingabe wird nicht mutiert', () => {
  const input = toolWithBareArray({ xs: { type: 'array' } })
  fillMissingArrayItems(input)
  assert.equal('items' in propsOf(input).xs, false, 'Original muss unangetastet bleiben')
})

test('Fixup ist unter seinem Namen registriert und ueber applyFixups erreichbar', () => {
  // Positiv-Anker: ohne Registrierung waere der Name unbekannt und applyFixups
  // wuerde den Body unveraendert zurueckgeben — der Test darf nicht vakuos bestehen.
  assert.equal(typeof FIXUPS['fill-missing-array-items'], 'function', 'muss in FIXUPS stehen')
  const out = applyFixups(['fill-missing-array-items'], toolWithBareArray({ xs: { type: 'array' } }))
  assert.deepEqual(propsOf(out).xs.items, {}, 'ueber applyFixups angewandt')
})
