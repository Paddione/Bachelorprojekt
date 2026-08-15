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
