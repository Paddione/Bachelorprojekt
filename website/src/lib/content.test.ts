import { describe, it, expect, vi, beforeEach } from 'vitest';

const getServiceConfig = vi.fn();
const getLeistungenConfig = vi.fn();
const getSiteSetting = vi.fn();
const getReferenzen = vi.fn();
const getHomepageContent = vi.fn();
const getUebermichContent = vi.fn();
const getFaqContent = vi.fn();
const getKontaktContent = vi.fn();
const getJsonSetting = vi.fn();

vi.mock('./website-db', () => ({
  getServiceConfig: (...a: unknown[]) => getServiceConfig(...a),
  getLeistungenConfig: (...a: unknown[]) => getLeistungenConfig(...a),
  getSiteSetting: (...a: unknown[]) => getSiteSetting(...a),
  getReferenzen: (...a: unknown[]) => getReferenzen(...a),
  getHomepageContent: (...a: unknown[]) => getHomepageContent(...a),
  getUebermichContent: (...a: unknown[]) => getUebermichContent(...a),
  getFaqContent: (...a: unknown[]) => getFaqContent(...a),
  getKontaktContent: (...a: unknown[]) => getKontaktContent(...a),
  getJsonSetting: (...a: unknown[]) => getJsonSetting(...a),
  NAV_KEY: 'navigation',
  FOOTER_KEY: 'footer',
  STAMMDATEN_KEY: 'stammdaten',
  KORE_FLAGS_KEY: 'kore_flags',
  PRICING_HIGHLIGHT_KEY: 'pricing_highlight',
}));

import { config } from '../config/index';
import {
  getPriceListUrl,
  getEffectiveReferenzen,
  getEffectiveServices,
  getEffectiveLeistungen,
  getEffectiveHomepage,
  getEffectiveUebermich,
  getEffectiveFaq,
  getEffectiveKontakt,
  getEffectiveStammdaten,
  getEffectiveNavigation,
  getEffectiveFooter,
  getEffectiveKoreFlags,
  getEffectiveHighlightTable,
} from './content';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getPriceListUrl', () => {
  it('returns the DB value when present', async () => {
    getSiteSetting.mockResolvedValueOnce('https://example.com/prices.pdf');
    expect(await getPriceListUrl()).toBe('https://example.com/prices.pdf');
  });

  it('returns null when the DB call rejects', async () => {
    getSiteSetting.mockRejectedValueOnce(new Error('db down'));
    expect(await getPriceListUrl()).toBeNull();
  });
});

describe('getEffectiveReferenzen', () => {
  it('returns DB referenzen when present', async () => {
    const db = { types: [{ id: 't1', label: 'Type 1' }], items: [] };
    getReferenzen.mockResolvedValueOnce(db);
    expect(await getEffectiveReferenzen()).toEqual(db);
  });

  it('falls back to static config when DB returns null', async () => {
    getReferenzen.mockResolvedValueOnce(null);
    expect(await getEffectiveReferenzen()).toEqual(config.referenzen ?? { types: [], items: [] });
  });

  it('falls back to static config when DB call rejects', async () => {
    getReferenzen.mockRejectedValueOnce(new Error('db down'));
    expect(await getEffectiveReferenzen()).toEqual(config.referenzen ?? { types: [], items: [] });
  });
});

describe('getEffectiveServices', () => {
  it('returns the static services list when there are no overrides', async () => {
    getServiceConfig.mockResolvedValueOnce(null);
    expect(await getEffectiveServices()).toEqual(config.services);
  });

  it('merges an override onto a matching static service (no leistungCategoryId, no pageContent override)', async () => {
    const staticSvc = config.services[0];
    getServiceConfig.mockResolvedValueOnce([
      { slug: staticSvc.slug, title: 'Overridden Title', features: ['x'], hidden: true, meta: 'New!' },
    ]);
    getLeistungenConfig.mockResolvedValueOnce(null);

    const result = await getEffectiveServices();
    const merged = result.find((s) => s.slug === staticSvc.slug)!;
    expect(merged.title).toBe('Overridden Title');
    expect(merged.description).toBe(staticSvc.description);
    expect(merged.features).toEqual(['x']);
    expect(merged.hidden).toBe(true);
    expect(merged.meta).toBe('New!');
    // price falls back to the static price since no leistungCategoryId/price override given
    expect(merged.price).toBe(staticSvc.price);
    // pageContent falls through to static, with tiersFor(o, svc.pageContent.pricing) === static pricing
    expect(merged.pageContent.pricing).toEqual(staticSvc.pageContent.pricing);
  });

  it('derives headline price and detail tiers from a matched leistungCategoryId', async () => {
    const staticSvc = config.services[0];
    getServiceConfig.mockResolvedValueOnce([
      { slug: staticSvc.slug, features: [], leistungCategoryId: 'cat-1', headlineKey: 'row-a', headlinePrefix: true },
    ]);
    getLeistungenConfig.mockResolvedValueOnce([
      {
        id: 'cat-1',
        title: 'Cat 1',
        services: [
          { key: 'row-a', name: 'Row A', price: '100€', unit: '/Monat', highlight: true },
          { key: 'row-b', name: 'Row B', price: '50€' },
        ],
      },
    ]);

    const result = await getEffectiveServices();
    const merged = result.find((s) => s.slug === staticSvc.slug)!;
    expect(merged.price).toBe('ab 100€ /Monat');
    expect(merged.pageContent.pricing).toEqual([
      { label: 'Row A', price: '100€', unit: '/Monat', highlight: true },
      { label: 'Row B', price: '50€', unit: '', highlight: false },
    ]);
  });

  it('applies pageContent override fields when pageContent is present', async () => {
    const staticSvc = config.services[0];
    getServiceConfig.mockResolvedValueOnce([
      {
        slug: staticSvc.slug,
        features: [],
        pageContent: {
          headline: 'New headline',
          intro: 'New intro',
          forWhom: ['Everyone'],
          sections: [{ title: 'S', items: ['a'] }],
          faq: [{ question: 'Q?', answer: 'A.' }],
          faqTitle: 'FAQ Title',
        },
      },
    ]);
    getLeistungenConfig.mockResolvedValueOnce(null);

    const result = await getEffectiveServices();
    const merged = result.find((s) => s.slug === staticSvc.slug)!;
    expect(merged.pageContent.headline).toBe('New headline');
    expect(merged.pageContent.intro).toBe('New intro');
    expect(merged.pageContent.forWhom).toEqual(['Everyone']);
    expect(merged.pageContent.sections).toEqual([{ title: 'S', items: ['a'] }]);
    expect(merged.pageContent.faq).toEqual([{ question: 'Q?', answer: 'A.' }]);
    expect(merged.pageContent.faqTitle).toBe('FAQ Title');
    // pricing not in the override pageContent -> falls back to static pricing (tiersFor branch)
    expect(merged.pageContent.pricing).toEqual(staticSvc.pageContent.pricing);
  });

  it('creates an admin-only card for an override with no matching static slug', async () => {
    getServiceConfig.mockResolvedValueOnce([
      { slug: 'brand-new-service', features: ['f1'], title: 'New Service' },
    ]);
    getLeistungenConfig.mockResolvedValueOnce(null);

    const result = await getEffectiveServices();
    const created = result.find((s) => s.slug === 'brand-new-service')!;
    expect(created).toBeDefined();
    expect(created.title).toBe('New Service');
    expect(created.icon).toBe('✨');
    expect(created.pageContent.headline).toBe('New Service');
    expect(created.pageContent.forWhom).toEqual([]);
    expect(created.pageContent.pricing).toEqual([]);
  });

  it('appends static services that have no override entry, after the override-driven ones', async () => {
    const staticSvc = config.services[0];
    getServiceConfig.mockResolvedValueOnce([
      { slug: staticSvc.slug, features: [] },
    ]);
    getLeistungenConfig.mockResolvedValueOnce(null);

    const result = await getEffectiveServices();
    const remainingStaticSlugs = config.services.slice(1).map((s) => s.slug);
    const tailSlugs = result.slice(1).map((s) => s.slug);
    expect(tailSlugs).toEqual(remainingStaticSlugs);
  });
});

describe('getEffectiveLeistungen', () => {
  it('returns static leistungen when there are no overrides', async () => {
    getLeistungenConfig.mockResolvedValueOnce(null);
    expect(await getEffectiveLeistungen()).toEqual(config.leistungen);
  });

  it('leaves a category untouched when no override matches its id', async () => {
    getLeistungenConfig.mockResolvedValueOnce([{ id: 'nonexistent-cat', title: 'X' }]);
    const result = await getEffectiveLeistungen();
    expect(result).toEqual(config.leistungen);
  });

  it('merges category-level and service-level overrides', async () => {
    const cat = config.leistungen[0];
    const svc = cat.services[0];
    getLeistungenConfig.mockResolvedValueOnce([
      {
        id: cat.id,
        title: 'Overridden Category Title',
        services: [{ key: svc.key, name: 'Overridden Name', price: '999€' }],
      },
    ]);
    const result = await getEffectiveLeistungen();
    const mergedCat = result.find((c) => c.id === cat.id)!;
    expect(mergedCat.title).toBe('Overridden Category Title');
    expect(mergedCat.icon).toBe(cat.icon);
    const mergedSvc = mergedCat.services.find((s) => s.key === svc.key)!;
    expect(mergedSvc.name).toBe('Overridden Name');
    expect(mergedSvc.price).toBe('999€');
    expect(mergedSvc.unit).toBe(svc.unit);
  });

  it('leaves an individual service untouched when no service-override matches its key', async () => {
    const cat = config.leistungen[0];
    getLeistungenConfig.mockResolvedValueOnce([
      { id: cat.id, services: [{ key: 'nonexistent-key', name: 'Nope' }] },
    ]);
    const result = await getEffectiveLeistungen();
    const mergedCat = result.find((c) => c.id === cat.id)!;
    expect(mergedCat.services).toEqual(cat.services);
  });
});

describe('getEffectiveHomepage', () => {
  it('returns a hardcoded fallback hero when no DB content exists', async () => {
    getHomepageContent.mockResolvedValueOnce(null);
    const result = await getEffectiveHomepage();
    expect(result.hero.title).toBe('Digital Coach & Führungskräfte-Mentor –');
    expect(result.stats).toEqual(config.homepage.stats);
    expect(result.processSteps?.length).toBe(4);
  });

  it('merges DB homepage content, filling gaps from static config', async () => {
    getHomepageContent.mockResolvedValueOnce({
      hero: { title: 'DB Title', subtitle: 'DB Sub', tagline: 'DB Tag' },
      stats: [{ value: '1', label: 'one' }],
      servicesHeadline: 'DB Headline',
      servicesSubheadline: 'DB Sub2',
      whyMeHeadline: 'DB WhyMe',
      whyMeIntro: 'DB Intro',
      whyMePoints: [{ title: 'Point 1', text: 'Text 1' }],
      quote: 'DB Quote',
      quoteName: 'DB Quoter',
    });
    const result = await getEffectiveHomepage();
    // hero.titleEmphasis missing in DB -> falls back to hardcoded default
    expect(result.hero.titleEmphasis).toBe('der Mensch und Technologie wieder verbindet.');
    expect(result.hero.title).toBe('DB Title');
    // avatarType/Src/Initials absent in DB -> fall back to static config
    expect(result.avatarType).toBe(config.homepage.avatarType);
    expect(result.avatarSrc).toBe(config.homepage.avatarSrc);
    expect(result.avatarInitials).toBe(config.homepage.avatarInitials);
    // whyMePoints is an array -> iconPath is filled in from static config by index
    expect(result.whyMePoints[0].title).toBe('Point 1');
    expect(result.whyMePoints[0].iconPath).toBe(config.homepage.whyMePoints[0]?.iconPath);
    // processSteps absent in DB -> falls back to the hardcoded default
    expect(result.processSteps?.length).toBe(4);
    expect(result.processEyebrow).toBe('So arbeiten wir');
  });

  it('falls back to static whyMePoints when DB whyMePoints is not an array', async () => {
    getHomepageContent.mockResolvedValueOnce({
      hero: { title: 'DB Title', subtitle: 'DB Sub', tagline: 'DB Tag' },
      stats: [],
      servicesHeadline: '', servicesSubheadline: '',
      whyMeHeadline: '', whyMeIntro: '',
      whyMePoints: undefined,
      quote: '', quoteName: '',
    });
    const result = await getEffectiveHomepage();
    expect(result.whyMePoints).toEqual(
      config.homepage.whyMePoints.map((p) => ({ title: p.title, text: p.text, iconPath: p.iconPath })),
    );
  });
});

describe('getEffectiveUebermich', () => {
  it('returns static content when no DB content exists', async () => {
    getUebermichContent.mockResolvedValueOnce(null);
    expect(await getEffectiveUebermich()).toEqual(config.uebermich);
  });

  it('uses DB fields when they have the expected type, else falls back per-field', async () => {
    getUebermichContent.mockResolvedValueOnce({
      pageHeadline: 'DB Headline',
      subheadline: 123, // wrong type -> falls back
      introParagraphs: ['p1'],
      sections: 'not-an-array', // wrong type -> falls back
      milestones: [{ year: '2020', text: 'x' }],
      notDoing: null, // not an array -> falls back
      privateText: 'DB Private',
      warumdieserName: 'DB Name',
    });
    const result = await getEffectiveUebermich();
    expect(result.pageHeadline).toBe('DB Headline');
    expect(result.subheadline).toBe(config.uebermich.subheadline);
    expect(result.introParagraphs).toEqual(['p1']);
    expect(result.sections).toEqual(config.uebermich.sections);
    expect(result.milestones).toEqual([{ year: '2020', text: 'x' }]);
    expect(result.notDoing).toEqual(config.uebermich.notDoing);
    expect(result.privateText).toBe('DB Private');
    expect(result.warumdieserName).toBe('DB Name');
  });

  it('falls back to static warumdieserName when DB value is nullish', async () => {
    getUebermichContent.mockResolvedValueOnce({
      pageHeadline: 'H', subheadline: 'S', introParagraphs: [], sections: [],
      milestones: [], notDoing: [], privateText: 'P', warumdieserName: undefined,
    });
    const result = await getEffectiveUebermich();
    expect(result.warumdieserName).toBe(config.uebermich.warumdieserName);
  });
});

describe('getEffectiveFaq', () => {
  it('returns DB faq when present', async () => {
    const dbFaq = [{ question: 'Q', answer: 'A' }];
    getFaqContent.mockResolvedValueOnce(dbFaq);
    expect(await getEffectiveFaq()).toEqual(dbFaq);
  });

  it('falls back to static faq when DB returns null', async () => {
    getFaqContent.mockResolvedValueOnce(null);
    expect(await getEffectiveFaq()).toEqual(config.faq);
  });
});

describe('getEffectiveKontakt', () => {
  it('returns DB kontakt when present', async () => {
    const dbKontakt = { ...config.kontakt, heading: 'DB heading' };
    getKontaktContent.mockResolvedValueOnce(dbKontakt);
    expect(await getEffectiveKontakt()).toEqual(dbKontakt);
  });

  it('falls back to static kontakt when DB returns null', async () => {
    getKontaktContent.mockResolvedValueOnce(null);
    expect(await getEffectiveKontakt()).toEqual(config.kontakt);
  });
});

describe('getEffectiveStammdaten', () => {
  it('fills gaps from static contact/legal config when DB is partial', async () => {
    getJsonSetting.mockResolvedValueOnce({ name: 'DB Name' });
    const result = await getEffectiveStammdaten();
    expect(result.name).toBe('DB Name');
    expect(result.email).toBe(config.contact.email);
    expect(result.street).toBe(config.legal.street);
  });

  it('derives avatarInitials from contact name when DB has none and name is set', async () => {
    getJsonSetting.mockResolvedValueOnce(null);
    const result = await getEffectiveStammdaten();
    if (config.contact.name) {
      const parts = config.contact.name.split(/\s+/).filter(Boolean);
      expect(result.avatarInitials).toBe(parts.map((p) => p[0]).join('').toUpperCase().substring(0, 2));
    } else {
      expect(result.avatarInitials).toBe('GK');
    }
  });
});

describe('getEffectiveNavigation', () => {
  it('returns DB navigation when present', async () => {
    const dbNav = [{ label: 'Home', href: '/', order: 0 }];
    getJsonSetting.mockResolvedValueOnce(dbNav);
    expect(await getEffectiveNavigation()).toEqual(dbNav);
  });

  it('falls back to static navigation (with order index) when DB is null', async () => {
    getJsonSetting.mockResolvedValueOnce(null);
    const result = await getEffectiveNavigation();
    expect(result).toEqual(config.navigation.map((n, i) => ({ label: n.label, href: n.href, order: i })));
  });
});

describe('getEffectiveFooter', () => {
  it('returns DB footer when present', async () => {
    const dbFooter = { columns: [], copyright: 'DB copyright' };
    getJsonSetting.mockResolvedValueOnce(dbFooter);
    expect(await getEffectiveFooter()).toEqual(dbFooter);
  });

  it('falls back to static footer when DB is null', async () => {
    getJsonSetting.mockResolvedValueOnce(null);
    const result = await getEffectiveFooter();
    expect(result.columns).toEqual(
      config.footer.columns.map((c) => ({
        heading: c.heading,
        links: c.links.map((l) => ({ label: l.label, href: l.href })),
      })),
    );
  });
});

describe('getEffectiveKoreFlags', () => {
  it('returns DB flags when present', async () => {
    getJsonSetting.mockResolvedValueOnce({ timeline: true });
    expect(await getEffectiveKoreFlags()).toEqual({ timeline: true });
  });

  it('falls back to static config.homepage.timeline when DB is null', async () => {
    getJsonSetting.mockResolvedValueOnce(null);
    expect(await getEffectiveKoreFlags()).toEqual({ timeline: !!config.homepage.timeline });
  });
});

describe('getEffectiveHighlightTable', () => {
  it('resolves DB highlight entries against the leistungen catalog', async () => {
    getLeistungenConfig.mockResolvedValueOnce([
      { id: 'cat-1', services: [{ key: 'row-a', name: 'Row A', price: '100€', unit: '/Monat' }] },
    ]);
    getJsonSetting.mockResolvedValueOnce([
      { catalogKey: 'row-a', note: 'Beliebt', highlight: true },
    ]);
    const result = await getEffectiveHighlightTable();
    expect(result).toEqual([
      { label: 'Row A', price: '100€', unit: '/Monat', note: 'Beliebt', highlight: true },
    ]);
  });

  it('falls back to the static pricing-highlight config when DB entries are absent', async () => {
    getLeistungenConfig.mockResolvedValueOnce(null);
    getJsonSetting.mockResolvedValueOnce(null);
    const result = await getEffectiveHighlightTable();
    const expectedEntries = (config.leistungenPricingHighlight ?? []).map((h) => ({
      label: h.label,
      price: h.price,
      unit: '',
      note: h.note ?? '',
      highlight: h.highlight ?? false,
    }));
    expect(result).toEqual(expectedEntries);
  });

  it('falls back to static config when DB entries is an empty array', async () => {
    getLeistungenConfig.mockResolvedValueOnce(null);
    getJsonSetting.mockResolvedValueOnce([]);
    const result = await getEffectiveHighlightTable();
    expect(result.length).toBe((config.leistungenPricingHighlight ?? []).length);
  });
});
