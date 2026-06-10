// brett/test/import.test.ts
//
// Tests für das Import-Modul (import.ts).
// Node.js built-in test runner (node:test) — kein Framework.
//
// Ticket: 00899a42

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

function setupDomMocks() {
  (global as any).document = {
    createElement: (tag: string) => {
      if (tag === 'a') {
        return {
          href: '',
          download: '',
          click() {},
          style: {},
        };
      }
      return {};
    },
    body: { appendChild: () => {}, removeChild: () => {} },
    getElementById: () => null,
  };
  (global as any).URL = {
    createObjectURL: () => 'blob:mock',
    revokeObjectURL: () => {},
  };
  (global as any).Blob = class {
    type: string;
    constructor(_parts: any[], opts: any) { this.type = opts?.type ?? ''; }
  };
  (global as any).window = { __brettFeatures: {} };
}

setupDomMocks();

import { validateSnapshot } from '../src/client/ui/import.js';

describe('validateSnapshot: gültige Snapshots', () => {
  test('akzeptiert gültiges Snapshot mit allen Pflichtfeldern', () => {
    const data = {
      exportedAt: '2024-01-15T10:30:00.000Z',
      phase: 'active',
      stiffness: 0.75,
      figures: [
        { id: 'f1', x: 1.0, z: 2.0, facingY: 0.5 },
        { id: 'f2', x: -1.5, z: 0.0, facingY: 1.57 },
      ],
    };
    const result = validateSnapshot(data);
    assert.equal(result.exportedAt, '2024-01-15T10:30:00.000Z');
    assert.equal(result.phase, 'active');
    assert.equal(result.stiffness, 0.75);
    assert.equal(result.figures.length, 2);
    assert.equal(result.figures[0].id, 'f1');
    assert.equal(result.figures[1].id, 'f2');
  });

  test('akzeptiert Snapshot mit optionalen Feldern', () => {
    const data = {
      exportedAt: '2024-01-15T10:30:00.000Z',
      phase: 'active',
      stiffness: 0.65,
      figures: [
        {
          id: 'f1',
          x: 1.0,
          z: 2.0,
          facingY: 0.0,
          label: 'Klient',
          color: '#ff0000',
          figureType: 'client',
          ownerId: 'user-123',
        },
      ],
      optik: { floorColor: '#808080', lightColor: '#ffffff', lightIntensity: 1.0 },
    };
    const result = validateSnapshot(data);
    assert.equal(result.figures[0].label, 'Klient');
    assert.equal(result.figures[0].color, '#ff0000');
    assert.equal(result.figures[0].figureType, 'client');
    assert.equal(result.figures[0].ownerId, 'user-123');
    assert.ok(result.optik);
  });

  test('akzeptiert leeres figures-Array', () => {
    const data = {
      exportedAt: '2024-01-15T10:30:00.000Z',
      phase: 'lobby',
      stiffness: 0.5,
      figures: [],
    };
    const result = validateSnapshot(data);
    assert.equal(result.figures.length, 0);
  });
});

describe('validateSnapshot: fehlende Pflichtfelder', () => {
  test('lehnt fehlendes exportedAt ab', () => {
    const data = {
      phase: 'active',
      stiffness: 0.65,
      figures: [],
    };
    assert.throws(() => validateSnapshot(data), /exportedAt/);
  });

  test('lehnt fehlendes phase ab', () => {
    const data = {
      exportedAt: '2024-01-15T10:30:00.000Z',
      stiffness: 0.65,
      figures: [],
    };
    assert.throws(() => validateSnapshot(data), /phase/);
  });

  test('lehnt fehlendes stiffness ab', () => {
    const data = {
      exportedAt: '2024-01-15T10:30:00.000Z',
      phase: 'active',
      figures: [],
    };
    assert.throws(() => validateSnapshot(data), /stiffness/);
  });

  test('lehnt fehlendes figures-Array ab', () => {
    const data = {
      exportedAt: '2024-01-15T10:30:00.000Z',
      phase: 'active',
      stiffness: 0.65,
    };
    assert.throws(() => validateSnapshot(data), /figures/);
  });

  test('lehnt nicht-objekt als Input ab', () => {
    assert.throws(() => validateSnapshot('not an object'), /object/);
    assert.throws(() => validateSnapshot(null), /object/);
  });
});

describe('validateSnapshot: Figuren-Validierung', () => {
  test('lehnt Figur ohne id ab', () => {
    const data = {
      exportedAt: '2024-01-15T10:30:00.000Z',
      phase: 'active',
      stiffness: 0.65,
      figures: [{ x: 1.0, z: 2.0, facingY: 0.0 }],
    };
    assert.throws(() => validateSnapshot(data), /id/);
  });

  test('lehnt Figur mit nicht-numerischem x ab', () => {
    const data = {
      exportedAt: '2024-01-15T10:30:00.000Z',
      phase: 'active',
      stiffness: 0.65,
      figures: [{ id: 'f1', x: 'not a number', z: 2.0, facingY: 0.0 }],
    };
    assert.throws(() => validateSnapshot(data), /x/);
  });

  test('lehnt Figur mit nicht-numerischem z ab', () => {
    const data = {
      exportedAt: '2024-01-15T10:30:00.000Z',
      phase: 'active',
      stiffness: 0.65,
      figures: [{ id: 'f1', x: 1.0, z: 'not a number', facingY: 0.0 }],
    };
    assert.throws(() => validateSnapshot(data), /z/);
  });

  test('lehnt Figur mit nicht-numerischem facingY ab', () => {
    const data = {
      exportedAt: '2024-01-15T10:30:00.000Z',
      phase: 'active',
      stiffness: 0.65,
      figures: [{ id: 'f1', x: 1.0, z: 2.0, facingY: 'not a number' }],
    };
    assert.throws(() => validateSnapshot(data), /facingY/);
  });

  test('lehnt nicht-objekt als Figur ab', () => {
    const data = {
      exportedAt: '2024-01-15T10:30:00.000Z',
      phase: 'active',
      stiffness: 0.65,
      figures: ['not an object'],
    };
    assert.throws(() => validateSnapshot(data), /object/);
  });
});
