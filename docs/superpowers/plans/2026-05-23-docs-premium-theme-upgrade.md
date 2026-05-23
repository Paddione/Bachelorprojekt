---
title: Docs Premium Theme Upgrade Implementation Plan
domains: []
status: active
pr_number: null
---

# Docs Premium Theme Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Docsify docs' Navy/Gold theme with the Obsidian/Brass/Sage premium design system (glassmorphism sidebar, gradient h1, phase-cards, callout boxes) to match `docs/skills/`.

**Architecture:** Single `index.html` CSS overhaul covers all 45+ pages instantly. README.md gets a new glassmorphism hero + stats strip + 3-column track cards. Ten priority pages get phase-cards wrapping their numbered step sections and callout boxes for warnings. All remaining pages with existing `.page-hero` get an eyebrow div added. Final step: `task docs:deploy` to both clusters.

**Tech Stack:** Docsify (no rebuild needed), vanilla CSS/HTML in markdown files, `task docs:deploy` (builds Docker image, pushes to ghcr.io, rolls out mentolder + korczewski).

---

## File Map

| File | Change |
|------|--------|
| `k3d/docs-content/index.html` | Complete `<style>` block replacement + Google Fonts link update |
| `k3d/docs-content/README.md` | Full homepage redesign (hero, stats strip, track cards) |
| `k3d/docs-content/quickstart-admin.md` | Eyebrow on page-hero; steps 1–5 wrapped in phase-cards |
| `k3d/docs-content/quickstart-dev.md` | Eyebrow on page-hero; major sections wrapped in phase-cards |
| `k3d/docs-content/quickstart-enduser.md` | Eyebrow on page-hero; numbered steps in phase-cards |
| `k3d/docs-content/architecture.md` | Eyebrow on page-hero; callouts for key gotchas |
| `k3d/docs-content/operations.md` | New page-hero added (currently missing); callout for ENV= footgun |
| `k3d/docs-content/backup.md` | New page-hero added; phase-cards for backup/restore flow; callout for PVC caveat |
| `k3d/docs-content/database.md` | New page-hero added; callout for redirect note |
| `k3d/docs-content/security.md` | Eyebrow on page-hero; phase-cards for security layers |
| `k3d/docs-content/contributing.md` | New page-hero added; phase-cards for PR workflow |
| `k3d/docs-content/troubleshooting.md` | New page-hero added; callout boxes for known issues |
| `k3d/docs-content/decisions.md` | Eyebrow added to existing page-hero (sweep) |
| `k3d/docs-content/dsgvo.md` | Eyebrow added to existing page-hero (sweep) |
| `k3d/docs-content/glossary.md` | Eyebrow added to existing page-hero (sweep) |
| `k3d/docs-content/mcp-actions.md` | Eyebrow added to existing page-hero (sweep) |
| `k3d/docs-content/security-report.md` | Eyebrow added to existing page-hero (sweep) |
| `k3d/docs-content/verarbeitungsverzeichnis.md` | Eyebrow added to existing page-hero (sweep) |

---

## Task 1: `index.html` — CSS Overhaul

**Files:**
- Modify: `k3d/docs-content/index.html`

This is the foundation. All 45+ pages inherit every CSS change here. No JavaScript or Docsify config changes.

- [ ] **Step 1.1: Update the Google Fonts import**

In `index.html`, replace the existing `<link>` for Google Fonts (line 10):

Old:
```html
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Merriweather:ital,wght@0,300;0,400;0,700;1,400&display=swap" rel="stylesheet">
```

New:
```html
  <link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;0,6..72,600;1,6..72,300;1,6..72,400&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
```

- [ ] **Step 1.2: Replace the entire `<style>` block**

Replace everything from `<style>` through `</style>` (lines 12–580) with:

```html
  <style>
    /* =====================================================================
       WORKSPACE MVP DOCS — OBSIDIAN / BRASS / SAGE PREMIUM THEME
       ===================================================================== */

    :root {
      --bg:            #0a0a0b;
      --bg-surface:    rgba(20, 20, 22, 0.55);
      --bg-code:       #0d0d0f;
      --border:        rgba(255, 255, 255, 0.06);
      --border-subtle: rgba(255, 255, 255, 0.04);

      --text:          #f0f0f2;
      --text-muted:    #a1a1aa;
      --text-dim:      #71717a;

      --brass:         #d4af37;
      --brass-light:   #eac04d;
      --brass-dim:     rgba(212, 175, 55, 0.10);
      --sage:          #86a68d;
      --sage-light:    #a8c7ae;
      --blue:          #82aaff;
      --red:           #ff757f;

      --font-sans:     'Inter', system-ui, -apple-system, sans-serif;
      --font-serif:    'Newsreader', Georgia, serif;
    }

    /* ---- Base ---------------------------------------------------------- */
    html, body {
      background: var(--bg) !important;
      background-image:
        radial-gradient(at 0% 0%, rgba(212, 175, 55, 0.03) 0px, transparent 50%),
        radial-gradient(at 100% 100%, rgba(134, 166, 141, 0.03) 0px, transparent 50%);
      background-attachment: fixed;
      color: var(--text);
      font-family: var(--font-sans);
    }

    /* ---- Sidebar ------------------------------------------------------- */
    .sidebar {
      background: rgba(10, 10, 11, 0.65) !important;
      backdrop-filter: blur(16px) !important;
      -webkit-backdrop-filter: blur(16px) !important;
      border-right: 1px solid rgba(255, 255, 255, 0.05) !important;
    }
    .sidebar .sidebar-nav a {
      color: var(--text-muted) !important;
      transition: color 0.15s;
    }
    .sidebar .sidebar-nav a:hover {
      color: var(--brass-light) !important;
    }
    .sidebar .sidebar-nav li.active > a,
    .sidebar .sidebar-nav a.active {
      color: var(--brass) !important;
      border-left: 2px solid var(--brass) !important;
      font-weight: 600;
    }
    .sidebar h5,
    .sidebar .sidebar-nav > ul > li > p,
    .sidebar .sidebar-nav > ul > li > span {
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.10em;
      text-transform: uppercase;
      color: #3f3f46 !important;
      margin: 1.2em 0 0.3em;
    }
    .sidebar-toggle {
      background: rgba(10, 10, 11, 0.65) !important;
    }
    .sidebar-toggle span {
      background-color: var(--text-muted) !important;
    }
    .app-name-link {
      color: var(--brass) !important;
      font-weight: 700 !important;
      font-family: var(--font-serif) !important;
    }

    /* ---- Main content -------------------------------------------------- */
    #main {
      background: transparent !important;
      color: var(--text);
    }
    .content {
      color: var(--text);
      max-width: 860px !important;
    }

    /* ---- Headings ------------------------------------------------------ */
    #main h1 {
      font-family: var(--font-serif) !important;
      font-weight: 300 !important;
      background: linear-gradient(to bottom, #ffffff 30%, #71717a) !important;
      -webkit-background-clip: text !important;
      -webkit-text-fill-color: transparent !important;
      background-clip: text !important;
      border-bottom: none !important;
      padding-bottom: 0.4em !important;
      margin-top: 0.5em !important;
    }
    #main h2 {
      font-family: var(--font-serif) !important;
      font-weight: 400 !important;
      color: var(--text) !important;
      border-bottom: 1px solid rgba(212, 175, 55, 0.25) !important;
      padding-bottom: 0.25em !important;
    }
    #main h3 {
      font-family: var(--font-sans) !important;
      font-weight: 600 !important;
      color: var(--brass-light) !important;
    }
    #main h4 {
      font-family: var(--font-sans) !important;
      font-weight: 500 !important;
      color: var(--text-muted) !important;
    }
    #main strong {
      color: var(--text) !important;
    }

    /* ---- Links --------------------------------------------------------- */
    a, .anchor span {
      color: var(--brass) !important;
    }
    a:hover {
      color: var(--brass-light) !important;
      text-decoration: underline;
    }

    /* ---- Tables -------------------------------------------------------- */
    #main table {
      border-collapse: collapse !important;
      width: 100% !important;
      margin: 1em 0 !important;
    }
    #main table thead tr {
      background: rgba(20, 20, 22, 0.7) !important;
    }
    #main table thead th {
      color: var(--brass) !important;
      font-size: 0.72rem !important;
      font-weight: 700 !important;
      letter-spacing: 0.08em !important;
      text-transform: uppercase !important;
      border: 1px solid var(--border) !important;
      padding: 0.6em 0.9em !important;
      background: rgba(20, 20, 22, 0.7) !important;
    }
    #main table tbody tr:nth-child(odd) {
      background: rgba(20, 20, 22, 0.4) !important;
    }
    #main table tbody tr:nth-child(even) {
      background: rgba(20, 20, 22, 0.2) !important;
    }
    #main table tbody tr {
      border-bottom: 1px solid var(--border) !important;
    }
    #main table tbody tr:hover {
      background: rgba(212, 175, 55, 0.08) !important;
    }
    #main table tbody td {
      border: 1px solid var(--border) !important;
      padding: 0.5em 0.9em !important;
      color: var(--text) !important;
      background: inherit !important;
    }

    /* ---- Code ---------------------------------------------------------- */
    code {
      background: rgba(255, 255, 255, 0.05) !important;
      color: var(--brass) !important;
      border: 1px solid var(--border) !important;
      border-radius: 4px;
      padding: 0.15em 0.4em;
      font-size: 0.88em;
    }
    pre {
      background: var(--bg-code) !important;
      border: 1px solid var(--border) !important;
      border-left: none !important;
      border-radius: 8px;
      padding: 1em 1.2em;
      overflow-x: auto;
    }
    pre code {
      background: transparent !important;
      border: none !important;
      padding: 0;
      color: var(--text) !important;
    }

    /* ---- Blockquote ---------------------------------------------------- */
    blockquote {
      border-left: 4px solid var(--brass) !important;
      background: rgba(212, 175, 55, 0.05) !important;
      color: var(--text-muted) !important;
      padding: 0.8em 1.2em;
      border-radius: 0 6px 6px 0;
      margin: 1em 0;
    }
    blockquote p {
      margin: 0;
    }

    /* ---- Page Hero ----------------------------------------------------- */
    .page-hero {
      background: rgba(20, 20, 22, 0.55);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid var(--border);
      border-left: 4px solid var(--brass);
      border-radius: 0 12px 12px 0;
      padding: 1.6em 2em;
      margin: 0 0 2em;
      display: flex;
      align-items: flex-start;
      gap: 1.2em;
    }
    .page-hero-icon {
      font-size: 2.4rem;
      line-height: 1;
      flex-shrink: 0;
    }
    .page-hero-body {
      flex: 1;
    }
    .page-hero-eyebrow {
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.10em;
      text-transform: uppercase;
      color: var(--brass);
      margin: 0 0 0.4em;
    }
    .page-hero-title {
      font-family: var(--font-serif);
      font-size: 1.6rem;
      font-weight: 300;
      background: linear-gradient(to bottom, #ffffff 30%, #71717a);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin: 0 0 0.3em;
    }
    .page-hero-desc {
      color: var(--text-muted);
      font-size: 0.95rem;
      margin: 0 0 0.6em;
      line-height: 1.6;
    }
    .page-hero-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4em;
      margin-top: 0.5em;
    }
    .page-hero-tag {
      display: inline-block;
      background: rgba(212, 175, 55, 0.08);
      color: var(--brass);
      border: 1px solid rgba(212, 175, 55, 0.2);
      border-radius: 20px;
      padding: 0.15em 0.7em;
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .page-hero-back {
      display: inline-block;
      color: var(--text-dim) !important;
      font-size: 0.8rem;
      margin-bottom: 0.5em;
      text-decoration: none !important;
    }
    .page-hero-back:hover {
      color: var(--brass) !important;
    }

    /* ---- TOC Box ------------------------------------------------------- */
    .toc-box {
      background: rgba(20, 20, 22, 0.55);
      border: 1px solid var(--border);
      border-top: 3px solid var(--brass);
      border-radius: 8px;
      padding: 1.2em 1.5em;
      margin: 2em 0;
    }
    .toc-title {
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--brass);
      margin: 0 0 0.8em;
    }
    .toc-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 0.3em 1.5em;
    }
    .toc-item {
      margin: 0;
    }
    .toc-item a {
      color: var(--text-muted) !important;
      text-decoration: none !important;
      font-size: 0.875rem;
      display: flex;
      align-items: baseline;
      gap: 0.4em;
      padding: 0.2em 0;
      transition: color 0.15s;
    }
    .toc-item a:hover {
      color: var(--brass-light) !important;
    }
    .toc-num {
      color: var(--brass);
      font-size: 0.75rem;
      font-weight: 600;
      flex-shrink: 0;
      min-width: 1.4em;
    }

    /* ---- Home Hero ----------------------------------------------------- */
    .home-hero {
      text-align: center;
      padding: 3em 1em 2em;
    }
    .home-hero-tag {
      display: inline-block;
      background: rgba(212, 175, 55, 0.08);
      color: var(--brass);
      border: 1px solid rgba(212, 175, 55, 0.25);
      border-radius: 20px;
      padding: 0.25em 1em;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      margin-bottom: 0.8em;
    }
    .home-hero-title {
      font-family: var(--font-serif);
      font-size: 2.4rem;
      font-weight: 300;
      background: linear-gradient(to bottom, #ffffff 30%, #71717a);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin: 0 0 0.5em;
      line-height: 1.2;
    }
    .home-hero-sub {
      color: var(--text-muted);
      font-size: 1.05rem;
      max-width: 600px;
      margin: 0 auto;
      line-height: 1.7;
    }
    .brass-accent {
      -webkit-text-fill-color: var(--brass) !important;
      background: none !important;
      font-style: italic;
    }

    /* ---- Home Stats ---------------------------------------------------- */
    .home-stats {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 1.5em;
      padding: 1.5em 0;
      border-top: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
      margin: 1.5em 0;
    }
    .home-stat {
      text-align: center;
    }
    .home-stat-value {
      font-size: 1.8rem;
      font-weight: 700;
      color: var(--brass);
      font-family: var(--font-serif);
    }
    .home-stat-label {
      font-size: 0.75rem;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    /* ---- Home Sections & Cards ---------------------------------------- */
    .home-section {
      margin: 2em 0;
    }
    .home-section-label {
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--brass);
      margin-bottom: 0.8em;
      padding-bottom: 0.4em;
      border-bottom: 1px solid var(--border);
    }
    .home-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 1em;
    }
    .home-card {
      background: rgba(20, 20, 22, 0.55);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 1.2em 1.4em;
      text-decoration: none !important;
      display: block;
      transition: border-color 0.15s, transform 0.15s;
    }
    .home-card:hover {
      border-color: rgba(212, 175, 55, 0.3);
      transform: translateY(-2px);
    }
    .home-card-icon {
      font-size: 1.5rem;
      margin-bottom: 0.4em;
    }
    .home-card-title {
      font-weight: 600;
      color: var(--text) !important;
      margin-bottom: 0.3em;
      font-size: 0.95rem;
    }
    .home-card-desc {
      color: var(--text-dim);
      font-size: 0.82rem;
      line-height: 1.5;
    }

    /* ---- Track Cards (3-column grid) ---------------------------------- */
    .tracks {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1em;
      margin: 2em 0;
    }
    @media (max-width: 700px) {
      .tracks { grid-template-columns: 1fr; }
    }
    .track-card {
      background: rgba(20, 20, 22, 0.55);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      text-decoration: none !important;
      display: flex;
      flex-direction: column;
      transition: transform 0.2s ease, border-color 0.2s ease;
    }
    .track-card:hover {
      transform: translateY(-3px);
      border-color: rgba(212, 175, 55, 0.2);
    }
    .track-bar {
      height: 3px;
      width: 100%;
    }
    .track-card:nth-child(1) .track-bar { background: var(--brass); }
    .track-card:nth-child(2) .track-bar { background: var(--sage); }
    .track-card:nth-child(3) .track-bar { background: var(--blue); }
    .track-content {
      padding: 1.2em 1.4em;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 0.3em;
    }
    .track-label {
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.10em;
      text-transform: uppercase;
      color: var(--text-dim);
    }
    .track-title {
      font-family: var(--font-serif);
      font-size: 1.1rem;
      font-weight: 400;
      color: var(--text) !important;
    }
    .track-desc {
      color: var(--text-muted);
      font-size: 0.82rem;
      line-height: 1.5;
      flex: 1;
    }
    .track-arrow {
      color: var(--brass) !important;
      font-size: 0.82rem;
      font-weight: 600;
      margin-top: 0.5em;
    }

    /* ---- Callout Boxes ------------------------------------------------- */
    .callout {
      border-radius: 8px;
      padding: 1em 1.2em;
      margin: 1.5em 0;
      border-left: 4px solid;
      font-size: 0.92rem;
      line-height: 1.6;
    }
    .callout p { margin: 0; }
    .callout p + p { margin-top: 0.5em; }
    .callout-warn { background: rgba(255, 117, 127, 0.07); border-color: var(--red);  color: var(--text-muted); }
    .callout-info { background: rgba(130, 170, 255, 0.07); border-color: var(--blue); color: var(--text-muted); }
    .callout-tip  { background: rgba(134, 166, 141, 0.07); border-color: var(--sage); color: var(--text-muted); }
    .callout-crit { background: rgba(255, 117, 127, 0.12); border-color: var(--red);  color: var(--text); font-weight: 500; }

    /* ---- Phase Cards --------------------------------------------------- */
    .phase-card {
      background: rgba(20, 20, 22, 0.55);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      margin: 1.5em 0;
      transition: transform 0.2s ease, border-color 0.2s ease;
    }
    .phase-card:hover {
      transform: translateY(-2px);
      border-color: rgba(212, 175, 55, 0.15);
    }
    .phase-header {
      display: flex;
      align-items: center;
      gap: 1em;
      padding: 1em 1.25em;
      border-bottom: 1px solid var(--border-subtle);
      background: rgba(255, 255, 255, 0.02);
    }
    .phase-num {
      width: 2.2rem;
      height: 2.2rem;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.9rem;
      font-weight: 700;
      flex-shrink: 0;
      font-family: ui-monospace, monospace;
    }
    .phase-num-brass  { background: rgba(212, 175, 55, 0.15); color: var(--brass-light); border: 1px solid rgba(212, 175, 55, 0.3); }
    .phase-num-sage   { background: rgba(134, 166, 141, 0.15); color: var(--sage-light); border: 1px solid rgba(134, 166, 141, 0.3); }
    .phase-num-blue   { background: rgba(130, 170, 255, 0.15); color: var(--blue);        border: 1px solid rgba(130, 170, 255, 0.3); }
    .phase-num-red    { background: rgba(255, 117, 127, 0.15); color: var(--red);         border: 1px solid rgba(255, 117, 127, 0.3); }
    .phase-title {
      font-family: var(--font-serif);
      font-size: 1.1rem;
      font-weight: 400;
      color: var(--text);
    }
    .phase-desc {
      margin-left: auto;
      font-size: 0.82rem;
      color: var(--text-dim);
      font-weight: 500;
    }
    .phase-body {
      padding: 1.25em 1.5em;
    }
    .phase-body > *:last-child { margin-bottom: 0; }

    /* ---- Kicker ------------------------------------------------------- */
    .kicker {
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--text-dim);
      margin: -0.5em 0 1.5em;
    }

    /* ---- Mermaid arrows & edges --------------------------------------- */
    .mermaid svg .edgePath .path,
    .mermaid svg .flowchart-link,
    .mermaid svg path.er.relationshipLine,
    .mermaid svg line.er.relationshipLine,
    .mermaid svg path[class*="relation"] {
      stroke: var(--sage) !important;
      stroke-width: 2px !important;
    }
    .mermaid svg marker path,
    .mermaid svg marker polygon,
    .mermaid svg marker line {
      fill: var(--sage) !important;
      stroke: var(--sage) !important;
    }
    .mermaid svg .edgeLabel .label rect {
      fill: rgba(20, 20, 22, 0.7) !important;
    }
    .mermaid svg .edgeLabel span,
    .mermaid svg .edgeLabel p {
      color: var(--text-muted) !important;
      background: rgba(20, 20, 22, 0.7) !important;
    }
    /* ---- ER diagram ---------------------------------------------------- */
    .mermaid svg .er.entityBox {
      fill: rgba(20, 20, 22, 0.7) !important;
      stroke: var(--border) !important;
    }
    .mermaid svg .er.entityLabel {
      fill: var(--text) !important;
    }
    .mermaid svg .er.attributeBoxEven {
      fill: rgba(20, 20, 22, 0.5) !important;
    }
    .mermaid svg .er.attributeBoxOdd {
      fill: rgba(15, 15, 17, 0.8) !important;
    }
    .mermaid svg .er.relationshipLabel {
      fill: var(--text-muted) !important;
    }
    .mermaid svg .er.relationshipLabelBox {
      fill: rgba(20, 20, 22, 0.7) !important;
      opacity: 1 !important;
    }

    /* ---- Mermaid ------------------------------------------------------- */
    .mermaid-wrapper {
      position: relative;
      width: 100%;
      overflow: hidden;
      border: 1px solid var(--border);
      border-radius: 8px;
      margin: 1em 0;
      background: rgba(20, 20, 22, 0.55);
    }
    .mermaid-wrapper svg {
      display: block;
      width: 100% !important;
      height: auto !important;
      max-width: none !important;
      cursor: grab;
    }
    .mermaid-wrapper svg:active {
      cursor: grabbing;
    }
    .mermaid-zoom-hint {
      position: absolute;
      bottom: 6px;
      right: 8px;
      font-size: 11px;
      color: var(--text-dim);
      pointer-events: none;
      user-select: none;
    }
    .mermaid-zoom-reset {
      position: absolute;
      top: 6px;
      right: 8px;
      font-size: 11px;
      padding: 2px 6px;
      background: rgba(0, 0, 0, 0.35);
      border: 1px solid var(--border);
      border-radius: 3px;
      cursor: pointer;
      display: none;
      color: var(--text-muted);
    }
    .mermaid-wrapper:hover .mermaid-zoom-reset {
      display: block;
    }
    .mermaidTooltip {
      background-color: rgba(20, 20, 22, 0.9) !important;
      color: var(--brass) !important;
      border: 1px solid var(--border) !important;
      border-radius: 6px !important;
      padding: 8px 12px !important;
      font-size: 12px !important;
      font-family: inherit !important;
      max-width: 320px !important;
      line-height: 1.5 !important;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6) !important;
      pointer-events: none;
    }

    /* ---- Search -------------------------------------------------------- */
    .search {
      background: rgba(20, 20, 22, 0.7) !important;
      border-bottom: 1px solid var(--border) !important;
    }
    .search input {
      background: var(--bg) !important;
      color: var(--text) !important;
      border: 1px solid var(--border) !important;
      border-radius: 4px;
    }
    .search input::placeholder {
      color: var(--text-dim) !important;
    }
    .search .matching-post {
      background: rgba(20, 20, 22, 0.6) !important;
      border-bottom: 1px solid var(--border) !important;
    }
    .search .matching-post:hover {
      background: rgba(212, 175, 55, 0.05) !important;
    }
    .search .matching-post h2 {
      color: var(--brass) !important;
      font-size: 0.95rem !important;
      border: none !important;
    }
    .search .matching-post p {
      color: var(--text-muted) !important;
      font-size: 0.82rem;
    }
    mark {
      background: rgba(212, 175, 55, 0.25) !important;
      color: var(--brass-light) !important;
      border-radius: 2px;
    }

    /* ---- Miscellaneous ------------------------------------------------- */
    hr {
      border: none;
      border-top: 1px solid var(--border);
      margin: 2em 0;
    }
    .markdown-section {
      color: var(--text);
    }
    .cover-main {
      background: var(--bg) !important;
    }
    nav.app-nav a {
      color: var(--text-muted) !important;
    }
    nav.app-nav a:hover {
      color: var(--brass) !important;
    }
  </style>
```

- [ ] **Step 1.3: Commit**

```bash
git add k3d/docs-content/index.html
git commit -m "feat(docs): obsidian/brass/sage premium theme CSS overhaul"
```

---

## Task 2: `README.md` — Homepage Redesign

**Files:**
- Modify: `k3d/docs-content/README.md`

Replace the existing content (old `.page-hero` + `.kicker` + `.tracks` with the old span-based children + the `# Workspace —` h1 heading) with the new glassmorphism hero, stats strip, and 3-column track cards. Keep the mermaid diagram, service endpoints table, and help section unchanged.

- [ ] **Step 2.1: Replace the top section of README.md**

Replace everything from the opening `<div class="page-hero">` through the closing `</div>` of the `.tracks` block (lines 1–39 of the current file) with:

```html
<div class="home-hero">
  <div class="home-hero-tag">Workspace MVP · Self-Hosted · Kubernetes</div>
  <h1 class="home-hero-title">Alles bleibt auf <em class="brass-accent">deinem Server</em>.</h1>
  <p class="home-hero-sub">Kubernetes-Plattform für Coaching und Beratung — Nextcloud, Keycloak, LiveKit, Claude Code, Vaultwarden. DSGVO by Design.</p>
</div>

<div class="home-stats">
  <div class="home-stat">
    <div class="home-stat-value">12</div>
    <div class="home-stat-label">Services</div>
  </div>
  <div class="home-stat">
    <div class="home-stat-value">2</div>
    <div class="home-stat-label">Cluster</div>
  </div>
  <div class="home-stat">
    <div class="home-stat-value">45+</div>
    <div class="home-stat-label">Seiten</div>
  </div>
  <div class="home-stat">
    <div class="home-stat-value">100%</div>
    <div class="home-stat-label">On-Premise</div>
  </div>
</div>

<div class="tracks">
  <a href="#/quickstart-enduser" class="track-card">
    <div class="track-bar"></div>
    <div class="track-content">
      <span class="track-label">Endnutzer</span>
      <span class="track-title">In 5 Minuten</span>
      <span class="track-desc">Login · Portal · erstes Talk-Call · Datei hochladen</span>
      <span class="track-arrow">→ Quickstart</span>
    </div>
  </a>
  <a href="#/quickstart-admin" class="track-card">
    <div class="track-bar"></div>
    <div class="track-content">
      <span class="track-label">Admin</span>
      <span class="track-title">Plattform aufsetzen</span>
      <span class="track-desc">Cluster · Workspace · Post-Setup · Backup</span>
      <span class="track-arrow">→ Quickstart</span>
    </div>
  </a>
  <a href="#/quickstart-dev" class="track-card">
    <div class="track-bar"></div>
    <div class="track-content">
      <span class="track-label">Entwickler</span>
      <span class="track-title">Codebase-Tour</span>
      <span class="track-desc">k3d · environments · Tasks · Tests</span>
      <span class="track-arrow">→ Quickstart</span>
    </div>
  </a>
</div>
```

- [ ] **Step 2.2: Commit**

```bash
git add k3d/docs-content/README.md
git commit -m "feat(docs): new glassmorphism homepage hero, stats strip, track cards"
```

---

## Task 3: `quickstart-admin.md` — Phase-Cards + Eyebrow

**Files:**
- Modify: `k3d/docs-content/quickstart-admin.md`

The page currently has a `.page-hero` (needs eyebrow), then numbered `## N. Title` sections that become phase-cards.

- [ ] **Step 3.1: Add eyebrow to page-hero**

Replace the opening of the `.page-hero` body:

```html
  <div class="page-hero-body">
    <div class="page-hero-title">Quickstart — Admin</div>
```

With:

```html
  <div class="page-hero-body">
    <div class="page-hero-eyebrow">Admin · Erstinstallation</div>
    <div class="page-hero-title">Workspace aufsetzen</div>
```

- [ ] **Step 3.2: Wrap numbered steps in phase-cards**

The numbered steps follow the pattern `## N. Title`. Read the full file and wrap each numbered step section (from the `## N.` heading through all content up to the next `## N+1.` or end of file) using this HTML structure. Remove the `## N. Title` heading (its text moves into `.phase-title`).

**Template:**

```html
<div class="phase-card">
  <div class="phase-header">
    <div class="phase-num phase-num-brass">N</div>
    <span class="phase-title">Step Title</span>
    <span class="phase-desc">~X min</span>
  </div>
  <div class="phase-body">

content here (markdown still works inside phase-body)

  </div>
</div>
```

**Colour rotation for phase-num:** brass → sage → blue → brass → sage → … (repeat for 5+ steps).

**Concrete example for step 1 of quickstart-admin.md:**

Before:
```markdown
## 1. Cluster anlegen

```bash
git clone https://github.com/Paddione/Bachelorprojekt.git
cd Bachelorprojekt
task cluster:create
```

Die Konfiguration steht in `k3d-config.yaml`...
```

After:
```html
<div class="phase-card">
  <div class="phase-header">
    <div class="phase-num phase-num-brass">1</div>
    <span class="phase-title">Cluster anlegen</span>
    <span class="phase-desc">~2 min</span>
  </div>
  <div class="phase-body">

```bash
git clone https://github.com/Paddione/Bachelorprojekt.git
cd Bachelorprojekt
task cluster:create
```

Die Konfiguration steht in `k3d-config.yaml`. Wenn der Befehl durchläuft, gibt `kubectl get nodes` einen Eintrag mit Status `Ready` aus.

  </div>
</div>
```

Apply this pattern to all numbered steps (1–5+ in this file). Keep `<p class="kicker">` and `# Admin-Quickstart` h1 between the page-hero and the first phase-card.

- [ ] **Step 3.3: Commit**

```bash
git add k3d/docs-content/quickstart-admin.md
git commit -m "feat(docs): quickstart-admin phase-cards and hero eyebrow"
```

---

## Task 4: `quickstart-enduser.md` — Phase-Cards + Eyebrow

**Files:**
- Modify: `k3d/docs-content/quickstart-enduser.md`

Follows identical pattern to Task 3. The page has a `.page-hero`, then numbered `## N. Step Title` sections.

- [ ] **Step 4.1: Add eyebrow to page-hero**

Replace:
```html
    <div class="page-hero-title">Quickstart — Endnutzer</div>
```
With:
```html
    <div class="page-hero-eyebrow">Endnutzer · Erste Schritte</div>
    <div class="page-hero-title">In fünf Minuten startklar</div>
```

- [ ] **Step 4.2: Wrap numbered steps in phase-cards**

Read the file and apply the phase-card template from Task 3 Step 3.2 to each `## N.` section. Use brass/sage/blue colour rotation. Approximate durations: 1 min, 2 min, 2 min, 1 min, 1 min.

- [ ] **Step 4.3: Commit**

```bash
git add k3d/docs-content/quickstart-enduser.md
git commit -m "feat(docs): quickstart-enduser phase-cards and hero eyebrow"
```

---

## Task 5: `quickstart-dev.md` — Phase-Cards + Eyebrow

**Files:**
- Modify: `k3d/docs-content/quickstart-dev.md`

The dev quickstart has conceptual sections (`## Repo-Layout`, `## Lokale Entwicklung`, etc.) rather than numbered workflow steps. Wrap the 3–4 major workflow sections in phase-cards.

- [ ] **Step 5.1: Add eyebrow to page-hero**

Replace:
```html
    <div class="page-hero-title">Quickstart — Entwickler</div>
```
With:
```html
    <div class="page-hero-eyebrow">Entwickler · Codebase-Tour</div>
    <div class="page-hero-title">Codebase-Einstieg</div>
```

- [ ] **Step 5.2: Read the file and wrap major sections in phase-cards**

Read `quickstart-dev.md` fully. The sections `## Repo-Layout`, `## Lokale Entwicklung`, `## Tests ausführen`, and `## Pull-Request-Workflow` (or however they are named) are the workflow steps. Wrap each in a phase-card using the template from Task 3.

Number them 1, 2, 3, 4 with brass/sage/blue/brass colours. Use the section heading as `phase-title`, remove the `## ` markdown heading.

- [ ] **Step 5.3: Commit**

```bash
git add k3d/docs-content/quickstart-dev.md
git commit -m "feat(docs): quickstart-dev phase-cards and hero eyebrow"
```

---

## Task 6: `architecture.md` + `security.md` — Eyebrow + Callouts

**Files:**
- Modify: `k3d/docs-content/architecture.md`
- Modify: `k3d/docs-content/security.md`

Both have existing `.page-hero`. Add eyebrow divs. Add `callout-info` boxes for key "for admins" notes.

- [ ] **Step 6.1: architecture.md — add eyebrow**

Replace:
```html
    <div class="page-hero-title">Systemarchitektur</div>
```
With:
```html
    <div class="page-hero-eyebrow">Referenz · Kubernetes</div>
    <div class="page-hero-title">Systemarchitektur</div>
```

- [ ] **Step 6.2: architecture.md — add a callout-info above the first mermaid diagram**

Read the file. Find the section directly before the first `\`\`\`mermaid` block and insert:

```html
<div class="callout callout-info">
Alle Diagramme sind interaktiv — Scroll zum Zoomen, Ziehen zum Verschieben. Klick "Reset" zum Zurücksetzen.
</div>
```

- [ ] **Step 6.3: security.md — add eyebrow**

Replace:
```html
    <div class="page-hero-title">Sicherheitsarchitektur</div>
```
With:
```html
    <div class="page-hero-eyebrow">Sicherheit · SA-01–SA-10</div>
    <div class="page-hero-title">Sicherheitsarchitektur</div>
```

- [ ] **Step 6.4: security.md — add callout-warn for credential rotation**

Read the file and find the section about secret/credential management. After the relevant `## ` heading, insert:

```html
<div class="callout callout-warn">
Nach jedem Cluster-Reset muss <code>task env:seal ENV=&lt;env&gt;</code> neu ausgeführt werden — das Sealed-Secrets-Keypair wechselt und alle alten SealedSecrets entschlüsseln nicht mehr.
</div>
```

- [ ] **Step 6.5: Commit**

```bash
git add k3d/docs-content/architecture.md k3d/docs-content/security.md
git commit -m "feat(docs): architecture + security hero eyebrow and callouts"
```

---

## Task 7: `operations.md` — New Page-Hero + Phase-Cards

**Files:**
- Modify: `k3d/docs-content/operations.md`

Currently has NO page-hero (starts directly with a mermaid diagram after `# Deployment & Betrieb`).

- [ ] **Step 7.1: Add page-hero at the top of the file**

Insert at the very beginning of the file (before `# Deployment & Betrieb`):

```html
<div class="page-hero">
  <span class="page-hero-icon">⚙️</span>
  <div class="page-hero-body">
    <div class="page-hero-eyebrow">Betrieb · Taskfile</div>
    <div class="page-hero-title">Deployment & Betrieb</div>
    <p class="page-hero-desc">Alle Task-Befehle für Cluster, Workspace, Secrets und Monitoring — für dev und prod.</p>
    <div class="page-hero-meta">
      <span class="page-hero-tag">Für Administratoren</span>
      <span class="page-hero-tag">Taskfile</span>
    </div>
  </div>
  <a href="#/" class="page-hero-back">← Übersicht</a>
</div>

```

- [ ] **Step 7.2: Add callout-warn for ENV= footgun**

Read the file. Find the section describing `task workspace:deploy` or ENV-sensitive commands. Insert after it:

```html
<div class="callout callout-warn">
<strong>ENV= immer angeben.</strong> Ohne <code>ENV=mentolder</code> oder <code>ENV=korczewski</code> läuft der Task gegen den aktiven kubectl-Kontext — das kann stillschweigend ins falsche Cluster deployen.
</div>
```

- [ ] **Step 7.3: Commit**

```bash
git add k3d/docs-content/operations.md
git commit -m "feat(docs): operations page-hero, callout for ENV= footgun"
```

---

## Task 8: `backup.md` + `database.md` + `contributing.md` + `troubleshooting.md`

**Files:**
- Modify: `k3d/docs-content/backup.md`
- Modify: `k3d/docs-content/database.md`
- Modify: `k3d/docs-content/contributing.md`
- Modify: `k3d/docs-content/troubleshooting.md`

All four currently have NO page-hero.

- [ ] **Step 8.1: backup.md — add page-hero + phase-cards + callout**

Insert at the top of the file (before `# Backup & Wiederherstellung`):

```html
<div class="page-hero">
  <span class="page-hero-icon">💾</span>
  <div class="page-hero-body">
    <div class="page-hero-eyebrow">Daten · Wiederherstellung</div>
    <div class="page-hero-title">Backup & Wiederherstellung</div>
    <p class="page-hero-desc">Tägliche verschlüsselte DB-Snapshots, Restore-Workflow und Backup-Monitoring.</p>
    <div class="page-hero-meta">
      <span class="page-hero-tag">SA-07</span>
      <span class="page-hero-tag">AES-256</span>
    </div>
  </div>
  <a href="#/" class="page-hero-back">← Übersicht</a>
</div>

```

After the existing `> **Hinweis:** Datei-PVCs...` blockquote, replace the blockquote with a proper callout:

```html
<div class="callout callout-warn">
<strong>Datei-PVCs werden NICHT gesichert.</strong> Nextcloud-Dateien, Vaultwarden-Anhänge und DocuSeal-Dokumente liegen im Dateisystem — nur die Datenbankdaten sind im Backup enthalten.
</div>
```

Read the file for `## Backup wiederherstellen` and similar restore-flow sections. Wrap the main restore-workflow steps in phase-cards (brass/sage/blue).

- [ ] **Step 8.2: database.md — add page-hero**

Read `database.md`. It redirects to `shared-db.md` and then continues with DB model docs. Insert at the very top (before any existing `#` heading):

```html
<div class="page-hero">
  <span class="page-hero-icon">🗄️</span>
  <div class="page-hero-body">
    <div class="page-hero-eyebrow">Daten · PostgreSQL 16</div>
    <div class="page-hero-title">Datenbankmodelle</div>
    <p class="page-hero-desc">Alle Schemas auf shared-db — website, keycloak, nextcloud, vaultwarden, bachelorprojekt, docuseal.</p>
    <div class="page-hero-meta">
      <span class="page-hero-tag">PostgreSQL 16</span>
      <span class="page-hero-tag">shared-db</span>
    </div>
  </div>
  <a href="#/" class="page-hero-back">← Übersicht</a>
</div>

```

Also add a callout-info after the redirect note:

```html
<div class="callout callout-info">
Die Betriebsdokumentation (Backup, Verbindung, psql-Zugang) wurde zu <a href="#/shared-db">PostgreSQL (shared-db)</a> verschoben. Diese Seite enthält die Schema-Modelle.
</div>
```

- [ ] **Step 8.3: contributing.md — add page-hero + phase-cards for PR workflow**

Read `contributing.md`. Insert at the top (before the mermaid sequenceDiagram):

```html
<div class="page-hero">
  <span class="page-hero-icon">🤝</span>
  <div class="page-hero-body">
    <div class="page-hero-eyebrow">Entwickler · Workflow</div>
    <div class="page-hero-title">Beitragen zum Workspace</div>
    <p class="page-hero-desc">Branch-Strategie, PR-Workflow, CI-Anforderungen und Merge-Regeln.</p>
    <div class="page-hero-meta">
      <span class="page-hero-tag">GitHub Actions</span>
      <span class="page-hero-tag">squash-merge</span>
    </div>
  </div>
  <a href="#/" class="page-hero-back">← Übersicht</a>
</div>

```

Read the full file and wrap the main workflow steps (`## Branch anlegen`, `## PR erstellen`, `## CI muss grün sein`, `## Squash-Merge`) in phase-cards.

- [ ] **Step 8.4: troubleshooting.md — add page-hero + callout-warn for most common issues**

Read `troubleshooting.md`. Insert at the top:

```html
<div class="page-hero">
  <span class="page-hero-icon">🔧</span>
  <div class="page-hero-body">
    <div class="page-hero-eyebrow">Support · Diagnose</div>
    <div class="page-hero-title">Fehlerbehebung</div>
    <p class="page-hero-desc">Bekannte Probleme, Diagnose-Befehle und Workarounds.</p>
    <div class="page-hero-meta">
      <span class="page-hero-tag">Für Administratoren</span>
    </div>
  </div>
  <a href="#/" class="page-hero-back">← Übersicht</a>
</div>

```

Find the most critical known issue in the file (e.g. pod crashloop, Keycloak startup, DB connection) and add a `callout-crit` box:

```html
<div class="callout callout-crit">
<strong>Cluster reagiert nicht?</strong> Zuerst <code>task cluster:status</code> und <code>task workspace:status ENV=&lt;env&gt;</code> — dann Logs mit <code>task workspace:logs ENV=&lt;env&gt; -- &lt;service&gt;</code>.
</div>
```

- [ ] **Step 8.5: Commit all four**

```bash
git add k3d/docs-content/backup.md k3d/docs-content/database.md \
        k3d/docs-content/contributing.md k3d/docs-content/troubleshooting.md
git commit -m "feat(docs): page-hero, phase-cards and callouts for backup/db/contributing/troubleshooting"
```

---

## Task 9: Page-Hero Eyebrow Sweep (remaining pages)

**Files:**
- Modify: `k3d/docs-content/decisions.md`
- Modify: `k3d/docs-content/dsgvo.md`
- Modify: `k3d/docs-content/glossary.md`
- Modify: `k3d/docs-content/mcp-actions.md`
- Modify: `k3d/docs-content/security-report.md`
- Modify: `k3d/docs-content/verarbeitungsverzeichnis.md`

These pages already have `.page-hero` blocks. They just need a `.page-hero-eyebrow` div inserted before `.page-hero-title`. The eyebrow text should reflect the page topic (derive from the existing tags/title).

- [ ] **Step 9.1: Run the following grep to find all page-hero-title occurrences**

```bash
grep -n "page-hero-title" k3d/docs-content/decisions.md \
  k3d/docs-content/dsgvo.md k3d/docs-content/glossary.md \
  k3d/docs-content/mcp-actions.md k3d/docs-content/security-report.md \
  k3d/docs-content/verarbeitungsverzeichnis.md
```

- [ ] **Step 9.2: For each file, insert the eyebrow div**

In each file, before the `<div class="page-hero-title">...</div>` line, add:

```html
    <div class="page-hero-eyebrow">CATEGORY · TYPE</div>
```

Use these eyebrow labels:

| File | Eyebrow text |
|------|-------------|
| `decisions.md` | `Referenz · Entscheidungen` |
| `dsgvo.md` | `Compliance · DSGVO` |
| `glossary.md` | `Referenz · Glossar` |
| `mcp-actions.md` | `Claude Code · MCP` |
| `security-report.md` | `Sicherheit · Bericht` |
| `verarbeitungsverzeichnis.md` | `DSGVO · Art. 30 DSGVO` |

Example for `decisions.md`:

Before:
```html
    <div class="page-hero-title">Decision Log</div>
```

After:
```html
    <div class="page-hero-eyebrow">Referenz · Entscheidungen</div>
    <div class="page-hero-title">Decision Log</div>
```

- [ ] **Step 9.3: Commit**

```bash
git add k3d/docs-content/decisions.md k3d/docs-content/dsgvo.md \
        k3d/docs-content/glossary.md k3d/docs-content/mcp-actions.md \
        k3d/docs-content/security-report.md k3d/docs-content/verarbeitungsverzeichnis.md
git commit -m "feat(docs): add hero eyebrow to remaining page-hero pages"
```

---

## Task 10: Deploy to Both Clusters

**Files:** none changed — only Docker build + rollout

- [ ] **Step 10.1: Run docs deploy**

```bash
task docs:deploy
```

Expected output: Docker image builds, pushes to `ghcr.io/paddione/workspace-docs:latest`, then rolls out on mentolder and korczewski. Takes ~3–5 minutes.

- [ ] **Step 10.2: Verify both live URLs**

Open and visually check:
- `https://docs.mentolder.de` — sidebar glassmorphism, gradient h1, 3-column track cards on homepage
- `https://docs.korczewski.de` — same check

Spot-check:
- Sidebar has glass blur effect (chrome: inspect → backdrop-filter should be present)
- Homepage shows stats strip (12 · 2 · 45+ · 100%)
- `quickstart-admin` page shows numbered phase-cards with brass/sage/blue borders
- A callout box is visible (e.g. on `backup.md`)

- [ ] **Step 10.3: Commit a final verification note** (only if any last-minute fixes were made)

If fixes were needed, commit them:

```bash
git add k3d/docs-content/
git commit -m "fix(docs): post-deploy visual corrections"
```

---

## Success Criteria Checklist

- [ ] `docs.mentolder.de` and `docs.korczewski.de` palette is visually indistinguishable from `docs/skills/` pages
- [ ] Sidebar has glassmorphism blur (not solid navy)
- [ ] Every h1 renders as gradient white→grey (not solid gold)
- [ ] Newsreader font loads (check Network tab for fonts.gstatic.com)
- [ ] Homepage: stats strip and 3-column track cards render with colour bars
- [ ] `quickstart-admin` shows phase-card numbered steps
- [ ] At least one callout box is visible on `backup.md`
- [ ] `task docs:deploy` exited 0 on both clusters
