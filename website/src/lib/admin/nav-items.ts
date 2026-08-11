// Definition der Admin-Sidebar-Navigation.
//
// Warum ein eigenes Modul statt eines Objektliterals im Astro-Frontmatter (T003826):
// Der Guard in nav-items.test.ts muss jeden href über REDIRECT_MAP auflösen, um Einträge
// zu erkennen, die im Produktions-Build ins Leere führen (build-target.mjs filtert alle
// /sdlc/-Routen aus dem Manifest). Als importierbares Modul prüft der Test das ERGEBNIS
// der Auflösung; als Astro-Literal bliebe ihm nur ein grep über den Quelltext — genau die
// Prüfform, die den Defekt hat durchrutschen lassen.
//
// Das Modul ist bewusst pur: keine Imports aus DB- oder API-Schichten (S2 — Import-Zyklen).
// Dynamische Werte kommen als Parameter herein, statt hier zu leben.

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** Zusätzliche Pfad-Präfixe, die diesen Eintrag als aktiv markieren. */
  matches?: string[];
  badge?: number;
  external?: boolean;
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}

export interface NavOptions {
  /** Anzahl offener Postfach-Einträge; 0 blendet das Badge aus. */
  inboxPending: number;
  /** Absolute URL des Systembretts (brandabhängig, daher Parameter). */
  brettUrl: string;
}

/**
 * Baut die Sektionsstruktur der Admin-Sidebar.
 *
 * Es erscheinen ausschließlich Routen, die im Produktions-Build existieren. Einträge auf
 * die SDLC-Oberflächen (Cockpit, Pipeline, App-Katalog, KI-Konfiguration, Prompts,
 * Systemtest, Repo Health) entfallen: sie liegen unter website/src/pages/sdlc/ und werden
 * bei BUILD_TARGET=prod aus dem Route-Manifest entfernt. Erreichbar sind sie über die
 * lokale SDLC-Console.
 */
export function buildNavSections({ inboxPending, brettUrl }: NavOptions): NavSection[] {
  return [
    {
      items: [
        { href: '/admin', label: 'Dashboard', icon: 'dashboard' },
        { href: '/admin/inbox', label: 'Postfach', icon: 'inbox', badge: inboxPending },
      ],
    },
    {
      label: 'Geschäft',
      items: [
        { href: '/admin/clients', label: 'Klienten', icon: 'users' },
        {
          href: '/admin/coaching/sessions',
          label: 'Sessions',
          icon: 'clipboard',
          matches: ['/admin/coaching/sessions', '/admin/fragebogen'],
        },
        {
          href: '/admin/rechnungen',
          label: 'Fakturierung',
          icon: 'receipt',
          matches: ['/admin/rechnungen', '/admin/billing'],
        },
      ],
    },
    {
      label: 'Inhalte',
      items: [
        {
          href: '/admin/inhalte',
          label: 'Content Hub',
          icon: 'layout',
          matches: [
            '/admin/inhalte',
            '/admin/startseite',
            '/admin/uebermich',
            '/admin/angebote',
            '/admin/faq',
            '/admin/kontakt',
            '/admin/referenzen',
            '/admin/rechtliches',
            '/admin/dokumente',
          ],
        },
        {
          href: '/admin/wissen',
          label: 'Wissensbasis',
          icon: 'book',
          matches: [
            '/admin/wissen',
            '/admin/wissensquellen',
            '/admin/knowledge',
            '/admin/knowledge/drafts',
            '/admin/knowledge/templates',
          ],
        },
        { href: '/admin/content-db', label: 'Content-DB', icon: 'layout' },
      ],
    },
    {
      label: 'Werkzeuge',
      items: [
        { href: '/admin/assets', label: 'Assets', icon: 'palette' },
        { href: '/admin/asset-generation', label: '3D Generator', icon: 'edit' },
        { href: brettUrl, label: 'Systembrett', icon: 'brett', external: true },
      ],
    },
    {
      label: 'System',
      items: [
        {
          href: '/admin/einstellungen/benachrichtigungen',
          label: 'Einstellungen',
          icon: 'settings',
          matches: ['/admin/einstellungen/'],
        },
      ],
    },
  ];
}

/** Markiert einen Eintrag als aktiv: explizite `matches` schlagen den href-Präfix. */
export function isActive(path: string, href: string, matches?: string[]): boolean {
  if (matches) return matches.some((m) => path === m || path.startsWith(m));
  return path.startsWith(href);
}
