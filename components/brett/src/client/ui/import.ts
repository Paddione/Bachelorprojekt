// brett/src/client/ui/import.ts
//
// Import-Modul für den Systembrett: JSON-Datei einlesen, validieren und Board-Zustand wiederherstellen.
// DOM-Zugriff nur innerhalb von Funktionskörpern (niemals top-level),
// damit das Modul in headless/test-Umgebungen importierbar bleibt.
//
// Ticket: 00899a42

import { STATE, getScene } from '../state';
import { updateExportCache, type ClientBoardSnapshot, type ExportFigure, type ExportLine } from './export';
import type { Anchor, Zone } from '../../types/state';

export function validateSnapshot(data: unknown): ClientBoardSnapshot {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Snapshot must be an object');
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj.exportedAt !== 'string') {
    throw new Error('Missing or invalid field: exportedAt (string expected)');
  }
  if (typeof obj.phase !== 'string') {
    throw new Error('Missing or invalid field: phase (string expected)');
  }
  if (typeof obj.stiffness !== 'number') {
    throw new Error('Missing or invalid field: stiffness (number expected)');
  }
  if (!Array.isArray(obj.figures)) {
    throw new Error('Missing or invalid field: figures (array expected)');
  }

  for (let i = 0; i < obj.figures.length; i++) {
    const fig = obj.figures[i] as Record<string, unknown>;
    if (typeof fig !== 'object' || fig === null) {
      throw new Error(`Figure at index ${i} must be an object`);
    }
    if (typeof fig.id !== 'string') {
      throw new Error(`Figure at index ${i}: missing or invalid field 'id' (string expected)`);
    }
    if (typeof fig.x !== 'number') {
      throw new Error(`Figure at index ${i}: missing or invalid field 'x' (number expected)`);
    }
    if (typeof fig.z !== 'number') {
      throw new Error(`Figure at index ${i}: missing or invalid field 'z' (number expected)`);
    }
    if (typeof fig.facingY !== 'number') {
      throw new Error(`Figure at index ${i}: missing or invalid field 'facingY' (number expected)`);
    }
  }

  const version = typeof obj.version === 'number' ? obj.version : 0; // fehlend → v0 (Migration)
  const lines = Array.isArray(obj.lines) ? (obj.lines as ExportLine[]) : [];
  const anchors = Array.isArray(obj.anchors) ? (obj.anchors as Anchor[]) : [];
  const zones = Array.isArray(obj.zones) ? (obj.zones as Zone[]) : [];

  return {
    version,
    exportedAt: obj.exportedAt,
    sessionCode: (obj.sessionCode as string | null) ?? null,
    phase: obj.phase,
    stiffness: obj.stiffness,
    figures: obj.figures as ExportFigure[],
    lines,
    anchors,
    zones,
    optik: (obj.optik as Record<string, unknown> | null) ?? null,
  };
}

export async function applyImportedSnapshot(snapshot: ClientBoardSnapshot): Promise<void> {
  const [wsClient, mannequin, { applyOptikToScene }, sceneLines, groundObjects] = await Promise.all([
    import('../ws-client'),
    import('../mannequin'),
    import('./optik'),
    import('../scene-lines'),
    import('../ground-objects'),
  ]);
  const scene = getScene().scene;

  // ── Figuren zurücksetzen ────────────────────────────────────────────────
  for (const fig of STATE.figures) {
    scene.remove(fig.root);
  }
  STATE.figures.length = 0;

  for (const expFig of snapshot.figures) {
    const fig = mannequin.makeMannequin(expFig.id, { x: expFig.x, z: expFig.z });
    fig.facingY = expFig.facingY;
    fig.root.rotation.y = expFig.facingY;
    if (expFig.label) {
      fig.label = expFig.label;
    }
    // Erweiterte serialisierbare Felder (T000605):
    if (typeof expFig.scale === 'number') {
      (fig as any).scale = expFig.scale;
    }
    if (expFig.preset) {
      (fig as any).preset = expFig.preset;
    }
    if (expFig.note !== undefined) {
      (fig as any).note = expFig.note;
    }
    if (expFig.boneOverrides) {
      (fig as any).boneOverrides = { ...expFig.boneOverrides };
    }
    if (expFig.appearance) {
      (fig as any).appearance = { ...expFig.appearance };
    } else if (expFig.color) {
      mannequin.recolorFigure(fig, expFig.color);
    }
    STATE.figures.push(fig);
    wsClient.sendAddFigure(fig);
  }

  STATE.stiffness = snapshot.stiffness;
  const stiffSlider = document.getElementById('stiffness') as HTMLInputElement | null;
  if (stiffSlider) {
    stiffSlider.value = String(snapshot.stiffness);
  }
  wsClient.sendStiffness(snapshot.stiffness);

  if (snapshot.optik) {
    applyOptikToScene(snapshot.optik as any);
  }

  // ── Lines wiederherstellen (lokales Re-Rendering via scene-lines.ts) ──────
  // initLinesFromSnapshot rendert nur, wenn das sf-t000467-Flag aktiv ist —
  // STATE.lines wird unabhängig davon gefüllt, sodass der Export-Cache stimmt.
  sceneLines.initLinesFromSnapshot(snapshot.lines ?? []);

  // ── Anchors/Zones wiederherstellen (Rendering via ground-objects.ts) ──────
  // initGroundObjectsFromSnapshot rendert die Meshes und pflegt STATE.anchors/zones.
  groundObjects.initGroundObjectsFromSnapshot(snapshot.anchors ?? [], snapshot.zones ?? []);

  // ── Export-Cache mit dem importierten Vollzustand synchronisieren ─────────
  updateExportCache({
    version: snapshot.version,
    phase: snapshot.phase,
    stiffness: snapshot.stiffness,
    figures: snapshot.figures,
    lines: snapshot.lines,
    anchors: snapshot.anchors,
    zones: snapshot.zones,
    optik: snapshot.optik,
  });
}

export async function processImportFile(file: File): Promise<void> {
  const text = await file.text();
  const data = JSON.parse(text);
  const snapshot = validateSnapshot(data);
  await applyImportedSnapshot(snapshot);
}

export function importJson(): void {
  const input = document.getElementById('import-file-input') as HTMLInputElement | null;
  if (!input) {
    console.error('[brett] JSON-Import: input element not found');
    return;
  }
  input.click();
}

export function initImportButton(): void {
  if ((window as any).__brettIsZuschauer) {
    const btn = document.getElementById('btn-import-json') as HTMLButtonElement | null;
    if (btn) btn.disabled = true;
    return;
  }
  const btn = document.getElementById('btn-import-json') as HTMLButtonElement | null;
  const input = document.getElementById('import-file-input') as HTMLInputElement | null;

  btn?.addEventListener('click', () => {
    importJson();
  });

  input?.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      await processImportFile(file);
    } catch (err) {
      console.error('[brett] JSON-Import fehlgeschlagen:', err);
    } finally {
      input.value = '';
    }
  });
}
