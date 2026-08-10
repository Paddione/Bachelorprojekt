// scripts/llm-proxy/respond.mjs
// T003277 — die beiden Antwortpfade von proxyV1, aus server.mjs herausgeloest.
//
// Herausgeloest aus zwei Gruenden: server.mjs lag bei 665 von 800 Zeilen und
// haette mit dem Mitschnitt seine Schwelle erreicht, und der Stream-Tap ist so
// ohne laufenden Server pruefbar.
//
// DER STREAM-PFAD IST DIE HEIKLE STELLE. server.mjs kommentierte die Trennung
// beider Pfade unter T002609 als Sicherheitsentscheidung: "ein zustandsbehafteter
// Scanner gehoert nicht in den Pfad, in dem ein Fehler die ganze Queue
// mitreisst" — die Queue ist serialisiert, ein Wurf dort riesse jeden wartenden
// Request mit. Der Sammler hier veraendert den Datenstrom nicht und haelt ihn
// nicht auf; jeder seiner Fehler endet in einer Logzeile.
import { Readable } from 'node:stream'
import { stripTurnMarkers } from './strip-markers.mjs'

/** Obergrenze des Stream-Sammlers. Darueber wird nur noch gezaehlt. */
const COLLECT_CAP_BYTES = 256 * 1024

/** Liest die Token-Zahlen aus einer OpenAI-kompatiblen Antwort. */
function usageOf(parsed) {
  const u = parsed?.usage
  return {
    promptTokens: Number.isFinite(u?.prompt_tokens) ? u.prompt_tokens : null,
    completionTokens: Number.isFinite(u?.completion_tokens) ? u.completion_tokens : null,
  }
}

/**
 * Gepufferter Pfad: die Antwort wird ganz gelesen, vom Turn-Marker befreit und
 * am Stueck ausgeliefert. Verhalten unveraendert gegenueber der Fassung in
 * server.mjs — nur der capture-Aufruf ist neu.
 *
 * @param {{res: object, upstream: object, passHeaders: object,
 *          capture?: (r: object) => void, meta?: object}} args
 */
export async function respondBuffered({ res, upstream, passHeaders, capture, meta = {} }) {
  const raw = await upstream.text()
  let out = raw
  let parsed = null
  try {
    parsed = JSON.parse(raw)
    out = JSON.stringify(stripTurnMarkers(parsed))
  } catch {
    // Kein JSON oder abgeschnitten: unveraendert durchreichen. Der Marker ist
    // ein Schoenheitsfehler, eine verschluckte Antwort waere ein Ausfall.
  }
  passHeaders['content-length'] = String(Buffer.byteLength(out))
  res.writeHead(upstream.status, passHeaders)
  res.end(out)

  // Nach dem Ausliefern: der Mitschnitt darf die Antwort nicht verzoegern.
  try {
    capture?.({
      ...meta,
      httpStatus: upstream.status,
      responseBody: out,
      streamed: false,
      streamIncomplete: false,
      ...usageOf(parsed),
    })
  } catch (err) {
    console.error(`[respond] capture verworfen: ${err.message}`)
  }
}

/**
 * Stream-Pfad: die Antwort wird roh weitergereicht, ein passiver Sammler liest
 * mit.
 *
 * Der Sammler haengt als 'data'-Listener am selben Readable wie der Pipe —
 * bewusst kein PassThrough dazwischen: ein zweites Ziel mit eigenem Puffer
 * erzeugte Rueckstau auf den Upstream und damit genau die Rueckwirkung auf den
 * Transport, die hier ausgeschlossen sein muss. Der Listener wird VOR dem Pipe
 * angehaengt, damit im selben Tick kein Chunk an ihm vorbeilaeuft.
 *
 * @param {{res: object, upstream: object, passHeaders: object, backendName: string,
 *          capture?: (r: object) => void, meta?: object}} args
 */
export function respondStreamed({ res, upstream, passHeaders, backendName, capture, meta = {} }) {
  res.writeHead(upstream.status, passHeaders)
  if (!upstream.body) {
    res.end()
    try {
      capture?.({ ...meta, httpStatus: upstream.status, responseBody: null, streamed: true, streamIncomplete: false })
    } catch (err) { console.error(`[respond] capture verworfen: ${err.message}`) }
    return
  }

  const upstreamStream = Readable.fromWeb(upstream.body)

  const chunks = []
  let collected = 0
  let totalBytes = 0
  let finished = false

  const finalize = (streamIncomplete) => {
    if (finished) return
    finished = true
    try {
      const body = Buffer.concat(chunks).toString('utf8')
      capture?.({
        ...meta,
        httpStatus: upstream.status,
        responseBody: body,
        streamed: true,
        streamIncomplete,
        // Der Sammler kappt bei COLLECT_CAP_BYTES; sagt es, statt den Rest
        // stillschweigend fehlen zu lassen.
        collectedBytes: collected,
        streamBytes: totalBytes,
      })
    } catch (err) {
      console.error(`[respond] capture verworfen: ${err.message}`)
    }
  }

  upstreamStream.on('data', (chunk) => {
    try {
      totalBytes += chunk.length
      if (collected < COLLECT_CAP_BYTES) {
        chunks.push(chunk)
        collected += chunk.length
      }
    } catch (err) {
      // Der Sammler darf den Strom unter keinen Umstaenden aufhalten.
      console.error(`[respond] Sammler uebersprungen: ${err.message}`)
    }
  })

  upstreamStream.on('error', (err) => {
    console.error(`[stream-error] ${backendName}: ${err.message}`)
    // Zeile trotzdem schreiben: eine fehlende Zeile waere von "dieser Dispatch
    // fand nie statt" nicht zu unterscheiden.
    finalize(true)
    res.destroy()
  })

  upstreamStream.on('end', () => {
    // Eine vollstaendige OpenAI-SSE-Antwort endet mit dem [DONE]-Sentinel.
    // Fehlt er, brach der Upstream ab, ohne ein Fehlerereignis zu senden.
    const tail = Buffer.concat(chunks.slice(-2)).toString('utf8')
    const looksComplete = !meta.expectsSse || tail.includes('[DONE]')
    finalize(!looksComplete)
  })

  res.on('error', () => {})
  upstreamStream.pipe(res)
}
