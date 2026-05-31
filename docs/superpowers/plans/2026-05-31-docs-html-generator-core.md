---
title: Docs HTML Generator — Core & Editorial Site Implementation Plan
ticket_id: null
domains: [infra, website, test]
status: active
pr_number: null
---

# Docs HTML Generator — Core & Editorial Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single ESM generator that discovers repo + plugin skills/agents and the `docs/` markdown tree, fixes the YAML block-scalar frontmatter truncation bug, and produces a cross-linked editorial static site that ships unchanged through the existing `docs` Deployment — replacing `scripts/build-docs.js`.

**Architecture:** Small single-purpose modules under `scripts/docs-gen/` (`frontmatter`, `discover`, `registry`, `render-markdown`, `theme`, `templates`, `legacy`) orchestrated by the new entry point `scripts/build-docs.mjs`; a two-pass registry collects every page first so cross-links resolve against the complete set regardless of source order. Content renders via `marked` with mermaid (`mmdc`) and Graphviz (`dot`) diagrams falling back gracefully to styled code blocks when a renderer binary is absent, and the ~46 hand-built pages are re-wrapped from a new committed `docs/legacy-html/` source dir. Output is written to `k3d/docs-content-built/` (self-contained `*.html`, `style.css`, `app.js`, `search.json`) and consumed unchanged by `task docs:deploy`.

**Tech Stack:** Node ESM (node >= 22.13.0), `node:test` + `node:assert/strict` for unit tests, `gray-matter` (frontmatter), `marked` (markdown), `cheerio` (HTML post-processing), `@mermaid-js/mermaid-cli` (`mmdc`), and optional `dot` (Graphviz) for diagram rendering.

**Spec:** docs/superpowers/specs/2026-05-31-docs-html-generator-design.md

This is **Plan 1 of 2**. Plan 1 (this plan) delivers the core generator and the editorial site (discovery, frontmatter, registry, markdown rendering, theme, templates, legacy re-wrap, the entry point, and CI wiring). **Plan 2** adds the interactive domain-clustered relationship graph as the landing page (`graph-data.mjs`, `graph-layout.mjs`, `graph-svg.mjs`, plus `theme.mjs`/`templates.mjs` extensions) and overrides `renderLanding` to embed it.

## Pre-flight (do once)

- [ ] Confirm you are in the worktree and on the right branch: `cd /tmp/wt-docs-html-generator && git branch --show-current` must print `feature/docs-html-generator` (this tree is the same repo as `/home/patrick/Bachelorprojekt`, isolated on its own branch).
- [ ] Sync with main, stashing first only if the tree is dirty: `cd /tmp/wt-docs-html-generator && if [ -n "$(git status --porcelain)" ]; then git stash && git pull --rebase origin main && git stash pop; else git pull --rebase origin main; fi`.
- [ ] Make the worktree your working directory for all subsequent commands: `cd /tmp/wt-docs-html-generator`.
- [ ] Install dependencies (note: `node_modules/` is **absent** in the worktree, so this is a full first install): `cd /tmp/wt-docs-html-generator && npm install`.
- [ ] Add the new frontmatter parser as a devDependency: `cd /tmp/wt-docs-html-generator && npm install --save-dev gray-matter` (this updates `package.json` + `package-lock.json`).
- [ ] Create the module directory for the new generator: `mkdir -p /tmp/wt-docs-html-generator/scripts/docs-gen`.
- [ ] Verify the Node runtime satisfies the repo engine constraint (`>=22.13.0`, `.nvmrc` pins `22.13.0`): `node --version` (host has `v22.22.2`, which is OK).
- [ ] Confirm the diagram renderer state so fallback behavior is expected locally: `ls -l /tmp/wt-docs-html-generator/node_modules/.bin/mmdc` should now exist after `npm install`, and `which dot || echo "dot ABSENT (fallback expected)"` confirms Graphviz is **not** installed — so the default local build path exercises the mermaid-renders / dot-falls-back code paths.

---

## ⚠️ Integration Corrections (NORMATIVE — read before any task)

Each task below was drafted independently, so a few cross-task names and call-sites drifted. This section is **authoritative**: when a task body conflicts with a rule here, follow the rule here. Apply these as you implement each referenced task — do not implement the drifted version and "fix later".

### IC-1 — Canonical CSS class names (theme.mjs ↔ render-markdown.mjs ↔ templates.mjs)

All three modules MUST agree on these exact class names. `theme.mjs#editorialCss()` defines the rules; `render-markdown.mjs` and `templates.mjs` MUST emit exactly these (no `diagram-*`/`prov-badge`/`page-hero`/`track-card` variants):

- Diagrams (emitted by `render-markdown.mjs#renderDiagrams`, styled by `theme.mjs`, animated by the `DIAGRAM_JS` pan/zoom piece):
  - wrapper: `class="diagram-svg-wrapper"`
  - zoom hint: `class="diagram-zoom-hint"`
  - fallback `<pre>` (mermaid AND dot, one shared class): `class="diagram-fallback"`
  - `DIAGRAM_JS` MUST query `.diagram-svg-wrapper svg`.
- Provenance badge (emitted by `templates.mjs#provenanceBadge`, styled by `theme.mjs`):
  - root: `class="provenance-badge"`, plus modifier `repo` or `plugin` (i.e. `class="provenance-badge repo"` / `class="provenance-badge plugin"`)
  - version span inside a plugin badge: `class="pv-ver"`
- Page chrome (emitted by `templates.mjs#renderPage`/`renderLanding`, styled by `theme.mjs`):
  - header block: `class="page-header"` with `h1`, `class="page-desc"`, `class="page-meta"`
  - breadcrumbs: `class="breadcrumbs"`
  - section-index card grid: `class="section-grid"` containing `class="section-card"`
  - related-links footer: `<footer class="related-footer">` with `class="related-title"` and `class="related-list"`

If any task body shows `diagram-*`/`mermaid-svg-wrapper`/`dot-fallback`/`prov-badge`/`page-hero`/`tracks`/`track-card`/`related` (without `-footer`), substitute the canonical name above. Tests that assert a class string MUST assert the canonical name.

### IC-2 — `outPathFor` must be reachable from the registry object passed to `render-markdown`

`registry.mjs` exports `outPathFor(page)` as a module-level function, but `render-markdown.mjs#rewriteCrossLinks` calls `registry.outPathFor(target)`. Therefore **`buildRegistry(pages)` MUST return an object that includes `outPathFor`** — i.e. its return shape is `{ pages, bySlug, resolve, outPathFor }` (attach the module-level `outPathFor` as a property). Every call site that does `renderMarkdown(md, { registry, page })` then works unchanged. This applies in `build-docs.mjs` (the main build loop, the db-schema render, AND the `--rebuild-page` path which builds `buildRegistry([])` — that empty registry still carries `outPathFor`). Do NOT pass a bare `{ resolve }`; pass the full registry object.

### IC-3 — `buildPages` must receive the parsed routing table

`assignDomain(page, routingRows)` needs the routing rows for non-agent pages. `build-docs.mjs` MUST call `parseRoutingTable(CLAUDE.md)` **before** `buildPages`, and pass the rows in. Canonical signature: **`buildPages(sources, routingRows)`** (second arg required; default `[]` only for unit tests). The entry passes the real rows so docs/skills get routing-derived domains, not always-`null`.

### IC-4 — `renderPage` `toc` param is a pre-rendered HTML string, not `headings[]`

`render-markdown.mjs#renderMarkdown` already injects the TOC into its returned `html`. So in `build-docs.mjs`, call `renderPage({ page, contentHtml: rendered.html, toc: '', related })` — pass `toc: ''` (empty string), NOT `rendered.headings` (an array). `renderPage` treats `toc` as an HTML string (`${toc ?? ''}`). Never pass an array to `toc`.

### IC-5 — Single owner for the `gray-matter` dependency and the smoke test

- `gray-matter` is added **once**, in **Pre-flight + Task 1** (`npm install --save-dev gray-matter`). **Task 9 does NOT re-add it** — in Task 9, only *verify* it is present (`grep gray-matter package.json`); skip any Edit that assumes it is absent.
- `scripts/docs-gen/build-smoke.test.mjs` is authored **once, in Task 8** (the `runBuild()`-against-a-tmp-fixture version). **Task 9 does NOT recreate it.** Task 9 only references it in the `test:docs-gen` task.

### IC-6 — No `--out` flag; datamodel passthrough survives clean rebuild differently

Do **not** invent a `--rebuild-page --out <path>` flag (it is unspecified). The FIRM migration decision (datamodel-workflow survives a clean rebuild) is satisfied because **`datamodel:build` writes its generated HTML directly to `docs/legacy-html/datamodel-workflow.html`** (a plain file write/redirect to that path — it is a *source* dir, not OUT_DIR), and the build copies that file verbatim into OUT_DIR. So Task 9's `datamodel:build` edit changes the *output path of the datamodel generator* to `docs/legacy-html/datamodel-workflow.html`; it does NOT pass `--out` to `build-docs.mjs`. `--rebuild-page <slug> <mdfile>` keeps its 2-arg contract.

### IC-7 — `test:docs-gen` glob

`scripts/docs-gen/*.test.mjs` already includes `build-smoke.test.mjs` (it lives in that dir). The Taskfile `test:docs-gen` and the package.json `test:docs-gen` MUST use the **same** command: `node --test scripts/docs-gen/*.test.mjs` (do NOT also append `scripts/docs-gen/build-smoke.test.mjs` — that runs it twice).

---

---

### Task 1: frontmatter.mjs — gray-matter parsing (fixes block-scalar truncation)

**Files:**
- Create: `/tmp/wt-docs-html-generator/scripts/docs-gen/frontmatter.mjs`
- Test: `/tmp/wt-docs-html-generator/scripts/docs-gen/frontmatter.test.mjs`
- Modify: `/tmp/wt-docs-html-generator/package.json` (add `gray-matter` devDependency)

This is the first module of the new generator. The old hand-rolled parser in `scripts/sync-skill-docs.mjs` split each frontmatter line on the first colon, so a YAML block scalar (`description: >`) captured only the literal `>` — truncating every agent description. The real fixtures are the six `.claude/agents/bachelorprojekt-*.md` files, all of which use `description: >` spanning multiple indented lines. We replace the hand-rolled parser with `gray-matter` (battle-tested YAML frontmatter), which expands folded/literal block scalars correctly.

- [ ] **Step 1: Add the `gray-matter` devDependency and install it**

  Run pre-flight install plus the new dependency in the worktree:
  ```bash
  cd /tmp/wt-docs-html-generator && npm install --save-dev gray-matter@^4.0.3
  ```
  Expected: `npm` resolves and writes `gray-matter` into `devDependencies` of `package.json`, installs into `node_modules`, and updates `package-lock.json`. Verify it landed:
  ```bash
  cd /tmp/wt-docs-html-generator && node -e "import('gray-matter').then(m => console.log('gray-matter ok:', typeof (m.default ?? m)))"
  ```
  Expected output: `gray-matter ok: function`

- [ ] **Step 2: Create the module directory and write the failing test FIRST**

  Create `/tmp/wt-docs-html-generator/scripts/docs-gen/frontmatter.test.mjs` with this exact content. The first fixture copies the shape of `.claude/agents/bachelorprojekt-website.md` (`description: >` folded across multiple indented lines, first sentence mentions "Astro", last word is "design.") and asserts BOTH survive — that is the truncation regression. The remaining tests cover the `|` literal block scalar (newlines preserved), missing frontmatter (`{ data: {}, body: raw }`), and `deriveTitle` precedence (`data.title` → `data.name` → first H1 → title-cased slug).

  ```javascript
  // scripts/docs-gen/frontmatter.test.mjs
  import { test } from 'node:test';
  import assert from 'node:assert/strict';
  import { parseFrontmatter, deriveTitle } from './frontmatter.mjs';

  // ── parseFrontmatter ──────────────────────────────────────────────────────────

  test('parseFrontmatter: folded block scalar (description: >) keeps the FULL multi-line value (truncation regression)', () => {
    // Copies the shape of .claude/agents/bachelorprojekt-website.md
    const raw = [
      '---',
      'name: bachelorprojekt-website',
      'description: >',
      '  Use for Astro and Svelte website development, UI components, frontend design,',
      '  brand-specific layouts, and the /api/* backend endpoints in the Bachelorprojekt',
      '  website. Triggers on: website/, Astro, Svelte, component, homepage, kore,',
      '  mentolder brand, CSS, UI, frontend, design.',
      '---',
      '',
      'You are a frontend specialist.',
      '',
    ].join('\n');

    const { data, body } = parseFrontmatter(raw);

    assert.equal(data.name, 'bachelorprojekt-website');
    assert.equal(typeof data.description, 'string');
    // The old hand-rolled parser returned just ">" here. Prove no truncation:
    assert.ok(data.description.includes('Astro'), 'first sentence (Astro) must survive');
    assert.ok(data.description.includes('design.'), 'last sentence (design.) must survive');
    assert.notEqual(data.description.trim(), '>', 'must not collapse to the block-scalar indicator');
    // Folded scalar joins lines with spaces -> single logical line.
    assert.ok(body.startsWith('You are a frontend specialist.'), 'body excludes frontmatter');
  });

  test('parseFrontmatter: literal block scalar (|) preserves newlines', () => {
    const raw = [
      '---',
      'name: thing',
      'notes: |',
      '  line one',
      '  line two',
      '---',
      'body text',
      '',
    ].join('\n');

    const { data } = parseFrontmatter(raw);
    assert.ok(data.notes.includes('line one'), 'first line present');
    assert.ok(data.notes.includes('line two'), 'second line present');
    assert.ok(data.notes.includes('\n'), 'literal scalar keeps the newline between lines');
  });

  test('parseFrontmatter: missing frontmatter returns { data: {}, body: raw }', () => {
    const raw = '# Just a heading\n\nSome prose with no frontmatter.\n';
    const { data, body } = parseFrontmatter(raw);
    assert.deepEqual(data, {});
    assert.equal(body, raw);
  });

  test('parseFrontmatter: empty input returns empty data and empty body', () => {
    const { data, body } = parseFrontmatter('');
    assert.deepEqual(data, {});
    assert.equal(body, '');
  });

  // ── deriveTitle ───────────────────────────────────────────────────────────────

  test('deriveTitle: prefers data.title', () => {
    const t = deriveTitle({ title: 'Explicit Title', name: 'the-name' }, '# H1 Heading\n', 'the-slug');
    assert.equal(t, 'Explicit Title');
  });

  test('deriveTitle: falls back to data.name when no title', () => {
    const t = deriveTitle({ name: 'the-name' }, '# H1 Heading\n', 'the-slug');
    assert.equal(t, 'the-name');
  });

  test('deriveTitle: falls back to the first markdown H1 in body', () => {
    const t = deriveTitle({}, 'intro line\n\n#  Real Heading  \n\nmore text\n', 'the-slug');
    assert.equal(t, 'Real Heading');
  });

  test('deriveTitle: falls back to a title-cased slug when nothing else is available', () => {
    const t = deriveTitle({}, 'no heading here, just prose\n', 'cluster-deployment');
    assert.equal(t, 'Cluster Deployment');
  });
  ```

- [ ] **Step 3: Run the test and watch it FAIL (module does not exist yet)**

  ```bash
  cd /tmp/wt-docs-html-generator && node --test scripts/docs-gen/frontmatter.test.mjs
  ```
  Expected FAIL: the run aborts before any test passes because the import target is missing — an error of the form:
  ```
  Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../scripts/docs-gen/frontmatter.mjs' imported from .../scripts/docs-gen/frontmatter.test.mjs
  ...
  # fail 1   (or a non-zero exit with the module-not-found error)
  ```
  Exit code is non-zero.

- [ ] **Step 4: Write the minimal implementation in `frontmatter.mjs`**

  Create `/tmp/wt-docs-html-generator/scripts/docs-gen/frontmatter.mjs` with this exact content. It wraps `gray-matter` so block scalars expand correctly, normalises the no-frontmatter case to `{ data: {}, body: raw }`, and implements the `deriveTitle` precedence chain (`data.title` → `data.name` → first markdown H1 → title-cased slug).

  ```javascript
  // scripts/docs-gen/frontmatter.mjs
  // Frontmatter parsing for the docs generator.
  //
  // Wraps gray-matter so YAML block scalars (folded `>` and literal `|`) expand
  // to their FULL value. This replaces the hand-rolled parser in the old
  // scripts/sync-skill-docs.mjs, which split each line on the first colon and so
  // captured only ">" for a `description: >` block — truncating every agent
  // description.
  import matter from 'gray-matter';

  /**
   * Parse YAML frontmatter from a markdown/skill/agent source string.
   *
   * @param {string} raw - the full file contents.
   * @returns {{ data: object, body: string }}
   *   `data` is the parsed frontmatter object (empty object when absent);
   *   `body` is the markdown after the frontmatter (the verbatim input when absent).
   */
  export function parseFrontmatter(raw) {
    const input = typeof raw === 'string' ? raw : '';
    // gray-matter only treats a leading `---\n...\n---` fence as frontmatter;
    // when there is none it returns the input unchanged as `content` with empty data.
    const parsed = matter(input);
    const data = parsed.data && typeof parsed.data === 'object' ? parsed.data : {};
    // When there was no frontmatter, return the original string verbatim as body
    // (gray-matter strips a leading newline from `content`, which we don't want).
    const hasFrontmatter = Object.keys(data).length > 0 || parsed.matter !== '';
    const body = hasFrontmatter ? parsed.content : input;
    return { data, body };
  }

  /**
   * Derive a human-readable page title.
   * Precedence: data.title -> data.name -> first markdown H1 in body -> title-cased slug.
   *
   * @param {object} data - parsed frontmatter object.
   * @param {string} body - markdown body.
   * @param {string} fallbackSlug - kebab-case slug used as the final fallback.
   * @returns {string}
   */
  export function deriveTitle(data, body, fallbackSlug) {
    const meta = data && typeof data === 'object' ? data : {};
    if (typeof meta.title === 'string' && meta.title.trim()) return meta.title.trim();
    if (typeof meta.name === 'string' && meta.name.trim()) return meta.name.trim();

    const h1 = typeof body === 'string' ? body.match(/^#\s+(.+?)\s*$/m) : null;
    if (h1) return h1[1].trim();

    return titleCaseSlug(fallbackSlug || '');
  }

  /**
   * Turn a kebab-case slug into a Title-Cased label ("cluster-deployment" -> "Cluster Deployment").
   * @param {string} slug
   * @returns {string}
   */
  function titleCaseSlug(slug) {
    return String(slug)
      .split('-')
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
  ```

- [ ] **Step 5: Run the test and watch it PASS**

  ```bash
  cd /tmp/wt-docs-html-generator && node --test scripts/docs-gen/frontmatter.test.mjs
  ```
  Expected PASS: all eight tests green —
  ```
  # tests 8
  # pass 8
  # fail 0
  ```
  Exit code 0.

- [ ] **Step 6: Verify the regression against the REAL agent fixture (sanity, not committed)**

  Confirm the new parser returns the full description from the actual file the bug was reported against:
  ```bash
  cd /tmp/wt-docs-html-generator && node --input-type=module -e "
  import { readFileSync } from 'node:fs';
  import { parseFrontmatter } from './scripts/docs-gen/frontmatter.mjs';
  const raw = readFileSync('.claude/agents/bachelorprojekt-website.md', 'utf8');
  const { data } = parseFrontmatter(raw);
  console.log('len:', data.description.length);
  console.log('hasAstro:', data.description.includes('Astro'));
  console.log('hasDesign:', data.description.includes('design.'));
  "
  ```
  Expected output (description is well over 100 chars, not the single-char `>`):
  ```
  len: 250
  hasAstro: true
  hasDesign: true
  ```
  (Exact `len` may differ slightly; the load-bearing assertions are `hasAstro: true` and `hasDesign: true`.)

- [ ] **Step 7: Commit**

  ```bash
  cd /tmp/wt-docs-html-generator && git add scripts/docs-gen/frontmatter.mjs scripts/docs-gen/frontmatter.test.mjs package.json package-lock.json && git commit -m "$(cat <<'EOF'
  feat(docs-gen): add frontmatter.mjs with gray-matter block-scalar parsing

  Replace the hand-rolled colon-split frontmatter parser (from the old
  sync-skill-docs.mjs) with gray-matter, which expands YAML folded (>) and
  literal (|) block scalars to their full value. The old parser captured only
  ">" for a `description: >` block, truncating every agent description.

  Exports parseFrontmatter(raw) -> { data, body } and deriveTitle(data, body,
  fallbackSlug). Adds node:test coverage including the truncation regression
  against a fixture shaped like .claude/agents/bachelorprojekt-website.md.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```
  Expected: one commit on `feature/docs-html-generator` adding the two new files plus the dependency manifest changes.

Relevant absolute paths for the executor:
- Module: `/tmp/wt-docs-html-generator/scripts/docs-gen/frontmatter.mjs`
- Test: `/tmp/wt-docs-html-generator/scripts/docs-gen/frontmatter.test.mjs`
- Manifest: `/tmp/wt-docs-html-generator/package.json`
- Real regression fixture: `/tmp/wt-docs-html-generator/.claude/agents/bachelorprojekt-website.md` (confirmed: `description: >` folded across 4 indented lines, first sentence mentions "Astro", final word "design.")

---

### Task 2: discover.mjs — four source types + provenance

**Files:**
- Create: `/tmp/wt-docs-html-generator/scripts/docs-gen/discover.mjs`
- Test: `/tmp/wt-docs-html-generator/scripts/docs-gen/discover.test.mjs`

- [ ] **Step 1: Write the failing test for `resolveProvenance` + `discoverSources`**

  Create `scripts/docs-gen/discover.test.mjs` with the complete contents below. The test builds a self-contained tmp fixture tree with `fs.mkdtemp`, so it has no dependency on the real repo or plugin cache.

  ```javascript
  // scripts/docs-gen/discover.test.mjs
  import { test } from 'node:test';
  import assert from 'node:assert/strict';
  import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
  import { tmpdir } from 'node:os';
  import { join } from 'node:path';
  import { discoverSources, resolveProvenance } from './discover.mjs';

  test('resolveProvenance: plugin-cache path -> <plugin>@<version>', () => {
    const p = join(
      '/home/u/.claude/plugins/cache',
      'claude-plugins-official', 'superpowers', '5.1.0',
      'skills', 'brainstorming', 'SKILL.md'
    );
    const pluginsRoot = '/home/u/.claude/plugins/cache';
    assert.equal(resolveProvenance(p, pluginsRoot), 'superpowers@5.1.0');
  });

  test('resolveProvenance: plugin-cache agent path -> <plugin>@<version>', () => {
    const p = join(
      '/home/u/.claude/plugins/cache',
      'claude-plugins-official', 'pr-review-toolkit', '9c44119a480e-53b37853',
      'agents', 'reviewer.md'
    );
    const pluginsRoot = '/home/u/.claude/plugins/cache';
    assert.equal(resolveProvenance(p, pluginsRoot), 'pr-review-toolkit@9c44119a480e-53b37853');
  });

  test('resolveProvenance: repo path (outside pluginsRoot) -> repo', () => {
    const p = '/repo/.claude/skills/fleet-ops/SKILL.md';
    const pluginsRoot = '/home/u/.claude/plugins/cache';
    assert.equal(resolveProvenance(p, pluginsRoot), 'repo');
  });

  test('discoverSources: finds repo skill, repo agent, doc; excludes specs; missing pluginsRoot does not throw', async () => {
    const root = await mkdtemp(join(tmpdir(), 'docsgen-discover-'));
    try {
      // repo skill
      await mkdir(join(root, '.claude/skills/fleet-ops'), { recursive: true });
      await writeFile(join(root, '.claude/skills/fleet-ops/SKILL.md'), '---\nname: fleet-ops\n---\n# Fleet Ops\n');
      // one-level-deeper superpowers sub-skill
      await mkdir(join(root, '.claude/skills/superpowers/brainstorming'), { recursive: true });
      await writeFile(join(root, '.claude/skills/superpowers/brainstorming/SKILL.md'), '---\nname: brainstorming\n---\n# Brainstorm\n');
      // repo agent
      await mkdir(join(root, '.claude/agents'), { recursive: true });
      await writeFile(join(root, '.claude/agents/bachelorprojekt-db.md'), '---\nname: bachelorprojekt-db\n---\n# DB agent\n');
      // an included doc
      await mkdir(join(root, 'docs/website'), { recursive: true });
      await writeFile(join(root, 'docs/website/overview.md'), '# Overview\n');
      // an EXCLUDED doc under specs
      await mkdir(join(root, 'docs/superpowers/specs'), { recursive: true });
      await writeFile(join(root, 'docs/superpowers/specs/internal.md'), '# Internal spec\n');
      // an EXCLUDED doc under plans
      await mkdir(join(root, 'docs/superpowers/plans'), { recursive: true });
      await writeFile(join(root, 'docs/superpowers/plans/internal.md'), '# Internal plan\n');

      const sources = await discoverSources({
        repoRoot: root,
        pluginsRoot: join(root, 'does-not-exist-plugins-cache'),
        homeDir: root,
      });

      const paths = sources.map(s => s.sourcePath);
      // included
      assert.ok(paths.includes(join(root, '.claude/skills/fleet-ops/SKILL.md')), 'repo skill found');
      assert.ok(paths.includes(join(root, '.claude/skills/superpowers/brainstorming/SKILL.md')), 'superpowers sub-skill found');
      assert.ok(paths.includes(join(root, '.claude/agents/bachelorprojekt-db.md')), 'repo agent found');
      assert.ok(paths.includes(join(root, 'docs/website/overview.md')), 'doc found');
      // excluded
      assert.ok(!paths.includes(join(root, 'docs/superpowers/specs/internal.md')), 'specs excluded');
      assert.ok(!paths.includes(join(root, 'docs/superpowers/plans/internal.md')), 'plans excluded');

      // shapes & types
      const skill = sources.find(s => s.sourcePath.endsWith('fleet-ops/SKILL.md'));
      assert.equal(skill.type, 'skill');
      assert.equal(skill.provenance, 'repo');
      assert.equal(skill.name, 'fleet-ops');
      assert.equal(typeof skill.raw, 'string');
      assert.ok(skill.raw.includes('Fleet Ops'));

      const agent = sources.find(s => s.sourcePath.endsWith('bachelorprojekt-db.md'));
      assert.equal(agent.type, 'agent');
      assert.equal(agent.name, 'bachelorprojekt-db');

      const doc = sources.find(s => s.sourcePath.endsWith('docs/website/overview.md'));
      assert.equal(doc.type, 'doc');
      assert.equal(doc.provenance, 'repo');

      // deterministic sort: by type then sourcePath
      const sortedCopy = [...sources].sort((a, b) =>
        a.type === b.type ? a.sourcePath.localeCompare(b.sourcePath) : a.type.localeCompare(b.type)
      );
      assert.deepEqual(sources.map(s => s.sourcePath), sortedCopy.map(s => s.sourcePath));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('discoverSources: plugin skills and agents get <plugin>@<version> provenance', async () => {
    const root = await mkdtemp(join(tmpdir(), 'docsgen-discover-plugins-'));
    try {
      const pluginsRoot = join(root, 'plugins-cache');
      // plugin skill
      await mkdir(join(pluginsRoot, 'claude-plugins-official/superpowers/5.1.0/skills/brainstorming'), { recursive: true });
      await writeFile(join(pluginsRoot, 'claude-plugins-official/superpowers/5.1.0/skills/brainstorming/SKILL.md'), '---\nname: brainstorming\n---\n# Brainstorm\n');
      // plugin agent
      await mkdir(join(pluginsRoot, 'claude-plugins-official/pr-review-toolkit/2.0.0/agents'), { recursive: true });
      await writeFile(join(pluginsRoot, 'claude-plugins-official/pr-review-toolkit/2.0.0/agents/reviewer.md'), '---\nname: reviewer\n---\n# Reviewer\n');

      const sources = await discoverSources({ repoRoot: root, pluginsRoot, homeDir: root });

      const pSkill = sources.find(s => s.sourcePath.endsWith('brainstorming/SKILL.md'));
      assert.ok(pSkill, 'plugin skill discovered');
      assert.equal(pSkill.type, 'skill');
      assert.equal(pSkill.provenance, 'superpowers@5.1.0');
      assert.equal(pSkill.name, 'brainstorming');

      const pAgent = sources.find(s => s.sourcePath.endsWith('reviewer.md'));
      assert.ok(pAgent, 'plugin agent discovered');
      assert.equal(pAgent.type, 'agent');
      assert.equal(pAgent.provenance, 'pr-review-toolkit@2.0.0');
      assert.equal(pAgent.name, 'reviewer');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  ```

- [ ] **Step 2: Run the test and confirm it FAILS (module does not exist yet)**

  ```bash
  cd /tmp/wt-docs-html-generator && node --test scripts/docs-gen/discover.test.mjs
  ```

  Expected FAIL — the import cannot be resolved because `discover.mjs` does not exist yet:
  ```
  Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../scripts/docs-gen/discover.mjs'
  ...
  # fail 5
  ```

- [ ] **Step 3: Implement `scripts/docs-gen/discover.mjs` (minimal, complete)**

  Create `scripts/docs-gen/discover.mjs` with the complete contents below.

  ```javascript
  // scripts/docs-gen/discover.mjs
  import { readdir, readFile, stat } from 'node:fs/promises';
  import { existsSync } from 'node:fs';
  import { join, sep, basename } from 'node:path';

  /**
   * @typedef {Object} SourceDoc
   * @property {'skill'|'agent'|'doc'} type
   * @property {'repo'|string} provenance        // 'repo' or '<plugin>@<version>'
   * @property {string} name                     // kebab-ish source name
   * @property {string} sourcePath               // absolute path
   * @property {string} raw                       // file contents
   */

  // docs subtrees that are internal process artifacts — never published.
  const DOC_EXCLUDE_PREFIXES = [
    join('docs', 'superpowers', 'specs'),
    join('docs', 'superpowers', 'plans'),
  ];

  /**
   * Classify a path as 'repo' provenance or '<plugin>@<version>'.
   * A plugin-cache path has shape: <pluginsRoot>/<marketplace>/<plugin>/<version>/...
   * The plugin is the segment after the marketplace dir; the version is the next segment.
   * @param {string} absPath
   * @param {string} pluginsRoot
   * @returns {'repo'|string}
   */
  export function resolveProvenance(absPath, pluginsRoot) {
    if (!pluginsRoot) return 'repo';
    const rootNorm = pluginsRoot.endsWith(sep) ? pluginsRoot.slice(0, -1) : pluginsRoot;
    if (absPath !== rootNorm && !absPath.startsWith(rootNorm + sep)) return 'repo';
    const rel = absPath.slice(rootNorm.length + 1);
    const segs = rel.split(sep).filter(Boolean);
    // segs: [marketplace, plugin, version, ...]
    if (segs.length < 3) return 'repo';
    const plugin = segs[1];
    const version = segs[2];
    return `${plugin}@${version}`;
  }

  // Read a markdown/skill file into a SourceDoc.
  async function makeSourceDoc(type, name, sourcePath, pluginsRoot) {
    const raw = await readFile(sourcePath, 'utf8');
    return {
      type,
      provenance: resolveProvenance(sourcePath, pluginsRoot),
      name,
      sourcePath,
      raw,
    };
  }

  // List direct child directories of `dir` (absolute paths). Returns [] if dir absent.
  async function listDirs(dir) {
    if (!existsSync(dir)) return [];
    const out = [];
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (e.isDirectory()) out.push(join(dir, e.name));
    }
    return out;
  }

  // List direct child *.md files of `dir` (absolute paths). Returns [] if dir absent.
  async function listMdFiles(dir) {
    if (!existsSync(dir)) return [];
    const out = [];
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (e.isFile() && e.name.endsWith('.md')) out.push(join(dir, e.name));
    }
    return out;
  }

  // Repo skills: .claude/skills/<name>/SKILL.md, plus superpowers/<sub>/SKILL.md (one deeper).
  async function discoverRepoSkills(repoRoot, pluginsRoot) {
    const skillsRoot = join(repoRoot, '.claude', 'skills');
    const docs = [];
    for (const dir of await listDirs(skillsRoot)) {
      const name = basename(dir);
      if (name === 'superpowers') {
        for (const subDir of await listDirs(dir)) {
          const md = join(subDir, 'SKILL.md');
          if (existsSync(md)) docs.push(await makeSourceDoc('skill', basename(subDir), md, pluginsRoot));
        }
        continue;
      }
      const md = join(dir, 'SKILL.md');
      if (existsSync(md)) docs.push(await makeSourceDoc('skill', name, md, pluginsRoot));
    }
    return docs;
  }

  // Repo agents: .claude/agents/*.md
  async function discoverRepoAgents(repoRoot, pluginsRoot) {
    const agentsRoot = join(repoRoot, '.claude', 'agents');
    const docs = [];
    for (const md of await listMdFiles(agentsRoot)) {
      docs.push(await makeSourceDoc('agent', basename(md, '.md'), md, pluginsRoot));
    }
    return docs;
  }

  // Plugin skills & agents under <pluginsRoot>/<marketplace>/<plugin>/<version>/{skills|agents}.
  async function discoverPluginSources(pluginsRoot) {
    const docs = [];
    if (!pluginsRoot || !existsSync(pluginsRoot)) {
      console.warn(`[discover] plugins root absent, skipping plugin sources: ${pluginsRoot}`);
      return docs;
    }
    for (const marketplaceDir of await listDirs(pluginsRoot)) {
      for (const pluginDir of await listDirs(marketplaceDir)) {
        for (const versionDir of await listDirs(pluginDir)) {
          // skills/<name>/SKILL.md
          const skillsRoot = join(versionDir, 'skills');
          for (const skillDir of await listDirs(skillsRoot)) {
            const md = join(skillDir, 'SKILL.md');
            if (existsSync(md)) docs.push(await makeSourceDoc('skill', basename(skillDir), md, pluginsRoot));
          }
          // agents/*.md
          const agentsRoot = join(versionDir, 'agents');
          for (const md of await listMdFiles(agentsRoot)) {
            docs.push(await makeSourceDoc('agent', basename(md, '.md'), md, pluginsRoot));
          }
        }
      }
    }
    return docs;
  }

  // Recursively collect docs/**/*.md, excluding the internal-process subtrees.
  async function discoverDocs(repoRoot, pluginsRoot) {
    const docsRoot = join(repoRoot, 'docs');
    const docs = [];
    if (!existsSync(docsRoot)) return docs;

    const excluded = (absPath) =>
      DOC_EXCLUDE_PREFIXES.some((p) => {
        const full = join(repoRoot, p);
        return absPath === full || absPath.startsWith(full + sep);
      });

    async function walk(dir) {
      if (excluded(dir)) return;
      for (const e of await readdir(dir, { withFileTypes: true })) {
        const abs = join(dir, e.name);
        if (e.isDirectory()) {
          await walk(abs);
        } else if (e.isFile() && e.name.endsWith('.md') && !excluded(abs)) {
          docs.push(await makeSourceDoc('doc', basename(abs, '.md'), abs, pluginsRoot));
        }
      }
    }
    await walk(docsRoot);
    return docs;
  }

  /**
   * Discover all four source types and return a deterministically sorted SourceDoc[].
   * @param {{ repoRoot: string, pluginsRoot: string, homeDir: string }} opts
   * @returns {Promise<SourceDoc[]>}
   */
  export async function discoverSources({ repoRoot, pluginsRoot, homeDir }) {
    // homeDir is accepted for API symmetry with the caller; pluginsRoot is the
    // authoritative plugin-cache location and is used directly.
    void homeDir;
    const groups = await Promise.all([
      discoverRepoSkills(repoRoot, pluginsRoot),
      discoverRepoAgents(repoRoot, pluginsRoot),
      discoverPluginSources(pluginsRoot),
      discoverDocs(repoRoot, pluginsRoot),
    ]);
    const all = groups.flat();
    all.sort((a, b) =>
      a.type === b.type ? a.sourcePath.localeCompare(b.sourcePath) : a.type.localeCompare(b.type)
    );
    return all;
  }
  ```

- [ ] **Step 4: Run the test and confirm it PASSES**

  ```bash
  cd /tmp/wt-docs-html-generator && node --test scripts/docs-gen/discover.test.mjs
  ```

  Expected PASS:
  ```
  # tests 5
  # pass 5
  # fail 0
  ```

- [ ] **Step 5: Commit**

  ```bash
  cd /tmp/wt-docs-html-generator && git add scripts/docs-gen/discover.mjs scripts/docs-gen/discover.test.mjs && git commit -m "feat(docs-gen): add discover.mjs for four source types + provenance

  Discovers repo skills (including the one-level-deeper superpowers/<sub>/SKILL.md
  case), repo agents, plugin skills/agents from the plugin cache, and docs/**/*.md
  (excluding docs/superpowers/specs and docs/superpowers/plans). resolveProvenance
  returns 'repo' for repo paths and '<plugin>@<version>' for plugin-cache paths.
  A missing plugins root is skipped with a warning rather than throwing. Output is
  deterministically sorted by type then sourcePath.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

Notes for the executor:
- The test count in Step 2/4 reflects the five `test(...)` blocks in `discover.test.mjs`; the `ERR_MODULE_NOT_FOUND` failure surfaces before any test body runs, so the pre-implementation run reports all five as failing.
- `discoverPluginSources` walks every `<marketplace>/<plugin>/<version>` triple, so the real cache's extra `temp_*` marketplace dirs (present at `~/.claude/plugins/cache/`) are scanned uniformly; provenance still derives from the plugin/version segments regardless of marketplace dir name.
- File created at `/tmp/wt-docs-html-generator/scripts/docs-gen/discover.mjs`; test at `/tmp/wt-docs-html-generator/scripts/docs-gen/discover.test.mjs`.

---

### Task 3: registry.mjs — pages, routing table, domains, edges, output paths

**Files:**
- Create: `/tmp/wt-docs-html-generator/scripts/docs-gen/registry.mjs`
- Test: `/tmp/wt-docs-html-generator/scripts/docs-gen/registry.test.mjs`
- Modify: none

- [ ] **Step 1: Write the failing test for `outPathFor` and the domains constant.**
  Create `scripts/docs-gen/registry.test.mjs` with the first two cases. These pin the output-path contract (`skills/foo.html`, `agents/plug--bar.html`) and the `DOMAINS` export.

  ```js
  // scripts/docs-gen/registry.test.mjs
  import { test } from 'node:test';
  import assert from 'node:assert/strict';
  import {
    DOMAINS,
    buildPages,
    buildRegistry,
    parseRoutingTable,
    assignDomain,
    collectEdges,
    outPathFor,
  } from './registry.mjs';

  test('DOMAINS lists the seven canonical domains including general', () => {
    assert.deepEqual(DOMAINS, [
      'website', 'ops', 'infra', 'test', 'db', 'security', 'general',
    ]);
  });

  test('outPathFor: doc -> bare slug, repo skill -> skills/, plugin agent -> agents/plug--bar', () => {
    assert.equal(
      outPathFor({ type: 'doc', provenance: 'repo', slug: 'architecture' }),
      'architecture.html',
    );
    assert.equal(
      outPathFor({ type: 'skill', provenance: 'repo', slug: 'foo' }),
      'skills/foo.html',
    );
    assert.equal(
      outPathFor({ type: 'agent', provenance: 'repo', slug: 'bachelorprojekt-db' }),
      'agents/bachelorprojekt-db.html',
    );
    assert.equal(
      outPathFor({ type: 'skill', provenance: 'plug@1.0.0', slug: 'foo' }),
      'skills/plug--foo.html',
    );
    assert.equal(
      outPathFor({ type: 'agent', provenance: 'plug@1.0.0', slug: 'bar' }),
      'agents/plug--bar.html',
    );
  });
  ```

- [ ] **Step 2: Run the test — expect FAIL (module missing).**
  Command:
  ```bash
  cd /tmp/wt-docs-html-generator && node --test scripts/docs-gen/registry.test.mjs
  ```
  Expected FAIL: `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/tmp/wt-docs-html-generator/scripts/docs-gen/registry.mjs'` (the import in the test file cannot resolve; the run aborts before any subtest passes).

- [ ] **Step 3: Create `registry.mjs` with `DOMAINS`, `slugify`, and `outPathFor`.**
  Minimal module to make Steps 1–2 pass. `slugify` reuses the lifted `slugifyHeading` German-umlaut behavior; `pluginNameOf` extracts the plugin segment from a `<plugin>@<version>` provenance string.

  ```js
  // scripts/docs-gen/registry.mjs
  import { parseFrontmatter, deriveTitle } from './frontmatter.mjs';

  /**
   * @typedef {Object} SourceDoc
   * @property {'skill'|'agent'|'doc'} type
   * @property {'repo'|string} provenance  'repo' | '<plugin>@<version>'
   * @property {string} name
   * @property {string} sourcePath absolute
   * @property {string} raw
   *
   * @typedef {Object} Page
   * @property {string} slug
   * @property {'skill'|'agent'|'doc'} type
   * @property {string} provenance
   * @property {string} name
   * @property {string} title
   * @property {string} description
   * @property {string|null} domain
   * @property {string} bodyMarkdown
   * @property {string} sourcePath
   * @property {string} outRelPath
   *
   * @typedef {Object} Edge
   * @property {string} from slug
   * @property {string} to slug
   * @property {'wikilink'|'mdlink'} kind
   *
   * @typedef {Object} RoutingRow
   * @property {string[]} signals
   * @property {string} agent slug
   */

  /** Canonical domain list. `null` domains are treated as 'general' by the graph. */
  export const DOMAINS = ['website', 'ops', 'infra', 'test', 'db', 'security', 'general'];

  /**
   * Kebab-case slug from a dir/file name. Reproduces the legacy slugifyHeading
   * behavior: lowercase, German umlaut/eszett transliteration, spaces -> hyphens,
   * strip anything outside [a-z0-9-].
   * @param {string} text
   * @returns {string}
   */
  export function slugify(text) {
    return String(text).toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * The plugin name segment of a '<plugin>@<version>' provenance string.
   * 'repo' has no plugin name and returns ''.
   * @param {string} provenance
   * @returns {string}
   */
  export function pluginNameOf(provenance) {
    if (!provenance || provenance === 'repo') return '';
    return provenance.split('@')[0];
  }

  /**
   * Implements the contract output-path table.
   * @param {{type:string, provenance:string, slug:string}} page
   * @returns {string}
   */
  export function outPathFor(page) {
    const { type, provenance, slug } = page;
    const isRepo = provenance === 'repo';
    const pluginSlug = pluginNameOf(provenance);
    if (type === 'skill') {
      return isRepo ? `skills/${slug}.html` : `skills/${pluginSlug}--${slug}.html`;
    }
    if (type === 'agent') {
      return isRepo ? `agents/${slug}.html` : `agents/${pluginSlug}--${slug}.html`;
    }
    return `${slug}.html`;
  }
  ```

- [ ] **Step 4: Run the test — expect PASS for the two cases.**
  Command:
  ```bash
  cd /tmp/wt-docs-html-generator && node --test scripts/docs-gen/registry.test.mjs
  ```
  Expected PASS: `# pass 2`, `# fail 0`.

- [ ] **Step 5: Commit the output-path foundation.**
  ```bash
  cd /tmp/wt-docs-html-generator && git add scripts/docs-gen/registry.mjs scripts/docs-gen/registry.test.mjs && git commit -m "feat(docs-gen): registry outPathFor + DOMAINS + slugify

Add scripts/docs-gen/registry.mjs with the contract output-path table,
the canonical DOMAINS constant, and German-umlaut-aware slugify lifted
from the legacy slugifyHeading helper.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

- [ ] **Step 6: Add the failing test for `parseRoutingTable`.**
  Append to `scripts/docs-gen/registry.test.mjs`. Uses a fixture mirroring the real CLAUDE.md "Agent Routing" table (header `| Signals | Agent |`). Asserts 6 rows and that `bachelorprojekt-infra` is present with its signals parsed (backticks stripped).

  ```js
  const ROUTING_FIXTURE = `# CLAUDE.md

  ## Agent Routing

  Before responding to any request, check these signals and delegate to the named agent:

  | Signals | Agent |
  |---------|-------|
  | \`website/\`, Astro, Svelte, component, homepage, kore, brand, CSS, UI, frontend, design | \`bachelorprojekt-website\` |
  | pod, logs, status, restart, crash, health, kubectl, "what's wrong", "why is X failing", "is X running" | \`bachelorprojekt-ops\` |
  | \`k3d/\`, \`prod*/\`, manifest, kustomize, overlay, Taskfile, \`ENV=\`, \`environments/\`, \`flux/\`, deploy | \`bachelorprojekt-infra\` |
  | test, \`FA-*\`, \`SA-*\`, \`NFA-*\`, \`AK-*\`, BATS, Playwright, \`runner.sh\`, test case, "test failing", "write a test" | \`bachelorprojekt-test\` |
  | database, PostgreSQL, psql, schema, query, backup, restore, tracking, timeline, \`bachelorprojekt.features\`, \`v_timeline\` | \`bachelorprojekt-db\` |
  | SealedSecret, Keycloak realm, OIDC, DSGVO, credentials, rotate, certificate, secret | \`bachelorprojekt-security\` |

  **Tie-break rule:** prefer the domain of the files being changed.
  `;

  test('parseRoutingTable: returns 6 rows including bachelorprojekt-infra with parsed signals', () => {
    const rows = parseRoutingTable(ROUTING_FIXTURE);
    assert.equal(rows.length, 6);
    const agents = rows.map((r) => r.agent);
    assert.ok(agents.includes('bachelorprojekt-infra'), 'infra row present');
    assert.deepEqual(agents, [
      'bachelorprojekt-website',
      'bachelorprojekt-ops',
      'bachelorprojekt-infra',
      'bachelorprojekt-test',
      'bachelorprojekt-db',
      'bachelorprojekt-security',
    ]);
    const infra = rows.find((r) => r.agent === 'bachelorprojekt-infra');
    assert.ok(infra.signals.includes('k3d/'), 'backticks stripped from signal');
    assert.ok(infra.signals.includes('manifest'));
    assert.ok(infra.signals.includes('deploy'));
    assert.ok(!infra.signals.includes(''), 'no empty signal tokens');
  });
  ```

- [ ] **Step 7: Run the test — expect FAIL (parseRoutingTable is not a function).**
  Command:
  ```bash
  cd /tmp/wt-docs-html-generator && node --test scripts/docs-gen/registry.test.mjs
  ```
  Expected FAIL: `TypeError: parseRoutingTable is not a function` (the import binding is `undefined` because the export does not exist yet); `# fail 1`.

- [ ] **Step 8: Implement `parseRoutingTable` in `registry.mjs`.**
  Add after `outPathFor`. Locates the `## Agent Routing` section, finds the markdown table by its `| Signals | Agent |` header, skips the `|---|---|` separator, and parses each data row into `{ signals, agent }`. Signals are split on commas, backticks/quotes stripped, blanks dropped; the agent cell is unwrapped from backticks.

  ```js
  /**
   * Strip surrounding markdown decorations (backticks, quotes) and trim a cell token.
   * @param {string} s
   * @returns {string}
   */
  function cleanToken(s) {
    return s
      .trim()
      .replace(/^["'`]+/, '')
      .replace(/["'`]+$/, '')
      .trim();
  }

  /**
   * Parse the "Agent Routing" markdown table from CLAUDE.md text.
   * @param {string} claudeMdText
   * @returns {RoutingRow[]}
   */
  export function parseRoutingTable(claudeMdText) {
    const lines = String(claudeMdText).split('\n');
    const rows = [];
    let inTable = false;
    for (const line of lines) {
      const cells = line.split('|');
      // A markdown table row has leading + trailing pipes -> empty first/last cells.
      const isTableRow = cells.length >= 4 && cells[0].trim() === '' && cells[cells.length - 1].trim() === '';
      if (!isTableRow) {
        if (inTable) break; // table ended
        continue;
      }
      const signalsCell = cells[1].trim();
      const agentCell = cells[2].trim();
      const lower = signalsCell.toLowerCase();
      if (lower === 'signals' && agentCell.toLowerCase() === 'agent') {
        inTable = true; // header row
        continue;
      }
      if (!inTable) continue;
      if (/^[-:\s]+$/.test(signalsCell)) continue; // separator row |---|---|
      const agent = cleanToken(agentCell);
      if (!agent) continue;
      const signals = signalsCell
        .split(',')
        .map(cleanToken)
        .filter(Boolean);
      rows.push({ signals, agent });
    }
    return rows;
  }
  ```

- [ ] **Step 9: Run the test — expect PASS (3 cases).**
  Command:
  ```bash
  cd /tmp/wt-docs-html-generator && node --test scripts/docs-gen/registry.test.mjs
  ```
  Expected PASS: `# pass 3`, `# fail 0`.

- [ ] **Step 10: Commit `parseRoutingTable`.**
  ```bash
  cd /tmp/wt-docs-html-generator && git add scripts/docs-gen/registry.mjs scripts/docs-gen/registry.test.mjs && git commit -m "feat(docs-gen): parseRoutingTable extracts the CLAUDE.md routing rows

Parse the '| Signals | Agent |' Agent Routing table into RoutingRow[],
splitting signals on commas and stripping backtick/quote decorations.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

- [ ] **Step 11: Add the failing test for `assignDomain`.**
  Append to `scripts/docs-gen/registry.test.mjs`. Three cases: a `bachelorprojekt-db` agent maps to `'db'`; a page with explicit frontmatter `domain` wins; an unrelated doc with no signal match returns `null`. Reuses `ROUTING_FIXTURE` parsed once.

  ```js
  test('assignDomain: bachelorprojekt-<x> agent -> <x>; frontmatter wins; unrelated doc -> null', () => {
    const routing = parseRoutingTable(ROUTING_FIXTURE);

    const dbAgent = {
      type: 'agent', name: 'bachelorprojekt-db', slug: 'bachelorprojekt-db',
      title: 'DB agent', description: '', domain: null,
    };
    assert.equal(assignDomain(dbAgent, routing), 'db');

    const fmDoc = {
      type: 'doc', name: 'something', slug: 'something',
      title: 'Something', description: 'about nothing in particular', domain: 'security',
    };
    assert.equal(assignDomain(fmDoc, routing), 'security');

    const kwDoc = {
      type: 'doc', name: 'kustomize-overlay-notes', slug: 'kustomize-overlay-notes',
      title: 'Kustomize overlay notes', description: 'manifest and overlay tips', domain: null,
    };
    assert.equal(assignDomain(kwDoc, routing), 'infra');

    const unrelated = {
      type: 'doc', name: 'lunch-menu', slug: 'lunch-menu',
      title: 'Lunch menu', description: 'sandwiches and soup', domain: null,
    };
    assert.equal(assignDomain(unrelated, routing), null);
  });
  ```

- [ ] **Step 12: Run the test — expect FAIL (assignDomain is not a function).**
  Command:
  ```bash
  cd /tmp/wt-docs-html-generator && node --test scripts/docs-gen/registry.test.mjs
  ```
  Expected FAIL: `TypeError: assignDomain is not a function`; `# fail 1`.

- [ ] **Step 13: Implement `assignDomain` in `registry.mjs`.**
  Add after `parseRoutingTable`. Priority order: (1) `bachelorprojekt-<x>` agent name where `<x>` is a known domain; (2) explicit frontmatter `domain` / first of `domains`, validated against `DOMAINS`; (3) keyword match of the page name + title + description against routing signals (whole-token, case-insensitive), mapping the matched agent back to its `<x>`; (4) `null`.

  ```js
  const AGENT_DOMAIN_RE = /^bachelorprojekt-([a-z]+)$/;

  /**
   * Map a routing agent slug ('bachelorprojekt-infra') to its domain ('infra').
   * @param {string} agent
   * @returns {string|null}
   */
  function agentToDomain(agent) {
    const m = AGENT_DOMAIN_RE.exec(agent || '');
    if (m && DOMAINS.includes(m[1])) return m[1];
    return null;
  }

  /**
   * Resolve the domain for a page.
   * @param {{type:string,name?:string,title?:string,description?:string,domain?:string|null,domains?:string[]}} page
   * @param {RoutingRow[]} routingRows
   * @returns {string|null}
   */
  export function assignDomain(page, routingRows) {
    // 1. bachelorprojekt-<x> agent name maps directly.
    if (page.type === 'agent') {
      const fromName = agentToDomain(page.name || page.slug || '');
      if (fromName) return fromName;
    }
    // 2. Explicit frontmatter domain / first of domains[].
    const fmCandidates = [];
    if (typeof page.domain === 'string') fmCandidates.push(page.domain);
    if (Array.isArray(page.domains)) fmCandidates.push(...page.domains);
    for (const cand of fmCandidates) {
      const norm = String(cand).trim().toLowerCase();
      if (DOMAINS.includes(norm)) return norm;
    }
    // 3. Keyword-match name/title/description against routing signals.
    const haystack = `${page.name || ''} ${page.title || ''} ${page.description || ''}`.toLowerCase();
    for (const row of routingRows || []) {
      const domain = agentToDomain(row.agent);
      if (!domain) continue;
      for (const signal of row.signals) {
        const token = String(signal).trim().toLowerCase().replace(/[/*]+$/g, '');
        if (token.length < 3) continue; // skip noise like 'ui'/'css'-too-short markers
        if (new RegExp(`\\b${escapeRe(token)}\\b`).test(haystack)) {
          return domain;
        }
      }
    }
    // 4. Unmatched.
    return null;
  }

  /**
   * Escape a string for safe use inside a RegExp.
   * @param {string} s
   * @returns {string}
   */
  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  ```

- [ ] **Step 14: Run the test — expect PASS (4 cases).**
  Command:
  ```bash
  cd /tmp/wt-docs-html-generator && node --test scripts/docs-gen/registry.test.mjs
  ```
  Expected PASS: `# pass 4`, `# fail 0`.

- [ ] **Step 15: Commit `assignDomain`.**
  ```bash
  cd /tmp/wt-docs-html-generator && git add scripts/docs-gen/registry.mjs scripts/docs-gen/registry.test.mjs && git commit -m "feat(docs-gen): assignDomain resolves page domains

Priority: bachelorprojekt-<x> agent name, then frontmatter domain/domains,
then keyword-match of name/title/description against routing signals,
else null (graph treats null as general).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

- [ ] **Step 16: Add the failing test for `buildPages` + `buildRegistry`.**
  Append to `scripts/docs-gen/registry.test.mjs`. Feeds two `SourceDoc`s (a repo skill with frontmatter, a repo doc) and asserts `buildPages` sets slug/title/description/domain/bodyMarkdown/outRelPath, and that `buildRegistry` exposes `bySlug` and `resolve` with repo-beats-plugin collision handling.

  ```js
  test('buildPages: derives slug/title/description/domain/outRelPath; bodyMarkdown excludes frontmatter', () => {
    const routing = parseRoutingTable(ROUTING_FIXTURE);
    const sources = [
      {
        type: 'skill', provenance: 'repo', name: 'database-ops',
        sourcePath: '/abs/.claude/skills/database-ops/SKILL.md',
        raw: '---\nname: database-ops\ndescription: Runbook for database operations and schema migrations\n---\n# Database Ops\n\nBody text here.',
      },
      {
        type: 'doc', provenance: 'repo', name: 'WSL-BOOTSTRAP',
        sourcePath: '/abs/docs/WSL-BOOTSTRAP.md',
        raw: '# WSL Bootstrap\n\nLunch and sandwiches.',
      },
    ];
    const pages = buildPages(sources, { routingRows: routing });
    assert.equal(pages.length, 2);

    const skill = pages.find((p) => p.name === 'database-ops');
    assert.equal(skill.slug, 'database-ops');
    assert.equal(skill.title, 'database-ops');
    assert.equal(skill.description, 'Runbook for database operations and schema migrations');
    assert.equal(skill.domain, 'db', 'keyword "database" routes to db');
    assert.equal(skill.outRelPath, 'skills/database-ops.html');
    assert.ok(!skill.bodyMarkdown.includes('---'), 'frontmatter stripped from bodyMarkdown');
    assert.ok(skill.bodyMarkdown.includes('Body text here.'));

    const doc = pages.find((p) => p.name === 'WSL-BOOTSTRAP');
    assert.equal(doc.slug, 'wsl-bootstrap');
    assert.equal(doc.title, 'WSL Bootstrap', 'title from first H1 when no frontmatter title');
    assert.equal(doc.outRelPath, 'wsl-bootstrap.html');
    assert.equal(doc.domain, null);
  });

  test('buildRegistry: bySlug map + resolve() with repo-beats-plugin collision', () => {
    const repoPage = {
      slug: 'shared', type: 'skill', provenance: 'repo', name: 'shared',
      title: 'Repo Shared', description: '', domain: null,
      bodyMarkdown: '', sourcePath: '/r', outRelPath: 'skills/shared.html',
    };
    const pluginPage = {
      slug: 'shared', type: 'skill', provenance: 'plug@1.0.0', name: 'shared',
      title: 'Plugin Shared', description: '', domain: null,
      bodyMarkdown: '', sourcePath: '/p', outRelPath: 'skills/plug--shared.html',
    };
    const onlyPlugin = {
      slug: 'lonely', type: 'agent', provenance: 'plug@1.0.0', name: 'lonely',
      title: 'Lonely', description: '', domain: null,
      bodyMarkdown: '', sourcePath: '/l', outRelPath: 'agents/plug--lonely.html',
    };
    const registry = buildRegistry([pluginPage, repoPage, onlyPlugin]);
    assert.ok(registry.bySlug instanceof Map);
    assert.equal(registry.resolve('shared').provenance, 'repo', 'repo beats plugin on slug collision');
    assert.equal(registry.resolve('lonely').provenance, 'plug@1.0.0');
    assert.equal(registry.resolve('does-not-exist'), null);
  });
  ```

- [ ] **Step 17: Run the test — expect FAIL (buildPages is not a function).**
  Command:
  ```bash
  cd /tmp/wt-docs-html-generator && node --test scripts/docs-gen/registry.test.mjs
  ```
  Expected FAIL: `TypeError: buildPages is not a function`; `# fail 2`.

- [ ] **Step 18: Implement `buildPages` and `buildRegistry` in `registry.mjs`.**
  Add after `assignDomain`. `buildPages` parses each source's frontmatter via `parseFrontmatter`, derives the title via `deriveTitle`, the description from frontmatter, the domain via `assignDomain`, and the output path via `outPathFor`. `buildRegistry` builds a `bySlug` Map where repo entries win collisions, plus a `resolve(name)` that slugifies the bare name and returns the page or `null`.

  ```js
  /**
   * First non-empty frontmatter string field among the given keys.
   * @param {object} data
   * @param {string[]} keys
   * @returns {string}
   */
  function firstString(data, keys) {
    for (const k of keys) {
      const v = data && data[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
  }

  /**
   * Turn SourceDoc[] into Page[].
   * @param {SourceDoc[]} sources
   * @param {{routingRows?: RoutingRow[]}} [opts]
   * @returns {Page[]}
   */
  export function buildPages(sources, opts = {}) {
    const routingRows = opts.routingRows || [];
    return sources.map((src) => {
      const { data, body } = parseFrontmatter(src.raw);
      const slug = slugify(src.name);
      const title = deriveTitle(data, body, slug);
      const description = firstString(data, ['description', 'summary']);
      const fmDomain = firstString(data, ['domain']);
      const fmDomains = Array.isArray(data && data.domains) ? data.domains : undefined;
      const draft = {
        slug,
        type: src.type,
        provenance: src.provenance,
        name: src.name,
        title,
        description,
        domain: fmDomain || null,
        domains: fmDomains,
        bodyMarkdown: body,
        sourcePath: src.sourcePath,
      };
      const domain = assignDomain(draft, routingRows);
      const page = {
        slug,
        type: src.type,
        provenance: src.provenance,
        name: src.name,
        title,
        description,
        domain,
        bodyMarkdown: body,
        sourcePath: src.sourcePath,
        outRelPath: '',
      };
      page.outRelPath = outPathFor(page);
      return page;
    });
  }

  /**
   * Build a slug->Page registry. Repo provenance wins on slug collisions.
   * @param {Page[]} pages
   * @returns {{ pages: Page[], bySlug: Map<string,Page>, resolve: (name:string)=>Page|null }}
   */
  export function buildRegistry(pages) {
    const bySlug = new Map();
    for (const page of pages) {
      const existing = bySlug.get(page.slug);
      if (!existing) {
        bySlug.set(page.slug, page);
        continue;
      }
      // Collision: repo beats plugin; otherwise keep the first seen.
      if (existing.provenance !== 'repo' && page.provenance === 'repo') {
        bySlug.set(page.slug, page);
      }
    }
    function resolve(name) {
      if (!name) return null;
      const slug = slugify(name);
      return bySlug.get(slug) || null;
    }
    return { pages, bySlug, resolve };
  }
  ```

- [ ] **Step 19: Run the test — expect PASS (6 cases).**
  Command:
  ```bash
  cd /tmp/wt-docs-html-generator && node --test scripts/docs-gen/registry.test.mjs
  ```
  Expected PASS: `# pass 6`, `# fail 0`.

- [ ] **Step 20: Commit `buildPages` + `buildRegistry`.**
  ```bash
  cd /tmp/wt-docs-html-generator && git add scripts/docs-gen/registry.mjs scripts/docs-gen/registry.test.mjs && git commit -m "feat(docs-gen): buildPages + buildRegistry with repo-beats-plugin resolve

buildPages turns SourceDoc[] into Page[] (slug, title via deriveTitle,
description, domain via assignDomain, outRelPath via outPathFor).
buildRegistry exposes bySlug Map and resolve(name); repo provenance wins
slug collisions.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

- [ ] **Step 21: Add the failing test for `collectEdges`.**
  Append to `scripts/docs-gen/registry.test.mjs`. Builds a registry of two known pages, then a page whose `bodyMarkdown` contains a resolvable `[[known-a]]` wikilink, a relative `.md` link to `known-b`, and an unresolvable `[[missing]]`. Asserts resolved edges and the `unresolved` report.

  ```js
  test('collectEdges: resolves [[known]] and relative .md links; reports [[missing]]', () => {
    const known = [
      {
        slug: 'known-a', type: 'doc', provenance: 'repo', name: 'known-a',
        title: 'Known A', description: '', domain: null,
        bodyMarkdown: '', sourcePath: '/a', outRelPath: 'known-a.html',
      },
      {
        slug: 'known-b', type: 'doc', provenance: 'repo', name: 'known-b',
        title: 'Known B', description: '', domain: null,
        bodyMarkdown: '', sourcePath: '/b', outRelPath: 'known-b.html',
      },
    ];
    const source = {
      slug: 'source', type: 'doc', provenance: 'repo', name: 'source',
      title: 'Source', description: '', domain: null,
      bodyMarkdown: 'See [[known-a]] and [link](./known-b.md) but not [[missing]].',
      sourcePath: '/s', outRelPath: 'source.html',
    };
    const pages = [...known, source];
    const registry = buildRegistry(pages);
    const { edges, unresolved } = collectEdges(pages, registry);

    assert.ok(
      edges.some((e) => e.from === 'source' && e.to === 'known-a' && e.kind === 'wikilink'),
      'wikilink edge resolved',
    );
    assert.ok(
      edges.some((e) => e.from === 'source' && e.to === 'known-b' && e.kind === 'mdlink'),
      'relative .md link edge resolved',
    );
    assert.ok(
      unresolved.some((u) => u.from === 'source' && u.ref === 'missing'),
      'missing wikilink reported',
    );
    assert.ok(
      !edges.some((e) => e.to === 'missing'),
      'no edge created for unresolved ref',
    );
  });
  ```

- [ ] **Step 22: Run the test — expect FAIL (collectEdges is not a function).**
  Command:
  ```bash
  cd /tmp/wt-docs-html-generator && node --test scripts/docs-gen/registry.test.mjs
  ```
  Expected FAIL: `TypeError: collectEdges is not a function`; `# fail 1`.

- [ ] **Step 23: Implement `collectEdges` in `registry.mjs`.**
  Add after `buildRegistry`. Scans each page's `bodyMarkdown` for `[[name]]` wikilinks and relative markdown links ending in `.md` (skipping absolute URLs and anchors). Resolves the bare name via `registry.resolve`; resolved refs become `Edge`s (deduped per from/to/kind), unresolved refs are reported as `{ from, ref }`. Self-edges are skipped.

  ```js
  const WIKILINK_RE = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g;
  const MDLINK_RE = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

  /**
   * The bare reference name from a relative markdown link target, or null if the
   * target is an external URL, an anchor, or not a .md link.
   * @param {string} target
   * @returns {string|null}
   */
  function mdLinkRefName(target) {
    const t = String(target).trim();
    if (!t || t.startsWith('#')) return null;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return null; // http(s):, etc.
    if (t.startsWith('mailto:')) return null;
    const noAnchor = t.split('#')[0];
    if (!/\.md$/i.test(noAnchor)) return null;
    const base = noAnchor.split('/').pop() || '';
    return base.replace(/\.md$/i, '');
  }

  /**
   * Collect cross-link edges from page bodies.
   * @param {Page[]} pages
   * @param {{resolve:(name:string)=>Page|null}} registry
   * @returns {{ edges: Edge[], unresolved: Array<{from:string, ref:string}> }}
   */
  export function collectEdges(pages, registry) {
    const edges = [];
    const unresolved = [];
    const seen = new Set();
    const addEdge = (from, to, kind) => {
      if (!to || to === from) return;
      const key = `${from}|${to}|${kind}`;
      if (seen.has(key)) return;
      seen.add(key);
      edges.push({ from, to, kind });
    };
    for (const page of pages) {
      const md = page.bodyMarkdown || '';
      let m;
      WIKILINK_RE.lastIndex = 0;
      while ((m = WIKILINK_RE.exec(md)) !== null) {
        const ref = m[1].trim();
        if (!ref) continue;
        const target = registry.resolve(ref);
        if (target) addEdge(page.slug, target.slug, 'wikilink');
        else unresolved.push({ from: page.slug, ref });
      }
      MDLINK_RE.lastIndex = 0;
      while ((m = MDLINK_RE.exec(md)) !== null) {
        const ref = mdLinkRefName(m[1]);
        if (!ref) continue;
        const target = registry.resolve(ref);
        if (target) addEdge(page.slug, target.slug, 'mdlink');
        else unresolved.push({ from: page.slug, ref });
      }
    }
    return { edges, unresolved };
  }
  ```

- [ ] **Step 24: Run the full registry test suite — expect PASS (7 cases).**
  Command:
  ```bash
  cd /tmp/wt-docs-html-generator && node --test scripts/docs-gen/registry.test.mjs
  ```
  Expected PASS: `# tests 7`, `# pass 7`, `# fail 0`.

- [ ] **Step 25: Commit `collectEdges`.**
  ```bash
  cd /tmp/wt-docs-html-generator && git add scripts/docs-gen/registry.mjs scripts/docs-gen/registry.test.mjs && git commit -m "feat(docs-gen): collectEdges scans wikilinks and relative md links

Scan page bodyMarkdown for [[name]] and relative .md links, resolve via
registry, return deduped Edge[] plus an unresolved {from, ref} report.
External URLs, anchors, and self-edges are skipped.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

### Task 4: render-markdown.mjs — marked + diagrams (mermaid/dot) + postprocess + cross-links

**Files:**
- Create: `scripts/docs-gen/render-markdown.mjs`
- Test: `scripts/docs-gen/render-markdown.test.mjs`

This task produces the per-page markdown→HTML renderer. It lifts the temp-file `execFileSync` mermaid approach and the German-umlaut `slugifyHeading` verbatim from `scripts/build-docs.js`, adds a parallel Graphviz/`dot` path (same fallback shape), preserves the `pre.mermaid-fallback` / new `pre.dot-fallback` classes (so `injectCopyButtons` skips them exactly like the old `postProcess` did), and adds registry-driven cross-link rewriting for `[[name]]` and relative `.md` links. `renderMarkdown` orchestrates all helpers and returns `{ html, headings, unresolved, diagramFallbacks }`.

Dependency on Task 3 (`registry.mjs`): `rewriteCrossLinks` calls `registry.resolve(name)` (returns a `Page` or `undefined`) and reads `outPathFor(targetPage)` to build the href. Tests stub a minimal registry object so this task is independently runnable even before `registry.mjs` lands — the contract used is exactly `registry.resolve(name) -> Page|undefined` and `registry.outPathFor(page) -> string`. The real `registry.mjs` from Task 3 satisfies this shape (it exposes `resolve`; `outPathFor` is module-level there, so `renderMarkdown` accepts `outPathFor` via the registry object — Task 5/entry passes `{ ...registry, outPathFor }`).

- [ ] **Step 1: Create the test file with all five failing tests.**

Write `scripts/docs-gen/render-markdown.test.mjs` with the complete content below. It imports from a module that does not exist yet, so the run fails at import.

```js
// scripts/docs-gen/render-markdown.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderMarkdown,
  renderDiagrams,
  addHeadingIds,
  buildToc,
  injectCopyButtons,
  rewriteCrossLinks,
} from './render-markdown.mjs';

// A minimal registry stub matching the contract:
//   resolve(name) -> Page | undefined
//   outPathFor(page) -> string
function makeRegistry(map) {
  return {
    resolve(name) {
      return map[name];
    },
    outPathFor(page) {
      return page.outRelPath;
    },
  };
}

test('renderDiagrams: mermaid block falls back to a styled code block when mmdc is absent', () => {
  const html =
    '<p>before</p><pre><code class="language-mermaid">flowchart LR\n  A--&gt;B</code></pre><p>after</p>';
  const { html: out, fallbacks } = renderDiagrams(html, { mmdc: '/nonexistent/mmdc', dot: '/nonexistent/dot' });
  assert.ok(out.includes('before'), 'keeps surrounding content');
  assert.ok(out.includes('after'), 'keeps surrounding content');
  assert.ok(out.includes('class="mermaid-fallback"'), 'emits mermaid fallback class');
  assert.equal(fallbacks, 1, 'counts one diagram fallback');
});

test('renderDiagrams: dot block falls back to a styled code block when dot is absent', () => {
  const html =
    '<pre><code class="language-dot">digraph G { a -&gt; b }</code></pre>';
  const { html: out, fallbacks } = renderDiagrams(html, { mmdc: '/nonexistent/mmdc', dot: '/nonexistent/dot' });
  assert.ok(out.includes('class="dot-fallback"'), 'emits dot fallback class');
  assert.ok(out.includes('digraph G'), 'preserves the dot source text');
  assert.equal(fallbacks, 1, 'counts one diagram fallback');
});

test('addHeadingIds: gives an h2 a slug id with German umlaut handling', () => {
  const out = addHeadingIds('<h2>Konfiguration &amp; Außenüberwachung</h2>');
  // ä→ae ö→oe ü→ue ß→ss, spaces→hyphens, drop chars outside [a-z0-9-]
  assert.ok(out.includes('id="konfiguration--aussenueberwachung"'), `got: ${out}`);
});

test('buildToc: renders a toc-box from a headings array of length >= 2', () => {
  const out = buildToc(['Installation', 'Konfiguration', 'Betrieb']);
  assert.ok(out.includes('class="toc-box auto-toc"'), 'toc box class');
  assert.ok(out.includes('Auf dieser Seite'), 'toc title');
  assert.ok(out.includes('href="#installation"'), 'first heading anchor');
  assert.equal(buildToc(['only one']), '', 'no toc for a single heading');
});

test('injectCopyButtons: adds a copy button to a pre/code, skips diagram fallbacks', () => {
  const html =
    '<pre><code class="language-bash">echo hi</code></pre>' +
    '<pre class="mermaid-fallback"><code>flowchart LR</code></pre>';
  const out = injectCopyButtons(html);
  assert.ok(out.includes('class="copy-btn"'), 'copy button injected');
  assert.ok(out.includes('class="code-wrapper"'), 'wrapper injected');
  // exactly one copy button — the mermaid-fallback pre must be skipped
  assert.equal(out.split('copy-btn').length - 1, 1, 'only the real code block gets a button');
});

test('rewriteCrossLinks: [[known]] -> anchor to outRelPath, [[missing]] -> plain text + reported', () => {
  const registry = makeRegistry({
    'keycloak-realm-sync': { slug: 'keycloak-realm-sync', outRelPath: 'skills/keycloak-realm-sync.html' },
  });
  const page = { slug: 'security-overview' };
  const { html, unresolved } = rewriteCrossLinks(
    '<p>see [[keycloak-realm-sync]] and [[missing]]</p>',
    { registry, page }
  );
  assert.ok(
    html.includes('<a href="./skills/keycloak-realm-sync.html"'),
    `known wiki-link becomes anchor; got: ${html}`
  );
  assert.ok(html.includes('keycloak-realm-sync</a>'), 'anchor label is the bare name');
  assert.ok(!html.includes('[[keycloak-realm-sync]]'), 'resolved marker removed');
  assert.ok(html.includes('missing') && !html.includes('[[missing]]') , 'missing rendered as plain text');
  assert.equal(unresolved.length, 1, 'one unresolved ref reported');
  assert.equal(unresolved[0].ref, 'missing', 'reports the bare missing name');
});

test('rewriteCrossLinks: relative .md link resolves to the target outRelPath', () => {
  const registry = makeRegistry({
    'wsl-bootstrap': { slug: 'wsl-bootstrap', outRelPath: 'wsl-bootstrap.html' },
  });
  const page = { slug: 'index' };
  const { html } = rewriteCrossLinks(
    '<p><a href="WSL-BOOTSTRAP.md">setup</a></p>',
    { registry, page }
  );
  assert.ok(html.includes('href="./wsl-bootstrap.html"'), `md link rewritten; got: ${html}`);
  assert.ok(html.includes('>setup</a>'), 'preserves the original link label');
});

test('renderMarkdown: end to end returns html, headings, unresolved, diagramFallbacks', () => {
  const registry = makeRegistry({
    'wsl-bootstrap': { slug: 'wsl-bootstrap', outRelPath: 'wsl-bootstrap.html' },
  });
  const page = { slug: 'overview' };
  const md = [
    '# Overview',
    '',
    '## Erste Schritte',
    '',
    'See [[wsl-bootstrap]] and [[ghost]].',
    '',
    '```mermaid',
    'flowchart LR',
    '  A --> B',
    '```',
    '',
    '```bash',
    'echo hi',
    '```',
  ].join('\n');
  const result = renderMarkdown(md, {
    registry,
    page,
    mmdc: '/nonexistent/mmdc',
    dot: '/nonexistent/dot',
  });
  assert.ok(Array.isArray(result.headings), 'headings is an array');
  assert.ok(result.headings.includes('Erste Schritte'), 'collects the h2 text');
  assert.ok(result.html.includes('id="erste-schritte"'), 'h2 gets an id');
  assert.ok(result.html.includes('class="toc-box auto-toc"'), 'toc injected when >= 2 h2 — n/a here so check skipped');
  assert.ok(result.html.includes('href="./wsl-bootstrap.html"'), 'cross-link resolved');
  assert.equal(result.unresolved.length, 1, 'one unresolved wiki-link');
  assert.equal(result.unresolved[0].ref, 'ghost', 'reports ghost');
  assert.equal(result.diagramFallbacks, 1, 'mermaid fell back once');
  assert.ok(result.html.includes('class="copy-btn"'), 'copy button present');
});
```

Note: the `toc-box` assertion in the end-to-end test would fail for a single `h2`; the markdown above intentionally has only ONE `h2` (`Erste Schritte`). Drop that stale assertion before running — it is corrected in the next step's final test content. (Kept here to document intent; the runnable version omits it.)

Replace the `renderMarkdown` end-to-end test's TOC assertion line so the test is internally consistent: delete this line from the test you just wrote —

```js
  assert.ok(result.html.includes('class="toc-box auto-toc"'), 'toc injected when >= 2 h2 — n/a here so check skipped');
```

- [ ] **Step 2: Run the test — expect a FAIL (module not found).**

```bash
cd /tmp/wt-docs-html-generator && node --test scripts/docs-gen/render-markdown.test.mjs
```

Expected FAIL output (import resolution error before any test runs):

```
node:internal/modules/esm/resolve ... Cannot find module '/tmp/wt-docs-html-generator/scripts/docs-gen/render-markdown.mjs'
... code: 'ERR_MODULE_NOT_FOUND'
# tests 0
# fail 1   (or process exits non-zero on the load error)
```

- [ ] **Step 3: Create `scripts/docs-gen/render-markdown.mjs` with the complete implementation.**

Write the file below in full. It uses `marked` for parsing, `cheerio` for DOM transforms, lifts the mermaid temp-file `execFileSync` pattern and `slugifyHeading` verbatim from `build-docs.js`, adds the `dot` path, and resolves cross-links via the registry.

```js
// scripts/docs-gen/render-markdown.mjs
//
// Per-page markdown → HTML renderer for the docs generator.
//
// Pipeline (renderMarkdown):
//   marked.parse(markdown)
//     → rewriteCrossLinks   (resolve [[name]] and relative .md links via registry)
//     → renderDiagrams      (mermaid via mmdc, dot via graphviz; graceful fallback)
//     → addHeadingIds       (German-umlaut-safe slug ids on h2)
//     → injectCopyButtons   (wrap pre/code, add a Copy button; skip diagram fallbacks)
//     → inject TOC after the first h1 when there are >= 2 h2 headings
//
// Returns { html, headings, unresolved, diagramFallbacks }.
//
// Binary paths (mmdc / dot) are injectable via the options arg for testability:
//   renderMarkdown(md, { registry, page, mmdc, dot })
//   renderDiagrams(html, { mmdc, dot })
// Defaults: mmdc → node_modules/.bin/mmdc (lifted from build-docs.js), dot → 'dot' (PATH lookup).

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { marked } from 'marked';
import * as cheerio from 'cheerio';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Default mmdc path — same location build-docs.js used. */
const DEFAULT_MMDC = join(__dirname, '../../node_modules/.bin/mmdc');
/** Default dot is resolved off PATH (Graphviz is optional / not installed in CI). */
const DEFAULT_DOT = 'dot';

/**
 * @typedef {object} RenderResult
 * @property {string} html
 * @property {string[]} headings           h2 text, in document order
 * @property {Array<{ref: string}>} unresolved  unresolved [[name]] / .md refs
 * @property {number} diagramFallbacks     count of diagrams that fell back to code blocks
 */

// ─── slugifyHeading (verbatim behavior from build-docs.js) ──────────────────────
// lowercases, maps the German umlauts and eszett, turns spaces into hyphens,
// strips chars outside a-z0-9 and hyphen.
function slugifyHeading(text) {
  return text.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

// ─── renderDiagrams ─────────────────────────────────────────────────────────────
// Replaces fenced mermaid and dot/graphviz code blocks with inline SVG.
// On a missing/failing renderer binary, falls back to a styled code block
// (pre.mermaid-fallback / pre.dot-fallback) and increments the fallback counter.
//
// @param {string} html  HTML emitted by marked (contains <pre><code class="language-*">)
// @param {{mmdc?:string, dot?:string}} [opts]
// @returns {{ html: string, fallbacks: number }}
export function renderDiagrams(html, opts = {}) {
  const mmdc = opts.mmdc ?? DEFAULT_MMDC;
  const dot = opts.dot ?? DEFAULT_DOT;
  const $ = cheerio.load(html, { xmlMode: false });
  let fallbacks = 0;

  // Mermaid — lifted execFileSync temp-file approach from build-docs.js.
  $('pre code.language-mermaid').each((_, el) => {
    const src = $(el).text();
    let svg = null;
    if (existsSync(mmdc)) {
      const tmpDir = mkdtempSync(join(tmpdir(), 'mmdc-'));
      const inFile = join(tmpDir, 'diagram.mmd');
      const outFile = join(tmpDir, 'diagram.svg');
      try {
        writeFileSync(inFile, src);
        execFileSync(mmdc, ['-i', inFile, '-o', outFile, '-b', 'transparent', '--quiet'], {
          stdio: ['ignore', 'ignore', 'pipe'],
          timeout: 30000,
        });
        if (existsSync(outFile)) svg = readFileSync(outFile, 'utf8');
      } catch (_err) { /* renderer failed — fall back below */ } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    }
    if (svg) {
      $(el).parent().replaceWith(
        `<div class="mermaid-svg-wrapper">${svg}<span class="mermaid-zoom-hint">Scroll = Zoom · Ziehen = Pan</span></div>`
      );
    } else {
      fallbacks += 1;
      $(el).parent().replaceWith(`<pre class="mermaid-fallback"><code>${escapeHtml(src)}</code></pre>`);
    }
  });

  // Graphviz / dot — same temp-file + execFileSync shape, invoking `dot -Tsvg`.
  // `dot` is resolved off PATH; execFileSync throws ENOENT when it is absent,
  // which routes us into the styled-fallback branch (same as a missing mmdc).
  $('pre code.language-dot, pre code.language-graphviz').each((_, el) => {
    const src = $(el).text();
    let svg = null;
    const tmpDir = mkdtempSync(join(tmpdir(), 'dot-'));
    const inFile = join(tmpDir, 'diagram.dot');
    const outFile = join(tmpDir, 'diagram.svg');
    try {
      writeFileSync(inFile, src);
      execFileSync(dot, ['-Tsvg', inFile, '-o', outFile], {
        stdio: ['ignore', 'ignore', 'pipe'],
        timeout: 30000,
      });
      if (existsSync(outFile)) svg = readFileSync(outFile, 'utf8');
    } catch (_err) { /* dot missing or failed — fall back below */ } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
    if (svg) {
      // Strip the XML/doctype prologue dot emits so the SVG nests cleanly.
      const inlineSvg = svg.replace(/^[\s\S]*?(?=<svg)/, '');
      $(el).parent().replaceWith(
        `<div class="mermaid-svg-wrapper">${inlineSvg}<span class="mermaid-zoom-hint">Scroll = Zoom · Ziehen = Pan</span></div>`
      );
    } else {
      fallbacks += 1;
      $(el).parent().replaceWith(`<pre class="dot-fallback"><code>${escapeHtml(src)}</code></pre>`);
    }
  });

  return { html: $.html(), fallbacks };
}

// ─── addHeadingIds ──────────────────────────────────────────────────────────────
// Assigns a German-umlaut-safe slug id to every h2 that lacks one.
// @param {string} html
// @returns {string}
export function addHeadingIds(html) {
  const $ = cheerio.load(html, { xmlMode: false });
  $('h2').each((_, el) => {
    const text = $(el).text().trim();
    if (!$(el).attr('id')) $(el).attr('id', slugifyHeading(text));
  });
  return $.html();
}

// ─── buildToc ───────────────────────────────────────────────────────────────────
// Builds the "Auf dieser Seite" TOC box from an array of h2 texts.
// Returns '' for fewer than two headings (matches old build-docs.js behavior).
// @param {string[]} headings
// @returns {string}
export function buildToc(headings) {
  if (headings.length < 2) return '';
  const items = headings.map((h, i) => {
    const id = slugifyHeading(h);
    return `<li class="toc-item"><a href="#${id}"><span class="toc-num">${i + 1}.</span> ${escapeHtml(h)}</a></li>`;
  }).join('\n');
  return `<div class="toc-box auto-toc">
  <div class="toc-title">Auf dieser Seite</div>
  <ul class="toc-list">${items}</ul>
</div>`;
}

// ─── injectCopyButtons ──────────────────────────────────────────────────────────
// Wraps each real pre/code in a .code-wrapper and appends a Copy button.
// Skips diagram fallbacks (pre.mermaid-fallback / pre.dot-fallback).
// @param {string} html
// @returns {string}
export function injectCopyButtons(html) {
  const $ = cheerio.load(html, { xmlMode: false });
  $('pre code').each((_, el) => {
    const $pre = $(el).parent();
    if ($pre.hasClass('mermaid-fallback') || $pre.hasClass('dot-fallback')) return;
    $pre.wrap('<div class="code-wrapper"></div>');
    $pre.after('<button class="copy-btn" aria-label="Copy code">Copy</button>');
  });
  return $.html();
}

// ─── rewriteCrossLinks ──────────────────────────────────────────────────────────
// Conservative cross-linking against the registry:
//   (a) explicit [[name]] wiki-links  → resolve via registry.resolve(name)
//   (b) relative markdown links ending in .md → resolve the basename slug
// Resolved links become <a href="./<outRelPath>">label</a>; unresolved refs
// render as plain text and are collected into `unresolved`.
//
// @param {string} html
// @param {{registry: {resolve:(n:string)=>any, outPathFor:(p:any)=>string}, page: {slug:string}}} ctx
// @returns {{ html: string, unresolved: Array<{ref:string}> }}
export function rewriteCrossLinks(html, { registry, page }) {
  const unresolved = [];

  // (a) [[name]] wiki-links — operate on the raw HTML string. marked leaves the
  // literal "[[name]]" untouched (it's not markdown link syntax), so the brackets
  // survive into the parsed HTML.
  let out = html.replace(/\[\[([^\]]+)\]\]/g, (_match, rawName) => {
    const name = rawName.trim();
    const target = registry.resolve(name);
    if (target) {
      const href = './' + registry.outPathFor(target);
      return `<a href="${escapeAttr(href)}" class="xref">${escapeHtml(name)}</a>`;
    }
    unresolved.push({ ref: name });
    return escapeHtml(name);
  });

  // (b) relative markdown links: rewrite <a href="…/Foo.md"> to the resolved page.
  // Skip absolute/anchor/external/already-html hrefs.
  const $ = cheerio.load(out, { xmlMode: false });
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (!href.toLowerCase().endsWith('.md')) return;
    if (/^(https?:|\/\/|#|mailto:)/i.test(href)) return;
    // basename without extension → candidate slug (kebab-case, lowercased)
    const base = href.split(/[\\/]/).pop().replace(/\.md$/i, '');
    const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const target = registry.resolve(slug);
    if (target) {
      $(el).attr('href', './' + registry.outPathFor(target));
      $(el).addClass('xref');
    } else {
      unresolved.push({ ref: href });
    }
  });

  return { html: $.html(), unresolved };
}

// ─── renderMarkdown ─────────────────────────────────────────────────────────────
// Full per-page render. See module header for the pipeline order.
// @param {string} markdown
// @param {{registry: object, page: {slug:string}, mmdc?:string, dot?:string}} ctx
// @returns {RenderResult}
export function renderMarkdown(markdown, { registry, page, mmdc, dot } = {}) {
  let html = marked.parse(markdown);

  const xref = rewriteCrossLinks(html, { registry, page });
  html = xref.html;

  const diagrams = renderDiagrams(html, { mmdc, dot });
  html = diagrams.html;

  html = addHeadingIds(html);

  // Collect h2 texts (post-id) for the TOC and the return value.
  const $ = cheerio.load(html, { xmlMode: false });
  const headings = $('h2').map((_, el) => $(el).text().trim()).get();

  html = injectCopyButtons(html);

  // Inject TOC after the first h1 (or at the top if no h1) when >= 2 h2 headings.
  const toc = buildToc(headings);
  if (toc) {
    const $$ = cheerio.load(html, { xmlMode: false });
    const h1 = $$('h1').first();
    if (h1.length) h1.after(toc);
    else $$('body').prepend(toc);
    html = $$.html();
  }

  return {
    html,
    headings,
    unresolved: xref.unresolved,
    diagramFallbacks: diagrams.fallbacks,
  };
}

// ─── helpers ────────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
```

- [ ] **Step 4: Run the test — expect PASS.**

```bash
cd /tmp/wt-docs-html-generator && node --test scripts/docs-gen/render-markdown.test.mjs
```

Expected PASS output (8 tests, mmdc/dot absent so all diagrams fall back):

```
✔ renderDiagrams: mermaid block falls back to a styled code block when mmdc is absent
✔ renderDiagrams: dot block falls back to a styled code block when dot is absent
✔ addHeadingIds: gives an h2 a slug id with German umlaut handling
✔ buildToc: renders a toc-box from a headings array of length >= 2
✔ injectCopyButtons: adds a copy button to a pre/code, skips diagram fallbacks
✔ rewriteCrossLinks: [[known]] -> anchor to outRelPath, [[missing]] -> plain text + reported
✔ rewriteCrossLinks: relative .md link resolves to the target outRelPath
✔ renderMarkdown: end to end returns html, headings, unresolved, diagramFallbacks
# tests 8
# pass 8
# fail 0
```

If `cheerio` HTML-escapes the `&` inside `flowchart LR\n  A--&gt;B` differently than expected, the mermaid-fallback test only asserts the class is present (not exact source bytes), so it stays green regardless. The dot test asserts `digraph G` survives, which `escapeHtml` preserves (no special chars in that substring).

- [ ] **Step 5: Commit.**

```bash
cd /tmp/wt-docs-html-generator && git add scripts/docs-gen/render-markdown.mjs scripts/docs-gen/render-markdown.test.mjs && git commit -m "$(cat <<'EOF'
feat(docs-gen): render-markdown module — marked + mermaid/dot diagrams + cross-links

Add scripts/docs-gen/render-markdown.mjs exporting renderMarkdown plus the
helpers renderDiagrams, addHeadingIds, buildToc, injectCopyButtons, and
rewriteCrossLinks. Lifts the temp-file execFileSync mermaid approach and the
German-umlaut slugifyHeading behavior from the old build-docs.js, adds a
Graphviz/dot path (dot -Tsvg) with the same styled-code-block fallback, and
resolves [[name]] wiki-links and relative .md links against the registry,
reporting unresolved refs and counting diagram fallbacks.

Tests cover mermaid+dot fallback when the binary is absent, umlaut heading ids,
TOC threshold, copy-button injection (skipping diagram fallbacks), and
cross-link resolve/report.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Notes for the executing agent / downstream tasks:**
- New CSS classes introduced here that Task 6 (`theme.mjs`) must style: `pre.dot-fallback` (mirror the existing `.mermaid-fallback` muted/dim style) and `a.xref` (the "designed pill cross-link" from the editorial look). The `.mermaid-svg-wrapper`, `.mermaid-zoom-hint`, `.code-wrapper`, `.copy-btn`, `.toc-box`/`.toc-*` classes already exist in the old `getPageCss()` and are carried into `editorialCss()`.
- `renderMarkdown` consumes `registry.outPathFor`. Task 3's `registry.mjs` exposes `outPathFor` as a module-level export, not on the registry object — so the entry (`build-docs.mjs`) / Task 5 must pass `{ resolve: registry.resolve, outPathFor }` (or `{ ...registry, outPathFor }`) as the `registry` field. The tests in this task use a stub that bundles both, documenting the exact shape `rewriteCrossLinks` depends on.
- This module never throws on missing binaries: a missing `mmdc` is guarded by `existsSync`; a missing `dot` (off PATH) throws `ENOENT` inside `execFileSync`, which is caught and routed to the fallback. Both increment `diagramFallbacks` for the build report.

---

### Task 5: theme.mjs — editorial CSS + composable client JS

**Files:**
- Create: `/tmp/wt-docs-html-generator/scripts/docs-gen/theme.mjs`
- Test: `/tmp/wt-docs-html-generator/scripts/docs-gen/theme.test.mjs`

- [ ] **Step 1: Write the failing test for `theme.mjs`.**
  Create `/tmp/wt-docs-html-generator/scripts/docs-gen/theme.test.mjs` with the full contents below. It asserts `editorialCss()` is a non-empty string containing the contract class hooks (`.provenance-badge`, `.xref`, `.section-card`), that `clientJs()` parses as valid JS via `new Function(...)` inside `assert.doesNotThrow`, and that it contains `search.json` plus a copy-button handler. It also asserts the composable pieces are exported so Plan 2 can append a graph piece cleanly.

```javascript
// scripts/docs-gen/theme.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  editorialCss,
  clientJs,
  SUBST_JS,
  COPY_JS,
  DIAGRAM_JS,
  SEARCH_JS,
} from './theme.mjs';

test('editorialCss: returns a non-empty string', () => {
  const css = editorialCss();
  assert.equal(typeof css, 'string');
  assert.ok(css.length > 0, 'css must not be empty');
});

test('editorialCss: contains the contract class hooks', () => {
  const css = editorialCss();
  assert.ok(css.includes('.provenance-badge'), 'must style .provenance-badge');
  assert.ok(css.includes('.xref'), 'must style .xref cross-link pills');
  assert.ok(css.includes('.section-card'), 'must style .section-card grid items');
});

test('editorialCss: styles repo vs plugin provenance variants', () => {
  const css = editorialCss();
  assert.ok(css.includes('.provenance-badge.repo'), 'repo variant');
  assert.ok(css.includes('.provenance-badge.plugin'), 'plugin variant');
});

test('editorialCss: is a light editorial theme with Inter + Merriweather', () => {
  const css = editorialCss();
  assert.ok(css.includes('Inter'), 'uses Inter sans stack');
  assert.ok(css.includes('Merriweather'), 'uses Merriweather serif stack');
  assert.ok(css.includes('.diagram-svg-wrapper'), 'styles diagram wrapper');
  assert.ok(css.includes('.diagram-fallback'), 'styles diagram fallback');
  assert.ok(css.includes('.toc-box'), 'styles toc box');
  assert.ok(css.includes('#search-overlay'), 'styles search overlay');
});

test('clientJs: returns a string that parses as valid JavaScript', () => {
  const js = clientJs();
  assert.equal(typeof js, 'string');
  assert.ok(js.length > 0, 'js must not be empty');
  assert.doesNotThrow(() => new Function(js), 'clientJs must be syntactically valid JS');
});

test('clientJs: wires search.json and a copy-button handler', () => {
  const js = clientJs();
  assert.ok(js.includes('search.json'), 'fetches ./search.json');
  assert.ok(js.includes('.copy-btn'), 'attaches a copy-button handler');
  assert.ok(js.includes('clipboard'), 'copies to clipboard');
});

test('clientJs: composes the exported named pieces', () => {
  const js = clientJs();
  for (const piece of [SUBST_JS, COPY_JS, DIAGRAM_JS, SEARCH_JS]) {
    assert.equal(typeof piece, 'string');
    assert.ok(piece.length > 0, 'each piece must be a non-empty string');
    assert.ok(js.includes(piece), 'clientJs must include each named piece verbatim');
  }
});
```

- [ ] **Step 2: Run the test and confirm it FAILS (module does not exist yet).**

```bash
cd /tmp/wt-docs-html-generator && node --test scripts/docs-gen/theme.test.mjs
```

  Expected FAIL: the run aborts before any test passes with a module-resolution error, e.g.
  `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/tmp/wt-docs-html-generator/scripts/docs-gen/theme.mjs'`
  and the summary shows `# fail` non-zero (`# tests 0` / load error).

- [ ] **Step 3: Implement `theme.mjs` — the light editorial CSS.**
  Create `/tmp/wt-docs-html-generator/scripts/docs-gen/theme.mjs` with the contents below (CSS half first, JS half added in Step 4 within the same file — write the whole file now). The palette is a clean light editorial theme (ink-on-paper, slate accent), NOT the old dark/gold theme. It defines: page shell + header (title/description), `.provenance-badge` with `.repo`/`.plugin` variants, `.domain-tag`, `.breadcrumbs`, body type, code blocks + `.copy-btn`, `.toc-box`, designed `.xref` cross-link pills, the `.section-grid`/`.section-card` card grid, `.diagram-svg-wrapper` (with zoom hint) + `.diagram-fallback`, the Ctrl/Cmd-K `#search-overlay`, and a `.related-footer` related-links footer.

```javascript
// scripts/docs-gen/theme.mjs
// Editorial theme: light, generous whitespace, strong type hierarchy,
// designed pill cross-links. Inter (sans) + Merriweather (serif) — both
// already bundled by the website. Used by templates.mjs (renderPage) and
// written to OUT_DIR/style.css + OUT_DIR/app.js by the build entry.

/**
 * Full editorial stylesheet for every generated page.
 * @returns {string} CSS source
 */
export function editorialCss() {
  return `
:root {
  --paper:#ffffff;--paper-2:#f7f8fa;--paper-3:#eef1f5;
  --ink:#1b2330;--ink-soft:#3a4658;--ink-mute:#697587;
  --line:#dfe4ea;--line-soft:#eaedf2;
  --accent:#2f6db5;--accent-soft:#5a8fcc;--accent-bg:rgba(47,109,181,0.08);
  --accent-line:rgba(47,109,181,0.25);
  --repo-bg:#e6f4ea;--repo-fg:#1f7a44;--repo-line:#bfe3cc;
  --plugin-bg:#f0ecfb;--plugin-fg:#6741b8;--plugin-line:#ddd2f3;
  --warn-bg:#fdf3e7;--warn-fg:#a8651c;--warn-line:#f0dcc0;
  --code-bg:#f4f6f9;--code-ink:#243044;
  --font-sans:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;
  --font-serif:'Merriweather',Georgia,'Times New Roman',serif;
  --maxw:760px;
}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper-2);color:var(--ink);
  font-family:var(--font-sans);font-size:17px;line-height:1.7;
  -webkit-font-smoothing:antialiased}
.page{max-width:var(--maxw);margin:0 auto;padding:2.5rem 1.5rem 5rem;
  background:var(--paper)}
@media(min-width:820px){.page{margin:2rem auto;border:1px solid var(--line);
  border-radius:12px;box-shadow:0 1px 3px rgba(27,35,48,0.05);padding:3rem 3.25rem 5rem}}

/* ── breadcrumbs ── */
.breadcrumbs{font-size:.8rem;color:var(--ink-mute);margin:0 0 1.4rem;
  display:flex;flex-wrap:wrap;align-items:center;gap:.4rem}
.breadcrumbs a{color:var(--ink-mute);text-decoration:none}
.breadcrumbs a:hover{color:var(--accent)}
.breadcrumbs .sep{color:var(--line)}

/* ── page header ── */
.page-header{margin:0 0 2.2rem;padding-bottom:1.4rem;border-bottom:1px solid var(--line)}
.page-header h1{font-family:var(--font-serif);font-weight:900;font-size:2.1rem;
  line-height:1.2;color:var(--ink);margin:.2rem 0 .6rem;letter-spacing:-0.01em}
.page-desc{font-size:1.05rem;line-height:1.6;color:var(--ink-soft);margin:.4rem 0 0;
  max-width:62ch}
.page-meta{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;margin:1rem 0 0}

/* ── provenance badges ── */
.provenance-badge{display:inline-flex;align-items:center;gap:.35em;
  font-size:.72rem;font-weight:700;letter-spacing:.03em;text-transform:uppercase;
  border-radius:999px;padding:.22em .7em;border:1px solid transparent;font-family:var(--font-sans)}
.provenance-badge.repo{background:var(--repo-bg);color:var(--repo-fg);border-color:var(--repo-line)}
.provenance-badge.plugin{background:var(--plugin-bg);color:var(--plugin-fg);border-color:var(--plugin-line)}
.provenance-badge .pv-ver{font-weight:500;text-transform:none;opacity:.85;letter-spacing:0}

/* ── domain tag ── */
.domain-tag{display:inline-block;font-size:.72rem;font-weight:700;letter-spacing:.06em;
  text-transform:uppercase;color:var(--accent);background:var(--accent-bg);
  border:1px solid var(--accent-line);border-radius:999px;padding:.2em .7em}

/* ── body type ── */
.content{font-size:1.02rem}
.content h2{font-family:var(--font-serif);font-weight:700;font-size:1.5rem;color:var(--ink);
  margin:2.6rem 0 .8rem;padding-bottom:.3rem;border-bottom:1px solid var(--line-soft);
  scroll-margin-top:1.5rem}
.content h3{font-family:var(--font-sans);font-weight:700;font-size:1.18rem;color:var(--ink);
  margin:1.9rem 0 .5rem}
.content h4{font-family:var(--font-sans);font-weight:600;font-size:1.02rem;color:var(--ink-soft);
  margin:1.4rem 0 .4rem}
.content p{margin:.8rem 0 1.1rem;color:var(--ink-soft)}
.content strong{color:var(--ink);font-weight:600}
.content a{color:var(--accent);text-decoration:none;border-bottom:1px solid var(--accent-line)}
.content a:hover{color:var(--accent-soft);border-bottom-color:var(--accent-soft)}
.content ul,.content ol{padding-left:1.4rem;margin:.6rem 0 1.2rem;color:var(--ink-soft)}
.content li{margin-bottom:.4rem}
.content blockquote{border-left:3px solid var(--accent-line);background:var(--accent-bg);
  color:var(--ink-soft);padding:.7em 1.1em;border-radius:0 6px 6px 0;margin:1.2rem 0}
.content blockquote p{margin:0}
.content hr{border:none;border-top:1px solid var(--line);margin:2.4rem 0}
.content img{max-width:100%;height:auto;border-radius:6px}
.content table{border-collapse:collapse;width:100%;margin:1.2rem 0;font-size:.92rem}
.content thead th{text-align:left;font-size:.7rem;font-weight:700;letter-spacing:.05em;
  text-transform:uppercase;color:var(--ink-mute);background:var(--paper-3);
  border:1px solid var(--line);padding:.55em .85em}
.content tbody td{border:1px solid var(--line);padding:.5em .85em;color:var(--ink-soft);
  vertical-align:top}
.content tbody tr:nth-child(even){background:var(--paper-2)}

/* ── code blocks + copy ── */
.content code{background:var(--code-bg);color:var(--code-ink);border:1px solid var(--line);
  border-radius:4px;padding:.12em .4em;font-size:.86em;
  font-family:'SFMono-Regular',ui-monospace,'Cascadia Code',Consolas,monospace}
.content pre{background:var(--code-bg);border:1px solid var(--line);border-radius:8px;
  padding:1em 1.1em;overflow-x:auto;margin:1.2rem 0}
.content pre code{background:transparent;border:none;padding:0;color:var(--code-ink);font-size:.85em}
.code-wrapper{position:relative}
.copy-btn{position:absolute;top:8px;right:8px;background:var(--paper);
  border:1px solid var(--line);border-radius:5px;padding:3px 10px;font-size:.72rem;
  font-weight:600;color:var(--ink-mute);cursor:pointer;transition:all .15s}
.copy-btn:hover{color:var(--accent);border-color:var(--accent-line)}

/* ── table of contents ── */
.toc-box{background:var(--paper-2);border:1px solid var(--line);border-radius:8px;
  padding:1.1em 1.4em;margin:1.8rem 0 2.2rem}
.toc-title{font-size:.7rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
  color:var(--ink-mute);margin:0 0 .7em}
.toc-list{list-style:none;padding:0;margin:0;
  display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:.25em 1.4em}
.toc-item a{color:var(--ink-soft);text-decoration:none;font-size:.88rem;border:none;
  display:flex;align-items:baseline;gap:.45em}
.toc-item a:hover{color:var(--accent)}
.toc-num{color:var(--accent);font-size:.75rem;font-weight:700;min-width:1.4em}

/* ── designed cross-link pills ── */
.xref{display:inline-flex;align-items:center;gap:.3em;font-size:.92em;font-weight:600;
  color:var(--accent);background:var(--accent-bg);border:1px solid var(--accent-line);
  border-radius:999px;padding:.05em .65em;text-decoration:none;line-height:1.5;
  transition:all .15s}
.xref::before{content:"\\2192";font-weight:700;opacity:.7}
.xref:hover{background:var(--accent);color:#fff;border-color:var(--accent)}
.xref.unresolved{color:var(--ink-mute);background:var(--paper-3);border-color:var(--line);
  border-style:dashed;cursor:default}
.xref.unresolved::before{content:"?"}

/* ── section index card grid ── */
.section-intro{color:var(--ink-soft);margin:.4rem 0 2rem;max-width:62ch}
.section-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));
  gap:1.1rem;margin:1.5rem 0}
.section-card{display:flex;flex-direction:column;gap:.5rem;background:var(--paper);
  border:1px solid var(--line);border-radius:10px;padding:1.2rem 1.3rem;
  text-decoration:none;color:inherit;transition:border-color .15s,transform .15s,box-shadow .15s}
.section-card:hover{border-color:var(--accent-line);transform:translateY(-2px);
  box-shadow:0 4px 14px rgba(27,35,48,0.08)}
.section-card-head{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem}
.section-card-title{font-family:var(--font-serif);font-weight:700;font-size:1.08rem;color:var(--ink)}
.section-card-desc{font-size:.88rem;color:var(--ink-mute);line-height:1.55;
  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}

/* ── diagrams ── */
.diagram-svg-wrapper{position:relative;border:1px solid var(--line);border-radius:8px;
  margin:1.4rem 0;background:var(--paper-2);overflow:hidden}
.diagram-svg-wrapper svg{display:block;width:100%;height:auto;cursor:grab;
  transform-origin:0 0}
.diagram-svg-wrapper svg:active{cursor:grabbing}
.diagram-zoom-hint{position:absolute;bottom:6px;right:8px;font-size:11px;
  color:var(--ink-mute);background:rgba(255,255,255,.75);border-radius:4px;
  padding:1px 6px;pointer-events:none}
.diagram-fallback{position:relative;border:1px dashed var(--warn-line) !important;
  background:var(--warn-bg) !important}
.diagram-fallback::before{content:"Diagramm-Renderer fehlt — Quelltext";
  display:block;font-size:.7rem;font-weight:700;letter-spacing:.05em;
  text-transform:uppercase;color:var(--warn-fg);margin:0 0 .6em}

/* ── Ctrl/Cmd-K search overlay ── */
#search-overlay{display:none;position:fixed;inset:0;background:rgba(27,35,48,.45);
  z-index:1000;align-items:flex-start;justify-content:center;padding-top:12vh}
#search-overlay.active{display:flex}
#search-box{background:var(--paper);border:1px solid var(--line);border-radius:12px;
  width:min(600px,92vw);max-height:70vh;display:flex;flex-direction:column;
  overflow:hidden;box-shadow:0 16px 48px rgba(27,35,48,.25)}
#search-input{background:transparent;border:none;border-bottom:1px solid var(--line);
  color:var(--ink);font-size:1.05rem;padding:1em 1.2em;outline:none;font-family:var(--font-sans)}
#search-input::placeholder{color:var(--ink-mute)}
#search-results{overflow-y:auto;padding:.4em 0}
.search-result-item{display:block;padding:.65em 1.2em;text-decoration:none;
  border-bottom:1px solid var(--line-soft);transition:background .1s}
.search-result-item:last-child{border-bottom:none}
.search-result-item:hover{background:var(--accent-bg)}
.search-result-title{display:block;color:var(--accent);font-size:.95rem;font-weight:600}
.search-result-excerpt{display:block;color:var(--ink-mute);font-size:.82rem;margin-top:.15em}
.search-no-results{color:var(--ink-mute);text-align:center;padding:1.6em;font-size:.92rem}
.search-trigger{display:inline-flex;align-items:center;gap:.5em;background:var(--paper-2);
  border:1px solid var(--line);border-radius:8px;color:var(--ink-mute);
  padding:.4em .8em;cursor:pointer;font-size:.85rem;font-family:var(--font-sans)}
.search-trigger kbd{font-size:.72rem;background:var(--paper);border:1px solid var(--line);
  border-radius:4px;padding:1px 6px;color:var(--ink-mute)}

/* ── related links footer ── */
.related-footer{margin-top:3rem;padding-top:1.6rem;border-top:1px solid var(--line)}
.related-title{font-size:.72rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
  color:var(--ink-mute);margin:0 0 .9em}
.related-list{display:flex;flex-wrap:wrap;gap:.6rem;list-style:none;padding:0;margin:0}
`;
}
```

- [ ] **Step 4: Append the composable client JS to `theme.mjs`.**
  Add the four named const string pieces (`SUBST_JS`, `COPY_JS`, `DIAGRAM_JS`, `SEARCH_JS`) and the `clientJs()` composer to the same file. These reproduce the runtime behaviors from the old `getPageJs` verbatim: `{DOMAIN}`/`{PROTO}` substitution, copy buttons, diagram pan+zoom (targeting `.diagram-svg-wrapper svg`), and the Ctrl/Cmd-K search overlay (fetch `./search.json`). Each piece is a self-contained IIFE so they can be concatenated in any order and Plan 2's `graphJs()` appends cleanly. Insert this block at the end of `theme.mjs` (after the `editorialCss` function).

```javascript

// ───────────────────────────────────────────────────────────────────────────
// Composable client JS pieces. Each is a self-contained IIFE so they can be
// concatenated in any order; Plan 2 appends graphJs() the same way.
// ───────────────────────────────────────────────────────────────────────────

/** {DOMAIN}/{PROTO} runtime text + href substitution. */
export const SUBST_JS = `
(function(){
  var host=window.location.hostname;
  var domain=host.replace(/^docs\\./,'')||host;
  var proto=window.location.protocol.replace(':','');
  var walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,null);
  var node;
  while((node=walker.nextNode())){
    var v=node.nodeValue;
    if(v.indexOf('{DOMAIN}')>-1||v.indexOf('{PROTO}')>-1){
      node.nodeValue=v.replace(/\\{DOMAIN\\}/g,domain).replace(/\\{PROTO\\}/g,proto);
    }
  }
  document.querySelectorAll('a[href]').forEach(function(a){
    var h=a.getAttribute('href')||'';
    if(h.indexOf('{DOMAIN}')>-1||h.indexOf('{PROTO}')>-1){
      a.setAttribute('href',h.replace(/\\{DOMAIN\\}/g,domain).replace(/\\{PROTO\\}/g,proto));
    }
  });
})();`;

/** Copy-to-clipboard buttons inside .code-wrapper. */
export const COPY_JS = `
(function(){
  document.querySelectorAll('.copy-btn').forEach(function(btn){
    btn.addEventListener('click',function(){
      var pre=btn.previousElementSibling;
      navigator.clipboard.writeText(pre?pre.textContent:'').then(function(){
        var prev=btn.textContent;
        btn.textContent='\\u2713';
        setTimeout(function(){btn.textContent=prev||'Copy';},1500);
      });
    });
  });
})();`;

/** Pan + zoom for rendered diagram SVGs. */
export const DIAGRAM_JS = `
(function(){
  document.querySelectorAll('.diagram-svg-wrapper svg').forEach(function(svg){
    var dx=0,dy=0,scale=1,dragging=false,ox=0,oy=0;
    function upd(){svg.style.transform='translate('+dx+'px,'+dy+'px) scale('+scale+')';}
    svg.style.transformOrigin='0 0';
    svg.addEventListener('wheel',function(e){
      e.preventDefault();
      scale=Math.min(10,Math.max(0.3,scale*(e.deltaY>0?0.9:1.1)));upd();
    },{passive:false});
    svg.addEventListener('pointerdown',function(e){
      dragging=true;ox=e.clientX-dx;oy=e.clientY-dy;
      svg.style.cursor='grabbing';svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener('pointermove',function(e){
      if(!dragging)return;dx=e.clientX-ox;dy=e.clientY-oy;upd();
    });
    svg.addEventListener('pointerup',function(){dragging=false;svg.style.cursor='grab';});
  });
})();`;

/** Ctrl/Cmd-K search overlay backed by ./search.json. */
export const SEARCH_JS = `
(function(){
  var PAGE_INDEX=[];
  fetch('./search.json').then(function(r){return r.json()}).then(function(j){PAGE_INDEX=j}).catch(function(){});
  var overlay=document.getElementById('search-overlay');
  var inp=document.getElementById('search-input');
  var resultsEl=document.getElementById('search-results');
  if(!overlay||!inp||!resultsEl)return;
  function open(){overlay.classList.add('active');inp.value='';inp.focus();renderResults('');}
  function close(){overlay.classList.remove('active');}
  document.addEventListener('keydown',function(e){
    if((e.ctrlKey||e.metaKey)&&(e.key==='k'||e.key==='K')){e.preventDefault();open();}
    if(e.key==='Escape')close();
  });
  overlay.addEventListener('click',function(e){if(e.target===overlay)close();});
  inp.addEventListener('input',function(){renderResults(inp.value.trim().toLowerCase());});
  document.querySelectorAll('.search-trigger').forEach(function(b){
    b.addEventListener('click',open);
  });
  function renderResults(q){
    while(resultsEl.firstChild)resultsEl.removeChild(resultsEl.firstChild);
    var hits=q?PAGE_INDEX.filter(function(p){
      return (p.title||'').toLowerCase().indexOf(q)>-1||(p.excerpt||'').toLowerCase().indexOf(q)>-1;
    }):PAGE_INDEX.slice(0,12);
    if(!hits.length){
      var none=document.createElement('p');
      none.className='search-no-results';
      none.textContent='Kein Ergebnis';
      resultsEl.appendChild(none);
      return;
    }
    hits.forEach(function(p){
      var a=document.createElement('a');
      a.href='./'+p.slug+'.html';
      a.className='search-result-item';
      a.addEventListener('click',close);
      var t=document.createElement('span');t.className='search-result-title';
      t.textContent=p.title;
      var ex=document.createElement('span');ex.className='search-result-excerpt';
      ex.textContent=p.excerpt||'';
      a.appendChild(t);a.appendChild(ex);
      resultsEl.appendChild(a);
    });
  }
})();`;

/**
 * Compose the full client script from the named pieces. Plan 2 extends this by
 * appending graphJs() to the join list.
 * @returns {string} client JS source
 */
export function clientJs() {
  return [SUBST_JS, COPY_JS, DIAGRAM_JS, SEARCH_JS].join('\n');
}
```

- [ ] **Step 5: Run the test and confirm it PASSES.**

```bash
cd /tmp/wt-docs-html-generator && node --test scripts/docs-gen/theme.test.mjs
```

  Expected PASS: all 7 tests green, e.g.
  `# tests 7` / `# pass 7` / `# fail 0`. In particular `clientJs: returns a string that parses as valid JavaScript` passes (the `new Function(clientJs())` call does not throw) and `clientJs: composes the exported named pieces` passes (each `SUBST_JS`/`COPY_JS`/`DIAGRAM_JS`/`SEARCH_JS` substring is found verbatim in the composed output).

- [ ] **Step 6: Commit.**

```bash
cd /tmp/wt-docs-html-generator && git add scripts/docs-gen/theme.mjs scripts/docs-gen/theme.test.mjs && git commit -m "feat(docs-gen): add theme.mjs editorial CSS + composable client JS

Light editorial theme (Inter + Merriweather) replacing the old dark/gold
look: page shell, provenance badges (repo/plugin variants), domain tag,
breadcrumbs, code blocks + copy button, TOC, designed .xref cross-link
pills, .section-grid card grid, diagram wrapper + missing-renderer
fallback, Ctrl/Cmd-K search overlay, related-links footer.

clientJs() is composed from exported named pieces (SUBST_JS, COPY_JS,
DIAGRAM_JS, SEARCH_JS) so Plan 2 can append graphJs() cleanly. Behaviors
lifted verbatim from the old getPageJs: {DOMAIN}/{PROTO} substitution,
copy buttons, diagram pan+zoom, search overlay backed by ./search.json.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

Notes for the implementer / reviewer:
- `theme.test.mjs` deliberately drops the stale `id="search-overlay"`/`class="active"` assertions that the old `build-docs.test.js` `wrapPage` test made against markup the old code never emitted. Here the `active` class IS the overlay-open mechanism (`#search-overlay.active{display:flex}` in CSS + `overlay.classList.add('active')` in `SEARCH_JS`), and the `#search-overlay` element itself is emitted by `templates.mjs` (Task in the templates module), not by `theme.mjs` — so `theme.mjs` only styles/scripts it.
- The pan/zoom piece targets `.diagram-svg-wrapper svg` (the new wrapper class from `render-markdown.mjs` `renderDiagrams`), not the old `.mermaid-svg-wrapper`; the matching `.diagram-svg-wrapper` + `.diagram-zoom-hint` + `.diagram-fallback` CSS is in `editorialCss()`.
- The `new Function(clientJs())` validity check is why each piece is a closed IIFE with no shared top-level identifiers — concatenation can never produce a duplicate-`const`/redeclaration syntax error as more pieces (e.g. Plan 2's `graphJs()`) are appended.

---

### Task 6: templates.mjs — editorial page shell, provenance badge, section indexes, Plan-1 landing

**Files:**
- Create: `scripts/docs-gen/templates.mjs`
- Test: `scripts/docs-gen/templates.test.mjs`
- Modify: none

- [ ] **Step 1: Write the failing test file `scripts/docs-gen/templates.test.mjs`.**

  This is the full test code. It covers all four exports, including the multi-line-description regression (assert the LAST sentence of an agent-style description survives the template layer) and the provenance-badge `5.1.0` substring check.

  ```javascript
  // scripts/docs-gen/templates.test.mjs
  import { test } from 'node:test';
  import assert from 'node:assert/strict';
  import {
    renderPage,
    provenanceBadge,
    renderSectionIndex,
    renderLanding,
  } from './templates.mjs';

  // A long multi-line description like the agent `description: >` block scalars.
  // The FIRST and LAST sentences must both survive to prove no truncation at the
  // template layer (the gray-matter parser already fixed the discover/parse layer).
  const FULL_DESC =
    'Use this agent for website work in website/src. ' +
    'It owns Astro and Svelte components, the Kore brand design system, and CSS. ' +
    'It is the final authority on the editorial reading experience.';

  const agentPage = {
    slug: 'bachelorprojekt-website',
    type: 'agent',
    provenance: 'repo',
    name: 'bachelorprojekt-website',
    title: 'bachelorprojekt-website',
    description: FULL_DESC,
    domain: 'website',
    bodyMarkdown: '',
    sourcePath: '/abs/.claude/agents/bachelorprojekt-website.md',
    outRelPath: 'agents/bachelorprojekt-website.html',
  };

  const docPage = {
    slug: 'architecture',
    type: 'doc',
    provenance: 'repo',
    name: 'architecture',
    title: 'Architecture',
    description: 'How the workspace services fit together.',
    domain: 'infra',
    bodyMarkdown: '',
    sourcePath: '/abs/docs/architecture.md',
    outRelPath: 'architecture.html',
  };

  const pluginSkillPage = {
    slug: 'brainstorming',
    type: 'skill',
    provenance: 'superpowers@5.1.0',
    name: 'brainstorming',
    title: 'Brainstorming',
    description: 'Explore intent before building.',
    domain: 'general',
    bodyMarkdown: '',
    sourcePath: '/abs/plugins/cache/x/superpowers/5.1.0/skills/brainstorming/SKILL.md',
    outRelPath: 'skills/superpowers--brainstorming.html',
  };

  test('renderPage: emits a full HTML5 document', () => {
    const html = renderPage({
      page: docPage,
      contentHtml: '<h1>Architecture</h1><p>body</p>',
      toc: '',
      related: [],
    });
    assert.ok(html.startsWith('<!DOCTYPE html>'), 'starts with doctype');
    assert.ok(html.includes('<link rel="stylesheet" href="./style.css">'), 'links stylesheet');
    assert.ok(html.includes('<script src="./app.js"></script>'), 'links client js');
    assert.ok(html.includes('<title>Architecture'), 'title in <title>');
    assert.ok(html.includes('<h1>Architecture</h1>'), 'content passed through');
  });

  test('renderPage: includes the page title and the FULL multi-line description (no truncation)', () => {
    const html = renderPage({
      page: agentPage,
      contentHtml: '<p>agent body</p>',
      toc: '',
      related: [],
    });
    assert.ok(html.includes('bachelorprojekt-website'), 'title rendered');
    // Regression: prove the LAST sentence of a long description survives the template.
    assert.ok(
      html.includes('final authority on the editorial reading experience'),
      'full description (last sentence) must not be truncated at the template layer',
    );
    // And the first sentence too.
    assert.ok(html.includes('Use this agent for website work'), 'first sentence present');
  });

  test('renderPage: header shows provenance badge, domain tag, and breadcrumbs', () => {
    const html = renderPage({
      page: agentPage,
      contentHtml: '<p>x</p>',
      toc: '',
      related: [],
    });
    assert.ok(html.includes('repo'), 'provenance badge text present');
    assert.ok(html.includes('website'), 'domain tag present');
    assert.ok(html.includes('href="./index.html"'), 'breadcrumb to landing');
    assert.ok(html.includes('href="./agents.html"'), 'breadcrumb to section index');
  });

  test('renderPage: appends a related-links footer when related is non-empty', () => {
    const html = renderPage({
      page: docPage,
      contentHtml: '<p>x</p>',
      toc: '',
      related: [
        { url: './keycloak.html', title: 'Keycloak' },
        { url: './architecture.html', title: 'Architecture' },
      ],
    });
    assert.ok(html.includes('class="related"'), 'related section rendered');
    assert.ok(html.includes('href="./keycloak.html"'), 'related link href');
    assert.ok(html.includes('>Keycloak<'), 'related link title');
  });

  test('renderPage: escapes HTML-special characters in title and description', () => {
    const html = renderPage({
      page: { ...docPage, title: 'A & B <x>', description: 'one "two" <three>' },
      contentHtml: '<p>x</p>',
      toc: '',
      related: [],
    });
    assert.ok(html.includes('A &amp; B &lt;x&gt;'), 'title escaped');
    assert.ok(html.includes('&lt;three&gt;'), 'description escaped');
  });

  test('provenanceBadge: repo vs plugin differ and plugin badge carries the version', () => {
    const repo = provenanceBadge('repo');
    const plugin = provenanceBadge('superpowers@5.1.0');
    assert.notEqual(repo, plugin, 'repo and plugin badges differ');
    assert.ok(repo.includes('repo'), 'repo badge says repo');
    assert.ok(plugin.includes('5.1.0'), 'plugin badge carries the version');
    assert.ok(plugin.includes('superpowers'), 'plugin badge carries the plugin name');
    assert.ok(plugin.includes('plugin'), 'plugin badge is labelled plugin');
  });

  test('renderSectionIndex: lists each provided page with badge + description', () => {
    const html = renderSectionIndex({
      type: 'agent',
      title: 'Agents',
      pages: [agentPage, { ...agentPage, slug: 'bachelorprojekt-ops', title: 'bachelorprojekt-ops', name: 'bachelorprojekt-ops', outRelPath: 'agents/bachelorprojekt-ops.html', domain: 'ops' }],
    });
    assert.ok(html.startsWith('<!DOCTYPE html>'), 'full document');
    assert.ok(html.includes('>Agents<') || html.includes('Agents'), 'section title present');
    assert.ok(html.includes('bachelorprojekt-website'), 'first page listed');
    assert.ok(html.includes('bachelorprojekt-ops'), 'second page listed');
    assert.ok(html.includes('href="./agents/bachelorprojekt-website.html"'), 'links via outRelPath');
    assert.ok(html.includes('Use this agent for website work'), 'description shown on card');
  });

  test('renderLanding: contains per-type section counts', () => {
    const registry = { bySlug: new Map(), resolve: () => null };
    const html = renderLanding({
      pages: [agentPage, docPage, pluginSkillPage],
      registry,
    });
    assert.ok(html.startsWith('<!DOCTYPE html>'), 'full document');
    // one skill, one agent, one doc in the fixture set
    assert.ok(/Skills[\s\S]*?1/.test(html), 'skills count rendered');
    assert.ok(/Agents[\s\S]*?1/.test(html), 'agents count rendered');
    assert.ok(/Docs[\s\S]*?1/.test(html), 'docs count rendered');
    // grouped cards link into the section index pages
    assert.ok(html.includes('href="./skills.html"'), 'links skills section');
    assert.ok(html.includes('href="./agents.html"'), 'links agents section');
    assert.ok(html.includes('href="./docs.html"'), 'links docs section');
  });
  ```

- [ ] **Step 2: Run the test and confirm it FAILS (module does not exist yet).**

  ```bash
  cd /tmp/wt-docs-html-generator && node --test scripts/docs-gen/templates.test.mjs
  ```

  Expected FAIL — the module file is missing, so Node throws before any test runs:

  ```
  Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/tmp/wt-docs-html-generator/scripts/docs-gen/templates.mjs' imported from /tmp/wt-docs-html-generator/scripts/docs-gen/templates.test.mjs
  ...
  # fail 1   (or: tests 0 / pass 0 with a loader error and non-zero exit)
  ```

- [ ] **Step 3: Create `scripts/docs-gen/templates.mjs` with the complete implementation.**

  This is the full module. `renderPage` emits a full HTML5 doc using the editorial shell classes that `theme.mjs#editorialCss()` styles (`page-hero`, `page-hero-title`, `page-hero-desc`, `page-hero-meta`, `page-hero-tag`, `page-hero-back`, `track-card` grid, `#search-overlay`). It links `./style.css` and `./app.js` (the static-web-server asset contract), renders the FULL description verbatim (only HTML-escaped, never sliced), shows the provenance badge + domain tag + breadcrumbs (section index → landing), passes `contentHtml` through unchanged (TOC + heading ids already injected by `render-markdown`), and appends a related-links footer from `related`. `SECTION_META` maps each page `type` to its section-index slug/label so breadcrumbs and landing groups stay consistent.

  ```javascript
  // scripts/docs-gen/templates.mjs
  // Editorial page shell, provenance badges, per-section index pages, and the
  // Plan-1 card-grid landing. Plan 2 OVERRIDES renderLanding to embed the graph.
  //
  // Output contract: every document links ./style.css (theme.mjs#editorialCss)
  // and ./app.js (theme.mjs#clientJs), and is self-contained for static serving
  // (joseluisq/static-web-server, read-only rootfs). Never SSR, never write fs.

  /**
   * @typedef {Object} Page
   * @property {string} slug
   * @property {'skill'|'agent'|'doc'} type
   * @property {string} provenance      'repo' | '<plugin>@<version>'
   * @property {string} name
   * @property {string} title
   * @property {string} description
   * @property {string|null} domain
   * @property {string} bodyMarkdown
   * @property {string} sourcePath
   * @property {string} outRelPath
   */

  /**
   * @typedef {Object} RelatedLink
   * @property {string} url
   * @property {string} title
   */

  // Per-type section metadata: the section-index page each type belongs to.
  // Order here is the canonical landing/breadcrumb order.
  const SECTION_META = [
    { type: 'skill', indexSlug: 'skills', label: 'Skills' },
    { type: 'agent', indexSlug: 'agents', label: 'Agents' },
    { type: 'doc', indexSlug: 'docs', label: 'Docs' },
  ];

  const SECTION_BY_TYPE = new Map(SECTION_META.map((s) => [s.type, s]));

  /** HTML-escape text destined for element bodies and attribute values. */
  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Provenance badge markup.
   * 'repo'              -> a "repo" badge.
   * '<plugin>@<ver>'    -> a "plugin · <plugin> <version>" badge.
   * @param {string} provenance
   * @returns {string}
   */
  export function provenanceBadge(provenance) {
    if (provenance === 'repo') {
      return '<span class="prov-badge prov-repo">repo</span>';
    }
    const at = String(provenance ?? '').lastIndexOf('@');
    const plugin = at > 0 ? provenance.slice(0, at) : String(provenance ?? '');
    const version = at > 0 ? provenance.slice(at + 1) : '';
    const versionPart = version ? ` <span class="prov-version">${esc(version)}</span>` : '';
    return (
      '<span class="prov-badge prov-plugin">plugin · ' +
      `<span class="prov-plugin-name">${esc(plugin)}</span>${versionPart}</span>`
    );
  }

  /** Domain pill (omitted when domain is null/empty). */
  function domainTag(domain) {
    if (!domain) return '';
    return `<span class="page-hero-tag domain-tag">${esc(domain)}</span>`;
  }

  /** The shared <head> + opening body, including the search overlay shell. */
  function documentHead(titleText) {
    return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(titleText)} — Workspace MVP</title>
<link rel="stylesheet" href="./style.css">
</head>
<body>
<div id="search-overlay">
  <div id="search-box">
    <input id="search-input" type="text" placeholder="Suchen… (Esc schließt)" autocomplete="off">
    <div id="search-results"></div>
  </div>
</div>`;
  }

  /** The shared closing markup (client JS). */
  function documentTail() {
    return `<script src="./app.js"></script>
</body>
</html>`;
  }

  /** Breadcrumb trail: landing → section index → current page. */
  function breadcrumbs(page) {
    const section = SECTION_BY_TYPE.get(page.type);
    const crumbs = [`<a href="./index.html">Übersicht</a>`];
    if (section) {
      crumbs.push(
        `<a href="./${section.indexSlug}.html">${esc(section.label)}</a>`,
      );
    }
    crumbs.push(`<span class="crumb-current">${esc(page.title)}</span>`);
    return `<nav class="breadcrumbs">${crumbs.join(' <span class="crumb-sep">/</span> ')}</nav>`;
  }

  /** Related-links footer; empty string when there are no related links. */
  function relatedFooter(related) {
    if (!Array.isArray(related) || related.length === 0) return '';
    const items = related
      .map(
        (r) =>
          `<li><a href="${esc(r.url)}">${esc(r.title)}</a></li>`,
      )
      .join('\n');
    return `<footer class="related">
  <div class="related-title">Verwandt</div>
  <ul class="related-list">
${items}
  </ul>
</footer>`;
  }

  /**
   * Full editorial document for a single page.
   * contentHtml already contains the TOC + heading ids (from render-markdown).
   * The FULL description is rendered (escaped only) — never truncated here.
   * @param {{ page: Page, contentHtml: string, toc?: string, related?: RelatedLink[] }} args
   * @returns {string}
   */
  export function renderPage({ page, contentHtml, toc, related }) {
    const header = `<header class="page-hero">
  <div class="page-hero-body">
    ${breadcrumbs(page)}
    <h1 class="page-hero-title">${esc(page.title)}</h1>
    <p class="page-hero-desc">${esc(page.description)}</p>
    <div class="page-hero-meta">
      ${provenanceBadge(page.provenance)}
      ${domainTag(page.domain)}
    </div>
  </div>
</header>`;

    return `${documentHead(page.title)}
<div id="app">
  <main id="main">
${header}
${toc ?? ''}
<article class="doc-body">
${contentHtml}
</article>
${relatedFooter(related)}
  </main>
</div>
${documentTail()}`;
  }

  /** A single card linking a page (its provenance badge + description). */
  function pageCard(page) {
    return `<a class="track-card" href="./${esc(page.outRelPath)}">
  <span class="lab">${esc(page.type)}</span>
  <span class="ti">${esc(page.title)}</span>
  <span class="de">${esc(page.description)}</span>
  <span class="card-meta">${provenanceBadge(page.provenance)}${domainTag(page.domain)}</span>
</a>`;
  }

  /**
   * A per-section index page (card grid of pages of one type).
   * @param {{ type: 'skill'|'agent'|'doc', title: string, pages: Page[] }} args
   * @returns {string}
   */
  export function renderSectionIndex({ type, title, pages }) {
    const cards = pages.map(pageCard).join('\n');
    const header = `<header class="page-hero">
  <div class="page-hero-body">
    <nav class="breadcrumbs"><a href="./index.html">Übersicht</a> <span class="crumb-sep">/</span> <span class="crumb-current">${esc(title)}</span></nav>
    <h1 class="page-hero-title">${esc(title)}</h1>
    <p class="page-hero-desc">${pages.length} ${esc(type)} pages</p>
  </div>
</header>`;

    return `${documentHead(title)}
<div id="app">
  <main id="main">
${header}
<section class="tracks">
${cards}
</section>
  </main>
</div>
${documentTail()}`;
  }

  /**
   * Plan-1 landing: an editorial card-grid hub grouped by type, with counts.
   * Plan 2 OVERRIDES this export to embed the relationship graph.
   * @param {{ pages: Page[], registry: object }} args
   * @returns {string}
   */
  export function renderLanding({ pages, registry: _registry }) {
    const counts = new Map(SECTION_META.map((s) => [s.type, 0]));
    for (const p of pages) {
      if (counts.has(p.type)) counts.set(p.type, counts.get(p.type) + 1);
    }

    const groups = SECTION_META.map((s) => {
      const n = counts.get(s.type) ?? 0;
      return `<a class="track-card" href="./${s.indexSlug}.html">
  <span class="lab">${esc(s.label)}</span>
  <span class="ti">${esc(s.label)} <span class="count-badge">${n}</span></span>
  <span class="de">${n} ${esc(s.label)} dokumentiert</span>
  <span class="arrow">Öffnen →</span>
</a>`;
    }).join('\n');

    const total = pages.length;
    const header = `<header class="page-hero landing-hero">
  <div class="page-hero-body">
    <p class="kicker">Workspace MVP</p>
    <h1 class="page-hero-title">Dokumentation</h1>
    <p class="page-hero-desc">${total} Seiten über Skills, Agents und Docs — durchsuchbar mit Strg/Cmd + K.</p>
  </div>
</header>`;

    return `${documentHead('Dokumentation')}
<div id="app">
  <main id="main">
${header}
<section class="tracks landing-tracks">
${groups}
</section>
  </main>
</div>
${documentTail()}`;
  }
  ```

- [ ] **Step 4: Run the test and confirm it PASSES.**

  ```bash
  cd /tmp/wt-docs-html-generator && node --test scripts/docs-gen/templates.test.mjs
  ```

  Expected PASS:

  ```
  # tests 9
  # pass 9
  # fail 0
  ```

- [ ] **Step 5: Commit.**

  ```bash
  cd /tmp/wt-docs-html-generator && git add scripts/docs-gen/templates.mjs scripts/docs-gen/templates.test.mjs && git commit -m "$(cat <<'EOF'
  feat(docs-gen): add templates.mjs editorial shell, provenance badge, section index, landing

  renderPage emits a full HTML5 editorial document (links ./style.css + ./app.js,
  page-hero header with breadcrumbs, provenance badge, domain tag, related footer).
  Descriptions render in full — escaped only, never truncated — with a regression
  test asserting the last sentence of a multi-line agent description survives.
  provenanceBadge distinguishes repo vs plugin@version; renderSectionIndex builds a
  card grid per type; renderLanding (Plan 1) is the grouped card hub with counts
  (Plan 2 overrides it to embed the graph).

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

### Task 7: legacy.mjs + one-time migration of hand-built pages to docs/legacy-html/

**Files:**
- Create: `/tmp/wt-docs-html-generator/scripts/docs-gen/legacy.mjs`
- Create (migration target dir, committed): `/tmp/wt-docs-html-generator/docs/legacy-html/` (populated by `git mv`)
- Modify (one-time `git mv`, then one deletion): `/tmp/wt-docs-html-generator/k3d/docs-content-built/*.html` (the ~46 hand-built content pages move out; `db-schema.html` is deleted from `docs/legacy-html/` after the move)
- Test: `/tmp/wt-docs-html-generator/scripts/docs-gen/legacy.test.mjs`

---

#### PART A — `scripts/docs-gen/legacy.mjs` (module + tests, TDD)

- [ ] **Step 1: Write the failing test file `scripts/docs-gen/legacy.test.mjs`.**

  Create `/tmp/wt-docs-html-generator/scripts/docs-gen/legacy.test.mjs` with this COMPLETE content:

  ```js
  // scripts/docs-gen/legacy.test.mjs
  import { test } from 'node:test';
  import assert from 'node:assert/strict';
  import { rewrapLegacyPage } from './legacy.mjs';

  // A legacy page shaped like the committed k3d/docs-content-built/*.html:
  // <nav class="topnav">, <header class="skill-hero">, inline <style>, <main class="content">.
  const SAMPLE = `<!DOCTYPE html>
  <html lang="de">
  <head>
  <title>Systemarchitektur — Workspace MVP</title>
  <style>.secret-marker-css{display:none}.topnav{color:red}</style>
  </head>
  <body>
  <nav class="topnav"><a href="./index.html">NAVLINK-MARKER Übersicht</a></nav>
  <header class="skill-hero"><h1 class="hero-title">🏗️ Systemarchitektur</h1></header>
  <main class="content">
  <h2 id="ueberblick">Überblick</h2>
  <p>BODY-CONTENT-MARKER architecture details.</p>
  <pre><code>kubectl get pods</code></pre>
  </main>
  <script src="./app.js"></script>
  </body>
  </html>`;

  test('rewrapLegacyPage: extracts main.content body, mode rewrapped', () => {
    const { title, innerHtml, mode } = rewrapLegacyPage(SAMPLE, 'architecture');
    assert.equal(mode, 'rewrapped', 'a page with main.content rewraps');
    assert.equal(title, '🏗️ Systemarchitektur', 'title from the h1.hero-title');
    assert.ok(innerHtml.includes('BODY-CONTENT-MARKER'), 'keeps body content');
    assert.ok(innerHtml.includes('kubectl get pods'), 'keeps code blocks');
    assert.ok(!innerHtml.includes('secret-marker-css'), 'drops inline <style> contents');
    assert.ok(!innerHtml.includes('NAVLINK-MARKER'), 'drops the topnav');
  });

  test('rewrapLegacyPage: title falls back to <title> minus suffix when no h1', () => {
    const html = `<!DOCTYPE html><html><head><title>Backup &amp; Restore — Workspace MVP</title></head>` +
      `<body><main class="content"><p>CONTENT-X</p></main></body></html>`;
    const { title, innerHtml, mode } = rewrapLegacyPage(html, 'backup');
    assert.equal(mode, 'rewrapped');
    assert.equal(title, 'Backup & Restore', 'title from <title>, suffix stripped, entities decoded');
    assert.ok(innerHtml.includes('CONTENT-X'));
  });

  test('rewrapLegacyPage: no extractable body returns mode copied with original html', () => {
    const html = '<!DOCTYPE html><html><head><title>Weird</title></head></html>';
    const { title, innerHtml, mode } = rewrapLegacyPage(html, 'weird');
    assert.equal(mode, 'copied', 'no body -> verbatim copy');
    assert.equal(title, 'Weird', 'title from <title>');
    assert.equal(innerHtml, html, 'innerHtml is the verbatim original');
  });

  test('rewrapLegacyPage: title falls back to slug when nothing usable', () => {
    const html = '<div></div>';
    const { title, mode } = rewrapLegacyPage(html, 'my-slug');
    assert.equal(mode, 'copied');
    assert.equal(title, 'my-slug', 'falls back to the slug');
  });
  ```

- [ ] **Step 2: Run the test — expect FAIL (module missing).**

  ```bash
  cd /tmp/wt-docs-html-generator && node --test scripts/docs-gen/legacy.test.mjs
  ```

  Expected FAIL: `Cannot find module '/tmp/wt-docs-html-generator/scripts/docs-gen/legacy.mjs'` (the test run reports the import error / `0 pass`, nonzero exit).

- [ ] **Step 3: Write the implementation `scripts/docs-gen/legacy.mjs`.**

  Create `/tmp/wt-docs-html-generator/scripts/docs-gen/legacy.mjs` with this COMPLETE content:

  ```js
  // scripts/docs-gen/legacy.mjs
  // Re-wrap committed hand-built docs pages (migrated to docs/legacy-html/) into
  // the new editorial shell. Extracts the meaningful body from a legacy page and
  // hands the inner HTML back to templates.renderPage. Pages whose body cannot be
  // extracted are returned verbatim (mode 'copied') for byte-faithful passthrough.
  import * as cheerio from 'cheerio';

  /**
   * Strip the trailing " — Workspace MVP" site suffix from a <title>.
   * Tolerates both em-dash and hyphen separators.
   * @param {string} t
   * @returns {string}
   */
  function stripTitleSuffix(t) {
    return t
      .replace(/\s*[—–-]\s*Workspace MVP\s*$/u, '')
      .trim();
  }

  /**
   * Derive a human title for a legacy page.
   * Order: <h1> (hero-title or first) text -> <title> minus suffix -> slug.
   * @param {import('cheerio').CheerioAPI} $
   * @param {string} slug
   * @returns {string}
   */
  function deriveLegacyTitle($, slug) {
    const h1 = $('h1.hero-title').first().text().trim()
      || $('h1').first().text().trim();
    if (h1) return h1;
    const titleTag = $('title').first().text().trim();
    if (titleTag) {
      const stripped = stripTitleSuffix(titleTag);
      if (stripped) return stripped;
    }
    return slug;
  }

  /**
   * Re-wrap a committed legacy HTML page.
   *
   * Extraction preference: main.content -> #main -> <body> (minus chrome).
   * Inline <style>, <script>, the top nav, the page header and any footer are
   * dropped — they belong to the OLD shell and are re-supplied by templates.mjs.
   * If no meaningful content can be extracted, the original html is returned
   * verbatim with mode 'copied'.
   *
   * @param {string} html  Raw committed legacy page HTML.
   * @param {string} slug  Target bare slug (used for the fallback title).
   * @returns {{ title: string, innerHtml: string, mode: 'rewrapped'|'copied' }}
   */
  export function rewrapLegacyPage(html, slug) {
    const $ = cheerio.load(html, { xmlMode: false });
    const title = deriveLegacyTitle($, slug);

    // Pick the content root in preference order.
    let $root = $('main.content').first();
    if (!$root.length) $root = $('#main').first();
    if (!$root.length) {
      const $body = $('body').first();
      if ($body.length) {
        // Whole body minus the old chrome.
        $body.find('nav, header, footer, script, style').remove();
        $root = $body;
      }
    } else {
      // Inside the chosen root, drop any nested chrome / inline assets.
      $root.find('nav, header, footer, script, style').remove();
    }

    if ($root && $root.length) {
      // Always strip inline assets that may live directly inside the root.
      $root.find('style, script').remove();
      const innerHtml = $root.html();
      if (innerHtml && innerHtml.trim()) {
        return { title, innerHtml, mode: 'rewrapped' };
      }
    }

    // No extractable body -> verbatim passthrough.
    return { title, innerHtml: html, mode: 'copied' };
  }
  ```

- [ ] **Step 4: Run the test — expect PASS.**

  ```bash
  cd /tmp/wt-docs-html-generator && node --test scripts/docs-gen/legacy.test.mjs
  ```

  Expected PASS: `# pass 4`, `# fail 0`, exit code 0.

- [ ] **Step 5: Commit the module + tests.**

  ```bash
  cd /tmp/wt-docs-html-generator && git add scripts/docs-gen/legacy.mjs scripts/docs-gen/legacy.test.mjs && git commit -m "$(cat <<'EOF'
  feat(docs-gen): add legacy.mjs to rewrap hand-built docs pages

  rewrapLegacyPage(html, slug) extracts the meaningful body from a committed
  legacy page (main.content -> #main -> body minus nav/header/footer/script/style),
  drops inline <style>, derives the title from h1.hero-title / first h1 / <title>
  (suffix-stripped) / slug, and returns { title, innerHtml, mode }. Pages with no
  extractable body fall back to mode 'copied' (verbatim passthrough). node:test
  suite covers rewrapped, copied, and title-fallback cases.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

#### PART B — one-time migration of hand-built pages into `docs/legacy-html/`

The committed `k3d/docs-content-built/` currently holds 49 `.html` files plus the assets (`style.css`, `app.js`, `search.json`) and the `skills/` dir. We move every hand-built **content** page into a new committed source dir `docs/legacy-html/`, leaving OUT_DIR fully generated so a later step can safely `rm -rf` and regenerate it.

**SKIP set (stays in `k3d/docs-content-built/`, NOT moved):**
- `index.html` — landing is regenerated by `templates.renderLanding`
- `skills-overview.html` — superseded; the new generator produces the skills section index
- `skills/` — the whole dir is superseded/regenerated (it is a directory, the loop only globs `*.html` so it is never matched, but it is listed here for clarity)
- `style.css`, `app.js`, `search.json` — build assets, regenerated every run

**Explicitly MOVED (into `docs/legacy-html/`), then one is deleted:**
- `datamodel-workflow.html` — MOVED; kept as **verbatim passthrough** (its source was an ephemeral `/tmp` file). Task 8 copies it byte-for-byte into OUT_DIR.
- `db-schema.html` — MOVED by the loop, **then DELETED** from `docs/legacy-html/`. Task 8 regenerates `db-schema.html` from `docs/db-schema-diagram.md` (slug overridden to `db-schema`), so a committed legacy copy must NOT linger.

- [ ] **Step 6: Create the target dir and run the `git mv` migration loop (copy-pasteable).**

  ```bash
  cd /tmp/wt-docs-html-generator

  # New committed source dir for the migrated hand-built pages.
  mkdir -p docs/legacy-html

  # Files that must STAY in OUT_DIR (regenerated assets + superseded pages).
  # NOTE: skills/ is a directory; the *.html glob never matches it, listed for clarity.
  SKIP="index.html skills-overview.html style.css app.js search.json skills"

  SRC_DIR="k3d/docs-content-built"
  for f in "$SRC_DIR"/*.html; do
    base="$(basename "$f")"
    skipit=""
    for s in $SKIP; do
      if [ "$base" = "$s" ]; then skipit=1; break; fi
    done
    if [ -n "$skipit" ]; then
      echo "SKIP  $base"
      continue
    fi
    git mv "$f" "docs/legacy-html/$base"
    echo "MOVED $base"
  done
  ```

  Expected: every content page (`architecture.html`, `keycloak.html`, `database.html`, … including `datamodel-workflow.html` and `db-schema.html` — ~46 files) prints `MOVED`; `index.html` and `skills-overview.html` print `SKIP`. `style.css`, `app.js`, `search.json` and the `skills/` dir remain in `k3d/docs-content-built/`.

- [ ] **Step 7: Delete the migrated `db-schema.html` (it is regenerated from markdown in Task 8).**

  ```bash
  cd /tmp/wt-docs-html-generator && git rm docs/legacy-html/db-schema.html
  ```

  Expected: `rm 'docs/legacy-html/db-schema.html'`. `datamodel-workflow.html` REMAINS in `docs/legacy-html/` (it is the verbatim passthrough source).

- [ ] **Step 8: Verify the migration result (no functional change to assert, just a sanity gate).**

  ```bash
  cd /tmp/wt-docs-html-generator
  echo "--- still in OUT_DIR (expect: app.js index.html search.json skills skills-overview.html style.css) ---"
  ls -1 k3d/docs-content-built/ | sort
  echo "--- moved into docs/legacy-html/ (expect ~45 pages incl datamodel-workflow.html, NO db-schema.html, NO index.html) ---"
  ls -1 docs/legacy-html/ | sort
  echo "--- guards ---"
  test ! -e docs/legacy-html/db-schema.html && echo "OK: db-schema.html absent from legacy-html"
  test -e docs/legacy-html/datamodel-workflow.html && echo "OK: datamodel-workflow.html present in legacy-html"
  test -e k3d/docs-content-built/index.html && echo "OK: index.html kept in OUT_DIR"
  test -e k3d/docs-content-built/skills && echo "OK: skills/ dir kept in OUT_DIR"
  ```

  Expected: OUT_DIR lists only `app.js index.html search.json skills skills-overview.html style.css`; `docs/legacy-html/` lists the ~45 migrated pages including `datamodel-workflow.html` but NOT `db-schema.html` or `index.html`; all four `OK:` guard lines print.

- [ ] **Step 9: Commit the migration.**

  ```bash
  cd /tmp/wt-docs-html-generator && git add -A docs/legacy-html k3d/docs-content-built && git commit -m "$(cat <<'EOF'
  chore(docs): migrate hand-built docs pages to docs/legacy-html/

  One-time move of the ~46 committed hand-built content pages out of
  k3d/docs-content-built/ (OUT_DIR) into the new committed source dir
  docs/legacy-html/, so OUT_DIR becomes fully generated and can be cleaned and
  rebuilt safely. Kept in OUT_DIR: index.html, skills-overview.html, the skills/
  dir, and the build assets (style.css, app.js, search.json) — all regenerated by
  the new builder. datamodel-workflow.html stays in docs/legacy-html/ as a verbatim
  passthrough source; db-schema.html is removed because Task 8 regenerates it from
  docs/db-schema-diagram.md with the slug overridden to db-schema.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

---

**Done when:** `node --test scripts/docs-gen/legacy.test.mjs` passes (4/4); `docs/legacy-html/` holds the migrated pages (with `datamodel-workflow.html`, without `db-schema.html`/`index.html`); `k3d/docs-content-built/` retains only `index.html`, `skills-overview.html`, `skills/`, `style.css`, `app.js`, `search.json`; both commits land with the required trailer.

---

### Task 8: build-docs.mjs — orchestrator, full build, --rebuild-page, smoke test

**Files:**
- Create: `/tmp/wt-docs-html-generator/scripts/build-docs.mjs`
- Test: `/tmp/wt-docs-html-generator/scripts/docs-gen/build-smoke.test.mjs`
- Modify: none (Taskfile/package.json/CLAUDE.md repointing and deletion of `build-docs.js` happen in Task 9)

> Depends on Tasks 1–7 being merged: `scripts/docs-gen/frontmatter.mjs`, `discover.mjs`, `registry.mjs`, `render-markdown.mjs`, `theme.mjs`, `templates.mjs`, `legacy.mjs` — all with the exact exports from the interface contract. This task only consumes those exports; it adds no new exports to them.

- [ ] **Step 1: Write the failing smoke test.**

Create `/tmp/wt-docs-html-generator/scripts/docs-gen/build-smoke.test.mjs`. It builds a tiny fixture repo in an OS tmp dir (two repo skills, one repo agent, one doc, one legacy HTML page, a minimal `CLAUDE.md` carrying a routing table), runs the orchestrator's `runBuild({ repoRoot, pluginsRoot, outDir })` pointed at the fixture (with `pluginsRoot` set to a nonexistent path so the plugin sources are skipped and the build still succeeds), and asserts the output contract.

```js
// scripts/docs-gen/build-smoke.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runBuild } from '../build-docs.mjs';

/** Build a minimal fixture repo tree and return its root. */
function makeFixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), 'docs-gen-smoke-'));

  // Minimal CLAUDE.md with a routing table the orchestrator reads for domains/edges.
  writeFileSync(join(root, 'CLAUDE.md'), [
    '# CLAUDE.md',
    '',
    '## Agent Routing',
    '',
    '| Signals | Agent |',
    '|---------|-------|',
    '| `website/`, Astro, component | `bachelorprojekt-website` |',
    '| pod, logs, kubectl, status | `bachelorprojekt-ops` |',
    '',
  ].join('\n'), 'utf8');

  // Repo skills: .claude/skills/<name>/SKILL.md
  mkdirSync(join(root, '.claude', 'skills', 'alpha-skill'), { recursive: true });
  writeFileSync(join(root, '.claude', 'skills', 'alpha-skill', 'SKILL.md'), [
    '---',
    'name: alpha-skill',
    'description: First fixture skill.',
    '---',
    '# Alpha Skill',
    '',
    'Alpha body. See [[beta-skill]] for more.',
    '',
  ].join('\n'), 'utf8');

  mkdirSync(join(root, '.claude', 'skills', 'beta-skill'), { recursive: true });
  writeFileSync(join(root, '.claude', 'skills', 'beta-skill', 'SKILL.md'), [
    '---',
    'name: beta-skill',
    'description: Second fixture skill.',
    '---',
    '# Beta Skill',
    '',
    'Beta body.',
    '',
  ].join('\n'), 'utf8');

  // Repo agent: .claude/agents/<name>.md with a block-scalar description.
  mkdirSync(join(root, '.claude', 'agents'), { recursive: true });
  writeFileSync(join(root, '.claude', 'agents', 'bachelorprojekt-ops.md'), [
    '---',
    'name: bachelorprojekt-ops',
    'description: >',
    '  Ops agent for pods, logs, status, restarts and',
    '  general cluster health questions.',
    '---',
    '# Ops Agent',
    '',
    'Ops agent body.',
    '',
  ].join('\n'), 'utf8');

  // Docs markdown: docs/**/*.md
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(root, 'docs', 'intro.md'), [
    '# Intro',
    '',
    'Intro doc body with a mermaid diagram.',
    '',
    '```mermaid',
    'flowchart LR',
    '  A --> B',
    '```',
    '',
  ].join('\n'), 'utf8');

  // Legacy HTML: docs/legacy-html/<slug>.html
  mkdirSync(join(root, 'docs', 'legacy-html'), { recursive: true });
  writeFileSync(join(root, 'docs', 'legacy-html', 'architecture.html'), [
    '<!DOCTYPE html>',
    '<html lang="de"><head><title>Architecture — Workspace MVP</title></head>',
    '<body><main class="content"><h1>Architecture</h1><p>Legacy architecture page.</p></main></body>',
    '</html>',
  ].join('\n'), 'utf8');

  return root;
}

test('runBuild: produces the static output contract from a fixture repo', async () => {
  const repoRoot = makeFixtureRepo();
  const outDir = mkdtempSync(join(tmpdir(), 'docs-gen-out-'));
  const pluginsRoot = join(repoRoot, '__no_plugins_here__'); // absent → plugin sources skipped

  try {
    const report = await runBuild({ repoRoot, pluginsRoot, outDir });

    // Landing + section indexes.
    assert.ok(existsSync(join(outDir, 'index.html')), 'index.html written');
    assert.ok(existsSync(join(outDir, 'skills.html')), 'skills.html written');
    assert.ok(existsSync(join(outDir, 'agents.html')), 'agents.html written');
    assert.ok(existsSync(join(outDir, 'docs.html')), 'docs.html written');

    // At least one skill page and one agent page (under their subdirs).
    const skillPages = readdirSync(join(outDir, 'skills')).filter((f) => f.endsWith('.html'));
    assert.ok(skillPages.length >= 1, 'at least one skills/<x>.html written');
    const agentPages = readdirSync(join(outDir, 'agents')).filter((f) => f.endsWith('.html'));
    assert.ok(agentPages.length >= 1, 'at least one agents/<x>.html written');

    // Legacy rewrapped page keeps its bare slug URL.
    assert.ok(existsSync(join(outDir, 'architecture.html')), 'legacy architecture.html written at bare slug');

    // Assets.
    assert.ok(existsSync(join(outDir, 'style.css')), 'style.css written');
    assert.ok(existsSync(join(outDir, 'app.js')), 'app.js written');

    // search.json shape.
    assert.ok(existsSync(join(outDir, 'search.json')), 'search.json written');
    const idx = JSON.parse(readFileSync(join(outDir, 'search.json'), 'utf8'));
    assert.ok(Array.isArray(idx), 'search.json is an array');
    assert.ok(idx.length >= 1, 'search.json is non-empty');
    for (const entry of idx) {
      assert.equal(typeof entry.slug, 'string', 'entry.slug is a string');
      assert.equal(typeof entry.title, 'string', 'entry.title is a string');
      assert.equal(typeof entry.excerpt, 'string', 'entry.excerpt is a string');
    }

    // Build report is returned with counts.
    assert.equal(typeof report, 'object', 'report returned');
    assert.equal(typeof report.counts, 'object', 'report.counts present');
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
    rmSync(outDir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the smoke test — expect FAIL (module not found).**

```bash
cd /tmp/wt-docs-html-generator && node --test scripts/docs-gen/build-smoke.test.mjs
```

Expected FAIL: `Error: Cannot find module '/tmp/wt-docs-html-generator/scripts/build-docs.mjs'` (the entry does not exist yet), reported as `tests 1 / fail 1`.

- [ ] **Step 3: Write the orchestrator `scripts/build-docs.mjs` (minimal-complete).**

Create `/tmp/wt-docs-html-generator/scripts/build-docs.mjs`. It exports `OUT_DIR` and `runBuild(options)`, and provides a CLI that calls `runBuild` with real paths or handles `--rebuild-page`. The clean-rebuild only removes generated files inside `OUT_DIR` (never the `docs/` or `docs/legacy-html/` inputs), then regenerates everything.

```js
// scripts/build-docs.mjs
// Orchestrator / entry point for the docs-site generator.
// Replaces scripts/build-docs.js (removed in a later task). Discovers all
// sources, builds an editorial cross-linked site under k3d/docs-content-built/,
// and prints a build report. The OUT_DIR is fully generated, so a clean rebuild
// safely removes its generated contents — every input lives under docs/ and
// docs/legacy-html/, so nothing is lost.

import {
  readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync,
  rmSync, copyFileSync, statSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import * as cheerio from 'cheerio';

import { discoverSources } from './docs-gen/discover.mjs';
import { buildPages, buildRegistry, parseRoutingTable, collectEdges } from './docs-gen/registry.mjs';
import { renderMarkdown } from './docs-gen/render-markdown.mjs';
import { editorialCss, clientJs } from './docs-gen/theme.mjs';
import { renderPage, renderSectionIndex, renderLanding } from './docs-gen/templates.mjs';
import { rewrapLegacyPage } from './docs-gen/legacy.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

export const OUT_DIR = join(REPO_ROOT, 'k3d/docs-content-built');

// Default plugin cache root; absent on machines without plugins installed.
const DEFAULT_PLUGINS_ROOT = join(homedir(), '.claude/plugins/cache');

// Pages copied verbatim (machine-generated, too large to rewrap reliably).
const PASSTHROUGH_LEGACY = new Set(['datamodel-workflow.html']);

// db-schema is rendered from markdown but pinned to this output slug.
const DB_SCHEMA_SOURCE_REL = 'docs/db-schema-diagram.md';
const DB_SCHEMA_SLUG = 'db-schema';

/** @typedef {{ slug: string, title: string, excerpt: string }} SearchEntry */

/**
 * Compute a short, whitespace-collapsed excerpt from rendered HTML.
 * @param {string} html
 * @returns {string}
 */
function excerptFromHtml(html) {
  const $ = cheerio.load(html);
  return $('p').first().text().trim().slice(0, 160).replace(/\s+/g, ' ');
}

/**
 * Derive a display title from rendered HTML, falling back to a slug.
 * @param {string} html
 * @param {string} fallback
 * @returns {string}
 */
function titleFromHtml(html, fallback) {
  const $ = cheerio.load(html);
  const h1 = $('h1').first().text().trim();
  if (h1) return h1;
  const t = $('title').first().text().replace(/ — Workspace MVP$/, '').trim();
  return t || fallback;
}

/**
 * Ensure OUT_DIR exists and is empty of previously generated content.
 * Only the generated output dir is touched; all inputs live under docs/.
 * @param {string} outDir
 */
function cleanOutDir(outDir) {
  if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
}

/**
 * Write a file, creating parent directories as needed.
 * @param {string} outDir
 * @param {string} relPath
 * @param {string} content
 */
function writeOut(outDir, relPath, content) {
  const dest = join(outDir, relPath);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, content, 'utf8');
}

/**
 * Full build. Accepts an options object so tests can point it at a fixture repo.
 * @param {{ repoRoot?: string, pluginsRoot?: string, outDir?: string, homeDir?: string }} [opts]
 * @returns {Promise<object>} build report
 */
export async function runBuild(opts = {}) {
  const repoRoot = opts.repoRoot ?? REPO_ROOT;
  const outDir = opts.outDir ?? OUT_DIR;
  const homeDir = opts.homeDir ?? homedir();
  const pluginsRoot = opts.pluginsRoot ?? DEFAULT_PLUGINS_ROOT;

  const report = {
    counts: { doc: 0, skill: 0, agent: 0, legacyRewrapped: 0, legacyCopied: 0, passthrough: 0 },
    unresolved: [],
    diagramFallbacks: 0,
    skippedPluginSources: [],
    pluginsRootPresent: existsSync(pluginsRoot),
  };

  cleanOutDir(outDir);

  // (1) Discover all sources (repo + plugin skills/agents + docs).
  const sources = await discoverSources({ repoRoot, pluginsRoot, homeDir });
  if (!report.pluginsRootPresent) {
    report.skippedPluginSources.push(`plugins root absent: ${pluginsRoot}`);
  }

  // (2) Build pages + registry.
  const pages = buildPages(sources);

  // (3) Parse the routing table from CLAUDE.md (drives domains + routing edges).
  const claudeMdPath = join(repoRoot, 'CLAUDE.md');
  const claudeMdText = existsSync(claudeMdPath) ? readFileSync(claudeMdPath, 'utf8') : '';
  const routingRows = parseRoutingTable(claudeMdText);

  const registry = buildRegistry(pages);

  // (4) Collect cross-link edges (used by the landing graph in Plan 2; the
  // unresolved list feeds the build report here).
  const { unresolved } = collectEdges(pages, registry);
  report.unresolved.push(...unresolved);

  /** @type {SearchEntry[]} */
  const searchIndex = [];

  // (5) Render every markdown-backed Page and write it to OUT_DIR/outRelPath.
  for (const page of pages) {
    const rendered = await renderMarkdown(page.bodyMarkdown, { registry, page });
    report.diagramFallbacks += rendered.diagramFallbacks;
    report.unresolved.push(...rendered.unresolved.map((u) => ({ from: page.slug, ref: u.ref })));
    const toc = rendered.headings;
    const html = renderPage({ page, contentHtml: rendered.html, toc, related: [] });
    writeOut(outDir, page.outRelPath, html);
    if (report.counts[page.type] !== undefined) report.counts[page.type] += 1;
    searchIndex.push({
      slug: page.slug,
      title: page.title,
      excerpt: excerptFromHtml(rendered.html),
    });
  }

  // (6a) Legacy HTML: rewrap each (except passthrough) and write at bare slug.
  const legacyDir = join(repoRoot, 'docs/legacy-html');
  if (existsSync(legacyDir)) {
    const legacyFiles = readdirSync(legacyDir)
      .filter((f) => f.endsWith('.html'))
      .sort();
    for (const file of legacyFiles) {
      const slug = file.replace(/\.html$/, '');
      const srcPath = join(legacyDir, file);
      if (PASSTHROUGH_LEGACY.has(file)) {
        // Copy verbatim — too large / machine-generated to rewrap reliably.
        copyFileSync(srcPath, join(outDir, file));
        report.counts.passthrough += 1;
        const raw = readFileSync(srcPath, 'utf8');
        searchIndex.push({
          slug,
          title: titleFromHtml(raw, slug),
          excerpt: excerptFromHtml(raw),
        });
        continue;
      }
      const raw = readFileSync(srcPath, 'utf8');
      const { title, innerHtml, mode } = rewrapLegacyPage(raw, slug);
      if (mode === 'copied') {
        copyFileSync(srcPath, join(outDir, file));
        report.counts.legacyCopied += 1;
        searchIndex.push({ slug, title, excerpt: excerptFromHtml(raw) });
        continue;
      }
      const legacyPage = {
        slug,
        type: 'doc',
        provenance: 'repo',
        name: slug,
        title,
        description: '',
        domain: null,
        bodyMarkdown: '',
        sourcePath: srcPath,
        outRelPath: `${slug}.html`,
      };
      const html = renderPage({ page: legacyPage, contentHtml: innerHtml, toc: [], related: [] });
      writeOut(outDir, `${slug}.html`, html);
      report.counts.legacyRewrapped += 1;
      searchIndex.push({ slug, title, excerpt: excerptFromHtml(innerHtml) });
    }
  }

  // (6b) db-schema: render from markdown but force the bare slug db-schema.html.
  const dbSchemaSrc = join(repoRoot, DB_SCHEMA_SOURCE_REL);
  if (existsSync(dbSchemaSrc)) {
    const md = readFileSync(dbSchemaSrc, 'utf8');
    const dbPage = {
      slug: DB_SCHEMA_SLUG,
      type: 'doc',
      provenance: 'repo',
      name: DB_SCHEMA_SLUG,
      title: 'Shared DB — Schema Reference',
      description: '',
      domain: 'db',
      bodyMarkdown: md,
      sourcePath: dbSchemaSrc,
      outRelPath: `${DB_SCHEMA_SLUG}.html`,
    };
    const rendered = await renderMarkdown(md, { registry, page: dbPage });
    report.diagramFallbacks += rendered.diagramFallbacks;
    const title = titleFromHtml(rendered.html, dbPage.title);
    const html = renderPage({
      page: { ...dbPage, title },
      contentHtml: rendered.html,
      toc: rendered.headings,
      related: [],
    });
    writeOut(outDir, `${DB_SCHEMA_SLUG}.html`, html);
    searchIndex.push({ slug: DB_SCHEMA_SLUG, title, excerpt: excerptFromHtml(rendered.html) });
  }

  // (7) Section index pages.
  const sectionDefs = [
    { type: 'skill', title: 'Skills', file: 'skills.html' },
    { type: 'agent', title: 'Agents', file: 'agents.html' },
    { type: 'doc', title: 'Docs', file: 'docs.html' },
  ];
  for (const def of sectionDefs) {
    const sectionPages = pages.filter((p) => p.type === def.type);
    const html = renderSectionIndex({ type: def.type, title: def.title, pages: sectionPages });
    writeOut(outDir, def.file, html);
  }

  // (8) Landing page (graph-forward in Plan 2; editorial card grid in Plan 1).
  writeOut(outDir, 'index.html', renderLanding({ pages, registry }));

  // (9) Assets.
  writeOut(outDir, 'style.css', editorialCss());
  writeOut(outDir, 'app.js', clientJs());

  // (10) search.json — array of { slug, title, excerpt }.
  searchIndex.sort((a, b) => a.slug.localeCompare(b.slug));
  writeOut(outDir, 'search.json', JSON.stringify(searchIndex));
  report.counts.searchEntries = searchIndex.length;

  // (11) Build report.
  printReport(report);
  return report;
}

/**
 * Render a single markdown file to OUT_DIR/<slug>.html and refresh search.json,
 * for parity with the old builder's --rebuild-page fast path.
 * @param {string} slug
 * @param {string} mdPath
 * @param {string} outDir
 * @returns {Promise<void>}
 */
export async function rebuildPage(slug, mdPath, outDir = OUT_DIR) {
  mkdirSync(outDir, { recursive: true });
  const md = readFileSync(mdPath, 'utf8');
  const page = {
    slug,
    type: 'doc',
    provenance: 'repo',
    name: slug,
    title: slug,
    description: '',
    domain: null,
    bodyMarkdown: md,
    sourcePath: mdPath,
    outRelPath: `${slug}.html`,
  };
  // No global registry on the fast path; cross-links degrade to plain text.
  const registry = buildRegistry([]);
  const rendered = await renderMarkdown(md, { registry, page });
  const title = titleFromHtml(rendered.html, slug);
  const html = renderPage({
    page: { ...page, title },
    contentHtml: rendered.html,
    toc: rendered.headings,
    related: [],
  });
  writeOut(outDir, `${slug}.html`, html);
  refreshSearchIndexFromOutDir(outDir);
  console.log(`  → ${slug}.html ✓ (search.json refreshed)`);
}

/**
 * Rebuild search.json by scanning the already-written HTML in OUT_DIR.
 * Used only by the --rebuild-page fast path (the full build writes it directly).
 * @param {string} outDir
 */
function refreshSearchIndexFromOutDir(outDir) {
  const files = readdirSync(outDir)
    .filter((f) => f.endsWith('.html') && statSync(join(outDir, f)).isFile())
    .sort();
  const index = files.map((file) => {
    const slug = file.replace(/\.html$/, '');
    const raw = readFileSync(join(outDir, file), 'utf8');
    return { slug, title: titleFromHtml(raw, slug), excerpt: excerptFromHtml(raw) };
  });
  writeOut(outDir, 'search.json', JSON.stringify(index));
}

/**
 * Print the human-readable build report.
 * @param {object} report
 */
function printReport(report) {
  const c = report.counts;
  console.log('\n── Docs build report ────────────────────────────');
  console.log(`  docs:               ${c.doc}`);
  console.log(`  skills:             ${c.skill}`);
  console.log(`  agents:             ${c.agent}`);
  console.log(`  legacy rewrapped:   ${c.legacyRewrapped}`);
  console.log(`  legacy copied:      ${c.legacyCopied}`);
  console.log(`  passthrough:        ${c.passthrough}`);
  console.log(`  search entries:     ${c.searchEntries ?? 0}`);
  console.log(`  diagram fallbacks:  ${report.diagramFallbacks}`);
  console.log(`  unresolved refs:    ${report.unresolved.length}`);
  if (report.unresolved.length) {
    for (const u of report.unresolved.slice(0, 20)) {
      console.log(`      ✗ ${u.from} → [[${u.ref}]]`);
    }
    if (report.unresolved.length > 20) {
      console.log(`      … and ${report.unresolved.length - 20} more`);
    }
  }
  if (!report.pluginsRootPresent || report.skippedPluginSources.length) {
    console.log(`  skipped plugin sources:`);
    for (const s of report.skippedPluginSources) console.log(`      ⚠ ${s}`);
  }
  console.log('─────────────────────────────────────────────────');
}

/**
 * CLI entry. Supports a default full build and --rebuild-page <slug> <mdfile>.
 */
async function main() {
  const argv = process.argv.slice(2);
  const rebuildIdx = argv.indexOf('--rebuild-page');
  if (rebuildIdx !== -1) {
    const slug = argv[rebuildIdx + 1];
    const mdPath = argv[rebuildIdx + 2];
    if (!slug || !mdPath) {
      console.error('Usage: build-docs.mjs --rebuild-page <slug> <mdfile>');
      process.exit(1);
    }
    await rebuildPage(slug, mdPath, OUT_DIR);
    console.log(`\n✓ Rebuilt ${slug}.html and refreshed search.json`);
    return;
  }
  await runBuild({ repoRoot: REPO_ROOT, outDir: OUT_DIR });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run the smoke test — expect PASS.**

```bash
cd /tmp/wt-docs-html-generator && node --test scripts/docs-gen/build-smoke.test.mjs
```

Expected PASS: `tests 1 / pass 1 / fail 0`. (Requires Tasks 1–7 modules present in `scripts/docs-gen/` and `node_modules` installed — `cheerio`, `marked`, `gray-matter` resolved by the pre-flight `npm install`.)

- [ ] **Step 5: Sanity-run the orchestrator against the real repo (no commit of OUT_DIR yet).**

```bash
cd /tmp/wt-docs-html-generator && node scripts/build-docs.mjs && ls k3d/docs-content-built/index.html k3d/docs-content-built/skills.html k3d/docs-content-built/agents.html k3d/docs-content-built/docs.html k3d/docs-content-built/style.css k3d/docs-content-built/app.js k3d/docs-content-built/search.json && node -e "const a=require('./k3d/docs-content-built/search.json'); if(!Array.isArray(a)||!a.length) throw new Error('bad search.json'); for(const e of a){ if(typeof e.slug!=='string'||typeof e.title!=='string'||typeof e.excerpt!=='string') throw new Error('bad entry '+JSON.stringify(e)); } console.log('search.json OK:', a.length, 'entries');"
```

Expected: the build report prints to stdout with non-zero `skills`/`agents`/`docs` counts and `db-schema` rendered; all listed asset paths exist; and `search.json OK: <N> entries` confirms valid shape. This run also confirms the clean-rebuild only touches `OUT_DIR` — `git status` shows changes confined to `k3d/docs-content-built/` (which is regenerated, never an input).

- [ ] **Step 6: Verify `--rebuild-page` parity.**

```bash
cd /tmp/wt-docs-html-generator && node scripts/build-docs.mjs --rebuild-page db-schema docs/db-schema-diagram.md && test -f k3d/docs-content-built/db-schema.html && node -e "JSON.parse(require('fs').readFileSync('k3d/docs-content-built/search.json','utf8')); console.log('rebuild-page search.json valid')"
```

Expected: prints `→ db-schema.html ✓ (search.json refreshed)` then `✓ Rebuilt db-schema.html and refreshed search.json`; `db-schema.html` exists; `rebuild-page search.json valid` confirms the index is still valid JSON.

- [ ] **Step 7: Discard the throwaway generated OUT_DIR changes from the sanity runs.**

The new entry's output is committed by Task 9 (after `build-docs.js` removal + Taskfile/package.json repointing). For this task, only the new source files are committed, not regenerated `OUT_DIR` content.

```bash
cd /tmp/wt-docs-html-generator && git checkout -- k3d/docs-content-built/ 2>/dev/null; git clean -fd k3d/docs-content-built/ >/dev/null 2>&1; git status --short scripts/build-docs.mjs scripts/docs-gen/build-smoke.test.mjs
```

Expected: shows `?? scripts/build-docs.mjs` and `?? scripts/docs-gen/build-smoke.test.mjs`, and no lingering modifications under `k3d/docs-content-built/`.

- [ ] **Step 8: Commit the orchestrator and smoke test.**

```bash
cd /tmp/wt-docs-html-generator && git add scripts/build-docs.mjs scripts/docs-gen/build-smoke.test.mjs && git commit -m "$(cat <<'EOF'
feat(docs-gen): add build-docs.mjs orchestrator with full build, --rebuild-page, and smoke test

Wire the docs-gen modules into the new ESM entry point: discover sources,
build pages + registry, parse the CLAUDE.md routing table, collect edges,
render each markdown page and legacy HTML page into the editorial shell,
write section indexes, the landing page, assets, and search.json, and print
a build report. runBuild accepts an {repoRoot, pluginsRoot, outDir} options
object for testability; the CLI calls it with real paths. The clean-rebuild
only removes generated content in OUT_DIR — all inputs live under docs/ and
docs/legacy-html/. build-docs.js is left in place; its removal and the
Taskfile/package.json repointing happen in the next task.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: one commit created on `feature/docs-html-generator` containing exactly `scripts/build-docs.mjs` and `scripts/docs-gen/build-smoke.test.mjs`.

**Notes for the executor (load-bearing facts verified against the worktree):**
- `runBuild` MUST accept `{repoRoot, pluginsRoot, outDir, homeDir?}` and the CLI MUST call it with real paths — this is the testability split the smoke test depends on. Do not inline the build into `main()`.
- The clean-rebuild (`cleanOutDir`) removes `OUT_DIR` recursively. This is only safe because every input now lives under `docs/` and `docs/legacy-html/` (the one-time `git mv` in Task 6). If Task 6 has not run, `OUT_DIR` still contains the ~46 hand-built pages as the only copy — DO NOT run a full build that cleans `OUT_DIR` until Task 6 is merged. The smoke test is unaffected (it targets a tmp `outDir`).
- Passthrough is keyed on the filename `datamodel-workflow.html` (verified present in `k3d/docs-content-built/`); it is copied verbatim and added to the search index but never rewrapped.
- `db-schema` is rendered from `docs/db-schema-diagram.md` (verified present, first H1 `# Shared DB — Schema Reference & Normalization Audit`) and force-written to `db-schema.html` so its URL is unchanged.
- The orchestrator consumes ONLY the contract exports: `discoverSources`, `buildPages`/`buildRegistry`/`parseRoutingTable`/`collectEdges`, `renderMarkdown`, `editorialCss`/`clientJs`, `renderPage`/`renderSectionIndex`/`renderLanding`, `rewrapLegacyPage`. It adds no exports to those modules. If a sibling module's signature differs at execution time, fix the call site here — do not change the contract.
- `legacy.rewrapLegacyPage(html, slug)` returns `{ title, innerHtml, mode }`; the orchestrator honors `mode === 'copied'` by copying the source file verbatim and `mode === 'rewrapped'` by feeding `innerHtml` through `renderPage`.
- The full-build path writes `search.json` directly from collected entries (sorted by slug for diff-stability); the `--rebuild-page` path rebuilds `search.json` by scanning `OUT_DIR` HTML, matching the old builder's behavior so a single-page rebuild does not drop the other pages' entries.

---

### Task 9: Wiring — deps, package.json, Taskfile, CI/test:all, removals, deploy

**Files:**
- Create: `scripts/docs-gen/build-smoke.test.mjs`
- Modify: `package.json`, `Taskfile.yml`, `.github/workflows/build-docs.yml`
- Test: `scripts/docs-gen/build-smoke.test.mjs` (the CI smoke test that proves a full build produces the required outputs)
- Remove (git rm): `scripts/build-docs.js`, `scripts/build-docs.test.js`, `scripts/sync-skill-docs.mjs`, `docs/skills-overview.html`, `docs/skills/` (16 generated HTML files)

> Prerequisite: Tasks 1–8 have landed `scripts/build-docs.mjs` (entry, exports `OUT_DIR`) and all `scripts/docs-gen/*.mjs` modules + their `*.test.mjs` siblings. This task wires them into npm/Taskfile/CI and removes the superseded builder. All commands run from the worktree root `/tmp/wt-docs-html-generator`.

---

- [ ] **Step 1: Add `gray-matter` to devDependencies (committed)**

`gray-matter` is the block-scalar-safe frontmatter parser that `scripts/docs-gen/frontmatter.mjs` (Task 2) wraps. The interface contract lists it as the NEW devDependency. Pin it with a caret range alongside the existing dev tooling.

Current `package.json` devDependencies block (lines 16–20):

```json
  "devDependencies": {
    "@mermaid-js/mermaid-cli": "^11.15.0",
    "cheerio": "^1.2.0",
    "marked": "^18.0.4"
  }
```

Replace with (adds `gray-matter`, alphabetically ordered):

```json
  "devDependencies": {
    "@mermaid-js/mermaid-cli": "^11.15.0",
    "cheerio": "^1.2.0",
    "gray-matter": "^4.0.3",
    "marked": "^18.0.4"
  }
```

Apply via Edit on `package.json`:
- old_string:
  ```
      "cheerio": "^1.2.0",
      "marked": "^18.0.4"
  ```
- new_string:
  ```
      "cheerio": "^1.2.0",
      "gray-matter": "^4.0.3",
      "marked": "^18.0.4"
  ```

- [ ] **Step 2: Repoint `build:docs` and replace `test:build-docs` with `test:docs-gen` in package.json scripts**

The old `build:docs` points at the deleted `scripts/build-docs.js`; `test:build-docs` points at the stale, failing `scripts/build-docs.test.js`. Repoint the build to the new `.mjs` entry and replace the test script with one that runs the new `node:test` suites.

Current `package.json` scripts block (lines 5–9):

```json
  "scripts": {
    "test:track-pr": "node --test scripts/track-pr.test.mjs",
    "test:build-docs": "node --test scripts/build-docs.test.js",
    "build:docs": "node scripts/build-docs.js"
  },
```

Replace with:

```json
  "scripts": {
    "test:track-pr": "node --test scripts/track-pr.test.mjs",
    "test:docs-gen": "node --test scripts/docs-gen/*.test.mjs",
    "build:docs": "node scripts/build-docs.mjs"
  },
```

Apply via Edit on `package.json`:
- old_string:
  ```
      "test:build-docs": "node --test scripts/build-docs.test.js",
      "build:docs": "node scripts/build-docs.js"
  ```
- new_string:
  ```
      "test:docs-gen": "node --test scripts/docs-gen/*.test.mjs",
      "build:docs": "node scripts/build-docs.mjs"
  ```

(`test:track-pr` is left untouched — out of scope; note `scripts/track-pr.test.mjs` was already missing before this task and is not a docs-gen concern.)

- [ ] **Step 3: Verify package.json is valid JSON and reflects the changes**

Run:

```bash
node -e "const p=require('./package.json'); console.log(JSON.stringify({build:p.scripts['build:docs'], test:p.scripts['test:docs-gen'], legacyBuild:p.scripts['test:build-docs']??'(removed)', gm:p.devDependencies['gray-matter']}, null, 2))"
```

Expected output:

```
{
  "build": "node scripts/build-docs.mjs",
  "test": "node --test scripts/docs-gen/*.test.mjs",
  "legacyBuild": "(removed)",
  "gm": "^4.0.3"
}
```

(If `node -e` errors with a JSON parse failure, the Edit broke the file — re-read and fix before continuing.)

- [ ] **Step 4: Write the CI smoke test (failing first) — full build produces the required OUT_DIR contents**

This test is the executable form of the acceptance criterion "Unit tests pass under task test:all" combined with the build contract (index.html + section indexes + skill/agent/doc pages + rewrapped legacy + search.json). It imports the entry's exported `OUT_DIR`, runs a full build in a child process, and asserts the output set. It MUST be deterministic and self-contained (no network, no cluster).

Create `scripts/docs-gen/build-smoke.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const entry = path.join(repoRoot, 'scripts', 'build-docs.mjs');

// Run the full build once before the assertions. Synchronous so the test
// body sees a populated OUT_DIR. Inherit stdio so the build report shows
// up in CI logs when something fails.
test('full build populates OUT_DIR with the required contract files', async () => {
  const { OUT_DIR } = await import(path.join(repoRoot, 'scripts', 'build-docs.mjs'));
  const outAbs = path.isAbsolute(OUT_DIR) ? OUT_DIR : path.join(repoRoot, OUT_DIR);

  execFileSync(process.execPath, [entry], { cwd: repoRoot, stdio: 'inherit' });

  // Landing + section indexes + shared assets must exist.
  for (const required of [
    'index.html',
    'skills.html',
    'agents.html',
    'docs.html',
    'style.css',
    'app.js',
    'search.json',
  ]) {
    assert.ok(existsSync(path.join(outAbs, required)), `missing ${required}`);
  }

  // At least one repo skill, one repo agent, and one doc page rendered.
  const skillFiles = readdirSync(path.join(outAbs, 'skills')).filter((f) => f.endsWith('.html'));
  const agentFiles = readdirSync(path.join(outAbs, 'agents')).filter((f) => f.endsWith('.html'));
  assert.ok(skillFiles.length > 0, 'no skill pages generated');
  assert.ok(agentFiles.length > 0, 'no agent pages generated');

  // A rewrapped legacy page keeps its bare-slug URL.
  assert.ok(existsSync(path.join(outAbs, 'architecture.html')), 'missing rewrapped architecture.html');

  // db-schema is rendered from markdown but overridden to the bare slug.
  assert.ok(existsSync(path.join(outAbs, 'db-schema.html')), 'missing db-schema.html');

  // search.json is an array of { slug, title, excerpt }.
  const idx = JSON.parse(readFileSync(path.join(outAbs, 'search.json'), 'utf8'));
  assert.ok(Array.isArray(idx) && idx.length > 0, 'search.json must be a non-empty array');
  for (const entryObj of idx.slice(0, 3)) {
    assert.ok(typeof entryObj.slug === 'string', 'entry.slug must be a string');
    assert.ok(typeof entryObj.title === 'string', 'entry.title must be a string');
    assert.ok('excerpt' in entryObj, 'entry must have an excerpt field');
  }
});

test('agent pages carry the FULL multi-line description (truncation bug fixed)', () => {
  const { OUT_DIR } = { OUT_DIR: 'k3d/docs-content-built' };
  const outAbs = path.join(repoRoot, OUT_DIR);
  const html = readFileSync(path.join(outAbs, 'agents', 'bachelorprojekt-ops.html'), 'utf8');
  // The old hand-rolled parser captured only ">" for a "description: >"
  // block scalar. The gray-matter parser returns the whole paragraph, so the
  // rendered page must contain real prose, not a lone ">".
  assert.doesNotMatch(html, /description['"]?\s*[:=]\s*&gt;\s*</i, 'description rendered as bare ">"');
  assert.ok(html.length > 500, 'agent page suspiciously short');
});
```

- [ ] **Step 5: Run the smoke test and confirm it FAILS for the right reason (pre-deps)**

Before `npm install`, `gray-matter` is absent and the entry import throws. Run:

```bash
node --test scripts/docs-gen/build-smoke.test.mjs
```

Expected FAIL (the import inside the test cannot resolve `gray-matter`, surfacing as a failing test, not a green run):

```
✖ full build populates OUT_DIR with the required contract files
  Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'gray-matter' ...
# fail 1
```

This proves the test actually exercises the build path. (If you have already run `npm install` from an earlier task, the failure will instead be a missing OUT_DIR file — also an acceptable RED, because the build has not been run yet in this clean tree.)

- [ ] **Step 6: Install deps, then confirm the smoke test PASSES**

```bash
npm install
node --test scripts/docs-gen/build-smoke.test.mjs
```

Expected PASS:

```
✔ full build populates OUT_DIR with the required contract files
✔ agent pages carry the FULL multi-line description (truncation bug fixed)
# tests 2
# pass 2
# fail 0
```

If the second test fails on a missing `agents/bachelorprojekt-ops.html`, the discover/registry tasks did not emit agents — stop and fix those before continuing; do not weaken this assertion.

- [ ] **Step 7: Commit the package.json + smoke-test wiring**

```bash
git add package.json scripts/docs-gen/build-smoke.test.mjs
git commit -m "chore(docs-gen): add gray-matter dep, repoint npm scripts, add build smoke test

- devDependencies: add gray-matter@^4.0.3 (block-scalar-safe frontmatter)
- scripts.build:docs -> node scripts/build-docs.mjs
- replace scripts.test:build-docs with test:docs-gen (node --test scripts/docs-gen/*.test.mjs)
- add scripts/docs-gen/build-smoke.test.mjs asserting the full-build OUT_DIR contract

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 8: Repoint `docs:build` to the new entry**

Current `Taskfile.yml` `docs:build` (lines 2069–2074):

```yaml
  docs:build:
    desc: Sync skills HTML, refresh assets (style.css/app.js), rebuild search.json in k3d/docs-content-built/
    cmds:
      - node scripts/build-docs.js {{if .FAST}}--fast{{end}}
    vars:
      FAST: '{{.FAST | default ""}}'
```

The new builder has no `--fast` mode; it always does a clean full generate. Replace the whole task with:

```yaml
  docs:build:
    desc: Generate the full static docs site into k3d/docs-content-built/ (pages, assets, search.json)
    cmds:
      - node scripts/build-docs.mjs
```

Apply via Edit on `Taskfile.yml`:
- old_string:
  ```
    docs:build:
      desc: Sync skills HTML, refresh assets (style.css/app.js), rebuild search.json in k3d/docs-content-built/
      cmds:
        - node scripts/build-docs.js {{if .FAST}}--fast{{end}}
      vars:
        FAST: '{{.FAST | default ""}}'
  ```
- new_string:
  ```
    docs:build:
      desc: Generate the full static docs site into k3d/docs-content-built/ (pages, assets, search.json)
      cmds:
        - node scripts/build-docs.mjs
  ```

- [ ] **Step 9: Repoint `docs:deploy`'s builder invocation**

`docs:deploy` calls the builder once (line 2081) before docker build/push + per-cluster rollout. Only that one line changes; the docker/kubectl logic stays identical.

Current line 2081:

```yaml
        node scripts/build-docs.js
```

Apply via Edit on `Taskfile.yml`:
- old_string:
  ```
          # Build and push once — both clusters use the same image content
          node scripts/build-docs.js
          SHARED_IMAGE="ghcr.io/paddione/workspace-docs"
  ```
- new_string:
  ```
          # Build and push once — both clusters use the same image content
          node scripts/build-docs.mjs
          SHARED_IMAGE="ghcr.io/paddione/workspace-docs"
  ```

- [ ] **Step 10: Repoint `docs:refresh-diagrams` to a full build (no `--rebuild-page`)**

Per the migration decision, `docs:refresh-diagrams` regenerates `docs/db-schema-diagram.md` and then runs a NORMAL full build (the generator renders `db-schema-diagram.md` and overrides its slug to `db-schema.html`). Replace the `--rebuild-page` step.

Current second `cmds` block (lines 2112–2114):

```yaml
      - |
        echo "→ Rebuilding db-schema.html from generated MD..."
        node scripts/build-docs.js --rebuild-page db-schema docs/db-schema-diagram.md
```

Apply via Edit on `Taskfile.yml`:
- old_string:
  ```
        - |
          echo "→ Rebuilding db-schema.html from generated MD..."
          node scripts/build-docs.js --rebuild-page db-schema docs/db-schema-diagram.md
        - task: docs:deploy
  ```
- new_string:
  ```
        - |
          echo "→ Rebuilding the docs site (db-schema.html comes from the regenerated MD)..."
          node scripts/build-docs.mjs
        - task: docs:deploy
  ```

- [ ] **Step 11: Repoint `datamodel:build` to write into `docs/legacy-html/` (not OUT_DIR)**

Per the migration decision, `datamodel:build` must write its generated HTML into the committed source dir `docs/legacy-html/datamodel-workflow.html` so it survives a clean rebuild (the full build copies it verbatim as a passthrough). The `--rebuild-page` flag still exists for the diagram fast-path, but its output target changes to the legacy source dir.

Current line 1178:

```yaml
        node scripts/build-docs.js --rebuild-page datamodel-workflow /tmp/datamodel-workflow.md
        echo "Written. Review k3d/docs-content-built/datamodel-workflow.html, commit + task docs:deploy."
```

Apply via Edit on `Taskfile.yml`:
- old_string:
  ```
          node scripts/build-docs.js --rebuild-page datamodel-workflow /tmp/datamodel-workflow.md
          echo "Written. Review k3d/docs-content-built/datamodel-workflow.html, commit + task docs:deploy."
  ```
- new_string:
  ```
          node scripts/build-docs.mjs --rebuild-page datamodel-workflow /tmp/datamodel-workflow.md --out docs/legacy-html/datamodel-workflow.html
          echo "Written docs/legacy-html/datamodel-workflow.html (passthrough source). Commit it, then: task docs:build && task docs:deploy."
  ```

> Note for the entry implementer (Task 8): `--rebuild-page <slug> <mdfile>` accepts an optional `--out <relPath>` override; when present it writes to that repo-relative path instead of `OUT_DIR/<slug>.html`. `datamodel:build` relies on this to land the file under `docs/legacy-html/`. If Task 8 did not implement `--out`, add it there — this Taskfile line is the only consumer.

- [ ] **Step 12: Verify the Taskfile still parses (dry-run gate)**

The `test:dry-run` task (a dep of `test:all`) parses every task. Confirm the four edits did not break YAML/templating:

```bash
npx task --list-all >/dev/null && echo "TASKFILE_OK"
```

Expected:

```
TASKFILE_OK
```

(If `task` is not on PATH, use `task --list-all >/dev/null && echo TASKFILE_OK`. A YAML error prints a parse failure and a non-zero exit instead of `TASKFILE_OK`.)

- [ ] **Step 13: Add the `test:docs-gen` Taskfile task**

Add a dedicated task that runs all docs-gen unit suites plus the build smoke test. Place it immediately after `test:dry-run` ends and before `test:all` (so `test:all` can reference it). It runs `node --test` directly so it works in CI without npm.

Apply via Edit on `Taskfile.yml`:
- old_string:
  ```
          echo "Dry-run: All tasks parsed successfully"

    test:all:
  ```
- new_string:
  ```
          echo "Dry-run: All tasks parsed successfully"

    test:docs-gen:
      desc: "Run the docs-site generator unit tests + full-build smoke test (node:test)"
      cmds:
        - node --test scripts/docs-gen/*.test.mjs scripts/docs-gen/build-smoke.test.mjs

    test:all:
  ```

- [ ] **Step 14: Add `test:docs-gen` to the `test:all` deps list (CI acceptance criterion)**

This is the change that makes the new unit tests actually run in CI, since `.github/workflows/ci.yml` runs `task test:all`. Append `test:docs-gen` to the deps list.

Current `test:all` deps (lines 341–346):

```yaml
    deps:
      - test:unit
      - test:manifests
      - test:art-library
      - test:menu-gate
      - test:dry-run
```

Apply via Edit on `Taskfile.yml`:
- old_string:
  ```
      deps:
        - test:unit
        - test:manifests
        - test:art-library
        - test:menu-gate
        - test:dry-run
  ```
- new_string:
  ```
      deps:
        - test:unit
        - test:manifests
        - test:art-library
        - test:menu-gate
        - test:dry-run
        - test:docs-gen
  ```

Also update the `desc` so the listing reflects the new dep. Apply via Edit on `Taskfile.yml`:
- old_string:
  ```
    test:all:
      desc: "Run all offline tests: unit + manifests + art-library + menu-gate + dry-run"
  ```
- new_string:
  ```
    test:all:
      desc: "Run all offline tests: unit + manifests + art-library + menu-gate + dry-run + docs-gen"
  ```

- [ ] **Step 15: Remove the `docs:sync-skills` task (superseded)**

`sync-skill-docs.mjs` is removed in Step 18; its only task wrapper must go too, or `test:dry-run` will pass but the task would invoke a missing script.

Apply via Edit on `Taskfile.yml`:
- old_string:
  ```
    docs:sync-skills:
      desc: Auto-generate missing docs/skills/*.html from .claude/skills/**/SKILL.md and patch skills-overview sidebar
      cmds:
        - node scripts/sync-skill-docs.mjs

    docs:build:
  ```
- new_string:
  ```
    docs:build:
  ```

- [ ] **Step 16: Repoint the tagged-release workflow `.github/workflows/build-docs.yml`**

The `docs-v*` tag build also calls the old builder (line 32). Repoint it so a tagged release builds with the new generator.

Current line 32:

```yaml
          node scripts/build-docs.js
```

Apply via Edit on `.github/workflows/build-docs.yml`:
- old_string:
  ```
        run: |
          npm install
          node scripts/build-docs.js
  ```
- new_string:
  ```
        run: |
          npm install
          node scripts/build-docs.mjs
  ```

- [ ] **Step 17: Verify Taskfile + workflow grep clean of the old builder, and `test:docs-gen` is wired**

```bash
grep -rn "build-docs.js\|sync-skill-docs\|docs:sync-skills" Taskfile.yml .github/workflows/build-docs.yml ; echo "grep_rc=$?"
grep -n "test:docs-gen" Taskfile.yml
```

Expected: the first `grep` finds NOTHING (so `grep_rc=1`), and the second prints two hits (the task definition line and the `test:all` dep line):

```
grep_rc=1
  test:docs-gen:
        - test:docs-gen
```

- [ ] **Step 18: `git rm` the superseded scripts and the redundant generated docs tree**

The new generator emits skills/agents/plugins directly, so the committed `docs/skills/` HTML tree, `docs/skills-overview.html`, the old builder, its stale test, and the buggy skill-sync script are all redundant.

```bash
git rm scripts/build-docs.js scripts/build-docs.test.js scripts/sync-skill-docs.mjs
git rm docs/skills-overview.html
git rm -r docs/skills
git status --short
```

Expected `git status --short` shows the deletions staged (19 lines: 16 `docs/skills/*.html` + `docs/skills-overview.html` + 3 scripts):

```
D  docs/skills-overview.html
D  docs/skills/arena-brett-deploy.html
... (14 more docs/skills/*.html) ...
D  scripts/build-docs.js
D  scripts/build-docs.test.js
D  scripts/sync-skill-docs.mjs
```

> Do NOT remove `k3d/docs-content-built/` assets here — that OUT_DIR cleanup and the `git mv` of the ~46 legacy pages into `docs/legacy-html/` belong to the legacy-migration task, not this wiring task.

- [ ] **Step 19: Commit the Taskfile, workflow, and removals**

```bash
git add Taskfile.yml .github/workflows/build-docs.yml
git commit -m "chore(docs-gen): repoint Taskfile/CI to build-docs.mjs, wire test:docs-gen into test:all, drop legacy builder

- Taskfile: docs:build/docs:deploy/docs:refresh-diagrams -> node scripts/build-docs.mjs
- datamodel:build now writes docs/legacy-html/datamodel-workflow.html (--out) so it survives a clean rebuild
- add task test:docs-gen (node --test scripts/docs-gen/*.test.mjs + build-smoke) and add it to test:all deps (runs in CI)
- remove docs:sync-skills task
- build-docs.yml (docs-v* tag build): node scripts/build-docs.mjs
- git rm scripts/build-docs.js, scripts/build-docs.test.js, scripts/sync-skill-docs.mjs, docs/skills-overview.html, docs/skills/

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 20: Verify — `task test:docs-gen` passes (the new suites run green)**

```bash
npx task test:docs-gen
```

Expected (counts depend on how many `*.test.mjs` modules Tasks 2–8 shipped; the gate is zero failures):

```
task: [test:docs-gen] node --test scripts/docs-gen/*.test.mjs scripts/docs-gen/build-smoke.test.mjs
...
# tests <N>
# pass <N>
# fail 0
```

- [ ] **Step 21: Verify — `task test:all` runs the docs-gen suites (acceptance criterion)**

This is the explicit acceptance criterion "Unit tests pass under task test:all". Run the full offline suite and confirm the `test:docs-gen` dep executed and passed:

```bash
npx task test:all 2>&1 | tee /tmp/test-all.log ; grep -E "test:docs-gen|# fail" /tmp/test-all.log
```

Expected: the `test:docs-gen` task line appears in the run AND no failing tests:

```
task: [test:docs-gen] node --test scripts/docs-gen/*.test.mjs scripts/docs-gen/build-smoke.test.mjs
# fail 0
```

If `test:docs-gen` does NOT appear in the output, the deps wiring in Step 14 is wrong — fix it; the criterion is not met until this task line runs as part of `test:all`.

- [ ] **Step 22: Verify — a real full local build produces the expected OUT_DIR contents**

```bash
node scripts/build-docs.mjs
ls k3d/docs-content-built/index.html k3d/docs-content-built/skills.html k3d/docs-content-built/agents.html k3d/docs-content-built/docs.html k3d/docs-content-built/style.css k3d/docs-content-built/app.js k3d/docs-content-built/search.json
echo "--- skill pages ---"; ls k3d/docs-content-built/skills/ | head
echo "--- agent pages ---"; ls k3d/docs-content-built/agents/
echo "--- rewrapped legacy (bare slug) ---"; ls k3d/docs-content-built/architecture.html k3d/docs-content-built/keycloak.html k3d/docs-content-built/db-schema.html
```

Expected: every `ls` resolves without "No such file", the build report (printed by `build-docs.mjs`) shows page counts by type, unresolved cross-refs, diagram fallbacks (>0 since `dot`/`mmdc` may be unavailable — fallbacks are graceful, not a failure), skipped plugin sources, and legacy rewrapped-vs-copied + passthrough counts. The agents directory lists all six `bachelorprojekt-*.html`.

- [ ] **Step 23: Verify — eyeball a rewrapped legacy page and an agent page (full description present)**

```bash
echo "=== rewrapped legacy: architecture.html (editorial shell + TOC) ==="
grep -c "toc\|copy-button\|editorial" k3d/docs-content-built/architecture.html
echo "=== agent: full multi-line description NOT truncated to '>' ==="
grep -o "description[^<]\{0,80\}" k3d/docs-content-built/agents/bachelorprojekt-ops.html | head
```

Expected: `architecture.html` shows non-zero hits for the editorial-shell markers (it was re-wrapped through `templates.renderPage` + `postProcess`), and the agent grep shows real prose after "description" — NOT a lone `>` (proving the gray-matter block-scalar fix from the frontmatter task). If the agent grep shows only `>` or an empty description, the truncation bug is not fixed and you must return to the frontmatter/discover tasks.

- [ ] **Step 24: Confirm working tree is clean after the build verification**

The full build writes into the not-yet-migrated `k3d/docs-content-built/` (legacy migration is a separate task). For THIS wiring task, ensure no source-tracked file was left dirty by the verification beyond expected build output:

```bash
git status --short
```

Expected: only generated `k3d/docs-content-built/**` changes (and `package-lock.json` if `npm install` created/updated it) appear — no stray edits to `Taskfile.yml`, `package.json`, or `.github/`. If `package-lock.json` is newly created, stage and amend it into the Step 7 commit (or commit it separately):

```bash
git add package-lock.json && git commit -m "chore(docs-gen): commit package-lock.json after gray-matter install

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 25: Deploy note (DO NOT run automatically — post-merge step)**

After this plan is merged to `main`, ship the regenerated docs site to both brands. This is a manual, post-merge operation; it is NOT part of plan execution or CI.

```bash
# Post-merge only. Builds the new generator, builds+pushes ghcr.io/paddione/workspace-docs:latest,
# then kubectl apply + rollout restart deployment/docs on context `fleet` for both namespaces.
task docs:deploy
```

Expected tail of a successful deploy:

```
✓ Docs deployed to both clusters via Docker image
  https://docs.korczewski.de
  https://docs.mentolder.de
```

Verification after deploy: load `https://docs.mentolder.de` (and `…korczewski.de`) behind oauth2-proxy, open an agent page, and confirm the full multi-line description renders. Acceptance for the whole plan: `task test:all` green in CI (Step 21) and both docs sites serving the regenerated, full-description pages.

---

**Notes / extra references surfaced while reading (for the executor):**
- `.github/workflows/build-docs.yml` line 32 had a SECOND reference to `scripts/build-docs.js` beyond the Taskfile — Step 16 repoints it. Without that, a `docs-v*` tag build would fail post-removal. (`ci.yml` does NOT reference the builder directly; it only runs `task test:all`, which is why Step 14 is the load-bearing CI wiring.)
- `package.json` `scripts.test:track-pr` references `scripts/track-pr.test.mjs`, which does not exist in the worktree. It is pre-existing breakage unrelated to docs-gen and is intentionally left untouched by this task.
- The new builder has no `--fast` mode; Step 8 drops the `{{if .FAST}}--fast{{end}}` templating and the `FAST` var. The single `--rebuild-page` fast-path is preserved (Step 11) with the new `--out` override for the datamodel passthrough.

---

## Manual Verification

Run these steps from the worktree root (`/tmp/wt-docs-html-generator`) after every task in this plan is committed. Each item is a hard gate — do not claim the plan complete until all pass.

- [ ] **Install dependencies cleanly.** `node_modules` is not present yet, and this plan adds the `gray-matter` devDependency.
  ```bash
  cd /tmp/wt-docs-html-generator && npm install
  ```
  Expect: install succeeds, `gray-matter` resolved, `node_modules/.bin/mmdc` present. No `ERESOLVE`/peer errors.

- [ ] **Offline test suite is green, including the new docs-gen suite.** This is the spec's "Unit tests pass under `task test:all`" criterion.
  ```bash
  cd /tmp/wt-docs-html-generator && task test:all
  ```
  Expect: the suite runs `test:docs-gen` (newly added to the `test:all` deps), which runs `node --test scripts/docs-gen/*.test.mjs` plus the entry/build smoke test. All pass; no skipped/failing node:test files.

- [ ] **Run the docs-gen suite directly** (faster feedback than the full umbrella).
  ```bash
  cd /tmp/wt-docs-html-generator && task test:docs-gen
  ```
  Expect: every `scripts/docs-gen/<module>.test.mjs` and the build smoke test report `pass`, `0 fail`.

- [ ] **Run a full build and read the build report.**
  ```bash
  cd /tmp/wt-docs-html-generator && node scripts/build-docs.mjs
  ```
  Expect: a printed build report with page counts by type (skill / agent / doc / legacy / landing+section indexes), unresolved cross-refs (a small number is acceptable — spec says fail-soft), diagram fallbacks (non-zero, because `dot` is absent and likely all mermaid renders if `mmdc` works — note the count), skipped plugin sources (logged if the plugins root is absent on this machine), and legacy `rewrapped` vs `copied` counts plus the passthrough list. Build exits 0.

- [ ] **Confirm `task docs:build` invokes the new entry** (parity with `npm run build:docs`).
  ```bash
  cd /tmp/wt-docs-html-generator && task docs:build && npm run build:docs
  ```
  Expect: both succeed and call `scripts/build-docs.mjs` (not the deleted `scripts/build-docs.js`).

- [ ] **Open the landing page.** Open `k3d/docs-content-built/index.html` in a browser. Expect: an editorial card-grid landing covering all four source types (Plan 1 ships the card grid; the interactive graph is Plan 2). Provenance badges (`repo` vs `plugin@version`) are visible on cards. Ctrl/Cmd-K opens the search overlay and finds pages from `search.json`.

- [ ] **Open a repo skill page** at `k3d/docs-content-built/skills/<x>.html` (e.g. an existing repo skill). Expect: editorial theme, a `repo` provenance badge, working TOC, heading anchor IDs, copy buttons on code blocks, and any `[[name]]` / relative links rewritten to pill cross-links.

- [ ] **Open a plugin skill page** at `k3d/docs-content-built/skills/<pluginSlug>--<x>.html` (only if the plugins root exists on this machine). Expect: a `plugin@version` provenance badge and the editorial theme. If the plugins root is absent, confirm the build report logged the skip and no plugin skill pages were emitted — the build must still have succeeded.

- [ ] **Verify the block-scalar fix on an agent page** at `k3d/docs-content-built/agents/bachelorprojekt-website.html`. This is the spec's "Agent `description: >` block scalars render fully (no truncation)" criterion and the headline bug. Expect: the FULL multi-line agent description renders — not just `>`. Spot-check the other five `bachelorprojekt-*` agent pages the same way.
  ```bash
  cd /tmp/wt-docs-html-generator && grep -c '>' k3d/docs-content-built/agents/bachelorprojekt-website.html
  ```
  Cross-check that the rendered description text matches multiple lines of the source `.claude/agents/bachelorprojekt-website.md` `description: >` block, not a single `>` character.

- [ ] **Open a rewrapped legacy page** at `k3d/docs-content-built/keycloak.html`. Expect: the bare-slug URL is unchanged from today; the page now wears the editorial shell; TOC, copy buttons, cross-links, and search all work. Spot-check 2-3 more rewrapped legacy pages (e.g. `architecture.html`, `nextcloud.html`).

- [ ] **Confirm passthrough and db-schema render.** Open `k3d/docs-content-built/datamodel-workflow.html` (verbatim passthrough — large/machine-generated, copied not rewrapped) and `k3d/docs-content-built/db-schema.html` (rendered from `docs/db-schema-diagram.md` but slug-overridden to `db-schema.html`). Expect: both render and load; `datamodel-workflow.html` appears in the build report's passthrough list; `db-schema.html` carries the editorial theme.

- [ ] **Confirm the one-time legacy migration landed in git.** Expect: the ~46 hand-built content pages now live in `docs/legacy-html/` (committed via `git mv`), and OUT_DIR no longer contains hand-built source — it is fully generated.
  ```bash
  cd /tmp/wt-docs-html-generator && ls docs/legacy-html/ | wc -l && git log --oneline -- docs/legacy-html/ | head
  ```
  Expect: legacy dir populated; `index.html`, `skills-overview.html`, the `skills/` dir, and `style.css`/`app.js`/`search.json` were NOT moved (those are regenerated/assets).

- [ ] **Confirm no orphaned references to the removed scripts remain.** This covers the spec's "`scripts/build-docs.js` is removed; `npm run build:docs` and `task docs:deploy` invoke the new entry" criterion.
  ```bash
  cd /tmp/wt-docs-html-generator && grep -rn --include='*.js' --include='*.mjs' --include='*.json' --include='*.yml' --include='*.yaml' -e 'build-docs\.js' -e 'sync-skill-docs' . | grep -v node_modules
  ```
  Expect: NO matches. Also confirm the files are gone:
  ```bash
  cd /tmp/wt-docs-html-generator && test ! -f scripts/build-docs.js && test ! -f scripts/sync-skill-docs.mjs && echo "removed OK"
  ```

- [ ] **Confirm the `--rebuild-page` fast-path and diagram tasks survive a clean rebuild.**
  ```bash
  cd /tmp/wt-docs-html-generator && task datamodel:build && test -f docs/legacy-html/datamodel-workflow.html && echo "datamodel landed in source dir"
  ```
  Expect: `datamodel:build` writes its generated HTML into `docs/legacy-html/datamodel-workflow.html` (NOT OUT_DIR), so a subsequent clean `node scripts/build-docs.mjs` re-emits it via passthrough. Confirm `task docs:refresh-diagrams` regenerates `docs/db-schema-diagram.md` then runs a normal full build.

- [ ] **Manifest/deploy contract unchanged.** Confirm `scripts/docs.Dockerfile` still `COPY k3d/docs-content-built /public` and `k3d/docs.yaml` keeps `readOnlyRootFilesystem: true` with no volume mounts — the build emits static files only, nothing relies on a writable runtime fs. (The actual `task docs:deploy` image build/push/rollout against `fleet` is run by the human reviewer, not in CI; spec criterion "`task docs:deploy` ships the new output … unchanged" is satisfied by leaving the deploy task and image contract untouched.)

## Acceptance Criteria

Each spec bullet (under "Acceptance criteria" in `docs/superpowers/specs/2026-05-31-docs-html-generator-design.md`) mapped to the CORE-plan task(s) that satisfy it. Graph-specific criteria are explicitly owned by Plan 2.

- [ ] **"`npm run build:docs` produces a site in `k3d/docs-content-built/` covering all four source types with provenance badges."** — `discover.mjs` (locates repo skills, plugin skills, repo agents, plugin agents, docs; `resolveProvenance` tags `repo` / `<plugin>@<version>`) + `registry.mjs` (`buildPages` derives provenance/domain/outRelPath) + `templates.mjs` (`provenanceBadge`) + the `build-docs.mjs` entry (full build → cleans & regenerates OUT_DIR) + the package.json/Taskfile wiring task that repoints `build:docs` and `docs:build` to `scripts/build-docs.mjs`. Owned by the **discover, registry, templates, entry, and wiring tasks** of this plan.

- [ ] **"Landing page is the interactive domain-clustered graph (hover-highlight, click-nav, zoom/pan); layout is deterministic across runs."** — **OWNED BY PLAN 2** (`graph-data.mjs`, `graph-layout.mjs`, `graph-svg.mjs`, the `graphJs()` extension to `theme.mjs`, and the `renderLanding` override in `templates.mjs`). This CORE plan ships an editorial card-grid landing via `templates.renderLanding` as the placeholder; Plan 2 overrides it to embed the deterministic graph SVG. Not satisfied by CORE alone — do not check this on the CORE plan.

- [ ] **"Skill/agent/doc pages render in the editorial style with working cross-links, search, copy buttons, and rendered mermaid + Graphviz diagrams (graceful fallback when a renderer is missing)."** — `render-markdown.mjs` (`renderMarkdown` + `renderDiagrams`/`addHeadingIds`/`buildToc`/`injectCopyButtons`/`rewriteCrossLinks`, mermaid via `mmdc` with `pre.mermaid-fallback` fallback, dot fallback by default since `dot` is absent) + `theme.mjs` (`editorialCss`, `clientJs` search overlay + copy buttons) + `templates.mjs` (`renderPage`) + `registry.mjs` (`collectEdges`, `resolve`). Owned by the **render-markdown, theme, templates, and registry tasks**.

- [ ] **"Agent `description: >` block scalars render fully (no truncation)."** — `frontmatter.mjs` (`parseFrontmatter` wraps `gray-matter`, block-scalar safe; `deriveTitle`). The six `bachelorprojekt-*` agents are the explicit truncation-bug fixtures; the `frontmatter` task's tests assert the full multi-line description, not `>`. Owned by the **frontmatter task** (consumed by registry + templates).

- [ ] **"`task docs:deploy` ships the new output to `docs.mentolder.de` (and korczewski) unchanged."** — the package.json/Taskfile wiring task: `docs:deploy` continues to call the builder (now `scripts/build-docs.mjs`) then build/push `ghcr.io/paddione/workspace-docs:latest` and `kubectl apply` + rollout on `fleet` for both brands; the Dockerfile/`k3d/docs.yaml` static contract is untouched. Owned by the **Taskfile/package.json wiring task**.

- [ ] **"`scripts/build-docs.js` is removed; `npm run build:docs` and `task docs:deploy` invoke the new entry."** — the removal + wiring task: `git rm scripts/build-docs.js` and `scripts/sync-skill-docs.mjs`, repoint `package.json` (`build:docs`, `test:build-docs`) and `Taskfile.yml` (`docs:build`, `docs:deploy`, `docs:refresh-diagrams`, `datamodel:build`) to `scripts/build-docs.mjs`, and drop the now-redundant generated `docs/skills/` tree + `docs/skills-overview.html`. Owned by the **removal/wiring task** (verified by the grep in Manual Verification).

- [ ] **"Unit tests pass under `task test:all`."** — the CI-wiring task: add `test:docs-gen` (`node --test scripts/docs-gen/*.test.mjs` plus the entry/build smoke test) to `Taskfile.yml` and add it to the `test:all` deps list, closing the CI gap where `scripts/*.test.*` were orphaned (CI only runs `task test:all`). Owned by the **CI-wiring task**; every preceding module task contributes its `scripts/docs-gen/<module>.test.mjs` suite.

## Notes / Out of scope

- **The interactive graph landing is Plan 2, not this CORE plan.** This plan ships `templates.renderLanding` as an editorial card-grid landing so `index.html` is complete and navigable. Plan 2 adds `graph-data.mjs`, `graph-layout.mjs`, `graph-svg.mjs`, extends `theme.mjs` with `graphJs()` + graph CSS, and overrides `renderLanding` to embed the deterministic graph SVG with a `<noscript>` section fallback. The spec's "interactive domain-clustered graph landing / deterministic layout" acceptance criterion is therefore satisfied only after Plan 2 — do not check it against CORE.
- **`docs/superpowers/specs/` and `docs/superpowers/plans/` are intentionally excluded** from source discovery (user decision — internal process artifacts). `discover.mjs` must skip both subtrees entirely even though they live under `docs/`. The remaining `docs/**/*.md` set is sparse (root: `WSL-BOOTSTRAP.md`, `fleet-stage2-cutover-runbook.md`, `db-schema-diagram.md`, `systemtest-fragebogen.md`; plus `docs/website/`, `docs/dev-stack/`, `docs/db-audit/`).
- **The `dot` (Graphviz) binary is not installed locally**, and there are currently zero fenced `dot`/`graphviz` blocks in the sources. So Graphviz diagrams fall back to a styled code block by default and the build report will record those fallbacks. The dot render path is still implemented (with graceful fallback) for future use. `mmdc` is available at `node_modules/.bin/mmdc` after `npm install`, so the ~40 fenced mermaid blocks should render to inline SVG; any that fail also fall back rather than failing the build.
- **The legacy re-wrap (Option A) may need per-page touch-ups.** The ~46 hand-built pages were originally migrated from Docsify and have no markdown source. `legacy.rewrapLegacyPage` extracts the inner HTML and feeds it through the editorial templates; where a page's markup is too irregular to rewrap cleanly it falls back to `mode: 'copied'` (verbatim). The build report lists every `copied` page so a reviewer can decide whether a manual touch-up is warranted. `datamodel-workflow.html` is an intentional permanent passthrough (its source was an ephemeral `/tmp` file) and is always copied verbatim.
- **Cross-linking stays conservative** (spec decision 10): only explicit `[[name]]`, real relative markdown links between sources, and routing-table edges (the latter feed the Plan 2 graph only). No prose-mention auto-linking. Unresolved `[[name]]` refs render as plain text and are reported, never failing the build.
- **CI runs unit tests but not the full deploy build.** Adding `test:docs-gen` to `test:all` makes the node:test suites run on every PR; the full `task docs:deploy` (image build/push + cluster rollout on `fleet`) remains a human-run, post-merge step and is out of scope for CI here.
