// scripts/llm-proxy/strip-markers.test.mjs
// stripTurnMarkers — entfernt Chat-Template-Turn-Marker aus dem content von
// Non-Streaming-Antworten. [T002609]
//
// Pruefmodus: command output verification — die Funktion wird AUFGERUFEN und
// ihr Rueckgabewert geprueft.
//
// Die Fixtures sind die real gemessenen Antworten aus dem Ticket (gemma9-factory
// auf :8092, temperature 0), keine erfundenen.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stripTurnMarkers } from './strip-markers.mjs'

const answer = (content, extra = {}) => ({
  choices: [{ message: { role: 'assistant', content, ...extra }, finish_reason: 'stop' }],
})

test('Marker wird aus einer Klartext-Antwort entfernt', () => {
  // Positiv-Anker zuerst (T002356-M1): eine markerfreie Antwort kommt
  // unveraendert durch. Waere das schon kaputt, sagte die Aussage darunter nichts.
  const clean = answer('Paris')
  assert.equal(stripTurnMarkers(clean).choices[0].message.content, 'Paris')

  // Die real gemessenen Faelle aus T002609.
  assert.equal(stripTurnMarkers(answer('Ja<|message_sep|>')).choices[0].message.content, 'Ja')
  assert.equal(
    stripTurnMarkers(answer('Paris<|message_sep|>')).choices[0].message.content, 'Paris')
  assert.equal(
    stripTurnMarkers(answer('2 + 2 = 4<|message_sep|>')).choices[0].message.content, '2 + 2 = 4')
})

test('role_sep wird ebenfalls entfernt', () => {
  assert.equal(
    stripTurnMarkers(answer('Hallo<|role_sep|>')).choices[0].message.content, 'Hallo')
})

test('Tool-Call-Antworten bleiben unangetastet', () => {
  // Der peg-Parser konsumiert den Marker bereits: content ist leer, tool_calls
  // sind gefuellt. Gemessen in T002609. Hier darf nichts verlorengehen.
  const tc = [{ type: 'function', id: 'abc', function: { name: 'get_weather', arguments: '{"city": "Berlin"}' } }]
  const payload = {
    choices: [{ message: { role: 'assistant', content: '', tool_calls: tc }, finish_reason: 'tool_calls' }],
  }
  const out = stripTurnMarkers(payload)
  assert.deepEqual(out.choices[0].message.tool_calls, tc)
  assert.equal(out.choices[0].message.content, '')
  assert.equal(out.choices[0].finish_reason, 'tool_calls')
})

test('Antwort ohne Marker bleibt strukturell unveraendert', () => {
  const payload = answer('Paris', { refusal: null })
  assert.deepEqual(stripTurnMarkers(payload), payload)
})

test('mehrere choices werden alle behandelt', () => {
  const payload = {
    choices: [
      { message: { content: 'Ja<|message_sep|>' }, finish_reason: 'stop' },
      { message: { content: 'Nein<|message_sep|>' }, finish_reason: 'stop' },
    ],
  }
  const out = stripTurnMarkers(payload)
  assert.equal(out.choices[0].message.content, 'Ja')
  assert.equal(out.choices[1].message.content, 'Nein')
})

test('unerwartete Formen werfen nicht', () => {
  // Der Marker ist ein Schoenheitsfehler; eine geworfene Ausnahme im
  // Auslieferungspfad waere ein Ausfall. Alles Unerwartete geht unveraendert
  // durch.
  assert.doesNotThrow(() => stripTurnMarkers({}))
  assert.doesNotThrow(() => stripTurnMarkers({ choices: [] }))
  assert.doesNotThrow(() => stripTurnMarkers({ choices: [{}] }))
  assert.doesNotThrow(() => stripTurnMarkers({ choices: [{ message: {} }] }))
  assert.doesNotThrow(() => stripTurnMarkers({ choices: [{ message: { content: null } }] }))
  assert.doesNotThrow(() => stripTurnMarkers(null))
})
