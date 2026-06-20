# Proposal: fix-awaiting-deploy-visualization-gaps

## Why

10 Lücken in der Pipeline-Visualisierung verhindern, dass Tickets im Status `awaiting_deploy` (merge ≠ prod) korrekt durch das Cockpit laufen, ohne verloren zu gehen:

- **Typ-Inkonsistenzen**: `awaiting_deploy` fehlt in `transition.ts` API-Gate, `cockpit-labels.ts` STATUS_LABELS, und `admin.ts` TicketStatus-Typ
- **Visibility-Gaps**: Kein Filter-Chip in der Cockpit-Tabelle, `activeOnly`-Filter blendet `awaitingDeploy`-Items aus, Deploy-Lane hat keine Controls
- **Workflow-Gaps**: Watchdog swept nur `in_progress`, kein automatisierter `awaiting_deploy` → `done` Übergang

## What

1. `awaiting_deploy` in allen Typ-Definitionen und Labels ergänzen
2. Filter-Chip für `awaiting_deploy` in der Cockpit-Tabelle hinzufügen
3. `activeOnly`-Filter so korrigieren, dass `awaitingDeploy` als offene Arbeit zählt
4. Aktions-Buttons in der `AwaitingDeployLane` hinzufügen
5. Sidebar-Rollup um Status-Breakdown erweitern
6. Watchdog um `awaiting_deploy`-Staleness-Prüfung erweitern
7. Automatischen `awaiting_deploy` → `done` Übergang nach erfolgreichem Deploy implementieren

_Ticket: T000943_
