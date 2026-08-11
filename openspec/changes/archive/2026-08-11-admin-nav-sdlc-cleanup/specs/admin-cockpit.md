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

### Requirement: Cockpit Ticket-Expand-Row

Die Cockpit-interne Ticketliste behält ihr Akkordeon-Verhalten: es SHALL weiterhin höchstens
eine Zeile gleichzeitig ausgeklappt sein, und der ausgeklappte Zustand SHALL nicht
persistiert werden. Dieses Requirement ist von der Entfernung des **Sidebar**-Akkordeons
nicht berührt — es beschreibt eine andere Oberfläche innerhalb der SDLC-Console.

#### Scenario: Ticket-Expand bleibt ein Akkordeon

- **GIVEN** die Cockpit-Ticketliste mit einer ausgeklappten Zeile
- **WHEN** eine zweite Zeile ausgeklappt wird
- **THEN** ist die erste Zeile wieder eingeklappt

---

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

#### Scenario: Attention-Strip erscheint bei blockiertem Workpiece *(E2E)*
- **GIVEN** ein Nutzer ruft `/admin/pipeline?tab=floor` auf
- **WHEN** ein Workpiece den Status „blocked" hat
- **THEN** wird ein `role=alert`-Element mit einem der Symbole ⛔, ⏱ oder 🧊 angezeigt

#### Scenario: Planung aktualisiert sich nach Promote-Event *(E2E)*
- **GIVEN** ein Nutzer befindet sich auf `/admin/pipeline?tab=planung`
- **WHEN** das Custom-Event `factory-floor-refreshed` ausgelöst wird
- **THEN** bleibt die Anzahl der `[data-planning-item]`-Elemente stabil oder ändert sich entsprechend dem neuen Stand

<!-- T003826: Das Szenario "Admin-Sidebar enthält genau einen Pipeline-Eintrag" entfiel.
     Es verlangte in #admin-sidebar einen Link auf /admin/pipeline — ein Pfad, den
     redirect-map.ts nach /sdlc/pipeline leitet und den build-target.mjs bei
     BUILD_TARGET=prod aus dem Manifest entfernt. Der Link existierte zudem schon vor
     dieser Änderung nicht mehr in AdminSidebarNav.astro. Die Aussagen über die
     Pipeline-SEITE selbst bleiben unverändert — sie gilt in der SDLC-Console. -->

---

## ADDED Requirements

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
