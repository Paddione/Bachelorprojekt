## MODIFIED Requirements

### Requirement: Dev-Status-Seite mit Tab-Navigation
<!-- e2e: dev-status-tabs.spec.ts -->

The system SHALL provide the pipeline page at `/admin/pipeline` with a persistent tab bar
(rendered via `AdminTabs.svelte`) containing exactly six tabs — Floor, Planung, Analytics,
Kosten, Steuerung, Abhängigkeiten — SHALL synchronise the active tab with the `?tab=` URL query
parameter, and SHALL redirect legacy routes: `/dev-status` (preserving the `?tab=` query) and
`/admin/planungsbuero` → `/admin/pipeline?tab=planung`.

#### Scenario: /admin/pipeline öffnet standardmäßig den Floor-Tab *(E2E)*
- **GIVEN** ein Nutzer ruft `/admin/pipeline` ohne Tab-Parameter auf
- **WHEN** die Seite geladen ist
- **THEN** ist der Tab „Floor" aktiv und die URL enthält nicht `tab=planung`

#### Scenario: ?tab=planung aktiviert den Planungs-Tab *(E2E)*
- **GIVEN** ein Nutzer ruft `/admin/pipeline?tab=planung` auf
- **WHEN** die Seite geladen ist
- **THEN** ist der Tab „Planung" aktiv

#### Scenario: Tab-Wechsel aktualisiert die URL ohne Reload *(E2E)*
- **GIVEN** ein Nutzer befindet sich auf `/admin/pipeline` mit aktivem Floor-Tab
- **WHEN** der Tab „Planung" angeklickt wird
- **THEN** ändert sich die URL zu einem Pfad mit `tab=planung` und der Tab „Planung" ist aktiv — ohne Seitenneuladen

#### Scenario: /dev-status leitet auf /admin/pipeline weiter *(E2E)*
- **GIVEN** ein Nutzer ruft `/dev-status?tab=planung` auf
- **WHEN** der Request verarbeitet wird
- **THEN** wird auf `/admin/pipeline?tab=planung` weitergeleitet

#### Scenario: /admin/planungsbuero leitet auf /admin/pipeline?tab=planung weiter *(E2E)*
- **GIVEN** ein Nutzer ruft `/admin/planungsbuero` auf
- **WHEN** der Request verarbeitet wird
- **THEN** wird auf `/admin/pipeline?tab=planung` weitergeleitet

#### Scenario: Tab-Bar wird mit genau 6 Tabs gerendert *(E2E)*
- **GIVEN** ein Nutzer ruft `/admin/pipeline` auf
- **WHEN** die Seite geladen ist
- **THEN** ist die Tab-Leiste sichtbar und enthält genau 6 Tab-Elemente

#### Scenario: Tab-Bar ist auf mobilen Geräten (390 px) sichtbar *(E2E)*
- **GIVEN** der Viewport ist auf 390×844 px gesetzt
- **WHEN** `/admin/pipeline` aufgerufen wird
- **THEN** sind die Tab-Leiste und der erste Tab sichtbar

#### Scenario: Tab-Wechsel funktioniert auf mobilen Geräten *(E2E)*
- **GIVEN** der Viewport ist auf 390×844 px gesetzt und der Nutzer befindet sich auf `/admin/pipeline`
- **WHEN** der Tab „Planung" angeklickt wird
- **THEN** ändert sich die URL zu `tab=planung` und der Planungs-Tab ist aktiv

#### Scenario: Admin-Sidebar enthält genau einen Pipeline-Eintrag *(E2E)*
- **GIVEN** ein Nutzer ruft `/admin` auf
- **WHEN** die Sidebar gerendert wird
- **THEN** enthält `#admin-sidebar` genau einen Link mit `href="/admin/pipeline"` mit dem Text „Pipeline" und keinen Link mit `href="/dev-status"` oder `href="/admin/planungsbuero"`

#### Scenario: Attention-Strip erscheint bei blockiertem Workpiece *(E2E)*
- **GIVEN** ein Nutzer ruft `/admin/pipeline?tab=floor` auf
- **WHEN** ein Workpiece den Status „blocked" hat
- **THEN** wird ein `role=alert`-Element mit einem der Symbole ⛔, ⏱ oder 🧊 angezeigt

#### Scenario: Planung aktualisiert sich nach Promote-Event *(E2E)*
- **GIVEN** ein Nutzer befindet sich auf `/admin/pipeline?tab=planung`
- **WHEN** das Custom-Event `factory-floor-refreshed` ausgelöst wird
- **THEN** bleibt die Anzahl der `[data-planning-item]`-Elemente stabil oder ändert sich entsprechend dem neuen Stand

## ADDED Requirements

### Requirement: Cockpit Ticket-Expand-Row

The cockpit ticket table SHALL expand a detail area beneath a ticket row when the row (outside
the title link) is activated, showing the ticket description (rendered), the phase stepper, PR
and plan links from `ticket_links`, and the latest phase events. The detail data SHALL be fetched
lazily on first expand (no upfront fetch for the whole list). At most one row SHALL be expanded
at a time (accordion behavior); the expanded state SHALL NOT be persisted. The existing title
link behavior (`/admin/tickets/{id}`) SHALL remain unchanged, and no drawer component SHALL be
reintroduced.

#### Scenario: Row click expands detail

- **GIVEN** the cockpit table shows a ticket with a description and a linked PR
- **WHEN** the user activates the row (outside the title link)
- **THEN** an expand area appears beneath the row showing description, phase stepper, PR/plan links, and latest events

#### Scenario: Lazy fetch on first expand

- **GIVEN** a cockpit table with 20 rows
- **WHEN** the page loads
- **THEN** no ticket-detail requests are issued until a row is expanded

#### Scenario: Accordion behavior

- **GIVEN** row A is expanded
- **WHEN** the user expands row B
- **THEN** row A collapses and only row B remains expanded

#### Scenario: Title link keeps navigating

- **GIVEN** an expanded or collapsed row
- **WHEN** the user clicks the ticket title
- **THEN** the browser navigates to `/admin/tickets/{id}` (no drawer, no expand toggle)

### Requirement: Cockpit-Toolbar Icon-Buttons

The cockpit toolbar (preset load/save, URL copy) SHALL use SVG icon buttons from the shared
admin icon set instead of emoji characters; filter pills and action accents SHALL use the Brass
token instead of indigo.

#### Scenario: No emoji in toolbar buttons

- **WHEN** the cockpit toolbar renders
- **THEN** the preset and URL-copy buttons contain SVG icons and no emoji characters (📁, 💾, 🔗)

#### Scenario: Filter pills use Brass

- **GIVEN** the status filter pills are rendered
- **WHEN** a pill is active
- **THEN** its accent color resolves to the Brass token, not indigo
