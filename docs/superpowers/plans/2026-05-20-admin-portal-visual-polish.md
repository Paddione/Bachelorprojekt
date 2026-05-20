---
ticket_id: T000068
title: Admin + Portal Visual Polish Implementation Plan
domains: []
status: active
pr_number: null
---

# Admin + Portal Visual Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the admin sidebar, admin dashboard (mentolder brand), and user portal sidebar the same visual energy as the Platform Control Center — per-section colored icon tint containers, correctly-sized icons, and KPI/service tiles built on admin-premium tokens.

**Architecture:** Four files only. CSS tint classes land in `admin-premium.css` and cascade automatically via `[class*="nav-icon-"]`. `AdminLayout.astro` adds `iconClass` per group; `PortalLayout.astro` adds a compile-time color map and fixes inline sizes; `admin.astro` replaces the mentolder dashboard section with admin-premium markup.

**Tech Stack:** Astro, Svelte, `admin-premium.css` CSS custom properties, `color-mix()` (all modern browsers)

---

## File Map

| File | Change |
|---|---|
| `website/src/styles/admin-premium.css` | Add `.nav-icon-*` tint system (18 lines after existing `.nav-icon` block) |
| `website/src/layouts/AdminLayout.astro` | Add `iconClass` to `navGroups` type + data; update two `<span class="nav-icon">` lines |
| `website/src/layouts/PortalLayout.astro` | Add `portalIconColors` map; fix all 8 SVG stroke-widths; fix icon sizes and add tint; fix konto footer icon |
| `website/src/pages/admin.astro` | Add `color` to `adminLinks`; rewrite mentolder `else` branch (lines 178–207); remove unused `ServiceLinks` import |

---

## Task 1: CSS Tint Container System

**Files:**
- Modify: `website/src/styles/admin-premium.css:64-75`

- [ ] **Step 1: Add tint classes after the existing `.nav-icon` block**

Open `website/src/styles/admin-premium.css`. After line 75 (the closing `}` of `.sidebar-nav-item:hover .nav-icon`), insert:

```css
/* Per-group icon tint containers */
.nav-icon-kern      { --ni-color: oklch(0.80 0.09 75); }
.nav-icon-crm       { --ni-color: #2dd4bf; }
.nav-icon-coaching  { --ni-color: #a78bfa; }
.nav-icon-redaktion { --ni-color: #38bdf8; }
.nav-icon-kapital   { --ni-color: #34d399; }
.nav-icon-kontrolle { --ni-color: #818cf8; }

[class*="nav-icon-"] {
  border-radius: 8px;
  padding: 5px;
  background: color-mix(in srgb, var(--ni-color) 12%, transparent);
  color: color-mix(in srgb, var(--ni-color) 70%, transparent);
}

.sidebar-nav-item:hover [class*="nav-icon-"],
.sidebar-nav-item.is-active [class*="nav-icon-"] {
  background: color-mix(in srgb, var(--ni-color) 18%, transparent);
  color: var(--ni-color);
}
```

- [ ] **Step 2: Verify file compiles (no syntax errors)**

```bash
node -e "require('fs').readFileSync('website/src/styles/admin-premium.css','utf8')" && echo "OK"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git -C /tmp/wt-admin-portal-visual-polish add website/src/styles/admin-premium.css
git -C /tmp/wt-admin-portal-visual-polish commit -m "feat(ui): add nav-icon tint container CSS system"
```

---

## Task 2: Admin Sidebar — Add Group Icon Classes

**Files:**
- Modify: `website/src/layouts/AdminLayout.astro:83` (type), `AdminLayout.astro:83-129` (data), `AdminLayout.astro:231,246` (template)

- [ ] **Step 1: Extend the `navGroups` type to include `iconClass`**

In `AdminLayout.astro`, change line 83 from:

```typescript
const navGroups: { label: string; items: NavItem[] }[] = [
```

to:

```typescript
const navGroups: { label: string; iconClass: string; items: NavItem[] }[] = [
```

- [ ] **Step 2: Add `iconClass` to each group object**

Replace the entire `navGroups` array (lines 83–129) with:

```typescript
const navGroups: { label: string; iconClass: string; items: NavItem[] }[] = [
  {
    label: 'Kern',
    iconClass: 'nav-icon-kern',
    items: [
      { href: '/admin/termine',     label: 'Kalender',     icon: 'calendar' },
      { href: '/admin/tickets',     label: 'Anfragen',     icon: 'tag' },
      { href: '/admin/inbox',       label: 'Postfach',     icon: 'inbox',     badge: inboxPending },
      { href: '/admin/live',        label: 'Live-Stream',  icon: 'broadcast' },
    ],
  },
  {
    label: 'CRM',
    iconClass: 'nav-icon-crm',
    items: [
      { href: '/admin/clients',   label: 'Klienten',  icon: 'users' },
      { href: '/admin/projekte',  label: 'Mandate',   icon: 'folder' },
    ],
  },
  {
    label: 'Coaching',
    iconClass: 'nav-icon-coaching',
    items: [
      { href: '/admin/coaching/sessions',  label: 'Sitzungen',   icon: 'clipboard', matches: ['/admin/coaching/sessions', '/admin/fragebogen'] },
      { href: '/admin/brett',              label: 'Systembrett', icon: 'brett' },
    ],
  },
  {
    label: 'Redaktion',
    iconClass: 'nav-icon-redaktion',
    items: [
      { href: '/admin/inhalte',           label: 'Content Hub', icon: 'layout', matches: ['/admin/inhalte', '/admin/startseite', '/admin/uebermich', '/admin/angebote', '/admin/faq', '/admin/kontakt', '/admin/referenzen', '/admin/rechtliches', '/admin/dokumente'] },
      { href: '/admin/knowledge/drafts',  label: 'Entwürfe',    icon: 'edit',   badge: draftsPending },
      { href: '/admin/assets',            label: 'Assets',      icon: 'palette' },
    ],
  },
  {
    label: 'Kapital',
    iconClass: 'nav-icon-kapital',
    items: [
      { href: '/admin/rechnungen',  label: 'Fakturierung', icon: 'receipt', matches: ['/admin/rechnungen', '/admin/billing'] },
      { href: '/admin/buchhaltung', label: 'Kontierung',   icon: 'scale' },
    ],
  },
  {
    label: 'Kontrollzentrum',
    iconClass: 'nav-icon-kontrolle',
    items: [
      { href: '/admin/platform',                            label: 'Plattform Hub', icon: 'monitor', matches: ['/admin/monitoring', '/admin/ops', '/admin/platform'] },
      { href: '/admin/einstellungen/benachrichtigungen',    label: 'System-Setup',  icon: 'settings', matches: ['/admin/einstellungen/'] },
    ],
  },
];
```

- [ ] **Step 3: Apply `nav-icon-kern` to the standalone Dashboard link**

Change line 231 from:

```astro
<span class="nav-icon" set:html={icons.dashboard} />
```

to:

```astro
<span class="nav-icon nav-icon-kern" set:html={icons.dashboard} />
```

- [ ] **Step 4: Apply group's `iconClass` to group nav items**

Change line 246 from:

```astro
<span class="nav-icon" set:html={icons[item.icon]} />
```

to:

```astro
<span class={`nav-icon ${group.iconClass}`} set:html={icons[item.icon]} />
```

- [ ] **Step 5: Commit**

```bash
git -C /tmp/wt-admin-portal-visual-polish add website/src/layouts/AdminLayout.astro
git -C /tmp/wt-admin-portal-visual-polish commit -m "feat(ui): apply per-group tint classes to admin sidebar icons"
```

---

## Task 3: Portal Sidebar — Icon Sizes + Tint Containers

**Files:**
- Modify: `website/src/layouts/PortalLayout.astro:22-31` (SVG stroke), `PortalLayout.astro:41-49` (color map), `PortalLayout.astro:185-194` (nav icon), `PortalLayout.astro:232-239` (konto icon)

- [ ] **Step 1: Add the portal icon color map after the `navItems` array**

In `PortalLayout.astro`, after line 49 (closing `];` of `navItems`), insert:

```typescript
const portalIconColors: Record<string, string> = {
  overview:       'var(--brass)',
  dateien:        '#38bdf8',
  'fragebögen':   '#a78bfa',
  vertraege:      '#34d399',
  kalender:       'var(--brass)',
  rechnungen:     '#34d399',
  buchung:        '#2dd4bf',
  konto:          'var(--brass)',
};
```

- [ ] **Step 2: Fix stroke-width on all 8 portal SVG icons**

In the `icons` object (lines 23–31), replace every instance of `stroke-width="1.2"` with `stroke-width="1.5"`. There are exactly 8 occurrences (overview, dateien, unterschriften, fragebögen, kalender, rechnungen, buchung, konto).

Use replace-all: change `stroke-width="1.2"` → `stroke-width="1.5"` in this file.

Verify:

```bash
grep -c 'stroke-width="1.2"' /tmp/wt-admin-portal-visual-polish/website/src/layouts/PortalLayout.astro
```
Expected: `0`

- [ ] **Step 3: Fix the main nav item row padding and gap**

Change the `<a>` style in the nav map (line ~187) from:

```astro
style={`display:flex; align-items:center; gap:9px; padding:7px 9px; border-radius:7px; text-decoration:none; font-size:12.5px; font-weight:500; transition:background 0.1s ease, color 0.1s ease; ${
  active ? 'background:var(--brass-d); color:var(--brass);' : 'color:var(--mute);'
}`}
```

to:

```astro
style={`display:flex; align-items:center; gap:10px; padding:8px 10px; border-radius:7px; text-decoration:none; font-size:12.5px; font-weight:500; transition:background 0.1s ease, color 0.1s ease; ${
  active ? 'background:var(--brass-d); color:var(--brass);' : 'color:var(--mute);'
}`}
```

- [ ] **Step 4: Fix the main nav icon span — size + tint container**

Change the `.nav-icon` span (lines ~192–194) from:

```astro
<span
  class="nav-icon"
  style={`width:15px; height:15px; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:color 0.1s ease; ${active ? 'color:var(--brass);' : 'color:var(--mute);'}`}
  set:html={icons[item.icon]}
/>
```

to:

```astro
<span
  class="nav-icon"
  style={`width:20px; height:20px; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:color 0.1s ease, background 0.1s ease; border-radius:8px; padding:5px; ${
    active
      ? 'background:transparent; color:var(--brass);'
      : `background:color-mix(in srgb, ${portalIconColors[item.id] ?? 'var(--brass)'} 12%, transparent); color:color-mix(in srgb, ${portalIconColors[item.id] ?? 'var(--brass)'} 70%, transparent);`
  }`}
  set:html={icons[item.icon]}
/>
```

- [ ] **Step 5: Fix the footer konto icon — size + tint container**

In the footer section (~line 237), change the konto `.nav-icon` span from:

```astro
<span
  class="nav-icon"
  style={`flex-shrink:0; width:14px; height:14px; display:flex; align-items:center; justify-content:center; ${section === 'konto' ? 'color:var(--brass);' : 'color:var(--mute);'}`}
  set:html={icons['konto']}
/>
```

to:

```astro
<span
  class="nav-icon"
  style={`flex-shrink:0; width:20px; height:20px; display:flex; align-items:center; justify-content:center; transition:color 0.1s ease, background 0.1s ease; border-radius:8px; padding:5px; ${
    section === 'konto'
      ? 'background:transparent; color:var(--brass);'
      : `background:color-mix(in srgb, var(--brass) 12%, transparent); color:color-mix(in srgb, var(--brass) 70%, transparent);`
  }`}
  set:html={icons['konto']}
/>
```

- [ ] **Step 6: Commit**

```bash
git -C /tmp/wt-admin-portal-visual-polish add website/src/layouts/PortalLayout.astro
git -C /tmp/wt-admin-portal-visual-polish commit -m "feat(ui): fix portal sidebar icon sizes and add tint containers"
```

---

## Task 4: Admin Dashboard — Premium Redesign (mentolder branch)

**Files:**
- Modify: `website/src/pages/admin.astro:8` (remove import), `admin.astro:75-91` (add color to adminLinks), `admin.astro:178-207` (rewrite mentolder section)

- [ ] **Step 1: Remove the unused `ServiceLinks` import**

Change line 8 from:

```typescript
import ServiceLinks from '../components/ServiceLinks.astro';
```

Delete that line entirely. (ServiceLinks is only used in the mentolder branch which is being replaced inline.)

- [ ] **Step 2: Add `color` property to `adminLinks`**

Replace the entire `adminLinks` array (lines 75–91) with:

```typescript
const adminLinks = [
  { href: '/admin/inbox',                                        label: 'Inbox',      icon: SVG.inbox,    color: 'oklch(0.80 0.09 75)' },
  ...(ncBase ? [
    { href: `${ncBase}/apps/files/`,    label: 'Dateien',  icon: SVG.folder,   color: '#38bdf8' },
    { href: `${ncBase}/apps/calendar/`, label: 'Kalender', icon: SVG.calendar, color: 'oklch(0.80 0.09 75)' },
    { href: `${ncBase}/apps/contacts/`, label: 'Kontakte', icon: SVG.contacts, color: '#2dd4bf' },
    { href: `${ncBase}/apps/spreed/`,   label: 'Talk',     icon: SVG.video,    color: '#a78bfa' },
  ] : []),
  ...(bretUrl  ? [{ href: bretUrl,                               label: 'Brett',      icon: SVG.brett,    color: '#a78bfa' }] : []),
  { href: '/portal/arena',                                       label: 'Arena',      icon: SVG.arena,    color: '#818cf8' },
  { href: '/admin/rechnungen',                                   label: 'Abrechnung', icon: SVG.receipt,  color: '#34d399' },
  ...(vaultUrl ? [{ href: vaultUrl,                              label: 'Passwörter', icon: SVG.lock,     color: '#34d399' }] : []),
  ...(authUrl  ? [{ href: `${authUrl}/admin/workspace/console/`, label: 'Keycloak',   icon: SVG.key,      color: '#818cf8' }] : []),
  ...(docsUrl  ? [{ href: docsUrl,                               label: 'Docs',       icon: SVG.book,     color: '#38bdf8' }] : []),
  { href: '/admin/monitoring',                                   label: 'Monitoring', icon: SVG.dashboard, color: 'oklch(0.80 0.09 75)' },
  ...(mailUrl  ? [{ href: mailUrl,                               label: 'Mailpit',    icon: SVG.mail,     color: '#2dd4bf' }] : []),
];
```

- [ ] **Step 3: Rewrite the mentolder dashboard section**

Replace lines 178–207 (from `) : (` to the closing `)}`) with:

```astro
  ) : (
    <section style="padding:2.5rem 0 5rem; min-height:100vh;">
      <div style="max-width:56rem; margin:0 auto; padding:0 1.5rem;">

        <!-- Header -->
        <div style="margin-bottom:2.5rem;">
          <p style="font-family:var(--font-mono); font-size:0.7rem; color:var(--admin-text-disabled); text-transform:uppercase; letter-spacing:0.15em; margin:0 0 4px;">
            Verwaltung &amp; Werkzeuge
          </p>
          <h1 style="font-family:var(--font-serif); font-size:2rem; font-weight:700; color:var(--admin-text); letter-spacing:-0.02em; margin:0;">Admin</h1>
        </div>

        <!-- KPI Banner -->
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(11rem, 1fr)); gap:0.75rem; margin-bottom:2rem;">
          {kpis.map(k => (
            <a href={k.href} class="admin-card" style={`text-decoration:none; display:block; border-left:3px solid ${
              k.state === 'is-ok'   ? '#34d399' :
              k.state === 'is-warn' ? 'oklch(0.80 0.09 75)' :
              k.state === 'is-fail' ? '#f87171' :
              'var(--admin-border)'
            };`}>
              <div style="font-size:1.5rem; font-weight:700; color:var(--admin-text); line-height:1.2;">{k.value}</div>
              {k.unit && <div style="font-size:0.85rem; font-weight:600; color:var(--admin-text); margin-top:2px;">{k.unit}</div>}
              <div style="font-size:0.7rem; color:var(--admin-text-mute); margin-top:4px;">{k.label}</div>
              <div style="font-size:0.75rem; color:var(--admin-text-disabled); margin-top:2px;">{k.suffix}</div>
            </a>
          ))}
        </div>

        <!-- Service Links -->
        <div class="admin-card" style="margin-bottom:1.5rem;">
          <p style="font-family:var(--font-mono); font-size:0.65rem; color:var(--admin-text-disabled); text-transform:uppercase; letter-spacing:0.12em; margin:0 0 1rem;">Dienste</p>
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(7rem, 1fr)); gap:0.75rem;">
            {adminLinks.map(l => (
              <a
                href={l.href}
                target={l.href.startsWith('http') ? '_blank' : undefined}
                rel={l.href.startsWith('http') ? 'noopener' : undefined}
                class="admin-card"
                style="display:flex; flex-direction:column; align-items:center; gap:8px; text-decoration:none; text-align:center; padding:1rem;"
              >
                <span
                  style={`width:20px; height:20px; display:flex; align-items:center; justify-content:center; border-radius:8px; padding:5px; background:color-mix(in srgb, ${l.color} 12%, transparent); color:${l.color};`}
                  set:html={l.icon}
                />
                <span style="font-size:11px; color:var(--admin-text-mute);">{l.label}</span>
              </a>
            ))}
          </div>
        </div>

        <!-- Custom Shortcuts -->
        <div class="admin-card">
          <p style="font-family:var(--font-mono); font-size:0.65rem; color:var(--admin-text-disabled); text-transform:uppercase; letter-spacing:0.12em; margin:0 0 1rem;">Schnellzugriffe</p>
          <AdminShortcuts client:load links={shortcuts} />
        </div>

      </div>
    </section>
  )}
</AdminLayout>
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /tmp/wt-admin-portal-visual-polish/website && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors (or only pre-existing unrelated errors)

- [ ] **Step 5: Commit**

```bash
git -C /tmp/wt-admin-portal-visual-polish add website/src/pages/admin.astro
git -C /tmp/wt-admin-portal-visual-polish commit -m "feat(ui): premium redesign mentolder admin dashboard"
```

---

## Task 5: Smoke Test + Visual Verification

**Files:** none — verification only

- [ ] **Step 1: Run offline tests**

```bash
cd /tmp/wt-admin-portal-visual-polish && task test:all 2>&1 | tail -20
```
Expected: all tests pass (no changes to logic or manifests)

- [ ] **Step 2: Start dev server**

```bash
cd /tmp/wt-admin-portal-visual-polish/website && task website:dev
```
Open browser. Check these pages:

| Page | What to verify |
|---|---|
| `/admin` (mentolder brand) | Header uses serif font + mono label; KPI cards have colored left borders; service tiles have tinted icon containers |
| `/admin` sidebar | Dashboard icon has brass tint bubble; Kern group icons brass; CRM icons teal; Coaching violet; Redaktion sky; Kapital emerald; Kontrollzentrum indigo |
| `/portal` | Nav icons are 20px (visibly larger than before); overview = brass tint; dateien = sky; fragebögen = violet; vertraege = emerald; kalender = brass; rechnungen = emerald; buchung = teal; konto footer = brass |
| Active state (both) | Active items lose the tint background (replaced by row highlight on portal, left-bar on admin) — no tint-on-tint clash |
| Hover state (admin) | Icon container brightens from 12% → 18% and icon strokes go full brightness |

- [ ] **Step 3: Commit verification note and push**

```bash
git -C /tmp/wt-admin-portal-visual-polish push -u origin feature/admin-portal-visual-polish
```

---

## Task 6: PR

- [ ] **Step 1: Create PR**

```bash
gh pr create \
  --title "feat(ui): admin + portal visual polish — colored icon tints, premium dashboard" \
  --body "$(cat <<'EOF'
## Summary
- Admin sidebar icons get per-group tint containers (brass/teal/violet/sky/emerald/indigo) via new `.nav-icon-*` CSS classes in `admin-premium.css`
- Portal sidebar icons bumped from 15px → 20px, stroke-width 1.2 → 1.5, tint containers added inline with matching palette
- Mentolder admin dashboard rewritten with `admin-premium` tokens: serif header, colored KPI card left-borders, service tiles with tinted icon containers
- Kore brand unchanged

## Test plan
- [ ] `task test:all` passes (no logic changes)
- [ ] Admin sidebar: each group shows distinct tinted icon color at rest, brightens on hover/active
- [ ] Portal sidebar: icons visibly larger, colored per section
- [ ] Admin dashboard: KPI left-border color matches state (green=ok, brass=warn, red=fail)
- [ ] No regression on Kore admin dashboard

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Merge**

```bash
gh pr merge --squash --delete-branch
git -C /tmp/wt-admin-portal-visual-polish checkout main
git -C /tmp/wt-admin-portal-visual-polish pull --rebase origin main
```

- [ ] **Step 3: Deploy to both clusters**

```bash
task feature:website
```

Verify: `https://web.mentolder.de/admin` and `https://web.mentolder.de/portal` show updated icons.
