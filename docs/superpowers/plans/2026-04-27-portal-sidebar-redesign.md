---
title: Portal Sidebar Redesign Implementation Plan
domains: [website]
status: completed
pr_number: null
---

# Portal Sidebar Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 13-item 2-column tile sidebar in the user portal with a flat 8-item vertical list, rename Übersicht → Dashboard, rename Unterschriften → Verträge, add a Buchung section, and remove Besprechungen/Projekte/Onboarding/Alle Dienste from the nav.

**Architecture:** All portal nav lives in `PortalLayout.astro` (sidebar) and `portal.astro` (single-page section router via `?section=` query param). The new sidebar switches from `NavGroup[]` (grouped 2-col grid) to a flat `NavItem[]` (vertical list). The Dashboard section becomes a new `DashboardSection.astro` component replacing `OverviewSection.astro`.

**Tech Stack:** Astro 5.7, Svelte 5, Tailwind CSS 4.1, inline SVG icons (no external icon library), `?section=` query-param routing

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `website/src/layouts/PortalLayout.astro` | Modify | Sidebar structure, nav item list, icon definitions |
| `website/src/pages/portal.astro` | Modify | Section routing, data loading, component imports |
| `website/src/components/portal/DashboardSection.astro` | Create | New dashboard: alerts + 6 tiles + external services |
| `website/src/components/portal/BuchungSection.astro` | Create | New booking section |

`OverviewSection.astro` is left in place but replaced in the routing — no deletion needed.

---

### Task 1: Flatten PortalLayout sidebar

**Files:**
- Modify: `website/src/layouts/PortalLayout.astro:20-254`

- [ ] **Step 1: Replace the `icons` Record — add `buchung`, update stroke-width to 1.2**

In `PortalLayout.astro`, replace the entire `const icons: Record<string, string> = { ... };` block (lines 20–33) with:

```typescript
const icons: Record<string, string> = {
  overview:       `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="5" height="5" rx="0.5"/><rect x="9" y="2" width="5" height="5" rx="0.5"/><rect x="2" y="9" width="5" height="5" rx="0.5"/><rect x="9" y="9" width="5" height="5" rx="0.5"/></svg>`,
  dateien:        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2h5.5L13 5.5V14H4V2z"/><path d="M9.5 2v3.5H13"/><path d="M6 8h4M6 10.5h4M6 13h2.5"/></svg>`,
  unterschriften: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 10.5c1-2 2-4 3-3s0 3 1.5 2 2-3 3-2"/><path d="M2.5 13.5h11"/></svg>`,
  fragebögen:     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="1.5" width="11" height="13" rx="1"/><path d="M5.5 5.5h5M5.5 8h3"/><circle cx="8" cy="11.5" r="0.75" fill="currentColor" stroke="none"/></svg>`,
  kalender:       `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="12" height="11" rx="1"/><path d="M2 7h12M5.5 1.5v3M10.5 1.5v3M5.5 10h1M8 10h1M10.5 10h1"/></svg>`,
  rechnungen:     `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 1.5h8v13l-2-1.5-2 1.5-2-1.5-2 1.5z"/><path d="M6 6h4M6 8.5h4M6 11h2"/></svg>`,
  buchung:        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="5.5"/><path d="M8 5.5v2.5l1.5 1.5"/></svg>`,
  konto:          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="5" r="3"/><path d="M2.5 14.5a5.5 5.5 0 0 1 11 0"/></svg>`,
};
```

- [ ] **Step 2: Replace NavGroup interfaces and navGroups array with flat NavItem array**

Replace the `NavItem`/`NavGroup` interfaces and the entire `navGroups` array (lines 35–89) with:

```typescript
interface NavItem {
  id: string;
  label: string;
  icon: string;
  badge?: number;
  separator?: boolean;
}

const navItems: NavItem[] = [
  { id: 'overview',    label: 'Dashboard',   icon: 'overview' },
  { id: 'dateien',     label: 'Dateien',     icon: 'dateien',        separator: true },
  { id: 'fragebögen', label: 'Fragebögen',  icon: 'fragebögen',    badge: pendingQuestionnaires },
  { id: 'vertraege',   label: 'Verträge',    icon: 'unterschriften', badge: pendingSignatures },
  { id: 'kalender',    label: 'Kalender',    icon: 'kalender' },
  { id: 'rechnungen',  label: 'Rechnungen',  icon: 'rechnungen' },
  { id: 'buchung',     label: 'Buchung',     icon: 'buchung' },
];
```

- [ ] **Step 3: Replace the `<nav>` block inside the sidebar (lines 218–255)**

Replace the `<nav>` element (from `<nav style="flex:1...">` to its closing `</nav>`) with:

```astro
<nav style="flex:1; overflow-y:auto; padding:8px 6px; display:flex; flex-direction:column; gap:1px;">
  {navItems.map((item) => {
    const active = section === item.id;
    return (
      <>
        {item.separator && (
          <div style="height:1px; background:var(--line); margin:4px 3px 5px;" />
        )}
        <a
          href={`/portal?section=${item.id}`}
          class={`portal-nav-item${active ? ' is-active' : ''}`}
          style={`display:flex; align-items:center; gap:9px; padding:7px 9px; border-radius:7px; text-decoration:none; font-size:12.5px; font-weight:500; transition:background 0.1s ease, color 0.1s ease; ${
            active ? 'background:var(--brass-d); color:var(--brass);' : 'color:var(--mute);'
          }`}
        >
          <span
            class="nav-icon"
            style={`width:15px; height:15px; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:color 0.1s ease; ${active ? 'color:var(--brass);' : ''}`}
            set:html={icons[item.icon]}
          />
          <span style="flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">{item.label}</span>
          {item.badge !== undefined && item.badge > 0 && (
            <span style="min-width:16px; height:16px; padding:0 5px; border-radius:999px; background:var(--brass); color:var(--ink-900); font-family:var(--font-mono); font-size:9px; font-weight:700; display:flex; align-items:center; justify-content:center; line-height:1;">
              {item.badge > 99 ? '99+' : item.badge}
            </span>
          )}
        </a>
      </>
    );
  })}
</nav>
```

- [ ] **Step 4: Remove the `.portal-nav-tile` hover CSS rule from the `<style>` block**

In the `<style>` block (around lines 108–130), delete these two rules (they are replaced by the existing `.portal-nav-item` rules):

```css
.portal-nav-tile:not(.is-active):hover {
  background: var(--ink-800) !important;
  color: var(--fg) !important;
}
.portal-nav-tile:not(.is-active):hover .nav-icon {
  color: var(--brass) !important;
}
```

- [ ] **Step 5: Start dev server and verify sidebar renders**

```bash
cd website && npm run dev
```

Open `http://localhost:4321/portal` in browser (will redirect to login — that's expected at this stage). Check that the build succeeds with no TypeScript errors. Look for errors in the terminal output.

Expected: `astro dev` starts successfully, no type errors.

- [ ] **Step 6: Commit**

```bash
git add website/src/layouts/PortalLayout.astro
git commit -m "feat(portal): flatten sidebar to 8-item vertical list with thin icons"
```

---

### Task 2: Update portal.astro routing

**Files:**
- Modify: `website/src/pages/portal.astro`

- [ ] **Step 1: Add `DashboardSection` and `BuchungSection` imports**

At the top of portal.astro, in the import block (lines 13–26), add two imports after the existing portal component imports:

```typescript
import DashboardSection  from '../components/portal/DashboardSection.astro';
import BuchungSection    from '../components/portal/BuchungSection.astro';
```

- [ ] **Step 2: Add `vertraege` alias and `buchung` section to the section data loading**

After line 30 (`const section = Astro.url.searchParams.get('section') ?? 'overview';`), replace it with:

```typescript
const rawSection = Astro.url.searchParams.get('section') ?? 'overview';
// backward-compat aliases
const section = rawSection === 'unterschriften' ? 'vertraege'
              : rawSection === 'dashboard'      ? 'overview'
              : rawSection;
```

- [ ] **Step 3: Remove unused lazy-load data for the overview section**

Find the block starting at line 77 (`if (section === 'overview') {`). The new dashboard no longer needs `nextBooking`, `openInvoices`, or `onboardingPct`. Remove the entire block:

```typescript
// DELETE this entire block:
let nextBooking: Awaited<ReturnType<typeof getClientBookings>>[number] | null = null;
let openInvoices  = 0;
let onboardingPct = 0;

if (section === 'overview') {
  const [bookings, invoices, onboarding] = await Promise.allSettled([
    getClientBookings(session.email),
    getCustomerInvoices(session.email),
    getOrCreateOnboardingChecklist(session.sub),
  ]);
  if (bookings.status === 'fulfilled') { ... }
  if (invoices.status === 'fulfilled') { ... }
  if (onboarding.status === 'fulfilled' && onboarding.value.length) { ... }
}
```

Also remove unused imports at the top of the file that are now only used for the deleted block — check if `getCustomerInvoices` and `getOrCreateOnboardingChecklist` are used anywhere else in the file. If not, remove those import lines too.

- [ ] **Step 4: Add `buchung` section renderer and update `overview` renderer**

In the template section (starting at line 128), make two changes:

1. Replace:
   ```astro
   {section === 'overview' && <OverviewSection {session} {nextBooking} {openInvoices} {unreadMessages} {onboardingPct} {ncBase} {vaultUrl} {wbUrl} />}
   ```
   With:
   ```astro
   {section === 'overview' && <DashboardSection {session} {pendingSignatures} {pendingQuestionnaires} {ncBase} {vaultUrl} {wbUrl} />}
   ```

2. Add after the last `{section === 'konto' ...}` line:
   ```astro
   {section === 'buchung' && <BuchungSection {ncBase} />}
   ```

3. Add `vertraege` alias — replace the existing `unterschriften` renderer:
   ```astro
   {section === 'unterschriften' && (
   ```
   With:
   ```astro
   {(section === 'vertraege' || section === 'unterschriften') && (
   ```

- [ ] **Step 5: Verify build with no TS errors**

```bash
cd website && npm run build 2>&1 | tail -30
```

Expected: build completes. If it errors on missing `DashboardSection` or `BuchungSection`, those stubs will be added in Tasks 3 and 4 — create empty placeholder files first if needed:

```astro
---
// placeholder
---
<div>placeholder</div>
```

- [ ] **Step 6: Commit**

```bash
git add website/src/pages/portal.astro
git commit -m "feat(portal): update section routing — add buchung, vertraege alias, dashboard alias"
```

---

### Task 3: Create DashboardSection

**Files:**
- Create: `website/src/components/portal/DashboardSection.astro`

- [ ] **Step 1: Create the file with props interface**

Create `website/src/components/portal/DashboardSection.astro`:

```astro
---
import type { UserSession } from '../../lib/auth';

interface Props {
  session: UserSession;
  pendingSignatures: number;
  pendingQuestionnaires: number;
  ncBase: string;
  vaultUrl: string;
  wbUrl?: string;
}

const { session, pendingSignatures, pendingQuestionnaires, ncBase, vaultUrl, wbUrl = '' } = Astro.props;

const firstName = session.name?.split(' ')[0] ?? session.preferred_username ?? 'dort';

const tiles = [
  { id: 'dateien',     label: 'Dateien',     desc: 'Dokumente & Freigaben',   badge: 0,
    icon: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2h5.5L13 5.5V14H4V2z"/><path d="M9.5 2v3.5H13"/><path d="M6 8h4M6 10.5h4"/></svg>` },
  { id: 'vertraege',   label: 'Verträge',    desc: '',                        badge: pendingSignatures,
    icon: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 10.5c1-2 2-4 3-3s0 3 1.5 2 2-3 3-2"/><path d="M2.5 13.5h11"/></svg>` },
  { id: 'fragebögen', label: 'Fragebögen',  desc: '',                        badge: pendingQuestionnaires,
    icon: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="1.5" width="11" height="13" rx="1"/><path d="M5.5 5.5h5M5.5 8h3"/><circle cx="8" cy="11.5" r="0.75" fill="currentColor" stroke="none"/></svg>` },
  { id: 'kalender',    label: 'Kalender',    desc: 'Termine & Meeting-Links', badge: 0,
    icon: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="12" height="11" rx="1"/><path d="M2 7h12M5.5 1.5v3M10.5 1.5v3"/></svg>` },
  { id: 'rechnungen',  label: 'Rechnungen',  desc: '',                        badge: 0,
    icon: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 1.5h8v13l-2-1.5-2 1.5-2-1.5-2 1.5z"/><path d="M6 6h4M6 8.5h4M6 11h2"/></svg>` },
  { id: 'buchung',     label: 'Buchung',     desc: 'Termin anfragen',         badge: 0,
    icon: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="5.5"/><path d="M8 5.5v2.5l1.5 1.5"/></svg>` },
];

const externalServices = [
  ...(ncBase ? [{ href: ncBase, label: 'Nextcloud',    desc: 'Dateien & Kalender' }] : []),
  ...(vaultUrl ? [{ href: vaultUrl, label: 'Vaultwarden', desc: 'Passwörter'        }] : []),
  ...(wbUrl ? [{ href: wbUrl,   label: 'Whiteboard',  desc: 'Skizzen & Boards'   }] : []),
];

const hasPending = pendingSignatures > 0 || pendingQuestionnaires > 0;
---

<div style="padding: 32px 32px 48px; max-width: 800px;">

  <h1 style="font-size:22px; font-weight:700; color:var(--fg); letter-spacing:-0.02em; margin-bottom:4px;">
    Dashboard
  </h1>
  <p style="font-size:13px; color:var(--mute); margin-bottom:28px;">
    Willkommen zurück, {firstName}.{hasPending ? ' Es warten Aufgaben auf Sie.' : ''}
  </p>

  <!-- Pending alerts -->
  {pendingSignatures > 0 && (
    <a href="/portal?section=vertraege"
       style="display:flex; align-items:center; gap:12px; padding:12px 16px; margin-bottom:10px; background:var(--brass-d); border:1px solid rgba(202,166,87,0.25); border-radius:10px; text-decoration:none; transition:border-color 0.1s ease;"
    >
      <span style="display:flex; align-items:center; justify-content:center; width:14px; height:14px; flex-shrink:0; color:var(--brass);" set:html={`<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 10.5c1-2 2-4 3-3s0 3 1.5 2 2-3 3-2"/><path d="M2.5 13.5h11"/></svg>`} />
      <span style="font-size:13px; color:var(--fg-soft); flex:1;">
        <strong style="color:var(--brass); font-weight:600;">{pendingSignatures} {pendingSignatures === 1 ? 'Vertrag' : 'Verträge'}</strong> warten auf Ihre Unterschrift
      </span>
      <span style="font-size:12px; font-weight:600; color:var(--brass);">Ansehen →</span>
    </a>
  )}

  {pendingQuestionnaires > 0 && (
    <a href="/portal?section=fragebögen"
       style="display:flex; align-items:center; gap:12px; padding:12px 16px; margin-bottom:10px; background:var(--brass-d); border:1px solid rgba(202,166,87,0.25); border-radius:10px; text-decoration:none; transition:border-color 0.1s ease;"
    >
      <span style="display:flex; align-items:center; justify-content:center; width:14px; height:14px; flex-shrink:0; color:var(--brass);" set:html={`<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="1.5" width="11" height="13" rx="1"/><path d="M5.5 5.5h5M5.5 8h3"/><circle cx="8" cy="11.5" r="0.75" fill="currentColor" stroke="none"/></svg>`} />
      <span style="font-size:13px; color:var(--fg-soft); flex:1;">
        <strong style="color:var(--brass); font-weight:600;">{pendingQuestionnaires} {pendingQuestionnaires === 1 ? 'Fragebogen' : 'Fragebögen'}</strong> noch nicht ausgefüllt
      </span>
      <span style="font-size:12px; font-weight:600; color:var(--brass);">Ansehen →</span>
    </a>
  )}

  {hasPending && <div style="height:18px;" />}

  <!-- Service tiles -->
  <p style="font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:0.08em; color:var(--mute-2); margin-bottom:10px;">Ihr Bereich</p>
  <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:28px;">
    {tiles.map(tile => (
      <a href={`/portal?section=${tile.id}`}
         style="display:flex; flex-direction:column; gap:6px; padding:14px 14px 12px; background:var(--ink-800); border:1px solid var(--line); border-radius:10px; text-decoration:none; transition:background 0.12s ease, border-color 0.12s ease;"
      >
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <span style="display:flex; align-items:center; justify-content:center; width:28px; height:28px; border-radius:7px; background:rgba(255,255,255,0.05); color:var(--brass);" set:html={tile.icon} />
          {tile.badge > 0 && (
            <span style="padding:2px 7px; border-radius:5px; background:var(--brass-d); color:var(--brass); font-size:10px; font-weight:700; font-family:var(--font-mono);">
              {tile.badge}
            </span>
          )}
        </div>
        <div style="font-size:12.5px; font-weight:600; color:var(--fg-soft);">{tile.label}</div>
        {tile.desc && <div style="font-size:11px; color:var(--mute);">{tile.desc}</div>}
        {tile.badge > 0 && !tile.desc && (
          <div style="font-size:11px; color:var(--brass);">{tile.badge} ausstehend</div>
        )}
      </a>
    ))}
  </div>

  <!-- External services -->
  {externalServices.length > 0 && (
    <>
      <p style="font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:0.08em; color:var(--mute-2); margin-bottom:10px;">Dienste</p>
      <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px;">
        {externalServices.map(svc => (
          <a href={svc.href} target="_blank" rel="noopener noreferrer"
             style="display:flex; align-items:center; gap:10px; padding:10px 12px; background:var(--ink-850); border:1px solid var(--line); border-radius:8px; text-decoration:none; transition:background 0.1s ease;"
          >
            <div style="display:flex; flex-direction:column; gap:1px; min-width:0;">
              <span style="font-size:12px; font-weight:600; color:var(--fg-soft); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">{svc.label}</span>
              <span style="font-size:10.5px; color:var(--mute);">{svc.desc}</span>
            </div>
            <span style="margin-left:auto; font-size:13px; color:var(--mute-2); flex-shrink:0;">↗</span>
          </a>
        ))}
      </div>
    </>
  )}

</div>
```

- [ ] **Step 2: Log in to the portal and verify the Dashboard renders correctly**

```bash
task website:dev
```

Navigate to `http://web.localhost/portal` (or `http://localhost:4321/portal` in dev). Log in. Verify:
- Sidebar shows 8 items: Dashboard, Dateien, Fragebögen, Verträge, Kalender, Rechnungen, Buchung
- Dashboard page shows greeting, service tiles, external services row
- Pending alerts appear if `pendingSignatures > 0` or `pendingQuestionnaires > 0`
- Clicking a tile navigates to the correct `?section=` URL
- Clicking Verträge navigates to `?section=vertraege`

- [ ] **Step 3: Commit**

```bash
git add website/src/components/portal/DashboardSection.astro
git commit -m "feat(portal): add DashboardSection with service tiles and pending alerts"
```

---

### Task 4: Create BuchungSection

**Files:**
- Create: `website/src/components/portal/BuchungSection.astro`

- [ ] **Step 1: Create BuchungSection with Nextcloud calendar link**

Create `website/src/components/portal/BuchungSection.astro`:

```astro
---
interface Props {
  ncBase: string;
}

const { ncBase } = Astro.props;

const bookingUrl = ncBase ? `${ncBase}/apps/calendar/` : '';
---

<div style="padding: 32px 32px 48px; max-width: 600px;">

  <h1 style="font-size:22px; font-weight:700; color:var(--fg); letter-spacing:-0.02em; margin-bottom:4px;">
    Buchung
  </h1>
  <p style="font-size:13px; color:var(--mute); margin-bottom:28px;">
    Termin anfragen oder buchen
  </p>

  {bookingUrl ? (
    <div style="background:var(--ink-800); border:1px solid var(--line); border-radius:12px; padding:24px;">
      <p style="font-size:13px; color:var(--fg-soft); margin-bottom:16px; line-height:1.6;">
        Wählen Sie einen freien Termin im Kalender aus. Nach der Buchung erhalten Sie eine Bestätigung per E-Mail.
      </p>
      <a
        href={bookingUrl}
        target="_blank"
        rel="noopener noreferrer"
        style="display:inline-flex; align-items:center; gap:8px; padding:10px 18px; background:var(--brass); color:var(--ink-900); border-radius:8px; text-decoration:none; font-size:13px; font-weight:600; transition:opacity 0.1s ease;"
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;">
          <circle cx="8" cy="8" r="5.5"/>
          <path d="M8 5.5v2.5l1.5 1.5"/>
        </svg>
        Termin buchen
      </a>
    </div>
  ) : (
    <div style="background:var(--ink-800); border:1px solid var(--line); border-radius:12px; padding:24px;">
      <p style="font-size:13px; color:var(--mute);">
        Buchungsfunktion wird eingerichtet. Bitte kontaktieren Sie uns direkt.
      </p>
    </div>
  )}

</div>
```

- [ ] **Step 2: Verify Buchung section is reachable**

Navigate to `http://web.localhost/portal?section=buchung`. Verify:
- The section renders without errors
- "Termin buchen" button appears and links to `${ncBase}/apps/calendar/`
- Clicking the button opens Nextcloud calendar in a new tab

- [ ] **Step 3: Verify Verträge alias works**

Navigate to `http://web.localhost/portal?section=unterschriften`. Verify it renders the same content as `?section=vertraege` (the SignaturesTab). This ensures bookmarked URLs still work.

- [ ] **Step 4: Run existing portal E2E tests to confirm no regressions**

```bash
cd tests/e2e && npx playwright test fa-client-portal.spec.ts --reporter=list
```

Expected: all 6 tests pass. T1–T4 test unauthenticated redirects and 404 absence — these are unaffected by sidebar changes.

- [ ] **Step 5: Commit**

```bash
git add website/src/components/portal/BuchungSection.astro
git commit -m "feat(portal): add BuchungSection with Nextcloud calendar booking link"
```

---

### Task 5: Final verification and cleanup

**Files:**
- Modify: `website/src/pages/portal.astro` (remove stale imports if any)

- [ ] **Step 1: Check for unused imports in portal.astro**

Open `website/src/pages/portal.astro`. Look at the import list (lines 1–26). If `getOrCreateOnboardingChecklist`, `getCustomerInvoices`, or `listProjectsForCustomer` are no longer referenced after Task 2's data-load removal, delete those import lines. Run:

```bash
cd website && npm run build 2>&1 | grep "unused\|is not used\|imported but"
```

Remove any flagged unused imports.

- [ ] **Step 2: Verify all 7 sidebar items navigate correctly**

Log in to the portal. Click each sidebar item in order and verify:

| Click | Expected URL | Expected heading |
|---|---|---|
| Dashboard | `?section=overview` | "Dashboard" |
| Dateien | `?section=dateien` | renders DateienSection |
| Fragebögen | `?section=fragebögen` | renders FragebogenSection |
| Verträge | `?section=vertraege` | renders SignaturesTab |
| Kalender | `?section=kalender` | renders KalenderSection |
| Rechnungen | `?section=rechnungen` | renders RechnungenSection |
| Buchung | `?section=buchung` | "Buchung" |

Also verify Konto and Abmelden in the footer work correctly.

- [ ] **Step 3: Verify mobile sidebar still works**

Resize browser to < 768px. Verify:
- Hamburger button appears in topbar
- Tapping hamburger opens the sidebar overlay
- Nav items are readable at mobile width (no text overflow issues)
- Tapping a nav item closes the sidebar and navigates

- [ ] **Step 4: Final commit and push for PR**

```bash
git add website/src/pages/portal.astro
git commit -m "chore(portal): remove unused imports after sidebar redesign"
```

Then open a PR per project conventions (`feature/portal-sidebar-redesign` branch).

---

## Self-Review Checklist

- [x] **Spec coverage:** All spec requirements covered — flat sidebar (Task 1), routing aliases (Task 2), DashboardSection (Task 3), BuchungSection (Task 4)
- [x] **No placeholders:** All steps contain actual code. BuchungSection marked as extendable but functional.
- [x] **Type consistency:** `NavItem` defined in Task 1 Step 2 and used in Task 1 Step 3. `DashboardSection` props defined and consumed consistently. `pendingSignatures`/`pendingQuestionnaires` are already in `PortalLayout` Props interface — no change needed.
- [x] **Backward compat:** `?section=unterschriften` still works via alias in Task 2 Step 2. `?section=overview` unchanged as the internal ID for Dashboard.
- [x] **Removed data loads:** Task 2 Step 3 removes `nextBooking`/`openInvoices`/`onboardingPct` which are no longer used by DashboardSection.
