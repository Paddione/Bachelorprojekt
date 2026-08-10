// scripts/llm-proxy/request-log.test.mjs
// T003277 — Mitschnitt der Dispatches am Proxy.
//
// Pruefmodus: Output-/Resultatsverifikation [T002448-M4]. Geprueft wird, was
// capture()/flush() tatsaechlich an den Schreibweg uebergeben und was truncate()
// zurueckliefert — nicht, welche Zeichenketten im Quelltext stehen.
//
// Der Schreibweg wird injiziert, damit die Tests ohne Cluster laufen: in
// Produktion ist er `kubectl exec -i <pod> -- psql` (factory_psql), hier ein
// Sammler. Das ist der Grund, warum das Modul als Fabrik gebaut ist.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequestLog, truncate, LIMIT_BYTES } from './request-log.mjs'

const row = (i) => ({ backend: 'b', subpath: 'chat/completions', httpStatus: 200, requestBody: `req${i}`, responseBody: `res${i}` })

/** Sammelt die Aufrufe des Schreibwegs, statt in eine Datenbank zu schreiben. */
function collector() {
  const calls = []
  return { calls, writer: async (rows) => { calls.push(rows) } }
}

test('truncate laesst einen Text unter dem Limit unveraendert', () => {
  const out = truncate('kurz', 1024)
  assert.equal(out.text, 'kurz')
  assert.equal(out.truncated, false)
  assert.equal(out.originalBytes, 4)
})

test('truncate kappt und meldet die Groesse VOR der Kappung', () => {
  const long = 'x'.repeat(5000)
  const out = truncate(long, 1000)
  assert.equal(out.truncated, true)
  assert.equal(out.originalBytes, 5000, 'original_bytes muss die ungekappte Groesse tragen')
  assert.ok(Buffer.byteLength(out.text) <= 1000, 'der gespeicherte Text haelt das Limit ein')
})

test('truncate zerreisst keine Mehrbyte-Zeichen', () => {
  // Bei byteweiser Kappung mitten in einer UTF-8-Sequenz entstuende U+FFFD.
  const text = 'ä'.repeat(100) // 2 Byte je Zeichen
  const out = truncate(text, 51) // ungerade Grenze, faellt mitten in ein Zeichen
  assert.equal(out.truncated, true)
  assert.ok(!out.text.includes('�'), 'kein Ersatzzeichen — die Kappung endet auf einer Zeichengrenze')
})

test('truncate schuetzt gegen null/undefined', () => {
  assert.equal(truncate(null, 100).text, null)
  assert.equal(truncate(null, 100).truncated, false)
})

test('LIMIT_BYTES ist die vereinbarte Obergrenze von 256 KiB', () => {
  assert.equal(LIMIT_BYTES, 256 * 1024)
})

test('viele Dispatches erzeugen EINEN Schreibvorgang', async () => {
  const { calls, writer } = collector()
  const log = createRequestLog({ writer })
  for (let i = 0; i < 20; i++) log.capture(row(i))
  assert.equal(log.pending(), 20, 'vor dem Flush liegen alle Zeilen im Puffer')

  await log.flush()

  assert.equal(calls.length, 1, 'genau ein Schreibvorgang fuer 20 Zeilen')
  assert.equal(calls[0].length, 20, 'alle Zeilen sind in diesem einen Vorgang enthalten')
  assert.equal(log.pending(), 0, 'der Puffer ist danach leer')
})

test('ein leerer Puffer loest keinen Schreibvorgang aus', async () => {
  const { calls, writer } = collector()
  const log = createRequestLog({ writer })
  await log.flush()
  assert.equal(calls.length, 0, 'ohne Zeilen wird der teure Schreibweg nicht angefasst')
})

test('ein fehlschlagender Schreibweg wirft nicht und laeuft nicht voll', async () => {
  const log = createRequestLog({ writer: async () => { throw new Error('kubectl weg') } })
  log.capture(row(1))

  await assert.doesNotReject(() => log.flush(), 'ein Fehler beim Schreiben darf nie propagieren')
  assert.equal(log.pending(), 0, 'die Zeilen werden verworfen, damit der Puffer nicht unbegrenzt waechst')
})

test('capture kappt uebergrosse Bodies und markiert die Zeile', async () => {
  const { calls, writer } = collector()
  const log = createRequestLog({ writer, limit: 100 })
  log.capture({ ...row(1), requestBody: 'y'.repeat(500) })

  await log.flush()

  const written = calls[0][0]
  assert.equal(written.truncated, true, 'die Zeile weist die Kappung aus')
  assert.equal(written.originalBytes, 500, 'und die Groesse vor der Kappung')
  assert.ok(Buffer.byteLength(written.requestBody) <= 100)
})

test('capture reicht die Korrelationsfelder unveraendert durch', async () => {
  const { calls, writer } = collector()
  const log = createRequestLog({ writer })
  log.capture({ ...row(1), slotId: 3, dispatchTicket: 'T003277', dispatchPartial: 'p2' })

  await log.flush()

  const written = calls[0][0]
  assert.equal(written.slotId, 3)
  assert.equal(written.dispatchTicket, 'T003277')
  assert.equal(written.dispatchPartial, 'p2')
})

test('fehlende Korrelationsfelder bleiben leer statt geraten zu werden', async () => {
  const { calls, writer } = collector()
  const log = createRequestLog({ writer })
  // Positiv-Anker [T002356-M1]: erst belegen, dass ueberhaupt eine Zeile entsteht —
  // sonst waere die Aussage "kein Wert gesetzt" ueber einer leeren Liste trivial wahr.
  log.capture(row(1))
  await log.flush()
  assert.equal(calls[0].length, 1, 'Anker: es wurde eine Zeile geschrieben')

  const written = calls[0][0]
  assert.equal(written.slotId, null)
  assert.equal(written.dispatchTicket, null)
  assert.equal(written.dispatchPartial, null)
})

test('stop() leert den Puffer ein letztes Mal', async () => {
  const { calls, writer } = collector()
  const log = createRequestLog({ writer, intervalMs: 60_000 })
  log.start()
  log.capture(row(1))

  await log.stop()

  assert.equal(calls.length, 1, 'beim Herunterfahren wird nicht verworfen, sondern geschrieben')
  assert.equal(calls[0].length, 1)
})
