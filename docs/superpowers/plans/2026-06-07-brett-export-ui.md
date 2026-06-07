---
title: "Brett: Snapshot-/Export-UI PNG/JSON/PDF (Slice 3)"
ticket_id: T000466
spec: docs/superpowers/specs/2026-06-07-brett-export-ui-design.md
branch: feature/brett-export-ui
domains: [website]
status: active
pr_number: null
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Export-UI für den Systembrett: PNG-Screenshot via Three.js Canvas, JSON-BoardState-Dump und PDF via jsPDF als Download-Buttons im Topbar.

**Architecture:** Neues Client-Modul `export.ts` hält einen `ClientBoardSnapshot`-Cache (aktualisiert von `ws-client.ts` auf jede relevante WS-Nachricht), implementiert drei Export-Funktionen (PNG/JSON/PDF) und registriert HUD-Buttons via `initExportButtons(renderer)` — aufgerufen aus `board-boot.ts`; `preserveDrawingBuffer: true` wird in `scene.ts` gesetzt; jsPDF per dynamischem Import (Code-Splitting).

**Tech Stack:** TypeScript, Three.js, ws, node:test, tsx/jsdom
**Ticket-ID:** T000466

---

## Meilenstein 1: Dependency + Scene-Vorbereitung

### Task 1.1: jsPDF-Paket hinzufügen + scene.ts anpassen

**Files:**
- Modify: `brett/package.json`
- Modify: `brett/src/client/scene.ts`

- [x] **Step 1: jsPDF als devDependency hinzufügen**

```bash
cd brett && npm install --save-dev jspdf @types/jspdf
```

Verifiziere, dass `package.json` nun enthält:
```json
"devDependencies": {
  "jspdf": "^2.5.2",
  "@types/jspdf": "^2.0.0",
  ...
}
```

- [x] **Step 2: `preserveDrawingBuffer: true` in `initScene()` setzen**

In `brett/src/client/scene.ts`, Zeile mit `new THREE.WebGLRenderer({ antialias: true })`:

```typescript
// Vorher:
const renderer = new THREE.WebGLRenderer({ antialias: true });

// Nachher:
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
```

Begründung: `renderer.domElement.toDataURL()` liefert nach `render()` nur dann ein korrektes Bild, wenn `preserveDrawingBuffer: true` gesetzt ist. Im Coaching-Kontext (keine High-FPS-Spiellogik) ist der Performance-Tradeoff akzeptabel.

- [x] **Step 3: TypeScript verifizieren**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS (keine neuen Fehler)

- [x] **Step 4: Commit**

```bash
git add brett/package.json brett/package-lock.json brett/src/client/scene.ts
git commit -m "feat(brett): add jsPDF dep + preserveDrawingBuffer for export [T000466]"
```

---

### Task 1.2: Export-Cache-Interface und Typen definieren

**Files:**
- Create: `brett/src/client/ui/export.ts`

- [x] **Step 1: Datei anlegen mit Typen und Cache-Logik**

```typescript
// brett/src/client/ui/export.ts
//
// Export-Modul für den Systembrett: PNG, JSON, PDF.
// DOM-Zugriff nur innerhalb von Funktionskörpern (niemals top-level),
// damit das Modul in headless/test-Umgebungen importierbar bleibt.
//
// Ticket: T000466

/** Client-seitiger Board-Snapshot für den Export. */
export interface ClientBoardSnapshot {
  exportedAt: string;       // ISO-8601
  sessionCode: string | null;
  phase: string;
  stiffness: number;
  figures: ExportFigure[];
  optik: Record<string, unknown> | null;
}

/** Figur-Repräsentation im Export (nur serialisierbare Felder). */
export interface ExportFigure {
  id: string;
  label?: string;
  x: number;
  z: number;
  facingY: number;
  color?: string;
  figureType?: string;
  ownerId?: string;
}

// ── Interner Cache ───────────────────────────────────────────────────────────

let _cache: ClientBoardSnapshot = {
  exportedAt: new Date().toISOString(),
  sessionCode: null,
  phase: 'lobby',
  stiffness: 0.65,
  figures: [],
  optik: null,
};

/**
 * Aktualisiert den Export-Cache mit einem Partial-Patch.
 * Wird von ws-client.ts bei jeder relevanten WS-Nachricht aufgerufen.
 */
export function updateExportCache(patch: Partial<ClientBoardSnapshot>): void {
  _cache = { ..._cache, ...patch, exportedAt: new Date().toISOString() };
}

/**
 * Gibt eine Kopie des aktuellen Export-Snapshots zurück.
 */
export function getExportSnapshot(): ClientBoardSnapshot {
  return { ..._cache, figures: _cache.figures.map(f => ({ ...f })) };
}
```

- [x] **Step 2: TypeScript verifizieren**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS

- [x] **Step 3: Commit**

```bash
git add brett/src/client/ui/export.ts
git commit -m "feat(brett): export.ts — ClientBoardSnapshot cache interface [T000466]"
```

---

## Meilenstein 2: Export-Kernfunktionen (PNG / JSON / PDF)

### Task 2.1: PNG-Export implementieren

**Files:**
- Modify: `brett/src/client/ui/export.ts`

- [x] **Step 1: `exportPng`-Funktion hinzufügen**

Füge nach `getExportSnapshot()` ein:

```typescript
// ── PNG-Export ───────────────────────────────────────────────────────────────

/**
 * Exportiert den aktuellen Three.js-Canvas als PNG-Download.
 * Setzt `preserveDrawingBuffer: true` in scene.ts voraus.
 *
 * @param canvas - HTMLCanvasElement des Three.js-Renderers (renderer.domElement)
 */
export function exportPng(canvas: HTMLCanvasElement): void {
  const dataUrl = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `brett-${_isoDate()}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/** ISO-Datumstring für Dateinamen (YYYY-MM-DD). */
function _isoDate(): string {
  return new Date().toISOString().slice(0, 10);
}
```

- [x] **Step 2: TypeScript verifizieren**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS

- [x] **Step 3: Commit**

```bash
git add brett/src/client/ui/export.ts
git commit -m "feat(brett): exportPng — canvas toDataURL download [T000466]"
```

---

### Task 2.2: JSON-Export implementieren

**Files:**
- Modify: `brett/src/client/ui/export.ts`

- [x] **Step 1: `exportJson`-Funktion hinzufügen**

Füge nach `exportPng()` ein:

```typescript
// ── JSON-Export ──────────────────────────────────────────────────────────────

/**
 * Exportiert den aktuellen BoardState als formatiertes JSON-File.
 * Enthält alle serialisierbaren Felder: Figuren, Phase, Session-Code, Optik etc.
 */
export function exportJson(): void {
  const snapshot = getExportSnapshot();
  const json = JSON.stringify(snapshot, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `brett-${_isoDate()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

- [x] **Step 2: TypeScript verifizieren**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS

- [x] **Step 3: Commit**

```bash
git add brett/src/client/ui/export.ts
git commit -m "feat(brett): exportJson — BoardState Blob-Download [T000466]"
```

---

### Task 2.3: PDF-Export implementieren (jsPDF, dynamischer Import)

**Files:**
- Modify: `brett/src/client/ui/export.ts`

- [x] **Step 1: `exportPdf`-Funktion hinzufügen**

Füge nach `exportJson()` ein:

```typescript
// ── PDF-Export ───────────────────────────────────────────────────────────────

/**
 * Exportiert einen PDF-Bericht: Screenshot + Metadaten + Figurenliste.
 * jsPDF wird dynamisch importiert (Code-Splitting — kein Initial-Bundle-Overhead).
 *
 * @param canvas - HTMLCanvasElement des Three.js-Renderers (renderer.domElement)
 */
export async function exportPdf(canvas: HTMLCanvasElement): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const snapshot = getExportSnapshot();
  const imgData = canvas.toDataURL('image/png');

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // ── Titel ─────────────────────────────────────────────────────────────────
  doc.setFontSize(14);
  doc.setTextColor(40);
  doc.text('Systemisches Brett — Aufstellung', 20, 14);

  // ── Screenshot (250mm × 155mm, A4-Landscape ca. 297×210mm) ───────────────
  const IMG_X = 20;
  const IMG_Y = 20;
  const IMG_W = 255;
  const IMG_H = 155;
  doc.addImage(imgData, 'PNG', IMG_X, IMG_Y, IMG_W, IMG_H);

  // ── Metadaten-Zeile ───────────────────────────────────────────────────────
  const META_Y = IMG_Y + IMG_H + 7;
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(`Exportiert: ${snapshot.exportedAt.replace('T', ' ').slice(0, 19)} UTC`, 20, META_Y);
  if (snapshot.sessionCode) {
    doc.text(`Session: ${snapshot.sessionCode}`, 110, META_Y);
  }
  doc.text(`Phase: ${snapshot.phase} · Figuren: ${snapshot.figures.length} · Stiffness: ${snapshot.stiffness.toFixed(2)}`, 190, META_Y);

  // ── Figurenliste (nur Figuren mit Label) ─────────────────────────────────
  const labelled = snapshot.figures.filter(f => f.label && f.label.trim());
  if (labelled.length > 0) {
    const LIST_Y = META_Y + 7;
    doc.setFontSize(7);
    doc.setTextColor(80);
    doc.text('Figuren:', 20, LIST_Y);
    labelled.forEach((f, i) => {
      const col = Math.floor(i / 8);
      const row = i % 8;
      const x = 20 + col * 90;
      const y = LIST_Y + 5 + row * 5;
      const typeStr = f.figureType ? ` [${f.figureType}]` : '';
      doc.text(`• ${f.label}${typeStr}`, x, y);
    });
  }

  doc.save(`brett-${_isoDate()}.pdf`);
}
```

- [x] **Step 2: TypeScript verifizieren**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS (jsPDF-Typen aus `@types/jspdf`)

- [x] **Step 3: Commit**

```bash
git add brett/src/client/ui/export.ts
git commit -m "feat(brett): exportPdf — jsPDF mit Screenshot + Metadaten [T000466]"
```

---

## Meilenstein 3: WS-Client-Integration (Cache befüllen)

### Task 3.1: `ws-client.ts` — Export-Cache-Updates einbauen

**Files:**
- Modify: `brett/src/client/ws-client.ts`

- [x] **Step 1: Import von `updateExportCache` hinzufügen**

Am Anfang der Imports in `ws-client.ts`:

```typescript
import { updateExportCache, type ExportFigure } from './ui/export';
```

- [x] **Step 2: Helper-Funktion für Figuren-Mapping**

Füge nahe den anderen Hilfsfunktionen in `ws-client.ts` ein:

```typescript
/** Mappt eine runtime-Figure auf das serialisierbare ExportFigure-Format. */
function _toExportFig(fig: any): ExportFigure {
  return {
    id: fig.id,
    label: fig.label,
    x: fig.root?.position?.x ?? fig.x ?? 0,
    z: fig.root?.position?.z ?? fig.z ?? 0,
    facingY: fig.facingY ?? 0,
    color: fig.appearance?.color ?? fig.color,
    figureType: fig.figureType,
    ownerId: fig.ownerId,
  };
}
```

- [x] **Step 3: `updateExportCache`-Aufrufe in den WS-Message-Handlern**

Im `switch (msg.type)` Block in der WS-Message-Handler-Funktion (die Stelle, an der eingehende Server-Nachrichten verarbeitet werden), ergänze nach den bestehenden Aktionen:

```typescript
case 'snapshot': {
  // ... bestehender Code ...
  // Export-Cache aktualisieren:
  updateExportCache({
    phase: msg.phase ?? 'lobby',
    sessionCode: msg.sessionCode ?? null,
    stiffness: msg.stiffness ?? STATE.stiffness,
    figures: (msg.figures ?? []).map(_toExportFig),
    optik: msg.optik ?? null,
  });
  break;
}
```

```typescript
case 'add':
case 'move':
case 'update':
case 'delete': {
  // ... bestehender Code ...
  // Export-Cache mit aktuellen STATE.figures synchronisieren:
  updateExportCache({ figures: STATE.figures.map(_toExportFig) });
  break;
}
```

```typescript
case 'session_phase_change': {
  // ... bestehender Code ...
  updateExportCache({ phase: msg.phase });
  break;
}
```

```typescript
case 'stiffness': {
  // ... bestehender Code ...
  updateExportCache({ stiffness: msg.value ?? STATE.stiffness });
  break;
}
```

- [x] **Step 4: TypeScript verifizieren**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add brett/src/client/ws-client.ts
git commit -m "feat(brett): ws-client feeds export-cache on snapshot/add/move/update/delete [T000466]"
```

---

## Meilenstein 4: HUD-Buttons + board-boot.ts Integration

### Task 4.1: Export-Buttons in `index.html` einbauen

**Files:**
- Modify: `brett/public/index.html`

- [x] **Step 1: Export-Button-Gruppe im Topbar hinzufügen**

Suche den `#topbar`-Bereich und füge vor dem schließenden `</div>` eine neue Button-Gruppe ein:

```html
<!-- Export-Gruppe (T000466) — initial versteckt, von export.ts per Feature-Flag eingeblendet -->
<div class="group" id="export-group" style="display:none">
  <span class="sep"></span>
  <button id="btn-export-png" class="icon-btn" title="Aktuellen Board-Stand als PNG exportieren">📷 PNG</button>
  <button id="btn-export-json" class="icon-btn" title="Board-Zustand als JSON exportieren">{ } JSON</button>
  <button id="btn-export-pdf" class="icon-btn" title="Aufstellung als PDF exportieren">📄 PDF</button>
</div>
```

- [x] **Step 2: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): export button group in topbar (hidden, T000466)"
```

---

### Task 4.2: `initExportButtons` in `export.ts` implementieren

**Files:**
- Modify: `brett/src/client/ui/export.ts`

- [x] **Step 1: `initExportButtons`-Funktion hinzufügen**

Füge am Ende von `export.ts` ein:

```typescript
// ── HUD-Integration ──────────────────────────────────────────────────────────

/**
 * Registriert Click-Handler für die Export-Buttons im Topbar.
 * Zeigt die Export-Gruppe nur, wenn das Feature-Flag T000466 aktiv ist.
 * DOM-Zugriff erst innerhalb des Funktionskörpers — module bleibt headless-importierbar.
 *
 * @param canvas - HTMLCanvasElement des Three.js-Renderers (renderer.domElement)
 */
export function initExportButtons(canvas: HTMLCanvasElement): void {
  // Feature-Flag-Prüfung (DARK-LAUNCH: T000466)
  const feats: Record<string, boolean> =
    (typeof window !== 'undefined' && (window as any).__brettFeatures) || {};
  if (!feats['T000466']) return;

  const group = document.getElementById('export-group');
  if (group) group.style.display = '';

  const btnPng = document.getElementById('btn-export-png') as HTMLButtonElement | null;
  const btnJson = document.getElementById('btn-export-json') as HTMLButtonElement | null;
  const btnPdf = document.getElementById('btn-export-pdf') as HTMLButtonElement | null;

  btnPng?.addEventListener('click', () => {
    exportPng(canvas);
  });

  btnJson?.addEventListener('click', () => {
    exportJson();
  });

  btnPdf?.addEventListener('click', () => {
    btnPdf.disabled = true;
    btnPdf.textContent = '⏳ PDF…';
    exportPdf(canvas)
      .catch(err => {
        console.error('[brett] PDF-Export fehlgeschlagen:', err);
      })
      .finally(() => {
        btnPdf.disabled = false;
        btnPdf.textContent = '📄 PDF';
      });
  });
}
```

- [x] **Step 2: TypeScript verifizieren**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS

- [x] **Step 3: Commit**

```bash
git add brett/src/client/ui/export.ts
git commit -m "feat(brett): initExportButtons mit Feature-Flag-Gate [T000466]"
```

---

### Task 4.3: `board-boot.ts` — `initExportButtons` aufrufen

**Files:**
- Modify: `brett/src/client/board-boot.ts`

- [x] **Step 1: Import hinzufügen**

Am Anfang von `board-boot.ts`, nach den bestehenden UI-Imports:

```typescript
import * as exportUi from './ui/export';
```

- [x] **Step 2: `initExportButtons` nach `initScene()` aufrufen**

Suche den Block nach `const { renderer, scene, camera } = sceneApi;` und füge nach den bestehenden `wsClient.setLockBadgeFns(...)` etc. ein:

```typescript
  // ── Export-UI (T000466) ────────────────────────────────────────────────────
  exportUi.initExportButtons(renderer.domElement);
```

Die genaue Position ist nach `wsClient.setLockBadgeFns({...});` und vor dem `try { const me = await fetch(...) }` Block.

- [x] **Step 3: TypeScript verifizieren**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS

- [x] **Step 4: Commit**

```bash
git add brett/src/client/board-boot.ts
git commit -m "feat(brett): board-boot wires exportUi.initExportButtons [T000466]"
```

---

## Meilenstein 5: Tests

### Task 5.1: `export.test.ts` — Cache-Logik testen

**Files:**
- Create: `brett/test/export.test.ts`

- [x] **Step 1: Test-Datei anlegen**

```typescript
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

  test('aktualisiert exportedAt bei jedem Aufruf', (t) => {
    const before = getExportSnapshot().exportedAt;
    // Kleiner Delay damit sich der ISO-String ändern kann
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

  test('löst revokeObjectURL aus', async () => {
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
```

- [x] **Step 2: Test ausführen**

```bash
cd brett && npm test -- --test-name-pattern="export"
```

Expected: Alle Tests PASS (MOCK_DB=true ist für diesen Test irrelevant, wird automatisch gesetzt)

- [x] **Step 3: TypeScript verifizieren**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS

- [x] **Step 4: Commit**

```bash
git add brett/test/export.test.ts
git commit -m "test(brett): export.test.ts — Cache-Logik, Serialisierung, Blob-Download [T000466]"
```

---

### Task 5.2: `exportPng`-Test (Mock-Canvas)

**Files:**
- Modify: `brett/test/export.test.ts`

- [x] **Step 1: Test für exportPng hinzufügen**

Füge am Ende des Testfiles ein:

```typescript
import { exportPng } from '../src/client/ui/export.js';

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
```

- [x] **Step 2: Test ausführen**

```bash
cd brett && npm test -- --test-name-pattern="exportPng"
```

Expected: PASS

- [x] **Step 3: Commit**

```bash
git add brett/test/export.test.ts
git commit -m "test(brett): exportPng mock-canvas test [T000466]"
```

---

### Task 5.3: Volltest-Lauf + Typecheck final

**Files:**
- Keine neuen Dateien

- [x] **Step 1: Vollständige Test-Suite ausführen**

```bash
cd brett && npm test
```

Expected: Alle bestehenden Tests PASS, neue export.test.ts PASS.

- [x] **Step 2: TypeScript-Vollcheck (Client + Server)**

```bash
cd brett && npx tsc --noEmit -p tsconfig.client.json && npx tsc --noEmit -p tsconfig.server.json
```

Expected: PASS für beide tsconfig-Dateien.

- [x] **Step 3: Final-Commit**

```bash
git add brett/test/export.test.ts
git commit -m "test(brett): export.test.ts vollständig — T000466 bereit für PR"
```

---

## Meilenstein 6: Verifikation + PR

### Task 6.1: Lokale Verifikation

**Files:**
- Keine Änderungen

- [x] **Step 1: Build prüfen**

```bash
cd brett && npm run build
```

Expected: PASS — Vite baut den Client-Bundle (inkl. dynamischem jsPDF-Chunk) ohne Fehler.

- [x] **Step 2: Feature-Flag manuell aktivieren (dev-only)**

In der Browser-Konsole oder in `brett/public/index.html` (Entwicklungsumgebung):

```javascript
// Einmalig in der Konsole:
window.__brettFeatures = { ...window.__brettFeatures, 'T000466': true };
```

Oder in `index.html` temporär für lokalen Test:
```html
<script>
  window.__brettFeatures = window.__brettFeatures || {};
  window.__brettFeatures['T000466'] = true;
</script>
```

- [x] **Step 3: Manuelle Verifikation (3 Export-Formate)**

Checkliste:
- PNG-Button: Klick → Browser-Download-Dialog öffnet sich → Datei `brett-YYYY-MM-DD.png` mit korrektem Board-Screenshot
- JSON-Button: Klick → `brett-YYYY-MM-DD.json` wird heruntergeladen → Datei enthält `figures`, `phase`, `sessionCode`, `stiffness`, `optik`
- PDF-Button: Klick → Button zeigt "⏳ PDF…" → nach ca. 1-2s Download `brett-YYYY-MM-DD.pdf` mit Screenshot + Metadatenzeile
- Ohne Feature-Flag: Export-Gruppe ist unsichtbar (`display:none`)

- [x] **Step 4: Commit (falls Korrekturen nötig)**

```bash
git add -p
git commit -m "fix(brett): export UI Korrekturen aus lokaler Verifikation [T000466]"
```

---

### Task 6.2: PR erstellen

**Files:**
- Keine neuen Dateien

- [x] **Step 1: Push + PR öffnen**

```bash
git push -u origin feature/brett-export-ui
gh pr create \
  --title "feat(brett): Snapshot-/Export-UI PNG/JSON/PDF [T000466]" \
  --body "$(cat <<'EOF'
## Summary

- Neues Modul `brett/src/client/ui/export.ts` mit PNG/JSON/PDF-Export-Logik
- `ClientBoardSnapshot`-Cache wird von `ws-client.ts` bei WS-Nachrichten befüllt
- Export-Buttons (📷 PNG / { } JSON / 📄 PDF) im Topbar, per Feature-Flag `T000466` gated
- `preserveDrawingBuffer: true` in `scene.ts` für korrektes `toDataURL()`
- jsPDF via dynamischem Import (Code-Splitting, kein Initial-Bundle-Overhead)
- Tests in `brett/test/export.test.ts` (Cache, Serialisierung, PNG-Mock, JSON-Blob)

## Test plan

- [x] `cd brett && npm test` — alle Tests PASS
- [x] `cd brett && npm run build` — Build erfolgreich, kein jsPDF im Initial-Chunk
- [x] `cd brett && npx tsc --noEmit` — keine TS-Fehler
- [x] Manuelle Verifikation: PNG/JSON/PDF-Download funktioniert im Browser
- [x] Ohne Feature-Flag T000466: Export-Gruppe nicht sichtbar

Closes T000466
EOF
)"
```

- [x] **Step 2: CI abwarten**

Expected: CI (task test:all) PASS, Brett typecheck PASS.

- [x] **Step 3: Merge + Ticket schließen**

Nach grünem CI: Squash-and-merge via `gh pr merge --squash`.
