// T011499 — Z5 DeckLeiste: reine Klemm-Logik fuer den Drag-Resize der
// rechten Deck-Leiste im SDLC-Leitstand. Die Svelte-Komponente
// (DeckLeiste.svelte) importiert diese Funktionen/Konstanten und bleibt
// selbst duenn (siehe design.md, Entscheidung 4).

export const DECK_WIDTH_MIN = 240;
export const DECK_WIDTH_MAX = 640;
export const DECK_WIDTH_DEFAULT = 320;
export const DECK_WIDTH_STEP = 16;
export const DECK_WIDTH_STORAGE_KEY = 'ls-deck-width';

/**
 * Klemmt eine Pixel-Breite auf [DECK_WIDTH_MIN, DECK_WIDTH_MAX] und rundet
 * auf ganze Pixel. NaN/undefined/nicht-endliche Werte fallen auf
 * DECK_WIDTH_DEFAULT zurueck.
 */
export function clampDeckWidth(px: number | undefined): number {
  if (px === undefined || !Number.isFinite(px)) {
    return DECK_WIDTH_DEFAULT;
  }
  const rounded = Math.round(px);
  return Math.min(DECK_WIDTH_MAX, Math.max(DECK_WIDTH_MIN, rounded));
}

/**
 * Berechnet die Deck-Leiste-Breite aus der Pointer-Position beim Drag:
 * Breite = rechte Panel-Kante - clientX, geklemmt auf den erlaubten
 * Bereich. Gerechnet wird gegen die eigene Geometrie der Leiste
 * (getBoundingClientRect().right), NICHT gegen window.innerWidth — das
 * enthaelt die vertikale Scrollbar, wodurch die gezogene Kante bei
 * sichtbarer Seiten-Scrollbar hinter dem Cursor herliefe (T011500).
 */
export function widthFromPointer(clientX: number, rightEdge: number): number {
  return clampDeckWidth(rightEdge - clientX);
}
