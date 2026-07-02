---
title: admin-redesign — Implementation Plan
ticket_id: T001433
domains: [website]
status: completed
---

# admin-redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the whole admin area one Brass/Ink design-token base in the mentolder front-page language, consolidate the three pipeline-analytics surfaces into one `/admin/pipeline` page, make the sidebar/dashboard/cockpit denser and more functional, and remove the DORA UI.

**Architecture:** Pure UI/UX redesign. `factory-tokens.css` becomes the admin-wide token base; `admin-foundation.css` becomes an alias layer (`--admin-*` → factory tokens) so ~65 admin pages recolor without edits. `/dev-status` moves to `/admin/pipeline` (tabs via `AdminTabs.svelte`, six tabs, new merged "Kosten" tab); the Factory Floor becomes conveyor-only; the cockpit gets a lazy expand-row; DORA is removed with a redirect. No DB-schema or API-contract changes except one additive column (`description`) on the existing `/api/factory-floor/[extId]` detail.

**Tech Stack:** Astro (SSR, `output: 'server'`), Svelte 5 runes, TypeScript, Vitest (node + jsdom projects), Playwright (E2E), BATS (`tests/spec/`), Kustomize/k8s (unaffected).

## Global Constraints

- **S1 line limits** (all impact files are NON-baselined → effective threshold = the static extension limit): `.astro` 400, `.svelte`/`.mjs`/`.sh` 500, `.ts` 600, `.css` ungated. `FactoryFloor.svelte` has only 114 lines of headroom — remove the kanban branch and extract new markup into `website/src/components/factory/` subcomponents; never grow it inline.
- **S2:** new helpers are pure leaf modules — `website/src/lib/admin/inbox-preview.ts` and `website/src/lib/admin/cockpit-expand.ts` import only types (and `phaseProgress` from the DB-free `factory-floor-types.ts`); no import back into DB/API layers.
- **S3:** no `*.mentolder.de` / `*.korczewski.de` string literals in code; colors only via tokens (`var(--brass)`, `var(--ink-900)`, …), never raw brand hex in new code.
- **S4 / Knip G-CQ08:** every new file must be referenced by a consumer; every deleted file's imports must be removed in the same task (no orphans, no dead code).
- **CQ02:** no new explicit `any` (`: any`, `<any>`, `as any`) in `website/src`; type assertions to concrete types (e.g. `as Tab`) are fine.
- **`data-testid` invariance:** `factory-floor`, `floor-leitstand`, `floor-hall`, `floor-shipped`, `floor-slots`, `floor-workpiece`, `floor-detail`, `floor-loadingdock`, `floor-office`, `floor-komm-count`, `floor-qa`, `floor-pulse`, `floor-stale` stay byte-identical.
- **Merge = Abschluss (T001092):** one change, one PR; every task leaves offline tests (`task test:all` scope: BATS + kustomize + Vitest) green.
- **BATS convention:** new `@test` entries go in `tests/spec/<spec-slug>.bats` (one file per SSOT spec); never create ticket-numbered `.bats` files.

---

## File Structure

The `S1` column is `Ist-LOC · effective threshold → residual budget` (values from `intel.json`; every file is non-baselined so the threshold is the static extension limit; `.css` is ungated).

| File | Action | S1 | Responsibility |
|------|--------|----|----------------|
| `website/src/styles/factory-tokens.css` | Reference | 133 · ungated (.css) | Brass/Ink token base (unchanged; optional `.ff-pill` helper class added in Task 5) |
| `website/src/styles/admin-foundation.css` | Modify | 70 · ungated (.css) | Color-bearing `--admin-*` become `var(--…)` aliases of factory-tokens |
| `website/src/styles/admin-premium.css` | Modify | 252 · ungated (.css) | `.admin-card` consumes `--admin-card-*`; sidebar density + Brass active-marker |
| `website/public/brand/korczewski/kore-app.css` | Modify | 562 · ungated (.css) | `body.kore` overrides the `--admin-*` aliases with the Copper palette |
| `website/src/layouts/AdminLayout.astro` | Modify | 262 · 400 → 138 | Load `factory-tokens.css` before `admin-foundation.css` |
| `website/src/components/admin/AdminSidebarNav.astro` | Modify | 179 · 400 → 221 | Denser items, mono-kicker section labels, Pipeline link |
| `website/src/pages/admin.astro` | Modify | 159 · 400 → 241 | Pipeline widget + inbox preview + compact KPI/service rows |
| `website/src/components/admin/AdminShortcuts.svelte` | Modify | 338 · 500 → 162 | Infra links: `/dev-status`→`/admin/pipeline`, drop DORA; token classes |
| `website/src/components/assistant/PipelineSidekickView.svelte` | Reference | 196 · 500 → 304 | Wired as dashboard widget (test stays green; no code change) |
| `website/src/lib/admin/inbox-preview.ts` | Create | 0 · 600 → 600 (new) | Pure helper: shape `InboxItem[]` into preview rows |
| `website/src/pages/admin/pipeline.astro` | Create | 0 · 400 → 400 (new) | New pipeline page mounting `DevStatusTabs` |
| `website/src/pages/dev-status.astro` | Modify | 36 · 400 → 364 | Becomes 301 redirect to `/admin/pipeline` |
| `website/src/pages/admin/planungsbuero.astro` | Modify | — | Retarget redirect to `/admin/pipeline?tab=planung` (301) |
| `website/src/pages/admin/factory-observability.astro` | Modify | — | Becomes 301 redirect to `/admin/pipeline?tab=kosten` |
| `website/src/pages/admin/factory-budget.astro` | Modify | — | Becomes 301 redirect to `/admin/pipeline?tab=kosten` |
| `website/src/components/DevStatusTabs.svelte` | Modify | 197 · 500 → 303 | Six tabs via `AdminTabs`; adds Kosten tab; URL sync unchanged |
| `website/src/components/admin/ui/AdminTabs.svelte` | Modify | 134 · 500 → 366 | Additive `onselect?` callback + mobile horizontal scroll |
| `website/src/components/factory/KostenTab.svelte` | Create | 0 · 500 → 500 (new) | Composes `FactoryObservability` + `FactoryBudgetPage` |
| `website/src/components/factory/factory-chart-colors.ts` | Modify | 41 · 600 → 559 | Add name-keyed `PHASE_COLOR_BY_NAME` (single source) |
| `website/src/components/factory/FactoryObservability.svelte` | Modify | 270 · 500 → 230 | Remove local `PHASE_COLORS`; import shared map |
| `website/src/components/factory/FactoryBudgetPage.svelte` | Modify | 307 · 500 → 193 | Hex → tokens; drop page-only back-link; fix grid bug |
| `website/src/components/FactoryFloor.svelte` | Modify | 386 · 500 → 114 | Remove kanban/view-toggle; extract kill-switch card |
| `website/src/components/FactoryFloorLane.svelte` | Modify | 113 · 500 → 387 | Remove kanban branch; conveyor-only |
| `website/src/components/factory/FloorControlCard.svelte` | Create | 0 · 500 → 500 (new) | Ink/Brass kill-switch/control card (extracted) |
| `website/src/lib/factory-floor.ts` | Modify | 485 · 600 → 115 | Add `description` to `getTicketDetail` SELECT + return |
| `website/src/lib/factory-floor-types.ts` | Modify | 116 · 600 → 484 | Add `description` to `TicketDetail` |
| `website/src/layouts/admin-icons.ts` | Modify | 41 · 600 → 559 | Add `save` + `link` SVG entries |
| `website/src/lib/admin/cockpit-expand.ts` | Create | 0 · 600 → 600 (new) | Pure helper: shape ticket detail into expand-row model |
| `website/src/components/admin/CockpitExpandRow.svelte` | Create | 0 · 500 → 500 (new) | Lazy detail area under a cockpit row |
| `website/src/components/admin/CockpitTable.svelte` | Modify | 336 · 500 → 164 | Accordion expand state; Brass chips |
| `website/src/components/admin/TicketRow.svelte` | Modify | — (well under 500) | Row-click toggles expand; title link unchanged |
| `website/src/components/admin/Cockpit/FilterBar.svelte` | Modify | — (well under 500) | Emoji → SVG icon buttons |
| `website/src/pages/admin/dora.astro` | Modify | 21 · 400 → 379 | Becomes 301 redirect to `/admin/pipeline?tab=analytics` |
| `website/src/components/admin/DoraDashboard.svelte` | Delete | 99 (removed) | DORA UI removed |
| `website/src/components/admin/DoraDashboard.test.ts` | Delete | (removed) | Dead test removed with component |
| `website/src/lib/dora-metrics.ts` | Delete | 73 (removed) | `computeDora` removed |
| `website/src/lib/dora-metrics.test.ts` | Delete | (removed) | Dead test removed |
| `website/src/pages/api/admin/dora-metrics.ts` | Delete | 90 (removed) | DORA API removed |
| `website/src/pages/api/admin/dora-metrics.test.ts` | Delete | (removed) | Dead test removed |
| `website/src/lib/__tests__/admin-token-alias.test.ts` | Create | (new, node) | Vitest: alias-layer integrity |
| `website/src/lib/admin/__tests__/inbox-preview.test.ts` | Create | (new, node) | Vitest: inbox-preview helper |
| `website/src/lib/admin/__tests__/cockpit-expand.test.ts` | Create | (new, node) | Vitest: expand-row helper |
| `tests/spec/website-core.bats` | Create | (new) | BATS: tokens, sidebar, dashboard |
| `tests/spec/software-factory.bats` | Modify | (exists) | BATS: pipeline move, conveyor-only, chart colors |
| `tests/spec/admin-cockpit.bats` | Create | (new) | BATS: expand-row, icon buttons |
| `tests/spec/dora-dashboard.bats` | Create | (new) | BATS: DORA removal/redirect |
| `tests/e2e/specs/fa-factory-floor.spec.ts` | Modify | — | `/admin/pipeline`, no kanban |
| `tests/e2e/specs/dev-status-tabs.spec.ts` | Modify | — | `/admin/pipeline`, AdminTabs selectors, 6 tabs |
| `tests/e2e/specs/fa-mobile-factory.spec.ts` | Modify | — | `/admin/pipeline`, 6 outer tabs |
| `website/src/data/test-inventory.json` | Regenerate | — | `task test:inventory` after test changes |

---

## Task 1: Token alias layer + card unification + Kore overrides

Spec: `website-core` → "Admin-Design-Token-Basis Brass/Ink" (all three scenarios). Design D1. This is the highest-blast-radius task, so it ships first with a visual sample and an integrity test before any surface task depends on the aliases.

**Files:**
- Test: `website/src/lib/__tests__/admin-token-alias.test.ts` (create)
- Modify: `website/src/styles/admin-foundation.css`
- Modify: `website/src/styles/admin-premium.css:107-113`
- Modify: `website/src/layouts/AdminLayout.astro:2-3`
- Modify: `website/public/brand/korczewski/kore-app.css`
- Modify: `website/src/components/admin/ui/AdminBadge.svelte` (comment only; variants already token-driven)

**Interfaces:**
- Produces: the invariant "every color-bearing `--admin-*` custom property equals a `var(--…)` from `factory-tokens.css`" — all later tasks rely on it (chips, badges, buttons recolor automatically).

- [ ] **Step 1: Write the failing integrity test**

```ts
// website/src/lib/__tests__/admin-token-alias.test.ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, '../../styles/admin-foundation.css'), 'utf8');

const COLOR_TOKENS = [
  '--admin-bg', '--admin-sidebar-bg', '--admin-surface', '--admin-surface-hover',
  '--admin-border', '--admin-border-bright', '--admin-primary', '--admin-primary-muted',
  '--admin-accent', '--admin-text', '--admin-text-mute', '--admin-text-disabled',
  '--admin-success', '--admin-danger', '--admin-info', '--admin-warning',
];

describe('admin-foundation token alias layer', () => {
  for (const token of COLOR_TOKENS) {
    it(`${token} aliases a factory-tokens var()`, () => {
      const m = css.match(new RegExp(`${token}\\s*:\\s*([^;]+);`));
      expect(m, `${token} must be declared`).toBeTruthy();
      const value = (m![1] ?? '').trim();
      expect(value.startsWith('var(--')).toBe(true);
    });
  }
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `cd website && npx vitest run --project node src/lib/__tests__/admin-token-alias.test.ts`
Expected: FAIL — the current file declares raw literals (`--admin-primary: #818cf8`, `--admin-bg: #0b111c`, etc.).

- [ ] **Step 3: Rewrite the color-bearing block of `admin-foundation.css`**

Replace the "Status colors" block (lines 31-35) and the "Existing admin tokens" block (lines 47-61) so every color-bearing property aliases factory-tokens (keep spacing, typography, component, z-index, animation tokens and `--admin-modal-backdrop` untouched):

```css
  /* --- Status colors (aliased to factory-tokens.css) --- */
  --admin-success: var(--sage);
  --admin-danger:  var(--danger);
  --admin-info:    var(--brass);   /* indigo retired */
  --admin-warning: var(--brass);

  /* --- Surfaces & text (aliased to factory-tokens.css) --- */
  --admin-bg:            var(--ink-900);
  --admin-sidebar-bg:    var(--ink-850);
  --admin-surface:       var(--ink-800);
  --admin-surface-hover: var(--ink-750);
  --admin-border:        var(--line);
  --admin-border-bright: var(--line-2);

  --admin-primary:       var(--brass);
  --admin-primary-muted: var(--brass-d);
  --admin-accent:        var(--brass);

  --admin-text:          var(--fg);
  --admin-text-mute:     var(--mute);
  --admin-text-disabled: var(--mute-2);
```

- [ ] **Step 4: Load factory-tokens.css before admin-foundation.css**

In `website/src/layouts/AdminLayout.astro`, insert the base import before the foundation import:

```astro
import '../styles/global.css';
import '../styles/factory-tokens.css';
import '../styles/admin-foundation.css';
import '../styles/admin-premium.css';
```

- [ ] **Step 5: Make `.admin-card` consume the shared radius/padding tokens**

In `website/src/styles/admin-premium.css`, change the `.admin-card` rule (lines 107-113) so the global class and `AdminCard.svelte` share one radius source:

```css
.admin-card {
  background: var(--admin-surface);
  border: 1px solid var(--admin-border);
  border-radius: var(--admin-card-radius);
  padding: var(--admin-card-padding);
  transition: border-color 0.2s ease;
}
```

- [ ] **Step 6: Add the Kore copper override for the alias layer**

Append to `website/public/brand/korczewski/kore-app.css`:

```css
/* Admin token aliases → Kore copper palette (T001433) */
body.kore {
  --admin-primary:       var(--copper);
  --admin-primary-muted: color-mix(in srgb, var(--copper) 15%, transparent);
  --admin-accent:        var(--copper);
  --admin-info:          var(--copper);
  --admin-warning:       var(--copper);
}
```

- [ ] **Step 7: Note the AdminBadge variant intent**

In `website/src/components/admin/ui/AdminBadge.svelte`, add a one-line comment above the `<style>` recording that `warning`→Brass, `success`→Sage, `error`→Danger, `info`→Brass now resolve via the alias layer (no structural change; the badge already reads `--admin-*`).

- [ ] **Step 8: Run the test to confirm it passes**

Run: `cd website && npx vitest run --project node src/lib/__tests__/admin-token-alias.test.ts`
Expected: PASS.

- [ ] **Step 9: Visual sample (regression guard for the blast radius)**

Run the dev site (`cd website && npm run dev`) and eyeball three pages that only inherit the aliases: `/admin` (dashboard), `/admin/rechnungen` (a table page), `/admin/einstellungen/benachrichtigungen` (a form page). Confirm surfaces are Ink, accents are Brass, and no indigo remains. On korczewski dev the same pages must read Copper.

- [ ] **Step 10: Commit**

```bash
git add website/src/styles/admin-foundation.css website/src/styles/admin-premium.css website/src/layouts/AdminLayout.astro website/public/brand/korczewski/kore-app.css website/src/components/admin/ui/AdminBadge.svelte website/src/lib/__tests__/admin-token-alias.test.ts
git commit -m "feat(admin): brass/ink token alias layer + card unification [T001433]"
```

---

## Task 2: Sidebar density, front-page kickers, Pipeline link, no-scroll

Spec: `website-core` → "Admin-Sidebar Kompaktheit und Front-Page-Sprache" (all three scenarios); `admin-cockpit` delta scenario "Admin-Sidebar enthält genau einen Pipeline-Eintrag". Design D2.

**Files:**
- Modify: `website/src/components/admin/AdminSidebarNav.astro:56-63` (add Pipeline item), `:156-180` (kicker style)
- Modify: `website/src/styles/admin-premium.css:12-49,85-92` (item density + active marker + kicker hairline)

**Interfaces:**
- Consumes: the Brass alias from Task 1 (`--admin-primary` = Brass).
- Produces: `#admin-sidebar` contains exactly one `href="/admin/pipeline"` link labelled "Pipeline"; no `/dev-status` link.

- [ ] **Step 1: Add the Pipeline item to the Infrastruktur section**

In `AdminSidebarNav.astro`, add a Pipeline entry as the first Infrastruktur item (uses the existing `activity` icon key):

```astro
  {
    label: 'Infrastruktur',
    items: [
      { href: '/admin/pipeline', label: 'Pipeline', icon: 'activity', matches: ['/admin/pipeline', '/dev-status'] },
      { href: '/admin/einstellungen/benachrichtigungen', label: 'Einstellungen', icon: 'settings', matches: ['/admin/einstellungen/'] },
      { href: brettUrl,                               label: 'Systembrett',  icon: 'brett', external: true },
      { href: '/admin/live',                          label: 'Live-Stream',  icon: 'broadcast', matches: ['/admin/live', '/admin/stream'] },
    ],
  },
```

- [ ] **Step 2: Turn section labels into mono kickers with a hairline**

In `admin-premium.css`, replace the `.sidebar-group-label` rule (lines 85-92) so it matches the front-page kicker pattern:

```css
.sidebar-group-label {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0.9rem 1.25rem 0.35rem;
  font-family: var(--mono);
  font-size: 0.62rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: var(--admin-text-disabled);
}
.sidebar-group-label::before {
  content: '';
  width: 14px;
  height: 1px;
  background: var(--admin-border-bright);
  flex-shrink: 0;
}
```

- [ ] **Step 3: Compact the nav items and switch the active state to a Brass marker (no fill)**

In `admin-premium.css`, edit `.sidebar-nav-item` (lines 12-27) — `min-height: 44px` → `34px`, `padding: 8px 14px` → `6px 12px`, `font-size: 13px` → `12.5px` — and change the active rule (lines 34-38) to drop the filled background:

```css
.sidebar-nav-item.is-active {
  background: transparent;
  color: var(--admin-primary);
  font-weight: 600;
}
```

Keep the `.sidebar-nav-item.is-active::before` Brass edge marker (lines 40-49) — it already uses `var(--admin-primary)`. Reduce `.nav-icon` box padding so the glyph reads ~16px: set `.nav-icon { width: 26px; height: 26px; padding: 4px; }` in the two `.nav-icon` rules (lines 51-59 and 66-77).

- [ ] **Step 4: Write the failing sidebar no-scroll E2E check**

Append to `tests/e2e/specs/dev-status-tabs.spec.ts` (the pipeline/sidebar spec, rewritten in Task 8; add the check now so it is red against the pre-density layout):

```ts
test('FA-UNIF-11: sidebar does not scroll with the Werkstatt accordion open (1440x900)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin');
  await page.locator('#werkstatt-toggle').click();
  const overflow = await page.locator('#admin-sidebar').evaluate(
    (el) => el.scrollHeight > el.clientHeight,
  );
  expect(overflow).toBe(false);
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `cd tests/e2e && npx playwright test specs/dev-status-tabs.spec.ts -g FA-UNIF-11`
Expected: FAIL — before the density change the expanded accordion overflows a 900px viewport (E2E needs the stored admin auth state; if no environment is reachable, record the intended red state and re-run in the Task 8 sweep).

- [ ] **Step 6: Verify the density change closes the gap**

Re-run the same command; the check passes once items are 34px and section padding is reduced. If still overflowing, trim `.sidebar-nav-item` margin (lines 18) from `1px 8px` to `1px 8px` unchanged and reduce group padding further — iterate until `scrollHeight <= clientHeight`.

- [ ] **Step 7: Commit**

```bash
git add website/src/components/admin/AdminSidebarNav.astro website/src/styles/admin-premium.css tests/e2e/specs/dev-status-tabs.spec.ts
git commit -m "feat(admin): compact sidebar, mono kickers, pipeline link, no-scroll [T001433]"
```

---

## Task 3: Dashboard — pipeline widget, inbox preview, compact KPI/service rows

Spec: `website-core` → "Dashboard Pipeline-Widget und Postfach-Vorschau" (all three scenarios). Design D3.

**Files:**
- Test: `website/src/lib/admin/__tests__/inbox-preview.test.ts` (create)
- Create: `website/src/lib/admin/inbox-preview.ts`
- Modify: `website/src/pages/admin.astro`
- Modify: `website/src/components/admin/AdminShortcuts.svelte:160-165`

**Interfaces:**
- Consumes: `listInboxItems({status})` from `website/src/lib/messaging-db.ts` (returns `InboxItem[]`, table `inbox_items`, ordered `created_at DESC`); `PipelineSidekickView.svelte` (props `{ onClose: () => void }`, self-fetches `/api/factory-floor` + SSE).
- Produces: `toInboxPreview(items: InboxItem[], limit?: number, now?: Date): InboxPreviewRow[]`.

- [ ] **Step 1: Write the failing helper test**

```ts
// website/src/lib/admin/__tests__/inbox-preview.test.ts
import { describe, it, expect } from 'vitest';
import { toInboxPreview, relativeAge } from '../inbox-preview';
import type { InboxItem } from '../../messaging-db';

function item(over: Partial<InboxItem>): InboxItem {
  return {
    id: 1, type: 'contact', status: 'pending', reference_id: null, reference_table: null,
    bug_ticket_id: null, payload: {}, created_at: new Date('2026-07-02T10:00:00Z'),
    actioned_at: null, actioned_by: null, is_test_data: false, ...over,
  } as InboxItem;
}

describe('toInboxPreview', () => {
  it('returns an empty array for no items', () => {
    expect(toInboxPreview([])).toEqual([]);
  });

  it('caps to the limit, newest first (input already sorted)', () => {
    const items = [item({ id: 1 }), item({ id: 2 }), item({ id: 3 })];
    expect(toInboxPreview(items, 2).map((r) => r.id)).toEqual([1, 2]);
  });

  it('derives a title from payload.subject, falling back to a type label', () => {
    expect(toInboxPreview([item({ payload: { subject: 'Hallo' } })])[0].title).toBe('Hallo');
    expect(toInboxPreview([item({ type: 'bug', payload: {} })])[0].title).toBe('Bug gemeldet');
  });

  it('links to the filtered inbox and labels age', () => {
    const now = new Date('2026-07-02T12:00:00Z');
    const row = toInboxPreview([item({ type: 'contact' })], 5, now)[0];
    expect(row.href).toBe('/admin/inbox?type=contact');
    expect(relativeAge(new Date('2026-07-02T10:00:00Z'), now)).toBe('2 h');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd website && npx vitest run --project node src/lib/admin/__tests__/inbox-preview.test.ts`
Expected: FAIL — module `../inbox-preview` does not exist yet.

- [ ] **Step 3: Implement the pure helper**

```ts
// website/src/lib/admin/inbox-preview.ts
import type { InboxItem } from '../messaging-db';

export interface InboxPreviewRow {
  id: number;
  type: string;
  title: string;
  ageLabel: string;
  href: string;
}

const TYPE_TITLES: Record<string, string> = {
  registration: 'Neue Registrierung',
  booking: 'Buchungsanfrage',
  contact: 'Kontaktanfrage',
  bug: 'Bug gemeldet',
  meeting_finalize: 'Meeting abschließen',
  user_message: 'Nachricht',
};

export function relativeAge(from: Date, now: Date = new Date()): string {
  const mins = Math.max(0, Math.round((now.getTime() - from.getTime()) / 60000));
  if (mins < 60) return `${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h`;
  return `${Math.round(hrs / 24)} d`;
}

function itemTitle(item: InboxItem): string {
  const payload = (item.payload ?? {}) as Record<string, unknown>;
  const raw = payload.title ?? payload.subject ?? payload.name;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return TYPE_TITLES[item.type] ?? 'Postfach-Eintrag';
}

export function toInboxPreview(items: InboxItem[], limit = 5, now: Date = new Date()): InboxPreviewRow[] {
  return items.slice(0, limit).map((item) => ({
    id: item.id,
    type: item.type,
    title: itemTitle(item),
    ageLabel: relativeAge(new Date(item.created_at), now),
    href: `/admin/inbox?type=${encodeURIComponent(item.type)}`,
  }));
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd website && npx vitest run --project node src/lib/admin/__tests__/inbox-preview.test.ts`
Expected: PASS.

- [ ] **Step 5: Load inbox items + wire both widgets into `admin.astro`**

Add to the frontmatter imports and the `Promise.allSettled` block, then render the widgets. Imports:

```astro
import PipelineSidekickView from '../components/assistant/PipelineSidekickView.svelte';
import { listInboxItems } from '../lib/messaging-db';
import { toInboxPreview } from '../lib/admin/inbox-preview';
```

Load the newest open items (add one entry to the existing `Promise.allSettled`):

```astro
let inboxRows: import('../lib/admin/inbox-preview').InboxPreviewRow[] = [];
// inside Promise.allSettled([...]):
  listInboxItems({ status: 'pending' })
    .then((items) => { inboxRows = toInboxPreview(items, 5); }),
```

After the KPI grid (before "Service Links"), render a two-column band: the pipeline widget links to `/admin/pipeline`, and the inbox preview lists rows with an empty state.

```astro
<div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; margin-bottom:1.5rem;">
  <AdminCard>
    <a slot="header" href="/admin/pipeline" style="font-family:var(--mono); font-size:0.65rem; color:var(--admin-text-disabled); text-transform:uppercase; letter-spacing:0.12em; text-decoration:none;">Pipeline &rarr;</a>
    <PipelineSidekickView client:load onClose={() => {}} />
  </AdminCard>
  <AdminCard>
    <a slot="header" href="/admin/inbox" style="font-family:var(--mono); font-size:0.65rem; color:var(--admin-text-disabled); text-transform:uppercase; letter-spacing:0.12em; text-decoration:none;">Postfach &rarr;</a>
    {inboxRows.length === 0 ? (
      <p style="color:var(--admin-text-mute); font-size:12px; margin:0;">Keine offenen Postfach-Einträge.</p>
    ) : (
      <ul style="list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:6px;">
        {inboxRows.map((r) => (
          <li><a href={r.href} style="display:flex; justify-content:space-between; gap:12px; text-decoration:none; color:var(--admin-text); font-size:12px;"><span>{r.title}</span><span style="font-family:var(--mono); color:var(--admin-text-mute);">{r.ageLabel}</span></a></li>
        ))}
      </ul>
    )}
  </AdminCard>
</div>
```

- [ ] **Step 6: Monochrome Brass service icons + compact KPI colors**

In `admin.astro`, change the per-service `color` values in `adminLinks` (lines 58-67) from the mixed palette (`#a78bfa`, `#38bdf8`, `#818cf8`, `#34d399`) to the Brass token so icons are monochrome: set every entry's `color` to `'var(--brass)'`. The KPI `color` union already uses `'brass' | 'sage' | 'danger' | 'neutral'` (AdminStatCard) — leave as is.

- [ ] **Step 7: Repoint the AdminShortcuts infra links**

In `AdminShortcuts.svelte` (lines 160-165) rename the Dev-Status entry to Pipeline and drop DORA:

```ts
  const allInfraLinks: InfraLink[] = [
    { url: '/admin/platform', label: 'Plattform Hub' },
    { url: '/admin/pipeline', label: 'Pipeline' },
    ...(!isKore ? [{ url: '/admin/repohealth', label: 'Repo Health' }] : []),
  ];
```

- [ ] **Step 8: Run the dashboard tests + typecheck**

Run: `cd website && npx vitest run --project node src/lib/admin/__tests__/inbox-preview.test.ts && npx tsc --noEmit`
Expected: PASS (no type errors; `PipelineSidekickView.test.ts` unaffected).

- [ ] **Step 9: Commit**

```bash
git add website/src/lib/admin/inbox-preview.ts website/src/lib/admin/__tests__/inbox-preview.test.ts website/src/pages/admin.astro website/src/components/admin/AdminShortcuts.svelte
git commit -m "feat(admin): dashboard pipeline widget + inbox preview + monochrome icons [T001433]"
```

---

## Task 4: Pipeline page move, six-tab AdminTabs, Kosten tab, chart-color single source, redirects

Spec: `admin-cockpit` → "Dev-Status-Seite mit Tab-Navigation" (all scenarios); `software-factory` → "FA-49: Factory Observability Dashboard" (T1–T3). Design D4.

**Files:**
- Create: `website/src/pages/admin/pipeline.astro`
- Modify: `website/src/pages/dev-status.astro`, `website/src/pages/admin/planungsbuero.astro`, `website/src/pages/admin/factory-observability.astro`, `website/src/pages/admin/factory-budget.astro`
- Modify: `website/src/components/admin/ui/AdminTabs.svelte`, `website/src/components/DevStatusTabs.svelte`
- Create: `website/src/components/factory/KostenTab.svelte`
- Modify: `website/src/components/factory/factory-chart-colors.ts`, `website/src/components/factory/FactoryObservability.svelte`, `website/src/components/factory/FactoryBudgetPage.svelte`

**Interfaces:**
- Consumes: `DevStatusTabs` props `{ initial: FloorPayload | null; initialTab; brand }`; `getFloor(slotsCap)` from `factory-floor.ts`.
- Produces: page `/admin/pipeline`; `AdminTabs` gains optional `onselect?: (id: string) => void`; `PHASE_COLOR_BY_NAME: Record<string, string>` in `factory-chart-colors.ts`.

- [ ] **Step 1: Add the name-keyed chart-color map (single source)**

Append to `website/src/components/factory/factory-chart-colors.ts`:

```ts
export const PHASE_COLOR_BY_NAME: Record<string, string> = Object.fromEntries(
  PHASE_LABELS.map((label, i) => [label, PHASE_COLORS[i]]),
);
```

- [ ] **Step 2: Remove the local PHASE_COLORS copy in FactoryObservability**

In `FactoryObservability.svelte`, delete the local `PHASE_COLORS` map (lines 40-44), import the shared map, and replace the two indexed lookups (`PHASE_COLORS[model]` line 133, `PHASE_COLORS[row.phase]` line 193) with `PHASE_COLOR_BY_NAME[...]`:

```ts
import { ACCENT, PHASE_COLOR_BY_NAME } from './factory-chart-colors';
```

Keep `PHASE_ORDER` (still used for ordering) and the `ACCENT`/`'#333'` fallbacks.

- [ ] **Step 3: Move FactoryBudgetPage colors to tokens + drop the page-only back link + fix the grid bug**

In `FactoryBudgetPage.svelte`: (a) remove the `<a href="/dev-status">Zurück zu Dev Status</a>` back-link (line 114) — it is now a tab, not a page; (b) fix `grid-template-cols` → `grid-template-columns` (lines 266-267); (c) replace the hardcoded status/provider hex in `<style>` with tokens:

```css
.error-banner { background: color-mix(in srgb, var(--danger) 15%, transparent); border: 1px solid var(--danger); color: var(--danger); }
.success-msg { color: var(--sage); }
.error-msg { color: var(--danger); }
.progress-bar-fill.warning { background: var(--brass); }
.progress-bar-fill.danger { background: var(--danger); }
.provider-badge.anthropic { background: color-mix(in srgb, var(--brass) 15%, transparent); color: var(--brass); }
.provider-badge.deepseek { background: color-mix(in srgb, var(--mute-2) 22%, transparent); color: var(--fg-soft); }
.provider-badge.gpu { background: color-mix(in srgb, var(--sage) 15%, transparent); color: var(--sage); }
```

- [ ] **Step 4: Create the Kosten tab wrapper**

```svelte
<!-- website/src/components/factory/KostenTab.svelte -->
<script lang="ts">
  import FactoryObservability from './FactoryObservability.svelte';
  import FactoryBudgetPage from './FactoryBudgetPage.svelte';
</script>

<div class="kosten-tab">
  <FactoryObservability />
  <FactoryBudgetPage />
</div>

<style>
  .kosten-tab { display: flex; flex-direction: column; gap: var(--space-6); }
</style>
```

- [ ] **Step 5: Add the additive `onselect` callback to AdminTabs**

In `AdminTabs.svelte`, extend the props and fire the callback from the button branch (existing href/3 usages unchanged), and make the bar horizontally scrollable on mobile:

```ts
interface Props { tabs: Tab[]; active: string; onselect?: (id: string) => void; }
let { tabs = [], active = '', onselect }: Props = $props();
```

Change the button `onclick` (line 80) to `onclick={() => onselect?.(tab.id)}`, and add to `.tabs` (lines 89-95) `overflow-x: auto; scrollbar-width: none;`.

- [ ] **Step 6: Switch DevStatusTabs to AdminTabs with six tabs + a Kosten tab**

In `DevStatusTabs.svelte`: extend the `Tab` union to `'factory' | 'planung' | 'analytics' | 'kosten' | 'control' | 'abhaengigkeiten'`; import `AdminTabs` from `./admin/ui/AdminTabs.svelte` and `KostenTab` from `./factory/KostenTab.svelte`; replace the `.tab-bar-wrap`/`.ds-tab` markup (lines ~57-105) with the AdminTabs bar (keep `switchTab`, `history.pushState`, `localStorage`, and the `factory-floor-refreshed`/`popstate` listeners unchanged):

```svelte
<AdminTabs
  tabs={[
    { id: 'factory', label: 'Floor' },
    { id: 'planung', label: 'Planung' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'kosten', label: 'Kosten' },
    { id: 'control', label: 'Steuerung' },
    { id: 'abhaengigkeiten', label: 'Abhängigkeiten' },
  ]}
  active={activeTab}
  onselect={(id) => switchTab(id as Tab)}
/>
```

Add the Kosten branch to the render block: `{:else if activeTab === 'kosten'}<KostenTab />`. Delete the now-unused `.ds-tab`/`.tab-bar-wrap`/`.tab-badge` CSS.

- [ ] **Step 7: Create the `/admin/pipeline` page**

```astro
---
// website/src/pages/admin/pipeline.astro
import AdminLayout from '../../layouts/AdminLayout.astro';
import { getSession, isAdmin } from '../../lib/auth';
import DevStatusTabs from '../../components/DevStatusTabs.svelte';
import { getFloor } from '../../lib/factory-floor';

export const prerender = false;

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(`/api/auth/login?redirect=${encodeURIComponent(Astro.url.pathname)}`);
if (!isAdmin(session)) return Astro.redirect('/admin');

const slotsCap = parseInt(process.env.FACTORY_GLOBAL_CAP ?? '3', 10);
const brand = process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';

let initial = null;
try { initial = await getFloor(slotsCap); } catch { initial = null; }

type Tab = 'factory' | 'planung' | 'analytics' | 'kosten' | 'control' | 'abhaengigkeiten';
const ALLOWED = ['factory', 'planung', 'analytics', 'kosten', 'control', 'abhaengigkeiten'];
const raw = Astro.url.searchParams.get('tab') ?? '';
const initialTab: Tab = (ALLOWED.includes(raw) ? raw : 'factory') as Tab;
---
<AdminLayout title="Pipeline">
  <section class="bg-dark min-h-screen p-6">
    <div class="max-w-screen-2xl mx-auto">
      <DevStatusTabs client:load {initial} {initialTab} {brand} />
    </div>
  </section>
</AdminLayout>
```

Note: the floating `BudgetPanel` from the old page is intentionally dropped — its content now lives in the Kosten tab.

- [ ] **Step 8: Convert the old routes to query-preserving 301 redirects**

`website/src/pages/dev-status.astro` (replace whole file):

```astro
---
// Moved to /admin/pipeline (T001433). Permanent, query-preserving redirect.
return Astro.redirect(`/admin/pipeline${Astro.url.search}`, 301);
---
```

`website/src/pages/admin/planungsbuero.astro` (replace whole file):

```astro
---
export const prerender = false;
return Astro.redirect('/admin/pipeline?tab=planung', 301);
---
```

`website/src/pages/admin/factory-observability.astro` and `website/src/pages/admin/factory-budget.astro` (replace each whole file):

```astro
---
return Astro.redirect('/admin/pipeline?tab=kosten', 301);
---
```

- [ ] **Step 9: Typecheck + build the pipeline route**

Run: `cd website && npx tsc --noEmit && npx astro check`
Expected: PASS — no unresolved imports; `DevStatusTabs` compiles with six tabs; redirect stubs are valid.

- [ ] **Step 10: Commit**

```bash
git add website/src/pages/admin/pipeline.astro website/src/pages/dev-status.astro website/src/pages/admin/planungsbuero.astro website/src/pages/admin/factory-observability.astro website/src/pages/admin/factory-budget.astro website/src/components/admin/ui/AdminTabs.svelte website/src/components/DevStatusTabs.svelte website/src/components/factory/KostenTab.svelte website/src/components/factory/factory-chart-colors.ts website/src/components/factory/FactoryObservability.svelte website/src/components/factory/FactoryBudgetPage.svelte
git commit -m "feat(admin): move pipeline to /admin/pipeline, six AdminTabs, Kosten tab, redirects [T001433]"
```

---

## Task 5: Factory Floor — conveyor-only + front-page restyle

Spec: `software-factory` → "FA-SF: Factory Floor Hallendarstellung" (all three scenarios, incl. "Kein Kanban-Toggle mehr"). Design D4 floor block + Constraint `FactoryFloor.svelte 386/500`.

**Files:**
- Modify: `website/src/components/FactoryFloor.svelte:54-74,194-212,262,330-350`
- Modify: `website/src/components/FactoryFloorLane.svelte:53-110`
- Create: `website/src/components/factory/FloorControlCard.svelte`
- Modify: `website/src/styles/factory-tokens.css` (add a `.ff-pill` helper class)

**Interfaces:**
- Consumes: `FloorPayload` and `data-testid` contract (unchanged).
- Produces: conveyor-only floor with no `localStorage['ff-view']`, no view toggle.

- [ ] **Step 1: Write the failing "no kanban toggle" guard (BATS, offline)**

Add to `tests/spec/software-factory.bats` (extended fully in Task 8; add this one now so it is red):

```bash
@test "FA-SF-FLOOR: FactoryFloor.svelte has no ff-view/kanban toggle" {
  run grep -c "ff-view" website/src/components/FactoryFloor.svelte
  [ "$output" = "0" ]
  run grep -c "ff-view-toggle" website/src/components/FactoryFloor.svelte
  [ "$output" = "0" ]
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `./tests/runner.sh local software-factory 2>/dev/null || (cd . && bats tests/spec/software-factory.bats -f FA-SF-FLOOR)`
Expected: FAIL — the toggle and `ff-view` string are still present.

- [ ] **Step 3: Remove the view machinery from FactoryFloor.svelte**

Delete: the `FloorView` type + `floorView`/`viewMounted` state (lines 54-56), the `localStorage`/`ff-view` `$effect` (lines 58-67), `toggleView()` (lines 69-74), the `.ff-view-toggle` button markup (lines 194-212), the `floorView` prop passed to `<FactoryFloorLane>` (line 262), and the `.ff-view-toggle*` + `.conveyor-wrapper { display:none }` CSS (lines 330-350). Keep `viewMounted`-free rendering: the lane now always renders the conveyor.

- [ ] **Step 4: Make FactoryFloorLane conveyor-only**

In `FactoryFloorLane.svelte`, remove the `floorView` prop and collapse the `{#if floorView === 'conveyor'} … {:else} …` branch (lines 53-110) to just the conveyor path (`<ConveyorBelt … />`), deleting the kanban grid `{:else}` block. Every `data-testid` inside the conveyor path (`floor-hall`, `floor-loadingdock`, `floor-workpiece`, `floor-ci-badge`) stays.

- [ ] **Step 5: Run the guard to verify it passes**

Run: `bats tests/spec/software-factory.bats -f FA-SF-FLOOR`
Expected: PASS.

- [ ] **Step 6: Add the shared Brass pill helper class**

Append to `website/src/styles/factory-tokens.css`:

```css
/* Brass action pill (floor + tabs) */
.ff-pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 12px; border-radius: var(--radius-pill);
  font-family: var(--sans); font-size: 12px; font-weight: 600;
  color: var(--ink-900); background: var(--brass); border: none; cursor: pointer;
}
.ff-pill:hover { background: var(--brass-2); }
.ff-pill--ghost { background: transparent; color: var(--brass); border: 1px solid var(--brass-d); }
```

- [ ] **Step 7: Extract the kill-switch/control block into FloorControlCard**

Create `website/src/components/factory/FloorControlCard.svelte` and move the existing kill-switch/control markup out of `FactoryFloor.svelte` (Leitstand area) into it, restyled as an Ink/Brass status card. Keep the `data-testid` values that were on the moved block. Skeleton (the executor fills the moved control props from the existing block):

```svelte
<script lang="ts">
  import type { ControlSnapshot } from '../../lib/factory-floor-types';
  let { control, onToggle }: { control: ControlSnapshot; onToggle: () => void } = $props();
</script>

<div class="floor-control" data-testid="floor-leitstand">
  <span class="floor-control__label">Leitstand</span>
  <button class="ff-pill" onclick={onToggle}>
    {control.killSwitch ? 'Fabrik anhalten' : 'Fabrik läuft'}
  </button>
</div>

<style>
  .floor-control {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: var(--space-4); border-radius: var(--radius-md);
    background: var(--ink-850); border: 1px solid var(--line);
  }
  .floor-control__label { font-family: var(--mono); font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.16em; color: var(--mute); }
</style>
```

Render `<FloorControlCard … />` where the old white kill-switch card was; convert the Factory/Manuell/Promoten buttons to `class="ff-pill"` (Promoten uses the same Brass pill, no orange). If `data-testid="floor-leitstand"` was on a wrapper that stays in `FactoryFloor.svelte`, keep it there and drop it from the extracted card to avoid duplication.

- [ ] **Step 8: Number the stations in front-page style**

In the conveyor/station rendering, prefix each station with a mono index `01`–`06` using `PHASE_ORDER` and hairline separators; make the "Station frei" placeholder use `color: var(--mute-2)`. Add the CSS to the conveyor component's `<style>` (mono `.station__no`, `border-top: 1px solid var(--line)`, serif `.station__name`).

- [ ] **Step 9: Verify the floor still renders + typecheck**

Run: `cd website && npx tsc --noEmit && npx astro check`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add website/src/components/FactoryFloor.svelte website/src/components/FactoryFloorLane.svelte website/src/components/factory/FloorControlCard.svelte website/src/styles/factory-tokens.css tests/spec/software-factory.bats
git commit -m "feat(admin): conveyor-only floor + brass restyle, extract control card [T001433]"
```

---

## Task 6: Cockpit expand-row + icon buttons + Brass chips

Spec: `admin-cockpit` → "Cockpit Ticket-Expand-Row" (all four scenarios) + "Cockpit-Toolbar Icon-Buttons" (both scenarios). Design D5. Risk: the `[extId]` endpoint has no description — verified below and extended additively.

**Files:**
- Test: `website/src/lib/admin/__tests__/cockpit-expand.test.ts` (create)
- Modify: `website/src/lib/factory-floor.ts:384-438`, `website/src/lib/factory-floor-types.ts:109-116`
- Create: `website/src/lib/admin/cockpit-expand.ts`, `website/src/components/admin/CockpitExpandRow.svelte`
- Modify: `website/src/components/admin/CockpitTable.svelte`, `website/src/components/admin/TicketRow.svelte`, `website/src/components/admin/Cockpit/FilterBar.svelte`, `website/src/layouts/admin-icons.ts`

**Interfaces:**
- Consumes: `GET /api/factory-floor/[extId]` → `TicketDetail` (`events: PhaseEventRow[]`, `prNumber`, now `description`); `phaseProgress(phase, state)` + `PhaseProgressSegment` from `factory-floor-types.ts`; `PhaseStepper.svelte` props `{ segments: PhaseProgressSegment[] }`.
- Produces: `toCockpitExpand(detail, repo?)` → `CockpitExpandModel`; `CockpitExpandRow.svelte`.

- [ ] **Step 1: Extend the detail endpoint with `description` (additive, verified missing)**

`website/src/lib/factory-floor.ts` — add `description` to the base SELECT (line 385): `SELECT id, external_id, title, status, priority, retry_count, description FROM tickets.tickets WHERE external_id = $1`; add to the returned object (lines 422-438): `description: row.description ?? null,`.
`website/src/lib/factory-floor-types.ts` — add to the `TicketDetail` interface (lines 109-116): `description: string | null;`.

- [ ] **Step 2: Write the failing expand-helper test**

```ts
// website/src/lib/admin/__tests__/cockpit-expand.test.ts
import { describe, it, expect } from 'vitest';
import { toCockpitExpand } from '../cockpit-expand';

describe('toCockpitExpand', () => {
  it('maps latest event to phase segments and lists a PR link', () => {
    const model = toCockpitExpand({
      description: '  Hallo Welt  ',
      prNumber: 42,
      events: [
        { phase: 'implement', state: 'entered', detail: null, driver: 'factory', at: '2026-07-02T10:00:00Z' },
        { phase: 'plan', state: 'done', detail: null, driver: 'factory', at: '2026-07-02T09:00:00Z' },
      ],
    });
    expect(model.description).toBe('Hallo Welt');
    expect(model.segments.length).toBeGreaterThan(0);
    expect(model.links).toContainEqual({ label: 'PR #42', href: '#pr-42' });
    expect(model.latestEvents[0].phase).toBe('implement');
  });

  it('degrades gracefully with no events and no PR', () => {
    const model = toCockpitExpand({ description: null, prNumber: null, events: [] });
    expect(model.description).toBe('');
    expect(model.links).toEqual([]);
    expect(model.latestEvents).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd website && npx vitest run --project node src/lib/admin/__tests__/cockpit-expand.test.ts`
Expected: FAIL — module `../cockpit-expand` does not exist yet.

- [ ] **Step 4: Implement the pure expand helper**

```ts
// website/src/lib/admin/cockpit-expand.ts
import { phaseProgress, type PhaseProgressSegment, type PhaseEventRow } from '../factory-floor-types';

export interface ExpandLink { label: string; href: string; }
export interface CockpitExpandModel {
  description: string;
  segments: PhaseProgressSegment[];
  links: ExpandLink[];
  latestEvents: { phase: string; state: string; at: string }[];
}
export interface TicketDetailLike {
  description?: string | null;
  prNumber?: number | null;
  events?: PhaseEventRow[];
}

export function toCockpitExpand(detail: TicketDetailLike, repo = ''): CockpitExpandModel {
  const events = detail.events ?? [];
  const latest = events[0];
  const segments = phaseProgress(latest?.phase ?? null, latest?.state ?? null);
  const links: ExpandLink[] = [];
  if (typeof detail.prNumber === 'number') {
    links.push({ label: `PR #${detail.prNumber}`, href: repo ? `${repo}/pull/${detail.prNumber}` : `#pr-${detail.prNumber}` });
  }
  return {
    description: (detail.description ?? '').trim(),
    segments,
    links,
    latestEvents: events.slice(0, 5).map((e) => ({ phase: e.phase, state: e.state, at: e.at })),
  };
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `cd website && npx vitest run --project node src/lib/admin/__tests__/cockpit-expand.test.ts`
Expected: PASS.

- [ ] **Step 6: Add `save` + `link` icons**

In `website/src/layouts/admin-icons.ts`, add two entries to the map (16×16, `stroke="currentColor"`):

```ts
  save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
```

- [ ] **Step 7: Build the lazy expand-row component**

```svelte
<!-- website/src/components/admin/CockpitExpandRow.svelte -->
<script lang="ts">
  import PhaseStepper from '../factory/PhaseStepper.svelte';
  import AdminBadge from './ui/AdminBadge.svelte';
  import { toCockpitExpand, type CockpitExpandModel } from '../../lib/admin/cockpit-expand';

  let { extId }: { extId: string } = $props();
  let model = $state<CockpitExpandModel | null>(null);
  let error = $state(false);

  $effect(() => {
    let cancelled = false;
    fetch(`/api/factory-floor/${extId}`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('fetch_failed'))))
      .then((detail) => { if (!cancelled) model = toCockpitExpand(detail); })
      .catch(() => { if (!cancelled) error = true; });
    return () => { cancelled = true; };
  });
</script>

<div class="expand" data-testid="cockpit-expand">
  {#if error}
    <p class="expand__muted">Details konnten nicht geladen werden.</p>
  {:else if !model}
    <p class="expand__muted">Lädt …</p>
  {:else}
    {#if model.description}<p class="expand__desc">{model.description}</p>{/if}
    <PhaseStepper segments={model.segments} />
    {#if model.links.length}
      <div class="expand__links">
        {#each model.links as l}<a href={l.href}><AdminBadge variant="warning" size="sm">{l.label}</AdminBadge></a>{/each}
      </div>
    {/if}
    {#if model.latestEvents.length}
      <ul class="expand__events">
        {#each model.latestEvents as e}<li><AdminBadge variant="neutral" size="sm">{e.phase}</AdminBadge> {e.state}</li>{/each}
      </ul>
    {/if}
  {/if}
</div>

<style>
  .expand { padding: var(--space-3) var(--space-4); background: var(--admin-surface); border-top: 1px solid var(--admin-border); display: flex; flex-direction: column; gap: 8px; }
  .expand__muted { color: var(--admin-text-mute); font-size: 12px; margin: 0; }
  .expand__desc { color: var(--admin-text); font-size: 13px; margin: 0; white-space: pre-wrap; }
  .expand__links, .expand__events { display: flex; flex-wrap: wrap; gap: 6px; list-style: none; padding: 0; margin: 0; }
</style>
```

- [ ] **Step 8: Wire accordion expand into CockpitTable + TicketRow**

In `CockpitTable.svelte`: add `let expandedId = $state<string | null>(null)`; pass `expanded={expandedId === t.id}` and `onToggleExpand={() => expandedId = expandedId === t.id ? null : t.id}` into `TicketRow`; after each row, render `{#if expandedId === t.id}<CockpitExpandRow extId={t.extId} />{/if}`; import `CockpitExpandRow`. Change the `.chip.active` fallback (line 275-280) from `var(--admin-primary, #818cf8)` to `var(--admin-primary)` (Brass; drop the indigo literal).
In `TicketRow.svelte`: add the props `expanded` + `onToggleExpand`; add a row-level click/keydown that calls `onToggleExpand()` **only when the target is not the title link** (`if (!(e.target as HTMLElement).closest('.title-link')) onToggleExpand?.()`), and `aria-expanded={expanded}`. The title `<a href="/admin/tickets/{ticket.id}">` stays unchanged.

- [ ] **Step 9: Replace the emoji toolbar buttons with icon buttons**

In `website/src/components/admin/Cockpit/FilterBar.svelte`, import `{ icons }` from `../../../layouts/admin-icons` and replace the emoji glyphs: `📂` → `{@html icons.folder}` (Preset laden, line 88-96), `💾` → `{@html icons.save}` (Als Preset speichern, line 124-126), `🔗` → `{@html icons.link}` (URL kopieren, line 128-130). Wrap each glyph in `<span class="btn-ico" aria-hidden="true">…</span>`; keep the button text labels and handlers. Repoint the hardcoded `.btn` grays to `var(--admin-surface)`/`var(--admin-border)`.

- [ ] **Step 10: Run cockpit tests + typecheck**

Run: `cd website && npx vitest run --project node src/lib/admin/__tests__/cockpit-expand.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add website/src/lib/factory-floor.ts website/src/lib/factory-floor-types.ts website/src/lib/admin/cockpit-expand.ts website/src/lib/admin/__tests__/cockpit-expand.test.ts website/src/components/admin/CockpitExpandRow.svelte website/src/components/admin/CockpitTable.svelte website/src/components/admin/TicketRow.svelte website/src/components/admin/Cockpit/FilterBar.svelte website/src/layouts/admin-icons.ts
git commit -m "feat(admin): cockpit expand-row + icon buttons + brass chips [T001433]"
```

---

## Task 7: DORA removal

Spec: `dora-dashboard` → all four REMOVED requirements. Design D6. Removes the UI + its data path; the CLI CFR gate (`scripts/vda.sh cfr`) is untouched.

**Files:**
- Modify: `website/src/pages/admin/dora.astro`
- Delete: `website/src/components/admin/DoraDashboard.svelte`, `website/src/components/admin/DoraDashboard.test.ts`, `website/src/lib/dora-metrics.ts`, `website/src/lib/dora-metrics.test.ts`, `website/src/pages/api/admin/dora-metrics.ts`, `website/src/pages/api/admin/dora-metrics.test.ts`

- [ ] **Step 1: Grep for every DORA-UI importer (dead-code safety)**

Run: `grep -rn "DoraDashboard\|dora-metrics\|computeDora" website/src`
Confirm the only importers are the six files listed for deletion + `admin/dora.astro` (which becomes a redirect). The AdminShortcuts DORA link was already removed in Task 3.

- [ ] **Step 2: Convert `admin/dora.astro` to a redirect**

Replace the whole file with:

```astro
---
// DORA UI removed (T001433). Analytics live under the pipeline page.
return Astro.redirect('/admin/pipeline?tab=analytics', 301);
---
```

- [ ] **Step 3: Delete the DORA UI + data path + their tests**

```bash
git rm website/src/components/admin/DoraDashboard.svelte website/src/components/admin/DoraDashboard.test.ts website/src/lib/dora-metrics.ts website/src/lib/dora-metrics.test.ts website/src/pages/api/admin/dora-metrics.ts website/src/pages/api/admin/dora-metrics.test.ts
```

- [ ] **Step 4: Verify no dangling references + typecheck**

Run: `grep -rn "DoraDashboard\|dora-metrics\|computeDora" website/src ; cd website && npx tsc --noEmit`
Expected: the grep prints nothing; `tsc` passes (no unresolved imports).

- [ ] **Step 5: Commit**

```bash
git add website/src/pages/admin/dora.astro
git commit -m "feat(admin): remove DORA UI, redirect /admin/dora to pipeline analytics [T001433]"
```

---

## Task 8: Test sweep — E2E migration + BATS specs + inventory

Spec: Teststrategie in all four deltas. Risk: `.ds-tab`/`.tab-bar-wrap` selectors change with AdminTabs, and the outer-tab count goes 5 → 6.

**Files:**
- Modify: `tests/e2e/specs/fa-factory-floor.spec.ts`, `tests/e2e/specs/dev-status-tabs.spec.ts`, `tests/e2e/specs/fa-mobile-factory.spec.ts`
- Create: `tests/spec/website-core.bats`, `tests/spec/admin-cockpit.bats`, `tests/spec/dora-dashboard.bats`
- Modify: `tests/spec/software-factory.bats`
- Regenerate: `website/src/data/test-inventory.json`

- [ ] **Step 1: Migrate `fa-factory-floor.spec.ts` to `/admin/pipeline`**

Change both `page.goto('/dev-status')` (lines 7, 16) to `page.goto('/admin/pipeline')` and update the describe title/comment from `/dev-status` to `/admin/pipeline`. The `getByTestId` assertions are unchanged (data-testids are invariant).

- [ ] **Step 2: Rewrite `dev-status-tabs.spec.ts` for AdminTabs + six tabs**

Repoint every `page.goto('/dev-status…')` to `/admin/pipeline…`; replace `.ds-tab.active` with `.tabs__tab--active` and `.ds-tab` with `.tabs__tab`; replace `.tab-bar-wrap` with `.tabs`; update FA-UNIF-04 to assert `/admin/pipeline?tab=planung`; update FA-UNIF-05 tab count from `5` to `6`; rewrite FA-UNIF-08 to assert exactly one `#admin-sidebar a[href="/admin/pipeline"]` (text "Pipeline") and zero `a[href="/dev-status"]`/`a[href="/admin/planungsbuero"]`; adjust the tab labels to the new short labels (Floor/Planung/Analytics/Kosten/Steuerung/Abhängigkeiten). Keep the `FA-UNIF-11` no-scroll test from Task 2.

- [ ] **Step 3: Migrate `fa-mobile-factory.spec.ts` to six tabs**

Change `page.goto('/dev-status?tab=factory')` (line 7) to `/admin/pipeline?tab=factory`; in FA-MOBILE-03 replace `.tab-bar-wrap` with `.tabs`, `.ds-tab` with `.tabs__tab`, and the `toHaveCount(5)` + `for (i<5)` loop with `6`.

- [ ] **Step 4: Add redirect E2E checks**

Add to `dev-status-tabs.spec.ts`:

```ts
test('FA-UNIF-12: legacy routes redirect to /admin/pipeline', async ({ page }) => {
  await page.goto('/dev-status?tab=planung');
  await expect(page).toHaveURL(/\/admin\/pipeline\?tab=planung/);
  await page.goto('/admin/factory-observability');
  await expect(page).toHaveURL(/\/admin\/pipeline\?tab=kosten/);
  await page.goto('/admin/dora');
  await expect(page).toHaveURL(/\/admin\/pipeline\?tab=analytics/);
});
```

- [ ] **Step 5: Create the BATS spec files (offline, static assertions)**

`tests/spec/website-core.bats` (template header from `tests/spec/software-factory.bats`), with `@test` entries:
- `admin-foundation.css` color-bearing `--admin-*` all contain `var(--` (loop over the token list).
- `AdminLayout.astro` imports `factory-tokens.css` before `admin-foundation.css` (line-order check via `grep -n`).
- `AdminSidebarNav.astro` contains exactly one `href="/admin/pipeline"` labelled Pipeline.
- `kore-app.css` contains `--admin-primary: var(--copper)`.

`tests/spec/admin-cockpit.bats`:
- `website/src/components/admin/CockpitExpandRow.svelte` exists.
- `Cockpit/FilterBar.svelte` contains no `📂`/`💾`/`🔗` and references `icons.folder`/`icons.save`/`icons.link`.
- `TicketRow.svelte` still has `href="/admin/tickets/`.

`tests/spec/dora-dashboard.bats`:
- `admin/dora.astro` redirects to `/admin/pipeline?tab=analytics`.
- `DoraDashboard.svelte`, `lib/dora-metrics.ts`, `pages/api/admin/dora-metrics.ts` do NOT exist (`[ ! -f … ]`).

Extend `tests/spec/software-factory.bats` (keep the `FA-SF-FLOOR` test from Task 5) with:
- `pages/admin/pipeline.astro` exists and mounts `DevStatusTabs`.
- `pages/dev-status.astro` is a 301 redirect to `/admin/pipeline`.
- `factory-observability.astro` + `factory-budget.astro` redirect to `/admin/pipeline?tab=kosten`.
- `FactoryObservability.svelte` contains no local `const PHASE_COLORS` (`grep -c` = 0) and imports `PHASE_COLOR_BY_NAME`.

- [ ] **Step 6: Run the BATS specs offline**

Run: `bats tests/spec/website-core.bats tests/spec/admin-cockpit.bats tests/spec/dora-dashboard.bats tests/spec/software-factory.bats`
Expected: PASS (all static-file assertions green after Tasks 1-7).

- [ ] **Step 7: Regenerate + stage the test inventory**

Run: `task test:inventory`
Then stage the regenerated file so CI's inventory-drift check passes:

```bash
git add website/src/data/test-inventory.json
```

- [ ] **Step 8: Commit**

```bash
git add tests/e2e/specs/fa-factory-floor.spec.ts tests/e2e/specs/dev-status-tabs.spec.ts tests/e2e/specs/fa-mobile-factory.spec.ts tests/spec/website-core.bats tests/spec/admin-cockpit.bats tests/spec/dora-dashboard.bats tests/spec/software-factory.bats website/src/data/test-inventory.json
git commit -m "test(admin): migrate floor/tab E2E to /admin/pipeline + BATS specs + inventory [T001433]"
```

---

## Task 9: Final verification

Runs the mandatory gate commands and the plan-lint/openspec validators. No new behavior — this task must leave the branch green and CI-ready.

**Files:** none (verification only).

- [ ] **Step 1: Targeted tests for the changed domains**

Run: `task test:changed`
Expected: Vitest (node + components), the selected BATS specs, and `quality:check` (S1-S4 ratchet) all pass.

- [ ] **Step 2: Regenerate all derived artifacts**

Run: `task freshness:regenerate`
This refreshes `test-inventory.json`, `route-manifest.json`, `repo-index.json` and friends after the route move and test changes.

- [ ] **Step 3: Confirm freshness + quality ratchet**

Run: `task freshness:check`
Expected: no stale artifacts; the S1 ratchet is green (all touched files remain under their static limits; no baseline key added).

- [ ] **Step 4: Re-stage the inventory if freshness changed it**

Run: `task test:inventory`
Then `git add website/src/data/test-inventory.json` if it changed, so the committed inventory matches CI.

- [ ] **Step 5: Guard the `any` budget (CQ02)**

Run: `bash -c "count=\$(grep -rn ': any\|<any>\|as any' website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l | tr -d ' '); echo \"any count: \$count (limit: 200)\"; [ \$count -le 200 ]"`
Expected: the count did not increase (no new `any` introduced).

- [ ] **Step 6: Validate the OpenSpec change + this plan**

Run: `task test:openspec && bash scripts/plan-lint.sh openspec/changes/admin-redesign/tasks.md`
Expected: OpenSpec validation passes and `PLAN-LINT: PASS`.

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "chore(admin): finalize admin-redesign verification artifacts [T001433]"
```
