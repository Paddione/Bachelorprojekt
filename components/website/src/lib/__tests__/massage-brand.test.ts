import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { massageConfig } from '../../config/brands/massage';
import { loadDomain } from '../content-bundle';

const here = dirname(fileURLToPath(import.meta.url));
const contentDir = join(here, '../../../content/massage');

// Erwartete OQ-05-Labels, direkt aus dem Plattform-Formatter (unabhängig vom Helper).
const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const EUR_30 = eur.format(30);
const EUR_60 = eur.format(60);
const EUR_90 = eur.format(90);

const BUNDLE_FILES = [
  'seo.json',
  'homepage.json',
  'leistungen.json',
  'faq.json',
  'kontakt.json',
  'navigation.json',
  'footer.json',
  'stammdaten.json',
  'ueber-mich.json',
] as const;

function readRaw(name: string): string {
  return readFileSync(join(contentDir, name), 'utf8');
}

describe('massage BrandConfig', () => {
  it('carries every Pflichtfeld with non-empty collections', () => {
    expect(massageConfig.brand).toBe('massage');
    expect(massageConfig.meta.siteTitle).toBe('Massagepraxis Vögelsen');
    expect(massageConfig.meta.siteDescription.length).toBeGreaterThan(0);
    expect(massageConfig.contact.city.length).toBeGreaterThan(0);
    expect(massageConfig.legal.tagline).toBe('Massagepraxis Vögelsen');
    expect(massageConfig.navigation.length).toBe(4);
    expect(massageConfig.footer.columns.length).toBe(1);
    expect(massageConfig.homepage.stats.length).toBeGreaterThan(0);
    expect(massageConfig.homepage.whyMePoints.length).toBeGreaterThan(0);
    expect(massageConfig.services.length).toBe(2);
    expect(massageConfig.leistungen.length).toBe(1);
    expect(massageConfig.uebermich.introParagraphs.length).toBeGreaterThan(0);
    expect(massageConfig.kontakt.intro.length).toBeGreaterThan(0);
    expect(massageConfig.faq.length).toBe(5);
    expect(massageConfig.features).toEqual({
      hasBooking: false,
      hasRegistration: false,
      hasOIDC: false,
      hasBilling: false,
    });
    expect(massageConfig.referenzen).toBeUndefined();
    expect(massageConfig.i18n).toBeUndefined();
  });

  it('enters the journey via /kontakt and keeps owner inputs unhardcoded', () => {
    expect(massageConfig.leistungenCta).toEqual({ href: '/kontakt', text: 'Termin anfragen' });
    const emailLike = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneLike = /^\+?[0-9][0-9\s/-]*$/;
    for (const value of [massageConfig.contact.name, massageConfig.contact.email, massageConfig.contact.phone]) {
      const plausible = value === '' || emailLike.test(value) || phoneLike.test(value);
      expect(plausible).toBe(true);
    }
    expect(massageConfig.contact.city).toBe('Vögelsen bei Lüneburg');
  });

  it('prices every service from the OQ-05 formula and ships the disclaimer', () => {
    const [ruecken, ganz] = massageConfig.services;
    expect(ruecken.price).toBe(EUR_30);
    expect(ganz.price).toBe(EUR_60);
    expect(ruecken.pageContent.pricing.map((p) => p.price)).toEqual([EUR_30]);
    expect(ganz.pageContent.pricing.map((p) => p.price)).toEqual([EUR_60, EUR_90]);
    for (const svc of massageConfig.services) {
      expect(svc.iconSpriteId).toBeUndefined();
      expect(svc.stripeServiceKey).toBeUndefined();
    }
    const rows = massageConfig.leistungen.flatMap((cat) => cat.services);
    expect(rows.map((row) => row.price)).toEqual([EUR_30, EUR_60, EUR_90]);
    for (const row of rows) {
      expect(row.durationMin).toBeGreaterThan(0);
      expect(row.multiplier ?? 1).toBe(1);
    }
    expect(massageConfig.leistungen[0].description).toContain('keine Behandlung von Krankheiten');
  });
});

describe('massage content bundles', () => {
  it('parse as JSON', () => {
    for (const file of BUNDLE_FILES) {
      expect(() => JSON.parse(readRaw(file))).not.toThrow();
    }
  });

  it('validate against the content schemas', () => {
    expect(loadDomain('massage', 'seo').titles.home.length).toBeGreaterThan(0);
    expect(loadDomain('massage', 'homepage').hero.title.length).toBeGreaterThan(0);
    expect(loadDomain('massage', 'leistungen').length).toBe(1);
    expect(loadDomain('massage', 'faq').length).toBe(5);
    expect(loadDomain('massage', 'kontakt').intro.length).toBeGreaterThan(0);
    expect(loadDomain('massage', 'navigation').length).toBe(4);
    expect(loadDomain('massage', 'footer').columns.length).toBe(1);
    expect(loadDomain('massage', 'stammdaten').city).toBe('Vögelsen bei Lüneburg');
    expect(loadDomain('massage', 'ueber-mich').pageHeadline).toBe('Über mich');
  });

  it('resolve cross-bundle references', () => {
    const seo = loadDomain('massage', 'seo');
    for (const key of ['home', 'leistungen', 'kontakt', 'faq', 'ueber-mich']) {
      expect(seo.titles[key]).toBeDefined();
      expect(seo.descriptions[key]).toBeDefined();
    }
    const nav = loadDomain('massage', 'navigation');
    expect(nav.map((n) => n.href).sort()).toEqual(
      ['/faq', '/kontakt', '/leistungen', '/ueber-mich'].sort(),
    );
    const leistungen = loadDomain('massage', 'leistungen');
    const keys = leistungen.flatMap((cat) => cat.services.map((s) => s.key));
    expect(keys).toEqual(['ruecken-30', 'ganzkoerper-60', 'ganzkoerper-90']);
    expect(loadDomain('massage', 'homepage').processSteps?.length).toBe(3);
    const kontakt = loadDomain('massage', 'kontakt');
    expect(kontakt.showPhone).toBe(false);
    expect(kontakt.footerCity).toBe('Vögelsen bei Lüneburg');
  });
});

describe('massage placeholder slots', () => {
  // OQ-07 (Fotos) ist noch offen; OQ-05 (Preismodell → T901430) und alle
  // übrigen Owner-Angaben (OQ-01/02/03/06/08) sind befüllt.
  const register = [
    'slot-portrait-inhaberin',
    'slot-praxis-raum',
    'slot-stimmung-01',
  ];

  it('references every register id at least once and no unknown id', () => {
    const text = BUNDLE_FILES.map((f) => readRaw(f)).join('\n') + JSON.stringify(massageConfig);
    const found = new Set(
      [...text.matchAll(/slot:[a-z0-9-]+/g)].map((m) => m[0].slice('slot:'.length)),
    );
    expect([...found].sort()).toEqual([...register].sort());
  });

  it('carries filled owner answers without slot tokens', () => {
    const stammdaten = loadDomain('massage', 'stammdaten');
    expect(stammdaten.phone).toBe('+494131129934');
    expect(stammdaten.name).toBe('Birgit Korczewski');
    expect(stammdaten.email).toBe('massage@korczewski.de');
    const faq = loadDomain('massage', 'faq');
    expect(faq.some((item) => item.answer.includes('Kostenfreier Storno bis 24 h vor Terminbeginn'))).toBe(true);
    const uebermich = loadDomain('massage', 'ueber-mich');
    const intro = uebermich.introParagraphs.join('\n');
    expect(intro).toContain('Birgit Korczewski');
    expect(intro).toContain('ausgebildete Masseurin');
    for (const text of [JSON.stringify(stammdaten), JSON.stringify(faq), intro]) {
      expect(text).not.toMatch(/slot:[a-z0-9-]+/);
    }
  });

  it('marks still-open owner inputs explicitly instead of silent blanks', () => {
    const homepage = loadDomain('massage', 'homepage');
    expect(homepage.avatarSrc).toBe('slot:slot-portrait-inhaberin');
    // Der `slots`-Block ist reines Roh-JSON (kein Schema-Feld) → raw prüfen.
    const rawHomepage = readRaw('homepage.json');
    expect(rawHomepage).toContain('"portraitInhaberin": "slot:slot-portrait-inhaberin"');
    expect(rawHomepage).toContain('"praxisRaum": "slot:slot-praxis-raum"');
    expect(rawHomepage).toContain('"stimmung": "slot:slot-stimmung-01"');
    const rows = loadDomain('massage', 'leistungen').flatMap((c) => c.services);
    expect(rows.map((row) => row.price)).toEqual([EUR_30, EUR_60, EUR_90]);
  });
});
