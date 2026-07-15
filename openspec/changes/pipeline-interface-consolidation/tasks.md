---
title: "pipeline-interface-consolidation — Implementation Plan"
ticket_id: T001858
domains: [website, frontend, factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# pipeline-interface-consolidation — Implementation Plan

_Ticket: T001858 — SSOT design: `docs/superpowers/specs/2026-07-15-pipeline-interface-consolidation-design.md` · Delta spec: `openspec/changes/pipeline-interface-consolidation/specs/pipeline-interface.md` · Intel: `openspec/changes/pipeline-interface-consolidation/intel.json`._

This change is **UI-only**. The single backend edit is the `403 → 401` auth status on
`/api/factory-budget` (D7.6). No DDL, no new endpoints; all data flows over the existing
`/api/*` contracts from `intel.json → api_contracts`.

## File Structure

### New files

- `website/src/lib/stores/factory-floor-store.ts` — shared floor data layer (D1): one
  `EventSource`, one cached `FloorPayload`, reference-counted; pure client module.
- `website/src/lib/stores/factory-floor-store.test.ts` — Vitest for the store (seed /
  ingest / ref-count).
- `website/src/components/factory/KiRoutingPanel.svelte` — KI provider CRUD extracted
  from `FactoryFloor.svelte` (D3), renders the existing `KiProviderDrawer`.
- `website/src/components/factory/ContextBudgetCard.svelte` — Steuerung card (D2).
- `website/src/components/factory/SpawnHarnessCard.svelte` — Steuerung card (D2).
- `website/src/components/factory/LavishDelegationCard.svelte` — Steuerung card (D2).
- `website/src/components/factory/AnalyticsWindowFilter.svelte` — shared 7d/30d/all
  filter (D4).
- `tests/spec/pipeline-interface.bats` — structural acceptance suite (SSOT:
  `openspec/specs/pipeline-interface.md`).

### Changed files with S1 budget (effective threshold − current `wc -l`, from `intel.json`)

| File | LOC | Budget |
| --- | --- | --- |
| `website/src/components/FactoryFloor.svelte` | 521 | 0 |
| `website/src/components/PortalSidekick.svelte` | 578 | 0 |
| `website/src/components/DevStatusTabs.svelte` | 104 | 396 |
| `website/src/components/DependencyGraph.svelte` | 412 | 88 |
| `website/src/components/DeliveryHistory.svelte` | 314 | 186 |
| `website/src/components/PlanningOffice.svelte` | 395 | 105 |
| `website/src/components/assistant/PipelineSidekickView.svelte` | 196 | 304 |
| `website/src/components/factory/ControlPanel.svelte` | 152 | 348 |
| `website/src/components/factory/StatusStrip.svelte` | 105 | 395 |
| `website/src/components/factory/FactoryKpiGrid.svelte` | 139 | 361 |
| `website/src/components/factory/FactoryThroughputChart.svelte` | 153 | 347 |
| `website/src/components/factory/FactoryPhaseHeatmap.svelte` | 177 | 323 |
| `website/src/components/factory/FactoryShippedBar.svelte` | 155 | 345 |
| `website/src/components/factory/FactoryBudgetPage.svelte` | 306 | 194 |
| `website/src/components/factory/ViewSwitcher.svelte` | 95 | 405 |

`FactoryFloor.svelte` (Budget 0) and `PortalSidekick.svelte` (Budget 0) MUST be
**really shrunk**, not cosmetically compacted: Task 4 **extracts** the KI provider CRUD
out of `FactoryFloor.svelte` (~130 LOC) and its own SSE/fetch loop (~30 LOC); Task 7
**shrinks** `PortalSidekick.svelte` by removing the three control-edit inputs and their
load/save wiring. `ViewSwitcher.svelte` is **deleted** (Task 13).

### Other changed files (no numeric S1 budget claimed; each well under its extension limit)

- `website/src/components/PlanningOfficeItem.svelte`,
  `website/src/components/PlanningOfficeDetail.svelte`,
  `website/src/components/PlanningOfficeTriage.svelte`,
  `website/src/components/PlanningOfficeQueue.svelte`,
  `website/src/components/factory/PhaseBadge.svelte` — `--pb-*` → `--admin-*` (D6).
- `website/src/components/admin/AdminSidebarNav.astro` — drop `/dev-status` match (D7.4).
- `website/src/components/admin/CockpitExpandRow.svelte` — deep link to
  `/admin/pipeline?tab=…` (D8).
- `website/src/pages/api/factory-budget.ts` — auth `403 → 401` (D7.6).
- `website/src/pages/factory/design-system.astro` — drop the `ViewSwitcher` showcase
  reference so the deletion leaves no dangling import (D7.3, S4).

### Out of scope (do not touch)

`factory-tokens.css` (owned by T001787), `/admin/ki-konfiguration`, Cockpit fusion,
backend/DAL, DORA UI. No brand-domain literals in any snippet (S3).

## Task 1 — RED acceptance suite: `tests/spec/pipeline-interface.bats`

**Goal:** land the structural acceptance suite that encodes the whole change; it is RED
now and greens task by task. Convention: one `.bats` per SSOT spec (template:
`tests/spec/software-factory.bats`). Do **not** create ticket-numbered files.

`target_files:`
- `tests/spec/pipeline-interface.bats`

Write the suite (relative paths run from repo root, as `task test:*` does):

```bash
#!/usr/bin/env bats
# tests/spec/pipeline-interface.bats
# SSOT: openspec/specs/pipeline-interface.md

STORE="website/src/lib/stores/factory-floor-store.ts"
FLOOR="website/src/components/FactoryFloor.svelte"
TABS="website/src/components/DevStatusTabs.svelte"
CTRL="website/src/components/factory/ControlPanel.svelte"
STRIP="website/src/components/factory/StatusStrip.svelte"
DAG="website/src/components/DependencyGraph.svelte"
SIDEKICK="website/src/components/PortalSidekick.svelte"
PIPEVIEW="website/src/components/assistant/PipelineSidekickView.svelte"
NAV="website/src/components/admin/AdminSidebarNav.astro"
BUDGETAPI="website/src/pages/api/factory-budget.ts"

@test "D1: shared floor store exists and exports the public surface" {
  [ -f "$STORE" ]
  grep -q "export const floorStore" "$STORE"
  grep -q "export function seedFloor" "$STORE"
  grep -q "export function acquireFloor" "$STORE"
  grep -q "export function floorSubscriberCount" "$STORE"
}

@test "D1: read-only consumers subscribe to the store" {
  for f in "$STRIP" \
           "website/src/components/factory/FactoryPhaseHeatmap.svelte" \
           "website/src/components/factory/FactoryShippedBar.svelte" \
           "$FLOOR" "$PIPEVIEW" "$DAG"; do
    grep -q "factory-floor-store" "$f"
  done
}

@test "D3: KI provider editor extracted; FactoryFloor drops KiProviderDrawer" {
  [ -f "website/src/components/factory/KiRoutingPanel.svelte" ]
  run grep -q "KiProviderDrawer" "$FLOOR"
  [ "$status" -ne 0 ]
}

@test "D2: ControlPanel models all 7 control fields" {
  grep -q "contextBudget" "$CTRL"
  grep -q "spawnHarness" "$CTRL"
  grep -q "lavishDelegation" "$CTRL"
}

@test "D2: PortalSidekick drops control-edit UI, links to Steuerung tab" {
  run grep -q "bind:value={settings.contextBudget}" "$SIDEKICK"
  [ "$status" -ne 0 ]
  run grep -q "bind:checked={settings.spawnHarness}" "$SIDEKICK"
  [ "$status" -ne 0 ]
  grep -q "tab=control" "$SIDEKICK"
}

@test "D5: DependencyGraph has no setInterval poll" {
  run grep -q "setInterval" "$DAG"
  [ "$status" -ne 0 ]
}

@test "D1: StatusStrip drops the hardcoded 30s poll" {
  run grep -q "setInterval(pollWatchdog, 30000)" "$STRIP"
  [ "$status" -ne 0 ]
}

@test "D7.2: DevStatusTabs prefers the URL tab over localStorage" {
  grep -q "urlTab" "$TABS"
}

@test "D6: no --pb-* palette remains in Planungsbüro components" {
  run grep -rq -- "--pb-" website/src/components/PlanningOffice.svelte \
      website/src/components/PlanningOfficeItem.svelte \
      website/src/components/PlanningOfficeDetail.svelte \
      website/src/components/PlanningOfficeTriage.svelte \
      website/src/components/PlanningOfficeQueue.svelte \
      website/src/components/factory/PhaseBadge.svelte
  [ "$status" -ne 0 ]
}

@test "D4: shared analytics window filter component exists" {
  [ -f "website/src/components/factory/AnalyticsWindowFilter.svelte" ]
}

@test "D7.3: orphan ViewSwitcher is deleted and unreferenced" {
  [ ! -f "website/src/components/factory/ViewSwitcher.svelte" ]
  run grep -rq "ViewSwitcher" website/src
  [ "$status" -ne 0 ]
}

@test "D7.4: dead /dev-status nav match removed" {
  run grep -q "dev-status" "$NAV"
  [ "$status" -ne 0 ]
}

@test "D7.6: /api/factory-budget auth unified to 401 (no 403)" {
  run grep -q "status: 403" "$BUDGETAPI"
  [ "$status" -ne 0 ]
}
```

Run it and confirm it is RED (nothing is implemented yet):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/pipeline-interface.bats
# expected: FAIL (red — every assertion fails until its task lands)
```

## Task 2 — D1: shared floor store module + Vitest (RED → GREEN)

**Goal:** create the pure store module and its Vitest first (RED), then implement until
green. The store is the single owner of the floor SSE + cached `FloorPayload`.

`target_files:`
- `website/src/lib/stores/factory-floor-store.ts`
- `website/src/lib/stores/factory-floor-store.test.ts`

Write the test first. It runs in the Vitest **node** project (default include for
`src/**/*.test.ts`); the store's `connect()` must no-op when `window`/`EventSource` are
absent, so seeding a payload makes the test hermetic (no network):

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import type { FloorPayload } from '../factory-floor-types';

const fake = { fetchedAt: '2026-07-15T00:00:00Z', hall: [], staged: [] } as unknown as FloorPayload;

beforeEach(() => { vi.resetModules(); });

describe('factory-floor-store', () => {
  it('seedFloor caches the SSR payload', async () => {
    const m = await import('./factory-floor-store');
    m.seedFloor(fake);
    expect(get(m.floorStore).payload).toEqual(fake);
  });
  it('ingestFloorPayload replaces the payload and clears stale', async () => {
    const m = await import('./factory-floor-store');
    m.ingestFloorPayload(fake);
    expect(get(m.floorStore).payload).toEqual(fake);
    expect(get(m.floorStore).stale).toBe(false);
  });
  it('acquireFloor ref-counts and releases at zero', async () => {
    const m = await import('./factory-floor-store');
    m.seedFloor(fake); // payload present → acquire skips the network fetch
    const r1 = m.acquireFloor();
    const r2 = m.acquireFloor();
    expect(m.floorSubscriberCount()).toBe(2);
    r1(); r2();
    expect(m.floorSubscriberCount()).toBe(0);
  });
});
```

Run it and confirm it is RED (module not yet present):

```bash
cd website && pnpm exec vitest run src/lib/stores/factory-floor-store.test.ts
# expected: FAIL (red — factory-floor-store.ts does not exist yet)
```

Then implement `factory-floor-store.ts` to make it GREEN. Public surface (typed; no
`any`):

```ts
import { writable, get, type Readable } from 'svelte/store';
import type { FloorPayload } from '../factory-floor-types';
import { SSE_RECONNECT_MS } from '../factory-constants';

export interface FloorState { payload: FloorPayload | null; stale: boolean; }
const store = writable<FloorState>({ payload: null, stale: false });
export const floorStore: Readable<FloorState> = { subscribe: store.subscribe };

let refCount = 0;
let es: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export function seedFloor(payload: FloorPayload | null): void {
  if (payload) store.set({ payload, stale: false });
}
export function ingestFloorPayload(payload: FloorPayload): void {
  store.set({ payload, stale: false });
}
export function floorSubscriberCount(): number { return refCount; }

async function loadOnce(): Promise<void> {
  try {
    const res = await fetch('/api/factory-floor', { credentials: 'same-origin' });
    if (res.ok) ingestFloorPayload(await res.json() as FloorPayload);
    else store.update((s) => ({ ...s, stale: true }));
  } catch { store.update((s) => ({ ...s, stale: true })); }
}

function connect(): void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
  es = new EventSource('/api/factory-floor/stream', { withCredentials: true });
  es.addEventListener('phase', () => { void loadOnce(); });
  es.addEventListener('heartbeat', () => store.update((s) => ({ ...s, stale: false })));
  es.onerror = () => {
    es?.close(); es = null;
    if (!reconnectTimer) reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, SSE_RECONNECT_MS);
  };
}

export function acquireFloor(): () => void {
  refCount += 1;
  if (refCount === 1) {
    if (get(store).payload === null) void loadOnce();
    connect();
  }
  return () => {
    refCount = Math.max(0, refCount - 1);
    if (refCount === 0) {
      es?.close(); es = null;
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    }
  };
}
```

Also add a shared `/api/factory-metrics` cache in this module (D1: one metrics fetch per
render) with a minimal typed shape (`unknown[]` fields, no `any`):

```ts
export interface FactoryMetricsPayload { brand: string; metrics: unknown[]; activeFeatures: unknown[]; flags: unknown[]; }
let metricsCache: FactoryMetricsPayload | null = null;
let metricsInflight: Promise<FactoryMetricsPayload> | null = null;
export async function getSharedMetrics(force = false): Promise<FactoryMetricsPayload> {
  if (!force && metricsCache) return metricsCache;
  if (!metricsInflight) {
    metricsInflight = fetch('/api/factory-metrics', { credentials: 'same-origin' })
      .then((r) => r.json() as Promise<FactoryMetricsPayload>)
      .then((p) => { metricsCache = p; return p; })
      .finally(() => { metricsInflight = null; });
  }
  return metricsInflight;
}
```

Rerun the Vitest — now GREEN.

## Task 3 — D1: read-only consumers subscribe to the store

**Goal:** replace the independent floor fetches/polls in the three read-only widgets with
a store subscription. `StatusStrip` loses its hardcoded 30 s poll.

`target_files:`
- `website/src/components/factory/StatusStrip.svelte`
- `website/src/components/factory/FactoryPhaseHeatmap.svelte`
- `website/src/components/factory/FactoryShippedBar.svelte`

For each, import and acquire the store; drop the local `fetch('/api/factory-floor')` and
any `setInterval`. `StatusStrip` derives `watchdogStale` from the store payload:

```svelte
import { onMount } from 'svelte';
import { floorStore, acquireFloor } from '../../lib/stores/factory-floor-store';
let watchdogStale = $state(0);
onMount(() => {
  const release = acquireFloor();
  const unsub = floorStore.subscribe((s) => { watchdogStale = s.payload?.control.watchdogStale ?? 0; });
  return () => { unsub(); release(); };
});
```

`FactoryPhaseHeatmap` and `FactoryShippedBar` derive their inputs from
`floorStore.subscribe(...)` instead of their own `fetch('/api/factory-floor')`. Matching
Task 1 guards: each file greps for `factory-floor-store`; `StatusStrip` no longer
contains `setInterval(pollWatchdog, 30000)`.

## Task 4 — D1 + D3: slim `FactoryFloor.svelte` (subscribe + extract KI routing)

**Goal:** the real shrink of the Budget-0 `FactoryFloor.svelte`. **Extract** the KI
provider CRUD into `KiRoutingPanel.svelte`, and replace `FactoryFloor`'s own SSE/fetch
loop with the shared store. Also move the Floor tab's `bg-dark`/`text-light` Tailwind
utility islands onto `--admin-*` tokens while the markup is open (D6, Floor).

`target_files:`
- `website/src/components/factory/KiRoutingPanel.svelte`
- `website/src/components/FactoryFloor.svelte`
- `website/src/components/DevStatusTabs.svelte`

**Extract (D3):** move the provider state and functions out of `FactoryFloor.svelte`
into the new `KiRoutingPanel.svelte` — the `ProviderEntry`/`Health` interfaces,
`providerEntries`/`providerHealth`/`catalog`/`openDrawerPhase`/`editId`/`form` state,
`blankForm`, `onProviderChange`, `PHASE_LABELS`, `sourceForPhase`, `entriesForPhase`,
`loadProvidersAndCatalog`, `saveForm`, `changePriority`, `doDelete`, `closeDrawer`,
`startEdit`, `startNew`, and the `{#if openDrawerPhase}<KiProviderDrawer …>` block.
`KiRoutingPanel.svelte` imports the presentational
`./admin/KiProviderDrawer.svelte`; `FactoryFloor.svelte` no longer imports it.

**Subscribe (D1):** delete `connectSSE`/`refresh`/`es`/`reconnectTimer` from
`FactoryFloor.svelte` and read `data` from the shared store:

```svelte
import { floorStore, acquireFloor, seedFloor } from '../lib/stores/factory-floor-store';
let { initial }: { initial: FloorPayload | null } = $props();
let data = $state<FloorPayload | null>(initial);
onMount(() => {
  seedFloor(initial);
  const release = acquireFloor();
  const unsub = floorStore.subscribe((s) => { if (s.payload) data = s.payload; });
  return () => { unsub(); release(); };
});
```

Ticket-detail / inject / release actions (`/api/factory-floor/[extId]*`) stay in
`FactoryFloor.svelte` — only the floor **payload feed** moves to the store.

**Wire (D3):** in `DevStatusTabs.svelte`, render `KiRoutingPanel` next to
`FactoryModelSlots` in the `control` tab, and call `seedFloor(initial)` in `onMount`
(the SSR seed point):

```svelte
{:else if activeTab === 'control'}
  <ControlPanel />
  <div class="ki-routing-row"><FactoryModelSlots /><KiRoutingPanel /></div>
```

Matching Task 1 guards: `KiRoutingPanel.svelte` exists; `FactoryFloor.svelte` no longer
greps `KiProviderDrawer`; `FactoryFloor.svelte` greps `factory-floor-store`.

## Task 5 — D7.1 + D5: `PipelineSidekickView` & `DependencyGraph` subscribe to the store

**Goal:** fix the dead SSE handler and remove the hardcoded 5 s DAG poll by reusing the
store.

`target_files:`
- `website/src/components/assistant/PipelineSidekickView.svelte`
- `website/src/components/DependencyGraph.svelte`

**D7.1:** delete `PipelineSidekickView`'s broken `es.onmessage`/`data.floor` effect
(the stream only emits named `phase`/`heartbeat` events, never a default `message` with a
`floor` field). Read `floor` from the store instead:

```svelte
import { floorStore, acquireFloor } from '../../lib/stores/factory-floor-store';
onMount(() => {
  const release = acquireFloor();
  const unsub = floorStore.subscribe((s) => { if (s.payload) floor = s.payload; });
  return () => { unsub(); release(); };
});
```

**D5:** in `DependencyGraph.svelte`, delete `pollInterval`/`setInterval(fetchGraph, 5000)`
and reload `/api/tickets/graph` on the store's `phase` events plus the initial load:

```svelte
import { floorStore, acquireFloor } from '../lib/stores/factory-floor-store';
onMount(() => {
  void fetchGraph();
  const release = acquireFloor();
  let seen: string | null = null;
  const unsub = floorStore.subscribe((s) => {
    const at = s.payload?.fetchedAt ?? null;
    if (at && at !== seen) { seen = at; void fetchGraph(); }
  });
  return () => { unsub(); release(); };
});
```

Matching Task 1 guards: both files grep `factory-floor-store`; `DependencyGraph.svelte`
no longer greps `setInterval`.

## Task 6 — D2 (part 1): three control cards + ControlPanel models all 7 fields

**Goal:** the Steuerung tab becomes the control SSOT. Add three cards mirroring the
existing card components and extend `ControlState` to the full 7 fields already returned
by `GET/PATCH /api/admin/factory-control`.

`target_files:`
- `website/src/components/factory/ContextBudgetCard.svelte`
- `website/src/components/factory/SpawnHarnessCard.svelte`
- `website/src/components/factory/LavishDelegationCard.svelte`
- `website/src/components/factory/ControlPanel.svelte`

Each new card mirrors `KillSwitchCard`/`SlotCapCard` (a `value` prop + `onchange`
callback, `--admin-*` tokens, no emoji). Extend `ControlState` and render the cards:

```svelte
interface ControlState {
  killSwitch: boolean; dryRun: boolean; slotCap: number; dailyCap: number;
  contextBudget: number; spawnHarness: boolean; lavishDelegation: boolean;
  updatedAt: string | null;
}
<ContextBudgetCard value={state.contextBudget} onchange={(v) => patch({ contextBudget: v })} />
<SpawnHarnessCard value={state.spawnHarness} onchange={(v) => patch({ spawnHarness: v })} />
<LavishDelegationCard value={state.lavishDelegation} onchange={(v) => patch({ lavishDelegation: v })} />
```

The existing `patch()` already PATCHes an arbitrary partial, so no API change is needed.
Matching Task 1 guard: `ControlPanel.svelte` greps `contextBudget`, `spawnHarness`,
`lavishDelegation`.

## Task 7 — D2 (part 2): shrink `PortalSidekick.svelte` to read-only + deep link

**Goal:** remove the duplicate control-edit UI from the Budget-0
`PortalSidekick.svelte` — a **real shrink**. Keep the change surgical to the
"Orchestrierungs-Globals" section (current lines ~316–352 plus the matching state in
`settings`/`saveSettings`).

`target_files:`
- `website/src/components/PortalSidekick.svelte`

Replace the three editable inputs (`contextBudget` number+range, `spawnHarness`
checkbox, `lavishDelegation` checkbox) and their `saveSettings` writes with a compact
read-only summary and a deep link into the Steuerung tab:

```svelte
<div class="control-readonly">
  <p>Token-Budget {settings.contextBudget} · Spawn {settings.spawnHarness ? 'an' : 'aus'}
     · Lavish {settings.lavishDelegation ? 'an' : 'aus'}</p>
  <a class="control-link" href="/admin/pipeline?tab=control">Im Steuerung-Tab bearbeiten</a>
</div>
```

The read-only summary may still load these fields for display, but MUST NOT keep any
`bind:value={settings.contextBudget}`, `bind:checked={settings.spawnHarness}`, or
`bind:checked={settings.lavishDelegation}` input.

> **Coordination:** T001565 (agentic-terminal-sidekick, `plan_staged`) also edits
> `PortalSidekick.svelte` (view-union, drawer body, `terminalHost` prop). Keep this edit
> confined to the control section and introduce **no** view-union or structural changes,
> to minimise the merge conflict. Rebase on whichever lands first.

Matching Task 1 guard: `PortalSidekick.svelte` no longer greps
`bind:value={settings.contextBudget}` / `bind:checked={settings.spawnHarness}`, and does
grep `tab=control`.

## Task 8 — D4 (part 1): shared analytics window filter

**Goal:** one window control for the Analytics tab, driving `DeliveryHistory` first.

`target_files:`
- `website/src/components/factory/AnalyticsWindowFilter.svelte`
- `website/src/components/DevStatusTabs.svelte`
- `website/src/components/DeliveryHistory.svelte`

`AnalyticsWindowFilter.svelte` renders the 7d/30d/all buttons (moved out of
`DeliveryHistory`) with a `value` prop + `onchange` callback (`--admin-*` tokens). In
`DevStatusTabs.svelte`, hold the shared window state in the `analytics` branch and pass
it down:

```svelte
{:else if activeTab === 'analytics'}
  <AnalyticsWindowFilter value={analyticsWindow} onchange={(w) => (analyticsWindow = w)} />
  <DeliveryHistory window={analyticsWindow} />
  <FactoryKpiGrid window={analyticsWindow} />
  …
```

`DeliveryHistory.svelte` takes `window` as a prop (removing its own internal
buttons/`window` state) and keeps using `/api/admin/delivery-metrics?window=`.

## Task 9 — D4 (part 2): client-side window filtering for the metric/floor widgets

**Goal:** the remaining four analytics widgets honour the shared window. Where the API
has no `?window=` (`/api/factory-metrics`, `/api/factory-floor`), filter client-side.

`target_files:`
- `website/src/components/factory/FactoryKpiGrid.svelte`
- `website/src/components/factory/FactoryThroughputChart.svelte`
- `website/src/components/factory/FactoryPhaseHeatmap.svelte`
- `website/src/components/factory/FactoryShippedBar.svelte`

Each accepts a `window: '7d' | '30d' | 'all'` prop and slices its time-bucketed series to
that window client-side (`all` = no slice). The metrics-backed widgets read from
`getSharedMetrics()` (D1 cache) rather than fetching `/api/factory-metrics` twice:

```svelte
let { window = '7d' as '7d' | '30d' | 'all' } = $props();
const cutoff = window === 'all' ? 0 : Date.now() - (window === '7d' ? 7 : 30) * 864e5;
const shown = $derived(series.filter((p) => cutoff === 0 || Date.parse(p.date) >= cutoff));
```

## Task 10 — D6 (part 1): remove the `--pb-*` palette from the Planungsbüro components

**Goal:** delete the bespoke `--pb-*` palette; the Planungsbüro uses `--admin-*` tokens.

`target_files:`
- `website/src/components/PlanningOffice.svelte`
- `website/src/components/PlanningOfficeItem.svelte`
- `website/src/components/PlanningOfficeDetail.svelte`
- `website/src/components/PlanningOfficeTriage.svelte`
- `website/src/components/PlanningOfficeQueue.svelte`
- `website/src/components/factory/PhaseBadge.svelte`

Remove the `--pb-*` custom-property declarations and map each usage to its `--admin-*`
equivalent (`--pb-bg` → `--admin-surface`, `--pb-text` → `--admin-text`,
`--pb-border` → `--admin-border`, `--pb-accent` → `--admin-primary`, etc.) per
`openspec/specs/admin-token-consolidation.md`. Do **not** touch `factory-tokens.css` and
introduce **no** new `--factory-*` usage. Matching Task 1 guard: no `--pb-` remains in
these files.

## Task 11 — D6 (part 2): migrate `--factory-*` usages to `--admin-*`

**Goal:** the remaining pipeline components share the admin palette.

`target_files:`
- `website/src/components/factory/ControlPanel.svelte`
- `website/src/components/factory/StatusStrip.svelte`
- `website/src/components/DevStatusTabs.svelte`
- `website/src/components/DependencyGraph.svelte`

Replace `--factory-*` custom-property references (e.g. `--factory-surface`,
`--factory-border`, `--factory-text-primary`, `--factory-error`, `--factory-spacing-lg`)
with their `--admin-*` counterparts (or the existing thin aliases in `global.css`). No
`factory-tokens.css` edit; no new `--factory-*` usages. This step is line-neutral and
does not affect the S1 budgets recorded above.

## Task 12 — D7.2: `?tab=` deep link wins over `localStorage`

**Goal:** deep links from the Leitstand tiles and Sidekick land on the intended tab.

`target_files:`
- `website/src/components/DevStatusTabs.svelte`

The `initialTab` already derives from `?tab=` in `pipeline.astro`. Fix `onMount` so
`localStorage` only applies when the URL has no `?tab=`:

```svelte
onMount(() => {
  const urlTab = new URLSearchParams(window.location.search).get('tab') as Tab | null;
  if (!urlTab) {
    const saved = localStorage.getItem('dev-status-tab') as Tab | null;
    if (saved && TAB_KEYS.includes(saved)) activeTab = saved;
  }
  window.addEventListener('popstate', () => {
    const t = new URLSearchParams(window.location.search).get('tab') as Tab | null;
    if (t && TAB_KEYS.includes(t)) activeTab = t;
  });
});
```

Matching Task 1 guard: `DevStatusTabs.svelte` greps `urlTab`.

## Task 13 — D7.3/4/5/6 + D8: dead-code cleanup, auth code, and cockpit deep link

**Goal:** finish the bug/cleanup batch from D7 and add the D8 cockpit deep link.

`target_files:`
- `website/src/components/factory/ViewSwitcher.svelte`
- `website/src/pages/factory/design-system.astro`
- `website/src/components/admin/AdminSidebarNav.astro`
- `website/src/pages/api/factory-budget.ts`
- `website/src/components/factory/FactoryBudgetPage.svelte`
- `website/src/components/admin/CockpitExpandRow.svelte`

- **D7.3:** delete `ViewSwitcher.svelte` and remove its import + showcase block from
  `design-system.astro` (only referencing site) so the orphan leaves nothing dangling.
- **D7.4:** in `AdminSidebarNav.astro`, drop `/dev-status` from the Pipeline entry's
  `matches` array (leave `/admin/pipeline`).
- **D7.6:** in `factory-budget.ts`, change both auth guards `status: 403` → `status: 401`
  to match the sibling endpoints (`intel.json → api_contracts`).
- **D7.5:** in `FactoryBudgetPage.svelte`, remove the unused `.btn-back` style block and
  replace the `searchTicket(new CustomEvent('submit'))` hack with a direct
  `searchTicket()` call that takes an optional event.
- **D8:** in `CockpitExpandRow.svelte`, add a deep link to `/admin/pipeline?tab=factory`
  (or the relevant tab) where it surfaces factory data — link only, no cockpit fusion.

Matching Task 1 guards: `ViewSwitcher.svelte` absent and unreferenced;
`AdminSidebarNav.astro` has no `dev-status`; `factory-budget.ts` has no `status: 403`.

## Task 14 — Verification (final gate)

**Goal:** all acceptance suites green and CI ratchets satisfied.

`target_files:`
- `website/src/data/test-inventory.json`

Run the full acceptance suites (now GREEN) and the mandatory gates:

```bash
# Acceptance suites (both now green)
tests/unit/lib/bats-core/bin/bats tests/spec/pipeline-interface.bats
cd website && pnpm exec vitest run src/lib/stores/factory-floor-store.test.ts && cd ..

# A new BATS file was added → regenerate + commit the test inventory
task test:inventory        # regenerates website/src/data/test-inventory.json

# The three mandatory CI gates
task test:changed          # targeted tests for the changed domains (vitest + BATS + quality)
task freshness:regenerate  # refresh generated artefacts (test-inventory, repo-index, …)
task freshness:check       # CI equivalent: freshness + quality:check (S1–S4 ratchet) + baseline assertion
```

Confirm `git diff --stat website/src/data/test-inventory.json` is committed alongside the
new test. `freshness:check` must confirm `FactoryFloor.svelte` and `PortalSidekick.svelte`
are at or below their frozen baselines (they shrank in Tasks 4 and 7) and that
`docs/code-quality/baseline.json` gained no keys.
