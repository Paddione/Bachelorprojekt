// GuideMap legend tests (F1 — Verständliche Medien).
//
// The website has no @sveltejs/vite-plugin-svelte wired into vitest, so we render
// the real component the dependency-free way: compile GuideMap.svelte to SSR JS at
// test time, write it NEXT TO the source (so its relative `../../../lib/agentGuide`
// import resolves identically), and render it with svelte/server. vitest's own vite
// pipeline resolves the .ts/.json imports the compiled module pulls in.
import { describe, it, expect, afterEach } from 'vitest';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tierLegend, guideMap } from '../../../lib/agentGuide';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMPILED = join(__dirname, '.GuideMap.compiled.svelte.mjs');

async function renderGuideMap(props: Record<string, unknown>): Promise<string> {
  const source = readFileSync(join(__dirname, 'GuideMap.svelte'), 'utf8');
  const { js } = compile(source, { generate: 'server', runes: true, name: 'GuideMap' });
  writeFileSync(COMPILED, js.code);
  const mod = await import(/* @vite-ignore */ COMPILED);
  return render(mod.default, { props }).body;
}

afterEach(() => {
  try { rmSync(COMPILED, { force: true }); } catch { /* ignore */ }
});

describe('tierLegend', () => {
  it('maps every danger tier to an emoji, label and meaning', () => {
    const rows = tierLegend();
    expect(rows.length).toBe(4);
    const ids = rows.map((r) => r.id);
    expect(ids).toEqual(['safe', 'caution', 'assisted', 'forbidden']);
    for (const row of rows) {
      expect(row.emoji).toBeTruthy();
      expect(row.label).toBeTruthy();
      expect(row.meaning).toBeTruthy();
      expect(row.color).toMatch(/^#/);
      // the label must not still carry a leading tier emoji (deduped vs the dot)
      expect(row.label.startsWith(row.emoji)).toBe(false);
    }
  });

  it('uses the four traffic-light tier emojis', () => {
    const emojis = tierLegend().map((r) => r.emoji);
    expect(emojis).toEqual(['🟢', '🟡', '🟠', '🔴']);
  });
});

describe('GuideMap legend rendering', () => {
  it('renders a visible, collapsible legend with each tier meaning', async () => {
    const body = await renderGuideMap({ map: guideMap, onSelect: () => {} });
    // collapsible container present
    expect(body).toContain('class="ag-legend');
    expect(body).toMatch(/<details[^>]*class="ag-legend/);
    expect(body).toContain('<summary');
    // legend summary is the human-readable affordance
    expect(body).toContain('Was bedeuten die Farben?');
    // every tier meaning is rendered (comprehensible mapping emoji/colour → Bedeutung)
    for (const row of tierLegend()) {
      expect(body).toContain(row.meaning);
    }
    // screen-reader description present
    expect(body).toContain('ag-sr');
  });

  it('keeps the legend collapsible via <details>/<summary> (toggle affordance)', async () => {
    const body = await renderGuideMap({ map: guideMap, onSelect: () => {} });
    // a native <details> is keyboard- and screenreader-toggleable without JS;
    // assert the summary sits inside the details element.
    const detailsIdx = body.indexOf('<details');
    const summaryIdx = body.indexOf('<summary');
    const closeIdx = body.indexOf('</details>');
    expect(detailsIdx).toBeGreaterThanOrEqual(0);
    expect(summaryIdx).toBeGreaterThan(detailsIdx);
    expect(closeIdx).toBeGreaterThan(summaryIdx);
  });
});
