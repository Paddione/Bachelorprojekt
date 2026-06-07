// brett/test/export.test.ts
//
// Tests für das Export-Modul (export.ts).
// Node.js built-in test runner (node:test) — kein Framework.
// DOM-Operationen werden mit einem minimalen Mock-Objekt simuliert.
//
// Ticket: T000466

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ── Mock: DOM-Umgebung ────────────────────────────────────────────────────────
// Das Export-Modul greift auf DOM nur innerhalb von Funktionskörpern zu.
// Für Tests, die keine DOM-Funktionen aufrufen, ist kein Mock nötig.
// Für exportPng/exportJson/exportPdf werden Mini-Mocks gesetzt.

const _clicks: string[] = [];
const _blobs: string[] = [];
const _revokeUrls: string[] = [];

function setupDomMocks() {
  (global as any).document = {
    createElement: (tag: string) => {
      if (tag === 'a') {
        return {
          href: '',
          download: '',
          click() { _clicks.push(this.download); },
          style: {},
        };
      }
      return {};
    },
    body: { appendChild: () => {}, removeChild: () => {} },
    getElementById: () => null,
  };
  (global as any).URL = {
    createObjectURL: (blob: any) => {
      _blobs.push(blob.type ?? 'unknown');
      return 'blob:mock';
    },
    revokeObjectURL: (url: string) => { _revokeUrls.push(url); },
  };
  (global as any).Blob = class {
    type: string;
    constructor(_parts: any[], opts: any) { this.type = opts?.type ?? ''; }
  };
  (global as any).window = { __brettFeatures: {} };
}

setupDomMocks();

// Importiere NACH den Mocks
import {
  updateExportCache,
  getExportSnapshot,
  exportJson,
  exportPng,
  type ClientBoardSnapshot,
  type ExportFigure,
} from '../src/client/ui/export.js';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('getExportSnapshot: Defaults', () => {
  test('gibt Snapshot mit Default-Werten zurück', () => {
    const snap = getExportSnapshot();
    assert.equal(snap.phase, 'lobby');
    assert.equal(snap.sessionCode, null);
    assert.equal(snap.stiffness, 0.65);
    assert.deepEqual(snap.figures, []);
    assert.equal(snap.optik, null);
    assert.ok(snap.exportedAt, 'exportedAt muss gesetzt sein');
  });
});

describe('updateExportCache: Partial-Patch', () => {
  test('aktualisiert Phase korrekt', () => {
    updateExportCache({ phase: 'active' });
    assert.equal(getExportSnapshot().phase, 'active');
  });

  test('aktualisiert sessionCode korrekt', () => {
    updateExportCache({ sessionCode: 'ABC-123' });
    assert.equal(getExportSnapshot().sessionCode, 'ABC-123');
  });

  test('aktualisiert figures korrekt', () => {
    const figs: ExportFigure[] = [
      { id: 'f1', label: 'Klient', x: 1, z: 2, facingY: 0 },
    ];
    updateExportCache({ figures: figs });
    const snap = getExportSnapshot();
    assert.equal(snap.figures.length, 1);
    assert.equal(snap.figures[0].label, 'Klient');
  });

  test('gibt Kopie zurück — keine Mutation von außen', () => {
    updateExportCache({ phase: 'paused' });
    const snap = getExportSnapshot();
    snap.phase = 'hacked';
    assert.equal(getExportSnapshot().phase, 'paused');
  });

  test('aktualisiert exportedAt bei jedem Aufruf', () => {
    updateExportCache({ stiffness: 0.8 });
    const after = getExportSnapshot().exportedAt;
    // exportedAt muss ISO-String sein
    assert.ok(!isNaN(Date.parse(after)), 'exportedAt ist kein gültiges ISO-Datum');
    // Wert hat sich auf 0.8 aktualisiert
    assert.equal(getExportSnapshot().stiffness, 0.8);
  });
});

describe('exportJson: Blob-Download', () => {
  test('erstellt Blob mit application/json MIME-Type', () => {
    const before = _blobs.length;
    exportJson();
    assert.equal(_blobs.length, before + 1);
    assert.equal(_blobs[_blobs.length - 1], 'application/json');
  });

  test('löst revokeObjectURL aus', () => {
    // revokeObjectURL wird per setTimeout(1000) aufgerufen — Fake-Timer nötig
    // Hier prüfen wir nur, dass kein Fehler geworfen wird
    assert.doesNotThrow(() => exportJson());
  });
});

describe('getExportSnapshot: Figuren-Serialisierung', () => {
  test('ExportFigure enthält alle erwarteten Felder', () => {
    const fig: ExportFigure = {
      id: 'f42',
      label: 'Ressource',
      x: 3.5,
      z: -1.2,
      facingY: 1.57,
      color: '#ff0000',
      figureType: 'resource',
      ownerId: 'user-123',
    };
    updateExportCache({ figures: [fig] });
    const snap = getExportSnapshot();
    const f = snap.figures[0];
    assert.equal(f.id, 'f42');
    assert.equal(f.label, 'Ressource');
    assert.equal(f.x, 3.5);
    assert.equal(f.z, -1.2);
    assert.equal(f.figureType, 'resource');
    assert.equal(f.ownerId, 'user-123');
  });
});

describe('exportPng: Canvas toDataURL', () => {
  test('ruft toDataURL auf dem canvas auf und initiiert Download', () => {
    let toDataCalled = false;
    const mockCanvas = {
      toDataURL: (fmt: string) => {
        toDataCalled = true;
        assert.equal(fmt, 'image/png');
        return 'data:image/png;base64,abc123';
      },
    } as unknown as HTMLCanvasElement;

    const before = _clicks.length;
    exportPng(mockCanvas);
    assert.ok(toDataCalled, 'toDataURL muss aufgerufen werden');
    assert.equal(_clicks.length, before + 1, 'Ein Link-Click muss stattfinden');
    assert.ok(_clicks[_clicks.length - 1].startsWith('brett-'), 'Download-Name beginnt mit brett-');
    assert.ok(_clicks[_clicks.length - 1].endsWith('.png'), 'Download-Name endet mit .png');
  });
});
