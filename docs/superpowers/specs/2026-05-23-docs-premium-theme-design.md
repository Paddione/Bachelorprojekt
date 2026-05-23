# Docs Premium Theme Upgrade — Design Spec

**Date:** 2026-05-23  
**Scope:** Full Premium (Option C) — `k3d/docs-content/index.html` + all 45+ markdown pages  
**Goal:** Bring the Docsify docs to the same visual quality as the existing `docs/skills/` pages.

---

## Problem

The skills pages (`docs/skills/*.html`) use a premium Obsidian/Brass/Sage design system with glassmorphism, gradient headings, phase-cards, and Newsreader typography. The Docsify docs (`k3d/docs-content/`) use an older Navy/Gold theme that is functional but visually inconsistent with the new standard.

---

## Design System (Target)

Taken directly from `docs/skills/style.css`:

| Token | Old value | New value |
|---|---|---|
| Background | `#111827` | `#0a0a0b` |
| Surface | `#1a2235` | `rgba(20,20,22,0.55)` |
| Border | `#2a3a52` | `rgba(255,255,255,0.06)` |
| Primary accent | `--gold: #e8c870` | `--brass: #d4af37` |
| Accent light | `#f0d88a` | `--brass-light: #eac04d` |
| Secondary accent | — | `--sage: #86a68d` |
| Serif font | Merriweather | Newsreader (opsz,wght) |
| Sans font | Inter | Inter (unchanged) |
| h1 style | Gold colour | Gradient white → `#71717a` via `-webkit-text-fill-color` |
| Sidebar bg | `#0f1623` solid | `rgba(10,10,11,0.65)` + `backdrop-filter:blur(16px)` |
| Code accent | gold `#e8c870` | brass `#d4af37` |

---

## Changes

### 1. `k3d/docs-content/index.html` — CSS overhaul

Single file, affects all 45+ pages instantly.

**Palette & fonts:**
- Replace all `--dark*` / `--gold*` variables with the Obsidian/Brass/Sage set.
- Add `Newsreader` to the Google Fonts import; remove Merriweather.
- Add radial-gradient ambient glow to `body` background (brass at 0% 0%, sage at 100% 100%, both at ~3% opacity, fixed attachment).

**Sidebar:**
- `background: rgba(10,10,11,0.65)` + `backdrop-filter: blur(16px)` + `border-right: 1px solid rgba(255,255,255,0.05)`.
- App name: Newsreader, brass colour.
- Group labels: tighter, `color: #3f3f46`, smaller tracking.
- Active link: brass left-border (`2px solid #d4af37`), no extra padding offset.

**Headings:**
- `h1`: Newsreader, `font-weight:300`, gradient text (`linear-gradient(to bottom, #fff 30%, #71717a)` via `-webkit-background-clip`).
- `h2`: Newsreader, `font-weight:400`, `border-bottom: 1px solid rgba(212,175,55,0.25)`.
- `h3`: Inter 600, `color: #eac04d` (brass-light).

**Component CSS classes (new / replaced):**

| Class | Purpose |
|---|---|
| `.page-hero` | Glassmorphism hero: `rgba(20,20,22,0.55)` bg + blur + brass left border |
| `.page-hero-title` | Newsreader 300, gradient text |
| `.track-card` | Obsidian card with top colour bar (brass/sage/blue per nth-child), hover lift |
| `.home-card` | Updated to obsidian surface + glassmorphism hover |
| `.callout`, `.callout-warn`, `.callout-info`, `.callout-tip`, `.callout-crit` | New — coloured left-border alert boxes |
| `.phase-card`, `.phase-header`, `.phase-num`, `.phase-body` | New — numbered step cards, colour variants: brass/sage/blue/red |
| `.toc-box` | Updated border-top to brass; surface to obsidian |
| `pre` | `background: #0d0d0f`, `border: 1px solid rgba(255,255,255,0.06)`, rounded corners |
| `code` | `background: rgba(255,255,255,0.05)`, `color: #d4af37` |
| `blockquote` | Brass left border, `rgba(212,175,55,0.05)` bg |
| `table thead th` | Brass colour, obsidian bg |
| `mark` | `rgba(212,175,55,0.25)` bg, brass-light text |

**Mermaid theme:** keep `theme: 'dark'` but update edge stroke to `#86a68d` (sage) to match new palette.

---

### 2. `k3d/docs-content/README.md` — Homepage redesign

Full component overhaul since this is the landing page:

- Replace existing `.page-hero` block with new glassmorphism hero (eyebrow badge, gradient title with italic brass accent on "deinem Server", subtitle).
- Add `.home-stats` strip: 12 Services · 2 Cluster · 45+ Seiten · 100% On-Premise.
- Replace `.track-card` blocks with new 3-column grid cards (top colour bar per role, brass/sage/blue).
- Keep the architecture mermaid diagram (gets auto-themed by CSS).

---

### 3. All other markdown pages — component upgrade

**Every page** gets:
- Updated `.page-hero` HTML to use new eyebrow + gradient title pattern (find-and-replace across all files that have `page-hero`).

**Instructional / how-to pages** additionally get phase-cards for step-by-step sections and callout boxes for warnings/tips. Priority pages (full treatment first):
1. `quickstart-admin.md`
2. `quickstart-dev.md`
3. `quickstart-enduser.md`
4. `architecture.md`
5. `operations.md`
6. `backup.md`
7. `database.md`
8. `security.md`
9. `contributing.md`
10. `troubleshooting.md`

Remaining 35+ pages (reference docs, service-specific pages): get the CSS update for free via `index.html`; no per-page HTML changes needed unless they have custom blocks.

---

### 4. `k3d/docs-content/_sidebar.md`

No structural changes — the sidebar content is already well-organised. CSS changes in `index.html` handle the visual upgrade automatically.

---

## What Does NOT Change

- Docsify version or plugin set (search, mermaid, panzoom, auto-TOC).
- Sidebar structure and link targets.
- All markdown prose content.
- Mermaid diagram definitions.
- The skills pages (`docs/skills/`) — already premium, untouched.

---

## Implementation Order

1. `index.html` CSS overhaul (foundation — everything else builds on this).
2. `README.md` homepage redesign.
3. Top-10 priority pages (phase-cards + callouts).
4. Remaining pages with custom HTML blocks (sweep for `page-hero` occurrences).
5. Deploy: `task docs:deploy` to both clusters.

---

## Success Criteria

- Docs site palette is visually indistinguishable from `docs/skills/` aesthetic.
- Sidebar has glassmorphism blur effect.
- Every h1 renders with gradient text.
- Homepage has the 3-column track-card layout.
- All 10 priority pages have phase-cards for their step lists.
- `task docs:deploy` succeeds and both `docs.mentolder.de` and `docs.korczewski.de` show the new theme.
