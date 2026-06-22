# Design Spec: mentolder-web Unterseiten

**Datum:** 2026-06-22
**Status:** approved
**Scope:** `/ueber-mich`, `/leistungen`, `/leistungen/:slug`, `/referenzen`

## Kontext

`mentolder-web` ist eine React-SPA (Vite + React Router + TypeScript) mit Block-Renderer-System für die Homepage. Die Navigation enthält bereits Links zu `/ueber-mich` und `/referenzen`, die aber ins Leere routen. `/leistungen` fehlt ganz. Ziel: alle vier Unterseiten implementieren — im visuellen Vokabular der bestehenden SPA (KickerBar, Halo-Gradienten, Brass-Akzente, Editorial-Serif), als Hybrid-JSX-Pages (kein Block-Schema), mit statischen Inhalten aus `content.ts`.

## Entscheidungen

| Frage | Entscheidung |
|---|---|
| Architektur | Hybrid JSX Pages (wie `KontaktPage`) — kein Block-Schema |
| Content-Quelle | Statisch in `content.ts` |
| Navigation | `/leistungen` ergänzen, `/ueber-mich` + `/referenzen` routen |
| Komponenten-Wiederverwendung | `KickerBar`, `CallToAction`, `FAQ`, `ServiceCard` |

## Querschnitt

### Routing (`App.tsx`)

Vier neue `<Route>`-Einträge:

```tsx
<Route path="/ueber-mich"          element={<UeberMichPage />} />
<Route path="/leistungen"          element={<LeistungenPage />} />
<Route path="/leistungen/:slug"    element={<LeistungDetailPage />} />
<Route path="/referenzen"          element={<ReferenzenPage />} />
```

### Navigation (`Navigation.tsx`)

`/#angebote` wird durch `/leistungen` ersetzt:

```ts
const links = [
  { to: '/leistungen', label: 'Leistungen' },
  { to: '/ueber-mich', label: 'Über mich' },
  { to: '/referenzen', label: 'Referenzen' },
  { to: '/kontakt',    label: 'Kontakt' },
];
```

### `content.ts` — neue Exporte

**`ueberMich`:**
```ts
export const ueberMich = {
  kicker: 'Über mich · Lüneburg · DE',
  headline: '30 Jahre Erfahrung —',
  headlineEmphasis: 'Mensch zuerst.',
  lede: string,
  milestones: Array<{ year: string; title: string; desc: string }>,
  sections: Array<{ title: string; content: string }>,
  notDoing: Array<{ title: string; text: string }>,
}
```

**`leistungen`** (Erweiterung der bestehenden `services`-Struktur):
```ts
export const leistungenKategorien = Array<{
  id: string;
  label: string;
  title: string;
  description: string;
  services: Array<{
    slug: string;
    title: string;
    price: string;
    priceUnit: string;
    description: string;
    features: string[];
    pageContent: {
      headline: string;
      intro: string;
      sections: Array<{ title: string; content: string }>;
      forWhom: string[];
      faq: Array<{ question: string; answer: string }>;
    };
  }>;
}>
```

**`referenzen`:**
```ts
export const referenzenConfig = {
  heading: string;
  subheading: string;
  types: Array<{ id: string; label: string }>;
  items: Array<{
    name: string;
    url?: string;
    logoUrl?: string;
    description?: string;
    type?: string;
  }>;
}
```

## Seiten-Design

### `/ueber-mich` — `UeberMichPage.tsx`

```
[Halo-Gradient rechts oben]
KickerBar: "Über mich · Lüneburg · DE"
H1: "30 Jahre Erfahrung — <em>Mensch zuerst.</em>"
Lede (max 52ch)

──── Milestones ────
Vertikale Timeline:
  Jahr (brass pill, mono) | Trennlinie | H3 + Beschreibung
  (ca. 6–8 Einträge aus ueberMich.milestones)

──── Sections ────
Pro section: brass Akzentbalken links + Serif-H2 + Fließtext
(Muster: identisch zu KontaktPage Aside-Karten, aber full-width)

──── "Was ich nicht mache" ────
Grid 1–2 Spalten
Pro Karte: roter Akzentbalken links | Titel (bold) + Text (fg-soft)

──── <CallToAction> ────
```

Sektions-Trenner: `border-t border-line` (kein Hintergrundwechsel).

### `/leistungen` — `LeistungenPage.tsx`

```
KickerBar: "Leistungen & Preise"
H1: "Was ich anbiete — <em>und was es kostet.</em>"
Lede: "Kein Kleingedrucktes. Alle Formate, alle Preise — transparent."

──── Erstgespräch-Hero-Card ────
bg-ink-850 · border-brass/30 · zentriert
"Kostenloses Erstgespräch · 30 Min · unverbindlich"
CTA-Button → /kontakt

──── Pro Kategorie (aus leistungenKategorien) ────
Mono-Eyebrow (Kategorie-Label)
Serif-H2 (Kategorie-Titel)
Kurzbeschreibung (fg-soft)
Grid 1–2 Spalten: ServiceCards
  → Preis (brass, groß) + Einheit
  → Features als bullet list
  → "Mehr erfahren →" Link zu /leistungen/:slug

──── Preishinweis ────
Mono-Text: "Alle Preise Nettopreise gem. §19 UStG"
Link "Individuelles Angebot →" → /kontakt

──── <CallToAction> ────
```

### `/leistungen/:slug` — `LeistungDetailPage.tsx`

```
Breadcrumb: "← Alle Leistungen" (mono, brass)
KickerBar: Kategorie-Label
H1: pageContent.headline
Lede: pageContent.intro

──── 2-spaltig ab md ────
Links (flex: 1.4):
  pageContent.sections (Serif-H2 + Fließtext)
  "Für wen?" Block (Bullet-Liste aus forWhom)

Rechts (sticky sidebar):
  Preis-Card:
    Preis (brass, 36px) + Einheit
    Features-Liste (checkmarks)
    CTA-Button → /kontakt?service=<slug>
    Mono: "Nettopreis gem. §19 UStG"

──── FAQ (wenn pageContent.faq.length > 0) ────
<FAQ>-Komponente

──── Prev/Next-Navigation ────
Zwei Karten: ← Vorheriger · Nächster →

──── <CallToAction> ────
```

**404-Fallback:** Wenn `slug` nicht in `leistungenKategorien` gefunden → inline 404-Block (kein Redirect).

### `/referenzen` — `ReferenzenPage.tsx`

```
KickerBar: "Referenzen · Vertrauen"
H1: "Unternehmen und Menschen, <em>die mir vertrauen.</em>"
Lede (aus referenzenConfig.subheading)

──── Gruppen (wenn types.length > 1) ────
Mono-H2 pro Gruppe + border-b-Trenner

──── Grid ────
1 / 2 / 3 Spalten (sm / md / lg)
Pro Karte:
  Logo (img) oder Initialen-Badge (brass bg)
  Name (Link wenn url, sonst plain)
  Beschreibung (muted, 14px)
  Hover: border-brass/30 Transition

──── Leer-Zustand ────
Zentriert: "Referenzen werden demnächst ergänzt."

──── Abschluss (kein <CallToAction>) ────
"Interesse an einer Zusammenarbeit?"
Link-Button → /kontakt
```

Bewusst leiser Abschluss — keine volle CTA-Komponente.

## Neue Dateien

```
mentolder-web/src/pages/
  UeberMichPage.tsx
  LeistungenPage.tsx
  LeistungDetailPage.tsx
  ReferenzenPage.tsx
```

Keine neuen Primitiv-Komponenten nötig — alle Bausteine (`KickerBar`, `CallToAction`, `FAQ`, `ServiceCard`) existieren bereits.

## Geänderte Dateien

| Datei | Änderung |
|---|---|
| `src/App.tsx` | 4 neue Routes |
| `src/components/Navigation.tsx` | `/#angebote` → `/leistungen` |
| `src/content.ts` | `ueberMich`, `leistungenKategorien`, `referenzenConfig` |

## Nicht im Scope

- Block-Schema-Erweiterungen für neue Block-Typen
- API-Anbindung an Astro-Backend
- Admin-Bearbeitungsebene für Unterseiten-Content
- i18n / Mehrsprachigkeit
