# Brett Appearance UI — Design Spec

**Date:** 2026-05-21  
**Branch:** `feature/brett-appearance-ui`  
**Status:** Approved

---

## Overview

Wire up the existing figure-pack assets (12 faces, 4 body types, 22 accessories) into a playable appearance selection UI in the Brett 3D multiplayer game. Assets and server-side validation already exist; only the client picker, data model extension, WebSocket protocol additions, and Three.js rendering are missing.

---

## Scope

All three appearance categories in one feature:
- **Faces** (12 variants): neutral, observing, distant, overwhelmed, protective, yearning, resolved, withdrawn, present, mourning, curious, blocked
- **Body types** (4 variants): adult (default), adolescent, child, elder
- **Accessories** (22 items, grouped): head (caps, crowns, blindfold…), upper (coat, robe, tunic, vest, apron…), feet (boots…)

---

## UI: Appearance Drawer

### Trigger & Layout

A new icon button in the Navbar opens `#appearance-drawer` — a right-side sliding drawer independent of the existing `#fig-panel` (color/size/label).

- **Desktop:** 280px wide, slides in from right via `transform: translateX(100%) → translateX(0)`, 200ms CSS transition
- **Mobile (≤480px):** full-width overlay
- Drawer is only active when a figure is selected; button is disabled/dimmed otherwise

### Internal Structure

```
#appearance-drawer
  .drawer-header          title ("Aussehen") + ✕ close button
  .drawer-section         ▼ Gesicht
    .thumb-grid           12 items, 3 columns, 60×60px PNG thumbnails
                          radio behaviour (click = select, click active = deselect → null)
  .drawer-section         ▼ Körpertyp
    .thumb-grid           4 items, 2 columns
                          radio behaviour (click = select, NO deselect — always one active)
  .drawer-section         ▼ Accessoires
    .acc-group[Kopf]      radio — 0 or 1 of N head accessories
    .acc-group[Oberkörper] radio — 0 or 1 of N upper accessories
    .acc-group[Füße]      radio — 0 or 1 of N feet accessories
  .drawer-footer
    [Abbrechen]  [Übernehmen]
```

### UX Flow

1. User selects a figure (existing selection mechanic)
2. User clicks the Appearance button → Drawer opens, reads current `appearance` state from the figure and marks active thumbnails
3. User clicks thumbnails to preview locally (Three.js updated immediately in local scene, **not** broadcast yet)
4. "Abbrechen" → closes drawer, reverts local Three.js render to pre-open state
5. "Übernehmen" → sends WebSocket `update` message with full `appearance` object, closes drawer

---

## Data Model

### Figure Object Extension

```js
{
  // existing fields …
  appearance: {
    face: "neutral",          // string key (no path/extension) | null
    body: "adult",            // "adult" | "adolescent" | "child" | "elder"
    accessories: {
      head:  "cap" | null,
      upper: null,
      feet:  "boots" | null
    }
  }
}
```

**Default for new figures:**
```js
{ face: null, body: "adult", accessories: { head: null, upper: null, feet: null } }
```

**Migration for existing figures:** Server applies `?? defaultAppearance` fallback when returning figures via `GET /figures/:room` and on join-snapshot. No DB migration needed — the `state` JSON column stores whatever is there; defaults are applied at read time.

---

## WebSocket Protocol

| Message | Change |
|---|---|
| `add` | Include `appearance` field (default if omitted) |
| `update` | `changes` already supports arbitrary fields — pass `{ appearance: {...} }` |
| join-snapshot | `appearance` is part of persisted JSON, arrives automatically |

`update` with partial appearance must **merge**, not replace:
```js
// Server relay (existing pattern extended):
fig.appearance = { ...fig.appearance, ...changes.appearance }
```

### Server Validation

`validateAppearance()` already exists in `server.js`. Currently only called from `POST /presets/:presetId`. **Add call** in:
- `add` WebSocket handler (validate before storing, reject with error if invalid)
- `update` WebSocket handler (validate `changes.appearance` if present)

---

## Three.js Rendering

### Faces

- `PlaneGeometry` attached to the head bone
- Position: `anchorPx` from `placement_spec.json` → world coordinates: `anchorPx / figurePixelHeight × figureWorldHeight`
- Texture: `/assets/figure-pack/faces/<name>.png` via `THREE.TextureLoader`
- `face: null` → remove face mesh if present

### Accessories

- Same `PlaneGeometry` + texture approach, positioned relative to the corresponding bone per spec
- Items with `billboarding: true` in the spec face the camera using existing billboard logic
- `null` value for a group → remove that group's mesh

### Body Type

- `proportionalScales` from spec changes bone ratios across the entire skeleton
- On body-type change: call `initFigureSkeleton(fig)` with new scale factors
- Existing `boneOverrides` are preserved and recalculated against new base scales

### Texture Cache

```js
const textureCache = new Map()
function loadTex(path) {
  if (!textureCache.has(path))
    textureCache.set(path, new THREE.TextureLoader().load(path))
  return textureCache.get(path)
}
```

- 404 fallback: transparent `MeshBasicMaterial`, no error thrown, no broken mesh
- Cache is module-scoped, populated lazily on first use

---

## Testing

### Automated — `brett/test/appearance.test.mjs` (new)

- `validateAppearance()` accepts valid inputs (all nulls, partial, full)
- `validateAppearance()` rejects unknown body type, unknown face key
- Default fallback: figure without `appearance` field receives correct defaults
- `add` handler: `appearance` stored in room state
- `update` handler: partial `appearance` change merges correctly (changing `face` leaves `accessories` unchanged)

### CI

Add `brett/test/appearance.test.mjs` to the Brett test command in `Taskfile.yml`:
```
node --test brett/test/ws-reconnect.test.mjs brett/test/physics.test.js brett/test/damage.test.mjs brett/test/pickups.test.mjs brett/test/mode-state.test.mjs brett/test/appearance.test.mjs
```

### Manual Smoke Tests

- Drawer opens/closes, reflects selected figure's current appearance
- Thumbnail selection previews locally without broadcast
- "Übernehmen" broadcasts update; second browser tab sees change
- "Abbrechen" reverts local render to pre-open state
- Body-type change re-initialises skeleton without crash or visual glitch
- Old figure (no `appearance` field in DB) does not crash on join

---

## Out of Scope

- Saving appearance as a named preset (existing preset system is separate)
- Appearance visible on minimap/list views
- Animated transition between body types
- Sound on appearance change
