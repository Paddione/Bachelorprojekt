# admin-cockpit

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

Das Admin-Cockpit ist das zentrale Ticket-Dashboard der Administrationsoberfläche.
Es zeigt den Portfolio-Baum (Produkte → Features → Tickets) und erlaubt inline-Statuswechsel,
Bulk-Aktionen, Erstellung neuer Tickets und Detailansicht im Drawer.

---

### Requirement: Authentifizierungs-Gate

The system SHALL deny access to the cockpit page for any request without a valid admin
session and SHALL redirect unauthenticated or non-admin users to `/login`.

#### Scenario: Admin-Session vorhanden

- **GIVEN** ein eingeloggter Nutzer mit `role = admin` öffnet `/admin/cockpit`
- **WHEN** die Astro-Seite den Request verarbeitet
- **THEN** wird das Dashboard gerendert und die Cockpit-Komponente geladen

#### Scenario: Kein Admin

- **GIVEN** ein unauthentifizierter oder nicht-admin Nutzer öffnet `/admin/cockpit`
- **WHEN** die Astro-Seite den Request verarbeitet
- **THEN** wird ein HTTP-Redirect nach `/login` zurückgegeben (kein Dashboard-Inhalt)

---

### Requirement: Portfolio-Initialisierung mit SSR-Prefetch

The system SHALL pre-fetch the portfolio data server-side during SSR so that the cockpit
renders the feature tree on first paint without a client-side loading round-trip, and SHALL
fall back to a client-side fetch if the SSR pre-fetch fails.

#### Scenario: Erfolgreicher SSR-Prefetch

- **GIVEN** die Datenbank ist erreichbar und enthält Produkte für die aktive Brand
- **WHEN** die Astro-Seite gerendert wird
- **THEN** wird `portfolioInitial` mit den Produktdaten befüllt und als Prop an `Cockpit.svelte` übergeben
- **AND** beim Client-Mount wird kein zweiter `/api/admin/cockpit/portfolio`-Request ausgelöst

#### Scenario: SSR-Prefetch schlägt fehl

- **GIVEN** die Datenbankverbindung beim SSR wirft einen Fehler
- **WHEN** die Astro-Seite gerendert wird
- **THEN** wird `portfolioInitial = null` übergeben
- **AND** `Cockpit.svelte` führt beim Mount selbst einen `fetch('/api/admin/cockpit/portfolio')` durch

---

### Requirement: Feature-Auswahl mit URL- und LocalStorage-Persistenz

The system SHALL persist the selected feature across page reloads via `localStorage` and
SHALL synchronise the selection bidirectionally with the `?feature=` URL query parameter,
so that a refreshed or shared URL lands on the same feature view.

#### Scenario: Feature aus URL beim Seitenstart

- **GIVEN** die URL enthält `?feature=T000123`
- **WHEN** `initStoreFromUrl` beim Mount aufgerufen wird
- **THEN** wird `cockpitStore.selectedFeature` auf `T000123` gesetzt
- **AND** die Tickets des entsprechenden Features werden geladen

#### Scenario: Feature-Wechsel aktualisiert URL und LocalStorage

- **GIVEN** der Nutzer wählt ein anderes Feature aus der Feature-Liste
- **WHEN** `selectFeature(extId)` aufgerufen wird
- **THEN** wird `localStorage['cockpit:feature']` mit der neuen `extId` überschrieben
- **AND** `window.history.replaceState` aktualisiert den `?feature=`-Parameter ohne Navigation

#### Scenario: Veraltetes Feature in LocalStorage

- **GIVEN** `localStorage['cockpit:feature']` enthält eine `extId`, die nicht mehr im Portfolio existiert
- **WHEN** das Cockpit beim Mount das Portfolio lädt
- **THEN** wird automatisch ein sinnvolles Fallback-Feature ausgewählt (bevorzugt „Alle Tickets")

---

### Requirement: Automatische Fallback-Feature-Auswahl

The system SHALL automatically select a sensible default feature on first load or when no
valid selection exists, preferring the synthetic "Alle Tickets" aggregate bucket, then the
first non-discarded feature with tickets, then any feature.

#### Scenario: „Alle Tickets"-Bucket vorhanden

- **GIVEN** das Portfolio enthält den synthetischen Bucket mit `extId = ALL_TICKETS_ID`
- **WHEN** keine explizite Feature-Auswahl vorliegt
- **THEN** wird „Alle Tickets" als aktives Feature gesetzt und dessen Tickets geladen

#### Scenario: Kein „Alle Tickets"-Bucket

- **GIVEN** das Portfolio enthält keinen ALL_TICKETS_ID-Bucket, aber Features mit Tickets
- **WHEN** keine explizite Feature-Auswahl vorliegt
- **THEN** wird das erste nicht-verworfene Feature mit `rollup.total > 0` gewählt

---

### Requirement: Ticket-Statuswechsel mit optimistischem Update

The system SHALL apply status changes immediately in the UI (optimistic update) before the
API call completes, and SHALL roll back the change visually if the API returns an error.

#### Scenario: Erfolgreicher Statuswechsel

- **GIVEN** ein Ticket ist sichtbar in der Tabelle
- **WHEN** der Nutzer im Status-Dropdown einen neuen Status wählt
- **THEN** wird der neue Status sofort in der Zeile angezeigt (ohne Wartezeit)
- **AND** `/api/admin/tickets/:id/transition` wird im Hintergrund aufgerufen
- **AND** nach Erfolg wird das Portfolio via `onMutated` neu geladen

#### Scenario: API-Fehler beim Statuswechsel (Rollback)

- **GIVEN** die Transition-API antwortet mit einem Fehler
- **WHEN** das optimistische Update bereits angewendet wurde
- **THEN** wird der alte Status wiederhergestellt
- **AND** `rollbackOptimistic` bereinigt den optimistischen Eintrag im Store

#### Scenario: Terminal-Status erfordert Resolution

- **GIVEN** der Nutzer wählt den Status `done` oder `archived`
- **WHEN** der API-Aufruf zusammengebaut wird
- **THEN** wird ein `resolution`-Wert mitgesendet (Default: `'shipped'` für Tasks/Features, `'fixed'` für Bugs)

---

### Requirement: Ticket-Filterung nach Status und Freitextsuche

The system SHALL provide a search input that filters tickets client-side by title and
external ID, and SHALL provide status filter chips that narrow the ticket list to a selected
workflow state, with "Aktiv" (non-terminal) as the default.

#### Scenario: Freitextsuche nach Titel

- **GIVEN** die Tabelle zeigt Tickets eines Features
- **WHEN** der Nutzer „login" in das Suchfeld eingibt
- **THEN** werden nur Tickets angezeigt, deren Titel oder `extId` den Suchbegriff (case-insensitive) enthält

#### Scenario: Status-Chip „Aktiv" ist Standardauswahl

- **GIVEN** der Nutzer öffnet das Cockpit und wählt ein Feature
- **WHEN** die Tabelle initial gerendert wird
- **THEN** sind nur nicht-terminale Tickets sichtbar (Chip „Aktiv" ist aktiv)

#### Scenario: Status-Chip „Alle" zeigt alle Tickets

- **GIVEN** der Nutzer klickt auf den Chip „Alle"
- **WHEN** der Filter angewendet wird
- **THEN** werden alle Tickets des Features angezeigt, einschließlich `done` und `archived`

#### Scenario: Paginierung bei großen Listen

- **GIVEN** ein Feature hat mehr als 50 sichtbare Tickets
- **WHEN** die Tabelle gerendert wird
- **THEN** werden initial 50 Tickets angezeigt und ein „Mehr anzeigen"-Button erscheint
- **AND** ein Klick auf „Mehr anzeigen" erhöht das Limit um 50

---

### Requirement: Bulk-Aktionen auf mehreren Tickets

The system SHALL allow the admin to select multiple tickets via checkboxes and apply a
single status, priority, or feature-reparent mutation to all selected tickets in one batch
API call.

#### Scenario: Bulk-Status-Änderung

- **GIVEN** der Nutzer hat 3 Tickets per Checkbox ausgewählt
- **WHEN** im BulkBar-Dropdown ein neuer Status gewählt wird
- **THEN** wird `/api/admin/cockpit/batch` mit den IDs und dem neuen Status aufgerufen
- **AND** nach Erfolg wird die Auswahl aufgehoben und das Feature neu geladen

#### Scenario: BulkBar erscheint nur bei aktiver Auswahl

- **GIVEN** keine Tickets sind ausgewählt
- **WHEN** die Tabelle gerendert wird
- **THEN** ist die BulkBar nicht sichtbar
- **AND** sie erscheint erst, wenn mindestens ein Ticket ausgewählt wird

#### Scenario: Escape schließt die BulkBar

- **GIVEN** mindestens ein Ticket ist ausgewählt und die BulkBar ist sichtbar
- **WHEN** der Nutzer die Escape-Taste drückt
- **THEN** wird die Auswahl aufgehoben und die BulkBar verschwindet

---

### Requirement: Ticket-Erstellung aus dem Cockpit

The system SHALL provide a modal dialog for creating new tickets directly from the cockpit
table, pre-filling the feature parent with the currently selected feature, and SHALL
refresh the table after successful creation.

#### Scenario: Modal öffnen und Ticket erstellen

- **GIVEN** der Nutzer klickt auf „+ Ticket" in der Toolbar
- **WHEN** das Create-Modal geöffnet wird
- **THEN** ist das aktuelle Feature im Feature-Dropdown vorausgewählt
- **AND** nach Ausfüllen von Titel und Klick auf „Erstellen" wird `/api/admin/cockpit/create` aufgerufen
- **AND** nach Erfolg schließt das Modal und `onCreated` löst einen Tabellen-Refresh aus

#### Scenario: Titel ist Pflichtfeld

- **GIVEN** das Create-Modal ist geöffnet
- **WHEN** der Nutzer auf „Erstellen" klickt ohne einen Titel eingegeben zu haben
- **THEN** bleibt der Submit-Button deaktiviert und kein API-Aufruf wird gesendet

---

### Requirement: Ticket-Detail-Drawer mit Inline-Bearbeitung

The system SHALL open a slide-in drawer panel when the user clicks a ticket title, showing
ticket metadata and allowing inline editing of title, description, and priority, as well as
direct status transitions, without leaving the cockpit page.

#### Scenario: Drawer öffnen

- **GIVEN** die Tabelle zeigt Tickets
- **WHEN** der Nutzer auf einen Ticket-Titel klickt
- **THEN** öffnet sich ein Drawer-Panel am rechten Bildschirmrand mit der Ticket-ID, dem Titel, Status-Badge, Priorität, Typ und Beschreibung

#### Scenario: Inline-Titelbearbeitung

- **GIVEN** der Drawer ist für ein Ticket geöffnet
- **WHEN** der Nutzer den Titel bearbeitet und das Eingabefeld verlässt (blur)
- **THEN** wird `/api/admin/cockpit/patch` mit dem neuen Titel aufgerufen
- **AND** bei Erfolg aktualisiert sich der Titel im Drawer und `onMutated` wird getriggert

#### Scenario: Drawer-Transition zu terminal-Status

- **GIVEN** der Drawer zeigt ein Ticket im Status `in_review`
- **WHEN** der Nutzer auf „→ Erledigt" klickt
- **THEN** wird ein Resolution-Dropdown eingeblendet und nach Wahl der Resolution der Transition-API-Call gesendet

#### Scenario: Escape schließt den Drawer

- **GIVEN** der Drawer ist geöffnet
- **WHEN** der Nutzer die Escape-Taste drückt
- **THEN** schließt der Drawer und `activeTicket` im Store wird auf `null` gesetzt

#### Scenario: Vollansicht-Link

- **GIVEN** der Drawer ist für Ticket `abc-123` geöffnet
- **WHEN** der Nutzer auf „Vollansicht öffnen ↗" klickt
- **THEN** navigiert der Browser zu `/admin/tickets/abc-123`

---

### Requirement: OpenSpec-Status-Anzeige pro Ticket

The system SHALL display OpenSpec proposal badges on each ticket row, showing the proposal
status (`SPEC` for `planning`, `READY` for `plan_staged`, `DONE` for `archived`) so that
the admin can see at a glance which tickets have active specifications.

#### Scenario: Ticket ohne OpenSpec-Proposal

- **GIVEN** ein Ticket hat kein `openspecProposals`-Array oder ein leeres Array
- **WHEN** die Ticket-Zeile gerendert wird
- **THEN** erscheint kein OpenSpec-Badge in der `os-badges`-Spalte

#### Scenario: Ticket mit Plan-staged-Proposal

- **GIVEN** ein Ticket hat ein Proposal mit `status = 'plan_staged'`
- **WHEN** die Ticket-Zeile gerendert wird
- **THEN** erscheint ein grünes Badge mit der Aufschrift „READY" in der OpenSpec-Spalte

#### Scenario: Mehrere Proposals am Ticket

- **GIVEN** ein Ticket hat zwei Proposals (eines `planning`, eines `archived`)
- **WHEN** die Ticket-Zeile gerendert wird
- **THEN** werden beide Badges nebeneinander in der OpenSpec-Spalte angezeigt
