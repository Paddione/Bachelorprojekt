# projekttickets-cockpit

<!-- merged from change delta projekttickets-cockpit.md on 2026-06-21 -->

## Purpose

### Requirement: Container-Vollansicht für project/feature-Tickets

Das System SHALL auf `/admin/tickets/[id]` für Tickets mit `type ∈ {project, feature}` eine aggregierte Container-Vollansicht rendern, die Rollup-Breakdown, Plan, Definition of Ready und die nach Status gruppierte Kind-Liste an einem Ort zeigt. Für `task`/`bug`-Leaves SHALL die Seite unverändert bleiben.

#### Scenario: Feature-Container zeigt alle Sektionen

- **GIVEN** ein eingeloggter Admin öffnet ein `feature`-Ticket mit Rollup-Daten, einem Plan und gesetzten DoR-Feldern
- **WHEN** die Seite `/admin/tickets/[id]` SSR-gerendert wird
- **THEN** erscheinen der Rollup-Header (Fortschritt, Breakdown, Health), das Plan-Panel und das DoR-Panel sowie die nach Status gruppierte Kind-Liste

#### Scenario: Task-Leaf zeigt keine Container-Sektionen

- **GIVEN** ein eingeloggter Admin öffnet ein `task`-Ticket
- **WHEN** die Seite gerendert wird
- **THEN** erscheinen weder Rollup-Header noch DoR-Panel; die Seite verhält sich wie zuvor

#### Scenario: Fehlende Datenquelle blendet ihre Sektion aus (fail-soft)

- **GIVEN** ein `feature`-Ticket ohne Plan und ohne Rollup-Zeile
- **WHEN** die Container-Loader fehlschlagen oder `null` liefern
- **THEN** wird die jeweilige Sektion ausgeblendet und die Seite bricht nicht

## Requirements

### Requirement: Container-Datenquellen in reinem pg-Modul

Das System SHALL `getContainerRollup`, `getTicketPlan` und `getContainerDor` in `website/src/lib/tickets/container-detail.ts` bereitstellen — einem reinen pg-Modul ohne Svelte-/UI-Import. `admin.ts` und `cockpit-db.ts` SHALL unverändert bleiben. `getTicketPlan` SHALL die Spalte `content` ausschließlich für genau ein `ticket_id` selektieren.

#### Scenario: getContainerRollup liest die View per Container-uuid

- **GIVEN** ein Container mit zwei Leaf-Tickets (eins `done`, eins `blocked`)
- **WHEN** `getContainerRollup(brand, containerId)` mit der Ticket-uuid aufgerufen wird
- **THEN** liefert es `{ total: 2, done: 1, blocked: 1, pctDone: 50, health: 'red' }`

#### Scenario: getContainerRollup ist brand-isoliert

- **GIVEN** ein Container der Brand `mentolder`
- **WHEN** `getContainerRollup('korczewski', containerId)` aufgerufen wird
- **THEN** liefert es `null`

#### Scenario: getTicketPlan lädt den neuesten Plan gefiltert

- **GIVEN** ein Ticket mit zwei Plänen (älter + neuer)
- **WHEN** `getTicketPlan(brand, ticketId)` aufgerufen wird
- **THEN** liefert es nur den neuesten Plan (slug/branch/prNumber/content) für genau dieses `ticket_id`; ohne Plan `null`

#### Scenario: getContainerDor berechnet dorScore

- **GIVEN** ein Container mit `readiness` mit zwei gesetzten DoR-Flags
- **WHEN** `getContainerDor(brand, containerId)` aufgerufen wird
- **THEN** enthält das Ergebnis `value_prop/effort/areas/depends_on/requirements_list` und `dorScore === 2`

### Requirement: Status-Labels aus cockpit-labels.ts SSOT

Das System SHALL in `[id].astro` die Status-, Typ- und Prioritäts-Labels aus `cockpit-labels.ts` beziehen, sodass `planning`, `plan_staged`, `qa_review` und `awaiting_deploy` korrekt dargestellt werden, statt der lokalen veralteten Maps.

#### Scenario: Neuer Status wird korrekt benannt

- **GIVEN** ein Ticket mit Status `awaiting_deploy`
- **WHEN** die Detailseite gerendert wird
- **THEN** zeigt das Status-Chip „Wartet auf Deploy" statt des rohen Enum-Werts

### Requirement: Sidekick-Eintrag „Projekttickets"

Das System SHALL im Sidekick-Home für den Admin-Kontext einen Eintrag „Projekttickets" mit Deep-Link auf `/admin/cockpit` und einem Count-Badge (offene `project`/`feature`-Container) anbieten. Im Portal-Kontext SHALL der Eintrag nicht erscheinen. Der Eintrag SHALL als reiner `href`-Eintrag umgesetzt werden (kein neuer View-Slug).

#### Scenario: Admin sieht den Eintrag mit Deep-Link

- **GIVEN** der Sidekick wird im Kontext `admin` geöffnet
- **WHEN** das Home-Menü gerendert ist
- **THEN** existiert ein Eintrag „Projekttickets" mit `href="/admin/cockpit"`

#### Scenario: Portal-Kontext zeigt den Eintrag nicht

- **GIVEN** der Sidekick wird im Kontext `portal` geöffnet
- **WHEN** das Home-Menü gerendert ist
- **THEN** existiert kein Eintrag „Projekttickets"

#### Scenario: Badge-Endpoint ist admin-geschützt

- **GIVEN** ein nicht-Admin ruft `GET /api/admin/cockpit/container-count` auf
- **WHEN** die Route ausgewertet wird
- **THEN** antwortet sie mit Status 403

### Requirement: BATS Placeholder Test Coverage

The system SHALL have a dedicated BATS spec file (`tests/spec/projekttickets-cockpit.bats`) that
establishes initial, spec-linked test coverage for the projekttickets-cockpit SSOT spec, per the
"one BATS file per OpenSpec SSOT spec" convention.

#### Scenario: Placeholder test passes

- **GIVEN** the BATS suite `tests/spec/projekttickets-cockpit.bats` exists
- **WHEN** `bats tests/spec/projekttickets-cockpit.bats` is run
- **THEN** the placeholder test `projekttickets-cockpit spec covered` passes

<!-- merged from change delta projekttickets-cockpit.md (b2b75e76b58d) -->