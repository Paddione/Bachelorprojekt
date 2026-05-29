import { describe, it, expect } from 'vitest';
import { serviceSchema } from './service';

// Fields the bespoke CoachingSection/FuehrungSection editors bind to on their data object.
// Extracted from:
// - CoachingSection.svelte: bind:value on subheadline, headline, intro, forWhom, ctaText, ctaHref, faq
// - FuehrungSection.svelte: bind:value on subheadline, headline, intro, introNote, forWhom, ctaText, ctaHref, faq
// Both also bind to nested items within process (step, title, text) and faq (question, answer).
const BESPOKE_FIELDS = [
  'subheadline',
  'headline',
  'intro',
  'introNote',
  'forWhom',
  'process',
  'ctaText',
  'ctaHref',
  'faq',
];

describe('serviceSchema equivalence', () => {
  it('covers every field the bespoke editors had', () => {
    const keys = serviceSchema.fields.map((f) => f.key);
    for (const f of BESPOKE_FIELDS) {
      expect(keys, `serviceSchema missing field: ${f}`).toContain(f);
    }
  });
});
