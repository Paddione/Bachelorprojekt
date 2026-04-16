# Admin-Sidebar + Website-CMS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin-Bereich bekommt eine persistente Sidebar-Navigation; alle bisher hardcoded Website-Inhalte (Hero, Startseite, Über mich, FAQ, Kontakt) werden über den Admin editierbar.

**Architecture:** Ein neues `AdminLayout.astro` ersetzt `Layout.astro` auf allen Admin-Seiten und liefert die Sidebar. Neue Inhalte werden als JSON-Blobs in der bestehenden `site_settings`-Tabelle gespeichert. Die statische Config in `mentolder.ts` bleibt Fallback; DB-Wert geht vor, identisch zum bestehenden Muster bei Services/Leistungen.

**Tech Stack:** Astro 5, Svelte 5, TypeScript, PostgreSQL (`pg`-Pool), Tailwind CSS

---

## File Map

**Neu erstellen:**
- `website/src/layouts/AdminLayout.astro` — Sidebar-Layout für alle Admin-Seiten
- `website/src/pages/admin/startseite.astro` — Hero + Startseiten-Inhalte bearbeiten
- `website/src/pages/admin/uebermich.astro` — Über-mich-Seite bearbeiten
- `website/src/pages/admin/faq.astro` — FAQ-Liste bearbeiten
- `website/src/pages/admin/kontakt.astro` — Kontaktseiten-Texte bearbeiten
- `website/src/pages/api/admin/startseite/save.ts` — POST-Handler für Startseite
- `website/src/pages/api/admin/uebermich/save.ts` — POST-Handler für Über mich
- `website/src/pages/api/admin/faq/save.ts` — POST-Handler für FAQ
- `website/src/pages/api/admin/kontakt/save.ts` — POST-Handler für Kontakt

**Modifizieren:**
- `website/src/lib/website-db.ts` — 8 neue DB-Funktionen anhängen
- `website/src/lib/content.ts` — 4 neue `getEffective*`-Funktionen
- `website/src/pages/admin.astro` — Kachel-Grid entfernen, AdminLayout verwenden
- `website/src/pages/admin/bugs.astro` — AdminLayout, Zurück-Button entfernen
- `website/src/pages/admin/termine.astro` — AdminLayout, Zurück-Button entfernen
- `website/src/pages/admin/angebote.astro` — AdminLayout, Zurück-Button entfernen
- `website/src/pages/admin/referenzen.astro` — AdminLayout, Zurück-Button entfernen
- `website/src/pages/admin/rechtliches.astro` — AdminLayout, Zurück-Button entfernen
- `website/src/pages/admin/clients.astro` — AdminLayout, Zurück-Button entfernen
- `website/src/pages/admin/mattermost.astro` — AdminLayout, Zurück-Button entfernen
- `website/src/pages/admin/projekte.astro` — AdminLayout, Zurück-Button entfernen
- `website/src/pages/admin/zeiterfassung.astro` — AdminLayout, Zurück-Button entfernen
- `website/src/pages/admin/rechnungen.astro` — AdminLayout, Zurück-Button entfernen
- `website/src/pages/admin/followups.astro` — AdminLayout, Zurück-Button entfernen
- `website/src/pages/admin/kalender.astro` — AdminLayout, Zurück-Button entfernen
- `website/src/pages/index.astro` — `getEffectiveHomepage` verwenden
- `website/src/pages/ueber-mich.astro` — `getEffectiveUebermich` verwenden
- `website/src/pages/kontakt.astro` — `getEffectiveKontakt` verwenden

---

## Task 1: DB-Funktionen in `website-db.ts`

**Files:**
- Modify: `website/src/lib/website-db.ts` (ans Ende anhängen)

- [ ] **Schritt 1: Typen und Funktionen ans Ende von `website-db.ts` anhängen**

```typescript
// ── Homepage Content (hero + startseite) ─────────────────────────────────────

export interface HomepageHero {
  title: string;
  subtitle: string;
  tagline: string;
}

export interface WhyMePoint {
  title: string;
  text: string;
}

export interface StatItem {
  value: string;
  label: string;
}

export interface HomepageContent {
  hero: HomepageHero;
  stats: StatItem[];
  servicesHeadline: string;
  servicesSubheadline: string;
  whyMeHeadline: string;
  whyMeIntro: string;
  whyMePoints: WhyMePoint[];
  quote: string;
  quoteName: string;
}

export async function getHomepageContent(brand: string): Promise<HomepageContent | null> {
  const raw = await getSiteSetting(brand, 'homepage');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function saveHomepageContent(brand: string, data: HomepageContent): Promise<void> {
  await setSiteSetting(brand, 'homepage', JSON.stringify(data));
}

// ── Über mich Content ─────────────────────────────────────────────────────────

export interface UebermichSection {
  title: string;
  content: string;
}

export interface UebermichMilestone {
  year: string;
  title: string;
  desc: string;
}

export interface UebermichNotDoing {
  title: string;
  text: string;
}

export interface UebermichContent {
  pageHeadline: string;
  subheadline: string;
  introParagraphs: string[];
  sections: UebermichSection[];
  milestones: UebermichMilestone[];
  notDoing: UebermichNotDoing[];
  privateText: string;
}

export async function getUebermichContent(brand: string): Promise<UebermichContent | null> {
  const raw = await getSiteSetting(brand, 'uebermich');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function saveUebermichContent(brand: string, data: UebermichContent): Promise<void> {
  await setSiteSetting(brand, 'uebermich', JSON.stringify(data));
}

// ── FAQ Content ───────────────────────────────────────────────────────────────

export interface FaqItem {
  question: string;
  answer: string;
}

export async function getFaqContent(brand: string): Promise<FaqItem[] | null> {
  const raw = await getSiteSetting(brand, 'faq');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function saveFaqContent(brand: string, items: FaqItem[]): Promise<void> {
  await setSiteSetting(brand, 'faq', JSON.stringify(items));
}

// ── Kontakt Content ───────────────────────────────────────────────────────────

export interface KontaktContent {
  intro: string;
  sidebarTitle: string;
  sidebarText: string;
  sidebarCta: string;
  showPhone: boolean;
}

export async function getKontaktContent(brand: string): Promise<KontaktContent | null> {
  const raw = await getSiteSetting(brand, 'kontakt');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function saveKontaktContent(brand: string, data: KontaktContent): Promise<void> {
  await setSiteSetting(brand, 'kontakt', JSON.stringify(data));
}
```

- [ ] **Schritt 2: TypeScript-Kompilierung prüfen**

```bash
cd website && npx tsc --noEmit 2>&1 | head -20
```
Erwartung: keine Fehler in `website-db.ts`

- [ ] **Schritt 3: Commit**

```bash
git add website/src/lib/website-db.ts
git commit -m "feat(website-db): add homepage/uebermich/faq/kontakt content functions"
```

---

## Task 2: `content.ts` — Effective-Content-Helpers

**Files:**
- Modify: `website/src/lib/content.ts`

- [ ] **Schritt 1: 4 neue Funktionen in `content.ts` anhängen**

```typescript
import {
  getHomepageContent,
  getUebermichContent,
  getFaqContent,
  getKontaktContent,
} from './website-db';
import type {
  HomepageContent,
  UebermichContent,
  FaqItem,
  KontaktContent,
} from './website-db';

export async function getEffectiveHomepage(): Promise<HomepageContent> {
  const db = await getHomepageContent(BRAND).catch(() => null);
  const c = config.homepage;
  if (!db) return {
    hero: { title: 'Digital Coach &\nFührungskräfte-Mentor', subtitle: c.whyMeIntro, tagline: 'Praxisnah. Strukturiert. Auf Augenhöhe.' },
    stats: c.stats,
    servicesHeadline: c.servicesHeadline,
    servicesSubheadline: c.servicesSubheadline,
    whyMeHeadline: c.whyMeHeadline,
    whyMeIntro: c.whyMeIntro,
    whyMePoints: c.whyMePoints.map(p => ({ title: p.title, text: p.text })),
    quote: c.quote,
    quoteName: c.quoteName,
  };
  return db;
}

export async function getEffectiveUebermich(): Promise<UebermichContent> {
  const db = await getUebermichContent(BRAND).catch(() => null);
  if (!db) return config.uebermich;
  return db;
}

export async function getEffectiveFaq(): Promise<FaqItem[]> {
  const db = await getFaqContent(BRAND).catch(() => null);
  if (!db) return config.faq;
  return db;
}

export async function getEffectiveKontakt(): Promise<KontaktContent> {
  const db = await getKontaktContent(BRAND).catch(() => null);
  if (!db) return config.kontakt;
  return db;
}
```

- [ ] **Schritt 2: Import-Zeile oben in `content.ts` ergänzen**

Die bestehende Import-Zeile:
```typescript
import { getServiceConfig, getLeistungenConfig, getSiteSetting, getReferenzen } from './website-db';
```
ersetzen durch:
```typescript
import {
  getServiceConfig,
  getLeistungenConfig,
  getSiteSetting,
  getReferenzen,
  getHomepageContent,
  getUebermichContent,
  getFaqContent,
  getKontaktContent,
} from './website-db';
import type {
  HomepageContent,
  UebermichContent,
  FaqItem,
  KontaktContent,
} from './website-db';
```

- [ ] **Schritt 3: TypeScript-Kompilierung prüfen**

```bash
cd website && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Schritt 4: Commit**

```bash
git add website/src/lib/content.ts
git commit -m "feat(content): add getEffectiveHomepage/Uebermich/Faq/Kontakt helpers"
```

---

## Task 3: `AdminLayout.astro` erstellen

**Files:**
- Create: `website/src/layouts/AdminLayout.astro`

- [ ] **Schritt 1: `AdminLayout.astro` anlegen**

```astro
---
import '../styles/global.css';
import { config } from '../config/index';

interface Props {
  title: string;
}

const { title } = Astro.props;
const path = Astro.url.pathname;

const navGroups = [
  {
    label: 'Übersicht',
    items: [
      { href: '/admin', label: 'Dashboard', icon: '📊' },
    ],
  },
  {
    label: 'Betrieb',
    items: [
      { href: '/admin/bugs',         label: 'Bugs',          icon: '🐛' },
      { href: '/admin/termine',      label: 'Termine',       icon: '📅' },
      { href: '/admin/clients',      label: 'Clients',       icon: '👥' },
      { href: '/admin/mattermost',   label: 'Mattermost',    icon: '💬' },
      { href: '/admin/projekte',     label: 'Projekte',      icon: '📋' },
      { href: '/admin/zeiterfassung',label: 'Zeiterfassung', icon: '⏱️' },
      { href: '/admin/rechnungen',   label: 'Rechnungen',    icon: '💶' },
      { href: '/admin/followups',    label: 'Follow-ups',    icon: '🔔' },
      { href: '/admin/kalender',     label: 'Kalender',      icon: '🗓️' },
    ],
  },
  {
    label: 'Website',
    items: [
      { href: '/admin/startseite',   label: 'Startseite',    icon: '🏠' },
      { href: '/admin/uebermich',    label: 'Über mich',     icon: '🙋' },
      { href: '/admin/angebote',     label: 'Angebote',      icon: '🛍️' },
      { href: '/admin/faq',          label: 'FAQ',           icon: '❓' },
      { href: '/admin/kontakt',      label: 'Kontakt',       icon: '✉️' },
      { href: '/admin/referenzen',   label: 'Referenzen',    icon: '🏆' },
      { href: '/admin/rechtliches',  label: 'Rechtliches',   icon: '⚖️' },
    ],
  },
];

function isActive(href: string): boolean {
  if (href === '/admin') return path === '/admin';
  return path.startsWith(href);
}
---

<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Merriweather:wght@400;700&display=swap" rel="stylesheet" />
    <title>{title} | Admin — {config.meta.siteTitle}</title>
  </head>
  <body class="min-h-screen bg-dark text-light flex">

    <!-- Sidebar -->
    <aside class="w-52 flex-shrink-0 min-h-screen bg-dark-light border-r border-dark-lighter flex flex-col">
      <div class="px-4 py-5 border-b border-dark-lighter">
        <a href="/admin" class="text-gold font-bold text-lg font-serif leading-tight">Admin</a>
        <p class="text-xs text-muted mt-0.5">{config.meta.siteTitle}</p>
      </div>

      <nav class="flex-1 overflow-y-auto py-4 px-2 space-y-5">
        {navGroups.map(group => (
          <div>
            <p class="px-2 mb-1.5 text-xs font-semibold text-muted uppercase tracking-widest">{group.label}</p>
            <ul class="space-y-0.5">
              {group.items.map(item => (
                <li>
                  <a
                    href={item.href}
                    class={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive(item.href)
                        ? 'bg-gold/10 text-gold'
                        : 'text-muted hover:text-light hover:bg-dark-lighter'
                    }`}
                  >
                    <span class="text-base leading-none">{item.icon}</span>
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div class="px-4 py-4 border-t border-dark-lighter">
        <a href="/" class="text-xs text-muted hover:text-gold transition-colors">← Website</a>
      </div>
    </aside>

    <!-- Main -->
    <main class="flex-1 min-h-screen overflow-y-auto">
      <slot />
    </main>

  </body>
</html>
```

- [ ] **Schritt 2: Astro-Build prüfen**

```bash
cd website && npx astro check 2>&1 | head -30
```
Erwartung: keine Fehler in `AdminLayout.astro`

- [ ] **Schritt 3: Commit**

```bash
git add website/src/layouts/AdminLayout.astro
git commit -m "feat(admin): add AdminLayout with persistent sidebar"
```

---

## Task 4: Alle Admin-Seiten auf `AdminLayout` umstellen

**Files:**
- Modify: `website/src/pages/admin.astro` und alle `website/src/pages/admin/*.astro`

Für **jede** der folgenden Dateien:
- `admin.astro`, `admin/bugs.astro`, `admin/termine.astro`, `admin/angebote.astro`, `admin/referenzen.astro`, `admin/rechtliches.astro`, `admin/clients.astro`, `admin/mattermost.astro`, `admin/projekte.astro`, `admin/zeiterfassung.astro`, `admin/rechnungen.astro`, `admin/followups.astro`, `admin/kalender.astro`

- [ ] **Schritt 1: Import-Zeile tauschen**

In jeder Datei:
```typescript
// ALT:
import Layout from '../../layouts/Layout.astro';
// NEU (für admin/*.astro):
import AdminLayout from '../../layouts/AdminLayout.astro';

// ALT (für admin.astro):
import Layout from '../layouts/Layout.astro';
// NEU:
import AdminLayout from '../layouts/AdminLayout.astro';
```

- [ ] **Schritt 2: `<Layout title="...">` → `<AdminLayout title="...">`**

Alle Vorkommen von `<Layout title=` und `</Layout>` durch `<AdminLayout title=` und `</AdminLayout>` ersetzen.

- [ ] **Schritt 3: Zurück-Button entfernen**

In jeder Admin-Seite (außer `admin.astro`) gibt es dieses Muster — löschen:
```astro
<a href="/admin" class="px-4 py-2 bg-dark-light text-muted rounded-lg text-sm font-medium hover:text-light transition-colors">
  ← Zurück
</a>
```
Auch die umgebende `flex items-center justify-between`-Zeile anpassen, falls dann nur noch das `<div>` mit Titel bleibt (Flexbox entfernen, einfaches `<div class="mb-8">` reicht).

- [ ] **Schritt 4: Kachel-Grid in `admin.astro` entfernen**

Das gesamte `<!-- Dashboard grid -->` Block entfernen (Zeilen 74–170 in der aktuellen Datei). Der KPI-Banner (`<!-- KPI Banner -->`) bleibt erhalten.

- [ ] **Schritt 5: Dev-Server starten und alle Admin-Seiten prüfen**

```bash
cd website && npx astro dev
```
Aufrufen und visuell prüfen:
- http://localhost:4321/admin — Sidebar sichtbar, KPI-Banner sichtbar, kein Kachel-Grid
- http://localhost:4321/admin/bugs — Sidebar sichtbar, kein Zurück-Button
- http://localhost:4321/admin/angebote — Sidebar sichtbar, aktiver Eintrag "Angebote" goldfarben

- [ ] **Schritt 6: Commit**

```bash
git add website/src/pages/admin.astro website/src/pages/admin/
git commit -m "feat(admin): switch all admin pages to AdminLayout with sidebar"
```

---

## Task 5: `/admin/startseite` + API

**Files:**
- Create: `website/src/pages/admin/startseite.astro`
- Create: `website/src/pages/api/admin/startseite/save.ts`

- [ ] **Schritt 1: `startseite.astro` anlegen**

```astro
---
import AdminLayout from '../../layouts/AdminLayout.astro';
import { getSession, getLoginUrl, isAdmin } from '../../lib/auth';
import { getEffectiveHomepage } from '../../lib/content';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl());
if (!isAdmin(session)) return Astro.redirect('/admin');

const saved = Astro.url.searchParams.get('saved') === '1';
const hp = await getEffectiveHomepage();

const inputCls = 'w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50';
const labelCls = 'block text-xs text-muted mb-1';
const sectionCls = 'p-6 bg-dark-light rounded-xl border border-dark-lighter space-y-4';
---

<AdminLayout title="Admin — Startseite">
  <section class="pt-10 pb-20 px-8 max-w-4xl">

    <div class="mb-8">
      <h1 class="text-3xl font-bold text-light font-serif">Startseite</h1>
      <p class="text-muted mt-1">Hero, Stats, Warum-ich-Abschnitt und Zitat bearbeiten</p>
    </div>

    {saved && (
      <div class="mb-6 p-4 bg-green-500/10 border border-green-500/30 rounded-xl text-green-400 text-sm">
        Änderungen gespeichert.
      </div>
    )}

    <form method="POST" action="/api/admin/startseite/save" class="space-y-10">

      <!-- Hero -->
      <div class={sectionCls}>
        <h2 class="text-xl font-bold text-light font-serif">Hero-Bereich</h2>
        <div>
          <label class={labelCls}>Tagline (goldene Zeile oben)</label>
          <input type="text" name="hero_tagline" value={hp.hero.tagline} class={inputCls} />
        </div>
        <div>
          <label class={labelCls}>Titel (große Überschrift)</label>
          <textarea name="hero_title" rows={2} class={`${inputCls} resize-none`}>{hp.hero.title}</textarea>
        </div>
        <div>
          <label class={labelCls}>Untertitel</label>
          <textarea name="hero_subtitle" rows={3} class={`${inputCls} resize-none`}>{hp.hero.subtitle}</textarea>
        </div>
      </div>

      <!-- Stats -->
      <div class={sectionCls}>
        <h2 class="text-xl font-bold text-light font-serif">Statistiken (Trust-Indikatoren)</h2>
        {hp.stats.map((stat, i) => (
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class={labelCls}>Wert #{i + 1}</label>
              <input type="text" name={`stat_${i}_value`} value={stat.value} class={inputCls} />
            </div>
            <div>
              <label class={labelCls}>Label #{i + 1}</label>
              <input type="text" name={`stat_${i}_label`} value={stat.label} class={inputCls} />
            </div>
          </div>
        ))}
      </div>

      <!-- Services Section -->
      <div class={sectionCls}>
        <h2 class="text-xl font-bold text-light font-serif">Angebote-Sektion</h2>
        <div>
          <label class={labelCls}>Überschrift</label>
          <input type="text" name="services_headline" value={hp.servicesHeadline} class={inputCls} />
        </div>
        <div>
          <label class={labelCls}>Unterüberschrift</label>
          <textarea name="services_subheadline" rows={2} class={`${inputCls} resize-none`}>{hp.servicesSubheadline}</textarea>
        </div>
      </div>

      <!-- Why Me -->
      <div class={sectionCls}>
        <h2 class="text-xl font-bold text-light font-serif">„Warum ich?"-Abschnitt</h2>
        <div>
          <label class={labelCls}>Überschrift</label>
          <input type="text" name="whyme_headline" value={hp.whyMeHeadline} class={inputCls} />
        </div>
        <div>
          <label class={labelCls}>Einleitungstext</label>
          <textarea name="whyme_intro" rows={3} class={`${inputCls} resize-none`}>{hp.whyMeIntro}</textarea>
        </div>
        <p class="text-xs font-semibold text-gold uppercase tracking-widest">3 Punkte</p>
        {hp.whyMePoints.map((pt, i) => (
          <div class="p-4 bg-dark rounded-lg border border-dark-lighter space-y-2">
            <div>
              <label class={labelCls}>Titel Punkt {i + 1}</label>
              <input type="text" name={`whyme_point_${i}_title`} value={pt.title} class={inputCls} />
            </div>
            <div>
              <label class={labelCls}>Text Punkt {i + 1}</label>
              <textarea name={`whyme_point_${i}_text`} rows={2} class={`${inputCls} resize-none`}>{pt.text}</textarea>
            </div>
          </div>
        ))}
      </div>

      <!-- Quote -->
      <div class={sectionCls}>
        <h2 class="text-xl font-bold text-light font-serif">Zitat</h2>
        <div>
          <label class={labelCls}>Zitat-Text</label>
          <textarea name="quote" rows={2} class={`${inputCls} resize-none`}>{hp.quote}</textarea>
        </div>
        <div>
          <label class={labelCls}>Name unter dem Zitat</label>
          <input type="text" name="quote_name" value={hp.quoteName} class={inputCls} />
        </div>
      </div>

      <div class="flex justify-end">
        <button type="submit" class="px-6 py-3 bg-gold text-dark font-semibold rounded-lg hover:bg-gold/90 transition-colors">
          Speichern
        </button>
      </div>

    </form>
  </section>
</AdminLayout>
```

- [ ] **Schritt 2: `save.ts` anlegen**

```typescript
// website/src/pages/api/admin/startseite/save.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { saveHomepageContent } from '../../../../lib/website-db';

const BRAND = process.env.BRAND || 'mentolder';

export const POST: APIRoute = async ({ request, redirect }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });

  const form = await request.formData();
  const g = (k: string) => (form.get(k) as string | null) ?? '';

  await saveHomepageContent(BRAND, {
    hero: {
      tagline: g('hero_tagline'),
      title: g('hero_title'),
      subtitle: g('hero_subtitle'),
    },
    stats: [0, 1, 2, 3].map(i => ({
      value: g(`stat_${i}_value`),
      label: g(`stat_${i}_label`),
    })),
    servicesHeadline: g('services_headline'),
    servicesSubheadline: g('services_subheadline'),
    whyMeHeadline: g('whyme_headline'),
    whyMeIntro: g('whyme_intro'),
    whyMePoints: [0, 1, 2].map(i => ({
      title: g(`whyme_point_${i}_title`),
      text: g(`whyme_point_${i}_text`),
    })),
    quote: g('quote'),
    quoteName: g('quote_name'),
  });

  return redirect('/admin/startseite?saved=1');
};
```

- [ ] **Schritt 3: Im Browser prüfen**

```bash
cd website && npx astro dev
```
- http://localhost:4321/admin/startseite aufrufen — Formular sichtbar, Sidebar aktiv bei "Startseite"
- Einen Wert ändern, Speichern klicken → grüner Bestätigungshinweis erscheint

- [ ] **Schritt 4: Commit**

```bash
git add website/src/pages/admin/startseite.astro website/src/pages/api/admin/startseite/
git commit -m "feat(admin): add Startseite editor (hero, stats, whyme, quote)"
```

---

## Task 6: `/admin/uebermich` + API

**Files:**
- Create: `website/src/pages/admin/uebermich.astro`
- Create: `website/src/pages/api/admin/uebermich/save.ts`

- [ ] **Schritt 1: `uebermich.astro` anlegen**

```astro
---
import AdminLayout from '../../layouts/AdminLayout.astro';
import { getSession, getLoginUrl, isAdmin } from '../../lib/auth';
import { getEffectiveUebermich } from '../../lib/content';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl());
if (!isAdmin(session)) return Astro.redirect('/admin');

const saved = Astro.url.searchParams.get('saved') === '1';
const um = await getEffectiveUebermich();

const inputCls = 'w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50';
const labelCls = 'block text-xs text-muted mb-1';
const sectionCls = 'p-6 bg-dark-light rounded-xl border border-dark-lighter space-y-4';
---

<AdminLayout title="Admin — Über mich">
  <section class="pt-10 pb-20 px-8 max-w-4xl">

    <div class="mb-8">
      <h1 class="text-3xl font-bold text-light font-serif">Über mich</h1>
      <p class="text-muted mt-1">Seiteninhalte der Über-mich-Seite bearbeiten</p>
    </div>

    {saved && (
      <div class="mb-6 p-4 bg-green-500/10 border border-green-500/30 rounded-xl text-green-400 text-sm">
        Änderungen gespeichert.
      </div>
    )}

    <form method="POST" action="/api/admin/uebermich/save" class="space-y-10">

      <!-- Header -->
      <div class={sectionCls}>
        <h2 class="text-xl font-bold text-light font-serif">Seiten-Header</h2>
        <div>
          <label class={labelCls}>Subheadline (goldene Zeile)</label>
          <input type="text" name="subheadline" value={um.subheadline} class={inputCls} />
        </div>
        <div>
          <label class={labelCls}>Haupt-Headline</label>
          <input type="text" name="pageHeadline" value={um.pageHeadline} class={inputCls} />
        </div>
      </div>

      <!-- Intro -->
      <div class={sectionCls}>
        <h2 class="text-xl font-bold text-light font-serif">Intro-Absätze</h2>
        {um.introParagraphs.map((para, i) => (
          <div>
            <label class={labelCls}>Absatz {i + 1}</label>
            <textarea name={`intro_${i}`} rows={3} class={`${inputCls} resize-none`}>{para}</textarea>
          </div>
        ))}
      </div>

      <!-- Sections -->
      <div class={sectionCls}>
        <h2 class="text-xl font-bold text-light font-serif">Abschnitte</h2>
        {um.sections.map((sec, i) => (
          <div class="p-4 bg-dark rounded-lg border border-dark-lighter space-y-2">
            <div>
              <label class={labelCls}>Titel Abschnitt {i + 1}</label>
              <input type="text" name={`sec_${i}_title`} value={sec.title} class={inputCls} />
            </div>
            <div>
              <label class={labelCls}>Text</label>
              <textarea name={`sec_${i}_content`} rows={4} class={`${inputCls} resize-none`}>{sec.content}</textarea>
            </div>
          </div>
        ))}
      </div>

      <!-- Milestones -->
      <div class={sectionCls}>
        <h2 class="text-xl font-bold text-light font-serif">Lebenslauf / Milestones</h2>
        <input type="hidden" name="milestone_count" value={um.milestones.length} />
        {um.milestones.map((m, i) => (
          <div class="p-4 bg-dark rounded-lg border border-dark-lighter space-y-2">
            <div class="grid grid-cols-3 gap-3">
              <div>
                <label class={labelCls}>Jahr/Zeitraum</label>
                <input type="text" name={`ms_${i}_year`} value={m.year} class={inputCls} />
              </div>
              <div class="col-span-2">
                <label class={labelCls}>Titel</label>
                <input type="text" name={`ms_${i}_title`} value={m.title} class={inputCls} />
              </div>
            </div>
            <div>
              <label class={labelCls}>Beschreibung</label>
              <textarea name={`ms_${i}_desc`} rows={2} class={`${inputCls} resize-none`}>{m.desc}</textarea>
            </div>
          </div>
        ))}
        <!-- Neuer Milestone -->
        <div class="p-4 bg-dark rounded-lg border border-dashed border-dark-lighter space-y-2">
          <p class="text-xs font-semibold text-gold uppercase tracking-widest">Neuer Eintrag</p>
          <div class="grid grid-cols-3 gap-3">
            <div>
              <label class={labelCls}>Jahr/Zeitraum</label>
              <input type="text" name="ms_new_year" class={inputCls} placeholder="z.B. 2025" />
            </div>
            <div class="col-span-2">
              <label class={labelCls}>Titel</label>
              <input type="text" name="ms_new_title" class={inputCls} />
            </div>
          </div>
          <div>
            <label class={labelCls}>Beschreibung</label>
            <textarea name="ms_new_desc" rows={2} class={`${inputCls} resize-none`}></textarea>
          </div>
        </div>
      </div>

      <!-- Not Doing -->
      <div class={sectionCls}>
        <h2 class="text-xl font-bold text-light font-serif">„Was ich nicht mache"</h2>
        <input type="hidden" name="notdoing_count" value={um.notDoing.length} />
        {um.notDoing.map((nd, i) => (
          <div class="p-4 bg-dark rounded-lg border border-dark-lighter space-y-2">
            <div>
              <label class={labelCls}>Titel</label>
              <input type="text" name={`nd_${i}_title`} value={nd.title} class={inputCls} />
            </div>
            <div>
              <label class={labelCls}>Text</label>
              <textarea name={`nd_${i}_text`} rows={2} class={`${inputCls} resize-none`}>{nd.text}</textarea>
            </div>
          </div>
        ))}
        <div class="p-4 bg-dark rounded-lg border border-dashed border-dark-lighter space-y-2">
          <p class="text-xs font-semibold text-gold uppercase tracking-widest">Neuer Eintrag</p>
          <div>
            <label class={labelCls}>Titel</label>
            <input type="text" name="nd_new_title" class={inputCls} />
          </div>
          <div>
            <label class={labelCls}>Text</label>
            <textarea name="nd_new_text" rows={2} class={`${inputCls} resize-none`}></textarea>
          </div>
        </div>
      </div>

      <!-- Private -->
      <div class={sectionCls}>
        <h2 class="text-xl font-bold text-light font-serif">Privattext</h2>
        <p class="text-xs text-muted">Tipp: <code class="bg-dark px-1 rounded">{'{city}'}</code> wird automatisch durch den Stadtnamen ersetzt.</p>
        <textarea name="privateText" rows={4} class={`${inputCls} resize-none`}>{um.privateText}</textarea>
      </div>

      <div class="flex justify-end">
        <button type="submit" class="px-6 py-3 bg-gold text-dark font-semibold rounded-lg hover:bg-gold/90 transition-colors">
          Speichern
        </button>
      </div>

    </form>
  </section>
</AdminLayout>
```

- [ ] **Schritt 2: `save.ts` anlegen**

```typescript
// website/src/pages/api/admin/uebermich/save.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { saveUebermichContent } from '../../../../lib/website-db';

const BRAND = process.env.BRAND || 'mentolder';

export const POST: APIRoute = async ({ request, redirect }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });

  const form = await request.formData();
  const g = (k: string) => (form.get(k) as string | null) ?? '';

  const milestoneCount = parseInt(g('milestone_count') || '0', 10);
  const milestones = Array.from({ length: milestoneCount }, (_, i) => ({
    year: g(`ms_${i}_year`),
    title: g(`ms_${i}_title`),
    desc: g(`ms_${i}_desc`),
  }));
  const msNewYear = g('ms_new_year').trim();
  const msNewTitle = g('ms_new_title').trim();
  if (msNewYear || msNewTitle) {
    milestones.push({ year: msNewYear, title: msNewTitle, desc: g('ms_new_desc') });
  }

  const notDoingCount = parseInt(g('notdoing_count') || '0', 10);
  const notDoing = Array.from({ length: notDoingCount }, (_, i) => ({
    title: g(`nd_${i}_title`),
    text: g(`nd_${i}_text`),
  }));
  const ndNewTitle = g('nd_new_title').trim();
  if (ndNewTitle) {
    notDoing.push({ title: ndNewTitle, text: g('nd_new_text') });
  }

  await saveUebermichContent(BRAND, {
    subheadline: g('subheadline'),
    pageHeadline: g('pageHeadline'),
    introParagraphs: [g('intro_0'), g('intro_1')].filter(Boolean),
    sections: [0, 1].map(i => ({
      title: g(`sec_${i}_title`),
      content: g(`sec_${i}_content`),
    })),
    milestones,
    notDoing,
    privateText: g('privateText'),
  });

  return redirect('/admin/uebermich?saved=1');
};
```

- [ ] **Schritt 3: Im Browser prüfen**

```bash
cd website && npx astro dev
```
- http://localhost:4321/admin/uebermich — Formular mit allen Feldern
- Neuen Milestone hinzufügen, speichern, Seite neu laden → Milestone erscheint

- [ ] **Schritt 4: Commit**

```bash
git add website/src/pages/admin/uebermich.astro website/src/pages/api/admin/uebermich/
git commit -m "feat(admin): add Über-mich editor with milestones and notDoing"
```

---

## Task 7: `/admin/faq` + API

**Files:**
- Create: `website/src/pages/admin/faq.astro`
- Create: `website/src/pages/api/admin/faq/save.ts`

- [ ] **Schritt 1: `faq.astro` anlegen**

```astro
---
import AdminLayout from '../../layouts/AdminLayout.astro';
import { getSession, getLoginUrl, isAdmin } from '../../lib/auth';
import { getEffectiveFaq } from '../../lib/content';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl());
if (!isAdmin(session)) return Astro.redirect('/admin');

const saved = Astro.url.searchParams.get('saved') === '1';
const faqItems = await getEffectiveFaq();

const inputCls = 'w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50';
const labelCls = 'block text-xs text-muted mb-1';
---

<AdminLayout title="Admin — FAQ">
  <section class="pt-10 pb-20 px-8 max-w-4xl">

    <div class="mb-8">
      <h1 class="text-3xl font-bold text-light font-serif">FAQ</h1>
      <p class="text-muted mt-1">Häufig gestellte Fragen verwalten</p>
    </div>

    {saved && (
      <div class="mb-6 p-4 bg-green-500/10 border border-green-500/30 rounded-xl text-green-400 text-sm">
        FAQ gespeichert.
      </div>
    )}

    <div class="mb-4 p-4 bg-gold/5 border border-gold/20 rounded-xl text-sm text-muted">
      FAQ erscheinen auf der <a href="/" target="_blank" class="text-gold hover:underline">Startseite</a> in der angezeigten Reihenfolge. Löschen: Frage und Antwort leeren und speichern.
    </div>

    <form method="POST" action="/api/admin/faq/save" class="space-y-4">
      <input type="hidden" name="faq_count" value={faqItems.length} />

      {faqItems.map((item, i) => (
        <div class="p-5 bg-dark-light rounded-xl border border-dark-lighter space-y-3">
          <div class="flex items-center justify-between mb-1">
            <span class="text-xs text-muted font-mono">#{i + 1}</span>
            <div class="flex gap-2">
              {i > 0 && (
                <button type="submit" name="move_up" value={String(i)}
                  class="text-xs text-muted hover:text-gold transition-colors px-2 py-1 bg-dark rounded">↑</button>
              )}
              {i < faqItems.length - 1 && (
                <button type="submit" name="move_down" value={String(i)}
                  class="text-xs text-muted hover:text-gold transition-colors px-2 py-1 bg-dark rounded">↓</button>
              )}
            </div>
          </div>
          <div>
            <label class={labelCls}>Frage</label>
            <input type="text" name={`faq_${i}_question`} value={item.question} class={inputCls} />
          </div>
          <div>
            <label class={labelCls}>Antwort</label>
            <textarea name={`faq_${i}_answer`} rows={3} class={`${inputCls} resize-none`}>{item.answer}</textarea>
          </div>
        </div>
      ))}

      <!-- Neue Frage -->
      <div class="p-5 bg-dark-light rounded-xl border border-dashed border-dark-lighter space-y-3">
        <p class="text-xs font-semibold text-gold uppercase tracking-widest">Neue Frage hinzufügen</p>
        <div>
          <label class={labelCls}>Frage</label>
          <input type="text" name="faq_new_question" class={inputCls} placeholder="Wie läuft...?" />
        </div>
        <div>
          <label class={labelCls}>Antwort</label>
          <textarea name="faq_new_answer" rows={3} class={`${inputCls} resize-none`}></textarea>
        </div>
      </div>

      <div class="flex justify-end">
        <button type="submit" class="px-6 py-3 bg-gold text-dark font-semibold rounded-lg hover:bg-gold/90 transition-colors">
          Speichern
        </button>
      </div>
    </form>
  </section>
</AdminLayout>
```

- [ ] **Schritt 2: `save.ts` anlegen**

```typescript
// website/src/pages/api/admin/faq/save.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { saveFaqContent } from '../../../../lib/website-db';
import type { FaqItem } from '../../../../lib/website-db';

const BRAND = process.env.BRAND || 'mentolder';

export const POST: APIRoute = async ({ request, redirect }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });

  const form = await request.formData();
  const g = (k: string) => (form.get(k) as string | null) ?? '';

  const count = parseInt(g('faq_count') || '0', 10);
  let items: FaqItem[] = Array.from({ length: count }, (_, i) => ({
    question: g(`faq_${i}_question`).trim(),
    answer: g(`faq_${i}_answer`).trim(),
  })).filter(item => item.question);

  // Move up/down
  const moveUp = form.get('move_up');
  const moveDown = form.get('move_down');
  if (moveUp !== null) {
    const idx = parseInt(moveUp as string, 10);
    if (idx > 0) [items[idx - 1], items[idx]] = [items[idx], items[idx - 1]];
  } else if (moveDown !== null) {
    const idx = parseInt(moveDown as string, 10);
    if (idx < items.length - 1) [items[idx], items[idx + 1]] = [items[idx + 1], items[idx]];
  }

  // New entry
  const newQ = g('faq_new_question').trim();
  const newA = g('faq_new_answer').trim();
  if (newQ) items.push({ question: newQ, answer: newA });

  await saveFaqContent(BRAND, items);
  return redirect('/admin/faq?saved=1');
};
```

- [ ] **Schritt 3: Im Browser prüfen**

- http://localhost:4321/admin/faq — alle bestehenden FAQ-Einträge erscheinen
- Reihenfolge mit ↑/↓ ändern, speichern → Reihenfolge bleibt erhalten
- Neue Frage hinzufügen und speichern

- [ ] **Schritt 4: Commit**

```bash
git add website/src/pages/admin/faq.astro website/src/pages/api/admin/faq/
git commit -m "feat(admin): add FAQ editor with reorder and add/delete support"
```

---

## Task 8: `/admin/kontakt` + API

**Files:**
- Create: `website/src/pages/admin/kontakt.astro`
- Create: `website/src/pages/api/admin/kontakt/save.ts`

- [ ] **Schritt 1: `kontakt.astro` anlegen**

```astro
---
import AdminLayout from '../../layouts/AdminLayout.astro';
import { getSession, getLoginUrl, isAdmin } from '../../lib/auth';
import { getEffectiveKontakt } from '../../lib/content';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl());
if (!isAdmin(session)) return Astro.redirect('/admin');

const saved = Astro.url.searchParams.get('saved') === '1';
const kt = await getEffectiveKontakt();

const inputCls = 'w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50';
const labelCls = 'block text-xs text-muted mb-1';
const sectionCls = 'p-6 bg-dark-light rounded-xl border border-dark-lighter space-y-4';
---

<AdminLayout title="Admin — Kontakt">
  <section class="pt-10 pb-20 px-8 max-w-3xl">

    <div class="mb-8">
      <h1 class="text-3xl font-bold text-light font-serif">Kontakt</h1>
      <p class="text-muted mt-1">Texte der Kontaktseite bearbeiten</p>
    </div>

    {saved && (
      <div class="mb-6 p-4 bg-green-500/10 border border-green-500/30 rounded-xl text-green-400 text-sm">
        Änderungen gespeichert.
      </div>
    )}

    <form method="POST" action="/api/admin/kontakt/save" class="space-y-6">

      <div class={sectionCls}>
        <h2 class="text-xl font-bold text-light font-serif">Seiten-Intro</h2>
        <div>
          <label class={labelCls}>Intro-Text unter der Überschrift</label>
          <textarea name="intro" rows={3} class={`${inputCls} resize-none`}>{kt.intro}</textarea>
        </div>
      </div>

      <div class={sectionCls}>
        <h2 class="text-xl font-bold text-light font-serif">Sidebar-Kasten</h2>
        <div>
          <label class={labelCls}>Titel</label>
          <input type="text" name="sidebarTitle" value={kt.sidebarTitle} class={inputCls} />
        </div>
        <div>
          <label class={labelCls}>Text</label>
          <textarea name="sidebarText" rows={4} class={`${inputCls} resize-none`}>{kt.sidebarText}</textarea>
        </div>
        <div>
          <label class={labelCls}>CTA-Satz (unter dem Text, goldfarben)</label>
          <input type="text" name="sidebarCta" value={kt.sidebarCta} class={inputCls} />
        </div>
      </div>

      <div class={sectionCls}>
        <h2 class="text-xl font-bold text-light font-serif">Einstellungen</h2>
        <label class="flex items-center gap-3 text-sm text-muted cursor-pointer">
          <input type="checkbox" name="showPhone" value="1" checked={kt.showPhone}
            class="rounded border-dark-lighter bg-dark accent-gold w-4 h-4" />
          Telefonnummer auf der Kontaktseite anzeigen
        </label>
      </div>

      <div class="flex items-center justify-between">
        <a href="/kontakt" target="_blank" class="text-sm text-gold hover:underline">Vorschau →</a>
        <button type="submit" class="px-6 py-3 bg-gold text-dark font-semibold rounded-lg hover:bg-gold/90 transition-colors">
          Speichern
        </button>
      </div>

    </form>
  </section>
</AdminLayout>
```

- [ ] **Schritt 2: `save.ts` anlegen**

```typescript
// website/src/pages/api/admin/kontakt/save.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { saveKontaktContent } from '../../../../lib/website-db';

const BRAND = process.env.BRAND || 'mentolder';

export const POST: APIRoute = async ({ request, redirect }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });

  const form = await request.formData();
  const g = (k: string) => (form.get(k) as string | null) ?? '';

  await saveKontaktContent(BRAND, {
    intro: g('intro'),
    sidebarTitle: g('sidebarTitle'),
    sidebarText: g('sidebarText'),
    sidebarCta: g('sidebarCta'),
    showPhone: form.get('showPhone') === '1',
  });

  return redirect('/admin/kontakt?saved=1');
};
```

- [ ] **Schritt 3: Im Browser prüfen**

- http://localhost:4321/admin/kontakt — alle Felder sichtbar
- Einen Text ändern, speichern → Bestätigung erscheint

- [ ] **Schritt 4: Commit**

```bash
git add website/src/pages/admin/kontakt.astro website/src/pages/api/admin/kontakt/
git commit -m "feat(admin): add Kontakt editor (intro, sidebar, showPhone)"
```

---

## Task 9: Öffentliche Seiten mit DB-Inhalt verdrahten

**Files:**
- Modify: `website/src/pages/index.astro`
- Modify: `website/src/pages/ueber-mich.astro`
- Modify: `website/src/pages/kontakt.astro`

- [ ] **Schritt 1: `index.astro` — Hero und Homepage-Inhalt aus DB**

Import ergänzen:
```typescript
import { getEffectiveServices, getEffectiveHomepage, getEffectiveFaq } from '../lib/content';
```

Bestehende Zeile ersetzen:
```typescript
// ALT:
const { homepage, faq, contact } = config;
// NEU:
const { contact } = config;
const homepage = await getEffectiveHomepage();
const faq = await getEffectiveFaq();
```

`<Hero client:load />` erhält jetzt Props aus der DB:
```astro
<Hero
  client:load
  title={homepage.hero.title}
  subtitle={homepage.hero.subtitle}
  tagline={homepage.hero.tagline}
/>
```

`homepage.stats`, `homepage.servicesHeadline`, `homepage.servicesSubheadline`, `homepage.whyMeHeadline`, `homepage.whyMeIntro`, `homepage.whyMePoints`, `homepage.quote`, `homepage.quoteName` werden direkt aus dem `homepage`-Objekt gelesen — diese Stellen im Template bleiben unverändert, da die Feldnamen identisch sind.

- [ ] **Schritt 2: `ueber-mich.astro` — Inhalt aus DB**

```typescript
// ALT:
import { config } from '../config/index';
const { uebermich, contact } = config;
// NEU:
import { config } from '../config/index';
import { getEffectiveUebermich } from '../lib/content';
const { contact } = config;
const uebermich = await getEffectiveUebermich();
```

Kein weiterer Template-Umbau nötig — alle Feldnamen (`uebermich.pageHeadline`, `.sections`, `.milestones`, `.notDoing`, `.privateText`) bleiben identisch.

- [ ] **Schritt 3: `kontakt.astro` — Inhalt aus DB**

```typescript
// ALT:
import { config } from '../config/index';
const { contact, kontakt } = config;
// NEU:
import { config } from '../config/index';
import { getEffectiveKontakt } from '../lib/content';
const { contact } = config;
const kontakt = await getEffectiveKontakt();
```

Kein weiterer Template-Umbau nötig.

- [ ] **Schritt 4: End-to-end prüfen**

```bash
cd website && npx astro dev
```
1. http://localhost:4321/ — Startseite lädt ohne Fehler
2. Im Admin unter `/admin/startseite` Hero-Titel ändern → Startseite neu laden → geänderter Titel erscheint
3. http://localhost:4321/ueber-mich — Seite lädt ohne Fehler
4. Im Admin unter `/admin/uebermich` Privattext ändern → `/ueber-mich` neu laden → geänderter Text erscheint
5. http://localhost:4321/kontakt — Seite lädt ohne Fehler

- [ ] **Schritt 5: Commit**

```bash
git add website/src/pages/index.astro website/src/pages/ueber-mich.astro website/src/pages/kontakt.astro
git commit -m "feat(website): wire public pages to DB-editable content (homepage, uebermich, kontakt)"
```

---

## Task 10: Abschluss — Build-Check und PR

- [ ] **Schritt 1: Produktions-Build prüfen**

```bash
cd website && npx astro build 2>&1 | tail -20
```
Erwartung: Build erfolgreich, keine TypeScript-Fehler

- [ ] **Schritt 2: CI-Validierung**

```bash
cd /home/patrick/Bachelorprojekt && task workspace:validate 2>&1 | tail -10
```

- [ ] **Schritt 3: PR erstellen**

```bash
git push -u origin feature/admin-termine-usermanagement
gh pr create \
  --title "feat(admin): sidebar navigation + full website CMS" \
  --body "$(cat <<'EOF'
## Summary
- Neues `AdminLayout.astro` mit persistenter Sidebar (Gruppen: Übersicht, Betrieb, Website)
- Kachel-Dashboard auf `/admin` entfernt; KPI-Banner bleibt
- 4 neue Admin-Seiten: Startseite, Über mich, FAQ, Kontakt
- Alle bisher hardcoded Website-Inhalte (Hero, Stats, Warum-ich, Zitat, Über-mich-Milestones, FAQ, Kontakt-Texte) jetzt über Admin editierbar
- Speicherung als JSON-Blobs in `site_settings` (bestehende Tabelle); statische Config bleibt Fallback

## Test plan
- [ ] Admin-Sidebar auf allen Admin-Seiten sichtbar und aktiver Eintrag goldfarben
- [ ] `/admin/startseite`: Hero-Titel ändern → Startseite zeigt geänderten Titel
- [ ] `/admin/uebermich`: Milestone hinzufügen → erscheint auf `/ueber-mich`
- [ ] `/admin/faq`: FAQ-Reihenfolge ändern → Startseite zeigt neue Reihenfolge
- [ ] `/admin/kontakt`: Intro-Text ändern → erscheint auf `/kontakt`
- [ ] Alle bestehenden Admin-Seiten (Bugs, Termine, Angebote usw.) funktionieren weiterhin

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Schritt 4: PR sofort mergen**

```bash
gh pr merge --squash --auto
```
