## MODIFIED Requirements

### Requirement: AdminLayout-Navigation enthält nur freigegebene Routen

The system SHALL expose in the admin sidebar only routes that exist in the production build
(`BUILD_TARGET=prod`). A nav entry whose `href` is mapped to a `/sdlc/` target by
`website/src/middleware/redirect-map.ts` SHALL NOT appear, because
`website/src/integrations/build-target.mjs` removes those routes from the production
manifest — the entry would resolve to a route absent from the image.

Konkret SHALL die Sidebar keine Einträge auf `/admin/systemtest`, `/admin/cockpit`,
`/admin/pipeline`, `/admin/repohealth`, `/admin/prompts`, `/admin/ki-konfiguration` und
`/admin/app-catalog` führen. Der Guard SHALL das Auflösungsergebnis prüfen (führt der `href`
über die Redirect-Tabelle in eine `/sdlc/`-Route?) und nicht die Schreibweise einzelner
Klassennamen oder Sektionslabel in der Quelldatei.

#### Scenario: Kein Nav-Eintrag löst auf eine /sdlc/-Route auf

- **GIVEN** die Redirect-Tabelle in `website/src/middleware/redirect-map.ts`
- **WHEN** jeder nicht-externe `href` der Admin-Sidebar dagegen aufgelöst wird
- **THEN** trägt kein Auflösungsergebnis das Präfix `/sdlc/`

#### Scenario: Guard benennt den Verursacher

- **GIVEN** ein Sidebar-Eintrag zeigt auf einen nach `/sdlc/` umgeleiteten Pfad
- **WHEN** der Guard läuft
- **THEN** schlägt er fehl und nennt den betroffenen `href`

#### Scenario: Guard ist unempfindlich gegen Umformatierung

- **GIVEN** die Sidebar-Quelldatei wird umformatiert, ohne dass sich ein `href` ändert
  (Einrückung, Reihenfolge der Objekt-Schlüssel, Umbenennung eines Sektionslabels)
- **WHEN** der Guard läuft
- **THEN** bleibt sein Ergebnis unverändert

---

### Requirement: Admin-Sidebar-Struktur ohne Akkordeon

Die Admin-Sidebar SHALL ihre Sektionen dauerhaft sichtbar führen. Nach dem Entfernen der
SDLC-Einträge verbleiben zu wenige Einträge, als dass ein Aufklapp-Mechanismus etwas
verbergen würde; das Akkordeon der vormaligen Sektion „Werkstatt" entfällt samt seiner
Steuerelemente (`sidebar-group-btn`, `accordion-arrow`, `is-collapsed`) und des zugehörigen
Click-Listeners.

Assertions, die diese Klassennamen oder die Sektionslabel „Werkstatt" und „Infrastruktur"
per `grep` in der Quelldatei suchen, entfallen ersatzlos. Sie waren Source-Grep-Assertions
im Sinne von `CLAUDE.md` § Test-Resultats-Konvention (T002448-M4): sie belegten, dass eine
Zeichenkette in einer Datei steht, nicht dass Navigation funktioniert.

#### Scenario: Alle Einträge sind ohne Interaktion sichtbar

- **GIVEN** die Admin-Sidebar wird frisch geladen
- **WHEN** keine Interaktion stattgefunden hat
- **THEN** sind die Einträge aller Sektionen sichtbar, ohne dass ein Aufklappen nötig ist

---

### Requirement: Cockpit Ticket-Expand-Row

Die Cockpit-interne Ticketliste behält ihr Akkordeon-Verhalten: es SHALL weiterhin höchstens
eine Zeile gleichzeitig ausgeklappt sein, und der ausgeklappte Zustand SHALL nicht
persistiert werden. Dieses Requirement ist von der Entfernung des **Sidebar**-Akkordeons
nicht berührt — es beschreibt eine andere Oberfläche innerhalb der SDLC-Console.

#### Scenario: Ticket-Expand bleibt ein Akkordeon

- **GIVEN** die Cockpit-Ticketliste mit einer ausgeklappten Zeile
- **WHEN** eine zweite Zeile ausgeklappt wird
- **THEN** ist die erste Zeile wieder eingeklappt

## REMOVED Requirements

### Requirement: Admin-Sidebar enthält genau einen Pipeline-Eintrag

**Grund der Entfernung:** Das Szenario verlangte in `#admin-sidebar` genau einen Link mit
`href="/admin/pipeline"` und dem Text „Pipeline". Dieser Pfad wird von `redirect-map.ts` nach
`/sdlc/pipeline` umgeleitet und ist im Produktions-Build nicht vorhanden. Der Eintrag
existiert in `AdminSidebarNav.astro` bereits heute nicht mehr als eigener Link (nur noch als
`matches`-Eintrag des Cockpit-Eintrags) — das Szenario beschrieb damit schon vor dieser
Änderung einen Zustand, den es nicht gab.

Es ist als `*(E2E)*` markiert und lief daher nur im nächtlichen Playwright-Lauf gegen die
Live-Brands, nicht im PR-Gate; das erklärt, warum die Abweichung unbemerkt bleiben konnte.
