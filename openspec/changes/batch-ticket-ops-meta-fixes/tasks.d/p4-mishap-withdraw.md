# p4 — Mishap-Buffer: Rücknahmepfad (T003134)

## Ziel

Der Mishap-Buffer hat keinen Rücknahmepfad — ein inzwischen behobener Befund
erscheint beim Flush als offener Punkt im Rollup. Fenster: bis 7 Tage
(Zwischen Erfassung und Flush).

## Steps

1. **RED.** Go-Unit-Test in `scripts/ticket-mcp/go/internal/tools/mishap_test.go`:
   gemeldeter + via resolve/withdraw zurückgenommener Eintrag erscheint nicht im
   Flush. `expected: FAIL` (kein Rücknahmepfad).

2. **GREEN.** In `scripts/ticket-mcp/go/internal/tools/mishap.go`:
   `resolve_mishap`/`withdraw_mishap` mit Index- oder Titel-Match — entfernt den
   Eintrag aus dem Buffer (mit Verweis auf das lösende Ticket).
   Optional (b): Flush prüft Einträge gegen Tickets und markiert geschlossene
   als "bereits behoben durch T00XXXX" statt als offenen Punkt (löst zugleich
   T002844-Richtung).

3. **Verifikation.** Fall aus T003134: T003121-Befund nach Fix nicht mehr im Flush.

## Acceptance

- Behobene Befunde sind aus dem Buffer zurücknehmbar.
- Flush führt keine gegenstandslosen Einträge als offene Punkte.
