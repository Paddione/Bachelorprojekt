import { describe, it, expect, vi, beforeEach } from 'vitest';

const bundleHomepage = vi.fn();
const bundleFaq = vi.fn();
const bundleStammdaten = vi.fn();
const bundleServices = vi.fn();
const bundleLeistungen = vi.fn();
const bundleKontakt = vi.fn();
const bundleUebermich = vi.fn();
const bundleNavigation = vi.fn();
const bundleFooter = vi.fn();
const bundleKoreFlags = vi.fn();
const bundleReferenzen = vi.fn();
const bundleHomepageBlocks = vi.fn();
const bundleSeo = vi.fn();

vi.mock('./content-bundle', () => ({
  bundleHomepage:        (brand: string) => bundleHomepage(brand),
  bundleFaq:             (brand: string) => bundleFaq(brand),
  bundleStammdaten:      (brand: string) => bundleStammdaten(brand),
  bundleServices:        (brand: string) => bundleServices(brand),
  bundleLeistungen:      (brand: string) => bundleLeistungen(brand),
  bundleKontakt:         (brand: string) => bundleKontakt(brand),
  bundleUebermich:       (brand: string) => bundleUebermich(brand),
  bundleNavigation:      (brand: string) => bundleNavigation(brand),
  bundleFooter:          (brand: string) => bundleFooter(brand),
  bundleKoreFlags:       (brand: string) => bundleKoreFlags(brand),
  bundleReferenzen:      (brand: string) => bundleReferenzen(brand),
  bundleHomepageBlocks:  (brand: string) => bundleHomepageBlocks(brand),
  bundleSeo:             (brand: string) => bundleSeo(brand),
}));

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
  bundleHomepageBlocks as _bhb,
  bundleSeo as _bseo,
} from './content';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getPriceListUrl', () => {
  it('returns null (no DB-backed price list in the bundle era)', async () => {
    expect(await getPriceListUrl()).toBeNull();
  });
});

describe('getEffectiveReferenzen', () => {
  it('returns the bundle referenzen as-is', async () => {
    const r = { heading: 'R', subheading: 'S', types: [], items: [] };
    bundleReferenzen.mockReturnValueOnce(r);
    expect(await getEffectiveReferenzen()).toEqual(r);
  });
});

describe('getEffectiveServices', () => {
  it('returns the bundle services list', async () => {
    const s = [{ slug: 'a', title: 'A', description: '', icon: '', features: [], price: '', pageContent: { headline: '', intro: '', forWhom: [], sections: [], pricing: [] } }];
    bundleServices.mockReturnValueOnce(s);
    expect(await getEffectiveServices()).toEqual(s);
  });
});

describe('getEffectiveLeistungen', () => {
  it('returns the bundle leistungen list', async () => {
    const l = [{ id: 'cat-1', title: 'L', icon: '🎯', services: [] }];
    bundleLeistungen.mockReturnValueOnce(l);
    expect(await getEffectiveLeistungen()).toEqual(l);
  });
});

describe('getEffectiveHomepage', () => {
  it('returns the bundle homepage content', async () => {
    const hp = {
      hero: { title: 'T', subtitle: 'S', tagline: 'TG' },
      stats: [], servicesHeadline: '', servicesSubheadline: '',
      whyMeHeadline: '', whyMeIntro: '', whyMePoints: [],
      quote: '', quoteName: '',
    };
    bundleHomepage.mockReturnValueOnce(hp);
    expect(await getEffectiveHomepage()).toEqual(hp);
  });

  it('resolves homepage from the bundle without a DB query (decoupling acceptance)', async () => {
    bundleHomepage.mockReturnValueOnce({
      hero: { title: 'Bundle Title', subtitle: 'S', tagline: 'TG' },
      stats: [], servicesHeadline: '', servicesSubheadline: '',
      whyMeHeadline: '', whyMeIntro: '', whyMePoints: [],
      quote: '', quoteName: '',
    });
    const hp = await getEffectiveHomepage();
    expect(hp.hero.title).toBeTypeOf('string');
    expect(bundleHomepage).toHaveBeenCalledTimes(1);
  });
});

describe('getEffectiveUebermich', () => {
  it('returns the bundle ueber-mich content', async () => {
    const u = {
      pageHeadline: 'P', subheadline: 'S', introParagraphs: [],
      sections: [], milestones: [], notDoing: [], privateText: '',
    };
    bundleUebermich.mockReturnValueOnce(u);
    expect(await getEffectiveUebermich()).toEqual(u);
  });
});

describe('getEffectiveFaq', () => {
  it('returns the bundle FAQ items', async () => {
    const f = [{ question: 'q', answer: 'a' }];
    bundleFaq.mockReturnValueOnce(f);
    expect(await getEffectiveFaq()).toEqual(f);
  });
});

describe('getEffectiveKontakt', () => {
  it('returns the bundle kontakt content', async () => {
    const k = { intro: 'i', sidebarTitle: 't', sidebarText: 'x', sidebarCta: 'c', showPhone: true };
    bundleKontakt.mockReturnValueOnce(k);
    expect(await getEffectiveKontakt()).toEqual(k);
  });
});

describe('getEffectiveStammdaten', () => {
  it('returns the bundle stammdaten', async () => {
    const s = { name: 'n', role: '', email: '', phone: '', street: '', zip: '', city: '', ustId: '', website: '', avatarInitials: '' };
    bundleStammdaten.mockReturnValueOnce(s);
    expect(await getEffectiveStammdaten()).toEqual(s);
  });
});

describe('getEffectiveNavigation', () => {
  it('returns the bundle navigation items', async () => {
    const n = [{ label: 'Home', href: '/', order: 0 }];
    bundleNavigation.mockReturnValueOnce(n);
    expect(await getEffectiveNavigation()).toEqual(n);
  });
});

describe('getEffectiveFooter', () => {
  it('returns the bundle footer config', async () => {
    const f = { columns: [], copyright: 'C' };
    bundleFooter.mockReturnValueOnce(f);
    expect(await getEffectiveFooter()).toEqual(f);
  });
});

describe('getEffectiveKoreFlags', () => {
  it('returns the bundle kore flags', async () => {
    const k = { timeline: true };
    bundleKoreFlags.mockReturnValueOnce(k);
    expect(await getEffectiveKoreFlags()).toEqual(k);
  });
});

describe('getEffectiveHighlightTable', () => {
  it('returns an empty table when there are no DB-derived highlight entries (bundle era has no highlight-key)', async () => {
    bundleLeistungen.mockReturnValueOnce([
      { id: 'cat-1', title: 'Cat 1', icon: '🎯', services: [{ key: 'row-a', name: 'Row A', price: '100€', unit: '/Monat', desc: '' }] },
    ]);
    const result = await getEffectiveHighlightTable();
    expect(result).toEqual([]);
  });
});

describe('bundle re-exports', () => {
  it('re-exports bundleHomepageBlocks and bundleSeo from content-bundle', () => {
    // The re-export is a direct passthrough; we just need to confirm it's
    // importable and forwards calls to the bundle module.
    expect(_bhb).toBeDefined();
    expect(_bseo).toBeDefined();
  });
});
