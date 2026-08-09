## ADDED Requirements

### Requirement: Projekt-Persistenz ausserhalb des `tickets`-Schemas

The system SHALL persist customer-portal projects, sub-projects and project tasks in
`public.customer_projects` (and attachments in `public.customer_project_attachments`) instead
of `tickets.tickets`, so that revoking write access to the `tickets` schema (ADR-006 freeze)
does not break portal or admin project management.

#### Scenario: Projekt anlegen nach dem Umbau

- **GIVEN** ein Admin legt im Kundenportal-Backoffice ein neues Projekt an
- **WHEN** `createProject()` (`website/src/lib/projects-db.ts`) aufgerufen wird
- **THEN** entsteht die Zeile in `public.customer_projects`, nicht in `tickets.tickets`

#### Scenario: Bestehende Projekte bleiben nach der Migration sichtbar

- **GIVEN** vor der Migration existierten 41 Projekte und 23 Aufgaben in `tickets.tickets`
- **WHEN** die Migration gelaufen ist
- **THEN** liefert `listProjects()` fuer jede der 41 `id`s dieselben Felder (Titel, Status,
  Prioritaet, Kunde) wie vor der Migration, gelesen aus `public.customer_projects`

#### Scenario: `tickets`-Schema-Freeze bricht die Projektverwaltung nicht

- **GIVEN** `scripts/sdlc/migrate-tickets.sh freeze` wurde auf der fleet-DB ausgefuehrt
  (REVOKE INSERT/UPDATE/DELETE auf alle Tabellen in Schema `tickets`)
- **WHEN** ein Admin ein Projekt anlegt, aktualisiert oder loescht
- **THEN** gelingt die Operation, weil sie ausschliesslich `public.customer_projects` schreibt
