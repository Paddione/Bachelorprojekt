// brett/src/client/ui/export.ts
//
// Export-Modul für den Systembrett: PNG, JSON, PDF.
// DOM-Zugriff nur innerhalb von Funktionskörpern (niemals top-level),
// damit das Modul in headless/test-Umgebungen importierbar bleibt.
//
// Ticket: T000466

import type { Anchor, Zone, LineType, FigureAppearance } from '../../types/state';
import { getScene } from '../state.js';
import { showExportToast } from './export-toast.js';

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

export async function snapshot2x(): Promise<string> {
  const { renderer, scene, camera } = getScene();
  const original = renderer.getPixelRatio();
  renderer.setPixelRatio(2);
  renderer.render(scene, camera);
  const dataUrl = renderer.domElement.toDataURL('image/png');
  renderer.setPixelRatio(original);
  renderer.render(scene, camera);
  return dataUrl;
}

function _filename(ext: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const code = _cache.sessionCode;
  return code ? `brett-${date}-${code}.${ext}` : `brett-${date}.${ext}`;
}

/**
 * Exportiert den aktuellen Three.js-Canvas als PNG-Download.
 * Setzt `preserveDrawingBuffer: true` in scene.ts voraus.
 */
export async function exportPng(): Promise<void> {
  const dataUrl = await snapshot2x();
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = _filename('png');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showExportToast('✓ PNG gespeichert');
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
  a.download = _filename('json');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showExportToast('✓ JSON gespeichert');
}

// ── PDF-Export ───────────────────────────────────────────────────────────────

/**
 * Exportiert einen PDF-Bericht: Screenshot + Metadaten + Figurenliste.
 * jsPDF wird dynamisch importiert (Code-Splitting — kein Initial-Bundle-Overhead).
 *
 * @param canvas - HTMLCanvasElement des Three.js-Renderers (renderer.domElement)
 */
export async function exportPdf(): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const snapshot = getExportSnapshot();
  const imgData = await snapshot2x();

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  doc.setFontSize(14);
  doc.setTextColor(40);
  doc.text('Systemisches Brett — Aufstellung', 20, 14);

  const IMG_X = 20;
  const IMG_Y = 20;
  const IMG_W = 255;
  const IMG_H = 155;
  doc.addImage(imgData, 'PNG', IMG_X, IMG_Y, IMG_W, IMG_H);

  const META_Y = IMG_Y + IMG_H + 7;
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(`Exportiert: ${snapshot.exportedAt.replace('T', ' ').slice(0, 19)} UTC`, 20, META_Y);
  if (snapshot.sessionCode) {
    doc.text(`Session: ${snapshot.sessionCode}`, 110, META_Y);
  }
  doc.text(`Phase: ${snapshot.phase} · Figuren: ${snapshot.figures.length} · Stiffness: ${snapshot.stiffness.toFixed(2)}`, 190, META_Y);

  const labelled = snapshot.figures.filter(f => f.label && f.label.trim());
  if (labelled.length > 0) {
    const LIST_START_Y = META_Y + 7;
    doc.setFontSize(7);
    doc.setTextColor(80);
    doc.text('Figuren:', 20, LIST_START_Y);
    let currentY = LIST_START_Y + 5;
    const PAGE_BOTTOM = 185;
    for (const f of labelled) {
      if (currentY > PAGE_BOTTOM) {
        doc.addPage();
        currentY = 20;
      }
      const typeStr = f.figureType ? ` [${f.figureType}]` : '';
      doc.text(`• ${f.label}${typeStr}`, 20, currentY);
      currentY += 5;
    }
  }

  if (snapshot.lines.length > 0) {
    const labelOf = (id: string): string => {
      const f = snapshot.figures.find(fig => fig.id === id);
      return (f?.label && f.label.trim()) ? f.label : id;
    };
    const linesStartY = labelled.length > 0 ? 20 : META_Y + 12;
    doc.setFontSize(7);
    doc.setTextColor(80);
    doc.text('Beziehungen:', 20, linesStartY);
    let currentY = linesStartY + 5;
    const PAGE_BOTTOM = 185;
    for (const l of snapshot.lines) {
      if (currentY > PAGE_BOTTOM) {
        doc.addPage();
        currentY = 20;
      }
      doc.text(`• ${labelOf(l.fromId)} → ${labelOf(l.toId)}  [${l.lineType}]`, 20, currentY);
      currentY += 5;
    }
  }

  doc.save(_filename('pdf'));
  showExportToast('✓ PDF gespeichert');
}

// ── HUD-Integration ──────────────────────────────────────────────────────────

/**
 * Registriert Click-Handler für die Export-Buttons im Topbar.
 * DOM-Zugriff erst innerhalb des Funktionskörpers — module bleibt headless-importierbar.
 *
 * @param canvas - HTMLCanvasElement des Three.js-Renderers (renderer.domElement)
 */
export function initExportButtons(_canvas?: HTMLCanvasElement): void {
  const group = document.getElementById('export-group');
  if (group) group.style.display = '';

  const btnPng = document.getElementById('btn-export-png') as HTMLButtonElement | null;
  const btnJson = document.getElementById('btn-export-json') as HTMLButtonElement | null;
  const btnPdf = document.getElementById('btn-export-pdf') as HTMLButtonElement | null;

  btnPng?.addEventListener('click', () => {
    exportPng().catch(err => {
      console.error('[brett] PNG-Export fehlgeschlagen:', err);
      showExportToast('PNG-Export fehlgeschlagen', 'error');
    });
  });

  btnJson?.addEventListener('click', () => {
    exportJson();
  });

  btnPdf?.addEventListener('click', () => {
    btnPdf.disabled = true;
    btnPdf.textContent = '⏳ PDF…';
    exportPdf()
      .catch(err => {
        console.error('[brett] PDF-Export fehlgeschlagen:', err);
        showExportToast('PDF-Export fehlgeschlagen', 'error');
      })
      .finally(() => {
        btnPdf.disabled = false;
        btnPdf.textContent = '📄 PDF';
      });
  });
}
