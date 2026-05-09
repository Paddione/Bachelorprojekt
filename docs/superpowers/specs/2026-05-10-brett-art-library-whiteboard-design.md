# Brett Art Library + Whiteboard Library Design

**Date:** 2026-05-10  
**Branch:** feature/ops-dashboard  
**Scope:** Brett service figurines + Nextcloud Whiteboard library items

## Overview

Two independent deliverables:

1. **Brett Art Library** — 6 new Kore-styled SVG figurines for the Systembrett 3D board, with a dynamic toolbar replacing the current 4 hard-coded buttons.
2. **Whiteboard Library** — The 6 kore-assets embedded as Excalidraw `libraryItems` in `systembrett.whiteboard`.

---

## Part 1: Brett Art Library

### Figurines

Six new SVG files in `brett/public/art-library/`, all using `viewBox="0 0 240 400"` (portrait orientation — the canvas size `bootArtLibrary()` renders into).

| ID | File | Color | Represents |
|----|------|-------|-----------|
| `person` | `person.svg` | `#C8F76A` (Kore lime) | Adult standing figure |
| `kind` | `kind.svg` | `#5BD4D0` (Kore cyan) | Child — visibly smaller, lower on canvas |
| `gruppe` | `gruppe.svg` | `#C8F76A` | Two side-by-side figures — pairs, families |
| `tier` | `tier.svg` | `#D7B06A` (brass gold) | Stylised animal silhouette |
| `system` | `system.svg` | `#9B7DFF` (violet) | Server/device shape — institutions, systems |
| `objekt` | `objekt.svg` | `#8A93A0` (grey) | Isometric block — obstacles, resources |

All figurines: minimal line-art, stroke-based (no fills), transparent background. They appear as billboard sprites mounted on the existing base disc in Three.js.

### Manifest

`brett/public/art-library/manifest.json`:

```json
{
  "version": "1",
  "assets": [
    { "id": "person",  "kind": "character", "label": "Person",  "files": { "figurine": "person.svg"  } },
    { "id": "kind",    "kind": "character", "label": "Kind",    "files": { "figurine": "kind.svg"    } },
    { "id": "gruppe",  "kind": "character", "label": "Gruppe",  "files": { "figurine": "gruppe.svg"  } },
    { "id": "tier",    "kind": "character", "label": "Tier",    "files": { "figurine": "tier.svg"    } },
    { "id": "system",  "kind": "character", "label": "System",  "files": { "figurine": "system.svg"  } },
    { "id": "objekt",  "kind": "character", "label": "Objekt",  "files": { "figurine": "objekt.svg"  } }
  ]
}
```

### Toolbar Changes (`brett/public/index.html`)

**Remove** the 4 hard-coded `<button class="figure-btn" data-type="figure-0x">` elements.

**Add** an empty container in their place:
```html
<div id="figure-buttons" style="display:flex;gap:6px;"></div>
```

**Modify `bootArtLibrary()`** — after loading textures and SVGs, dynamically build buttons into `#figure-buttons` using safe DOM methods (createElement, textContent, appendChild). Each button gets the figure SVG preview injected into a `.figure-art` child span and a text label below. Click handlers use the same logic as the existing static buttons.

**Keep untouched** — `buildFigure()` fallback branches for `pawn`, `triangle`, `square`, `diamond`. Old snapshots render correctly; these types are simply not offered in the toolbar anymore.

---

## Part 2: Whiteboard Library

### Target file

`website/public/systembrett/systembrett.whiteboard` — modified in-place.

### What changes

**`files` object** (currently `{}`) — gains one entry per asset:

```json
"<fileId>": {
  "mimeType": "image/svg+xml",
  "id": "<fileId>",
  "dataURL": "data:image/svg+xml;base64,<base64>",
  "created": 1746921600000
}
```

Portrait photo uses `"mimeType": "image/jpeg"` with a `data:image/jpeg;base64,...` dataURL.

**`libraryItems` array** (currently `[]`) — gains 6 entries, each with one Excalidraw `image` element referencing the corresponding `fileId`.

### The 6 library items

| Name | Source file | Whiteboard dimensions |
|------|------------|----------------------|
| Kore Logo Mark | `logo-mark.svg` | 128×128 |
| Portrait Platzhalter | `portrait-placeholder.svg` | 200×250 |
| K8s Wheel | `k8s-wheel.svg` | 64×64 |
| Topology 3-Node | `topology-3node.svg` | 320×200 |
| Topology 12-Node | `topology-12node.svg` | 400×250 |
| Portrait Foto | `portrait.jpg` | 200×250 |

---

## Approach: Ansatz C (Dynamic + Fallback)

- Brett toolbar fully driven by manifest — adding a new SVG to `art-library/` + manifest auto-adds a toolbar button.
- Legacy shape types survive in saved snapshots without any migration.
- Whiteboard library is a one-time embed — no runtime dependency.

## Files changed

```
brett/public/art-library/          <- new directory
  manifest.json
  person.svg
  kind.svg
  gruppe.svg
  tier.svg
  system.svg
  objekt.svg
brett/public/index.html             <- toolbar + bootArtLibrary changes
website/public/systembrett/systembrett.whiteboard  <- libraryItems + files added
```

## Out of scope

- No changes to `brett/server.js` — art library served as static files by existing `express.static('public')`.
- No changes to snapshot schema — figure type IDs are stored as strings, same as before.
- No Kustomize or CI changes needed.
