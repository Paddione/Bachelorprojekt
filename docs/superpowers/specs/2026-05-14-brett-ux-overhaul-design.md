# Brett UX Overhaul — Design Spec

**Branch:** `feature/brett-ux-overhaul`  
**Date:** 2026-05-14  
**Status:** Approved

---

## Scope

Three self-contained changes to `brett/public/index.html` plus SVG asset fixes:

1. **Head-bug fix** — SVG character heads are transparent (fill:none), board shows through
2. **Character-editor panel** — foldable dropdown in the top toolbar replacing the current scattered controls
3. **Movement overhaul** — remove ctrlBall, add WASD+sprint and double-click-teleport

---

## 1 — Head-Bug Fix (SVG Assets)

### Problem

All person-category SVGs have `fill="none"` on their head circle element. In Three.js, the sprite is rendered with `transparent: true`, so the transparent interior of the circle shows the board behind it — the head looks hollow or absent.

### Fix

For every person/role SVG that contains a head circle, change `fill="none"` to `fill` matching the element's `stroke` color. This makes the head fully opaque without requiring any JS change.

**Affected files (11):**

| File | Current stroke | New fill |
|------|---------------|----------|
| `mann.svg` | `#C8F76A` | `#C8F76A` |
| `frau.svg` | `#C8F76A` | `#C8F76A` |
| `person.svg` | `#C8F76A` | `#C8F76A` |
| `nonbinary.svg` | `#C8F76A` | `#C8F76A` |
| `senior.svg` | `#C8F76A` | `#C8F76A` |
| `baby.svg` | `#C8F76A` | `#C8F76A` |
| `fuehrungskraft.svg` | `#C8F76A` | `#C8F76A` |
| `mitarbeiter.svg` | `#C8F76A` | `#C8F76A` |
| `kunde.svg` | `#C8F76A` | `#C8F76A` |
| `berater.svg` | `#C8F76A` | `#C8F76A` |
| `kind.svg` | `#5BD4D0` | `#5BD4D0` |

`nonbinary.svg` has two circles (head + body detail) — only the **first** circle (the head, largest r) gets the fill. Symbol SVGs (herz, stern, kreuz, etc.) have no head circle and are not touched.

### Caching

`loadCharacterTexture` caches by id in `characterTextures`. Since the fix is in the SVG source files, the cache is invalidated automatically on reload (no JS changes needed).

---

## 2 — Character-Editor Panel

### Current state

Controls are scattered across the top toolbar in a fixed horizontal row: category tabs → figure buttons → colour swatches → size S/M/L + slider → rotation buttons → delete. These cannot be hidden and take permanent toolbar space.

### New behaviour

**A `＋ Figur ▾` button** is added to the toolbar (replacing the scattered controls). Clicking it toggles a floating dropdown panel directly below.

#### Panel layout

```
┌─ Toolbar ─────────────────────────────────────────────────┐
│ [Aufstellung ▾]  [＋ Figur ▾]  ...  [Optik]  [Speichern] │
└──────────────┬────────────────────────────────────────────┘
               ↓ (panel opens below button)
   ┌───────────────────────────────┐
   │  NEUE FIGUR              [✕] │
   │  ── Kategorie ─────────────  │
   │  [👤 Personen] [🏢 Rollen]…  │
   │  ── Typ ───────────────────  │
   │  [Mann] [Frau] [Kind] …      │
   │  ── Farbe ─────────────────  │
   │  🔴 🔵 🟢 🟡 🟣 🟠 ⚪      │
   │  ── Größe ─────────────────  │
   │  [S] [M] [L]  ──────── 1.0× │
   │                               │
   │  [＋ Auf Brett setzen]        │
   └───────────────────────────────┘
```

#### Dual mode

| State | Panel title | "Setzen"-Button | Changes apply to |
|-------|-------------|-----------------|-----------------|
| No figure selected | **NEUE FIGUR** | Visible — triggers crosshair placement | New figure created on click |
| Figure selected | **FIGUR BEARBEITEN** | Hidden | Selected figure immediately (live recolor/rescale/retype) |

When switching from "edit" mode back to "new" mode (user deselects figure), panel reverts to NEUE FIGUR title and re-shows the Setzen button; pending settings (colour, size) are preserved as the default for the next new figure.

#### Crosshair placement mode

After clicking "Auf Brett setzen":
1. Panel closes
2. Cursor changes to `crosshair`
3. A hint appears: _"Klick auf das Brett zum Platzieren — Esc zum Abbrechen"_
4. First click on the board → `addFigure(...)` at raycasted board position, send WebSocket `add`, open label modal
5. Escape or click on empty non-board area cancels placement, cursor restored

#### Closing the panel

- Click the ✕ button inside the panel
- Click the `＋ Figur ▾` button again (toggle)
- Click anywhere outside the panel
- Entering crosshair mode (auto-closes)

#### Toolbar cleanup

The following elements are **removed** from the toolbar DOM:
- `#category-tabs` div
- `#figure-buttons` div
- `.color-swatch` elements and their label
- `#scale-section` (S/M/L buttons + slider + value span)
- `#rot-section` (rotate buttons) — rotation stays accessible via context menu and keyboard shortcuts (↺/↻ already work via the `R` tool + drag)

The `btn-delete`, save/load/reset buttons, sync-status, optik-wrap, and collapse/minimap buttons remain in the toolbar.

---

## 3 — Movement Overhaul

### Removed

**ctrlBall** — the golden sphere+ring that appeared on click-on-empty-board — is removed entirely:
- `showCtrlBall`, `hideCtrlBall`, `pickBall` functions deleted
- `ctrlBall`, `ctrlBallActive`, `ctrlBallDrag`, `ctrlBallStart`, `ctrlBallShowTime` variables deleted
- The `else` branch in the `'V'` tool mousedown handler that called `showCtrlBall` is replaced with a no-op (selecting null still happens)

### Kept

**Drag-to-move** remains unchanged: click figure + drag → figure follows cursor → mouseup sends WebSocket `move`.

### New: WASD / Arrow-key movement

Implemented as a per-frame RAF tick (no `keydown` repeat delay).

```
keydown  → set held[key] = true
keyup    → set held[key] = false, send WebSocket move for final position
RAF tick → if selectedFigure && any WASD/arrow held:
             speed = held[Shift] ? 12 : 4   (units/second)
             dx/dz from held keys, normalized for diagonal
             clamp to board bounds (±BW/2+1, ±BD/2+1)
             update mesh.position
             sendMoveThrottled (16ms throttle, reuse existing)
```

Keys: `W`/`ArrowUp` = −Z, `S`/`ArrowDown` = +Z, `A`/`ArrowLeft` = −X, `D`/`ArrowRight` = +X.  
Diagonal movement is normalized (√2 factor removed).  
Keys are ignored when any modal is open (`isAnyModalOpen()`).  
Keys are ignored when focus is in a text input/textarea.

Hint text for V tool updated: _"Tap = auswählen · Drag = ziehen · WASD = bewegen · Shift = Sprint · Doppelklick = Teleport"_

### New: Double-click teleport

On `mousedown` with fast double-click detection (< 380 ms gap):

- **Double-click ON a figure** → existing behaviour: open label modal (unchanged)
- **Double-click on empty board** → if `selectedFigure` exists:
  - Raycast board position
  - Animate figure position from current to target over 300 ms (ease-out-cubic, same easer already used for camera)
  - Send WebSocket `move` at animation end

The existing single-click double-click detection (`lastClick` object) is extended with a `boardPos` field to distinguish figure vs board double-clicks cleanly.

---

## Out of Scope

- Touch-specific sprint (no Shift key on mobile) — can be added later
- Rotation controls in the panel (rotation remains via `R` tool + keyboard shortcuts)
- Custom figure colours beyond the existing 7 swatches
- Animation for WASD movement (figures slide vs teleport)

---

## Files Changed

| File | Change |
|------|--------|
| `brett/public/art-library/mann.svg` … (11 SVGs) | `fill="none"` → `fill=<stroke-color>` on head circle |
| `brett/public/index.html` | Panel HTML+CSS, panel JS, movement JS, ctrlBall removal |
