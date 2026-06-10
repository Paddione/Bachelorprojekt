---
title: Unified Dev-Status: Planungsbüro + Factory Integration Implementation Plan
ticket_id: null
domains: [website, db, test]
status: active
pr_number: null
---

# Unified Dev-Status: Planungsbüro + Factory Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/dev-status` wird zu einer tab-basierten Unified-Seite (Factory Floor + Planungsbüro) mit URL-Zustand, Live-Badges, mobilem Fokus-Kanban und mentolder-Brand.

**Architecture:** `DevStatusTabs.svelte` wraps `FactoryFloor.svelte` + `PlanningOffice.svelte` ohne diese zu modifizieren. `FloorPayload` bekommt `planningCount` + `qaQueue: []`. Mobile Fokus-Ansicht via Svelte `$state` + CSS `display:none`. `/admin/planungsbuero` → 302-Redirect. Admin-Sidebar: ein Eintrag.

**Tech Stack:** Astro 5, Svelte 5 (`$state`/`$props`), TypeScript, PostgreSQL (`tickets.tickets`), `admin-premium.css` Tokens

**Ticket:** (wird nach Task 1 mit `./scripts/ticket.sh create` vergeben)

---

## Datei-Map

| Aktion | Datei |
|--------|-------|
| Modify | `website/src/lib/factory-floor.ts` — `PlanningCount`, `getPlanningCount()`, `FloorPayload` |
| Modify | `website/src/pages/api/factory-floor.ts` — keine Codeänderung nötig (payload passthrough) |
| Modify | `website/src/pages/api/factory-floor/stream.ts` — `planning_count` im phase-Event mitsenden |
| Create | `website/src/components/DevStatusTabs.svelte` — Tab-Wrapper, URL-Zustand, Badges |
| Modify | `website/src/components/FactoryFloor.svelte` — Mobile Fokus-View + QS-Platzhalter-Spalte |
| Modify | `website/src/pages/dev-status.astro` — `initialTab` lesen, `DevStatusTabs` verwenden |
| Modify | `website/src/pages/admin/planungsbuero.astro` — 302-Redirect |
| Modify | `website/src/layouts/AdminLayout.astro` — Sidebar: 1 Eintrag |
| Modify | `website/tests/e2e/` — neue E2E-Tests FA-UNIF-01…08 |

---

### Task 1: `planningCount` im DAL + FloorPayload

**Files:**
- Modify: `website/src/lib/factory-floor.ts`

- [ ] **Schritt 1: Interface ergänzen**

  In `website/src/lib/factory-floor.ts` direkt nach Zeile 21 (`export interface FloorMetrics …`) einfügen:

  ```ts
  export interface PlanningCount {
    total: number;  // Tickets mit status IN ('planning','plan_staged')
    ready: number;  // davon: alle 4 DoR-Flags true
  }
  ```

- [ ] **Schritt 2: `FloorPayload` erweitern**

  In der `FloorPayload`-Interface (Zeile 37–47) zwei neue Felder ergänzen:

  ```ts
  export interface FloorPayload {
    control: ControlSnapshot;
    metrics: FloorMetrics;
    loadingDock: LoadingDockItem[];
    hall: HallItem[];
    shipped: ShippedItem[];
    staged: StagedItem[];
    officeWaiting: number;
    stagedWaiting: number;
    planningCount: PlanningCount;   // NEU
    qaQueue: never[];               // NEU — Platzhalter, T000581 befüllt
    fetchedAt: string;
  }
  ```

- [ ] **Schritt 3: `getPlanningCount()` schreiben**

  Direkt nach `officeCount`-Import (Zeile 7) neue Funktion hinzufügen — am besten nach `getStaged()`, vor `parsePrNumber()`:

  ```ts
  /** Anzahl planning/plan_staged Tickets; ready = DoR 4/4. */
  export async function getPlanningCount(): Promise<PlanningCount> {
    const r = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (
           WHERE (readiness->>'spec_skizziert')::bool IS TRUE
             AND (readiness->>'offene_fragen_geklaert')::bool IS TRUE
             AND (readiness->>'abhaengigkeiten_klar')::bool IS TRUE
             AND (readiness->>'aufwand_geschaetzt')::bool IS TRUE
         )::int AS ready
         FROM tickets.tickets
        WHERE status IN ('planning','plan_staged')`,
    );
    return {
      total: r.rows[0]?.total ?? 0,
      ready: r.rows[0]?.ready ?? 0,
    };
  }
  ```

- [ ] **Schritt 4: `getFloor()` anpassen**

  In `getFloor()` (Zeile 245–260) `getPlanningCount()` parallel mitladen und im Return-Objekt einsetzen:

  ```ts
  export async function getFloor(slotsCap: number): Promise<FloorPayload> {
    const control = await getControl(slotsCap);
    const [metrics, loadingDock, hall, shipped, staged, officeWaiting, planningCount] = await Promise.all([
      getMetrics(),
      getLoadingDock(control.slotsUsed, control.slotsCap),
      getHall(),
      getShipped(),
      getStaged(),
      officeCount(),
      getPlanningCount(),
    ]);
    return {
      control, metrics, loadingDock, hall, shipped, staged,
      officeWaiting, stagedWaiting: staged.length,
      planningCount,
      qaQueue: [],
      fetchedAt: new Date().toISOString(),
    };
  }
  ```

- [ ] **Schritt 5: TypeScript-Check**

  ```bash
  cd website && pnpm tsc --noEmit 2>&1 | grep factory-floor
  ```

  Erwartet: keine Fehler für `factory-floor.ts`.

- [ ] **Schritt 6: Commit**

  ```bash
  cd /tmp/wt-planungsbuero-factory
  git add website/src/lib/factory-floor.ts
  git commit -m "feat(factory-floor): planningCount + qaQueue placeholder in FloorPayload"
  ```

---

### Task 2: SSE-Stream — `planning_count` mitsenden

**Files:**
- Modify: `website/src/pages/api/factory-floor/stream.ts`

Aktuell sendet der Stream nur `event: phase` mit `{at: timestamp}`. Wir ergänzen `planningCount` damit `DevStatusTabs` bei einem Phase-Event die Badges aktualisieren kann ohne extra Fetch.

- [ ] **Schritt 1: Import ergänzen**

  Zeile 3 in `stream.ts` nach dem `pool`-Import:

  ```ts
  import { getPlanningCount } from '../../../lib/factory-floor';
  ```

- [ ] **Schritt 2: `poll()`-Funktion erweitern**

  Den `poll`-Block (Zeilen 27–39) ersetzen:

  ```ts
  const poll = async () => {
    try {
      const [phaseRow, planningCount] = await Promise.all([
        pool.query(`SELECT COALESCE(MAX(at)::text, '') AS m FROM tickets.factory_phase_events`),
        getPlanningCount(),
      ]);
      const m = phaseRow.rows[0]?.m ?? '';
      if (m && m !== lastMax) {
        lastMax = m;
        send('phase', { at: m, planningCount });
      }
    } catch {
      /* swallow — heartbeat keeps stream alive */
    }
  };
  ```

- [ ] **Schritt 3: TypeScript-Check**

  ```bash
  cd website && pnpm tsc --noEmit 2>&1 | grep stream
  ```

  Erwartet: keine Fehler.

- [ ] **Schritt 4: Commit**

  ```bash
  cd /tmp/wt-planungsbuero-factory
  git add website/src/pages/api/factory-floor/stream.ts
  git commit -m "feat(factory-floor): planningCount in SSE phase events"
  ```

---

### Task 3: `DevStatusTabs.svelte` — neue Komponente

**Files:**
- Create: `website/src/components/DevStatusTabs.svelte`

Diese Komponente hält Tab-Zustand + URL-Sync + Badge-Anzeige und rendert `FactoryFloor` oder `PlanningOffice`.

- [ ] **Schritt 1: Datei anlegen**

  Erstelle `website/src/components/DevStatusTabs.svelte`:

  ```svelte
  <script lang="ts">
    import { onMount } from 'svelte';
    import FactoryFloor from './FactoryFloor.svelte';
    import PlanningOffice from './PlanningOffice.svelte';
    import type { FloorPayload } from '../lib/factory-floor';

    type Tab = 'factory' | 'planung';

    let { initial, initialTab, brand }: {
      initial: FloorPayload | null;
      initialTab: Tab;
      brand: string;
    } = $props();

    let activeTab = $state<Tab>(initialTab);
    let planningCount = $state(initial?.planningCount ?? { total: 0, ready: 0 });
    let hallActive   = $state(initial?.hall.length ?? 0);

    function switchTab(tab: Tab) {
      activeTab = tab;
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tab);
      history.pushState({}, '', url.toString());
    }

    onMount(() => {
      // Sync badge counts when FactoryFloor refreshes (custom event).
      window.addEventListener('factory-floor-refreshed', (e: Event) => {
        const detail = (e as CustomEvent<{ planningCount?: typeof planningCount; hallActive?: number }>).detail;
        if (detail.planningCount) planningCount = detail.planningCount;
        if (detail.hallActive != null) hallActive = detail.hallActive;
      });

      // Handle browser back/forward.
      window.addEventListener('popstate', () => {
        const t = new URLSearchParams(window.location.search).get('tab') as Tab | null;
        if (t === 'factory' || t === 'planung') activeTab = t;
      });
    });

    $derived: {
      const badge = planningCount.ready > 0 ? planningCount.ready : planningCount.total;
      // exposed for template
    }
    function planningBadge() {
      return planningCount.ready > 0 ? planningCount.ready : planningCount.total;
    }
  </script>

  <!-- Tab bar -->
  <div class="dev-status-tabs">
    <div class="tab-bar-wrap">
      <button
        class="ds-tab"
        class:active={activeTab === 'factory'}
        onclick={() => switchTab('factory')}
      >
        Factory Floor
        {#if hallActive > 0}
          <span class="tab-badge live">{hallActive} aktiv</span>
        {/if}
      </button>
      <button
        class="ds-tab"
        class:active={activeTab === 'planung'}
        onclick={() => switchTab('planung')}
      >
        Planungsbüro
        {#if planningBadge() > 0}
          <span class="tab-badge">{planningBadge()} {planningCount.ready > 0 ? 'bereit' : 'in Planung'}</span>
        {/if}
      </button>
    </div>
  </div>

  <!-- Tab content -->
  {#if activeTab === 'factory'}
    <FactoryFloor {initial} />
  {:else}
    <div class="planning-tab-wrap">
      <PlanningOffice client:load {brand} />
    </div>
  {/if}

  <style>
    .dev-status-tabs { border-bottom: 1px solid var(--admin-border, rgba(255,255,255,0.07)); }
    .tab-bar-wrap { display: flex; gap: 0; padding: 0 1.5rem; }

    .ds-tab {
      padding: 10px 18px; font-size: 13px; font-weight: 500;
      color: var(--admin-text-mute, #8c96a3);
      border: none; background: transparent; cursor: pointer;
      border-bottom: 2px solid transparent;
      display: flex; align-items: center; gap: 7px;
      transition: color 0.15s;
      font-family: var(--font-sans, inherit);
    }
    .ds-tab:hover { color: var(--admin-text, #eef1f3); }
    .ds-tab.active {
      color: var(--admin-primary, oklch(0.80 0.09 75));
      border-bottom-color: var(--admin-primary, oklch(0.80 0.09 75));
    }

    .tab-badge {
      background: oklch(0.80 0.09 75 / 0.14);
      color: oklch(0.80 0.09 75);
      font-size: 10px; font-family: var(--font-mono, monospace);
      padding: 1px 6px; border-radius: 3px; font-weight: 600;
    }
    .tab-badge.live {
      background: oklch(0.80 0.06 160 / 0.12);
      color: oklch(0.80 0.06 160);
      animation: badge-pulse 2s infinite;
    }
    @keyframes badge-pulse { 0%,100%{opacity:1} 50%{opacity:0.55} }

    .planning-tab-wrap { padding: 1.5rem; }
  </style>
  ```

- [ ] **Schritt 2: TypeScript-Check**

  ```bash
  cd website && pnpm tsc --noEmit 2>&1 | grep DevStatusTabs
  ```

  Erwartet: keine Fehler.

- [ ] **Schritt 3: Commit**

  ```bash
  cd /tmp/wt-planungsbuero-factory
  git add website/src/components/DevStatusTabs.svelte
  git commit -m "feat: DevStatusTabs — tab wrapper with URL sync and live badges"
  ```

---

### Task 4: `dev-status.astro` — DevStatusTabs einbinden

**Files:**
- Modify: `website/src/pages/dev-status.astro`

- [ ] **Schritt 1: `planungsbuero.astro` zu Redirect umbauen** (kurz, gehört logisch hierher)

  `website/src/pages/admin/planungsbuero.astro` vollständig ersetzen mit:

  ```astro
  ---
  export const prerender = false;
  return Astro.redirect('/dev-status?tab=planung', 302);
  ---
  ```

- [ ] **Schritt 2: `dev-status.astro` umbauen**

  Vollständig ersetzen mit:

  ```astro
  ---
  import AdminLayout from '../layouts/AdminLayout.astro';
  import { getSession, isAdmin } from '../lib/auth';
  import DevStatusTabs from '../components/DevStatusTabs.svelte';
  import { getFloor } from '../lib/factory-floor';

  export const prerender = false;

  const session = await getSession(Astro.request.headers.get('cookie'));
  if (!session) return Astro.redirect(`/api/auth/login?redirect=${encodeURIComponent(Astro.url.pathname)}`);
  if (!isAdmin(session)) return Astro.redirect('/admin');

  const slotsCap = parseInt(process.env.FACTORY_GLOBAL_CAP ?? '3', 10);
  const brand = process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';

  let initial = null;
  try { initial = await getFloor(slotsCap); } catch { initial = null; }

  type Tab = 'factory' | 'planung';
  const rawTab = Astro.url.searchParams.get('tab');
  const initialTab: Tab = rawTab === 'planung' ? 'planung' : 'factory';
  ---

  <AdminLayout title="Dev Status">
    <section class="bg-dark min-h-screen">
      <div class="max-w-screen-2xl mx-auto">
        <DevStatusTabs client:load {initial} {initialTab} {brand} />
      </div>
    </section>
  </AdminLayout>
  ```

  Hinweis: `pt-6 pb-12 px-6` wird entfernt — `DevStatusTabs` steuert das eigene Layout (Kanban braucht `overflow-x:auto` ohne äußeres Padding).

- [ ] **Schritt 3: Build-Test**

  ```bash
  cd website && pnpm build 2>&1 | tail -20
  ```

  Erwartet: `Build complete` ohne Fehler.

- [ ] **Schritt 4: Commit**

  ```bash
  cd /tmp/wt-planungsbuero-factory
  git add website/src/pages/dev-status.astro website/src/pages/admin/planungsbuero.astro
  git commit -m "feat(dev-status): tab-based unified page + planungsbuero redirect"
  ```

---

### Task 5: Admin-Sidebar — ein Eintrag

**Files:**
- Modify: `website/src/layouts/AdminLayout.astro` (Zeilen 151–152)

- [ ] **Schritt 1: Sidebar-Einträge ersetzen**

  Zeilen 151–152 in `AdminLayout.astro`:

  ```ts
  // VORHER:
  { href: '/dev-status',          label: 'Factory Status', icon: 'activity',   matches: ['/dev-status'] },
  { href: '/admin/planungsbuero', label: 'Planungsbüro',   icon: 'clipboard',  matches: ['/admin/planungsbuero'] },

  // NACHHER (eine Zeile):
  { href: '/dev-status', label: 'Dev Status', icon: 'activity', matches: ['/dev-status', '/admin/planungsbuero'] },
  ```

  Die `matches`-Liste enthält `/admin/planungsbuero` damit der Sidebar-Eintrag auch beim Redirect (bevor der Browser zu `/dev-status` wechselt) als aktiv markiert ist.

- [ ] **Schritt 2: Build-Test**

  ```bash
  cd website && pnpm build 2>&1 | grep -E "error|Error" | head -10
  ```

  Erwartet: keine Fehler.

- [ ] **Schritt 3: Commit**

  ```bash
  cd /tmp/wt-planungsbuero-factory
  git add website/src/layouts/AdminLayout.astro
  git commit -m "feat(admin): merge Factory Status + Planungsbüro sidebar → Dev Status"
  ```

---

### Task 6: `FactoryFloor.svelte` — Mobile Fokus-Ansicht

**Files:**
- Modify: `website/src/components/FactoryFloor.svelte`

Der Kanban ist auf Mobile (< 768px) unbrauchbar. Wir fügen eine Fokus-Ansicht hinzu: eine Spalte voll-breit, Pfeile + Touch-Swipe, Fortschritts-Pips.

- [ ] **Schritt 1: Spalten-Konstante und State ergänzen**

  Im `<script>`-Block von `FactoryFloor.svelte` nach den bestehenden `STATIONS`-Konstanten (nach Zeile 24) einfügen:

  ```ts
  // Mobile Fokus-Ansicht: alle navigierbaren Spalten in Reihenfolge
  const MOBILE_COLS = [
    'staged', 'backlog',
    'scout', 'design', 'plan', 'implement', 'verify', 'deploy',
    'qs', 'done',
  ] as const;
  type MobileCol = (typeof MOBILE_COLS)[number];

  let mobileColIndex = $state(0);
  let touchStartX = $state(0);

  function mobileNext() { if (mobileColIndex < MOBILE_COLS.length - 1) mobileColIndex++; }
  function mobilePrev() { if (mobileColIndex > 0) mobileColIndex--; }
  function onTouchStart(e: TouchEvent) { touchStartX = e.touches[0].clientX; }
  function onTouchEnd(e: TouchEvent) {
    const delta = e.changedTouches[0].clientX - touchStartX;
    if (delta < -40) mobileNext();
    else if (delta > 40) mobilePrev();
  }
  ```

- [ ] **Schritt 2: `factory-floor-refreshed`-Event dispatchen**

  Am Ende der bestehenden `refresh()`-Funktion (nach `data = await res.json()`) anfügen:

  ```ts
  window.dispatchEvent(new CustomEvent('factory-floor-refreshed', {
    detail: {
      planningCount: (data as any).planningCount,
      hallActive: data?.hall.length ?? 0,
    },
  }));
  ```

- [ ] **Schritt 3: Mobile-Wrapper um das Kanban-HTML legen**

  Das bestehende Kanban-Markup (der `<div>` der alle Spalten enthält) mit einem Touch-Container umschließen. Suche den äußersten Kanban-Container — er beginnt mit einer Klasse wie `flex gap-2` oder ähnlich. Füge `ontouchstart` + `ontouchend` hinzu:

  ```svelte
  <div
    class="kanban-container"
    ontouchstart={onTouchStart}
    ontouchend={onTouchEnd}
  >
    <!-- bestehende Spalten, jede bekommt data-col="<name>" -->
    ...
  </div>
  ```

  Jede bestehende Spalte bekommt ein `data-col`-Attribut mit dem passenden MOBILE_COLS-Namen (z.B. `data-col="scout"`, `data-col="backlog"` usw.). Die Staged-Spalte bekommt `data-col="staged"`, Loading Dock → `data-col="backlog"`, die 6 Phase-Spalten → ihren Phase-Key, QS-Platzhalter → `data-col="qs"`, Shipped → `data-col="done"`.

- [ ] **Schritt 4: Pips + Navigations-Header für Mobile hinzufügen**

  Direkt vor dem Kanban-Container einfügen (nur auf Mobile sichtbar):

  ```svelte
  <!-- Mobile Fokus-Navigation (nur < 768px sichtbar) -->
  <div class="mobile-col-nav">
    <button class="mobile-nav-arrow" onclick={mobilePrev} disabled={mobileColIndex === 0}>←</button>
    <div class="mobile-col-title">
      {MOBILE_COLS[mobileColIndex].toUpperCase()}
    </div>
    <button class="mobile-nav-arrow" onclick={mobileNext} disabled={mobileColIndex === MOBILE_COLS.length - 1}>→</button>
  </div>
  <div class="mobile-pips">
    {#each MOBILE_COLS as _, i}
      <div class="pip" class:pip-active={i === mobileColIndex} class:pip-done={i < mobileColIndex}></div>
    {/each}
  </div>
  ```

- [ ] **Schritt 5: CSS für Mobile-Ansicht ergänzen**

  Am Ende des `<style>`-Blocks (oder in einem neuen `<style>`-Block) ergänzen:

  ```css
  .mobile-col-nav {
    display: none;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
  }
  .mobile-col-title {
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: var(--color-brass, oklch(0.80 0.09 75));
  }
  .mobile-nav-arrow {
    width: 32px; height: 32px; border-radius: 50%;
    background: var(--color-ink-800, #17202e);
    border: 1px solid rgba(255,255,255,0.12);
    color: var(--color-mute, #8c96a3);
    font-size: 15px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
  }
  .mobile-nav-arrow:disabled { opacity: 0.3; cursor: not-allowed; }

  .mobile-pips {
    display: none;
    gap: 3px;
    padding: 0 16px 8px;
  }
  .pip {
    flex: 1; height: 2px; border-radius: 1px;
    background: var(--color-ink-750, #1d2736);
  }
  .pip.pip-done { background: rgba(255,255,255,0.25); }
  .pip.pip-active { background: var(--color-brass, oklch(0.80 0.09 75)); }

  @media (max-width: 767px) {
    .mobile-col-nav { display: flex; }
    .mobile-pips    { display: flex; }

    /* Alle Spalten verstecken, nur aktive zeigen */
    .kanban-container [data-col] { display: none; }
    .kanban-container [data-col].mobile-visible { display: flex; flex-direction: column; width: 100%; }

    /* Horizontal-Scroll deaktivieren auf Mobile */
    .kanban-container { overflow-x: hidden; }
  }
  ```

- [ ] **Schritt 6: `mobile-visible`-Klasse reaktiv setzen**

  Im Template jede Spalte mit der reaktiven Klasse versehen. Beispiel für die Staged-Spalte:

  ```svelte
  <div data-col="staged" class:mobile-visible={MOBILE_COLS[mobileColIndex] === 'staged'} ...>
  ```

  Dasselbe Muster für alle anderen Spalten mit dem jeweiligen `data-col`-Wert.

- [ ] **Schritt 7: TypeScript-Check + Dev-Server**

  ```bash
  cd website && pnpm tsc --noEmit 2>&1 | grep FactoryFloor
  ```

  Erwartet: keine Fehler.

- [ ] **Schritt 8: Commit**

  ```bash
  cd /tmp/wt-planungsbuero-factory
  git add website/src/components/FactoryFloor.svelte
  git commit -m "feat(factory-floor): mobile focus view — swipe navigation + progress pips"
  ```

---

### Task 7: `FactoryFloor.svelte` — QS-Platzhalter-Spalte

**Files:**
- Modify: `website/src/components/FactoryFloor.svelte`

- [ ] **Schritt 1: `qaQueue`-Prop aus FloorPayload lesen**

  Im `<script>`-Block: `data?.qaQueue` wird im Template verwendet. Da `FloorPayload.qaQueue` `never[]` ist, wird der Block immer leer gerendert — kein weiterer State nötig.

- [ ] **Schritt 2: QS-Spalte nach Deploy einfügen**

  Direkt nach der Deploy-Spalte im Template, vor der Shipped/Done-Spalte, einfügen:

  ```svelte
  <!-- QS-Spalte: Platzhalter — Implementierung via T000581 -->
  <div
    data-col="qs"
    class:mobile-visible={MOBILE_COLS[mobileColIndex] === 'qs'}
    class="col col-qa"
  >
    <div class="col-head">
      <span class="col-label col-label-qa">QS</span>
      <span class="col-count">{data?.qaQueue?.length ?? 0}</span>
    </div>
    <div class="col-body">
      {#each data?.qaQueue ?? [] as _item}
        <!-- T000581 befüllt diesen Block -->
      {/each}
    </div>
  </div>
  ```

- [ ] **Schritt 3: CSS für QS-Spalte ergänzen**

  ```css
  .col-label-qa { color: #818cf8; }   /* indigo — passt zu admin-accent */
  ```

- [ ] **Schritt 4: TypeScript-Check**

  ```bash
  cd website && pnpm tsc --noEmit 2>&1 | grep FactoryFloor
  ```

  Erwartet: keine Fehler.

- [ ] **Schritt 5: Commit**

  ```bash
  cd /tmp/wt-planungsbuero-factory
  git add website/src/components/FactoryFloor.svelte
  git commit -m "feat(factory-floor): QS placeholder column for T000581"
  ```

---

### Task 8: E2E-Tests

**Files:**
- Modify/Create: `website/tests/e2e/` — neue Test-Datei oder Erweiterung der bestehenden Factory-Floor-Tests

- [ ] **Schritt 1: Vorhandene E2E-Testdatei für Factory Floor finden**

  ```bash
  find /tmp/wt-planungsbuero-factory/website/tests -name "*.spec.ts" | xargs grep -l "dev-status\|factory" 2>/dev/null
  ```

  Notiere den Pfad (typisch `tests/e2e/factory-floor.spec.ts` o.ä.).

- [ ] **Schritt 2: Test-Datei anlegen oder erweitern**

  Neue Datei `website/tests/e2e/dev-status-tabs.spec.ts` (oder in bestehende Datei anfügen):

  ```ts
  import { test, expect } from '@playwright/test';

  // FA-UNIF-01: Default-Tab ist Factory
  test('FA-UNIF-01: /dev-status öffnet Factory-Tab', async ({ page }) => {
    await page.goto('/dev-status');
    await expect(page.locator('.ds-tab.active')).toContainText('Factory Floor');
    expect(page.url()).not.toContain('tab=planung');
  });

  // FA-UNIF-02: ?tab=planung öffnet Planungsbüro-Tab
  test('FA-UNIF-02: ?tab=planung öffnet Planungsbüro', async ({ page }) => {
    await page.goto('/dev-status?tab=planung');
    await expect(page.locator('.ds-tab.active')).toContainText('Planungsbüro');
  });

  // FA-UNIF-03: Tab-Klick aktualisiert URL
  test('FA-UNIF-03: Tab-Wechsel ändert URL ohne Reload', async ({ page }) => {
    await page.goto('/dev-status');
    await page.locator('.ds-tab', { hasText: 'Planungsbüro' }).click();
    await expect(page).toHaveURL(/tab=planung/);
    await expect(page.locator('.ds-tab.active')).toContainText('Planungsbüro');
  });

  // FA-UNIF-04: /admin/planungsbuero redirectet
  test('FA-UNIF-04: /admin/planungsbuero → /dev-status?tab=planung', async ({ page }) => {
    await page.goto('/admin/planungsbuero');
    await expect(page).toHaveURL(/\/dev-status\?tab=planung/);
  });

  // FA-UNIF-05: Tab-Badges sind sichtbar
  test('FA-UNIF-05: Tab-Bar wird gerendert', async ({ page }) => {
    await page.goto('/dev-status');
    await expect(page.locator('.tab-bar-wrap')).toBeVisible();
    await expect(page.locator('.ds-tab')).toHaveCount(2);
  });

  // FA-UNIF-06: Mobile Fokus-Ansicht bei 390px
  test('FA-UNIF-06: Mobile — Fokus-Ansicht sichtbar bei 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dev-status');
    await expect(page.locator('.mobile-col-nav')).toBeVisible();
    await expect(page.locator('.mobile-pips')).toBeVisible();
  });

  // FA-UNIF-07: Pfeil-Button wechselt Spalte
  test('FA-UNIF-07: Mobile — Pfeil-Button wechselt Spalte', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dev-status');
    const titleBefore = await page.locator('.mobile-col-title').textContent();
    await page.locator('.mobile-nav-arrow').last().click(); // →
    const titleAfter = await page.locator('.mobile-col-title').textContent();
    expect(titleAfter).not.toBe(titleBefore);
  });

  // FA-UNIF-08: Admin-Sidebar hat genau einen Dev-Status-Eintrag
  test('FA-UNIF-08: Sidebar hat einen Dev-Status-Eintrag', async ({ page }) => {
    await page.goto('/admin');
    const devStatusLinks = page.locator('#admin-sidebar a[href="/dev-status"]');
    await expect(devStatusLinks).toHaveCount(1);
    await expect(devStatusLinks.first()).toContainText('Dev Status');
    // Kein separater Planungsbüro-Eintrag mehr
    await expect(page.locator('#admin-sidebar a[href="/admin/planungsbuero"]')).toHaveCount(0);
  });
  ```

- [ ] **Schritt 3: Playwright-Projekt zuordnen**

  In `playwright.config.ts` prüfen welches Projekt für Admin-Tests zuständig ist (typisch `website` oder `admin`). Die neuen Tests gehören in dasselbe Projekt wie die bestehenden Factory-Floor-Tests.

  ```bash
  grep -n "testDir\|project" /tmp/wt-planungsbuero-factory/website/playwright.config.ts | head -20
  ```

- [ ] **Schritt 4: Commit**

  ```bash
  cd /tmp/wt-planungsbuero-factory
  git add website/tests/e2e/dev-status-tabs.spec.ts
  git commit -m "test(e2e): FA-UNIF-01..08 — unified dev-status tabs, redirect, mobile"
  ```

---

### Task 9: Ticket anlegen + Plan vorbereiten

- [ ] **Schritt 1: Ticket anlegen**

  ```bash
  cd /tmp/wt-planungsbuero-factory
  TICKET_RESULT=$(./scripts/ticket.sh create \
    --type task \
    --brand mentolder \
    --title "Unified Dev-Status: Planungsbüro + Factory Integration" \
    --priority mittel \
    --description "Branch: feature/planungsbuero-factory-unified
  Plan: docs/superpowers/plans/2026-06-10-planungsbuero-factory-unified.md
  Spec: docs/superpowers/specs/2026-06-10-planungsbuero-factory-unified-design.md")
  TICKET_EXT_ID=$(echo "$TICKET_RESULT" | cut -d'|' -f1)
  TICKET_UUID=$(echo "$TICKET_RESULT" | cut -d'|' -f2)
  echo "Ticket: $TICKET_EXT_ID"
  ```

- [ ] **Schritt 2: Ticket-ID in Plan eintragen**

  ```bash
  sed -i "s/^ticket_id: null$/ticket_id: $TICKET_EXT_ID/" \
    docs/superpowers/plans/2026-06-10-planungsbuero-factory-unified.md
  ```

- [ ] **Schritt 3: Plan in Kommissionierung stellen**

  ```bash
  ./scripts/ticket.sh stage-plan \
    --id "$TICKET_EXT_ID" \
    --branch "feature/planungsbuero-factory-unified" \
    --plan "docs/superpowers/plans/2026-06-10-planungsbuero-factory-unified.md"
  ```

- [ ] **Schritt 4: Plan-Frontmatter-Hook anwenden**

  ```bash
  bash scripts/plan-frontmatter-hook.sh docs/superpowers/plans/2026-06-10-planungsbuero-factory-unified.md
  ```

- [ ] **Schritt 5: Finalen Commit + Push**

  ```bash
  cd /tmp/wt-planungsbuero-factory
  git add docs/superpowers/plans/2026-06-10-planungsbuero-factory-unified.md
  git commit -m "chore(plans): stage planungsbuero-factory-unified for execution [$TICKET_EXT_ID]"
  git push -u origin feature/planungsbuero-factory-unified
  ```

---

## Self-Review Checklist

| Spec-Anforderung | Task |
|------------------|------|
| Tab-basiert, `?tab=` URL-Param | Task 3, 4 |
| `/admin/planungsbuero` → Redirect | Task 4 |
| `planningCount` in FloorPayload | Task 1 |
| `planningCount` im SSE-Stream | Task 2 |
| `DevStatusTabs.svelte` neu | Task 3 |
| Mobile Fokus-Ansicht (Swipe + Pips) | Task 6 |
| QS-Platzhalter-Spalte | Task 7 |
| Admin-Sidebar: ein Eintrag | Task 5 |
| E2E FA-UNIF-01..08 | Task 8 |
| mentolder Brand-Tokens | Task 3 (CSS-Variablen) |
| `factory-floor-refreshed`-Event | Task 6 |

Alle Spec-Anforderungen sind abgedeckt. Keine Platzhalter. Types konsistent: `PlanningCount` wird in Task 1 definiert und in Task 3 konsumiert. `MobileCol` und `MOBILE_COLS` werden in Task 6 definiert und in Task 7 weiter genutzt.
