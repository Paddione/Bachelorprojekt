import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getEffectiveFuehrung, type FuehrungContent } from './fuehrung-content';

const DEFAULT: FuehrungContent = {
  subheadline: 'Führung & Persönlichkeit',
  headline: 'Führen aus der Mitte.',
  intro: 'Führung beginnt bei der eigenen Person.',
  introNote: '',
  forWhom: ['Leader'],
  process: [
    { step: '01 — Standortbestimmung', title: 'Wer bin ich als Führungsperson?', text: 'Wir schauen auf Ihre Haltung, Ihre Muster.' },
    { step: '02 — Klarheit', title: 'Was möchte ich verändern?', text: 'Gemeinsam definieren wir, wo Sie hinwollen.' },
    { step: '03 — Begleitung', title: 'Der Weg dorthin', text: 'Individuelle Sessions.' },
    { step: '04 — Transfer', title: 'Wirkung in der Praxis', text: 'Was Sie hier entwickeln, wirkt in Ihrem Alltag.' },
  ],
  ctaText: 'Kostenloses Erstgespräch buchen',
  ctaHref: '/termin',
  faq: [],
};

vi.mock('./website-db', () => ({
  getServiceConfig: vi.fn(),
}));

import { getServiceConfig } from './website-db';
const mockGet = getServiceConfig as unknown as ReturnType<typeof vi.fn>;

describe('getEffectiveFuehrung', () => {
  beforeEach(() => mockGet.mockReset());
  afterEach(() => mockGet.mockReset());

  it('returns defaults when no service override exists', async () => {
    mockGet.mockResolvedValue([]);
    const out = await getEffectiveFuehrung('mentolder');
    expect(out.headline).toBe(DEFAULT.headline);
  });

  it('returns defaults when the fuehrung slug is not in the override list', async () => {
    mockGet.mockResolvedValue([{ slug: 'other', pageContent: { headline: 'X' } }]);
    const out = await getEffectiveFuehrung('mentolder');
    expect(out.headline).toBe(DEFAULT.headline);
  });

  it('applies headline/intro/forWhom/faq from the override', async () => {
    mockGet.mockResolvedValue([
      {
        slug: 'fuehrung-persoenlichkeit',
        pageContent: {
          headline: 'Mein Führungs-Coaching',
          intro: 'Individuell.',
          forWhom: ['C-Level'],
          faq: [{ question: 'q', answer: 'a' }],
        },
      },
    ]);
    const out = await getEffectiveFuehrung('mentolder');
    expect(out.headline).toBe('Mein Führungs-Coaching');
    expect(out.intro).toBe('Individuell.');
    expect(out.forWhom).toEqual(['C-Level']);
    expect(out.faq).toEqual([{ question: 'q', answer: 'a' }]);
  });

  it('derives process steps from sections when sections is non-empty', async () => {
    mockGet.mockResolvedValue([
      {
        slug: 'fuehrung-persoenlichkeit',
        pageContent: {
          sections: [
            { title: '01 — Erstgespräch', items: ['30 Minuten.'] },
          ],
        },
      },
    ]);
    const out = await getEffectiveFuehrung('mentolder');
    expect(out.process).toHaveLength(1);
    expect(out.process[0].step).toBe('01');
    expect(out.process[0].title).toBe('Erstgespräch');
  });

  it('falls back to defaults when sections is empty', async () => {
    mockGet.mockResolvedValue([
      { slug: 'fuehrung-persoenlichkeit', pageContent: { sections: [] } },
    ]);
    const out = await getEffectiveFuehrung('mentolder');
    expect(out.process).toHaveLength(DEFAULT.process.length);
  });

  it('returns defaults when DB throws', async () => {
    mockGet.mockRejectedValue(new Error('boom'));
    const out = await getEffectiveFuehrung('mentolder');
    expect(out.headline).toBe(DEFAULT.headline);
  });
});
