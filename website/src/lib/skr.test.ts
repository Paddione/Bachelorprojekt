import { describe, it, expect } from 'vitest';
import { skrAccountFor } from './skr';

describe('skrAccountFor', () => {
  it('maps EU B2B services/goods to 8338', () => {
    expect(skrAccountFor({ type: 'income', category: 'eu_b2b_services', taxMode: 'regelbesteuerung' })).toBe('8338');
    expect(skrAccountFor({ type: 'income', category: 'eu_b2b_goods', taxMode: 'regelbesteuerung' })).toBe('8338');
  });

  it('maps drittland export income to 8120', () => {
    expect(skrAccountFor({ type: 'income', category: 'drittland_export', taxMode: 'regelbesteuerung' })).toBe('8120');
  });

  it('maps kursdifferenz_gewinn to 2668', () => {
    expect(skrAccountFor({ type: 'income', category: 'kursdifferenz_gewinn', taxMode: 'regelbesteuerung' })).toBe('2668');
  });

  it('defaults income to 8195 (kleinunternehmer) or 8400 (regelbesteuerung)', () => {
    expect(skrAccountFor({ type: 'income', category: 'coaching', taxMode: 'kleinunternehmer' })).toBe('8195');
    expect(skrAccountFor({ type: 'income', category: 'coaching', taxMode: 'regelbesteuerung' })).toBe('8400');
  });

  it('maps kursdifferenz_verlust expenses to 4930, other expenses to 4980', () => {
    expect(skrAccountFor({ type: 'expense', category: 'kursdifferenz_verlust', taxMode: 'regelbesteuerung' })).toBe('4930');
    expect(skrAccountFor({ type: 'expense', category: 'office', taxMode: 'regelbesteuerung' })).toBe('4980');
  });

  it('maps pretax, vat_payment, vat_refund to 1576/1780/1781', () => {
    expect(skrAccountFor({ type: 'pretax', category: 'x', taxMode: 'regelbesteuerung' })).toBe('1576');
    expect(skrAccountFor({ type: 'vat_payment', category: 'x', taxMode: 'regelbesteuerung' })).toBe('1780');
    expect(skrAccountFor({ type: 'vat_refund', category: 'x', taxMode: 'regelbesteuerung' })).toBe('1781');
  });

  it('falls through to 4980 for unknown types', () => {
    expect(skrAccountFor({ type: 'mystery', category: 'x', taxMode: 'regelbesteuerung' })).toBe('4980');
  });
});
