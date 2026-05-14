---
title: Art Library Implementation Plan
domains: [website]
status: completed
pr_number: null
---

# Art Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a brand-scoped Korczewski art library to the cluster as a Kubernetes ConfigMap, swap Brett's abstract token shapes for figurine sprites, and add a read-only admin gallery tab to dashboard-web.

**Architecture:** A repo-rooted `art-library/sets/<brand>/` directory (manifest.json + svgs + tokens.css) is materialized into a workspace-namespace ConfigMap by per-overlay `configMapGenerator` blocks. Brett (`brett/public/index.html`) and dashboard-web (`dashboard/web/public/`) each mount the ConfigMap read-only at `/public/art-library/` and fetch `manifest.json` at boot. Brett uses Three.js sprite billboards for figurines on top of its existing base disc + direction arrow; dashboard renders a filterable gallery in a new `art` admin tab.

**Tech Stack:** Vanilla JS (no build step) for both apps, Three.js (already loaded by Brett), Kustomize (k3d-base + per-env overlays), node:22-alpine images, BATS for unit tests, Playwright for E2E. Asset extraction tooling: Node + cheerio (`art-library/_tooling/`).

**Source spec:** `docs/superpowers/specs/2026-05-04-art-library-design.md`

**Source handoff (read-only):** `/mnt/c/Users/PatrickKorczewski/Downloads/Assets_korczewski/design_handoff_artlibrary/` (contains `Portfolio.html`, `characters.jsx`, `assets.jsx`, `colors_and_type.css`, three `logo-*.svg` files, `README.md`).

**Branch base:** `feature/art-library` (currently at the spec commit on top of origin/main).

**SVG injection note:** The plan uses `DOMParser` + `importNode` (not `innerHTML`) to insert SVG content from the ConfigMap into the DOM. ConfigMap content is admin-controlled, but using safe DOM APIs avoids XSS-class footguns and keeps the lint/security hooks green.

---

## File Structure

**New files (Phase A):**
```
art-library/
├── README.md
├── manifest.schema.json
├── _tooling/
│   ├── package.json                       (cheerio + ajv dev deps)
│   ├── extract-from-handoff.mjs           (one-shot extractor)
│   └── validate-manifest.mjs              (used by BATS test)
└── sets/
    └── korczewski/
        ├── manifest.json
        ├── tokens.css
        ├── CREDITS.md                      (handoff narrative names + bios)
        ├── characters/                     (8 svgs)
        ├── props/                          (6 svgs)
        ├── terrain/                        (6 svgs)
        └── logos/                          (5 svgs)

tests/unit/test_art_library_manifest.bats
```

**Modified files (Phase A):**
- `k3d/kustomization.yaml` — append `art-library` block to existing `configMapGenerator`.
- `k3d/brett.yaml` — add ConfigMap volume + volumeMount (`optional: true`).
- `prod-korczewski/kustomization.yaml` — append the same `art-library` `configMapGenerator` (overlay sees its own list).
- `prod-korczewski/dashboard-web.yaml` — add ConfigMap volume + volumeMount.
- `prod-mentolder/dashboard-web.yaml` — add ConfigMap volume + volumeMount with `optional: true`.
- `Taskfile.yml` — register `task test:art-library`.

**Modified files (Phase B):**
- `brett/public/index.html` — manifest fetch, texture loader, sprite-aware `buildFigure`, picker rewrite.
- `tests/playwright/brett-art.spec.ts` (new).

**Modified files (Phase C):**
- `dashboard/web/public/app.js` — register `art` tab, `renderArt()`, i18n keys.
- `dashboard/web/public/style.css` — gallery + side-panel CSS.
- `tests/playwright/dashboard-art.spec.ts` (new).

---

## Phase A — Library + ConfigMap plumbing (PR #A)

### Task A1: Scaffold `art-library/` directory and manifest schema

**Files:**
- Create: `art-library/README.md`
- Create: `art-library/manifest.schema.json`
- Create: `art-library/_tooling/package.json`
- Create: `art-library/sets/.gitkeep`

- [ ] **Step 1: Create `art-library/README.md`**

```markdown
# Art Library

Brand-scoped, cluster-native asset packs consumed by Brett (3D systembrett)
and dashboard-web (admin gallery). One set per brand under `sets/`. Each
set ships a `manifest.json` validated against `manifest.schema.json` plus
the SVG files referenced from it.

At deploy time, a Kustomize `configMapGenerator` materializes the active
set into a workspace-namespace ConfigMap named `art-library`. Both Brett
and dashboard-web mount it at `/public/art-library/` (optional; pods boot
fine without it).

## Adding a new set

1. `cp -r sets/korczewski sets/<brand>` and replace SVGs.
2. Update `manifest.json` (id slugs, names, palettes, file paths).
3. Run `node art-library/_tooling/validate-manifest.mjs`.
4. Wire the set into the relevant overlay's `configMapGenerator`.

See `docs/superpowers/specs/2026-05-04-art-library-design.md` for the
design rationale.
```

- [ ] **Step 2: Create `art-library/manifest.schema.json`**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Art library manifest",
  "type": "object",
  "required": ["version", "brand", "assets"],
  "properties": {
    "version": { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}$" },
    "brand":   { "type": "string", "pattern": "^[a-z][a-z0-9-]*$" },
    "tokens":  { "type": "object", "additionalProperties": { "type": "string" } },
    "assets": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["id", "kind", "name_de", "tags", "files"],
        "properties": {
          "id":       { "type": "string", "pattern": "^[a-z][a-z0-9-]*$" },
          "kind":     { "type": "string", "enum": ["character", "prop", "terrain", "logo"] },
          "name_de":  { "type": "string", "minLength": 1 },
          "name_en":  { "type": "string" },
          "tags":     { "type": "array", "items": { "type": "string", "pattern": "^[a-z][a-z0-9-]*$" }, "minItems": 1 },
          "palette":  { "type": "object", "additionalProperties": { "type": "string", "pattern": "^#[0-9A-Fa-f]{6}$" } },
          "animated": { "type": "boolean" },
          "files":    { "type": "object", "minProperties": 1, "additionalProperties": { "type": "string", "pattern": "\\.svg$" } }
        },
        "additionalProperties": false
      }
    }
  },
  "additionalProperties": false
}
```

- [ ] **Step 3: Create `art-library/_tooling/package.json`**

```json
{
  "name": "art-library-tooling",
  "private": true,
  "type": "module",
  "scripts": {
    "extract": "node extract-from-handoff.mjs",
    "validate": "node validate-manifest.mjs"
  },
  "devDependencies": {
    "ajv": "^8.17.1",
    "ajv-formats": "^3.0.1",
    "cheerio": "^1.0.0"
  }
}
```

- [ ] **Step 4: Create empty `art-library/sets/.gitkeep`**

```bash
touch art-library/sets/.gitkeep
```

- [ ] **Step 5: Commit**

```bash
git add art-library/README.md art-library/manifest.schema.json art-library/_tooling/package.json art-library/sets/.gitkeep
git commit -m "feat(art-library): scaffold directory and manifest schema"
```

---

### Task A2: Write manifest validator + BATS test (TDD anchor)

**Files:**
- Create: `art-library/_tooling/validate-manifest.mjs`
- Create: `tests/unit/test_art_library_manifest.bats`
- Create: `art-library/sets/korczewski/manifest.json` (full manifest, content stubbed; SVGs come in Task A3)
- Modify: `Taskfile.yml`

- [ ] **Step 1: Write the failing BATS test**

Create `tests/unit/test_art_library_manifest.bats`:

```bash
#!/usr/bin/env bats

# Validates every art-library set's manifest.json against the JSON Schema
# and asserts every referenced SVG file exists on disk.

REPO="${BATS_TEST_DIRNAME}/../.."

@test "art-library validator script runs and exits zero" {
  run node "${REPO}/art-library/_tooling/validate-manifest.mjs"
  echo "stdout: $output"
  [ "$status" -eq 0 ]
}

@test "korczewski set has at least one character, prop, terrain, and logo" {
  manifest="${REPO}/art-library/sets/korczewski/manifest.json"
  for kind in character prop terrain logo; do
    run jq -e --arg k "$kind" '.assets | map(select(.kind == $k)) | length >= 1' "$manifest"
    [ "$status" -eq 0 ]
  done
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /home/patrick/Bachelorprojekt && bats tests/unit/test_art_library_manifest.bats
```

Expected: FAIL — `validate-manifest.mjs` does not exist; `korczewski/manifest.json` does not exist.

- [ ] **Step 3: Install validator deps**

```bash
cd /home/patrick/Bachelorprojekt/art-library/_tooling && npm install
```

- [ ] **Step 4: Implement `art-library/_tooling/validate-manifest.mjs`**

```javascript
#!/usr/bin/env node
// Validates every sets/*/manifest.json against ../manifest.schema.json
// and asserts every files.* path exists. Exits 0 on success, 1 on any failure.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');                       // art-library/
const schema = JSON.parse(readFileSync(join(ROOT, 'manifest.schema.json'), 'utf8'));

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

const setsDir = join(ROOT, 'sets');
if (!existsSync(setsDir)) { console.error('no sets/ directory'); process.exit(1); }

const sets = readdirSync(setsDir).filter(n => {
  const p = join(setsDir, n);
  return statSync(p).isDirectory() && existsSync(join(p, 'manifest.json'));
});

if (sets.length === 0) {
  console.log('No sets found — nothing to validate (empty repo state).');
  process.exit(0);
}

let failures = 0;
for (const setName of sets) {
  const setDir = join(setsDir, setName);
  const manifestPath = join(setDir, 'manifest.json');
  let manifest;
  try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')); }
  catch (e) { console.error(`✗ ${setName}: invalid JSON — ${e.message}`); failures++; continue; }

  if (!validate(manifest)) {
    console.error(`✗ ${setName}: schema violations`);
    for (const err of validate.errors) console.error(`  ${err.instancePath} ${err.message}`);
    failures++; continue;
  }

  const ids = new Set();
  for (const a of manifest.assets) {
    if (ids.has(a.id)) { console.error(`✗ ${setName}: duplicate id '${a.id}'`); failures++; }
    ids.add(a.id);
    for (const [slot, rel] of Object.entries(a.files)) {
      const full = join(setDir, rel);
      if (!existsSync(full)) { console.error(`✗ ${setName}: ${a.id}.files.${slot} → missing ${rel}`); failures++; }
    }
  }
  if (failures === 0) console.log(`✓ ${setName}: ${manifest.assets.length} assets, all files exist`);
}

process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 5: Create `art-library/sets/korczewski/manifest.json`**

```json
{
  "version": "2026-05-04",
  "brand": "korczewski",
  "tokens": {
    "ink-900": "#120D1C",
    "copper":  "#C8F76A",
    "teal":    "#5BD4D0"
  },
  "assets": [
    { "id": "figure-01", "kind": "character", "name_de": "Figur I",  "name_en": "Figure I",
      "tags": ["magic","feminine","robe"],
      "palette": { "skin": "#F2D2B8", "hair": "#C0341D", "dress": "#3D8A4F", "trim": "#C8F76A" },
      "files": { "portrait": "characters/figure-01.portrait.svg", "figurine": "characters/figure-01.figurine.svg" } },
    { "id": "figure-02", "kind": "character", "name_de": "Figur II", "name_en": "Figure II",
      "tags": ["support","hooded","contemplative"],
      "palette": { "skin": "#C8966E", "robe": "#3A3148", "trim": "#D8AE5A", "inner": "#5BD4D0" },
      "files": { "portrait": "characters/figure-02.portrait.svg", "figurine": "characters/figure-02.figurine.svg" } },
    { "id": "figure-03", "kind": "character", "name_de": "Figur III", "name_en": "Figure III",
      "tags": ["rogue","masked","slim"],
      "palette": { "skin": "#E8C5A3", "hat": "#15101F", "coat": "#5C2E2A", "mask": "#0F0B18", "trim": "#C8F76A" },
      "files": { "portrait": "characters/figure-03.portrait.svg", "figurine": "characters/figure-03.figurine.svg" } },
    { "id": "figure-04", "kind": "character", "name_de": "Figur IV", "name_en": "Figure IV",
      "tags": ["tank","armored","broad"],
      "palette": { "armor": "#6B7480", "armor2": "#3C434C", "beard": "#C26A2A", "horn": "#E8DCC0", "trim": "#C8F76A" },
      "files": { "portrait": "characters/figure-04.portrait.svg", "figurine": "characters/figure-04.figurine.svg" } },

    { "id": "prop-chest",  "kind": "prop", "name_de": "Truhe",       "name_en": "Chest",  "tags": ["item","container","loot"],     "files": { "icon": "props/chest.svg" } },
    { "id": "prop-torch",  "kind": "prop", "name_de": "Fackel",      "name_en": "Torch",  "tags": ["light","fire"],                "files": { "icon": "props/torch.svg" } },
    { "id": "prop-potion", "kind": "prop", "name_de": "Trank",       "name_en": "Potion", "tags": ["item","consumable","magic"],   "files": { "icon": "props/potion.svg" } },
    { "id": "prop-key",    "kind": "prop", "name_de": "Schlüssel",   "name_en": "Key",    "tags": ["item","unlock"],               "files": { "icon": "props/key.svg" } },
    { "id": "prop-scroll", "kind": "prop", "name_de": "Schriftrolle","name_en": "Scroll", "tags": ["item","magic","knowledge"],    "files": { "icon": "props/scroll.svg" } },
    { "id": "prop-coin",   "kind": "prop", "name_de": "Münze",       "name_en": "Coin",   "tags": ["currency","marker"],           "files": { "icon": "props/coin.svg" } },

    { "id": "ter-01", "kind": "terrain", "name_de": "Wald",      "name_en": "Forest", "tags": ["nature","forest","green"], "files": { "swatch": "terrain/ter-01.svg" } },
    { "id": "ter-02", "kind": "terrain", "name_de": "Stein",     "name_en": "Stone",  "tags": ["stone","ground","gray"],    "files": { "swatch": "terrain/ter-02.svg" } },
    { "id": "ter-03", "kind": "terrain", "name_de": "Wasser",    "name_en": "Water",  "tags": ["water","blue"],             "files": { "swatch": "terrain/ter-03.svg" } },
    { "id": "ter-04", "kind": "terrain", "name_de": "Holzdiele", "name_en": "Wood",   "tags": ["wood","indoor"],            "files": { "swatch": "terrain/ter-04.svg" } },
    { "id": "ter-05", "kind": "terrain", "name_de": "Schnee",    "name_en": "Snow",   "tags": ["cold","white"],             "files": { "swatch": "terrain/ter-05.svg" } },
    { "id": "ter-06", "kind": "terrain", "name_de": "Sand",      "name_en": "Sand",   "tags": ["desert","warm"],            "files": { "swatch": "terrain/ter-06.svg" } },

    { "id": "logo-mark",         "kind": "logo", "name_de": "Marke",                       "name_en": "Mark",          "tags": ["logo","brand","square"],    "animated": false, "files": { "svg": "logos/mark.svg" } },
    { "id": "logo-lockup-dark",  "kind": "logo", "name_de": "Wortmarke · Dunkel",          "name_en": "Lockup · Dark", "tags": ["logo","brand","wordmark"],  "animated": false, "files": { "svg": "logos/lockup-dark.svg" } },
    { "id": "logo-lockup-light", "kind": "logo", "name_de": "Wortmarke · Hell",            "name_en": "Lockup · Light","tags": ["logo","brand","wordmark"],  "animated": false, "files": { "svg": "logos/lockup-light.svg" } },
    { "id": "logo-app-icon",     "kind": "logo", "name_de": "App-Icon · Vollständiges K",  "name_en": "App Icon",      "tags": ["logo","brand","icon"],      "animated": false, "files": { "svg": "logos/app-icon.svg" } },
    { "id": "logo-radar-pulse",  "kind": "logo", "name_de": "Animiert · Radar-Pulse",      "name_en": "Radar Pulse",   "tags": ["logo","brand","animated"],  "animated": true,  "files": { "svg": "logos/radar-pulse.svg" } }
  ]
}
```

- [ ] **Step 6: Re-run BATS** — schema must pass; file-existence checks fail (SVGs do not yet exist).

```bash
cd /home/patrick/Bachelorprojekt && bats tests/unit/test_art_library_manifest.bats
```

Expected: still FAIL, but with messages like `✗ korczewski: figure-01.files.portrait → missing characters/figure-01.portrait.svg`. This confirms schema validation works; SVGs come in A3.

- [ ] **Step 7: Add Taskfile alias**

In `Taskfile.yml`, locate `test:unit:` and add this peer:

```yaml
  test:art-library:
    desc: "Validate every art-library/sets/* manifest"
    cmds:
      - cd art-library/_tooling && npm install --silent
      - bats tests/unit/test_art_library_manifest.bats
```

- [ ] **Step 8: Commit**

```bash
git add art-library/_tooling/validate-manifest.mjs art-library/sets/korczewski/manifest.json \
        tests/unit/test_art_library_manifest.bats Taskfile.yml art-library/_tooling/package-lock.json
git commit -m "feat(art-library): add manifest validator + BATS test + korczewski manifest"
```

---

### Task A3: Extract / convert handoff SVGs into `sets/korczewski/`

**Files:**
- Create: `art-library/_tooling/extract-from-handoff.mjs`
- Create: 25 SVG files under `art-library/sets/korczewski/{characters,props,terrain,logos}/`
- Create: `art-library/sets/korczewski/CREDITS.md`
- Create: `art-library/sets/korczewski/tokens.css`

**Strategy.** `Portfolio.html` renders every asset inline as SVG with the canonical palette already baked in. Parse it with cheerio and dump each SVG node to disk. The 3 static brand SVGs (`logo-mark/lockup-dark/lockup-light`) get copied as-is. The animated `app-icon` and `radar-pulse` get the keyframes inlined into a `<style>` tag inside the SVG so they animate standalone.

- [ ] **Step 1: Write `art-library/_tooling/extract-from-handoff.mjs`**

```javascript
#!/usr/bin/env node
// One-shot: parse Portfolio.html and write each asset to disk.
// Run with HANDOFF=/path/to/design_handoff_artlibrary node extract-from-handoff.mjs

import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';

const HANDOFF = process.env.HANDOFF;
if (!HANDOFF) { console.error('Set HANDOFF=/path/to/design_handoff_artlibrary'); process.exit(1); }

const here = dirname(fileURLToPath(import.meta.url));
const OUT  = resolve(here, '..', 'sets', 'korczewski');

const portfolio = readFileSync(join(HANDOFF, 'Portfolio.html'), 'utf8');
const $ = load(portfolio);

function dump(node, outRel) {
  const svg = $.html(node);
  const full = join(OUT, outRel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, svg + '\n', 'utf8');
  console.log('write', outRel);
}

const charSlugs = [
  ['Elara',  'figure-01'],
  ['Korrin', 'figure-02'],
  ['Vex',    'figure-03'],
  ['Brann',  'figure-04'],
];

for (const [name, slug] of charSlugs) {
  const sec = $(`section:contains("${name}")`).first();
  sec.find('svg').each((_, el) => {
    const vb = $(el).attr('viewBox') || '';
    if (vb.match(/0 0 240 300/)) dump(el, `characters/${slug}.portrait.svg`);
    if (vb.match(/0 0 120 200/)) dump(el, `characters/${slug}.figurine.svg`);
  });
}

const propSlugs = ['chest','torch','potion','key','scroll','coin'];
for (const slug of propSlugs) {
  const node = $(`[data-prop="${slug}"], section:contains("${slug}")`).first().find('svg').first();
  if (node.length) dump(node, `props/${slug}.svg`);
}

for (let i = 1; i <= 6; i++) {
  const id = `ter-${String(i).padStart(2,'0')}`;
  const node = $(`[data-terrain="${id}"]`).first().find('svg').first();
  if (node.length) dump(node, `terrain/${id}.svg`);
}

mkdirSync(join(OUT, 'logos'), { recursive: true });
for (const [src, dst] of [
  ['logo-mark.svg',         'logos/mark.svg'],
  ['logo-lockup-dark.svg',  'logos/lockup-dark.svg'],
  ['logo-lockup-light.svg', 'logos/lockup-light.svg'],
]) {
  copyFileSync(join(HANDOFF, src), join(OUT, dst));
  console.log('copy', dst);
}

for (const [label, file] of [['App Icon', 'logos/app-icon.svg'], ['Radar-Pulse', 'logos/radar-pulse.svg']]) {
  const sec = $(`section:contains("${label}")`).first();
  const svg = sec.find('svg').first();
  if (svg.length) {
    const styled = $.html(svg).replace(/<svg([^>]*)>/, `<svg$1><style>
      @keyframes pulse-ring { 0% { opacity: 0.6; r: 28; } 100% { opacity: 0; r: 72; } }
      @keyframes glow-core  { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
      .pulse-ring-1 { animation: pulse-ring 2.4s ease-out infinite; }
      .pulse-ring-2 { animation: pulse-ring 2.4s ease-out infinite 0.8s; }
      .pulse-ring-3 { animation: pulse-ring 2.4s ease-out infinite 1.6s; }
      .core-glow    { animation: glow-core 2s ease-in-out infinite; }
    </style>`);
    mkdirSync(dirname(join(OUT, file)), { recursive: true });
    writeFileSync(join(OUT, file), styled + '\n', 'utf8');
    console.log('write', file);
  }
}

console.log('Extraction done. Run `node validate-manifest.mjs` to verify.');
```

- [ ] **Step 2: Run the extractor**

```bash
cd /home/patrick/Bachelorprojekt/art-library/_tooling && \
HANDOFF=/mnt/c/Users/PatrickKorczewski/Downloads/Assets_korczewski/design_handoff_artlibrary \
  node extract-from-handoff.mjs
```

Expected: ~25 lines of `write …` / `copy …`.

- [ ] **Step 3: Inspect the output**

```bash
ls art-library/sets/korczewski/characters/ art-library/sets/korczewski/props/ \
   art-library/sets/korczewski/terrain/    art-library/sets/korczewski/logos/
```

Expected counts: 8 / 6 / 6 / 5 = 25 files.

If a selector misses (Portfolio.html may not carry the `data-prop`/`data-terrain` attributes the script optimistically uses), **fall back to manual extraction**: open `Portfolio.html` in a browser, devtools → "Copy outerHTML" on each SVG, paste into the right file name. The script's selectors are best-effort; the manifest filenames are the contract.

- [ ] **Step 4: Re-run the BATS test — should now pass**

```bash
cd /home/patrick/Bachelorprojekt && bats tests/unit/test_art_library_manifest.bats
```

Expected: PASS, with `✓ korczewski: 21 assets, all files exist`.

- [ ] **Step 5: Create `art-library/sets/korczewski/CREDITS.md`**

```markdown
# Korczewski Art Set — Credits

Original design handoff bundle: "Korczewski Art Library", May 2026.
Designer-side names and bios preserved here; runtime UI does not display
them (figures are referred to as `Figur I/II/III/IV` in DE and
`Figure I/II/III/IV` in EN).

## Characters

| Runtime ID | Designer name | Role                                       |
|------------|---------------|--------------------------------------------|
| figure-01  | Elara         | Herbalist · Witch of the Greenwood         |
| figure-02  | Korrin        | Mendicant Cleric of the Quiet Order        |
| figure-03  | Vex           | Tricorn Rogue · Letter-Carrier             |
| figure-04  | Brann         | Forge-Knight · House Hammerfall            |

Per-character palette and silhouette anchors are in `manifest.json`.

## Light lockup

The left vertical bar is intentionally absent from `logos/lockup-light.svg`.
The K is formed by two diagonals meeting at the core. Do not "fix" this.
```

- [ ] **Step 6: Copy `colors_and_type.css` into `tokens.css`**

```bash
cp /mnt/c/Users/PatrickKorczewski/Downloads/Assets_korczewski/design_handoff_artlibrary/colors_and_type.css \
   art-library/sets/korczewski/tokens.css
```

- [ ] **Step 7: Commit**

```bash
git add art-library/_tooling/extract-from-handoff.mjs \
        art-library/sets/korczewski/characters/ \
        art-library/sets/korczewski/props/ \
        art-library/sets/korczewski/terrain/ \
        art-library/sets/korczewski/logos/ \
        art-library/sets/korczewski/CREDITS.md \
        art-library/sets/korczewski/tokens.css
git commit -m "feat(art-library): populate korczewski set from handoff (21 assets)"
```

---

### Task A4: Wire the dev `k3d/` overlay's ConfigMap

**Files:**
- Modify: `k3d/kustomization.yaml`

- [ ] **Step 1: Append to the existing `configMapGenerator:` block** (after the `docs-content` entry, around line 88)

```yaml
  - name: art-library
    options:
      annotations:
        argocd.argoproj.io/sync-options: ServerSideApply=true
    files:
      - manifest.json=../art-library/sets/korczewski/manifest.json
      - tokens.css=../art-library/sets/korczewski/tokens.css

      - characters/figure-01.portrait.svg=../art-library/sets/korczewski/characters/figure-01.portrait.svg
      - characters/figure-01.figurine.svg=../art-library/sets/korczewski/characters/figure-01.figurine.svg
      - characters/figure-02.portrait.svg=../art-library/sets/korczewski/characters/figure-02.portrait.svg
      - characters/figure-02.figurine.svg=../art-library/sets/korczewski/characters/figure-02.figurine.svg
      - characters/figure-03.portrait.svg=../art-library/sets/korczewski/characters/figure-03.portrait.svg
      - characters/figure-03.figurine.svg=../art-library/sets/korczewski/characters/figure-03.figurine.svg
      - characters/figure-04.portrait.svg=../art-library/sets/korczewski/characters/figure-04.portrait.svg
      - characters/figure-04.figurine.svg=../art-library/sets/korczewski/characters/figure-04.figurine.svg

      - props/chest.svg=../art-library/sets/korczewski/props/chest.svg
      - props/torch.svg=../art-library/sets/korczewski/props/torch.svg
      - props/potion.svg=../art-library/sets/korczewski/props/potion.svg
      - props/key.svg=../art-library/sets/korczewski/props/key.svg
      - props/scroll.svg=../art-library/sets/korczewski/props/scroll.svg
      - props/coin.svg=../art-library/sets/korczewski/props/coin.svg

      - terrain/ter-01.svg=../art-library/sets/korczewski/terrain/ter-01.svg
      - terrain/ter-02.svg=../art-library/sets/korczewski/terrain/ter-02.svg
      - terrain/ter-03.svg=../art-library/sets/korczewski/terrain/ter-03.svg
      - terrain/ter-04.svg=../art-library/sets/korczewski/terrain/ter-04.svg
      - terrain/ter-05.svg=../art-library/sets/korczewski/terrain/ter-05.svg
      - terrain/ter-06.svg=../art-library/sets/korczewski/terrain/ter-06.svg

      - logos/mark.svg=../art-library/sets/korczewski/logos/mark.svg
      - logos/lockup-dark.svg=../art-library/sets/korczewski/logos/lockup-dark.svg
      - logos/lockup-light.svg=../art-library/sets/korczewski/logos/lockup-light.svg
      - logos/app-icon.svg=../art-library/sets/korczewski/logos/app-icon.svg
      - logos/radar-pulse.svg=../art-library/sets/korczewski/logos/radar-pulse.svg
```

> Note: Kustomize requires `--load-restrictor=LoadRestrictionsNone` to load files from outside the kustomization root. The repo's existing `task workspace:deploy` invocations already pass this flag (see `Taskfile.yml`).

- [ ] **Step 2: Validate the build**

```bash
cd /home/patrick/Bachelorprojekt && \
  kustomize build k3d --load-restrictor=LoadRestrictionsNone | \
  yq 'select(.kind == "ConfigMap" and .metadata.name == "art-library") | .data | keys | length'
```

Expected: `27` (manifest.json + tokens.css + 25 SVGs).

- [ ] **Step 3: Commit**

```bash
git add k3d/kustomization.yaml
git commit -m "feat(art-library): generate ConfigMap from korczewski set in k3d/ overlay"
```

---

### Task A5: Mount the ConfigMap into Brett

**Files:**
- Modify: `k3d/brett.yaml`

- [ ] **Step 1: Add `volumeMounts` to the container and `volumes:` to the pod template**

In `k3d/brett.yaml`, after the `resources:` block of `containers[0]` (around line 81), add the `volumeMounts` block. After the `containers:` list (peer to `containers:` and `nodeSelector:` etc.), add the `volumes:` block. The relevant section becomes:

```yaml
          resources:
            requests:
              memory: 128Mi
              cpu: "100m"
            limits:
              memory: 512Mi
              cpu: "500m"
          volumeMounts:
            - name: art-library
              mountPath: /app/public/art-library
              readOnly: true
      volumes:
        - name: art-library
          configMap:
            name: art-library
            optional: true
```

(Keep all existing properties verbatim — only add the two blocks above.)

- [ ] **Step 2: Validate**

```bash
kustomize build k3d --load-restrictor=LoadRestrictionsNone | \
  yq 'select(.kind == "Deployment" and .metadata.name == "brett") | .spec.template.spec.volumes'
```

Expected:
```yaml
- name: art-library
  configMap:
    name: art-library
    optional: true
```

- [ ] **Step 3: Commit**

```bash
git add k3d/brett.yaml
git commit -m "feat(brett): mount art-library ConfigMap at /app/public/art-library (optional)"
```

---

### Task A6: Mount the ConfigMap into dashboard-web (both prod overlays)

**Files:**
- Modify: `prod-korczewski/dashboard-web.yaml`
- Modify: `prod-mentolder/dashboard-web.yaml`
- Modify: `prod-korczewski/kustomization.yaml`

- [ ] **Step 1: In `prod-korczewski/dashboard-web.yaml`, add `volumeMounts` + `volumes`**

Inside the `dashboard-web` Deployment's container, append:

```yaml
          volumeMounts:
            - name: art-library
              mountPath: /app/public/art-library
              readOnly: true
```

At the pod-template-spec level (peer of `containers:`), append:

```yaml
      volumes:
        - name: art-library
          configMap:
            name: art-library
            optional: true
```

- [ ] **Step 2: Apply the same edits to `prod-mentolder/dashboard-web.yaml`**

Identical block. `optional: true` ensures mentolder's pod boots even though no `art-library` ConfigMap exists in that namespace.

- [ ] **Step 3: Verify whether `prod-korczewski/kustomization.yaml` needs its own `configMapGenerator` block**

```bash
kustomize build prod-korczewski --load-restrictor=LoadRestrictionsNone | \
  yq 'select(.kind == "ConfigMap" and .metadata.name == "art-library") | .metadata.name'
```

If output is empty (overlay shadows the base generator), **append the same `configMapGenerator` block from Task A4 Step 1 to `prod-korczewski/kustomization.yaml`**, with paths adjusted relative to that file (`../art-library/sets/korczewski/...` paths still work because both kustomization files sit one level deep). Re-run the verify command — expected output: `art-library`.

- [ ] **Step 4: Validate both overlays**

```bash
kustomize build prod-korczewski --load-restrictor=LoadRestrictionsNone | \
  yq 'select(.kind == "ConfigMap" and .metadata.name == "art-library") | .data | keys | length'
kustomize build prod-mentolder --load-restrictor=LoadRestrictionsNone | \
  yq 'select(.kind == "Deployment" and .metadata.name == "dashboard-web") | .spec.template.spec.volumes[].name'
```

Expected: korczewski prints `27`; mentolder prints `art-library`.

- [ ] **Step 5: Commit**

```bash
git add prod-korczewski/dashboard-web.yaml prod-mentolder/dashboard-web.yaml prod-korczewski/kustomization.yaml
git commit -m "feat(dashboard-web): mount art-library ConfigMap in prod overlays"
```

---

### Task A7: Live verification on korczewski

- [ ] **Step 1: Deploy to korczewski**

```bash
cd /home/patrick/Bachelorprojekt && task workspace:deploy ENV=korczewski
```

Expected: `kubectl --context korczewski -n workspace get configmap art-library` returns one ConfigMap.

- [ ] **Step 2: Verify Brett can read the manifest**

```bash
kubectl --context korczewski -n workspace exec deploy/brett -- \
  cat /app/public/art-library/manifest.json | jq '.brand, (.assets | length)'
```

Expected: `"korczewski"` and `21`.

- [ ] **Step 3: Verify dashboard-web can read the manifest**

```bash
kubectl --context korczewski -n workspace exec deploy/dashboard-web -- \
  cat /app/public/art-library/manifest.json | jq '.assets[0].id'
```

Expected: `"figure-01"`.

- [ ] **Step 4: Verify mentolder pod still rolls out**

```bash
kubectl --context mentolder -n workspace rollout status deploy/dashboard-web --timeout=60s
kubectl --context mentolder -n workspace exec deploy/dashboard-web -- \
  ls /app/public/art-library/ 2>&1 || echo "(empty / no manifest — expected)"
```

Expected: `successfully rolled out`; `ls` shows empty/missing — both fine (`optional: true` working).

- [ ] **Step 5: Open PR #A**

```bash
git push -u origin feature/art-library
gh pr create --title "feat(art-library): bring up cluster art library + ConfigMap" --body "$(cat <<'EOF'
## Summary
- Adds `art-library/sets/korczewski/` (21 assets: 4 chars + 6 props + 6 terrain + 5 logos)
- Generates `ConfigMap art-library` via Kustomize in dev + prod-korczewski
- Mounts at `/app/public/art-library/` in Brett and dashboard-web (optional, mentolder degrades cleanly)
- BATS test validates manifest schema + file existence

## Test plan
- [x] `task test:art-library` passes
- [x] `kustomize build k3d --load-restrictor=LoadRestrictionsNone` builds clean
- [x] korczewski: ConfigMap present, both pods read manifest.json
- [x] mentolder: dashboard-web rolls out without ConfigMap

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Phase B — Brett figurine integration (PR #B)

After PR #A merges: `git checkout main && git pull && git checkout -b feature/brett-figurines`.

### Task B1: Add manifest fetch + texture loader to Brett (TDD anchor)

**Files:**
- Modify: `brett/public/index.html`
- Create: `tests/playwright/brett-art.spec.ts`

- [ ] **Step 1: Write the failing Playwright test**

```typescript
// tests/playwright/brett-art.spec.ts
import { test, expect } from '@playwright/test';

const URL = process.env.BRETT_URL || 'https://brett.korczewski.de';

test('Brett loads art manifest and exposes character ids', async ({ page }) => {
  await page.goto(URL);
  await page.waitForFunction(() => Boolean((window as any).__ART_READY__), null, { timeout: 10_000 });
  const ids = await page.evaluate(() => Array.from((window as any).characterIds ?? []));
  expect(ids).toEqual(expect.arrayContaining(['figure-01','figure-02','figure-03','figure-04']));
});

test('Placing a figure creates a Sprite child in the figure mesh', async ({ page }) => {
  await page.goto(URL);
  await page.waitForFunction(() => Boolean((window as any).__ART_READY__), null, { timeout: 10_000 });
  await page.click('button[data-type="figure-01"]');
  await page.evaluate(() => (window as any).addFigure('figure-01', '#9caa86', 0, 0, '', 1, 0, 'test-1'));
  const hasSprite = await page.evaluate(() => {
    const fig = (window as any).figures?.find((f: any) => f.id === 'test-1');
    return Boolean(fig?.mesh?.children?.some((c: any) => c.type === 'Sprite'));
  });
  expect(hasSprite).toBe(true);
});
```

- [ ] **Step 2: Run — verify it fails**

```bash
BRETT_URL=https://brett.korczewski.de npx playwright test tests/playwright/brett-art.spec.ts
```

Expected: FAIL — `__ART_READY__` undefined.

- [ ] **Step 3: Insert manifest+texture loader into `brett/public/index.html`**

In the `<script>` block where `let figures = []` is declared (around line 629), insert this **above** that line:

```javascript
// ── Art library bootstrap ────────────────────────────────────────────────
let ART_MANIFEST = null;
const characterIds = new Set();
const characterTextures = new Map();   // id → THREE.CanvasTexture

function svgToImage(svgText) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgText], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

async function loadCharacterTexture(id) {
  if (characterTextures.has(id)) return characterTextures.get(id);
  const meta = ART_MANIFEST.assets.find(a => a.id === id);
  const svgText = await fetch('/art-library/' + meta.files.figurine).then(r => r.text());
  const img = await svgToImage(svgText);
  const c = document.createElement('canvas'); c.width = 240; c.height = 400;
  c.getContext('2d').drawImage(img, 0, 0, 240, 400);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  characterTextures.set(id, tex);
  return tex;
}

async function bootArtLibrary() {
  try {
    const r = await fetch('/art-library/manifest.json');
    if (!r.ok) throw new Error('no manifest');
    ART_MANIFEST = await r.json();
    for (const a of ART_MANIFEST.assets) {
      if (a.kind === 'character') characterIds.add(a.id);
    }
    await Promise.all([...characterIds].map(loadCharacterTexture));
    console.log('[art] loaded', characterIds.size, 'characters');
  } catch (e) {
    console.warn('[art] manifest unavailable, using legacy shapes', e.message);
    ART_MANIFEST = null;
  } finally {
    window.__ART_READY__ = true;
    window.characterIds = characterIds;
  }
}

bootArtLibrary();
```

- [ ] **Step 4: Re-run the first Playwright test — should pass**

```bash
BRETT_URL=https://brett.korczewski.de npx playwright test tests/playwright/brett-art.spec.ts -g "loads art manifest"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add brett/public/index.html tests/playwright/brett-art.spec.ts
git commit -m "feat(brett): bootstrap art-library manifest fetch + character textures"
```

---

### Task B2: Sprite-aware `buildFigure` + window exposure

**Files:**
- Modify: `brett/public/index.html`

- [ ] **Step 1: Replace `buildFigure(type, color)`** (around line 674)

Replace the function body with:

```javascript
function buildFigure(type, color) {
  const col  = hex2col(color);
  const dark = col.clone().multiplyScalar(0.45);
  const mat  = new THREE.MeshStandardMaterial({ color: col,  roughness: 0.38, metalness: 0.12 });
  const back = new THREE.MeshStandardMaterial({ color: dark, roughness: 0.55, metalness: 0.08 });

  const group = new THREE.Group();

  if (characterIds.has(type)) {
    // Sprite path: figurine SVG as a billboard, mounted on the existing base disc.
    const tex = characterTextures.get(type);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthTest: true,
    }));
    sprite.scale.set(2.0, 3.4, 1);     // matches 120×200 figurine viewBox aspect
    sprite.position.y = 1.7;
    sprite.castShadow = false;          // baked shadow lives in the SVG; base provides ground shadow
    group.add(sprite);
  } else if (type === 'pawn') {
    // Legacy path — kept verbatim for back-compat with old snapshots.
    const bodyF = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.62, 1.75, 24, 1, false, 0, Math.PI), mat);
    const bodyB = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.62, 1.75, 24, 1, false, Math.PI, Math.PI), back);
    bodyF.position.y = 0.875; bodyB.position.y = 0.875;
    bodyF.castShadow = true; bodyB.castShadow = true;
    const headF = new THREE.Mesh(new THREE.SphereGeometry(0.52, 24, 16, 0, Math.PI, 0, Math.PI), mat);
    const headB = new THREE.Mesh(new THREE.SphereGeometry(0.52, 24, 16, Math.PI, Math.PI, 0, Math.PI), back);
    headF.position.y = 2.0; headB.position.y = 2.0;
    headF.castShadow = true; headB.castShadow = true;
    group.add(bodyF, bodyB, headF, headB);
    const dot = makeFaceMarker(color); dot.position.set(0, 2.0, 0.53); group.add(dot);
  } else if (type === 'triangle') {
    const coneF = new THREE.Mesh(new THREE.ConeGeometry(0.88, 2.15, 16, 1, false, 0, Math.PI), mat);
    const coneB = new THREE.Mesh(new THREE.ConeGeometry(0.88, 2.15, 16, 1, false, Math.PI, Math.PI), back);
    coneF.position.y = 1.075; coneB.position.y = 1.075;
    coneF.castShadow = true; coneB.castShadow = true;
    const stripeGeo = new THREE.PlaneGeometry(0.25, 1.3);
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthTest: false });
    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.position.set(0, 1.1, 0.86);
    group.add(coneF, coneB, stripe);
  } else if (type === 'square') {
    const frontMat = mat.clone();
    const sideMat  = new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.7), roughness: 0.45 });
    const backMat2 = back.clone();
    const topMat   = new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.85), roughness: 0.4 });
    const boxGeo = new THREE.BoxGeometry(1.18, 2.0, 1.18);
    const boxMats = [ sideMat, sideMat, topMat, back, frontMat, backMat2 ];
    const box = new THREE.Mesh(boxGeo, boxMats);
    box.position.y = 1.0; box.castShadow = true;
    const strGeo = new THREE.PlaneGeometry(0.22, 1.4);
    const strMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthTest: false });
    const stripe = new THREE.Mesh(strGeo, strMat);
    stripe.position.set(0, 1.0, 0.6);
    group.add(box, stripe);
  } else if (type === 'diamond') {
    const octF = new THREE.Mesh(new THREE.OctahedronGeometry(1.05, 0), mat);
    octF.position.y = 1.05; octF.castShadow = true;
    group.add(octF);
    const dot = makeFaceMarker(color); dot.position.set(0, 1.05, 1.0); dot.scale.set(0.45, 0.45, 1); group.add(dot);
  } else {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xff00ff }));
    m.position.y = 0.5; group.add(m);
  }

  // Existing base disc + direction arrow — unchanged for ALL types.
  const baseMat = new THREE.MeshStandardMaterial({ color: dark, roughness: 0.7 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.18, 32), baseMat);
  base.position.y = 0.09; base.castShadow = true;
  group.add(base);

  const arrow = makeDirectionArrow(color);
  group.add(arrow);

  return group;
}
```

- [ ] **Step 2: Expose `addFigure` + `figures` on `window`**

Below the existing `function addFigure(...)` declaration (around line 785), append:

```javascript
window.addFigure = addFigure;
window.figures = figures;
```

- [ ] **Step 3: Re-run all Playwright tests**

```bash
BRETT_URL=https://brett.korczewski.de npx playwright test tests/playwright/brett-art.spec.ts
```

Expected: BOTH tests PASS.

- [ ] **Step 4: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): sprite-aware buildFigure with legacy shape fallback"
```

---

### Task B3: Replace token picker buttons with figurine renderer

**Files:**
- Modify: `brett/public/index.html`

- [ ] **Step 1: Locate the existing picker row** (around lines 238–256). It currently has `<button class="figure-btn" data-type="pawn">…Figur</button>` × 4.

- [ ] **Step 2: Replace those four buttons with figurine slots**

```html
<span class="tlabel">Figur</span>
<button class="figure-btn" data-type="figure-01" aria-label="Figur I" title="Figur I">
  <span class="figure-art" data-art-slot="figure-01"></span>
</button>
<button class="figure-btn" data-type="figure-02" aria-label="Figur II" title="Figur II">
  <span class="figure-art" data-art-slot="figure-02"></span>
</button>
<button class="figure-btn" data-type="figure-03" aria-label="Figur III" title="Figur III">
  <span class="figure-art" data-art-slot="figure-03"></span>
</button>
<button class="figure-btn" data-type="figure-04" aria-label="Figur IV" title="Figur IV">
  <span class="figure-art" data-art-slot="figure-04"></span>
</button>
```

- [ ] **Step 3: Adjust `.figure-btn` CSS** (around lines 32–46) to host the inline SVG

```css
.figure-btn {
  width: 56px; height: 84px;
  background: #102540;
  border: 1px solid #2c4d80;
  border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  padding: 4px; cursor: pointer;
  transition: background .15s, border-color .15s;
}
.figure-btn:hover { background: #1a4a8a; border-color: #4a90d9; }
.figure-btn.active { border-color: #ffd84a; box-shadow: 0 0 0 1px #ffd84a inset; }
.figure-btn .figure-art { display: block; width: 100%; height: 100%; }
.figure-btn .figure-art svg { width: 100%; height: 100%; }
```

- [ ] **Step 4: Populate the picker SVGs after `bootArtLibrary` finishes**

Within `bootArtLibrary()`, immediately after `await Promise.all([...characterIds].map(loadCharacterTexture));`, append:

```javascript
    for (const id of characterIds) {
      const slot = document.querySelector(`.figure-art[data-art-slot="${id}"]`);
      if (!slot) continue;
      const meta = ART_MANIFEST.assets.find(a => a.id === id);
      const svgText = await fetch('/art-library/' + meta.files.figurine).then(r => r.text());
      const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
      const svgNode = doc.documentElement;
      while (slot.firstChild) slot.removeChild(slot.firstChild);
      slot.appendChild(document.importNode(svgNode, true));
    }
```

- [ ] **Step 5: Manual verification — open Brett**

Open `https://brett.korczewski.de`. Expected: each of the four buttons shows a figurine; clicking one and clicking on the board places a token rendered as a flat sprite on the existing wood base disc, with the direction arrow visible. RMB rotates the arrow + base; the sprite always faces camera.

- [ ] **Step 6: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): figurine picker row, lazy-populated from manifest"
```

---

### Task B4: Snapshot back-compat — accept new IDs alongside legacy

**Files:**
- Modify: `brett/server.js` (only if a type whitelist exists)
- Modify: `brett/public/index.html` (only if client-side validation exists)

- [ ] **Step 1: Grep for type validation**

```bash
grep -n "pawn\|triangle\|square\|diamond" brett/server.js brett/public/index.html | grep -v "buildFigure\|comment"
```

- [ ] **Step 2: If a whitelist exists, broaden it**

Sample diff (only apply if a matching `Set` or `Array.includes` is found):

```javascript
const VALID_TYPES = new Set([
  'pawn', 'triangle', 'square', 'diamond',           // legacy
  'figure-01', 'figure-02', 'figure-03', 'figure-04', // new character IDs
]);
```

- [ ] **Step 3: Run Brett tests if any exist**

```bash
cd /home/patrick/Bachelorprojekt/brett && npm test 2>/dev/null || echo "(no tests defined)"
```

- [ ] **Step 4: Commit (only if a change was made)**

```bash
git add brett/
git commit -m "feat(brett): accept figure-01..04 token types alongside legacy shapes"
```

---

### Task B5: Build, push, redeploy Brett, open PR #B

- [ ] **Step 1: Roll out the new Brett image**

```bash
cd /home/patrick/Bachelorprojekt && task brett:deploy ENV=korczewski
```

- [ ] **Step 2: Verify the live deployment**

Open `https://brett.korczewski.de`. Confirm picker shows figurines; place all four characters; verify RMB-rotate works.

- [ ] **Step 3: Open PR #B**

```bash
git push -u origin feature/brett-figurines
gh pr create --title "feat(brett): figurine sprites replace abstract shape tokens" --body "$(cat <<'EOF'
## Summary
- Brett fetches `/art-library/manifest.json` at boot
- Loads four figurine SVGs into Three.CanvasTexture sprites
- Token picker row shows inline figurine SVGs (no text labels)
- `buildFigure` keeps the existing base disc + direction arrow; only the body becomes a sprite for character types
- Legacy snapshot types (`pawn / triangle / square / diamond`) still render via the legacy code path

## Test plan
- [x] Playwright `tests/playwright/brett-art.spec.ts` passes
- [x] korczewski live: figurines render, rotation arrow works, no console errors

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Phase C — Dashboard art tab (PR #C)

After PR #A merges: `git checkout main && git pull && git checkout -b feature/dashboard-art-tab`.

### Task C1: Register the `art` tab + i18n keys

**Files:**
- Modify: `dashboard/web/public/app.js`

- [ ] **Step 1: Append art-tab keys to `TRANSLATIONS.en` and `TRANSLATIONS.de`**

Add these to **both** locale blocks (lines 4–57). EN:

```javascript
    tab_art:        'Art Library',
    art_kind_all:   'all',
    art_kind_character: 'characters',
    art_kind_prop:  'props',
    art_kind_terrain: 'terrain',
    art_kind_logo:  'logos',
    art_search_ph:  'search assets…',
    art_palette:    'Palette',
    art_download:   'Download',
    art_no_assets:  'No art library configured for this environment.',
    art_copied:     'Copied ✓',
    art_tags:       'Tags',
    art_id:         'ID',
    art_kind:       'Kind',
    art_no_palette: '(no palette)',
```

DE:

```javascript
    tab_art:        'Bibliothek',
    art_kind_all:   'alle',
    art_kind_character: 'Figuren',
    art_kind_prop:  'Requisiten',
    art_kind_terrain: 'Untergründe',
    art_kind_logo:  'Logos',
    art_search_ph:  'Assets suchen…',
    art_palette:    'Palette',
    art_download:   'Herunterladen',
    art_no_assets:  'Keine Kunstbibliothek für diese Umgebung konfiguriert.',
    art_copied:     'Kopiert ✓',
    art_tags:       'Tags',
    art_id:         'ID',
    art_kind:       'Art',
    art_no_palette: '(keine Palette)',
```

- [ ] **Step 2: Add the `art` tab to `state.tabs`** (lines 99–104)

```javascript
  tabs: [
    { id: 'tickets', labelKey: 'tab_tickets', visible: true },
    { id: 'pods',    labelKey: 'tab_pods',    visible: true },
    { id: 'logs',    labelKey: 'tab_logs',    visible: true },
    { id: 'argocd',  labelKey: 'tab_argocd',  visible: true },
    { id: 'art',     labelKey: 'tab_art',     visible: true },
  ],
```

- [ ] **Step 3: Wire the dispatcher** (around line 420–423)

```javascript
  else if (state.tab === 'art')   await renderArt();
```

- [ ] **Step 4: Add a stub `renderArt()` so the tab loads**

Append at the bottom of the script:

```javascript
// ── Art Library ──────────────────────────────────────────────────────────
async function renderArt() {
  setMain(el('div', { class: 'art-pane' }, [
    el('h2', {}, t('tab_art')),
    el('div', { class: 'mute' }, t('loading')),
  ]));
}
```

- [ ] **Step 5: Smoke check**

Open `https://dashboard.korczewski.de/`, click **Art Library** — loading text shows.

- [ ] **Step 6: Commit**

```bash
git add dashboard/web/public/app.js
git commit -m "feat(dashboard): register art tab + i18n keys + render stub"
```

---

### Task C2: Implement `renderArt()` — manifest fetch, grouped cards, empty-state

**Files:**
- Modify: `dashboard/web/public/app.js`

- [ ] **Step 1: Replace the `renderArt()` stub with the full implementation, plus two helpers**

```javascript
const ART_STATE = { manifest: null, filterKind: 'all', filterTags: new Set(), q: '', selectedId: null };

function injectSvg(target, svgText) {
  while (target.firstChild) target.removeChild(target.firstChild);
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const node = doc.documentElement;
  if (node && node.nodeName.toLowerCase() === 'svg') {
    target.appendChild(document.importNode(node, true));
  }
}

async function renderArt() {
  if (!ART_STATE.manifest && ART_STATE.manifest !== 'missing') {
    try {
      const r = await fetch('/art-library/manifest.json');
      if (!r.ok) throw new Error(String(r.status));
      ART_STATE.manifest = await r.json();
    } catch (_) {
      ART_STATE.manifest = 'missing';
    }
  }

  if (ART_STATE.manifest === 'missing') {
    setMain(el('div', { class: 'art-pane art-empty' }, [
      el('h2', {}, t('tab_art')),
      el('p', { class: 'mute' }, t('art_no_assets')),
    ]));
    return;
  }

  const manifest = ART_STATE.manifest;
  const kinds = ['all', 'character', 'prop', 'terrain', 'logo'];
  const allTags = [...new Set(manifest.assets.flatMap(a => a.tags))].sort();

  const filtered = manifest.assets.filter(a => {
    if (ART_STATE.filterKind !== 'all' && a.kind !== ART_STATE.filterKind) return false;
    if (ART_STATE.filterTags.size > 0 && !a.tags.some(tag => ART_STATE.filterTags.has(tag))) return false;
    if (ART_STATE.q) {
      const q = ART_STATE.q.toLowerCase();
      if (!a.id.toLowerCase().includes(q) &&
          !(a.name_de || '').toLowerCase().includes(q) &&
          !(a.name_en || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const byKind = { character: [], prop: [], terrain: [], logo: [] };
  for (const a of filtered) byKind[a.kind].push(a);

  const kindChips = el('div', { class: 'art-kinds' },
    kinds.map(k => el('button', {
      class: 'art-chip' + (ART_STATE.filterKind === k ? ' active' : ''),
      on: { click: () => { ART_STATE.filterKind = k; renderArt(); } },
    }, t('art_kind_' + k))),
  );

  const tagChips = el('div', { class: 'art-tags' }, allTags.map(tag =>
    el('button', {
      class: 'art-tag' + (ART_STATE.filterTags.has(tag) ? ' active' : ''),
      on: { click: () => {
        if (ART_STATE.filterTags.has(tag)) ART_STATE.filterTags.delete(tag);
        else ART_STATE.filterTags.add(tag);
        renderArt();
      } },
    }, tag)));

  const search = el('input', { class: 'art-search', type: 'text', placeholder: t('art_search_ph'), value: ART_STATE.q });
  search.addEventListener('input', () => { ART_STATE.q = search.value; renderArt(); });

  const sections = [];
  for (const kind of ['character','prop','terrain','logo']) {
    if (byKind[kind].length === 0) continue;
    sections.push(
      el('h3', { class: 'art-section' }, `${t('art_kind_' + kind)} (${byKind[kind].length})`),
      el('div', { class: 'art-grid' }, byKind[kind].map((a, i) => buildArtCard(a, i + 1))),
    );
  }

  if (sections.length === 0) {
    sections.push(el('p', { class: 'mute' }, '(no matches)'));
  }

  const selected = ART_STATE.selectedId
    ? manifest.assets.find(a => a.id === ART_STATE.selectedId)
    : null;
  const panel = selected ? buildArtPanel(selected) : null;

  setMain(el('div', { class: 'art-pane' + (selected ? ' art-pane--with-panel' : '') }, [
    el('div', { class: 'art-main' }, [
      el('div', { class: 'art-toolbar' }, [search, kindChips]),
      el('div', { class: 'art-tag-row' }, tagChips),
      ...sections,
    ]),
    panel,
  ].filter(Boolean)));
}

function primarySlot(asset) {
  return asset.kind === 'character' ? asset.files.portrait
       : asset.kind === 'prop'      ? asset.files.icon
       : asset.kind === 'terrain'   ? asset.files.swatch
       :                              asset.files.svg;
}

function buildArtCard(asset, index) {
  const card = el('button', {
    class: 'art-card' + (ART_STATE.selectedId === asset.id ? ' active' : ''),
    on: { click: () => { ART_STATE.selectedId = asset.id; renderArt(); } },
  }, [
    el('span', { class: 'art-card-idx' }, String(index).padStart(2, '0')),
    el('div', { class: 'art-card-art' }),
  ]);
  fetch('/art-library/' + primarySlot(asset))
    .then(r => r.text())
    .then(svg => {
      const target = card.querySelector('.art-card-art');
      if (target) injectSvg(target, svg);
    })
    .catch(() => {});
  return card;
}

function buildArtPanel(asset) {
  const close = el('button', { class: 'art-panel-close',
    on: { click: () => { ART_STATE.selectedId = null; renderArt(); } } }, '×');

  const primary = el('div', { class: 'art-panel-art' });
  fetch('/art-library/' + primarySlot(asset))
    .then(r => r.text())
    .then(svg => injectSvg(primary, svg))
    .catch(() => {});

  const tagRow = el('div', { class: 'art-panel-tags' },
    asset.tags.map(tg => el('span', { class: 'art-tag' }, tg)));

  const palette = asset.palette
    ? el('div', { class: 'art-panel-palette' }, Object.entries(asset.palette).map(([key, hex]) =>
        el('button', {
          class: 'art-palette-row',
          on: { click: async (e) => {
            await navigator.clipboard.writeText(hex);
            const btn = e.currentTarget;
            const hexSpan = btn.querySelector('.art-palette-hex');
            const prev = hexSpan.textContent;
            hexSpan.textContent = t('art_copied');
            setTimeout(() => { hexSpan.textContent = prev; }, 1200);
          } },
        }, [
          el('span', { class: 'art-palette-swatch', style: `background:${hex}` }),
          el('span', { class: 'art-palette-key' }, key),
          el('span', { class: 'art-palette-hex' }, hex),
        ])))
    : el('p', { class: 'mute' }, t('art_no_palette'));

  const downloads = el('div', { class: 'art-panel-downloads' },
    Object.entries(asset.files).map(([slot, rel]) =>
      el('a', { class: 'btn', href: '/art-library/' + rel, download: rel.split('/').pop() },
        `${t('art_download')} ${slot}.svg`)));

  const displayName = state.lang === 'de'
    ? (asset.name_de || asset.id)
    : (asset.name_en || asset.name_de || asset.id);

  return el('aside', { class: 'art-panel' }, [
    close,
    primary,
    el('h3', {}, displayName),
    el('dl', { class: 'art-panel-meta' }, [
      el('dt', {}, t('art_id')),   el('dd', {}, asset.id),
      el('dt', {}, t('art_kind')), el('dd', {}, t('art_kind_' + asset.kind)),
      el('dt', {}, t('art_tags')), el('dd', {}, tagRow),
    ]),
    el('h4', {}, t('art_palette')),
    palette,
    downloads,
  ]);
}
```

- [ ] **Step 2: Smoke check on korczewski**

Open `https://dashboard.korczewski.de/`. Click **Art Library**. Expected: 21 cards in four groups; clicking opens the side panel; palette swatches copy hex on click; tag/kind/search filters narrow the list.

- [ ] **Step 3: Commit**

```bash
git add dashboard/web/public/app.js
git commit -m "feat(dashboard): art-library gallery with filters, search, side-panel detail"
```

---

### Task C3: Add CSS for the art tab

**Files:**
- Modify: `dashboard/web/public/style.css`

- [ ] **Step 1: Append the art-tab styles**

```css
/* ── Art Library tab ─────────────────────────────────────────────────── */
.art-pane { display: grid; grid-template-columns: 1fr; gap: 12px; padding: 8px; }
.art-pane--with-panel { grid-template-columns: 1fr 360px; }
.art-main { min-width: 0; }

.art-toolbar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 6px; }
.art-search { flex: 1; min-width: 220px; padding: 6px 10px; background: #0a1422; border: 1px solid #2c4d80; border-radius: 4px; color: #e6efff; }

.art-kinds, .art-tags { display: flex; gap: 6px; flex-wrap: wrap; }
.art-chip, .art-tag {
  font: inherit; padding: 4px 10px; border-radius: 12px; border: 1px solid #2c4d80;
  background: #0a1422; color: #c5d3e6; cursor: pointer;
}
.art-chip.active, .art-tag.active { background: #2c4d80; color: #ffd84a; border-color: #ffd84a; }
.art-tag-row { margin-bottom: 14px; }

.art-section { margin: 18px 0 8px; font-size: .9rem; text-transform: uppercase; letter-spacing: .12em; opacity: .7; }
.art-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; }
.art-card {
  position: relative; aspect-ratio: 4 / 5; padding: 6px;
  background: #102540; border: 1px solid #2c4d80; border-radius: 6px;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.art-card.active { border-color: #ffd84a; box-shadow: 0 0 0 1px #ffd84a inset; }
.art-card:hover { background: #1a4a8a; }
.art-card-idx {
  position: absolute; bottom: 4px; left: 6px;
  font-family: ui-monospace, "JetBrains Mono", monospace; font-size: 10px;
  color: #88a0c8; letter-spacing: .1em;
}
.art-card-art { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
.art-card-art svg { width: 100%; height: 100%; }

.art-panel {
  background: #0a1422; border: 1px solid #2c4d80; border-radius: 6px;
  padding: 14px; position: sticky; top: 12px; max-height: calc(100vh - 24px); overflow-y: auto;
  align-self: start;
}
.art-panel-close {
  position: absolute; top: 6px; right: 6px; width: 28px; height: 28px;
  border: 0; background: transparent; color: #c5d3e6; font-size: 18px; cursor: pointer;
}
.art-panel-art { display: flex; align-items: center; justify-content: center; min-height: 220px; margin-bottom: 12px; }
.art-panel-art svg { max-width: 100%; max-height: 320px; }

.art-panel-meta { display: grid; grid-template-columns: 80px 1fr; gap: 4px 10px; margin: 8px 0; font-size: .85rem; }
.art-panel-meta dt { color: #88a0c8; text-transform: uppercase; letter-spacing: .08em; font-size: .75rem; }
.art-panel-meta dd { margin: 0; }
.art-panel-tags { display: flex; gap: 4px; flex-wrap: wrap; }
.art-panel-palette { display: grid; gap: 4px; }
.art-palette-row {
  display: grid; grid-template-columns: 18px 1fr 80px; gap: 8px; align-items: center;
  background: transparent; border: 0; padding: 4px; cursor: pointer; color: inherit; text-align: left;
}
.art-palette-row:hover { background: #102540; }
.art-palette-swatch { width: 16px; height: 16px; border-radius: 3px; border: 1px solid rgba(255,255,255,.1); }
.art-palette-key { font-family: ui-monospace, monospace; font-size: .8rem; color: #c5d3e6; }
.art-palette-hex { font-family: ui-monospace, monospace; font-size: .75rem; color: #88a0c8; text-align: right; }
.art-panel-downloads { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 12px; }
```

- [ ] **Step 2: Reload, verify cards/panel/swatches render correctly**

Then test the empty-state by switching the cluster context selector to `mentolder` — the gallery should swap to "No art library configured…".

- [ ] **Step 3: Commit**

```bash
git add dashboard/web/public/style.css
git commit -m "feat(dashboard): style the art-library gallery and side panel"
```

---

### Task C4: Playwright tests for dashboard art tab

**Files:**
- Create: `tests/playwright/dashboard-art.spec.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { test, expect } from '@playwright/test';

const URL = process.env.DASHBOARD_URL || 'https://dashboard.korczewski.de';
const URL_MENTOLDER = process.env.DASHBOARD_URL_MENTOLDER || 'https://dashboard.mentolder.de';

test('art tab is visible and renders all 21 assets', async ({ page }) => {
  await page.goto(URL);
  await page.click('button:has-text("Art Library")');
  await page.waitForSelector('.art-grid', { timeout: 5_000 });
  const cardCount = await page.locator('.art-card').count();
  expect(cardCount).toBe(21);
});

test('clicking a card opens the side panel with palette swatches', async ({ page }) => {
  await page.goto(URL);
  await page.click('button:has-text("Art Library")');
  await page.waitForSelector('.art-grid');
  await page.click('.art-card >> nth=0');
  await page.waitForSelector('.art-panel');
  expect(await page.locator('.art-palette-row').count()).toBeGreaterThan(0);
});

test('mentolder context shows empty-state', async ({ page }) => {
  await page.goto(URL_MENTOLDER);
  await page.click('button:has-text("Art Library")');
  await expect(page.locator('.art-empty')).toContainText(/No art library configured|Keine Kunstbibliothek/);
});
```

- [ ] **Step 2: Run**

```bash
npx playwright test tests/playwright/dashboard-art.spec.ts
```

Expected: 3 tests PASS. (Confirm `dashboard.mentolder.de` has been redeployed since PR #A merged before running the empty-state test.)

- [ ] **Step 3: Commit**

```bash
git add tests/playwright/dashboard-art.spec.ts
git commit -m "test(dashboard): playwright coverage for art-library tab + empty-state"
```

---

### Task C5: Build, push, redeploy dashboard-web, open PR #C

- [ ] **Step 1: Roll out**

```bash
cd /home/patrick/Bachelorprojekt && grep -n "dashboard:deploy\|dashboard-web" Taskfile.yml | head
```

If a `dashboard:deploy` task exists, use it. Otherwise:

```bash
task workspace:deploy ENV=korczewski
task workspace:deploy ENV=mentolder
```

- [ ] **Step 2: Visual verification on both environments**

- `https://dashboard.korczewski.de/` → Art Library shows 21 assets, full functionality.
- `https://dashboard.mentolder.de/` → Art Library shows the empty-state copy.

- [ ] **Step 3: Open PR #C**

```bash
git push -u origin feature/dashboard-art-tab
gh pr create --title "feat(dashboard): art-library admin tab with filters and detail panel" --body "$(cat <<'EOF'
## Summary
- New `art` tab in the dashboard admin menu
- Reads `/art-library/manifest.json` (mounted from the `art-library` ConfigMap)
- Renders 21 assets grouped by kind (4 chars + 6 props + 6 terrain + 5 logos)
- Filters: kind chips, tag multiselect, live search on id/name
- Side panel: full-size art, palette swatches with copy-to-clipboard, SVG downloads
- DE/EN i18n keys; respects existing language toggle
- Empty-state copy when ConfigMap absent (e.g. mentolder)

## Test plan
- [x] `tests/playwright/dashboard-art.spec.ts` passes against korczewski
- [x] Empty-state renders on mentolder
- [x] Lang toggle swaps tab label, kind chips, palette/download buttons

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

**1. Spec coverage** — every spec section maps to at least one task:

| Spec section | Tasks |
|---|---|
| Architecture (repo dir + ConfigMap) | A1, A4, A6 |
| Data shape (manifest.json) | A1 (schema), A2 (validator + manifest), A3 (population) |
| JSX → SVG conversion | A3 (extractor + manual fallback) |
| Brett figurine integration | B1 (boot), B2 (buildFigure), B3 (picker), B4 (back-compat) |
| Dashboard admin viewer | C1 (tab+i18n), C2 (renderArt), C3 (CSS), C4 (tests) |
| Cluster scope (per-env) | A4 (dev), A6 (prod-korczewski + prod-mentolder optional), A7 (live verify) |
| Backwards compat (legacy snapshots) | B2 (legacy `else if` branches), B4 (whitelist broaden) |
| Testing — schema validation | A2 (BATS) |
| Testing — manifest integrity | A2 (validate-manifest.mjs) |
| Testing — Brett render | B1, B2 (Playwright) |
| Testing — Dashboard render + empty-state | C4 (Playwright) |
| Testing — Visual regression | manual (called out in spec) |
| Deployment sequence | three PRs at A7, B5, C5 |

**2. Placeholder scan** — no TODO/TBD/"add error handling" anywhere. JSX → SVG has a concrete extractor + a documented manual fallback. The `prod-korczewski/kustomization.yaml` overlay condition (Task A6 Step 3) tells the engineer how to detect whether they need the additional generator block, with the exact verify command.

**3. Type consistency** — `characterIds`, `characterTextures`, `ART_MANIFEST`, `ART_STATE`, `bootArtLibrary`, `loadCharacterTexture`, `svgToImage`, `injectSvg`, `primarySlot`, `buildArtCard`, `buildArtPanel` are referenced consistently. Manifest field names (`id`, `kind`, `name_de`, `name_en`, `tags`, `palette`, `files`) match between schema (A1), validator (A2), and consumers (B/C). The `figure-01..04` IDs are used identically in manifest (A2), Brett picker (B3), and dashboard (C2).

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-04-art-library.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
