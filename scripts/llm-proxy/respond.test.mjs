// scripts/llm-proxy/respond.test.mjs
// T003277 — die beiden Antwortpfade samt Mitschnitt.
//
// Pruefmodus: Output-/Resultatsverifikation [T002448-M4] gegen einen echten
// Fake-Backend-Server. Geprueft wird, was beim Client ankommt und was der
// Mitschnitt erhaelt — nicht, welche Zeichenketten im Quelltext stehen.
//
// Der wichtigste Fall steht unten: bricht das Backend mitten im Stream ab,
// muss der Client seinen Teil behalten, der naechste Request noch bedient
// werden und die Zeile als unvollstaendig markiert sein. Ein Mitschnitt, der
// den Transport beschaedigt, waere schlimmer als gar keiner.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { respondBuffered, respondStreamed } from './respond.mjs'

/** Startet einen Server und gibt seine Basis-URL zurueck. */
async function listen(handler) {
  const server = http.createServer(handler)
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const { port } = server.address()
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) }
}

/** Fake-Backend: streamt `chunks`; bei `abortAfter` bricht es die Verbindung ab. */
function streamingBackend({ chunks, abortAfter = null }) {
  return async (req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    for (let i = 0; i < chunks.length; i++) {
      if (abortAfter !== null && i === abortAfter) {
        // Verbindung hart schliessen — wie ein abgestuerztes Backend.
        res.socket.destroy()
        return
      }
      res.write(chunks[i])
      await new Promise((r) => setTimeout(r, 5))
    }
    res.end()
  }
}

test('gepufferter Pfad: Antwort kommt unveraendert an und wird erfasst', async () => {
  const payload = { choices: [{ message: { content: 'hallo' } }], usage: { prompt_tokens: 11, completion_tokens: 3 } }
  const backend = await listen((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(payload))
  })
  const captured = []
  const proxy = await listen(async (req, res) => {
    const upstream = await fetch(backend.url, { method: 'POST' })
    await respondBuffered({
      res, upstream, passHeaders: { 'content-type': 'application/json' },
      capture: (r) => captured.push(r), meta: { backend: 'fake', requestBody: '{}' },
    })
  })

  const got = await (await fetch(proxy.url, { method: 'POST' })).json()

  assert.deepEqual(got.choices, payload.choices, 'der Client bekommt die Antwort des Backends')
  assert.equal(captured.length, 1, 'genau ein Mitschnitt')
  assert.equal(captured[0].streamed, false)
  assert.equal(captured[0].httpStatus, 200)
  assert.equal(captured[0].promptTokens, 11, 'Token-Zahlen aus usage uebernommen')
  assert.equal(captured[0].completionTokens, 3)
  assert.ok(captured[0].responseBody.includes('hallo'), 'der Antworttext steht im Mitschnitt')

  await proxy.close(); await backend.close()
})

test('Stream-Pfad: der Client bekommt byte-identisch dieselben Daten', async () => {
  const chunks = ['data: a\n\n', 'data: b\n\n', 'data: [DONE]\n\n']
  const backend = await listen(streamingBackend({ chunks }))
  const captured = []
  const proxy = await listen(async (req, res) => {
    const upstream = await fetch(backend.url, { method: 'POST' })
    respondStreamed({
      res, upstream, passHeaders: {}, backendName: 'fake',
      capture: (r) => captured.push(r), meta: { backend: 'fake', expectsSse: true },
    })
  })

  const text = await (await fetch(proxy.url, { method: 'POST' })).text()

  assert.equal(text, chunks.join(''), 'der Sammler veraendert den Strom nicht')
  // Der Mitschnitt wird beim 'end' des Upstream geschrieben — kurz warten.
  await new Promise((r) => setTimeout(r, 50))
  assert.equal(captured.length, 1)
  assert.equal(captured[0].streamed, true)
  assert.equal(captured[0].streamIncomplete, false, 'mit [DONE] gilt der Strom als vollstaendig')
  assert.equal(captured[0].responseBody, chunks.join(''), 'der Mitschnitt traegt den zusammengesetzten Strom')

  await proxy.close(); await backend.close()
})

test('Backend bricht mitten im Stream ab: Teil bleibt, Zeile ist markiert, naechster Request laeuft', async () => {
  const chunks = ['data: eins\n\n', 'data: zwei\n\n', 'data: [DONE]\n\n']
  let abort = true
  const backend = await listen(async (req, res) => {
    if (abort) return streamingBackend({ chunks, abortAfter: 1 })(req, res)
    return streamingBackend({ chunks })(req, res)
  })
  const captured = []
  const proxy = await listen(async (req, res) => {
    const upstream = await fetch(backend.url, { method: 'POST' })
    respondStreamed({
      res, upstream, passHeaders: {}, backendName: 'fake',
      capture: (r) => captured.push(r), meta: { backend: 'fake', expectsSse: true },
    })
  })

  // 1) Abgebrochener Strom — der Client behaelt, was schon ankam.
  let received = ''
  try {
    const resp = await fetch(proxy.url, { method: 'POST' })
    received = await resp.text()
  } catch {
    // Ein Transportabbruch beim Lesen ist zulaessig; entscheidend ist, dass der
    // Prozess lebt und der Mitschnitt geschrieben wurde.
  }
  await new Promise((r) => setTimeout(r, 80))

  assert.ok(received.startsWith('data: eins') || received === '',
    'der bereits gelieferte Teil ist nicht verfaelscht')
  assert.equal(captured.length, 1, 'auch der abgebrochene Dispatch hinterlaesst eine Zeile')
  assert.equal(captured[0].streamIncomplete, true,
    'die Zeile weist den Abbruch aus, statt zu fehlen — eine fehlende Zeile waere von '
    + '"dieser Dispatch fand nie statt" nicht zu unterscheiden')

  // 2) Der naechste Request wird normal bedient — nichts ist haengen geblieben.
  abort = false
  const zweiter = await (await fetch(proxy.url, { method: 'POST' })).text()
  assert.equal(zweiter, chunks.join(''), 'nach dem Abbruch laeuft der Verkehr weiter')

  await proxy.close(); await backend.close()
})

test('ein werfender capture-Aufruf beschaedigt den Transport nicht', async () => {
  const chunks = ['data: x\n\n', 'data: [DONE]\n\n']
  const backend = await listen(streamingBackend({ chunks }))
  const proxy = await listen(async (req, res) => {
    const upstream = await fetch(backend.url, { method: 'POST' })
    respondStreamed({
      res, upstream, passHeaders: {}, backendName: 'fake',
      capture: () => { throw new Error('Mitschnitt kaputt') }, meta: { expectsSse: true },
    })
  })

  const text = await (await fetch(proxy.url, { method: 'POST' })).text()

  assert.equal(text, chunks.join(''), 'der Client merkt vom kaputten Mitschnitt nichts')

  await proxy.close(); await backend.close()
})

test('Stream ohne [DONE] gilt als unvollstaendig', async () => {
  const chunks = ['data: nur-das\n\n']
  const backend = await listen(streamingBackend({ chunks }))
  const captured = []
  const proxy = await listen(async (req, res) => {
    const upstream = await fetch(backend.url, { method: 'POST' })
    respondStreamed({
      res, upstream, passHeaders: {}, backendName: 'fake',
      capture: (r) => captured.push(r), meta: { expectsSse: true },
    })
  })

  await (await fetch(proxy.url, { method: 'POST' })).text()
  await new Promise((r) => setTimeout(r, 50))

  // Positiv-Anker [T002356-M1]: erst belegen, dass ueberhaupt erfasst wurde.
  assert.equal(captured.length, 1, 'Anker: ein Mitschnitt ist entstanden')
  assert.equal(captured[0].streamIncomplete, true)

  await proxy.close(); await backend.close()
})
