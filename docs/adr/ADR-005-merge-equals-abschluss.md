# ADR-005: Merge = Abschluss — Ticketmodell ohne awaiting_deploy-Happy-Path

**Status:** Accepted  
**Datum:** 2026-06-01  
**Ticket:** T001092 / T001298

## Kontext

Das Ticketsystem der Software Factory verwaltet den Lifecycle von Features, Fixes und Chores. Vor T001092 gab es einen `awaiting_deploy`-Status zwischen Merge und Produktiv-Deploy, da das Deployment entkoppelt (push-basiert) ist und nicht automatisch nach jedem Merge ausgelöst wird.

Probleme des alten Modells:
- `awaiting_deploy` akkumulierte Tickets, die nie manuell auf `done` gesetzt wurden.
- Der Factory-Floor zeigte eine nicht leergeräumte `awaiting_deploy`-Lane als Rauschen.
- Der Prod-Deploy ist entkoppelt und kann Minuten bis Stunden nach dem Merge folgen — eine Unterscheidung zwischen "gemergt" und "live" ist für ein Bachelorprojekt ohne SLA nicht relevant.

## Entscheidung

Ein grüner Auto-Merge nach main schließt ein Ticket direkt: Status `done`, `resolution=shipped`. Der Prod-Deploy ist entkoppelt und ändert den Ticket-Status nicht. `awaiting_deploy` und `qa_review` bleiben als gültige Enum-Werte (für Sonderfälle und historische Zeilen), sind aber aus dem Happy-Path entfernt.

Umsetzung:
- Factory-Pipeline (`pipeline.js`): nach Auto-Merge direkt auf `done` setzen.
- `dev-flow-execute`-Skill: nach Merge auf `done` setzen, kein `awaiting_deploy`-Zwischenzustand.
- Watchdog: Tickets mit Status `awaiting_deploy` älter als 24 Stunden werden als Anomalie markiert.
- Factory-Floor: `awaiting_deploy`-Lane wird nur noch bei manuell zurückgehaltenen Tickets angezeigt.

## Konsequenzen

**Positive Konsequenzen:**
- Klares, einfaches Modell: Merge = Fertig. Keine mehrdeutigen Zwischenzustände.
- Factory-Floor zeigt einen saubereren Zustand ohne Rauschen.
- Weniger manuelle Ticket-Pflege nach Merge.

**Negative Konsequenzen:**
- Kein Status-Tracking zwischen Merge und Prod-Live-Deployment.
- Für zukünftige Szenarien mit SLA oder separatem QA-Gate muss `qa_review` wieder in den Happy-Path aufgenommen werden.

**Quality-Gate-Erfassung:** Verify-Phase-Events werden weiterhin als `tickets.factory_phase_events` mit strukturiertem `detail` erfasst — unabhängig vom Ticketstatus.
