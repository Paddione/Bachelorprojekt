import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getEffectiveCoaching, type CoachingContent } from './coaching-content';

const DEFAULT: CoachingContent = {
  subheadline: 'Coaching & Begleitung',
  headline: 'Gemeinsam weiter.',
  intro: 'Coaching bedeutet für mich: auf Augenhöhe arbeiten, ehrlich sein und nachhaltige Veränderung ermöglichen.',
  forWhom: [
    'Führungskräfte in Veränderungsprozessen',
    'Menschen, die beruflich neu ausrichten möchten',
    'Teams, die besser zusammenarbeiten wollen',
  ],
  process: [
    { step: '01 — Erstgespräch', title: 'Kennenlernen', text: '30 Minuten, kostenlos.' },
  ],
  ctaText: 'Kostenloses Erstgespräch buchen',
  ctaHref: '/termin',
  faq: [],
};

vi.mock('./website-db', () => ({
  getServiceConfig: vi.fn(),
}));

import { getServiceConfig } from './website-db';
const mockGetServiceConfig = getServiceConfig as unknown as ReturnType<typeof vi.fn>;

describe('getEffectiveCoaching', () => {
  beforeEach(() => {
    mockGetServiceConfig.mockReset();
  });
  afterEach(() => {
    mockGetServiceConfig.mockReset();
  });

  it('returns defaults when no service override exists', async () => {
    mockGetServiceConfig.mockResolvedValue([]);
    const out = await getEffectiveCoaching('mentolder');
    expect(out.headline).toBe(DEFAULT.headline);
    expect(out.ctaHref).toBe('/termin');
  });

  it('returns defaults when the coaching slug is not present in the override list', async () => {
    mockGetServiceConfig.mockResolvedValue([
      { slug: 'something-else', pageContent: { headline: 'X' } },
    ]);
    const out = await getEffectiveCoaching('mentolder');
    expect(out.headline).toBe(DEFAULT.headline);
  });

  it('applies headline, intro, forWhom, faq from the override when present', async () => {
    mockGetServiceConfig.mockResolvedValue([
      {
        slug: 'coaching',
        pageContent: {
          headline: 'Mein Coaching',
          intro: 'Individuell und tief.',
          forWhom: ['Leader'],
          faq: [{ question: 'q', answer: 'a' }],
        },
      },
    ]);
    const out = await getEffectiveCoaching('mentolder');
    expect(out.headline).toBe('Mein Coaching');
    expect(out.intro).toBe('Individuell und tief.');
    expect(out.forWhom).toEqual(['Leader']);
    expect(out.faq).toEqual([{ question: 'q', answer: 'a' }]);
  });

  it('derives process steps from sections when sections is non-empty', async () => {
    mockGetServiceConfig.mockResolvedValue([
      {
        slug: 'coaching',
        pageContent: {
          sections: [
            { title: '01 — Kennenlernen', items: ['30 Minuten, kostenlos.'] },
            { title: '02 — Klarheit', items: ['Wir definieren das Ziel.'] },
          ],
        },
      },
    ]);
    const out = await getEffectiveCoaching('mentolder');
    expect(out.process).toHaveLength(2);
    expect(out.process[0].step).toBe('01');
    expect(out.process[0].title).toBe('Kennenlernen');
    expect(out.process[0].text).toBe('30 Minuten, kostenlos.');
  });

  it('falls back to defaults when sections is empty', async () => {
    mockGetServiceConfig.mockResolvedValue([
      { slug: 'coaching', pageContent: { headline: 'X', sections: [] } },
    ]);
    const out = await getEffectiveCoaching('mentolder');
    expect(out.process).toHaveLength(4);
    expect(out.process[0].step).toBe('01 — Erstgespräch');
  });

  it('returns defaults when the DB call throws', async () => {
    mockGetServiceConfig.mockRejectedValue(new Error('db down'));
    const out = await getEffectiveCoaching('mentolder');
    expect(out.headline).toBe(DEFAULT.headline);
  });
});
