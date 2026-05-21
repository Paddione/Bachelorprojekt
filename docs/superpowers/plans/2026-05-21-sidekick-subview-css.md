---
title: Fix sidekick sub-view visual consistency
ticket_id: T000136
status: staged
domains: [website]
date: 2026-05-21
branch: fix/sidekick-subview-css
---

# Fix: Sidekick sub-view CSS inconsistency [T000136]

## Problem

The PortalSidekick drawer has five sub-views rendered inside `drawer-body`:
- `SupportView` (Feedback & Support)
- `QuestionnaireView` (Fragebögen)
- `HelpView` (Hilfe)
- `TicketSidekickView` (Anfragen)
- `InboxSidekickView` (Postfach)

`SidekickHome` (the main menu) uses a refined editorial aesthetic:
- Newsreader serif + Geist Mono typography via CSS variables
- `oklch(0.83 0.09 75)` brass/gold accent system
- Eyebrow bar + numbered list items with hover gradients

Sub-views break the visual continuity because they:
1. Have **no intro/eyebrow block** — they dump content directly with no visual bridge
2. Use **hardcoded hex values** instead of the CSS variables used by SidekickHome
3. `HelpView` uses **purple** (`#818cf8`) as its accent color instead of brass
4. `QuestionnaireView` inner-hdr uses `background: #1e2a3a` — a lighter tone that creates a visible color step
5. `<select>` elements lack `appearance: none` — OS-native chrome bleeds through

## Fix plan

### Step 1 — SupportView.svelte

File: `website/src/components/assistant/SupportView.svelte`

**Add intro block** before the `<form>` (inside `.support-view`):
```html
<div class="sv-intro">
  <span class="sv-eyebrow">
    <span class="sv-eyebrow-bar" aria-hidden="true"></span>
    Feedback & Support
  </span>
  <p class="sv-desc">Fehler melden oder Verbesserungen vorschlagen.</p>
</div>
```

**CSS to add:**
```css
.sv-intro { padding: 20px 22px 12px; display: flex; flex-direction: column; gap: 6px; border-bottom: 1px solid rgba(255,255,255,0.06); }
.sv-eyebrow { font-family: var(--font-mono, 'Geist Mono', monospace); font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: oklch(0.83 0.09 75); display: inline-flex; align-items: center; gap: 10px; }
.sv-eyebrow-bar { width: 16px; height: 1px; background: oklch(0.83 0.09 75); opacity: 0.85; flex-shrink: 0; }
.sv-desc { margin: 0; font-size: 12px; color: var(--admin-text-mute, #8899aa); line-height: 1.5; }
```

**Fix `<select>` appearance** — add to `.inp` selector:
```css
appearance: none;
-webkit-appearance: none;
background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238899aa' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
background-repeat: no-repeat;
background-position: right 10px center;
padding-right: 32px;
```

**Adjust layout** — change `.support-view` to:
```css
.support-view { display: flex; flex-direction: column; gap: 0; }
```

Move the `form` padding into a wrapper:
```css
form { padding: 16px 22px; display: flex; flex-direction: column; gap: 12px; }
```

### Step 2 — QuestionnaireView.svelte

File: `website/src/components/assistant/QuestionnaireView.svelte`

**Update `.inner-hdr`:**
```css
.inner-hdr {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 22px;
  border-bottom: 1px solid rgba(232, 200, 112, 0.12);
  font-size: 12px;
  font-family: var(--font-mono, 'Geist Mono', monospace);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 500;
  color: var(--admin-text, #e8e8f0);
  flex-shrink: 0;
  /* remove background: #1e2a3a — inherit drawer background */
}
```

**Update `.back-btn`:**
```css
.back-btn { background: transparent; border: none; color: oklch(0.83 0.09 75); cursor: pointer; font-size: 11px; padding: 0; white-space: nowrap; flex-shrink: 0; font-family: var(--font-mono, 'Geist Mono', monospace); letter-spacing: 0.08em; }
```

### Step 3 — HelpView.svelte

File: `website/src/components/assistant/HelpView.svelte`

**Replace purple accents with brass:**
- `.section-title` color: `#818cf8` → `oklch(0.83 0.09 75)`
- `.action-dot` color: `#818cf8` → `oklch(0.83 0.09 75)`
- `.guide-summary` color: `#818cf8` → `oklch(0.83 0.09 75)`
- `.guide-summary` background: `rgba(79,70,229,.12)` → `rgba(232,200,112,.06)`
- `.guide-steps` background: `rgba(79,70,229,.06)` → `rgba(232,200,112,.03)`

**Add intro block** at top of `.help-body` before content:
```html
<div class="hv-intro">
  <span class="hv-eyebrow">
    <span class="hv-eyebrow-bar" aria-hidden="true"></span>
    Kontexthilfe
  </span>
</div>
```

```css
.hv-intro { padding: 20px 22px 12px; border-bottom: 1px solid rgba(255,255,255,0.06); margin: -16px -16px 12px; }
.hv-eyebrow { font-family: var(--font-mono, 'Geist Mono', monospace); font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: oklch(0.83 0.09 75); display: inline-flex; align-items: center; gap: 10px; }
.hv-eyebrow-bar { width: 16px; height: 1px; background: oklch(0.83 0.09 75); opacity: 0.85; flex-shrink: 0; }
```

### Step 4 — TicketSidekickView.svelte + InboxSidekickView.svelte

Files: `website/src/components/assistant/TicketSidekickView.svelte`, `InboxSidekickView.svelte`

Read the full files and apply the same inner-hdr pattern fix as Step 2 if they have a similar header bar. If they have `<select>` elements, add `appearance: none`. Replace any purple accents with brass.

### Step 5 — Verify

```bash
cd /tmp/wt-sidekick-subview-css
task website:dev
# Open http://localhost:4321 (or wherever), navigate to admin
# Click sidekick FAB, verify SidekickHome looks unchanged
# Click "Feedback & Support" → verify intro eyebrow appears, form looks dark and consistent
# Click "Fragebögen" → verify inner-hdr no longer has lighter background
# Click "Hilfe" → verify brass accents, no purple
# Click "Anfragen" / "Postfach" → verify consistent styling
```

Then:
```bash
task test:all
```

### Step 6 — PR

- Branch: `fix/sidekick-subview-css`
- Title: `fix(website): unify sidekick sub-view visual language with WidgetMainMenu [T000136]`
- Deploy: `task feature:website` after merge

## Notes

- No automated visual regression test exists for this area — the CI test suite covers functional/API tests, not CSS rendering. A manual smoke-check in the browser is the verification gate.
- MISHAP_LOG: `QuestionnaireView` inner-hdr pattern is inconsistent with other sub-views — bundled into this fix.
- HelpView purple accent (`#818cf8`) is likely a copy-paste from a different design context (indigo/violet palette not used elsewhere in the sidekick). Flagged and fixed here.
