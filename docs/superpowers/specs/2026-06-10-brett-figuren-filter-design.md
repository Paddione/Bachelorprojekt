# Brett Figuren-Filter (T000607) — Design Spec

## Problem

Systembrett sessions with many figures (8–20+) make it hard to focus on one person or group. There is currently no way to temporarily reduce visual noise by narrowing attention to figures matching a search term. The coaching facilitator needs to type a name fragment and have non-matching figures dim immediately — without disrupting the spatial layout that systemic constellation relies on.

## Solution

A topbar search input that filters figures by label (name). Non-matching figures are dimmed to opacity ~0.15, consistent with how `updateModerationVisuals()` dims figures during Spotlight/Dim moderation. Matching figures remain at full opacity. The filter is client-local: it never sends a WebSocket message, never affects other participants, and is never persisted. Clearing the input (Escape key or × button) restores all figures to full opacity.

## Design Decisions

### Visual: Dim vs. Hide (Option A — chosen)

Non-matching figures are dimmed to **opacity 0.15** rather than hidden. Spatial context (relative positions, relationships) is preserved. This is consistent with the `DIM_OPACITY = 0.18` constant already used by `updateModerationVisuals()` in `mannequin.ts`.

### Filter scope

Label text only (`fig.label`). Case-insensitive substring match. Empty query = no filter (all figures at full opacity).

### UI placement

**Topbar**, between the existing right-hand group and the `topbar-participants-slot`. A new `<div id="topbar-filter-slot">` is added to `public/index.html`. The slot is mounted by `board-boot.ts` calling `mountFilterInput()` from a new file `brett/src/client/ui/topbar-filter.ts`.

The input:
- Placeholder: `Figur suchen …`
- Width: 140px (shrinks on mobile via existing topbar media query)
- A × button appears when the input has text (clears on click)
- Escape key clears + blurs

### Filter state

Session-only. Stored in a module-level variable in `topbar-filter.ts`. Not persisted to localStorage, not sent over WS.

### Interaction with other opacity changes

The filter dim is applied **independently** of moderation visuals. `updateModerationVisuals()` runs per-frame from the tick loop. The filter dim is applied as a **separate pass** also in the tick loop, after moderation. Specifically:

- If moderation is active and a figure is already dimmed by moderation (opacity 0.18), the filter does not make it more visible (does not raise opacity).
- If no moderation is active, non-matching figures get opacity 0.15.
- The filter state is communicated to the tick loop via a pure getter `getFilterQuery()` exported from `topbar-filter.ts` — the tick loop in `board-boot.ts` calls a new `updateFilterVisuals(figures, query)` function from `mannequin.ts`.

### Selection interaction

Selecting a dimmed figure (clicking it) still works normally. Dimming is visual only; raycasting and interaction are unaffected.

## Files Changed

| File | Change |
|------|--------|
| `brett/public/index.html` | Add `<div id="topbar-filter-slot"></div>` |
| `brett/src/client/ui/topbar-filter.ts` | New: filter input component with pure helpers + DOM mount |
| `brett/src/client/mannequin.ts` | Add `updateFilterVisuals(figures, query)` |
| `brett/src/client/board-boot.ts` | Mount filter input + call `updateFilterVisuals` in tick loop |
| `brett/test/topbar-filter.test.ts` | Unit tests for pure helpers + `updateFilterVisuals` |

## Non-Goals

- No server-side filter state
- No filtering by color, note, or any other attribute
- No persistence across page reloads
- No multi-participant synchronization
