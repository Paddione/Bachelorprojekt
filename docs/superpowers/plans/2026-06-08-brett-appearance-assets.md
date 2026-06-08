---
title: Brett appearance-assets Implementation Plan
ticket_id: T000522
domains: [website, infra, db, test]
status: active
pr_number: null
---

# Brett appearance-assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 3 new face emotions (`relieved`, `defiant`, `fearful`) and 2 new accessories (`scarf`, `spectacles`) to the Brett figure-pack — generated as pixel-art PNGs via the `atelier` MCP and wired into the existing spec-driven appearance machinery.

**Architecture:** Each asset is drawn headless with `atelier` (`doc_create` → `doc_batch` ops → `doc_render` inspect → iterate → `doc_render scale=1 out_path=…` final export), then registered in `brett/public/assets/figure-pack/placement_spec.json`. Faces need **zero TS change** (read dynamically via `Object.keys(PLACEMENT_SPEC.faces)`); accessories need one edit to the hardcoded `ACC_GROUPS` map in `brett/src/client/ui/appearance.ts`. No new subsystem.

**Tech Stack:** `atelier` MCP (deferred tools — load via `ToolSearch select:mcp__atelier__…`), Three.js (Brett client), TypeScript, JSON spec, go-task / kustomize push-deploy.

---

## Critical context for the implementing agent

You have **no prior context** beyond this plan. Read these facts before starting.

### atelier MCP usage
- atelier tools are **deferred**. Before the first call, load schemas: `ToolSearch` with query `select:mcp__atelier__doc_create,mcp__atelier__doc_batch,mcp__atelier__doc_render,mcp__atelier__doc_ellipse,mcp__atelier__doc_line,mcp__atelier__doc_polyline,mcp__atelier__doc_fill,mcp__atelier__doc_rect,mcp__atelier__list_docs,mcp__atelier__delete_doc`.
- Per-asset workflow: `doc_create(name,w,h)` → `doc_batch(doc_id,layer,frame,ops)` with draw ops → `doc_render` (no `out_path`) to **visually inspect** → iterate ops until correct → final `doc_render scale=1 out_path=<absolute target path>` to export the native PNG.
- **FOOTGUN — `ellipse` op takes NO `size`/thickness field.** A thick ring = two concentric ellipses: outer filled with the stroke color, inner re-drawn with fully-transparent color `[0,0,0,0]` to erase the center. Use this for round eyes (`fearful`) and the spectacles lenses.
- Colors are RGBA arrays `[r,g,b,a]`, 0–255. `relieved` may already exist as an atelier doc from an earlier demo (check `list_docs`); if present, re-export it; if absent, build fresh. Same for `scarf`.

### Palette (verified from `brett/src/.../colors_and_type.css`)
- Face strokes: dark slate `#1b1f28` → `[27,31,40,255]`
- sage `#b8c0a8` → `[184,192,168,255]`
- sage-deep `#8e9a7c` → `[142,154,124,255]`
- sage-soft `#cdd4c0` → `[205,212,192,255]`
- skin `#d9c89b` → `[217,200,155,255]`
- brass `#c8a96e` → `[200,169,110,255]`
- brass-deep `#8a7244` → `[138,114,68,255]`

### Sizes & target paths (worktree-relative; use absolute `/tmp/wt-brett-appearance-assets/…` in `out_path`)
- Faces — **512×512** RGBA, transparent bg → `brett/public/assets/figure-pack/faces/{relieved,defiant,fearful}.png`
- Accessories — **256×256** RGBA, transparent bg → `brett/public/assets/figure-pack/accessories/{scarf,spectacles}.png`

### Style references (read these PNGs first to match the house style)
- Faces: `brett/public/assets/figure-pack/faces/neutral.png` — soft rounded dark strokes, centered at u/v=0.5 (front of the head sphere). Minimal-stroke style; every expression must be unambiguously readable.
- Accessories: `brett/public/assets/figure-pack/accessories/coat.png` and `…/shawl.png` — flat shapes, muted earthy palette.

### Verified integration facts
- `brett/src/client/state.ts` exposes `PLACEMENT_SPEC`; `appearance.ts:22` reads `PLACEMENT_SPEC.faces?.[faceName]` and the faces grid is built from `Object.keys(PLACEMENT_SPEC.faces)` → **new faces appear automatically** once registered in the JSON. No TS edit for faces.
- `brett/src/server/presets.ts` validates server-side via `FACE_NAMES()` / `ACC_NAMES()` = `Object.keys(SPEC.faces|accessories).filter(k => !k.startsWith('_'))` → registering in the same JSON keeps client & server in sync automatically. No TS edit for validation.
- `ACC_GROUPS` (`brett/src/client/ui/appearance.ts:14-18`) is the **only** hardcoded list and must be edited: add `scarf` to `upper`, `spectacles` to `head`.
- Existing `shawl` spec entry (the model for `scarf`):
  `{"file":"accessories/shawl.png","bone":"neck","anchorPx":[128,80],"sizeMeters":[0.8,0.8],"positionOffset":[0,-0.02,0.04],"rotation":[0,0,0],"billboard":"yAxis","notes":"…"}`
- Existing `cap`/`crown` (the model for `spectacles`, but at eye height not apex):
  `cap`: `anchorPx [128,168]`, `positionOffset [0,0.16,0]` (apex). For `spectacles` we want the plane in **front of the face sphere at eye height**, so `positionOffset` ≈ `[0,0.02,0.16]` (small +Y, push +Z forward toward camera/front), NOT a large +Y apex offset.
- Face spec entries are minimal: `{"file":"faces/<name>.png","stance":"<short description>"}` (see `neutral`, `curious`).

### Test / deploy facts
- Brett typecheck = `npm run typecheck` in `brett/` (`tsc --noEmit` for client+server tsconfigs); also gated by `task test:all`.
- CI runs a **test-inventory** check; if `task test:all` complains about `website/src/data/test-inventory.json` drift, run `task test:inventory` and commit the regenerated file. (This change adds no tests, so drift is unlikely — but verify.)
- Deploy is push-based to **both** brands. Do NOT hardcode the task — resolve it via `bash scripts/task-oracle.sh 'deploy brett to both brands'` (typically `task feature:brett`).

---

## File Structure

| Path | Responsibility | Action |
|------|----------------|--------|
| `brett/public/assets/figure-pack/faces/relieved.png` | new face texture | Create (atelier export) |
| `brett/public/assets/figure-pack/faces/defiant.png` | new face texture | Create (atelier export) |
| `brett/public/assets/figure-pack/faces/fearful.png` | new face texture | Create (atelier export) |
| `brett/public/assets/figure-pack/accessories/scarf.png` | new accessory sprite | Create (atelier export) |
| `brett/public/assets/figure-pack/accessories/spectacles.png` | new accessory sprite | Create (atelier export) |
| `brett/public/assets/figure-pack/placement_spec.json` | asset registry (faces + accessories) | Modify |
| `brett/src/client/ui/appearance.ts` | `ACC_GROUPS` slot map | Modify (lines 14-18) |

---

## Phase A — Generate & export the 5 assets

> Each asset task ends with an explicit **visual-inspection gate**: render with no `out_path`, LOOK at the PNG, confirm the expression/shape is readable AND consistent with neighbour assets AND uses the correct palette. Do NOT export the final PNG until the inspection passes.

### Task A0: Setup — load atelier tools & study the house style

- [ ] **Step 1: Load atelier tool schemas**

`ToolSearch` query:
```
select:mcp__atelier__doc_create,mcp__atelier__doc_batch,mcp__atelier__doc_render,mcp__atelier__doc_ellipse,mcp__atelier__doc_line,mcp__atelier__doc_polyline,mcp__atelier__doc_fill,mcp__atelier__doc_rect,mcp__atelier__doc_pencil,mcp__atelier__list_docs,mcp__atelier__delete_doc
```
Expected: a `<functions>` block defining each `mcp__atelier__*` tool.

- [ ] **Step 2: Study the reference faces**

Read (visually) `brett/public/assets/figure-pack/faces/neutral.png` and `…/curious.png`, and `…/accessories/coat.png` + `…/shawl.png`. Note stroke weight, placement (eyes ~upper-third, mouth ~lower-third, centered horizontally), and palette.

- [ ] **Step 3: Check for leftover demo docs**

Call `mcp__atelier__list_docs`. If a `relieved` (512²) or `scarf` (256²) doc from the earlier demo exists, note its `doc_id` for reuse in Tasks A1 / A4. Otherwise build fresh in those tasks.

---

### Task A1: `relieved` face (512×512)

**Files:** Create `brett/public/assets/figure-pack/faces/relieved.png`

**Expression:** closed, content eyes (downward-arc `◠◠`) + soft exhale smile (gentle upward arc `‿`). Positive resolution. Strokes only, color `[27,31,40,255]`, transparent bg.

- [ ] **Step 1: Create or reuse the doc**

If a demo `relieved` doc exists (from A0 Step 3), use its `doc_id` and skip to Step 3. Otherwise:
`mcp__atelier__doc_create(name="relieved", width=512, height=512)` → capture `doc_id`.

- [ ] **Step 2: Draw the expression**

`mcp__atelier__doc_batch(doc_id, layer=0, frame=0, ops=[…])` with, using stroke color `[27,31,40,255]`:
- Left closed eye: a downward arc (smile-shaped, opening down) centered near `(180,200)`, ~90px wide — draw as a `polyline` of points forming `◠` (e.g. `[[145,205],[160,192],[180,188],[200,192],[215,205]]`), or two short `line` segments meeting at the apex.
- Right closed eye: mirror near `(332,200)` (e.g. `[[297,205],[312,192],[332,188],[352,192],[367,205]]`).
- Mouth: soft upward smile arc centered near `(256,330)`, ~120px wide, gentle curve (e.g. `polyline [[196,325],[226,340],[256,344],[286,340],[316,325]]`).
Keep strokes 2–3px (repeat adjacent pixel rows via two parallel polylines if needed for weight matching `neutral.png`).

- [ ] **Step 3: VISUAL-INSPECTION GATE — render & look**

`mcp__atelier__doc_render(doc_id, frame=0)` (no `out_path`). LOOK at the result. Confirm: closed-eye arcs read as eased/content, mouth reads as a gentle smile, stroke weight matches `neutral.png`, bg transparent, centered. If not, return to Step 2 and adjust ops. Do NOT proceed until it reads clearly as "relieved".

- [ ] **Step 4: Export final PNG**

`mcp__atelier__doc_render(doc_id, frame=0, scale=1, out_path="/tmp/wt-brett-appearance-assets/brett/public/assets/figure-pack/faces/relieved.png")`

- [ ] **Step 5: Verify file exists & dimensions**

Run: `python3 -c "from PIL import Image; im=Image.open('/tmp/wt-brett-appearance-assets/brett/public/assets/figure-pack/faces/relieved.png'); print(im.size, im.mode)"`
Expected: `(512, 512) RGBA`
(If PIL is unavailable, run `file brett/public/assets/figure-pack/faces/relieved.png` and confirm `512 x 512`.)

- [ ] **Step 6: Commit**

```bash
git add brett/public/assets/figure-pack/faces/relieved.png
git commit -m "feat(brett): add relieved face asset to figure-pack"
```

---

### Task A2: `defiant` face (512×512)

**Files:** Create `brett/public/assets/figure-pack/faces/defiant.png`

**Expression:** brows angled inward-and-down (`\  /` knitted scowl) + flat/hard mouth (straight or slightly down). Hostile/standing-firm — distinct from `protective` (which is shielding, not aggressive). Strokes color `[27,31,40,255]`.

- [ ] **Step 1: Create the doc**

`mcp__atelier__doc_create(name="defiant", width=512, height=512)` → capture `doc_id`.

- [ ] **Step 2: Draw the expression**

`mcp__atelier__doc_batch(doc_id, layer=0, frame=0, ops=[…])`, stroke `[27,31,40,255]`:
- Left brow: a line angled down-toward-center, e.g. `line [[150,180],[210,205]]` (outer-high, inner-low).
- Right brow: mirror `line [[362,180],[302,205]]`.
- Left eye: short flat line / small dash under the brow, e.g. `line [[165,225],[205,225]]`.
- Right eye: `line [[307,225],[347,225]]`.
- Mouth: hard flat line, slightly downturned, near `(256,335)`, e.g. `polyline [[200,332],[256,340],[312,332]]`.
Match stroke weight to `neutral.png` (double parallel lines if needed).

- [ ] **Step 3: VISUAL-INSPECTION GATE — render & look**

`mcp__atelier__doc_render(doc_id, frame=0)` (no `out_path`). LOOK. Confirm the knitted brows read as defiant/hostile (not sad — sad brows angle the opposite way, inner-high), mouth reads hard/flat, weight & centering match neighbours. Iterate on Step 2 until clear. Do NOT proceed otherwise.

- [ ] **Step 4: Export final PNG**

`mcp__atelier__doc_render(doc_id, frame=0, scale=1, out_path="/tmp/wt-brett-appearance-assets/brett/public/assets/figure-pack/faces/defiant.png")`

- [ ] **Step 5: Verify**

Run: `python3 -c "from PIL import Image; im=Image.open('/tmp/wt-brett-appearance-assets/brett/public/assets/figure-pack/faces/defiant.png'); print(im.size, im.mode)"`
Expected: `(512, 512) RGBA`

- [ ] **Step 6: Commit**

```bash
git add brett/public/assets/figure-pack/faces/defiant.png
git commit -m "feat(brett): add defiant face asset to figure-pack"
```

---

### Task A3: `fearful` face (512×512)

**Files:** Create `brett/public/assets/figure-pack/faces/fearful.png`

**Expression:** wide round eyes (`○○`) + small tight mouth. Fear/alarm — distinct from `overwhelmed` (sensory overload, brows raised). Strokes color `[27,31,40,255]`.

- [ ] **Step 1: Create the doc**

`mcp__atelier__doc_create(name="fearful", width=512, height=512)` → capture `doc_id`.

- [ ] **Step 2: Draw the eyes as thick rings (concentric-ellipse trick)**

`mcp__atelier__doc_batch(doc_id, layer=0, frame=0, ops=[…])`:
- Left eye outer ellipse filled stroke color: `ellipse` centered ~`(185,200)`, radius ~38px, color `[27,31,40,255]`, filled.
- Left eye inner ellipse erased: `ellipse` same center, radius ~28px, color `[0,0,0,0]`, filled (carves the hole → leaves a ~10px ring).
- Right eye outer: `ellipse` centered ~`(327,200)`, radius ~38px, `[27,31,40,255]`, filled.
- Right eye inner erased: `ellipse` same center, radius ~28px, `[0,0,0,0]`, filled.
(Remember: the `ellipse` op has **no thickness field** — the ring comes from outer-minus-inner. Order matters: outer first, inner second.)
- Mouth: small tight shape near `(256,340)` — a small filled ellipse radius ~14px `[27,31,40,255]`, or a short `polyline` knot. Keep it small and tense.

- [ ] **Step 3: VISUAL-INSPECTION GATE — render & look**

`mcp__atelier__doc_render(doc_id, frame=0)` (no `out_path`). LOOK. Confirm: both eyes are clean open rings (not filled discs — if filled, the inner erase ellipse failed; re-check radius/order), mouth small & tight, reads as alarmed/fearful, palette & centering correct. Iterate Step 2 until clear.

- [ ] **Step 4: Export final PNG**

`mcp__atelier__doc_render(doc_id, frame=0, scale=1, out_path="/tmp/wt-brett-appearance-assets/brett/public/assets/figure-pack/faces/fearful.png")`

- [ ] **Step 5: Verify**

Run: `python3 -c "from PIL import Image; im=Image.open('/tmp/wt-brett-appearance-assets/brett/public/assets/figure-pack/faces/fearful.png'); print(im.size, im.mode)"`
Expected: `(512, 512) RGBA`

- [ ] **Step 6: Commit**

```bash
git add brett/public/assets/figure-pack/faces/fearful.png
git commit -m "feat(brett): add fearful face asset to figure-pack"
```

---

### Task A4: `scarf` accessory (256×256)

**Files:** Create `brett/public/assets/figure-pack/accessories/scarf.png`

**Look:** a narrow draped neck-scarf, mirroring `shawl.png` but slimmer. Flat shapes, sage palette (`[184,192,168,255]` body, `[142,154,124,255]` shadow/fold accents). Transparent bg. Drapes over shoulders with hanging ends.

- [ ] **Step 1: Create or reuse the doc**

If a demo `scarf` doc exists (A0 Step 3), use its `doc_id` and skip to Step 3. Otherwise:
`mcp__atelier__doc_create(name="scarf", width=256, height=256)` → capture `doc_id`.

- [ ] **Step 2: Draw the scarf**

`mcp__atelier__doc_batch(doc_id, layer=0, frame=0, ops=[…])`:
- Neck band: a horizontal rounded band across the upper third, narrower than shawl — e.g. `rect`/`polygon` spanning x `[70,186]`, y `[70,100]`, filled sage `[184,192,168,255]`.
- Two hanging ends: vertical tapering strips dropping from center, e.g. `polygon [[112,95],[144,95],[138,175],[118,175]]` filled sage.
- Fold/shadow accents: a few `line` strokes in sage-deep `[142,154,124,255]` along the inner edges of the hanging ends for depth.
Keep it visibly **slimmer** than `shawl.png`.

- [ ] **Step 3: VISUAL-INSPECTION GATE — render & look**

`mcp__atelier__doc_render(doc_id, frame=0)` (no `out_path`). LOOK. Confirm: reads as a draped scarf, slimmer than shawl, flat sage palette matching neighbour accessories, transparent bg, roughly centered horizontally (anchor will be `[128,80]`). Iterate Step 2 until clear.

- [ ] **Step 4: Export final PNG**

`mcp__atelier__doc_render(doc_id, frame=0, scale=1, out_path="/tmp/wt-brett-appearance-assets/brett/public/assets/figure-pack/accessories/scarf.png")`

- [ ] **Step 5: Verify**

Run: `python3 -c "from PIL import Image; im=Image.open('/tmp/wt-brett-appearance-assets/brett/public/assets/figure-pack/accessories/scarf.png'); print(im.size, im.mode)"`
Expected: `(256, 256) RGBA`

- [ ] **Step 6: Commit**

```bash
git add brett/public/assets/figure-pack/accessories/scarf.png
git commit -m "feat(brett): add scarf accessory asset to figure-pack"
```

---

### Task A5: `spectacles` accessory (256×256)

**Files:** Create `brett/public/assets/figure-pack/accessories/spectacles.png`

**Look:** two round lens rings joined by a bridge, plus short temple arms. Brass frame (`[200,169,110,255]`, deeper `[138,114,68,255]` for shading). Lenses transparent (open rings). Sits at eye height in front of the face sphere.

- [ ] **Step 1: Create the doc**

`mcp__atelier__doc_create(name="spectacles", width=256, height=256)` → capture `doc_id`.

- [ ] **Step 2: Draw the frames as thick rings (concentric-ellipse trick)**

`mcp__atelier__doc_batch(doc_id, layer=0, frame=0, ops=[…])`, vertically centered ~y=128:
- Left lens outer: `ellipse` center ~`(95,128)`, radius ~34px, brass `[200,169,110,255]`, filled.
- Left lens inner erase: `ellipse` same center, radius ~26px, color `[0,0,0,0]`, filled (→ ring, lens stays transparent).
- Right lens outer: `ellipse` center ~`(161,128)`, radius ~34px, brass `[200,169,110,255]`, filled.
- Right lens inner erase: `ellipse` same center, radius ~26px, `[0,0,0,0]`, filled.
- Bridge: short `rect`/`line` joining the two rings across the top-center, ~`x[121,135] y[118,126]`, brass `[200,169,110,255]`.
- Temple arms: two short `line`s from the outer edge of each ring outward, e.g. `line [[61,122],[40,116]]` and `line [[195,122],[216,116]]`, brass.
- Optional shading: a few `[138,114,68,255]` pixels on the lower-inner ring edges.
(Again: `ellipse` has **no thickness** — rings = outer filled then inner erased; inner ellipse MUST come after outer.)

- [ ] **Step 3: VISUAL-INSPECTION GATE — render & look**

`mcp__atelier__doc_render(doc_id, frame=0)` (no `out_path`). LOOK. Confirm: two clean open lens rings (not filled discs), joined bridge, short temple arms, brass palette, lenses transparent, bg transparent, horizontally centered (anchor `[128,128]`). Iterate Step 2 until clear.

- [ ] **Step 4: Export final PNG**

`mcp__atelier__doc_render(doc_id, frame=0, scale=1, out_path="/tmp/wt-brett-appearance-assets/brett/public/assets/figure-pack/accessories/spectacles.png")`

- [ ] **Step 5: Verify**

Run: `python3 -c "from PIL import Image; im=Image.open('/tmp/wt-brett-appearance-assets/brett/public/assets/figure-pack/accessories/spectacles.png'); print(im.size, im.mode)"`
Expected: `(256, 256) RGBA`

- [ ] **Step 6: Commit**

```bash
git add brett/public/assets/figure-pack/accessories/spectacles.png
git commit -m "feat(brett): add spectacles accessory asset to figure-pack"
```

---

## Phase B — Register assets in `placement_spec.json`

**File:** Modify `brett/public/assets/figure-pack/placement_spec.json`

### Task B1: Register the 3 faces

- [ ] **Step 1: Add three face entries**

In the `"faces"` object (after the existing emotion entries, before the `portrait-*` entries is fine — order is not semantically significant), add:
```json
"relieved": { "file": "faces/relieved.png", "stance": "eased, present — soft closed eyes and a quiet exhale smile" },
"defiant":  { "file": "faces/defiant.png",  "stance": "standing firm — brows knit inward, mouth set hard and flat" },
"fearful":  { "file": "faces/fearful.png",  "stance": "alarmed — wide round eyes, small tight mouth" }
```
Match the existing two-space indentation and ensure trailing commas are correct (the inserted block needs a comma after each entry if more keys follow, none after the last key of the object).

- [ ] **Step 2: Validate JSON & file paths**

Run:
```bash
cd /tmp/wt-brett-appearance-assets && python3 -c "
import json
d=json.load(open('brett/public/assets/figure-pack/placement_spec.json'))
import os
for k in ['relieved','defiant','fearful']:
    f=d['faces'][k]['file']
    assert os.path.exists('brett/public/assets/figure-pack/'+f), f'missing {f}'
    print('ok', k, f)
"
```
Expected: `ok relieved …`, `ok defiant …`, `ok fearful …` (no exception = valid JSON + all files exist).

- [ ] **Step 3: Commit**

```bash
git add brett/public/assets/figure-pack/placement_spec.json
git commit -m "feat(brett): register relieved/defiant/fearful faces in placement_spec"
```

### Task B2: Register the 2 accessories

- [ ] **Step 1: Add two accessory entries**

In the `"accessories"` object, add (modelled on `shawl` for `scarf`; on `cap`/`crown` but at eye height for `spectacles`):
```json
"scarf": {
  "file": "accessories/scarf.png",
  "bone": "neck",
  "anchorPx": [128, 80],
  "sizeMeters": [0.7, 0.7],
  "positionOffset": [0, -0.02, 0.05],
  "rotation": [0, 0, 0],
  "billboard": "yAxis",
  "notes": "Narrow neck-scarf, slimmer than shawl. Slight Z forward to avoid torso clipping."
},
"spectacles": {
  "file": "accessories/spectacles.png",
  "bone": "head",
  "anchorPx": [128, 128],
  "sizeMeters": [0.4, 0.4],
  "positionOffset": [0, 0.02, 0.16],
  "rotation": [0, 0, 0],
  "billboard": "yAxis",
  "notes": "Sits at eye height in front of the face sphere (u/v ~= 0.5), pushed forward in +Z — not on the head apex like cap/crown."
}
```
Mind the trailing-comma rules so the object stays valid JSON.

- [ ] **Step 2: Validate JSON & file paths**

Run:
```bash
cd /tmp/wt-brett-appearance-assets && python3 -c "
import json, os
d=json.load(open('brett/public/assets/figure-pack/placement_spec.json'))
for k in ['scarf','spectacles']:
    e=d['accessories'][k]
    for key in ['file','bone','anchorPx','sizeMeters','positionOffset','rotation','billboard','notes']:
        assert key in e, f'{k} missing {key}'
    assert os.path.exists('brett/public/assets/figure-pack/'+e['file']), f'missing {e[\"file\"]}'
    print('ok', k, e['bone'], e['file'])
"
```
Expected: `ok scarf neck …`, `ok spectacles head …`.

- [ ] **Step 3: Commit**

```bash
git add brett/public/assets/figure-pack/placement_spec.json
git commit -m "feat(brett): register scarf/spectacles accessories in placement_spec"
```

---

## Phase C — Wire accessories into ACC_GROUPS + typecheck

**File:** Modify `brett/src/client/ui/appearance.ts` (lines 14-18)

### Task C1: Extend ACC_GROUPS

- [ ] **Step 1: Edit the ACC_GROUPS map**

Change (current):
```ts
export const ACC_GROUPS: Record<string, string[]> = {
  head:  ['cap','blindfold','crown','veil','hair-short','hair-bun','hair-long','hair-braid','hair-curls'],
  upper: ['satchel','cane','shawl','swaddle','tunic','coat','apron','robe','vest'],
  feet:  ['boots-work','shoes-dress','sandals','barefoot'],
};
```
to (add `spectacles` to `head`, `scarf` to `upper`):
```ts
export const ACC_GROUPS: Record<string, string[]> = {
  head:  ['cap','blindfold','crown','veil','spectacles','hair-short','hair-bun','hair-long','hair-braid','hair-curls'],
  upper: ['satchel','cane','shawl','scarf','swaddle','tunic','coat','apron','robe','vest'],
  feet:  ['boots-work','shoes-dress','sandals','barefoot'],
};
```

- [ ] **Step 2: Run the Brett typecheck**

Run: `cd /tmp/wt-brett-appearance-assets/brett && npm run typecheck`
Expected: PASS, no errors (this is the gate that `task test:all` enforces).
(If `node_modules` is absent, run `npm ci` in `brett/` first.)

- [ ] **Step 3: Commit**

```bash
git add brett/src/client/ui/appearance.ts
git commit -m "feat(brett): add scarf/spectacles to ACC_GROUPS slot map"
```

---

## Phase D — Offline test suite

### Task D1: Run `task test:all`

- [ ] **Step 1: Run the full offline suite**

Run: `cd /tmp/wt-brett-appearance-assets && task test:all`
Expected: green (includes the Brett typecheck gate + kustomize/Taskfile dry-run + BATS).

- [ ] **Step 2: Handle test-inventory drift if reported**

If CI/the suite flags `website/src/data/test-inventory.json` drift:
Run: `task test:inventory`
then `git add website/src/data/test-inventory.json && git commit -m "chore: regenerate test-inventory"`.
(This change adds no tests, so drift is unlikely; only do this if flagged.)

- [ ] **Step 3: Confirm clean tree**

Run: `git status --short`
Expected: empty (everything committed).

---

## Phase E — PR

### Task E1: Push & open the PR

- [ ] **Step 1: Push the branch**

Run: `cd /tmp/wt-brett-appearance-assets && git push -u origin feature/brett-appearance-assets`

- [ ] **Step 2: Open the PR**

Run:
```bash
gh pr create --base main --head feature/brett-appearance-assets \
  --title "feat(brett): add relieved/defiant/fearful faces + scarf/spectacles accessories" \
  --body "$(cat <<'EOF'
## Summary
Adds 3 face emotions (relieved, defiant, fearful) and 2 accessories (scarf, spectacles) to the Brett figure-pack, generated with the atelier MCP and wired into the existing spec-driven appearance machinery.

- Faces: 512x512 RGBA, dark-slate strokes; registered under `faces` in `placement_spec.json` (no TS change — read dynamically).
- Accessories: 256x256 RGBA, sage/brass palette; full placement metadata in `placement_spec.json` + added to `ACC_GROUPS` in `appearance.ts` (scarf->upper, spectacles->head).

## Verification
- Each asset visually inspected via atelier render before export.
- `placement_spec.json` valid JSON, all new `file` paths exist.
- `npm run typecheck` (Brett gate) + `task test:all` green.
- In-game appearance-drawer check covered post-deploy via E2E (Phase F).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Wait for CI green, then squash-merge**

Run: `gh pr checks --watch` then, once green, `gh pr merge --squash --delete-branch`.

---

## Phase F — Deploy to both brands + in-game E2E

### Task F1: Deploy Brett to both brands

- [ ] **Step 1: Resolve the deploy task (do NOT hardcode)**

Run: `bash scripts/task-oracle.sh 'deploy brett to both brands'`
Expected: a `task …` command (typically `task feature:brett`, which fans out across mentolder + korczewski).

- [ ] **Step 2: Run the resolved deploy task**

Run the command the oracle returned. Confirm Brett rolls out on both brands (the new image is built and re-imported/pushed — Brett uses `:latest` intentionally).

### Task F2: In-game verification (dev-flow-e2e)

- [ ] **Step 1: Invoke the E2E sub-skill**

Use `dev-flow-e2e` (or Playwright directly) against the live environment.

- [ ] **Step 2: Verify the three faces**

Open the appearance-drawer. Confirm `relieved`, `defiant`, `fearful` appear in the faces grid and, when selected, apply correctly to the head sphere (texture maps centered, expression visible).

- [ ] **Step 3: Verify the two accessories**

Confirm `scarf` appears in the `upper` slot and `spectacles` in the `head` slot; when applied, each renders at its intended position (scarf at neck, spectacles at eye height in front of the face), billboards around Y toward the camera, and does NOT clip through the torso/head.

- [ ] **Step 4: Record the result**

If all five assets render correctly on both brands, the increment is complete. If clipping/position is off, adjust the relevant `positionOffset`/`sizeMeters` in `placement_spec.json` in a follow-up commit (no asset regeneration needed for placement-only fixes).

---

## Out of scope (deliberately — separate follow-up tickets)

- **Props / terrain rendering** — SVGs under `public/assets/props/` + `terrain/` are not wired to any loader/renderer; a new subsystem.
- **Relationship-line glyphs** — `scene-lines.ts` is feature-gated (`sf-t000467`) and UI-less; midpoint glyph is its own ticket.

Do NOT add props, terrain, or line glyphs in this increment.

---

## Self-Review (completed by plan author)

- **Spec coverage:** 3 faces (A1–A3, B1) ✓; 2 accessories (A4–A5, B2, C1) ✓; atelier workflow + ellipse footgun ✓; palette ✓; faces zero-TS / accessories ACC_GROUPS edit ✓; per-asset visual gate ✓; JSON validity + path-existence checks ✓; `task test:all` ✓; in-game E2E both brands ✓; deploy via oracle ✓; out-of-scope props/terrain/lines ✓.
- **Placeholders:** none — every draw step lists concrete ops/coordinates/colors; every JSON block is complete; every command shows expected output.
- **Type/key consistency:** asset names (`relieved`/`defiant`/`fearful`/`scarf`/`spectacles`), file paths, JSON keys, and `ACC_GROUPS` slot assignments are identical across Phases A/B/C. `scarf`→`upper`+`bone:neck`, `spectacles`→`head`+`bone:head` are consistent throughout.
