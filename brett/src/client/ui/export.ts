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

  doc.save(`brett-${_isoDate()}.pdf`);
}

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
