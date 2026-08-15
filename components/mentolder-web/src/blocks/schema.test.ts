import { describe, it, expect } from 'vitest';
import { HomepageBlocksDocument, SCHEMA_VERSION } from './schema';

const validHeroBlock = {
  id: 'hero',
  type: 'hero' as const,
  props: {
    title: 'Test Title',
    titleEmphasis: 'Emphasis',
    subtitle: 'A subtitle',
    tagline: 'Tag · Line',
    avatarType: 'initials' as const,
    avatarInitials: 'GK',
    personName: 'Gerald',
    personRole: 'Coach',
  },
};

const validStatsBlock = {
  id: 'stats',
  type: 'stats' as const,
  props: {
    items: [
      { value: '30+', target: 30, label: 'Jahre' },
      { value: 'KI', label: 'Schwerpunkt' },
    ],
  },
};

const validServicesBlock = {
  id: 'services',
  type: 'services' as const,
  props: {
    headline: 'Headline',
    subheadline: 'Subheadline',
    items: [
      {
        id: 'fuehrungs-coaching',
        title: 'Führungs-Coaching',
        description: 'Description',
        features: ['1:1-Sessions', 'Vertraulich'],
        price: 'ab 240',
        priceUnit: 'EUR / 60 min',
        href: '/angebote/fuehrung',
        icon: 'fuehrung' as const,
      },
    ],
  },
};

const validWhyMeBlock = {
  id: 'whyMe',
  type: 'whyMe' as const,
  props: {
    headline: 'Warum mit mir?',
    intro: { prefix: 'Ich ', emphasis: 'verbinde', suffix: ' technische Tiefe.' },
    points: [
      { title: '30+ Jahre', text: 'Vom Teamlead...' },
    ],
    quote: 'Gerald hat es geschafft.',
    quoteName: 'Dr. M. Albers',
    quoteRole: 'CTO · Unternehmen',
  },
};

const validProcessBlock = {
  id: 'process',
  type: 'process' as const,
  props: {
    eyebrow: "So geht's los",
    headline: 'In vier Schritten.',
    steps: [
      { num: '01', title: 'Kennenlernen', text: 'Kostenloses Gespräch.' },
    ],
  },
};

const validFaqBlock = {
  id: 'faq',
  type: 'faq' as const,
  props: {
    title: 'Häufige Fragen',
    items: [
      { question: 'Wie läuft das?', answer: '30 Min, kostenlos.' },
    ],
  },
};

const validCtaBlock = {
  id: 'cta',
  type: 'cta' as const,
  props: {
    eyebrow: 'Bereit?',
    title: 'Lassen Sie uns',
    titleEmphasis: 'herausfinden.',
    subtitle: '30 Minuten.',
    primaryText: 'Termin',
    primaryHref: '/kontakt',
    secondaryText: 'mail@test.de',
    secondaryHref: 'mailto:mail@test.de',
  },
};

const validRichTextBlock = {
  id: 'rt',
  type: 'richText' as const,
  props: { html: '<p>Hello</p>' },
};

const validImageBlock = {
  id: 'img',
  type: 'image' as const,
  props: { src: '/img.png', alt: 'Image' },
};

const validSpacerBlock = {
  id: 'sp',
  type: 'spacer' as const,
  props: { size: 48 },
};

describe('SCHEMA_VERSION', () => {
  it('is exported as a single constant', () => {
    expect(SCHEMA_VERSION).toBe(1);
  });
});

describe('HomepageBlocksDocument', () => {
  it('accepts a hero block', () => {
    const doc = { schemaVersion: 1, blocks: [validHeroBlock] };
    const result = HomepageBlocksDocument.parse(doc);
    expect(result.blocks[0].type).toBe('hero');
  });

  it('accepts a stats block', () => {
    const doc = { schemaVersion: 1, blocks: [validStatsBlock] };
    const result = HomepageBlocksDocument.parse(doc);
    expect(result.blocks[0].type).toBe('stats');
  });

  it('accepts a services block', () => {
    const doc = { schemaVersion: 1, blocks: [validServicesBlock] };
    const result = HomepageBlocksDocument.parse(doc);
    expect(result.blocks[0].type).toBe('services');
  });

  it('accepts a whyMe block with structured intro', () => {
    const doc = { schemaVersion: 1, blocks: [validWhyMeBlock] };
    const result = HomepageBlocksDocument.parse(doc);
    const intro = result.blocks[0].props as { intro: { prefix: string; emphasis: string; suffix: string } };
    expect(intro.intro.prefix).toBe('Ich ');
    expect(intro.intro.emphasis).toBe('verbinde');
    expect(intro.intro.suffix).toBe(' technische Tiefe.');
  });

  it('accepts a process block', () => {
    const doc = { schemaVersion: 1, blocks: [validProcessBlock] };
    const result = HomepageBlocksDocument.parse(doc);
    expect(result.blocks[0].type).toBe('process');
  });

  it('accepts a faq block', () => {
    const doc = { schemaVersion: 1, blocks: [validFaqBlock] };
    const result = HomepageBlocksDocument.parse(doc);
    expect(result.blocks[0].type).toBe('faq');
  });

  it('accepts a cta block', () => {
    const doc = { schemaVersion: 1, blocks: [validCtaBlock] };
    const result = HomepageBlocksDocument.parse(doc);
    expect(result.blocks[0].type).toBe('cta');
  });

  it('accepts generic richText block', () => {
    const doc = { schemaVersion: 1, blocks: [validRichTextBlock] };
    const result = HomepageBlocksDocument.parse(doc);
    expect(result.blocks[0].type).toBe('richText');
  });

  it('accepts generic image block', () => {
    const doc = { schemaVersion: 1, blocks: [validImageBlock] };
    const result = HomepageBlocksDocument.parse(doc);
    expect(result.blocks[0].type).toBe('image');
  });

  it('accepts generic spacer block', () => {
    const doc = { schemaVersion: 1, blocks: [validSpacerBlock] };
    const result = HomepageBlocksDocument.parse(doc);
    expect(result.blocks[0].type).toBe('spacer');
  });

  it('accepts all 10 block types in one document', () => {
    const doc = {
      schemaVersion: 1,
      blocks: [
        validHeroBlock,
        validStatsBlock,
        validServicesBlock,
        validWhyMeBlock,
        validProcessBlock,
        validFaqBlock,
        validCtaBlock,
        validRichTextBlock,
        validImageBlock,
        validSpacerBlock,
      ],
    };
    const result = HomepageBlocksDocument.parse(doc);
    expect(result.blocks).toHaveLength(10);
  });

  it('round-trips through parse and produces equal structure', () => {
    const doc = { schemaVersion: 1, blocks: [validHeroBlock, validFaqBlock] };
    const parsed = HomepageBlocksDocument.parse(doc);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.blocks[0].type).toBe('hero');
    expect(parsed.blocks[1].type).toBe('faq');
  });

  it('rejects unknown service icon', () => {
    const doc = {
      schemaVersion: 1,
      blocks: [{
        ...validServicesBlock,
        props: {
          ...validServicesBlock.props,
          items: [{
            ...validServicesBlock.props.items[0],
            icon: 'unbekannt',
          }],
        },
      }],
    };
    expect(() => HomepageBlocksDocument.parse(doc)).toThrow();
  });

  it('accepts services items with optional meta', () => {
    const doc = {
      schemaVersion: 1,
      blocks: [{
        ...validServicesBlock,
        props: {
          ...validServicesBlock.props,
          items: [{
            ...validServicesBlock.props.items[0],
            meta: 'Extra info',
          }],
        },
      }],
    };
    const result = HomepageBlocksDocument.parse(doc);
    const items = result.blocks[0].props as { items: Array<{ meta?: string }> };
    expect(items.items[0].meta).toBe('Extra info');
  });

  it('accepts services items without optional meta', () => {
    const doc = {
      schemaVersion: 1,
      blocks: [validServicesBlock],
    };
    expect(() => HomepageBlocksDocument.parse(doc)).not.toThrow();
  });
});
