---
title: Admin & Portal Menu Cleanup — Implementation Plan
domains: []
status: active
pr_number: null
---

# Admin & Portal Menu Cleanup — Implementation Plan
ticket_id: T000496

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove 9 redundant items from the admin nav, fix one wrong icon, restore Buchung + remove Arena from portal nav, and wire each removed page into the nearest relevant target page via a tab or link-card.

**Architecture:** All changes are pure Astro/HTML edits in two layout files, one shared tab component, six page files, and one new BATS test file. No DB, no API, no new routes. Removed pages stay alive at their existing URLs — they're just no longer in the sidebar.

**Tech Stack:** Astro 5.x, inline CSS (matches existing site style), BATS for source-level nav assertions.

---

### Task 1: Write failing nav-structure BATS tests

**Files:**
- Create: `tests/unit/admin-nav.bats`

- [ ] **Step 1.1: Create the test file**

```bash
cat > tests/unit/admin-nav.bats << 'EOF'
#!/usr/bin/env bats
# admin-nav.bats — Asserts the admin and portal sidebars contain only intended items.
# Run: ./tests/unit/lib/bats-core/bin/bats tests/unit/admin-nav.bats

load test_helper

PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
ADMIN_LAYOUT="$PROJECT_DIR/website/src/layouts/AdminLayout.astro"
PORTAL_LAYOUT="$PROJECT_DIR/website/src/layouts/PortalLayout.astro"
EINSTELLUNGEN_TABS="$PROJECT_DIR/website/src/components/AdminEinstellungenTabs.astro"

# ── Admin nav: removed items ──────────────────────────────────────

@test "AdminLayout: /admin/meetings not in navGroups" {
  run grep -c "'/admin/meetings'" "$ADMIN_LAYOUT"
  assert_output "0"
}

@test "AdminLayout: /admin/kalender not in navGroups" {
  run grep -c "'/admin/kalender'" "$ADMIN_LAYOUT"
  assert_output "0"
}

@test "AdminLayout: /admin/coaching/projekte not in navGroups" {
  run grep -c "'/admin/coaching/projekte'" "$ADMIN_LAYOUT"
  assert_output "0"
}

@test "AdminLayout: /admin/coaching/settings not in navGroups" {
  run grep -c "'/admin/coaching/settings'" "$ADMIN_LAYOUT"
  assert_output "0"
}

@test "AdminLayout: /admin/zeiterfassung not in navGroups" {
  run grep -c "'/admin/zeiterfassung'" "$ADMIN_LAYOUT"
  assert_output "0"
}

@test "AdminLayout: /admin/steuer not in navGroups" {
  run grep -c "'/admin/steuer'" "$ADMIN_LAYOUT"
  assert_output "0"
}

@test "AdminLayout: /admin/software-history not in navGroups" {
  run grep -c "'/admin/software-history'" "$ADMIN_LAYOUT"
  assert_output "0"
}

@test "AdminLayout: /admin/systemtest not in navGroups" {
  run grep -c "'/admin/systemtest'" "$ADMIN_LAYOUT"
  assert_output "0"
}

@test "AdminLayout: /admin/arena not in navGroups" {
  run grep -c "'/admin/arena'" "$ADMIN_LAYOUT"
  assert_output "0"
}

@test "AdminLayout: Einstellungen uses settings icon not bell" {
  run grep -c "label: 'Einstellungen'.*icon: 'bell'" "$ADMIN_LAYOUT"
  assert_output "0"
}

# ── Portal nav ────────────────────────────────────────────────────

@test "PortalLayout: arena not in navItems" {
  run grep -c "id: 'arena'" "$PORTAL_LAYOUT"
  assert_output "0"
}

@test "PortalLayout: buchung present in navItems" {
  run grep -c "id: 'buchung'" "$PORTAL_LAYOUT"
  refute_output "0"
}

# ── Consolidation tabs ────────────────────────────────────────────

@test "AdminEinstellungenTabs: Coaching & KI tab present" {
  run grep -c "coaching/settings" "$EINSTELLUNGEN_TABS"
  refute_output "0"
}

@test "termine.astro: Kalender tab present" {
  run grep -c "href=\"/admin/kalender\"" "$PROJECT_DIR/website/src/pages/admin/termine.astro"
  refute_output "0"
}

@test "clients.astro: Meetings tab present" {
  run grep -c "href=\"/admin/meetings\"" "$PROJECT_DIR/website/src/pages/admin/clients.astro"
  refute_output "0"
}

@test "coaching/sessions/index.astro: Projekte tab present" {
  run grep -c "href=\"/admin/coaching/projekte\"" "$PROJECT_DIR/website/src/pages/admin/coaching/sessions/index.astro"
  refute_output "0"
}

@test "rechnungen.astro: Zeiterfassung tab present" {
  run grep -c "href=\"/admin/zeiterfassung\"" "$PROJECT_DIR/website/src/pages/admin/rechnungen.astro"
  refute_output "0"
}

@test "buchhaltung.astro: Steuer tab present" {
  run grep -c "href=\"/admin/steuer\"" "$PROJECT_DIR/website/src/pages/admin/buchhaltung.astro"
  refute_output "0"
}

@test "monitoring.astro: Software-History link present" {
  run grep -c "software-history" "$PROJECT_DIR/website/src/pages/admin/monitoring.astro"
  refute_output "0"
}

@test "monitoring.astro: Systemtest link present" {
  run grep -c "systemtest" "$PROJECT_DIR/website/src/pages/admin/monitoring.astro"
  refute_output "0"
}
EOF
```

- [ ] **Step 1.2: Run tests — expect most to fail**

```bash
./tests/unit/lib/bats-core/bin/bats tests/unit/admin-nav.bats
```

Expected: ~10 failures for removed items still present, ~8 failures for consolidation tabs not yet added. `buchung in navItems` passes since Buchung is already there.

- [ ] **Step 1.3: Commit the test file**

```bash
git add tests/unit/admin-nav.bats
git commit -m "test(admin-nav): add failing nav structure assertions"
```

---

### Task 2: Clean up `AdminLayout.astro`

**Files:**
- Modify: `website/src/layouts/AdminLayout.astro` (navGroups at lines 82–157)

- [ ] **Step 2.1: Remove 2 items from Klienten group**

In `website/src/layouts/AdminLayout.astro`, find the `Klienten` group (around line 96). Remove these two lines:

```typescript
      { href: '/admin/meetings',  label: 'Meetings',  icon: 'calendar2', matches: ['/admin/meetings'] },
      { href: '/admin/kalender',  label: 'Kalender',  icon: 'calendar2' },
```

After edit the Klienten items array must be exactly:
```typescript
      { href: '/admin/clients',   label: 'Klienten',  icon: 'users' },
      { href: '/admin/projekte',  label: 'Projekte',  icon: 'folder',    matches: ['/admin/projekte'] },
      { href: '/admin/followups', label: 'Followups', icon: 'clock' },
```

- [ ] **Step 2.2: Remove 2 items from Coaching group**

Find the `Coaching` group (around line 104). Remove these two lines:

```typescript
      { href: '/admin/coaching/projekte',  label: 'Projekte',          icon: 'folder',    matches: ['/admin/coaching/projekte'] },
      { href: '/admin/coaching/settings',  label: 'KI-Einstellungen',  icon: 'settings',  matches: ['/admin/coaching/settings'] },
```

After edit the Coaching items array must be exactly:
```typescript
      { href: '/admin/coaching/sessions',  label: 'Sessions',  icon: 'clipboard', matches: ['/admin/coaching/sessions', '/admin/fragebogen'] },
      { href: '/admin/brett',              label: 'Brett',     icon: 'brett',     matches: ['/admin/brett'] },
```

- [ ] **Step 2.3: Remove 2 items from Geld group**

Find the `Geld` group (around line 138). Remove these two lines:

```typescript
      { href: '/admin/zeiterfassung', label: 'Zeiterfassung', icon: 'clock' },
      { href: '/admin/steuer',        label: 'Steuer',        icon: 'scale' },
```

After edit the Geld items array must be exactly:
```typescript
      { href: '/admin/rechnungen',    label: 'Rechnungen',    icon: 'receipt', matches: ['/admin/rechnungen', '/admin/billing'] },
      { href: '/admin/buchhaltung',   label: 'Buchhaltung',   icon: 'scale' },
```

- [ ] **Step 2.4: Remove 3 items from Plattform group + fix Einstellungen icon**

Find the `Plattform` group (around line 148). Remove these three lines:

```typescript
      { href: '/admin/software-history',                 label: 'Software-History',  icon: 'clipboard' },
      { href: '/admin/systemtest/board',                 label: 'Systemtest',        icon: 'clipboard', matches: ['/admin/systemtest'] },
      { href: '/admin/arena',                            label: 'Arena',             icon: 'broadcast' },
```

Then change the Einstellungen entry's icon from `'bell'` to `'settings'`:

```typescript
      // Before:
      { href: '/admin/einstellungen/benachrichtigungen', label: 'Einstellungen',     icon: 'bell',     matches: ['/admin/einstellungen/'] },
      // After:
      { href: '/admin/einstellungen/benachrichtigungen', label: 'Einstellungen',     icon: 'settings', matches: ['/admin/einstellungen/'] },
```

After edit the Plattform items array must be exactly:
```typescript
      { href: '/admin/monitoring',                       label: 'Monitoring',        icon: 'monitor' },
      { href: '/admin/ops',                              label: 'Cluster-Steuerung', icon: 'server' },
      { href: '/admin/einstellungen/benachrichtigungen', label: 'Einstellungen',     icon: 'settings', matches: ['/admin/einstellungen/'] },
```

- [ ] **Step 2.5: Run the BATS tests — expect the 10 AdminLayout tests to pass now**

```bash
./tests/unit/lib/bats-core/bin/bats tests/unit/admin-nav.bats
```

Expected: The 10 tests about AdminLayout items removed + icon should now pass. The 8 consolidation tab tests still fail.

- [ ] **Step 2.6: Commit**

```bash
git add website/src/layouts/AdminLayout.astro
git commit -m "feat(admin-nav): remove 9 redundant items, fix Einstellungen icon to gear"
```

---

### Task 3: Clean up `PortalLayout.astro`

**Files:**
- Modify: `website/src/layouts/PortalLayout.astro` (navItems at lines 41–50)

- [ ] **Step 3.1: Remove Arena from navItems**

In `website/src/layouts/PortalLayout.astro`, find the `navItems` array and remove:

```typescript
  { id: 'arena',       label: 'Arena',       icon: 'broadcast' },
```

After edit the `navItems` array must be exactly:
```typescript
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

- [ ] **Step 3.2: Run BATS — portal tests pass**

```bash
./tests/unit/lib/bats-core/bin/bats tests/unit/admin-nav.bats
```

Expected: `PortalLayout: arena not in navItems` and `PortalLayout: buchung present in navItems` both pass.

- [ ] **Step 3.3: Commit**

```bash
git add website/src/layouts/PortalLayout.astro
git commit -m "feat(portal-nav): remove Arena, keep Buchung"
```

---

### Task 4: Add "Coaching & KI" tab to `AdminEinstellungenTabs.astro`

**Files:**
- Modify: `website/src/components/AdminEinstellungenTabs.astro`

- [ ] **Step 4.1: Add the new tab entry**

In `website/src/components/AdminEinstellungenTabs.astro`, add a new entry to the `tabs` array after the `backup` entry:

```typescript
const tabs = [
  { href: '/admin/einstellungen/benachrichtigungen', label: 'Benachrichtigungen' },
  { href: '/admin/einstellungen/email',              label: 'E-Mail' },
  { href: '/admin/einstellungen/rechnungen',         label: 'Rechnungen' },
  { href: '/admin/einstellungen/branding',           label: 'Branding' },
  { href: '/admin/einstellungen/backup',             label: 'Backup' },
  { href: '/admin/coaching/settings',                label: 'Coaching & KI' },
];
```

- [ ] **Step 4.2: Run BATS — Einstellungen tab test passes**

```bash
./tests/unit/lib/bats-core/bin/bats tests/unit/admin-nav.bats
```

Expected: `AdminEinstellungenTabs: Coaching & KI tab present` passes.

- [ ] **Step 4.3: Commit**

```bash
git add website/src/components/AdminEinstellungenTabs.astro
git commit -m "feat(einstellungen): add Coaching & KI tab linking to /admin/coaching/settings"
```

---

### Task 5: Add tab-bars to Termine and Klienten pages

**Files:**
- Modify: `website/src/pages/admin/termine.astro` (insert after line 100)
- Modify: `website/src/pages/admin/clients.astro` (insert after line 38)

The tab-bar style matches `AdminEinstellungenTabs.astro` exactly: active tab gets `border-bottom:2px solid var(--brass);color:var(--brass)`, inactive gets `border-bottom:2px solid transparent;color:var(--fg-soft)`.

- [ ] **Step 5.1: Add tab-bar to `termine.astro`**

In `website/src/pages/admin/termine.astro`, insert immediately after the `<AdminLayout title="Admin — Termine">` opening tag (line 100):

```html
  <div style="border-bottom:1px solid var(--line);padding:0 2rem;display:flex;gap:0;overflow-x:auto;flex-shrink:0;">
    <a href="/admin/termine" style="display:inline-flex;align-items:center;padding:12px 16px;font-size:13px;font-weight:500;border-bottom:2px solid var(--brass);color:var(--brass);text-decoration:none;white-space:nowrap;margin-bottom:-1px;">Termine</a>
    <a href="/admin/kalender" style="display:inline-flex;align-items:center;padding:12px 16px;font-size:13px;font-weight:500;border-bottom:2px solid transparent;color:var(--fg-soft);text-decoration:none;white-space:nowrap;transition:color 0.15s ease,border-color 0.15s ease;margin-bottom:-1px;">Kalender</a>
  </div>
```

- [ ] **Step 5.2: Add tab-bar to `clients.astro`**

In `website/src/pages/admin/clients.astro`, insert immediately after the `<AdminLayout title="Admin — Clients">` opening tag (line 38):

```html
  <div style="border-bottom:1px solid var(--line);padding:0 2rem;display:flex;gap:0;overflow-x:auto;flex-shrink:0;">
    <a href="/admin/clients" style="display:inline-flex;align-items:center;padding:12px 16px;font-size:13px;font-weight:500;border-bottom:2px solid var(--brass);color:var(--brass);text-decoration:none;white-space:nowrap;margin-bottom:-1px;">Klienten</a>
    <a href="/admin/meetings" style="display:inline-flex;align-items:center;padding:12px 16px;font-size:13px;font-weight:500;border-bottom:2px solid transparent;color:var(--fg-soft);text-decoration:none;white-space:nowrap;transition:color 0.15s ease,border-color 0.15s ease;margin-bottom:-1px;">Meetings</a>
  </div>
```

- [ ] **Step 5.3: Run BATS — both tab tests pass**

```bash
./tests/unit/lib/bats-core/bin/bats tests/unit/admin-nav.bats
```

Expected: `termine.astro: Kalender tab present` and `clients.astro: Meetings tab present` pass.

- [ ] **Step 5.4: Commit**

```bash
git add website/src/pages/admin/termine.astro website/src/pages/admin/clients.astro
git commit -m "feat(admin-nav): add Kalender tab to Termine, Meetings tab to Klienten"
```

---

### Task 6: Add tab-bars to Sessions, Rechnungen, and Buchhaltung

**Files:**
- Modify: `website/src/pages/admin/coaching/sessions/index.astro` (insert after line 19)
- Modify: `website/src/pages/admin/rechnungen.astro` (insert after line 86)
- Modify: `website/src/pages/admin/buchhaltung.astro` (insert after line 11)

- [ ] **Step 6.1: Add tab-bar to `coaching/sessions/index.astro`**

Insert immediately after `<AdminLayout title="Coaching-Sessions">` (line 19):

```html
  <div style="border-bottom:1px solid var(--line);padding:0 2rem;display:flex;gap:0;overflow-x:auto;flex-shrink:0;">
    <a href="/admin/coaching/sessions" style="display:inline-flex;align-items:center;padding:12px 16px;font-size:13px;font-weight:500;border-bottom:2px solid var(--brass);color:var(--brass);text-decoration:none;white-space:nowrap;margin-bottom:-1px;">Sessions</a>
    <a href="/admin/coaching/projekte" style="display:inline-flex;align-items:center;padding:12px 16px;font-size:13px;font-weight:500;border-bottom:2px solid transparent;color:var(--fg-soft);text-decoration:none;white-space:nowrap;transition:color 0.15s ease,border-color 0.15s ease;margin-bottom:-1px;">Projekte</a>
  </div>
```

- [ ] **Step 6.2: Add tab-bar to `rechnungen.astro`**

Insert immediately after `<AdminLayout title="Admin — Rechnungen">` (line 86):

```html
  <div style="border-bottom:1px solid var(--line);padding:0 2rem;display:flex;gap:0;overflow-x:auto;flex-shrink:0;">
    <a href="/admin/rechnungen" style="display:inline-flex;align-items:center;padding:12px 16px;font-size:13px;font-weight:500;border-bottom:2px solid var(--brass);color:var(--brass);text-decoration:none;white-space:nowrap;margin-bottom:-1px;">Rechnungen</a>
    <a href="/admin/zeiterfassung" style="display:inline-flex;align-items:center;padding:12px 16px;font-size:13px;font-weight:500;border-bottom:2px solid transparent;color:var(--fg-soft);text-decoration:none;white-space:nowrap;transition:color 0.15s ease,border-color 0.15s ease;margin-bottom:-1px;">Zeiterfassung</a>
  </div>
```

- [ ] **Step 6.3: Add tab-bar to `buchhaltung.astro`**

Insert immediately after `<AdminLayout title="Buchhaltung / EÜR">` (line 11):

```html
  <div style="border-bottom:1px solid var(--line);padding:0 2rem;display:flex;gap:0;overflow-x:auto;flex-shrink:0;">
    <a href="/admin/buchhaltung" style="display:inline-flex;align-items:center;padding:12px 16px;font-size:13px;font-weight:500;border-bottom:2px solid var(--brass);color:var(--brass);text-decoration:none;white-space:nowrap;margin-bottom:-1px;">Buchhaltung</a>
    <a href="/admin/steuer" style="display:inline-flex;align-items:center;padding:12px 16px;font-size:13px;font-weight:500;border-bottom:2px solid transparent;color:var(--fg-soft);text-decoration:none;white-space:nowrap;transition:color 0.15s ease,border-color 0.15s ease;margin-bottom:-1px;">Steuer</a>
  </div>
```

- [ ] **Step 6.4: Run BATS — all three tab tests pass**

```bash
./tests/unit/lib/bats-core/bin/bats tests/unit/admin-nav.bats
```

Expected: `coaching/sessions/index.astro: Projekte tab present`, `rechnungen.astro: Zeiterfassung tab present`, `buchhaltung.astro: Steuer tab present` all pass.

- [ ] **Step 6.5: Commit**

```bash
git add website/src/pages/admin/coaching/sessions/index.astro \
        website/src/pages/admin/rechnungen.astro \
        website/src/pages/admin/buchhaltung.astro
git commit -m "feat(admin-nav): add Projekte/Zeiterfassung/Steuer tabs to Sessions/Rechnungen/Buchhaltung"
```

---

### Task 7: Add Software-History + Systemtest link-cards to Monitoring

**Files:**
- Modify: `website/src/pages/admin/monitoring.astro` (insert before `</div>` on line 20)

- [ ] **Step 7.1: Add link-cards to `monitoring.astro`**

In `website/src/pages/admin/monitoring.astro`, replace the closing `</div></section></AdminLayout>` block so the full file reads:

```astro
---
import AdminLayout from '../../layouts/AdminLayout.astro';
import MonitoringDashboard from '../../components/admin/MonitoringDashboard.svelte';
import { getSession, isAdmin, getLoginUrl } from '../../lib/auth';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');
---

<AdminLayout title="Monitoring">
  <section class="pt-8 pb-20 px-4 sm:px-6 bg-dark min-h-screen">
    <div class="max-w-7xl mx-auto">
      <div class="mb-6">
        <h1 class="text-2xl font-bold text-light font-serif">Monitoring</h1>
        <p class="text-muted text-sm mt-1">Cluster, Tests & Bugs</p>
      </div>
      <MonitoringDashboard client:load />
      <div style="margin-top:2rem;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:1rem;">
        <a href="/admin/software-history" style="display:flex;align-items:center;gap:10px;padding:14px 16px;background:rgba(255,255,255,.04);border:1px solid var(--line);border-radius:10px;text-decoration:none;color:var(--fg-soft);font-size:13px;font-weight:500;transition:background 0.15s ease;">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;flex-shrink:0;color:var(--mute);" aria-hidden="true"><rect x="2" y="2" width="12" height="4.5" rx="1"/><rect x="2" y="9.5" width="12" height="4.5" rx="1"/><circle cx="12.5" cy="4.25" r=".75" fill="currentColor" stroke="none"/><circle cx="12.5" cy="11.75" r=".75" fill="currentColor" stroke="none"/></svg>
          Software-History
        </a>
        <a href="/admin/systemtest/board" style="display:flex;align-items:center;gap:10px;padding:14px 16px;background:rgba(255,255,255,.04);border:1px solid var(--line);border-radius:10px;text-decoration:none;color:var(--fg-soft);font-size:13px;font-weight:500;transition:background 0.15s ease;">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;flex-shrink:0;color:var(--mute);" aria-hidden="true"><path d="M5.5 2.5h5v2.5h-5V2.5z"/><rect x="3" y="2.5" width="10" height="12" rx="1"/><path d="M5.5 7.5h5M5.5 10.5h5M5.5 13.5h3"/></svg>
          Systemtest
        </a>
      </div>
    </div>
  </section>
</AdminLayout>
```

- [ ] **Step 7.2: Run BATS — all 22 tests pass**

```bash
./tests/unit/lib/bats-core/bin/bats tests/unit/admin-nav.bats
```

Expected: All 22 tests pass with 0 failures.

- [ ] **Step 7.3: Commit**

```bash
git add website/src/pages/admin/monitoring.astro
git commit -m "feat(admin-nav): add Software-History + Systemtest link-cards to Monitoring"
```

---

### Task 8: Verify with dev server + PR

**Files:** None — verification only.

- [ ] **Step 8.1: Run full offline test suite**

```bash
task test:all
```

Expected: All tests green. The `fa-admin-crm.spec.ts` still contains `/admin/kalender` and `/admin/meetings` in its auth-redirect checks — those pages still exist at their URLs, so those tests continue to pass unaffected.

- [ ] **Step 8.2: Start dev server and verify the menus visually**

```bash
task website:dev
```

Open `http://localhost:4321/admin` in a browser and verify:
- Admin sidebar shows exactly: Dashboard, then groups Tagesgeschäft (6), Klienten (3), Coaching (2), Wissen & Inhalte (4), Geld (2), Plattform (3)
- Einstellungen shows a gear icon, not a bell
- `/admin/termine` has a "Kalender" tab that navigates to `/admin/kalender`
- `/admin/clients` has a "Meetings" tab that navigates to `/admin/meetings`
- `/admin/coaching/sessions` has a "Projekte" tab
- `/admin/rechnungen` has a "Zeiterfassung" tab
- `/admin/buchhaltung` has a "Steuer" tab
- `/admin/monitoring` shows two link-cards at the bottom
- `/admin/einstellungen/benachrichtigungen` shows a "Coaching & KI" tab in the tab-bar

Open `http://localhost:4321/portal` and verify: Dashboard, Dateien, Fragebögen, Verträge, Kalender, Rechnungen, Buchung — no Arena.

- [ ] **Step 8.3: Create PR**

```bash
git push -u origin feature/admin-menu-cleanup
gh pr create \
  --title "feat(admin-nav): remove redundant items, consolidate via tabs" \
  --body "$(cat <<'EOF'
## Summary
- Removes 9 items from admin sidebar (33 → 21 items across 6 groups): Meetings, Kalender, Coaching→Projekte, KI-Einstellungen, Zeiterfassung, Steuer, Software-History, Systemtest, Arena
- Fixes Einstellungen icon from bell → gear
- Removes Arena from portal nav; keeps Buchung
- Each removed item stays reachable via a tab or link-card on the nearest related page
- Adds 22 BATS assertions to guard nav structure going forward

## Consolidation map
| Removed | Now reachable from |
|---|---|
| Meetings | Klienten page → Meetings tab |
| Kalender | Termine page → Kalender tab |
| Coaching → Projekte | Sessions page → Projekte tab |
| KI-Einstellungen | Einstellungen → Coaching & KI tab |
| Zeiterfassung | Rechnungen page → Zeiterfassung tab |
| Steuer | Buchhaltung page → Steuer tab |
| Software-History + Systemtest | Monitoring page → link-cards |

## Test plan
- [ ] `./tests/unit/lib/bats-core/bin/bats tests/unit/admin-nav.bats` — 22/22 pass
- [ ] `task test:all` — green
- [ ] Visual check: admin sidebar item counts per group match spec
- [ ] Visual check: portal nav has Buchung, no Arena
- [ ] Navigate to each tab link and confirm target page loads
EOF
)"
```
