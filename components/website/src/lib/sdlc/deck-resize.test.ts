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
    it('berechnet die Breite als innerWidth - clientX', () => {
      expect(widthFromPointer(1600, 1920)).toBe(320);
      expect(widthFromPointer(1280, 1920)).toBe(640);
    });

    it('klemmt am unteren Rand (Pointer nahe am rechten Fensterrand)', () => {
      expect(widthFromPointer(1900, 1920)).toBe(DECK_WIDTH_MIN);
    });

    it('klemmt am oberen Rand (Pointer weit links)', () => {
      expect(widthFromPointer(100, 1920)).toBe(DECK_WIDTH_MAX);
    });
  });
});
