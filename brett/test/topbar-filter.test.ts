// brett/test/topbar-filter.test.ts — T000607: Figuren-Filter
import { test } from 'node:test';
import assert from 'node:assert';
import { matchesFigureFilter } from '../src/client/ui/topbar-filter';
import { updateFilterVisuals } from '../src/client/mannequin';

// ── matchesFigureFilter ──────────────────────────────────────────────────────

test('matchesFigureFilter: empty query matches everything', () => {
  assert.strictEqual(matchesFigureFilter('Anna', ''), true);
  assert.strictEqual(matchesFigureFilter('', ''), true);
  assert.strictEqual(matchesFigureFilter('Bernd', ''), true);
});

test('matchesFigureFilter: case-insensitive substring match', () => {
  assert.strictEqual(matchesFigureFilter('Anna Müller', 'anna'), true);
  assert.strictEqual(matchesFigureFilter('Anna Müller', 'ANNA'), true);
  assert.strictEqual(matchesFigureFilter('Anna Müller', 'müller'), true);
  assert.strictEqual(matchesFigureFilter('Anna Müller', 'Müller'), true);
});

test('matchesFigureFilter: no match returns false', () => {
  assert.strictEqual(matchesFigureFilter('Anna', 'Bernd'), false);
  assert.strictEqual(matchesFigureFilter('', 'x'), false);
});

test('matchesFigureFilter: partial match anywhere in label', () => {
  assert.strictEqual(matchesFigureFilter('Karl-Heinz', 'heinz'), true);
  assert.strictEqual(matchesFigureFilter('Karl-Heinz', 'karl'), true);
  assert.strictEqual(matchesFigureFilter('Karl-Heinz', '-'), true);
});

test('matchesFigureFilter: null/undefined label treated as empty string', () => {
  assert.strictEqual(matchesFigureFilter(null as any, ''), true);
  assert.strictEqual(matchesFigureFilter(undefined as any, ''), true);
  assert.strictEqual(matchesFigureFilter(null as any, 'x'), false);
});

// ── updateFilterVisuals ──────────────────────────────────────────────────────

function makeFakeFig(id: string, label: string, opacity = 1.0): any {
  const mesh = {
    isMesh: true,
    userData: {},
    material: { opacity, transparent: false, needsUpdate: false },
  };
  const ring = { isMesh: true };
  const possessionRing = { isMesh: true };
  const root = {
    traverse(cb: (o: any) => void) {
      cb(mesh);
      cb(ring);
      cb(possessionRing);
    },
  };
  return { id, label, root, ring, possessionRing };
}

test('updateFilterVisuals: empty query — all figures opacity 1', () => {
  const figs = [makeFakeFig('f1', 'Anna'), makeFakeFig('f2', 'Bernd')];
  updateFilterVisuals(figs, '');
  // Both figures should keep opacity 1.0 when no query
  let opacity0 = 1.0;
  figs[0].root.traverse((o: any) => {
    if (o.isMesh && o.material && !o.userData.isContact && o !== figs[0].ring && o !== figs[0].possessionRing) {
      opacity0 = o.material.opacity;
    }
  });
  assert.strictEqual(opacity0, 1.0, 'no query: opacity stays 1');
});

test('updateFilterVisuals: matching figure keeps opacity 1, non-matching dims to 0.15', () => {
  const figs = [makeFakeFig('f1', 'Anna'), makeFakeFig('f2', 'Bernd')];
  updateFilterVisuals(figs, 'anna');

  // Anna (f1) matches — opacity should be 1
  let annaOpacity = -1;
  figs[0].root.traverse((o: any) => {
    if (o.isMesh && o.material && !o.userData.isContact && o !== figs[0].ring && o !== figs[0].possessionRing) {
      annaOpacity = o.material.opacity;
    }
  });
  assert.strictEqual(annaOpacity, 1.0, 'matching figure: opacity 1');

  // Bernd (f2) does not match — opacity should be 0.15
  let berndOpacity = -1;
  figs[1].root.traverse((o: any) => {
    if (o.isMesh && o.material && !o.userData.isContact && o !== figs[1].ring && o !== figs[1].possessionRing) {
      berndOpacity = o.material.opacity;
    }
  });
  assert.strictEqual(berndOpacity, 0.15, 'non-matching figure: opacity 0.15');
});

test('updateFilterVisuals: clearing query restores opacity to 1', () => {
  const figs = [makeFakeFig('f1', 'Anna'), makeFakeFig('f2', 'Bernd')];
  // First dim
  updateFilterVisuals(figs, 'anna');
  // Then clear
  updateFilterVisuals(figs, '');

  let berndOpacity = -1;
  figs[1].root.traverse((o: any) => {
    if (o.isMesh && o.material && !o.userData.isContact && o !== figs[1].ring && o !== figs[1].possessionRing) {
      berndOpacity = o.material.opacity;
    }
  });
  assert.strictEqual(berndOpacity, 1.0, 'after clear: opacity restored to 1');
});

test('updateFilterVisuals: ring and possessionRing are NOT dimmed', () => {
  const fig = makeFakeFig('f1', 'Anna');
  // Give ring its own material so we can check it
  (fig.ring as any).material = { opacity: 1.0, transparent: false, needsUpdate: false };
  (fig.possessionRing as any).material = { opacity: 1.0, transparent: false, needsUpdate: false };
  updateFilterVisuals([fig], 'nomatch');
  assert.strictEqual((fig.ring as any).material.opacity, 1.0, 'ring not dimmed');
  assert.strictEqual((fig.possessionRing as any).material.opacity, 1.0, 'possessionRing not dimmed');
});

test('updateFilterVisuals: null/undefined label treated as non-matching when query present', () => {
  const fig = makeFakeFig('f1', null as any);
  updateFilterVisuals([fig], 'anna');
  let meshOpacity = -1;
  fig.root.traverse((o: any) => {
    if (o.isMesh && o.material && !o.userData.isContact && o !== fig.ring && o !== fig.possessionRing) {
      meshOpacity = o.material.opacity;
    }
  });
  assert.strictEqual(meshOpacity, 0.15, 'null label + active query → dimmed');
});
