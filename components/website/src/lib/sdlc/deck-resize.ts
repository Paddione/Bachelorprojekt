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
 * Berechnet die Deck-Leiste-Breite aus der Pointer-Position beim Drag: die
 * Leiste sitzt am rechten Rand, also Breite = innerWidth - clientX,
 * geklemmt auf den erlaubten Bereich.
 */
export function widthFromPointer(clientX: number, innerWidth: number): number {
  return clampDeckWidth(innerWidth - clientX);
}
