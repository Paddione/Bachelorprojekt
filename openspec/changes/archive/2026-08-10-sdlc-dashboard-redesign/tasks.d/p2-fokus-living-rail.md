# p2: Fokus Mode + Living Rail + Mobile

> **Agent:** devstral | **Files:** 5 | **Steps:** 8
> **Context budget:** ~60000 tokens
> **Verify:** All 6 phases render content in Fokus mode; rail changes per phase; mobile layout works at < 768px

## Goal

Implement Fokus mode phase routing, the context-sensitive living rail, and the mobile layout (Bottom-Sheet + Swipe). Integrate existing components (FactoryFloor, PlanningOffice) into the Fokus mode phase slots.

## Files

| File | Action | Purpose |
|------|--------|---------|
| `website/src/components/cockpit/CockpitRail.svelte` | CREATE | Context-sensitive sidebar rail |
| `website/src/pages/sdlc/cockpit.astro` | MODIFY | Add Fokus mode content routing + mobile layout |
| `website/src/components/DevStatusTabs.svelte` | MODIFY/REMOVE | Extract phase content rendering, remove tab bar |
| `website/src/components/cockpit/MobileBottomSheet.svelte` | CREATE | Mobile phase navigation bottom sheet |
| `website/src/styles/cockpit-mobile.css` | CREATE | Mobile-specific cockpit styles |

## Steps

### Step 1: Define phase-to-component mapping

```typescript
type Phase = 'triage' | 'planung' | 'bauen' | 'review' | 'deploy' | 'ship';

const PHASE_COMPONENTS: Record<Phase, Component> = {
  triage: PlanningOffice,    // triage queue view
  planung: PlanningOffice,   // full planning office
  bauen: FactoryFloor,       // factory kanban
  review: null,              // PR review list (new or stub)
  deploy: null,              // deployment status (stub)
  ship: null,                // shipped tickets list (stub)
};
```

Phases without dedicated components (`review`, `deploy`, `ship`) render a simple status card with ticket counts until dedicated views are built (future tickets).

### Step 2: Implement phase routing in cockpit.astro

- Read `phase` from URL query param when `mode=fokus`
- Dynamically import and render the appropriate component per phase
- Pass `brand` prop to components that need it
- URL pattern: `/sdlc/cockpit?mode=fokus&phase=bauen`

### Step 3: Create CockpitRail.svelte

- Props: `mode`, `phase`, `brand`
- Computes rail content based on mode/phase:
  - **Overview**: Attention (blocked/stuck/cooldown from floorStore), Epics (from portfolio API), Agents (from agent-lock), Models (from model health)
  - **Fokus: Planung**: DoR scores, queue depth, planning metrics
  - **Fokus: Bauen**: Slot usage, active workpieces, agent logs
  - **Fokus: Review**: Open PRs, CI status
  - **Fokus: Deploy**: Awaiting deploy tickets, FluxCD status
  - **Fokus: Ship**: Recently shipped tickets
- Rail has collapsible sections; uses existing Kit panel CSS classes for visual consistency

### Step 4: Wire rail data

- Use existing adapter methods: `data.tickets()`, `data.agents()`, `data.models()`, `data.ci()`, `data.factory()`
- Default to showing "Daten nicht verfügbar" when a source is unreachable (D13 compliance)
- Portfolio API (`/api/cockpit/portfolio`) for epic data in Overview mode

### Step 5: Remove DevStatusTabs tab bar

- Keep the tab content components (FactoryFloor, PlanningOffice, etc.)
- Remove the `<AdminTabs>` rendering code and the 7-tab `activeTab` state
- The mode/phase routing in cockpit.astro replaces the tab switching logic
- Remove the localStorage `dev-status-tab` key usage (replaced by `cockpit:default-view`)

### Step 6: Create mobile layout

- Detect viewport < 768px via CSS media query + JS `matchMedia`
- On mobile:
  - Command Bar becomes a top bar (narrower, icons-only)
  - Rail becomes a bottom sheet (hidden by default, swipe up to reveal)
  - Overview cards stack vertically instead of horizontal row
  - Fokus mode: single full-width phase content
  - Phase navigation: swipeable carousel or bottom sheet with phase list
- Non-reversible actions: locked by default on mobile (existing session-lock requirement)

### Step 7: Create cockpit-mobile.css

- `@media (max-width: 767px)` rules for:
  - `.cockpit` → flex-direction column
  - `.command-bar` → reduced height, compact layout
  - `.cockpit-rail` → position fixed bottom, transform translateY for show/hide
  - `.overview-dashboard` → grid single column
  - `.phase-cards` → vertical stack
  - `.bottom-sheet` → slide-up animation, overlay backdrop

### Step 8: Verify

```bash
cd website && pnpm run build 2>&1 | tail -5
# Should succeed

# Manual checks:
# - /sdlc/cockpit?mode=fokus&phase=bauen → FactoryFloor renders
# - /sdlc/cockpit?mode=fokus&phase=planung → PlanningOffice renders
# - Rail content changes when switching phases
# - Mobile (< 768px): bottom sheet appears, swipe works
```
