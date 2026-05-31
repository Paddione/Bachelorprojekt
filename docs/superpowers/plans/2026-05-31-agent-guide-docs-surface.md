---
title: AI-Agent Guide S1 — Docs-Site Surface Implementation Plan
ticket_id: T000376
domains: [infra, test]
status: active
pr_number: null
---

# AI-Agent Guide S1 — Docs-Site Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Render the F+B registry as four German pages on the existing docs site (`docs.<domain>`) — three machine-generated lenses (Ziele / Werkzeuge / Bausteine) plus one hand-authored landing — so an inexperienced solo operator can go from *intent* to the *right tool* and the *exact prompt*.

**Architecture:** S1 adds a shared registry reader `scripts/agent-guide/load.mjs` (the one-parse-path contract S2/S3 import) and an emitter `scripts/agent-guide/emit-docs.mjs` that validate-first, then writes deterministic, fence-first Markdown into `docs/agent-guide/`. The existing, unchanged `scripts/build-docs.mjs` pipeline auto-discovers `docs/**/*.md` and renders the four pages to `k3d/docs-content-built/<slug>.html`. A Taskfile pair (`agent-guide:docs` + umbrella `agent-guide:emit`) and a CI `git diff --exit-code` freshness gate (mirroring `test-inventory.json`) keep the generated trio fresh.

**Tech Stack:** Node.js ESM (`*.mjs`), `node --test` (the `*.test.mjs` convention), `yaml@^2.8.3` (root devDependency added by F+B), `gray-matter` + `marked` (existing docs-gen), `go-task` (Taskfile), GitHub Actions CI.

**Spec:** docs/superpowers/specs/2026-05-31-agent-guide-docs-surface-design.md

---

## Prerequisite note (READ FIRST — do not flag as a defect)

This plan depends on sub-project **F+B**, which the spec (§10, R1) declares a **merge prerequisite** and which is **intentionally absent from this worktree** (verified: `scripts/agent-guide/` does not exist and `package.json` has no `yaml` dependency). F+B provides, on `main` at execution time:

- `docs/agent-guide/registry/{taxonomy,guardrails,tools,goals,components}.yaml` — the SSOT.
- `scripts/agent-guide/validate.mjs` exporting `validateRegistry(dir, repoRoot)`.
- root devDependency `yaml@^2.8.3` in `package.json`.
- Taskfile task `test:agent-guide` (globs `scripts/agent-guide/*.test.mjs`, already a dep of `test:all`).

If any of these is missing when you start, **stop and rebase onto a `main` that contains F+B** — do not re-create them. Every *unit* test in this plan uses a **small in-test fixture registry** (not the real one), so Tasks 1–5, 7, 8 and the smoke-test Task 9 are green even before the real registry exists. Only Task 6 ("run the emitter against the real registry") and the real-build verification in Task 11 require F+B to be present.

**Merge order for the program is S1 → S2 → S3.** S1 introduces `load.mjs`; S2/S3 import it and append their leaf task to the `agent-guide:emit` umbrella S1 creates here.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `scripts/agent-guide/load.mjs` | create | Shared one-parse-path reader: `loadRegistry(dir)` → `{goals,tools,components,taxonomy,guardrails}` + `tierFor(id)`/`toolById(id)`/`guardrailById(id)`. S1 owns it; S2/S3 import it. |
| `scripts/agent-guide/load.test.mjs` | create | Unit tests for `loadRegistry` + the three helpers against an in-test fixture registry. |
| `scripts/agent-guide/emit-docs.mjs` | create | The emitter: validate-first, deterministic, fence-first; pure render functions + a `writeDocs()` that writes the generated trio. |
| `scripts/agent-guide/emit-docs.test.mjs` | create | Unit tests: determinism, fence-first line-1, frontmatter contract, id-resolution, wikilink-slug mapping, fail-closed. |
| `docs/agent-guide/00-anleitung.md` | create | HAND-AUTHORED German landing ("Was will ich tun?"); never regenerated. |
| `docs/agent-guide/10-ziele.md` | create (generated) | Lens 1 — goal catalog; committed output of `task agent-guide:docs`. |
| `docs/agent-guide/20-werkzeuge.md` | create (generated) | Lens 2 — tool/agent cards; committed output. |
| `docs/agent-guide/30-bausteine.md` | create (generated) | Lens 3 — platform components; committed output. |
| `scripts/agent-guide/validate.mjs` | modify (OPTIONAL) | Optionally re-route its YAML parsing through `loadRegistry` for a single parse path. |
| `scripts/docs-gen/build-smoke.test.mjs` | modify | Drop the four agent-guide pages + a `bachelorprojekt-website` agent into the fixture repo; assert discovery, `domain: general` resolution, `[[…]]` wikilink resolution incl. `[[bachelorprojekt-website]]`, and the auto-TOC + copy-button affordances. |
| `Taskfile.yml` | modify | Add `agent-guide:docs` + umbrella `agent-guide:emit` (after the `docs:build` block at lines 2009–2012, before `docs:deploy:` at line 2014). |
| `.github/workflows/ci.yml` | modify | Add the freshness `git diff --exit-code` step over the generated trio, right after the test-inventory step (lines 38–44) and before `Validate Systembrett template` (line 46). |

---

## Task 0: Branch & worktree hygiene

**Files:** none (setup only).

- [ ] **Step 1: Confirm you are on the feature branch in the isolated worktree.**
  ```bash
  cd /tmp/wt-agent-guide-docs && git rev-parse --abbrev-ref HEAD
  ```
  Expected: `feature/agent-guide-docs` (or the branch your worktree was created on). If it prints `main`, stop and create a branch: `git switch -c feature/agent-guide-docs`.

- [ ] **Step 2: Pull-first to avoid drift.**
  ```bash
  cd /tmp/wt-agent-guide-docs && git stash --include-untracked 2>/dev/null; git pull --rebase origin main; git stash pop 2>/dev/null || true
  ```
  Expected: `Already up to date.` or a clean rebase. Any untracked SVG snapshot under `docs/mermaid-snapshots/` is harmless.

- [ ] **Step 3: Verify the F+B prerequisite is present.**
  ```bash
  cd /tmp/wt-agent-guide-docs && ls scripts/agent-guide/validate.mjs 2>/dev/null && grep -q '"yaml"' package.json && echo "F+B present" || echo "F+B MISSING — rebase onto a main that contains F+B before continuing"
  ```
  Expected (once F+B is merged): `F+B present`. If it prints `F+B MISSING`, you may still implement and run Tasks 1–5 and 7–9 (they use fixtures), but Task 6 (real-registry emit) and the real-build steps in Task 11 will fail until F+B lands. The Taskfile/CI wiring (Tasks 6, 8, 11) reference `test:agent-guide`, which F+B provides.

---

## Task 1: `load.mjs` — the shared registry reader (the frozen contract)

**Files:**
- Create: `scripts/agent-guide/load.mjs`
- Test: `scripts/agent-guide/load.test.mjs`

This module is the **contract** S2/S3 depend on. `loadRegistry(dir)` returns the five top-level entry arrays **in file order**; `tierFor`/`toolById`/`guardrailById` are pure lookups that take an id and return the entry or `undefined`. The lookups operate on the registry the module last loaded (module-level state set by `loadRegistry`), matching the spec's helper signatures `tierFor(id)` / `toolById(id)` / `guardrailById(id)` (no registry argument).

> **Invariant (last-load-wins).** The three helpers read the registry that `loadRegistry(dir)` last cached at module level. Therefore **every consumer and every test must call `loadRegistry(dir)` before invoking `tierFor`/`toolById`/`guardrailById` in the same test body / call sequence** — exactly as the Task 3/4/5 tests do. `node --test` runs each `*.test.mjs` file in a separate child process, so this module-level cache never bleeds across test files; within a single file the last `loadRegistry` call wins.

- [ ] **Step 1: Write the failing test.** Create `scripts/agent-guide/load.test.mjs`:
  ```js
  // scripts/agent-guide/load.test.mjs
  import { test } from 'node:test';
  import assert from 'node:assert/strict';
  import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
  import { join } from 'node:path';
  import { tmpdir } from 'node:os';
  import { loadRegistry, tierFor, toolById, guardrailById } from './load.mjs';

  /** Write a tiny but complete fixture registry into a fresh temp dir; return the dir. */
  function makeFixtureRegistry() {
    const dir = mkdtempSync(join(tmpdir(), 'agent-guide-load-'));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'taxonomy.yaml'), [
      '- id: safe',
      '  label_de: Sicher',
      '  emoji: "🟢"',
      '  meaning_de: Du kannst nichts kaputt machen.',
      '  doc_treatment: inline',
      '  enforcement_default: none',
      '- id: caution',
      '  label_de: Vorsicht',
      '  emoji: "🟡"',
      '  meaning_de: Schau genau hin.',
      '  doc_treatment: inline',
      '  enforcement_default: warn',
      '',
    ].join('\n'), 'utf8');
    writeFileSync(join(dir, 'guardrails.yaml'), [
      '- id: G-ENV-EXPLICIT',
      '  name_de: Umgebung immer explizit angeben',
      '  rule_de: Gib ENV stets explizit an.',
      '  why_de: Sonst triffst du den falschen Cluster.',
      '  enforced_by: docs',
      '',
    ].join('\n'), 'utf8');
    writeFileSync(join(dir, 'tools.yaml'), [
      '- id: dev-flow-plan',
      '  name_de: Plan erstellen',
      '  kind: skill',
      '  summary_de: Legt einen Plan an.',
      '  what_for_de: Beschreibt dein Ziel.',
      '  how_to_start_de: Sag der KI dein Ziel.',
      '  what_could_go_wrong_de: Nichts Schlimmes.',
      '  danger: safe',
      '  guardrails: [G-ENV-EXPLICIT]',
      '  related: [dev-flow-execute]',
      '  links: []',
      '- id: dev-flow-execute',
      '  name_de: Plan umsetzen',
      '  kind: skill',
      '  summary_de: Setzt den Plan um.',
      '  what_for_de: Öffnet einen PR.',
      '  how_to_start_de: Starte die Umsetzung.',
      '  what_could_go_wrong_de: Ein PR muss reviewt werden.',
      '  danger: caution',
      '  guardrails: []',
      '  related: []',
      '  links: []',
      '',
    ].join('\n'), 'utf8');
    writeFileSync(join(dir, 'goals.yaml'), [
      '- id: change-website-text',
      '  title_de: "Ich will den Text der Website ändern"',
      '  when_de: Wenn du einen Absatz anpassen willst.',
      '  flow:',
      '    - tool: dev-flow-plan',
      '      note_de: beschreibt der KI dein Ziel',
      '    - tool: dev-flow-execute',
      '      note_de: setzt den Plan um',
      '  example_prompt_de: "Ändere den Preis von 90 auf 120."',
      '  danger: safe',
      '  guardrails: [G-ENV-EXPLICIT]',
      '  related: []',
      '',
    ].join('\n'), 'utf8');
    writeFileSync(join(dir, 'components.yaml'), [
      '- slug: keycloak',
      '  kind: software',
      '  name: Keycloak',
      '  emoji: "🔐"',
      '  summary_de: Anmeldung und Single Sign-On.',
      '  what_for_de: Zentrale Anmeldung für alle Dienste.',
      '  placeholder_en: Login provider',
      '  sensitivity: caution',
      '  url: https://www.keycloak.org',
      '  links: []',
      '',
    ].join('\n'), 'utf8');
    return dir;
  }

  test('loadRegistry: returns the five top-level arrays in file order', () => {
    const dir = makeFixtureRegistry();
    try {
      const reg = loadRegistry(dir);
      assert.ok(Array.isArray(reg.taxonomy) && reg.taxonomy.length === 2, 'taxonomy array');
      assert.ok(Array.isArray(reg.guardrails) && reg.guardrails.length === 1, 'guardrails array');
      assert.ok(Array.isArray(reg.tools) && reg.tools.length === 2, 'tools array');
      assert.ok(Array.isArray(reg.goals) && reg.goals.length === 1, 'goals array');
      assert.ok(Array.isArray(reg.components) && reg.components.length === 1, 'components array');
      // file order preserved (no sorting)
      assert.equal(reg.tools[0].id, 'dev-flow-plan');
      assert.equal(reg.tools[1].id, 'dev-flow-execute');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('tierFor / toolById / guardrailById: resolve known ids, undefined for unknown', () => {
    const dir = makeFixtureRegistry();
    try {
      loadRegistry(dir); // last-load-wins: helpers read this registry
      assert.equal(tierFor('safe').label_de, 'Sicher');
      assert.equal(tierFor('caution').emoji, '🟡');
      assert.equal(tierFor('nope'), undefined);

      assert.equal(toolById('dev-flow-plan').name_de, 'Plan erstellen');
      assert.equal(toolById('does-not-exist'), undefined);

      assert.equal(guardrailById('G-ENV-EXPLICIT').name_de, 'Umgebung immer explizit angeben');
      assert.equal(guardrailById('G-NOPE'), undefined);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  ```

- [ ] **Step 2: Run the test, watch it fail.**
  ```bash
  cd /tmp/wt-agent-guide-docs && node --test scripts/agent-guide/load.test.mjs
  ```
  Expected FAIL: `Cannot find module '.../scripts/agent-guide/load.mjs'` (the module does not exist yet).

- [ ] **Step 3: Implement the minimal code.** Create `scripts/agent-guide/load.mjs`:
  ```js
  // scripts/agent-guide/load.mjs
  // The single registry parse path for the agent-guide surfaces (S1 owns it;
  // S2 and S3 import it). Mirrors the inline load(dir,file) of validate.mjs but
  // exposes it once, plus three id->entry lookups. Uses the root yaml@^2.8.3 dep.
  //
  // Invariant: tierFor/toolById/guardrailById read the registry that loadRegistry
  // last cached at module level — call loadRegistry(dir) before using them.
  import { readFileSync } from 'node:fs';
  import { join } from 'node:path';
  import { parse as parseYaml } from 'yaml';

  /** The five registry files, in the canonical order loadRegistry returns them. */
  const FILES = ['taxonomy', 'guardrails', 'tools', 'goals', 'components'];

  /** Module-level cache of the last-loaded registry, so the helpers take only an id. */
  let _registry = { taxonomy: [], guardrails: [], tools: [], goals: [], components: [] };

  /**
   * Parse one registry YAML file into its top-level array. Missing top-level
   * sequence (e.g. an empty file) yields [].
   * @param {string} dir
   * @param {string} name  one of FILES
   * @returns {object[]}
   */
  function loadFile(dir, name) {
    const text = readFileSync(join(dir, `${name}.yaml`), 'utf8');
    const parsed = parseYaml(text);
    return Array.isArray(parsed) ? parsed : [];
  }

  /**
   * Load the whole registry from a directory of *.yaml files.
   * @param {string} dir  path to docs/agent-guide/registry
   * @returns {{ goals: object[], tools: object[], components: object[],
   *             taxonomy: object[], guardrails: object[] }}
   *   Arrays are the parsed top-level entry lists, in file order (no sorting).
   */
  export function loadRegistry(dir) {
    const out = {};
    for (const name of FILES) out[name] = loadFile(dir, name);
    _registry = out;
    return out;
  }

  /** taxonomy entry for an id, or undefined. */
  export function tierFor(id) {
    return _registry.taxonomy.find((t) => t && t.id === id);
  }

  /** tools.yaml entry for an id, or undefined. */
  export function toolById(id) {
    return _registry.tools.find((t) => t && t.id === id);
  }

  /** guardrails.yaml entry for an id, or undefined. */
  export function guardrailById(id) {
    return _registry.guardrails.find((g) => g && g.id === id);
  }
  ```

- [ ] **Step 4: Run the test, watch it pass.**
  ```bash
  cd /tmp/wt-agent-guide-docs && node --test scripts/agent-guide/load.test.mjs
  ```
  Expected PASS: `# pass 2` / `# fail 0`.

- [ ] **Step 5: Commit.**
  ```bash
  cd /tmp/wt-agent-guide-docs && git add scripts/agent-guide/load.mjs scripts/agent-guide/load.test.mjs && git commit -m "feat(agent-guide): add shared registry reader load.mjs [S1]

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 2: Wikilink-slug mapping helper (`slugForToolId`)

**Files:**
- Create: `scripts/agent-guide/emit-docs.mjs` (with this helper first; later tasks append)
- Create: `scripts/agent-guide/emit-docs.test.mjs` (with this test first; later tasks append)

The single load-bearing mapping rule (spec §5, §7.2): emit a wikilink **only** for ids the docs generator will discover. Spine skills `dev-flow-*` keep their id; agents `agent-<x>` map to `bachelorprojekt-<x>`; `task-oracle` and anything else gets `null` (→ plain link).

- [ ] **Step 1: Write the failing test.** Create `scripts/agent-guide/emit-docs.test.mjs`:
  ```js
  // scripts/agent-guide/emit-docs.test.mjs
  import { test } from 'node:test';
  import assert from 'node:assert/strict';
  import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
  import { join } from 'node:path';
  import { tmpdir } from 'node:os';
  import { loadRegistry } from './load.mjs';
  import {
    slugForToolId,
    renderHeader,
    dangerBadge,
    toolLink,
    urlLink,
    renderZiele,
    renderWerkzeuge,
    renderBausteine,
    renderAll,
    writeDocs,
  } from './emit-docs.mjs';

  /**
   * Build the shared fixture registry used by every emit test in this file.
   * Defined ONCE and called directly in each test (no globalThis side-channel),
   * so the file stays correct if it is ever split — node --test isolates files
   * per process, so cross-file globals would not survive anyway.
   * @returns {string} a fresh temp dir holding the five registry YAMLs.
   */
  function makeFixtureRegistry() {
    const dir = mkdtempSync(join(tmpdir(), 'agent-guide-emit-'));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'taxonomy.yaml'), [
      '- id: safe',
      '  label_de: Sicher',
      '  emoji: "🟢"',
      '  meaning_de: Du kannst nichts kaputt machen.',
      '  doc_treatment: inline',
      '  enforcement_default: none',
      '- id: caution',
      '  label_de: Vorsicht',
      '  emoji: "🟡"',
      '  meaning_de: Schau genau hin.',
      '  doc_treatment: inline',
      '  enforcement_default: warn',
      '',
    ].join('\n'), 'utf8');
    writeFileSync(join(dir, 'guardrails.yaml'), [
      '- id: G-ENV-EXPLICIT',
      '  name_de: Umgebung immer explizit angeben',
      '  rule_de: Gib ENV stets explizit an.',
      '  why_de: Sonst triffst du den falschen Cluster.',
      '  enforced_by: docs',
      '',
    ].join('\n'), 'utf8');
    writeFileSync(join(dir, 'tools.yaml'), [
      '- id: dev-flow-plan',
      '  name_de: Plan erstellen',
      '  kind: skill',
      '  summary_de: Legt einen Plan an.',
      '  what_for_de: Beschreibt dein Ziel.',
      '  how_to_start_de: Sag der KI dein Ziel.',
      '  what_could_go_wrong_de: Nichts Schlimmes.',
      '  danger: safe',
      '  guardrails: [G-ENV-EXPLICIT]',
      '  related: [agent-website]',
      '  links: []',
      '- id: agent-website',
      '  name_de: Website-Agent',
      '  kind: agent',
      '  summary_de: Kümmert sich um die Website.',
      '  what_for_de: Frontend-Änderungen.',
      '  how_to_start_de: Beschreibe deine Änderung.',
      '  what_could_go_wrong_de: Layout kann brechen.',
      '  danger: caution',
      '  guardrails: []',
      '  related: []',
      '  links:',
      '    - { label: Website-Standards, url: "https://example.test/std" }',
      '- id: task-oracle',
      '  name_de: Task-Orakel',
      '  kind: task',
      '  summary_de: Findet den richtigen Task.',
      '  what_for_de: Übersetzt Wünsche in Tasks.',
      '  how_to_start_de: Beschreibe dein Ziel.',
      '  what_could_go_wrong_de: Nichts.',
      '  danger: safe',
      '  guardrails: []',
      '  related: []',
      '  links:',
      '    - { label: Quelle, url: "https://example.test/oracle" }',
      '',
    ].join('\n'), 'utf8');
    writeFileSync(join(dir, 'goals.yaml'), [
      '- id: change-website-text',
      '  title_de: "Ich will den Text der Website ändern"',
      '  when_de: Wenn du einen Absatz anpassen willst.',
      '  flow:',
      '    - tool: dev-flow-plan',
      '      note_de: beschreibt der KI dein Ziel',
      '    - tool: agent-website',
      '      note_de: setzt die Änderung um',
      '    - tool: task-oracle',
      '      note_de: findet den passenden Task',
      '  example_prompt_de: "Ändere den Preis von 90 auf 120."',
      '  danger: safe',
      '  guardrails: [G-ENV-EXPLICIT]',
      '  related: []',
      '- id: fix-a-bug',
      '  title_de: "Ich will einen Fehler beheben"',
      '  when_de: Wenn etwas nicht funktioniert.',
      '  flow:',
      '    - tool: dev-flow-plan',
      '      note_de: beschreibt das Problem',
      '  example_prompt_de: "Behebe den Fehler auf der Startseite."',
      '  danger: caution',
      '  guardrails: []',
      '  related: [change-website-text]',
      '',
    ].join('\n'), 'utf8');
    writeFileSync(join(dir, 'components.yaml'), [
      '- slug: keycloak',
      '  kind: software',
      '  name: Keycloak',
      '  emoji: "🔐"',
      '  summary_de: Anmeldung und Single Sign-On.',
      '  what_for_de: Zentrale Anmeldung für alle Dienste.',
      '  placeholder_en: Login provider',
      '  sensitivity: caution',
      '  url: https://www.keycloak.org',
      '  links: []',
      '- slug: gpu-host',
      '  kind: hardware',
      '  name: GPU-Host',
      '  emoji: "🖥️"',
      '  summary_de: Rechnet KI-Modelle lokal.',
      '  what_for_de: Lokale Embeddings und Chat.',
      '  placeholder_en: GPU box',
      '  sensitivity: safe',
      '  url: ""',
      '  links: []',
      '',
    ].join('\n'), 'utf8');
    return dir;
  }

  test('slugForToolId: spine skills keep their id (discoverable SKILL.md slug)', () => {
    for (const id of ['dev-flow-plan', 'dev-flow-execute', 'dev-flow-iterate', 'dev-flow-e2e']) {
      assert.equal(slugForToolId(id), id);
    }
  });

  test('slugForToolId: agents map agent-<x> -> bachelorprojekt-<x>', () => {
    assert.equal(slugForToolId('agent-website'), 'bachelorprojekt-website');
    assert.equal(slugForToolId('agent-ops'), 'bachelorprojekt-ops');
    assert.equal(slugForToolId('agent-infra'), 'bachelorprojekt-infra');
    assert.equal(slugForToolId('agent-test'), 'bachelorprojekt-test');
    assert.equal(slugForToolId('agent-db'), 'bachelorprojekt-db');
    assert.equal(slugForToolId('agent-security'), 'bachelorprojekt-security');
  });

  test('slugForToolId: task-oracle and unknown ids return null (no wikilink)', () => {
    assert.equal(slugForToolId('task-oracle'), null);
    assert.equal(slugForToolId('something-else'), null);
  });

  // makeFixtureRegistry, the fs helpers, and the not-yet-used render imports are
  // exercised by the tasks below (Task 3, 4, 5). They are imported here so each
  // task only APPENDS test() blocks and never edits the import list again.
  export { makeFixtureRegistry };
  ```
  > **Note:** the `export { makeFixtureRegistry }` line at the bottom is harmless in a test file (node --test ignores exports) and lets a future split reuse the helper by import rather than copy. Tasks 3/4/5 call `makeFixtureRegistry()` **directly** — there is no `globalThis` side-channel.

- [ ] **Step 2: Run the test, watch it fail.**
  ```bash
  cd /tmp/wt-agent-guide-docs && node --test scripts/agent-guide/emit-docs.test.mjs
  ```
  Expected FAIL: `Cannot find module '.../scripts/agent-guide/emit-docs.mjs'`.

- [ ] **Step 3: Implement the minimal code.** Create `scripts/agent-guide/emit-docs.mjs` with the full import surface the tests reference and the `slugForToolId` helper. Later tasks append `renderHeader`, the primitives, the lens renderers, and `writeDocs`/`renderAll` — so the imports in the test resolve only once those tasks land. For **this** task, define every named export the test imports as a stub *except* the one under test, so the module parses:
  ```js
  // scripts/agent-guide/emit-docs.mjs
  // S1 docs emitter. Reads the registry via load.mjs, validates first, then
  // renders three deterministic German Markdown pages into docs/agent-guide/.
  // Determinism contract: iterate arrays in file order; no Date/Intl/abs-paths.
  import { tierFor, toolById, guardrailById, loadRegistry } from './load.mjs';
  import { writeFileSync, mkdirSync } from 'node:fs';
  import { join, dirname } from 'node:path';
  import { fileURLToPath } from 'node:url';

  /** The six routing agents whose tools.yaml ids are agent-<x> but whose
   *  discovered page slug is bachelorprojekt-<x>. */
  const AGENT_SUFFIXES = new Set(['website', 'ops', 'infra', 'test', 'db', 'security']);

  /** The four beginner-spine skills whose ids equal their SKILL.md slug. */
  const SPINE_SKILLS = new Set([
    'dev-flow-plan', 'dev-flow-execute', 'dev-flow-iterate', 'dev-flow-e2e',
  ]);

  /**
   * Map a tools.yaml id to the slug the docs generator will discover, or null
   * when no discoverable page exists (→ caller emits a plain link, not [[…]]).
   * @param {string} id
   * @returns {string|null}
   */
  export function slugForToolId(id) {
    if (SPINE_SKILLS.has(id)) return id;
    const m = /^agent-([a-z]+)$/.exec(id || '');
    if (m && AGENT_SUFFIXES.has(m[1])) return `bachelorprojekt-${m[1]}`;
    return null;
  }
  ```
  > The test file imports `renderHeader`, `dangerBadge`, `toolLink`, `urlLink`, `renderZiele`, `renderWerkzeuge`, `renderBausteine`, `renderAll`, `writeDocs` — those tests are only *added* in Tasks 3–5, so they are not yet present in this file. At this task only the three `slugForToolId` tests exist; the missing named exports would make the module's import statement throw `does not provide an export named 'renderHeader'`. To keep Task 2 honestly green in isolation, **trim the test imports to only what Task 2 asserts** by editing the import block of `emit-docs.test.mjs` to:
  > ```js
  > import { slugForToolId } from './emit-docs.mjs';
  > ```
  > and add the remaining named imports back at the top of the file in Task 3 Step 1 (where their tests appear). The `loadRegistry`, fs, and `makeFixtureRegistry` lines stay as written.

- [ ] **Step 4: Run the test, watch it pass.**
  ```bash
  cd /tmp/wt-agent-guide-docs && node --test scripts/agent-guide/emit-docs.test.mjs
  ```
  Expected PASS: `# pass 3` / `# fail 0`.

- [ ] **Step 5: Commit.**
  ```bash
  cd /tmp/wt-agent-guide-docs && git add scripts/agent-guide/emit-docs.mjs scripts/agent-guide/emit-docs.test.mjs && git commit -m "feat(agent-guide): add slugForToolId wikilink mapping [S1]

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 3: Frontmatter header + small render primitives

**Files:**
- Modify: `scripts/agent-guide/emit-docs.mjs`
- Test: `scripts/agent-guide/emit-docs.test.mjs`

This task adds the fence-first frontmatter builder (`renderHeader`) and three small primitives (`dangerBadge`, `toolLink`, `urlLink`) used by every lens. The fence-first ordering is load-bearing (spec §6): line 1 MUST be exactly `---`, and the DO-NOT-EDIT comment is the first **body** line after the closing fence.

- [ ] **Step 1: Write the failing test.** First, restore the full import block at the top of `scripts/agent-guide/emit-docs.test.mjs` — change `import { slugForToolId } from './emit-docs.mjs';` back to the full list:
  ```js
  import {
    slugForToolId,
    renderHeader,
    dangerBadge,
    toolLink,
    urlLink,
    renderZiele,
    renderWerkzeuge,
    renderBausteine,
    renderAll,
    writeDocs,
  } from './emit-docs.mjs';
  ```
  Then append these `test()` blocks (they call `makeFixtureRegistry()` directly — no `globalThis`):
  ```js
  test('renderHeader: line 1 is exactly --- and frontmatter carries the contract keys', () => {
    const header = renderHeader('Ziele — Was will ich tun?', 'Ziele — „Ich will …"');
    const lines = header.split('\n');
    assert.equal(lines[0], '---', 'line 1 is the opening fence');
    assert.ok(header.includes('domain: general'), 'declares domain: general');
    assert.ok(
      header.includes('generated_by: scripts/agent-guide/emit-docs.mjs'),
      'records generated_by',
    );
    // closing fence then the DO-NOT-EDIT comment as the first body line.
    const fenceIdxs = lines.map((l, i) => (l === '---' ? i : -1)).filter((i) => i >= 0);
    assert.equal(fenceIdxs.length, 2, 'exactly two fences');
    const firstBodyLine = lines[fenceIdxs[1] + 1];
    assert.equal(
      firstBodyLine,
      '<!-- DO NOT EDIT — generated by scripts/agent-guide/emit-docs.mjs -->',
      'first body line is the DO-NOT-EDIT comment',
    );
  });

  test('dangerBadge: renders emoji + bold label from the taxonomy via tierFor', () => {
    const dir = makeFixtureRegistry();
    try {
      loadRegistry(dir); // last-load-wins: dangerBadge reads this registry
      assert.equal(dangerBadge('safe'), '🟢 **Sicher**');
      assert.equal(dangerBadge('caution'), '🟡 **Vorsicht**');
      // unknown danger degrades to a visible marker, never a raw blank.
      assert.equal(dangerBadge('mystery'), '⚪ **mystery**');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('toolLink: wikilink for discoverable ids, plain link for task-oracle', () => {
    const dir = makeFixtureRegistry();
    try {
      loadRegistry(dir);
      assert.equal(toolLink('dev-flow-plan'), '[[dev-flow-plan]]');
      assert.equal(toolLink('agent-website'), '[[bachelorprojekt-website]]');
      // task-oracle has no discoverable page → plain [label](url) from its links.
      assert.equal(toolLink('task-oracle'), '[Task-Orakel](https://example.test/oracle)');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('urlLink: renders a markdown link, empty string for blank url', () => {
    assert.equal(urlLink('Keycloak', 'https://www.keycloak.org'), '[Keycloak](https://www.keycloak.org)');
    assert.equal(urlLink('Nichts', ''), '');
  });
  ```

- [ ] **Step 2: Run the test, watch it fail.**
  ```bash
  cd /tmp/wt-agent-guide-docs && node --test scripts/agent-guide/emit-docs.test.mjs
  ```
  Expected FAIL: `The requested module './emit-docs.mjs' does not provide an export named 'renderHeader'`.

- [ ] **Step 3: Implement the minimal code.** Append to `scripts/agent-guide/emit-docs.mjs` (after the `slugForToolId` function). The `tierFor`/`toolById`/`guardrailById` imports already exist at the top of the file (added in Task 2):
  ```js
  /**
   * Build the fence-first frontmatter + DO-NOT-EDIT comment header.
   * Line 1 is exactly "---"; the comment is the FIRST body line (spec §6).
   * @param {string} title  frontmatter title (quoted in YAML)
   * @param {string} h1     the page H1 text (rendered after the comment)
   * @returns {string}  header ending with a trailing newline after the H1
   */
  export function renderHeader(title, h1) {
    return [
      '---',
      `title: ${JSON.stringify(title)}`,
      'domain: general',
      'generated_by: scripts/agent-guide/emit-docs.mjs',
      '---',
      '<!-- DO NOT EDIT — generated by scripts/agent-guide/emit-docs.mjs -->',
      `# ${h1}`,
      '',
    ].join('\n');
  }

  /**
   * Render a danger badge "emoji **label_de**" from a taxonomy id. Unknown ids
   * degrade to "⚪ **<id>**" so a dangling danger ref is visible, never blank.
   * @param {string} dangerId
   * @returns {string}
   */
  export function dangerBadge(dangerId) {
    const tier = tierFor(dangerId);
    if (!tier) return `⚪ **${dangerId}**`;
    return `${tier.emoji} **${tier.label_de}**`;
  }

  /** First links[].url for a tool, or '' when absent. */
  function firstLinkUrl(tool) {
    const links = Array.isArray(tool && tool.links) ? tool.links : [];
    const first = links.find((l) => l && typeof l.url === 'string' && l.url.trim());
    return first ? first.url : '';
  }

  /**
   * Render a tool reference: a [[slug]] wikilink when discoverable, otherwise a
   * plain [name_de](url) link (or the bare name_de when no url exists).
   * @param {string} toolId
   * @returns {string}
   */
  export function toolLink(toolId) {
    const slug = slugForToolId(toolId);
    if (slug) return `[[${slug}]]`;
    const tool = toolById(toolId);
    const label = tool ? tool.name_de : toolId;
    const url = tool ? firstLinkUrl(tool) : '';
    return url ? `[${label}](${url})` : label;
  }

  /**
   * Render a plain markdown link, or '' when the url is blank.
   * @param {string} label
   * @param {string} url
   * @returns {string}
   */
  export function urlLink(label, url) {
    const u = (url || '').trim();
    return u ? `[${label}](${u})` : '';
  }
  ```

- [ ] **Step 4: Run the test, watch it pass.**
  ```bash
  cd /tmp/wt-agent-guide-docs && node --test scripts/agent-guide/emit-docs.test.mjs
  ```
  Expected PASS: all `slugForToolId`, `renderHeader`, `dangerBadge`, `toolLink`, `urlLink` tests green (`# fail 0`). The `renderZiele`/`renderWerkzeuge`/`renderBausteine`/`renderAll`/`writeDocs` imports resolve to `undefined` (not yet exported) but are not yet *called* by any test, so the import does not throw.
  > **If the import throws** `does not provide an export named 'renderZiele'` at this step, your Node version errors on importing a not-yet-exported binding even when unused. In that case, temporarily keep only the imports the current tests use and re-add the rest in Task 4/5 Step 1 (mirroring the Task 2 trim pattern). This is a one-line edit and does not change any assertion.

- [ ] **Step 5: Commit.**
  ```bash
  cd /tmp/wt-agent-guide-docs && git add scripts/agent-guide/emit-docs.mjs scripts/agent-guide/emit-docs.test.mjs && git commit -m "feat(agent-guide): fence-first header + danger/link primitives [S1]

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 4: The three lens renderers (`renderZiele` / `renderWerkzeuge` / `renderBausteine`)

**Files:**
- Modify: `scripts/agent-guide/emit-docs.mjs`
- Test: `scripts/agent-guide/emit-docs.test.mjs`

Pure functions that take the loaded registry object and return a Markdown string. They iterate arrays in **file order** (no sorting), resolve danger/tool/guardrail ids through the helpers, and emit the fence-first header. The tests assert id-resolution (no raw dangling id), the `[[…]]`-target-is-discoverable invariant, and the task-oracle-is-a-plain-link invariant. Each test calls `makeFixtureRegistry()` directly.

- [ ] **Step 1: Write the failing test.** Append to `scripts/agent-guide/emit-docs.test.mjs`:
  ```js
  /** The set of slugs the docs generator WILL discover (for membership checks). */
  const DISCOVERABLE = new Set([
    'dev-flow-plan', 'dev-flow-execute', 'dev-flow-iterate', 'dev-flow-e2e',
    'bachelorprojekt-website', 'bachelorprojekt-ops', 'bachelorprojekt-infra',
    'bachelorprojekt-test', 'bachelorprojekt-db', 'bachelorprojekt-security',
    '00-anleitung', '10-ziele', '20-werkzeuge', '30-bausteine',
  ]);

  /** Pull every [[target]] (ignoring |alias and #anchor) out of a markdown string. */
  function wikilinkTargets(md) {
    const re = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g;
    const out = [];
    let m;
    while ((m = re.exec(md)) !== null) out.push(m[1].trim());
    return out;
  }

  test('renderZiele: fence-first, resolves ids, every wikilink target is discoverable', () => {
    const dir = makeFixtureRegistry();
    try {
      const reg = loadRegistry(dir);
      const md = renderZiele(reg);
      assert.equal(md.split('\n')[0], '---', 'line 1 is the fence');
      assert.ok(md.includes('## Ich will den Text der Website ändern'), 'goal H2 present');
      assert.ok(md.includes('🟢 **Sicher**'), 'danger badge resolved');
      assert.ok(md.includes('Umgebung immer explizit angeben'), 'guardrail name resolved');
      // flow tools: dev-flow-plan → wikilink, agent-website → mapped wikilink, task-oracle → plain link
      assert.ok(md.includes('[[dev-flow-plan]]'), 'spine skill wikilinked');
      assert.ok(md.includes('[[bachelorprojekt-website]]'), 'agent id mapped + wikilinked');
      assert.ok(md.includes('[Task-Orakel](https://example.test/oracle)'), 'task-oracle is a plain link');
      assert.ok(!md.includes('[[task-oracle]]'), 'task-oracle is NEVER a wikilink');
      assert.ok(!md.includes('[[agent-website]]'), 'raw agent id is NEVER emitted as a wikilink');
      // the verbatim prompt lives in a fenced text block (Copy button hook, spec §6)
      assert.ok(md.includes('```text\nÄndere den Preis von 90 auf 120.\n```'), 'prompt fenced');
      for (const t of wikilinkTargets(md)) {
        assert.ok(DISCOVERABLE.has(t), `wikilink [[${t}]] is discoverable`);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('renderWerkzeuge: cards for every tool; task-oracle stays a plain link', () => {
    const dir = makeFixtureRegistry();
    try {
      const reg = loadRegistry(dir);
      const md = renderWerkzeuge(reg);
      assert.equal(md.split('\n')[0], '---', 'line 1 is the fence');
      assert.ok(md.includes('## Plan erstellen'), 'tool card present');
      assert.ok(md.includes('## Task-Orakel'), 'task-oracle card present');
      assert.ok(md.includes('Skill'), 'kind pill rendered');
      assert.ok(md.includes('Nichts Schlimmes.'), 'what_could_go_wrong rendered');
      // related on dev-flow-plan points to agent-website → mapped wikilink
      assert.ok(md.includes('[[bachelorprojekt-website]]'), 'related agent mapped');
      for (const t of wikilinkTargets(md)) {
        assert.ok(DISCOVERABLE.has(t), `wikilink [[${t}]] is discoverable`);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('renderBausteine: software-first then hardware; sensitivity badge resolved', () => {
    const dir = makeFixtureRegistry();
    try {
      const reg = loadRegistry(dir);
      const md = renderBausteine(reg);
      assert.equal(md.split('\n')[0], '---', 'line 1 is the fence');
      assert.ok(md.includes('## 🔐 Keycloak'), 'software component header');
      assert.ok(md.includes('## 🖥️ GPU-Host'), 'hardware component header');
      assert.ok(md.includes('🟡 **Vorsicht**'), 'sensitivity badge resolved');
      // software before hardware regardless of file order
      assert.ok(md.indexOf('Keycloak') < md.indexOf('GPU-Host'), 'software listed first');
      // url rendered as a plain link; blank url omitted (GPU-Host has url: "")
      assert.ok(md.includes('[Keycloak](https://www.keycloak.org)'), 'component url link');
      assert.ok(wikilinkTargets(md).length === 0, 'bausteine has no wikilinks');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  ```

- [ ] **Step 2: Run the test, watch it fail.**
  ```bash
  cd /tmp/wt-agent-guide-docs && node --test scripts/agent-guide/emit-docs.test.mjs
  ```
  Expected FAIL: `does not provide an export named 'renderZiele'`.

- [ ] **Step 3: Implement the minimal code.** Append to `scripts/agent-guide/emit-docs.mjs`:
  ```js
  /** Kind id → German pill label. */
  const KIND_LABEL = { skill: 'Skill', agent: 'Agent', task: 'Task' };

  /**
   * Render a comma-separated list of guardrail names from ids; '' when none.
   * Unknown ids fall back to the raw id so a dangling ref is visible.
   * @param {string[]} ids
   * @returns {string}
   */
  function guardrailNames(ids) {
    const list = Array.isArray(ids) ? ids : [];
    if (list.length === 0) return '';
    return list.map((id) => {
      const g = guardrailById(id);
      return g ? `${g.name_de} (${id})` : id;
    }).join(', ');
  }

  /**
   * Lens 1 — the goal catalog (10-ziele.md). One H2 per goal in file order.
   * H2 (`## `) is mandatory so the docs generator builds the on-page TOC from
   * ≥2 H2 headings (spec §6); the prompt goes in a ```text fence so the
   * generator attaches a Copy button.
   * @param {{goals: object[]}} reg
   * @returns {string}
   */
  export function renderZiele(reg) {
    const parts = [renderHeader('Ziele — Was will ich tun?', 'Ziele — „Ich will …"')];
    parts.push([
      '> Diese Seite wird automatisch aus der Registry erzeugt',
      '> (`docs/agent-guide/registry/goals.yaml`). Nicht von Hand bearbeiten.',
      '> Zur Erklärung der Linsen: [[00-anleitung]].',
      '',
    ].join('\n'));
    for (const goal of reg.goals) {
      parts.push(`## ${goal.title_de}`);
      parts.push('');
      parts.push(`${dangerBadge(goal.danger)}`);
      parts.push('');
      parts.push(`**Wann?** ${goal.when_de}`);
      parts.push('');
      parts.push('**So gehst du vor:**');
      parts.push('');
      const flow = Array.isArray(goal.flow) ? goal.flow : [];
      flow.forEach((step, i) => {
        parts.push(`${i + 1}. ${toolLink(step.tool)} — ${step.note_de}`);
      });
      parts.push('');
      parts.push('**Diesen Prompt kannst du der KI geben:**');
      parts.push('');
      parts.push('```text');
      parts.push(goal.example_prompt_de);
      parts.push('```');
      parts.push('');
      const gr = guardrailNames(goal.guardrails);
      if (gr) {
        parts.push(`**Schutzregeln (Guardrails):** ${gr}`);
        parts.push('');
      }
    }
    return parts.join('\n');
  }

  /**
   * Lens 2 — tool + agent reference cards (20-werkzeuge.md). One H2 per tool.
   * @param {{tools: object[]}} reg
   * @returns {string}
   */
  export function renderWerkzeuge(reg) {
    const parts = [renderHeader('Werkzeuge — Tools und Agents', 'Werkzeuge — Tools und Agents')];
    parts.push([
      '> Diese Seite wird automatisch aus der Registry erzeugt',
      '> (`docs/agent-guide/registry/tools.yaml`). Nicht von Hand bearbeiten.',
      '> Zurück zur Übersicht: [[00-anleitung]].',
      '',
    ].join('\n'));
    for (const tool of reg.tools) {
      parts.push(`## ${tool.name_de}`);
      parts.push('');
      parts.push(`**${KIND_LABEL[tool.kind] || tool.kind}** · ${dangerBadge(tool.danger)}`);
      parts.push('');
      parts.push(tool.summary_de);
      parts.push('');
      parts.push(`**Wofür?** ${tool.what_for_de}`);
      parts.push('');
      parts.push(`**So startest du:** ${tool.how_to_start_de}`);
      parts.push('');
      parts.push(`**Was schiefgehen kann:** ${tool.what_could_go_wrong_de}`);
      parts.push('');
      const gr = guardrailNames(tool.guardrails);
      if (gr) {
        parts.push(`**Schutzregeln (Guardrails):** ${gr}`);
        parts.push('');
      }
      const related = Array.isArray(tool.related) ? tool.related : [];
      if (related.length) {
        parts.push(`**Verwandt:** ${related.map((id) => toolLink(id)).join(', ')}`);
        parts.push('');
      }
      const links = Array.isArray(tool.links) ? tool.links : [];
      const linkMd = links
        .filter((l) => l && l.url)
        .map((l) => urlLink(l.label || l.url, l.url))
        .filter(Boolean);
      if (linkMd.length) {
        parts.push(`**Mehr dazu:** ${linkMd.join(' · ')}`);
        parts.push('');
      }
    }
    return parts.join('\n');
  }

  /**
   * Lens 3 — platform components (30-bausteine.md). Software-first then hardware,
   * each group iterated in registry file order.
   * @param {{components: object[]}} reg
   * @returns {string}
   */
  export function renderBausteine(reg) {
    const parts = [renderHeader('Bausteine — Was läuft auf der Plattform?', 'Bausteine — Was läuft auf der Plattform?')];
    parts.push([
      '> Diese Seite wird automatisch aus der Registry erzeugt',
      '> (`docs/agent-guide/registry/components.yaml`). Nicht von Hand bearbeiten.',
      '> Zurück zur Übersicht: [[00-anleitung]].',
      '',
    ].join('\n'));
    const software = reg.components.filter((c) => c.kind === 'software');
    const hardware = reg.components.filter((c) => c.kind === 'hardware');
    const renderGroup = (title, list) => {
      parts.push(`# ${title}`);
      parts.push('');
      for (const c of list) {
        parts.push(`## ${c.emoji} ${c.name}`);
        parts.push('');
        parts.push(`${dangerBadge(c.sensitivity)}`);
        parts.push('');
        parts.push(c.what_for_de);
        parts.push('');
        const extra = Array.isArray(c.links) ? c.links : [];
        const linkMd = [urlLink(c.name, c.url || '')]
          .concat(extra.filter((l) => l && l.url).map((l) => urlLink(l.label || l.url, l.url)))
          .filter(Boolean);
        if (linkMd.length) {
          parts.push(`**Mehr dazu:** ${linkMd.join(' · ')}`);
          parts.push('');
        }
      }
    };
    renderGroup('Software', software);
    renderGroup('Hardware', hardware);
    return parts.join('\n');
  }
  ```

- [ ] **Step 4: Run the test, watch it pass.**
  ```bash
  cd /tmp/wt-agent-guide-docs && node --test scripts/agent-guide/emit-docs.test.mjs
  ```
  Expected PASS: all renderer tests green (`# fail 0`).

- [ ] **Step 5: Commit.**
  ```bash
  cd /tmp/wt-agent-guide-docs && git add scripts/agent-guide/emit-docs.mjs scripts/agent-guide/emit-docs.test.mjs && git commit -m "feat(agent-guide): three lens renderers (ziele/werkzeuge/bausteine) [S1]

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 5: `writeDocs()` — validate-first, deterministic, fail-closed CLI

**Files:**
- Modify: `scripts/agent-guide/emit-docs.mjs`
- Test: `scripts/agent-guide/emit-docs.test.mjs`

The orchestration entry point: it runs `validateRegistry(dir, repoRoot)` first and aborts non-zero if invalid; it renders the three strings and writes them to `docs/agent-guide/{10-ziele,20-werkzeuge,30-bausteine}.md`; rendering the same fixture twice is byte-identical. Because the real `validate.mjs` is an F+B file, the unit test **injects** a `validate` function so it never touches the real registry — proving both the happy path and the fail-closed path deterministically. The CLI adapter is **shape-agnostic**: it tolerates a validator that returns an error array *or* throws.

- [ ] **Step 1: Write the failing test.** Append to `scripts/agent-guide/emit-docs.test.mjs`:
  ```js
  test('renderAll: rendering the same fixture twice is byte-identical (determinism)', () => {
    const dir = makeFixtureRegistry();
    try {
      const a = renderAll(loadRegistry(dir));
      const b = renderAll(loadRegistry(dir));
      assert.equal(a['10-ziele'], b['10-ziele']);
      assert.equal(a['20-werkzeuge'], b['20-werkzeuge']);
      assert.equal(a['30-bausteine'], b['30-bausteine']);
      // no timestamps / locale / absolute paths leaked into output
      for (const md of Object.values(a)) {
        assert.ok(!/\/(home|tmp|Users|var)\//.test(md), 'no absolute paths in output');
        assert.ok(!/\b20\d\d-\d\d-\d\dT/.test(md), 'no ISO timestamps in output');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('writeDocs: validate-first, writes the generated trio (not 00-anleitung)', () => {
    const registryDir = makeFixtureRegistry();
    const outDir = mkdtempSync(join(tmpdir(), 'agent-guide-out-'));
    let validatedWith = null;
    const okValidate = (dir) => { validatedWith = dir; return { ok: true, errors: [] }; };
    try {
      writeDocs({ registryDir, outDir, repoRoot: '/repo', validate: okValidate });
      assert.equal(validatedWith, registryDir, 'validate ran against the registry dir first');
      assert.ok(existsSync(join(outDir, '10-ziele.md')), '10-ziele.md written');
      assert.ok(existsSync(join(outDir, '20-werkzeuge.md')), '20-werkzeuge.md written');
      assert.ok(existsSync(join(outDir, '30-bausteine.md')), '30-bausteine.md written');
      assert.ok(!existsSync(join(outDir, '00-anleitung.md')), '00-anleitung.md NOT written');
      // fence-first survives the round-trip to disk
      assert.equal(readFileSync(join(outDir, '10-ziele.md'), 'utf8').split('\n')[0], '---');
    } finally {
      rmSync(registryDir, { recursive: true, force: true });
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  test('writeDocs: aborts (throws) on an invalid registry — never emits', () => {
    const registryDir = makeFixtureRegistry();
    const outDir = mkdtempSync(join(tmpdir(), 'agent-guide-out-bad-'));
    const badValidate = () => ({ ok: false, errors: ['boom'] });
    try {
      assert.throws(
        () => writeDocs({ registryDir, outDir, repoRoot: '/repo', validate: badValidate }),
        /invalid registry|boom/i,
      );
      assert.ok(!existsSync(join(outDir, '10-ziele.md')), 'nothing emitted on invalid registry');
    } finally {
      rmSync(registryDir, { recursive: true, force: true });
      rmSync(outDir, { recursive: true, force: true });
    }
  });
  ```

- [ ] **Step 2: Run the test, watch it fail.**
  ```bash
  cd /tmp/wt-agent-guide-docs && node --test scripts/agent-guide/emit-docs.test.mjs
  ```
  Expected FAIL: `does not provide an export named 'writeDocs'`.

- [ ] **Step 3: Implement the minimal code.** Append at the **end** of `scripts/agent-guide/emit-docs.mjs`. The `writeFileSync`, `mkdirSync`, `join`, `dirname`, `fileURLToPath`, and `loadRegistry` imports already exist at the top of the file (added in Task 2):
  ```js
  /**
   * Render all three generated pages into a { slug: markdown } map.
   * @param {object} reg  the loaded registry
   * @returns {{ '10-ziele': string, '20-werkzeuge': string, '30-bausteine': string }}
   */
  export function renderAll(reg) {
    return {
      '10-ziele': renderZiele(reg),
      '20-werkzeuge': renderWerkzeuge(reg),
      '30-bausteine': renderBausteine(reg),
    };
  }

  /**
   * Validate-first, then write the generated trio to <outDir>/<slug>.md.
   * Never writes 00-anleitung.md (hand-authored). Aborts (throws) on an invalid
   * registry so we never emit from bad input.
   * @param {{ registryDir: string, outDir: string, repoRoot: string,
   *           validate: (dir:string, repoRoot:string)=>{ok:boolean, errors:string[]} }} opts
   */
  export function writeDocs({ registryDir, outDir, repoRoot, validate }) {
    const result = validate(registryDir, repoRoot);
    if (!result || result.ok !== true) {
      const errs = (result && result.errors) ? result.errors.join('; ') : 'unknown error';
      throw new Error(`agent-guide: refusing to emit from an invalid registry: ${errs}`);
    }
    const reg = loadRegistry(registryDir);
    const pages = renderAll(reg);
    mkdirSync(outDir, { recursive: true });
    for (const [slug, md] of Object.entries(pages)) {
      writeFileSync(join(outDir, `${slug}.md`), md, 'utf8');
    }
  }

  // ── CLI entry: validate-first against the real registry, write to docs/agent-guide/ ──
  const __filename = fileURLToPath(import.meta.url);
  if (process.argv[1] === __filename) {
    const repoRoot = join(dirname(__filename), '..', '..');
    const registryDir = join(repoRoot, 'docs', 'agent-guide', 'registry');
    const outDir = join(repoRoot, 'docs', 'agent-guide');
    // Lazy import of the F+B validator so unit tests (which inject `validate`)
    // never depend on validate.mjs existing.
    const { validateRegistry } = await import('./validate.mjs');
    // Shape-agnostic adapter: tolerates BOTH a validator that RETURNS an error
    // array (empty = valid) and one that THROWS on invalid input. A throw
    // propagates out of validate() and is caught below → exit non-zero (fail closed).
    const validate = (dir, root) => {
      const r = validateRegistry(dir, root);
      const errs = Array.isArray(r) ? r : [];
      return { ok: errs.length === 0, errors: errs };
    };
    try {
      writeDocs({ registryDir, outDir, repoRoot, validate });
      console.log('✓ wrote docs/agent-guide/{10-ziele,20-werkzeuge,30-bausteine}.md');
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  }
  ```
  > **Validator shape:** the spec (§7.2) pins the in-process call as `validateRegistry(dir, repoRoot)` but does not fix whether it returns an error array or throws. The adapter above handles **both** — if F+B returns an array, an empty array is "valid"; if F+B instead throws on invalid input, the throw escapes `validate()` and is caught by the `try/catch` around `writeDocs`, which prints the message and exits non-zero. **No manual edit is needed when F+B lands.** The unit tests inject their own `validate` and are unaffected either way.

- [ ] **Step 4: Run the test, watch it pass.**
  ```bash
  cd /tmp/wt-agent-guide-docs && node --test scripts/agent-guide/emit-docs.test.mjs
  ```
  Expected PASS: all emit tests green (`# fail 0`).

- [ ] **Step 5: Commit.**
  ```bash
  cd /tmp/wt-agent-guide-docs && git add scripts/agent-guide/emit-docs.mjs scripts/agent-guide/emit-docs.test.mjs && git commit -m "feat(agent-guide): writeDocs validate-first + deterministic emit [S1]

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 6: Taskfile wiring + run the emitter against the REAL registry (commit the trio)

**Files:**
- Modify: `Taskfile.yml` (after the `docs:build` block at lines 2009–2012, before `docs:deploy:` at line 2014)
- Create (generated): `docs/agent-guide/10-ziele.md`, `docs/agent-guide/20-werkzeuge.md`, `docs/agent-guide/30-bausteine.md`

> **Requires F+B present** (the real `docs/agent-guide/registry/*.yaml` and `validate.mjs`). If F+B is not yet on your base, do Task 7 (00-anleitung) and Task 8 (CI) first, then return here once F+B lands.

- [ ] **Step 1: Add the Taskfile entries.** In `Taskfile.yml`, the `docs:build` block is lines 2009–2012:
  ```yaml
    docs:build:
      desc: Generate the full static docs site into k3d/docs-content-built/ (pages, assets, search.json)
      cmds:
        - node scripts/build-docs.mjs
  ```
  Insert immediately **after** it (before `docs:deploy:` at line 2014):
  ```yaml
    agent-guide:docs:
      desc: "Regenerate docs/agent-guide/{10-ziele,20-werkzeuge,30-bausteine}.md from the registry"
      cmds:
        - node scripts/agent-guide/emit-docs.mjs

    agent-guide:emit:
      desc: "Umbrella: regenerate all agent-guide surfaces (docs + webapp + maps)"
      cmds:
        - task: agent-guide:docs
        # agent-guide:webapp (S2) and agent-guide:maps (S3) are appended by those sub-projects.
  ```

- [ ] **Step 2: Run the emitter against the real registry.**
  ```bash
  cd /tmp/wt-agent-guide-docs && task agent-guide:docs
  ```
  Expected: `✓ wrote docs/agent-guide/{10-ziele,20-werkzeuge,30-bausteine}.md` and three new files under `docs/agent-guide/`.

- [ ] **Step 3: Verify the fence-first contract on the real output and idempotency.**
  ```bash
  cd /tmp/wt-agent-guide-docs && head -n 1 docs/agent-guide/10-ziele.md && task agent-guide:docs && git status --porcelain docs/agent-guide/
  ```
  Expected: the first line prints exactly `---`; the second `task agent-guide:docs` leaves a stable `git status` for the trio (idempotent — the listed entries should be the new untracked files, unchanged between runs).

- [ ] **Step 4: Verify no dangling wikilinks in the real output.**
  ```bash
  cd /tmp/wt-agent-guide-docs && ! grep -REn '\[\[(agent-[a-z]+|task-oracle)\]\]' docs/agent-guide/*.md && echo "no raw agent-ids or task-oracle wikilinks"
  ```
  Expected: `no raw agent-ids or task-oracle wikilinks` (the `!` makes a clean grep succeed). If grep finds a match, the registry contains an id outside the mapping set — re-check `slugForToolId`.

- [ ] **Step 5: Commit the Taskfile + generated trio.**
  ```bash
  cd /tmp/wt-agent-guide-docs && git add Taskfile.yml docs/agent-guide/10-ziele.md docs/agent-guide/20-werkzeuge.md docs/agent-guide/30-bausteine.md && git commit -m "feat(agent-guide): wire agent-guide:docs task + commit generated trio [S1]

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 7: `00-anleitung.md` — hand-authored German landing page

**Files:**
- Create: `docs/agent-guide/00-anleitung.md`

This page is **never regenerated** (excluded from the freshness gate). It teaches the mental model and wikilinks into the three generated pages: `[[10-ziele]]`, `[[20-werkzeuge]]`, `[[30-bausteine]]`. It carries the same fence-first `domain: general` frontmatter so it clusters with the trio on the landing graph — but **no** `generated_by`/DO-NOT-EDIT marker (it is hand-edited).

- [ ] **Step 1: Create the file.** Write `docs/agent-guide/00-anleitung.md`:
  ```markdown
  ---
  title: "Was will ich tun?"
  domain: general
  ---
  # Was will ich tun?

  Du weißt *was* du willst, aber nicht *wie*? Fang hier an. Diese Anleitung führt
  dich von deinem Vorhaben („Ich will den Website-Text ändern") zum richtigen
  Werkzeug, zum genauen Prompt (Anweisung an die KI) und zu einer ehrlichen
  Warnung, was schiefgehen kann.

  ## Die vier Ampel-Stufen

  Jede Aufgabe hat eine Farbe — so siehst du sofort, wie vorsichtig du sein musst:

  - 🟢 **Sicher** — Du kannst hier nichts kaputt machen. Leg einfach los.
  - 🟡 **Vorsicht** — Schau dir das Ergebnis an, bevor du es übernimmst.
  - 🟠 **Nur mit Hilfe** — Hol dir jemanden dazu, der sich auskennt.
  - 🔴 **Niemals allein** — Mach das nicht ohne ausdrückliche Freigabe.

  ## Drei Linsen

  Es gibt drei Wege, dich zu orientieren — drei „Linsen" auf dieselbe Plattform:

  1. **[[10-ziele]]** — die Ziel-Liste: „Ich will …". Starte hier, wenn du dein
     Vorhaben kennst, aber nicht das Werkzeug.
  2. **[[20-werkzeuge]]** — die Werkzeuge: Skills (Fertigkeiten der KI), Agents
     (spezialisierte Helfer) und Tasks (fertige Befehle). Starte hier, wenn du ein
     Werkzeug nachschlagen willst.
  3. **[[30-bausteine]]** — die Bausteine: alle Dienste und Geräte, aus denen die
     Plattform besteht (z. B. die Anmeldung, der Datei-Speicher). Starte hier, wenn
     du wissen willst, *was* eigentlich läuft.

  ## Ein Beispiel von Anfang bis Ende

  Nimm an, du willst den Preis auf der Website ändern:

  1. Du öffnest **[[10-ziele]]** und findest „Ich will den Text der Website ändern".
  2. Dort steht die Ampel-Farbe (🟢 **Sicher**), wann du das brauchst, und welche
     Werkzeuge in welcher Reihenfolge dran sind.
  3. Du kopierst den vorgeschlagenen Prompt, gibst ihn der KI — fertig.

  So einfach. Wenn du unsicher bist, lies die Ampel-Farbe und die Zeile
  „Was schiefgehen kann" — dann kannst du nichts falsch machen.
  ```

- [ ] **Step 2: Sanity-check the fence-first line.**
  ```bash
  cd /tmp/wt-agent-guide-docs && head -n 1 docs/agent-guide/00-anleitung.md
  ```
  Expected: exactly `---`.

- [ ] **Step 3: Confirm the freshness gate will NOT include this file.** (No code yet — this is a verification that Task 8's gate globs only the trio.) Visually confirm `00-anleitung.md` is absent from the gate path list you will add in Task 8.

- [ ] **Step 4: Commit.**
  ```bash
  cd /tmp/wt-agent-guide-docs && git add docs/agent-guide/00-anleitung.md && git commit -m "docs(agent-guide): hand-authored landing 00-anleitung [S1]

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 8: CI freshness gate (mirror the test-inventory gate)

**Files:**
- Modify: `.github/workflows/ci.yml` (insert after the test-inventory step, lines 38–44, before `Validate Systembrett template` at line 46)

The gate runs `task agent-guide:docs` and fails if the committed trio differs. It globs **only** the generated trio — `00-anleitung.md` is intentionally excluded so hand edits never trip it. Because the trio files are already committed (Task 6), `git diff --exit-code` over tracked files is meaningful.

- [ ] **Step 1: Read the exact anchor.** Confirm the test-inventory step (`.github/workflows/ci.yml` lines 38–44):
  ```yaml
      - name: Verify test inventory is up to date
        run: |
          task test:inventory
          if ! git diff --exit-code website/src/data/test-inventory.json; then
            echo "ERROR: website/src/data/test-inventory.json is stale — run 'task test:inventory' locally and commit"
            exit 1
          fi
  ```

- [ ] **Step 2: Insert the new step.** Add immediately **after** the test-inventory step and **before** the `Validate Systembrett template` step (line 46):
  ```yaml
      - name: Verify agent-guide docs are up to date
        run: |
          task agent-guide:docs
          if ! git diff --exit-code docs/agent-guide/10-ziele.md docs/agent-guide/20-werkzeuge.md docs/agent-guide/30-bausteine.md; then
            echo "ERROR: generated agent-guide docs are stale — run 'task agent-guide:docs' locally and commit"
            exit 1
          fi
  ```

- [ ] **Step 3: Verify the YAML still parses.**
  ```bash
  cd /tmp/wt-agent-guide-docs && python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('ci.yml parses')"
  ```
  Expected: `ci.yml parses`.

- [ ] **Step 4: Locally simulate the gate (requires F+B).**
  ```bash
  cd /tmp/wt-agent-guide-docs && task agent-guide:docs && git diff --exit-code docs/agent-guide/10-ziele.md docs/agent-guide/20-werkzeuge.md docs/agent-guide/30-bausteine.md && echo "gate would PASS"
  ```
  Expected: `gate would PASS` (no diff after re-running the emitter on the committed registry). If F+B is absent, skip this step; the gate is structurally identical to the proven test-inventory gate.

- [ ] **Step 5: Commit.**
  ```bash
  cd /tmp/wt-agent-guide-docs && git add .github/workflows/ci.yml && git commit -m "ci(agent-guide): add freshness gate for generated docs trio [S1]

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 9: Extend the build-smoke test (discovery + domain + wikilink + TOC/copy affordances)

**Files:**
- Modify: `scripts/docs-gen/build-smoke.test.mjs`

This proves the **end-to-end** integration through the real `runBuild`: the four agent-guide pages are discovered, `domain` resolves to `general` (fence-first frontmatter parsed), a `[[10-ziele]]` wikilink in `00-anleitung.md` resolves to `./10-ziele.html`, an agent wikilink `[[bachelorprojekt-website]]` resolves to the discovered agent page at `./agents/bachelorprojekt-website.html` (verified: `outPathFor` returns `agents/<slug>.html` for a repo agent — `scripts/docs-gen/registry.mjs` lines 76–77), and the spec §6 copy/TOC affordances fire (a `text`-fenced prompt gets a Copy button; a page with ≥2 H2 gets an auto-TOC). The fixture writes its **own** minimal agent-guide pages and a `bachelorprojekt-website` agent — it does **not** depend on the real registry — so this test is green without F+B.

The existing `makeFixtureRepo()` writes a `bachelorprojekt-ops` agent at lines 53–64 and `docs/intro.md` at lines 67–78. The new test asserts on pages that `makeFixtureRepo()` does **not** yet create — so it fails first, then the fixture writes are added as the "implementation".

- [ ] **Step 1: Add ONLY the new test() block (no fixture writes yet — this is the red step).** Append at the **end** of `scripts/docs-gen/build-smoke.test.mjs`:
  ```js
  test('runBuild: agent-guide pages discovered, domain general, wikilinks + TOC/copy', async () => {
    const repoRoot = makeFixtureRepo();
    const outDir = mkdtempSync(join(tmpdir(), 'docs-gen-ag-out-'));
    const pluginsRoot = join(repoRoot, '__no_plugins_here__');
    try {
      const report = await runBuild({ repoRoot, pluginsRoot, outDir });

      // (1) discovered + rendered to <slug>.html at bare slug
      for (const slug of ['00-anleitung', '10-ziele', '20-werkzeuge', '30-bausteine']) {
        assert.ok(existsSync(join(outDir, `${slug}.html`)), `${slug}.html rendered`);
      }

      // (2) the [[10-ziele]] wikilink in 00-anleitung.md rewrites to ./10-ziele.html
      const landing = readFileSync(join(outDir, '00-anleitung.html'), 'utf8');
      assert.ok(landing.includes('href="./10-ziele.html"'), '[[10-ziele]] resolved');

      // (3) the agent wikilink resolves to the discovered agent page (subdir slug)
      assert.ok(
        landing.includes('href="./agents/bachelorprojekt-website.html"'),
        '[[bachelorprojekt-website]] resolved to the agent page',
      );

      // (4) none of these refs are in the unresolved report list ({from,ref} pairs)
      const unresolvedRefs = report.unresolved.map((u) => u.ref);
      for (const ref of ['10-ziele', '20-werkzeuge', '30-bausteine', '00-anleitung', 'bachelorprojekt-website']) {
        assert.ok(!unresolvedRefs.includes(ref), `${ref} is NOT unresolved`);
      }

      // (5) spec §6 affordances: the ```text prompt block gets a Copy button …
      const ziele = readFileSync(join(outDir, '10-ziele.html'), 'utf8');
      assert.ok(/copy-btn|copy-button|data-copy/i.test(ziele), 'prompt block got a Copy button');
      // … and the ≥2-H2 page gets an on-page TOC ("Auf dieser Seite").
      assert.ok(/auto-toc|Auf dieser Seite/i.test(ziele), '≥2 H2 → on-page TOC rendered');
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
      rmSync(outDir, { recursive: true, force: true });
    }
  });
  ```
  > **Copy/TOC marker tolerance:** the assertions use alternation (`copy-btn|copy-button|data-copy`, `auto-toc|Auf dieser Seite`) so they match whatever class/string `injectCopyButtons` (`scripts/docs-gen/render-markdown.mjs` lines 205–214) and the TOC builder (`render-markdown.mjs` lines 184–198) actually emit. If both branches miss, open `render-markdown.mjs`, read the literal class/heading the generator writes, and pin the assertion to it — do **not** weaken it to always-true.

- [ ] **Step 2: Run the new test, watch it FAIL.**
  ```bash
  cd /tmp/wt-agent-guide-docs && node --test scripts/docs-gen/build-smoke.test.mjs
  ```
  Expected FAIL: the new test's first assertion trips because `makeFixtureRepo()` never wrote the agent-guide pages — e.g.
  ```
  AssertionError [ERR_ASSERTION]: 00-anleitung.html rendered
  ```
  (the original `produces the static output contract` test still passes; only the new one is red).

- [ ] **Step 3: Add the fixture writes (the "implementation").** In `makeFixtureRepo()`, first add the `bachelorprojekt-website` agent immediately **after** the existing `bachelorprojekt-ops.md` write (after line 64):
  ```js
    writeFileSync(join(root, '.claude', 'agents', 'bachelorprojekt-website.md'), [
      '---',
      'name: bachelorprojekt-website',
      'description: Website agent for the homepage, brand and UI.',
      '---',
      '# Website Agent',
      '',
      'Website agent body.',
      '',
    ].join('\n'), 'utf8');
  ```
  Then add the four agent-guide pages immediately **after** the existing `docs/intro.md` write (after line 78):
  ```js
    // Agent-guide pages (S1): one hand-authored landing + three "generated" stubs.
    mkdirSync(join(root, 'docs', 'agent-guide'), { recursive: true });
    writeFileSync(join(root, 'docs', 'agent-guide', '00-anleitung.md'), [
      '---',
      'title: "Was will ich tun?"',
      'domain: general',
      '---',
      '# Was will ich tun?',
      '',
      'Drei Linsen: [[10-ziele]], [[20-werkzeuge]], [[30-bausteine]].',
      'Und der Website-Agent: [[bachelorprojekt-website]].',
      '',
    ].join('\n'), 'utf8');
    // 10-ziele has ≥2 H2 headings (TOC trigger) and a ```text prompt (Copy button).
    writeFileSync(join(root, 'docs', 'agent-guide', '10-ziele.md'), [
      '---',
      'title: "Ziele"',
      'domain: general',
      'generated_by: scripts/agent-guide/emit-docs.mjs',
      '---',
      '<!-- DO NOT EDIT — generated by scripts/agent-guide/emit-docs.mjs -->',
      '# Ziele',
      '',
      'Zurück: [[00-anleitung]].',
      '',
      '## Ich will den Text der Website ändern',
      '',
      '**Diesen Prompt kannst du der KI geben:**',
      '',
      '```text',
      'Ändere den Preis von 90 auf 120.',
      '```',
      '',
      '## Ich will einen Fehler beheben',
      '',
      'Mehr dazu im Werkzeug-Katalog.',
      '',
    ].join('\n'), 'utf8');
    for (const [slug, title] of [
      ['20-werkzeuge', 'Werkzeuge'],
      ['30-bausteine', 'Bausteine'],
    ]) {
      writeFileSync(join(root, 'docs', 'agent-guide', `${slug}.md`), [
        '---',
        `title: "${title}"`,
        'domain: general',
        'generated_by: scripts/agent-guide/emit-docs.mjs',
        '---',
        '<!-- DO NOT EDIT — generated by scripts/agent-guide/emit-docs.mjs -->',
        `# ${title}`,
        '',
        'Zurück: [[00-anleitung]].',
        '',
      ].join('\n'), 'utf8');
    }
  ```

- [ ] **Step 4: Re-run the test, watch it PASS.**
  ```bash
  cd /tmp/wt-agent-guide-docs && node --test scripts/docs-gen/build-smoke.test.mjs
  ```
  Expected PASS: both the original `produces the static output contract` test and the new agent-guide test green (`# fail 0`).

- [ ] **Step 5: Run the whole docs-gen suite to confirm no regression.**
  ```bash
  cd /tmp/wt-agent-guide-docs && task test:docs-gen
  ```
  Expected: all docs-gen tests pass (`# fail 0`), including `discover.test.mjs` and the original smoke test.

- [ ] **Step 6: Commit.**
  ```bash
  cd /tmp/wt-agent-guide-docs && git add scripts/docs-gen/build-smoke.test.mjs && git commit -m "test(agent-guide): smoke-test discovery + domain + wikilinks + TOC/copy [S1]

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 10: (Optional) refactor `validate.mjs` to one parse path

**Files:**
- Modify: `scripts/agent-guide/validate.mjs` (F+B file; present only when F+B is merged)

> **OPTIONAL — the executor may skip this task entirely without breaking the plan.** The spec (§7.1, §12) marks this as recommended-not-forced. Skip if you prefer to keep `validate.mjs` standalone for blast-radius reasons; `load.mjs` already reuses the same `yaml` dependency, so the two parse paths are byte-compatible regardless.

- [ ] **Step 1: Read the current validator.** Open `scripts/agent-guide/validate.mjs` and locate its inline `load(dir, file)` YAML helper (the function `loadRegistry` will replace).

- [ ] **Step 2: Re-route parsing through `loadRegistry`.** Replace the inline per-file parse calls with a single `loadRegistry(dir)` import from `./load.mjs`, keeping `validateRegistry(dir, repoRoot)`'s signature and return shape unchanged. Do not change any validation rule — only the parse path.

- [ ] **Step 3: Run the validator's own tests (F+B-provided).**
  ```bash
  cd /tmp/wt-agent-guide-docs && task test:agent-guide
  ```
  Expected: all F+B validator tests still pass (`# fail 0`) — the refactor is behaviour-preserving.

- [ ] **Step 4: Commit.**
  ```bash
  cd /tmp/wt-agent-guide-docs && git add scripts/agent-guide/validate.mjs && git commit -m "refactor(agent-guide): route validate.mjs through load.mjs (single parse path) [S1]

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 11: Full local verification, render the HTML, PR + ticket

**Files:** none (verification + delivery).

- [ ] **Step 1: Run the agent-guide unit tests directly.**
  ```bash
  cd /tmp/wt-agent-guide-docs && node --test scripts/agent-guide/*.test.mjs
  ```
  Expected: `load.test.mjs` + `emit-docs.test.mjs` all green (`# fail 0`).

- [ ] **Step 2: Confirm the F+B `test:agent-guide` task globs our tests.** (F+B defined it to glob `scripts/agent-guide/*.test.mjs`.)
  ```bash
  cd /tmp/wt-agent-guide-docs && task test:agent-guide
  ```
  Expected: runs and passes — `load.test.mjs` and `emit-docs.test.mjs` are picked up by the glob.

- [ ] **Step 3: Render the four HTML pages via the real build (requires F+B).**
  ```bash
  cd /tmp/wt-agent-guide-docs && task docs:build && ls k3d/docs-content-built/{00-anleitung,10-ziele,20-werkzeuge,30-bausteine}.html
  ```
  Expected: the four `*.html` files exist. The build report tail should report `unresolved refs: 0` for the agent-guide wikilinks (no `00-anleitung → [[…]]` lines in the unresolved list).

- [ ] **Step 4: Idempotency re-check + full offline suite.**
  ```bash
  cd /tmp/wt-agent-guide-docs && task agent-guide:docs && git status --porcelain docs/agent-guide/10-ziele.md docs/agent-guide/20-werkzeuge.md docs/agent-guide/30-bausteine.md && task test:all
  ```
  Expected: `git status --porcelain` prints **nothing** for the trio (idempotent); `task test:all` ends green (it runs `test:docs-gen` and, transitively via F+B, `test:agent-guide`).

  > **If `k3d/docs-content-built/` changed:** the docs HTML is a separately-committed build artifact deployed via `task docs:deploy` — do **not** commit the regenerated HTML as part of S1 unless your repo convention requires it (check `git status k3d/docs-content-built/`; the existing precedent is that HTML is committed on release, not on every PR). The S1 freshness gate covers only the `.md` trio.

- [ ] **Step 5: Push the branch and open the PR + internal ticket.**
  ```bash
  cd /tmp/wt-agent-guide-docs && git push -u origin HEAD
  ```
  Then open the PR with `gh`:
  ```bash
  cd /tmp/wt-agent-guide-docs && gh pr create --base main --title "feat(agent-guide): S1 docs-site surface — load.mjs + emit-docs + 4 pages" --body "$(cat <<'EOF'
  ## Was

  Sub-project **S1** of the "AI-Agent Operating Guide & Guardrails" program: the
  docs-site human-teaching surface. Adds the shared registry reader
  `scripts/agent-guide/load.mjs`, the emitter `scripts/agent-guide/emit-docs.mjs`,
  three generated German pages + one hand-authored landing under
  `docs/agent-guide/`, the `agent-guide:docs` / `agent-guide:emit` Taskfile pair,
  a CI freshness gate over the generated trio, and unit + smoke tests.

  ## Prerequisite / order

  - **Merge prerequisite:** sub-project **F+B** (registry `docs/agent-guide/registry/*.yaml`,
    `scripts/agent-guide/validate.mjs`, root `yaml@^2.8.3`, `task test:agent-guide`).
    CI on this branch only goes green once F+B is on `main`.
  - **Program merge order: S1 → S2 → S3.** S1 introduces `load.mjs`, the shared
    reader S2 and S3 import; both append their leaf task to the `agent-guide:emit`
    umbrella S1 creates here.

  ## Verify

  - `task agent-guide:docs` is idempotent (clean `git status` on re-run).
  - `task docs:build` renders `{00-anleitung,10-ziele,20-werkzeuge,30-bausteine}.html`.
  - `task test:all` green (includes `test:docs-gen` + transitively `test:agent-guide`).
  - CI freshness gate fails if the generated trio is stale.

  🤖 Generated with [Claude Code](https://claude.com/claude-code)
  EOF
  )"
  ```
  Then create the internal tracking ticket per the repo's ticket convention (e.g. via the `operations-management` skill / `tickets.tickets`), noting: F+B as merge prerequisite, S1→S2→S3 order, and that `load.mjs` is the frozen contract S2/S3 depend on.

- [ ] **Step 6: Confirm CI is green before requesting merge.**
  ```bash
  cd /tmp/wt-agent-guide-docs && gh pr checks --watch
  ```
  Expected: all checks pass (offline-tests incl. the new freshness gate, commit-lint, security-scan). Merge via **squash-and-merge** once green.
