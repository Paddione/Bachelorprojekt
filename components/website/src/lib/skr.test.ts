import { describe, it, expect } from 'vitest';
import { skrAccountFor } from './skr';

describe('skrAccountFor', () => {
  it('Kleinunternehmer income → 8195', () => {
    expect(skrAccountFor({ taxMode: 'kleinunternehmer', type: 'income', category: 'rechnungsstellung' })).toBe('8195');
  });
  it('Regelbesteuerung income → 8400', () => {
    expect(skrAccountFor({ taxMode: 'regelbesteuerung', type: 'income', category: 'rechnungsstellung' })).toBe('8400');
  });
  it('expense default → 4980', () => {
    expect(skrAccountFor({ taxMode: 'regelbesteuerung', type: 'expense', category: 'misc' })).toBe('4980');
  });
  it('pretax → 1576', () => {
    expect(skrAccountFor({ taxMode: 'regelbesteuerung', type: 'pretax', category: 'misc' })).toBe('1576');
  });
  it('vat_payment → 1780', () => {
    expect(skrAccountFor({ taxMode: 'regelbesteuerung', type: 'vat_payment', category: 'ust-vorauszahlung' })).toBe('1780');
  });
  it('vat_refund → 1781', () => {
    expect(skrAccountFor({ taxMode: 'regelbesteuerung', type: 'vat_refund', category: 'ust-erstattung' })).toBe('1781');
  });
});

describe('skrAccountFor — Plan F accounts', () => {
  it('returns 8338 for eu_b2b_services income', () => {
    expect(skrAccountFor({ taxMode: 'regelbesteuerung', type: 'income', category: 'eu_b2b_services' })).toBe('8338');
  });
  it('returns 8338 for eu_b2b_goods income', () => {
    expect(skrAccountFor({ taxMode: 'regelbesteuerung', type: 'income', category: 'eu_b2b_goods' })).toBe('8338');
  });
  it('returns 8120 for drittland_export income', () => {
    expect(skrAccountFor({ taxMode: 'regelbesteuerung', type: 'income', category: 'drittland_export' })).toBe('8120');
  });
  it('returns 2668 for positive kursdifferenz income', () => {
    expect(skrAccountFor({ taxMode: 'regelbesteuerung', type: 'income', category: 'kursdifferenz_gewinn' })).toBe('2668');
  });
  it('returns 4930 for negative kursdifferenz expense', () => {
    expect(skrAccountFor({ taxMode: 'regelbesteuerung', type: 'expense', category: 'kursdifferenz_verlust' })).toBe('4930');
  });
});
