// scripts/llm-proxy/strip-markers.mjs
//
// T002609 — Turn-Marker aus dem content von Non-Streaming-Antworten entfernen.
//
// gemma9-factory laedt scripts/llm/templates/gemma2-tools.jinja, das
// <|role_sep|>/<|message_sep|> als Turn-Markup nutzt. Fuer den Tool-Call-Pfad
// ist das gewollt und funktioniert: bei einer tools-Anfrage konsumiert der
// peg-Parser den Marker, content bleibt leer, tool_calls sind sauber. Im reinen
// Textpfad bleibt der Marker dagegen stehen und landet im content — dem Feld,
// das jeder Konsument direkt weiterverarbeitet (gemessen 2026-08-03,
// temperature 0, in 5 von 5 Klartext-Antworten).
//
// Der Ort ist bewusst gewaehlt: zum Zeitpunkt der Auslieferung ist der
// peg-Parser fertig. Strippen kann ihn nicht mehr stoeren — die im Ticket
// befuerchtete Tool-Call-Regression ist hier konstruktiv ausgeschlossen, nicht
// nur getestet. Ein Stop-Token an der Quelle waere kleiner und wuerde auch
// Direktzugriffe auf :8092 abdecken, koennte aber genau die Sequenz
// abschneiden, die der Parser braucht.

const MARKERS = ['<|message_sep|>', '<|role_sep|>'];

/**
 * Entfernt bekannte Turn-Marker aus choices[].message.content.
 *
 * Faellt bei allem Unerwarteten auf Durchreichen zurueck statt zu werfen: der
 * Marker ist ein Schoenheitsfehler, eine Ausnahme im Auslieferungspfad waere
 * ein Ausfall.
 *
 * @param {object} payload geparste OpenAI-kompatible Antwort
 * @returns {object} dasselbe Objekt, content bereinigt
 */
export function stripTurnMarkers(payload) {
  if (!payload || !Array.isArray(payload.choices)) return payload;
  for (const choice of payload.choices) {
    const msg = choice?.message;
    if (!msg || typeof msg.content !== 'string') continue;
    let content = msg.content;
    for (const marker of MARKERS) {
      if (content.includes(marker)) content = content.split(marker).join('');
    }
    msg.content = content;
  }
  return payload;
}
