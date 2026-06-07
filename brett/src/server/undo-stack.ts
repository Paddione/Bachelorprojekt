// brett/src/server/undo-stack.ts — T000470: Undo/Redo Mutations-Stack (Slice 3)
//
// Pure utility — KEIN statischer Import von figures.ts oder ws-handler.ts.
// Wird vom ws-handler via Dependency-Injection koordiniert.
// Stack ist rein in-memory (nicht persistiert).

export interface UndoEntry {
  /** Zustand VOR der Mutation, pro Figur-ID.
   *  null = Figur existierte nicht (→ Undo eines 'add' = löschen) */
  before: Map<string, any | null>;
  /** Zustand NACH der Mutation (für Redo).
   *  null = Figur wurde gelöscht (→ Redo eines 'delete' = löschen) */
  after:  Map<string, any | null>;
  /** Mutations-Typ der ursprünglichen Operation (z.B. 'add', 'move') */
  mutationType: string;
  /** Unix-Timestamp (Date.now()) */
  ts: number;
}

/** Maximale Stack-Tiefe pro Raum. */
export const UNDO_LIMIT = 20;

/**
 * Undo-bare Mutations-Typen. Alles AUSSER diesen löst keinen Stack-Eintrag aus.
 * Ephemere Operationen (figure_possess, figure_release, phasen, presence) sind
 * explizit NICHT enthalten.
 */
export const UNDOABLE_TYPES = new Set<string>([
  'add', 'move', 'update', 'delete', 'clear',
  'stiffness', 'snapshot', 'figure_type_set',
]);

// ── In-Memory Stacks (room → stack) ──────────────────────────────────────────
export const undoStacks = new Map<string, UndoEntry[]>();
export const redoStacks = new Map<string, UndoEntry[]>();

/**
 * Liest den Zustand der von `msg` betroffenen Figuren VOR der Mutation aus
 * der figureMap des Raumes. Gibt eine Map<figureId, snapshot|null> zurück.
 *
 * Für 'clear' und 'snapshot': snapshot ALLER Nicht-Sentinel-Figuren.
 * Für 'stiffness': { '__stiffness__': aktueller Wert-Eintrag }
 * Für 'add': { [msg.figure.id]: null } (Figur existiert noch nicht)
 * Für 'delete'/'move'/'update'/'figure_type_set': { [msg.id || msg.figureId]: aktueller Stand }
 */
export function captureBeforeSnapshot(
  room: string,
  msg: any,
  figureMaps: Map<string, Map<string, any>>,
): Map<string, any | null> {
  const figs = figureMaps.get(room);
  const snap = new Map<string, any | null>();
  if (!figs) return snap;

  switch (msg.type) {
    case 'clear': {
      // Alle Nicht-Sentinel-Figuren erfassen
      for (const [id, fig] of figs.entries()) {
        if (!id.startsWith('__')) {
          snap.set(id, { ...fig });
        }
      }
      break;
    }
    case 'snapshot': {
      // Gleiche Logik wie clear — alles überschreiben
      for (const [id, fig] of figs.entries()) {
        if (!id.startsWith('__')) {
          snap.set(id, { ...fig });
        }
      }
      break;
    }
    case 'stiffness': {
      const entry = figs.get('__stiffness__');
      snap.set('__stiffness__', entry ? { ...entry } : null);
      break;
    }
    case 'add': {
      const figData = msg.figure ?? msg.fig;
      const id = figData?.id;
      if (typeof id === 'string') {
        // Figur existiert noch nicht → null
        snap.set(id, figs.has(id) ? { ...figs.get(id) } : null);
      }
      break;
    }
    case 'delete':
    case 'move':
    case 'update': {
      const id = msg.id;
      if (typeof id === 'string') {
        snap.set(id, figs.has(id) ? { ...figs.get(id) } : null);
      }
      break;
    }
    case 'figure_type_set': {
      const id = msg.figureId;
      if (typeof id === 'string') {
        snap.set(id, figs.has(id) ? { ...figs.get(id) } : null);
      }
      break;
    }
  }
  return snap;
}

/**
 * Liest den Zustand der betroffenen Figuren NACH der Mutation.
 * Gibt die gleichen IDs wie `before` zurück, jetzt mit dem aktuellen Zustand
 * (oder null wenn die Figur durch delete/clear entfernt wurde).
 */
export function captureAfterSnapshot(
  before: Map<string, any | null>,
  figureMaps: Map<string, Map<string, any>>,
  room: string,
  msg: any,
): Map<string, any | null> {
  const figs = figureMaps.get(room);
  const snap = new Map<string, any | null>();

  // Für clear/snapshot: alle aktuellen Nicht-Sentinel-Figuren PLUS alle, die
  // vorher existierten (damit Redo die neuen kennt und Undo die alten).
  if (msg.type === 'clear' || msg.type === 'snapshot') {
    // Alles, was jetzt da ist
    if (figs) {
      for (const [id, fig] of figs.entries()) {
        if (!id.startsWith('__')) snap.set(id, { ...fig });
      }
    }
    // Alles, was vorher da war aber jetzt weg ist → null
    for (const [id] of before.entries()) {
      if (!id.startsWith('__') && !snap.has(id)) snap.set(id, null);
    }
    return snap;
  }

  if (msg.type === 'stiffness') {
    const entry = figs?.get('__stiffness__');
    snap.set('__stiffness__', entry ? { ...entry } : null);
    return snap;
  }

  // Für alle anderen: gleiche IDs wie before lesen
  for (const [id] of before.entries()) {
    snap.set(id, figs?.has(id) ? { ...figs.get(id) } : null);
  }
  return snap;
}

/**
 * Schiebt einen neuen UndoEntry auf den Undo-Stack des Raumes.
 * Löscht den Redo-Stack (neue Aktion unterbricht Redo-Kette).
 * Trimmt auf UNDO_LIMIT (älteste Einträge zuerst verwerfen).
 */
export function pushUndo(room: string, entry: UndoEntry): void {
  if (!undoStacks.has(room)) undoStacks.set(room, []);
  const stack = undoStacks.get(room)!;
  stack.push(entry);
  // Älteste Einträge trimmen
  if (stack.length > UNDO_LIMIT) {
    stack.splice(0, stack.length - UNDO_LIMIT);
  }
  // Redo-Stack löschen (neue Mutation bricht Redo-Kette)
  redoStacks.delete(room);
}

/**
 * Führt Undo durch: poppt letzten Undo-Eintrag, appliziert `before`-Zustand
 * auf figureMaps, schiebt Eintrag auf Redo-Stack.
 * Gibt `{ applied: true, entry }` bei Erfolg oder `{ applied: false }` zurück.
 */
export function performUndo(
  room: string,
  figureMaps: Map<string, Map<string, any>>,
): { applied: true; entry: UndoEntry } | { applied: false } {
  const stack = undoStacks.get(room);
  if (!stack || stack.length === 0) return { applied: false };
  const entry = stack.pop()!;
  applySnapshot(room, entry.before, figureMaps);
  if (!redoStacks.has(room)) redoStacks.set(room, []);
  redoStacks.get(room)!.push(entry);
  return { applied: true, entry };
}

/**
 * Führt Redo durch: poppt letzten Redo-Eintrag, appliziert `after`-Zustand,
 * schiebt Eintrag zurück auf Undo-Stack.
 */
export function performRedo(
  room: string,
  figureMaps: Map<string, Map<string, any>>,
): { applied: true; entry: UndoEntry } | { applied: false } {
  const redoStack = redoStacks.get(room);
  if (!redoStack || redoStack.length === 0) return { applied: false };
  const entry = redoStack.pop()!;
  applySnapshot(room, entry.after, figureMaps);
  if (!undoStacks.has(room)) undoStacks.set(room, []);
  undoStacks.get(room)!.push(entry);
  return { applied: true, entry };
}

/**
 * Appliziert einen Snapshot auf figureMaps: jede ID → Wert setzt oder löscht
 * die Figur im Map. null = löschen.
 */
function applySnapshot(
  room: string,
  snapshot: Map<string, any | null>,
  figureMaps: Map<string, Map<string, any>>,
): void {
  let figs = figureMaps.get(room);
  if (!figs) {
    figs = new Map();
    figureMaps.set(room, figs);
  }
  for (const [id, val] of snapshot.entries()) {
    if (val === null) {
      figs.delete(id);
    } else {
      figs.set(id, { ...val });
    }
  }
}

/**
 * Gibt den aktuellen Undo/Redo-Status zurück (für das undo_stack_changed-Event).
 */
export function getUndoStatus(room: string): {
  canUndo: boolean;
  canRedo: boolean;
  undoCount: number;
  redoCount: number;
} {
  const undoCount = undoStacks.get(room)?.length ?? 0;
  const redoCount = redoStacks.get(room)?.length ?? 0;
  return { canUndo: undoCount > 0, canRedo: redoCount > 0, undoCount, redoCount };
}

/**
 * Löscht beide Stacks für den Raum (aufgerufen bei Last-Leave / Cleanup).
 */
export function clearStacks(room: string): void {
  undoStacks.delete(room);
  redoStacks.delete(room);
}
