// scripts/llm-proxy/request-log.mjs
// T003277 — Mitschnitt der Dispatches, die durch den Proxy laufen.
//
// Das Modul kennt weder `http` noch Request-Objekte: es nimmt fertige Zeilen
// entgegen, puffert sie und schreibt sie gebuendelt weg. Diese Schnittform ist
// der Grund, warum es ohne laufenden Server testbar ist — dieselbe Form wie
// fixups.mjs, models.mjs und slot-queue.mjs.
//
// ZWEI EIGENSCHAFTEN, DIE NICHT VERHANDELBAR SIND:
//
// 1. Rueckwirkungsfreiheit. capture() wird im Server NICHT awaited, und kein
//    Fehler von hier darf je zum Aufrufer propagieren. Faellt die Datenbank aus,
//    verliert der Proxy Mitschnitte und sonst nichts.
//
// 2. Buendelung. Der einzige Weg zur tickets-DB ist
//    `kubectl exec -i <pod> -- psql` (factory_psql in scripts/factory/lib.sh) —
//    ein Bash- UND ein kubectl-Spawn pro Aufruf. backends.mjs ertraegt das, weil
//    es alle 30 s einmal die Registry liest. Ein Insert je Dispatch legte einen
//    Prozessstart in den Anfragepfad; deshalb sammelt ein Timer und schreibt N
//    Zeilen mit EINEM Aufruf.
import { execFile } from 'node:child_process'

/** Obergrenze je Body-Feld. Darueber wird gekappt und die Zeile markiert. */
export const LIMIT_BYTES = 256 * 1024

const DEFAULT_INTERVAL_MS = 5_000

/**
 * Kappt einen Text auf `limit` Bytes, ohne ein Mehrbyte-Zeichen zu zerreissen.
 *
 * Byteweises Abschneiden mitten in einer UTF-8-Sequenz erzeugte sonst ein
 * Ersatzzeichen (U+FFFD) am Ende — ein Artefakt, das im Panel wie Inhalt
 * aussaehe.
 *
 * @param {string|null|undefined} text
 * @param {number} limit
 * @returns {{text: string|null, truncated: boolean, originalBytes: number}}
 */
export function truncate(text, limit = LIMIT_BYTES) {
  if (text == null) return { text: text ?? null, truncated: false, originalBytes: 0 }
  const str = typeof text === 'string' ? text : String(text)
  const buf = Buffer.from(str, 'utf8')
  if (buf.length <= limit) return { text: str, truncated: false, originalBytes: buf.length }

  // Vom Schnittpunkt zurueckgehen, solange dort ein Fortsetzungsbyte (10xxxxxx)
  // steht — dann laege der Schnitt innerhalb eines Zeichens.
  let end = limit
  while (end > 0 && (buf[end] & 0xc0) === 0x80) end--
  return { text: buf.subarray(0, end).toString('utf8'), truncated: true, originalBytes: buf.length }
}

/** Spalten der Zieltabelle in der Reihenfolge des INSERT. */
const COLUMNS = [
  ['ts', 'timestamptz'], ['backend', 'text'], ['requested_model', 'text'], ['served_model', 'text'],
  ['subpath', 'text'], ['http_status', 'int'], ['duration_ms', 'int'], ['queue_wait_ms', 'int'],
  ['prompt_tokens', 'int'], ['completion_tokens', 'int'], ['streamed', 'boolean'],
  ['stream_incomplete', 'boolean'], ['truncated', 'boolean'], ['original_bytes', 'bigint'],
  ['slot_id', 'int'], ['dispatch_ticket', 'text'], ['dispatch_partial', 'text'],
  ['request_body', 'text'], ['response_body', 'text'],
]

/** camelCase der Zeilen → snake_case der Tabelle. */
const FIELD_OF = {
  ts: 'ts', backend: 'backend', requested_model: 'requestedModel', served_model: 'servedModel',
  subpath: 'subpath', http_status: 'httpStatus', duration_ms: 'durationMs',
  queue_wait_ms: 'queueWaitMs', prompt_tokens: 'promptTokens', completion_tokens: 'completionTokens',
  streamed: 'streamed', stream_incomplete: 'streamIncomplete', truncated: 'truncated',
  original_bytes: 'originalBytes', slot_id: 'slotId', dispatch_ticket: 'dispatchTicket',
  dispatch_partial: 'dispatchPartial', request_body: 'requestBody', response_body: 'responseBody',
}

/**
 * Baut das INSERT fuer einen Stapel Zeilen.
 *
 * Die Zeilen reisen als JSON in einem dollar-quoted Literal. Das Tag wird so
 * lange verlaengert, bis es im Payload nicht vorkommt — ohne diese Pruefung
 * koennte ein Body, der zufaellig `$j$` enthaelt, das Literal schliessen und
 * beliebiges SQL anfuegen. Prompts sind hier Fremdtext, also ist das kein
 * theoretischer Fall.
 */
export function buildInsert(rows) {
  const payload = rows.map((r) => {
    const o = {}
    for (const [col] of COLUMNS) o[col] = r[FIELD_OF[col]] ?? null
    return o
  })
  const json = JSON.stringify(payload)
  let tag = 'j'
  while (json.includes(`$${tag}$`)) tag += 'j'

  const cols = COLUMNS.map(([c]) => c).join(', ')
  const sel = COLUMNS.map(([c, t]) =>
    c === 'ts' ? `COALESCE((e->>'ts')::timestamptz, now())` : `(e->>'${c}')::${t}`).join(', ')

  return `INSERT INTO tickets.llm_proxy_request_log (${cols})\n`
    + `SELECT ${sel}\n`
    + `FROM json_array_elements($${tag}$${json}$${tag}$::json) AS e;`
}

/** Schreibweg in Produktion: ein factory_psql-Aufruf je Stapel. */
function psqlWriter(rows) {
  const sql = buildInsert(rows)
  return new Promise((resolve, reject) => {
    const script = 'source scripts/factory/lib.sh; factory_resolve; factory_psql'
    const child = execFile('bash', ['-c', script], {
      env: { ...process.env, BRAND: process.env.BRAND || 'mentolder' },
      maxBuffer: 1024 * 1024,
    }, (err) => (err ? reject(err) : resolve()))
    child.stdin.end(sql)
  })
}

/**
 * Erzeugt einen Mitschnitt-Puffer.
 *
 * @param {{writer?: (rows: object[]) => Promise<void>, limit?: number, intervalMs?: number}} opts
 */
export function createRequestLog(opts = {}) {
  const writer = opts.writer ?? psqlWriter
  const limit = opts.limit ?? LIMIT_BYTES
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS

  /** @type {object[]} */
  let buffer = []
  let timer = null

  /**
   * Nimmt eine Zeile in den Puffer. Kappt zu grosse Bodies und weist das aus —
   * stilles Abschneiden liesse den Betrachter einen Ausschnitt fuer das Ganze
   * halten.
   */
  function capture(record) {
    try {
      const req = truncate(record.requestBody, limit)
      const res = truncate(record.responseBody, limit)
      buffer.push({
        ...record,
        requestBody: req.text,
        responseBody: res.text,
        truncated: req.truncated || res.truncated,
        // Die groessere der beiden Originalgroessen: sie beantwortet die Frage
        // "wie viel fehlt mir hier maximal".
        originalBytes: req.truncated || res.truncated
          ? Math.max(req.originalBytes, res.originalBytes)
          : null,
        slotId: record.slotId ?? null,
        dispatchTicket: record.dispatchTicket ?? null,
        dispatchPartial: record.dispatchPartial ?? null,
      })
    } catch (err) {
      console.error(`[request-log] capture verworfen: ${err.message}`)
    }
  }

  /** Schreibt den Puffer weg. Wirft nie. */
  async function flush() {
    if (buffer.length === 0) return 0
    // Puffer VOR dem Schreiben tauschen: waehrend des await laufen weitere
    // Dispatches ein, die sonst mit demselben Stapel verloren gingen.
    const rows = buffer
    buffer = []
    try {
      await writer(rows)
      return rows.length
    } catch (err) {
      // Verworfen statt zurueckgelegt: ein dauerhaft kaputter Schreibweg liesse
      // den Puffer sonst unbegrenzt wachsen.
      console.error(`[request-log] ${rows.length} Mitschnitt(e) verworfen: ${err.message}`)
      return 0
    }
  }

  function start() {
    if (timer) return
    timer = setInterval(() => { void flush() }, intervalMs)
    timer.unref?.()
  }

  async function stop() {
    if (timer) { clearInterval(timer); timer = null }
    await flush()
  }

  return { capture, flush, start, stop, pending: () => buffer.length }
}

/** Singleton fuer den Server; Tests bauen sich eigene Instanzen. */
export const requestLog = createRequestLog()
