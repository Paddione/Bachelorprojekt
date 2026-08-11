# p3 — Mishap-Buffer: Rücknahmepfad resolve/withdraw (T003134)

_Ticket: T003541 · Partial p3 (impl) · Kind: T003134_

## Ziel

Der Mishap-Buffer hat keinen Rücknahmepfad: ein in derselben Sitzung behobener
Befund erscheint beim nächsten Flush (≥10 Einträge oder 7 Tage) trotzdem als
offener Punkt im Rollup-Container. Wer den Rollup abarbeitet, untersucht etwas,
das auf main schon behoben ist — im Zweifel inklusive erneutem Fix.

## Abgrenzung

Das ist NICHT der Dedupe-Fall T002844 (Buffer für Ticket-Suche unsichtbar →
Duplikat). Hier ist der Eintrag sichtbar und korrekt erfasst, aber inzwischen
GEGENSTANDSLOS. Beide teilen die Ursache (Buffer und Tickets sind zwei
Zustandsräume ohne Verbindung), aber nicht die Auswirkung.

## Entscheidung (im Plan festgehalten)

**Variante (a) + Teil von (b):** Neues MCP-Tool `resolve_mishap`/`withdraw_mishap`
mit Index- oder Titel-Match, das den Eintrag mit Verweis auf das lösende Ticket
aus dem Buffer entfernt. Zusätzlich: `flush_mishap_buffer` prüft jeden Eintrag
gegen die Tickets (normalisierter Titel-Match, wie `findOpenTicketByTitle` in
mishap.go es schon für die Dedupe-Richtung kann) und markiert bereits geschlossene
Befunde als "bereits behoben durch T00XXXX" statt sie als offene Punkte zu führen
— löst zugleich die T002844-Richtung, weil beide Quellen in EINEM Aufruf
zusammenkommen.

Variante (c) (nur Doku) wird verworfen: die Handarbeit trägt nur, solange jemand
daran denkt.

## Steps

1. **RED.** Go-Unit-Test in
   `scripts/ticket-mcp/go/internal/tools/mishap_test.go`:
   - gemeldeter Eintrag + `resolve_mishap`/`withdraw_mishap` (Titel-Match) →
     Eintrag ist aus dem Buffer weg.
   - Flush nach Rücknahme → Eintrag erscheint nicht im Rollup-Output.
   - (Optional, Teil b) Flush mit inzwischen geschlossenem Ticket →
     Eintrag wird als "bereits behoben durch T00XXXX" markiert, nicht als offener
     Punkt.

2. **GREEN.** In `scripts/ticket-mcp/go/internal/tools/mishap.go`:
   - Neues Tool `resolve_mishap` (bzw. `withdraw_mishap`) mit Parametern
     `index` oder `title` (normalisierter Match via `normalizeTitle`), optional
     `resolved_by` (lösendes Ticket) — entfernt den Eintrag aus dem Buffer
     (readBuffer → filtern → writeBuffer).
   - `get_mishap_buffer` zeigt weiterhin alle Einträge (unverändert).
   - `flush_mishap_buffer` / `FlushStaleBuffer`: vor dem Append jeden Eintrag
     gegen `findOpenTicketByTitle` prüfen; nur offene Befunde als offene Punkte,
     geschlossene als "bereits behoben" markieren.

3. **Verifikation.** Fall aus T003134: T003121-Befund (in derselben Sitzung
   behoben) nach Rücknahme nicht mehr im Flush.

## Acceptance

- Behobene Befunde sind per Titel- oder Index-Match zurücknehmbar.
- Flush führt keine gegenstandslosen Einträge als offene Punkte.
- Rücknahme-Pfad ist im Rollup-Ticket nachvollziehbar (Verweis auf lösendes
  Ticket bleibt erhalten).
