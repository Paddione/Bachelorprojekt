# p3: Unified Panels + Insights + Cleanup

> **Agent:** devstral | **Files:** 8 | **Steps:** 8
> **Context budget:** ~60000 tokens
> **Verify:** PipelinePanel removed; Svelte panels work without wrapper; old analytics removed; Insights tab renders

## Goal

Remove the PipelinePanel wrapper and make the Kit panel system natively support Svelte components. Remove the old analytics bloat (KpiGrid, ThroughputChart, PhaseHeatmap, ShippedBar). Create the Insights tab with meaningful metrics and trace recording infrastructure.

## Files

| File | Action | Purpose |
|------|--------|---------|
| `website/src/components/cockpit/PipelinePanel.svelte` | DELETE | No longer needed — Svelte panels are native |
| `website/src/components/cockpit/PipelinePanel.test.ts` | DELETE | Remove corresponding test |
| `website/src/components/sdlc/factory/InsightsTab.svelte` | CREATE | New insights/metrics view |
| `website/src/components/sdlc/factory/TraceRecorder.svelte` | CREATE | Trace recording UI |
| `website/src/components/sdlc/factory/FactoryKpiGrid.svelte` | DELETE | Bloated analytics — "never worked" |
| `website/src/components/sdlc/factory/FactoryThroughputChart.svelte` | DELETE | Bloated analytics |
| `website/src/components/sdlc/factory/FactoryPhaseHeatmap.svelte` | DELETE | Bloated analytics |
| `website/src/components/sdlc/factory/FactoryShippedBar.svelte` | DELETE | Bloated analytics |
| `website/src/components/sdlc/factory/AnalyticsWindowFilter.svelte` | DELETE | No longer needed |
| `website/src/components/sdlc/factory/KostenTab.svelte` | MODIFY | Integrate as metric in Insights (or keep standalone) |
| `website/src/pages/sdlc/cockpit.astro` | MODIFY | Remove PipelinePanel import; add Insights integration |

## Steps

### Step 1: Make Kit panel.js Svelte-aware

- Modify `.lavish/kit/panel.js` to add a `Panel.registerSvelte(elementId, mountFn, destroyFn)` method
- When `Panel.run()` scans for `[data-panel-type]` elements at DOMContentLoaded:
  - Skip elements that have a `data-panel-svelte` attribute (these are managed by Svelte)
  - Svelte panels are registered BEFORE the auto-initialization scan
- The `refresh()` method on a Svelte-registered panel is a no-op (Svelte handles reactivity)
- This is the MINIMAL change needed — no full rewrite of panel.js

### Step 2: Remove PipelinePanel.svelte

- Delete `website/src/components/cockpit/PipelinePanel.svelte`
- Delete `website/src/components/cockpit/PipelinePanel.test.ts`
- Remove the import from `cockpit.astro`
- The `PipelinePanel` previously wrapped `DevStatusTabs` in a panel frame that deliberately avoided the Kit runtime. Now that Svelte panels are natively supported, the wrapper is unnecessary.

### Step 3: Update cockpit.astro to use native panel integration

- Replace the `PipelinePanel` wrapper with a direct `data-panel-svelte` attribute on the Svelte island mount point:
  ```html
  <section class="panel panel--card" data-panel-svelte="pipeline">
    <OverviewDashboard client:load {brand} />
  </section>
  ```
- The Kit panel system recognizes `data-panel-svelte` as a Svelte-managed panel and does not adopt it

### Step 4: Remove old analytics components

- Delete: `FactoryKpiGrid.svelte`, `FactoryThroughputChart.svelte`, `FactoryPhaseHeatmap.svelte`, `FactoryShippedBar.svelte`, `AnalyticsWindowFilter.svelte`
- Remove their imports from any remaining files (check: `DevStatusTabs.svelte`, `FactoryFloor.svelte`)
- Remove corresponding test files if they exist
- These components were flagged as "never worked" and are replaced by InsightsTab

### Step 5: Create InsightsTab.svelte

- Accessible from Command Bar (Insights button) or by navigating to `?mode=insights`
- Shows two sections:
  **Metrics:**
  - Tickets shipped this week (simple count, from DB)
  - Average time from plan_staged to done (from factory_phase_events)
  - Current factory throughput (tickets/day, rolling 7-day)
  - Open PR count + average review time
  - These are simple SQL queries, not the complex chart components we removed
  **Trace Recording:**
  - List of recent factory runs with: ticket, agent model, phase, duration, result
  - "Record Traces" toggle — when enabled, factory outcomes are persisted to `tickets.factory_traces`

### Step 6: Create TraceRecorder.svelte

- Uses the existing factory floor store to observe factory events
- Records: ticket_id, agent_model, phase (scout/design/plan/implement/verify/deploy), duration_ms, result (success/failure/blocked), error_message
- Persists via POST to `/api/cockpit/traces` (new endpoint — stub it if needed)
- Shows a count of recorded traces and a "View Traces" link

### Step 7: Handle KostenTab

- `KostenTab.svelte` currently shows cost tracking
- Option A: Integrate as a metric card in InsightsTab
- Option B: Keep as standalone, accessible from Insights
- Choose Option A for simplicity: embed a simplified cost summary in Insights

### Step 8: Verify

```bash
cd website && pnpm run build 2>&1
# Should succeed — no imports pointing to deleted files

# Manual checks:
# - PipelinePanel.svelte does not exist in source tree
# - Cockpit loads without the old tab bar, Command Bar is the only navigation
# - Insights tab shows meaningful metrics (not the old chart components)
# - Trace recording toggle is present
# - Deleted analytics components are absent from the build output
```
