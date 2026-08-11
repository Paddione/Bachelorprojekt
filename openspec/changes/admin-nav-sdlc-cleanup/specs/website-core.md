## MODIFIED Requirements

### Requirement: Admin-Sidebar-Navigation

Die Admin-Sidebar SHALL ausschließlich Einträge führen, deren Zielroute im
Produktions-Build (`BUILD_TARGET=prod`) vorhanden ist. Ein Eintrag, dessen `href` von
`website/src/middleware/redirect-map.ts` nach `/sdlc/` umgeleitet wird, SHALL nicht in der
Sidebar erscheinen — `website/src/integrations/build-target.mjs` entfernt diese Routen aus
dem prod-Manifest, der Eintrag führte also ins Leere.

Die Navigation SHALL wie folgt gegliedert sein:

**Ohne Sektionslabel:**
- Dashboard (`/admin`)
- Postfach (`/admin/inbox`, mit Pending-Badge)

**Sektion „Geschäft":**
- Klienten (`/admin/clients`)
- Sessions (`/admin/coaching/sessions`)
- Fakturierung (`/admin/rechnungen`)

**Sektion „Inhalte":**
- Content Hub (`/admin/inhalte`)
- Wissensbasis (`/admin/wissen`)
- Content-DB (`/admin/content-db`)

**Sektion „Werkzeuge":**
- Assets (`/admin/assets`)
- 3D Generator (`/admin/asset-generation`)
- Systembrett (extern)

**Sektion „System":**
- Einstellungen (`/admin/einstellungen/benachrichtigungen`)

Die Sektion „Werkstatt" und ihr Akkordeon-Verhalten entfallen: nach dem Entfernen der
SDLC-Einträge verbleiben zu wenige Einträge, als dass ein Aufklapp-Mechanismus etwas
verbergen würde. Alle Sektionen SHALL dauerhaft sichtbar sein.

Die folgenden Einträge SHALL nicht in der Sidebar erscheinen, weil ihre Zielseiten nur unter
`website/src/pages/sdlc/` existieren und im prod-Build gefiltert werden: Cockpit,
App-Katalog, KI-Konfig., Prompts, Systemtest, Repo Health. Ebenfalls nicht erscheinen SHALL:
Mitglieder, Mandate, Kontierung, Plattform Hub, Dev Status, DORA.

#### Scenario: Kein Sidebar-Eintrag zeigt auf eine nach /sdlc/ umgeleitete Route

- **GIVEN** die Redirect-Tabelle in `website/src/middleware/redirect-map.ts`
- **WHEN** jeder nicht-externe `href` der Admin-Sidebar gegen diese Tabelle aufgelöst wird
- **THEN** löst kein `href` auf ein Ziel mit dem Präfix `/sdlc/` auf

#### Scenario: Jeder Sidebar-Eintrag hat eine existierende Zielseite

- **GIVEN** die Admin-Sidebar mit ihren nicht-externen Einträgen
- **WHEN** für jeden `href` die zugehörige Seite unter `website/src/pages/` gesucht wird
- **THEN** existiert zu jedem Eintrag eine Datei oder ein Verzeichnis unter
  `website/src/pages/admin/`

#### Scenario: Sidebar führt die vier benannten Sektionen

- **GIVEN** die gerenderte Admin-Sidebar
- **WHEN** die Sektionslabel gelesen werden
- **THEN** erscheinen „Geschäft", „Inhalte", „Werkzeuge" und „System"
- **AND** es erscheint kein Label „Werkstatt"

#### Scenario: Sektionen sind ohne Interaktion sichtbar

- **GIVEN** die Admin-Sidebar wird frisch geladen
- **WHEN** keine Interaktion stattgefunden hat
- **THEN** sind alle Einträge aller Sektionen sichtbar, ohne dass ein Aufklappen nötig ist
