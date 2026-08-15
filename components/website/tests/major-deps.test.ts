import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// G-DEP02: latest stable major at ticket baseline (2026-06-27, verified via ncu).
const TARGETS: Record<string, string> = {
  astro: '7.0.0',
  '@astrojs/node': '11.0.0',
  '@astrojs/react': '6.0.0',
  '@astrojs/svelte': '9.0.0',
  '@sveltejs/vite-plugin-svelte': '7.0.0',
  pino: '10.0.0',
  signature_pad: '5.0.0',
  rrweb: '2.0.1',
  'rrweb-player': '2.0.1',
};
const MAX_BEHIND = 3;

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
);
const ranges: Record<string, string> = { ...pkg.dependencies, ...pkg.devDependencies };

const core = (v: string): number[] => {
  const p = v.replace(/^[^0-9]*/, '').split('-')[0].split('.').map(Number);
  return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0];
};
const cmp = (a: number[], b: number[]): number =>
  a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const isBehind = (cur: string, target: string): boolean => {
  const diff = cmp(core(cur), core(target));
  if (diff < 0) return true;
  if (diff > 0) return false;
  return /-/.test(cur.replace(/^[^0-9]*/, '')); // same core but pre-release → behind
};

describe('G-DEP02 major-dep drift', () => {
  const behind = Object.entries(TARGETS)
    .filter(([name, target]) => ranges[name] && isBehind(ranges[name], target))
    .map(([name]) => name)
    .sort();
  it(`keeps website major-version-behind deps <= ${MAX_BEHIND}`, () => {
    expect(behind.length, `still behind: ${behind.join(', ')}`).toBeLessThanOrEqual(
      MAX_BEHIND,
    );
  });
});
