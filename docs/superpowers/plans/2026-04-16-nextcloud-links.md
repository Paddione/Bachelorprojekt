# Nextcloud/Service Quick-Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zeige auf dem User-Portal und dem Admin-Dashboard je eine horizontale Reihe direkter Quick-Link-Karten zu Nextcloud-Diensten (und im Admin zusätzlich Mattermost + Docs).

**Architecture:** Eine einzelne Astro-Komponente `ServiceLinks.astro` erhält ein Array fertiger Link-Objekte und rendert die Karten-Reihe. Die aufrufenden Seiten (`portal.astro`, `admin.astro`) bauen das Array aus Env-Variablen zusammen — fehlende Variablen werden still übergangen.

**Tech Stack:** Astro, Tailwind CSS, Env-Variablen (`process.env.*`)

---

## File Map

| Aktion   | Datei                                               | Zweck                                           |
|----------|-----------------------------------------------------|-------------------------------------------------|
| Neu      | `website/src/components/ServiceLinks.astro`         | Wiederverwendbare Karten-Reihe                  |
| Ändern   | `website/src/env.d.ts`                              | `DOCS_URL?: string` ergänzen                    |
| Ändern   | `website/src/pages/portal.astro`                    | Nextcloud-Links einbinden (4 Karten)            |
| Ändern   | `website/src/pages/admin.astro`                     | Nextcloud + Mattermost + Docs einbinden (≤6)    |

---

### Task 1: `DOCS_URL` in env.d.ts ergänzen

**Files:**
- Modify: `website/src/env.d.ts`

- [ ] **Step 1: `DOCS_URL` als optionale Variable eintragen**

In `website/src/env.d.ts` direkt nach der Zeile `readonly NEXTCLOUD_EXTERNAL_URL?: string;` einfügen:

```typescript
  readonly DOCS_URL?: string;
```

Die Datei sieht danach so aus (relevanter Ausschnitt):

```typescript
  // Nextcloud
  readonly NEXTCLOUD_ADMIN_USER?: string;
  readonly NEXTCLOUD_ADMIN_PASS?: string;
  readonly NEXTCLOUD_EXTERNAL_URL?: string;
  readonly DOCS_URL?: string;
```

- [ ] **Step 2: Commit**

```bash
git add website/src/env.d.ts
git commit -m "chore(website): add optional DOCS_URL env var to env.d.ts"
```

---

### Task 2: `ServiceLinks.astro` erstellen

**Files:**
- Create: `website/src/components/ServiceLinks.astro`

- [ ] **Step 1: Komponente anlegen**

Datei `website/src/components/ServiceLinks.astro` mit folgendem Inhalt erstellen:

```astro
---
interface ServiceLink {
  href: string;
  label: string;
  icon: string;
}

interface Props {
  links: ServiceLink[];
  heading?: string;
}

const { links, heading } = Astro.props;
---

{links.length > 0 && (
  <div class="mb-6">
    {heading && (
      <p class="text-xs font-semibold text-muted uppercase tracking-widest mb-2">{heading}</p>
    )}
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {links.map(link => (
        <a
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          class="flex flex-col items-center gap-1.5 p-4 bg-dark-light rounded-xl border border-dark-lighter hover:border-gold/40 transition-colors text-center"
        >
          <span class="text-2xl leading-none">{link.icon}</span>
          <span class="text-xs font-medium text-muted group-hover:text-light">{link.label}</span>
        </a>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/ServiceLinks.astro
git commit -m "feat(website): add ServiceLinks component for quick-link cards"
```

---

### Task 3: Quick-Links in `portal.astro` einbinden

**Files:**
- Modify: `website/src/pages/portal.astro`

Die Nextcloud-Links sollen zwischen dem Begrüßungsheader (`<div class="mb-8">`) und der Tab-Navigation (`<nav ...>`) erscheinen.

- [ ] **Step 1: Import ergänzen**

In `portal.astro` den bestehenden Import-Block im Frontmatter erweitern:

```astro
---
import Layout from '../layouts/Layout.astro';
import { getSession, getLoginUrl } from '../lib/auth';
import BookingsTab from '../components/portal/BookingsTab.astro';
import InvoicesTab from '../components/portal/InvoicesTab.astro';
import FilesTab from '../components/portal/FilesTab.astro';
import SignaturesTab from '../components/portal/SignaturesTab.astro';
import MeetingsTab from '../components/portal/MeetingsTab.astro';
import ServiceLinks from '../components/ServiceLinks.astro';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) {
  return Astro.redirect(getLoginUrl());
}

const tab = Astro.url.searchParams.get('tab') ?? 'bookings';

const ncBase = process.env.NEXTCLOUD_EXTERNAL_URL ?? '';
const portalLinks = ncBase ? [
  { href: `${ncBase}/apps/files/`,    label: 'Dateien',  icon: '📁' },
  { href: `${ncBase}/apps/calendar/`, label: 'Kalender', icon: '📅' },
  { href: `${ncBase}/apps/contacts/`, label: 'Kontakte', icon: '👥' },
  { href: `${ncBase}/apps/spreed/`,   label: 'Talk',     icon: '🎥' },
] : [];
---
```

- [ ] **Step 2: Komponente im Template einbinden**

Im HTML-Teil von `portal.astro` direkt nach dem schließenden `</div>` des Begrüßungsheaders (`<div class="mb-8">`) und vor dem `<nav ...>`:

```astro
      <ServiceLinks links={portalLinks} heading="Nextcloud" />

      <!-- Tab navigation -->
      <nav class="flex gap-1 mb-8 border-b border-dark-lighter overflow-x-auto" data-testid="portal-tabs">
```

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/portal.astro
git commit -m "feat(website): add Nextcloud quick-links to user portal"
```

---

### Task 4: Quick-Links in `admin.astro` einbinden

**Files:**
- Modify: `website/src/pages/admin.astro`

Die Links erscheinen nach dem KPI-Banner-`</div>` und vor dem schließenden `</div>` der umgebenden Section.

- [ ] **Step 1: Import und Links-Array im Frontmatter ergänzen**

Den bestehenden Frontmatter-Block in `admin.astro` um Import und Links-Aufbau erweitern. Direkt nach den bestehenden Imports:

```astro
import ServiceLinks from '../components/ServiceLinks.astro';
```

Und am Ende des Frontmatter-Blocks (nach der `fmtCurrency`-Funktion):

```astro
const ncBase  = process.env.NEXTCLOUD_EXTERNAL_URL ?? '';
const mmUrl   = process.env.MATTERMOST_URL ?? '';
const docsUrl = process.env.DOCS_URL ?? '';

const adminLinks = [
  ...(ncBase ? [
    { href: `${ncBase}/apps/files/`,    label: 'Dateien',     icon: '📁' },
    { href: `${ncBase}/apps/calendar/`, label: 'Kalender',    icon: '📅' },
    { href: `${ncBase}/apps/contacts/`, label: 'Kontakte',    icon: '👥' },
    { href: `${ncBase}/apps/spreed/`,   label: 'Talk',        icon: '🎥' },
  ] : []),
  ...(mmUrl   ? [{ href: mmUrl,   label: 'Mattermost', icon: '💬' }] : []),
  ...(docsUrl ? [{ href: docsUrl, label: 'Docs',       icon: '📖' }] : []),
];
```

- [ ] **Step 2: Komponente im Template nach dem KPI-Banner einbinden**

Im HTML-Teil von `admin.astro` direkt nach dem schließenden `</div>` des KPI-Banners (nach dem `].map(k => (...))` Block):

```astro
      <ServiceLinks links={adminLinks} heading="Dienste" />

    </div>
  </section>
</AdminLayout>
```

Der vollständige untere HTML-Abschnitt sieht dann so aus:

```astro
<AdminLayout title="Admin — Dashboard">
  <section class="pt-10 pb-20 bg-dark min-h-screen">
    <div class="max-w-5xl mx-auto px-6">

      <div class="mb-10">
        <h1 class="text-3xl font-bold text-light font-serif">Admin</h1>
        <p class="text-muted mt-1">Verwaltung & Werkzeuge</p>
      </div>

      <!-- KPI Banner -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
        {[
          { label: 'Aktive Projekte',   value: String(activeProjects),           href: '/admin/projekte',  cls: 'border-yellow-800' },
          { label: 'Offene Rechnungen', value: openInvoices > 0 ? `${openInvoices} (${fmtCurrency(openInvoiceAmount)})` : '0', href: '/admin/rechnungen', cls: openInvoices > 0 ? 'border-yellow-800' : 'border-dark-lighter' },
          { label: 'Überfällige Bugs',   value: String(openBugCount),             href: '/admin/bugs',      cls: openBugCount > 0 ? 'border-red-800' : 'border-dark-lighter' },
          { label: 'Follow-ups fällig', value: String(dueFollowUps),             href: '/admin/followups', cls: dueFollowUps > 0 ? 'border-red-800' : 'border-dark-lighter' },
          { label: 'Freie Slots (7 T)', value: String(freeSlots),                href: '/admin/termine',   cls: freeSlots > 0 ? 'border-green-800' : 'border-dark-lighter' },
        ].map(k => (
          <a href={k.href} class={`p-4 bg-dark-light rounded-xl border hover:border-gold/40 transition-colors ${k.cls}`}>
            <div class="text-xl font-bold text-light">{k.value}</div>
            <div class="text-xs text-muted mt-0.5">{k.label}</div>
          </a>
        ))}
      </div>

      <ServiceLinks links={adminLinks} heading="Dienste" />

    </div>
  </section>
</AdminLayout>
```

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/admin.astro
git commit -m "feat(website): add Nextcloud + Mattermost + Docs quick-links to admin dashboard"
```

---

### Task 5: Build-Check & Validierung

**Files:** keine neuen

- [ ] **Step 1: TypeScript / Astro Build prüfen**

```bash
cd website && npx astro check
```

Erwartet: keine Fehler. Falls Typfehler in `env.d.ts` auftreten, sicherstellen dass `DOCS_URL` als `readonly DOCS_URL?: string` (mit `?`) eingetragen ist.

- [ ] **Step 2: Manifest-Validierung**

```bash
task workspace:validate
```

Erwartet: Exit 0, keine Fehler.

- [ ] **Step 3: Visuell prüfen (dev server)**

```bash
cd website && npm run dev
```

- `/portal` aufrufen → Nextcloud-Karten zwischen Header und Tabs sichtbar (falls `NEXTCLOUD_EXTERNAL_URL` gesetzt, sonst Sektion ausgeblendet — beide Zustände sind korrekt)
- `/admin` aufrufen → Karten-Reihe unterhalb des KPI-Banners, Überschrift "Dienste"

- [ ] **Step 4: Finaler Commit falls nötig**

Nur wenn Step 1 oder 2 kleinere Korrekturen erforderten:

```bash
git add -A && git commit -m "fix(website): service-links build corrections"
```
