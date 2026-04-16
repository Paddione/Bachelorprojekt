# Docs Redesign — Mentolder Dark Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Docsify documentation with the Mentolder dark-navy/gold color scheme, automatic linked in-page TOC, and consistent page-hero sections on every page.

**Architecture:** All styling lives in a single `<style>` block in `index.html` that fully overrides the Docsify Vue theme. A custom Docsify `doneEach` plugin auto-generates the in-page TOC from `h2` headings after every page render using safe DOM methods (no innerHTML with dynamic content). Pages without a `page-hero` HTML block receive one prepended to their content. Changes are applied to both `k3d/docs-content/` (served via ConfigMap) and mirrored to `docs/` + `docs-site/index.html`.

**Tech Stack:** Docsify, vanilla CSS/JS, Inter + Merriweather (Google Fonts), Mermaid + Panzoom (unchanged)

---

## File Map

| File | Action |
|------|--------|
| `k3d/docs-content/index.html` | Replace CSS + add Auto-TOC plugin + add Google Fonts |
| `docs-site/index.html` | Identical copy of above |
| `k3d/docs-content/architecture.md` | Add page-hero block at top |
| `k3d/docs-content/migration.md` | Add page-hero block at top |
| `k3d/docs-content/tests.md` | Add page-hero block at top |
| `k3d/docs-content/scripts.md` | Add page-hero block at top |
| `k3d/docs-content/stripe.md` | Add page-hero block at top |
| `k3d/docs-content/admin-projekte.md` | Add page-hero block at top |
| `k3d/docs-content/mcp-actions.md` | Add page-hero block at top |
| `k3d/docs-content/verarbeitungsverzeichnis.md` | Add page-hero block at top |
| `k3d/docs-content/security-report.md` | Add page-hero block at top |
| `k3d/docs-content/test-anleitung-korczewski.md` | Add page-hero block at top |
| `docs/architecture.md` | Mirror same page-hero as k3d/docs-content |
| `docs/migration.md` | Mirror |
| `docs/tests.md` | Mirror |
| `docs/scripts.md` | Mirror |
| `docs/stripe.md` | Mirror |
| `docs/admin-projekte.md` | Mirror |
| `docs/mcp-actions.md` | Mirror |
| `docs/verarbeitungsverzeichnis.md` | Mirror |
| `docs/security-report.md` | Mirror |
| `docs/test-anleitung-korczewski.md` | Mirror |

**Already have page-hero (CSS-only update, no content change needed):**
`benutzerhandbuch.md`, `keycloak.md`, `database.md`, `security.md`, `troubleshooting.md`, `requirements.md`, `services.md`

---

## Task 1: Mentolder CSS Theme + Auto-TOC plugin in index.html

**Files:**
- Modify: `k3d/docs-content/index.html`
- Modify: `docs-site/index.html`

- [ ] **Step 1: Write new `k3d/docs-content/index.html`**

Replace the entire file with the following. Note: the Auto-TOC plugin uses only `createElement` / `textContent` / `appendChild` — no dynamic innerHTML.

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>Workspace MVP Documentation</title>
  <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1" />
  <meta name="viewport" content="width=device-width, user-scalable=no, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Merriweather:wght@400;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="//cdn.jsdelivr.net/npm/docsify/lib/themes/vue.css">
  <style>
    /* ── Mentolder Tokens ───────────────────── */
    :root {
      --dark:         #0f1623;
      --dark-light:   #1a2235;
      --dark-lighter: #1e2d45;
      --dark-border:  #2a3a52;
      --gold:         #e8c870;
      --gold-light:   #f0d88a;
      --gold-dim:     rgba(232,200,112,0.10);
      --light:        #e8e8f0;
      --muted:        #aabbcc;
      --muted-dark:   #8899aa;
      --font-sans:    'Inter', 'Segoe UI', system-ui, sans-serif;
      --font-serif:   'Merriweather', Georgia, serif;
    }

    /* ── Global ────────────────────────────── */
    body {
      font-family: var(--font-sans) !important;
      background: #111827 !important;
      color: var(--light) !important;
    }

    /* ── Sidebar ───────────────────────────── */
    .sidebar {
      background: var(--dark) !important;
      border-right: 1px solid var(--dark-lighter) !important;
    }
    .sidebar .app-name {
      font-family: var(--font-serif) !important;
      font-size: 16px !important;
      font-weight: 700 !important;
      color: var(--gold) !important;
      padding: 20px 16px 4px !important;
      display: block;
    }
    .sidebar .app-name-link { color: var(--gold) !important; }
    .sidebar-nav { padding: 0 0 24px !important; }
    .sidebar-nav > ul { padding: 0 !important; }
    .sidebar-nav > ul > li { margin: 0 !important; }
    .sidebar-nav > ul > li > p,
    .sidebar-nav > ul > li > strong {
      font-size: 9px !important;
      font-weight: 700 !important;
      letter-spacing: 1.2px !important;
      text-transform: uppercase !important;
      color: #556070 !important;
      padding: 14px 16px 5px !important;
      margin: 0 !important;
      display: block;
    }
    .sidebar-nav a {
      color: var(--muted) !important;
      font-size: 13px !important;
      padding: 7px 16px !important;
      display: block;
      border-left: 2px solid transparent !important;
      transition: all .15s !important;
      text-decoration: none !important;
    }
    .sidebar-nav a:hover {
      color: var(--light) !important;
      background: var(--gold-dim) !important;
    }
    .sidebar-nav .active > a,
    .sidebar-nav a.active {
      color: var(--gold) !important;
      background: rgba(232,200,112,.08) !important;
      border-left-color: var(--gold) !important;
      font-weight: 600 !important;
    }
    .sidebar-toggle { background: var(--dark) !important; border-color: var(--dark-border) !important; }
    .sidebar-toggle span { background: var(--muted-dark) !important; }

    /* ── Main Content Area ─────────────────── */
    #main { background: #111827 !important; }
    .content { max-width: 860px !important; }

    /* ── Typography ────────────────────────── */
    #main h1 {
      font-family: var(--font-serif) !important;
      font-size: 28px !important;
      font-weight: 700 !important;
      color: var(--gold-light) !important;
      border-bottom: 1px solid var(--dark-lighter) !important;
      padding-bottom: 12px !important;
      margin-bottom: 24px !important;
    }
    #main h2 {
      font-family: var(--font-serif) !important;
      font-size: 20px !important;
      font-weight: 700 !important;
      color: var(--light) !important;
      border-bottom: 1px solid var(--dark-lighter) !important;
      padding-bottom: 10px !important;
      margin: 36px 0 16px !important;
    }
    #main h3 {
      font-size: 15px !important;
      font-weight: 700 !important;
      color: var(--light) !important;
      margin: 24px 0 10px !important;
    }
    #main h4 {
      font-size: 13px !important;
      font-weight: 700 !important;
      color: var(--muted) !important;
      text-transform: uppercase !important;
      letter-spacing: .6px !important;
      margin: 18px 0 8px !important;
    }
    #main p  { color: var(--muted) !important; line-height: 1.75 !important; }
    #main li { color: var(--muted) !important; line-height: 1.7  !important; }
    #main strong { color: var(--light) !important; }

    /* ── Links ──────────────────────────────── */
    #main a       { color: var(--gold) !important; }
    #main a:hover { color: var(--gold-light) !important; }

    /* ── Tables ────────────────────────────── */
    #main table { border-collapse: collapse !important; width: 100% !important; margin: 16px 0 !important; }
    #main th {
      background: var(--dark) !important;
      color: var(--gold) !important;
      font-size: 10px !important;
      font-weight: 700 !important;
      letter-spacing: .8px !important;
      text-transform: uppercase !important;
      padding: 9px 14px !important;
      border-bottom: 1px solid var(--dark-border) !important;
      text-align: left !important;
    }
    #main td {
      color: var(--muted) !important;
      padding: 8px 14px !important;
      border-bottom: 1px solid var(--dark-lighter) !important;
      font-size: 13.5px !important;
    }
    #main tr:hover td { background: var(--gold-dim) !important; }

    /* ── Code ───────────────────────────────── */
    #main code {
      background: var(--dark) !important;
      color: var(--gold) !important;
      padding: 2px 7px !important;
      border-radius: 4px !important;
      font-size: 12.5px !important;
      border: 1px solid var(--dark-border) !important;
    }
    #main pre {
      background: var(--dark) !important;
      border: 1px solid var(--dark-border) !important;
      border-left: 3px solid var(--gold) !important;
      border-radius: 0 8px 8px 0 !important;
      padding: 16px 20px !important;
    }
    #main pre code {
      background: transparent !important;
      border: none !important;
      color: #c9d1d9 !important;
      padding: 0 !important;
      font-size: 13px !important;
    }

    /* ── Blockquote / Callout ───────────────── */
    #main blockquote {
      background: rgba(232,200,112,.06) !important;
      border-left: 3px solid var(--gold) !important;
      border-radius: 0 6px 6px 0 !important;
      padding: 12px 18px !important;
      margin: 16px 0 !important;
      color: var(--muted) !important;
    }
    #main blockquote p      { color: var(--muted) !important; margin: 0 !important; }
    #main blockquote strong { color: var(--gold)  !important; }
    #main hr { border-color: var(--dark-lighter) !important; margin: 28px 0 !important; }

    /* ── Page Hero ──────────────────────────── */
    .page-hero {
      background: linear-gradient(135deg, var(--dark-light) 0%, #0f1a2e 100%);
      border: 1px solid var(--dark-border);
      border-left: 4px solid var(--gold);
      border-radius: 10px;
      padding: 20px 24px;
      margin-bottom: 28px;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
    }
    .page-hero-icon  { font-size: 32px; line-height: 1; flex-shrink: 0; margin-top: 2px; }
    .page-hero-body  { flex: 1; }
    .page-hero-title {
      font-family: var(--font-serif);
      font-size: 22px; font-weight: 700;
      color: var(--gold-light);
      margin-bottom: 6px; line-height: 1.2;
    }
    .page-hero-desc { font-size: 13.5px; color: var(--muted); line-height: 1.6; margin: 0; }
    .page-hero-meta { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
    .page-hero-tag {
      font-size: 10px; font-weight: 600; letter-spacing: .4px;
      background: var(--gold-dim); color: var(--gold);
      border: 1px solid rgba(232,200,112,.25);
      padding: 2px 9px; border-radius: 20px;
    }
    .page-hero-back {
      font-size: 11px; color: var(--muted-dark);
      white-space: nowrap; text-decoration: none !important;
      padding: 4px 10px;
      border: 1px solid var(--dark-border); border-radius: 5px;
      flex-shrink: 0; transition: all .15s;
    }
    .page-hero-back:hover { color: var(--gold) !important; border-color: rgba(232,200,112,.3) !important; }

    /* ── Auto-TOC Box ───────────────────────── */
    .toc-box {
      background: var(--dark);
      border: 1px solid var(--dark-border);
      border-radius: 8px;
      padding: 16px 20px;
      margin-bottom: 32px;
    }
    .toc-title {
      font-size: 10px; font-weight: 700; letter-spacing: 1px;
      color: var(--gold); text-transform: uppercase;
      margin-bottom: 12px;
      display: flex; align-items: center; gap: 8px;
    }
    .toc-title::after {
      content: ''; flex: 1; height: 1px;
      background: rgba(232,200,112,.2);
    }
    .toc-list {
      display: grid; grid-template-columns: 1fr 1fr;
      gap: 4px; list-style: none; margin: 0; padding: 0;
    }
    @media (max-width: 600px) { .toc-list { grid-template-columns: 1fr; } }
    .toc-item a {
      display: flex !important; align-items: center !important; gap: 7px !important;
      font-size: 12.5px !important; color: var(--muted) !important;
      text-decoration: none !important;
      padding: 5px 8px !important; border-radius: 5px !important;
      transition: all .12s !important; border: none !important;
    }
    .toc-item a:hover { background: var(--gold-dim) !important; color: var(--gold) !important; }
    .toc-num {
      font-size: 10px; font-weight: 700;
      color: rgba(232,200,112,.5); min-width: 18px;
    }

    /* ── Homepage ───────────────────────────── */
    .home-hero { text-align: center; padding: 40px 0 20px; }
    .home-hero-tag {
      display: inline-block; font-size: 11px; font-weight: 600; letter-spacing: .5px;
      background: var(--gold-dim); color: var(--gold);
      border: 1px solid rgba(232,200,112,.25);
      padding: 4px 14px; border-radius: 20px; margin-bottom: 16px;
    }
    .home-hero-title {
      font-family: var(--font-serif);
      font-size: 38px; font-weight: 700; color: var(--gold-light);
      margin-bottom: 14px; line-height: 1.15;
    }
    .home-hero-sub {
      font-size: 15px; color: var(--muted);
      max-width: 600px; margin: 0 auto 32px; line-height: 1.65;
    }
    .home-stats {
      display: flex; gap: 0; justify-content: center; margin-bottom: 40px;
      border: 1px solid var(--dark-border); border-radius: 10px;
      overflow: hidden; background: var(--dark-light);
    }
    .home-stat {
      flex: 1; display: flex; flex-direction: column; align-items: center;
      padding: 18px 12px; border-right: 1px solid var(--dark-border);
    }
    .home-stat:last-child { border-right: none; }
    .home-stat-value {
      font-family: var(--font-serif); font-size: 22px; font-weight: 700;
      color: var(--gold); line-height: 1;
    }
    .home-stat-label {
      font-size: 10px; color: var(--muted-dark); margin-top: 4px;
      font-weight: 600; text-transform: uppercase; letter-spacing: .5px;
    }
    .home-section { margin-bottom: 36px; }
    .home-section-label {
      display: block; font-size: 10px; font-weight: 700;
      letter-spacing: 1.1px; text-transform: uppercase; color: var(--gold);
      margin-bottom: 14px; padding-bottom: 8px;
      border-bottom: 1px solid var(--dark-border);
    }
    .home-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 12px;
    }
    .home-card {
      background: var(--dark-light); border: 1px solid var(--dark-border);
      border-radius: 8px; padding: 16px;
      text-decoration: none !important; display: block; transition: all .15s;
    }
    .home-card:hover {
      border-color: rgba(232,200,112,.35); background: rgba(26,34,53,.9);
      transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,.3);
    }
    .home-card-icon  { font-size: 22px; display: block; margin-bottom: 8px; }
    .home-card-title { font-size: 14px; font-weight: 700; color: var(--light) !important; display: block; margin-bottom: 4px; }
    .home-card p, .home-card-desc { font-size: 12px; color: var(--muted-dark); line-height: 1.5; margin: 0; }

    /* ── Mermaid Wrapper ────────────────────── */
    .mermaid-wrapper {
      position: relative; width: 100%; overflow: hidden;
      border: 1px solid var(--dark-border); border-radius: 6px;
      margin: 1em 0; background: var(--dark);
    }
    .mermaid-wrapper svg { display: block; width: 100% !important; height: auto !important; max-width: none !important; cursor: grab; }
    .mermaid-wrapper svg:active { cursor: grabbing; }
    .mermaid-zoom-hint {
      position: absolute; bottom: 6px; right: 8px;
      font-size: 11px; color: var(--muted-dark); pointer-events: none; user-select: none;
    }
    .mermaid-zoom-reset {
      position: absolute; top: 6px; right: 8px; font-size: 11px;
      padding: 2px 6px; background: var(--gold-dim);
      border: 1px solid rgba(232,200,112,.3); color: var(--gold);
      border-radius: 3px; cursor: pointer; display: none;
    }
    .mermaid-wrapper:hover .mermaid-zoom-reset { display: block; }
    .mermaidTooltip {
      background-color: var(--dark) !important; color: var(--gold) !important;
      border: 1px solid var(--dark-border) !important; border-radius: 6px !important;
      padding: 8px 12px !important; font-size: 12px !important; font-family: inherit !important;
      max-width: 320px !important; line-height: 1.5 !important;
      box-shadow: 0 4px 12px rgba(0,0,0,.6) !important; pointer-events: none;
    }

    /* ── Search ──────────────────────────────── */
    .search input { background: var(--dark-light) !important; border: 1px solid var(--dark-border) !important; color: var(--light) !important; border-radius: 6px !important; }
    .search .results-panel { background: var(--dark) !important; border: 1px solid var(--dark-border) !important; }
    .search .matching-post { color: var(--muted) !important; border-bottom: 1px solid var(--dark-lighter) !important; }
    .search .matching-post a { color: var(--gold) !important; }
  </style>
</head>
<body>
  <div id="app"></div>
  <script>
    window.$docsify = {
      name: 'Workspace MVP',
      repo: '',
      loadSidebar: true,
      subMaxLevel: 2,
      search: { placeholder: 'Suchen\u2026', noData: 'Keine Ergebnisse.' },
      plugins: [
        /* Panzoom for Mermaid diagrams */
        function(hook) {
          hook.doneEach(function() {
            setTimeout(function() {
              document.querySelectorAll('.mermaid svg').forEach(function(svg) {
                if (svg.dataset.panzoomApplied) return;
                svg.dataset.panzoomApplied = '1';
                var wrapper = document.createElement('div');
                wrapper.className = 'mermaid-wrapper';
                var hint = document.createElement('span');
                hint.className = 'mermaid-zoom-hint';
                hint.textContent = 'Scroll = Zoom \u00b7 Ziehen = Pan';
                var resetBtn = document.createElement('button');
                resetBtn.className = 'mermaid-zoom-reset';
                resetBtn.textContent = 'Reset';
                svg.parentNode.insertBefore(wrapper, svg);
                wrapper.appendChild(svg);
                wrapper.appendChild(hint);
                wrapper.appendChild(resetBtn);
                var pz = panzoom(svg, { maxZoom: 10, minZoom: 0.3, boundsPadding: 0.1 });
                resetBtn.addEventListener('click', function() {
                  pz.moveTo(0, 0);
                  pz.zoomAbs(0, 0, 1);
                });
              });
            }, 300);
          });
        },
        /* Auto-TOC: builds a linked table of contents from h2 headings */
        function(hook) {
          hook.doneEach(function() {
            var existing = document.querySelector('#main .auto-toc');
            if (existing) existing.remove();

            var headings = Array.from(document.querySelectorAll('#main h2'));
            if (headings.length < 2) return;

            var base = (window.location.hash.split('?')[0] || '#/').replace(/^#/, '') || '/';

            /* Build TOC using only DOM methods (no dynamic innerHTML) */
            var box = document.createElement('div');
            box.className = 'toc-box auto-toc';

            var titleEl = document.createElement('div');
            titleEl.className = 'toc-title';
            titleEl.textContent = 'Auf dieser Seite';
            box.appendChild(titleEl);

            var ul = document.createElement('ul');
            ul.className = 'toc-list';

            headings.forEach(function(h, i) {
              var raw = h.textContent.trim();
              var id = h.id || raw.toLowerCase()
                .replace(/\u00e4/g,'ae').replace(/\u00c4/g,'ae')
                .replace(/\u00f6/g,'oe').replace(/\u00d6/g,'oe')
                .replace(/\u00fc/g,'ue').replace(/\u00dc/g,'ue')
                .replace(/\u00df/g,'ss')
                .replace(/\s+/g,'-').replace(/[^a-z0-9\-]/g,'');
              if (!h.id) h.id = id;

              var li = document.createElement('li');
              li.className = 'toc-item';

              var a = document.createElement('a');
              a.href = '#' + base + '?id=' + id;

              var num = document.createElement('span');
              num.className = 'toc-num';
              num.textContent = (i + 1) + '.';

              a.appendChild(num);
              a.appendChild(document.createTextNode('\u00a0' + raw));
              li.appendChild(a);
              ul.appendChild(li);
            });

            box.appendChild(ul);

            var hero = document.querySelector('#main .page-hero');
            var h1   = document.querySelector('#main h1');
            var anchor = hero || h1;
            if (anchor) {
              anchor.insertAdjacentElement('afterend', box);
            } else {
              var main = document.querySelector('#main');
              if (main) main.insertBefore(box, main.firstChild);
            }
          });
        }
      ]
    };
  </script>
  <script src="//cdn.jsdelivr.net/npm/docsify/lib/docsify.min.js"></script>
  <script src="//cdn.jsdelivr.net/npm/docsify/lib/plugins/search.min.js"></script>
  <script src="//cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
  <script src="//cdn.jsdelivr.net/npm/docsify-mermaid@2.0.1/dist/docsify-mermaid.js"></script>
  <script src="//cdn.jsdelivr.net/npm/panzoom@9.4.3/dist/panzoom.min.js"></script>
  <script>mermaid.initialize({ startOnLoad: false, useMaxWidth: true, securityLevel: 'loose' });</script>
</body>
</html>
```

- [ ] **Step 2: Copy to `docs-site/index.html`**

```bash
cp k3d/docs-content/index.html docs-site/index.html
```

- [ ] **Step 3: Verify locally**

```bash
cd k3d/docs-content && python3 -m http.server 3300 &
```

Open `http://localhost:3300` and confirm:
- Dark navy background on body and sidebar
- Sidebar brand name in gold serif font
- Active sidebar link highlighted gold with left border
- Homepage cards visible with dark background

```bash
kill %1
```

- [ ] **Step 4: Commit**

```bash
git add k3d/docs-content/index.html docs-site/index.html
git commit -m "feat(docs): apply Mentolder dark-navy/gold theme + auto-TOC plugin"
```

---

## Task 2: Add page-hero to architecture.md and migration.md

**Files:**
- Modify: `k3d/docs-content/architecture.md`
- Modify: `k3d/docs-content/migration.md`
- Modify: `docs/architecture.md`
- Modify: `docs/migration.md`

- [ ] **Step 1: Prepend page-hero to `k3d/docs-content/architecture.md`**

The file currently starts with `# Architektur`. Insert the following block **before** that line (new content at the very top):

```html
<div class="page-hero">
  <span class="page-hero-icon">🏗️</span>
  <div class="page-hero-body">
    <div class="page-hero-title">Architektur</div>
    <p class="page-hero-desc">Systemübersicht, Kubernetes-Cluster-Topologie, Service-Abhängigkeiten und Infrastruktur-Design des Workspace MVP.</p>
    <div class="page-hero-meta">
      <span class="page-hero-tag">Für Administratoren</span>
      <span class="page-hero-tag">Kubernetes</span>
      <span class="page-hero-tag">Mermaid Diagramm</span>
    </div>
  </div>
  <a href="#/" class="page-hero-back">← Übersicht</a>
</div>

```

All existing content (`# Architektur` onwards) remains unchanged below.

- [ ] **Step 2: Prepend page-hero to `k3d/docs-content/migration.md`**

The file currently starts with `# Migration`. Insert before it:

```html
<div class="page-hero">
  <span class="page-hero-icon">🚀</span>
  <div class="page-hero-body">
    <div class="page-hero-title">Migration</div>
    <p class="page-hero-desc">Upgrade-Pfade, Datenmigration aus Slack/Teams/Google Workspace, Rollback-Strategien und Import-Skripte.</p>
    <div class="page-hero-meta">
      <span class="page-hero-tag">Für Administratoren</span>
      <span class="page-hero-tag">Datenmigration</span>
    </div>
  </div>
  <a href="#/" class="page-hero-back">← Übersicht</a>
</div>

```

- [ ] **Step 3: Mirror to `docs/`**

```bash
cp k3d/docs-content/architecture.md docs/architecture.md
cp k3d/docs-content/migration.md docs/migration.md
```

- [ ] **Step 4: Commit**

```bash
git add k3d/docs-content/architecture.md k3d/docs-content/migration.md \
        docs/architecture.md docs/migration.md
git commit -m "feat(docs): add page-hero to architecture and migration pages"
```

---

## Task 3: Add page-hero to tests.md and scripts.md

**Files:**
- Modify: `k3d/docs-content/tests.md`
- Modify: `k3d/docs-content/scripts.md`
- Modify: `docs/tests.md`
- Modify: `docs/scripts.md`

- [ ] **Step 1: Prepend page-hero to `k3d/docs-content/tests.md`**

The file currently starts with `# Tests`. Insert before it:

```html
<div class="page-hero">
  <span class="page-hero-icon">✅</span>
  <div class="page-hero-body">
    <div class="page-hero-title">Tests</div>
    <p class="page-hero-desc">Testframework, Testfall-Katalog (FA-01–FA-25, SA-01–SA-10, NFA-01–NFA-09, AK-03/04), Ausführung mit runner.sh und Report-Generierung.</p>
    <div class="page-hero-meta">
      <span class="page-hero-tag">Für Administratoren</span>
      <span class="page-hero-tag">Bash + Playwright</span>
      <span class="page-hero-tag">k3d Cluster</span>
    </div>
  </div>
  <a href="#/" class="page-hero-back">← Übersicht</a>
</div>

```

- [ ] **Step 2: Prepend page-hero to `k3d/docs-content/scripts.md`**

The file currently starts with `# Skripte`. Insert before it:

```html
<div class="page-hero">
  <span class="page-hero-icon">📜</span>
  <div class="page-hero-body">
    <div class="page-hero-title">Skripte</div>
    <p class="page-hero-desc">Referenz aller Bash-Hilfsskripte im <code>scripts/</code>-Verzeichnis: Setup, Migration, DSGVO-Checks, MCP-Registrierung und Stripe.</p>
    <div class="page-hero-meta">
      <span class="page-hero-tag">Für Administratoren</span>
      <span class="page-hero-tag">Bash</span>
    </div>
  </div>
  <a href="#/" class="page-hero-back">← Übersicht</a>
</div>

```

- [ ] **Step 3: Mirror to `docs/`**

```bash
cp k3d/docs-content/tests.md docs/tests.md
cp k3d/docs-content/scripts.md docs/scripts.md
```

- [ ] **Step 4: Commit**

```bash
git add k3d/docs-content/tests.md k3d/docs-content/scripts.md \
        docs/tests.md docs/scripts.md
git commit -m "feat(docs): add page-hero to tests and scripts pages"
```

---

## Task 4: Add page-hero to stripe.md, admin-projekte.md, mcp-actions.md

**Files:**
- Modify: `k3d/docs-content/stripe.md`
- Modify: `k3d/docs-content/admin-projekte.md`
- Modify: `k3d/docs-content/mcp-actions.md`
- Modify: `docs/stripe.md` / `docs/admin-projekte.md` / `docs/mcp-actions.md`

- [ ] **Step 1: Prepend page-hero to `k3d/docs-content/stripe.md`**

File starts with `# Stripe-Integration`. Insert before it:

```html
<div class="page-hero">
  <span class="page-hero-icon">💳</span>
  <div class="page-hero-body">
    <div class="page-hero-title">Stripe-Integration</div>
    <p class="page-hero-desc">Zahlungsgateway-Konfiguration, Stripe Checkout, Webhook-Setup und Anbindung an Invoice Ninja für automatische Rechnungsstellung.</p>
    <div class="page-hero-meta">
      <span class="page-hero-tag">Website &amp; Admin</span>
      <span class="page-hero-tag">Stripe</span>
      <span class="page-hero-tag">Invoice Ninja</span>
    </div>
  </div>
  <a href="#/" class="page-hero-back">← Übersicht</a>
</div>

```

- [ ] **Step 2: Prepend page-hero to `k3d/docs-content/admin-projekte.md`**

File starts with `# Projektmanagement-Admin`. Insert before it:

```html
<div class="page-hero">
  <span class="page-hero-icon">📊</span>
  <div class="page-hero-body">
    <div class="page-hero-title">Projektmanagement-Admin</div>
    <p class="page-hero-desc">Admin-Panel für Projekte, Teilprojekte und Aufgaben je Brand und Kunde. Buchungen, Termine und Nutzerverwaltung mit Keycloak OIDC.</p>
    <div class="page-hero-meta">
      <span class="page-hero-tag">Website &amp; Admin</span>
      <span class="page-hero-tag">OIDC-gesichert</span>
    </div>
  </div>
  <a href="#/" class="page-hero-back">← Übersicht</a>
</div>

```

- [ ] **Step 3: Prepend page-hero to `k3d/docs-content/mcp-actions.md`**

File starts with `# MCP-Aktionen Referenz`. Insert before it:

```html
<div class="page-hero">
  <span class="page-hero-icon">🤖</span>
  <div class="page-hero-body">
    <div class="page-hero-title">MCP Actions</div>
    <p class="page-hero-desc">Referenz aller Aktionen, die Claude Code über die verbundenen MCP-Server ausführen kann: Kubernetes, Postgres, Browser, Grafana, Prometheus.</p>
    <div class="page-hero-meta">
      <span class="page-hero-tag">Claude Code KI</span>
      <span class="page-hero-tag">MCP Server</span>
    </div>
  </div>
  <a href="#/" class="page-hero-back">← Übersicht</a>
</div>

```

- [ ] **Step 4: Mirror to `docs/`**

```bash
cp k3d/docs-content/stripe.md docs/stripe.md
cp k3d/docs-content/admin-projekte.md docs/admin-projekte.md
cp k3d/docs-content/mcp-actions.md docs/mcp-actions.md
```

- [ ] **Step 5: Commit**

```bash
git add k3d/docs-content/stripe.md k3d/docs-content/admin-projekte.md k3d/docs-content/mcp-actions.md \
        docs/stripe.md docs/admin-projekte.md docs/mcp-actions.md
git commit -m "feat(docs): add page-hero to stripe, admin-projekte, mcp-actions pages"
```

---

## Task 5: Add page-hero to verarbeitungsverzeichnis.md, security-report.md, test-anleitung-korczewski.md

**Files:**
- Modify: `k3d/docs-content/verarbeitungsverzeichnis.md`
- Modify: `k3d/docs-content/security-report.md`
- Modify: `k3d/docs-content/test-anleitung-korczewski.md`
- Modify: mirrors in `docs/`

- [ ] **Step 1: Prepend page-hero to `k3d/docs-content/verarbeitungsverzeichnis.md`**

File starts with `# Verarbeitungsverzeichnis (Art. 30 DSGVO)`. Insert before it:

```html
<div class="page-hero">
  <span class="page-hero-icon">📎</span>
  <div class="page-hero-body">
    <div class="page-hero-title">Verarbeitungsverzeichnis (Art. 30 DSGVO)</div>
    <p class="page-hero-desc">Dokumentation aller Verarbeitungstätigkeiten personenbezogener Daten: Verantwortlicher, Zweck, Datenkategorien, Empfänger und Löschfristen.</p>
    <div class="page-hero-meta">
      <span class="page-hero-tag">DSGVO Art. 30</span>
      <span class="page-hero-tag">Für Administratoren</span>
    </div>
  </div>
  <a href="#/" class="page-hero-back">← Übersicht</a>
</div>

```

- [ ] **Step 2: Prepend page-hero to `k3d/docs-content/security-report.md`**

File starts with `# Sicherheitsbericht — Workspace MVP`. Insert before it:

```html
<div class="page-hero">
  <span class="page-hero-icon">📋</span>
  <div class="page-hero-body">
    <div class="page-hero-title">Security Report</div>
    <p class="page-hero-desc">Sicherheitsbericht zum Workspace MVP: Testergebnisse SA-01–SA-10, Schwachstellenanalyse, CVSS-Bewertungen und Härtungsmaßnahmen.</p>
    <div class="page-hero-meta">
      <span class="page-hero-tag">Sicherheit</span>
      <span class="page-hero-tag">SA-Anforderungen</span>
    </div>
  </div>
  <a href="#/" class="page-hero-back">← Übersicht</a>
</div>

```

- [ ] **Step 3: Prepend page-hero to `k3d/docs-content/test-anleitung-korczewski.md`**

File starts with `# Softwaretest Workspace`. Insert before it:

```html
<div class="page-hero">
  <span class="page-hero-icon">🧪</span>
  <div class="page-hero-body">
    <div class="page-hero-title">Testanleitung</div>
    <p class="page-hero-desc">Schritt-für-Schritt-Anleitung für Abnahmetests. Zugangsdaten, Service-Übersicht und zu prüfende Funktionen der Workspace-Plattform.</p>
    <div class="page-hero-meta">
      <span class="page-hero-tag">Für Mitarbeiter</span>
      <span class="page-hero-tag">Abnahmetests</span>
    </div>
  </div>
  <a href="#/" class="page-hero-back">← Übersicht</a>
</div>

```

- [ ] **Step 4: Mirror to `docs/`**

```bash
cp k3d/docs-content/verarbeitungsverzeichnis.md docs/verarbeitungsverzeichnis.md
cp k3d/docs-content/security-report.md docs/security-report.md
cp k3d/docs-content/test-anleitung-korczewski.md docs/test-anleitung-korczewski.md
```

- [ ] **Step 5: Commit**

```bash
git add k3d/docs-content/verarbeitungsverzeichnis.md k3d/docs-content/security-report.md \
        k3d/docs-content/test-anleitung-korczewski.md \
        docs/verarbeitungsverzeichnis.md docs/security-report.md docs/test-anleitung-korczewski.md
git commit -m "feat(docs): add page-hero to verarbeitungsverzeichnis, security-report, testanleitung"
```

---

## Task 6: Final verification and deploy

- [ ] **Step 1: Full spot-check across page types**

```bash
cd k3d/docs-content && python3 -m http.server 3300 &
```

Open `http://localhost:3300` and verify each of the following:

| Page | Check |
|------|-------|
| Homepage (`/`) | Gold stats bar, dark cards, gold section labels |
| Architektur | Page-hero visible, TOC appears below it, Mermaid diagram zoomable |
| Services | Page-hero gold-styled (already had hero), TOC present |
| Benutzerhandbuch | Page-hero gold-styled (already had hero), TOC present |
| Stripe | New page-hero visible |
| Verarbeitungsverzeichnis | New page-hero visible |
| Any page with a table | Dark header row with gold uppercase text |
| Any page with a `> **Tipp:**` | Gold left-border callout |
| Any page with a code block | Dark bg, gold inline code, gold left-border on pre |

```bash
kill %1
```

- [ ] **Step 2: Commit spec and plan**

```bash
git add docs/superpowers/specs/2026-04-16-docs-redesign-design.md \
        docs/superpowers/plans/2026-04-16-docs-redesign.md
git commit -m "docs: add docs redesign spec and implementation plan"
```

- [ ] **Step 3: Deploy docs ConfigMap to live cluster**

After the PR is merged to main, apply the docs ConfigMap and restart the pod:

```bash
kubectl patch configmap docs-content -n workspace \
  --patch-file <(kubectl create configmap docs-content \
    --from-file=k3d/docs-content/ --dry-run=client -o json | jq '.data') \
  --type merge
kubectl rollout restart deployment/docs -n workspace
kubectl rollout status deployment/docs -n workspace
```

Expected: `deployment "docs" successfully rolled out`
