# Static HTML Docs Build System

**Date:** 2026-05-14
**Status:** Approved

## Goal

Replace the Docsify runtime renderer with a Node.js build script that converts every `.md` file in `k3d/docs-content/` into a fully self-contained `.html` file. No CDN, no JS runtime, no external dependencies — each HTML file works offline and in a file:// context. The Kubernetes ConfigMap deploy path (`task docs:deploy`) is preserved; the script adds a build step before deploy.

## Scope

- All `.md` files in `k3d/docs-content/` → `.html` files in `k3d/docs-content-built/`
- `index.html` (the Docsify shell) is replaced by a generated home page from `README.md`
- `_sidebar.md` is consumed at build time; it is not deployed as a file
- The existing CSS theme (mentolder dark navy / gold) is preserved and inlined

Out of scope: moving docs into the Astro website, changing the `docs.mentolder.de` URL, or adding new documentation content.

## Build Pipeline

**Script:** `scripts/build-docs.js` (Node.js, no bundler)

**Dev dependencies added** (not bundled into output):
- `marked` — Markdown → HTML
- `cheerio` — DOM post-processing (copy buttons, TOC injection)
- `@mermaid-js/mermaid-cli` (`mmdc`) — pre-renders Mermaid code blocks to inline SVG

**Per-file steps:**
1. Parse `_sidebar.md` once → build sidebar HTML string (injected into every page)
2. Read `.md` file → run `marked` → raw HTML string
3. Find all ` ```mermaid ``` ` blocks → shell out to `mmdc --outputFormat svg --quiet` → replace with inline `<svg>` (panzoom applied via ~30 lines of inline JS)
4. Post-process with cheerio:
   - Inject `<button class="copy-btn">` after every `<pre><code>` block
   - Collect all `<h2>` elements → build TOC `<div class="toc-box">` inserted after the first `<div class="page-hero">` or `<h1>` found
   - Highlight the active sidebar link by matching the output filename
5. Wrap in full HTML template:
   - All CSS inlined in `<style>` (mentolder theme, ~5 KB minified)
   - All JS inlined in `<script>` (copy handler + `{DOMAIN}` replacer + SVG panzoom + Ctrl+K search, ~3 KB minified)
   - Sidebar hardcoded as HTML
6. Write to `k3d/docs-content-built/<slug>.html`

**Mermaid fallback:** If `mmdc` is not installed, the build script logs a warning and renders the mermaid block as a styled `<pre>` with a note — build does not fail.

## Page Structure

```
<html>
  <head>
    <meta charset="utf-8">
    <title>{Page Title} — Workspace MVP</title>
    <style>/* inlined mentolder theme */</style>
  </head>
  <body>
    <div id="app">
      <aside class="sidebar">
        <!-- hardcoded from _sidebar.md, active item highlighted -->
        <div class="sidebar-logo">⬡ Workspace MVP</div>
        <div class="sidebar-search"><!-- Ctrl+K trigger --></div>
        <nav class="sidebar-nav">…</nav>
      </aside>
      <main id="main">
        <!-- page-hero div (if present in source, passed through as-is) -->
        <!-- auto-generated .toc-box (if page has ≥2 h2s) -->
        <!-- markdown content -->
      </main>
    </div>
    <!-- search overlay (hidden by default) -->
    <div id="search-overlay">…</div>
    <script>/* inlined JS */</script>
  </body>
</html>
```

## Interactive Features

| Feature | Implementation |
|---|---|
| Copy button on code blocks | Cheerio injects `<button>` into each `<pre><code>`; inline JS handles `navigator.clipboard.writeText` with a ✓ flash |
| Auto-TOC | Cheerio collects `<h2>` headings; TOC block injected after hero/h1; links use fragment `#id` anchors |
| `{DOMAIN}` replacement | Inline JS on `DOMContentLoaded`: TreeWalker over all text nodes, replaces `{DOMAIN}` with `window.location.hostname.replace(/^docs\./, '')` and `{PROTO}` with `window.location.protocol.replace(':', '')` — matches current Docsify plugin behaviour |
| SVG panzoom | ~30 lines of inline vanilla JS (`PointerEvent`-based) applied to every `.mermaid-svg` element after render |
| Active sidebar link | Build script matches output filename → adds `class="active"` to the matching `<a>` |
| Ctrl+K search | Inline JS builds a page-title + first-paragraph index from `<title>` + first `<p>` embedded in each page as a JSON blob; fuzzy-match on keyup; results link to `.html` files |
| Keyboard nav | `<a>` and `<button>` elements are native; skip-to-content link added; no custom focus traps needed |

## Existing HTML Components

Several `.md` files already contain raw HTML blocks (`page-hero`, `kicker`, etc.). The build script passes these through unchanged — `marked` preserves HTML in markdown by default. No migration of existing HTML blocks is needed.

## Deployment Integration

`Taskfile.yml` changes:
```yaml
docs:build:
  desc: Build docs MD → static HTML
  cmds:
    - node scripts/build-docs.js

docs:deploy:
  desc: Deploy docs to both prod clusters
  deps: [docs:build]           # ← new dependency
  cmds:
    - # existing ConfigMap creation + rollout commands, path changed to docs-content-built/
```

The ConfigMap is built from `k3d/docs-content-built/` instead of `k3d/docs-content/`. All `.html` files are added as ConfigMap entries. `_sidebar.md` is no longer deployed (consumed at build time only).

## File Structure Changes

```
k3d/
  docs-content/          # source: .md files (unchanged, still edited here)
    _sidebar.md
    *.md
  docs-content-built/    # output: generated .html files (gitignored)
    *.html
scripts/
  build-docs.js          # new build script
```

`k3d/docs-content-built/` is added to `.gitignore` — generated output is not committed.

## Size Budget

Each generated `.html` is estimated at:
- CSS (inlined): ~5 KB
- JS (inlined): ~3 KB
- Content (converted markdown): ~5–30 KB
- Mermaid SVGs (pre-rendered, only on pages that have diagrams): ~5–40 KB each

Total per page: **~13–80 KB** — well within the Kubernetes ConfigMap per-item limit (1 MB).
