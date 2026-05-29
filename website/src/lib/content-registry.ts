export type ContentType = 'site_setting' | 'legal_page' | 'service' | 'leistungen';

export interface ContentRef {
  contentKey: string;
  contentType: ContentType;
  storeKey: string;
  publicRoute: string;
}

export const CONTENT_REGISTRY: ContentRef[] = [
  { contentKey: 'kontakt',            contentType: 'site_setting', storeKey: 'kontakt',        publicRoute: '/kontakt' },
  { contentKey: 'stammdaten',         contentType: 'site_setting', storeKey: 'stammdaten',     publicRoute: '/' },
  { contentKey: 'uebermich',          contentType: 'site_setting', storeKey: 'uebermich',      publicRoute: '/ueber-mich' },
  { contentKey: 'navigation',         contentType: 'site_setting', storeKey: 'navigation',     publicRoute: '/' },
  { contentKey: 'footer',             contentType: 'site_setting', storeKey: 'footer',         publicRoute: '/' },
  { contentKey: 'faq',                contentType: 'site_setting', storeKey: 'faq',            publicRoute: '/' },
  { contentKey: 'referenzen',         contentType: 'site_setting', storeKey: 'referenzen',     publicRoute: '/' },
  { contentKey: 'seo',                contentType: 'site_setting', storeKey: 'seo',            publicRoute: '/' },
  { contentKey: 'startseite',         contentType: 'site_setting', storeKey: 'startseite',     publicRoute: '/' },
  { contentKey: 'legal:impressum',    contentType: 'legal_page',   storeKey: 'impressum',      publicRoute: '/impressum' },
  { contentKey: 'legal:datenschutz',  contentType: 'legal_page',   storeKey: 'datenschutz',    publicRoute: '/datenschutz' },
  { contentKey: 'legal:agb',          contentType: 'legal_page',   storeKey: 'agb',            publicRoute: '/agb' },
  { contentKey: 'legal:barrierefreiheit', contentType: 'legal_page', storeKey: 'barrierefreiheit', publicRoute: '/barrierefreiheit' },
  { contentKey: 'service:coaching',                    contentType: 'service', storeKey: 'coaching',                    publicRoute: '/coaching' },
  { contentKey: 'service:fuehrung-persoenlichkeit',    contentType: 'service', storeKey: 'fuehrung-persoenlichkeit',    publicRoute: '/fuehrung-persoenlichkeit' },
  { contentKey: 'service:50plus-digital',              contentType: 'service', storeKey: '50plus-digital',              publicRoute: '/50plus-digital' },
  { contentKey: 'service:ki-transition',               contentType: 'service', storeKey: 'ki-transition',               publicRoute: '/ki-transition' },
  { contentKey: 'service:beratung',                    contentType: 'service', storeKey: 'beratung',                    publicRoute: '/beratung' },
  { contentKey: 'angebote',           contentType: 'service',      storeKey: 'angebote',       publicRoute: '/leistungen' },
  { contentKey: 'leistungen',         contentType: 'leistungen',   storeKey: 'default',        publicRoute: '/leistungen' },
];

export function refFor(contentKey: string): ContentRef | undefined {
  return CONTENT_REGISTRY.find((r) => r.contentKey === contentKey);
}

export function publicRouteFor(contentKey: string): string | undefined {
  return refFor(contentKey)?.publicRoute;
}
