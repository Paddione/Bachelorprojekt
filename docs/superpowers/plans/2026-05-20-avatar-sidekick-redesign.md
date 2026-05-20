---
ticket_id: T000118
title: Avatar & Sidekick Redesign Implementation Plan
domains: []
status: active
pr_number: null
---

# Avatar & Sidekick Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the avatar system (2-letter initials, 6 variants) and redesign the Sidekick right-side drawer to use the editorial Variant A (numbered list, Newsreader serif headline, brass hover glow) — using assets from the Claude Design handoff bundle.

**Architecture:** New `Avatar.svelte` provides the initials/variant/size system; `SidekickHome.svelte` is replaced with the editorial numbered-list layout; `SidekickHeader.svelte` gains a brass-bar eyebrow, PulseDot, and circular chrome buttons; `PortalSidekick.svelte` fetches the authenticated user and threads name + availability into the header; `AdminLayout.astro` gets a user avatar badge at the bottom of the left sidebar using session data from the SSR context.

**Tech Stack:** Svelte 5 (`$state`, `$derived`, `$props`), Astro SSR, `oklch()` CSS tokens (already in `website/src/styles/global.css`), Google Fonts (Newsreader + Geist + Geist Mono — already loaded in AdminLayout)

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| **Create** | `website/src/components/Avatar.svelte` | Reusable 2-letter initials avatar, 6 style variants, size scale |
| **Modify** | `website/src/components/assistant/SidekickHeader.svelte` | Replace plain header with editorial brass bar, PulseDot, circular chrome buttons |
| **Modify** | `website/src/components/assistant/SidekickHome.svelte` | Replace card grid with editorial numbered list (Variant A) |
| **Modify** | `website/src/components/PortalSidekick.svelte` | Fetch auth user, add Grain + Halo overlays, pass name to header, redesign FAB |
| **Modify** | `website/src/layouts/AdminLayout.astro` | Add user avatar badge to left sidebar bottom |

---

### Task 1: Avatar.svelte — 2-letter initials component

**Files:**
- Create: `website/src/components/Avatar.svelte`

This is a pure presentational component. No tests needed beyond visual inspection since it has zero async logic.

- [ ] **Step 1: Create the Avatar component**

Create `website/src/components/Avatar.svelte` with this exact content:

```svelte
<script lang="ts">
  export type AvatarVariant = 'brass' | 'hairline' | 'ring' | 'plate' | 'serif' | 'sage';

  let {
    givenName = '',
    familyName = '',
    name = '',
    size = 44,
    variant = 'brass' as AvatarVariant,
    className = '',
  }: {
    givenName?: string;
    familyName?: string;
    name?: string;
    size?: number;
    variant?: AvatarVariant;
    className?: string;
  } = $props();

  function initialsOf(given: string, family: string, full: string): string {
    if (given || family) {
      return ((given[0] ?? '') + (family[0] ?? '')).toUpperCase() || '?';
    }
    const parts = full.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '')).toUpperCase() || '?';
  }

  const initials = $derived(initialsOf(givenName, familyName, name));
  const letterSize = $derived(Math.round(size * 0.38));
  const isSquare = $derived(variant === 'plate');
</script>

<div
  class="avatar avatar--{variant} {className}"
  style="width:{size}px;height:{size}px;font-size:{letterSize}px;border-radius:{isSquare ? '6px' : '999px'};"
  aria-label="{initials}"
  role="img"
>
  <span>{initials}</span>
</div>

<style>
  .avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    user-select: none;
    line-height: 1;
  }
  .avatar span {
    transform: translateY(-0.5px);
  }

  /* Brass disc — default */
  .avatar--brass {
    background: linear-gradient(155deg, oklch(0.86 0.09 75) 0%, oklch(0.80 0.09 75) 55%, oklch(0.72 0.09 75) 100%);
    color: #0b111c;
    font-family: var(--font-sans, 'Geist', sans-serif);
    font-weight: 600;
    letter-spacing: -0.02em;
    box-shadow: inset 0 1px 0 0 rgba(255,255,255,.25), inset 0 -1px 0 0 rgba(0,0,0,.18);
  }

  /* Hairline disc — quiet */
  .avatar--hairline {
    background: var(--admin-bg, #0f1623);
    color: oklch(0.83 0.09 75);
    font-family: var(--font-mono, 'Geist Mono', monospace);
    font-weight: 500;
    letter-spacing: 0.04em;
    box-shadow: inset 0 0 0 1px rgba(232,200,112,.3);
  }

  /* Ring — editorial transparent */
  .avatar--ring {
    background: transparent;
    color: oklch(0.83 0.09 75);
    font-family: var(--font-mono, 'Geist Mono', monospace);
    font-weight: 500;
    letter-spacing: 0.04em;
    box-shadow: inset 0 0 0 1px oklch(0.83 0.09 75);
  }

  /* Plate — square mark */
  .avatar--plate {
    background: linear-gradient(155deg, oklch(0.32 0.04 75) 0%, oklch(0.22 0.03 75) 100%);
    color: oklch(0.83 0.09 75);
    font-family: var(--font-mono, 'Geist Mono', monospace);
    font-weight: 500;
    letter-spacing: 0.04em;
    box-shadow: inset 0 1px 0 0 rgba(255,255,255,.06), inset 0 0 0 1px rgba(0,0,0,.4);
  }

  /* Serif — reserved for Gerald */
  .avatar--serif {
    background: linear-gradient(155deg, oklch(0.86 0.09 75) 0%, oklch(0.78 0.09 75) 100%);
    color: #0b111c;
    font-family: var(--font-serif, 'Newsreader', serif);
    font-weight: 500;
    letter-spacing: -0.01em;
    font-style: italic;
    box-shadow: inset 0 1px 0 0 rgba(255,255,255,.22);
  }

  /* Sage — system / non-human */
  .avatar--sage {
    background: linear-gradient(155deg, oklch(0.84 0.06 160) 0%, oklch(0.74 0.06 160) 100%);
    color: #0b111c;
    font-family: var(--font-sans, 'Geist', sans-serif);
    font-weight: 600;
    letter-spacing: -0.02em;
  }
</style>
```

- [ ] **Step 2: Verify Avatar builds without TypeScript errors**

```bash
cd /tmp/wt-avatar-sidekick && npx tsc --noEmit --project website/tsconfig.json 2>&1 | grep -i 'avatar' | head -20 || echo "NO TS ERRORS"
```

Expected: `NO TS ERRORS` or no lines mentioning Avatar.

- [ ] **Step 3: Commit**

```bash
cd /tmp/wt-avatar-sidekick
git add website/src/components/Avatar.svelte
git commit -m "feat(ui): add Avatar.svelte — 2-letter initials, 6 variants (brass/hairline/ring/plate/serif/sage)"
```

---

### Task 2: SidekickHeader — editorial brass-bar redesign

**Files:**
- Modify: `website/src/components/assistant/SidekickHeader.svelte`

Replace the plain dark header with the design's editorial top bar: mono "Sidekick" label, divider, PulseDot + "Verfügbar", circular chrome expand/close buttons. Preserve the back-button and title props.

- [ ] **Step 1: Replace SidekickHeader.svelte**

```svelte
<script lang="ts">
  let {
    title,
    onClose,
    onBack,
    expanded = false,
    onToggleExpand,
    available = true,
  }: {
    title: string;
    onClose: () => void;
    onBack?: () => void;
    expanded?: boolean;
    onToggleExpand?: () => void;
    available?: boolean;
  } = $props();

  const isHome = $derived(!onBack);
</script>

<div class="sk-header">
  <div class="sk-header-left">
    {#if onBack}
      <button class="sk-chrome-btn" onclick={onBack} aria-label="Zurück">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M19 12H5M11 5l-7 7 7 7"/>
        </svg>
      </button>
      <span class="sk-title">{title}</span>
    {:else}
      <!-- Home: show "Sidekick · availability" eyebrow -->
      <span class="sk-mono-label">Sidekick</span>
      <span class="sk-divider" aria-hidden="true"></span>
      <span class="sk-availability">
        <span class="sk-pulse" aria-hidden="true"></span>
        {available ? 'Verfügbar' : 'Offline'}
      </span>
    {/if}
  </div>

  <div class="sk-header-right">
    {#if onToggleExpand}
      <button class="sk-chrome-btn" onclick={onToggleExpand} aria-label={expanded ? 'Verkleinern' : 'Vergrößern'}>
        {#if expanded}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
            <path d="M4 9V4h5M20 15v5h-5M4 15v5h5M20 9V4h-5"/>
          </svg>
        {:else}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
            <path d="M2 2l4 4M6 2H2v4M14 2l-4 4M10 2h4v4M2 14l4-4M6 14H2v-4M14 14l-4-4M10 14h4v-4"/>
          </svg>
        {/if}
      </button>
    {/if}
    <button class="sk-chrome-btn sk-chrome-btn--close" onclick={onClose} aria-label="Schließen">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18"/>
      </svg>
    </button>
  </div>
</div>

<style>
  .sk-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 22px;
    background: var(--admin-bg, #0f1623);
    border-bottom: 1px solid rgba(232, 200, 112, 0.18);
    flex-shrink: 0;
    min-height: 56px;
    gap: 12px;
    position: relative;
  }

  .sk-header-left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    flex: 1;
  }

  .sk-header-right {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .sk-mono-label {
    font-family: var(--font-mono, 'Geist Mono', monospace);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--admin-text, #e8e8f0);
  }

  .sk-title {
    font-family: var(--font-mono, 'Geist Mono', monospace);
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--admin-text, #e8e8f0);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sk-divider {
    width: 1px;
    height: 14px;
    background: rgba(255,255,255,0.12);
    flex-shrink: 0;
  }

  .sk-availability {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-mono, 'Geist Mono', monospace);
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--admin-text-mute, #8899aa);
  }

  .sk-pulse {
    position: relative;
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: oklch(0.80 0.06 160);
    display: inline-block;
    flex-shrink: 0;
    animation: sk-pulse 2.2s ease-in-out infinite;
  }

  @keyframes sk-pulse {
    0%   { box-shadow: 0 0 0 0 oklch(0.80 0.06 160 / 0.45); }
    70%  { box-shadow: 0 0 0 8px oklch(0.80 0.06 160 / 0); }
    100% { box-shadow: 0 0 0 0 oklch(0.80 0.06 160 / 0); }
  }

  .sk-chrome-btn {
    width: 30px;
    height: 30px;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.1);
    background: transparent;
    color: var(--admin-text-mute, #8899aa);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: border-color 0.18s, color 0.18s;
    flex-shrink: 0;
  }
  .sk-chrome-btn:hover {
    border-color: oklch(0.83 0.09 75);
    color: oklch(0.83 0.09 75);
  }

  .sk-chrome-btn--close:hover {
    border-color: rgba(248,113,113,.5);
    color: #f87171;
  }
</style>
```

- [ ] **Step 2: Check TypeScript**

```bash
cd /tmp/wt-avatar-sidekick && npx tsc --noEmit --project website/tsconfig.json 2>&1 | grep -i 'sidekickheader\|SidekickHeader' | head -10 || echo "CLEAN"
```

Expected: `CLEAN`

- [ ] **Step 3: Commit**

```bash
cd /tmp/wt-avatar-sidekick
git add website/src/components/assistant/SidekickHeader.svelte
git commit -m "feat(ui): redesign SidekickHeader — brass eyebrow, PulseDot availability, circular chrome buttons"
```

---

### Task 3: SidekickHome — editorial numbered list (Variant A)

**Files:**
- Modify: `website/src/components/assistant/SidekickHome.svelte`

Replace the plain card grid with the editorial numbered list from the design. Items 01-05, Newsreader serif headline, brass hover, BrassBadge instead of red badge.

- [ ] **Step 1: Replace SidekickHome.svelte**

```svelte
<script lang="ts">
  type View = 'home' | 'support' | 'questionnaire' | 'help' | 'tickets' | 'inbox';

  let {
    onNavigate,
    pendingQuestionnaires = 0,
    helpSection = '',
    helpContext = 'portal',
    pendingTickets = 0,
    pendingInbox = 0,
  }: {
    onNavigate: (view: View) => void;
    pendingQuestionnaires?: number;
    helpSection?: string;
    helpContext?: string;
    pendingTickets?: number;
    pendingInbox?: number;
  } = $props();

  const isAdmin = $derived(helpContext === 'admin');

  type Item = { id: View; no: string; title: string; sub: string; badge?: number; show?: boolean };

  const items = $derived<Item[]>([
    { id: 'tickets',       no: '01', title: 'Anfragen',           sub: 'Tickets erstellen & bearbeiten', badge: pendingTickets > 0 ? pendingTickets : undefined,       show: isAdmin },
    { id: 'inbox',         no: '02', title: 'Postfach',           sub: 'Nachrichten & Anfragen',         badge: pendingInbox > 0 ? pendingInbox : undefined,           show: isAdmin },
    { id: 'questionnaire', no: isAdmin ? '03' : '01', title: 'Fragebögen', sub: 'Aufgaben beantworten', badge: pendingQuestionnaires > 0 ? pendingQuestionnaires : undefined, show: true },
    { id: 'support',       no: isAdmin ? '04' : '02', title: 'Feedback & Support', sub: 'Fehler melden, Ideen teilen', show: true },
    { id: 'help',          no: isAdmin ? '05' : '03', title: 'Hilfe',        sub: 'Kontexthilfe für diese Seite', show: !!helpSection },
  ].filter(i => i.show));

  let hover = $state<string | null>(null);
</script>

<div class="sk-home">
  <!-- Eyebrow + headline -->
  <div class="sk-intro">
    <div class="sk-eyebrow">
      <span class="sk-eyebrow-bar" aria-hidden="true"></span>
      Helpdesk · {String(items.length).padStart(2, '0')} Bereiche
    </div>
    <h2 class="sk-headline">
      Womit kann ich Ihnen <em>helfen?</em>
    </h2>
    <p class="sk-sub">Kein Skript, kein Bot — direkter Zugang zu Tickets, Nachrichten und Kontexthilfe.</p>
  </div>

  <!-- Numbered item list -->
  <div class="sk-list" role="list">
    {#each items as item (item.id)}
      <button
        class="sk-row"
        class:sk-row--hover={hover === item.id}
        onmouseenter={() => hover = item.id}
        onmouseleave={() => hover = null}
        onclick={() => onNavigate(item.id)}
        role="listitem"
        aria-label="{item.title} — {item.sub}"
      >
        <span class="sk-no" class:sk-no--active={hover === item.id}>{item.no}</span>

        <span class="sk-body">
          <span class="sk-item-title">{item.title}</span>
          <span class="sk-item-sub">{item.sub}</span>
        </span>

        <span class="sk-badge-slot">
          {#if item.badge}
            <span class="sk-brass-badge">{Math.min(99, item.badge)}</span>
          {/if}
        </span>

        <span class="sk-arrow" class:sk-arrow--active={hover === item.id} aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12h14M13 5l7 7-7 7"/>
          </svg>
        </span>
      </button>
    {/each}
  </div>
</div>

<style>
  .sk-home {
    display: flex;
    flex-direction: column;
    flex: 1;
  }

  /* ── Intro block ── */
  .sk-intro {
    padding: 28px 22px 8px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .sk-eyebrow {
    font-family: var(--font-mono, 'Geist Mono', monospace);
    font-size: 10px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: oklch(0.83 0.09 75);
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }

  .sk-eyebrow-bar {
    width: 20px;
    height: 1px;
    background: oklch(0.83 0.09 75);
    opacity: 0.85;
    flex-shrink: 0;
  }

  .sk-headline {
    margin: 0;
    font-family: var(--font-serif, 'Newsreader', serif);
    font-size: 26px;
    line-height: 1.1;
    letter-spacing: -0.02em;
    font-weight: 400;
    color: var(--admin-text, #e8e8f0);
  }

  .sk-headline em {
    font-style: italic;
    color: oklch(0.87 0.09 75);
  }

  .sk-sub {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--admin-text-mute, #8899aa);
    max-width: 34ch;
  }

  /* ── Item list ── */
  .sk-list {
    margin-top: 20px;
    border-top: 1px solid rgba(255,255,255,0.08);
    display: flex;
    flex-direction: column;
  }

  .sk-row {
    display: grid;
    grid-template-columns: 36px 1fr auto 28px;
    align-items: center;
    gap: 14px;
    padding: 18px 22px;
    border: none;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
    position: relative;
    transition: background 220ms ease;
    width: 100%;
  }

  .sk-row--hover {
    background: linear-gradient(to right, transparent, rgba(232,200,112,.04), transparent);
  }

  .sk-no {
    font-family: var(--font-mono, 'Geist Mono', monospace);
    font-size: 10px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--admin-text-disabled, #445);
    transition: color 180ms ease;
  }

  .sk-no--active {
    color: oklch(0.83 0.09 75);
  }

  .sk-body {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .sk-item-title {
    font-family: var(--font-serif, 'Newsreader', serif);
    font-size: 19px;
    line-height: 1.15;
    letter-spacing: -0.01em;
    font-weight: 400;
    color: var(--admin-text, #e8e8f0);
  }

  .sk-item-sub {
    font-size: 12px;
    color: var(--admin-text-mute, #8899aa);
    line-height: 1.4;
  }

  .sk-badge-slot {
    display: flex;
    justify-content: flex-end;
    min-width: 24px;
  }

  .sk-brass-badge {
    min-width: 22px;
    height: 22px;
    padding: 0 7px;
    border-radius: 999px;
    background: oklch(0.83 0.09 75);
    color: #0b111c;
    font-family: var(--font-mono, 'Geist Mono', monospace);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .sk-arrow {
    width: 26px;
    height: 26px;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.1);
    background: transparent;
    color: var(--admin-text-mute, #8899aa);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: border-color 200ms ease, background 200ms ease, color 200ms ease;
    flex-shrink: 0;
  }

  .sk-arrow--active {
    border-color: oklch(0.83 0.09 75);
    background: oklch(0.83 0.09 75);
    color: #0b111c;
  }
</style>
```

- [ ] **Step 2: TypeScript check**

```bash
cd /tmp/wt-avatar-sidekick && npx tsc --noEmit --project website/tsconfig.json 2>&1 | grep -i 'sidekickhome\|SidekickHome' | head -10 || echo "CLEAN"
```

Expected: `CLEAN`

- [ ] **Step 3: Commit**

```bash
cd /tmp/wt-avatar-sidekick
git add website/src/components/assistant/SidekickHome.svelte
git commit -m "feat(ui): redesign SidekickHome — editorial numbered list, Newsreader serif, brass hover/badge"
```

---

### Task 4: PortalSidekick — user info, Grain/Halo overlays, improved FAB

**Files:**
- Modify: `website/src/components/PortalSidekick.svelte`

Fetch the authenticated user's givenName+familyName after auth check. Add Grain noise and Halo ambient overlays behind the drawer content. Pass `available` prop to `SidekickHeader`. Improve the FAB with a slight glow on hover.

- [ ] **Step 1: Add user state and extended auth fetch to the script block**

In `PortalSidekick.svelte`, find the `$effect` that fetches `/api/auth/me` (around line 56). Replace the entire script block (lines 1–111) with:

```svelte
<script lang="ts">
  import type { HelpContext } from '../lib/helpContent';
  import SidekickHeader from './assistant/SidekickHeader.svelte';
  import SidekickHome from './assistant/SidekickHome.svelte';
  import SupportView from './assistant/SupportView.svelte';
  import QuestionnaireView from './assistant/QuestionnaireView.svelte';
  import HelpView from './assistant/HelpView.svelte';
  import TicketSidekickView from './assistant/TicketSidekickView.svelte';
  import InboxSidekickView from './assistant/InboxSidekickView.svelte';

  type View = 'home' | 'support' | 'questionnaire' | 'help' | 'tickets' | 'inbox';

  let {
    helpSection = '',
    helpContext = 'portal' as HelpContext,
  }: {
    helpSection?: string;
    helpContext?: HelpContext;
  } = $props();

  let open = $state(false);
  let expanded = $state(false);
  let view = $state<View>('home');
  let pendingQuestionnaires = $state(0);
  let pendingTickets = $state(0);
  let inboxPending = $state(0);
  let isMobile = $state(false);

  // User identity for header / avatar
  let userGivenName = $state('');
  let userFamilyName = $state('');
  let userAvailable = $state(true);

  const STANDARD_WIDTH = 380;
  const EXPANDED_WIDTH = 640;

  const drawerWidth = $derived(
    isMobile ? Math.min(window?.innerWidth ?? 380, 420) : (expanded ? EXPANDED_WIDTH : STANDARD_WIDTH)
  );

  const titleMap: Record<View, string> = {
    home: 'Sidekick',
    support: 'Feedback & Support',
    questionnaire: 'Fragebögen',
    help: 'Hilfe',
    tickets: 'Anfragen',
    inbox: 'Postfach',
  };

  $effect(() => {
    checkMobile();
    const handler = () => checkMobile();
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  });

  function checkMobile() {
    isMobile = window.innerWidth < 768;
  }

  $effect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json() as {
          authenticated: boolean;
          user?: { givenName?: string; familyName?: string };
        };
        if (!data.authenticated) return;

        userGivenName = data.user?.givenName ?? '';
        userFamilyName = data.user?.familyName ?? '';

        const qRes = await fetch('/api/portal/questionnaires');
        if (qRes.ok) {
          const qs = await qRes.json() as Array<{ status: string }>;
          pendingQuestionnaires = Array.isArray(qs)
            ? qs.filter(q => !['submitted', 'reviewed', 'dismissed', 'archived'].includes(q.status)).length
            : 0;
        }

        if (helpContext === 'admin') {
          try {
            const tRes = await fetch('/api/admin/tickets?limit=1&status=open', { credentials: 'same-origin' });
            if (tRes.ok) {
              const td = await tRes.json() as { total?: number };
              pendingTickets = td.total ?? 0;
            }
          } catch { /* badge stays 0 */ }

          try {
            const iRes = await fetch('/api/admin/inbox/count', { credentials: 'same-origin' });
            if (iRes.ok) {
              const id = await iRes.json() as { total?: number };
              inboxPending = id.total ?? 0;
            }
          } catch { /* badge stays 0 */ }
        }
      } catch { /* widget is optional */ }
    })();
  });

  function openDrawer() { open = true; view = 'home'; }
  function closeDrawer() { open = false; }
  function onKeydown(e: KeyboardEvent) { if (e.key === 'Escape' && open) closeDrawer(); }
  function navigate(v: View) { view = v; }
</script>
```

- [ ] **Step 2: Add Grain and Halo SVGs as inline sub-snippets, update the drawer markup**

Find the `<!-- Drawer -->` block (around line 149) and replace the `<div class="drawer" ...>` section through `</div>` (ending before `<style>`) with:

```svelte
<!-- Backdrop for mobile -->
{#if open && isMobile}
  <div
    class="backdrop"
    role="button"
    tabindex="0"
    aria-label="Sidekick schließen"
    onclick={closeDrawer}
    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') closeDrawer(); }}
  ></div>
{/if}

<!-- FAB trigger -->
<button
  class="fab"
  class:fab--open={open}
  onclick={open ? closeDrawer : openDrawer}
  aria-label={open ? 'Sidekick schließen' : 'Sidekick öffnen'}
  aria-expanded={open}
>
  {#if (pendingQuestionnaires > 0 || pendingTickets > 0 || inboxPending > 0) && !open}
    <span class="fab-badge">{Math.min(99, pendingQuestionnaires + pendingTickets + inboxPending)}</span>
  {/if}
  {#if open}
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" aria-hidden="true">
      <path d="M3 3l10 10M13 3L3 13"/>
    </svg>
  {:else}
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" aria-hidden="true">
      <path d="M8 2.5a4 4 0 0 0-4 4c0 2.5-1.5 3.5-1.5 3.5h11S12 9 12 6.5a4 4 0 0 0-4-4z"/>
      <path d="M7 13.5h2"/>
    </svg>
  {/if}
</button>

<!-- Drawer -->
<div
  class="drawer"
  role="dialog"
  aria-modal="true"
  aria-label="Sidekick"
  aria-hidden={!open}
  inert={!open}
  style="width: {drawerWidth}px; transform: translateX({open ? '0' : '100%'});"
>
  <!-- Ambient halo overlays -->
  <div class="halo halo--warm" aria-hidden="true"></div>
  <div class="halo halo--cool" aria-hidden="true"></div>

  <!-- Grain noise layer -->
  <svg class="grain" aria-hidden="true">
    <filter id="sk-grain-f">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2"/>
      <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .45 0"/>
    </filter>
    <rect width="100%" height="100%" filter="url(#sk-grain-f)"/>
  </svg>

  <SidekickHeader
    title={titleMap[view]}
    onClose={closeDrawer}
    onBack={view !== 'home' ? () => { view = 'home'; } : undefined}
    {expanded}
    onToggleExpand={!isMobile ? () => { expanded = !expanded; } : undefined}
    available={userAvailable}
  />

  <div class="drawer-body">
    {#if view === 'home'}
      <SidekickHome
        onNavigate={navigate}
        {pendingQuestionnaires}
        {helpSection}
        {helpContext}
        {pendingTickets}
        pendingInbox={inboxPending}
      />
    {:else if view === 'support'}
      <SupportView onCloseView={() => { view = 'home'; }} />
    {:else if view === 'questionnaire'}
      <QuestionnaireView onCloseView={() => { view = 'home'; }} />
    {:else if view === 'help'}
      <HelpView section={helpSection} context={helpContext} />
    {:else if view === 'tickets'}
      <TicketSidekickView onClose={closeDrawer} />
    {:else if view === 'inbox'}
      <InboxSidekickView onClose={closeDrawer} />
    {/if}
  </div>
</div>
```

- [ ] **Step 3: Update the `<style>` block** — add halo/grain styles, improve FAB

In the `<style>` block of `PortalSidekick.svelte`, replace the entire contents with:

```css
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 9045;
    background: rgba(0, 0, 0, 0.5);
  }

  .fab {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 9040;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: oklch(0.83 0.09 75);
    color: #0b111c;
    border: 1.5px solid oklch(0.83 0.09 75 / 0.4);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 20px oklch(0.83 0.09 75 / 0.25), 0 2px 8px rgba(0,0,0,0.4);
    transition: transform 0.15s, box-shadow 0.15s;
  }
  .fab:hover {
    transform: scale(1.07);
    box-shadow: 0 6px 28px oklch(0.83 0.09 75 / 0.35), 0 4px 16px rgba(0,0,0,0.4);
  }
  .fab--open {
    background: #1a2235;
    color: oklch(0.83 0.09 75);
    border-color: oklch(0.83 0.09 75 / 0.35);
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
  }

  .fab-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    background: oklch(0.83 0.09 75);
    color: #0b111c;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 700;
    padding: 2px 5px;
    font-family: var(--font-mono, 'Geist Mono', monospace);
    min-width: 18px;
    text-align: center;
    line-height: 1.4;
    pointer-events: none;
    box-shadow: 0 0 0 2px #0f1623;
  }

  .drawer {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 9050;
    background: #0f1623;
    border-left: 1px solid rgba(232, 200, 112, 0.12);
    box-shadow: -8px 0 40px rgba(0, 0, 0, 0.6);
    display: flex;
    flex-direction: column;
    transition: transform 0.22s cubic-bezier(0.4, 0, 0.2, 1), width 0.2s ease-out;
    overflow: hidden;
    max-width: 100vw;
  }

  .drawer-body {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    min-height: 0;
    position: relative;
    z-index: 1;
  }

  /* Ambient halos */
  .halo {
    position: absolute;
    border-radius: 999px;
    pointer-events: none;
    z-index: 0;
  }
  .halo--warm {
    right: -10%;
    top: 5%;
    width: 340px;
    height: 340px;
    background: radial-gradient(circle at center, rgba(232,200,112,.16), transparent 65%);
    filter: blur(60px);
    transform: translate(50%, -50%);
  }
  .halo--cool {
    left: -10%;
    bottom: 8%;
    width: 280px;
    height: 280px;
    background: radial-gradient(circle at center, rgba(70,110,180,.12), transparent 65%);
    filter: blur(50px);
    transform: translate(-50%, 50%);
  }

  /* Grain noise overlay */
  .grain {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    opacity: 0.45;
    mix-blend-mode: overlay;
    z-index: 0;
  }

  @media (max-width: 767px) {
    .drawer {
      width: 100vw !important;
      max-width: 420px !important;
    }
  }
```

- [ ] **Step 4: TypeScript check**

```bash
cd /tmp/wt-avatar-sidekick && npx tsc --noEmit --project website/tsconfig.json 2>&1 | grep -i 'portalsidekick\|PortalSidekick' | head -10 || echo "CLEAN"
```

Expected: `CLEAN`

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-avatar-sidekick
git add website/src/components/PortalSidekick.svelte
git commit -m "feat(ui): PortalSidekick — fetch user name, grain/halo overlays, improved FAB glow, brass badge"
```

---

### Task 5: AdminLayout — user avatar badge in left sidebar

**Files:**
- Modify: `website/src/layouts/AdminLayout.astro`

Fetch the session in SSR context, extract `givenName` + `familyName`, render an inline avatar badge at the bottom of the sidebar above the Portal/Logout links. This replaces the featureless bottom section with a user-aware footer.

- [ ] **Step 1: Import getSession and fetch user in the frontmatter**

In `AdminLayout.astro`, after line 13 (`import { countPendingByType } from '../lib/messaging-db';`), add:

```ts
import { getSession } from '../lib/auth';
```

Then, after the `let inboxPending = 0;` block (after line 78), add:

```ts
let adminGivenName = '';
let adminFamilyName = '';
try {
  const session = await getSession(Astro.request.headers.get('cookie'));
  if (session) {
    adminGivenName = session.given_name ?? '';
    adminFamilyName = session.family_name ?? '';
  }
} catch { /* session unavailable — badge stays empty */ }

const adminInitials = ((adminGivenName[0] ?? '') + (adminFamilyName[0] ?? '')).toUpperCase() || '?';
```

- [ ] **Step 2: Replace the sidebar bottom section with a user badge**

Find the sidebar bottom div (around line 279–293):

```html
      <div style="padding:16px; border-top:1px solid var(--admin-border); display:flex; flex-direction:column; gap:4px;">
        <a href="/" class="sidebar-nav-item" style="margin:0; padding:8px 12px;">
```

Replace the entire `<div style="padding:16px; border-top:...">` through its closing `</div>` with:

```html
      <div style="padding:12px 16px; border-top:1px solid var(--admin-border); display:flex; flex-direction:column; gap:4px;">
        <!-- User badge -->
        {adminInitials !== '?' && (
          <div class="sidebar-label" style="display:flex; align-items:center; gap:10px; padding:8px 12px; margin-bottom:4px; border-radius:8px; background:var(--admin-surface);">
            <div style="width:30px; height:30px; border-radius:999px; background:linear-gradient(155deg, oklch(0.86 0.09 75) 0%, oklch(0.78 0.09 75) 100%); display:flex; align-items:center; justify-content:center; flex-shrink:0; font-family:var(--font-mono); font-size:11px; font-weight:600; letter-spacing:-0.01em; color:#0b111c; user-select:none;">
              {adminInitials}
            </div>
            <div style="display:flex; flex-direction:column; gap:1px; min-width:0; overflow:hidden;">
              <span style="font-size:12px; font-weight:500; color:var(--admin-text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.3;">{adminGivenName} {adminFamilyName}</span>
              <span style="font-family:var(--font-mono); font-size:9px; letter-spacing:0.14em; text-transform:uppercase; color:oklch(0.83 0.09 75); line-height:1.2;">Admin</span>
            </div>
          </div>
        )}
        <a href="/" class="sidebar-nav-item" style="margin:0; padding:8px 12px;">
          <span class="nav-icon" style="width:16px; height:16px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></span>
          <span class="sidebar-label" style="margin-left:12px; font-size:12px;">Portal</span>
        </a>
        <a href="/api/auth/logout" class="sidebar-nav-item" style="margin:0; padding:8px 12px; color:var(--admin-text-disabled);">
          <span class="nav-icon" style="width:16px; height:16px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></span>
          <span class="sidebar-label" style="margin-left:12px; font-size:12px;">Logout</span>
        </a>
        
        <button id="sidebar-toggle" style="margin-top:8px; align-self:flex-end; background:var(--admin-surface); border:1px solid var(--admin-border); color:var(--admin-text-mute); width:24px; height:24px; border-radius:6px; display:flex; align-items:center; justify-content:center; cursor:pointer;">
          <svg id="icon-collapse" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px; height:14px;"><polyline points="15 18 9 12 15 6"/></svg>
          <svg id="icon-expand" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px; height:14px; display:none;"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
```

- [ ] **Step 3: Verify Astro build (type check only)**

```bash
cd /tmp/wt-avatar-sidekick/website && npx astro check 2>&1 | grep -E 'error|Error' | head -20 || echo "ASTRO CLEAN"
```

Expected: `ASTRO CLEAN` or no error lines.

- [ ] **Step 4: Run offline tests**

```bash
cd /tmp/wt-avatar-sidekick && task test:all 2>&1 | tail -20
```

Expected: all BATS + manifest tests pass.

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-avatar-sidekick
git add website/src/layouts/AdminLayout.astro
git commit -m "feat(ui): AdminLayout sidebar — SSR user avatar badge, initials + name + brass 'Admin' label"
```

---

### Task 6: Full TypeScript + build check, then PR

**Files:** No new files.

- [ ] **Step 1: Full TypeScript check**

```bash
cd /tmp/wt-avatar-sidekick && npx tsc --noEmit --project website/tsconfig.json 2>&1 | grep -E 'error TS' | head -20 || echo "ZERO TS ERRORS"
```

Expected: `ZERO TS ERRORS`

- [ ] **Step 2: Offline tests**

```bash
cd /tmp/wt-avatar-sidekick && task test:all 2>&1 | tail -10
```

Expected: green.

- [ ] **Step 3: Create PR**

```bash
cd /tmp/wt-avatar-sidekick
git push -u origin feature/avatar-sidekick-redesign

gh pr create \
  --title "feat(ui): avatar system + Sidekick editorial redesign" \
  --body "$(cat <<'EOF'
## Summary
- New `Avatar.svelte` — 2-letter initials (first + last name), 6 variants (brass/hairline/ring/plate/serif/sage), size scale 20–96 px
- `SidekickHeader` redesigned — mono eyebrow, PulseDot availability, circular chrome buttons
- `SidekickHome` redesigned — editorial Variant A: numbered list, Newsreader serif headline, brass hover glow + BrassBadge (no red badge)
- `PortalSidekick` — fetches `givenName`/`familyName` from `/api/auth/me`, adds warm/cool Halo overlays + film-grain noise layer, improved FAB with brass glow
- `AdminLayout` — SSR user avatar badge (brass disc + initials + name + brass "Admin" label) at bottom of left sidebar

## Test plan
- [ ] `task test:all` passes
- [ ] Open `/admin` — left sidebar shows user avatar badge (initials, name, "Admin")
- [ ] Click the FAB (bottom right) — Sidekick opens with new header (PulseDot, circular buttons) and editorial numbered list
- [ ] Hover each list item — number turns brass, row gets subtle warm bloom, arrow fills brass
- [ ] Confirm badges appear in brass (not red) when tickets/inbox have pending items
- [ ] Confirm back-navigation in Sidekick (e.g. click Anfragen → Back) still works with new header
- [ ] `task feature:website` to deploy to both prod clusters

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Merge immediately**

```bash
gh pr merge --squash --delete-branch
git checkout main
git pull --rebase origin main
```

- [ ] **Step 5: Deploy to both prod clusters**

```bash
cd /home/patrick/Bachelorprojekt
task feature:website
```

Expected: website builds and rolls on both mentolder + korczewski.

---

## Self-Review

**Spec coverage:**
- ✅ Avatar: 2-letter initials, 6 variants, size scale → Task 1
- ✅ SidekickHeader editorial redesign → Task 2
- ✅ SidekickHome Variant A numbered list → Task 3
- ✅ PortalSidekick: user name fetch, overlays, FAB → Task 4
- ✅ AdminLayout left sidebar user badge → Task 5
- ✅ PR + deploy → Task 6

**Placeholder scan:** No TBD, TODO, or placeholder references found.

**Type consistency:**
- `AvatarVariant` type defined in Avatar.svelte Task 1, not imported elsewhere (each file is self-contained)
- `View` type redefined locally in SidekickHome (consistent with existing pattern in PortalSidekick)
- `adminInitials`, `adminGivenName`, `adminFamilyName` used consistently in Task 5
- `userAvailable` prop in PortalSidekick matches the `available` prop added to SidekickHeader in Task 2
