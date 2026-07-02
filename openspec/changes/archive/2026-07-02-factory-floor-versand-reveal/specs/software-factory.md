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
`floor-shipped`, `floor-slots`, `floor-workpiece`, `floor-detail`, …) SHALL remain unchanged, with
the exception of `floor-provider-status`, which SHALL be removed: the Factory Floor SHALL NOT
render a provider-health-telemetry widget on the homepage view. The Shipped ("Versand") lane
SHALL render, per item, only the ticket number, the relative-time badge, and the optional PR
badge by default; the ticket title SHALL be hidden until the ticket number is clicked, at which
point the title SHALL toggle visible for that item only (independent per-item state — no
accordion, no effect on other items' visibility, and no navigation or detail-panel side effect).

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

#### Scenario: Provider-Status-Widget ist entfernt
- **GIVEN** `/admin/pipeline` ist geladen
- **WHEN** die Seite gerendert wird
- **THEN** `[data-testid="floor-provider-status"]` existiert nicht im DOM

#### Scenario: Versand-Zeile zeigt standardmäßig nur die Ticketnummer
- **GIVEN** mindestens ein Ticket ist in der Versand-Spalte (`floor-shipped`)
- **WHEN** die Seite gerendert wird, ohne dass die Zeile angeklickt wurde
- **THEN** die Ticketnummer, der relTime-Badge und (falls vorhanden) der PR-Badge sind sichtbar; der Ticket-Titel ist nicht sichtbar

#### Scenario: Klick auf die Ticketnummer togglet nur den Titel dieses Tickets
- **GIVEN** die Versand-Spalte zeigt mindestens zwei Tickets, keines mit sichtbarem Titel
- **WHEN** die Ticketnummer des ersten Tickets angeklickt wird
- **THEN** der Titel des ersten Tickets wird sichtbar, der Titel des zweiten Tickets bleibt verborgen; ein erneuter Klick auf die Ticketnummer des ersten Tickets blendet dessen Titel wieder aus
