## MODIFIED Requirements

### Requirement: FA-SF: Factory Floor Hallendarstellung
<!-- e2e: fa-factory-floor.spec.ts -->

The system SHALL render the Factory Floor dashboard at `/admin/pipeline` (default tab) with hall
sections (Leitstand, Hall, Shipped, Slots) and open a detail panel when a workpiece is clicked.
The conveyor presentation SHALL be the only floor view: the kanban view mode, its toggle, and the
`localStorage['ff-view']` preference SHALL be removed (a persisted `ff-view=kanban` value is
ignored without error). The floor SHALL follow the admin token base: the kill-switch card renders
as an Ink/Brass status card, action buttons (Factory/Manuell/Promoten) render as Brass pills, and
stations are numbered with mono digits (`01`–`06`), hairline rules, and serif station names. All
existing `data-testid` attributes (`factory-floor`, `floor-leitstand`, `floor-hall`,
`floor-shipped`, `floor-slots`, `floor-workpiece`, `floor-detail`, …) SHALL remain unchanged.

#### Scenario: Hallen-Sektionen werden gerendert *(E2E)*
- **GIVEN** `/admin/pipeline` ist abrufbar und Admin-Auth ist aktiv
- **WHEN** die Seite geladen wird
- **THEN** `[data-testid="factory-floor"]`, `floor-leitstand`, `floor-hall`, `floor-shipped` und `floor-slots` sind alle sichtbar

#### Scenario: Klick auf ein Werkstück öffnet das Detail-Panel *(E2E)*
- **GIVEN** mindestens ein aktives Workpiece ist in der Halle
- **WHEN** das erste `[data-testid="floor-workpiece"]` angeklickt wird
- **THEN** `[data-testid="floor-detail"]` wird sichtbar

#### Scenario: Kein Kanban-Toggle mehr
- **GIVEN** `/admin/pipeline` ist geladen und `localStorage['ff-view']` enthält `kanban`
- **WHEN** der Floor-Tab gerendert wird
- **THEN** wird die Conveyor-Ansicht angezeigt und kein View-Toggle-Control ist vorhanden

### Requirement: FA-49: Factory Observability Dashboard
<!-- e2e: fa-49-factory-observability.spec.ts -->

The system SHALL surface factory observability (cost/token/provider KPIs and phase metrics)
together with token-budget management as the "Kosten" tab of `/admin/pipeline`, protected behind
admin authentication, and SHALL return a JSON response from `/api/factory-observability` with
`brand`, `timeline`, and `fetchedAt` fields. The former standalone pages
`/admin/factory-observability` and `/admin/factory-budget` SHALL respond with a redirect to
`/admin/pipeline?tab=kosten`. Chart and badge colors on the Kosten tab SHALL come exclusively
from `factory-chart-colors.ts` (no local `PHASE_COLORS` copies, no hardcoded hex values).

#### Scenario: T1: Kosten-Tab lädt mit KPI-Cards für Admin *(E2E)*
- **GIVEN** `E2E_ADMIN_PASS` ist gesetzt (Admin-Auth vorhanden)
- **WHEN** `/admin/pipeline?tab=kosten` aufgerufen wird
- **THEN** die Kosten-KPI-Kacheln und die Budget-Limit-Verwaltung sind sichtbar

#### Scenario: T2: API /api/factory-observability gibt JSON mit brand, timeline, fetchedAt *(E2E)*
- **GIVEN** der API-Endpunkt ist erreichbar (kein 401)
- **WHEN** ein GET-Request an `/api/factory-observability` gesendet wird
- **THEN** Status 200; Body hat Felder `brand`, `timeline` (Array) und `fetchedAt`

#### Scenario: T3: Alt-Routen leiten auf den Kosten-Tab weiter *(E2E)*
- **GIVEN** ein Browser mit Admin-Session
- **WHEN** `/admin/factory-observability` oder `/admin/factory-budget` aufgerufen wird
- **THEN** landet der Browser auf `/admin/pipeline?tab=kosten`

### Requirement: FA-MOBILE: Factory Floor Mobile-Parität
<!-- e2e: fa-mobile-factory.spec.ts -->

The system SHALL render the Factory Floor on mobile viewports (375×812) as a bottom-sheet detail
panel with backdrop and ≥44px close button, ensure content padding so the last loading-dock item
is not obscured by the tab bar, provide 6 horizontally-scrollable outer tabs on
`/admin/pipeline`, 10 inner mobile-station tabs with dot indicators, and render the Leitstand
grid with 8 cards without horizontal overflow.

#### Scenario: FA-MOBILE-01: Detail-Panel öffnet als Bottom-Sheet mit Backdrop und 44px Close-Button *(E2E)*
- **GIVEN** ein Mobile-Viewport (375×812) und ein gestufter Floor-Artikel ist vorhanden
- **WHEN** der Artikel-Button geklickt wird
- **THEN** `[data-testid="floor-detail"]` ist sichtbar, dessen Unterkante > 700px; `.detail-panel__backdrop` ist sichtbar; `.detail-panel__close` ist ≥44×44px; Klick auf Backdrop schließt das Panel

#### Scenario: FA-MOBILE-02: Letztes Laderampe-Item nicht von TabBar verdeckt *(E2E)*
- **GIVEN** ein Mobile-Viewport und der zweite Tab ist aktiv
- **WHEN** `[data-testid="floor-loadingdock"]` geladen ist und Items vorhanden sind
- **THEN** Unterkante des letzten Items ≤ Oberkante der TabBar + 4px (Toleranz)

#### Scenario: FA-MOBILE-03: Alle 6 Pipeline-Outer-Tabs via Horizontal-Scroll erreichbar *(E2E)*
- **GIVEN** ein Mobile-Viewport auf `/admin/pipeline`
- **WHEN** die Tab-Leiste horizontal gescrollt und alle 6 Outer-Tabs angeklickt werden
- **THEN** jeder Tab wird aktiv

#### Scenario: FA-MOBILE-04: Dot-Indikatoren aktualisieren sich bei MobileTabBar-Tap *(E2E)*
- **GIVEN** ein Mobile-Viewport und 10 Dot-Indikatoren sind vorhanden
- **WHEN** der dritte `.mobile-tab-bar__tab` angeklickt wird
- **THEN** `dots.nth(2)` hat Klasse `active`; `dots.first()` hat nicht mehr `active`

#### Scenario: FA-MOBILE-05: Alle 10 Stationen via MobileTabBar erreichbar *(E2E)*
- **GIVEN** ein Mobile-Viewport und 10 `.mobile-tab-bar__tab`-Elemente
- **WHEN** jeder Tab angeklickt wird
- **THEN** die gemappten Spalten (`staged`, `backlog`, `qs`, `done`) erhalten die Klasse `mobile-visible`
