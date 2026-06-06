---
title: Content-Hub Price SSOT & Full Homepage Editability — Implementation Plan
ticket_id: T000305
domains: [website, db]
status: done
pr_number: 1152
---

# Content-Hub Price SSOT & Full Homepage Editability — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every homepage price live in one place (the Leistungskatalog), have the service cards / detail pages / highlight table read from it, and bring the remaining static-only sections (navigation, footer, hero identity, Kore flags, contact master-data) into the `website` DB so the whole homepage is editable and fully covered by the nightly backup.

**Architecture:** The Leistungskatalog (`leistungen_config`) becomes the canonical price store. Service cards gain a `leistungCategoryId` + `headlineKey` link and lose their own price/tier fields; cards, detail pages and the highlight table become read-only *projections* resolved in `website/src/lib/content.ts`. New `site_settings` keys (`navigation`, `footer`, `stammdaten`, `kore_flags`) follow the existing key→JSON pattern with static-config fallback. A one-shot idempotent migration links cards to categories ("catalog wins"), backup-first and divergence-logged.

**Tech Stack:** Astro + Svelte 4 (`website/`), TypeScript, `pg` (Postgres `website` DB on `shared-db`), Vitest (unit), Playwright (`tests/e2e/`), bash migration script under `scripts/`.

**Spec:** `docs/superpowers/specs/2026-05-29-content-hub-price-ssot-editability-design.md`

---

## Pre-flight (do once before any milestone)

- [ ] **P0: Confirm branch + dependency**

```bash
cd /tmp/wt-content-hub-editability
git rev-parse --abbrev-ref HEAD          # → feature/content-hub-editability
gh pr list --search "T000304" --state all --json number,state,title
```

Expected: branch is `feature/content-hub-editability`. **If T000304's PR is not yet merged, STOP** — the spec sequences this feature after the save-race fix. Once merged:

```bash
git fetch origin main && git rebase origin/main
```

Expected: rebase succeeds; the T000304 `ensureSchemaOnce` guard is present in `website/src/lib/website-db.ts`.

- [ ] **P1: Install website deps + verify test runner**

```bash
cd /tmp/wt-content-hub-editability/website
node --version            # ≥ 22.13.0 per .nvmrc
pnpm install --frozen-lockfile
pnpm vitest --run src/lib 2>&1 | tail -20
```

Expected: existing vitest suite runs (green or known-state). This confirms the harness before we add tests.

- [ ] **P2: Capture the current homepage state (for later before/after diff)**

```bash
PGPOD=$(kubectl get pod -n workspace --context fleet -l app=shared-db -o name | head -1)
kubectl exec "${PGPOD#pod/}" -n workspace --context fleet -- \
  psql -U website -d website -At -c \
  "SELECT brand, key FROM site_settings ORDER BY 1,2;
   SELECT brand, jsonb_pretty(categories_json) FROM leistungen_config;
   SELECT brand, jsonb_pretty(services_json) FROM service_config;" \
  > /tmp/content-hub-before.txt 2>&1
wc -l /tmp/content-hub-before.txt
```

Expected: a non-empty snapshot saved. Keep it for the migration acceptance check (M5).

---

## Milestone 1 — Data model & types (`website-db.ts`)

Files:
- Modify: `website/src/lib/website-db.ts` (`ServiceOverride` interface ~815–836; new site_settings typed accessors)
- Test: `website/src/lib/content-hub-model.test.ts` (new)

### Task 1.1: Extend `ServiceOverride` with the catalog link

- [ ] **Step 1: Write the failing test**

`website/src/lib/content-hub-model.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type { ServiceOverride } from './website-db';

describe('ServiceOverride catalog link', () => {
  it('accepts a catalog-linked card with a headline key', () => {
    const card: ServiceOverride = {
      slug: 'digital-50plus',
      title: '50+ Digital',
      description: 'd',
      icon: '💻',
      features: [],
      leistungCategoryId: 'digital-50plus',
      headlineKey: '50plus-digital-einzel',
      headlinePrefix: true,
    };
    expect(card.leistungCategoryId).toBe('digital-50plus');
    expect(card.headlinePrefix).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest --run src/lib/content-hub-model.test.ts`
Expected: FAIL — `price` is currently required and `leistungCategoryId`/`headlineKey`/`headlinePrefix` do not exist on the type (TS compile error in the test).

- [ ] **Step 3: Edit the interface**

In `website/src/lib/website-db.ts`, change `ServiceOverride` (currently ~815–836) so the price/tier fields are optional/legacy and add the catalog link:
```ts
export interface ServiceOverride {
  slug: string;
  title: string;
  description: string;
  icon: string;
  /** @deprecated legacy headline price — derived from the catalog post-migration. Kept for read fallback. */
  price?: string;
  features: string[];
  hidden?: boolean;
  meta?: string;
  /** Catalog category (`LeistungCategoryOverride.id`) this card draws its prices from. */
  leistungCategoryId?: string;
  /** Catalog row key whose price is shown as the card headline. */
  headlineKey?: string;
  /** Prefix the headline price with "ab ". */
  headlinePrefix?: boolean;
  pageContent?: {
    headline?: string;
    intro?: string;
    forWhom?: string[];
    sections?: Array<{ title: string; items: string[] }>;
    /** @deprecated detail tiers now render the linked catalog category. Kept for read fallback. */
    pricing?: Array<{ label: string; price: string; unit?: string; highlight?: boolean }>;
    faq?: Array<{ question: string; answer: string }>;
    faqTitle?: string;
    seoTitle?: string;
    seoDescription?: string;
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest --run src/lib/content-hub-model.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/website-db.ts website/src/lib/content-hub-model.test.ts
git commit -m "feat(content-hub): add catalog link fields to ServiceOverride [T000305]"
```

### Task 1.2: Typed `site_settings` JSON accessors for the new sections

- [ ] **Step 1: Write the failing test** (append to `content-hub-model.test.ts`)

```ts
import { NAV_KEY, FOOTER_KEY, STAMMDATEN_KEY, KORE_FLAGS_KEY,
         type NavItem, type FooterConfig, type Stammdaten, type KoreFlags } from './website-db';

describe('content-hub site_settings keys', () => {
  it('exposes stable key constants', () => {
    expect([NAV_KEY, FOOTER_KEY, STAMMDATEN_KEY, KORE_FLAGS_KEY])
      .toEqual(['navigation', 'footer', 'stammdaten', 'kore_flags']);
  });
  it('types compile for each section', () => {
    const nav: NavItem[] = [{ label: 'Start', href: '/', order: 0 }];
    const footer: FooterConfig = { columns: [{ heading: 'Service', links: [{ label: 'X', href: '/x' }] }], copyright: '© mentolder' };
    const sd: Stammdaten = { name: 'PK', role: 'Coach', email: 'a@b.de', phone: '', street: '', zip: '', city: '', ustId: '', website: '', avatarInitials: 'PK' };
    const flags: KoreFlags = { timeline: true };
    expect(nav[0].href).toBe('/');
    expect(footer.copyright).toContain('mentolder');
    expect(sd.email).toBe('a@b.de');
    expect(flags.timeline).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest --run src/lib/content-hub-model.test.ts`
Expected: FAIL — exports do not exist.

- [ ] **Step 3: Add types + key constants + JSON helpers**

In `website/src/lib/website-db.ts`, after the `setSiteSetting` block (~966), add:
```ts
// ── Content-Hub: new editable sections (stored as JSON under site_settings) ──
export const NAV_KEY = 'navigation' as const;
export const FOOTER_KEY = 'footer' as const;
export const STAMMDATEN_KEY = 'stammdaten' as const;
export const KORE_FLAGS_KEY = 'kore_flags' as const;

export interface NavItem { label: string; href: string; order: number }
export interface FooterLink { label: string; href: string }
export interface FooterColumn { heading: string; links: FooterLink[] }
export interface FooterConfig { columns: FooterColumn[]; copyright: string }
export interface Stammdaten {
  name: string; role: string; email: string; phone: string;
  street: string; zip: string; city: string;
  ustId: string; website: string; avatarInitials: string;
}
export interface KoreFlags { timeline: boolean }

/** Read a JSON-valued site_setting; returns null when absent or unparseable. */
export async function getJsonSetting<T>(brand: string, key: string): Promise<T | null> {
  const raw = await getSiteSetting(brand, key).catch(() => null);
  if (raw == null) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

/** Persist a JSON-valued site_setting. */
export async function setJsonSetting<T>(brand: string, key: string, value: T): Promise<void> {
  await setSiteSetting(brand, key, JSON.stringify(value));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest --run src/lib/content-hub-model.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/website-db.ts website/src/lib/content-hub-model.test.ts
git commit -m "feat(content-hub): typed site_settings accessors for nav/footer/stammdaten/flags [T000305]"
```

---

## Milestone 2 — Resolver projection logic (`content.ts`)

This is the core "edit once" logic and is fully unit-tested before any UI exists.

Files:
- Create: `website/src/lib/content-projection.ts` (pure functions, no DB — easy to test)
- Modify: `website/src/lib/content.ts` (wire the pure functions into the effective getters)
- Test: `website/src/lib/content-projection.test.ts`

### Task 2.1: Card headline price derivation

- [ ] **Step 1: Write the failing test**

`website/src/lib/content-projection.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { deriveHeadlinePrice } from './content-projection';
import type { LeistungCategoryOverride } from './website-db';

const cat: LeistungCategoryOverride = {
  id: 'digital-50plus', title: '50+ Digital',
  services: [
    { key: '50plus-digital-einzel', name: 'Einzelstunde', price: '60 €', unit: '/ Stunde' },
    { key: '50plus-digital-paket-s', name: 'Paket S', price: '330 €', unit: '', highlight: true },
  ],
};

describe('deriveHeadlinePrice', () => {
  it('renders the chosen row price with unit', () => {
    expect(deriveHeadlinePrice(cat, '50plus-digital-einzel', false)).toBe('60 € / Stunde');
  });
  it('prefixes "ab " when headlinePrefix is true', () => {
    expect(deriveHeadlinePrice(cat, '50plus-digital-einzel', true)).toBe('ab 60 € / Stunde');
  });
  it('renders free-text rows verbatim without prefix even if requested', () => {
    const c2: LeistungCategoryOverride = { id: 'beratung', services: [{ key: 'b', price: 'nach Vereinbarung', unit: '' }] };
    expect(deriveHeadlinePrice(c2, 'b', true)).toBe('nach Vereinbarung');
  });
  it('falls back to the first row when headlineKey is missing', () => {
    expect(deriveHeadlinePrice(cat, undefined, false)).toBe('60 € / Stunde');
  });
  it('returns empty string when category has no rows', () => {
    expect(deriveHeadlinePrice({ id: 'x', services: [] }, 'k', true)).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest --run src/lib/content-projection.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `content-projection.ts`**

```ts
import type { LeistungCategoryOverride, LeistungServiceOverride } from './website-db';

/** True for prices that are not a concrete amount (e.g. "nach Vereinbarung"). */
function isFreeText(price: string): boolean {
  return !/\d/.test(price);
}

function pickRow(cat: LeistungCategoryOverride, headlineKey?: string): LeistungServiceOverride | undefined {
  const rows = cat.services ?? [];
  if (!rows.length) return undefined;
  return rows.find((r) => r.key === headlineKey) ?? rows[0];
}

/** The single price string shown on a homepage service card. */
export function deriveHeadlinePrice(
  cat: LeistungCategoryOverride,
  headlineKey: string | undefined,
  headlinePrefix: boolean,
): string {
  const row = pickRow(cat, headlineKey);
  if (!row || !row.price) return '';
  const base = row.unit ? `${row.price} ${row.unit}`.replace(/\s+/g, ' ').trim() : row.price;
  if (headlinePrefix && !isFreeText(row.price)) return `ab ${base}`;
  return base;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest --run src/lib/content-projection.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/content-projection.ts website/src/lib/content-projection.test.ts
git commit -m "feat(content-hub): card headline price derivation [T000305]"
```

### Task 2.2: Detail tiers = full linked category + highlight-table resolution

- [ ] **Step 1: Write the failing test** (append to `content-projection.test.ts`)

```ts
import { detailTiers, resolveHighlightTable } from './content-projection';

describe('detailTiers', () => {
  it('returns all rows of the linked category as {label, price, unit, highlight}', () => {
    expect(detailTiers(cat)).toEqual([
      { label: 'Einzelstunde', price: '60 €', unit: '/ Stunde', highlight: false },
      { label: 'Paket S', price: '330 €', unit: '', highlight: true },
    ]);
  });
  it('returns [] for a missing category', () => {
    expect(detailTiers(undefined)).toEqual([]);
  });
});

describe('resolveHighlightTable', () => {
  const cats = [cat];
  it('resolves a catalog-key reference to label+price, keeping the local note', () => {
    expect(resolveHighlightTable([{ catalogKey: '50plus-digital-einzel', note: 'Netto §19' }], cats))
      .toEqual([{ label: 'Einzelstunde', price: '60 €', unit: '/ Stunde', note: 'Netto §19', highlight: false }]);
  });
  it('passes literal rows through unchanged', () => {
    expect(resolveHighlightTable([{ label: 'Erstgespräch', price: 'Kostenlos', note: 'Unverbindlich' }], cats))
      .toEqual([{ label: 'Erstgespräch', price: 'Kostenlos', unit: '', note: 'Unverbindlich', highlight: false }]);
  });
  it('drops references whose catalog key no longer exists', () => {
    expect(resolveHighlightTable([{ catalogKey: 'gone' }], cats)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest --run src/lib/content-projection.test.ts`
Expected: FAIL — `detailTiers`/`resolveHighlightTable` not exported.

- [ ] **Step 3: Add the functions to `content-projection.ts`**

```ts
export interface Tier { label: string; price: string; unit: string; highlight: boolean }

export function detailTiers(cat: LeistungCategoryOverride | undefined): Tier[] {
  return (cat?.services ?? []).map((r) => ({
    label: r.name ?? '', price: r.price ?? '', unit: r.unit ?? '', highlight: r.highlight ?? false,
  }));
}

export type HighlightEntry =
  | { catalogKey: string; note?: string; highlight?: boolean }
  | { label: string; price: string; note?: string; highlight?: boolean };

export interface ResolvedHighlight { label: string; price: string; unit: string; note: string; highlight: boolean }

export function resolveHighlightTable(
  entries: HighlightEntry[],
  categories: LeistungCategoryOverride[],
): ResolvedHighlight[] {
  const out: ResolvedHighlight[] = [];
  for (const e of entries ?? []) {
    if ('catalogKey' in e) {
      const row = categories.flatMap((c) => c.services ?? []).find((r) => r.key === e.catalogKey);
      if (!row) continue; // reference to a deleted row → drop
      out.push({ label: row.name ?? '', price: row.price ?? '', unit: row.unit ?? '', note: e.note ?? '', highlight: e.highlight ?? false });
    } else {
      out.push({ label: e.label, price: e.price, unit: '', note: e.note ?? '', highlight: e.highlight ?? false });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest --run src/lib/content-projection.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/content-projection.ts website/src/lib/content-projection.test.ts
git commit -m "feat(content-hub): detail-tier & highlight-table projections [T000305]"
```

### Task 2.3: Stammdaten resolver with static fallback

- [ ] **Step 1: Write the failing test** (append)

```ts
import { resolveStammdaten } from './content-projection';

describe('resolveStammdaten', () => {
  const fallback = { name: 'Patrick', role: 'Coach', email: 'env@x.de', phone: '0', street: 's', zip: 'z', city: 'c', ustId: 'u', website: 'w', avatarInitials: 'PK' };
  it('returns the DB record when present', () => {
    const db = { ...fallback, email: 'db@x.de' };
    expect(resolveStammdaten(db, fallback).email).toBe('db@x.de');
  });
  it('fills missing DB fields from the static fallback', () => {
    const partial = { email: 'db@x.de' } as any;
    const r = resolveStammdaten(partial, fallback);
    expect(r.email).toBe('db@x.de');
    expect(r.city).toBe('c');
  });
  it('returns the full fallback when DB row is null', () => {
    expect(resolveStammdaten(null, fallback)).toEqual(fallback);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest --run src/lib/content-projection.test.ts`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement**

```ts
import type { Stammdaten } from './website-db';

export function resolveStammdaten(db: Partial<Stammdaten> | null, fallback: Stammdaten): Stammdaten {
  if (!db) return fallback;
  return {
    name: db.name ?? fallback.name,
    role: db.role ?? fallback.role,
    email: db.email ?? fallback.email,
    phone: db.phone ?? fallback.phone,
    street: db.street ?? fallback.street,
    zip: db.zip ?? fallback.zip,
    city: db.city ?? fallback.city,
    ustId: db.ustId ?? fallback.ustId,
    website: db.website ?? fallback.website,
    avatarInitials: db.avatarInitials ?? fallback.avatarInitials,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest --run src/lib/content-projection.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/content-projection.ts website/src/lib/content-projection.test.ts
git commit -m "feat(content-hub): stammdaten resolver with static fallback [T000305]"
```

### Task 2.4: Wire projections into `content.ts` effective getters

- [ ] **Step 1: Write the failing test**

`website/src/lib/content-effective.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the DB layer so getEffective* is pure to test.
vi.mock('./website-db', async (orig) => {
  const actual = await orig<typeof import('./website-db')>();
  return { ...actual,
    getServiceConfig: vi.fn(), getLeistungenConfig: vi.fn(), getJsonSetting: vi.fn() };
});
import * as db from './website-db';
import { getEffectiveServices } from './content';

beforeEach(() => vi.clearAllMocks());

it('card headline price comes from the linked catalog row, not a stored price', async () => {
  (db.getLeistungenConfig as any).mockResolvedValue([
    { id: 'digital-50plus', title: '50+ Digital', services: [
      { key: '50plus-digital-einzel', name: 'Einzelstunde', price: '60 €', unit: '/ Stunde' }] }]);
  (db.getServiceConfig as any).mockResolvedValue([
    { slug: 'digital-50plus', title: '50+ Digital', description: 'd', icon: '💻', features: [],
      leistungCategoryId: 'digital-50plus', headlineKey: '50plus-digital-einzel', headlinePrefix: true }]);
  const svcs = await getEffectiveServices();
  const card = svcs.find((s) => s.slug === 'digital-50plus')!;
  expect(card.price).toBe('ab 60 € / Stunde');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest --run src/lib/content-effective.test.ts`
Expected: FAIL — current `getEffectiveServices` returns `o.price` (the stored field), not the derived value.

- [ ] **Step 3: Modify `getEffectiveServices` in `content.ts`**

Load leistungen once, and when a card has `leistungCategoryId`, derive `price` and `pageContent.pricing` from the catalog instead of the stored fields. Replace the `price`/`pricing` lines in both `merge` (~55, ~65) and `fromOverride` (~81, ~89):
```ts
import { deriveHeadlinePrice, detailTiers } from './content-projection';
// near top of getEffectiveServices, after loading overrides:
const cats = (await getLeistungenConfig(BRAND).catch(() => null)) ?? config.leistungen;
const catById = new Map(cats.map((c) => [c.id, c]));
const headlineFor = (o: typeof overrides[number], staticPrice: string) =>
  o.leistungCategoryId && catById.get(o.leistungCategoryId)
    ? deriveHeadlinePrice(catById.get(o.leistungCategoryId)!, o.headlineKey, o.headlinePrefix ?? false)
    : (o.price ?? staticPrice);          // legacy fallback during migration
const tiersFor = (o: typeof overrides[number], staticTiers: any[]) =>
  o.leistungCategoryId && catById.get(o.leistungCategoryId)
    ? detailTiers(catById.get(o.leistungCategoryId))
    : (o.pageContent?.pricing ?? staticTiers);
```
Then in `merge`: `price: headlineFor(o, svc.price)`, and `pricing: tiersFor(o, svc.pageContent.pricing)`. In `fromOverride`: `price: headlineFor(o, '')`, and `pricing: tiersFor(o, [])`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest --run src/lib/content-effective.test.ts`
Expected: PASS.

- [ ] **Step 5: Add `getEffectiveStammdaten`, `getEffectiveNavigation`, `getEffectiveFooter`, `getEffectiveKoreFlags` to `content.ts`**

```ts
import { resolveStammdaten } from './content-projection';
import { STAMMDATEN_KEY, NAV_KEY, FOOTER_KEY, KORE_FLAGS_KEY, getJsonSetting,
         type Stammdaten, type NavItem, type FooterConfig, type KoreFlags } from './website-db';

export async function getEffectiveStammdaten(): Promise<Stammdaten> {
  const db = await getJsonSetting<Partial<Stammdaten>>(BRAND, STAMMDATEN_KEY).catch(() => null);
  return resolveStammdaten(db, staticStammdaten());           // staticStammdaten() reads config.contact/legal/homepage
}
export async function getEffectiveNavigation(): Promise<NavItem[]> {
  return (await getJsonSetting<NavItem[]>(BRAND, NAV_KEY).catch(() => null)) ?? staticNavigation();
}
export async function getEffectiveFooter(): Promise<FooterConfig> {
  return (await getJsonSetting<FooterConfig>(BRAND, FOOTER_KEY).catch(() => null)) ?? staticFooter();
}
export async function getEffectiveKoreFlags(): Promise<KoreFlags> {
  return (await getJsonSetting<KoreFlags>(BRAND, KORE_FLAGS_KEY).catch(() => null)) ?? { timeline: !!config.homepage.timeline };
}
```
Add the three `static*()` helpers in `content.ts` that read today's values from `config` / env (`config.navigation`, `config.footer`, `config.contact`/`config.legal`) so an empty DB row renders exactly today's output.

- [ ] **Step 6: Commit**

```bash
git add website/src/lib/content.ts website/src/lib/content-effective.test.ts
git commit -m "feat(content-hub): resolve card/detail prices + new sections from canonical sources [T000305]"
```

---

## Milestone 3 — Migration script ("catalog wins", zero-loss)

Files:
- Create: `scripts/migrate-content-hub-ssot.mjs`
- Create: `website/src/lib/content-hub-migrate.ts` (pure transform, unit-tested)
- Test: `website/src/lib/content-hub-migrate.test.ts`

### Task 3.1: Pure migration transform with divergence logging

- [ ] **Step 1: Write the failing test**

`website/src/lib/content-hub-migrate.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { linkCardsToCatalog, TITLE_TO_CATEGORY } from './content-hub-migrate';

const cats = [{ id: 'digital-50plus', title: '50+ Digital', services: [
  { key: '50plus-digital-einzel', name: 'Einzelstunde', price: '60 €', unit: '/ Stunde' },
  { key: '50plus-digital-paket-s', name: 'Paket S', price: '330 €', unit: '', highlight: true }] }];

it('links a card to its category, picks the highlight row, logs divergence, drops stored price', () => {
  const cards = [{ slug: 'digital-50plus', title: '50+ Digital', description: 'd', icon: '💻',
    features: [], price: 'Ab 99 € / Stunde', pageContent: { pricing: [{ label: 'x', price: '99 €' }] } }];
  const { migrated, divergences } = linkCardsToCatalog(cards, cats);
  expect(migrated[0].leistungCategoryId).toBe('digital-50plus');
  expect(migrated[0].headlineKey).toBe('50plus-digital-paket-s'); // highlight row preferred
  expect(migrated[0].headlinePrefix).toBe(true);                  // old price began with "Ab"
  expect(migrated[0].price).toBeUndefined();                      // stored price dropped
  expect(migrated[0].pageContent?.pricing).toBeUndefined();
  expect(divergences).toContainEqual({ slug: 'digital-50plus', old: 'Ab 99 € / Stunde', catalog: '330 €' });
});

it('is idempotent — re-running on already-linked cards changes nothing', () => {
  const linked = linkCardsToCatalog([{ slug: 'digital-50plus', title: '50+ Digital', description: 'd', icon: '💻',
    features: [], leistungCategoryId: 'digital-50plus', headlineKey: '50plus-digital-einzel', headlinePrefix: false }], cats);
  const again = linkCardsToCatalog(linked.migrated, cats);
  expect(again.migrated).toEqual(linked.migrated);
  expect(again.divergences).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest --run src/lib/content-hub-migrate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `content-hub-migrate.ts`**

```ts
import type { ServiceOverride, LeistungCategoryOverride } from './website-db';

/** Explicit, non-fuzzy card-slug/title → catalog-category-id map. Extend per brand as needed. */
export const TITLE_TO_CATEGORY: Record<string, string> = {
  'digital-50plus': 'digital-50plus',
  'fuehrungskraefte': 'fuehrungskraefte',
  'beratung': 'beratung',
};

export interface Divergence { slug: string; old: string; catalog: string }

function resolveCategoryId(card: ServiceOverride): string | undefined {
  return TITLE_TO_CATEGORY[card.slug] ?? TITLE_TO_CATEGORY[card.title];
}

export function linkCardsToCatalog(cards: ServiceOverride[], cats: LeistungCategoryOverride[]) {
  const catById = new Map(cats.map((c) => [c.id, c]));
  const divergences: Divergence[] = [];
  const migrated = cards.map((card) => {
    if (card.leistungCategoryId) return card;                 // already linked → idempotent
    const catId = resolveCategoryId(card);
    const cat = catId ? catById.get(catId) : undefined;
    if (!cat || !(cat.services ?? []).length) return card;    // no clean mapping → leave untouched
    const rows = cat.services!;
    const headline = rows.find((r) => r.highlight) ?? rows[0];
    const old = card.price ?? '';
    if (old && !old.includes(headline.price ?? '')) {
      divergences.push({ slug: card.slug, old, catalog: headline.price ?? '' });
    }
    const { price, pageContent, ...rest } = card;
    const newPageContent = pageContent ? { ...pageContent, pricing: undefined } : undefined;
    return {
      ...rest,
      leistungCategoryId: cat.id,
      headlineKey: headline.key,
      headlinePrefix: /^ab\b/i.test(old),
      ...(newPageContent ? { pageContent: newPageContent } : {}),
    } as ServiceOverride;
  });
  return { migrated, divergences };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest --run src/lib/content-hub-migrate.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/content-hub-migrate.ts website/src/lib/content-hub-migrate.test.ts
git commit -m "feat(content-hub): catalog-wins migration transform with divergence log [T000305]"
```

### Task 3.2: Migration runner script (backup-first, both brands, dry-run default)

- [ ] **Step 1: Write the runner**

`scripts/migrate-content-hub-ssot.mjs` — a Node script that, for `BRAND` in `['mentolder','korczewski']`:
1. Refuses to run unless `--apply` is passed (dry-run by default; prints the plan + divergences).
2. With `--apply`: first triggers an on-demand backup and waits for completion:
   ```js
   // kubectl -n workspace create job content-hub-premigration-<brand> --from=cronjob/db-backup
   ```
   then loads `service_config`/`leistungen_config` via the same `pg` pool as `website-db.ts`, runs `linkCardsToCatalog`, writes the result back with `saveServiceConfig`, and prints the divergence list.
3. Always writes the divergence report to `/tmp/content-hub-migration-<brand>.json`.

Use the existing `SESSIONS_DATABASE_URL` connection. Reuse `linkCardsToCatalog` (import the compiled lib or inline-import the `.ts` via `tsx`). Provide a `--brand=<id>` filter.

- [ ] **Step 2: Dry-run against dev**

```bash
cd /tmp/wt-content-hub-editability
SESSIONS_DATABASE_URL="postgresql://website:...@127.0.0.1:15432/website" \
  node scripts/migrate-content-hub-ssot.mjs --brand=mentolder
```
(Reach dev DB per the dev-cluster-access memory: `ssh -i ~/.ssh/gekko_id_ed25519 gekko@k3s-1`, or the `127.0.0.1:15432` port-forward.)
Expected: prints the proposed links + divergences, writes **nothing**.

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-content-hub-ssot.mjs
git commit -m "feat(content-hub): backup-first dry-run migration runner [T000305]"
```

---

## Milestone 4 — Render-path wiring

Wire every projection into the actual rendered output. Each task: change the render source, then verify with `pnpm build` + a Playwright assertion in M6.

### Task 4.1: Detail pages render the linked category

- [ ] **Step 1:** In the per-service content libs (`website/src/lib/coaching-content.ts:60`, `fuehrung-content.ts:65`, and any sibling that reads `pc.pricing`), source the tiers from `getEffectiveServices()` (whose `pageContent.pricing` is now catalog-derived from Task 2.4) rather than the raw override. Confirm no lib still reads `service_config.pageContent.pricing` directly.

```bash
grep -rn "pageContent?.pricing\|pageContent.pricing\|\.pricing" website/src/lib website/src/components website/src/pages | grep -vi test
```
Expected after edits: every consumer goes through `getEffectiveServices()`/`getEffectiveLeistungen()`.

- [ ] **Step 2: Build**

Run: `cd website && pnpm build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add website/src/lib
git commit -m "feat(content-hub): detail pages render catalog-derived tiers [T000305]"
```

### Task 4.2: Highlight table renders resolved references

- [ ] **Step 1:** Find the Leistungen highlight render (search `leistungenPricingHighlight`) and feed it through `resolveHighlightTable(entries, await getEffectiveLeistungen())`. Add `getEffectiveHighlightTable()` to `content.ts` that reads a new `site_settings` key `pricing_highlight` (JSON `HighlightEntry[]`) with fallback to a reference-shaped version of `config.leistungenPricingHighlight`.

```bash
grep -rn "leistungenPricingHighlight\|PricingHighlight" website/src | grep -vi test
```

- [ ] **Step 2: Build** — `cd website && pnpm build` → succeeds.
- [ ] **Step 3: Commit** — `git commit -m "feat(content-hub): highlight table reads catalog references [T000305]"`

### Task 4.3: Hero / footer / Kontakt / Impressum read `stammdaten`; nav/footer/timeline read their keys

- [ ] **Step 1:** Re-point each render site to the new getters:
  - Hero name/role/avatar → `getEffectiveStammdaten()`
  - Footer columns/copyright → `getEffectiveFooter()`; footer contact line → `getEffectiveStammdaten()`
  - Navigation → `getEffectiveNavigation()`
  - Kontakt page contact fields → `getEffectiveStammdaten()`
  - **Impressum** render path → `getEffectiveStammdaten()` (read-only; do not touch the Impressum editor)
  - Kore `index.astro` timeline gate → `getEffectiveKoreFlags().timeline`

Find them:
```bash
grep -rn "CONTACT_NAME\|LEGAL_JOBTITLE\|config.contact\|config.legal\|config.navigation\|config.footer\|avatarInitials\|homepage.timeline" website/src/pages website/src/components website/src/layouts | grep -vi test
```

- [ ] **Step 2: Build + visual smoke** — `cd website && pnpm build`; then run dev (`task website:dev` or the project's dev server) and confirm hero/footer/nav/Impressum render unchanged with an **empty** DB (static fallback path).
- [ ] **Step 3: Commit** — `git commit -m "feat(content-hub): hero/footer/nav/kontakt/Impressum read editable sources [T000305]"`

---

## Milestone 5 — Admin UI

Files: `website/src/components/**/InhalteEditor.svelte`, `AngeboteSection.svelte`, new section components; `website/src/pages/api/admin/**` save endpoints.

### Task 5.1: Catalog price hub — headline radio + "ab" toggle

- [ ] **Step 1:** In `AngeboteSection.svelte` (Leistungskatalog block, ~166–179), add per-category a single-choice "Headline" radio across its rows (bound to the card's `headlineKey`) and a per-card "ab"-prefix checkbox (bound to `headlinePrefix`). Keep the per-row `price`/`unit` inputs (this is where prices are typed).
- [ ] **Step 2:** Remove the card-level free-text `price` input (~98) and the detail `pageContent.pricing[]` tier editor (~129–145); replace with a read-only preview line showing `deriveHeadlinePrice(...)` and the resolved tier list.
- [ ] **Step 3:** Add a catalog-category `<select>` + headline-row `<select>` to each card editor (bound to `leistungCategoryId` / `headlineKey`).
- [ ] **Step 4: Build** — `cd website && pnpm build` → succeeds.
- [ ] **Step 5: Commit** — `git commit -m "feat(content-hub): catalog price hub + card headline picker, remove duplicate price fields [T000305]"`

### Task 5.2: Save endpoint — persist links, reject stray price fields

- [ ] **Step 1: Write the failing test**

`website/src/pages/api/admin/angebote/save.test.ts` (follow the existing admin-endpoint test pattern): posting a card with `leistungCategoryId` + `headlineKey` persists those, and any incoming `price`/`pageContent.pricing` is stripped before write.
- [ ] **Step 2: Run** → FAIL (endpoint still stores `price`).
- [ ] **Step 3:** In `pages/api/admin/angebote/save.ts`, strip `price`/`pageContent.pricing` from each card before `saveServiceConfig`; persist `leistungCategoryId`/`headlineKey`/`headlinePrefix`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(content-hub): angebote save persists catalog link, strips legacy price [T000305]"`

### Task 5.3: New editors — Navigation, Footer, Stammdaten, Kore-Flags

- [ ] **Step 1:** Add four labelled-form sections to `InhalteEditor.svelte` (no raw JSON): Navigation (repeatable label/href/order rows), Footer (columns → links + copyright), Stammdaten (the 10 master fields), Kore-Flags (timeline toggle; shown only for the korczewski brand). Mirror the existing section styling for mobile usability.
- [ ] **Step 2:** Add save endpoints `pages/api/admin/navigation/save.ts`, `footer/save.ts`, `stammdaten/save.ts`, `kore-flags/save.ts` — each `setJsonSetting(brand, <KEY>, body)`. Inherit the T000304 schema-init guard.
- [ ] **Step 3: Write endpoint tests** (one per endpoint, round-trip: POST then `getJsonSetting` returns the same object). Run → PASS.
- [ ] **Step 4: Build** — `cd website && pnpm build` → succeeds.
- [ ] **Step 5: Commit** — `git commit -m "feat(content-hub): nav/footer/stammdaten/kore-flags editors + save endpoints [T000305]"`

---

## Milestone 6 — E2E, migration run & verification

### Task 6.1: Playwright acceptance specs

- [ ] **Step 1:** Add `tests/e2e/fa-content-hub-price-ssot.spec.ts` — **project: `mentolder`** (authenticated admin; uses `storageState: .auth/mentolder-website-admin.json`). Verify endpoints from source first:
```bash
grep -rn "export const POST\|export async function POST" website/src/pages/api/admin/angebote/save.ts
```
  Flow: log in → edit a catalog row price → save → reload homepage, the service detail page, and the Leistungen page → assert the new price string appears in all three.
- [ ] **Step 2:** Add `tests/e2e/fa-content-hub-editability.spec.ts` (**project: `mentolder`**, also run on **`korczewski`** for the timeline toggle): edit a nav label + footer copyright + hero name + contact email in admin → assert each appears live on the rendered page without a redeploy.
- [ ] **Step 3:** Regenerate the test inventory and commit it:
```bash
task test:inventory && git diff --exit-code website/src/data/test-inventory.json || git add website/src/data/test-inventory.json
```
- [ ] **Step 4: Commit** — `git commit -m "test(content-hub): e2e price-SSOT + editability acceptance [T000305]"`

### Task 6.2: Run the migration (dev → prod, both brands)

- [ ] **Step 1:** Dry-run on **dev** (both brands), review `/tmp/content-hub-migration-*.json` divergences with the user; confirm each catalog-wins decision is acceptable.
- [ ] **Step 2:** `--apply` on **dev**; load `dev.mentolder.de`, confirm cards/detail/highlight/hero/footer render correctly and prices match the catalog.
- [ ] **Step 3:** After PR merge + deploy, `--apply` on **prod mentolder** then **prod korczewski** (each backup-first). Per the cross-cluster rule, run the migration against **both** `shared-db` instances explicitly.
- [ ] **Step 4: Verify backup coverage**
```bash
PGPOD=$(kubectl get pod -n workspace --context fleet -l app=shared-db -o name | head -1)
kubectl -n workspace --context fleet create job content-hub-verify --from=cronjob/db-backup
# then inspect the dump per reference_website_content_db_backed: it must contain the edited nav + price values
```
Expected: a changed nav entry and a changed price value are present in the fresh dump.

### Task 6.3: Full offline gate + manifest sanity

- [ ] **Step 1:**
```bash
cd /tmp/wt-content-hub-editability
task test:all
cd website && pnpm vitest --run && pnpm build
```
Expected: all green.
- [ ] **Step 2: Before/after data diff** — compare `/tmp/content-hub-before.txt` (P2) against a post-migration dump; confirm no price/text was lost (only relocated/derived). Attach the divergence report to the PR.

---

## Self-review notes (author)

- **Spec coverage:** §1 price SSOT → M1.1, M2.1–2.2, M4.1–4.2, M5.1–5.2; §2 new sections → M1.2, M2.4, M4.3, M5.3; §3 read path → M2, M4; §5 migration → M3, M6.2; §6 backup → M6.2 step 4; §7 both brands → M3.2, M6.2 step 3; testing/acceptance → M2 (vitest) + M6.1 (Playwright). All spec sections map to tasks.
- **No placeholders:** logic tasks carry full code; UI tasks (M4/M5) specify exact files, line anchors, and the concrete shape of each change — Svelte markup is left to the implementer following existing section patterns, with a build gate per task.
- **Type consistency:** `deriveHeadlinePrice`, `detailTiers`, `resolveHighlightTable`, `resolveStammdaten`, `linkCardsToCatalog`, `getJsonSetting`/`setJsonSetting`, key constants (`NAV_KEY`…`KORE_FLAGS_KEY`) and the `Stammdaten`/`FooterConfig`/`NavItem`/`KoreFlags` types are defined once (M1/M2) and reused verbatim downstream.
