// brett/src/client/ui/export.ts
//
// Export-Modul für den Systembrett: PNG, JSON, PDF.
// DOM-Zugriff nur innerhalb von Funktionskörpern (niemals top-level),
// damit das Modul in headless/test-Umgebungen importierbar bleibt.
//
// Ticket: T000466

import type { Anchor, Zone, LineType, FigureAppearance } from '../../types/state';

/** Client-seitiger Board-Snapshot für den Export. */
export interface ClientBoardSnapshot {
  version: number;          // NEU (T000605) — Schema-Version für Migration. Aktuell 1.
  exportedAt: string;       // ISO-8601
  sessionCode: string | null;
  phase: string;
  stiffness: number;
  figures: ExportFigure[];
  lines: ExportLine[];      // NEU (T000605)
  anchors: Anchor[];        // NEU (T000605)
  zones: Zone[];            // NEU (T000605)
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
  // NEU (T000605):
  scale?: number;
  preset?: string;
  note?: string;
  boneOverrides?: Record<string, { x: number; z: number }>;
  appearance?: FigureAppearance;
}

/** Beziehungs-/Spannungslinie im Export. */
export interface ExportLine {
  id: string;
  fromId: string;
  toId: string;
  lineType: LineType;
}

// ── Interner Cache ───────────────────────────────────────────────────────────

let _cache: ClientBoardSnapshot = {
  version: 1,
  exportedAt: new Date().toISOString(),
  sessionCode: null,
  phase: 'lobby',
  stiffness: 0.65,
  figures: [],
  lines: [],
  anchors: [],
  zones: [],
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
  return {
    ..._cache,
    figures: _cache.figures.map(f => ({ ...f })),
    lines: _cache.lines.map(l => ({ ...l })),
    anchors: _cache.anchors.map(a => ({ ...a })),
    zones: _cache.zones.map(z => ({ ...z })),
  };
}

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

  // ── Beziehungslinien-Tabelle (T000605) ───────────────────────────────────
  if (snapshot.lines.length > 0) {
    // Label-Lookup aus den Figuren (Fallback: figureId selbst)
    const labelOf = (id: string): string => {
      const f = snapshot.figures.find(fig => fig.id === id);
      return (f?.label && f.label.trim()) ? f.label : id;
    };
    // Startposition: unterhalb der (max. 8-zeiligen) Figurenliste oder Metadaten
    const labelledCount = snapshot.figures.filter(f => f.label && f.label.trim()).length;
    const listRows = Math.min(labelledCount, 8);
    const LINES_Y = META_Y + 7 + (labelledCount > 0 ? 5 + listRows * 5 : 0) + 4;
    doc.setFontSize(7);
    doc.setTextColor(80);
    doc.text('Beziehungen:', 20, LINES_Y);
    snapshot.lines.forEach((l, i) => {
      const col = Math.floor(i / 8);
      const row = i % 8;
      const x = 20 + col * 90;
      const y = LINES_Y + 5 + row * 5;
      doc.text(`• ${labelOf(l.fromId)} → ${labelOf(l.toId)}  [${l.lineType}]`, x, y);
    });
  }

  doc.save(`brett-${_isoDate()}.pdf`);
}

// ── HUD-Integration ──────────────────────────────────────────────────────────

/**
 * Registriert Click-Handler für die Export-Buttons im Topbar.
 * DOM-Zugriff erst innerhalb des Funktionskörpers — module bleibt headless-importierbar.
 *
 * @param canvas - HTMLCanvasElement des Three.js-Renderers (renderer.domElement)
 */
export function initExportButtons(canvas: HTMLCanvasElement): void {
  // T000605: Feature-Flag entfernt — Export ist permanent verfügbar.
  // Die Gruppe ist im HTML initial display:none und wird hier eingeblendet.
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
