---
title: docs-to-html — design
date: 2026-05-15
status: draft
---

# docs-to-html — design

A new Claude Code **plugin** that exposes a `docs-to-html` skill. The skill turns one or more local files (Markdown, HTML, text, JSON, even images) into a **single self-contained, information-dense, interactive HTML file** that a human can read, search, and navigate in a browser without any server or build step.

## Why

Patrick frequently has scattered context — specs, notes, READMEs, brainstorm dumps, ticket descriptions, screenshots — that he needs to:

1. Browse together in one place
2. Hand to a non-technical reader (the user's dad, stakeholders)
3. Keep offline (no server, no internet, no cluster)

Existing tooling (`docs-content/` Docsify, GitHub, Obsidian) all require something — a server, a UI, an account. Patrick wants a **one-shot artifact** he can email, attach to a ticket, or open from a USB stick.

## User experience

### Invocation

Two paths, with arg-first precedence:

```
/docs-to-html <path>...        # explicit args win
/docs-to-html                  # no args → interactive picker
```

Args can be:
- A single file (`README.md`)
- A directory (`docs/superpowers/plans/` — recurses)
- A glob (`tracking/pending/*.json`)
- Mixed: `README.md docs/superpowers/specs/ assets/*.png`

If no args: skill prompts via `AskUserQuestion` for paths (one per line / space-separated), exactly mirroring the asset-collection step in `dev-flow-plan`.

### Layout decision (skill heuristics)

The skill counts inputs and picks the layout. The user does **not** choose — but the chosen layout is announced before generation so they can override with a flag.

| Input count | Layout | Rationale |
|---|---|---|
| 1 file | Single-page + sticky TOC on the right | Nothing to navigate between |
| 2-3 files | Single-page + sticky TOC, each file as a `<section>` with a divider | Still linear; readers scroll |
| 4-20 files | Sidebar + content (Docsify-like) | Real navigation matters |
| > 20 files | Card grid landing → click → opens content in right panel (combines grid + sidebar) | Too many for a flat sidebar |

Override via `--layout=single|sidebar|grid`.

### Features in the generated HTML

All baked in — no toggles to disable, no progressive enhancement:

- **Full-text search** — Client-side; precomputed index inlined as JS. Hit highlighting. `Cmd/Ctrl+K` to focus.
- **Tag/category filter** — Auto-extracted from:
  - YAML frontmatter (`tags:`, `category:`, `status:`)
  - First H1/H2 word in `[brackets]`
  - File parent directory name
  Surfaced as filter chips at top of sidebar / landing.
- **Theme toggle** — Light / dark / system. Stored in `localStorage`. Respects `prefers-color-scheme` first load.
- **Copy-link per heading** — Hover any `h1–h4` → anchor icon → click copies a stable `#fragment` to clipboard with a small toast.

### Visual style

Composes with `frontend-design:frontend-design`:
- Mentolder dark theme (brass + sage, Newsreader serif headings, Geist Mono code) for default
- Light theme inverts to cream + ink (same hue family) — not raw white
- Generous typographic hierarchy (display 32-40 / body 16-17 / mono 13-14)
- No icon libraries — inline SVGs for the 4-5 icons we need (search, theme, link, filter, close)

`★ Anti-AI-default discipline:` no Tailwind-grey card walls, no rounded-2xl shadow-soft pile-up, no emoji headers, no "powered by". The HTML must look like Patrick made it, not a SaaS template.

### Output

```
<cwd>/docs-html-bundles/<slug>-YYYYMMDD-HHMM.html
```

- `<slug>` = first input's basename (sans ext) if 1 file, else parent directory name, else `bundle`.
- Timestamp prevents accidental overwrite.
- Overridable: `--out=path/to/file.html`.
- After write: prints absolute path + opens with `xdg-open` if interactive.

## Inputs the skill handles

| Extension | Treatment |
|---|---|
| `.md`, `.markdown` | Parse frontmatter → render to HTML via marked/markdown-it (vendored, no CDN) |
| `.html`, `.htm` | Sanitize via DOMPurify-equivalent allow-list, embed `<article>` |
| `.txt`, `.log` | Wrap in `<pre>` with monospace font |
| `.json`, `.yaml`, `.yml` | Pretty-print + syntax highlight (Prism-vendored) |
| `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp` | Base64-inline `<img>` with caption from filename |
| `.svg` | Inline as `<figure>` |
| `.pdf` | Skip with warning (browser PDF embed is too fragile for offline) |
| anything else | Skip + warning |

Asset size cap: 5 MB per file inlined; over cap → skip with explicit warning in the report.

Total HTML size soft warning at 10 MB, hard error at 50 MB (browser parse stall).

## Architecture

The skill is **not** a thin wrapper. It does its own work:

```
┌─────────────────────────────────────────┐
│  SKILL.md (the runbook)                 │
│  - Step 0: parse args / interactive     │
│  - Step 1: resolve paths, validate ext  │
│  - Step 2: count → decide layout        │
│  - Step 3: invoke build script          │
│  - Step 4: open in browser              │
└─────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│  scripts/build.mjs (Node, vendored)     │
│  - Read inputs                          │
│  - Render per ext                       │
│  - Build search index (lunr-mini)       │
│  - Inline template + assets             │
│  - Write single .html                   │
└─────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│  templates/<layout>.html                │
│  - single.html, sidebar.html, grid.html │
│  - Each is a complete HTML doc with     │
│    <style> and <script> placeholders    │
└─────────────────────────────────────────┘
```

### Composition with selected reference skills

| Skill | Role |
|---|---|
| `playground:playground` | Reference for self-contained single-file HTML pattern (inline CSS/JS, no build, no CDN). The new skill **emulates** this pattern rather than calling the skill at runtime. |
| `frontend-design:frontend-design` | Invoked **once at design time** to produce the three layout templates with the mentolder visual language. After that, templates live in the plugin and are deterministic. |

This keeps runtime fast and offline. The reference skills are upstream during plugin authorship, not runtime dependencies.

## Plugin layout

```
.claude/plugins/docs-to-html/
├── plugin.json
├── skills/
│   └── docs-to-html/
│       └── SKILL.md
├── scripts/
│   └── build.mjs
├── templates/
│   ├── single.html
│   ├── sidebar.html
│   └── grid.html
└── README.md
```

`plugin.json` declares the skill. `scripts/build.mjs` is invoked by SKILL.md via `node`. Templates are read by `build.mjs` and string-interpolated (no template engine).

Vendored libs (no network at runtime):
- `marked` (~30 KB) — markdown rendering
- `prism-core` + a few langs (~20 KB) — syntax highlighting
- A minimal in-house search index (~5 KB) — substring + token match; no need for full lunr

All vendored under `scripts/vendor/`.

## Non-goals

- **No live editing.** Output is read-only.
- **No collaboration.** Single-file, single-reader.
- **No diagram rendering.** Mermaid/PlantUML out of scope for v1 (can be added later by including the `mermaid.min.js` blob conditionally — measured cost-benefit).
- **No deployment.** Does not upload to Nextcloud, docs.mentolder.de, or anywhere. Pure local artifact.
- **No incremental rebuild.** Each run produces a fresh, timestamped file.
- **Not a Kubernetes thing.** Lives entirely on the workstation.

## Success criteria

1. `/docs-to-html .claude/skills/dev-flow-plan/SKILL.md` produces an HTML file ≤ 1.5 MB that opens correctly in Chromium and Firefox.
2. `/docs-to-html docs/superpowers/plans/` (≈14 files) auto-picks sidebar layout, builds in < 5 s, search finds any heading in < 100 ms.
3. Theme toggle persists across reloads.
4. Copy-link icon places `https://...#section-name` on clipboard with stable slugs.
5. Generated file scores ≥ 95 on a "doesn't look like generic AI" rubric — verifiable by Patrick eye-balling next to a Notion export.

## Risks / open questions

- **Search index size for big bundles.** 50 plan docs × 200 headings each = 10k entries. Need to verify the in-house index stays small enough; fall back to lunr-mini if not.
- **Markdown dialects.** Some plans use GitHub-flavored tables and task-lists; `marked` supports these but emoji shortcodes (`:rocket:`) it does not — out of scope, render literal.
- **Frontmatter inconsistency.** Plans sometimes have `status:` / sometimes `Status:` / sometimes nothing. Tag extractor needs to be tolerant.
- **PDF skip.** If users frequently attach PDFs, may need to revisit (e.g. extract text via `pdf-parse`). Defer.

## What we are NOT deciding now

- Theme tokens beyond "mentolder dark / cream-ink light" — concrete hex values live in the template, decided during implementation.
- Exact directory layout for vendored libs (`scripts/vendor/` vs `lib/`) — implementation detail.
- Whether to expose `--no-open` / `--quiet` flags — add when needed.
