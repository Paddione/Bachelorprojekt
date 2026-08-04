// scripts/llm-proxy/discovery-probe-auth.test.mjs
// [T002638] Der Health-Probe muss das Credential des Backends fuehren.
//
// Pruefmodus: command output verification [T002448-M4] — der Test startet
// einen echten HTTP-Server, der sich wie eine API mit Pflicht-Auth verhaelt
// (401 ohne Bearer, 200 mit), und misst den Rueckgabewert von probeBackend.
// Kein Grep auf die Implementierung: dass der Header im Quelltext steht,
// belegt nicht, dass er auch auf der Leitung ankommt.
//
// Run: node --test scripts/llm-proxy/discovery-probe-auth.test.mjs
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { probeBackend, startDiscovery } from './discovery.mjs'

const TOKEN = 'test-token-T002638'
let server
let baseUrl
/** Was der Server tatsaechlich als Authorization gesehen hat — pro Aufruf. */
let seenAuth = []

before(async () => {
  server = createServer((req, res) => {
    seenAuth.push(req.headers.authorization ?? null)
    if (req.headers.authorization !== `Bearer ${TOKEN}`) {
      res.writeHead(401, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'unauthorized' }))
      return
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ data: [{ id: 'remote-model-1' }] }))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}/v1`
})

after(() => new Promise((resolve) => server.close(resolve)))

const remoteBackend = (apiKeyEnv) => ({
  name: 'remote-under-test', kind: 'openai-remote', baseUrl,
  apiKeyEnv, enabled: true, priority: 2, fixups: [], modelAliases: {}, maxInflight: 1,
})

test('Positiv-Anker: mit gesetztem Key ist das Backend healthy und liefert seinen Katalog', async () => {
  process.env.T002638_TEST_KEY = TOKEN
  seenAuth = []
  const r = await probeBackend(remoteBackend('T002638_TEST_KEY'))
  assert.equal(r.healthy, true)
  assert.deepEqual(r.models, ['remote-model-1'])
  // Der Header kam wirklich an — nicht nur "der Aufruf ging irgendwie durch".
  assert.deepEqual(seenAuth, [`Bearer ${TOKEN}`])
  delete process.env.T002638_TEST_KEY
})

test('ohne gesetzten Key bleibt das Backend unhealthy — der 401 wird nicht als healthy fehlgedeutet', async () => {
  delete process.env.T002638_TEST_KEY
  seenAuth = []
  const r = await probeBackend(remoteBackend('T002638_TEST_KEY'))
  assert.equal(r.healthy, false)
  assert.deepEqual(r.models, [])
  assert.deepEqual(seenAuth, [null])
})

test('Backend ohne apiKeyEnv sendet keinen Authorization-Header (lokale llama.cpp-Server)', async () => {
  seenAuth = []
  // Der lokale Fall darf sich nicht aendern: llama.cpp verlangt keinen Token,
  // ein leerer "Bearer " waere dort eine unnoetige Verhaltensaenderung.
  const r = await probeBackend({ ...remoteBackend(null), kind: 'llamacpp' })
  assert.equal(r.healthy, false) // der Test-Server antwortet ohne Auth mit 401
  assert.deepEqual(seenAuth, [null])
})

// ── Diagnose: der Grund des Fehlschlags ist sichtbar, aber nicht wiederholt ──
// Bis T002638 verwarf das catch{} in probeBackend jeden Grund. 401, Timeout und
// DNS-Fehler ergaben denselben stummen Zustand — deshalb konnte ein fehlender
// Header monatelang wie ein totes Backend aussehen.

/** Faengt console.warn fuer die Dauer von fn ab und gibt die Zeilen zurueck. */
async function captureWarnings(fn) {
  const original = console.warn
  const lines = []
  console.warn = (...args) => lines.push(args.join(' '))
  try { await fn() } finally { console.warn = original }
  return lines
}

test('der Uebergang nach unhealthy nennt Backend und Statuscode — genau einmal', async () => {
  delete process.env.T002638_TEST_KEY // -> Server antwortet 401
  const backend = { ...remoteBackend('T002638_TEST_KEY'), name: 'transition-probe' }

  const lines = await captureWarnings(async () => {
    // Grosses Intervall: der Timer soll waehrend des Tests nicht selbst feuern,
    // getickt wird ausschliesslich ueber das zurueckgegebene probeNow.
    const { timer, probeNow } = startDiscovery(() => [backend], 3_600_000)
    await probeNow()
    clearInterval(timer)
  })

  const mine = lines.filter((l) => l.includes('transition-probe'))
  assert.equal(mine.length, 1, `erwartet genau eine Zeile, erhalten: ${JSON.stringify(mine)}`)
  assert.match(mine[0], /401/)
  assert.match(mine[0], /unhealthy/)
})

test('ein bereits unhealthy Backend wiederholt seine Zeile nicht', async () => {
  delete process.env.T002638_TEST_KEY
  const backend = { ...remoteBackend('T002638_TEST_KEY'), name: 'repeat-probe' }

  // Erster Durchlauf: der Uebergang wird gemeldet (Positiv-Anker — ohne ihn
  // waere die Nicht-Wiederholung unten vakuos erfuellt, weil nie etwas kam).
  const first = await captureWarnings(async () => {
    const { timer, probeNow } = startDiscovery(() => [backend], 3_600_000)
    await probeNow()
    clearInterval(timer)
  })
  assert.equal(first.filter((l) => l.includes('repeat-probe')).length, 1)

  // Zweiter Durchlauf auf demselben Zustand: keine weitere Zeile.
  const second = await captureWarnings(async () => {
    const { timer, probeNow } = startDiscovery(() => [backend], 3_600_000)
    await probeNow()
    clearInterval(timer)
  })
  assert.deepEqual(second.filter((l) => l.includes('repeat-probe')), [])
})
