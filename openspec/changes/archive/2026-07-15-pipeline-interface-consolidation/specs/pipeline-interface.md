# pipeline-interface — Delta (pipeline-interface-consolidation, T001858)

Zweck (Purpose): Die sechs Tabs unter `/admin/pipeline` (Floor, Planung, Analytics,
Kosten, Steuerung, Abhängigkeiten) werden zu einem kohärenten Gesamtinterface
zusammengeführt. Diese Capability beschreibt die verbindlichen Struktur- und
Konsistenzregeln des Pipeline-Interface: einen gemeinsamen Datenlayer statt acht
unabhängiger Fetches, den Steuerung-Tab als einzige Kontroll-Wahrheit, eine
ereignisgetriebene Refresh-Konvention, verlässliche Deep-Links und eine einheitliche
`--admin-*`-Token-Palette für alle Pipeline-Komponenten.

## ADDED Requirements

### Requirement: Single shared floor data layer

The pipeline interface SHALL read live factory-floor data through a single shared
Svelte store module (`website/src/lib/stores/factory-floor-store.ts`) that owns
exactly one `EventSource` connection to `GET /api/factory-floor/stream` and one cached
`FloorPayload`. The store SHALL be a pure client module (no import of DB or server-only
modules) and SHALL be reference-counted: the SSE connection opens on the first
subscriber and closes when the subscriber count returns to zero. Consumers
(`FactoryFloor`, `StatusStrip`, `FactoryPhaseHeatmap`, `FactoryShippedBar`,
`PipelineSidekickView`, `DependencyGraph`) SHALL subscribe to the store instead of
opening their own stream or polling `/api/factory-floor` directly.

#### Scenario: One SSE connection is shared across consumers

- **GIVEN** the pipeline store module and its consuming components
- **WHEN** the source of each consumer is inspected
- **THEN** each imports `factory-floor-store` and none opens its own
  `new EventSource('/api/factory-floor/stream')` or a standalone poll of
  `/api/factory-floor`

#### Scenario: The connection is reference-counted to zero

- **GIVEN** the store has been seeded with an SSR `FloorPayload`
- **WHEN** two subscribers acquire the store and then both release it
- **THEN** `floorSubscriberCount()` returns 2 after the acquisitions and 0 after the
  releases, and no network fetch is issued while a seeded payload is present

#### Scenario: SSR payload seeds the store

- **GIVEN** the `initial` `FloorPayload` prop passed from `pipeline.astro` to
  `DevStatusTabs`
- **WHEN** the interface mounts
- **THEN** `seedFloor(initial)` populates the cached payload before the first
  network refresh, so the first paint shows server data

### Requirement: Steuerung tab is the control single source of truth

The Steuerung tab (`ControlPanel.svelte`) SHALL model all seven fields of
`GET/PATCH /api/admin/factory-control` (`killSwitch`, `dryRun`, `slotCap`, `dailyCap`,
`contextBudget`, `spawnHarness`, `lavishDelegation`). `PortalSidekick.svelte` SHALL NOT
retain editable inputs for `contextBudget`, `spawnHarness`, or `lavishDelegation`;
instead it SHALL show a read-only summary with a deep link to
`/admin/pipeline?tab=control`.

#### Scenario: ControlPanel edits all seven control fields

- **GIVEN** the rendered Steuerung tab
- **WHEN** its control cards are inspected
- **THEN** cards for `contextBudget`, `spawnHarness`, and `lavishDelegation` are
  present alongside the existing kill-switch, dry-run, slot-cap, and daily-cap cards

#### Scenario: Sidekick no longer edits control state

- **GIVEN** `PortalSidekick.svelte`
- **WHEN** its agent-settings section is inspected
- **THEN** it contains no `bind:value`/`bind:checked` input for `contextBudget`,
  `spawnHarness`, or `lavishDelegation` and instead links to
  `/admin/pipeline?tab=control`

### Requirement: KI routing is consolidated in the Steuerung tab

The KI provider-priority editor SHALL be extracted from `FactoryFloor.svelte` into a
standalone component (`website/src/components/factory/KiRoutingPanel.svelte`) and
rendered in the Steuerung tab next to `FactoryModelSlots`. The Floor tab SHALL NOT
retain a provider drawer, and `FactoryFloor.svelte` SHALL NOT import
`KiProviderDrawer`.

#### Scenario: Provider editor lives in the Steuerung tab

- **GIVEN** the pipeline components after extraction
- **WHEN** `FactoryFloor.svelte` and the Steuerung tab are inspected
- **THEN** `FactoryFloor.svelte` no longer imports `KiProviderDrawer`, and
  `KiRoutingPanel.svelte` (which owns the provider CRUD) is rendered in the Steuerung
  tab

### Requirement: Event-driven refresh with no hardcoded intervals

Pipeline components SHALL refresh on the store's named `phase` events plus an initial
load, and SHALL NOT hardcode poll intervals. `DependencyGraph.svelte` SHALL NOT use a
`setInterval` poll, and `StatusStrip.svelte` SHALL NOT poll `/api/factory-floor` on a
hardcoded 30-second timer; both derive freshness from the shared store. Any remaining
timing constant SHALL come from `website/src/lib/factory-constants.ts`.

#### Scenario: DependencyGraph no longer polls on a timer

- **GIVEN** `DependencyGraph.svelte`
- **WHEN** its source is inspected
- **THEN** it contains no `setInterval` call and reloads `/api/tickets/graph` only on
  the store's `phase` events plus the initial load

#### Scenario: StatusStrip drops the 30-second full-payload poll

- **GIVEN** `StatusStrip.svelte`
- **WHEN** its source is inspected
- **THEN** it contains no `setInterval(pollWatchdog, 30000)` and reads `watchdogStale`
  from the shared store

### Requirement: Deep-link tab selection wins over persisted state

`DevStatusTabs.svelte` SHALL treat a `?tab=` query parameter as authoritative for the
active tab. The `localStorage['dev-status-tab']` value SHALL be used only as a fallback
when no `?tab=` parameter is present, so deep links from the Leitstand tiles and the
Sidekick land on the intended tab.

#### Scenario: URL tab overrides localStorage

- **GIVEN** a request to `/admin/pipeline?tab=control` while
  `localStorage['dev-status-tab']` holds a different tab
- **WHEN** the interface mounts
- **THEN** the Steuerung tab is active and the persisted value does not override the URL

### Requirement: Unified admin token palette for pipeline components

All pipeline components SHALL use the `--admin-*` design-token family. The bespoke
`--pb-*` palette SHALL be removed from the Planungsbüro components, and `--factory-*`
usages inside the pipeline components SHALL be migrated to `--admin-*` (or existing thin
aliases). This change SHALL NOT dissolve or delete `factory-tokens.css` (owned by the
admin-token-consolidation change) and SHALL NOT introduce new `--factory-*` usages. The
admin UI SHALL remain emoji-free.

#### Scenario: No bespoke Planungsbüro palette remains

- **GIVEN** the Planungsbüro components (`PlanningOffice` and its item/detail/triage/
  queue children) and `PhaseBadge.svelte`
- **WHEN** their styles are inspected
- **THEN** no `--pb-*` custom property is declared or referenced and the equivalent
  `--admin-*` tokens are used instead

### Requirement: Consolidated analytics window and dead-code cleanup

The Analytics tab SHALL expose one 7d/30d/all window filter that drives all five
analytics widgets (API-side where the endpoint supports `?window=`, client-side
otherwise). The consolidation SHALL remove the orphaned `ViewSwitcher.svelte` and its
showcase reference, remove the dead `/dev-status` navigation match, and unify the
`/api/factory-budget` auth status code to `401` to match its sibling endpoints.

#### Scenario: A single window filter drives all analytics widgets

- **GIVEN** the Analytics tab
- **WHEN** the shared window filter is switched between 7d, 30d, and all
- **THEN** every analytics widget reflects the selected window, and only one filter
  control is present

#### Scenario: Orphans and inconsistent auth code are removed

- **GIVEN** the pipeline codebase after cleanup
- **WHEN** `ViewSwitcher.svelte`, `AdminSidebarNav.astro`, and `factory-budget.ts` are
  inspected
- **THEN** `ViewSwitcher.svelte` no longer exists and is not referenced, the
  `/dev-status` nav match is gone, and `/api/factory-budget` returns `401` (not `403`)
  for unauthorized access
