import { it, expect } from 'vitest';
import { resolveCustomerTaxCategory, isVorsteuerEligible } from './billing-tax';

it('DE → S regardless of vatNumber', () => {
  expect(resolveCustomerTaxCategory('DE', undefined)).toBe('S');
  expect(resolveCustomerTaxCategory('DE', 'DE123456789')).toBe('S');
});

it('EU + vatNumber → AE (reverse charge §13b UStG)', () => {
  expect(resolveCustomerTaxCategory('FR', 'FR12345678901')).toBe('AE');
  expect(resolveCustomerTaxCategory('AT', 'ATU12345678')).toBe('AE');
});

it('EU + no vatNumber → S (private EU customer)', () => {
  expect(resolveCustomerTaxCategory('FR', undefined)).toBe('S');
  expect(resolveCustomerTaxCategory('IT', '')).toBe('S');
});

it('non-EU → Z (zero-rated export)', () => {
  expect(resolveCustomerTaxCategory('US', 'US123456789')).toBe('Z');
  expect(resolveCustomerTaxCategory('CH', undefined)).toBe('Z');
  expect(resolveCustomerTaxCategory('CN', undefined)).toBe('Z');
});

it('isVorsteuerEligible: DE and EU → true', () => {
  expect(isVorsteuerEligible('DE')).toBe(true);
  expect(isVorsteuerEligible('FR')).toBe(true);
  expect(isVorsteuerEligible('PL')).toBe(true);
  expect(isVorsteuerEligible('SK')).toBe(true);
});

it('isVorsteuerEligible: non-EU → false', () => {
  expect(isVorsteuerEligible('US')).toBe(false);
  expect(isVorsteuerEligible('CH')).toBe(false);
  expect(isVorsteuerEligible('CN')).toBe(false);
  expect(isVorsteuerEligible('GB')).toBe(false);
});
