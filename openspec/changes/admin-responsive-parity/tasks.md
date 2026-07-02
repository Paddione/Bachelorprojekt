---
title: "admin-responsive-parity — Implementation Plan"
ticket_id: T001471
domains: [website, admin-ui, frontend]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# admin-responsive-parity — Implementation Plan

_Ticket: T001471_

**Goal:** Give the admin suite responsive parity — every admin view is usable on a
375px phone (tables scroll internally or collapse to cards) and lays out sensibly on
≥1024px — via a layered CSS-only/markup-neutral approach that respects the S1 line
ratchet.

**Architecture:** One new stylesheet `admin-responsive.css` imported once in
`AdminLayout.astro` carries all four layers. Layer 1 is a global mobile fallback
(tables scroll, 44px touch targets, opt-in grid collapse) plus a desktop form
upgrade. Layer 2 generalises the Cockpit table→card container-query pattern as an
opt-in `.admin-table-collapse` class applied line-neutrally to three tables. Layer 3
adds mobile media queries inside the scoped `<style>` blocks of four `ui/` Svelte
components. Layer 4 tags six `einstellungen/*` form containers with `.admin-form-wide`.

**Tech Stack:** Astro 5, Svelte 5, plain CSS (media + container queries), BATS.

## Global Constraints

- **Breakpoints (verbatim from spec):** mobile `max-width: 767px`, tablet `768–1023px`,
  desktop `min-width: 1024px`; table→card container-query threshold `max-width: 480px`.
- **S1 ratchet — Budget 0 files must stay line-neutral:** `rechnungen.astro` must remain
  exactly **592** lines, `projekte.astro` exactly **408** lines. Attach classes /
  `data-label` only to existing lines; never add or remove a line in these two files.
- **No brand-domain literals** (`*.mentolder.de` / `*.korczewski.de`) in any code (S3).
- **No behaviour/API changes, no new dependencies** — CSS and markup attributes only.
- **Cockpit exclusion:** the global mobile table rule must not touch the Cockpit
  (`[data-container="cockpit"]`), which owns its own mobile layout in `mobile-cockpit.css`.
- **`any`-type ceiling (CQ02):** no change here adds TypeScript — this plan touches only
  `.css`, `.astro` markup, `.svelte` `<style>` and `.bats`; the `any` count is unaffected.
  <!-- vitest: kein neuer Test nötig, weil rein CSS/Markup — keine lib/*.ts- oder api/**-Logik geändert -->

## File Structure

```
website/src/styles/admin-responsive.css                     NEW  Layer 1+2 rules (~120–160 lines)
website/src/layouts/AdminLayout.astro                       MOD  +1 import line (Budget 137)
website/src/pages/admin/rechnungen.astro                    MOD  line-neutral: class + data-label (Budget 0, stays 592)
website/src/pages/admin/projekte.astro                      MOD  line-neutral: class + data-label (Budget 0, stays 408)
website/src/pages/admin/zeiterfassung.astro                 MOD  class + data-label (Budget 139)
website/src/components/admin/ui/AdminTabs.svelte            MOD  mobile scroll in <style> (Budget 361)
website/src/components/admin/ui/AdminStatCard.svelte        MOD  mobile compact in <style> (Budget 388)
website/src/components/admin/ui/AdminCard.svelte            MOD  mobile compact in <style> (Budget 430)
website/src/components/admin/ui/AdminPageHeader.svelte      MOD  mobile stack in <style> (Budget 295)
website/src/pages/admin/einstellungen/backup.astro          MOD  .admin-form-wide (Budget 343)
website/src/pages/admin/einstellungen/benachrichtigungen.astro  MOD  .admin-form-wide (Budget 315)
website/src/pages/admin/einstellungen/branding.astro        MOD  .admin-form-wide (Budget 225)
website/src/pages/admin/einstellungen/email.astro           MOD  .admin-form-wide (Budget 335)
website/src/pages/admin/einstellungen/ordner-templates.astro MOD  .admin-form-wide (Budget 263)
website/src/pages/admin/einstellungen/rechnungen.astro      MOD  .admin-form-wide (Budget 245)
tests/spec/website-core.bats                                MOD  extend with admin-responsive assertions
openspec/changes/admin-responsive-parity/specs/website-core.md  MOD  delta spec (ADDED Requirements)
```

### S1 status per changed file (from intel.json — effective threshold · budget)

| File | Ist LOC | Baseline | Effective threshold | Budget | Acceptance |
|---|---|---|---|---|---|
| `website/src/styles/admin-responsive.css` | 0 (new) | — | 500 (`.css` limit) | 500 | keep ≤ ~160 lines |
| `website/src/layouts/AdminLayout.astro` | 263 | not baselined | 400 | 137 | +1 import line ok |
| `website/src/pages/admin/rechnungen.astro` | 592 | **592** | **592** | **0** | **line-neutral: stays exactly 592** |
| `website/src/pages/admin/projekte.astro` | 408 | **408** | **408** | **0** | **line-neutral: stays exactly 408** |
| `website/src/pages/admin/zeiterfassung.astro` | 261 | not baselined | 400 | 139 | minimal growth ok |
| `website/src/components/admin/ui/AdminTabs.svelte` | 139 | not baselined | 500 | 361 | style-only growth ok |
| `website/src/components/admin/ui/AdminStatCard.svelte` | 112 | not baselined | 500 | 388 | style-only growth ok |
| `website/src/components/admin/ui/AdminCard.svelte` | 70 | not baselined | 500 | 430 | style-only growth ok |
| `website/src/components/admin/ui/AdminPageHeader.svelte` | 105 | not baselined | 500 | 295 | style-only growth ok |
| `website/src/pages/admin/einstellungen/backup.astro` | 57 | not baselined | 400 | 343 | class on existing line |
| `website/src/pages/admin/einstellungen/benachrichtigungen.astro` | 85 | not baselined | 400 | 315 | class on existing line |
| `website/src/pages/admin/einstellungen/branding.astro` | 175 | not baselined | 400 | 225 | class on existing line |
| `website/src/pages/admin/einstellungen/email.astro` | 65 | not baselined | 400 | 335 | class on existing line |
| `website/src/pages/admin/einstellungen/ordner-templates.astro` | 137 | not baselined | 400 | 263 | class on existing line |
| `website/src/pages/admin/einstellungen/rechnungen.astro` | 155 | not baselined | 400 | 245 | class on existing line |
| `tests/spec/website-core.bats` | existing | not baselined | 500 | ok | extend, do not create new file |

---

## Task 1: Layer 1+2 stylesheet + AdminLayout wiring + failing BATS spec

Creates `admin-responsive.css` with the global mobile fallback (Layer 1), the desktop
form upgrade (Layer 1 desktop) and the generalised table→card container-query
(Layer 2 `.admin-table-collapse`), imports it in `AdminLayout.astro`, and locks the
behaviour in with a BATS spec written red-first.

**Files:**
- Create: `website/src/styles/admin-responsive.css`
- Modify: `website/src/layouts/AdminLayout.astro:6` (import block)
- Test: `tests/spec/website-core.bats` (extend existing file)

**Interfaces:**
- Produces (consumed by Tasks 2 & 4): CSS classes `.admin-table-collapse`,
  `.admin-grid-collapse`, `.admin-form-wide`; container context established via
  `#admin-main { container-type: inline-size; container-name: admin-content }`.

- [x] **Step 1: Write the failing BATS test (RED).**

Append to `tests/spec/website-core.bats` (extend the existing file — do not create a
new one). Add a file-level variable next to the others near the top:

```bash
ADMIN_RESPONSIVE="$BATS_TEST_DIRNAME/../../website/src/styles/admin-responsive.css"
```

Then append these tests at the end of the file:

```bash
# ── T001471: admin responsive parity ─────────────────────────────────────────
@test "T001471 responsive: admin-responsive.css exists" {
  [ -f "$ADMIN_RESPONSIVE" ]
}

@test "T001471 responsive: AdminLayout.astro imports admin-responsive.css" {
  run grep -F "styles/admin-responsive.css" "$ADMIN_LAYOUT"
  [ "$status" -eq 0 ]
}

@test "T001471 responsive: stylesheet has mobile table fallback (767px + overflow-x)" {
  run grep -E "max-width:[[:space:]]*767px" "$ADMIN_RESPONSIVE"
  [ "$status" -eq 0 ]
  run grep -E "overflow-x:[[:space:]]*auto" "$ADMIN_RESPONSIVE"
  [ "$status" -eq 0 ]
}

@test "T001471 responsive: stylesheet excludes Cockpit from mobile table rule" {
  run grep -F 'data-container="cockpit"' "$ADMIN_RESPONSIVE"
  [ "$status" -eq 0 ]
}

@test "T001471 responsive: stylesheet has table-collapse container query" {
  run grep -F ".admin-table-collapse" "$ADMIN_RESPONSIVE"
  [ "$status" -eq 0 ]
  run grep -E "max-width:[[:space:]]*480px" "$ADMIN_RESPONSIVE"
  [ "$status" -eq 0 ]
}

@test "T001471 responsive: stylesheet has desktop block (1024px) with admin-form-wide" {
  run grep -E "min-width:[[:space:]]*1024px" "$ADMIN_RESPONSIVE"
  [ "$status" -eq 0 ]
  run grep -F ".admin-form-wide" "$ADMIN_RESPONSIVE"
  [ "$status" -eq 0 ]
}
```

- [x] **Step 2: Run the test to confirm it fails (RED).**

Run:
```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/website-core.bats
```
expected: FAIL — the six `T001471 …` tests fail because `admin-responsive.css` does
not exist yet and `AdminLayout.astro` has no import.

- [x] **Step 3: Create `website/src/styles/admin-responsive.css`.**

```css
/* website/src/styles/admin-responsive.css
 * Admin responsive parity (T001471). Layered:
 *   Layer 1 — global mobile fallback (≤767px) + desktop form upgrade (≥1024px)
 *   Layer 2 — opt-in table→card collapse (.admin-table-collapse, container <480px)
 * Cockpit owns its own mobile layout (mobile-cockpit.css) and is excluded.
 */

/* Establish a query container on the admin content area so .admin-table-collapse
 * can react to available content width without any markup wrapper. */
#admin-main {
  container-type: inline-size;
  container-name: admin-content;
}

/* ── Layer 1: mobile fallback (≤767px) ─────────────────────────────────────── */
@media (max-width: 767px) {
  /* Every admin-content table becomes horizontally scrollable so wide tables
   * stay usable. Opt-in collapse tables are excluded (Layer 2 handles them). */
  #admin-main table:not(.admin-table-collapse) {
    display: block;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    max-width: 100%;
  }

  /* Cockpit has its own mobile layout — never touch its tables. */
  #admin-main [data-container="cockpit"] table {
    display: table;
    overflow-x: visible;
  }

  /* Touch targets: interactive controls in the admin content ≥ 44px. */
  #admin-main button,
  #admin-main [role="button"],
  #admin-main select,
  #admin-main input:not([type="checkbox"]):not([type="radio"]) {
    min-height: 44px;
  }

  /* Opt-in defensive grid collapse — never a blind rule on all grids. */
  #admin-main .admin-grid-collapse {
    grid-template-columns: 1fr !important;
  }
}

/* ── Layer 2: table → card collapse (opt-in, container <480px) ──────────────── */
@container admin-content (max-width: 480px) {
  .admin-table-collapse thead {
    display: none;
  }
  .admin-table-collapse,
  .admin-table-collapse tbody,
  .admin-table-collapse tr,
  .admin-table-collapse td {
    display: block;
    width: 100%;
  }
  .admin-table-collapse tr {
    margin-bottom: 0.75rem;
    border: 1px solid var(--admin-border, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    padding: 0.25rem 0;
  }
  .admin-table-collapse td {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 1rem;
    text-align: right;
    padding: 0.4rem 0.9rem;
  }
  .admin-table-collapse td::before {
    content: attr(data-label);
    font-family: var(--font-mono, monospace);
    font-size: 0.65rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--admin-text-mute, #9aa4b2);
    text-align: left;
    flex-shrink: 0;
  }
  /* Empty-state / colspan rows keep their natural flow. */
  .admin-table-collapse td[colspan]::before {
    content: "";
  }
  .admin-table-collapse td[colspan] {
    justify-content: center;
    text-align: center;
  }
}

/* ── Layer 1 desktop: form upgrade (≥1024px) ───────────────────────────────── */
@media (min-width: 1024px) {
  .admin-form-wide {
    max-width: 960px;
  }
  .admin-form-wide .admin-field-group {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.25rem;
  }
}
```

- [x] **Step 4: Import the stylesheet in `AdminLayout.astro`.**

Add one line to the import block at the top of the frontmatter (after
`admin-premium.css` on line 5), keeping the ordering with the other style imports:

```astro
import '../styles/admin-premium.css';
import '../styles/admin-responsive.css';
```

- [x] **Step 5: Run the test to confirm it passes (GREEN).**

Run:
```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/website-core.bats
```
Expected: PASS — all `T001471 …` tests green.

- [x] **Step 6: Commit.**

```bash
git add website/src/styles/admin-responsive.css website/src/layouts/AdminLayout.astro tests/spec/website-core.bats
git commit -m "feat(website): add admin-responsive.css Layer 1+2 + AdminLayout import [T001471]"
```

---

## Task 2: Layer 2 — apply `.admin-table-collapse` line-neutrally to three tables

Applies the opt-in collapse class + `data-label` attributes to the three everyday
tables. `rechnungen.astro` and `projekte.astro` are Budget 0 — every edit stays on an
existing line (no line added or removed). `zeiterfassung.astro` has budget but is also
edited line-neutrally.

**Files:**
- Modify: `website/src/pages/admin/rechnungen.astro` (tables at line 175 + the main invoice table)
- Modify: `website/src/pages/admin/projekte.astro:223` (table)
- Modify: `website/src/pages/admin/zeiterfassung.astro:123` (table)
- Test: `tests/spec/website-core.bats` (extend with class-presence + line-count asserts)

**Interfaces:**
- Consumes: `.admin-table-collapse` and the `admin-content` container from Task 1.

- [x] **Step 1: Write the failing line-count + class tests (RED).**

Append to `tests/spec/website-core.bats`:

```bash
@test "T001471 collapse: rechnungen.astro stays exactly 592 lines (Budget 0)" {
  run bash -c "wc -l < '$BATS_TEST_DIRNAME/../../website/src/pages/admin/rechnungen.astro' | tr -d ' '"
  [ "$output" -eq 592 ]
}

@test "T001471 collapse: projekte.astro stays exactly 408 lines (Budget 0)" {
  run bash -c "wc -l < '$BATS_TEST_DIRNAME/../../website/src/pages/admin/projekte.astro' | tr -d ' '"
  [ "$output" -eq 408 ]
}

@test "T001471 collapse: rechnungen.astro tags a table with admin-table-collapse" {
  run grep -F "admin-table-collapse" "$BATS_TEST_DIRNAME/../../website/src/pages/admin/rechnungen.astro"
  [ "$status" -eq 0 ]
}

@test "T001471 collapse: projekte.astro tags a table with admin-table-collapse" {
  run grep -F "admin-table-collapse" "$BATS_TEST_DIRNAME/../../website/src/pages/admin/projekte.astro"
  [ "$status" -eq 0 ]
}

@test "T001471 collapse: zeiterfassung.astro tags a table with admin-table-collapse" {
  run grep -F "admin-table-collapse" "$BATS_TEST_DIRNAME/../../website/src/pages/admin/zeiterfassung.astro"
  [ "$status" -eq 0 ]
}
```

Run:
```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/website-core.bats
```
expected: FAIL — the three `admin-table-collapse` grep tests fail (class not applied
yet). The two line-count tests pass now and must KEEP passing after the edit.

- [x] **Step 2: Tag the `rechnungen.astro` main invoice table (line-neutral).**

In `website/src/pages/admin/rechnungen.astro`, the main invoice table opens with
`<table class="w-full">` (line 175 is the dunning table; the main invoice table opens
lower). Append the class to the existing opening tag — same line, no new line:

```astro
<table class="w-full admin-table-collapse">
```

Then, on each existing `<td class="…">` opening tag of that table's body rows, append a
`data-label` matching the column header (`Nr.`, `Client`, `Status`, `Datum`, `Fällig`,
`Betrag`, `Offen`, `E-Rechnung`, `Drucken`) — all edits stay on the existing `<td>`
line. Example (line 237, unchanged position):

```astro
<td class="px-4 py-3 text-sm text-light font-mono" data-label="Nr.">#{inv.number}</td>
```

Apply the same `class` + `data-label` treatment to the dunning table at line 175 using
its own headers (same nine columns). Do NOT reformat, wrap, or split any line.

- [x] **Step 3: Tag the `projekte.astro` table (line-neutral).**

In `website/src/pages/admin/projekte.astro`, change the opening `<table class="w-full">`
(line 223) to:

```astro
<table class="w-full admin-table-collapse">
```

Append `data-label` to each existing `<td …>` opening tag in the body row, matching the
headers `Projekt`, `Kunde`, `Status`, `Prio`, `Erfasst`, `Start`, `Fällig`, `TP`,
`Aufg.`, `Aktionen`. Example (line 255, unchanged position):

```astro
<td class="px-4 py-3 text-sm text-muted whitespace-nowrap" data-label="Kunde">{p.customerName ?? '—'}</td>
```

Do NOT add or remove any line.

- [x] **Step 4: Tag the `zeiterfassung.astro` table.**

In `website/src/pages/admin/zeiterfassung.astro`, change the opening
`<table class="w-full">` (line 123) to `<table class="w-full admin-table-collapse">` and
append `data-label` to each `<td …>` opening tag, matching headers `Datum`, `Projekt`,
`Aufgabe`, `Beschreibung`, `Minuten`, `Abr.`, `Betrag`, `Aktionen`. Example:

```astro
<td class="px-4 py-3 text-sm text-muted whitespace-nowrap" data-label="Datum">{fmtDate(e.entryDate)}</td>
```

- [x] **Step 5: Verify line-neutrality of the Budget 0 files.**

Run:
```bash
wc -l website/src/pages/admin/rechnungen.astro website/src/pages/admin/projekte.astro
```
Expected: `592` and `408` respectively — unchanged. If either differs, a line was
added/removed — undo the reformatting and re-apply attributes on the original lines.

- [x] **Step 6: Run the tests (GREEN).**

Run:
```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/website-core.bats
```
Expected: PASS — all `T001471 …` tests green, including both line-count assertions.

- [x] **Step 7: Commit.**

```bash
git add website/src/pages/admin/rechnungen.astro website/src/pages/admin/projekte.astro website/src/pages/admin/zeiterfassung.astro tests/spec/website-core.bats
git commit -m "feat(website): collapse admin tables to cards on mobile (line-neutral) [T001471]"
```

---

## Task 3: Layer 3 — intrinsically responsive `ui/` building blocks

Adds mobile media queries inside the component-scoped `<style>` blocks of four
`ui/` components. All four are well under their `.svelte` limit (Budget ≥ 295); growth
is fine. No markup or props change.

**Files:**
- Modify: `website/src/components/admin/ui/AdminTabs.svelte` (`<style>` at line 90)
- Modify: `website/src/components/admin/ui/AdminStatCard.svelte` (`<style>` block)
- Modify: `website/src/components/admin/ui/AdminCard.svelte` (`<style>` block)
- Modify: `website/src/components/admin/ui/AdminPageHeader.svelte` (`<style>` at line 47)

**Interfaces:**
- Consumes: nothing from earlier tasks — component-scoped styles only.

- [x] **Step 1: Write the failing test (RED).**

Append to `tests/spec/website-core.bats`:

```bash
@test "T001471 ui: AdminTabs has a mobile scroll media query" {
  f="$BATS_TEST_DIRNAME/../../website/src/components/admin/ui/AdminTabs.svelte"
  run grep -E "max-width:[[:space:]]*767px" "$f"
  [ "$status" -eq 0 ]
  run grep -E "overflow-x:[[:space:]]*auto" "$f"
  [ "$status" -eq 0 ]
}

@test "T001471 ui: AdminPageHeader stacks title and actions on mobile" {
  f="$BATS_TEST_DIRNAME/../../website/src/components/admin/ui/AdminPageHeader.svelte"
  run grep -E "max-width:[[:space:]]*767px" "$f"
  [ "$status" -eq 0 ]
}
```

Run:
```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/website-core.bats
```
expected: FAIL — the two new tests fail (no mobile query yet in those components).

- [x] **Step 2: AdminTabs — horizontal scroll on mobile.**

Inside the existing `<style>` block of `AdminTabs.svelte`, add:

```css
@media (max-width: 767px) {
  .tabs {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scroll-snap-type: x proximity;
    flex-wrap: nowrap;
  }
  .tabs__tab {
    scroll-snap-align: start;
    white-space: nowrap;
  }
}
```

- [x] **Step 3: AdminStatCard + AdminCard — full width, compact padding on mobile.**

Inside the `<style>` block of `AdminStatCard.svelte`, add a rule targeting the card's
root class (confirm the class name by reading the file first), e.g.:

```css
@media (max-width: 767px) {
  .stat-card {
    width: 100%;
    padding: 0.85rem 1rem;
  }
}
```

Do the equivalent in `AdminCard.svelte` for its root class:

```css
@media (max-width: 767px) {
  .admin-card {
    padding: 0.85rem 1rem;
  }
}
```

Read each component before editing to use its real root class name (do not assume).

- [x] **Step 4: AdminPageHeader — stack title and actions on mobile.**

Inside the `<style>` block of `AdminPageHeader.svelte`, add:

```css
@media (max-width: 767px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75rem;
  }
  .page-header__actions {
    width: 100%;
  }
}
```

- [x] **Step 5: Run the tests (GREEN).**

Run:
```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/website-core.bats
```
Expected: PASS.

- [x] **Step 6: Commit.**

```bash
git add website/src/components/admin/ui/AdminTabs.svelte website/src/components/admin/ui/AdminStatCard.svelte website/src/components/admin/ui/AdminCard.svelte website/src/components/admin/ui/AdminPageHeader.svelte tests/spec/website-core.bats
git commit -m "feat(website): make admin ui building blocks responsive on mobile [T001471]"
```

---

## Task 4: Layer 4 — `.admin-form-wide` on the six einstellungen form containers

Tags the outer form container of each of the six `einstellungen/*` views with
`.admin-form-wide` so the desktop rule from Task 1 widens them and lays field groups out
in two columns on ≥1024px. Each container currently opens with an inline-styled `<div>`;
append the class to the existing line (all six have ample budget).

**Files:**
- Modify: `website/src/pages/admin/einstellungen/backup.astro:21`
- Modify: `website/src/pages/admin/einstellungen/benachrichtigungen.astro`
- Modify: `website/src/pages/admin/einstellungen/branding.astro`
- Modify: `website/src/pages/admin/einstellungen/email.astro`
- Modify: `website/src/pages/admin/einstellungen/ordner-templates.astro`
- Modify: `website/src/pages/admin/einstellungen/rechnungen.astro`

**Interfaces:**
- Consumes: `.admin-form-wide` desktop rule from Task 1.

- [x] **Step 1: Write the failing test (RED).**

Append to `tests/spec/website-core.bats`:

```bash
@test "T001471 forms: all six einstellungen views opt into admin-form-wide" {
  base="$BATS_TEST_DIRNAME/../../website/src/pages/admin/einstellungen"
  for f in backup benachrichtigungen branding email ordner-templates rechnungen; do
    run grep -F "admin-form-wide" "$base/$f.astro"
    [ "$status" -eq 0 ] || { echo "missing admin-form-wide in $f.astro"; return 1; }
  done
}
```

Run:
```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/website-core.bats
```
expected: FAIL — none of the six views carry the class yet.

- [x] **Step 2: Tag `backup.astro`.**

The container opens at line 21 with `<div style="padding: 2rem; max-width: 640px;">`.
Add the class to that existing line:

```astro
<div class="admin-form-wide" style="padding: 2rem; max-width: 640px;">
```

- [x] **Step 3: Tag the remaining five views.**

Read each file, find its outermost content `<div style="…">` (the form/page wrapper, the
same pattern as `backup.astro`), and append `class="admin-form-wide"` to that existing
opening tag — one edit per file, no new line:

- `benachrichtigungen.astro`
- `branding.astro`
- `email.astro`
- `ordner-templates.astro`
- `rechnungen.astro`

If a file's wrapper already has a `class="…"`, append the token inside the existing
attribute instead (`class="… admin-form-wide"`).

- [x] **Step 4: Run the tests (GREEN).**

Run:
```bash
./tests/unit/lib/bats-core/bin/bats tests/spec/website-core.bats
```
Expected: PASS.

- [x] **Step 5: Commit.**

```bash
git add website/src/pages/admin/einstellungen/backup.astro website/src/pages/admin/einstellungen/benachrichtigungen.astro website/src/pages/admin/einstellungen/branding.astro website/src/pages/admin/einstellungen/email.astro website/src/pages/admin/einstellungen/ordner-templates.astro website/src/pages/admin/einstellungen/rechnungen.astro
git commit -m "feat(website): widen einstellungen forms on desktop via admin-form-wide [T001471]"
```

---

## Task 5: Delta spec + final verification

Fills the OpenSpec delta and runs the mandatory CI gates.

**Files:**
- Modify: `openspec/changes/admin-responsive-parity/specs/website-core.md`
- Modify: `website/src/data/test-inventory.json` (regenerated)

- [ ] **Step 1: Write the delta spec.**

Fill `openspec/changes/admin-responsive-parity/specs/website-core.md` with the
`## ADDED Requirements` operation header and the requirement/scenarios (English
Requirement + GIVEN/WHEN/THEN Scenarios) authored in the companion spec file. Then
validate:

```bash
bash scripts/openspec.sh validate
```
Expected: validation passes (green).

- [ ] **Step 2: Regenerate the test inventory (tests were added).**

```bash
task test:inventory
git add website/src/data/test-inventory.json tests/spec/website-core.bats
```

- [ ] **Step 3: Run the mandatory CI gates.**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
Expected: all green. `freshness:check` runs the S1 ratchet — confirm no baseline
growth and that `rechnungen.astro` (592) and `projekte.astro` (408) are unchanged.

- [ ] **Step 4: Run plan-lint on this plan.**

```bash
bash scripts/plan-lint.sh openspec/changes/admin-responsive-parity/tasks.md
```
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add openspec/changes/admin-responsive-parity/specs/website-core.md website/src/data/test-inventory.json
git commit -m "docs(openspec): add website-core delta + regen inventory [T001471]"
```
