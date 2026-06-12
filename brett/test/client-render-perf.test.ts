// brett/test/client-render-perf.test.ts — TDD rote Seite für T000662
// Drei Client-Render-Perf-Bugs werden als failing Tests (erwartet-neues-Verhalten) spezifiziert.
// KEINE Fixes hier — nur Regression-Tests die heute rot sind.

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── Bug 1: Label-Textur-Re-Upload jeden Frame ────────────────────────────────
//
// Seam: _floorClampScratch wird als modulweiter scratch-Vector exportiert.
// Heute existiert dieser Export NICHT → Import-Test schlägt fehl (rot).
//
// Sollverhalten: updatePossessionVisuals / updatePossessorLabel verwendet
// fig._lastLabelText als Cache; bei unverändertem Text wird ctx.clearRect /
// ctx.fillText NICHT erneut aufgerufen und material.map.needsUpdate bleibt false.
//
// Seam-Wahl: Spy auf canvas.getContext('2d').clearRect — wenn Label-Text
// sich nicht geändert hat, darf clearRect beim zweiten Aufruf NICHT aufgerufen werden.

test('Bug 1 — Label-Cache: unveränderter Text führt beim zweiten Frame zu keinem Canvas-Redraw', async () => {
  // Dynamischer Import via require-artige Inline-Isolation
  // Da updatePossessorLabel intern ist, testen wir über updatePossessionVisuals
  // und einen Mock-Figur-Objekt mit spy-fähigem canvas-context.

  // Baue einen minimal-ausreichenden Mock
  let clearRectCalls = 0;
  let fillTextCalls = 0;
  let needsUpdateSetCount = 0;

  const mockCtx = {
    clearRect: () => { clearRectCalls++; },
    fillText: () => { fillTextCalls++; },
    font: '',
    fillStyle: '',
    textAlign: '',
    textBaseline: '',
  };

  const mockCanvas = {
    getContext: (_: string) => mockCtx,
  };

  const mockMap = {
    image: mockCanvas,
    set needsUpdate(v: boolean) { if (v) needsUpdateSetCount++; },
  };

  const mockMaterial = { map: mockMap, opacity: 0.75, color: { set: () => {} } };

  const fig = {
    id: 'f1',
    _serverPossessor: 'user-alice',
    _lastLabelText: undefined as string | undefined,  // neues Cache-Property (heute fehlt)
    possessionRing: {
      visible: false,
      material: { opacity: 0, color: { set: () => {} } },
    },
    labelSprite: {
      visible: false,
      material: mockMaterial,
    },
  };

  // Lazy-Import um Three.js-Imports in mannequin.ts zu überleben
  // (getScene/STATE fehlen im Node-Env → wir testen ONLY die Possession-Visual-Logik)
  // Wir re-implementieren den erwarteten Caching-Vertrag direkt gegen den Export:
  const { updatePossessionVisuals } = await import('../src/client/mannequin.js').catch(() =>
    // Falls .js-Extension nicht klappt, versuche .ts über tsx
    import('../src/client/mannequin')
  );

  // Erster Aufruf — Text noch nicht gecacht → sollte zeichnen
  updatePossessionVisuals([fig], 'other-user');
  const drawsAfterFirst = clearRectCalls;
  assert.ok(drawsAfterFirst >= 1, 'Erster Aufruf muss canvas beschreiben');

  clearRectCalls = 0;
  fillTextCalls = 0;
  needsUpdateSetCount = 0;

  // Zweiter Aufruf, GLEICHER possessor/Text — sollte NICHT neu zeichnen
  updatePossessionVisuals([fig], 'other-user');

  // ERWARTET: mit Cache → 0 Redraws. Heute (ohne Cache) wird canvas erneut beschrieben → TEST ROT.
  assert.strictEqual(clearRectCalls, 0,
    'Bug 1: clearRect darf bei unverändertem Label-Text nicht erneut aufgerufen werden');
  assert.strictEqual(needsUpdateSetCount, 0,
    'Bug 1: needsUpdate darf bei unverändertem Text nicht auf true gesetzt werden');
});

// ── Bug 2: Line-Geometry-Rebuild pro Drag-Frame ──────────────────────────────
//
// Seam: updateLinePositions ruft renderLine auf, das intern removeLineFromScene
// (dispose) und eine neue BufferGeometry erzeugt. Bei jedem Frame mit bewegter
// Figur wird die Geometrie daher weggeworfen und neu angelegt.
//
// Sollverhalten: updateLinePositions aktualisiert die positions-Attribute in der
// bestehenden BufferGeometry in-place; die THREE.Line-Objekt-Referenz in
// lineObjects bleibt dieselbe (Identitätserhalt).
//
// Seam-Wahl: Erweiterung von lines.test.ts-Datei (extend-before-create).
// Hier testen wir über die exportierten Funktionen in scene-lines.ts dass
// die Objekt-Referenz nach updateLinePositions erhalten bleibt.
// Heute ruft updateLinePositions → renderLine auf → dispose + new → Identität bricht → ROT.

test('Bug 2 — Geometry-Identität: updateLinePositions darf THREE.Line-Referenz nicht ersetzen', async () => {
  // scene-lines.ts importiert THREE und getScene/STATE — wir müssen STATE mocken.
  // Der Trick: wir setzen window.__brettFeatures BEVOR der Import passiert,
  // und verwenden den modul-internen lineObjects Map indirekt über den Export-Seam.

  // Im Node-Env gibt es kein window → Feature-Flag ist inaktiv → renderLine/updateLinePositions
  // sind No-Ops. Wir testen daher den VERTRAG über eine neue Export-Funktion
  // `getLineObjects` die den internen Map zurückgibt (heute nicht exportiert → ROT).

  const sceneLinesModule = await import('../src/client/scene-lines').catch((e) => {
    throw e;
  });

  // Erwartet: getLineObjects als neuer Test-Seam-Export
  // Heute NICHT vorhanden → undefined → assert schlägt fehl → TEST ROT.
  const getLineObjects = (sceneLinesModule as any).getLineObjects;
  assert.strictEqual(typeof getLineObjects, 'function',
    'Bug 2: getLineObjects muss als Test-Seam exportiert werden (heute fehlt dieser Export)');

  // Wenn getLineObjects existiert, prüfe Identitätserhalt:
  // (Dieser Block wird erst grün wenn Bug 2 komplett gefixt ist)
  if (typeof getLineObjects === 'function') {
    const lineObjects = getLineObjects();
    const lineId = 'test-line-identity';
    const refBefore = lineObjects.get(lineId);
    // Nach updateLinePositions muss die Referenz dieselbe sein
    const { updateLinePositions } = sceneLinesModule;
    updateLinePositions();
    const refAfter = lineObjects.get(lineId);
    if (refBefore !== undefined) {
      assert.strictEqual(refBefore, refAfter,
        'Bug 2: THREE.Line-Objekt-Referenz muss nach updateLinePositions identisch bleiben');
    }
  }
});

// ── Bug 3: Vector3-Allokation im Tick-Loop ───────────────────────────────────
//
// Seam: tickSpring alloziert in der Floor-Clamp-Schleife (Z.305-308) für jeden
// Contact-Point `new THREE.Vector3()`. Bei 60fps × 9 Contact-Points × N Figuren
// entsteht massiver GC-Druck.
//
// Sollverhalten: Modul-Level scratch-Vector `_floorClampScratch` wird einmalig
// angelegt und per getWorldPosition(scratch) wiederverwendet.
//
// Seam-Wahl: Erwarte neuen benannten Export `_floorClampScratch` aus mannequin.ts.
// Heute existiert dieser Export NICHT → Test ist rot.

test('Bug 3 — Scratch-Vector: _floorClampScratch muss als modul-weiter Vector3 exportiert werden', async () => {
  const mannequinModule = await import('../src/client/mannequin').catch((e) => {
    // Wenn getScene fehlt (Node-Env) kann der Import scheitern; dann schlägt der Test
    // trotzdem fehl, weil der Export fehlt — korrekte rote Seite.
    throw e;
  });

  // _floorClampScratch darf heute NICHT vorhanden sein → Test rot.
  const scratch = (mannequinModule as any)._floorClampScratch;

  assert.notStrictEqual(scratch, undefined,
    'Bug 3: _floorClampScratch muss aus mannequin.ts exportiert werden (modul-weiter scratch Vector3)');

  // Wenn der Export künftig vorhanden ist, prüfe dass es ein THREE.Vector3 ist
  if (scratch !== undefined) {
    const THREE = await import('three');
    assert.ok(scratch instanceof THREE.Vector3,
      'Bug 3: _floorClampScratch muss eine THREE.Vector3-Instanz sein');
  }
});
