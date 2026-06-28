# admin-cockpit

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

## Purpose

Das Admin-Cockpit ist das zentrale Ticket-Dashboard der Administrationsoberfläche.
Es zeigt den Portfolio-Baum (Produkte → Features → Tickets) und erlaubt inline-Statuswechsel,
Bulk-Aktionen, Erstellung neuer Tickets und Detailansicht im Drawer.

---

## Requirements

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

---

### Requirement: AdminLayout-Navigation enthält nur freigegebene Routen

The system SHALL include `/admin/arena` as a conditional nav entry in the AdminLayout
navigation groups and SHALL NOT include `/admin/systemtest` as a nav entry, ensuring that
the admin sidebar exposes only intentionally released routes.

#### Scenario: Arena-Link ist in navGroups vorhanden

- **GIVEN** die `AdminLayout.astro`-Datei ist der aktuelle Stand im Haupt-Branch
- **WHEN** die navGroups-Konfiguration geprüft wird
- **THEN** ist `/admin/arena` genau einmal als Eintrag in navGroups enthalten

#### Scenario: Systemtest-Route ist nicht in navGroups

- **GIVEN** die `AdminLayout.astro`-Datei ist der aktuelle Stand im Haupt-Branch
- **WHEN** die navGroups-Konfiguration geprüft wird
- **THEN** kommt der Pfad `/admin/systemtest` keinmal in navGroups vor

---

### Requirement: Einstellungen-Navigationseintrag verwendet das Settings-Icon

The system SHALL assign the settings icon (not the bell icon) to the „Einstellungen"
nav entry in the AdminLayout, so that the icon conveys the correct semantic meaning.

#### Scenario: Einstellungen-Icon ist kein Bell-Icon

- **GIVEN** die `AdminLayout.astro`-Datei ist der aktuelle Stand im Haupt-Branch
- **WHEN** die navGroups-Konfiguration für den Eintrag mit `label: 'Einstellungen'` geprüft wird
- **THEN** ist `icon: 'bell'` nicht in derselben Zeile wie `label: 'Einstellungen'` vorhanden

---

### Requirement: PortalLayout-Navigation enthält buchung, aber nicht arena

The system SHALL include a `buchung` nav item and SHALL NOT include an `arena` nav item
in the PortalLayout navigation, ensuring that portal users can access booking but cannot
see admin-only areas such as the arena.

#### Scenario: Arena ist nicht im Portal-Nav

- **GIVEN** die `PortalLayout.astro`-Datei ist der aktuelle Stand im Haupt-Branch
- **WHEN** die navItems-Konfiguration geprüft wird
- **THEN** kommt `id: 'arena'` keinmal in navItems vor

#### Scenario: Buchung ist im Portal-Nav vorhanden

- **GIVEN** die `PortalLayout.astro`-Datei ist der aktuelle Stand im Haupt-Branch
- **WHEN** die navItems-Konfiguration geprüft wird
- **THEN** ist `id: 'buchung'` mindestens einmal in navItems enthalten

---

### Requirement: AdminEinstellungenTabs enthält den Tab für Coaching & KI

The system SHALL render a „Coaching & KI"-Tab in the `AdminEinstellungenTabs` component
that links to the `/admin/coaching/settings` route, making coaching and AI settings
accessible from the consolidated Einstellungen page.

#### Scenario: Coaching-Settings-Tab ist vorhanden

- **GIVEN** die `AdminEinstellungenTabs.astro`-Datei ist der aktuelle Stand im Haupt-Branch
- **WHEN** die Tab-Konfiguration geprüft wird
- **THEN** enthält die Datei mindestens einen Verweis auf `coaching/settings`

---

### Requirement: Admin-Seiten enthalten kontextbezogene Navigations-Tabs

The system SHALL embed context-specific navigation tabs within individual admin pages so
that related sub-routes are accessible without returning to the main sidebar. Specifically:
`termine.astro` SHALL link to `/admin/kalender`, `coaching/sessions/index.astro` SHALL
link to `/admin/coaching/projekte`, and `buchhaltung.astro` SHALL link to `/admin/steuer`.

#### Scenario: Termine-Seite enthält Kalender-Tab

- **GIVEN** die Datei `website/src/pages/admin/termine.astro` ist der aktuelle Stand
- **WHEN** die Tab-Links auf der Seite geprüft werden
- **THEN** ist `href="/admin/kalender"` mindestens einmal vorhanden

#### Scenario: Coaching-Sessions-Seite enthält Projekte-Tab

- **GIVEN** die Datei `website/src/pages/admin/coaching/sessions/index.astro` ist der aktuelle Stand
- **WHEN** die Tab-Links auf der Seite geprüft werden
- **THEN** ist `href="/admin/coaching/projekte"` mindestens einmal vorhanden

#### Scenario: Buchhaltung-Seite enthält Steuer-Tab

- **GIVEN** die Datei `website/src/pages/admin/buchhaltung.astro` ist der aktuelle Stand
- **WHEN** die Tab-Links auf der Seite geprüft werden
- **THEN** ist `href="/admin/steuer"` mindestens einmal vorhanden

---

### Requirement: PlatformHub enthält Links zu Software-History und Systemtest

The system SHALL render links to the `/admin/software-history` and `/admin/systemtest`
routes within the `PlatformHub.svelte` component, even though these routes are not
exposed in the sidebar navGroups, ensuring they remain reachable from the platform hub.

#### Scenario: Software-History-Link ist im PlatformHub vorhanden

- **GIVEN** die `PlatformHub.svelte`-Datei ist der aktuelle Stand im Haupt-Branch
- **WHEN** die enthaltenen Links geprüft werden
- **THEN** kommt der Begriff `software-history` mindestens einmal im Dateiinhalt vor

#### Scenario: Systemtest-Link ist im PlatformHub vorhanden

- **GIVEN** die `PlatformHub.svelte`-Datei ist der aktuelle Stand im Haupt-Branch
- **WHEN** die enthaltenen Links geprüft werden
- **THEN** kommt der Begriff `systemtest` mindestens einmal im Dateiinhalt vor

---

## Testszenarien

<!-- merged from BATS unit tests and Playwright e2e tests -->

### Requirement: Admin-Bereichs-Authentifizierungs-Gate
<!-- bats: admin-nav.bats | e2e: fa-41-admin-hub.spec.ts, fa-admin-settings.spec.ts, fa-admin-inhalte.spec.ts, fa-admin-monitoring.spec.ts, fa-56-admin-assets.spec.ts, dashboard-art.spec.ts -->

The system SHALL deny access to all admin pages and APIs for unauthenticated or non-admin requests.

#### Scenario: /admin/platform erfordert Authentifizierung *(E2E)*
- **GIVEN** ein unauthentifizierter Nutzer
- **WHEN** `/admin/platform` aufgerufen wird
- **THEN** wird der Nutzer weitergeleitet — die finale URL ist nicht `/admin/platform`

#### Scenario: /admin/ops erfordert Authentifizierung *(E2E)*
- **GIVEN** ein unauthentifizierter Nutzer
- **WHEN** `/admin/ops` aufgerufen wird
- **THEN** wird der Nutzer weitergeleitet — die finale URL ist nicht `/admin/ops`

#### Scenario: Platform-Status-API verweigert unauthentifizierte Anfragen *(E2E)*
- **GIVEN** kein gültiger Session-Cookie ist vorhanden
- **WHEN** `GET /api/admin/platform/status` aufgerufen wird
- **THEN** antwortet die API mit HTTP 401, 403 oder 404

#### Scenario: Platform-Sync-API verweigert unauthentifizierte Anfragen *(E2E)*
- **GIVEN** kein gültiger Session-Cookie ist vorhanden
- **WHEN** `POST /api/admin/platform/sync` aufgerufen wird
- **THEN** antwortet die API mit HTTP 401, 403 oder 404

#### Scenario: Einstellungen-Seiten leiten unauthentifizierte Nutzer weiter *(E2E)*
- **GIVEN** ein unauthentifizierter Nutzer
- **WHEN** eine der Seiten `/admin/einstellungen/email`, `/admin/einstellungen/rechnungen`, `/admin/einstellungen/branding` oder `/admin/einstellungen/benachrichtigungen` aufgerufen wird
- **THEN** wird der Nutzer weitergeleitet — die finale URL entspricht nicht der aufgerufenen Seite

#### Scenario: Einstellungen-APIs verweigern unauthentifizierte Requests *(E2E)*
- **GIVEN** kein gültiger Session-Cookie ist vorhanden
- **WHEN** `POST /api/admin/einstellungen/{email|rechnungen|branding|benachrichtigungen}` aufgerufen wird
- **THEN** antwortet die API mit HTTP 401 oder 403

#### Scenario: Client-Management-APIs verweigern unauthentifizierte Requests *(E2E)*
- **GIVEN** kein gültiger Session-Cookie ist vorhanden
- **WHEN** `POST /api/admin/clients/flag-user`, `set-admin-number` oder `set-customer-number` aufgerufen wird
- **THEN** antwortet die API jeweils mit HTTP 401 oder 403

#### Scenario: Shortcut-APIs verweigern unauthentifizierte Requests *(E2E)*
- **GIVEN** kein gültiger Session-Cookie ist vorhanden
- **WHEN** `POST /api/admin/shortcuts/create` oder `DELETE /api/admin/shortcuts/delete` aufgerufen wird
- **THEN** antwortet die API mit HTTP 401 oder 403

#### Scenario: Deployments-API verweigert unauthentifizierte Anfragen *(E2E)*
- **GIVEN** kein gültiger Session-Cookie ist vorhanden
- **WHEN** `GET /api/admin/deployments`, `POST /api/admin/deployments/:name/restart` oder `POST /api/admin/deployments/:name/scale` aufgerufen wird
- **THEN** antwortet die API mit HTTP 401 oder 403

#### Scenario: Admin-Inhalte-Seite leitet unauthentifizierte Nutzer weiter *(E2E)*
- **GIVEN** ein unauthentifizierter Nutzer
- **WHEN** `/admin/inhalte` aufgerufen wird
- **THEN** wird der Nutzer weitergeleitet — die finale URL ist nicht `/admin/inhalte`

#### Scenario: Legacy-Admin-Stubs leiten unauthentifizierte Nutzer weiter *(E2E)*
- **GIVEN** ein unauthentifizierter Nutzer
- **WHEN** einer der Pfade `/admin/angebote`, `/admin/faq`, `/admin/kontakt`, `/admin/rechtliches`, `/admin/referenzen`, `/admin/startseite` oder `/admin/uebermich` aufgerufen wird
- **THEN** wird der Nutzer weitergeleitet — die finale URL entspricht nicht dem aufgerufenen Pfad

#### Scenario: Inhalte-APIs verweigern unauthentifizierte Requests *(E2E)*
- **GIVEN** kein gültiger Session-Cookie ist vorhanden
- **WHEN** `POST /api/admin/angebote/save`, `GET /api/admin/inhalte/custom`, `POST /api/admin/inhalte/custom` oder einer der anderen Content-Save-Endpunkte aufgerufen wird
- **THEN** antwortet die API mit HTTP 401 oder 403

#### Scenario: Monitoring-Seite leitet unauthentifizierte Nutzer weiter *(E2E)*
- **GIVEN** ein unauthentifizierter Nutzer
- **WHEN** `/admin/monitoring` aufgerufen wird
- **THEN** wird der Nutzer weitergeleitet — die finale URL ist nicht `/admin/monitoring`

#### Scenario: Monitoring-API verweigert unauthentifizierte Anfragen *(E2E)*
- **GIVEN** kein gültiger Session-Cookie ist vorhanden
- **WHEN** `GET /api/admin/monitoring` aufgerufen wird
- **THEN** antwortet die API mit HTTP 401 oder 403

#### Scenario: /admin/assets erfordert Authentifizierung *(E2E)*
- **GIVEN** ein unauthentifizierter Nutzer
- **WHEN** `/admin/assets` aufgerufen wird
- **THEN** wird der Nutzer weitergeleitet — die finale URL ist nicht `/admin/assets`

#### Scenario: Assets-API verweigert unauthentifizierte Anfragen *(E2E)*
- **GIVEN** kein gültiger Session-Cookie ist vorhanden
- **WHEN** `GET /api/admin/assets` aufgerufen wird
- **THEN** antwortet die API mit HTTP 401 oder 403

#### Scenario: Öffentliche Assets sind ohne Authentifizierung erreichbar *(E2E)*
- **GIVEN** kein Session-Cookie ist vorhanden
- **WHEN** `/favicon.svg` aufgerufen wird
- **THEN** antwortet der Server mit HTTP 200

#### Scenario: Admin-Portal leitet unauthentifizierte Nutzer weiter (korczewski) *(E2E)*
- **GIVEN** kein gültiger Session-Cookie ist vorhanden
- **WHEN** `web.korczewski.de/admin` aufgerufen wird
- **THEN** wird der Nutzer auf eine Login-Seite oder das Portal weitergeleitet

---

### Requirement: Platform Asset Inventory
<!-- e2e: fa-42-platform-assets.spec.ts -->

The system SHALL display a categorised asset inventory (software and hardware) on the `/admin/platform` page with live Kubernetes status badges and inline editing.

#### Scenario: Software-Assets mit k8s-Status werden angezeigt *(E2E)*
- **GIVEN** ein eingeloggter Admin ruft `/admin/platform` auf
- **WHEN** der „Software"-Tab angeklickt wird
- **THEN** sind die Kacheln „Website" und „Keycloak" sichtbar, und jede Kachel zeigt ein k8s-Status-Badge mit dem Text „ready" oder „failing"

#### Scenario: Hardware-Assets werden tabellarisch angezeigt *(E2E)*
- **GIVEN** ein eingeloggter Admin ruft `/admin/platform` auf
- **WHEN** der „Hardware"-Tab angeklickt wird
- **THEN** ist mindestens eine Hardware-Zeile (z. B. „Gekko CP 1") in der Tabelle sichtbar

#### Scenario: Software-Asset kann inline bearbeitet werden *(E2E)*
- **GIVEN** ein eingeloggter Admin befindet sich auf dem Software-Tab von `/admin/platform`
- **WHEN** der Bearbeiten-Button einer Kachel geklickt wird, eine neue Beschreibung eingegeben und auf „Speichern" geklickt wird
- **THEN** schließt sich das Modal und die aktualisierte Beschreibung wird in der Kachel angezeigt

#### Scenario: Keycloak-Asset enthält Öffnen-Link zu auth.<domain> *(E2E)*
- **GIVEN** ein eingeloggter Admin befindet sich auf dem Software-Tab von `/admin/platform`
- **WHEN** die Keycloak-Kachel betrachtet wird
- **THEN** enthält sie einen „Öffnen"-Link, der auf `https://auth.<domain>` verweist und in einem neuen Tab öffnet

---

### Requirement: Admin Aktionen-Tab im Platform Hub
<!-- e2e: sa-21-admin-actions.spec.ts -->

The system SHALL render an "Aktionen"-Tab on the `/admin/platform` page with subtabs for releases, backups, users, knowledge, and audit, and each subtab SHALL load its content without error.

#### Scenario: Aktionen-Tab ist sichtbar *(E2E)*
- **GIVEN** ein eingeloggter Admin ruft `/admin/platform` auf
- **WHEN** die Seite geladen ist
- **THEN** ist der Tab mit `data-testid="aktionen-tab"` sichtbar

#### Scenario: Aktionen-Subtabs werden alle gerendert *(E2E)*
- **GIVEN** ein eingeloggter Admin hat den Aktionen-Tab geöffnet
- **WHEN** die Subtab-Leiste gerendert wird
- **THEN** sind alle fünf Subtabs sichtbar: `releases`, `backups`, `users`, `knowledge`, `audit`

#### Scenario: Redeploy-Website-Button ist vorhanden *(E2E)*
- **GIVEN** ein eingeloggter Admin hat im Aktionen-Tab den Subtab „Releases" geöffnet
- **WHEN** die Seite geladen ist
- **THEN** ist der Button mit `data-testid="redeploy-website-mentolder"` sichtbar und aktiviert

#### Scenario: Backup-Liste lädt fehlerfrei *(E2E)*
- **GIVEN** ein eingeloggter Admin hat im Aktionen-Tab den Subtab „Backups" geöffnet
- **WHEN** der Inhalt lädt
- **THEN** ist kein `.error`-Element sichtbar

#### Scenario: Nutzerliste lädt fehlerfrei *(E2E)*
- **GIVEN** ein eingeloggter Admin hat im Aktionen-Tab den Subtab „Users" geöffnet
- **WHEN** der Inhalt lädt
- **THEN** ist kein `.error`-Element sichtbar

#### Scenario: Knowledge-Collections-Liste lädt fehlerfrei *(E2E)*
- **GIVEN** ein eingeloggter Admin hat im Aktionen-Tab den Subtab „Knowledge" geöffnet
- **WHEN** der Inhalt lädt
- **THEN** ist kein `.error`-Element sichtbar

#### Scenario: Audit-Log-Tab rendert eine Tabelle *(E2E)*
- **GIVEN** ein eingeloggter Admin hat im Aktionen-Tab den Subtab „Audit" geöffnet
- **WHEN** der Inhalt lädt
- **THEN** ist ein `<table>` oder `role=table`-Element sichtbar

---

### Requirement: Dev-Status-Seite mit Tab-Navigation
<!-- e2e: dev-status-tabs.spec.ts -->

The system SHALL provide a `/dev-status` page with a persistent tab bar containing exactly five tabs, SHALL synchronise the active tab with the `?tab=` URL query parameter, and SHALL redirect `/admin/planungsbuero` to `/dev-status?tab=planung`.

#### Scenario: /dev-status öffnet standardmäßig den Factory-Tab *(E2E)*
- **GIVEN** ein Nutzer ruft `/dev-status` ohne Tab-Parameter auf
- **WHEN** die Seite geladen ist
- **THEN** ist der Tab „Factory Floor" aktiv und die URL enthält nicht `tab=planung`

#### Scenario: ?tab=planung aktiviert den Planungsbüro-Tab *(E2E)*
- **GIVEN** ein Nutzer ruft `/dev-status?tab=planung` auf
- **WHEN** die Seite geladen ist
- **THEN** ist der Tab „Planungsbüro" aktiv

#### Scenario: Tab-Wechsel aktualisiert die URL ohne Reload *(E2E)*
- **GIVEN** ein Nutzer befindet sich auf `/dev-status` mit aktivem Factory-Tab
- **WHEN** der Tab „Planungsbüro" angeklickt wird
- **THEN** ändert sich die URL zu einem Pfad mit `tab=planung` und der Tab „Planungsbüro" ist aktiv — ohne Seitenneuladen

#### Scenario: /admin/planungsbuero leitet auf /dev-status?tab=planung weiter *(E2E)*
- **GIVEN** ein Nutzer ruft `/admin/planungsbuero` auf
- **WHEN** der Request verarbeitet wird
- **THEN** wird auf `/dev-status?tab=planung` weitergeleitet

#### Scenario: Tab-Bar wird mit genau 5 Tabs gerendert *(E2E)*
- **GIVEN** ein Nutzer ruft `/dev-status` auf
- **WHEN** die Seite geladen ist
- **THEN** ist `.tab-bar-wrap` sichtbar und enthält genau 5 `.ds-tab`-Elemente

#### Scenario: Tab-Bar ist auf mobilen Geräten (390 px) sichtbar *(E2E)*
- **GIVEN** der Viewport ist auf 390×844 px gesetzt
- **WHEN** `/dev-status` aufgerufen wird
- **THEN** sind `.tab-bar-wrap` und der erste `.ds-tab` sichtbar

#### Scenario: Tab-Wechsel funktioniert auf mobilen Geräten *(E2E)*
- **GIVEN** der Viewport ist auf 390×844 px gesetzt und der Nutzer befindet sich auf `/dev-status`
- **WHEN** der Tab „Planungsbüro" angeklickt wird
- **THEN** ändert sich die URL zu `tab=planung` und der Planungsbüro-Tab ist aktiv

#### Scenario: Admin-Sidebar enthält genau einen Dev-Status-Eintrag *(E2E)*
- **GIVEN** ein Nutzer ruft `/admin` auf
- **WHEN** die Sidebar gerendert wird
- **THEN** enthält `#admin-sidebar` genau einen Link mit `href="/dev-status"` mit dem Text „Dev Status" und keinen Link mit `href="/admin/planungsbuero"`

#### Scenario: Attention-Strip erscheint bei blockiertem Workpiece *(E2E)*
- **GIVEN** ein Nutzer ruft `/dev-status?tab=factory` auf
- **WHEN** ein Workpiece den Status „blocked" hat
- **THEN** wird ein `role=alert`-Element mit einem der Symbole ⛔, ⏱ oder 🧊 angezeigt

#### Scenario: Planungsbüro aktualisiert sich nach Promote-Event *(E2E)*
- **GIVEN** ein Nutzer befindet sich auf `/dev-status?tab=planung`
- **WHEN** das Custom-Event `factory-floor-refreshed` ausgelöst wird
- **THEN** bleibt die Anzahl der `[data-planning-item]`-Elemente stabil oder ändert sich entsprechend dem neuen Stand

---

### Requirement: Readiness-Webhook für Ticket-Abhängigkeiten
<!-- bats: readiness-webhook.bats -->

The system SHALL expose a POST `/api/tickets/:id/readiness` endpoint that requires admin authentication, validates the ticket ID format, checks that the ticket status is `done`, returns appropriate error codes for invalid states, and calls `updateSuccessorReadiness` to propagate readiness to dependent tickets.

#### Scenario: Readiness-API-Endpunkt existiert *(BATS)*
- **GIVEN** das Projekt ist im aktuellen Stand ausgecheckt
- **WHEN** geprüft wird, ob `website/src/pages/api/tickets/[id]/readiness.ts` existiert
- **THEN** ist die Datei vorhanden

#### Scenario: Readiness-Endpunkt erfordert Admin-Authentifizierung *(BATS)*
- **GIVEN** die Readiness-API-Datei ist vorhanden
- **WHEN** der Quellcode auf `isAdmin`-Prüfung untersucht wird
- **THEN** enthält die Datei eine `isAdmin`-Prüfung

#### Scenario: Readiness-Endpunkt ist ein POST-Handler *(BATS)*
- **GIVEN** die Readiness-API-Datei ist vorhanden
- **WHEN** der Quellcode auf den Export-Typ geprüft wird
- **THEN** exportiert die Datei `const POST`

#### Scenario: Readiness-Endpunkt validiert das Ticket-ID-Format *(BATS)*
- **GIVEN** die Readiness-API-Datei ist vorhanden
- **WHEN** der Quellcode auf ID-Validierung untersucht wird
- **THEN** enthält der Code eine Regex-Prüfung auf das Format `T\d{6}`

#### Scenario: Readiness-Endpunkt prüft Ticket-Status *(BATS)*
- **GIVEN** die Readiness-API-Datei ist vorhanden
- **WHEN** der Quellcode auf Status-Prüfung untersucht wird
- **THEN** enthält der Code einen Vergleich auf `status === 'done'`

#### Scenario: Nicht-done-Ticket ergibt HTTP 409 *(BATS)*
- **GIVEN** die Readiness-API-Datei ist vorhanden
- **WHEN** der Quellcode auf den 409-Statuscode untersucht wird
- **THEN** ist ein `409`-Rückgabewert für nicht-terminale Tickets vorhanden

#### Scenario: Unbekanntes Ticket ergibt HTTP 404 *(BATS)*
- **GIVEN** die Readiness-API-Datei ist vorhanden
- **WHEN** der Quellcode auf den 404-Statuscode untersucht wird
- **THEN** ist ein `404`-Rückgabewert für nicht gefundene Tickets vorhanden

#### Scenario: Unauthentifizierter Aufruf ergibt HTTP 401 *(BATS)*
- **GIVEN** die Readiness-API-Datei ist vorhanden
- **WHEN** der Quellcode auf den 401-Statuscode untersucht wird
- **THEN** ist ein `401`-Rückgabewert für unauthentifizierte Aufrufe vorhanden

#### Scenario: Readiness-Endpunkt ruft updateSuccessorReadiness auf *(BATS)*
- **GIVEN** die Readiness-API-Datei ist vorhanden
- **WHEN** der Quellcode auf den Funktionsaufruf untersucht wird
- **THEN** enthält die Datei einen Aufruf von `updateSuccessorReadiness`

#### Scenario: Readiness-Lib exportiert updateSuccessorReadiness *(BATS)*
- **GIVEN** die Datei `website/src/lib/ticket-readiness.ts` ist vorhanden
- **WHEN** der Quellcode auf den Export untersucht wird
- **THEN** exportiert die Datei `export async function updateSuccessorReadiness`

#### Scenario: Readiness-Lib exportiert allPredecessorsDone *(BATS)*
- **GIVEN** die Datei `website/src/lib/ticket-readiness.ts` ist vorhanden
- **WHEN** der Quellcode auf den Export untersucht wird
- **THEN** exportiert die Datei `export async function allPredecessorsDone`

#### Scenario: updateSuccessorReadiness setzt abhaengigkeiten_klar im JSONB *(BATS)*
- **GIVEN** die Datei `website/src/lib/ticket-readiness.ts` ist vorhanden
- **WHEN** der Quellcode auf den Readiness-JSONB-Key untersucht wird
- **THEN** enthält die Datei den Bezeichner `abhaengigkeiten_klar`

#### Scenario: TypeScript-Syntax der Readiness-Datei ist valide *(BATS)*
- **GIVEN** Node.js ist verfügbar
- **WHEN** `node --check` auf `readiness.ts` ausgeführt wird
- **THEN** gibt der Befehl keinen Fehler zurück

---

### Requirement: TicketRow rendert Titel als direkten Link

The system SHALL render the ticket title in `TicketRow.svelte` as an `<a class="title-link" href="/admin/tickets/{ticket.id}">` element, styled as a link (inherits color, no underline; underline on hover).

#### Scenario: Title-Click navigiert zur Ticket-Detail-Seite

- **GIVEN** ein `TicketRow` für `ticket.id='t1'` ist gerendert
- **WHEN** der Nutzer auf den Titel klickt
- **THEN** navigiert der Browser zu `/admin/tickets/t1` (kein Drawer öffnet sich)

### Requirement: CockpitTable reicht keinen Drawer-Handler mehr durch

The system SHALL NOT define or pass an `onOpenDrawer` prop on `TicketRow` or `CockpitTable`; the corresponding test for the title-click drawer flow MUST be removed.

### Requirement: Cockpit mountet keinen TicketDrawer mehr

The system SHALL NOT mount a `TicketDrawer` component in `Cockpit.svelte`, SHALL NOT import `TicketDrawer`, and SHALL NOT track `drawerTicket` / `drawerOpen` state. The `TicketCreateModal` mount is preserved.

### Requirement: cockpitStore enthält keine aktive-Ticket-State

The system SHALL NOT export a `setActiveTicket` function or carry an `activeTicket: string | null` field on `CockpitState`; the corresponding unit tests SHALL be removed.

### Requirement: TicketDrawer-Dateien sind gelöscht

The system SHALL delete `website/src/components/admin/TicketDrawer.svelte` and its unit-test file, and `website/src/components/admin/TicketDrawerContent.svelte` if it exists; no import of `TicketDrawer` SHALL remain in any `.svelte`, `.ts`, or `.astro` file.

---

### Requirement: ContainerDor.lastenheftLocked field

The system SHALL derive a `lastenheftLocked` boolean on `ContainerDor` from the ticket's
`readiness.lastenheft_locked` field so that UI components can render the correct label and
badge without accessing raw readiness data directly.

#### Scenario: Ticket with lastenheft_locked=true

- **GIVEN** a container ticket whose `readiness` object has `lastenheft_locked: true`
- **WHEN** `getContainerDor()` is called for that ticket
- **THEN** the returned `ContainerDor` has `lastenheftLocked === true`

#### Scenario: Ticket with lastenheft_locked=false or absent

- **GIVEN** a container ticket whose `readiness` object has `lastenheft_locked: false` or the field is absent
- **WHEN** `getContainerDor()` is called
- **THEN** the returned `ContainerDor` has `lastenheftLocked === false`

### Requirement: TicketSpecProgress checklist island

The system SHALL render a 10-point readiness checklist for container tickets on the
fullscreen ticket detail page, showing a green checkmark (✓) for met criteria and an
amber circle (○) for unmet criteria, with a header summarising `Fertig: X/10` and a
progress bar.

#### Scenario: Checklist reflects ticket readiness

- **GIVEN** a container ticket with a description, a locked Lastenheft, and a plan but no PR
- **WHEN** the `TicketSpecProgress` island renders
- **THEN** the items for "Beschreibung", "Lastenheft verriegelt", and "Plan vorhanden" are green
- **AND** the item for "PR erstellt" is amber
- **AND** the header reads `Fertig: X/10` where X matches the count of green items

#### Scenario: No checklist for non-container tickets

- **GIVEN** a ticket that is not a container type
- **WHEN** the fullscreen ticket detail page renders
- **THEN** no `TicketSpecProgress` island is present

### Requirement: Dynamic Pflichtenheft/Lastenheft label with lock badge

The system SHALL render the requirement-list section in `ContainerDorPanel` with a heading
that reads "Lastenheft" when the Lastenheft is locked and "Pflichtenheft" otherwise, plus a
colour-coded badge indicating the lock state, and an amber fallback when the list is empty.

#### Scenario: Locked Lastenheft shows green badge

- **GIVEN** a `ContainerDor` with `lastenheftLocked === true`
- **WHEN** `ContainerDorPanel` renders
- **THEN** the section heading is "Lastenheft"
- **AND** a green badge reading "🔒 verriegelt · KI-bereit" is visible

#### Scenario: Unlocked shows amber draft badge

- **GIVEN** a `ContainerDor` with `lastenheftLocked === false`
- **WHEN** `ContainerDorPanel` renders
- **THEN** the section heading is "Pflichtenheft"
- **AND** an amber badge reading "✏ Entwurf" is visible

#### Scenario: Empty requirements list shows warning

- **GIVEN** a `ContainerDor` whose requirements list is empty
- **WHEN** `ContainerDorPanel` renders
- **THEN** an amber warning "⚠ Keine Anforderungen erfasst" is shown instead of a blank panel

### Requirement: Fullscreen section ordering with spec progress island

The system SHALL render sections in the fullscreen ticket detail page in the following
canonical order: Beschreibung → TicketSpecProgress → ContainerDorPanel → TicketPlanPanel →
ContainerChildrenList → GrillingStepper → ProjectQuestionnairesPanel → Verknüpfungen →
Verlauf → Anhänge; and the page SHALL remain within 400 lines of code.

#### Scenario: Correct section order

- **GIVEN** a container ticket with all relevant data present
- **WHEN** the fullscreen detail page renders
- **THEN** `TicketSpecProgress` appears immediately after the description block
- **AND** `GrillingStepper` appears after `ContainerChildrenList`
- **AND** no component appears more than once (GrillingStepper count == 1, ProjectQuestionnairesPanel count == 1)

---

### Requirement: CockpitSidekickView component

The system SHALL provide a `CockpitSidekickView` Svelte 5 component that fetches the
portfolio from `/api/admin/cockpit/portfolio`, supports text filtering, an active-only
toggle (persisted in `localStorage`), and collapsed-group state, and navigates to a
feature on `pickFeature(extId)`.

#### Scenario: Portfolio loads on mount

- **GIVEN** the CockpitSidekickView is rendered in the sidekick drawer
- **WHEN** the component mounts
- **THEN** a GET request is made to `/api/admin/cockpit/portfolio`
- **AND** the returned products are displayed according to the current filter state

#### Scenario: cockpit:portfolio-mutated triggers reload

- **GIVEN** CockpitSidekickView is mounted and portfolio data is shown
- **WHEN** a `cockpit:portfolio-mutated` custom event is dispatched on the window
- **THEN** `loadPortfolio()` is called again and the view refreshes

#### Scenario: activeOnly toggle persisted across sessions

- **GIVEN** the user enables the active-only toggle in CockpitSidekickView
- **WHEN** the page is reloaded and the sidekick cockpit view is opened
- **THEN** the active-only toggle is still enabled (read from `localStorage['cockpit:activeOnly']`)

### Requirement: 'cockpit' SidekickView union entry

The system SHALL include `'cockpit'` in the `SidekickView` union type and in `KNOWN_VIEWS`
so that `parseNavigateEvent` and the nudge system can route to the cockpit sidekick view
without falling through to the default case.

#### Scenario: parseNavigateEvent accepts 'cockpit'

- **GIVEN** a postMessage event with `{ type: 'navigate', view: 'cockpit' }`
- **WHEN** `parseNavigateEvent` processes the message
- **THEN** the returned view is `'cockpit'`
- **AND** no "unknown view" warning is emitted

### Requirement: PortalSidekick and SidekickHome cockpit wiring

The system SHALL route the `'cockpit'` view to `CockpitSidekickView` inside
`PortalSidekick`, display "Projekt-Cockpit" as the drawer title for that view, and present
a home tile with `id: 'cockpit'` and subtitle "Container & Features" in `SidekickHome`.

#### Scenario: Cockpit tile visible on SidekickHome

- **GIVEN** the sidekick drawer is open and shows the home screen
- **WHEN** the user sees item 04
- **THEN** it has the label for "Projekt-Cockpit" and subtitle "Container & Features"
- **AND** clicking it transitions the drawer to the `'cockpit'` view

#### Scenario: PortalSidekick renders CockpitSidekickView

- **GIVEN** the sidekick drawer is open with `view === 'cockpit'`
- **WHEN** the drawer body is rendered
- **THEN** a `<CockpitSidekickView />` component is mounted
- **AND** the drawer header reads "Projekt-Cockpit"

### Requirement: Cockpit.svelte decoupled from CockpitSidebar via event bridge

The system SHALL remove the direct `CockpitSidebar` import from `Cockpit.svelte` and
replace it with a window event bridge listening for `cockpit:feature-selected` and
`cockpit:portfolio-mutated`, so that the cockpit layout no longer contains a sidebar column.

#### Scenario: cockpit:feature-selected event triggers feature selection

- **GIVEN** Cockpit.svelte is mounted without a CockpitSidebar
- **WHEN** a `cockpit:feature-selected` event is dispatched on the window with `{ detail: { extId: 'F001' } }`
- **THEN** the feature with extId 'F001' is selected in the cockpit main area
- **AND** the event listener is cleaned up when the component is destroyed

---

### Requirement: Centralized logging dashboards are reachable from the admin UI

The admin Platform Control Center SHALL surface the four Grafana dashboards provisioned by the centralized-logging change (UIDs `log-explorer`, `api-errors`, `traefik-access`, `keycloak-audit`) through a `CentralizedLoggingPanel` component rendering a 2×2 card grid. Each card SHALL link to `{grafanaUrl}/d/{uid}` in a new tab (`target="_blank"`, `rel="noopener noreferrer"`), and the Grafana base URL SHALL be derived from `PROD_DOMAIN` (no new env var, no brand-domain literal).

#### Scenario: Operator opens a logging dashboard from the Observability tab

- **GIVEN** an admin is on `/admin/platform`
- **WHEN** they select the "Observability" tab
- **THEN** they see four dashboard cards above the live pod-log stream
- **AND** each card's link resolves to `{grafanaUrl}/d/{uid}` for its dashboard and opens in a new tab

### Requirement: Platform Control Center matches the Cockpit design language

The Platform Control Center SHALL be visually consistent with the Cockpit: the page header SHALL be rendered by `AdminPageHeader` in the Astro shell (`platform.astro`, 88rem max-width, cluster badge in the `actions` slot) rather than inside the Svelte component, and the `PlatformHub` tab bar plus the `LogsTab` and `DienstTab` ops panels SHALL resolve all colors through the `var(--admin-*)` design tokens instead of raw Tailwind color utilities.

#### Scenario: Header and tokens align with the Cockpit

- **GIVEN** an admin compares `/admin/platform` with `/admin/cockpit`
- **WHEN** both pages render
- **THEN** the platform header is produced by `AdminPageHeader` and is visually identical in structure to the cockpit header
- **AND** no raw `bg-gray-*`, `text-gray-*`, `text-green-*`, `text-yellow-*`, or `text-red-*` color utilities remain in `LogsTab.svelte` or `DienstTab.svelte`
