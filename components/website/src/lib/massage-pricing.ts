import type { LeistungServiceRow } from '../content-schema/pages';

/**
 * Massage-Preismodell OQ-05 (T901430): Preis = Basisstundensatz × Multiplier × Dauer/60.
 *
 * Pures Modul — keine Laufzeit-Importe, nur ein Typ-Import aus dem Content-Schema.
 * Die Berechnung erfolgt beim Rendern; gespeicherte `price`-Labels dienen nur
 * als Fallback für Zeilen ohne nutzbare Dauer (z. B. andere Brands).
 */

/** Basisstundensatz in Cent: 60 Euro pro 60 Minuten. */
export const MASSAGE_BASE_RATE_CENTS = 6000;

/** Wirksamer Multiplier: fehlend, nicht-numerisch, nicht-finite oder ≤ 0 fällt auf 1 zurück. */
export function effectiveMassageMultiplier(multiplier?: number | null): number {
  if (typeof multiplier !== 'number' || !Number.isFinite(multiplier) || multiplier <= 0) {
    return 1;
  }
  return multiplier;
}

/** Preis in Cent, kaufmännisch auf ganze Cent gerundet. */
export function massagePriceCents(durationMin: number, multiplier?: number | null): number {
  return Math.round(
    (MASSAGE_BASE_RATE_CENTS * effectiveMassageMultiplier(multiplier) * durationMin) / 60,
  );
}

const euroFormat = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

/** Formatiert Cent-Beträge als de-DE/EUR-Label (z. B. 3000 → „30,00 €“). */
export function formatEuroCents(cents: number): string {
  return euroFormat.format(cents / 100);
}

/** Preis-Label aus Dauer und Multiplier in einem Schritt. */
export function massagePriceLabel(durationMin: number, multiplier?: number | null): string {
  return formatEuroCents(massagePriceCents(durationMin, multiplier));
}

/** Minimale Zeilenform für die Preisauflösung (Schema- wie Config-Typ erfüllen sie). */
export type MassagePricedRow = Pick<LeistungServiceRow, 'price' | 'durationMin' | 'multiplier'>;

/**
 * Liefert für eine Katalogzeile mit nutzbarer `durationMin` den berechneten
 * Preis und sonst das gespeicherte `price`-Label (andere Brands unverändert).
 */
export function massageRowPriceLabel(row: MassagePricedRow): string {
  const duration = row.durationMin;
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) {
    return row.price;
  }
  return massagePriceLabel(duration, row.multiplier);
}
