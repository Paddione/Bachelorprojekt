# Tasks: fix-awaiting-deploy-visualization-gaps

## Task 1: Typ-Konsistenz (A1–A3)

- [ ] `transition.ts`: `TicketStatus` und `VALID_STATUSES` um `'awaiting_deploy'` erweitern
- [ ] `cockpit-labels.ts`: `STATUS_LABELS` um `awaiting_deploy: 'Wartet auf Deploy'` erweitern
- [ ] `cockpit-labels.ts`: `WORKFLOW_STATUSES` um `'awaiting_deploy'` erweitern
- [ ] `admin.ts`: `TicketStatus` um `'qa_review' | 'awaiting_deploy'` erweitern
- [ ] `transition.status.test.ts`: `awaiting_deploy` von `false` auf `true` ändern
- [ ] `cockpit-labels.test.ts` (neu): Tests für `awaiting_deploy` Label und WORKFLOW_STATUSES

## Task 2: Cockpit-Table Filter (B1)

- [ ] `CockpitTable.svelte`: CHIPS um `{ label: 'Wartet auf Deploy', value: 'awaiting_deploy' }` erweitern

## Task 3: activeOnly Filter (B2)

- [ ] `CockpitSidebar.svelte:55`: `openWork` Berechnung um `awaitingDeploy` erweitern
- [ ] `active-filter.test.ts` (neu): Test dass `awaitingDeploy` als offene Arbeit zählt

## Task 4: Deploy-Lane Controls (B3)

- [ ] `AwaitingDeployLane.svelte`: Aktions-Buttons hinzufügen (Deploy ausführen, PR-Link)
- [ ] `POST /api/admin/tickets/:id/deploy` API-Route (falls noch nicht existiert)

## Task 5: Sidebar Rollup-Detail (B4)

- [ ] `CockpitSidebar.svelte:160`: Status-Breakdown (done/blocked/inProgress/awaitingDeploy) statt nur Total anzeigen

## Task 6: Watchdog für awaiting_deploy (C1)

- [ ] `scripts/factory/watchdog.sh`: `awaiting_deploy`-Tickets mit >24h Staleness erkennen und `attention_mode='needs_human'` setzen

## Task 7: Automatisierter awaiting_deploy → done (C3)

- [ ] `scripts/factory/feature-promote.sh`: Nach erfolgreichem Deploy `ticket.sh update-status --status done` ausführen
- [ ] `website/src/lib/qa-ingest.ts`: `awaiting_deploy` als zusätzlichen Quell-Status für E2E-basierte done-Transition behandeln

## Verifikation

- [ ] `npm --prefix website run test:unit` (alle Tests grün)
- [ ] `npx --prefix website tsc --noEmit` (keine Typ-Fehler)
- [ ] `task freshness:regenerate && task freshness:check`
