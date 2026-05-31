# Docs HTML Generator — Design Spec

**Date:** 2026-05-31
**Branch:** `feature/docs-html-generator`
**Status:** design approved, pending plan

## Problem

The repo's documentation is scattered across four source types — repo skills, subagents,
the `docs/` markdown tree, and `CLAUDE.md` + operational runbooks — with no single,
pleasant way to browse them. The previous `docs-to-html` plugin (removed in commit
`56b474b0`) produced **generic** output (opaque AI-driven base64 single-file bundles).
The existing `scripts/build-docs.js` pipeline produces a plain dark-theme site and only
covers `docs/` + skills.

**Goal:** a single generator that produces a **high-quality, integrated, human-readable**
HTML site with real cross-links and graphics — specifically nice editorial reading pages
plus an interactive, domain-clustered relationship graph as the landing page.

## Decisions (from brainstorming)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Hosting | Feeds the existing `docs` Deployment; ships via `task docs:deploy`; output to `k3d/docs-content-built/`. |
| 2 | Relationship to `build-docs.js` | **Replace** it. The new generator is the single docs builder; reproduces search/mermaid/copy-buttons and migrates existing pages. |
| 3 | Look | **Editorial / Clean** reading pages (light, generous whitespace, strong type hierarchy, designed pill cross-links). |
| 4 | Landing | **Graph-forward** — interactive relationship graph as the hero. |
| 5 | Graph data | **Domain-clustered** nodes for skills + agents + docs, colored by type, grouped into domain regions (from the CLAUDE.md routing table). |
| 6 | Graph interactivity | **Hybrid** — deterministic build-time layout rendered as SVG, plus light client JS for hover-highlight-neighbors, click-to-navigate, and zoom/pan. Output is diff-stable. |
| 7 | Content diagrams | Render both **mermaid** (`mmdc`) and **Graphviz/dot** (`dot` binary) as inline SVG, with **graceful fallback** to a styled code block when a renderer is missing. |
| 8 | Sources | **Everything** — repo skills + plugin skills + repo agents + plugin agents + docs + CLAUDE.md/runbooks — with **provenance badges** (`repo` vs `plugin@version`). |
| 9 | Frontmatter parsing | Add **`gray-matter`** devDependency; robustly handle YAML block scalars (`description: >`/`|`) — fixes current agent-description truncation. |
| 10 | Cross-link scope | **Conservative**: only explicit `[[name]]`, real markdown links between sources, and routing-table edges. **No** aggressive prose-mention auto-linking (avoids false-positive link spam). |

## Architecture

A new Node ESM generator (entry `scripts/build-docs.mjs`, replacing `scripts/build-docs.js`)
discovers the four source types, builds a cross-linked editorial site with an interactive
domain-clustered graph landing, and writes static output to `k3d/docs-content-built/` —
shipped unchanged through `task docs:deploy` (static-web-server, read-only rootfs).
Invoked exactly as today: `npm run build:docs` / `task docs:deploy`.

### Module decomposition (small, single-purpose, independently testable)

- **`discover.mjs`** — locate all sources; tag each with **type** (skill/agent/doc/runbook)
  and **provenance** (`repo`, or `plugin@version` resolved from the
  `~/.claude/plugins/cache/.../<plugin>/<version>/` path). A missing plugin path is skipped
  (logged), so the build works on any machine.
- **`frontmatter.mjs`** — parse frontmatter via `gray-matter`; correctly handles block
  scalars. Exposes `name`, `description`, `category`/`domains`, `status`.
- **`registry.mjs`** — build a `slug → {title, type, url, domain, provenance}` map; compute
  graph **edges** from (a) explicit `[[name]]` links, (b) relative markdown links between
  sources, and (c) the CLAUDE.md agent-routing table (signals → agent).
- **`render-markdown.mjs`** — `marked` + diagram rendering (mermaid via `mmdc`, Graphviz via
  `dot`, graceful fallback) + postprocess: heading IDs, TOC, copy buttons, and **cross-link
  rewriting** against the registry (conservative).
- **`graph-layout.mjs`** — **deterministic** domain-clustered layout. Each routing domain
  becomes a region; nodes are placed by a stable, seed-free algorithm so SVG output is
  byte-stable across runs (diff-reviewable, CI-friendly).
- **`graph-svg.mjs`** — emit the landing SVG plus `data-*` attributes that the client JS
  uses for interactivity.
- **`theme.mjs`** — editorial CSS + client JS (search, graph hover-highlight/click-nav/
  zoom-pan, copy buttons).
- **`templates.mjs`** — page shell, landing (graph hero), per-section index pages, and
  **provenance badges**.
- **`build-docs.mjs`** — orchestrator / entry point; writes output and prints a build report
  (page counts, unresolved cross-refs, diagrams that fell back, skipped plugin sources).

Existing already-exported helpers in `build-docs.js` (`buildSearchIndex`, `postProcess`,
`renderMermaidBlocks`, `buildToc`, `wrapPage`) are lifted/refactored into the new modules
rather than re-invented, then `build-docs.js` is removed.

### Data flow

```
discover
  → frontmatter (parse each)
  → registry (PASS 1: collect all pages; PASS 2: resolve cross-links + edges)
  → render-markdown (per page; rewrite links against the complete registry)
  → graph-layout + graph-svg (landing)
  → templates (wrap pages, section indexes, landing)
  → write k3d/docs-content-built/ + search.json
  → build report
```

Two-pass registry is required so cross-links resolve against the *complete* set of pages
(no ordering dependency between sources).

### Output contract

Writes to `k3d/docs-content-built/` (the path the `docs` Deployment serves). Preserves the
static-web-server contract: self-contained `*.html`, `style.css`, client JS, and
`search.json`. No server-side rendering; everything works from static files.

## Error handling (fail soft, report loud)

- Missing/odd frontmatter → derive title from first H1, else filename.
- `[[unknown]]` or dangling markdown link → render as plain text; **collect into the build
  report** (do not fail the build).
- Missing `dot`/`mmdc` binary → styled code-block fallback + report entry.
- Plugin source path absent (e.g. plugin uninstalled) → skip that source, log it; build
  still succeeds.

## Testing

`node --test` unit tests for the pure modules:

- `frontmatter` — **block-scalar** (`description: >`) parsing, the current truncation bug.
- `discover` — provenance resolution (`repo` vs `plugin@version`) from paths.
- `registry` — cross-link/edge resolution incl. routing-table edges; dangling-link reporting.
- `graph-layout` — **determinism**: identical input → identical node positions/SVG.
- `render-markdown` — diagram graceful-fallback when a renderer is absent.

Plus a **build smoke test**: run the generator against a small fixture set and assert it
produces `index.html` and the expected section index pages. Wire the unit tests into
`task test:all` so they run in CI (the full `task docs:deploy` build still runs locally).

## Out of scope

- Deploying to a *new* hostname/service (uses the existing `docs` Deployment).
- A live force-directed physics graph (we use deterministic build-time layout).
- Aggressive prose-mention auto-linking.
- Snapshotting plugin content into the repo (we read it live at build time; provenance
  badges make the external/mutable nature explicit).
- Fixing the unrelated dev-stack `sish` ConfigMap mount bug found during setup (separate
  ticket).

## Acceptance criteria

- `npm run build:docs` produces a site in `k3d/docs-content-built/` covering all four source
  types with provenance badges.
- Landing page is the interactive domain-clustered graph (hover-highlight, click-nav,
  zoom/pan); layout is deterministic across runs.
- Skill/agent/doc pages render in the editorial style with working cross-links, search,
  copy buttons, and rendered mermaid + Graphviz diagrams (graceful fallback when a renderer
  is missing).
- Agent `description: >` block scalars render fully (no truncation).
- `task docs:deploy` ships the new output to `docs.mentolder.de` (and korczewski) unchanged.
- `scripts/build-docs.js` is removed; `npm run build:docs` and `task docs:deploy` invoke the
  new entry.
- Unit tests pass under `task test:all`.
```
