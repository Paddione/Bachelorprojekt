---
title: Admin-Menu Rules & Reshuffle Implementation Plan
slug: admin-menu-rules
ticket_id: T000449
domains: [website]
status: active
pr_number: null
---

# Admin-Menu Rules & Reshuffle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Codify 10 admin-menu rules, reshuffle `AdminLayout.astro` to comply (6 groups ≤ 6 items, zero orphans), and add a Schritt 3.5 placement gate to `dev-flow-execute` so future PRs that touch `/admin/*` cannot ship orphan routes.

**Architecture:** Three loosely-coupled changes in one branch — (a) `AdminLayout.astro` reshuffle + missing icons fix, (b) standalone bash gate script `scripts/admin-menu-gate.sh` driven by `git diff` and lightweight awk parsing of the Astro file, (c) skill update inserting Schritt 3.5 in `dev-flow-execute` plus a `task test:menu-gate` for CI parity.

**Tech Stack:** Astro + Svelte (website), Bash + awk + jq (gate), go-task (Taskfile), Markdown (skill doc).

---

## File Structure

**Create:**
- `scripts/admin-menu-gate.sh` — gate executable (parses `AdminLayout.astro` + diffs vs `origin/main`, emits structured report)
- `tests/scripts/admin-menu-gate.bats` — BATS coverage for orphan detection, R4/R5 caps, R2 label hygiene, R7 dashboard cross-ref

**Modify:**
- `website/src/layouts/AdminLayout.astro` — replace `navGroups` array, move Dashboard out as a header, add three missing icons (`folder`, `settings`, `chat`)
- `website/src/pages/admin/coaching/sessions.astro` — surface "Neue Session" as a button on the page (currently linked only via the now-removed sidemenu item)
- `.claude/skills/dev-flow-execute/SKILL.md` — insert "Schritt 3.5: Admin-Menu Placement Gate" between Schritt 3 and Schritt 5
- `Taskfile.yml` — add `test:menu-gate` task (called by `test:all`)

**Reference (no code changes, but read during implementation):**
- `website/src/pages/admin.astro` — confirm KPI hrefs after reshuffle
- `docs/superpowers/specs/2026-05-18-admin-menu-rules-design.md` — single source of truth for rules

---

## Task 1: Add three missing icons

Pre-existing bug — `folder` and `settings` are referenced in the current `navGroups`, never defined. The new menu also needs `chat` (for Räume).

**Files:**
- Modify: `website/src/layouts/AdminLayout.astro:35-65` (the `icons` record)

- [ ] **Step 1: Add `folder`, `settings`, `chat` SVG entries**

Insert these three entries inside the `icons` const (alongside the existing entries, preserve alphabetical-ish order — keep them grouped near related icons):

```typescript
  folder: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4.5a1 1 0 0 1 1-1h3.5l1.5 1.5H13a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z"/></svg>`,
  settings: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2.5"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/></svg>`,
  chat: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3.5h9a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H6L3.5 13v-2.5H3a1 1 0 0 1-1-1z"/><path d="M5.5 5.5h4M5.5 7.5h3"/></svg>`,
```

- [ ] **Step 2: Verify Astro still type-checks**

Run: `cd website && npx astro check --minimumSeverity error 2>&1 | head -30`
Expected: no new errors. (Pre-existing warnings are fine; we only fail on `error`.)

- [ ] **Step 3: Commit**

```bash
git add website/src/layouts/AdminLayout.astro
git commit -m "fix(admin): add missing folder/settings/chat icons referenced by Coaching nav"
```

---

## Task 2: Replace `navGroups` with the target structure

Apply R1–R6 and R8: 6 groups, Dashboard as header, every formerly-orphan static route placed.

**Files:**
- Modify: `website/src/layouts/AdminLayout.astro:79-161` (the `navGroups` const)
- Modify: `website/src/layouts/AdminLayout.astro:163-167` (the `isActive` helper — handle the header link case)

- [ ] **Step 1: Replace the `navGroups` literal**

Replace lines 79–161 with this exact array. Note: Dashboard moves OUT of `navGroups` — it'll be rendered as a header link in Task 3.

```typescript
const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: 'Tagesgeschäft',
    items: [
      { href: '/admin/termine',     label: 'Termine',     icon: 'calendar' },
      { href: '/admin/tickets',     label: 'Tickets',     icon: 'tag' },
      { href: '/admin/inbox',       label: 'Inbox',       icon: 'inbox',     badge: inboxPending },
      { href: '/admin/live',        label: 'Live',        icon: 'broadcast', matches: ['/admin/live'] },
      { href: '/admin/nachrichten', label: 'Nachrichten', icon: 'message' },
      { href: '/admin/raeume',      label: 'Räume',       icon: 'chat' },
    ],
  },
  {
    label: 'Klienten',
    items: [
      { href: '/admin/clients',   label: 'Klienten',  icon: 'users' },
      { href: '/admin/projekte',  label: 'Projekte',  icon: 'folder',    matches: ['/admin/projekte'] },
      { href: '/admin/meetings',  label: 'Meetings',  icon: 'calendar2', matches: ['/admin/meetings'] },
      { href: '/admin/kalender',  label: 'Kalender',  icon: 'calendar2' },
      { href: '/admin/followups', label: 'Followups', icon: 'clock' },
    ],
  },
  {
    label: 'Coaching',
    items: [
      { href: '/admin/coaching/sessions',  label: 'Sessions',          icon: 'clipboard', matches: ['/admin/coaching/sessions', '/admin/fragebogen'] },
      { href: '/admin/coaching/projekte',  label: 'Projekte',          icon: 'folder',    matches: ['/admin/coaching/projekte'] },
      { href: '/admin/brett',              label: 'Brett',             icon: 'brett',     matches: ['/admin/brett'] },
      { href: '/admin/coaching/settings',  label: 'KI-Einstellungen',  icon: 'settings',  matches: ['/admin/coaching/settings'] },
    ],
  },
  {
    label: 'Wissen & Inhalte',
    items: [
      {
        href: '/admin/inhalte',
        label: 'Website-Inhalte',
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
      { href: '/admin/knowledge/books',     label: 'Bücher',   icon: 'book',      matches: ['/admin/knowledge/books'] },
      { href: '/admin/knowledge/drafts',    label: 'Drafts',   icon: 'edit',      matches: ['/admin/knowledge/drafts', '/admin/knowledge/snippets'], badge: draftsPending },
      { href: '/admin/wissensquellen',      label: 'Quellen',  icon: 'clipboard' },
      { href: '/admin/knowledge/templates', label: 'Vorlagen', icon: 'star',      matches: ['/admin/knowledge/templates'] },
    ],
  },
  {
    label: 'Geld',
    items: [
      { href: '/admin/rechnungen',    label: 'Rechnungen',    icon: 'receipt', matches: ['/admin/rechnungen', '/admin/billing'] },
      { href: '/admin/buchhaltung',   label: 'Buchhaltung',   icon: 'scale' },
      { href: '/admin/zeiterfassung', label: 'Zeiterfassung', icon: 'clock' },
      { href: '/admin/steuer',        label: 'Steuer',        icon: 'scale' },
    ],
  },
  {
    label: 'Plattform',
    items: [
      { href: '/admin/monitoring',                       label: 'Monitoring',        icon: 'monitor' },
      { href: '/admin/software-history',                 label: 'Software-History',  icon: 'clipboard' },
      { href: '/admin/systemtest/board',                 label: 'Systemtest',        icon: 'clipboard', matches: ['/admin/systemtest'] },
      { href: '/admin/arena',                            label: 'Arena',             icon: 'broadcast' },
      { href: '/admin/ops',                              label: 'Cluster-Steuerung', icon: 'server' },
      { href: '/admin/einstellungen/benachrichtigungen', label: 'Einstellungen',     icon: 'bell',     matches: ['/admin/einstellungen/'] },
    ],
  },
];
```

- [ ] **Step 2: Adjust `isActive` to handle the standalone Dashboard link**

The Dashboard header link doesn't go through `isActive` anymore (rendered as a separate element in Task 3). Replace the `isActive` function (lines 163–167) with:

```typescript
function isActive(href: string, matches?: string[]): boolean {
  if (matches) return matches.some(m => path === m || path.startsWith(m));
  return path.startsWith(href);
}
```

Removed: the `href === '/admin'` exact-match branch (Dashboard is now a header link with its own active-class logic in Task 3).

- [ ] **Step 3: Commit**

```bash
git add website/src/layouts/AdminLayout.astro
git commit -m "feat(admin): reshuffle sidemenu into 6 task-based groups per menu-rules spec"
```

---

## Task 3: Render Dashboard as a standalone header link

R5 says Dashboard is a header, not a group of one. Move it above the `{navGroups.map(...)}` block in the template.

**Files:**
- Modify: `website/src/layouts/AdminLayout.astro` — the `<aside id="admin-sidebar">` template, specifically where `navGroups` is iterated

- [ ] **Step 1: Find the nav rendering block**

Run: `grep -n 'navGroups.map\|<nav' /home/patrick/Bachelorprojekt/.claude/worktrees/feature+admin-menu-rules/website/src/layouts/AdminLayout.astro`

Locate the `{navGroups.map(...)}` block. The Dashboard header link goes immediately *before* it, inside the same `<nav>` (or sibling block — whichever is the sidebar nav container).

- [ ] **Step 2: Insert the Dashboard header link**

Add this block right above `{navGroups.map(...)}`:

```astro
<a
  href="/admin"
  class:list={[
    'admin-nav-dashboard',
    { active: path === '/admin' },
  ]}
  aria-current={path === '/admin' ? 'page' : undefined}
>
  <span class="admin-nav-icon" set:html={icons.dashboard} />
  <span class="admin-nav-label">Dashboard</span>
</a>
```

The classes piggyback on existing `.admin-nav-link` / `.active` styles — re-using the same colour tokens, just without the surrounding group label.

- [ ] **Step 3: Add minimal CSS for the header link**

Find the existing `<style>` block in `AdminLayout.astro` and add this rule (anywhere inside, near the existing nav rules):

```css
.admin-nav-dashboard {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  margin-bottom: 0.5rem;
  border-radius: 0.375rem;
  color: inherit;
  text-decoration: none;
  font-weight: 600;
  border-bottom: 1px solid var(--admin-border, rgba(255,255,255,0.08));
}
.admin-nav-dashboard.active {
  background: var(--admin-nav-active-bg, rgba(255,255,255,0.06));
}
.admin-nav-dashboard .admin-nav-icon {
  width: 1rem;
  height: 1rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
```

The `var(...)` fallbacks ensure both Mentolder (dark) and Kore (light/brass) brands render correctly without brand-specific overrides.

- [ ] **Step 4: Sanity-check the rendered tree locally**

Run: `cd website && npm run build 2>&1 | tail -20`
Expected: build succeeds. Any errors here mean the JSX is malformed — fix before moving on.

- [ ] **Step 5: Commit**

```bash
git add website/src/layouts/AdminLayout.astro
git commit -m "feat(admin): render Dashboard as standalone header link above nav groups"
```

---

## Task 4: Surface "Neue Session" as a button on the Sessions page

R2 says menu items are nouns. The old `Neue Session` item was an action. After Task 2 it's gone from the menu — we need to make sure the create-flow is still discoverable.

**Files:**
- Modify: `website/src/pages/admin/coaching/sessions.astro` (or `.svelte` — check which it is)

- [ ] **Step 1: Inspect the Sessions page**

Run: `ls website/src/pages/admin/coaching/`
Identify the file. Read it.

- [ ] **Step 2: Add a "Neue Session" button**

If a primary-action button already exists on the page, verify it points to `/admin/coaching/sessions/new` and skip to commit. Otherwise, add at the top of the page content (inside the page's `<header>` or alongside the title):

```astro
<a href="/admin/coaching/sessions/new" class="btn btn-primary">
  + Neue Session
</a>
```

(Match the existing button class convention — search for `btn-primary` usages in nearby pages to confirm the class name.)

- [ ] **Step 3: Verify the page still builds**

Run: `cd website && npm run build 2>&1 | tail -10`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add website/src/pages/admin/coaching/sessions.astro
git commit -m "feat(admin): surface 'Neue Session' as button on Sessions page (R2 destinations not actions)"
```

---

## Task 5: Write the gate script

`scripts/admin-menu-gate.sh` enforces R1, R2, R4, R5, R7.

**Files:**
- Create: `scripts/admin-menu-gate.sh`

- [ ] **Step 1: Create the script**

Write `scripts/admin-menu-gate.sh` with this exact content:

```bash
#!/usr/bin/env bash
# admin-menu-gate.sh — enforce admin menu rules (R1, R2, R4, R5, R7).
#
# Exits 0 if the menu in website/src/layouts/AdminLayout.astro complies with
# the rules and every new /admin/* static page added in this branch (vs the
# base ref) is reachable from the sidemenu.
#
# Override: ADMIN_MENU_GATE=skip   — exits 0 with a warning; PR title gets
#                                    [menu-gate-skip] prefix in dev-flow-execute.

set -euo pipefail

BASE_REF="${BASE_REF:-origin/main}"
LAYOUT="website/src/layouts/AdminLayout.astro"
DASHBOARD="website/src/pages/admin.astro"
MAX_GROUPS=6
MAX_ITEMS=6

if [[ "${ADMIN_MENU_GATE:-}" == "skip" ]]; then
  echo "⚠️  ADMIN_MENU_GATE=skip — gate bypassed (will be flagged in PR title)"
  exit 0
fi

if [[ ! -f "$LAYOUT" ]]; then
  echo "✗ $LAYOUT not found — wrong working directory?" >&2
  exit 2
fi

# --- Step 1: extract reach set (hrefs + matches[] prefixes) from AdminLayout ---
# We use awk on the navGroups literal. The shape is stable enough for this:
#   { href: '/admin/foo', ..., matches: ['/admin/foo', '/admin/bar'] }

REACH_SET=$(awk '
  /href: *'\''/ {
    match($0, /href: *'\''([^'\'']+)'\''/, m)
    if (m[1]) print m[1]
  }
  /matches: *\[/, /\]/ {
    while (match($0, /'\''([^'\'']+)'\''/, m)) {
      print m[1]
      $0 = substr($0, RSTART + RLENGTH)
    }
  }
' "$LAYOUT" | sort -u)

# Always include /admin (Dashboard header link)
REACH_SET=$(printf '%s\n/admin\n' "$REACH_SET" | sort -u)

# --- Step 2: count groups and items (R4, R5) ---
GROUP_COUNT=$(awk '/^ *label: *'\''/{c++} END{print c+0}' "$LAYOUT")

# Per-group item count: walk navGroups, count items between '{ href:' lines
# bracketed by the same group's label..]. A bit ugly; uses braces depth.
MAX_GROUP_SIZE=$(awk '
  BEGIN { depth=0; n=0; max=0; in_items=0 }
  /label: *'\''/ {
    if (n > max) max = n
    n = 0
    in_items = 0
  }
  /items: *\[/ { in_items = 1; next }
  in_items && /^ *\{ *href:/ { n++ }
  /^ *\],? *$/ && in_items { in_items = 0 }
  END {
    if (n > max) max = n
    print max
  }
' "$LAYOUT")

# --- Step 3: collect labels (R2 — destinations not actions) ---
LABELS=$(awk '
  /label: *'\''/ {
    match($0, /label: *'\''([^'\'']+)'\''/, m)
    if (m[1]) print m[1]
  }
' "$LAYOUT")

# --- Step 4: detect new static /admin/* pages added vs base ---
NEW_ROUTES=$(git diff --name-only --diff-filter=AM "$BASE_REF" \
  -- 'website/src/pages/admin/**/*.astro' 2>/dev/null \
  | grep -v '\[' \
  | grep -v '^website/src/pages/admin\.astro$' \
  || true)

# --- Step 5: derive canonical hrefs ---
ROUTE_HREFS=$(printf '%s\n' "$NEW_ROUTES" \
  | sed -E 's|^website/src/pages||; s|/index\.astro$||; s|\.astro$||' \
  | grep -v '^$' || true)

# --- Step 6: parse dashboard hrefs for R7 ---
DASHBOARD_HREFS=""
if [[ -f "$DASHBOARD" ]]; then
  DASHBOARD_HREFS=$(grep -oE 'href="/admin[^"]*"' "$DASHBOARD" \
    | sed -E 's|href="||; s|"$||' \
    | sort -u || true)
fi

# --- Run checks ---
FAILED=0
echo "Admin-Menu Gate"
echo "─────────────────────────────────────"

# R5: group count
if (( GROUP_COUNT > MAX_GROUPS )); then
  echo "✗ R5  navGroups has $GROUP_COUNT groups (max $MAX_GROUPS)"
  FAILED=1
else
  echo "✓ R5  navGroups = $GROUP_COUNT (≤ $MAX_GROUPS)"
fi

# R4: max items per group
if (( MAX_GROUP_SIZE > MAX_ITEMS )); then
  echo "✗ R4  Largest group has $MAX_GROUP_SIZE items (max $MAX_ITEMS)"
  FAILED=1
else
  echo "✓ R4  Largest group = $MAX_GROUP_SIZE items (≤ $MAX_ITEMS)"
fi

# R2: label verb hygiene
BAD_LABELS=$(echo "$LABELS" | grep -iE '^(neu|new|add|erstell|create)' || true)
if [[ -n "$BAD_LABELS" ]]; then
  echo "✗ R2  Action-labels in menu (use destinations / nouns):"
  echo "$BAD_LABELS" | sed 's/^/    - /'
  FAILED=1
else
  echo "✓ R2  All labels are destinations"
fi

# R1: orphan check on new routes
ORPHANS=""
if [[ -n "$ROUTE_HREFS" ]]; then
  while IFS= read -r route; do
    [[ -z "$route" ]] && continue
    if echo "$REACH_SET" | grep -qxF "$route"; then
      continue
    fi
    # Check dynamic-parent reachability: walk up the path
    parent="$route"
    matched=""
    while [[ "$parent" == /admin/* ]]; do
      parent="${parent%/*}"
      if echo "$REACH_SET" | grep -qxF "$parent"; then
        matched="$parent"
        break
      fi
    done
    if [[ -z "$matched" ]]; then
      ORPHANS+="    - $route"$'\n'
    fi
  done <<< "$ROUTE_HREFS"
fi

if [[ -n "$ORPHANS" ]]; then
  echo "✗ R1  New static admin routes not reachable from sidemenu:"
  printf '%s' "$ORPHANS"
  echo "      Suggestion: add to navGroups in $LAYOUT, or list parent in matches[]."
  FAILED=1
else
  echo "✓ R1  All new admin routes are reachable"
fi

# R7: dashboard cross-ref
DASHBOARD_ORPHANS=""
if [[ -n "$DASHBOARD_HREFS" ]]; then
  while IFS= read -r href; do
    [[ -z "$href" ]] && continue
    [[ "$href" == /admin ]] && continue
    if echo "$REACH_SET" | grep -qxF "$href"; then
      continue
    fi
    # check dynamic parent
    parent="$href"
    matched=""
    while [[ "$parent" == /admin/* ]]; do
      parent="${parent%/*}"
      if echo "$REACH_SET" | grep -qxF "$parent"; then
        matched="$parent"
        break
      fi
    done
    if [[ -z "$matched" ]]; then
      DASHBOARD_ORPHANS+="    - $href"$'\n'
    fi
  done <<< "$DASHBOARD_HREFS"
fi

if [[ -n "$DASHBOARD_ORPHANS" ]]; then
  echo "✗ R7  Dashboard links to orphan(s):"
  printf '%s' "$DASHBOARD_ORPHANS"
  echo "      Suggestion: either add the target to the sidemenu, or remove from $DASHBOARD."
  FAILED=1
else
  echo "✓ R7  Dashboard hrefs are all reachable"
fi

echo "─────────────────────────────────────"
if (( FAILED )); then
  echo "Gate FAILED. See suggestions above. Set ADMIN_MENU_GATE=skip to bypass (logged)."
  exit 1
fi
echo "Gate PASSED."
exit 0
```

- [ ] **Step 2: Make it executable**

Run:
```bash
chmod +x /home/patrick/Bachelorprojekt/.claude/worktrees/feature+admin-menu-rules/scripts/admin-menu-gate.sh
```

- [ ] **Step 3: Smoke-run against the current tree**

```bash
cd /home/patrick/Bachelorprojekt/.claude/worktrees/feature+admin-menu-rules
bash scripts/admin-menu-gate.sh
```
Expected: `Gate PASSED.` (Tasks 2 + 3 have completed, so the live tree should comply.)

- [ ] **Step 4: Commit**

```bash
git add scripts/admin-menu-gate.sh
git commit -m "feat(dev-flow): add admin-menu-gate.sh for orphan + cap enforcement"
```

---

## Task 6: BATS coverage for the gate

The gate is enforcement infrastructure — it needs its own tests, otherwise a regression silently disables it.

**Files:**
- Create: `tests/scripts/admin-menu-gate.bats`

- [ ] **Step 1: Locate the BATS test layout**

Run: `ls tests/scripts/ 2>/dev/null | head` to confirm directory convention.

- [ ] **Step 2: Create the BATS test file**

Write `tests/scripts/admin-menu-gate.bats` with this exact content:

```bash
#!/usr/bin/env bats
# admin-menu-gate.bats — verifies R1/R2/R4/R5/R7 enforcement.

setup() {
  TMPDIR=$(mktemp -d)
  cd "$TMPDIR"
  git init -q
  git config user.email "test@example.com"
  git config user.name "Test"
  mkdir -p website/src/layouts website/src/pages/admin scripts
  cp "${BATS_TEST_DIRNAME}/../../scripts/admin-menu-gate.sh" scripts/
  chmod +x scripts/admin-menu-gate.sh
}

teardown() {
  rm -rf "$TMPDIR"
}

# Helper: write a minimal valid AdminLayout.astro
write_layout() {
  cat > website/src/layouts/AdminLayout.astro <<'EOF'
const navGroups = [
  {
    label: 'Tagesgeschäft',
    items: [
      { href: '/admin/termine', label: 'Termine', icon: 'calendar' },
    ],
  },
];
EOF
}

# Helper: commit a clean baseline (so `origin/main` diff resolves)
commit_baseline() {
  write_layout
  touch website/src/pages/admin.astro
  git add -A
  git commit -q -m "baseline"
  git branch -M main
  git remote add origin "$TMPDIR" 2>/dev/null || true
  git update-ref refs/remotes/origin/main HEAD
}

@test "passes on clean baseline" {
  commit_baseline
  run bash scripts/admin-menu-gate.sh
  [ "$status" -eq 0 ]
  [[ "$output" == *"Gate PASSED"* ]]
}

@test "R1: fails when a new static admin page has no nav entry" {
  commit_baseline
  mkdir -p website/src/pages/admin
  echo "<h1>Forecasting</h1>" > website/src/pages/admin/forecasting.astro
  git add -A
  run bash scripts/admin-menu-gate.sh
  [ "$status" -eq 1 ]
  [[ "$output" == *"R1"* ]]
  [[ "$output" == *"/admin/forecasting"* ]]
}

@test "R1: passes when new page is added to navGroups" {
  commit_baseline
  cat > website/src/layouts/AdminLayout.astro <<'EOF'
const navGroups = [
  {
    label: 'Tagesgeschäft',
    items: [
      { href: '/admin/termine',     label: 'Termine',     icon: 'calendar' },
      { href: '/admin/forecasting', label: 'Forecasting', icon: 'star' },
    ],
  },
];
EOF
  mkdir -p website/src/pages/admin
  echo "<h1>Forecasting</h1>" > website/src/pages/admin/forecasting.astro
  git add -A
  run bash scripts/admin-menu-gate.sh
  [ "$status" -eq 0 ]
}

@test "R1: dynamic [param] routes are exempt (parent must be in menu)" {
  commit_baseline
  mkdir -p website/src/pages/admin/projekte
  echo "<h1>Detail</h1>" > "website/src/pages/admin/projekte/[id].astro"
  git add -A
  # Parent /admin/projekte is not in the menu either, so this should still pass
  # for the [id] file (excluded by the gate's grep -v '\['), but FAIL only if
  # the user added a static /admin/projekte.astro without listing it.
  run bash scripts/admin-menu-gate.sh
  [ "$status" -eq 0 ]
}

@test "R2: fails when a label starts with 'Neue'" {
  cat > website/src/layouts/AdminLayout.astro <<'EOF'
const navGroups = [
  {
    label: 'Coaching',
    items: [
      { href: '/admin/coaching/sessions/new', label: 'Neue Session', icon: 'plus' },
    ],
  },
];
EOF
  touch website/src/pages/admin.astro
  git add -A
  git commit -q -m "baseline"
  git update-ref refs/remotes/origin/main HEAD
  run bash scripts/admin-menu-gate.sh
  [ "$status" -eq 1 ]
  [[ "$output" == *"R2"* ]]
  [[ "$output" == *"Neue Session"* ]]
}

@test "R4: fails when a group has >6 items" {
  cat > website/src/layouts/AdminLayout.astro <<'EOF'
const navGroups = [
  {
    label: 'Toomany',
    items: [
      { href: '/admin/a', label: 'A', icon: 'x' },
      { href: '/admin/b', label: 'B', icon: 'x' },
      { href: '/admin/c', label: 'C', icon: 'x' },
      { href: '/admin/d', label: 'D', icon: 'x' },
      { href: '/admin/e', label: 'E', icon: 'x' },
      { href: '/admin/f', label: 'F', icon: 'x' },
      { href: '/admin/g', label: 'G', icon: 'x' },
    ],
  },
];
EOF
  touch website/src/pages/admin.astro
  git add -A
  git commit -q -m "baseline"
  git update-ref refs/remotes/origin/main HEAD
  run bash scripts/admin-menu-gate.sh
  [ "$status" -eq 1 ]
  [[ "$output" == *"R4"* ]]
}

@test "R5: fails when navGroups has >6 groups" {
  cat > website/src/layouts/AdminLayout.astro <<'EOF'
const navGroups = [
  { label: 'G1', items: [ { href: '/admin/1', label: 'A', icon: 'x' } ] },
  { label: 'G2', items: [ { href: '/admin/2', label: 'A', icon: 'x' } ] },
  { label: 'G3', items: [ { href: '/admin/3', label: 'A', icon: 'x' } ] },
  { label: 'G4', items: [ { href: '/admin/4', label: 'A', icon: 'x' } ] },
  { label: 'G5', items: [ { href: '/admin/5', label: 'A', icon: 'x' } ] },
  { label: 'G6', items: [ { href: '/admin/6', label: 'A', icon: 'x' } ] },
  { label: 'G7', items: [ { href: '/admin/7', label: 'A', icon: 'x' } ] },
];
EOF
  touch website/src/pages/admin.astro
  git add -A
  git commit -q -m "baseline"
  git update-ref refs/remotes/origin/main HEAD
  run bash scripts/admin-menu-gate.sh
  [ "$status" -eq 1 ]
  [[ "$output" == *"R5"* ]]
}

@test "R7: fails when dashboard links to an orphan" {
  cat > website/src/layouts/AdminLayout.astro <<'EOF'
const navGroups = [
  {
    label: 'G',
    items: [
      { href: '/admin/termine', label: 'Termine', icon: 'calendar' },
    ],
  },
];
EOF
  cat > website/src/pages/admin.astro <<'EOF'
<a href="/admin/projekte">Aktive Projekte</a>
EOF
  git add -A
  git commit -q -m "baseline"
  git update-ref refs/remotes/origin/main HEAD
  run bash scripts/admin-menu-gate.sh
  [ "$status" -eq 1 ]
  [[ "$output" == *"R7"* ]]
  [[ "$output" == *"/admin/projekte"* ]]
}

@test "ADMIN_MENU_GATE=skip bypasses with warning" {
  commit_baseline
  mkdir -p website/src/pages/admin
  echo "<h1>Forecasting</h1>" > website/src/pages/admin/forecasting.astro
  git add -A
  ADMIN_MENU_GATE=skip run bash scripts/admin-menu-gate.sh
  [ "$status" -eq 0 ]
  [[ "$output" == *"bypassed"* ]]
}
```

- [ ] **Step 3: Run the BATS suite**

```bash
cd /home/patrick/Bachelorprojekt/.claude/worktrees/feature+admin-menu-rules
bats tests/scripts/admin-menu-gate.bats
```
Expected: all 9 tests pass.

- [ ] **Step 4: If any test fails**

The most likely failure points are:
- `R1: dynamic [param] routes are exempt` — if it fails, the gate's `grep -v '\['` is wrong. Adjust to `grep -v '\[.*\]'`.
- `R4`/`R5` awk counters — these are the fragilest parts. Add `set -x` near the awk block in `admin-menu-gate.sh` to inspect, then fix.

Iterate until all pass before moving on.

- [ ] **Step 5: Commit**

```bash
git add tests/scripts/admin-menu-gate.bats
git commit -m "test(admin-menu-gate): BATS coverage for R1, R2, R4, R5, R7"
```

---

## Task 7: Wire gate into Taskfile

`task test:menu-gate` runs the gate against the working tree. Folded into `test:all` so CI catches drift.

**Files:**
- Modify: `Taskfile.yml`

- [ ] **Step 1: Find the `test:all` task definition**

Run: `grep -nE '^  test:(all|unit|manifests|menu-gate):' Taskfile.yml`
Expected: see `test:all`, `test:unit`, `test:manifests`. We're inserting between them.

- [ ] **Step 2: Add `test:menu-gate` task**

Insert (near the other `test:*` tasks):

```yaml
  test:menu-gate:
    desc: Enforce admin-menu rules (R1, R2, R4, R5, R7)
    cmds:
      - bash scripts/admin-menu-gate.sh
```

- [ ] **Step 3: Add `test:menu-gate` to `test:all` deps**

Find the `test:all` task and append to its `deps:` list (or `cmds:` if it's a sequence):

```yaml
  test:all:
    desc: Run all offline tests
    deps:
      - test:unit
      - test:manifests
      - test:menu-gate     # NEW
```

(If `test:all` uses `cmds:` with `task: ...` invocations instead, append `- task: test:menu-gate` in the right ordering.)

- [ ] **Step 4: Verify**

```bash
cd /home/patrick/Bachelorprojekt/.claude/worktrees/feature+admin-menu-rules
task test:menu-gate
```
Expected: `Gate PASSED.`

```bash
task test:all
```
Expected: all tasks succeed including the new gate.

- [ ] **Step 5: Commit**

```bash
git add Taskfile.yml
git commit -m "ci(taskfile): add test:menu-gate to test:all"
```

---

## Task 8: Add Schritt 3.5 to dev-flow-execute

Document the gate inside the skill so it's part of every feature/fix branch's verification flow.

**Files:**
- Modify: `.claude/skills/dev-flow-execute/SKILL.md`

- [ ] **Step 1: Insert Schritt 3.5 between Schritt 3 and Schritt 4**

Find the line `## Schritt 4: Pre-Merge Preview auf dev k3d (optional)` and insert this section *before* it:

````markdown
## Schritt 3.5: Admin-Menu Placement Gate

Falls die Implementierung neue Seiten unter `website/src/pages/admin/` hinzugefügt hat, muss jede statische Route aus dem Sidemenu erreichbar sein (siehe Regel R1–R10 in `docs/superpowers/specs/2026-05-18-admin-menu-rules-design.md`).

```bash
bash scripts/admin-menu-gate.sh
```

| Exit | Bedeutung | Aktion |
|---|---|---|
| `0` (Gate PASSED) | Alles ok — weiter zu Schritt 4. | — |
| `1` (Gate FAILED) | Mindestens eine Regel verletzt. | Output lesen, im AdminLayout.astro nachpflegen, erneut laufen. |
| `2` | Wrong working directory. | In den Worktree wechseln und erneut versuchen. |

### Bypass (nur in Ausnahmefällen)

```bash
ADMIN_MENU_GATE=skip bash scripts/admin-menu-gate.sh
```

Wenn der Gate übersprungen wird: **PR-Titel mit `[menu-gate-skip]` prefixen** und im PR-Body begründen (z.B. "absichtlich orphan — dynamic redirect target only, kein Bedarf für Menüplatz"). Reviewer haben damit ein klares Signal.

### Häufige Failure-Modi

| Failure | Typische Ursache | Fix |
|---|---|---|
| `R1 orphan` | Neue `/admin/foo.astro` ohne Eintrag in `navGroups`. | Item in passender Gruppe ergänzen, oder Parent-Route in `matches[]` listen. |
| `R2 label` | `'Neue Session'` o.ä. als `label`. | Item entfernen, Create-Aktion als Button auf der Zielseite. |
| `R4 group >6` | Zu viele Items in einer Gruppe. | Item in andere Gruppe verschieben, oder Gruppe aufteilen. |
| `R5 groups >6` | Zu viele Gruppen. | Verwandte Gruppen zusammenführen. |
| `R7 dashboard orphan` | KPI-Card linkt auf Route die nicht im Sidemenu liegt. | Entweder Route ins Sidemenu, oder Dashboard-Link entfernen. |

---

````

- [ ] **Step 2: Cross-check the section heading numbers**

The skill currently jumps from Schritt 3 → Schritt 4. After our insert, the flow becomes Schritt 3 → Schritt 3.5 → Schritt 4. No downstream renumbering needed (the existing 4/5/5.5/6/6.5/7/7.5/8 stay as-is).

- [ ] **Step 3: Verify the markdown still renders cleanly**

```bash
# Quick smell check — no broken tables, balanced code fences
cd /home/patrick/Bachelorprojekt/.claude/worktrees/feature+admin-menu-rules
grep -c '^```' .claude/skills/dev-flow-execute/SKILL.md
```
Expected: an even number (each open fence has a close).

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/dev-flow-execute/SKILL.md
git commit -m "docs(dev-flow-execute): add Schritt 3.5 — Admin-Menu Placement Gate"
```

---

## Task 9: Full local verification

End-to-end pass: build the website, run the gate against the post-implementation tree, run the full offline test suite.

- [ ] **Step 1: Website build**

```bash
cd /home/patrick/Bachelorprojekt/.claude/worktrees/feature+admin-menu-rules/website
npm run build 2>&1 | tail -20
```
Expected: build succeeds; no Astro errors. Warnings about pre-existing things are fine.

- [ ] **Step 2: Gate run**

```bash
cd /home/patrick/Bachelorprojekt/.claude/worktrees/feature+admin-menu-rules
bash scripts/admin-menu-gate.sh
```
Expected: `Gate PASSED.`

- [ ] **Step 3: Full offline test suite**

```bash
task test:all
```
Expected: all tasks succeed. If `test:inventory` mentions drift in `website/src/data/test-inventory.json`, regenerate per CLAUDE.md note: `task test:inventory` and add the diff to a new commit.

- [ ] **Step 4: Workspace validation (manifests untouched, but cheap and catches accidental damage)**

```bash
task workspace:validate
```
Expected: success.

- [ ] **Step 5: Spot-check the admin sidebar visually (dev server)**

Optional but valuable:
```bash
task website:dev   # Astro dev server on localhost
# Visit http://localhost:4321/admin and confirm:
#  - Dashboard renders as a standalone header link
#  - 6 groups in the order: Tagesgeschäft, Klienten, Coaching, Wissen & Inhalte, Geld, Plattform
#  - draftsPending and inboxPending badges still appear
#  - Active-state highlighting still works on each group's items
# Stop with Ctrl+C
```

- [ ] **Step 6: If anything failed**

- Build failures → fix in `AdminLayout.astro`, re-commit on the same branch.
- Gate failures → most likely a typo in `navGroups`; check the `awk` output by running `bash -x scripts/admin-menu-gate.sh 2>&1 | head -40`.
- BATS failures from `test:all` → re-run `bats tests/scripts/admin-menu-gate.bats` standalone, debug.

No new commit needed if everything passes — Task 5–8 commits cover the work.

---

## Task 10: Hand off to PR

This is the final task — push, open PR, let dev-flow-execute Schritt 5 onwards handle the rest.

- [ ] **Step 1: Push the branch**

```bash
cd /home/patrick/Bachelorprojekt/.claude/worktrees/feature+admin-menu-rules
git push -u origin feature/admin-menu-rules
```

- [ ] **Step 2: Open the PR via `gh`**

```bash
gh pr create \
  --title "feat(admin): codify menu rules + reshuffle sidemenu + add placement gate" \
  --body "$(cat <<'EOF'
## Summary
- Codifies 10 admin-menu rules (R1–R10) in `docs/superpowers/specs/2026-05-18-admin-menu-rules-design.md`
- Reshuffles `AdminLayout.astro` into 6 task-based groups (Tagesgeschäft, Klienten, Coaching, Wissen & Inhalte, Geld, Plattform), Dashboard as header link
- Surfaces all 19 formerly-orphan admin pages (Projekte, Meetings, Followups, Nachrichten, Räume, Buchhaltung, Zeiterfassung, Steuer, Brett, Vorlagen, Systemtest, …)
- Fixes Dashboard KPI broken-link (`/admin/projekte` now in sidemenu)
- Adds `scripts/admin-menu-gate.sh` (R1/R2/R4/R5/R7 enforcement) + BATS coverage + `task test:menu-gate`
- Documents Schritt 3.5 in `dev-flow-execute` so future PRs that add `/admin/*` routes can't ship orphans

## Test plan
- [x] `task test:all` (includes new `test:menu-gate`)
- [x] `bats tests/scripts/admin-menu-gate.bats` — 9 tests
- [x] `bash scripts/admin-menu-gate.sh` against post-implementation tree → PASSED
- [x] `cd website && npm run build` — builds clean
- [x] Manual: `task website:dev` → /admin sidebar renders Dashboard header + 6 groups, badges intact
- [ ] Post-merge: deploy via `task feature:website`, smoke-check web.mentolder.de/admin and web.korczewski.de/admin

Closes T000449
EOF
)"
```

- [ ] **Step 3: Note the PR number**

```bash
PR_NUM=$(gh pr view --json number -q '.number')
echo "PR #$PR_NUM"
```

From here, `dev-flow-execute` Schritt 6 onwards (auto-merge, ticket close, plan archive, deploy via `task feature:website`) takes over.

---

## Self-Review

**Spec coverage:**
- R1 (no orphans) — Task 5 (gate) + Task 2 (places every formerly-orphan)
- R2 (destinations not actions) — Task 4 (Sessions button) + Task 5 (gate label check)
- R3 (group by task) — Task 2 (new group labels)
- R4/R5 (caps) — Task 5 (gate enforces both)
- R6 (frequency order within group) — Task 2 (item order in `navGroups` literal)
- R7 (dashboard ⊆ sidemenu) — Task 5 (R7 check)
- R8 (badges on items) — Task 2 (preserves `inboxPending`, `draftsPending`)
- R9 (brand parity) — implicit; `AdminLayout.astro` has no brand check around `navGroups`
- R10 (placement gate in workflow) — Task 8 (Schritt 3.5)
- Dashboard KPI broken-link — Task 2 (puts `/admin/projekte` in Klienten)
- Missing icons mishap — Task 1 (`folder`, `settings`, `chat`)

**Placeholder scan:** None — every code block contains executable content.

**Type consistency:** `NavItem` interface in `AdminLayout.astro` is unchanged; new items use existing fields (`href`, `label`, `icon`, `matches`, `badge`). Gate output strings ("Gate PASSED.", "R1", "R2", etc.) are checked verbatim by the BATS tests.

**Open question (non-blocking):** Task 4 assumes `sessions.astro` exists in `pages/admin/coaching/`. The Explore agent confirmed `/admin/coaching/sessions` is in the current sidemenu, so the page exists, but the file might be `.svelte` or under a different path. Step 1 of Task 4 handles the discovery.
