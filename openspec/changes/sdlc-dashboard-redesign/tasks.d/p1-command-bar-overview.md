# p1: Command Bar + Overview Mode

> **Agent:** devstral | **Files:** 4 | **Steps:** 8
> **Context budget:** ~60000 tokens
> **Verify:** `pnpm run build --filter website` succeeds, cockpit page loads with Command Bar visible

## Goal

Create the Command Bar component and Overview Dashboard, replacing the current cockpit.astro layout. The Command Bar shows cluster health, watchdog, active agents, slots, PRs, tick countdown, and mode toggle. The Overview mode aggregates all 6 lifecycle phases with counts.

## Files

| File | Action | Purpose |
|------|--------|---------|
| `website/src/components/cockpit/CommandBar.svelte` | CREATE | Persistent status bar component |
| `website/src/components/cockpit/OverviewDashboard.svelte` | CREATE | Lifecycle overview dashboard |
| `website/src/pages/sdlc/cockpit.astro` | MODIFY | Replace dual-system layout with Command Bar + Overview/Fokus architecture |
| `website/src/components/DevStatusTabs.svelte` | MODIFY | Strip tab bar, keep only the mode/content switching logic (or replace entirely) |

## Steps

### Step 1: Create CommandBar.svelte

- Props: `clusterHealth` (green/amber/red), `watchdogStale` (number), `agentCount`, `slotsUsed`, `slotsCap`, `openPrs`, `nextTickAt`, `activeMode` ('overview'|'fokus'), `brand`
- Renders a thin horizontal bar with: cluster indicator (PilotLight), watchdog status, agent count badge, slot usage (X/Y), PR count with link, tick countdown, and Overview/Fokus toggle button
- Emits event: `onmodechange` when toggle is clicked
- CSS: uses `--admin-*` CSS variables from the existing design system

### Step 2: Create OverviewDashboard.svelte

- Fetches lifecycle phase data from adapter (existing portfolio/cockpit API)
- Renders 6 phase cards in a horizontal row: Triage, Planung, Bauen, Review, Deploy, Ship
- Each card shows: phase name, ticket count by status (open, in_progress, done), a subtle progress indicator
- Below the phase cards: Attention section showing blocked tickets, stuck tickets, cooldowns (reuses AttentionStrip logic)
- PR section listing open PRs with CI status
- Each phase card is clickable → navigates to Fokus mode for that phase

### Step 3: Modify cockpit.astro layout

- Remove the old left rail `<aside class="cockpit-focus">` with static `<div>` groups
- Remove the workspace `<main class="cockpit-workspace">` with Kit panels
- New layout:
  ```html
  <div class="cockpit">
    <CommandBar client:load {initialMode} {brand} />
    <main class="cockpit-main">
      {#if mode === 'overview'}
        <OverviewDashboard client:load />
      {:else}
        <!-- Fokus mode (p2 will fill this) -->
        <div class="fokus-placeholder">Fokus mode coming in p2</div>
      {/if}
    </main>
  </div>
  ```
- Keep the `<script>` block with `cockpitAct` and stream state indicator
- Route `/sdlc/cockpit` stays, mode is read from URL: `?mode=overview|fokus`

### Step 4: Mode switch logic in cockpit.astro

- Read initial mode from URL query param or localStorage preference
- On mode change (via CommandBar toggle), update URL and re-render
- localStorage key: `cockpit:default-view` with format `overview` or `fokus:<phase>`

### Step 5: Wire CommandBar data sources

- Import existing floor store (`floorStore` from `$lib/stores/factory-floor-store`) for slot/watchdog data
- Import parallel status fetch for tick countdown
- Show "—" for data that isn't available yet (no fake values)

### Step 6: OverviewDashboard data integration

- Use existing adapter/API endpoints (`/api/cockpit/portfolio`, `/api/admin/factory/parallel-status`) for phase counts
- Attention data: reuse `AttentionPayload` type and data from floor store
- PR data: can use stub/"coming soon" initially, or the CI panel endpoint if available

### Step 7: Preserve existing Kit CSS/JS loading

- Keep the `<link>` and `<script is:inline>` tags for tokens.css, panel.css, layout.css, action-policy.js, panel.js, layout.js, adapter.js
- These are needed for p3 (Unified Panel System)

### Step 8: Verify

```bash
cd website && pnpm run build 2>&1 | tail -5
# Should succeed with no type errors for new components
# Check: cockpit page loads at /sdlc/cockpit
# Check: Command Bar is visible with Overview/Fokus toggle
# Check: Toggle switches between Overview and (placeholder) Fokus modes
```
