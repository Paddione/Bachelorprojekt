import { describe, it, expect } from 'vitest';
import { autoSlots, maxFrontierWidth, parseManifestPartials } from './plan-slots';

const MANIFEST = `## Partials
| id | plan | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | p1.md | impl | a.ts | |
| p2 | p2.md | impl | b.ts | |
| p3 | p3.md | impl | c.ts | |
| p4 | p4.md | impl | d.ts | p1, p2 |
| p5 | p5.md | tests | e.ts | p4 |
`;

describe('parseManifestPartials', () => {
  it('liest ids und depends_on', () => {
    const rows = parseManifestPartials(MANIFEST);
    expect(rows.map((r) => r.id)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    expect(rows[3].dependsOn).toEqual(['p1', 'p2']);
  });

  it('wirft ohne Partials-Sektion', () => {
    expect(() => parseManifestPartials('# leer\n')).toThrow(/## Partials/);
  });
});

describe('maxFrontierWidth', () => {
  it('zählt die breiteste Front (p1–p3 parallel)', () => {
    expect(maxFrontierWidth(parseManifestPartials(MANIFEST))).toBe(3);
  });

  it('wirft bei Zyklen', () => {
    const cyclic = parseManifestPartials(
      '## Partials\n| id | plan | role | target_files | depends_on |\n| c1 | c1.md | impl | a.ts | c2 |\n| c2 | c2.md | impl | b.ts | c1 |\n',
    );
    expect(() => maxFrontierWidth(cyclic)).toThrow(/cycle/);
  });
});

describe('autoSlots', () => {
  it('füllt Direkt zuerst, Cloud bleibt bei schmalen Plänen aus', () => {
    expect(autoSlots(parseManifestPartials(MANIFEST))).toEqual({ width: 3, slotsDirect: 3, slotsCloud: 0 });
  });

  it('deckelt Direkt bei 3 und gibt den Rest an Cloud (Cap 3)', () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({ id: `w${i}`, dependsOn: [] as string[] }));
    expect(autoSlots(rows)).toEqual({ width: 25, slotsDirect: 3, slotsCloud: 3 });
  });
});
