---
title: "mentolder — Brand Foundations Design System"
date: 2026-06-27
status: plan_staged
domains: [website, design-system]
spec: docs/superpowers/specs/2026-06-27-mentolder-brand-foundations-design-system-design.md
ticket: TBD
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mentolder — Brand Foundations Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new third claude.ai/design project (`mentolder — Brand Foundations`) holding 14 self-contained static HTML foundation cards (color/type/spacing/radius/elevation/motion/icons/brand), generated DRY from the canonical `colors_and_type.css`, and push it via the DesignSync tool.

**Architecture:** A standalone `design-system/` bundle. `build.mjs` (1) copies the canonical token CSS into `_tokens.css`, (2) copies needed SVGs into `assets/`, and (3) assembles each `cards/*.html` by replacing idempotent marker regions with the inlined token CSS, a shared `_card.css`, and inline SVG grids. Foundation cards are static (no props/state), so no component-compile pipeline is used — this is the DesignSync tool's native card format. Only `cards/**` is uploaded; `_tokens.css`/`_card.css`/`assets/` are local build inputs.

**Tech Stack:** Node ≥22.13 (built-in `node:test`, no new deps), plain HTML/CSS, the DesignSync tool.

## Global Constraints

- **Brand name** is always lowercase `mentolder` (never `Mentolder` except at sentence start).
- **Cards render on the brand ground:** every card sets `background: var(--ink-900)` / `color: var(--fg)` — brand text is light and invisible on white.
- **Token SSOT** is `website/public/brand/mentolder/colors_and_type.css` — never hand-copy hex values into cards; they arrive via injection.
- **Cards must be self-contained:** no relative `@import`/`<img src>`; tokens, card CSS, and SVGs are inlined at build time (claude.ai/design renders each card in isolation).
- **Card index marker:** every `cards/*.html` MUST have, as the literal first line, `<!-- @dsCard group="<Group>" name="<Name>" -->`.
- **Upload scope:** DesignSync plan `writes` is exactly `["cards/**"]`. Never add `_tokens.css`/`assets/` to the plan.
- **Node ESM:** all scripts are `.mjs` (ESM); the repo root has no `"type":"module"`, so `.mjs` is required.
- **Additive only:** create only files under `design-system/`; touch no `website/` or `mentolder-web/` source.

---

## File Structure

```
design-system/
├── build.mjs            # extractTokens + copyAssets + injectRegion + svgGrid + assembleCard + main
├── build.test.mjs       # node:test — injectRegion idempotency, extractTokens, svgGrid
├── validate.mjs         # @dsCard line-1 marker + injection-region lint over cards/*.html
├── _card.css            # shared foundation-card layout (authored, local build input)
├── _tokens.css          # generated verbatim copy of colors_and_type.css (local build input)
├── assets/              # SVGs copied from website (local build input)
│   ├── props/*.svg
│   └── logos/*.svg
├── config.json          # { name, projectId, localDir, cards[] }
├── NOTES.md             # re-sync checklist + quirks
└── cards/
    ├── colors-surfaces.html       (Colors / Surfaces)
    ├── colors-text.html           (Colors / Text)
    ├── colors-brass.html          (Colors / Brass)
    ├── colors-sage-semantic.html  (Colors / Sage + Semantic)
    ├── colors-paper-print.html    (Colors / Paper + Print)
    ├── type-families.html         (Type / Families)
    ├── type-scale.html            (Type / Scale)
    ├── type-editorial.html        (Type / Editorial)
    ├── spacing-scale.html         (Spacing / Scale + Layout)
    ├── radius-scale.html          (Radius / Scale)
    ├── elevation-shadows.html     (Elevation / Shadows + Hairlines)
    ├── motion-easing.html         (Motion / Easing + Duration)
    ├── icons-sheet.html           (Iconography / Icon Sheet)
    └── brand-logo.html            (Brand / Logo + Mark)
```

**Card source skeleton** (what an author writes — build fills the marker regions in place, idempotently):

```html
<!-- @dsCard group="Colors" name="Surfaces" -->
<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8">
<title>Surfaces · mentolder</title>
<!-- tokens:start --><!-- tokens:end -->
<!-- card:start --><!-- card:end -->
</head>
<body class="ds-card"><div class="ds-wrap">
  <!-- unique body here -->
</div></body></html>
```

---

## Task 1: Build script (`build.mjs`) + tests

**Files:**
- Create: `design-system/build.mjs`
- Test: `design-system/build.test.mjs`

**Interfaces:**
- Produces: `injectRegion(html: string, name: string, payload: string) → string` (replaces content between `<!-- name:start -->` and `<!-- name:end -->`; idempotent); `extractTokens() → void` (writes `design-system/_tokens.css`); `copyAssets() → void`; `svgGrid(absDir: string) → string`; `assembleCard(html: string) → string`; `main() → Promise<void>`.
- Consumes: `website/public/brand/mentolder/colors_and_type.css`, `website/public/brand/mentolder/props/*.svg`, `website/public/brand/mentolder/logos/*.svg`.

- [ ] **Step 1: Write the failing test**

Create `design-system/build.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { injectRegion, svgGrid } from './build.mjs';

test('injectRegion fills a start/end region', () => {
  const html = 'A<!-- tokens:start --><!-- tokens:end -->B';
  const out = injectRegion(html, 'tokens', '<style>X</style>');
  assert.equal(out, 'A<!-- tokens:start --><style>X</style><!-- tokens:end -->B');
});

test('injectRegion is idempotent (re-run replaces, not appends)', () => {
  const html = 'A<!-- tokens:start --><!-- tokens:end -->B';
  const once = injectRegion(html, 'tokens', 'P1');
  const twice = injectRegion(once, 'tokens', 'P2');
  assert.equal(twice, 'A<!-- tokens:start -->P2<!-- tokens:end -->B');
  assert.equal((twice.match(/tokens:start/g) || []).length, 1);
});

test('injectRegion throws if region markers are missing', () => {
  assert.throws(() => injectRegion('no markers', 'tokens', 'P'), /tokens:start/);
});

test('svgGrid inlines each svg as a labelled cell', () => {
  const grid = svgGrid(new URL('./assets/props', import.meta.url).pathname);
  assert.match(grid, /<svg/);
  assert.match(grid, /icon-cell/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd design-system && node --test build.test.mjs`
Expected: FAIL — `Cannot find module './build.mjs'` (and `svgGrid` test needs `assets/props`, created in Step 3's `copyAssets`).

- [ ] **Step 3: Write minimal implementation**

Create `design-system/build.mjs`:

```js
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BRAND = join(HERE, '..', 'website', 'public', 'brand', 'mentolder');
const CARDS = join(HERE, 'cards');

/** Replace the content between `<!-- name:start -->` and `<!-- name:end -->`. Idempotent. */
export function injectRegion(html, name, payload) {
  const open = `<!-- ${name}:start -->`;
  const close = `<!-- ${name}:end -->`;
  const i = html.indexOf(open);
  const j = html.indexOf(close);
  if (i === -1 || j === -1 || j < i) {
    throw new Error(`injectRegion: missing region ${name}:start/${name}:end`);
  }
  return html.slice(0, i + open.length) + payload + html.slice(j);
}

/** Verbatim copy of the canonical token CSS → _tokens.css (DRY; no regex extraction). */
export function extractTokens() {
  const src = join(BRAND, 'colors_and_type.css');
  const css = readFileSync(src, 'utf8');
  const header = `/* GENERATED by design-system/build.mjs — verbatim copy of\n   website/public/brand/mentolder/colors_and_type.css. Do not edit by hand. */\n`;
  writeFileSync(join(HERE, '_tokens.css'), header + css);
}

/** Copy the SVGs the icon-sheet & logo cards inline into assets/ (tracked local snapshot). */
export function copyAssets() {
  for (const sub of ['props', 'logos']) {
    const from = join(BRAND, sub);
    const to = join(HERE, 'assets', sub);
    mkdirSync(to, { recursive: true });
    for (const f of readdirSync(from).filter((n) => n.endsWith('.svg'))) {
      copyFileSync(join(from, f), join(to, f));
    }
  }
}

/** Inline every *.svg in absDir as a labelled grid cell. */
export function svgGrid(absDir) {
  return readdirSync(absDir)
    .filter((n) => n.endsWith('.svg'))
    .sort()
    .map((n) => {
      const svg = readFileSync(join(absDir, n), 'utf8')
        .replace(/<\?xml[^>]*\?>/, '')
        .trim();
      const label = basename(n, '.svg');
      return `<div class="icon-cell">${svg}<span class="cap">${label}</span></div>`;
    })
    .join('\n');
}

/** Assemble one card: inject tokens, shared card css, and any svg grids. */
export function assembleCard(html) {
  const tokens = `<style>\n${readFileSync(join(HERE, '_tokens.css'), 'utf8')}\n</style>`;
  const card = `<style>\n${readFileSync(join(HERE, '_card.css'), 'utf8')}\n</style>`;
  let out = injectRegion(html, 'tokens', tokens);
  out = injectRegion(out, 'card', card);
  if (out.includes('<!-- props-grid:start -->')) {
    out = injectRegion(out, 'props-grid', svgGrid(join(HERE, 'assets', 'props')));
  }
  if (out.includes('<!-- logos-grid:start -->')) {
    out = injectRegion(out, 'logos-grid', svgGrid(join(HERE, 'assets', 'logos')));
  }
  return out;
}

export async function main() {
  extractTokens();
  copyAssets();
  if (!existsSync(CARDS)) { console.log('no cards/ yet'); return; }
  const files = readdirSync(CARDS).filter((n) => n.endsWith('.html')).sort();
  for (const f of files) {
    const p = join(CARDS, f);
    writeFileSync(p, assembleCard(readFileSync(p, 'utf8')));
  }
  console.log(`assembled ${files.length} card(s)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 4: Run `copyAssets` once so the svgGrid test has fixtures, then run tests**

Run: `cd design-system && node -e "import('./build.mjs').then(m=>m.copyAssets())" && node --test build.test.mjs`
Expected: PASS (4 tests). `assets/props/*.svg` and `assets/logos/*.svg` now exist.

- [ ] **Step 5: Commit**

```bash
git add design-system/build.mjs design-system/build.test.mjs design-system/assets design-system/_tokens.css
git commit -m "feat(design-system): build pipeline (token copy, asset copy, idempotent injection)"
```

---

## Task 2: Card validator (`validate.mjs`) + tests

**Files:**
- Create: `design-system/validate.mjs`
- Test: `design-system/validate.test.mjs`

**Interfaces:**
- Produces: `validateCard(html: string) → string[]` (returns an array of problem strings; empty = valid); `main()` exits non-zero if any `cards/*.html` has problems.

- [ ] **Step 1: Write the failing test**

Create `design-system/validate.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCard } from './validate.mjs';

const good = [
  '<!-- @dsCard group="Colors" name="Surfaces" -->',
  '<!-- tokens:start --><style>:root{}</style><!-- tokens:end -->',
  '<!-- card:start --><style>.x{}</style><!-- card:end -->',
].join('\n');

test('a well-formed card has no problems', () => {
  assert.deepEqual(validateCard(good), []);
});

test('missing @dsCard first line is flagged', () => {
  const bad = '<html>\n' + good;
  assert.ok(validateCard(bad).some((p) => /first line/.test(p)));
});

test('empty group or name is flagged', () => {
  const bad = good.replace('group="Colors"', 'group=""');
  assert.ok(validateCard(bad).some((p) => /group/.test(p)));
});

test('un-injected token region (build not run) is flagged', () => {
  const bad = good.replace('<style>:root{}</style>', '');
  assert.ok(validateCard(bad).some((p) => /tokens/.test(p)));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd design-system && node --test validate.test.mjs`
Expected: FAIL — `Cannot find module './validate.mjs'`.

- [ ] **Step 3: Write minimal implementation**

Create `design-system/validate.mjs`:

```js
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CARDS = join(HERE, 'cards');

export function validateCard(html) {
  const problems = [];
  const firstLine = html.split('\n', 1)[0];
  const m = firstLine.match(/^<!--\s*@dsCard\s+group="([^"]*)"\s+name="([^"]*)"\s*-->$/);
  if (!m) {
    problems.push('first line must be `<!-- @dsCard group="..." name="..." -->`');
  } else {
    if (!m[1].trim()) problems.push('@dsCard group is empty');
    if (!m[2].trim()) problems.push('@dsCard name is empty');
  }
  // token region must be present AND filled (proves build ran)
  const tok = html.match(/<!-- tokens:start -->([\s\S]*?)<!-- tokens:end -->/);
  if (!tok) problems.push('missing tokens:start/end region');
  else if (!tok[1].includes('<style')) problems.push('tokens region not injected — run build.mjs');
  // no leftover svg-grid markers without injection
  for (const grid of ['props-grid', 'logos-grid']) {
    const g = html.match(new RegExp(`<!-- ${grid}:start -->([\\s\\S]*?)<!-- ${grid}:end -->`));
    if (g && !g[1].includes('<svg')) problems.push(`${grid} region not injected — run build.mjs`);
  }
  return problems;
}

export function main() {
  if (!existsSync(CARDS)) { console.error('no cards/ directory'); process.exit(1); }
  const files = readdirSync(CARDS).filter((n) => n.endsWith('.html')).sort();
  let bad = 0;
  for (const f of files) {
    const probs = validateCard(readFileSync(join(CARDS, f), 'utf8'));
    if (probs.length) { bad++; console.error(`✗ ${f}:`); probs.forEach((p) => console.error(`   - ${p}`)); }
    else console.log(`✓ ${f}`);
  }
  if (bad) { console.error(`\n${bad} card(s) with problems`); process.exit(1); }
  console.log(`\n${files.length} card(s) OK`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd design-system && node --test validate.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add design-system/validate.mjs design-system/validate.test.mjs
git commit -m "feat(design-system): card validator (dsCard marker + injection lint)"
```

---

## Task 3: Shared card CSS (`_card.css`) + first card (`colors-surfaces`) — pipeline smoke test

**Files:**
- Create: `design-system/_card.css`
- Create: `design-system/cards/colors-surfaces.html`

**Interfaces:**
- Consumes: `injectRegion`/`assembleCard` (Task 1), `validateCard` (Task 2).
- Produces: the canonical card pattern every later card follows; the helper classes (`.ds-card`, `.ds-wrap`, `.ds-head`, `.ds-grid`, `.cols-*`, `.swatch`, `.scale-row`, `.bar`, `.tile`, `.icon-cell`, `.cap`, `.kpill`) used by Tasks 4–8.

- [ ] **Step 1: Write the shared card layout**

Create `design-system/_card.css`:

```css
/* _card.css — shared foundation-card layout. Injected into every card (local build input). */
body.ds-card { background: var(--ink-900); color: var(--fg); font-family: var(--sans);
  margin: 0; padding: 48px; -webkit-font-smoothing: antialiased; }
.ds-wrap { max-width: 1000px; margin: 0 auto; }
.ds-head { margin: 0 0 28px; }
.ds-head .t-eyebrow { color: var(--brass); }
.ds-head h1 { font-size: 34px; line-height: 1.1; margin: 8px 0 6px; }
.ds-head p { color: var(--fg-soft); max-width: 64ch; }
.ds-grid { display: grid; gap: 16px; }
.cols-2 { grid-template-columns: repeat(2,1fr); } .cols-3 { grid-template-columns: repeat(3,1fr); }
.cols-4 { grid-template-columns: repeat(4,1fr); } .cols-5 { grid-template-columns: repeat(5,1fr); }
.swatch { border: 1px solid var(--line-2); border-radius: var(--radius-md); overflow: hidden; }
.swatch .fill { height: 92px; }
.swatch .meta { padding: 11px 13px; background: var(--ink-850); display: flex; flex-direction: column; gap: 3px; }
.swatch .nm { font: 500 14px/1.2 var(--sans); color: var(--fg); }
.swatch .vl { font: 400 11px/1.3 var(--mono); color: var(--mute); }
.swatch .ro { font: 400 12px/1.4 var(--sans); color: var(--fg-soft); }
.scale-row { display: flex; align-items: center; gap: 18px; padding: 10px 0; border-bottom: 1px solid var(--line); }
.scale-row .lab { width: 120px; font: 400 12px/1.3 var(--mono); color: var(--mute); flex: none; }
.bar { height: 14px; background: var(--brass); border-radius: var(--radius-pill); }
.tile { display: grid; place-items: center; background: var(--ink-800); border: 1px solid var(--line-2); min-height: 92px; }
.icon-cell { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 18px;
  background: var(--ink-850); border: 1px solid var(--line); border-radius: var(--radius-md); }
.icon-cell svg { width: 30px; height: 30px; color: var(--brass); fill: currentColor; }
.cap { font: 400 11px/1.3 var(--mono); color: var(--mute); }
.kpill { display: inline-block; padding: 4px 10px; border-radius: var(--radius-pill);
  border: 1px solid var(--line-2); font: 500 11px/1 var(--mono); color: var(--fg-soft); }
```

- [ ] **Step 2: Write the first card source**

Create `design-system/cards/colors-surfaces.html`:

```html
<!-- @dsCard group="Colors" name="Surfaces" -->
<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8">
<title>Surfaces · mentolder</title>
<!-- tokens:start --><!-- tokens:end -->
<!-- card:start --><!-- card:end -->
</head>
<body class="ds-card"><div class="ds-wrap">
  <header class="ds-head">
    <span class="t-eyebrow">Colors</span>
    <h1>Surfaces</h1>
    <p>Das Ink-Substrat — tiefes, leicht warmes Navy. Tiefe entsteht über gestapelte
       Flächen plus Hairlines, nicht über Schatten.</p>
  </header>
  <div class="ds-grid cols-4">
    <div class="swatch"><div class="fill" style="background:var(--ink-900)"></div>
      <div class="meta"><span class="nm">ink-900</span><span class="vl">#0b111c</span><span class="ro">Page-Basis</span></div></div>
    <div class="swatch"><div class="fill" style="background:var(--ink-850)"></div>
      <div class="meta"><span class="nm">ink-850</span><span class="vl">#101826</span><span class="ro">Erhöhte Panels (Footer, „Why")</span></div></div>
    <div class="swatch"><div class="fill" style="background:var(--ink-800)"></div>
      <div class="meta"><span class="nm">ink-800</span><span class="vl">#17202e</span><span class="ro">Cards, Quote-Panel</span></div></div>
    <div class="swatch"><div class="fill" style="background:var(--ink-750)"></div>
      <div class="meta"><span class="nm">ink-750</span><span class="vl">#1d2736</span><span class="ro">Subtile Alternate</span></div></div>
  </div>
</div></body></html>
```

- [ ] **Step 3: Run build, then validate**

Run: `cd design-system && node build.mjs && node validate.mjs`
Expected: `assembled 1 card(s)` then `✓ colors-surfaces.html` / `1 card(s) OK`. The file now contains the injected `<style>` blocks between the marker comments.

- [ ] **Step 4: Visual render check**

Open `design-system/cards/colors-surfaces.html` in a browser (or headless screenshot via the repo's chrome-devtools tooling). Expected: dark ink page, four labelled ink swatches, Geist/Newsreader fonts loaded, brass eyebrow tick.

- [ ] **Step 5: Commit**

```bash
git add design-system/_card.css design-system/cards/colors-surfaces.html
git commit -m "feat(design-system): shared card css + Colors/Surfaces card"
```

---

## Task 4: Remaining Color cards (Text, Brass, Sage+Semantic, Paper+Print)

**Files:**
- Create: `design-system/cards/colors-text.html`, `colors-brass.html`, `colors-sage-semantic.html`, `colors-paper-print.html`

**Interfaces:** Consumes the Task 3 card pattern + `_card.css` helpers. Values are copied verbatim from `colors_and_type.css`.

- [ ] **Step 1: Write `cards/colors-text.html`**

```html
<!-- @dsCard group="Colors" name="Text" -->
<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><title>Text · mentolder</title>
<!-- tokens:start --><!-- tokens:end --><!-- card:start --><!-- card:end -->
</head><body class="ds-card"><div class="ds-wrap">
  <header class="ds-head"><span class="t-eyebrow">Colors</span><h1>Text</h1>
    <p>Vier Stufen warmes Off-White auf Ink. Fließtext ist nie reines Weiß — `fg-soft`
       ist der Standard, `fg` nur für Headlines.</p></header>
  <div class="ds-grid cols-2">
    <div class="swatch"><div class="fill" style="background:var(--ink-850);display:grid;place-items:center">
      <span style="color:var(--fg);font-size:22px">Aa — Primärtext</span></div>
      <div class="meta"><span class="nm">fg</span><span class="vl">#eef1f3</span><span class="ro">Headlines, Primärtext</span></div></div>
    <div class="swatch"><div class="fill" style="background:var(--ink-850);display:grid;place-items:center">
      <span style="color:var(--fg-soft);font-size:22px">Aa — Fließtext</span></div>
      <div class="meta"><span class="nm">fg-soft</span><span class="vl">#cdd3d9</span><span class="ro">Body, Ledes (Default)</span></div></div>
    <div class="swatch"><div class="fill" style="background:var(--ink-850);display:grid;place-items:center">
      <span style="color:var(--mute);font-size:22px">Aa — Meta</span></div>
      <div class="meta"><span class="nm">mute</span><span class="vl">#8c96a3</span><span class="ro">Captions, Meta</span></div></div>
    <div class="swatch"><div class="fill" style="background:var(--ink-850);display:grid;place-items:center">
      <span style="color:var(--mute-2);font-size:22px">Aa — Deep Meta</span></div>
      <div class="meta"><span class="nm">mute-2</span><span class="vl">#6a727e</span><span class="ro">Footer-Bottom, Deep Meta</span></div></div>
  </div>
</div></body></html>
```

- [ ] **Step 2: Write `cards/colors-brass.html`**

```html
<!-- @dsCard group="Colors" name="Brass" -->
<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><title>Brass · mentolder</title>
<!-- tokens:start --><!-- tokens:end --><!-- card:start --><!-- card:end -->
</head><body class="ds-card"><div class="ds-wrap">
  <header class="ds-head"><span class="t-eyebrow">Colors</span><h1>Brass — Primär-Akzent</h1>
    <p>Der warme Messing-Akzent. <strong>Eine</strong> primäre Aktion pro View: CTAs, aktive
       Zustände, Eyebrow-Ticks. Brass-2 ist der Hover-/Kursiv-Akzent.</p></header>
  <div class="ds-grid cols-3">
    <div class="swatch"><div class="fill" style="background:var(--brass)"></div>
      <div class="meta"><span class="nm">brass</span><span class="vl">oklch(.80 .09 75)</span><span class="ro">CTA, Eyebrow, aktiv</span></div></div>
    <div class="swatch"><div class="fill" style="background:var(--brass-2)"></div>
      <div class="meta"><span class="nm">brass-2</span><span class="vl">oklch(.86 .09 75)</span><span class="ro">Hover, Kursiv-Akzent</span></div></div>
    <div class="swatch"><div class="fill" style="background:var(--brass-deep)"></div>
      <div class="meta"><span class="nm">brass-deep</span><span class="vl">#8a6a2a</span><span class="ro">Gradient-Basis Brand-Mark</span></div></div>
    <div class="swatch"><div class="fill" style="background:var(--ink-850)">
      <div style="height:100%;background:var(--brass-d)"></div></div>
      <div class="meta"><span class="nm">brass-d</span><span class="vl">oklch(.80 .09 75 / .14)</span><span class="ro">Getönte Füllung auf Ink</span></div></div>
    <div class="swatch"><div class="fill" style="background:var(--brass-hex)"></div>
      <div class="meta"><span class="nm">brass-hex</span><span class="vl">#cda260</span><span class="ro">Fallback (PDF/E-Mail, kein OKLCH)</span></div></div>
    <div class="swatch"><div class="fill" style="display:grid;place-items:center;background:var(--ink-900)">
      <button style="background:var(--brass);color:var(--ink-900);border:0;border-radius:var(--radius-pill);padding:10px 20px;font:500 14px var(--sans)">Termin buchen</button></div>
      <div class="meta"><span class="nm">in situ</span><span class="vl">CTA on ink-900</span><span class="ro">So sieht die Primär-Aktion aus</span></div></div>
  </div>
</div></body></html>
```

- [ ] **Step 3: Write `cards/colors-sage-semantic.html`**

```html
<!-- @dsCard group="Colors" name="Sage + Semantic" -->
<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><title>Sage + Semantik · mentolder</title>
<!-- tokens:start --><!-- tokens:end --><!-- card:start --><!-- card:end -->
</head><body class="ds-card"><div class="ds-wrap">
  <header class="ds-head"><span class="t-eyebrow">Colors</span><h1>Sage + Semantik</h1>
    <p>Sage (kühles Mint) signalisiert „bereit / gesund / live" und ist der zweite Akzent
       neben Brass. Die semantischen Farben markieren Status.</p></header>
  <div class="ds-grid cols-4">
    <div class="swatch"><div class="fill" style="background:var(--sage)"></div>
      <div class="meta"><span class="nm">sage</span><span class="vl">oklch(.80 .06 160)</span><span class="ro">Bereit / ruhig (2. Akzent)</span></div></div>
    <div class="swatch"><div class="fill" style="background:var(--success)"></div>
      <div class="meta"><span class="nm">success</span><span class="vl">oklch(.80 .06 160)</span><span class="ro">Erfolg / live</span></div></div>
    <div class="swatch"><div class="fill" style="background:var(--danger)"></div>
      <div class="meta"><span class="nm">danger</span><span class="vl">oklch(.62 .18 22)</span><span class="ro">Blockiert / kritisch</span></div></div>
    <div class="swatch"><div class="fill" style="background:var(--info)"></div>
      <div class="meta"><span class="nm">info</span><span class="vl">oklch(.70 .10 230)</span><span class="ro">Information</span></div></div>
  </div>
</div></body></html>
```

- [ ] **Step 4: Write `cards/colors-paper-print.html`**

```html
<!-- @dsCard group="Colors" name="Paper + Print" -->
<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><title>Paper + Print · mentolder</title>
<!-- tokens:start --><!-- tokens:end --><!-- card:start --><!-- card:end -->
</head><body class="ds-card"><div class="ds-wrap">
  <header class="ds-head"><span class="t-eyebrow">Colors</span><h1>Paper + Print</h1>
    <p>Die warme Papier-Palette für PDF-, Rechnungs- und E-Mail-Kontexte — die einzige Stelle,
       an der mentolder auf hellem Grund erscheint.</p></header>
  <div class="ds-grid cols-3">
    <div class="swatch"><div class="fill" style="background:var(--paper)"></div>
      <div class="meta"><span class="nm">paper</span><span class="vl">#f6f3ee</span><span class="ro">Papier-Basis</span></div></div>
    <div class="swatch"><div class="fill" style="background:var(--paper-2)"></div>
      <div class="meta"><span class="nm">paper-2</span><span class="vl">#efeae1</span><span class="ro">Alternate</span></div></div>
    <div class="swatch"><div class="fill" style="background:var(--paper);display:grid;place-items:center">
      <span style="color:var(--paper-ink);font-size:20px">Aa — Text auf Papier</span></div>
      <div class="meta"><span class="nm">paper-ink</span><span class="vl">#1a2030</span><span class="ro">Dunkler Text auf Papier</span></div></div>
    <div class="swatch"><div class="fill" style="background:var(--paper);display:grid;place-items:center">
      <span style="color:var(--paper-ink-soft);font-size:20px">Aa — Soft</span></div>
      <div class="meta"><span class="nm">paper-ink-soft</span><span class="vl">#3a4150</span><span class="ro">Weicher Text</span></div></div>
    <div class="swatch"><div class="fill" style="background:var(--paper);display:grid;place-items:center">
      <span style="color:var(--paper-mute);font-size:20px">Aa — Mute</span></div>
      <div class="meta"><span class="nm">paper-mute</span><span class="vl">#6a717e</span><span class="ro">Meta auf Papier</span></div></div>
    <div class="swatch"><div class="fill" style="background:var(--paper)">
      <div style="height:1px;background:var(--paper-line);margin-top:46px"></div></div>
      <div class="meta"><span class="nm">paper-line</span><span class="vl">#d4cfc6</span><span class="ro">Divider auf Papier</span></div></div>
  </div>
</div></body></html>
```

- [ ] **Step 5: Build, validate, render-check, commit**

Run: `cd design-system && node build.mjs && node validate.mjs`
Expected: `assembled 5 card(s)`, all `✓`. Spot-check each of the 4 new cards in a browser.

```bash
git add design-system/cards/colors-text.html design-system/cards/colors-brass.html design-system/cards/colors-sage-semantic.html design-system/cards/colors-paper-print.html
git commit -m "feat(design-system): Colors cards (text, brass, sage+semantic, paper+print)"
```

---

## Task 5: Type cards (Families, Scale, Editorial)

**Files:**
- Create: `design-system/cards/type-families.html`, `type-scale.html`, `type-editorial.html`

**Interfaces:** Uses the `.t-*` semantic classes that ship inside the injected `_tokens.css` (e.g. `.t-h1`, `.t-lede`, `.t-eyebrow`, `.t-kicker`, `.t-stat`).

- [ ] **Step 1: Write `cards/type-families.html`**

```html
<!-- @dsCard group="Type" name="Families" -->
<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><title>Type Families · mentolder</title>
<!-- tokens:start --><!-- tokens:end --><!-- card:start --><!-- card:end -->
</head><body class="ds-card"><div class="ds-wrap">
  <header class="ds-head"><span class="t-eyebrow">Type</span><h1>Schrift-Familien</h1>
    <p>Editoriale Serife für Display, humanistische Sans für Body/UI, Mono für Eyebrows und Meta.</p></header>
  <div class="ds-grid" style="gap:28px">
    <div class="tile" style="display:block;padding:24px 28px;text-align:left">
      <span class="kpill">--serif · Newsreader</span>
      <div style="font-family:var(--serif);font-size:40px;font-weight:400;margin-top:12px">Menschen, Prozesse & Technik</div>
      <div class="cap" style="margin-top:8px">Display / Headlines · weights 300–600 · optical sizing</div></div>
    <div class="tile" style="display:block;padding:24px 28px;text-align:left">
      <span class="kpill">--sans · Geist</span>
      <div style="font-family:var(--sans);font-size:28px;font-weight:400;margin-top:12px">Klar, ruhig, auf Augenhöhe — der Fließtext der Marke.</div>
      <div class="cap" style="margin-top:8px">Body / UI · weights 300/400/500/600/700</div></div>
    <div class="tile" style="display:block;padding:24px 28px;text-align:left">
      <span class="kpill">--mono · Geist Mono</span>
      <div style="font-family:var(--mono);font-size:20px;letter-spacing:.05em;margin-top:12px">EYEBROW · META · LABELS · 0042</div>
      <div class="cap" style="margin-top:8px">Eyebrows, Kicker, Meta · weights 400/500</div></div>
  </div>
</div></body></html>
```

- [ ] **Step 2: Write `cards/type-scale.html`**

```html
<!-- @dsCard group="Type" name="Scale" -->
<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><title>Type Scale · mentolder</title>
<!-- tokens:start --><!-- tokens:end --><!-- card:start --><!-- card:end -->
</head><body class="ds-card"><div class="ds-wrap">
  <header class="ds-head"><span class="t-eyebrow">Type</span><h1>Typo-Skala</h1>
    <p>Semantische Stufen, je in echter Größe gerendert. Größen aus den `--t-*`-Token.</p></header>
  <div style="display:flex;flex-direction:column;gap:18px">
    <div><span class="kpill">.t-h1 · clamp(44–88) · 350</span><div class="t-h1">Wieder in Einklang</div></div>
    <div><span class="kpill">.t-h2 · clamp(32–48) · 400</span><div class="t-h2">Coaching & digitale Begleitung</div></div>
    <div><span class="kpill">.t-h3 · 22 · 500 · sans</span><div class="t-h3">Führungs-Coaching</div></div>
    <div><span class="kpill">.t-h3-serif · 28 · serif</span><div class="t-h3-serif">Digitale Transformation</div></div>
    <div><span class="kpill">.t-lede · 20</span><div class="t-lede">Mit 30+ Jahren Führungserfahrung begleite ich Menschen praxisnah.</div></div>
    <div><span class="kpill">.t-body · 16</span><p class="t-body">Standard-Fließtext in fg-soft, line-height 1.55.</p></div>
    <div><span class="kpill">.t-small · 14</span><div class="t-small">Captions und sekundäre Meta-Angaben.</div></div>
    <div><span class="kpill">.t-eyebrow · 11 · mono</span><div><span class="t-eyebrow">Leistungen</span></div></div>
    <div><span class="kpill">.t-kicker · 11 · mono</span><div class="t-kicker">EINZELCOACHING</div></div>
    <div><span class="kpill">.t-stat · 44 · serif</span><div class="t-stat">30<em>+</em></div></div>
  </div>
</div></body></html>
```

- [ ] **Step 3: Write `cards/type-editorial.html`**

```html
<!-- @dsCard group="Type" name="Editorial" -->
<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><title>Editorial Details · mentolder</title>
<!-- tokens:start --><!-- tokens:end --><!-- card:start --><!-- card:end -->
</head><body class="ds-card"><div class="ds-wrap">
  <header class="ds-head"><span class="t-eyebrow">Type</span><h1>Editorial-Details</h1>
    <p>Die kleinen Signaturen, die den editorialen Ton tragen: Brass-Kursiv-Betonung,
       der Eyebrow-Tick und die Stat-Hervorhebung.</p></header>
  <div class="ds-grid cols-2" style="gap:22px">
    <div class="tile" style="display:block;text-align:left;padding:28px">
      <div class="t-h2">Echte Lösungen brauchen <em>unbequeme</em> Wahrheiten</div>
      <div class="cap" style="margin-top:14px">Headline-`<em>` → kursiv, brass-2</div></div>
    <div class="tile" style="display:block;text-align:left;padding:28px">
      <span class="t-eyebrow">Warum mentolder</span>
      <div class="cap" style="margin-top:14px">.t-eyebrow → Mono, uppercase, 0.18em, brass-Tick via ::before</div></div>
    <div class="tile" style="display:block;text-align:left;padding:28px">
      <div class="t-stat">50<em>+</em></div><div class="t-small" style="margin-top:4px">Begleitete Teilnehmer</div>
      <div class="cap" style="margin-top:14px">.t-stat → Serife, `<em>` brass, nicht kursiv</div></div>
    <div class="tile" style="display:block;text-align:left;padding:28px">
      <div class="t-kicker">PROJEKT · AB 3.500 € / MONAT</div>
      <div class="cap" style="margin-top:14px">.t-kicker → Mono, 0.14em, mute</div></div>
  </div>
</div></body></html>
```

- [ ] **Step 4: Build, validate, render-check, commit**

Run: `cd design-system && node build.mjs && node validate.mjs` → `assembled 8 card(s)`, all `✓`. Spot-check the 3 type cards (real font sizes, brass italics).

```bash
git add design-system/cards/type-families.html design-system/cards/type-scale.html design-system/cards/type-editorial.html
git commit -m "feat(design-system): Type cards (families, scale, editorial)"
```

---

## Task 6: Spacing, Radius, Elevation cards

**Files:**
- Create: `design-system/cards/spacing-scale.html`, `radius-scale.html`, `elevation-shadows.html`

- [ ] **Step 1: Write `cards/spacing-scale.html`**

```html
<!-- @dsCard group="Spacing" name="Scale + Layout" -->
<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><title>Spacing · mentolder</title>
<!-- tokens:start --><!-- tokens:end --><!-- card:start --><!-- card:end -->
</head><body class="ds-card"><div class="ds-wrap">
  <header class="ds-head"><span class="t-eyebrow">Spacing</span><h1>Spacing + Layout</h1>
    <p>Acht-stufige Skala plus Layout-Rhythmus. Sektionen atmen bei 80–120px.</p></header>
  <div style="display:flex;flex-direction:column">
    <div class="scale-row"><span class="lab">--space-1 · 4</span><div class="bar" style="width:4px"></div></div>
    <div class="scale-row"><span class="lab">--space-2 · 8</span><div class="bar" style="width:8px"></div></div>
    <div class="scale-row"><span class="lab">--space-3 · 14</span><div class="bar" style="width:14px"></div></div>
    <div class="scale-row"><span class="lab">--space-4 · 22</span><div class="bar" style="width:22px"></div></div>
    <div class="scale-row"><span class="lab">--space-5 · 36</span><div class="bar" style="width:36px"></div></div>
    <div class="scale-row"><span class="lab">--space-6 · 56</span><div class="bar" style="width:56px"></div></div>
    <div class="scale-row"><span class="lab">--space-7 · 80</span><div class="bar" style="width:80px"></div></div>
    <div class="scale-row"><span class="lab">--space-8 · 120</span><div class="bar" style="width:120px"></div></div>
  </div>
  <div style="display:flex;gap:10px;margin-top:24px;flex-wrap:wrap">
    <span class="kpill">--gutter · 40</span><span class="kpill">--gutter-mobile · 22</span>
    <span class="kpill">--maxw · 1240</span><span class="kpill">Sektion-Rhythmus · 80–120</span></div>
</div></body></html>
```

- [ ] **Step 2: Write `cards/radius-scale.html`**

```html
<!-- @dsCard group="Radius" name="Scale" -->
<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><title>Radius · mentolder</title>
<!-- tokens:start --><!-- tokens:end --><!-- card:start --><!-- card:end -->
</head><body class="ds-card"><div class="ds-wrap">
  <header class="ds-head"><span class="t-eyebrow">Radius</span><h1>Radius-Skala</h1>
    <p>Von der Portrait-Kante bis zur Pille — Rundungen aus den `--radius-*`-Token.</p></header>
  <div class="ds-grid cols-3">
    <div class="tile" style="border-radius:var(--radius-xs)"><span class="cap">--radius-xs · 4</span></div>
    <div class="tile" style="border-radius:var(--radius-sm)"><span class="cap">--radius-sm · 8</span></div>
    <div class="tile" style="border-radius:var(--radius-md)"><span class="cap">--radius-md · 12</span></div>
    <div class="tile" style="border-radius:var(--radius-lg)"><span class="cap">--radius-lg · 14</span></div>
    <div class="tile" style="border-radius:var(--radius)"><span class="cap">--radius · 22</span></div>
    <div class="tile" style="border-radius:var(--radius-pill)"><span class="cap">--radius-pill · 999</span></div>
  </div>
</div></body></html>
```

> Note: `--radius-lg` (14px) is defined in `src/styles/factory-tokens.css`; if absent from the injected `_tokens.css` the tile simply falls back to square — acceptable. Verify in render-check; if missing, drop the `--radius-lg` tile.

- [ ] **Step 3: Write `cards/elevation-shadows.html`**

```html
<!-- @dsCard group="Elevation" name="Shadows + Hairlines" -->
<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><title>Elevation · mentolder</title>
<!-- tokens:start --><!-- tokens:end --><!-- card:start --><!-- card:end -->
</head><body class="ds-card"><div class="ds-wrap">
  <header class="ds-head"><span class="t-eyebrow">Elevation</span><h1>Elevation — Hairlines statt Schatten</h1>
    <p>Das System vermeidet schwere Schatten. Tiefe entsteht über 1px-Hairlines mit
       Transparenz; nur Portraits tragen einen echten Schlagschatten.</p></header>
  <div class="ds-grid cols-3" style="align-items:start">
    <div style="background:var(--ink-800);border-radius:var(--radius);box-shadow:var(--shadow-card);padding:28px;min-height:120px">
      <span class="kpill">--shadow-card</span><p class="t-small" style="margin-top:10px">Hairline + 1px-Inset. Die Standard-Card-Tiefe.</p></div>
    <div style="background:var(--ink-800);border-radius:var(--radius);box-shadow:var(--shadow-portrait);padding:28px;min-height:120px">
      <span class="kpill">--shadow-portrait</span><p class="t-small" style="margin-top:10px">Tiefer, weicher Schatten — nur für Charakter-Portraits.</p></div>
    <div style="background:var(--ink-800);border-radius:var(--radius);padding:0;min-height:120px;overflow:hidden">
      <div style="padding:18px;border-bottom:1px solid var(--line)"><span class="kpill">--line</span></div>
      <div style="padding:18px;border-bottom:1px solid var(--line-2)"><span class="kpill">--line-2</span></div>
      <div style="padding:18px"><span class="cap">Hairline-Hierarchie</span></div></div>
  </div>
</div></body></html>
```

- [ ] **Step 4: Build, validate, render-check, commit**

Run: `cd design-system && node build.mjs && node validate.mjs` → `assembled 11 card(s)`, all `✓`.

```bash
git add design-system/cards/spacing-scale.html design-system/cards/radius-scale.html design-system/cards/elevation-shadows.html
git commit -m "feat(design-system): Spacing, Radius, Elevation cards"
```

---

## Task 7: Motion card (animated)

**Files:**
- Create: `design-system/cards/motion-easing.html`

- [ ] **Step 1: Write `cards/motion-easing.html`** — CSS-keyframe demos that loop, plus the easing/duration token table.

```html
<!-- @dsCard group="Motion" name="Easing + Duration" -->
<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><title>Motion · mentolder</title>
<!-- tokens:start --><!-- tokens:end --><!-- card:start --><!-- card:end -->
<style>
  @keyframes ds-slide { 0%,12% { transform: translateX(0) } 50% { transform: translateX(220px) } 88%,100% { transform: translateX(0) } }
  .track { position:relative; height:34px; background:var(--ink-850); border-radius:var(--radius-pill); border:1px solid var(--line); }
  .dot { position:absolute; top:5px; left:5px; width:22px; height:22px; border-radius:50%; background:var(--brass); }
  .d-soft { animation: ds-slide 2.4s var(--ease-soft) infinite; }
  .d-out  { animation: ds-slide 2.4s var(--ease-out) infinite; }
</style>
</head><body class="ds-card"><div class="ds-wrap">
  <header class="ds-head"><span class="t-eyebrow">Motion</span><h1>Easing + Dauer</h1>
    <p>Weiche, ein-/ausschwingende Kurven. Eintritts-Reveals nutzen `ease-soft`; UI-Reaktionen `ease-out`.</p></header>
  <div style="display:flex;flex-direction:column;gap:14px;margin-bottom:24px">
    <div><span class="kpill">--ease-soft · cubic-bezier(.22,.61,.36,1)</span><div class="track" style="margin-top:8px"><div class="dot d-soft"></div></div></div>
    <div><span class="kpill">--ease-out · cubic-bezier(.2,.8,.2,1)</span><div class="track" style="margin-top:8px"><div class="dot d-out"></div></div></div>
  </div>
  <div style="display:flex;gap:10px;flex-wrap:wrap">
    <span class="kpill">--dur-fast · 150ms</span><span class="kpill">--dur-base · 200ms</span>
    <span class="kpill">--dur-slow · 500ms</span><span class="kpill">--dur-portrait · 800ms</span></div>
</div></body></html>
```

- [ ] **Step 2: Build, validate, render-check, commit**

Run: `cd design-system && node build.mjs && node validate.mjs` → `assembled 12 card(s)`, all `✓`. In the browser, confirm both dots animate with visibly different easing.

```bash
git add design-system/cards/motion-easing.html
git commit -m "feat(design-system): Motion card (easing + duration, animated)"
```

---

## Task 8: Iconography + Brand cards (inline SVG grids)

**Files:**
- Create: `design-system/cards/icons-sheet.html`, `brand-logo.html`

**Interfaces:** Uses the `props-grid` / `logos-grid` injection regions filled by `svgGrid()` (Task 1). The grids inline every SVG in `assets/props/` and `assets/logos/`.

- [ ] **Step 1: Write `cards/icons-sheet.html`**

```html
<!-- @dsCard group="Iconography" name="Icon Sheet" -->
<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><title>Icons · mentolder</title>
<!-- tokens:start --><!-- tokens:end --><!-- card:start --><!-- card:end -->
</head><body class="ds-card"><div class="ds-wrap">
  <header class="ds-head"><span class="t-eyebrow">Iconography</span><h1>Icon-Sheet</h1>
    <p>Die Service-Prop-Icons der Marke, brass eingefärbt auf Ink. Quelle:
       <span class="cap">website/public/brand/mentolder/props/</span></p></header>
  <div class="ds-grid cols-5"><!-- props-grid:start --><!-- props-grid:end --></div>
</div></body></html>
```

- [ ] **Step 2: Write `cards/brand-logo.html`**

```html
<!-- @dsCard group="Brand" name="Logo + Mark" -->
<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><title>Logo + Mark · mentolder</title>
<!-- tokens:start --><!-- tokens:end --><!-- card:start --><!-- card:end -->
<style>.logos .icon-cell svg { width:auto; height:48px; max-width:200px; }</style>
</head><body class="ds-card"><div class="ds-wrap">
  <header class="ds-head"><span class="t-eyebrow">Brand</span><h1>Logo + Mark</h1>
    <p>Lockup, Mark, App-Icon und der Brass-Pulse. Auf dem Ink-Grund gerendert.
       Quelle: <span class="cap">website/public/brand/mentolder/logos/</span></p></header>
  <div class="ds-grid cols-3 logos"><!-- logos-grid:start --><!-- logos-grid:end --></div>
</div></body></html>
```

- [ ] **Step 3: Build, validate, render-check, commit**

Run: `cd design-system && node build.mjs && node validate.mjs` → `assembled 14 card(s)`, all `✓`. In the browser, confirm the icon grid shows the props SVGs (brass) and the logo grid renders the lockup/mark. If a `lockup-light` SVG renders invisibly on ink, that's expected (light lockup is for light grounds) — acceptable for a contact sheet, or remove that one cell's source SVG from `assets/logos` before build if undesired.

```bash
git add design-system/cards/icons-sheet.html design-system/cards/brand-logo.html
git commit -m "feat(design-system): Iconography + Brand cards (inline SVG grids)"
```

---

## Task 9: Bundle metadata, full build, repo gate, plan frontmatter

**Files:**
- Create: `design-system/config.json`, `design-system/NOTES.md`

- [ ] **Step 1: Write `config.json`** (projectId left null until Task 10 creates the project)

```json
{
  "name": "mentolder — Brand Foundations",
  "projectId": null,
  "localDir": "design-system",
  "uploadGlobs": ["cards/**"],
  "tokenSource": "website/public/brand/mentolder/colors_and_type.css",
  "cards": [
    "colors-surfaces", "colors-text", "colors-brass", "colors-sage-semantic", "colors-paper-print",
    "type-families", "type-scale", "type-editorial",
    "spacing-scale", "radius-scale", "elevation-shadows",
    "motion-easing", "icons-sheet", "brand-logo"
  ]
}
```

- [ ] **Step 2: Write `NOTES.md`** (re-sync checklist)

```markdown
# mentolder — Brand Foundations · design-sync notes

Third design-sync target, **foundations** (not a code mirror). 14 self-contained static
HTML cards. No component-compile pipeline — cards are static; `build.mjs` only injects
the token CSS, the shared card CSS, and inline SVG grids.

## Re-build / re-sync
1. `node design-system/build.mjs`  — regenerates `_tokens.css` from the brand SSOT,
   copies SVGs into `assets/`, and re-injects every card (idempotent).
2. `node design-system/validate.mjs`  — lints `@dsCard` markers + injection regions.
3. `node --test design-system/`  — unit tests for build + validate.
4. Push: DesignSync `finalize_plan { writes:["cards/**"], localDir:"design-system" }` → `write_files`.
   Only `cards/**` is uploaded; `_tokens.css` / `_card.css` / `assets/` are local build inputs.

## Quirks
- Token DRYness is guaranteed at the **source** (`build.mjs` copies `colors_and_type.css`
  verbatim); each delivered card is self-contained (tokens inlined). After a token change,
  re-run step 1 to refresh all cards.
- `projectId` lives in `config.json`, set after the first `create_project`.
```

- [ ] **Step 3: Full clean rebuild + validate + unit tests**

Run:
```bash
cd design-system && node build.mjs && node validate.mjs && node --test .
```
Expected: `assembled 14 card(s)`, `14 card(s) OK`, all unit tests pass.

- [ ] **Step 4: Repo offline gate (sanity — our files are additive/out of its scope)**

Run: `cd /tmp/wt-mentolder-foundations-ds && task test:all`
Expected: PASS (unchanged — no manifest/website test touches our new dir).

- [ ] **Step 5: Commit the finalized bundle**

(The plan + spec were already committed/pushed in the planning phase; do not re-commit them here.)

```bash
cd /tmp/wt-mentolder-foundations-ds
git add design-system/config.json design-system/NOTES.md design-system/_tokens.css design-system/cards
git commit -m "feat(design-system): bundle metadata + NOTES; finalize foundations bundle"
```

---

## Task 10: Create the claude.ai/design project and push (main session only)

> **This task uses the DesignSync tool, authorized via `/design-login` in the main session.** It is NOT delegatable to a subagent — run it inline. No git commit except persisting `projectId`.

- [ ] **Step 1: Confirm the project doesn't already exist**

Call `DesignSync { method: "list_projects" }`. Confirm no project named `mentolder — Brand Foundations` exists. (The two existing ones are `mentolder-web`/`mentolder-website` component syncs with different ids.)

- [ ] **Step 2: Create the project**

Call `DesignSync { method: "create_project", name: "mentolder — Brand Foundations" }`. Capture the returned `projectId`.

- [ ] **Step 3: Verify it is a design-system project**

Call `DesignSync { method: "get_project", projectId: "<new id>" }`. Confirm `type: PROJECT_TYPE_DESIGN_SYSTEM` and `canEdit: true` before any write.

- [ ] **Step 4: Persist projectId**

Edit `design-system/config.json` → set `"projectId": "<new id>"`. Commit:
```bash
git add design-system/config.json
git commit -m "chore(design-system): record Brand Foundations projectId"
```

- [ ] **Step 5: Finalize the upload plan**

Call `DesignSync { method: "finalize_plan", projectId, localDir: "design-system", writes: ["cards/**"] }`. Capture `planId`. (User sees the path list in the permission prompt.)

- [ ] **Step 6: Upload the cards**

Call `DesignSync { method: "write_files", projectId, planId, files: [ {path:"cards/colors-surfaces.html", localPath:"cards/colors-surfaces.html"}, … all 14 … ] }`. Contents are read from disk — they never enter context.

- [ ] **Step 7: Verify**

Call `DesignSync { method: "list_files", projectId }`. Confirm all 14 `cards/*.html` are present. The Design System pane builds its card index automatically from the `@dsCard` markers — no `register_assets` needed.

---

## Self-Review

**1. Spec coverage:**
- 14-card inventory (Colors×5, Type×3, Spacing, Radius, Elevation, Motion, Icons, Brand) → Tasks 3–8. ✓
- Self-contained static HTML, `@dsCard` line-1 marker → card skeleton + Task 2 validator. ✓
- DRY token source from `colors_and_type.css` → Task 1 `extractTokens` (verbatim copy; supersedes the spec's regex-extractor failure mode — simpler, same DRY guarantee). ✓
- Inline tokens + inline SVGs (no relative refs) → Task 1 `assembleCard` + `svgGrid`. ✓
- Directory layout `design-system/` → File Structure + Task 9 metadata. ✓
- Push flow `create_project → finalize_plan(writes cards/**) → write_files`, projectId persisted, type-check before write → Task 10. ✓
- Verification (render check, marker lint, token-drift, `task test:all`) → per-task render checks + Task 2 + Task 9. ✓
- Error cases (project exists, type-immutable) → Task 10 Steps 1 & 3. ✓

**2. Placeholder scan:** No `TODO`/`TBD` in steps (the `ticket: TBD` frontmatter is resolved by `plan-frontmatter-hook.sh` in Task 9 Step 5 / during execute). Every code step contains complete content. ✓

**3. Type consistency:** `injectRegion`, `extractTokens`, `copyAssets`, `svgGrid`, `assembleCard`, `main`, `validateCard` are named identically in their defining task (1/2) and every consumer (3–10). Marker names (`tokens`, `card`, `props-grid`, `logos-grid`) match between card skeletons, `assembleCard`, and `validateCard`. ✓

**Refinement note (vs. spec):** the plan (a) extracts tokens by verbatim copy rather than regex (removes a failure mode, same DRY guarantee), and (b) injects a shared `_card.css` via the same marker mechanism so each card source carries only its unique body. Both preserve the spec's contract (self-contained cards, DRY against `colors_and_type.css`, only `cards/**` uploaded).
