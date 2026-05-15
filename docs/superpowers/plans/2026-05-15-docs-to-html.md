---
ticket_id: T000386
title: docs-to-html plugin — Implementation Plan
domains: []
status: active
pr_number: null
---

# docs-to-html plugin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new Claude Code plugin `docs-to-html` that turns any set of local files (md, html, txt, json, images) into a single self-contained, information-dense, interactive HTML file with sidebar/grid/single-page layouts (auto-picked), client-side search, tag filters, theme toggle, and copy-link anchors. Composes design patterns from `playground:playground` and visual language from `frontend-design:frontend-design`, but vendors everything for offline runtime.

**Architecture:** Plugin sits at `.claude/plugins/docs-to-html/` with a `plugin.json` manifest, a single user-invocable skill (`SKILL.md`), a Node build script (`scripts/build.mjs`), three HTML templates, and a small vendored lib set (markdown renderer, syntax highlighter, custom search index). The skill orchestrates: parse args → resolve files → invoke `node scripts/build.mjs` with a JSON config → write single HTML output → open in browser.

**Tech Stack:** Markdown (SKILL.md), Node 20 (build script — no transpilation, ES modules), vanilla HTML/CSS/JS in templates, vendored `marked` + `prismjs` cores, in-house search index (~5 KB). No bundler, no package.json dependencies installed at runtime — everything that ships is committed.

**Output of every run:** `<cwd>/docs-html-bundles/<slug>-YYYYMMDD-HHMM.html` (overridable via `--out=`).

---

### Task 1: Scaffold plugin directory and manifest

**Files:**
- Create: `.claude/plugins/docs-to-html/plugin.json`
- Create: `.claude/plugins/docs-to-html/README.md`

- [ ] **Step 1: Create directory structure**

```bash
ROOT=/home/patrick/Bachelorprojekt/.claude/worktrees/feature+docs-to-html
mkdir -p "$ROOT/.claude/plugins/docs-to-html/skills/docs-to-html"
mkdir -p "$ROOT/.claude/plugins/docs-to-html/scripts/vendor"
mkdir -p "$ROOT/.claude/plugins/docs-to-html/templates"
```

- [ ] **Step 2: Write `plugin.json`**

```json
{
  "name": "docs-to-html",
  "version": "0.1.0",
  "description": "Turn one or more local files (markdown, html, json, images) into a single self-contained, information-dense, interactive HTML bundle.",
  "author": "patrick@mentolder.de",
  "skills": ["./skills/docs-to-html"]
}
```

- [ ] **Step 3: Write a minimal `README.md`** explaining what the plugin does, how it's invoked, and the output location. ~30 lines.

- [ ] **Step 4: Verify**

```bash
test -f .claude/plugins/docs-to-html/plugin.json && \
  python3 -c "import json; json.load(open('.claude/plugins/docs-to-html/plugin.json'))" && \
  echo "manifest valid"
```

---

### Task 2: Author the build script (`scripts/build.mjs`)

**Files:**
- Create: `.claude/plugins/docs-to-html/scripts/build.mjs`

The script is invoked as:

```bash
node scripts/build.mjs --config /tmp/docs-to-html-config.json
```

Where `config.json` carries: `inputs[]` (resolved absolute paths), `layout` (single|sidebar|grid), `out` (absolute output path), `title` (string).

- [ ] **Step 1: Argv parsing** — accept `--config <path>` only. Read JSON, fail loud on missing keys.

- [ ] **Step 2: Per-file renderers**

| Ext | Renderer |
|---|---|
| `.md`/`.markdown` | Strip frontmatter (regex), parse via vendored `marked`, extract `tags`, `category`, `status` |
| `.html`/`.htm` | Allow-list sanitize: strip `<script>`, `<iframe>`, `on*` attributes, `javascript:` URLs |
| `.txt`/`.log` | Escape HTML, wrap in `<pre>` |
| `.json` | `JSON.parse` → `JSON.stringify(_, null, 2)` → Prism `json` highlight |
| `.yaml`/`.yml` | Pretty-pass-through + Prism `yaml` highlight |
| `.png`/`.jpg`/`.jpeg`/`.gif`/`.webp` | `fs.readFileSync` → base64 → `<img src="data:..." />` with filename caption |
| `.svg` | Inline as `<figure>` |
| `.pdf` and unknown | Skip + add to `warnings[]` |

Reject any single file > 5 MB inlined; reject when total estimated output > 50 MB.

- [ ] **Step 3: Slug + heading extraction**

For each rendered piece, extract `h1`-`h4`, assign GitHub-style slug (`heading.toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '')`), deduplicate with `-2`, `-3` suffixes. Inject `id="<slug>"` and a hover anchor span.

- [ ] **Step 4: Tag harvesting**

For each input, collect tags from:
- YAML frontmatter `tags:`, `category:`, `status:`
- Bracketed prefix in first H1/H2 (`# [DRAFT] Foo` → tag `draft`)
- Parent dir basename of file path

Lowercase, deduplicate. Carry forward to the template's filter chips.

- [ ] **Step 5: Search index**

Build a flat array: `{ id, file, heading, body, tags[] }` per heading-section. Stringify and JSON-encode. Inline as `window.__DOCS_INDEX__ = [...]` in the template.

- [ ] **Step 6: Layout dispatch**

Read `templates/<layout>.html`. String-interpolate four placeholders:
- `<!--TITLE-->`
- `<!--FILES_NAV-->` (sidebar HTML / cards HTML / TOC HTML)
- `<!--CONTENT-->` (concatenated rendered sections)
- `<!--SEARCH_INDEX-->` (the inlined JS)

Write to `out` path. Print summary to stdout: input count, layout, warnings, output path, byte size.

- [ ] **Step 7: Verify**

```bash
cd .claude/plugins/docs-to-html
# After templates exist (Task 4)
node scripts/build.mjs --config <(echo '{"inputs":["'"$PWD"'/README.md"],"layout":"single","out":"/tmp/test.html","title":"test"}')
test -s /tmp/test.html && echo "build script produces output"
```

---

### Task 3: Vendor third-party libraries

**Files:**
- Create: `.claude/plugins/docs-to-html/scripts/vendor/marked.min.js`
- Create: `.claude/plugins/docs-to-html/scripts/vendor/prism-core.min.js`
- Create: `.claude/plugins/docs-to-html/scripts/vendor/prism-langs.min.js`
- Create: `.claude/plugins/docs-to-html/scripts/vendor/LICENSES.md`

- [ ] **Step 1: Download fixed versions**

Use `curl` to fetch from unpkg, pinned to specific versions. Write to `scripts/vendor/`:
- `marked@13.0.0`
- `prismjs@1.29.0` core + langs (`json`, `yaml`, `bash`, `typescript`, `python`)

- [ ] **Step 2: Commit upstream licenses**

Write `LICENSES.md` listing each vendored lib, version, license type, and link to upstream LICENSE file.

- [ ] **Step 3: Verify integrity**

```bash
sha256sum scripts/vendor/*.js > scripts/vendor/SHA256SUMS
```

Commit the checksum file. Future re-vendoring must regenerate this file.

---

### Task 4: Author HTML templates

**Files:**
- Create: `.claude/plugins/docs-to-html/templates/single.html`
- Create: `.claude/plugins/docs-to-html/templates/sidebar.html`
- Create: `.claude/plugins/docs-to-html/templates/grid.html`

Each template is a complete HTML document with `<!DOCTYPE html>`, inline `<style>`, inline `<script>`, and the four placeholder comments (`<!--TITLE-->`, `<!--FILES_NAV-->`, `<!--CONTENT-->`, `<!--SEARCH_INDEX-->`).

- [ ] **Step 1: Shared visual language (CSS variables)**

```css
:root {
  --brass: #b4884d;
  --sage: #7a8b73;
  --ink: #1a1814;
  --cream: #f4ede0;
  --font-display: 'Newsreader', Georgia, serif;
  --font-body: 'Geist', system-ui, sans-serif;
  --font-mono: 'Geist Mono', ui-monospace, monospace;
}
[data-theme="dark"] { background: var(--ink); color: var(--cream); }
[data-theme="light"] { background: var(--cream); color: var(--ink); }
```

Fonts are NOT loaded from CDN — `system-ui` fallback only (offline-safe). Mention this in README.

- [ ] **Step 2: Shared JS bundle (inlined)**

Implements:
- Theme toggle (`localStorage['docs-html-theme']`, default `prefers-color-scheme`)
- Search: filter the rendered DOM nodes by token-match against `window.__DOCS_INDEX__`; highlight hits in-place
- Tag filter: click chip → hide non-matching sections
- Copy-link: hover heading → `#` button → `navigator.clipboard.writeText(location.origin + location.pathname + '#' + slug)` + toast
- `Cmd/Ctrl+K` focuses the search box

- [ ] **Step 3: `single.html` layout**

Centered column, max-width 78ch, sticky right TOC (collapses on narrow viewports), top bar with title + search + theme toggle + tag chips.

- [ ] **Step 4: `sidebar.html` layout**

Left sidebar (260px) with grouped file list, right content pane that scrolls. Top bar same as single.

- [ ] **Step 5: `grid.html` layout**

Landing view: top bar + filter chips + responsive CSS-grid of cards. Click card → opens content in a full-width right pane (sidebar collapses to a back button). Card shows file name, first heading, first 120 chars of body, and tag pills.

- [ ] **Step 6: Verify** — Open each template directly in a browser (without going through build.mjs); pages should render with placeholder text still in them but no JS errors in the console.

---

### Task 5: Author the SKILL.md runbook

**Files:**
- Create: `.claude/plugins/docs-to-html/skills/docs-to-html/SKILL.md`

- [ ] **Step 1: Frontmatter**

```yaml
---
name: docs-to-html
description: Use when the user wants to turn one or more local files (markdown, HTML, txt, JSON, images) into a single self-contained, information-dense, interactive HTML bundle they can open offline. Triggers on phrases like "render these docs", "make a one-pager", "bundle into html", "view these together".
---
```

- [ ] **Step 2: Body structure**

Match the action-oriented runbook style of `dev-flow-plan` / `backup-check`:

1. **Wann diese Skill greift** — one paragraph + bullet examples.
2. **Schritt 0: Inputs sammeln** — args-first, interactive fallback. Concrete `AskUserQuestion` example.
3. **Schritt 1: Pfade auflösen** — bash snippet that expands globs, recurses dirs, filters by extension, aborts loud on no inputs.
4. **Schritt 2: Layout entscheiden** — count-based heuristic, announce decision before running, mention `--layout=` override.
5. **Schritt 3: Build aufrufen** — assemble JSON config, invoke `node scripts/build.mjs --config <tmpfile>`.
6. **Schritt 4: Öffnen** — `xdg-open <output>` if interactive; print absolute path always.
7. **Footgun-Sektion** — file > 5 MB skipped, PDF unsupported, no internet at runtime, no font CDN.

Total length target: 150–250 lines (matches reference skill sizes 80–570).

- [ ] **Step 3: Verify**

```bash
head -10 .claude/plugins/docs-to-html/skills/docs-to-html/SKILL.md
# Frontmatter `name` and `description` must be present and non-empty.
```

---

### Task 6: Integration smoke test

**Files:** none (read-only test)

- [ ] **Step 1: Single-file run**

```bash
cd .claude/plugins/docs-to-html
node scripts/build.mjs --config <(echo '{
  "inputs": ["'"$ROOT"'/.claude/skills/dev-flow-plan/SKILL.md"],
  "layout": "single",
  "out": "/tmp/dev-flow-plan.html",
  "title": "dev-flow-plan"
}')
ls -lh /tmp/dev-flow-plan.html
# Expected: < 1.5 MB
```

- [ ] **Step 2: Directory run (sidebar layout)**

```bash
INPUTS=$(find "$ROOT/docs/superpowers/plans" -maxdepth 1 -name '*.md' -printf '"%p",' | sed 's/,$//')
node scripts/build.mjs --config <(echo "{
  \"inputs\": [$INPUTS],
  \"layout\": \"sidebar\",
  \"out\": \"/tmp/plans-bundle.html\",
  \"title\": \"All plans\"
}")
ls -lh /tmp/plans-bundle.html
```

- [ ] **Step 3: Manual browser check**

Open each generated file in Firefox + Chromium. Verify:
- No console errors
- Search works (try a known heading word)
- Theme toggle persists across reload
- Copy-link button puts a `#fragment` URL on clipboard
- Tag chips filter sections

- [ ] **Step 4: Grid layout sanity**

Generate with `--layout=grid` over the same plans directory. Verify the card grid renders, click-to-open works.

---

### Task 7: PR + docs

- [ ] **Step 1: Update `CLAUDE.md`** — add a one-paragraph mention of the plugin in the "Day-to-day workflows" or a new "Local tools" section. Keep it brief.

- [ ] **Step 2: PR** — invoke `commit-commands:commit-push-pr`. PR title: `feat(plugin): docs-to-html — turn local files into one interactive HTML`. Body: short summary, screenshots if practical (run the smoke test and attach the HTML output's first paint).

- [ ] **Step 3: Auto-merge** when CI is green (per repo `feedback_pr_workflow` memory).

- [ ] **Step 4: Post-merge** — none. This is a local plugin; no cluster deploy needed.

---

## Verification matrix

| Criterion | How to check | Pass condition |
|---|---|---|
| Single-file bundle size | `du -h /tmp/dev-flow-plan.html` | ≤ 1.5 MB |
| Directory bundle build time | `time node scripts/build.mjs ...` over ~14 plan files | < 5 s |
| Search latency | Open in browser, type token, time first highlight | < 100 ms perceived |
| Theme persistence | Toggle → reload → state preserved | yes |
| Copy-link stability | Click anchor, paste URL, reload, navigate to it | scrolls to heading |
| Offline behavior | Disconnect network, open file | renders identically |
| AI-default rubric | Eyeball next to a generic SaaS export | distinctive (Patrick judges) |

## Out of scope (deferred to v0.2+)

- PDF support
- Mermaid/PlantUML diagram rendering
- Incremental rebuild
- Multi-output (e.g. one HTML per file + an index)
- Upload to Nextcloud / docs.mentolder.de
- Audio/video embed (mp3/mp4)
