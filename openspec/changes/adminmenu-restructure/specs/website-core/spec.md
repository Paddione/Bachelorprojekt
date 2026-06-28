## MODIFIED Requirements

### Requirement: Admin-Sidebar-Navigation
Die Admin-Sidebar MUSS folgende Navigation bereitstellen:

**Immer sichtbar (kein Label):**
- Dashboard (`/admin`)
- Cockpit (`/admin/cockpit`)
- Postfach (`/admin/inbox`, mit Pending-Badge)

**Sektion "Geschäft":**
- Klienten (`/admin/clients`)
- Studio (`/admin/coaching/studio`)
- Fakturierung (`/admin/rechnungen`)

**Sektion "Werkstatt" (Akkordeon):**
- Content Hub, Wissensbasis, Assets, 3D Generator, App-Katalog, KI-Konfig., Prompts, Systemtest, Content-DB

**Sektion "Infrastruktur":**
- Einstellungen, Systembrett (extern), Live-Stream

Die folgenden Items MÜSSEN aus der Sidebar entfernt werden: Mitglieder, Mandate, Kontierung, Plattform Hub, Dev Status, DORA, Repo Health.

#### Scenario: Studio-Link in Sidebar
- **WHEN** the admin views the sidebar
- **THEN** they see "Studio" linking to `/admin/coaching/studio` in the Geschäft section

#### Scenario: Entfernte Items nicht sichtbar
- **WHEN** the admin views the sidebar
- **THEN** Mitglieder, Mandate, Kontierung, Plattform Hub, Dev Status, DORA und Repo Health sind nicht als direkte Sidebar-Links sichtbar

## ADDED Requirements

### Requirement: Dashboard-Shortcuts Infrastruktur-Gruppe
Das Admin-Dashboard (`/admin`) MUSS eine neue Shortcut-Gruppe "Infrastruktur & Dev" anzeigen mit Karten für: Plattform Hub, Dev Status, DORA, Repo Health (letzteres nur wenn `!isKore`).

#### Scenario: Infrastruktur-Shortcuts auf Dashboard
- **WHEN** the admin navigates to `/admin`
- **THEN** they see shortcut cards for Plattform Hub, Dev Status, DORA, and Repo Health (mentolder only)

#### Scenario: Repo Health nur für mentolder
- **WHEN** the admin is on the korczewski brand
- **THEN** the Repo Health shortcut card is not shown
