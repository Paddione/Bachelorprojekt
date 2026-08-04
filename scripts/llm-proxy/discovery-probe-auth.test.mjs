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
import { probeBackend } from './discovery.mjs'

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
