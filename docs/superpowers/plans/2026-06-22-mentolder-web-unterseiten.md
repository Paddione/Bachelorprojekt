# mentolder-web Unterseiten Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vier öffentliche Unterseiten (`/ueber-mich`, `/leistungen`, `/leistungen/:slug`, `/referenzen`) als Hybrid-JSX-Pages in `mentolder-web` implementieren, vollständig im visuellen Vokabular der bestehenden SPA.

**Architecture:** Jede Seite ist eine eigenständige React-Komponente (wie `KontaktPage.tsx`), keine Block-Schema-Validierung. Bestehende Primitive (`KickerBar`, `CallToAction`, `FAQ`, `ServiceCard`) werden wiederverwendet. Inhalt kommt aus statischen Exporten in `content.ts`.

**Tech Stack:** React 18, React Router v6, TypeScript, Tailwind CSS v4, Vitest + Testing Library, Framer Motion (nur für `ServiceCard`).

## Global Constraints

- Alle Dateien unter `mentolder-web/src/` — nie Astro-Website-Pfade anfassen
- Test-Kommando: `cd mentolder-web && pnpm test` (oder `pnpm exec vitest run <datei>`)
- Jede neue Page-Datei bekommt eine eigene Test-Datei im selben Verzeichnis
- Imports: `@/` ist Alias für `mentolder-web/src/`
- Kein neues npm-Paket installieren — alle Deps bereits vorhanden
- Icon-Namen sind strikt: `'fuehrung' | 'digitalisierung' | 'team' | 'strategie' | 'kommunikation' | 'resilienz'` (aus `@/components/icons.ts`)
- CSS-Variablen: `--brass`, `--brass-2`, `--fg`, `--fg-soft`, `--mute`, `--ink-900`, `--ink-850`, `--ink-800`, `--line`, `--line-2`
- CSS-Utility-Klassen: `rounded-card` (aus globalem CSS), `font-serif`, `font-mono`

---

## Dateiübersicht

| Datei | Aktion | Verantwortlich für |
|---|---|---|
| `src/content.ts` | Modify | Neue Exporte: `ueberMich`, `leistungenKategorien`, `referenzenConfig` + Typen |
| `src/content.test.ts` | Create | Datenstruktur-Validierung (Slugs eindeutig, Icons valide) |
| `src/App.tsx` | Modify | 4 neue `<Route>`-Einträge |
| `src/components/Navigation.tsx` | Modify | `/#angebote` → `/leistungen` |
| `src/pages/UeberMichPage.tsx` | Create | Milestones-Timeline, Sections, NotDoing |
| `src/pages/UeberMichPage.test.tsx` | Create | Render-Tests für alle Sektionen |
| `src/pages/LeistungenPage.tsx` | Create | Erstgespräch-Card, Kategorien, ServiceCards, Preishinweis |
| `src/pages/LeistungenPage.test.tsx` | Create | Render-Tests für alle Kategorien und Services |
| `src/pages/LeistungDetailPage.tsx` | Create | 2-Spalten-Layout, Sticky-Sidebar, FAQ, Prev/Next, 404-Fallback |
| `src/pages/LeistungDetailPage.test.tsx` | Create | Valid-Slug, Invalid-Slug, 404-Fallback |
| `src/pages/ReferenzenPage.tsx` | Create | Grid mit Logo/Initialen, Gruppen, Leer-Zustand |
| `src/pages/ReferenzenPage.test.tsx` | Create | Render-Tests für Items und Gruppen |

---

## Task 1: Content-Daten in `content.ts` erweitern

**Files:**
- Modify: `mentolder-web/src/content.ts`
- Create: `mentolder-web/src/content.test.ts`

**Interfaces:**
- Produces: `ueberMich`, `leistungenKategorien: LeistungKategorie[]`, `referenzenConfig` — alle exportiert, von Task 3–6 genutzt
- Produces: `LeistungService`, `LeistungKategorie`, `ReferenzItem` als exportierte Typen (Task 5 braucht `LeistungService` für `useParams`-Lookup)

- [ ] **Step 1: Test schreiben**

Datei `mentolder-web/src/content.test.ts` erstellen:

```ts
import { describe, it, expect } from 'vitest';
import { ueberMich, leistungenKategorien, referenzenConfig } from '@/content';

describe('ueberMich', () => {
  it('has at least one milestone', () => {
    expect(ueberMich.milestones.length).toBeGreaterThan(0);
  });
  it('every milestone has year, title and desc', () => {
    for (const m of ueberMich.milestones) {
      expect(m.year).toBeTruthy();
      expect(m.title).toBeTruthy();
      expect(m.desc).toBeTruthy();
    }
  });
  it('has at least one section', () => {
    expect(ueberMich.sections.length).toBeGreaterThan(0);
  });
  it('has at least one notDoing item', () => {
    expect(ueberMich.notDoing.length).toBeGreaterThan(0);
  });
});

describe('leistungenKategorien', () => {
  it('has at least one category with at least one service', () => {
    expect(leistungenKategorien.length).toBeGreaterThan(0);
    expect(leistungenKategorien[0].services.length).toBeGreaterThan(0);
  });
  it('every service has a unique slug', () => {
    const allSlugs = leistungenKategorien.flatMap((k) => k.services.map((s) => s.slug));
    expect(new Set(allSlugs).size).toBe(allSlugs.length);
  });
  it('every service icon is a valid IconName', () => {
    const valid = ['fuehrung', 'digitalisierung', 'team', 'strategie', 'kommunikation', 'resilienz'];
    for (const kat of leistungenKategorien) {
      for (const svc of kat.services) {
        expect(valid).toContain(svc.icon);
      }
    }
  });
  it('every service has non-empty pageContent.headline', () => {
    for (const kat of leistungenKategorien) {
      for (const svc of kat.services) {
        expect(svc.pageContent.headline).toBeTruthy();
      }
    }
  });
});

describe('referenzenConfig', () => {
  it('has heading and subheading', () => {
    expect(referenzenConfig.heading).toBeTruthy();
    expect(referenzenConfig.subheading).toBeTruthy();
  });
  it('items and types are arrays', () => {
    expect(Array.isArray(referenzenConfig.items)).toBe(true);
    expect(Array.isArray(referenzenConfig.types)).toBe(true);
  });
});
```

- [ ] **Step 2: Test fehlschlagen sehen**

```bash
cd mentolder-web && pnpm exec vitest run src/content.test.ts
```

Erwartet: FAIL — `ueberMich is not exported from '@/content'`

- [ ] **Step 3: Typen und Daten in `content.ts` ergänzen**

Am Ende von `mentolder-web/src/content.ts` anfügen (bestehende Importe und Exporte NICHT ändern):

```ts
// ─── Über-mich ────────────────────────────────────────────────────────────────

export interface UeberMichMilestone {
  year: string;
  title: string;
  desc: string;
}

export interface UeberMichSection {
  title: string;
  content: string;
}

export interface NotDoingItem {
  title: string;
  text: string;
}

export const ueberMich = {
  kicker: ['Über mich', 'Lüneburg', 'DE'] as string[],
  headline: '30 Jahre Erfahrung —',
  headlineEmphasis: 'Mensch zuerst.',
  lede: 'Ich begleite Führungskräfte und Teams beim Wandel — mit technischer Tiefe und menschlicher Klarheit. Praxisnah, empathisch, ohne Hype.',
  milestones: [
    { year: '1993', title: 'Einstieg in die IT', desc: 'Erste professionelle Erfahrungen in Softwareentwicklung und Systemadministration.' },
    { year: '2000', title: 'Erste Führungsverantwortung', desc: 'Teamlead in einem mittelständischen IT-Unternehmen — Lernen durch Tun.' },
    { year: '2008', title: 'Cloud-Pionier', desc: 'Aufbau der ersten Cloud-Infrastruktur für ein 500-Personen-Unternehmen.' },
    { year: '2015', title: 'Digitale Transformation', desc: 'Leitung unternehmensweiter Digitalisierungsprojekte — von der Strategie bis zum Rollout.' },
    { year: '2018', title: 'KI-Fokus', desc: 'Spezialisierung auf KI-gestützte Transformationsprojekte und Führungskräfte-Enablement.' },
    { year: '2020', title: 'Selbstständig', desc: 'Gründung als Digital Coach und Mentor in Lüneburg.' },
    { year: 'Heute', title: 'Coach & Mentor', desc: 'Begleitung von Führungskräften und Organisationen im digitalen Wandel — mit 30+ Jahren Erfahrung.' },
  ] as UeberMichMilestone[],
  sections: [
    { title: 'Führung mit Haltung', content: 'Ich glaube, dass gute Führung Empathie und Klarheit vereint. Nach 30 Jahren in der IT — vom Entwickler bis zur Geschäftsführung — weiß ich: Technik ist selten das eigentliche Problem.' },
    { title: 'Technik im Dienst des Menschen', content: 'Cloud, KI, DevOps — aber immer mit dem Ziel, Menschen zu entlasten, nicht zu ersetzen. Ich übersetze komplexe Technologie in klare Entscheidungen.' },
    { title: 'Pragmatismus statt Hype', content: 'Keine Modeerscheinungen, keine Vendor-Abhängigkeiten. Was wir gemeinsam erarbeiten, muss in Ihren Alltag passen — und dort bleiben.' },
  ] as UeberMichSection[],
  notDoing: [
    { title: 'Motivationsreden', text: 'Ich halte keine inspirierten Vorträge ohne praktischen Nutzen. Wirkung entsteht im konkreten Tun.' },
    { title: 'Vendor-Pitches', text: 'Ich empfehle keine Produkte, an denen ich verdiene. Meine Empfehlungen sind unabhängig.' },
    { title: 'Dauermandate', text: 'Ich ziele auf Ihre Selbstständigkeit, nicht auf meine Unentbehrlichkeit. Ein gutes Coaching endet.' },
    { title: 'Universallösungen', text: 'Jede Organisation ist anders. Ich arbeite keine Standardprogramme ab, sondern höre zuerst zu.' },
  ] as NotDoingItem[],
};

// ─── Leistungen ───────────────────────────────────────────────────────────────

// Hinweis: IconName-Import gehört an den Dateianfang von content.ts, nicht hier.
// Stattdessen inline-Union für Typsicherheit ohne zusätzlichen Import:

export interface LeistungPageContent {
  headline: string;
  intro: string;
  sections: Array<{ title: string; content: string }>;
  forWhom: string[];
  faq: Array<{ question: string; answer: string }>;
}

export interface LeistungService {
  slug: string;
  title: string;
  price: string;
  priceUnit: string;
  description: string;
  features: string[];
  icon: 'fuehrung' | 'digitalisierung' | 'team' | 'strategie' | 'kommunikation' | 'resilienz';
  pageContent: LeistungPageContent;
}

export interface LeistungKategorie {
  id: string;
  label: string;
  title: string;
  description: string;
  services: LeistungService[];
}

export const leistungenKategorien: LeistungKategorie[] = [
  {
    id: 'coaching',
    label: 'Coaching',
    title: 'Coaching & Mentoring',
    description: 'Individuelle Begleitung für Führungskräfte, Professionals und Gründer.',
    services: [
      {
        slug: 'fuehrung',
        title: 'Führungs-Coaching',
        price: 'ab 240',
        priceUnit: 'EUR / 60 min',
        description: 'Vom Manager zur empathischen Führungskraft. Klarheit, Präsenz und Werkzeuge für wirksames Leadership.',
        features: ['1:1-Sessions', 'Zwischenstand nach 6 Wochen', 'Vertraulich'],
        icon: 'fuehrung',
        pageContent: {
          headline: 'Führung neu denken.',
          intro: 'Führungserfolg hängt selten von Fachwissen ab — er entsteht im Umgang mit Menschen, in der Klarheit der eigenen Haltung und in der Fähigkeit, andere zu befähigen.',
          sections: [
            { title: 'Was wir erarbeiten', content: 'Klarheit über Ihre Führungsrolle, Kommunikationsmuster und blinde Flecken. Wir arbeiten mit konkreten Situationen aus Ihrem Alltag — keine abstrakten Modelle.' },
            { title: 'Format', content: '60-Minuten-Sessions, bi-wöchentlich, remote oder vor Ort in Lüneburg. Zwischen den Sessions: kurze schriftliche Reflexionen auf Wunsch.' },
            { title: 'Ergebnis', content: 'Mehr Präsenz im Umgang mit Ihrem Team, klarere Entscheidungen, weniger Erschöpfung durch Konflikte, die nie ausgesprochen wurden.' },
          ],
          forWhom: [
            'Neue Führungskräfte in den ersten 12 Monaten',
            'Erfahrene Manager in neuen Rollen oder nach Reorganisationen',
            'Professionals mit Führungsaspirationen',
          ],
          faq: [
            { question: 'Wie viele Sessions brauche ich?', answer: 'Ein Mindest-Paket sind 6 Sessions über 12 Wochen. Der Großteil meiner Klienten verlängert nach dem ersten Paket — weil sich etwas verändert hat und sie weitermachen wollen.' },
            { question: 'Ist das auch remote möglich?', answer: 'Ja, vollständig remote per Video. Ich arbeite mit Klienten in ganz Deutschland und im deutschsprachigen Ausland.' },
          ],
        },
      },
      {
        slug: 'strategie',
        title: 'Strategie-Session',
        price: 'ab 320',
        priceUnit: 'EUR / 90 min',
        description: 'Fokussierte Einzelsitzung für strategische Entscheidungen, Positionierung oder Zukunftsplanung.',
        features: ['Einmalig buchbar', 'Vorbereitung inklusive', 'Schriftliche Zusammenfassung'],
        icon: 'strategie',
        pageContent: {
          headline: 'Eine Stunde Klarheit.',
          intro: 'Manchmal braucht es keine laufende Begleitung, sondern einen fokussierten Blick von außen auf eine konkrete Frage.',
          sections: [
            { title: 'Was passiert in 90 Minuten', content: 'Wir klären Ihre Ausgangssituation, beleuchten Optionen und entwickeln eine klare Handlungsempfehlung. Mit schriftlicher Zusammenfassung zum Nachschlagen.' },
            { title: 'Vorbereitung', content: 'Vor dem Termin erhalten Sie einen kurzen Fragebogen (ca. 10 Minuten). Damit nutzen wir die 90 Minuten maximal.' },
          ],
          forWhom: [
            'Entscheidungsträger vor einem Strategiewechsel',
            'Selbstständige bei der Neupositionierung',
            'Führungskräfte vor schwierigen Gesprächen oder Verhandlungen',
          ],
          faq: [
            { question: 'Kann ich mehrere Sessions buchen?', answer: 'Ja, als Einzeltermine oder im Paket. Ab 3 Sessions gibt es einen Paketpreis auf Anfrage.' },
          ],
        },
      },
    ],
  },
  {
    id: 'beratung',
    label: 'Beratung',
    title: 'Digitale Transformation',
    description: 'Von der Vision zum produktiven System — pragmatisch und ohne Hype.',
    services: [
      {
        slug: 'digitalisierung',
        title: 'Digitale Transformation',
        price: 'ab 1.200',
        priceUnit: 'EUR / Tag',
        description: 'Vom Pilot zum Produktiv-System. Cloud, KI, DevOps — pragmatisch, ohne Hype und mit klaren Meilensteinen.',
        features: ['Cloud / K8s', 'KI-Enablement', 'Architektur-Reviews'],
        icon: 'digitalisierung',
        pageContent: {
          headline: 'Digitalisierung, die wirklich funktioniert.',
          intro: 'Cloud, KI, DevOps — aber immer im Dienst der Menschen, die sie nutzen. Kein Großprojekt-Denken, keine endlosen Workshops. Kleine Schritte mit messbarem Ergebnis.',
          sections: [
            { title: 'Ansatz', content: 'Ich starte mit einer Bestandsaufnahme: Was existiert, was funktioniert, wo sind die echten Engpässe. Dann entwickeln wir gemeinsam einen pragmatischen Fahrplan — ohne Hype, ohne Vendor-Lock-in.' },
            { title: 'Technologien', content: 'Kubernetes, CI/CD-Pipelines, KI-APIs (OpenAI, Anthropic, lokale Modelle), Monitoring, Infrastruktur-as-Code. Jeweils nur was wirklich gebraucht wird.' },
            { title: 'Zusammenarbeit', content: 'Tagesweise oder in Blöcken buchbar. Ich arbeite eng mit Ihrem Team — kein Blackbox-Consulting, das nach Projektende niemand versteht.' },
          ],
          forWhom: [
            'CTOs und IT-Leiter im Mittelstand',
            'Startups in der Skalierungsphase',
            'Unternehmen mit Legacy-Altlasten und Modernisierungsdruck',
          ],
          faq: [
            { question: 'Arbeiten Sie remote?', answer: 'Ja, vollständig remote. Vor-Ort-Workshops deutschlandweit auf Anfrage.' },
            { question: 'Übernehmen Sie auch Umsetzungsarbeiten?', answer: 'Ja, auf Anfrage. Mein Fokus liegt auf Beratung und Enablement — aber für konkrete Umsetzungsphasen bin ich auch direkt buchbar.' },
          ],
        },
      },
      {
        slug: 'team',
        title: 'Team-Readiness',
        price: 'ab 980',
        priceUnit: 'EUR / Workshop',
        description: 'Teams befähigen, moderne Tools sicher zu nutzen. Workshops, die verbinden statt belehren — mit Fokus auf Wirkung.',
        features: ['Halbtages-Workshop', 'Vor-Ort oder Remote', 'Follow-up-E-Mail'],
        icon: 'team',
        pageContent: {
          headline: 'Ihr Team. Zukunftsfähig.',
          intro: 'Neue Tools scheitern nicht an der Technik, sondern an der fehlenden Adoption. Meine Workshops bauen Brücken — zwischen dem, was das Tool kann, und dem, was Ihr Team wirklich braucht.',
          sections: [
            { title: 'Format', content: 'Halbtages-Workshop (3,5 Stunden) mit konkreten Ergebnissen und direktem Bezug zu Ihrer Arbeitssituation. Vor-Ort oder remote.' },
            { title: 'Typische Inhalte', content: 'KI-Tools im Arbeitsalltag (ChatGPT, Copilot, Perplexity), Kollaborationsplattformen (Nextcloud, Notion, Confluence), digitale Kommunikation ohne Overhead.' },
            { title: 'Nachbereitung', content: 'Schriftliche Zusammenfassung der Ergebnisse und individuell angepasste Tool-Empfehlungen per E-Mail innerhalb von 48 Stunden.' },
          ],
          forWhom: [
            'Teams nach Einführung neuer Tools ohne ausreichendes Onboarding',
            'HR und L&D-Verantwortliche mit Weiterbildungsauftrag',
            'Abteilungen mit generationengemischten Teams',
          ],
          faq: [
            { question: 'Wie viele Teilnehmer?', answer: 'Ideal 6–15 Personen. Kleinere Gruppen (ab 3) und größere Gruppen (bis 30) auf Anfrage.' },
            { question: 'Kann der Workshop individuell angepasst werden?', answer: 'Ja, immer. Vorab gibt es einen kurzen Abstimmungstermin ohne Kosten.' },
          ],
        },
      },
    ],
  },
];

// ─── Referenzen ───────────────────────────────────────────────────────────────

export interface ReferenzItem {
  name: string;
  url?: string;
  logoUrl?: string;
  description?: string;
  type?: string;
}

export interface ReferenzType {
  id: string;
  label: string;
}

export const referenzenConfig = {
  heading: 'Referenzen',
  subheading: 'Unternehmen und Menschen, die mir ihr Vertrauen geschenkt haben.',
  types: [
    { id: 'kooperationen', label: 'Kooperationen' },
    { id: 'kunden', label: 'Kunden & Projekte' },
  ] as ReferenzType[],
  items: [
    { name: 'Brückenschlag e.V.', url: 'https://brueckenschlag.de', description: 'Digitalisierungsberatung für gemeinnützige Organisationen in Hamburg.', type: 'kooperationen' },
    { name: 'Digital Café Hamburg', description: 'Workshop-Reihe für digitale Grundkompetenzen — quartalsweise, kostenfrei.', type: 'kooperationen' },
    { name: 'Polizei Hamburg', description: 'KI-Führungskräfte-Workshop im Rahmen der Digitalisierungsinitiative.', type: 'kunden' },
  ] as ReferenzItem[],
};
```

- [ ] **Step 4: Test ausführen und grün sehen**

```bash
cd mentolder-web && pnpm exec vitest run src/content.test.ts
```

Erwartet: PASS — 7 Tests grün

- [ ] **Step 5: Commit**

```bash
git -C .. add mentolder-web/src/content.ts mentolder-web/src/content.test.ts
git -C .. commit -m "feat(mentolder-web): add content data for ueber-mich, leistungen, referenzen pages"
```

---

## Task 2: Routing und Navigation verdrahten

**Files:**
- Modify: `mentolder-web/src/App.tsx`
- Modify: `mentolder-web/src/components/Navigation.tsx`

**Interfaces:**
- Consumes: `UeberMichPage`, `LeistungenPage`, `LeistungDetailPage`, `ReferenzenPage` (Dummy-Imports bis Task 3–6 fertig)
- Produces: funktionierende Routes `/ueber-mich`, `/leistungen`, `/leistungen/:slug`, `/referenzen`

- [ ] **Step 1: Placeholder-Pages erstellen** (damit App.tsx kompiliert)

`mentolder-web/src/pages/UeberMichPage.tsx`:
```tsx
export function UeberMichPage() {
  return <div data-testid="ueber-mich-page">Über mich — coming soon</div>;
}
```

`mentolder-web/src/pages/LeistungenPage.tsx`:
```tsx
export function LeistungenPage() {
  return <div data-testid="leistungen-page">Leistungen — coming soon</div>;
}
```

`mentolder-web/src/pages/LeistungDetailPage.tsx`:
```tsx
export function LeistungDetailPage() {
  return <div data-testid="leistung-detail-page">Detail — coming soon</div>;
}
```

`mentolder-web/src/pages/ReferenzenPage.tsx`:
```tsx
export function ReferenzenPage() {
  return <div data-testid="referenzen-page">Referenzen — coming soon</div>;
}
```

- [ ] **Step 2: Test schreiben**

`mentolder-web/src/pages/routing.test.tsx` erstellen:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '@/App';

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

describe('Routing', () => {
  it('renders ueber-mich page at /ueber-mich', () => {
    renderAt('/ueber-mich');
    expect(screen.getByTestId('ueber-mich-page')).toBeInTheDocument();
  });

  it('renders leistungen page at /leistungen', () => {
    renderAt('/leistungen');
    expect(screen.getByTestId('leistungen-page')).toBeInTheDocument();
  });

  it('renders leistung detail at /leistungen/fuehrung', () => {
    renderAt('/leistungen/fuehrung');
    expect(screen.getByTestId('leistung-detail-page')).toBeInTheDocument();
  });

  it('renders referenzen page at /referenzen', () => {
    renderAt('/referenzen');
    expect(screen.getByTestId('referenzen-page')).toBeInTheDocument();
  });
});

describe('Navigation', () => {
  it('contains a link to /leistungen', () => {
    renderAt('/');
    expect(screen.getByRole('link', { name: 'Leistungen' })).toHaveAttribute('href', '/leistungen');
  });

  it('does not contain the old /#angebote link', () => {
    renderAt('/');
    expect(screen.queryByRole('link', { name: 'Angebote' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Test fehlschlagen sehen**

```bash
cd mentolder-web && pnpm exec vitest run src/pages/routing.test.tsx
```

Erwartet: FAIL — Routes nicht registriert, Navigation-Link nicht vorhanden

- [ ] **Step 4: `App.tsx` updaten**

Imports ergänzen (nach den bestehenden Page-Imports):

```tsx
import { UeberMichPage } from './pages/UeberMichPage';
import { LeistungenPage } from './pages/LeistungenPage';
import { LeistungDetailPage } from './pages/LeistungDetailPage';
import { ReferenzenPage } from './pages/ReferenzenPage';
```

Vier neue `<Route>`-Einträge **vor** dem `path="*"` Catch-All einfügen:

```tsx
<Route path="/ueber-mich"       element={<UeberMichPage />} />
<Route path="/leistungen"       element={<LeistungenPage />} />
<Route path="/leistungen/:slug" element={<LeistungDetailPage />} />
<Route path="/referenzen"       element={<ReferenzenPage />} />
```

- [ ] **Step 5: `Navigation.tsx` updaten**

`links`-Array ändern — `/#angebote` durch `/leistungen` ersetzen:

```ts
const links: ReadonlyArray<{ to: string; label: string }> = [
  { to: '/leistungen', label: 'Leistungen' },
  { to: '/ueber-mich', label: 'Über mich' },
  { to: '/referenzen', label: 'Referenzen' },
  { to: '/kontakt',    label: 'Kontakt' },
];
```

- [ ] **Step 6: Tests grün sehen**

```bash
cd mentolder-web && pnpm exec vitest run src/pages/routing.test.tsx
```

Erwartet: PASS — 6 Tests grün

- [ ] **Step 7: Commit**

```bash
git -C .. add mentolder-web/src/App.tsx mentolder-web/src/components/Navigation.tsx mentolder-web/src/pages/UeberMichPage.tsx mentolder-web/src/pages/LeistungenPage.tsx mentolder-web/src/pages/LeistungDetailPage.tsx mentolder-web/src/pages/ReferenzenPage.tsx mentolder-web/src/pages/routing.test.tsx
git -C .. commit -m "feat(mentolder-web): add routes for ueber-mich, leistungen, referenzen + update nav"
```

---

## Task 3: `UeberMichPage` implementieren

**Files:**
- Modify: `mentolder-web/src/pages/UeberMichPage.tsx` (Placeholder aus Task 2 ersetzen)
- Create: `mentolder-web/src/pages/UeberMichPage.test.tsx`

**Interfaces:**
- Consumes: `ueberMich` aus `@/content`
- Consumes: `KickerBar` aus `@/components/KickerBar`, `CallToAction` aus `@/components/CallToAction`

- [ ] **Step 1: Test schreiben**

`mentolder-web/src/pages/UeberMichPage.test.tsx` erstellen:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { UeberMichPage } from './UeberMichPage';
import { ueberMich } from '@/content';

const renderPage = () =>
  render(
    <MemoryRouter>
      <UeberMichPage />
    </MemoryRouter>,
  );

describe('UeberMichPage', () => {
  it('renders the emphasis part of the headline', () => {
    renderPage();
    expect(screen.getByText(ueberMich.headlineEmphasis)).toBeInTheDocument();
  });

  it('renders the lede text', () => {
    renderPage();
    expect(screen.getByText(ueberMich.lede)).toBeInTheDocument();
  });

  it('renders all milestone years', () => {
    renderPage();
    for (const m of ueberMich.milestones) {
      expect(screen.getByText(m.year)).toBeInTheDocument();
    }
  });

  it('renders all milestone titles', () => {
    renderPage();
    for (const m of ueberMich.milestones) {
      expect(screen.getByText(m.title)).toBeInTheDocument();
    }
  });

  it('renders all section titles', () => {
    renderPage();
    for (const sec of ueberMich.sections) {
      expect(screen.getByText(sec.title)).toBeInTheDocument();
    }
  });

  it('renders all notDoing item titles', () => {
    renderPage();
    for (const item of ueberMich.notDoing) {
      expect(screen.getByText(item.title)).toBeInTheDocument();
    }
  });

  it('renders the "Was ich nicht mache" heading', () => {
    renderPage();
    expect(screen.getByText('Was ich nicht mache')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Test fehlschlagen sehen**

```bash
cd mentolder-web && pnpm exec vitest run src/pages/UeberMichPage.test.tsx
```

Erwartet: FAIL — Placeholder rendert `"Über mich — coming soon"`, kein Milestone-Content

- [ ] **Step 3: `UeberMichPage.tsx` vollständig implementieren**

```tsx
import { KickerBar } from '@/components/KickerBar';
import { CallToAction } from '@/components/CallToAction';
import { ueberMich } from '@/content';

export function UeberMichPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative pt-[80px] pb-[80px] max-md:pt-[56px]">
        <div
          className="absolute inset-0 pointer-events-none overflow-hidden"
          aria-hidden="true"
        >
          <div
            className="absolute -top-[180px] -right-[120px] w-[620px] h-[620px] rounded-full"
            style={{
              background: 'radial-gradient(circle, oklch(0.80 0.09 75 / .14), transparent 65%)',
              filter: 'blur(18px)',
            }}
          />
        </div>
        <div className="relative max-w-[1240px] mx-auto px-10 max-md:px-[22px]">
          <KickerBar parts={ueberMich.kicker} className="mb-6" />
          <h1
            className="font-serif font-light text-fg leading-[1.05] m-0"
            style={{ fontSize: 'clamp(40px, 5.4vw, 72px)', letterSpacing: '-0.02em' }}
          >
            {ueberMich.headline} <em>{ueberMich.headlineEmphasis}</em>
          </h1>
          <p className="text-[18px] leading-[1.6] text-fg-soft mt-5 max-w-[52ch]">
            {ueberMich.lede}
          </p>
        </div>
      </section>

      {/* Milestones */}
      <section className="py-[80px] border-t border-line" aria-label="Meilensteine">
        <div className="max-w-[1240px] mx-auto px-10 max-md:px-[22px]">
          <h2
            className="font-serif font-light text-fg text-center m-0 mb-14"
            style={{ fontSize: 'clamp(28px, 3vw, 40px)', letterSpacing: '-0.02em' }}
          >
            Mein Weg
          </h2>
          <div className="flex flex-col gap-8 max-w-[720px] mx-auto">
            {ueberMich.milestones.map((m) => (
              <div key={m.year} className="flex gap-6 items-start">
                <div className="flex-shrink-0 w-20 text-right pt-1">
                  <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-ink-900 bg-brass px-2.5 py-1 rounded-full whitespace-nowrap">
                    {m.year}
                  </span>
                </div>
                <div className="w-px bg-line self-stretch flex-shrink-0" aria-hidden="true" />
                <div className="pb-4">
                  <h3 className="font-serif text-[18px] text-fg m-0 mb-1">{m.title}</h3>
                  <p className="text-fg-soft text-[15px] leading-[1.6] m-0">{m.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sections */}
      <section className="py-[80px] border-t border-line" aria-label="Über mich">
        <div className="max-w-[720px] mx-auto px-10 max-md:px-[22px] flex flex-col gap-10">
          {ueberMich.sections.map((sec) => (
            <div key={sec.title} className="border-l-2 border-brass pl-6">
              <h2
                className="font-serif text-[22px] text-fg m-0 mb-3"
                style={{ letterSpacing: '-0.015em' }}
              >
                {sec.title}
              </h2>
              <p className="text-fg-soft text-[16px] leading-[1.7] m-0">{sec.content}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Was ich nicht mache */}
      <section className="py-[80px] border-t border-line" aria-labelledby="not-doing-heading">
        <div className="max-w-[1240px] mx-auto px-10 max-md:px-[22px]">
          <h2
            id="not-doing-heading"
            className="font-serif font-light text-fg m-0 mb-10"
            style={{ fontSize: 'clamp(24px, 2.8vw, 36px)', letterSpacing: '-0.02em' }}
          >
            Was ich nicht mache
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-[900px]">
            {ueberMich.notDoing.map((item) => (
              <div
                key={item.title}
                className="border-l-2 pl-5 py-2"
                style={{ borderColor: 'oklch(0.63 0.22 22 / 0.5)' }}
              >
                <p className="text-[15px] text-fg m-0 mb-1 font-medium">{item.title}</p>
                <p className="text-fg-soft text-[14px] leading-[1.6] m-0">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CallToAction />
    </>
  );
}
```

- [ ] **Step 4: Tests grün sehen**

```bash
cd mentolder-web && pnpm exec vitest run src/pages/UeberMichPage.test.tsx
```

Erwartet: PASS — 7 Tests grün

- [ ] **Step 5: Commit**

```bash
git -C .. add mentolder-web/src/pages/UeberMichPage.tsx mentolder-web/src/pages/UeberMichPage.test.tsx
git -C .. commit -m "feat(mentolder-web): implement UeberMichPage with milestones, sections, notDoing"
```

---

## Task 4: `LeistungenPage` implementieren

**Files:**
- Modify: `mentolder-web/src/pages/LeistungenPage.tsx` (Placeholder ersetzen)
- Create: `mentolder-web/src/pages/LeistungenPage.test.tsx`

**Interfaces:**
- Consumes: `leistungenKategorien` aus `@/content`
- Consumes: `KickerBar`, `CallToAction`, `ServiceCard` aus `@/components/`
- Consumes: `iconRegistry` aus `@/components/icons`

- [ ] **Step 1: Test schreiben**

`mentolder-web/src/pages/LeistungenPage.test.tsx` erstellen:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LeistungenPage } from './LeistungenPage';
import { leistungenKategorien } from '@/content';

const renderPage = () =>
  render(
    <MemoryRouter>
      <LeistungenPage />
    </MemoryRouter>,
  );

describe('LeistungenPage', () => {
  it('renders the Erstgespräch hero card', () => {
    renderPage();
    expect(screen.getByText('Kostenloses Erstgespräch')).toBeInTheDocument();
  });

  it('renders all category titles', () => {
    renderPage();
    for (const kat of leistungenKategorien) {
      expect(screen.getByText(kat.title)).toBeInTheDocument();
    }
  });

  it('renders all service titles', () => {
    renderPage();
    for (const kat of leistungenKategorien) {
      for (const svc of kat.services) {
        expect(screen.getAllByText(svc.title).length).toBeGreaterThan(0);
      }
    }
  });

  it('renders §19 UStG price hint', () => {
    renderPage();
    expect(screen.getByText(/§19 UStG/)).toBeInTheDocument();
  });

  it('renders link to /kontakt for Erstgespräch', () => {
    renderPage();
    const links = screen.getAllByRole('link', { name: /buchen/i });
    expect(links.some((l) => l.getAttribute('href') === '/kontakt')).toBe(true);
  });
});
```

- [ ] **Step 2: Test fehlschlagen sehen**

```bash
cd mentolder-web && pnpm exec vitest run src/pages/LeistungenPage.test.tsx
```

Erwartet: FAIL — Placeholder-Content, keine Kategorien

- [ ] **Step 3: `LeistungenPage.tsx` vollständig implementieren**

```tsx
import { Link } from 'react-router-dom';
import { KickerBar } from '@/components/KickerBar';
import { CallToAction } from '@/components/CallToAction';
import { ServiceCard } from '@/components/ServiceCard';
import { leistungenKategorien } from '@/content';
import { iconRegistry } from '@/components/icons';

export function LeistungenPage() {
  return (
    <>
      {/* Hero */}
      <section className="pt-[80px] pb-[60px] max-md:pt-[56px]">
        <div className="max-w-[1240px] mx-auto px-10 max-md:px-[22px]">
          <KickerBar parts={['Leistungen & Preise']} className="mb-6" />
          <h1
            className="font-serif font-light text-fg leading-[1.05] m-0"
            style={{ fontSize: 'clamp(40px, 5.4vw, 72px)', letterSpacing: '-0.02em' }}
          >
            Was ich anbiete — <em>und was es kostet.</em>
          </h1>
          <p className="text-[18px] leading-[1.6] text-fg-soft mt-5 max-w-[52ch]">
            Kein Kleingedrucktes. Alle Formate, alle Preise — transparent.
          </p>
        </div>
      </section>

      {/* Erstgespräch-Hero-Card */}
      <div className="max-w-[1240px] mx-auto px-10 max-md:px-[22px] mb-16">
        <div
          className="rounded-xl border bg-ink-850 p-8 text-center"
          style={{ borderColor: 'oklch(0.80 0.09 75 / .3)' }}
        >
          <p className="font-mono text-[11px] tracking-[0.16em] uppercase text-brass m-0 mb-3">
            Einstieg
          </p>
          <h2
            className="font-serif font-normal text-fg m-0 mb-2"
            style={{ fontSize: 'clamp(22px, 2.6vw, 30px)', letterSpacing: '-0.015em' }}
          >
            Kostenloses Erstgespräch
          </h2>
          <p className="text-fg-soft text-[15px] m-0 mb-6">
            30 Minuten · kostenlos & unverbindlich
          </p>
          <Link
            to="/kontakt"
            className="inline-flex items-center gap-2 font-medium text-ink-900 no-underline px-6 py-3 rounded-full"
            style={{ background: 'var(--brass)', fontSize: '14px' }}
          >
            Jetzt buchen
            <svg
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-[12px] h-[12px]"
              aria-hidden="true"
            >
              <path d="M2 7h10M8 3l4 4-4 4" />
            </svg>
          </Link>
        </div>
      </div>

      {/* Kategorien */}
      {leistungenKategorien.map((kat) => (
        <section
          key={kat.id}
          className="py-[60px] border-t border-line"
          aria-labelledby={`kat-${kat.id}`}
        >
          <div className="max-w-[1240px] mx-auto px-10 max-md:px-[22px]">
            <p className="font-mono text-[11px] tracking-[0.14em] uppercase text-brass m-0 mb-2">
              {kat.label}
            </p>
            <h2
              id={`kat-${kat.id}`}
              className="font-serif font-normal text-fg m-0 mb-3"
              style={{ fontSize: 'clamp(24px, 3vw, 36px)', letterSpacing: '-0.02em' }}
            >
              {kat.title}
            </h2>
            <p className="text-fg-soft text-[16px] leading-[1.6] m-0 mb-10 max-w-[60ch]">
              {kat.description}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {kat.services.map((svc) => {
                const Icon = iconRegistry[svc.icon];
                return (
                  <ServiceCard
                    key={svc.slug}
                    icon={<Icon />}
                    title={svc.title}
                    description={svc.description}
                    features={svc.features}
                    price={`${svc.price} ${svc.priceUnit}`}
                    href={`/leistungen/${svc.slug}`}
                  />
                );
              })}
            </div>
          </div>
        </section>
      ))}

      {/* Preishinweis */}
      <div className="max-w-[1240px] mx-auto px-10 max-md:px-[22px] py-8 border-t border-line">
        <p className="font-mono text-[12px] text-mute m-0">
          Alle Preise sind Nettopreise gem. §19 UStG. Kein Ausweis von Umsatzsteuer.{' '}
          <Link
            to="/kontakt"
            className="text-brass no-underline"
            style={{ borderBottom: '1px solid oklch(0.80 0.09 75 / .4)' }}
          >
            Individuelles Angebot anfragen →
          </Link>
        </p>
      </div>

      <CallToAction />
    </>
  );
}
```

- [ ] **Step 4: Tests grün sehen**

```bash
cd mentolder-web && pnpm exec vitest run src/pages/LeistungenPage.test.tsx
```

Erwartet: PASS — 5 Tests grün

- [ ] **Step 5: Commit**

```bash
git -C .. add mentolder-web/src/pages/LeistungenPage.tsx mentolder-web/src/pages/LeistungenPage.test.tsx
git -C .. commit -m "feat(mentolder-web): implement LeistungenPage with categories, ServiceCards, Erstgespräch-Card"
```

---

## Task 5: `LeistungDetailPage` implementieren

**Files:**
- Modify: `mentolder-web/src/pages/LeistungDetailPage.tsx` (Placeholder ersetzen)
- Create: `mentolder-web/src/pages/LeistungDetailPage.test.tsx`

**Interfaces:**
- Consumes: `leistungenKategorien, LeistungService` aus `@/content`
- Consumes: `KickerBar`, `CallToAction`, `FAQ` aus `@/components/`
- Consumes: `iconRegistry` aus `@/components/icons`
- Consumes: `useParams` aus `react-router-dom`

- [ ] **Step 1: Test schreiben**

`mentolder-web/src/pages/LeistungDetailPage.test.tsx` erstellen:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LeistungDetailPage } from './LeistungDetailPage';
import { leistungenKategorien } from '@/content';

const renderWithSlug = (slug: string) =>
  render(
    <MemoryRouter initialEntries={[`/leistungen/${slug}`]}>
      <Routes>
        <Route path="/leistungen/:slug" element={<LeistungDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );

const firstSvc = leistungenKategorien[0].services[0];

describe('LeistungDetailPage — valid slug', () => {
  it('renders the service headline', () => {
    renderWithSlug(firstSvc.slug);
    expect(screen.getByText(firstSvc.pageContent.headline)).toBeInTheDocument();
  });

  it('renders the intro text', () => {
    renderWithSlug(firstSvc.slug);
    expect(screen.getByText(firstSvc.pageContent.intro)).toBeInTheDocument();
  });

  it('renders the price', () => {
    renderWithSlug(firstSvc.slug);
    expect(screen.getByText(firstSvc.price)).toBeInTheDocument();
  });

  it('renders all features in the sidebar', () => {
    renderWithSlug(firstSvc.slug);
    for (const f of firstSvc.features) {
      expect(screen.getByText(f)).toBeInTheDocument();
    }
  });

  it('renders "Für wen?" when forWhom is non-empty', () => {
    if (firstSvc.pageContent.forWhom.length > 0) {
      renderWithSlug(firstSvc.slug);
      expect(screen.getByText('Für wen?')).toBeInTheDocument();
      expect(screen.getByText(firstSvc.pageContent.forWhom[0])).toBeInTheDocument();
    }
  });

  it('renders breadcrumb link to /leistungen', () => {
    renderWithSlug(firstSvc.slug);
    expect(screen.getByRole('link', { name: /Alle Leistungen/i })).toHaveAttribute('href', '/leistungen');
  });

  it('renders a contact link with service param', () => {
    renderWithSlug(firstSvc.slug);
    const ctaLinks = screen.getAllByRole('link', { name: /Kontakt aufnehmen/i });
    expect(ctaLinks.some((l) => l.getAttribute('href')?.includes(`service=${firstSvc.slug}`))).toBe(true);
  });
});

describe('LeistungDetailPage — invalid slug', () => {
  it('renders a 404 message', () => {
    renderWithSlug('gibts-nicht-das-angebot');
    expect(screen.getByText(/404/)).toBeInTheDocument();
  });

  it('renders a link back to /leistungen in 404 state', () => {
    renderWithSlug('gibts-nicht-das-angebot');
    expect(screen.getByRole('link', { name: /Alle Leistungen/i })).toHaveAttribute('href', '/leistungen');
  });
});
```

- [ ] **Step 2: Test fehlschlagen sehen**

```bash
cd mentolder-web && pnpm exec vitest run src/pages/LeistungDetailPage.test.tsx
```

Erwartet: FAIL — Placeholder rendert `"Detail — coming soon"`, kein Headline/Preis

- [ ] **Step 3: `LeistungDetailPage.tsx` vollständig implementieren**

```tsx
import { useParams, Link } from 'react-router-dom';
import { KickerBar } from '@/components/KickerBar';
import { CallToAction } from '@/components/CallToAction';
import { FAQ } from '@/components/FAQ';
import { leistungenKategorien } from '@/content';
import { iconRegistry } from '@/components/icons';

export function LeistungDetailPage() {
  const { slug } = useParams<{ slug: string }>();

  const allServices = leistungenKategorien.flatMap((kat) =>
    kat.services.map((svc) => ({ ...svc, katLabel: kat.label })),
  );
  const idx = allServices.findIndex((s) => s.slug === slug);
  const svc = idx !== -1 ? allServices[idx] : null;

  if (!svc) {
    return (
      <section className="pt-[120px] pb-[160px] max-w-[820px] mx-auto px-10 max-md:px-[22px]">
        <h1
          className="font-serif font-light text-fg leading-[1.05] m-0"
          style={{ fontSize: 'clamp(40px, 5.4vw, 64px)', letterSpacing: '-0.02em' }}
        >
          404 — <em>nicht gefunden</em>
        </h1>
        <p className="text-fg-soft mt-5 text-[18px] leading-[1.6]">
          Dieses Angebot existiert nicht.{' '}
          <Link to="/leistungen" className="text-brass border-b border-brass">
            Alle Leistungen →
          </Link>
        </p>
      </section>
    );
  }

  const prevSvc = idx > 0 ? allServices[idx - 1] : null;
  const nextSvc = idx < allServices.length - 1 ? allServices[idx + 1] : null;
  const Icon = iconRegistry[svc.icon];
  const pc = svc.pageContent;

  return (
    <>
      {/* Hero */}
      <section className="pt-[80px] pb-[60px] max-md:pt-[56px]">
        <div className="max-w-[1240px] mx-auto px-10 max-md:px-[22px]">
          <nav aria-label="Brotkrumen" className="mb-6">
            <Link
              to="/leistungen"
              className="font-mono text-[12px] tracking-[0.06em] text-mute no-underline hover:text-brass transition-colors inline-flex items-center gap-1.5"
            >
              <svg
                viewBox="0 0 14 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-[12px] h-[12px]"
                aria-hidden="true"
              >
                <path d="M9 2L5 7l4 5" />
              </svg>
              Alle Leistungen
            </Link>
          </nav>
          <KickerBar parts={[svc.katLabel]} className="mb-6" />
          <h1
            className="font-serif font-light text-fg leading-[1.05] m-0"
            style={{ fontSize: 'clamp(36px, 5vw, 64px)', letterSpacing: '-0.02em' }}
          >
            {pc.headline}
          </h1>
          <p className="text-[18px] leading-[1.6] text-fg-soft mt-5 max-w-[52ch]">
            {pc.intro}
          </p>
        </div>
      </section>

      {/* 2-Spalten-Layout */}
      <section className="py-[60px] border-t border-line">
        <div className="max-w-[1240px] mx-auto px-10 max-md:px-[22px] grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-16 max-md:gap-10 items-start">
          {/* Linke Spalte */}
          <div>
            {pc.sections.map((sec) => (
              <div key={sec.title} className="mb-10">
                <h2
                  className="font-serif text-[22px] text-fg m-0 mb-4"
                  style={{ letterSpacing: '-0.015em' }}
                >
                  {sec.title}
                </h2>
                <p className="text-fg-soft text-[16px] leading-[1.7] m-0">{sec.content}</p>
              </div>
            ))}
            {pc.forWhom.length > 0 && (
              <div className="mt-2">
                <h2
                  className="font-serif text-[22px] text-fg m-0 mb-4"
                  style={{ letterSpacing: '-0.015em' }}
                >
                  Für wen?
                </h2>
                <ul className="list-none p-0 m-0 flex flex-col gap-2">
                  {pc.forWhom.map((item) => (
                    <li
                      key={item}
                      className="flex items-baseline gap-3 text-[15px] text-fg-soft"
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-brass flex-shrink-0"
                        style={{ transform: 'translateY(2px)' }}
                        aria-hidden="true"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Sticky Sidebar */}
          <aside className="md:sticky md:top-[96px] rounded-xl border border-line-2 bg-ink-850 p-7">
            <div className="w-10 h-10 text-brass mb-5" aria-hidden="true">
              <Icon />
            </div>
            <div className="mb-5">
              <span
                className="font-serif text-[36px] text-brass"
                style={{ letterSpacing: '-0.02em' }}
              >
                {svc.price}
              </span>
              <span className="text-mute text-[14px] ml-2">{svc.priceUnit}</span>
            </div>
            <ul className="list-none p-0 m-0 flex flex-col gap-2.5 mb-7">
              {svc.features.map((f) => (
                <li
                  key={f}
                  className="flex items-baseline gap-2.5 text-[14px] text-fg-soft"
                >
                  <svg
                    viewBox="0 0 14 14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-3.5 h-3.5 flex-shrink-0 text-brass"
                    style={{ transform: 'translateY(1px)' }}
                    aria-hidden="true"
                  >
                    <path d="M2 7l4 4 6-7" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
            <Link
              to={`/kontakt?service=${svc.slug}`}
              className="block text-center text-ink-900 font-medium no-underline py-3 rounded-full mb-4 transition-colors"
              style={{ background: 'var(--brass)', fontSize: '14px' }}
            >
              Kontakt aufnehmen
            </Link>
            <p className="font-mono text-[11px] text-mute text-center m-0">
              Nettopreis gem. §19 UStG
            </p>
          </aside>
        </div>
      </section>

      {/* FAQ */}
      {pc.faq.length > 0 && <FAQ items={pc.faq} />}

      {/* Prev / Next */}
      {(prevSvc || nextSvc) && (
        <section className="py-[60px] border-t border-line">
          <div className="max-w-[1240px] mx-auto px-10 max-md:px-[22px] grid grid-cols-1 md:grid-cols-2 gap-4">
            {prevSvc ? (
              <Link
                to={`/leistungen/${prevSvc.slug}`}
                className="rounded-xl border border-line-2 bg-ink-850 p-6 no-underline group hover:border-brass/40 transition-colors"
              >
                <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-mute m-0 mb-2">
                  ← Vorheriges
                </p>
                <p className="font-serif text-[18px] text-fg m-0 group-hover:text-brass transition-colors">
                  {prevSvc.title}
                </p>
              </Link>
            ) : (
              <div />
            )}
            {nextSvc && (
              <Link
                to={`/leistungen/${nextSvc.slug}`}
                className="rounded-xl border border-line-2 bg-ink-850 p-6 no-underline group hover:border-brass/40 transition-colors text-right"
              >
                <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-mute m-0 mb-2">
                  Nächstes →
                </p>
                <p className="font-serif text-[18px] text-fg m-0 group-hover:text-brass transition-colors">
                  {nextSvc.title}
                </p>
              </Link>
            )}
          </div>
        </section>
      )}

      <CallToAction />
    </>
  );
}
```

- [ ] **Step 4: Tests grün sehen**

```bash
cd mentolder-web && pnpm exec vitest run src/pages/LeistungDetailPage.test.tsx
```

Erwartet: PASS — 9 Tests grün

- [ ] **Step 5: Commit**

```bash
git -C .. add mentolder-web/src/pages/LeistungDetailPage.tsx mentolder-web/src/pages/LeistungDetailPage.test.tsx
git -C .. commit -m "feat(mentolder-web): implement LeistungDetailPage with sidebar, FAQ, prev/next, 404-fallback"
```

---

## Task 6: `ReferenzenPage` implementieren

**Files:**
- Modify: `mentolder-web/src/pages/ReferenzenPage.tsx` (Placeholder ersetzen)
- Create: `mentolder-web/src/pages/ReferenzenPage.test.tsx`

**Interfaces:**
- Consumes: `referenzenConfig` aus `@/content`
- Consumes: `KickerBar` aus `@/components/KickerBar`

- [ ] **Step 1: Test schreiben**

`mentolder-web/src/pages/ReferenzenPage.test.tsx` erstellen:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReferenzenPage } from './ReferenzenPage';
import { referenzenConfig } from '@/content';

const renderPage = () =>
  render(
    <MemoryRouter>
      <ReferenzenPage />
    </MemoryRouter>,
  );

describe('ReferenzenPage', () => {
  it('renders the heading emphasis', () => {
    renderPage();
    expect(screen.getByText(/die mir vertrauen/)).toBeInTheDocument();
  });

  it('renders the subheading', () => {
    renderPage();
    expect(screen.getByText(referenzenConfig.subheading)).toBeInTheDocument();
  });

  it('renders all reference item names', () => {
    renderPage();
    for (const item of referenzenConfig.items) {
      expect(screen.getByText(item.name)).toBeInTheDocument();
    }
  });

  it('renders group labels when multiple types exist', () => {
    if (referenzenConfig.types.length > 1) {
      renderPage();
      expect(screen.getByText(referenzenConfig.types[0].label)).toBeInTheDocument();
    }
  });

  it('renders the Kontakt CTA link', () => {
    renderPage();
    expect(screen.getByRole('link', { name: 'Jetzt Kontakt aufnehmen' })).toHaveAttribute('href', '/kontakt');
  });

  it('does NOT render the empty-state when items exist', () => {
    if (referenzenConfig.items.length > 0) {
      renderPage();
      expect(screen.queryByText('Referenzen werden demnächst ergänzt.')).not.toBeInTheDocument();
    }
  });
});
```

- [ ] **Step 2: Test fehlschlagen sehen**

```bash
cd mentolder-web && pnpm exec vitest run src/pages/ReferenzenPage.test.tsx
```

Erwartet: FAIL — Placeholder, keine Items

- [ ] **Step 3: `ReferenzenPage.tsx` vollständig implementieren**

```tsx
import { Link } from 'react-router-dom';
import { KickerBar } from '@/components/KickerBar';
import { referenzenConfig } from '@/content';

export function ReferenzenPage() {
  const { subheading, types, items } = referenzenConfig;

  const knownTypeIds = new Set(types.map((t) => t.id));
  const groups = types.map((t) => ({
    id: t.id,
    label: t.label,
    items: items.filter((i) => i.type === t.id),
  }));
  const untyped = items.filter((i) => !i.type || !knownTypeIds.has(i.type));
  if (untyped.length > 0) {
    groups.push({ id: '__untyped__', label: 'Weitere', items: untyped });
  }
  const populatedGroups = groups.filter((g) => g.items.length > 0);
  const hasGrouping =
    populatedGroups.length > 1 ||
    (populatedGroups.length === 1 && populatedGroups[0].id !== '__untyped__');

  return (
    <>
      {/* Hero */}
      <section className="pt-[80px] pb-[60px] max-md:pt-[56px]">
        <div className="max-w-[1240px] mx-auto px-10 max-md:px-[22px]">
          <KickerBar parts={['Referenzen', 'Vertrauen']} className="mb-6" />
          <h1
            className="font-serif font-light text-fg leading-[1.05] m-0"
            style={{ fontSize: 'clamp(40px, 5.4vw, 72px)', letterSpacing: '-0.02em' }}
          >
            Unternehmen und Menschen, <em>die mir vertrauen.</em>
          </h1>
          <p className="text-[18px] leading-[1.6] text-fg-soft mt-5 max-w-[52ch]">
            {subheading}
          </p>
        </div>
      </section>

      {/* Grid */}
      <section className="py-[60px] border-t border-line">
        <div className="max-w-[1240px] mx-auto px-10 max-md:px-[22px]">
          {populatedGroups.length === 0 ? (
            <p className="text-center text-mute text-[16px] py-20">
              Referenzen werden demnächst ergänzt.
            </p>
          ) : (
            <div className="flex flex-col gap-14">
              {populatedGroups.map((group) => (
                <div key={group.id}>
                  {hasGrouping && (
                    <h2 className="font-mono text-[11px] tracking-[0.16em] uppercase text-brass m-0 mb-6 pb-3 border-b border-line">
                      {group.label}
                    </h2>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {group.items.map((ref) => (
                      <div
                        key={ref.name}
                        className="p-6 bg-ink-850 rounded-xl border border-line-2 hover:border-brass/30 transition-colors flex flex-col gap-3"
                      >
                        {ref.logoUrl ? (
                          <img
                            src={ref.logoUrl}
                            alt={`Logo ${ref.name}`}
                            className="h-10 w-auto object-contain opacity-80"
                          />
                        ) : (
                          <div
                            className="w-10 h-10 rounded-lg text-ink-900 flex items-center justify-center font-bold text-[15px] flex-shrink-0"
                            style={{ background: 'var(--brass)' }}
                            aria-hidden="true"
                          >
                            {ref.name.charAt(0)}
                          </div>
                        )}
                        <div>
                          {ref.url ? (
                            <a
                              href={ref.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-fg font-medium no-underline hover:text-brass transition-colors text-[15px]"
                            >
                              {ref.name}
                            </a>
                          ) : (
                            <span className="text-fg font-medium text-[15px]">{ref.name}</span>
                          )}
                          {ref.description && (
                            <p className="text-mute text-[13px] leading-[1.5] m-0 mt-1">
                              {ref.description}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Leiser Abschluss */}
          <div className="mt-16 text-center">
            <p className="text-fg-soft text-[16px] m-0 mb-5">
              Interesse an einer Zusammenarbeit?
            </p>
            <Link
              to="/kontakt"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full border text-brass no-underline text-[14px] font-medium hover:bg-brass hover:text-ink-900 transition-colors"
              style={{ borderColor: 'var(--brass)' }}
            >
              Jetzt Kontakt aufnehmen
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
```

- [ ] **Step 4: Tests grün sehen**

```bash
cd mentolder-web && pnpm exec vitest run src/pages/ReferenzenPage.test.tsx
```

Erwartet: PASS — 6 Tests grün

- [ ] **Step 5: Alle Tests auf einmal grün sehen**

```bash
cd mentolder-web && pnpm test
```

Erwartet: PASS — alle Tests grün (inkl. bestehende BlockRenderer-, HomePage-Tests)

- [ ] **Step 6: Commit**

```bash
git -C .. add mentolder-web/src/pages/ReferenzenPage.tsx mentolder-web/src/pages/ReferenzenPage.test.tsx
git -C .. commit -m "feat(mentolder-web): implement ReferenzenPage with grouped grid and empty-state"
```

---

## Abschlusskontrolle

Nach Task 6 prüfen:

```bash
# Alle Tests grün
cd mentolder-web && pnpm test

# TypeScript clean
cd mentolder-web && pnpm typecheck

# Dev-Server: alle 4 Routen manuell testen
cd mentolder-web && pnpm dev
# → http://localhost:5174/ueber-mich
# → http://localhost:5174/leistungen
# → http://localhost:5174/leistungen/fuehrung
# → http://localhost:5174/leistungen/gibts-nicht  (404-Fallback)
# → http://localhost:5174/referenzen
# → Navigation: "Leistungen"-Link zeigt auf /leistungen (kein /#angebote mehr)
```
