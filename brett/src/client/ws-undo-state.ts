// brett/src/client/ws-undo-state.ts
// Undo/Redo-Stack-Status auf Client-Seite (T000470).

export const undoState = {
  canUndo: false,
  canRedo: false,
  undoCount: 0,
  redoCount: 0,
};

let onUndoStateChange: ((state: typeof undoState) => void) | null = null;

export function setUndoStateChangeHandler(fn: typeof onUndoStateChange): void {
  onUndoStateChange = fn;
}

export function applyUndoStateChange(
  canUndo: boolean, canRedo: boolean, undoCount: number, redoCount: number,
): void {
  undoState.canUndo = canUndo;
  undoState.canRedo = canRedo;
  undoState.undoCount = undoCount;
  undoState.redoCount = redoCount;
  if (onUndoStateChange) onUndoStateChange({ ...undoState });
}
