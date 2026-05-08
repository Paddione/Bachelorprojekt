# Tickets (Unified Inbox)

Seit PR4 laufen Bug-Reports, Features, Aufgaben und Projekte in einem
einzigen Modell unter `tickets.tickets`. Das Admin-UI ist
`/admin/tickets` (Sidebar-Eintrag *Tickets* in der Gruppe *Betrieb*).

## Filter

- **Typ:** `bug`, `feature`, `task`, `project`
- **Status:** `triage` → `backlog` → `in_progress` → `in_review` → `blocked` → `done` → `archived`
- **Komponente / Zuständig / Kunde / Tag / Thesis-Tag**
- **Suche** über Titel, Ticket-ID und Reporter-E-Mail

## Saved Views (Chips)

`Alle offenen`, `Meine offenen`, `Triage`, `In Review`, `Blockiert`,
`Bugs`, `Features`, `Projekte`, `Thesis FA`.

## Detailseite `/admin/tickets/:id`

Zeigt Header, Action-Bar (Status-Übergang, Kommentar, Verknüpfung),
Beschreibung, Kind-Tickets, verknüpfte Tickets (inkl. PR-Merge-Events),
einheitlicher **Aktivitäts-Verlauf** (kombiniert `ticket_activity`,
`ticket_comments`, `ticket_links` und `pr_events`), Anhänge, Sidebar
mit Metadaten und Watchern.

## Status-Übergänge

Alle Status-Änderungen laufen ausschließlich durch
`transitionTicket()`. Beim Übergang nach `done` für Bug-Tickets mit
`reporter_email` wird automatisch eine Close-Mail an den Reporter
verschickt (BCC: `info@<brand>`, Reply-To: `info@<brand>`). Öffentliche
Kommentare (`visibility='public'`) auf Bug-Tickets triggern eine
zweite Mail an den Reporter.

## Brand-Multi-Tenancy

Jede Liste, jede Detail-Abfrage und jede Mutation filtert nach
`tickets.tickets.brand = process.env.BRAND_ID`. korczewski-Tickets
sind auf web.mentolder.de niemals sichtbar und umgekehrt.

## Legacy-Seiten

`/admin/bugs` und `/admin/projekte` bleiben als gewohnte
Listen-Ansichten erhalten und lesen aus demselben Modell.
