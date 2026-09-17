# Proposal: application-pipeline-brett-cockpit

## Why

Requirement "Application Funnel and Audit Trail in Brett Cockpit" aus
`openspec/changes/application-pipeline/specs/application-pipeline.md` (Phase 1, T900228)
verlangt eine Kanban-Ansicht der Bewerbungs-Pipeline im Cockpit, ist aber noch nicht implementiert.
`applications.*` lebt in der `website`-Datenbank (Requirement 1, Phase 1), das Cockpit läuft aber
im separaten Brett-Service (`components/brett/`) mit eigener Datenbank und eigenem Server-Prozess.
Diese Phase überbrückt die Service-Grenze nach demselben Muster, das bereits für Ticket-Events
existiert (`components/website/src/pages/api/internal/tickets/notify-close.ts`,
`INTERNAL_API_TOKEN`-gated): ein schlanker interner Read/Write-API statt einer zweiten
Datenbankverbindung von Brett auf die `website`-DB.

## What

1. **Interne API auf der Website-Seite:** `GET /api/internal/applications/list` (gruppiert nach
   Status) und `POST /api/internal/applications/timeline` (Event-Logging), beide hinter
   `INTERNAL_API_TOKEN` — exakt das Auth-Muster aus `internal/tickets/notify-close.ts`.
2. **Brett-Server-Route:** `components/brett/src/server/routes/applications.ts` ruft die interne
   API per `fetch` auf und reicht die Daten an die Brett-Frontend-UI durch.
3. **Brett-Client-UI:** Kanban-Board gruppiert nach den 5 Lifecycle-Stufen aus der Spec (`found`,
   `drafting`, `applied`, `interviewing`, `offered`), inklusive Formular zum Anhängen eines
   Timeline-Events (Interview-Notizen).
4. **Explizit nicht in dieser Phase:** Kein Drag-and-drop-Statuswechsel (reines Lesen + Event-
   Anhängen genügt der Spec-Scenario-Abdeckung), keine Dossier-PDF-Vorschau (das wäre an Phase 3
   / Artefakt-Speicherort gekoppelt und dort noch offen).

_Ticket: T900233_
