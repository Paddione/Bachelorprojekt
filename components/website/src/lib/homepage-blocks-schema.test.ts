import { describe, it, expect } from 'vitest';
import {
  HomepageBlocksDocument,
  SCHEMA_VERSION,
  BLOCK_TYPES,
  validateHomepageDocument,
} from './homepage-blocks-schema';

// Canonical block-type literals. This list MUST stay in lock-step with the
// React source of truth `mentolder-web/src/blocks/schema.ts`. The server copy
// here (zod v4) and the React copy (zod v3) live in separate packages, so we
// anchor parity on this documented set rather than a fragile cross-package
// import across a zod major-version split. Adding/removing a block type means
// editing both files AND this list — the assertions below fail otherwise.
const EXPECTED_BLOCK_TYPES = [
  'hero',
  'stats',
  'services',
  'whyMe',
  'process',
  'faq',
  'cta',
  'richText',
  'image',
  'spacer',
] as const;

// A representative document mirroring the shape of `homepageSeed`
// (mentolder-web/src/blocks/seed.ts) — used to prove the server schema accepts
// the same documents the React app produces.
const seedLikeDocument = {
  schemaVersion: 1,
  blocks: [
    {
      id: 'hero',
      type: 'hero',
      props: {
        title: 'Digital Coach',
        titleEmphasis: 'der verbindet.',
        subtitle: 'Ich kenne beide Welten.',
        tagline: 'Praxisnah. Strukturiert.',
        avatarType: 'image',
        avatarSrc: '/gerald.jpg',
        personName: 'Gerald Korczewski',
        personRole: 'Digital Coach & Mentor',
      },
    },
    {
      id: 'stats',
      type: 'stats',
      props: {
        items: [
          { value: '30+', target: 30, label: 'Jahre Führungserfahrung' },
          { value: 'KI', label: 'Pionier der ersten Stunde' },
        ],
      },
    },
    {
      id: 'services',
      type: 'services',
      props: {
        headline: 'Meine Angebote',
        subheadline: 'Sie suchen jemanden, der verbindet?',
        items: [
          {
            id: 'coaching',
            title: 'Coaching',
            description: 'Strategisch gestalten.',
            features: ['Profil-Schärfung', 'Sparring'],
            price: 'nach Vereinbarung',
            priceUnit: '',
            href: '/leistungen/coaching',
            icon: 'fuehrung',
          },
        ],
      },
    },
    {
      id: 'whyMe',
      type: 'whyMe',
      props: {
        headline: 'Warum ich?',
        intro: { prefix: 'Ich kenne ', emphasis: '40 Jahre', suffix: ' Strukturen.' },
        points: [{ title: 'Pionier', text: 'Nicht Nachahmer.' }],
        quote: 'Ich stelle unbequeme Fragen.',
        quoteName: 'Gerald Korczewski',
        quoteRole: 'Coach',
      },
    },
    {
      id: 'process',
      type: 'process',
      props: {
        eyebrow: 'So arbeiten wir',
        headline: 'Vier ruhige Schritte.',
        steps: [{ num: '01', title: 'Kennenlernen', text: '30 Minuten, kostenlos.' }],
      },
    },
    {
      id: 'faq',
      type: 'faq',
      props: {
        title: 'Häufig gestellte Fragen',
        items: [{ question: 'Für wen?', answer: 'Für alle.' }],
      },
    },
    {
      id: 'cta',
      type: 'cta',
      props: {
        eyebrow: 'Kostenloses Erstgespräch',
        title: 'In 30 Minuten wissen wir,',
        titleEmphasis: 'ob es passt.',
        subtitle: 'Kein Druck. Nur Klarheit.',
        primaryText: 'Termin vorschlagen',
        primaryHref: '/kontakt',
        secondaryText: 'mail@mentolder.de',
        secondaryHref: 'mailto:mail@mentolder.de',
      },
    },
  ],
};

describe('homepage-blocks-schema (server copy)', () => {
  it('exports SCHEMA_VERSION === 1 (parity with React schema)', () => {
    expect(SCHEMA_VERSION).toBe(1);
  });

  it('exposes exactly the canonical block-type literals', () => {
    expect([...BLOCK_TYPES].sort()).toEqual([...EXPECTED_BLOCK_TYPES].sort());
  });

  it('accepts a homepageSeed-shaped document', () => {
    const result = HomepageBlocksDocument.safeParse(seedLikeDocument);
    expect(result.success).toBe(true);
  });

  it('rejects a document with an unknown block type', () => {
    const bad = {
      schemaVersion: 1,
      blocks: [{ id: 'x', type: 'unknownBlock', props: {} }],
    };
    expect(HomepageBlocksDocument.safeParse(bad).success).toBe(false);
  });

  it('rejects a services block with an unknown icon', () => {
    const bad = {
      schemaVersion: 1,
      blocks: [
        {
          id: 'services',
          type: 'services',
          props: {
            headline: 'h',
            subheadline: 's',
            items: [
              {
                id: 'a',
                title: 't',
                description: 'd',
                features: [],
                price: 'p',
                href: '/x',
                icon: 'nope',
              },
            ],
          },
        },
      ],
    };
    expect(HomepageBlocksDocument.safeParse(bad).success).toBe(false);
  });

  describe('validateHomepageDocument', () => {
    it('returns ok:true with the parsed document for a valid payload', () => {
      const r = validateHomepageDocument(seedLikeDocument);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.document.blocks).toHaveLength(7);
    });

    it('returns ok:false with field errors for an invalid payload', () => {
      const r = validateHomepageDocument({ schemaVersion: 1, blocks: [{ id: 'x', type: 'hero', props: {} }] });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(Array.isArray(r.errors)).toBe(true);
        expect(r.errors.length).toBeGreaterThan(0);
        expect(r.errors[0]).toHaveProperty('path');
        expect(r.errors[0]).toHaveProperty('message');
      }
    });
  });
});
