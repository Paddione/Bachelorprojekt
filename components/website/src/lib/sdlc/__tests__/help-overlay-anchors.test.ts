import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leitstandPurposes } from '../leitstand-purpose-registry';

// E5 (T008017) — Anker-Kontrakt der purpose-Registry: jeder Registry-Schluessel
// hat einen data-purpose-id-Anker in den Komponentenquellen der Leitstand-Shell
// und jeder Anker hat einen Registry-Eintrag. Beide Richtungen muessen bestehen,
// leere Mengen failen (T002356-M1). Key-Ableitung identisch zum E3-Guard
// (tests/spec/sdlc-cockpit/leitstand-purpose-registry.bats): PascalCase→kebab-case
// des Datei-Basenamens, `leitstand-`-Praefix-Strip NUR fuer Dateien direkt unter
// components/leitstand/.

const COMPONENTS_DIR = fileURLToPath(
  new URL('../../../components/leitstand', import.meta.url),
);

function keyForFile(rel: string): string {
  const base = rel.split('/').pop()!.replace(/\.svelte$/, '');
  const kebab = base.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  return !rel.includes('/') && kebab.startsWith('leitstand-') ? kebab.slice(10) : kebab;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (ent.name.endsWith('.svelte')) acc.push(p);
  }
  return acc;
}

describe('help-overlay anchors (E5)', () => {
  const files = walk(COMPONENTS_DIR);

  it('Registry ist nicht leer (Positiv-Anker)', () => {
    expect(Object.keys(leitstandPurposes).length).toBeGreaterThan(0);
  });

  it('Komponentenquellen der Shell existieren (Positiv-Anker)', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('jeder Registry-Schluessel hat einen data-purpose-id-Anker in der Shell', () => {
    const fileForKey = new Map(
      files.map((f) => [keyForFile(relative(COMPONENTS_DIR, f)), f]),
    );
    for (const key of Object.keys(leitstandPurposes)) {
      const file = fileForKey.get(key);
      expect(file, `Registry-Key "${key}" ohne Komponentenquelle`).toBeTruthy();
      const src = readFileSync(file!, 'utf8');
      expect(
        src,
        `data-purpose-id="${key}" fehlt in ${relative(COMPONENTS_DIR, file!)}`,
      ).toContain(`data-purpose-id="${key}"`);
    }
  });

  it('jeder data-purpose-id-Anker hat einen Registry-Eintrag (beide Richtungen)', () => {
    const anchors = new Set<string>();
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/data-purpose-id="([^"]+)"/g)) anchors.add(m[1]);
    }
    expect(anchors.size).toBeGreaterThan(0);
    for (const a of anchors) {
      expect(
        leitstandPurposes,
        `data-purpose-id="${a}" ohne Registry-Eintrag`,
      ).toHaveProperty(a);
    }
  });
});
