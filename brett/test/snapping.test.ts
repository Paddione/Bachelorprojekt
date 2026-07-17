// brett/test/snapping.test.ts — E7 (T001931)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snap, setMagnet, isMagnet } from '../src/client/snapping';

test('ohne Magnet bleibt die Position unverändert (kein Guide)', () => {
  setMagnet(false);
  assert.strictEqual(isMagnet(), false);
  const r = snap({ x: 0.73, z: 1.19 }, [{ x: 0.72, z: 5 }]);
  assert.deepStrictEqual(r, { x: 0.73, z: 1.19, guide: null });
});

test('Magnet rundet auf das 0.5-Raster', () => {
  setMagnet(true);
  const r = snap({ x: 0.73, z: 1.19 }, []);
  assert.strictEqual(r.x, 0.5, 'x auf 0.5 gerundet');
  assert.strictEqual(r.z, 1.0, 'z auf 1.0 gerundet');
  assert.strictEqual(r.guide, null, 'kein Guide ohne nahe Achse');
});

test('Magnet rastet auf die X-Achse einer nahen Figur ein und liefert Guide-Endpunkte', () => {
  setMagnet(true);
  const r = snap({ x: 0.71, z: 3.0 }, [{ x: 0.6, z: 8 }]);
  assert.strictEqual(r.x, 0.6, 'x auf Achse der nahen Figur eingerastet');
  assert.ok(r.guide, 'Guide bei Achsen-Einrasten vorhanden');
  assert.strictEqual(r.guide!.x1, 0.6);
  assert.strictEqual(r.guide!.x2, 0.6, 'Guide verläuft entlang der X-Achse');
});

test('Guide nur innerhalb des Schwellwerts (0.2)', () => {
  setMagnet(true);
  const r = snap({ x: 5.0, z: 5.0 }, [{ x: 5.5, z: 8 }]); // |Δx|=0.5 > 0.2
  assert.strictEqual(r.guide, null, 'keine Hilfslinie außerhalb des Schwellwerts');
  setMagnet(false); // Zustand für andere Suites zurücksetzen
});
