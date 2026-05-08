import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { SYSTEM_TEST_TEMPLATES, resolveDomain } from './system-test-seed-data';

const REQUIRED_REQ_IDS = [
  ...Array.from({ length: 15 }, (_, i) => `A-${String(i + 1).padStart(2, '0')}`),
  ...Array.from({ length: 11 }, (_, i) => `B-${String(i + 1).padStart(2, '0')}`),
  ...Array.from({ length: 13 }, (_, i) => `C-${String(i + 1).padStart(2, '0')}`),
];

const EXPECTED_STEP_COUNTS = [6, 10, 5, 5, 5, 12, 16, 14, 5, 10, 7, 8];

describe('system-test-seed-data', () => {
  it('exports exactly 12 templates', () => {
    expect(SYSTEM_TEST_TEMPLATES).toHaveLength(12);
  });

  it('per-category step counts match the spec', () => {
    const counts = SYSTEM_TEST_TEMPLATES.map(t => t.steps.length);
    expect(counts).toEqual(EXPECTED_STEP_COUNTS);
  });

  it('totals 103 steps across all templates', () => {
    const total = SYSTEM_TEST_TEMPLATES.reduce((sum, t) => sum + t.steps.length, 0);
    expect(total).toBe(103);
  });

  it('every template has non-empty title/description/instructions', () => {
    for (const t of SYSTEM_TEST_TEMPLATES) {
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.instructions.length).toBeGreaterThan(0);
    }
  });

  it('every step has non-empty question_text and expected_result', () => {
    for (const t of SYSTEM_TEST_TEMPLATES) {
      for (const s of t.steps) {
        expect(s.question_text.length).toBeGreaterThan(0);
        expect(s.expected_result.length).toBeGreaterThan(0);
      }
    }
  });

  it('every step has a valid test_role', () => {
    for (const t of SYSTEM_TEST_TEMPLATES) {
      for (const s of t.steps) {
        expect(['admin', 'user']).toContain(s.test_role);
      }
    }
  });

  it('every step URL is either a relative admin/portal path or an absolute https URL', () => {
    for (const t of SYSTEM_TEST_TEMPLATES) {
      for (const s of t.steps) {
        const ok = s.test_function_url.startsWith('/') || s.test_function_url.startsWith('https://');
        expect(ok, `bad URL in template "${t.title}": ${s.test_function_url}`).toBe(true);
      }
    }
  });

  it('covers every bookkeeping requirement (A-01..A-15, B-01..B-11, C-01..C-13)', () => {
    const allText = SYSTEM_TEST_TEMPLATES.flatMap(t =>
      t.steps.flatMap(s => [s.question_text, s.expected_result, s.req_ids?.join(',') ?? '']),
    ).join('\n');
    const missing = REQUIRED_REQ_IDS.filter(id => !allText.includes(id));
    expect(missing, `missing requirement coverage: ${missing.join(', ')}`).toEqual([]);
  });

  describe('resolveDomain()', () => {
    let originalDomain: string | undefined;
    beforeEach(() => { originalDomain = process.env.PROD_DOMAIN; });
    afterEach(() => {
      if (originalDomain === undefined) delete process.env.PROD_DOMAIN;
      else process.env.PROD_DOMAIN = originalDomain;
    });

    it('falls back to "localhost" when PROD_DOMAIN is unset', () => {
      delete process.env.PROD_DOMAIN;
      expect(resolveDomain()).toBe('localhost');
    });

    it('returns PROD_DOMAIN when set', () => {
      process.env.PROD_DOMAIN = 'mentolder.de';
      expect(resolveDomain()).toBe('mentolder.de');
    });

    it('falls back to "localhost" when PROD_DOMAIN is empty string', () => {
      process.env.PROD_DOMAIN = '';
      expect(resolveDomain()).toBe('localhost');
    });
  });
});
