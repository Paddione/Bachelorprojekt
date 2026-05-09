---
title: Inhalte-Editor Implementation Plan
domains: [website]
status: completed
pr_number: null
---

# Inhalte-Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 7 separate Website admin pages + DokumentEditor with a single `/admin/inhalte` SPA featuring four tabs (Website | Newsletter | Fragebögen | Verträge) and DB-driven custom website sections.

**Architecture:** `inhalte.astro` loads all initial data via existing SSR lib functions and passes it as JSON props to `InhalteEditor.svelte`. The Svelte hub component manages two-level tab navigation (URL-state via `?tab=&section=`) and renders seven focused section components plus reuses existing `NewsletterAdmin`, `QuestionnaireTemplateEditor`, and an extracted `VertragsvorlagenSection`. Old pages become 301 redirects. All existing DB tables and content are untouched — only the API handlers gain a dual content-type mode.

**Tech Stack:** TypeScript, Astro 5, Svelte 5 (runes), PostgreSQL via `website-db.ts` pool, existing auth/session pattern, Tailwind via class names.

---

## File Map

| Action | File |
|--------|------|
| Modify | `website/src/lib/website-db.ts` — add `CustomSection` type + CRUD |
| Create | `website/src/pages/api/admin/inhalte/custom/index.ts` |
| Create | `website/src/pages/api/admin/inhalte/custom/[slug].ts` |
| Modify | `website/src/pages/api/admin/startseite/save.ts` — add JSON mode |
| Modify | `website/src/pages/api/admin/uebermich/save.ts` — add JSON mode |
| Modify | `website/src/pages/api/admin/angebote/save.ts` — add JSON mode |
| Modify | `website/src/pages/api/admin/faq/save.ts` — add JSON mode |
| Modify | `website/src/pages/api/admin/kontakt/save.ts` — add JSON mode |
| Modify | `website/src/pages/api/admin/referenzen/save.ts` — add JSON mode |
| Modify | `website/src/pages/api/admin/rechtliches/save.ts` — add JSON mode |
| Create | `website/src/components/admin/inhalte/VertragsvorlagenSection.svelte` |
| Create | `website/src/components/admin/inhalte/StartseiteSection.svelte` |
| Create | `website/src/components/admin/inhalte/UebermichSection.svelte` |
| Create | `website/src/components/admin/inhalte/AngeboteSection.svelte` |
| Create | `website/src/components/admin/inhalte/FaqSection.svelte` |
| Create | `website/src/components/admin/inhalte/KontaktSection.svelte` |
| Create | `website/src/components/admin/inhalte/RechtlichesSection.svelte` |
| Create | `website/src/components/admin/inhalte/ReferenzenSection.svelte` |
| Create | `website/src/components/admin/inhalte/CustomSection.svelte` |
| Create | `website/src/components/admin/InhalteEditor.svelte` |
| Create | `website/src/pages/admin/inhalte.astro` |
| Modify | `website/src/layouts/AdminLayout.astro` — sidebar nav |
| Modify | `website/src/pages/admin/startseite.astro` → redirect |
| Modify | `website/src/pages/admin/uebermich.astro` → redirect |
| Modify | `website/src/pages/admin/angebote.astro` → redirect |
| Modify | `website/src/pages/admin/faq.astro` → redirect |
| Modify | `website/src/pages/admin/kontakt.astro` → redirect |
| Modify | `website/src/pages/admin/referenzen.astro` → redirect |
| Modify | `website/src/pages/admin/rechtliches.astro` → redirect |
| Modify | `website/src/pages/admin/dokumente.astro` → redirect |
| Delete | `website/src/components/AdminWebsiteTabs.astro` |

---

## Task 1: DB — CustomSection CRUD in website-db.ts

**Files:**
- Modify: `website/src/lib/website-db.ts` (append at end of file)

- [ ] **Step 1: Append CustomSection types and CRUD to website-db.ts**

Add this block at the very end of `website/src/lib/website-db.ts`:

```typescript
// ── Custom Website Sections ────────────────────────────────────────────────

export interface CustomSectionField {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'url';
  required: boolean;
}

export interface CustomSection {
  id: string;
  slug: string;
  title: string;
  sort_order: number;
  fields: CustomSectionField[];
  content: Record<string, string>;
  created_at: Date;
  updated_at: Date;
}

let customSectionsReady = false;
async function initCustomSectionsTable(): Promise<void> {
  if (customSectionsReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS website_custom_sections (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      slug        TEXT        UNIQUE NOT NULL,
      title       TEXT        NOT NULL,
      sort_order  INT         NOT NULL DEFAULT 0,
      fields      JSONB       NOT NULL DEFAULT '[]',
      content     JSONB       NOT NULL DEFAULT '{}',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  customSectionsReady = true;
}

export async function listCustomSections(): Promise<CustomSection[]> {
  await initCustomSectionsTable();
  const r = await pool.query<CustomSection>(
    `SELECT id, slug, title, sort_order, fields, content, created_at, updated_at
     FROM website_custom_sections ORDER BY sort_order ASC, created_at ASC`
  );
  return r.rows;
}

export async function getCustomSection(slug: string): Promise<CustomSection | null> {
  await initCustomSectionsTable();
  const r = await pool.query<CustomSection>(
    `SELECT id, slug, title, sort_order, fields, content, created_at, updated_at
     FROM website_custom_sections WHERE slug = $1`,
    [slug]
  );
  return r.rows[0] ?? null;
}

export async function createCustomSection(params: {
  slug: string;
  title: string;
  fields: CustomSectionField[];
}): Promise<CustomSection> {
  await initCustomSectionsTable();
  const r = await pool.query<CustomSection>(
    `INSERT INTO website_custom_sections (slug, title, fields)
     VALUES ($1, $2, $3)
     RETURNING id, slug, title, sort_order, fields, content, created_at, updated_at`,
    [params.slug, params.title, JSON.stringify(params.fields)]
  );
  return r.rows[0];
}

export async function updateCustomSection(slug: string, params: {
  title?: string;
  fields?: CustomSectionField[];
  content?: Record<string, string>;
  sort_order?: number;
}): Promise<CustomSection | null> {
  await initCustomSectionsTable();
  const sets: string[] = ['updated_at = now()'];
  const vals: unknown[] = [];
  if (params.title !== undefined) { vals.push(params.title); sets.push(`title = $${vals.length}`); }
  if (params.fields !== undefined) { vals.push(JSON.stringify(params.fields)); sets.push(`fields = $${vals.length}`); }
  if (params.content !== undefined) { vals.push(JSON.stringify(params.content)); sets.push(`content = $${vals.length}`); }
  if (params.sort_order !== undefined) { vals.push(params.sort_order); sets.push(`sort_order = $${vals.length}`); }
  if (vals.length === 0) return getCustomSection(slug);
  vals.push(slug);
  const r = await pool.query<CustomSection>(
    `UPDATE website_custom_sections SET ${sets.join(', ')}
     WHERE slug = $${vals.length}
     RETURNING id, slug, title, sort_order, fields, content, created_at, updated_at`,
    vals
  );
  return r.rows[0] ?? null;
}

export async function deleteCustomSection(slug: string): Promise<void> {
  await initCustomSectionsTable();
  await pool.query('DELETE FROM website_custom_sections WHERE slug = $1', [slug]);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd website && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors in `website-db.ts`.

- [ ] **Step 3: Commit**

```bash
git add website/src/lib/website-db.ts
git commit -m "feat(inhalte): add CustomSection CRUD to website-db"
```

---

## Task 2: Custom section API endpoints

**Files:**
- Create: `website/src/pages/api/admin/inhalte/custom/index.ts`
- Create: `website/src/pages/api/admin/inhalte/custom/[slug].ts`

- [ ] **Step 1: Create index.ts (GET list + POST create)**

Create `website/src/pages/api/admin/inhalte/custom/index.ts`:

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { listCustomSections, createCustomSection } from '../../../../../lib/website-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });
  const sections = await listCustomSections();
  return new Response(JSON.stringify(sections), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });
  const body = await request.json() as { slug: string; title: string; fields: unknown[] };
  if (!body.slug?.trim() || !body.title?.trim()) {
    return new Response(JSON.stringify({ error: 'slug and title required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const section = await createCustomSection({
    slug: body.slug.trim(),
    title: body.title.trim(),
    fields: (body.fields ?? []) as Parameters<typeof createCustomSection>[0]['fields'],
  });
  return new Response(JSON.stringify(section), { status: 201, headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Step 2: Create [slug].ts (PUT update + DELETE)**

Create `website/src/pages/api/admin/inhalte/custom/[slug].ts`:

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { updateCustomSection, deleteCustomSection } from '../../../../../lib/website-db';

export const PUT: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });
  const slug = params.slug!;
  const body = await request.json() as {
    title?: string;
    fields?: unknown[];
    content?: Record<string, string>;
    sort_order?: number;
  };
  const updated = await updateCustomSection(slug, {
    title: body.title,
    fields: body.fields as Parameters<typeof updateCustomSection>[1]['fields'],
    content: body.content,
    sort_order: body.sort_order,
  });
  if (!updated) return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  return new Response(JSON.stringify(updated), { headers: { 'Content-Type': 'application/json' } });
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });
  await deleteCustomSection(params.slug!);
  return new Response(null, { status: 204 });
};
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd website && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add website/src/pages/api/admin/inhalte/
git commit -m "feat(inhalte): add custom section CRUD API endpoints"
```

---

## Task 3: Add JSON mode to all 7 save handlers

Each handler needs to short-circuit when called with `Content-Type: application/json`, skipping form parsing and returning `{ok: true}` instead of a redirect. The Svelte components will send the already-typed object.

**Files:**
- Modify: `website/src/pages/api/admin/startseite/save.ts`
- Modify: `website/src/pages/api/admin/uebermich/save.ts`
- Modify: `website/src/pages/api/admin/angebote/save.ts`
- Modify: `website/src/pages/api/admin/faq/save.ts`
- Modify: `website/src/pages/api/admin/kontakt/save.ts`
- Modify: `website/src/pages/api/admin/referenzen/save.ts`
- Modify: `website/src/pages/api/admin/rechtliches/save.ts`

- [ ] **Step 1: Patch startseite/save.ts**

Replace the entire file content:

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { saveHomepageContent } from '../../../../lib/website-db';
import type { HomepageContent } from '../../../../lib/website-db';

const BRAND = process.env.BRAND || 'mentolder';

export const POST: APIRoute = async ({ request, redirect }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });

  if (request.headers.get('content-type')?.includes('application/json')) {
    const body = await request.json() as HomepageContent;
    await saveHomepageContent(BRAND, body);
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  }

  const form = await request.formData();
  const g = (k: string) => (form.get(k) as string | null) ?? '';

  await saveHomepageContent(BRAND, {
    hero: {
      tagline: g('hero_tagline'),
      title: g('hero_title'),
      subtitle: g('hero_subtitle'),
    },
    stats: Array.from({ length: parseInt(g('stats_count') || '4', 10) }, (_, i) => ({
      value: g(`stat_${i}_value`),
      label: g(`stat_${i}_label`),
    })),
    servicesHeadline: g('services_headline'),
    servicesSubheadline: g('services_subheadline'),
    whyMeHeadline: g('whyme_headline'),
    whyMeIntro: g('whyme_intro'),
    whyMePoints: Array.from({ length: parseInt(g('whyme_count') || '3', 10) }, (_, i) => ({
      title: g(`whyme_point_${i}_title`),
      text: g(`whyme_point_${i}_text`),
    })),
    avatarType: (g('avatar_type') || 'initials') as 'image' | 'initials',
    avatarSrc: g('avatar_src') || undefined,
    avatarInitials: g('avatar_initials') || undefined,
    quote: g('quote'),
    quoteName: g('quote_name'),
  });

  return redirect('/admin/startseite?saved=1');
};
```

- [ ] **Step 2: Patch uebermich/save.ts**

Replace the entire file content:

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { saveUebermichContent } from '../../../../lib/website-db';
import type { UebermichContent } from '../../../../lib/website-db';

const BRAND = process.env.BRAND || 'mentolder';

export const POST: APIRoute = async ({ request, redirect }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });

  if (request.headers.get('content-type')?.includes('application/json')) {
    const body = await request.json() as UebermichContent;
    await saveUebermichContent(BRAND, body);
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  }

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
  if (msNewYear || msNewTitle) milestones.push({ year: msNewYear, title: msNewTitle, desc: g('ms_new_desc') });

  const notDoingCount = parseInt(g('notdoing_count') || '0', 10);
  const notDoing = Array.from({ length: notDoingCount }, (_, i) => ({
    title: g(`nd_${i}_title`),
    text: g(`nd_${i}_text`),
  }));
  const ndNewTitle = g('nd_new_title').trim();
  if (ndNewTitle) notDoing.push({ title: ndNewTitle, text: g('nd_new_text') });

  await saveUebermichContent(BRAND, {
    subheadline: g('subheadline'),
    pageHeadline: g('pageHeadline'),
    introParagraphs: Array.from({ length: parseInt(g('intro_count') || '2', 10) }, (_, i) => g(`intro_${i}`)).filter(Boolean),
    sections: [0, 1].map(i => ({ title: g(`sec_${i}_title`), content: g(`sec_${i}_content`) })),
    milestones,
    notDoing,
    privateText: g('privateText'),
  });

  return redirect('/admin/uebermich?saved=1');
};
```

- [ ] **Step 3: Patch angebote/save.ts**

Replace the entire file content:

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { saveServiceConfig, saveLeistungenConfig, setSiteSetting } from '../../../../lib/website-db';
import type { ServiceOverride, LeistungCategoryOverride } from '../../../../lib/website-db';
import { mentolderConfig } from '../../../../config/brands/mentolder';

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw?.trim()) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export const POST: APIRoute = async ({ request, redirect }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });

  const BRAND = process.env.BRAND || 'mentolder';

  if (request.headers.get('content-type')?.includes('application/json')) {
    const body = await request.json() as {
      services: ServiceOverride[];
      leistungen: LeistungCategoryOverride[];
      priceListUrl: string;
    };
    await Promise.all([
      saveServiceConfig(BRAND, body.services),
      saveLeistungenConfig(BRAND, body.leistungen),
      setSiteSetting(BRAND, 'price_list_url', body.priceListUrl ?? ''),
    ]);
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  }

  const form = await request.formData();

  const serviceOverrides: ServiceOverride[] = mentolderConfig.services.map(s => {
    const features = ((form.get(`${s.slug}_features`) as string) ?? '').split('\n').map(f => f.trim()).filter(Boolean);
    const forWhom = ((form.get(`${s.slug}_pc_forWhom`) as string) ?? '').split('\n').map(f => f.trim()).filter(Boolean);
    return {
      slug: s.slug,
      title: (form.get(`${s.slug}_title`) as string) || s.title,
      description: (form.get(`${s.slug}_description`) as string) || s.description,
      icon: (form.get(`${s.slug}_icon`) as string) || s.icon,
      price: (form.get(`${s.slug}_price`) as string) || s.price,
      features: features.length > 0 ? features : s.features,
      hidden: form.get(`${s.slug}_hidden`) === '1',
      pageContent: {
        headline: (form.get(`${s.slug}_pc_headline`) as string) || s.pageContent.headline,
        intro: (form.get(`${s.slug}_pc_intro`) as string) || s.pageContent.intro,
        forWhom: forWhom.length > 0 ? forWhom : s.pageContent.forWhom,
        sections: parseJson(form.get(`${s.slug}_pc_sections`) as string, s.pageContent.sections),
        pricing: parseJson(form.get(`${s.slug}_pc_pricing`) as string, s.pageContent.pricing),
        faq: parseJson(form.get(`${s.slug}_pc_faq`) as string, s.pageContent.faq ?? []),
      },
    };
  });

  const leistungenOverrides: LeistungCategoryOverride[] = mentolderConfig.leistungen.map(cat => ({
    id: cat.id,
    title: (form.get(`lk_${cat.id}_title`) as string) || cat.title,
    icon: (form.get(`lk_${cat.id}_icon`) as string) || cat.icon,
    services: cat.services.map(svc => {
      const stundensatzEuro = parseFloat((form.get(`lk_${cat.id}_${svc.key}_stundensatz`) as string) || '0');
      const stundensatz_cents = isNaN(stundensatzEuro) ? 0 : Math.round(stundensatzEuro * 100);
      return {
        key: svc.key,
        name: (form.get(`lk_${cat.id}_${svc.key}_name`) as string) || svc.name,
        price: (form.get(`lk_${cat.id}_${svc.key}_price`) as string) || svc.price,
        unit: (form.get(`lk_${cat.id}_${svc.key}_unit`) as string ?? svc.unit),
        desc: (form.get(`lk_${cat.id}_${svc.key}_desc`) as string) || svc.desc,
        highlight: form.get(`lk_${cat.id}_${svc.key}_highlight`) === '1',
        ...(stundensatz_cents > 0 ? { stundensatz_cents } : {}),
      };
    }),
  }));

  const priceListUrl = (form.get('price_list_url') as string)?.trim() ?? '';
  await Promise.all([
    saveServiceConfig(BRAND, serviceOverrides),
    saveLeistungenConfig(BRAND, leistungenOverrides),
    priceListUrl ? setSiteSetting(BRAND, 'price_list_url', priceListUrl) : setSiteSetting(BRAND, 'price_list_url', ''),
  ]);

  return redirect('/admin/angebote?saved=1', 303);
};
```

- [ ] **Step 4: Patch faq/save.ts**

Add JSON short-circuit before `const form = await request.formData()`:

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { saveFaqContent } from '../../../../lib/website-db';
import type { FaqItem } from '../../../../lib/website-db';

const BRAND = process.env.BRAND || 'mentolder';

export const POST: APIRoute = async ({ request, redirect }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });

  if (request.headers.get('content-type')?.includes('application/json')) {
    const items = await request.json() as FaqItem[];
    await saveFaqContent(BRAND, items);
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  }

  const form = await request.formData();
  const g = (k: string) => (form.get(k) as string | null) ?? '';

  const count = Math.max(0, parseInt(g('faq_count') || '0', 10) || 0);
  const rawItems: FaqItem[] = Array.from({ length: count }, (_, i) => ({
    question: g(`faq_${i}_question`).trim(),
    answer: g(`faq_${i}_answer`).trim(),
  }));

  const moveUp = form.get('move_up');
  const moveDown = form.get('move_down');
  if (moveUp !== null) {
    const idx = parseInt(moveUp as string, 10);
    if (idx > 0 && idx < rawItems.length) [rawItems[idx - 1], rawItems[idx]] = [rawItems[idx], rawItems[idx - 1]];
  } else if (moveDown !== null) {
    const idx = parseInt(moveDown as string, 10);
    if (idx >= 0 && idx < rawItems.length - 1) [rawItems[idx], rawItems[idx + 1]] = [rawItems[idx + 1], rawItems[idx]];
  }

  const items = rawItems.filter(item => item.question);
  const newQ = g('faq_new_question').trim();
  const newA = g('faq_new_answer').trim();
  if (newQ) items.push({ question: newQ, answer: newA });

  await saveFaqContent(BRAND, items);
  return redirect('/admin/faq?saved=1');
};
```

- [ ] **Step 5: Patch kontakt/save.ts**

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { saveKontaktContent } from '../../../../lib/website-db';
import type { KontaktContent } from '../../../../lib/website-db';

const BRAND = process.env.BRAND || 'mentolder';

export const POST: APIRoute = async ({ request, redirect }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });

  if (request.headers.get('content-type')?.includes('application/json')) {
    const body = await request.json() as KontaktContent;
    await saveKontaktContent(BRAND, body);
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  }

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

- [ ] **Step 6: Patch referenzen/save.ts**

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { saveReferenzen } from '../../../../lib/website-db';
import type { ReferenzItem } from '../../../../lib/website-db';

export const POST: APIRoute = async ({ request, redirect }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });

  const BRAND = process.env.BRAND || 'mentolder';

  if (request.headers.get('content-type')?.includes('application/json')) {
    const items = await request.json() as ReferenzItem[];
    await saveReferenzen(BRAND, items);
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  }

  const form = await request.formData();
  const items: ReferenzItem[] = [];
  let i = 0;
  while (form.has(`ref_${i}_id`)) {
    const deleted = form.get(`ref_${i}_delete`) === '1';
    if (!deleted) {
      const name = (form.get(`ref_${i}_name`) as string)?.trim();
      if (name) items.push({
        id: (form.get(`ref_${i}_id`) as string) || crypto.randomUUID(),
        name,
        url: (form.get(`ref_${i}_url`) as string)?.trim() || undefined,
        logoUrl: (form.get(`ref_${i}_logoUrl`) as string)?.trim() || undefined,
        description: (form.get(`ref_${i}_description`) as string)?.trim() || undefined,
      });
    }
    i++;
  }
  const newName = (form.get('new_name') as string)?.trim();
  if (newName) items.push({
    id: crypto.randomUUID(),
    name: newName,
    url: (form.get('new_url') as string)?.trim() || undefined,
    logoUrl: (form.get('new_logoUrl') as string)?.trim() || undefined,
    description: (form.get('new_description') as string)?.trim() || undefined,
  });

  await saveReferenzen(BRAND, items);
  return redirect('/admin/referenzen?saved=1', 303);
};
```

- [ ] **Step 7: Patch rechtliches/save.ts**

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { saveLegalPage } from '../../../../lib/website-db';

const PAGES = ['impressum-zusatz', 'datenschutz', 'agb', 'barrierefreiheit'] as const;
type LegalKey = typeof PAGES[number];

export const POST: APIRoute = async ({ request, redirect }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });

  const BRAND = process.env.BRAND || 'mentolder';

  if (request.headers.get('content-type')?.includes('application/json')) {
    const body = await request.json() as Record<LegalKey, string>;
    await Promise.all(PAGES.map(key => saveLegalPage(BRAND, key, body[key] ?? '')));
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  }

  const form = await request.formData();
  await Promise.all(PAGES.map(key => saveLegalPage(BRAND, key, (form.get(key) as string) ?? '')));
  return redirect('/admin/rechtliches?saved=1', 303);
};
```

- [ ] **Step 8: Verify TypeScript compiles**

```bash
cd website && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 9: Commit**

```bash
git add website/src/pages/api/admin/startseite/save.ts \
        website/src/pages/api/admin/uebermich/save.ts \
        website/src/pages/api/admin/angebote/save.ts \
        website/src/pages/api/admin/faq/save.ts \
        website/src/pages/api/admin/kontakt/save.ts \
        website/src/pages/api/admin/referenzen/save.ts \
        website/src/pages/api/admin/rechtliches/save.ts
git commit -m "feat(inhalte): add JSON mode to all website save handlers"
```

---

## Task 4: Extract VertragsvorlagenSection.svelte

Extract the Vertragsvorlagen logic from `DokumentEditor.svelte` (lines 17–291) into a standalone component.

**Files:**
- Create: `website/src/components/admin/inhalte/VertragsvorlagenSection.svelte`

- [ ] **Step 1: Create VertragsvorlagenSection.svelte**

Create `website/src/components/admin/inhalte/VertragsvorlagenSection.svelte`:

```svelte
<script lang="ts">
  type Template = {
    id: string;
    title: string;
    html_body: string;
    docuseal_template_id: number | null;
    stand_date: string | null;
    created_at: string;
    updated_at: string;
  };

  let templates: Template[] = $state([]);
  let tplLoading = $state(false);
  let tplError = $state('');
  let showCompose = $state(false);
  let editingId: string | null = $state(null);
  let composeTitle = $state('');
  let composeHtml = $state('');
  let composeMsg = $state('');
  let composeSaving = $state(false);
  let deleteConfirm: string | null = $state(null);
  let standPickerId: string | null = $state(null);
  let standPickerDate = $state('');
  let standSaving = $state(false);

  $effect(() => { loadTemplates(); });

  async function loadTemplates() {
    tplLoading = true; tplError = '';
    try {
      const res = await fetch('/api/admin/documents/templates');
      templates = res.ok ? await res.json() : [];
      if (!res.ok) tplError = 'Fehler beim Laden.';
    } catch { tplError = 'Verbindungsfehler.'; }
    finally { tplLoading = false; }
  }

  async function saveTemplate() {
    if (!composeTitle.trim() || !composeHtml.trim()) { composeMsg = 'Titel und Inhalt sind erforderlich.'; return; }
    composeSaving = true; composeMsg = '';
    try {
      const url = editingId ? `/api/admin/documents/templates/${editingId}` : '/api/admin/documents/templates';
      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: composeTitle, html_body: composeHtml }),
      });
      const data = await res.json();
      if (res.ok) { composeMsg = editingId ? 'Gespeichert.' : 'Vorlage erstellt.'; showCompose = false; editingId = null; composeTitle = ''; composeHtml = ''; await loadTemplates(); }
      else { composeMsg = data.error ?? 'Fehler beim Speichern.'; }
    } finally { composeSaving = false; }
  }

  async function deleteTemplate(id: string) {
    const res = await fetch(`/api/admin/documents/templates/${id}`, { method: 'DELETE' });
    if (res.ok) { deleteConfirm = null; await loadTemplates(); }
  }

  function startEdit(t: Template) { editingId = t.id; composeTitle = t.title; composeHtml = t.html_body; showCompose = true; composeMsg = ''; }
  function startNew() { editingId = null; composeTitle = ''; composeHtml = ''; showCompose = true; composeMsg = ''; }
  function openStandPicker(t: Template) { standPickerId = t.id; standPickerDate = new Date().toISOString().slice(0, 10); }

  async function saveStandDate() {
    if (!standPickerId || !standPickerDate) return;
    standSaving = true;
    try {
      const [y, m, d] = standPickerDate.split('-');
      const displayDate = `${d}.${m}.${y}`;
      const res = await fetch(`/api/admin/documents/templates/${standPickerId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stand_date: displayDate }),
      });
      if (res.ok) { standPickerId = null; await loadTemplates(); }
    } finally { standSaving = false; }
  }

  function fmtDate(d: string) { return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
</script>

{#if !showCompose}
  <div class="flex justify-between items-center mb-4">
    <p class="text-muted text-sm">{templates.length} Vorlage{templates.length !== 1 ? 'n' : ''}</p>
    <button onclick={startNew} class="px-3 py-1.5 bg-gold text-dark rounded-lg text-xs font-semibold hover:bg-gold/80">+ Neue Vorlage</button>
  </div>
  {#if tplLoading}
    <p class="text-muted text-sm">Lade…</p>
  {:else if tplError}
    <p class="text-red-400 text-sm">{tplError}</p>
  {:else if templates.length === 0}
    <p class="text-muted text-sm">Noch keine Vorlagen.</p>
  {:else}
    <div class="flex flex-col gap-2">
      {#each templates as t}
        <div class="p-4 bg-dark-light rounded-xl border border-dark-lighter flex flex-col gap-2">
          <div class="flex items-center justify-between gap-4">
            <div class="flex-1 min-w-0">
              <p class="text-light font-medium truncate">{t.title}</p>
              <p class="text-muted text-xs mt-0.5">
                {fmtDate(t.updated_at)}
                {#if t.docuseal_template_id}· <span class="text-green-400">DocuSeal #{t.docuseal_template_id}</span>{/if}
                {#if t.stand_date}· <span class="text-gold/80">Stand: {t.stand_date}</span>{/if}
              </p>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              <button onclick={() => startEdit(t)} class="text-xs text-muted hover:text-gold transition-colors">Bearbeiten</button>
              {#if deleteConfirm === t.id}
                <span class="text-xs text-muted">Sicher?</span>
                <button onclick={() => deleteTemplate(t.id)} class="text-xs text-red-400 hover:text-red-300">Ja</button>
                <button onclick={() => deleteConfirm = null} class="text-xs text-muted hover:text-light">Nein</button>
              {:else}
                <button onclick={() => deleteConfirm = t.id} class="text-xs text-muted hover:text-red-400 transition-colors">Löschen</button>
              {/if}
            </div>
          </div>
          {#if standPickerId === t.id}
            <div class="flex items-center gap-2 pt-1 border-t border-dark-lighter/50">
              <label class="text-xs text-muted whitespace-nowrap">Stand-Datum:</label>
              <input type="date" bind:value={standPickerDate} class="bg-dark border border-dark-lighter rounded px-2 py-1 text-light text-xs focus:border-gold outline-none" />
              <button onclick={saveStandDate} disabled={standSaving} class="px-3 py-1 bg-gold text-dark rounded text-xs font-semibold hover:bg-gold/80 disabled:opacity-50">{standSaving ? 'Speichere…' : 'Festlegen'}</button>
              <button onclick={() => standPickerId = null} class="text-xs text-muted hover:text-light">Abbrechen</button>
            </div>
          {:else}
            <button onclick={() => openStandPicker(t)} class="text-xs text-muted hover:text-gold transition-colors self-start">
              {t.stand_date ? `Stand ändern (aktuell: ${t.stand_date})` : 'Als aktuellen Vertrag festlegen (Stand-Datum setzen)'}
            </button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
{:else}
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold text-light">{editingId ? 'Vorlage bearbeiten' : 'Neue Vorlage'}</h2>
      <button onclick={() => { showCompose = false; editingId = null; }} class="text-sm text-muted hover:text-light transition-colors">Abbrechen</button>
    </div>
    <div>
      <label class="block text-sm text-muted mb-1">Titel *</label>
      <input type="text" bind:value={composeTitle} placeholder="z.B. Dienstleistungsvertrag 2026" class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold focus:ring-1 focus:ring-gold/20 outline-none" />
    </div>
    <div class="overflow-x-auto">
      <div>
        <label class="block text-sm text-muted mb-1">HTML-Inhalt *</label>
        <textarea bind:value={composeHtml} placeholder="<h1>Vertrag</h1><p>Inhalt hier…</p>" rows="18" style="width: 794px" class="bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm font-mono focus:border-gold focus:ring-1 focus:ring-gold/20 outline-none resize-y"></textarea>
        <p class="text-xs text-muted mt-1" style="width: 794px">
          Platzhalter: <span class="font-mono text-gold/80">&#123;&#123;KUNDENNUMMER&#125;&#125;</span> <span class="font-mono text-gold/80">&#123;&#123;DATUM&#125;&#125;</span> <span class="font-mono text-gold/80">&#123;&#123;JAHR&#125;&#125;</span> <span class="font-mono text-gold/80">&#123;&#123;Stand&#125;&#125;</span> — Editierbar: <span class="font-mono text-gold/80">&#123;&#123;KUNDENNAME&#125;&#125;</span> <span class="font-mono text-gold/80">&#123;&#123;EMAIL&#125;&#125;</span> <span class="font-mono text-gold/80">&#123;&#123;TELEFON&#125;&#125;</span>
        </p>
      </div>
    </div>
    {#if composeMsg}
      <p class={`text-sm ${composeMsg.includes('Fehler') || composeMsg.includes('erforderlich') ? 'text-red-400' : 'text-green-400'}`}>{composeMsg}</p>
    {/if}
    <div class="flex gap-3">
      <button onclick={saveTemplate} disabled={composeSaving} class="px-4 py-2 bg-gold text-dark rounded-lg text-sm font-semibold hover:bg-gold/80 transition-colors disabled:opacity-50">{composeSaving ? 'Speichere…' : 'Speichern'}</button>
    </div>
    <div class="overflow-x-auto">
      <div>
        <p class="text-sm text-muted mb-1">Vorschau (DIN A4)</p>
        <iframe srcdoc={composeHtml || '<p style="color:#666;font-family:sans-serif;padding:20px;">Vorschau erscheint hier…</p>'} title="Vertragsvorschau" style="width: 794px; height: 1123px" class="rounded-xl border border-dark-lighter bg-white block"></iframe>
      </div>
    </div>
  </div>
{/if}
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/admin/inhalte/VertragsvorlagenSection.svelte
git commit -m "feat(inhalte): extract VertragsvorlagenSection from DokumentEditor"
```

---

## Task 5: StartseiteSection.svelte

**Files:**
- Create: `website/src/components/admin/inhalte/StartseiteSection.svelte`

- [ ] **Step 1: Create StartseiteSection.svelte**

Create `website/src/components/admin/inhalte/StartseiteSection.svelte`:

```svelte
<script lang="ts">
  import type { HomepageContent } from '../../../lib/website-db';

  let { initialData }: { initialData: HomepageContent } = $props();

  let data = $state(structuredClone(initialData));
  let saving = $state(false);
  let msg = $state('');
  let msgOk = $state(true);

  async function save() {
    saving = true; msg = '';
    try {
      const res = await fetch('/api/admin/startseite/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (res.ok) { msg = 'Gespeichert.'; msgOk = true; }
      else { msg = json.error ?? 'Fehler beim Speichern.'; msgOk = false; }
    } catch { msg = 'Verbindungsfehler.'; msgOk = false; }
    finally { saving = false; }
  }

  const inputCls = 'w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50';
  const labelCls = 'block text-xs text-muted mb-1';
  const sectionCls = 'p-6 bg-dark-light rounded-xl border border-dark-lighter space-y-4';
</script>

<div class="pt-6 pb-20 space-y-10">
  <div class="flex justify-between items-start">
    <div>
      <h2 class="text-2xl font-bold text-light font-serif">Startseite</h2>
      <p class="text-muted mt-1 text-sm">Hero, Stats, Warum-ich-Abschnitt und Zitat</p>
    </div>
    <button onclick={save} disabled={saving} class="px-5 py-2 bg-gold text-dark font-semibold rounded-lg hover:bg-gold/90 transition-colors disabled:opacity-50">
      {saving ? 'Speichere…' : 'Speichern'}
    </button>
  </div>

  {#if msg}
    <div class={`p-4 rounded-xl text-sm ${msgOk ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>{msg}</div>
  {/if}

  <!-- Hero -->
  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Hero-Bereich</h3>
    <div>
      <label class={labelCls}>Kicker-Zeile</label>
      <input type="text" bind:value={data.hero.tagline} class={inputCls} />
    </div>
    <div>
      <label class={labelCls}>Titel</label>
      <textarea bind:value={data.hero.title} rows={2} class="{inputCls} resize-none"></textarea>
    </div>
    <div>
      <label class={labelCls}>Untertitel</label>
      <textarea bind:value={data.hero.subtitle} rows={3} class="{inputCls} resize-none"></textarea>
    </div>
  </div>

  <!-- Stats -->
  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Statistiken</h3>
    {#each data.stats as stat, i}
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class={labelCls}>Wert #{i + 1}</label>
          <input type="text" bind:value={stat.value} class={inputCls} />
        </div>
        <div>
          <label class={labelCls}>Label #{i + 1}</label>
          <input type="text" bind:value={stat.label} class={inputCls} />
        </div>
      </div>
    {/each}
  </div>

  <!-- Services Section -->
  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Angebote-Sektion</h3>
    <div>
      <label class={labelCls}>Überschrift</label>
      <input type="text" bind:value={data.servicesHeadline} class={inputCls} />
    </div>
    <div>
      <label class={labelCls}>Unterüberschrift</label>
      <textarea bind:value={data.servicesSubheadline} rows={2} class="{inputCls} resize-none"></textarea>
    </div>
  </div>

  <!-- Why Me -->
  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">„Warum ich?"-Abschnitt</h3>
    <div>
      <label class={labelCls}>Überschrift</label>
      <input type="text" bind:value={data.whyMeHeadline} class={inputCls} />
    </div>
    <div>
      <label class={labelCls}>Einleitungstext</label>
      <textarea bind:value={data.whyMeIntro} rows={3} class="{inputCls} resize-none"></textarea>
    </div>
    {#each data.whyMePoints as pt, i}
      <div class="p-4 bg-dark rounded-lg border border-dark-lighter space-y-2">
        <div>
          <label class={labelCls}>Titel Punkt {i + 1}</label>
          <input type="text" bind:value={pt.title} class={inputCls} />
        </div>
        <div>
          <label class={labelCls}>Text Punkt {i + 1}</label>
          <textarea bind:value={pt.text} rows={2} class="{inputCls} resize-none"></textarea>
        </div>
      </div>
    {/each}
  </div>

  <!-- Quote -->
  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Zitat</h3>
    <div>
      <label class={labelCls}>Zitat-Text</label>
      <textarea bind:value={data.quote} rows={2} class="{inputCls} resize-none"></textarea>
    </div>
    <div>
      <label class={labelCls}>Name unter dem Zitat</label>
      <input type="text" bind:value={data.quoteName} class={inputCls} />
    </div>
  </div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/admin/inhalte/StartseiteSection.svelte
git commit -m "feat(inhalte): add StartseiteSection Svelte component"
```

---

## Task 6: UebermichSection.svelte

**Files:**
- Create: `website/src/components/admin/inhalte/UebermichSection.svelte`

- [ ] **Step 1: Create UebermichSection.svelte**

Create `website/src/components/admin/inhalte/UebermichSection.svelte`:

```svelte
<script lang="ts">
  import type { UebermichContent } from '../../../lib/website-db';

  let { initialData }: { initialData: UebermichContent } = $props();

  let data = $state(structuredClone(initialData));
  let saving = $state(false);
  let msg = $state('');
  let msgOk = $state(true);

  async function save() {
    saving = true; msg = '';
    try {
      const res = await fetch('/api/admin/uebermich/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (res.ok) { msg = 'Gespeichert.'; msgOk = true; }
      else { msg = json.error ?? 'Fehler beim Speichern.'; msgOk = false; }
    } catch { msg = 'Verbindungsfehler.'; msgOk = false; }
    finally { saving = false; }
  }

  function addMilestone() { data.milestones = [...data.milestones, { year: '', title: '', desc: '' }]; }
  function removeMilestone(i: number) { data.milestones = data.milestones.filter((_, idx) => idx !== i); }
  function addNotDoing() { data.notDoing = [...data.notDoing, { title: '', text: '' }]; }
  function removeNotDoing(i: number) { data.notDoing = data.notDoing.filter((_, idx) => idx !== i); }

  const inputCls = 'w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50';
  const labelCls = 'block text-xs text-muted mb-1';
  const sectionCls = 'p-6 bg-dark-light rounded-xl border border-dark-lighter space-y-4';
</script>

<div class="pt-6 pb-20 space-y-10">
  <div class="flex justify-between items-start">
    <div>
      <h2 class="text-2xl font-bold text-light font-serif">Über mich</h2>
      <p class="text-muted mt-1 text-sm">Seiteninhalte bearbeiten</p>
    </div>
    <button onclick={save} disabled={saving} class="px-5 py-2 bg-gold text-dark font-semibold rounded-lg hover:bg-gold/90 disabled:opacity-50">
      {saving ? 'Speichere…' : 'Speichern'}
    </button>
  </div>

  {#if msg}
    <div class={`p-4 rounded-xl text-sm ${msgOk ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>{msg}</div>
  {/if}

  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Seiten-Header</h3>
    <div>
      <label class={labelCls}>Subheadline (goldene Zeile)</label>
      <input type="text" bind:value={data.subheadline} class={inputCls} />
    </div>
    <div>
      <label class={labelCls}>Seitenüberschrift</label>
      <input type="text" bind:value={data.pageHeadline} class={inputCls} />
    </div>
  </div>

  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Intro-Absätze</h3>
    {#each data.introParagraphs as _, i}
      <div>
        <label class={labelCls}>Absatz {i + 1}</label>
        <textarea bind:value={data.introParagraphs[i]} rows={3} class="{inputCls} resize-none"></textarea>
      </div>
    {/each}
  </div>

  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Abschnitte</h3>
    {#each data.sections as sec, i}
      <div class="p-4 bg-dark rounded-lg border border-dark-lighter space-y-2">
        <div>
          <label class={labelCls}>Titel {i + 1}</label>
          <input type="text" bind:value={sec.title} class={inputCls} />
        </div>
        <div>
          <label class={labelCls}>Inhalt {i + 1}</label>
          <textarea bind:value={sec.content} rows={4} class="{inputCls} resize-none"></textarea>
        </div>
      </div>
    {/each}
  </div>

  <div class={sectionCls}>
    <div class="flex justify-between items-center">
      <h3 class="text-xl font-bold text-light font-serif">Meilensteine</h3>
      <button onclick={addMilestone} class="px-3 py-1.5 bg-gold text-dark rounded-lg text-xs font-semibold hover:bg-gold/80">+ Hinzufügen</button>
    </div>
    {#each data.milestones as ms, i}
      <div class="p-4 bg-dark rounded-lg border border-dark-lighter space-y-2">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class={labelCls}>Jahr</label>
            <input type="text" bind:value={ms.year} class={inputCls} placeholder="z.B. 2025" />
          </div>
          <div>
            <label class={labelCls}>Titel</label>
            <input type="text" bind:value={ms.title} class={inputCls} />
          </div>
        </div>
        <div>
          <label class={labelCls}>Beschreibung</label>
          <textarea bind:value={ms.desc} rows={2} class="{inputCls} resize-none"></textarea>
        </div>
        <button onclick={() => removeMilestone(i)} class="text-xs text-red-400 hover:text-red-300">Entfernen</button>
      </div>
    {/each}
  </div>

  <div class={sectionCls}>
    <div class="flex justify-between items-center">
      <h3 class="text-xl font-bold text-light font-serif">Was ich nicht mache</h3>
      <button onclick={addNotDoing} class="px-3 py-1.5 bg-gold text-dark rounded-lg text-xs font-semibold hover:bg-gold/80">+ Hinzufügen</button>
    </div>
    {#each data.notDoing as nd, i}
      <div class="p-4 bg-dark rounded-lg border border-dark-lighter space-y-2">
        <div>
          <label class={labelCls}>Titel</label>
          <input type="text" bind:value={nd.title} class={inputCls} />
        </div>
        <div>
          <label class={labelCls}>Text</label>
          <textarea bind:value={nd.text} rows={2} class="{inputCls} resize-none"></textarea>
        </div>
        <button onclick={() => removeNotDoing(i)} class="text-xs text-red-400 hover:text-red-300">Entfernen</button>
      </div>
    {/each}
  </div>

  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Privates</h3>
    <textarea bind:value={data.privateText} rows={4} class="{inputCls} resize-none"></textarea>
  </div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/admin/inhalte/UebermichSection.svelte
git commit -m "feat(inhalte): add UebermichSection Svelte component"
```

---

## Task 7: AngeboteSection.svelte

The Angebote section sends `{services, leistungen, priceListUrl}` as typed JSON.

**Files:**
- Create: `website/src/components/admin/inhalte/AngeboteSection.svelte`

- [ ] **Step 1: Create AngeboteSection.svelte**

Create `website/src/components/admin/inhalte/AngeboteSection.svelte`:

```svelte
<script lang="ts">
  import type { ServiceOverride, LeistungCategoryOverride } from '../../../lib/website-db';

  let { initialServices, initialLeistungen, initialPriceListUrl }: {
    initialServices: ServiceOverride[];
    initialLeistungen: LeistungCategoryOverride[];
    initialPriceListUrl: string;
  } = $props();

  let services = $state(structuredClone(initialServices));
  let leistungen = $state(structuredClone(initialLeistungen));
  let priceListUrl = $state(initialPriceListUrl);
  let saving = $state(false);
  let msg = $state('');
  let msgOk = $state(true);

  async function save() {
    saving = true; msg = '';
    try {
      const res = await fetch('/api/admin/angebote/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ services, leistungen, priceListUrl }),
      });
      const json = await res.json();
      if (res.ok) { msg = 'Gespeichert.'; msgOk = true; }
      else { msg = json.error ?? 'Fehler beim Speichern.'; msgOk = false; }
    } catch { msg = 'Verbindungsfehler.'; msgOk = false; }
    finally { saving = false; }
  }

  const inputCls = 'w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50';
  const labelCls = 'block text-xs text-muted mb-1';
  const sectionCls = 'p-6 bg-dark-light rounded-xl border border-dark-lighter space-y-4';
</script>

<div class="pt-6 pb-20 space-y-10">
  <div class="flex justify-between items-start">
    <div>
      <h2 class="text-2xl font-bold text-light font-serif">Angebote</h2>
      <p class="text-muted mt-1 text-sm">Leistungskarten, Leistungskatalog und Preisliste</p>
    </div>
    <button onclick={save} disabled={saving} class="px-5 py-2 bg-gold text-dark font-semibold rounded-lg hover:bg-gold/90 disabled:opacity-50">
      {saving ? 'Speichere…' : 'Speichern'}
    </button>
  </div>

  {#if msg}
    <div class={`p-4 rounded-xl text-sm ${msgOk ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>{msg}</div>
  {/if}

  <!-- Services -->
  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Leistungskarten</h3>
    {#each services as svc}
      <div class="p-4 bg-dark rounded-lg border border-dark-lighter space-y-3">
        <div class="flex items-center gap-3">
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" bind:checked={svc.hidden} class="accent-gold" />
            <span class="text-xs text-muted">Ausblenden</span>
          </label>
          <span class="text-xs font-mono text-muted">{svc.slug}</span>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div><label class={labelCls}>Titel</label><input type="text" bind:value={svc.title} class={inputCls} /></div>
          <div><label class={labelCls}>Preis</label><input type="text" bind:value={svc.price} class={inputCls} /></div>
        </div>
        <div><label class={labelCls}>Beschreibung</label><textarea bind:value={svc.description} rows={2} class="{inputCls} resize-none"></textarea></div>
        <div>
          <label class={labelCls}>Features (eine pro Zeile)</label>
          <textarea
            value={svc.features.join('\n')}
            oninput={(e) => { svc.features = (e.currentTarget as HTMLTextAreaElement).value.split('\n').map(f => f.trim()).filter(Boolean); }}
            rows={4} class="{inputCls} resize-none font-mono"
          ></textarea>
        </div>
        <details class="text-xs text-muted">
          <summary class="cursor-pointer hover:text-light">Seiteninhalte (pageContent)</summary>
          <div class="mt-3 space-y-3">
            <div><label class={labelCls}>Überschrift</label><input type="text" bind:value={svc.pageContent.headline} class={inputCls} /></div>
            <div><label class={labelCls}>Intro</label><textarea bind:value={svc.pageContent.intro} rows={3} class="{inputCls} resize-none"></textarea></div>
            <div>
              <label class={labelCls}>Für wen (eine pro Zeile)</label>
              <textarea
                value={svc.pageContent.forWhom.join('\n')}
                oninput={(e) => { svc.pageContent.forWhom = (e.currentTarget as HTMLTextAreaElement).value.split('\n').map(f => f.trim()).filter(Boolean); }}
                rows={4} class="{inputCls} resize-none font-mono"
              ></textarea>
            </div>
            <div><label class={labelCls}>Sections (JSON)</label><textarea bind:value={svc.pageContent.sections as unknown as string} rows={6} class="{inputCls} resize-y font-mono text-xs"></textarea></div>
          </div>
        </details>
      </div>
    {/each}
  </div>

  <!-- Price list URL -->
  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Preisliste</h3>
    <div><label class={labelCls}>Nextcloud-Freigabe-URL</label><input type="url" bind:value={priceListUrl} class={inputCls} placeholder="https://files.mentolder.de/s/..." /></div>
  </div>

  <!-- Leistungskatalog -->
  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Leistungskatalog</h3>
    {#each leistungen as cat}
      <div class="p-4 bg-dark rounded-lg border border-dark-lighter space-y-3">
        <div class="grid grid-cols-2 gap-4">
          <div><label class={labelCls}>Kategorie-Titel</label><input type="text" bind:value={cat.title} class={inputCls} /></div>
          <div><label class={labelCls}>Icon</label><input type="text" bind:value={cat.icon} class={inputCls} /></div>
        </div>
        {#each cat.services as svc}
          <div class="p-3 bg-dark-lighter/30 rounded-lg space-y-2">
            <p class="text-xs font-mono text-muted">{svc.key}</p>
            <div class="grid grid-cols-3 gap-3">
              <div><label class={labelCls}>Name</label><input type="text" bind:value={svc.name} class={inputCls} /></div>
              <div><label class={labelCls}>Preis</label><input type="text" bind:value={svc.price} class={inputCls} /></div>
              <div><label class={labelCls}>Einheit</label><input type="text" bind:value={svc.unit} class={inputCls} /></div>
            </div>
            <div><label class={labelCls}>Beschreibung</label><textarea bind:value={svc.desc} rows={2} class="{inputCls} resize-none"></textarea></div>
          </div>
        {/each}
      </div>
    {/each}
  </div>
</div>
```

Note: `svc.pageContent.sections` is typed as an object array in the DB but the textarea shows raw JSON for editing — this mirrors the existing Astro page behavior. The value is stored as-is via `JSON.stringify` in the form handler.

- [ ] **Step 2: Commit**

```bash
git add website/src/components/admin/inhalte/AngeboteSection.svelte
git commit -m "feat(inhalte): add AngeboteSection Svelte component"
```

---

## Task 8: FaqSection, KontaktSection, RechtlichesSection

**Files:**
- Create: `website/src/components/admin/inhalte/FaqSection.svelte`
- Create: `website/src/components/admin/inhalte/KontaktSection.svelte`
- Create: `website/src/components/admin/inhalte/RechtlichesSection.svelte`

- [ ] **Step 1: Create FaqSection.svelte**

Create `website/src/components/admin/inhalte/FaqSection.svelte`:

```svelte
<script lang="ts">
  import type { FaqItem } from '../../../lib/website-db';

  let { initialData }: { initialData: FaqItem[] } = $props();

  let items = $state(structuredClone(initialData));
  let saving = $state(false);
  let msg = $state('');
  let msgOk = $state(true);

  async function save() {
    saving = true; msg = '';
    try {
      const res = await fetch('/api/admin/faq/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(items.filter(it => it.question.trim())),
      });
      const json = await res.json();
      if (res.ok) { msg = 'Gespeichert.'; msgOk = true; }
      else { msg = json.error ?? 'Fehler.'; msgOk = false; }
    } catch { msg = 'Verbindungsfehler.'; msgOk = false; }
    finally { saving = false; }
  }

  function addItem() { items = [...items, { question: '', answer: '' }]; }
  function removeItem(i: number) { items = items.filter((_, idx) => idx !== i); }
  function moveUp(i: number) { if (i > 0) { const a = [...items]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; items = a; } }
  function moveDown(i: number) { if (i < items.length - 1) { const a = [...items]; [a[i], a[i + 1]] = [a[i + 1], a[i]]; items = a; } }

  const inputCls = 'w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50';
  const labelCls = 'block text-xs text-muted mb-1';
</script>

<div class="pt-6 pb-20 space-y-6">
  <div class="flex justify-between items-start">
    <div>
      <h2 class="text-2xl font-bold text-light font-serif">FAQ</h2>
      <p class="text-muted mt-1 text-sm">Häufig gestellte Fragen</p>
    </div>
    <div class="flex gap-3">
      <button onclick={addItem} class="px-3 py-2 border border-dark-lighter text-muted rounded-lg text-sm hover:text-light">+ Frage</button>
      <button onclick={save} disabled={saving} class="px-5 py-2 bg-gold text-dark font-semibold rounded-lg hover:bg-gold/90 disabled:opacity-50">
        {saving ? 'Speichere…' : 'Speichern'}
      </button>
    </div>
  </div>

  {#if msg}
    <div class={`p-4 rounded-xl text-sm ${msgOk ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>{msg}</div>
  {/if}

  {#each items as item, i}
    <div class="p-5 bg-dark-light rounded-xl border border-dark-lighter space-y-3">
      <div class="flex items-center justify-between">
        <span class="text-xs text-muted font-mono">#{i + 1}</span>
        <div class="flex gap-2">
          <button onclick={() => moveUp(i)} disabled={i === 0} class="text-xs text-muted hover:text-light disabled:opacity-30">↑</button>
          <button onclick={() => moveDown(i)} disabled={i === items.length - 1} class="text-xs text-muted hover:text-light disabled:opacity-30">↓</button>
          <button onclick={() => removeItem(i)} class="text-xs text-red-400 hover:text-red-300">Entfernen</button>
        </div>
      </div>
      <div>
        <label class={labelCls}>Frage</label>
        <input type="text" bind:value={item.question} class={inputCls} />
      </div>
      <div>
        <label class={labelCls}>Antwort</label>
        <textarea bind:value={item.answer} rows={3} class="{inputCls} resize-none"></textarea>
      </div>
    </div>
  {/each}
</div>
```

- [ ] **Step 2: Create KontaktSection.svelte**

Create `website/src/components/admin/inhalte/KontaktSection.svelte`:

```svelte
<script lang="ts">
  import type { KontaktContent } from '../../../lib/website-db';

  let { initialData }: { initialData: KontaktContent } = $props();

  let data = $state(structuredClone(initialData));
  let saving = $state(false);
  let msg = $state('');
  let msgOk = $state(true);

  async function save() {
    saving = true; msg = '';
    try {
      const res = await fetch('/api/admin/kontakt/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (res.ok) { msg = 'Gespeichert.'; msgOk = true; }
      else { msg = json.error ?? 'Fehler.'; msgOk = false; }
    } catch { msg = 'Verbindungsfehler.'; msgOk = false; }
    finally { saving = false; }
  }

  const inputCls = 'w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50';
  const labelCls = 'block text-xs text-muted mb-1';
  const sectionCls = 'p-6 bg-dark-light rounded-xl border border-dark-lighter space-y-4';
</script>

<div class="pt-6 pb-20 space-y-10">
  <div class="flex justify-between items-start">
    <div>
      <h2 class="text-2xl font-bold text-light font-serif">Kontakt</h2>
      <p class="text-muted mt-1 text-sm">Kontaktformular-Texte</p>
    </div>
    <button onclick={save} disabled={saving} class="px-5 py-2 bg-gold text-dark font-semibold rounded-lg hover:bg-gold/90 disabled:opacity-50">
      {saving ? 'Speichere…' : 'Speichern'}
    </button>
  </div>

  {#if msg}
    <div class={`p-4 rounded-xl text-sm ${msgOk ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>{msg}</div>
  {/if}

  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Einleitungstext</h3>
    <textarea bind:value={data.intro} rows={3} class="{inputCls} resize-none"></textarea>
  </div>

  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Sidebar</h3>
    <div><label class={labelCls}>Titel</label><input type="text" bind:value={data.sidebarTitle} class={inputCls} /></div>
    <div><label class={labelCls}>Text</label><textarea bind:value={data.sidebarText} rows={4} class="{inputCls} resize-none"></textarea></div>
    <div><label class={labelCls}>CTA-Text</label><input type="text" bind:value={data.sidebarCta} class={inputCls} /></div>
    <label class="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" bind:checked={data.showPhone} class="accent-gold" />
      <span class="text-sm text-light">Telefonnummer anzeigen</span>
    </label>
  </div>
</div>
```

- [ ] **Step 3: Create RechtlichesSection.svelte**

Create `website/src/components/admin/inhalte/RechtlichesSection.svelte`:

```svelte
<script lang="ts">
  let { initialData }: { initialData: Record<string, string> } = $props();

  let data = $state({ ...initialData });
  let saving = $state(false);
  let msg = $state('');
  let msgOk = $state(true);

  async function save() {
    saving = true; msg = '';
    try {
      const res = await fetch('/api/admin/rechtliches/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (res.ok) { msg = 'Gespeichert.'; msgOk = true; }
      else { msg = json.error ?? 'Fehler.'; msgOk = false; }
    } catch { msg = 'Verbindungsfehler.'; msgOk = false; }
    finally { saving = false; }
  }

  const inputCls = 'w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50 font-mono';
  const sectionCls = 'p-6 bg-dark-light rounded-xl border border-dark-lighter space-y-4';
</script>

<div class="pt-6 pb-20 space-y-10">
  <div class="flex justify-between items-start">
    <div>
      <h2 class="text-2xl font-bold text-light font-serif">Rechtliches</h2>
      <p class="text-muted mt-1 text-sm">Impressum, Datenschutz, AGB, Barrierefreiheit</p>
    </div>
    <button onclick={save} disabled={saving} class="px-5 py-2 bg-gold text-dark font-semibold rounded-lg hover:bg-gold/90 disabled:opacity-50">
      {saving ? 'Speichere…' : 'Speichern'}
    </button>
  </div>

  {#if msg}
    <div class={`p-4 rounded-xl text-sm ${msgOk ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>{msg}</div>
  {/if}

  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Impressum-Zusatz</h3>
    <textarea bind:value={data['impressum-zusatz']} rows={5} class={inputCls}></textarea>
  </div>

  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Datenschutzerklärung</h3>
    <textarea bind:value={data['datenschutz']} rows={20} class={inputCls}></textarea>
  </div>

  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">AGB</h3>
    <textarea bind:value={data['agb']} rows={20} class={inputCls}></textarea>
  </div>

  <div class={sectionCls}>
    <h3 class="text-xl font-bold text-light font-serif">Barrierefreiheit</h3>
    <textarea bind:value={data['barrierefreiheit']} rows={15} class={inputCls}></textarea>
  </div>
</div>
```

- [ ] **Step 4: Commit**

```bash
git add website/src/components/admin/inhalte/FaqSection.svelte \
        website/src/components/admin/inhalte/KontaktSection.svelte \
        website/src/components/admin/inhalte/RechtlichesSection.svelte
git commit -m "feat(inhalte): add FAQ, Kontakt, Rechtliches section components"
```

---

## Task 9: ReferenzenSection.svelte

**Files:**
- Create: `website/src/components/admin/inhalte/ReferenzenSection.svelte`

- [ ] **Step 1: Create ReferenzenSection.svelte**

Create `website/src/components/admin/inhalte/ReferenzenSection.svelte`:

```svelte
<script lang="ts">
  import type { ReferenzItem } from '../../../lib/website-db';

  let { initialData }: { initialData: ReferenzItem[] } = $props();

  let items = $state(structuredClone(initialData));
  let saving = $state(false);
  let msg = $state('');
  let msgOk = $state(true);

  async function save() {
    saving = true; msg = '';
    try {
      const res = await fetch('/api/admin/referenzen/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(items),
      });
      const json = await res.json();
      if (res.ok) { msg = 'Gespeichert.'; msgOk = true; }
      else { msg = json.error ?? 'Fehler.'; msgOk = false; }
    } catch { msg = 'Verbindungsfehler.'; msgOk = false; }
    finally { saving = false; }
  }

  function addItem() { items = [...items, { id: crypto.randomUUID(), name: '', url: undefined, logoUrl: undefined, description: undefined }]; }
  function removeItem(i: number) { items = items.filter((_, idx) => idx !== i); }

  const inputCls = 'w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50';
  const labelCls = 'block text-xs text-muted mb-1';
</script>

<div class="pt-6 pb-20 space-y-6">
  <div class="flex justify-between items-start">
    <div>
      <h2 class="text-2xl font-bold text-light font-serif">Referenzen</h2>
      <p class="text-muted mt-1 text-sm">{items.length} Einträge</p>
    </div>
    <div class="flex gap-3">
      <button onclick={addItem} class="px-3 py-2 border border-dark-lighter text-muted rounded-lg text-sm hover:text-light">+ Referenz</button>
      <button onclick={save} disabled={saving} class="px-5 py-2 bg-gold text-dark font-semibold rounded-lg hover:bg-gold/90 disabled:opacity-50">
        {saving ? 'Speichere…' : 'Speichern'}
      </button>
    </div>
  </div>

  {#if msg}
    <div class={`p-4 rounded-xl text-sm ${msgOk ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>{msg}</div>
  {/if}

  {#each items as item, i}
    <div class="p-5 bg-dark-light rounded-xl border border-dark-lighter space-y-3">
      <div class="flex justify-between items-center">
        <span class="text-xs font-mono text-muted">{item.id.slice(0, 8)}</span>
        <button onclick={() => removeItem(i)} class="text-xs text-red-400 hover:text-red-300">Entfernen</button>
      </div>
      <div>
        <label class={labelCls}>Name *</label>
        <input type="text" bind:value={item.name} required class={inputCls} />
      </div>
      <div>
        <label class={labelCls}>Website-URL</label>
        <input type="url" bind:value={item.url} class={inputCls} placeholder="https://..." />
      </div>
      <div>
        <label class={labelCls}>Logo-URL</label>
        <input type="url" bind:value={item.logoUrl} class={inputCls} placeholder="https://..." />
      </div>
      <div>
        <label class={labelCls}>Beschreibung</label>
        <textarea bind:value={item.description} rows={2} class="{inputCls} resize-none"></textarea>
      </div>
    </div>
  {/each}
</div>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/admin/inhalte/ReferenzenSection.svelte
git commit -m "feat(inhalte): add ReferenzenSection Svelte component"
```

---

## Task 10: CustomSection.svelte

Renders DB-driven custom sections. Supports viewing/editing content and creating new sections.

**Files:**
- Create: `website/src/components/admin/inhalte/CustomSection.svelte`

- [ ] **Step 1: Create CustomSection.svelte**

Create `website/src/components/admin/inhalte/CustomSection.svelte`:

```svelte
<script lang="ts">
  import type { CustomSection } from '../../../lib/website-db';

  let { section, onDeleted }: { section: CustomSection; onDeleted: () => void } = $props();

  let content = $state({ ...section.content });
  let saving = $state(false);
  let deleting = $state(false);
  let confirmDelete = $state(false);
  let msg = $state('');
  let msgOk = $state(true);

  async function save() {
    saving = true; msg = '';
    try {
      const res = await fetch(`/api/admin/inhalte/custom/${section.slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const json = await res.json();
      if (res.ok) { msg = 'Gespeichert.'; msgOk = true; }
      else { msg = json.error ?? 'Fehler.'; msgOk = false; }
    } catch { msg = 'Verbindungsfehler.'; msgOk = false; }
    finally { saving = false; }
  }

  async function doDelete() {
    deleting = true;
    await fetch(`/api/admin/inhalte/custom/${section.slug}`, { method: 'DELETE' });
    onDeleted();
  }

  const inputCls = 'w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50';
  const labelCls = 'block text-xs text-muted mb-1';
</script>

<div class="pt-6 pb-20 space-y-6">
  <div class="flex justify-between items-start">
    <div>
      <h2 class="text-2xl font-bold text-light font-serif">{section.title} <span class="text-gold text-lg">★</span></h2>
      <p class="text-muted mt-1 text-xs font-mono">slug: {section.slug}</p>
    </div>
    <div class="flex gap-3 items-center">
      {#if confirmDelete}
        <span class="text-xs text-muted">Sicher löschen?</span>
        <button onclick={doDelete} disabled={deleting} class="px-3 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-500 disabled:opacity-50">Ja, löschen</button>
        <button onclick={() => confirmDelete = false} class="text-xs text-muted hover:text-light">Abbrechen</button>
      {:else}
        <button onclick={() => confirmDelete = true} class="px-3 py-2 text-red-400 border border-red-400/30 rounded-lg text-sm hover:bg-red-400/10">Löschen</button>
      {/if}
      <button onclick={save} disabled={saving} class="px-5 py-2 bg-gold text-dark font-semibold rounded-lg hover:bg-gold/90 disabled:opacity-50">
        {saving ? 'Speichere…' : 'Speichern'}
      </button>
    </div>
  </div>

  {#if msg}
    <div class={`p-4 rounded-xl text-sm ${msgOk ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>{msg}</div>
  {/if}

  <div class="p-6 bg-dark-light rounded-xl border border-dark-lighter space-y-4">
    {#each section.fields as field}
      <div>
        <label class={labelCls}>{field.label}{field.required ? ' *' : ''}</label>
        {#if field.type === 'textarea'}
          <textarea bind:value={content[field.name]} rows={4} class="{inputCls} resize-none"></textarea>
        {:else if field.type === 'url'}
          <input type="url" bind:value={content[field.name]} class={inputCls} />
        {:else}
          <input type="text" bind:value={content[field.name]} class={inputCls} />
        {/if}
      </div>
    {/each}
    {#if section.fields.length === 0}
      <p class="text-muted text-sm">Keine Felder definiert. Abschnitt löschen und neu erstellen mit Feldern.</p>
    {/if}
  </div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/admin/inhalte/CustomSection.svelte
git commit -m "feat(inhalte): add CustomSection Svelte component"
```

---

## Task 11: InhalteEditor.svelte

The hub component — manages four primary tabs, website sub-tabs, URL state, and the "new custom section" dialog.

**Files:**
- Create: `website/src/components/admin/InhalteEditor.svelte`

- [ ] **Step 1: Create InhalteEditor.svelte**

Create `website/src/components/admin/InhalteEditor.svelte`:

```svelte
<script lang="ts">
  import NewsletterAdmin from './NewsletterAdmin.svelte';
  import QuestionnaireTemplateEditor from './QuestionnaireTemplateEditor.svelte';
  import VertragsvorlagenSection from './inhalte/VertragsvorlagenSection.svelte';
  import StartseiteSection from './inhalte/StartseiteSection.svelte';
  import UebermichSection from './inhalte/UebermichSection.svelte';
  import AngeboteSection from './inhalte/AngeboteSection.svelte';
  import FaqSection from './inhalte/FaqSection.svelte';
  import KontaktSection from './inhalte/KontaktSection.svelte';
  import ReferenzenSection from './inhalte/ReferenzenSection.svelte';
  import RechtlichesSection from './inhalte/RechtlichesSection.svelte';
  import CustomSection from './inhalte/CustomSection.svelte';
  import type {
    HomepageContent, UebermichContent, FaqItem, KontaktContent, ReferenzItem, CustomSection as CustomSectionType,
  } from '../../lib/website-db';
  import type { ServiceOverride, LeistungCategoryOverride } from '../../lib/website-db';

  type InitialData = {
    startseite: HomepageContent;
    uebermich: UebermichContent;
    services: ServiceOverride[];
    leistungen: LeistungCategoryOverride[];
    priceListUrl: string;
    faq: FaqItem[];
    kontakt: KontaktContent;
    referenzen: ReferenzItem[];
    rechtliches: Record<string, string>;
    customSections: CustomSectionType[];
  };

  let { initialData }: { initialData: InitialData } = $props();

  type PrimaryTab = 'website' | 'newsletter' | 'fragebogen' | 'vertraege';
  type WebsiteSection = 'startseite' | 'uebermich' | 'angebote' | 'faq' | 'kontakt' | 'referenzen' | 'rechtliches' | string;

  function readParam<T extends string>(key: string, fallback: T): T {
    if (typeof window === 'undefined') return fallback;
    return (new URLSearchParams(window.location.search).get(key) as T) ?? fallback;
  }

  let activeTab = $state<PrimaryTab>(readParam('tab', 'website') as PrimaryTab);
  let activeSection = $state<WebsiteSection>(readParam('section', 'startseite'));
  let customSections = $state(initialData.customSections);

  // New custom section dialog
  let showNewDialog = $state(false);
  let newTitle = $state('');
  let newSlug = $state('');
  let newFields = $state<Array<{ name: string; label: string; type: 'text' | 'textarea' | 'url'; required: boolean }>>([]);
  let newSaving = $state(false);
  let newMsg = $state('');

  $effect(() => {
    const params = new URLSearchParams();
    params.set('tab', activeTab);
    if (activeTab === 'website') params.set('section', activeSection);
    history.replaceState(null, '', `?${params.toString()}`);
  });

  function switchTab(tab: PrimaryTab) { activeTab = tab; if (tab === 'website' && !activeSection) activeSection = 'startseite'; }
  function switchSection(sec: WebsiteSection) { activeSection = sec; }

  function addField() { newFields = [...newFields, { name: '', label: '', type: 'text', required: false }]; }
  function removeField(i: number) { newFields = newFields.filter((_, idx) => idx !== i); }

  async function createSection() {
    if (!newTitle.trim() || !newSlug.trim()) { newMsg = 'Titel und Slug erforderlich.'; return; }
    newSaving = true; newMsg = '';
    try {
      const res = await fetch('/api/admin/inhalte/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim(), slug: newSlug.trim(), fields: newFields }),
      });
      const data = await res.json();
      if (res.ok) {
        customSections = [...customSections, data];
        showNewDialog = false;
        newTitle = ''; newSlug = ''; newFields = [];
        activeSection = data.slug;
      } else { newMsg = data.error ?? 'Fehler.'; }
    } catch { newMsg = 'Verbindungsfehler.'; }
    finally { newSaving = false; }
  }

  function onCustomDeleted(slug: string) {
    customSections = customSections.filter(s => s.slug !== slug);
    activeSection = 'startseite';
  }

  const tabBtnCls = (active: boolean) =>
    `px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${active ? 'border-gold text-gold' : 'border-transparent text-muted hover:text-light'}`;
  const secBtnCls = (active: boolean) =>
    `px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${active ? 'border-green-500 text-green-400' : 'border-transparent text-muted hover:text-light'}`;
</script>

<div>
  <!-- Primary tabs -->
  <div class="flex gap-0 border-b border-dark-lighter overflow-x-auto flex-shrink-0">
    <button onclick={() => switchTab('website')} class={tabBtnCls(activeTab === 'website')}>🌐 Website</button>
    <button onclick={() => switchTab('newsletter')} class={tabBtnCls(activeTab === 'newsletter')}>✉️ Newsletter</button>
    <button onclick={() => switchTab('fragebogen')} class={tabBtnCls(activeTab === 'fragebogen')}>📋 Fragebögen</button>
    <button onclick={() => switchTab('vertraege')} class={tabBtnCls(activeTab === 'vertraege')}>📄 Verträge</button>
  </div>

  <!-- Website: secondary tab bar -->
  {#if activeTab === 'website'}
    <div class="flex items-center gap-0 border-b border-dark-lighter/60 overflow-x-auto bg-dark/30 flex-shrink-0">
      {#each ['startseite', 'uebermich', 'angebote', 'faq', 'kontakt', 'referenzen', 'rechtliches'] as sec}
        <button onclick={() => switchSection(sec)} class={secBtnCls(activeSection === sec)}>
          {sec.charAt(0).toUpperCase() + sec.slice(1).replace('uebermich', 'Über mich').replace('angebote', 'Angebote').replace('kontakt', 'Kontakt').replace('referenzen', 'Referenzen').replace('rechtliches', 'Rechtliches')}
        </button>
      {/each}
      {#each customSections as cs}
        <button onclick={() => switchSection(cs.slug)} class={secBtnCls(activeSection === cs.slug)}>
          {cs.title} ★
        </button>
      {/each}
      <button onclick={() => showNewDialog = true} class="ml-2 px-3 py-1.5 text-xs text-blue-400 border border-blue-400/30 rounded-md hover:bg-blue-400/10 my-1 flex-shrink-0">+ Abschnitt</button>
    </div>
  {/if}

  <!-- Content area -->
  <div class="max-w-4xl px-8">
    {#if activeTab === 'website'}
      {#if activeSection === 'startseite'}
        <StartseiteSection initialData={initialData.startseite} />
      {:else if activeSection === 'uebermich'}
        <UebermichSection initialData={initialData.uebermich} />
      {:else if activeSection === 'angebote'}
        <AngeboteSection
          initialServices={initialData.services}
          initialLeistungen={initialData.leistungen}
          initialPriceListUrl={initialData.priceListUrl}
        />
      {:else if activeSection === 'faq'}
        <FaqSection initialData={initialData.faq} />
      {:else if activeSection === 'kontakt'}
        <KontaktSection initialData={initialData.kontakt} />
      {:else if activeSection === 'referenzen'}
        <ReferenzenSection initialData={initialData.referenzen} />
      {:else if activeSection === 'rechtliches'}
        <RechtlichesSection initialData={initialData.rechtliches} />
      {:else}
        {@const cs = customSections.find(s => s.slug === activeSection)}
        {#if cs}
          <CustomSection section={cs} onDeleted={() => onCustomDeleted(cs.slug)} />
        {/if}
      {/if}
    {:else if activeTab === 'newsletter'}
      <div class="pt-6 pb-20">
        <NewsletterAdmin />
      </div>
    {:else if activeTab === 'fragebogen'}
      <div class="pt-6 pb-20">
        <QuestionnaireTemplateEditor />
      </div>
    {:else if activeTab === 'vertraege'}
      <div class="pt-6 pb-20">
        <VertragsvorlagenSection />
      </div>
    {/if}
  </div>
</div>

<!-- New custom section dialog -->
{#if showNewDialog}
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
    <div class="bg-dark-light border border-dark-lighter rounded-2xl p-6 w-full max-w-lg space-y-4">
      <h3 class="text-lg font-bold text-light font-serif">Neuer Website-Abschnitt</h3>

      <div>
        <label class="block text-xs text-muted mb-1">Titel *</label>
        <input type="text" bind:value={newTitle} class="w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm focus:outline-none focus:border-gold/50" placeholder="z.B. Mein Angebot 2026" />
      </div>
      <div>
        <label class="block text-xs text-muted mb-1">Slug * (URL-safe, z.B. mein-angebot)</label>
        <input type="text" bind:value={newSlug} class="w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm font-mono focus:outline-none focus:border-gold/50" placeholder="mein-angebot" />
      </div>

      <div>
        <div class="flex justify-between items-center mb-2">
          <label class="text-xs text-muted">Felder</label>
          <button onclick={addField} class="text-xs text-blue-400 hover:text-blue-300">+ Feld</button>
        </div>
        {#each newFields as field, i}
          <div class="flex gap-2 mb-2 items-center">
            <input type="text" bind:value={field.name} placeholder="name (key)" class="flex-1 px-2 py-1.5 bg-dark border border-dark-lighter rounded-lg text-light text-xs font-mono focus:outline-none focus:border-gold/50" />
            <input type="text" bind:value={field.label} placeholder="Label" class="flex-1 px-2 py-1.5 bg-dark border border-dark-lighter rounded-lg text-light text-xs focus:outline-none focus:border-gold/50" />
            <select bind:value={field.type} class="px-2 py-1.5 bg-dark border border-dark-lighter rounded-lg text-light text-xs focus:outline-none focus:border-gold/50">
              <option value="text">text</option>
              <option value="textarea">textarea</option>
              <option value="url">url</option>
            </select>
            <label class="flex items-center gap-1 text-xs text-muted">
              <input type="checkbox" bind:checked={field.required} class="accent-gold" /> Pflicht
            </label>
            <button onclick={() => removeField(i)} class="text-red-400 text-xs hover:text-red-300">✕</button>
          </div>
        {/each}
      </div>

      {#if newMsg}
        <p class="text-red-400 text-sm">{newMsg}</p>
      {/if}

      <div class="flex gap-3 justify-end">
        <button onclick={() => { showNewDialog = false; newMsg = ''; }} class="px-4 py-2 text-muted text-sm hover:text-light">Abbrechen</button>
        <button onclick={createSection} disabled={newSaving} class="px-4 py-2 bg-gold text-dark font-semibold rounded-lg text-sm hover:bg-gold/80 disabled:opacity-50">
          {newSaving ? 'Erstelle…' : 'Erstellen'}
        </button>
      </div>
    </div>
  </div>
{/if}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd website && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add website/src/components/admin/InhalteEditor.svelte
git commit -m "feat(inhalte): add InhalteEditor hub component with 4-tab navigation"
```

---

## Task 12: inhalte.astro — new page

**Files:**
- Create: `website/src/pages/admin/inhalte.astro`

- [ ] **Step 1: Create inhalte.astro**

Create `website/src/pages/admin/inhalte.astro`:

```astro
---
import AdminLayout from '../../layouts/AdminLayout.astro';
import InhalteEditor from '../../components/admin/InhalteEditor.svelte';
import { getSession, getLoginUrl, isAdmin } from '../../lib/auth';
import {
  getEffectiveHomepage,
  getEffectiveUebermich,
  getEffectiveServices,
  getEffectiveLeistungen,
  getPriceListUrl,
  getEffectiveFaq,
  getEffectiveKontakt,
  getEffectiveReferenzen,
} from '../../lib/content';
import { getLegalPage, listCustomSections } from '../../lib/website-db';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');

const BRAND = import.meta.env.BRAND || 'mentolder';

const [
  startseite,
  uebermich,
  services,
  leistungen,
  priceListUrl,
  faq,
  kontakt,
  referenzen,
  impressum,
  datenschutz,
  agb,
  barrierefreiheit,
  customSections,
] = await Promise.all([
  getEffectiveHomepage(),
  getEffectiveUebermich(),
  getEffectiveServices(),
  getEffectiveLeistungen(),
  getPriceListUrl().then(u => u ?? ''),
  getEffectiveFaq(),
  getEffectiveKontakt(),
  getEffectiveReferenzen(),
  getLegalPage(BRAND, 'impressum-zusatz').then(v => v ?? ''),
  getLegalPage(BRAND, 'datenschutz').then(v => v ?? ''),
  getLegalPage(BRAND, 'agb').then(v => v ?? ''),
  getLegalPage(BRAND, 'barrierefreiheit').then(v => v ?? ''),
  listCustomSections(),
]);

const initialData = {
  startseite,
  uebermich,
  services,
  leistungen,
  priceListUrl,
  faq,
  kontakt,
  referenzen,
  rechtliches: { 'impressum-zusatz': impressum, datenschutz, agb, barrierefreiheit },
  customSections,
};
---

<AdminLayout title="Admin — Inhalte">
  <section class="pt-0 pb-0 bg-dark min-h-screen">
    <div class="px-8 pt-8 mb-2">
      <h1 class="text-3xl font-bold text-light font-serif">Inhalte</h1>
      <p class="text-muted mt-1 text-sm">Website, Newsletter, Fragebögen und Vertragsvorlagen</p>
    </div>
    <InhalteEditor {initialData} client:load />
  </section>
</AdminLayout>
```

- [ ] **Step 2: Start dev server and verify page loads**

```bash
cd website && task website:dev
```

Open `http://localhost:4321/admin/inhalte` (after logging in). Expected: page loads with four tabs visible, Startseite fields populated from DB.

- [ ] **Step 3: Test each primary tab**

- Click **Newsletter** → NewsletterAdmin renders
- Click **Fragebögen** → QuestionnaireTemplateEditor renders
- Click **Verträge** → VertragsvorlagenSection renders
- Click **Website** → secondary tab bar appears

- [ ] **Step 4: Test Startseite save**

Edit the Hero-Kicker field, click Speichern. Expected: green "Gespeichert." message, no redirect.

- [ ] **Step 5: Test URL state**

Click "FAQ" in secondary tabs. Check browser URL: should show `?tab=website&section=faq`. Reload page: FAQ tab should be active.

- [ ] **Step 6: Commit**

```bash
git add website/src/pages/admin/inhalte.astro
git commit -m "feat(inhalte): add /admin/inhalte SPA page with all initial data"
```

---

## Task 13: Update AdminLayout.astro sidebar

**Files:**
- Modify: `website/src/layouts/AdminLayout.astro`

- [ ] **Step 1: Replace sidebar nav entries**

In `AdminLayout.astro` at line 56, replace the `navGroups` array. The current array has:
- Betrieb group (includes `{ href: '/admin/dokumente', label: 'Dokumenteneditor', icon: 'mail' }`)
- System group (includes the Website entry with 7-item `matches` array)

Replace the `navGroups` definition (lines 56–100) with:

```typescript
const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: 'Übersicht',
    items: [
      { href: '/admin', label: 'Dashboard', icon: 'dashboard' },
    ],
  },
  {
    label: 'Betrieb',
    items: [
      { href: '/admin/bugs',          label: 'Bugs',          icon: 'bug' },
      { href: '/admin/meetings',      label: 'Meetings',      icon: 'microphone' },
      { href: '/admin/termine',       label: 'Termine',       icon: 'calendar' },
      { href: '/admin/clients',       label: 'Clients',       icon: 'users' },
      { href: '/admin/projekte',      label: 'Projekte',      icon: 'clipboard' },
      { href: '/admin/rechnungen',    label: 'Rechnungen',    icon: 'receipt' },
      { href: '/admin/kalender',      label: 'Kalender',      icon: 'calendar2' },
    ],
  },
  {
    label: 'Inhalte',
    items: [
      {
        href: '/admin/inhalte',
        label: 'Inhalte',
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
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/admin/monitoring', label: 'Monitoring', icon: 'monitor' },
      { href: '/admin/inbox',      label: 'Inbox',      icon: 'inbox' },
    ],
  },
  {
    label: 'Einstellungen',
    items: [
      {
        href: '/admin/einstellungen/benachrichtigungen',
        label: 'Einstellungen',
        icon: 'bell',
        matches: ['/admin/einstellungen/'],
      },
    ],
  },
];
```

- [ ] **Step 2: Verify sidebar in browser**

Reload `/admin/inhalte`. Sidebar should show: Dashboard | Betrieb (7 items, no Dokumenteneditor) | Inhalte (single item, active) | System | Einstellungen.

- [ ] **Step 3: Commit**

```bash
git add website/src/layouts/AdminLayout.astro
git commit -m "feat(inhalte): update sidebar — add Inhalte group, remove Website+Dokumente entries"
```

---

## Task 14: Redirects + Cleanup

Convert 8 old pages to 301 redirects and delete the now-unused `AdminWebsiteTabs.astro`.

**Files:**
- Modify: 8 Astro pages
- Delete: `website/src/components/AdminWebsiteTabs.astro`

- [ ] **Step 1: Replace startseite.astro with redirect**

Replace the entire content of `website/src/pages/admin/startseite.astro`:

```astro
---
import { getSession, getLoginUrl, isAdmin } from '../../lib/auth';
const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');
return Astro.redirect('/admin/inhalte?tab=website&section=startseite', 301);
---
```

- [ ] **Step 2: Replace uebermich.astro with redirect**

```astro
---
import { getSession, getLoginUrl, isAdmin } from '../../lib/auth';
const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');
return Astro.redirect('/admin/inhalte?tab=website&section=uebermich', 301);
---
```

- [ ] **Step 3: Replace angebote.astro with redirect**

```astro
---
import { getSession, getLoginUrl, isAdmin } from '../../lib/auth';
const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');
return Astro.redirect('/admin/inhalte?tab=website&section=angebote', 301);
---
```

- [ ] **Step 4: Replace faq.astro with redirect**

```astro
---
import { getSession, getLoginUrl, isAdmin } from '../../lib/auth';
const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');
return Astro.redirect('/admin/inhalte?tab=website&section=faq', 301);
---
```

- [ ] **Step 5: Replace kontakt.astro with redirect**

```astro
---
import { getSession, getLoginUrl, isAdmin } from '../../lib/auth';
const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');
return Astro.redirect('/admin/inhalte?tab=website&section=kontakt', 301);
---
```

- [ ] **Step 6: Replace referenzen.astro with redirect**

```astro
---
import { getSession, getLoginUrl, isAdmin } from '../../lib/auth';
const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');
return Astro.redirect('/admin/inhalte?tab=website&section=referenzen', 301);
---
```

- [ ] **Step 7: Replace rechtliches.astro with redirect**

```astro
---
import { getSession, getLoginUrl, isAdmin } from '../../lib/auth';
const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');
return Astro.redirect('/admin/inhalte?tab=website&section=rechtliches', 301);
---
```

- [ ] **Step 8: Replace dokumente.astro with redirect**

```astro
---
import { getSession, getLoginUrl, isAdmin } from '../../lib/auth';
const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');
return Astro.redirect('/admin/inhalte?tab=newsletter', 301);
---
```

- [ ] **Step 9: Delete AdminWebsiteTabs.astro**

```bash
rm website/src/components/AdminWebsiteTabs.astro
```

- [ ] **Step 10: Verify redirects work**

With dev server running, visit each old URL and confirm they redirect to `/admin/inhalte`:
- `/admin/startseite` → `/admin/inhalte?tab=website&section=startseite`
- `/admin/dokumente` → `/admin/inhalte?tab=newsletter`

- [ ] **Step 11: Run manifest validation**

```bash
task workspace:validate
```

Expected: no errors.

- [ ] **Step 12: Commit**

```bash
git add website/src/pages/admin/startseite.astro \
        website/src/pages/admin/uebermich.astro \
        website/src/pages/admin/angebote.astro \
        website/src/pages/admin/faq.astro \
        website/src/pages/admin/kontakt.astro \
        website/src/pages/admin/referenzen.astro \
        website/src/pages/admin/rechtliches.astro \
        website/src/pages/admin/dokumente.astro
git rm website/src/components/AdminWebsiteTabs.astro
git commit -m "feat(inhalte): replace 8 old admin pages with redirects, delete AdminWebsiteTabs"
```

---

## Self-Review Notes

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| New `/admin/inhalte` SPA | Task 12 |
| 4 primary tabs (Website, Newsletter, Fragebögen, Verträge) | Task 11 |
| 7 website section components | Tasks 5-9 |
| URL state `?tab=&section=` | Task 11 |
| DB-driven custom sections | Tasks 1, 2, 10 |
| `+ Abschnitt` dialog | Task 11 |
| Custom section delete | Task 10 |
| JSON mode for all save handlers | Task 3 |
| Sidebar update | Task 13 |
| Old pages → redirects | Task 14 |
| AdminWebsiteTabs.astro deleted | Task 14 |
| Rechnungen deferred to Phase 2 | ✓ (not included) |

**Type consistency check:** `CustomSection` used in Task 1 (definition), Tasks 2 (API), 10 (component), 11 (hub), 12 (page) — all use same import from `'../../../lib/website-db'`. `initialData.services` typed as `ServiceOverride[]` in Task 7 matches what `AngeboteSection` expects.

**Known issue:** `AngeboteSection.svelte` binds `svc.pageContent.sections` (typed as object array) to a textarea as a string. This follows the existing Astro page behavior. The value won't round-trip cleanly through JSON-to-string-to-JSON without explicit handling. Acceptable for Phase 1 as it mirrors current behavior.
