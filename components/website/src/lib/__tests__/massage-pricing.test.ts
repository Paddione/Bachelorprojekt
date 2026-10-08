import { describe, it, expect } from 'vitest';
import {
  MASSAGE_BASE_RATE_CENTS,
  effectiveMassageMultiplier,
  formatEuroCents,
  massagePriceCents,
  massagePriceLabel,
  massageRowPriceLabel,
} from '../massage-pricing';

// Intl de-DE trennt Betrag und €-Zeichen mit einem geschützten Leerzeichen (U+00A0).
const NBSP = '\u00a0';
const EUR_30 = `30,00${NBSP}€`;
const EUR_60 = `60,00${NBSP}€`;
const EUR_90 = `90,00${NBSP}€`;

describe('massage-pricing (OQ-05)', () => {
  it('setzt den Basisstundensatz auf 6000 Cent', () => {
    expect(MASSAGE_BASE_RATE_CENTS).toBe(6000);
  });

  it('berechnet die Katalogwerte 30/60/90 Minuten mal Multiplier 1', () => {
    expect(massagePriceCents(30, 1)).toBe(3000);
    expect(massagePriceCents(60, 1)).toBe(6000);
    expect(massagePriceCents(90, 1)).toBe(9000);
  });

  it('skaliert linear mit dem Multiplier', () => {
    expect(massagePriceCents(60, 1.5)).toBe(9000);
    expect(massagePriceCents(30, 2)).toBe(6000);
  });

  it('rundet kaufmännisch auf ganze Cent', () => {
    expect(massagePriceCents(60, 1.0001)).toBe(6001);
    expect(massagePriceCents(60, 1.00001)).toBe(6000);
  });

  it('fällt bei Multiplier kleiner gleich 0 oder ungültig auf 1 zurück', () => {
    expect(effectiveMassageMultiplier(0)).toBe(1);
    expect(effectiveMassageMultiplier(-2)).toBe(1);
    expect(effectiveMassageMultiplier(NaN)).toBe(1);
    expect(effectiveMassageMultiplier(undefined)).toBe(1);
    expect(effectiveMassageMultiplier(null)).toBe(1);
    expect(massagePriceCents(60, 0)).toBe(6000);
    expect(massagePriceCents(60, -1)).toBe(6000);
  });

  it('formatiert Cent-Beträge als de-DE/EUR', () => {
    expect(formatEuroCents(3000)).toBe(EUR_30);
    expect(formatEuroCents(6000)).toBe(EUR_60);
    expect(formatEuroCents(9000)).toBe(EUR_90);
  });

  it('liefert die Katalog-Labels aus Dauer und Multiplier', () => {
    expect(massagePriceLabel(30, 1)).toBe(EUR_30);
    expect(massagePriceLabel(60, 1)).toBe(EUR_60);
    expect(massagePriceLabel(90, 1)).toBe(EUR_90);
    expect(massagePriceLabel(60)).toBe(EUR_60);
  });

  it('berechnet den Zeilenpreis aus durationMin und Multiplier', () => {
    expect(massageRowPriceLabel({ price: 'alt', durationMin: 30, multiplier: 1 })).toBe(EUR_30);
    expect(massageRowPriceLabel({ price: 'alt', durationMin: 60, multiplier: 1.5 })).toBe(EUR_90);
    expect(massageRowPriceLabel({ price: 'alt', durationMin: 90 })).toBe(EUR_90);
  });

  it('fällt ohne nutzbare durationMin auf das gespeicherte Label zurück', () => {
    expect(massageRowPriceLabel({ price: 'nach Vereinbarung' })).toBe('nach Vereinbarung');
    expect(massageRowPriceLabel({ price: 'Display-Preis', durationMin: 0 })).toBe('Display-Preis');
    expect(massageRowPriceLabel({ price: 'Display-Preis', durationMin: -30 })).toBe('Display-Preis');
  });
});
