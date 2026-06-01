---
title: Lernpfad-Asset-Layer — Phase 1 (Fundament) Implementation Plan
ticket_id: null
domains: [website, infra, db, test, security]
status: active
pr_number: null
---

# Lernpfad-Asset-Layer — Phase 1 (Fundament) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundational, build-time art-asset system for the learning path — a license-tracked SSOT manifest, a validating generator, a typed accessor, and a single `<LearningAsset>` component (Neon-Glass/Plasma style, active/calm tone-dial, brand-tokenized) — wired into the Agent-Anleitung, with a CI staleness gate.

**Architecture:** A hand-edited SSOT manifest (`learning-assets.manifest.json`) is validated by a dependency-free `.mjs` generator that inlines sanitized SVG markup into a committed `learning-assets.generated.json` (mirroring the existing `agent-guide.generated.json` pattern). A typed helper (`learning-assets.ts`) exposes `getAsset`/`queryAssets`; one `<LearningAsset>` Svelte component renders inline SVG colored by the brand accent via `currentColor`. CI re-runs the generator and fails on drift, exactly like the existing inventory/route-manifest gates.

**Tech Stack:** Node 22 (`node --test`), Vitest 4 + Svelte 5 (runes; compile-to-SSR test pattern), Astro 6, plain ESM `.mjs` build scripts, go-task, JSON.

**Scope note:** This is Phase 1 only (static visuals + system). Phase 2 (Audio: SFX/Piper-Narration/Ambient) and Phase 3 (Content-Authoring along real guide items, `guideItem` mapping) are follow-up plans. All Phase-1 starter assets are in-house CC0 (no external sourcing yet); the verified shopping list feeds Phase 3. See spec: `docs/superpowers/specs/2026-06-01-learning-path-assets-design.md`.

---

### Task 1: Starter Plasma SVG assets + SSOT manifest + JSON schema

**Files:**
- Create: `website/public/learning-assets/diagram/feedback-loop.active.svg`
- Create: `website/public/learning-assets/diagram/goal-milestone.active.svg`
- Create: `website/public/learning-assets/icon/tool-action.active.svg`
- Create: `website/public/learning-assets/illustration/reflection.calm.svg`
- Create: `website/src/data/learning-assets.manifest.json`
- Create: `website/src/data/learning-assets.schema.json`

This task only creates data/assets (no logic → no unit test; validation arrives in Task 2). All SVGs use `currentColor` so the component's color token drives brand recolor; filter `id`s are unique per file to avoid DOM collisions when multiple are inlined.

- [ ] **Step 1: Create the four SVG assets**

`website/public/learning-assets/diagram/feedback-loop.active.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 96" role="img">
  <defs><filter id="la-glow-fb" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
  <g filter="url(#la-glow-fb)" stroke="currentColor" stroke-width="2" fill="none"><path d="M55 50 H120"/><path d="M120 50 Q165 30 175 50 Q165 70 120 50"/></g>
  <g filter="url(#la-glow-fb)" fill="currentColor"><circle cx="55" cy="50" r="6"/><circle cx="120" cy="50" r="7"/></g>
</svg>
```
`website/public/learning-assets/diagram/goal-milestone.active.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 96" role="img">
  <defs><filter id="la-glow-goal" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
  <g filter="url(#la-glow-goal)" stroke="currentColor" stroke-width="2" fill="none"><circle cx="120" cy="50" r="14"/></g>
  <g filter="url(#la-glow-goal)" fill="currentColor"><circle cx="120" cy="50" r="4"/><circle cx="150" cy="28" r="3"/><circle cx="160" cy="42" r="2"/><circle cx="146" cy="20" r="2"/></g>
</svg>
```
`website/public/learning-assets/icon/tool-action.active.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img">
  <path d="M14.5 5.5a3.5 3.5 0 0 0-4.6 4.6l-6 6 2 2 6-6a3.5 3.5 0 0 0 4.6-4.6l-2.2 2.2-2-2z"/>
</svg>
```
`website/public/learning-assets/illustration/reflection.calm.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 96" role="img">
  <defs><filter id="la-glow-refl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
  <g stroke="currentColor" stroke-width="0.8" opacity="0.35"><line x1="120" y1="50" x2="70" y2="32"/><line x1="120" y1="50" x2="180" y2="36"/><line x1="120" y1="50" x2="150" y2="76"/></g>
  <g filter="url(#la-glow-refl)" fill="currentColor"><circle cx="120" cy="50" r="5" opacity="0.9"/><circle cx="70" cy="32" r="3.5" opacity="0.7"/><circle cx="180" cy="36" r="3.5" opacity="0.7"/><circle cx="150" cy="76" r="3" opacity="0.7"/></g>
</svg>
```

- [ ] **Step 2: Create the SSOT manifest**

`website/src/data/learning-assets.manifest.json`:
```json
{
  "$schema": "./learning-assets.schema.json",
  "version": 1,
  "assets": [
    {
      "id": "feedback-loop.active", "type": "diagram", "register": "technical", "tone": "active",
      "concept": ["feedback-loop", "iteration", "node-graph"],
      "formats": { "svg": "/learning-assets/diagram/feedback-loop.active.svg" },
      "brandable": { "tokens": ["--la-accent"] },
      "a11y": { "alt": "Zwei Knoten, verbunden in einer leuchtenden Rückkopplungsschleife" },
      "provenance": { "source": "generated:in-house", "license": "CC0-1.0", "attribution": null }
    },
    {
      "id": "goal-milestone.active", "type": "diagram", "register": "technical", "tone": "active",
      "concept": ["goal", "milestone"],
      "formats": { "svg": "/learning-assets/diagram/goal-milestone.active.svg" },
      "brandable": { "tokens": ["--la-accent"] },
      "a11y": { "alt": "Ein leuchtender Zielknoten mit aufsteigenden Funken" },
      "provenance": { "source": "generated:in-house", "license": "CC0-1.0", "attribution": null }
    },
    {
      "id": "tool-action.active", "type": "icon", "register": "technical", "tone": "active",
      "concept": ["tool", "action"],
      "formats": { "svg": "/learning-assets/icon/tool-action.active.svg" },
      "brandable": { "tokens": ["--la-accent"] },
      "a11y": { "alt": "Werkzeug-Symbol" },
      "provenance": { "source": "generated:in-house", "license": "CC0-1.0", "attribution": null }
    },
    {
      "id": "reflection.calm", "type": "illustration", "register": "coaching", "tone": "calm",
      "concept": ["reflection", "grounding", "pause"],
      "formats": { "svg": "/learning-assets/illustration/reflection.calm.svg" },
      "brandable": { "tokens": ["--la-accent"] },
      "a11y": { "alt": "Eine ruhige Konstellation aus sanft leuchtenden Punkten" },
      "provenance": { "source": "generated:in-house", "license": "CC0-1.0", "attribution": null }
    }
  ]
}
```

- [ ] **Step 3: Create the JSON schema (editor/docs aid; runtime validation is hand-rolled in Task 2)**

`website/src/data/learning-assets.schema.json`:
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Learning Assets Manifest",
  "type": "object",
  "required": ["version", "assets"],
  "properties": {
    "version": { "type": "integer" },
    "assets": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "type", "register", "tone", "concept", "formats", "a11y", "provenance"],
        "properties": {
          "id": { "type": "string", "pattern": "^[a-z0-9-]+\\.(active|calm)$" },
          "type": { "enum": ["illustration", "icon", "diagram", "motion", "sfx", "voice", "ambient"] },
          "register": { "enum": ["technical", "coaching", "neutral"] },
          "tone": { "enum": ["active", "calm"] },
          "concept": { "type": "array", "items": { "type": "string" }, "minItems": 1 },
          "guideItem": { "type": "string" },
          "formats": { "type": "object", "minProperties": 1 },
          "brandable": { "oneOf": [ { "const": false }, { "type": "object", "required": ["tokens"] } ] },
          "a11y": { "type": "object" },
          "provenance": { "type": "object", "required": ["source", "license"] },
          "reducedMotion": { "type": ["string", "null"] }
        }
      }
    }
  }
}
```

- [ ] **Step 4: Commit**
```bash
cd /tmp/wt-learning-path-tracking
git add website/public/learning-assets website/src/data/learning-assets.manifest.json website/src/data/learning-assets.schema.json
git commit -m "feat(learning-assets): starter Plasma SVG set + SSOT manifest + schema"
```

---

### Task 2: Validating generator (`build-learning-assets.mjs`) — TDD

**Files:**
- Create: `scripts/build-learning-assets.mjs`
- Test: `scripts/build-learning-assets.test.mjs`

The generator validates the manifest (required fields, enums, **`provenance.license` mandatory**, referenced files exist) and inlines sanitized SVG markup into the generated JSON. `validateManifest` takes an injected `exists` function so it is testable without touching disk.

- [ ] **Step 1: Write the failing test**

`scripts/build-learning-assets.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateManifest, sanitizeSvg } from './build-learning-assets.mjs';

const ok = {
  id: 'a.active', type: 'icon', register: 'technical', tone: 'active', concept: ['x'],
  formats: { svg: '/learning-assets/icon/a.svg' },
  brandable: { tokens: ['--la-accent'] }, a11y: { alt: 'A' },
  provenance: { source: 'generated:in-house', license: 'CC0-1.0', attribution: null },
};

test('accepts a valid entry', () => {
  const r = validateManifest({ assets: [ok] }, { exists: () => true });
  assert.equal(r.length, 1);
});
test('rejects a missing license', () => {
  const bad = { ...ok, provenance: { source: 'x', license: '', attribution: null } };
  assert.throws(() => validateManifest({ assets: [bad] }, { exists: () => true }), /provenance\.license required/);
});
test('rejects an invalid type', () => {
  const bad = { ...ok, type: 'gif' };
  assert.throws(() => validateManifest({ assets: [bad] }, { exists: () => true }), /invalid type/);
});
test('rejects a missing asset file', () => {
  assert.throws(() => validateManifest({ assets: [ok] }, { exists: () => false }), /file not found/);
});
test('rejects a duplicate id', () => {
  assert.throws(() => validateManifest({ assets: [ok, ok] }, { exists: () => true }), /duplicate id/);
});
test('sanitizeSvg strips <script> and on* handlers', () => {
  const clean = sanitizeSvg('<svg><script>alert(1)</script><circle onclick="x()" cx="1"/></svg>');
  assert.ok(!/script/i.test(clean));
  assert.ok(!/onclick/i.test(clean));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /tmp/wt-learning-path-tracking && node --test scripts/build-learning-assets.test.mjs`
Expected: FAIL — `Cannot find module './build-learning-assets.mjs'`.

- [ ] **Step 3: Write the generator**

`scripts/build-learning-assets.mjs`:
```js
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const TYPES = ['illustration', 'icon', 'diagram', 'motion', 'sfx', 'voice', 'ambient'];
const REGISTERS = ['technical', 'coaching', 'neutral'];
const TONES = ['active', 'calm'];

export function validateManifest(manifest, { exists }) {
  const errs = [];
  const assets = manifest.assets ?? [];
  const seen = new Set();
  for (const [i, a] of assets.entries()) {
    const at = `assets[${i}]${a.id ? ` (${a.id})` : ''}`;
    if (!a.id) errs.push(`${at}: missing id`);
    else if (seen.has(a.id)) errs.push(`${at}: duplicate id`);
    else seen.add(a.id);
    if (!TYPES.includes(a.type)) errs.push(`${at}: invalid type ${JSON.stringify(a.type)}`);
    if (!REGISTERS.includes(a.register)) errs.push(`${at}: invalid register ${JSON.stringify(a.register)}`);
    if (!TONES.includes(a.tone)) errs.push(`${at}: invalid tone ${JSON.stringify(a.tone)}`);
    if (!Array.isArray(a.concept) || a.concept.length === 0) errs.push(`${at}: concept[] required`);
    if (!a.provenance || !a.provenance.license) errs.push(`${at}: provenance.license required`);
    if (!a.formats || Object.keys(a.formats).length === 0) errs.push(`${at}: formats required`);
    for (const [fmt, rel] of Object.entries(a.formats ?? {})) {
      if (!exists(rel)) errs.push(`${at}: file not found for ${fmt}: ${rel}`);
    }
    if (!a.a11y || (!a.a11y.alt && !a.a11y.transcript && !a.a11y.caption)) {
      errs.push(`${at}: a11y needs alt, caption or transcript`);
    }
  }
  if (errs.length) throw new Error('learning-assets manifest invalid:\n  - ' + errs.join('\n  - '));
  return assets;
}

export function sanitizeSvg(svg) {
  return svg
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .trim();
}

export function buildGenerated(manifest, { exists, readSvg }) {
  const assets = validateManifest(manifest, { exists }).map((a) => {
    const out = { ...a };
    if (a.formats.svg) out.formats = { ...a.formats, svgInline: sanitizeSvg(readSvg(a.formats.svg)) };
    return out;
  });
  return {
    $schema: 'learning-assets.generated/v1',
    generatedFrom: 'website/src/data/learning-assets.manifest.json',
    assets,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const repoRoot = process.cwd();
  const publicDir = join(repoRoot, 'website', 'public');
  const rel2abs = (rel) => join(publicDir, rel.replace(/^\//, ''));
  const manifest = JSON.parse(readFileSync(join(repoRoot, 'website', 'src', 'data', 'learning-assets.manifest.json'), 'utf8'));
  const generated = buildGenerated(manifest, { exists: (rel) => existsSync(rel2abs(rel)), readSvg: (rel) => readFileSync(rel2abs(rel), 'utf8') });

  const target = join(repoRoot, 'website', 'src', 'lib', 'learning-assets.generated.json');
  writeFileSync(target, JSON.stringify(generated, null, 2) + '\n');

  const lines = ['# Third-Party Learning Assets', '', '> Auto-generiert aus learning-assets.manifest.json — nicht von Hand editieren.', '', '| ID | Quelle | Lizenz | Attribution |', '|---|---|---|---|'];
  for (const a of generated.assets) lines.push(`| ${a.id} | ${a.provenance.source} | ${a.provenance.license} | ${a.provenance.attribution ?? '—'} |`);
  writeFileSync(join(publicDir, 'learning-assets', 'THIRD-PARTY-ASSETS.md'), lines.join('\n') + '\n');

  console.log(`✓ wrote ${target} (${generated.assets.length} assets)`);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /tmp/wt-learning-path-tracking && node --test scripts/build-learning-assets.test.mjs`
Expected: PASS — 6 tests passing.

- [ ] **Step 5: Commit**
```bash
git add scripts/build-learning-assets.mjs scripts/build-learning-assets.test.mjs
git commit -m "feat(learning-assets): validating SVG-inlining generator + tests"
```

---

### Task 3: Generate the committed `learning-assets.generated.json`

**Files:**
- Create (generated): `website/src/lib/learning-assets.generated.json`
- Create (generated): `website/public/learning-assets/THIRD-PARTY-ASSETS.md`

- [ ] **Step 1: Run the generator**

Run: `cd /tmp/wt-learning-path-tracking && node scripts/build-learning-assets.mjs`
Expected: `✓ wrote …/learning-assets.generated.json (4 assets)`

- [ ] **Step 2: Verify the output contains inlined SVG**

Run: `node -e "const d=require('./website/src/lib/learning-assets.generated.json'); console.log(d.assets.length, !!d.assets[0].formats.svgInline)"`
Expected: `4 true`

- [ ] **Step 3: Commit**
```bash
git add website/src/lib/learning-assets.generated.json website/public/learning-assets/THIRD-PARTY-ASSETS.md
git commit -m "chore(learning-assets): generate manifest artifact + attribution doc"
```

---

### Task 4: Typed accessor `learning-assets.ts` — TDD

**Files:**
- Create: `website/src/lib/learning-assets.ts`
- Test: `website/src/lib/learning-assets.test.ts`

- [ ] **Step 1: Write the failing test**

`website/src/lib/learning-assets.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { getAsset, queryAssets } from './learning-assets';

describe('queryAssets', () => {
  it('filters by register and tone', () => {
    const r = queryAssets({ register: 'technical', tone: 'active' });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((a) => a.register === 'technical' && a.tone === 'active')).toBe(true);
  });
  it('matches concept membership', () => {
    expect(queryAssets({ concept: 'feedback-loop' }).some((a) => a.id === 'feedback-loop.active')).toBe(true);
  });
});

describe('getAsset', () => {
  it('resolves by id', () => {
    expect(getAsset('feedback-loop.active')?.id).toBe('feedback-loop.active');
  });
  it('returns null for an unknown id', () => {
    expect(getAsset('nope.nope')).toBeNull();
  });
  it('returns the first match for a query', () => {
    expect(getAsset({ concept: 'reflection', register: 'coaching' })?.tone).toBe('calm');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /tmp/wt-learning-path-tracking/website && npm run test:unit -- src/lib/learning-assets.test.ts`
Expected: FAIL — cannot resolve `./learning-assets`.

- [ ] **Step 3: Write the accessor**

`website/src/lib/learning-assets.ts`:
```ts
import data from './learning-assets.generated.json';

export type AssetType = 'illustration' | 'icon' | 'diagram' | 'motion' | 'sfx' | 'voice' | 'ambient';
export type Register = 'technical' | 'coaching' | 'neutral';
export type Tone = 'active' | 'calm';

export interface AssetEntry {
  id: string;
  type: AssetType;
  register: Register;
  tone: Tone;
  concept: string[];
  guideItem?: string;
  formats: { svg?: string; svgInline?: string; webp?: string; lottie?: string; ogg?: string; vtt?: string };
  brandable: false | { tokens: string[] };
  a11y: { alt?: string; caption?: string; transcript?: string };
  provenance: { source: string; license: string; attribution: string | null };
  reducedMotion?: string | null;
}

export interface AssetQuery {
  type?: AssetType;
  register?: Register;
  tone?: Tone;
  concept?: string;
  guideItem?: string;
}

export const assets: AssetEntry[] = (data.assets ?? []) as AssetEntry[];
const byId = new Map(assets.map((a) => [a.id, a]));

export function queryAssets(q: AssetQuery): AssetEntry[] {
  return assets.filter(
    (a) =>
      (q.type ? a.type === q.type : true) &&
      (q.register ? a.register === q.register : true) &&
      (q.tone ? a.tone === q.tone : true) &&
      (q.guideItem ? a.guideItem === q.guideItem : true) &&
      (q.concept ? a.concept.includes(q.concept) : true),
  );
}

export function getAsset(sel: string | AssetQuery): AssetEntry | null {
  if (typeof sel === 'string') return byId.get(sel) ?? null;
  return queryAssets(sel)[0] ?? null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /tmp/wt-learning-path-tracking/website && npm run test:unit -- src/lib/learning-assets.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**
```bash
cd /tmp/wt-learning-path-tracking
git add website/src/lib/learning-assets.ts website/src/lib/learning-assets.test.ts
git commit -m "feat(learning-assets): typed getAsset/queryAssets accessor + tests"
```

---

### Task 5: `<LearningAsset>` component — TDD (compile-to-SSR pattern)

**Files:**
- Create: `website/src/components/learning/LearningAsset.svelte`
- Test: `website/src/components/learning/LearningAsset.test.ts`

The test mirrors `GuideMap.test.ts`: compile the `.svelte` to SSR JS, write it next to the source so its `../../lib/learning-assets` import resolves, and render with `svelte/server`. `LearningAsset` imports only `.ts`/`.json`, so no `vite-plugin-svelte` is needed.

- [ ] **Step 1: Write the failing test**

`website/src/components/learning/LearningAsset.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMPILED = join(__dirname, '.LearningAsset.compiled.svelte.mjs');

async function renderAsset(props: Record<string, unknown>): Promise<string> {
  const source = readFileSync(join(__dirname, 'LearningAsset.svelte'), 'utf8');
  const { js } = compile(source, { generate: 'server', runes: true, name: 'LearningAsset' });
  writeFileSync(COMPILED, js.code);
  const mod = await import(/* @vite-ignore */ COMPILED);
  return render(mod.default, { props }).body;
}

afterEach(() => {
  try { rmSync(COMPILED, { force: true }); } catch { /* ignore */ }
});

describe('LearningAsset', () => {
  it('renders inline SVG resolved by id, with an aria-label from alt', async () => {
    const html = await renderAsset({ id: 'feedback-loop.active' });
    expect(html).toContain('<svg');
    expect(html).toContain('Rückkopplungsschleife');
    expect(html).toContain('data-asset-id="feedback-loop.active"');
  });
  it('resolves the goal asset by concept/register/tone (the props GuideCard passes)', async () => {
    const html = await renderAsset({ concept: 'goal', register: 'technical', tone: 'active' });
    expect(html).toContain('data-asset-id="goal-milestone.active"');
  });
  it('renders nothing for an unknown selector', async () => {
    const html = await renderAsset({ id: 'does-not-exist' });
    expect(html).not.toContain('<svg');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /tmp/wt-learning-path-tracking/website && npm run test:unit -- src/components/learning/LearningAsset.test.ts`
Expected: FAIL — `LearningAsset.svelte` does not exist.

- [ ] **Step 3: Write the component**

`website/src/components/learning/LearningAsset.svelte`:
```svelte
<script lang="ts">
  import { getAsset, type Register, type Tone } from '../../lib/learning-assets';

  let {
    id,
    guideItem,
    concept,
    register,
    tone = 'active',
    class: klass = '',
  }: {
    id?: string;
    guideItem?: string;
    concept?: string;
    register?: Register;
    tone?: Tone;
    class?: string;
  } = $props();

  // Resolution priority: explicit id > guideItem (with concept fallback) > concept query.
  const entry = $derived(
    id
      ? getAsset(id)
      : guideItem
        ? getAsset({ guideItem }) ?? (concept ? getAsset({ concept, register, tone }) : null)
        : concept
          ? getAsset({ concept, register, tone })
          : null,
  );
</script>

{#if entry && entry.formats.svgInline}
  <span
    class={`learning-asset la-${entry.tone} ${klass}`}
    role="img"
    aria-label={entry.a11y.alt ?? undefined}
    aria-hidden={entry.a11y.alt ? undefined : 'true'}
    data-asset-id={entry.id}
  >
    {@html entry.formats.svgInline}
  </span>
{/if}

<style>
  .learning-asset {
    display: inline-flex;
    /* brand-tokenized: Kore lime (--copper) / mentolder brass (--brass); falls back safely */
    color: var(--la-accent, var(--copper, var(--brass, #c8f76a)));
  }
  .learning-asset :global(svg) { width: 100%; height: auto; }
  .la-calm { opacity: 0.85; }
</style>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /tmp/wt-learning-path-tracking/website && npm run test:unit -- src/components/learning/LearningAsset.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**
```bash
cd /tmp/wt-learning-path-tracking
git add website/src/components/learning/LearningAsset.svelte website/src/components/learning/LearningAsset.test.ts
git commit -m "feat(learning-assets): <LearningAsset> component (inline SVG, brand-tokenized) + SSR tests"
```

---

### Task 6: Wire `<LearningAsset>` into the Agent-Anleitung card

**Files:**
- Modify: `website/src/components/assistant/agent-guide/GuideCard.svelte`

The card-head shows a small decorative asset chosen by item kind: goals → `goal` concept, tools → `tool` concept (both `technical`/`active`). The mapping logic is already covered by Task 5's concept-resolution test; here we wire it and confirm the whole suite + build stay green.

- [ ] **Step 1: Add the import**

In `website/src/components/assistant/agent-guide/GuideCard.svelte`, after the existing `import GlossaryTerm from './GlossaryTerm.svelte';` line, add:
```svelte
  import LearningAsset from '../../learning/LearningAsset.svelte';
```

- [ ] **Step 2: Render the asset in the card head**

In the same file, immediately after the line `<span class="ag-dot" aria-hidden="true">{tierEmoji(entry.danger)}</span>`, add:
```svelte
    <LearningAsset
      concept={entry.kind === 'goal' ? 'goal' : 'tool'}
      register="technical"
      tone="active"
      class="ag-card-art"
    />
```

- [ ] **Step 3: Add minimal styling for the inline art**

At the end of the `<style>` block of `GuideCard.svelte`, add:
```css
  .ag-card-art { width: 1.5rem; flex: 0 0 auto; }
```

- [ ] **Step 4: Run the full website unit suite + a build typecheck**

Run: `cd /tmp/wt-learning-path-tracking/website && npm run test:unit && npx astro check --minimumSeverity error`
Expected: all tests PASS; `astro check` reports 0 errors (the component compiles and types resolve).

- [ ] **Step 5: Commit**
```bash
cd /tmp/wt-learning-path-tracking
git add website/src/components/assistant/agent-guide/GuideCard.svelte
git commit -m "feat(learning-assets): illustrate Agent-Anleitung cards with <LearningAsset>"
```

---

### Task 7: Taskfile task + CI staleness gate

**Files:**
- Modify: `Taskfile.yml` (near the `routes:manifest` task, ~line 409)
- Modify: `.github/workflows/ci.yml` (after the `agent-guide.generated.json` verification step, ~line 100)

- [ ] **Step 1: Add the go-task wrapper**

In `Taskfile.yml`, add this task adjacent to `routes:manifest`:
```yaml
  assets:learning:
    desc: Regenerate website/src/lib/learning-assets.generated.json from the SSOT manifest
    cmds:
      - node scripts/build-learning-assets.mjs
```

- [ ] **Step 2: Add the CI gate**

In `.github/workflows/ci.yml`, after the existing block that verifies `website/src/lib/agent-guide.generated.json`, add a new step:
```yaml
      - name: Verify learning-assets generated artifact is up to date
        run: |
          node --test scripts/build-learning-assets.test.mjs
          task assets:learning
          if ! git diff --exit-code website/src/lib/learning-assets.generated.json website/public/learning-assets/THIRD-PARTY-ASSETS.md; then
            echo "ERROR: learning-assets artifact is stale — run 'task assets:learning' locally and commit"
            exit 1
          fi
```

- [ ] **Step 3: Verify the gate passes locally (no drift)**

Run: `cd /tmp/wt-learning-path-tracking && node --test scripts/build-learning-assets.test.mjs && task assets:learning && git diff --exit-code website/src/lib/learning-assets.generated.json website/public/learning-assets/THIRD-PARTY-ASSETS.md && echo "GATE OK"`
Expected: tests pass, generator runs, **no diff**, prints `GATE OK`.

- [ ] **Step 4: Commit**
```bash
git add Taskfile.yml .github/workflows/ci.yml
git commit -m "ci(learning-assets): regenerate-and-diff gate + task assets:learning"
```

---

### Task 8: Regenerate test inventory + final verification

**Files:**
- Modify (generated): `website/src/data/test-inventory.json` (only if it changes)

- [ ] **Step 1: Regenerate the test inventory**

Run: `cd /tmp/wt-learning-path-tracking && task test:inventory`
Then: `git diff --stat website/src/data/test-inventory.json`
Expected: either no change, or an updated mapping reflecting the new test files.

- [ ] **Step 2: Run the offline test suite the way CI does**

Run: `cd /tmp/wt-learning-path-tracking && task test:all`
Expected: PASS (BATS + kustomize structure + Taskfile dry-run; unaffected by these changes).

- [ ] **Step 3: Run the website unit suite once more**

Run: `cd /tmp/wt-learning-path-tracking/website && npm run test:unit`
Expected: all PASS, including `learning-assets.test.ts` and `LearningAsset.test.ts`.

- [ ] **Step 4: Commit any inventory change**
```bash
cd /tmp/wt-learning-path-tracking
git add website/src/data/test-inventory.json
git commit -m "chore(learning-assets): refresh test inventory" || echo "no inventory change"
```

---

## Self-Review

**Spec coverage (Phase 1 portions of `2026-06-01-learning-path-assets-design.md`):**
- §3 Verzeichnis-Layout → Tasks 1, 3 (public/learning-assets/*, src/data manifest+schema, src/lib generated+helper). ✓
- §4 Manifest-Schema → Tasks 1 (schema.json + manifest) & 2 (runtime validation). ✓
- §5 Accessor + Komponente → Tasks 4 (`getAsset`/`queryAssets`) & 5 (`<LearningAsset>`, resolution priority, brand-tokenization, alt/aria). ✓
- §6 Plasma-Stil (statisch, Tone-Dial `active`/`calm`) → starter assets + `la-active`/`la-calm` classes. ✓ (motion/reduced-motion animation deferred to P2; component already no-ops non-SVG types.)
- §8 Produktion/CI/Tests → Tasks 2 (license-mandatory validation), 7 (CI gate), 8 (test-inventory); `THIRD-PARTY-ASSETS.md` → Task 2/3. ✓
- §9 DSGVO (lokal vendored, kein CDN) → all assets under `public/`, inlined at build. ✓
- §10 Phasen: this plan = P1; P2 (audio) & P3 (content+guideItem) explicitly out of scope. ✓

**Placeholder scan:** No TBD/TODO; every code step contains complete code; every run step has an exact command + expected output. ✓

**Type consistency:** `AssetEntry`/`AssetQuery`/`getAsset`/`queryAssets` defined in Task 4 are used identically in Task 5; `formats.svgInline` is produced in Task 2 and consumed in Task 5; manifest ids (`feedback-loop.active`, `goal-milestone.active`, `tool-action.active`, `reflection.calm`) are consistent across Tasks 1, 4, 5, 6. ✓

**Out of scope for P1 (named so the executor does not improvise):** audio subsystem, Lottie/motion rendering, `prefers-reduced-motion` animation handling, `guideItem` mapping to real guide ids, external-asset sourcing, `/portal/loslernen` page, brand `--la-accent` token definitions (component falls back to `--copper`/`--brass`/literal).
