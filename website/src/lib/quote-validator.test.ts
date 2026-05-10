import { describe, test, expect } from 'vitest';
import { validateQuoteLength, MAX_QUOTE_CHARS } from './quote-validator';

describe('quote-validator', () => {
  test('exposes the threshold as a constant', () => {
    expect(MAX_QUOTE_CHARS).toBe(280);
  });

  test('text shorter than the source is fine (paraphrase)', () => {
    const source =
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. ' +
      'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';
    const candidate = 'Some thoughts about lorem.';
    expect(validateQuoteLength({ source, candidate })).toEqual({ ok: true });
  });

  test('a verbatim quote up to 280 chars is allowed', () => {
    const slice = 'a'.repeat(280);
    const source = `prefix ${slice} suffix`;
    expect(validateQuoteLength({ source, candidate: slice })).toEqual({ ok: true });
  });

  test('a verbatim quote longer than 280 chars is rejected', () => {
    const slice = 'a'.repeat(281);
    const source = `prefix ${slice} suffix`;
    const r = validateQuoteLength({ source, candidate: slice });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.violation.kind).toBe('quote_too_long');
      expect(r.violation.matchedChars).toBe(281);
    }
  });

  test('detects a long verbatim run inside otherwise-paraphrased text', () => {
    const longRun = 'b'.repeat(290);
    const source = `… ${longRun} …`;
    const candidate = `Background: ${longRun} (ende)`;
    const r = validateQuoteLength({ source, candidate });
    expect(r.ok).toBe(false);
  });

  test('case-insensitive whitespace-tolerant matching', () => {
    const source = 'Eine kraftvolle Reflexion entsteht oft erst, wenn der Klient gefragt wird.';
    const candidate = 'eine  kraftvolle reflexion entsteht oft erst, wenn der klient gefragt wird.';
    expect(validateQuoteLength({ source, candidate }).ok).toBe(true);
  });
});
