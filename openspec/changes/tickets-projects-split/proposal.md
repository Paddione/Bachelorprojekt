# Proposal: tickets-projects-split

## Why

ADR-006 friert die fleet-Kopie des `tickets`-Schemas nach dem lokalen SDLC-Datenumzug (E3,
T002626) gegen Schreibzugriffe ein. Bei der E3-Umsetzung wurde gemessen, dass
`website/src/lib/projects-db.ts` aus dem Produktions-Build INSERT/UPDATE/DELETE auf
`tickets.tickets` (`type='project'`) ausfuehrt — 41 Kundenprojekte + 23 zugehoerige Aufgaben.
Ein `REVOKE` auf das gesamte Schema wuerde die Projektverwaltung im Kundenportal brechen
(T002722, Klaerungsrunde 2026-08-09, bindende Entscheidung von Patrick). Details, Messwerte und
verworfene Alternative ("granular einfrieren, `tickets.tickets` bleibt geteilt") stehen in
`design.md`.

## What

- Neue Tabellen `public.customer_projects` (Projekte/Aufgaben, selbstreferenzierend ueber
  `parent_id`) und `public.customer_project_attachments`, ausserhalb des Schemas `tickets`
  (sonst faengt sie der naechste `freeze`-Lauf wieder ein).
- Einmalige, idempotente Datenkopie der 41 Projekt- + 23 Aufgaben-Zeilen aus `tickets.tickets`
  nach `public.customer_projects` (gleiche `id`), **ohne** die Quellzeilen zu loeschen — der
  Freeze entzieht nur Schreibrechte, er leert nichts.
- FK-Umhaengung von `meetings.project_id`, `time_entries.project_id`/`task_id`,
  `questionnaire_assignments.project_id` von `tickets.tickets(id)` auf
  `public.customer_projects(id)` (alle drei Kanten aktuell unbelegt).
- Umbau der SQL-Ebene in `website/src/lib/projects-db.ts`, `project-portal-db.ts`,
  `project-attachments-db.ts`, `project-export-db.ts` auf die neue Tabelle — die bereits
  stabile TS-Funktionsoberflaeche (und damit alle 32 Aufrufer: `api/portal/projekte.ts`,
  `portal.astro`, `admin.astro`, `admin/projekte*`, `admin/subprojekte/*`,
  `admin/projekttasks/*`, ...) bleibt unveraendert.
- Ausserhalb dieses PRs (manueller Post-Merge-Schritt, s. `design.md` D5): nach verifiziertem
  Live-Betrieb `SDLC_FREEZE_CONFIRM=T002722 scripts/sdlc/migrate-tickets.sh freeze`.

_Ticket: T002722_
