// scripts/llm-proxy/switch-origin.mjs
// T013894 — Wer hat den Loadout-Wechsel ausgeloest?
//
// Die [switch]-Zeilen nannten bis hierher nur den Ziel-Slug ("starte
// qwen38-220k"). Wer den Wechsel verursacht hat, stand ausschliesslich im
// Request-Mitschnitt (tickets.llm_proxy_request_log) — und genau der fehlte im
// Fenster von Incident T013527, weshalb die Client-Zuordnung nur indirekt
// moeglich war. Ein Loadout-Wechsel evictet fremde Arbeit; die Attribution
// gehoert deshalb in die Zeile, die den Wechsel meldet, und darf nicht von
// einem zweiten, ausfallbaren Weg abhaengen.
//
// Das Modul kennt keine Request-Objekte, nur ein Header-Objekt — dieselbe
// Schnittform wie models.mjs und respond.mjs, und der Grund, warum es ohne
// laufenden Server pruefbar ist (ein Import von server.mjs bindet den Port).

/** Header, aus denen der Client abgeleitet wird — in dieser Reihenfolge. */
const CLIENT_HEADERS = ['x-llm-client', 'user-agent']

/** Was in die Zeile geschrieben wird, wenn ein Feld fehlt. */
const UNKNOWN = 'unbekannt'

function firstHeader(headers, names) {
  for (const n of names) {
    const v = headers?.[n]
    if (v != null && String(v).trim() !== '') return String(v).trim()
  }
  return null
}

/**
 * Baut das Attributions-Label eines Loadout-Wechsels.
 *
 * Fehlende Felder werden als `unbekannt` ausgewiesen statt weggelassen: eine
 * leere Zeichenkette waere im Journal von "kein Client" nicht zu unterscheiden
 * — dieselbe Verwechslung, die den Blind Spot ausmachte.
 *
 * Die Remote-Adresse steht dabei neben dem Client-Namen und nicht an seiner
 * Stelle: der Proxy bindet 127.0.0.1, die Adresse trennt die Loopback-Clients
 * also nicht — sie belegt nur, DASS der Aufruf lokal kam. Bei Incident T013527
 * fehlte beides, weshalb opencode/agy/factory/codex einzeln von Hand
 * ausgeschlossen werden mussten [T013540].
 *
 * @param {Record<string, string|undefined>} headers Request-Header (lowercase)
 * @param {string|null} requestedModel Das Modell, das die Anfrage verlangt hat
 * @param {string|null} remoteAddress req.socket.remoteAddress des Aufrufers
 * @returns {string} z.B. `model=qwen38-220k client=opencode/1.4 addr=127.0.0.1 ticket=T013527`
 */
export function switchOrigin(headers = {}, requestedModel = null, remoteAddress = null) {
  const client = firstHeader(headers, CLIENT_HEADERS) ?? UNKNOWN
  const ticket = firstHeader(headers, ['x-dispatch-ticket'])
  const model = requestedModel != null && String(requestedModel).trim() !== ''
    ? String(requestedModel).trim()
    : UNKNOWN

  // x-forwarded-for gewinnt gegen die Socket-Adresse: laeuft ein Gateway
  // davor, ist dessen Adresse die uninteressante von beiden.
  const addr = firstHeader(headers, ['x-forwarded-for'])
    ?? (remoteAddress != null && String(remoteAddress).trim() !== ''
      ? String(remoteAddress).trim()
      : UNKNOWN)

  const parts = [`model=${model}`, `client=${client}`, `addr=${addr}`]
  if (ticket) parts.push(`ticket=${ticket}`)
  return parts.join(' ')
}

/**
 * Setzt eine [switch]-Ereigniszeile mit ihrer Attribution zusammen.
 *
 * Ohne Attribution bleibt die Zeile unveraendert — Aufrufer ausserhalb eines
 * Requests (Admin-Routen, Discovery) haben keinen Client, und ein angehaengtes
 * leeres Label machte deren Zeilen nur laenger.
 *
 * @param {string} event Die Ereignisbeschreibung ohne [switch]-Praefix
 * @param {string} origin Label aus switchOrigin(), oder leer
 */
export function formatSwitchLine(event, origin) {
  const o = origin == null ? '' : String(origin).trim()
  return o === '' ? String(event) : `${event} — ausgeloest von ${o}`
}
