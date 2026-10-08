---
page: mcp-servers
ticket: T901057
status: complete
actions:
  - server-status
  - server-logs
  - registry-open
---

## Voraussetzungen

- Registry `docs/agent-guide/registry/mcp.yaml` lesbar (Abschnitt
  `clients`, 10 Server, Stand 2026-10-08).

## Geordnete Schritte

1. **server-status**: Status pro Server aus der Registry (Transport +
   Kommando-Verfuegbarkeit; stdio-Server haben keine Units/Ports —
   Korrektur zur Plan-Hypothese, live verifiziert).
2. **server-logs**: Server waehlen — stdio-Server haben keine Unit-Logs;
   Startausgabe steht im Harness-Log (Meldung nennt den Ort).
3. **registry-open**: Registry-Datei oeffnen.

## Erwartetes Ergebnis

Serverliste aus der Registry (keine Konstanten); Status je Server;
Logs mit korrektem Ort.

## Troubleshooting

- **Server startet nicht**: Kommando aus der Registry manuell fahren,
  Harness-Log lesen.
- **Port-Probe schlaegt fehl**: nur wo die Registry einen Port nennt
  (z.B. bge-mcp :13005, mcp-postgres :13001).

## Recovery

Harness neu starten; Registry-Eintrag pruefen.
