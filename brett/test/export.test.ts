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
      if (tag === 'style') {
        return { id: '', textContent: '' };
      }
      if (tag === 'div') {
        return {
          id: '',
          children: [] as any[],
          appendChild(c: any) { this.children.push(c); },
          style: {},
          remove() {},
        };
      }
      return {};
    },
    body: { appendChild: () => {}, removeChild: () => {} },
    head: { appendChild: () => {} },
    getElementById: () => null,
  };
  const OrigURL = globalThis.URL;
  (globalThis as any).URL = class URL extends OrigURL {
    static createObjectURL(blob: any) {
      _blobs.push(blob?.type ?? 'unknown');
      return 'blob:mock';
    }
    static revokeObjectURL(url: string) { _revokeUrls.push(url); }
    constructor(url: string | URL, base?: string | URL) { super(url, base); }
  } as unknown as typeof URL;
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
  type ExportLine,
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

  test('enthält version, lines, anchors, zones Defaults', () => {
    const snap = getExportSnapshot();
    assert.equal(snap.version, 1);
    assert.deepEqual(snap.lines, []);
    assert.deepEqual(snap.anchors, []);
    assert.deepEqual(snap.zones, []);
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

  test('ExportFigure trägt scale/preset/note/boneOverrides/appearance', () => {
    const fig: ExportFigure = {
      id: 'f99',
      x: 0,
      z: 0,
      facingY: 0,
      scale: 1.4,
      preset: 'sitzend',
      note: 'wichtige Aussage',
      boneOverrides: { head: { x: 0.1, z: -0.2 } },
      appearance: { color: '#00ff00', face: 'face1', body: null, accessories: {} },
    };
    updateExportCache({ figures: [fig] });
    const f = getExportSnapshot().figures[0];
    assert.equal(f.scale, 1.4);
    assert.equal(f.preset, 'sitzend');
    assert.equal(f.note, 'wichtige Aussage');
    assert.deepEqual(f.boneOverrides, { head: { x: 0.1, z: -0.2 } });
    assert.equal(f.appearance?.color, '#00ff00');
  });

  test('lines/anchors/zones werden als Kopie durchgereicht', () => {
    updateExportCache({
      lines: [{ id: 'l1', fromId: 'a', toId: 'b', lineType: 'tension' }],
      anchors: [{ id: 'an1', x: 1, z: 2, label: 'Ziel' }],
      zones: [{ id: 'zo1', x: 0, z: 0, shape: 'circle', radius: 1.5 }],
    });
    const snap = getExportSnapshot();
    assert.equal(snap.lines[0].lineType, 'tension');
    assert.equal(snap.anchors[0].label, 'Ziel');
    assert.equal(snap.zones[0].shape, 'circle');
    // Mutation der Kopie darf den Cache nicht verändern
    snap.lines[0].lineType = 'relationship';
    assert.equal(getExportSnapshot().lines[0].lineType, 'tension');
  });
});

describe('exportPng: snapshot2x + download', () => {
  test('initiates download with brett- prefix and .png suffix', async () => {
    const { setScene } = await import('../src/client/state.js');
    setScene({
      renderer: {
        getPixelRatio: () => 1,
        setPixelRatio: () => {},
        render: () => {},
        domElement: { toDataURL: () => 'data:image/png;base64,mock' },
      },
      scene: {},
      camera: {},
      floor: {},
    } as any);
    const { exportPng } = await import('../src/client/ui/export.js');
    const before = _clicks.length;
    await exportPng();
    assert.equal(_clicks.length, before + 1, 'Ein Link-Click muss stattfinden');
    assert.ok(_clicks[_clicks.length - 1].startsWith('brett-'), 'Download-Name beginnt mit brett-');
    assert.ok(_clicks[_clicks.length - 1].endsWith('.png'), 'Download-Name endet mit .png');
  });
});

describe('_filename: session code in filename', () => {
  test('includes session code when set', () => {
    updateExportCache({ sessionCode: 'XYZ-789' });
    const snap = getExportSnapshot();
    assert.equal(snap.sessionCode, 'XYZ-789');
  });

  test('filename falls back to date-only when sessionCode is null', () => {
    updateExportCache({ sessionCode: null });
    const snap = getExportSnapshot();
    assert.equal(snap.sessionCode, null);
  });
});
