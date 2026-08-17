import { describe, it, expect } from 'vitest';
import {
  clampDeckWidth,
  widthFromPointer,
  DECK_WIDTH_MIN,
  DECK_WIDTH_MAX,
  DECK_WIDTH_DEFAULT,
} from './deck-resize';

describe('deck-resize', () => {
  describe('clampDeckWidth', () => {
    it('klemmt Werte unterhalb des Minimums auf DECK_WIDTH_MIN', () => {
      expect(clampDeckWidth(10)).toBe(DECK_WIDTH_MIN);
      expect(clampDeckWidth(0)).toBe(DECK_WIDTH_MIN);
      expect(clampDeckWidth(-50)).toBe(DECK_WIDTH_MIN);
    });

    it('klemmt Werte oberhalb des Maximums auf DECK_WIDTH_MAX', () => {
      expect(clampDeckWidth(999)).toBe(DECK_WIDTH_MAX);
      expect(clampDeckWidth(641)).toBe(DECK_WIDTH_MAX);
    });

    it('laesst Werte innerhalb des Bereichs unveraendert (gerundet)', () => {
      expect(clampDeckWidth(400)).toBe(400);
      expect(clampDeckWidth(DECK_WIDTH_MIN)).toBe(DECK_WIDTH_MIN);
      expect(clampDeckWidth(DECK_WIDTH_MAX)).toBe(DECK_WIDTH_MAX);
    });

    it('rundet auf ganze Pixel', () => {
      expect(clampDeckWidth(400.4)).toBe(400);
      expect(clampDeckWidth(400.5)).toBe(401);
    });

    it('faellt bei NaN/undefined auf DECK_WIDTH_DEFAULT zurueck', () => {
      expect(clampDeckWidth(NaN)).toBe(DECK_WIDTH_DEFAULT);
      expect(clampDeckWidth(undefined)).toBe(DECK_WIDTH_DEFAULT);
      expect(clampDeckWidth(Infinity)).toBe(DECK_WIDTH_DEFAULT);
      expect(clampDeckWidth(-Infinity)).toBe(DECK_WIDTH_DEFAULT);
    });
  });

  describe('widthFromPointer', () => {
    // T011500: gerechnet wird gegen die rechte Panel-Kante
    // (getBoundingClientRect().right), nicht gegen window.innerWidth —
    // innerWidth enthaelt die vertikale Scrollbar und liesse die Kante
    // hinter dem Cursor herlaufen.
    it('berechnet die Breite als rightEdge - clientX', () => {
      expect(widthFromPointer(1600, 1920)).toBe(320);
      expect(widthFromPointer(1280, 1920)).toBe(640);
    });

    it('folgt dem Cursor exakt, unabhaengig von einer Scrollbar-Breite', () => {
      // rightEdge ist die Layout-Kante des Panels (z. B. 1905 bei 15px
      // Scrollbar in einem 1920px-Fenster) — die Breite haengt nur von ihr ab.
      expect(widthFromPointer(1600, 1905)).toBe(305);
      expect(widthFromPointer(1600, 1920) - widthFromPointer(1600, 1905)).toBe(15);
    });

    it('klemmt am unteren Rand (Pointer nahe an der Panel-Kante)', () => {
      expect(widthFromPointer(1900, 1920)).toBe(DECK_WIDTH_MIN);
    });

    it('klemmt am oberen Rand (Pointer weit links)', () => {
      expect(widthFromPointer(100, 1920)).toBe(DECK_WIDTH_MAX);
    });
  });
});
