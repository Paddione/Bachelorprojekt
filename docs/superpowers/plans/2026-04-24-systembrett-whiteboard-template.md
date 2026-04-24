# Systembrett Whiteboard Template — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a reusable Nextcloud Whiteboard template with 15 Systembrett primitives laid out on a left-edge tray, from which coaches Alt-drag copies during a session.

**Architecture:** **Path B (hybrid) — active.** The library-embed path (A) was ruled out by the Task 1 verification (see `2026-04-24-systembrett-verification-findings.md`) because Nextcloud Whiteboard stores libraries per-user, not per-document. So the template `.whiteboard` file is generated programmatically with the 15 primitives placed as canvas elements on a left-edge tray; coaches Alt-drag tray pieces to pull copies into the work area. A setup script uploads the committed template to Nextcloud via `kubectl cp` + `occ files:scan`, mirroring `scripts/whiteboard-setup.sh`. Integrates into `workspace:post-setup` so `task workspace:deploy ENV=mentolder` seeds it automatically.

**Tech Stack:** Node.js (builtin, no deps) for the generator, Bash + `jq` for test assertions, Nextcloud `occ`, Taskfile, k3d/k3s Kubernetes, docsify.

**Spec:** `docs/superpowers/specs/2026-04-24-systembrett-whiteboard-template-design.md`

---

## File Structure

```
website/public/systembrett/
  systembrett-template.whiteboard  # GENERATED + committed · Excalidraw scene with left-tray

scripts/
  systembrett-generate.mjs         # Node generator: emits systembrett-template.whiteboard
  systembrett-setup.sh             # Cluster-side: kubectl cp + occ files:scan
  tests/systembrett-template.test.sh  # Validator: asserts committed template structure

docs/superpowers/plans/
  2026-04-24-systembrett-verification-findings.md  # DONE · Path B decision

k3d/docs-content/
  systembrett.md                   # Coach-facing how-to page
  _sidebar.md                      # + link to systembrett.md

Taskfile.yml                       # + workspace:systembrett-setup, chain into post-setup
```

**Why these boundaries:**
- The generator (`.mjs`) is the source of truth for the 15 pieces. The committed `.whiteboard` is the generator's output (also committed) so CI can `diff` to detect drift.
- `systembrett-setup.sh` does all cluster-side work. Mirrors `whiteboard-setup.sh` so future-you recognises the shape.
- The validator test is a cheap CI guard — asserts the committed template has 15 tray pieces + expected category labels before anything touches production.

---

## Task 1: Verification experiment — does Nextcloud Whiteboard preserve embedded `libraryItems` across users?

**Status:** ✅ DONE — **FAIL.** Finding committed to `docs/superpowers/plans/2026-04-24-systembrett-verification-findings.md`.

The library is stored per-user (server-side per-user prefs or browser localStorage), not embedded in the `.whiteboard` document in a way that travels across users. Path B active. Skip to Task 2.

---

## Task 2: Generate the template `.whiteboard` file

**Goal:** Produce `website/public/systembrett/systembrett-template.whiteboard` — a valid Excalidraw scene with 15 primitives placed as canvas elements on the left-edge tray (x=0..200, y=0..800), plus category header text labels, plus a brief usage instruction at the top.

**Files:**
- Create: `scripts/systembrett-generate.mjs`
- Create: `scripts/tests/systembrett-template.test.sh`
- Create: `website/public/systembrett/systembrett-template.whiteboard` (committed output)

**Authoring principle:** the generator is small and declarative. Each piece is described by `{ name, category, y, draw: fn }` where `draw` returns Excalidraw element JSON. The script composes them into a scene with a neutral `appState`, empty `libraryItems`, and an `elements` array containing all tray pieces + category headers.

**Excalidraw element format reference:** standard Excalidraw scene v2 format. Each element needs: `id` (unique), `type` (`ellipse`, `rectangle`, `diamond`, `line`, `arrow`, `text`, `freedraw`), `x`, `y`, `width`, `height`, `angle`, `strokeColor`, `backgroundColor`, `fillStyle`, `strokeWidth`, `strokeStyle`, `roughness`, `opacity`, `groupIds`, `seed`, `version`, `versionNonce`, `updated`, `locked`, `boundElements`, `link`, `customData`, `isDeleted`. Pieces that consist of multiple shapes (e.g. Person groß = circle + notch) share a `groupIds: ["<piece-id>"]` so Alt-drag duplicates the whole group.

**Piece layout on the tray** (y-positions; all x-centered at x=100 within tray width 200):

| y | Piece | Category header? |
|---|---|---|
| 20 | Header: `PERSONEN` | yes |
| 50 | Person groß (circle r=20 + notch) | |
| 100 | Person mittel (circle r=15 + notch) | |
| 140 | Person klein (circle r=11 + notch) | |
| 175 | Header: `SELBST` | yes |
| 210 | Ich (ring r=15 stroke-2.5 + center dot r=5) | |
| 260 | Unbekannt (dashed ring r=15 + `?` text) | |
| 305 | Header: `THEMEN` | yes |
| 340 | Thema (rounded square 30×30, fill `#9bc0a8`) | |
| 385 | Ziel (diamond 30×30, fill `#d7b06a`) | |
| 430 | Gefühl (freedraw heart-ish outline, stroke `#e8c884`) | |
| 475 | Hindernis (jagged polygon via freedraw, stroke `#cdd3d9`) | |
| 515 | Header: `RAHMEN` | yes |
| 545 | System (rounded rect 60×28, fill `#9bc0a8` opacity 0.3) | |
| 585 | Kontext (dashed rect 60×28) | |
| 625 | Header: `VERBINDUNGEN` | yes |
| 660 | Beziehung stark (solid line 80×0, `#cdd3d9` stroke-2.5) | |
| 690 | Beziehung schwach (dashed line 80×0, `#cdd3d9` stroke-1.8) | |
| 720 | Einfluss (arrow 80×0, `#d7b06a` stroke-2) | |
| 750 | Konflikt (zigzag line, `#c46a5a` stroke-2) | |

**Work-area hint:** a translucent text element at (x=220, y=20) saying "`Alt+ziehen = Kopie · rechts platzieren und benennen`".

- [ ] **Step 2.1: Create directories**

```bash
mkdir -p website/public/systembrett scripts/tests
```

- [ ] **Step 2.2: Write the failing validator test**

Create `scripts/tests/systembrett-template.test.sh`:

```bash
#!/usr/bin/env bash
# Tests the committed Systembrett template file structure.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEMPLATE="${REPO_ROOT}/website/public/systembrett/systembrett-template.whiteboard"

echo "=== systembrett-template.whiteboard validator ==="

test -f "${TEMPLATE}" || { echo "FAIL: template not found at ${TEMPLATE}"; exit 1; }
echo "  ✓ template file exists"

jq empty "${TEMPLATE}" || { echo "FAIL: template is not valid JSON"; exit 1; }
echo "  ✓ valid JSON"

TYPE=$(jq -r '.type' "${TEMPLATE}")
test "${TYPE}" = "excalidraw" || { echo "FAIL: type=${TYPE}, want excalidraw"; exit 1; }
echo "  ✓ type=excalidraw"

VERSION=$(jq -r '.version' "${TEMPLATE}")
test "${VERSION}" = "2" || { echo "FAIL: version=${VERSION}, want 2"; exit 1; }
echo "  ✓ version=2"

# Count elements marked with groupIds starting with 'piece-' (our tray pieces)
PIECE_COUNT=$(jq '[.elements[] | select((.groupIds // []) | any(startswith("piece-")))] | map(.groupIds[0]) | unique | length' "${TEMPLATE}")
test "${PIECE_COUNT}" = "15" || { echo "FAIL: piece group count=${PIECE_COUNT}, want 15"; exit 1; }
echo "  ✓ 15 distinct tray piece groups"

# Expect 5 category header text elements
HEADER_COUNT=$(jq '[.elements[] | select(.type == "text" and .customData.role == "category-header")] | length' "${TEMPLATE}")
test "${HEADER_COUNT}" = "5" || { echo "FAIL: category headers=${HEADER_COUNT}, want 5"; exit 1; }
echo "  ✓ 5 category header labels"

# Expect specific category names
EXPECTED_CATEGORIES=("PERSONEN" "SELBST" "THEMEN" "RAHMEN" "VERBINDUNGEN")
for cat in "${EXPECTED_CATEGORIES[@]}"; do
  found=$(jq --arg c "${cat}" '[.elements[] | select(.type == "text" and .customData.role == "category-header" and .text == $c)] | length' "${TEMPLATE}")
  test "${found}" = "1" || { echo "FAIL: category header '${cat}' missing"; exit 1; }
done
echo "  ✓ all 5 category names present"

echo ""
echo "=== all validator checks passed ==="
```

```bash
chmod +x scripts/tests/systembrett-template.test.sh
```

- [ ] **Step 2.3: Run the validator — confirm it fails**

```bash
./scripts/tests/systembrett-template.test.sh
```

Expected: `FAIL: template not found at ...`

- [ ] **Step 2.4: Write the generator**

Create `scripts/systembrett-generate.mjs` (Node 18+, no external deps). Skeleton:

```javascript
#!/usr/bin/env node
// Generates website/public/systembrett/systembrett-template.whiteboard.
// Path B layout: 15 primitives as canvas elements on a left-edge tray.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const BRASS = "#d7b06a";
const BRASS_2 = "#e8c884";
const SAGE = "#9bc0a8";
const NEUTRAL = "#cdd3d9";
const DARK = "#0b111c";
const CONFLICT_RED = "#c46a5a";

let seedCounter = 1_000;
const nextSeed = () => ++seedCounter;
let idCounter = 0;
const nextId = (prefix) => `${prefix}-${++idCounter}`;

const now = () => Date.now();

// Base element defaults — merged into every element
const baseElement = () => ({
  id: nextId("el"),
  angle: 0,
  strokeColor: NEUTRAL,
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 0,
  opacity: 100,
  groupIds: [],
  frameId: null,
  roundness: null,
  seed: nextSeed(),
  version: 1,
  versionNonce: nextSeed(),
  updated: now(),
  locked: false,
  link: null,
  customData: null,
  boundElements: null,
  isDeleted: false,
});

const TRAY_X = 100; // tray center x
const elements = [];

function addCategoryHeader(y, text) {
  elements.push({
    ...baseElement(),
    id: nextId("hdr"),
    type: "text",
    x: 20,
    y,
    width: 160,
    height: 18,
    text,
    fontSize: 11,
    fontFamily: 3, // Excalidraw code font (Cascadia)
    textAlign: "left",
    verticalAlign: "top",
    strokeColor: BRASS,
    customData: { role: "category-header" },
    containerId: null,
    originalText: text,
    lineHeight: 1.25,
    baseline: 14,
  });
}

function addCircle({ groupId, cx, cy, r, fill, stroke = fill, strokeWidth = 1.5, opacity = 100 }) {
  elements.push({
    ...baseElement(),
    type: "ellipse",
    x: cx - r,
    y: cy - r,
    width: r * 2,
    height: r * 2,
    strokeColor: stroke,
    backgroundColor: fill,
    fillStyle: "solid",
    strokeWidth,
    opacity,
    groupIds: [groupId],
  });
}

function addRect({ groupId, x, y, w, h, fill, stroke = fill, strokeWidth = 1.5, strokeStyle = "solid", rounded = false, opacity = 100 }) {
  elements.push({
    ...baseElement(),
    type: "rectangle",
    x, y,
    width: w,
    height: h,
    strokeColor: stroke,
    backgroundColor: fill,
    fillStyle: fill === "transparent" ? "hachure" : "solid",
    strokeWidth,
    strokeStyle,
    opacity,
    roundness: rounded ? { type: 3 } : null,
    groupIds: [groupId],
  });
}

function addDiamond({ groupId, cx, cy, size, fill, stroke = fill }) {
  elements.push({
    ...baseElement(),
    type: "diamond",
    x: cx - size / 2,
    y: cy - size / 2,
    width: size,
    height: size,
    strokeColor: stroke,
    backgroundColor: fill,
    fillStyle: "solid",
    groupIds: [groupId],
  });
}

function addLine({ groupId, x1, y1, x2, y2, stroke, strokeWidth, strokeStyle = "solid" }) {
  elements.push({
    ...baseElement(),
    type: "line",
    x: x1,
    y: y1,
    width: x2 - x1,
    height: y2 - y1,
    strokeColor: stroke,
    strokeWidth,
    strokeStyle,
    points: [[0, 0], [x2 - x1, y2 - y1]],
    lastCommittedPoint: null,
    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead: null,
    groupIds: [groupId],
  });
}

function addArrow({ groupId, x1, y1, x2, y2, stroke, strokeWidth }) {
  elements.push({
    ...baseElement(),
    type: "arrow",
    x: x1,
    y: y1,
    width: x2 - x1,
    height: y2 - y1,
    strokeColor: stroke,
    strokeWidth,
    points: [[0, 0], [x2 - x1, y2 - y1]],
    lastCommittedPoint: null,
    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead: "arrow",
    groupIds: [groupId],
  });
}

function addFreedraw({ groupId, x, y, points, stroke, strokeWidth, fill = "transparent" }) {
  // points: [[x,y], [x,y], ...]
  const xs = points.map(p => p[0]);
  const ys = points.map(p => p[1]);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  elements.push({
    ...baseElement(),
    type: "line",  // use line with many points for polyline
    x,
    y,
    width: w,
    height: h,
    strokeColor: stroke,
    backgroundColor: fill,
    fillStyle: fill === "transparent" ? "hachure" : "solid",
    strokeWidth,
    points,
    lastCommittedPoint: null,
    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead: null,
    groupIds: [groupId],
  });
}

// ======== Compose the tray ========

addCategoryHeader(20, "PERSONEN");

// Person groß (circle + notch), group
{
  const g = "piece-person-gross";
  addCircle({ groupId: g, cx: TRAY_X, cy: 50, r: 20, fill: BRASS });
  addRect({ groupId: g, x: TRAY_X + 16, y: 48, w: 6, h: 4, fill: DARK, strokeWidth: 0 });
}
{
  const g = "piece-person-mittel";
  addCircle({ groupId: g, cx: TRAY_X, cy: 100, r: 15, fill: BRASS });
  addRect({ groupId: g, x: TRAY_X + 12, y: 98, w: 5, h: 4, fill: DARK, strokeWidth: 0 });
}
{
  const g = "piece-person-klein";
  addCircle({ groupId: g, cx: TRAY_X, cy: 140, r: 11, fill: BRASS });
  addRect({ groupId: g, x: TRAY_X + 8, y: 138, w: 4, h: 3, fill: DARK, strokeWidth: 0 });
}

addCategoryHeader(175, "SELBST");
{
  const g = "piece-ich";
  addCircle({ groupId: g, cx: TRAY_X, cy: 210, r: 15, fill: "transparent", stroke: BRASS, strokeWidth: 2.5 });
  addCircle({ groupId: g, cx: TRAY_X, cy: 210, r: 5, fill: BRASS });
}
{
  const g = "piece-unbekannt";
  addCircle({ groupId: g, cx: TRAY_X, cy: 260, r: 15, fill: "transparent", stroke: NEUTRAL, strokeWidth: 1.5 });
  // Note: strokeStyle:"dashed" requires setting on the ellipse — add a post-hoc tweak
  elements[elements.length - 1].strokeStyle = "dashed";
  elements.push({
    ...baseElement(),
    id: nextId("txt"),
    type: "text",
    x: TRAY_X - 5,
    y: 252,
    width: 10,
    height: 16,
    text: "?",
    fontSize: 16,
    fontFamily: 2, // serif-like (Excalidraw font)
    textAlign: "center",
    verticalAlign: "middle",
    strokeColor: NEUTRAL,
    groupIds: [g],
    containerId: null,
    originalText: "?",
    lineHeight: 1.25,
    baseline: 12,
  });
}

addCategoryHeader(305, "THEMEN");
addRect({ groupId: "piece-thema",    x: TRAY_X - 15, y: 325, w: 30, h: 30, fill: SAGE,      rounded: true });
addDiamond({ groupId: "piece-ziel",  cx: TRAY_X,     cy: 385, size: 30, fill: BRASS });
// Gefühl: simplified organic heart outline via line with many points
{
  const g = "piece-gefuehl";
  const pts = [[0,5],[5,-2],[13,-2],[15,5],[15,10],[7,18],[0,10],[0,5]];
  addFreedraw({ groupId: g, x: TRAY_X - 8, y: 420, points: pts, stroke: BRASS_2, strokeWidth: 2 });
}
// Hindernis: jagged shape
{
  const g = "piece-hindernis";
  const pts = [[0,4],[8,-10],[16,-4],[24,-8],[28,2],[24,12],[16,8],[8,14],[2,8],[0,4]];
  addFreedraw({ groupId: g, x: TRAY_X - 14, y: 475, points: pts, stroke: NEUTRAL, strokeWidth: 1.8 });
}

addCategoryHeader(515, "RAHMEN");
addRect({ groupId: "piece-system",  x: TRAY_X - 30, y: 540, w: 60, h: 28, fill: SAGE, strokeWidth: 1.5, rounded: true, opacity: 30 });
// Border outline for System (draw two rects — fill + border)
addRect({ groupId: "piece-system",  x: TRAY_X - 30, y: 540, w: 60, h: 28, fill: "transparent", stroke: SAGE, strokeWidth: 1.5, rounded: true });
addRect({ groupId: "piece-kontext", x: TRAY_X - 30, y: 580, w: 60, h: 28, fill: "transparent", stroke: NEUTRAL, strokeWidth: 1.3, strokeStyle: "dashed" });

addCategoryHeader(625, "VERBINDUNGEN");
addLine({  groupId: "piece-stark",    x1: TRAY_X - 40, y1: 660, x2: TRAY_X + 40, y2: 660, stroke: NEUTRAL, strokeWidth: 2.5 });
addLine({  groupId: "piece-schwach",  x1: TRAY_X - 40, y1: 690, x2: TRAY_X + 40, y2: 690, stroke: NEUTRAL, strokeWidth: 1.8, strokeStyle: "dashed" });
addArrow({ groupId: "piece-einfluss", x1: TRAY_X - 40, y1: 720, x2: TRAY_X + 40, y2: 720, stroke: BRASS, strokeWidth: 2 });
{
  const g = "piece-konflikt";
  const pts = [[0,0],[10,-6],[20,6],[30,-6],[40,6],[50,0]];
  addFreedraw({ groupId: g, x: TRAY_X - 25, y: 750, points: pts, stroke: CONFLICT_RED, strokeWidth: 2 });
}

// Usage hint in the work area
elements.push({
  ...baseElement(),
  id: nextId("hint"),
  type: "text",
  x: 230,
  y: 20,
  width: 400,
  height: 22,
  text: "Alt + ziehen = Kopie · rechts platzieren und benennen",
  fontSize: 14,
  fontFamily: 3,
  textAlign: "left",
  verticalAlign: "top",
  strokeColor: NEUTRAL,
  opacity: 60,
  containerId: null,
  originalText: "Alt + ziehen = Kopie · rechts platzieren und benennen",
  lineHeight: 1.25,
  baseline: 18,
});

// ======== Scene wrapper ========

const scene = {
  type: "excalidraw",
  version: 2,
  source: "mentolder-systembrett",
  elements,
  appState: {
    viewBackgroundColor: "#0b111c",
    gridSize: null,
  },
  files: {},
  libraryItems: [],
};

const outPath = resolve(
  new URL("..", import.meta.url).pathname,
  "website/public/systembrett/systembrett-template.whiteboard"
);
writeFileSync(outPath, JSON.stringify(scene, null, 2));
console.log(`✓ generated ${outPath} (${elements.length} elements, 15 tray pieces + 5 headers)`);
```

```bash
chmod +x scripts/systembrett-generate.mjs
```

- [ ] **Step 2.5: Run the generator**

```bash
node scripts/systembrett-generate.mjs
```

Expected: `✓ generated .../systembrett-template.whiteboard (N elements, 15 tray pieces + 5 headers)` where N is ~25-30 (multi-element pieces count as multiple).

- [ ] **Step 2.6: Run the validator — confirm it passes**

```bash
./scripts/tests/systembrett-template.test.sh
```

Expected: all assertions print `✓`, final `=== all validator checks passed ===`.

- [ ] **Step 2.7: Spot-check in Nextcloud (manual)**

Upload the generated file to mentolder manually for a one-time visual verification:

```bash
NC_POD=$(kubectl --context mentolder -n workspace get pod -l app=nextcloud -o jsonpath='{.items[0].metadata.name}')
kubectl --context mentolder -n workspace exec "${NC_POD}" -c nextcloud -- mkdir -p /var/www/html/data/admin/files/Coaching
kubectl --context mentolder -n workspace cp website/public/systembrett/systembrett-template.whiteboard \
  "workspace/${NC_POD}:/var/www/html/data/admin/files/Coaching/systembrett-template.whiteboard" -c nextcloud
kubectl --context mentolder -n workspace exec "${NC_POD}" -c nextcloud -- sh -c "chown www-data:www-data /var/www/html/data/admin/files/Coaching/systembrett-template.whiteboard && php occ files:scan --path='admin/files/Coaching'"
```

Open `https://files.mentolder.de/apps/files/?dir=/Coaching` as admin, click the file. Expected:
- Canvas loads without errors.
- Left tray shows 5 category headers and 15 visually distinct pieces.
- Alt-dragging any tray piece creates a copy that follows the cursor.

If the canvas fails to load or pieces look wrong, iterate the generator (Step 2.4) and re-run Steps 2.5–2.7.

- [ ] **Step 2.8: Commit**

```bash
git add scripts/systembrett-generate.mjs \
        scripts/tests/systembrett-template.test.sh \
        website/public/systembrett/systembrett-template.whiteboard
git commit -m "feat(systembrett): generate Path B template with left-tray (15 pieces) + validator"
```

---

## Task 3: Upload the template to Nextcloud (systembrett-setup.sh + Taskfile)

**Goal:** One command (`task workspace:systembrett-setup ENV=<env>`) uploads the template into admin's `Coaching/` folder in Nextcloud and makes it readable; chain into `workspace:post-setup` so it runs during `workspace:deploy`.

**Files:**
- Create: `scripts/systembrett-setup.sh`
- Modify: `Taskfile.yml` — add `workspace:systembrett-setup`, chain into `workspace:post-setup`

- [ ] **Step 3.1: Write the setup script**

Create `scripts/systembrett-setup.sh`:

```bash
#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# systembrett-setup.sh
# Uploads the Systembrett Whiteboard template into Nextcloud admin's
# Coaching/ folder and triggers a files:scan so Nextcloud indexes it.
#
# Safe to re-run: file is overwritten, scan is idempotent.
#
# Environment:
#   KUBE_CONTEXT — kubectl context; defaults to current context
#   NAMESPACE    — defaults to "workspace"
#   TEMPLATE_SRC — path to systembrett-template.whiteboard
#                  (defaults to website/public/systembrett/systembrett-template.whiteboard
#                   relative to the repo root)
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

NAMESPACE="${NAMESPACE:-workspace}"
KUBE_CONTEXT="${KUBE_CONTEXT:-}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE_SRC="${TEMPLATE_SRC:-${REPO_ROOT}/website/public/systembrett/systembrett-template.whiteboard}"

NC_USER="admin"
NC_FOLDER="Coaching"
NC_FILENAME="systembrett-template.whiteboard"

_kubectl() { kubectl ${KUBE_CONTEXT:+--context "$KUBE_CONTEXT"} "$@"; }
_occ() {
  _kubectl exec -n "${NAMESPACE}" deploy/nextcloud -c nextcloud -- \
    sh -c "$1" 2>&1
}

echo "=== Systembrett Template Setup ==="

if [ ! -f "${TEMPLATE_SRC}" ]; then
  echo "FEHLER: Template '${TEMPLATE_SRC}' nicht gefunden." >&2
  echo "       Zuerst ausführen: node scripts/systembrett-generate.mjs" >&2
  exit 1
fi

NC_POD=$(_kubectl get pod -n "${NAMESPACE}" -l app=nextcloud \
  -o jsonpath='{.items[0].metadata.name}')

if [ -z "${NC_POD}" ]; then
  echo "FEHLER: Kein Nextcloud-Pod gefunden (app=nextcloud im Namespace ${NAMESPACE})." >&2
  exit 1
fi

NC_FOLDER_PATH="/var/www/html/data/${NC_USER}/files/${NC_FOLDER}"
NC_FILE_PATH="${NC_FOLDER_PATH}/${NC_FILENAME}"

echo "  Ziel-Pod:   ${NC_POD}"
echo "  Ziel-Pfad:  ${NC_FILE_PATH}"

_occ "mkdir -p '${NC_FOLDER_PATH}' && chown -R www-data:www-data '${NC_FOLDER_PATH}'"

_kubectl cp "${TEMPLATE_SRC}" \
  "${NAMESPACE}/${NC_POD}:${NC_FILE_PATH}" -c nextcloud

_occ "chown www-data:www-data '${NC_FILE_PATH}' && chmod 644 '${NC_FILE_PATH}'"

_occ "php occ files:scan --path='${NC_USER}/files/${NC_FOLDER}'"

echo ""
echo "=== Systembrett Setup abgeschlossen ==="
echo "  Coaches finden die Vorlage unter:"
echo "    Files → ${NC_FOLDER}/${NC_FILENAME}"
echo "  Pro Sitzung duplizieren und im Talk-Call teilen."
```

```bash
chmod +x scripts/systembrett-setup.sh
```

- [ ] **Step 3.2: Add the Taskfile entry**

Locate `workspace:whiteboard-setup` in `Taskfile.yml` (around line 320). Immediately after that task block, insert:

```yaml
  workspace:systembrett-setup:
    desc: Upload Systembrett Whiteboard template into admin's Coaching/ folder (ENV=dev|mentolder|korczewski)
    vars:
      ENV: '{{.ENV | default "dev"}}'
    cmds:
      - |
        source scripts/env-resolve.sh "{{.ENV}}"
        if [ ! -f website/public/systembrett/systembrett-template.whiteboard ]; then
          echo "Template missing — generating..."
          node scripts/systembrett-generate.mjs
        fi
        KUBE_CONTEXT="${ENV_CONTEXT}" bash scripts/systembrett-setup.sh
```

- [ ] **Step 3.3: Chain into workspace:post-setup**

In `Taskfile.yml`, find `workspace:post-setup` (around line 270). In its `cmds:` list, after the existing `- task: workspace:whiteboard-setup` entry, add:

```yaml
      - task: workspace:systembrett-setup
        vars: { ENV: "{{.ENV}}" }
```

- [ ] **Step 3.4: Verify Taskfile syntax**

```bash
task --list | grep systembrett
```

Expected: `* workspace:systembrett-setup:    Upload Systembrett Whiteboard template into admin's Coaching/ folder (ENV=dev|mentolder|korczewski)`

- [ ] **Step 3.5: Run against mentolder**

```bash
task workspace:systembrett-setup ENV=mentolder
```

Expected output ends with:
```
=== Systembrett Setup abgeschlossen ===
  Coaches finden die Vorlage unter:
    Files → Coaching/systembrett-template.whiteboard
```

- [ ] **Step 3.6: Verify via Nextcloud UI (manual)**

Open `https://files.mentolder.de` as admin → Coaching → click the file.

Expected: board opens, left tray visible with 15 pieces + 5 category labels, Alt-drag works.

- [ ] **Step 3.7: Commit**

```bash
git add scripts/systembrett-setup.sh Taskfile.yml
git commit -m "feat(systembrett): add workspace:systembrett-setup + chain into post-setup"
```

---

## Task 4: Documentation, cross-cluster deploy, PR

**Goal:** Coaches have a how-to page; both clusters are seeded; PR opened and merged.

**Files:**
- Create: `k3d/docs-content/systembrett.md`
- Modify: `k3d/docs-content/_sidebar.md`
- Modify: `docs/superpowers/specs/2026-04-24-systembrett-whiteboard-template-design.md` (count correction + Path B note)

- [ ] **Step 4.1: Write the coach how-to page**

Create `k3d/docs-content/systembrett.md`:

```markdown
# Systembrett im Whiteboard

Eine digitale Version des klassischen Systembretts — für Familien-, Team- und Werte­aufstellungen direkt im Talk-Meeting.

## Eine Sitzung starten

1. In Nextcloud Files den Ordner **Coaching** öffnen.
2. Die Datei `systembrett-template.whiteboard` markieren → **Drei-Punkte-Menü** → **Kopieren**.
3. Die Kopie umbenennen, z. B. `Familie-Müller-2026-04-24.whiteboard`.
4. Im Talk-Call das Whiteboard teilen: im Chat-Bereich auf **+** klicken → **Datei anhängen** → die frisch kopierte Datei wählen.

## Der Werkzeugkasten am linken Rand

Links auf der Fläche liegt ein fester **Werkzeugkasten** mit fünfzehn Primitiven in fünf Kategorien:

- **Personen** · drei Größen, mit rotierbarem Blickrichtungs-Notch.
- **Selbst & Offene Stellen** · *Ich* (zentral) und *Unbekannt* (?).
- **Themen & Anliegen** · Thema, Ziel, Gefühl, Hindernis — bewusst abstrakt, nicht menschlich.
- **System-Rahmen** · System (gefüllt) und Kontext (gestrichelt) für Zugehörigkeit.
- **Verbindungen** · stark, schwach, Einfluss (Pfeil), Konflikt (Zickzack).

## Umgang

- **Figur in die Fläche holen:** `Alt` gedrückt halten und das Tray-Objekt ziehen — eine Kopie folgt dem Zeiger, das Original bleibt liegen.
- **Figur benennen:** Text-Werkzeug (`T`), Label neben die Figur setzen.
- **Blickrichtung drehen:** Figur auswählen, Rotations-Griff ziehen. Der Notch folgt.
- **Verbinden:** entweder das native Pfeil-Werkzeug oder eine Verbindung aus dem Tray Alt-ziehen.

Coach und Klient·in sehen dieselbe Fläche in Echtzeit — Änderungen beider Seiten sind sofort sichtbar.

## Keine Namen auf den Figuren

Die Primitive bleiben absichtlich **unbeschriftet**. Ob eine Figur „Mutter", „Innerer Kritiker" oder „der Chef" ist, entscheidet die Sitzung — nicht die Vorlage. Namen kommen als Text-Labels daneben.
```

- [ ] **Step 4.2: Add the link to the sidebar**

Open `k3d/docs-content/_sidebar.md`. Find a reasonable grouping (handbook / coaching). Add:

```markdown
  * [Systembrett im Whiteboard](systembrett.md)
```

- [ ] **Step 4.3: Correct the spec**

In `docs/superpowers/specs/2026-04-24-systembrett-whiteboard-template-design.md`:

1. Update every "14 primitives / pieces" reference to "15".
2. Add a `**Status note (2026-04-24):**` line near the top under Status: `Path A ruled out by verification; shipping Path B (canvas-tray). See plans/2026-04-24-systembrett-verification-findings.md.`

- [ ] **Step 4.4: Deploy the docs ConfigMap**

```bash
task docs:deploy
```

Expected: two `deployment.apps/docs restarted` lines (mentolder + korczewski).

- [ ] **Step 4.5: Verify docs page is live on both clusters**

```bash
curl -sf https://docs.mentolder.de/#/systembrett -o /dev/null && echo "mentolder OK"
curl -sf https://docs.korczewski.de/#/systembrett -o /dev/null && echo "korczewski OK"
```

If a cluster prints nothing: `kubectl --context <env> -n workspace get configmap docs-content -o jsonpath='{.data.systembrett\.md}' | head` — content should be present.

- [ ] **Step 4.6: Seed korczewski**

```bash
task workspace:systembrett-setup ENV=korczewski
```

Spot-check: `https://files.korczewski.de/apps/files/?dir=/Coaching` → template file visible, opens correctly.

- [ ] **Step 4.7: Run the full validator + manifest checks**

```bash
./scripts/tests/systembrett-template.test.sh
task workspace:validate
```

Expected: both exit 0.

- [ ] **Step 4.8: Commit docs + spec correction**

```bash
git add k3d/docs-content/systembrett.md \
        k3d/docs-content/_sidebar.md \
        docs/superpowers/specs/2026-04-24-systembrett-whiteboard-template-design.md
git commit -m "docs(systembrett): coach how-to page + spec correction (15 pieces, Path B note)"
```

- [ ] **Step 4.9: Push and open the PR**

```bash
git push -u origin feature/systembrett-whiteboard-template
gh pr create --title "Systembrett Whiteboard Template" --body "$(cat <<'EOF'
## Summary

- Digital Systembrett as a reusable Nextcloud Whiteboard template
- 15 unlabeled primitives across 5 categories cover all 5 Systembrett coaching contexts
- Path B (canvas-tray on the left edge) — Path A (embedded library) ruled out by verification
- Seeded via `task workspace:systembrett-setup`, chained into `workspace:post-setup`
- Coach-facing how-to page in docs-site

## Spec

`docs/superpowers/specs/2026-04-24-systembrett-whiteboard-template-design.md`

## Verification findings

`docs/superpowers/plans/2026-04-24-systembrett-verification-findings.md`
(Path A failed — Nextcloud Whiteboard stores libraries per-user, not per-document. Pivoted to Path B as pre-agreed in the spec.)

## Test plan

- [x] `scripts/tests/systembrett-template.test.sh` — validator confirms 15 pieces + 5 category headers
- [x] `task workspace:validate` — manifest validation green
- [x] `task workspace:systembrett-setup ENV=mentolder` — template uploaded, visible in Files
- [x] `task workspace:systembrett-setup ENV=korczewski` — template uploaded, visible in Files
- [x] Docs page live at docs.mentolder.de/#/systembrett and docs.korczewski.de/#/systembrett
- [x] Open template as coach on mentolder — left tray shows 15 pieces + category headers
- [x] Open template as second user — tray fully visible (Path B guarantee)
- [x] Alt-drag spot-check — copy detaches from tray as expected
- [x] Spot-check one scene from each of the 5 coaching contexts builds from the toolkit

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4.10: Merge**

Per project convention (`PR workflow — auto-merge` memory):

```bash
gh pr merge --squash --delete-branch
```

---

## Self-review checklist (run after execution)

- [ ] `systembrett-template.whiteboard` renders in both clusters; left tray has 15 pieces + 5 category labels.
- [ ] Alt-drag spot-check: dragging a tray piece with Alt-held creates a copy on the work area.
- [ ] `task workspace:post-setup ENV=mentolder` runs `systembrett-setup` as part of the chain.
- [ ] Docs page reachable on both clusters.
- [ ] Spec piece-count = 15 everywhere, Path B status note present.
- [ ] Branch merged, local branch cleaned up.
