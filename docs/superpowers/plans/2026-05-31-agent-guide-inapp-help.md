---
title: AI-Agent Guide S2 — In-App Help Surface Implementation Plan
ticket_id: T000377
domains: [website, infra, test]
status: active
pr_number: null
---

# AI-Agent Guide S2 — In-App Help Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Render the F+B agent-guide registry inside the running website — a Sidekick-wide "Agent-Anleitung" view (goal catalog + tool cards + danger-tier badges) plus a populated `/admin/platform` help drawer — from one committed, deterministically generated JSON artifact.

**Architecture:** A Node ESM emitter (`scripts/agent-guide/emit-webapp.mjs`) validates and loads the YAML registry via the S1 shared reader, projects it into a denormalized contract (`website/src/lib/agent-guide.generated.json`), and writes it deterministically. A thin typed re-export (`agentGuide.ts`) feeds two consumers: a new `AgentGuideView.svelte` Sidekick view and a programmatically-built `platform` section in `helpContent.ts`. A CI `git diff --exit-code` gate keeps the committed JSON fresh.

**Tech Stack:** Node 22 ESM (`node --test`), Svelte 5 (runes) inside Astro, TypeScript strict (`astro/tsconfigs/strict`, `verbatimModuleSyntax: true`), vitest (local-only website unit tests), go-task (`Taskfile.yml`), GitHub Actions.

**Spec:** docs/superpowers/specs/2026-05-31-agent-guide-inapp-help-design.md

---

## Prerequisites (read before starting)

This is the **S2** plan in the program **AI-Agent Operating Guide & Guardrails**. The enforced merge order is **S1 → S2 → S3**. Before executing this plan, your branch MUST be rebased on a `main` that already contains:

- **F+B** — `docs/agent-guide/registry/*.yaml` (taxonomy, guardrails, tools, goals, components), `scripts/agent-guide/validate.mjs` exporting `validateRegistry(dir, repoRoot)`, the root devDependency `yaml@^2.8.3`, and the Taskfile task `test:agent-guide` (globs `scripts/agent-guide/*.test.mjs`, already a dep of `test:all`).
- **S1** — `scripts/agent-guide/load.mjs` exporting `loadRegistry(dir) → {goals, tools, components, taxonomy, guardrails}` plus `tierFor(id)`, `toolById(id)`, `guardrailById(id)`; and the umbrella Taskfile task `agent-guide:emit` (with the leaf `agent-guide:docs`).

Verify the prerequisites are present before Task 1:

```bash
ls scripts/agent-guide/load.mjs scripts/agent-guide/validate.mjs
ls docs/agent-guide/registry/taxonomy.yaml docs/agent-guide/registry/tools.yaml docs/agent-guide/registry/goals.yaml docs/agent-guide/registry/guardrails.yaml docs/agent-guide/registry/components.yaml
grep -q '"yaml"' package.json && echo "yaml dep OK"
grep -q 'test:agent-guide' Taskfile.yml && grep -q 'agent-guide:emit' Taskfile.yml && echo "tasks OK"
```

All `ls`/`grep` checks must succeed. If any fail, **stop** — S1 or F+B has not merged yet (Risk R1/R7 in the spec). Do not re-create these files; they are upstream deliverables.

> In this S2 worktree (`/tmp/wt-agent-guide-help`) these files are intentionally absent until the rebase — `scripts/agent-guide/` does not exist yet, and `Taskfile.yml` carries no `test:agent-guide`/`agent-guide:emit`. That is expected, not a defect. Every code sample below that imports from `load.mjs`/`validate.mjs` assumes the rebase has happened.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `scripts/agent-guide/emit-webapp.mjs` | create | Emitter: `validateRegistry` (fail-closed) → `loadRegistry` → project to §6.2 shape → write `agent-guide.generated.json` deterministically. Exports `buildWebappData(registryDir)` and `serialize(data)`. |
| `scripts/agent-guide/emit-webapp.test.mjs` | create | `node --test` unit tests over a fixture registry (4 tiers w/ color, slug-keyed components; then resolved flow tool names, resolved guardrails, `kind_de`; then byte-stable determinism). |
| `website/src/lib/agent-guide.generated.json` | create (generated, committed) | The contract: `taxonomy[]` w/ color, `goals[]` w/ resolved `flow[].tool_name_de` + guardrail `{id,name_de,rule_de,why_de}`, `tools[]` w/ `kind_de`, `components` keyed by slug. |
| `website/src/lib/agentGuide.ts` | create | Typed value-import re-export of the JSON + `tierFor()`/`tierColor()`/`tierEmoji()`/`tierLabel()`/`componentBySlug()`. |
| `website/src/lib/agentGuide.test.ts` | create (local vitest) | Asserts typed re-export shape + every referenced tier id exists in `taxonomy` (no dangling ids, not masked by the `#888888` fallback). |
| `website/src/components/assistant/AgentGuideView.svelte` | create | New Sidekick-wide view: tier legend + goal cards + tool cards + copy-to-clipboard, no props. |
| `website/src/lib/helpContent.ts` | modify (head: imports + `platformHelp`; line 225-226: add `platform` to `admin`) | Programmatically-built `platform` HelpSection from `agentGuide.ts` components with non-empty `actions` fallback. |
| `website/src/lib/helpContent.platform.test.ts` | create (local vitest) | Asserts `helpContent.admin.platform` exists with non-empty `description` and non-empty `actions` derived from components. |
| `website/src/components/PortalSidekick.svelte` | modify (line 9 import; line 11 union; lines 41-48 titleMap; render branch after line 193) | Extend `View` union, `titleMap`, import + render branch for `AgentGuideView`. |
| `website/src/components/assistant/SidekickHome.svelte` | modify (line 2 union; items list lines 24-30) | Extend `View` union, add always-shown `agent-guide` item w/ conditional ordinal, bump `help` ordinal. |
| `Taskfile.yml` | modify (after line 348; extend `agent-guide:emit` deps) | Add `agent-guide:webapp` task; wire it as a dep of the existing `agent-guide:emit` umbrella. |
| `.github/workflows/ci.yml` | modify (after line 44, before line 46) | Add `git diff --exit-code agent-guide.generated.json` freshness gate next to the test-inventory gate. |

---

## Task 1: Emitter — minimal `buildWebappData()` (raw ids, slug-keyed components, tier colors)

**Files:**
- Create: `scripts/agent-guide/emit-webapp.mjs`
- Create: `scripts/agent-guide/emit-webapp.test.mjs`
- Test: `node --test scripts/agent-guide/emit-webapp.test.mjs`

This task builds a **minimal** `buildWebappData(registryDir)` that emits the taxonomy/components half of the contract fully (tier colors, slug-keyed components, metadata) but deliberately leaves goal-flow tool names, guardrail rationale, and `kind_de` **unresolved** (raw ids only). Task 2 then red-greens the denormalization. This keeps each task genuinely failing-test-first.

- [ ] **Step 1: Write the failing test.** Create `scripts/agent-guide/emit-webapp.test.mjs` with a self-contained fixture registry written to a temp dir, then assert taxonomy colors + slug-keyed components + metadata. The fixture is YAML the test itself writes — it does NOT read the real registry.

  ```js
  // scripts/agent-guide/emit-webapp.test.mjs
  import { test } from 'node:test';
  import assert from 'node:assert/strict';
  import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
  import { tmpdir } from 'node:os';
  import { join } from 'node:path';
  import { buildWebappData } from './emit-webapp.mjs';

  /** Write a minimal but complete registry into a fresh temp dir; return its path. */
  function fixtureRegistry() {
    const dir = mkdtempSync(join(tmpdir(), 'ag-fixture-'));
    mkdirSync(dir, { recursive: true });

    writeFileSync(join(dir, 'taxonomy.yaml'), [
      'taxonomy:',
      '  - { id: safe,      label_de: "Sicher",        emoji: "🟢", meaning_de: "Bedenkenlos selbst.",  doc_treatment: none, enforcement_default: none }',
      '  - { id: caution,   label_de: "Vorsicht",      emoji: "🟡", meaning_de: "Lies kurz mit.",       doc_treatment: note, enforcement_default: none }',
      '  - { id: assisted,  label_de: "Nur mit Hilfe", emoji: "🟠", meaning_de: "Frag den Agenten.",    doc_treatment: warn, enforcement_default: confirm }',
      '  - { id: forbidden, label_de: "Niemals allein",emoji: "🔴", meaning_de: "Niemals ohne Rücksprache.", doc_treatment: danger, enforcement_default: block }',
      '',
    ].join('\n'));

    writeFileSync(join(dir, 'guardrails.yaml'), [
      'guardrails:',
      '  - { id: G-ENV-EXPLICIT, name_de: "Umgebung angeben", rule_de: "Immer ENV nennen.", why_de: "Sonst falscher Cluster.", enforced_by: ci }',
      '',
    ].join('\n'));

    writeFileSync(join(dir, 'tools.yaml'), [
      'tools:',
      '  - id: agent-website',
      '    name_de: "Website-Agent"',
      '    kind: agent',
      '    summary_de: "Ändert Website-Texte."',
      '    what_for_de: "Pflegt Inhalte."',
      '    how_to_start_de: "Sag, welche Seite."',
      '    what_could_go_wrong_de: "Falsche Seite."',
      '    danger: safe',
      '    guardrails: []',
      '    related: [dev-flow-plan]',
      '    links: []',
      '  - id: dev-flow-plan',
      '    name_de: "Entwicklungs-Plan starten"',
      '    kind: skill',
      '    summary_de: "Plant eine Änderung."',
      '    what_for_de: "Wählt den Pfad."',
      '    how_to_start_de: "Beschreibe es."',
      '    what_could_go_wrong_de: "Nichts Gefährliches."',
      '    danger: safe',
      '    guardrails: [G-ENV-EXPLICIT]',
      '    related: []',
      '    links: []',
      '',
    ].join('\n'));

    writeFileSync(join(dir, 'goals.yaml'), [
      'goals:',
      '  - id: change-website-text',
      '    title_de: "Ich will den Text auf der Website ändern"',
      '    when_de: "Wenn etwas Falsches dasteht."',
      '    danger: safe',
      '    flow:',
      '      - { tool: agent-website, note_de: "Sag ihm, welche Seite." }',
      '    example_prompt_de: "Ändere die Überschrift."',
      '    guardrails: [G-ENV-EXPLICIT]',
      '    related: []',
      '',
    ].join('\n'));

    writeFileSync(join(dir, 'components.yaml'), [
      'components:',
      '  - { slug: keycloak, kind: software, name: "Keycloak", emoji: "🔐", summary_de: "Zentrale Anmeldung (SSO).", what_for_de: "SSO für alle Dienste.", placeholder_en: "x", sensitivity: assisted, url: "https://auth.example", links: [] }',
      '  - { slug: mailpit,  kind: software, name: "Mailpit",  emoji: "📭", summary_de: "Fängt E-Mails ab (Test).", what_for_de: "Test-Postfach.",      placeholder_en: "x", sensitivity: safe,     url: "https://mail.example",  links: [] }',
      '',
    ].join('\n'));

    return dir;
  }

  // Shared with Task 2 (do not duplicate the fixture there).
  globalThis.__agFixtureRegistry = fixtureRegistry;

  test('buildWebappData: emits all four taxonomy tiers each with a non-empty color', () => {
    const data = buildWebappData(fixtureRegistry());
    assert.equal(data.taxonomy.length, 4);
    const ids = data.taxonomy.map(t => t.id);
    assert.deepEqual(ids, ['safe', 'caution', 'assisted', 'forbidden']);
    for (const tier of data.taxonomy) {
      assert.match(tier.color, /^#[0-9a-fA-F]{6}$/, `tier ${tier.id} must carry a 6-digit hex color`);
      assert.ok(tier.label_de && tier.emoji && tier.meaning_de, `tier ${tier.id} keeps label/emoji/meaning`);
    }
    // doc_treatment / enforcement_default are NOT rendered → must be dropped
    assert.ok(!('doc_treatment' in data.taxonomy[0]));
    assert.ok(!('enforcement_default' in data.taxonomy[0]));
  });

  test('buildWebappData: keys components by slug with only the §6.1 fields', () => {
    const data = buildWebappData(fixtureRegistry());
    assert.ok(data.components.keycloak, 'components is an object keyed by slug');
    const kc = data.components.keycloak;
    assert.deepEqual(Object.keys(kc).sort(),
      ['emoji', 'kind', 'name', 'sensitivity', 'slug', 'summary_de', 'url']);
    assert.equal(kc.sensitivity, 'assisted');
    // what_for_de / placeholder_en / links are NOT needed by S2 → dropped
    assert.ok(!('what_for_de' in kc));
    assert.ok(!('placeholder_en' in kc));
    assert.ok(!('links' in kc));
  });

  test('buildWebappData: carries the contract metadata fields', () => {
    const data = buildWebappData(fixtureRegistry());
    assert.equal(data.$schema, 'agent-guide.generated/v1');
    assert.equal(data.generatedFrom, 'docs/agent-guide/registry');
  });
  ```

- [ ] **Step 2: Run the test, watch it fail.** The module does not exist yet.

  ```bash
  node --test scripts/agent-guide/emit-webapp.test.mjs
  ```

  Expected: failure resolving the import, e.g. `Cannot find module '.../scripts/agent-guide/emit-webapp.mjs'` (the `node:test` runner reports `# fail 3` / non-zero exit).

- [ ] **Step 3: Implement the minimal emitter.** Create `scripts/agent-guide/emit-webapp.mjs`. This first cut covers taxonomy colors + slug-keyed components + metadata. Goals carry **raw flow ids + raw guardrail ids** and tools carry **raw guardrail ids and NO `kind_de`** — Task 2 adds resolution. (The `?? []` guards keep arrays safe; the projection asserts required fields exist by reading them.)

  ```js
  // scripts/agent-guide/emit-webapp.mjs
  // S2 emitter: projects the agent-guide registry into the in-app render contract.
  import { loadRegistry } from './load.mjs';

  /** Fixed per-tier palette (emitter-owned, §6.4). AA-contrast against the #0f1623 drawer. */
  const TIER_COLORS = {
    safe: '#3fb37f',
    caution: '#e8c870',
    assisted: '#e08a3c',
    forbidden: '#d65a5a',
  };

  /**
   * Pure projection of the registry into the §6.2 contract object.
   * NOTE (Task 1 minimal cut): goal flows carry raw tool ids, guardrails carry
   * raw ids, tools have no kind_de. Task 2 denormalizes these.
   * @param {string} registryDir path to docs/agent-guide/registry
   */
  export function buildWebappData(registryDir) {
    const reg = loadRegistry(registryDir);

    const taxonomy = reg.taxonomy.map(t => ({
      id: t.id,
      label_de: t.label_de,
      emoji: t.emoji,
      meaning_de: t.meaning_de,
      color: TIER_COLORS[t.id] ?? '#888888',
    }));

    const tools = reg.tools.map(t => ({
      id: t.id,
      name_de: t.name_de,
      kind: t.kind,
      summary_de: t.summary_de,
      what_for_de: t.what_for_de,
      how_to_start_de: t.how_to_start_de,
      what_could_go_wrong_de: t.what_could_go_wrong_de,
      danger: t.danger,
      guardrails: t.guardrails ?? [],
      related: t.related ?? [],
      links: t.links ?? [],
    }));

    const goals = reg.goals.map(g => ({
      id: g.id,
      title_de: g.title_de,
      when_de: g.when_de,
      danger: g.danger,
      flow: (g.flow ?? []).map(step => ({ tool: step.tool, note_de: step.note_de })),
      example_prompt_de: g.example_prompt_de,
      guardrails: g.guardrails ?? [],
      related: g.related ?? [],
    }));

    const components = {};
    for (const c of reg.components) {
      components[c.slug] = {
        slug: c.slug,
        kind: c.kind,
        name: c.name,
        emoji: c.emoji,
        summary_de: c.summary_de,
        sensitivity: c.sensitivity,
        url: c.url,
      };
    }

    return {
      $schema: 'agent-guide.generated/v1',
      generatedFrom: 'docs/agent-guide/registry',
      taxonomy,
      goals,
      tools,
      components,
    };
  }
  ```

- [ ] **Step 4: Run the test, watch it pass.**

  ```bash
  node --test scripts/agent-guide/emit-webapp.test.mjs
  ```

  Expected: `# pass 3`, `# fail 0`, exit code 0.

- [ ] **Step 5: Commit.**

  ```bash
  git add scripts/agent-guide/emit-webapp.mjs scripts/agent-guide/emit-webapp.test.mjs
  git commit -m "feat(agent-guide): S2 emitter buildWebappData — tiers + slug-keyed components

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 2: Emitter — resolved goal-flow tool names, guardrail rationale, and `kind_de`

**Files:**
- Modify: `scripts/agent-guide/emit-webapp.mjs` (add resolution helpers + use them)
- Modify: `scripts/agent-guide/emit-webapp.test.mjs` (add denormalization assertions)
- Test: `node --test scripts/agent-guide/emit-webapp.test.mjs`

Task 1 emitted **raw ids**. This task is genuinely failing-test-first: the three assertions below FAIL against the Task-1 minimal emitter (no `tool_name_de`, guardrails are bare strings, no `kind_de`), then Step 3 adds the resolution code to turn them green.

- [ ] **Step 1: Write the failing test.** Append these three tests to `scripts/agent-guide/emit-webapp.test.mjs`. Reuse the `fixtureRegistry` exposed in Task 1 (`globalThis.__agFixtureRegistry`) so the fixture is not duplicated.

  ```js
  const fixtureRegistry2 = globalThis.__agFixtureRegistry;

  test('buildWebappData: pre-resolves every goal flow step tool name', () => {
    const data = buildWebappData(fixtureRegistry2());
    const goal = data.goals.find(g => g.id === 'change-website-text');
    assert.ok(goal, 'fixture goal present');
    for (const step of goal.flow) {
      assert.ok(step.tool_name_de, `flow step for tool "${step.tool}" must carry tool_name_de`);
    }
    assert.equal(goal.flow[0].tool, 'agent-website');
    assert.equal(goal.flow[0].tool_name_de, 'Website-Agent');
    assert.equal(goal.flow[0].note_de, 'Sag ihm, welche Seite.');
  });

  test('buildWebappData: resolves guardrails to {id,name_de,rule_de,why_de} on goals and tools', () => {
    const data = buildWebappData(fixtureRegistry2());

    const goal = data.goals.find(g => g.id === 'change-website-text');
    assert.equal(goal.guardrails.length, 1);
    assert.deepEqual(Object.keys(goal.guardrails[0]).sort(),
      ['id', 'name_de', 'rule_de', 'why_de']);
    assert.equal(goal.guardrails[0].id, 'G-ENV-EXPLICIT');
    assert.equal(goal.guardrails[0].rule_de, 'Immer ENV nennen.');
    assert.equal(goal.guardrails[0].why_de, 'Sonst falscher Cluster.');

    const tool = data.tools.find(t => t.id === 'dev-flow-plan');
    assert.equal(tool.guardrails.length, 1);
    assert.equal(tool.guardrails[0].name_de, 'Umgebung angeben');
  });

  test('buildWebappData: every tool carries a German kind label (kind_de)', () => {
    const data = buildWebappData(fixtureRegistry2());
    const byId = Object.fromEntries(data.tools.map(t => [t.id, t]));
    assert.equal(byId['agent-website'].kind_de, 'Agent');
    assert.equal(byId['dev-flow-plan'].kind_de, 'Fertigkeit');
  });
  ```

- [ ] **Step 2: Run the test, watch it fail.** The Task-1 emitter carries raw ids only.

  ```bash
  node --test scripts/agent-guide/emit-webapp.test.mjs
  ```

  Expected: `# pass 3`, `# fail 3`, non-zero exit. The new assertions fail with messages like `flow step for tool "agent-website" must carry tool_name_de` (it is `undefined`), the guardrail-keys `deepEqual` fails (the entry is the string `"G-ENV-EXPLICIT"`, not an object), and `byId['agent-website'].kind_de` is `undefined`.

- [ ] **Step 3: Implement the resolution.** Edit `scripts/agent-guide/emit-webapp.mjs`. First, extend the `load.mjs` import to pull in the two resolvers and add the two helper functions just below `TIER_COLORS`. (Per reviewer: `resolveGuardrail` takes only `id` — it calls the module-level `guardrailById` directly, no registry-scoped param.)

  Change the import line:

  ```js
  import { loadRegistry } from './load.mjs';
  ```

  to:

  ```js
  import { loadRegistry, toolById, guardrailById } from './load.mjs';
  ```

  Add these helpers immediately after the `TIER_COLORS` const:

  ```js
  /** Resolve a guardrail id to the denormalized chip shape {id,name_de,rule_de,why_de}. */
  function resolveGuardrail(id) {
    const g = guardrailById(id);
    if (!g) throw new Error(`emit-webapp: unknown guardrail id "${id}"`);
    return { id: g.id, name_de: g.name_de, rule_de: g.rule_de, why_de: g.why_de };
  }

  /** German label for a tool kind (skill|agent|task). */
  function kindDe(kind) {
    switch (kind) {
      case 'skill': return 'Fertigkeit';
      case 'agent': return 'Agent';
      case 'task': return 'Aufgabe';
      default: throw new Error(`emit-webapp: unknown tool kind "${kind}"`);
    }
  }
  ```

  Then replace the `tools` projection (raw cut) with the resolved one — change:

  ```js
      summary_de: t.summary_de,
      what_for_de: t.what_for_de,
      how_to_start_de: t.how_to_start_de,
      what_could_go_wrong_de: t.what_could_go_wrong_de,
      danger: t.danger,
      guardrails: t.guardrails ?? [],
      related: t.related ?? [],
      links: t.links ?? [],
    }));
  ```

  to:

  ```js
      kind_de: kindDe(t.kind),
      summary_de: t.summary_de,
      what_for_de: t.what_for_de,
      how_to_start_de: t.how_to_start_de,
      what_could_go_wrong_de: t.what_could_go_wrong_de,
      danger: t.danger,
      guardrails: (t.guardrails ?? []).map(resolveGuardrail),
      related: t.related ?? [],
      links: t.links ?? [],
    }));
  ```

  Then replace the `goals` projection — change:

  ```js
      flow: (g.flow ?? []).map(step => ({ tool: step.tool, note_de: step.note_de })),
      example_prompt_de: g.example_prompt_de,
      guardrails: g.guardrails ?? [],
      related: g.related ?? [],
    }));
  ```

  to:

  ```js
      flow: (g.flow ?? []).map(step => {
        const tool = toolById(step.tool);
        if (!tool) throw new Error(`emit-webapp: goal "${g.id}" references unknown tool "${step.tool}"`);
        return { tool: step.tool, tool_name_de: tool.name_de, note_de: step.note_de };
      }),
      example_prompt_de: g.example_prompt_de,
      guardrails: (g.guardrails ?? []).map(resolveGuardrail),
      related: g.related ?? [],
    }));
  ```

  > The `kind_de` field must sit immediately after `kind` in the tools object literal so the committed JSON's key order is stable (the determinism gate in Task 3 depends on insertion order).

- [ ] **Step 4: Run the test, watch it pass.**

  ```bash
  node --test scripts/agent-guide/emit-webapp.test.mjs
  ```

  Expected: `# pass 6`, `# fail 0`, exit 0.

- [ ] **Step 5: Commit.**

  ```bash
  git add scripts/agent-guide/emit-webapp.mjs scripts/agent-guide/emit-webapp.test.mjs
  git commit -m "feat(agent-guide): resolve flow tool names, guardrail rationale, kind_de in emitter

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 3: Emitter CLI writer + byte-stable determinism

**Files:**
- Modify: `scripts/agent-guide/emit-webapp.mjs` (add stable serializer + CLI entrypoint)
- Modify: `scripts/agent-guide/emit-webapp.test.mjs` (add determinism test)
- Test: `node --test scripts/agent-guide/emit-webapp.test.mjs`

- [ ] **Step 1: Write the failing determinism test.** Append to `scripts/agent-guide/emit-webapp.test.mjs`. This imports a new exported `serialize()` and asserts byte-stability across two calls (the guard that makes the §8.1 diff gate meaningful).

  ```js
  import { serialize } from './emit-webapp.mjs';

  test('serialize: byte-identical across two runs (determinism guard)', () => {
    const dir = globalThis.__agFixtureRegistry();
    const a = serialize(buildWebappData(dir));
    const b = serialize(buildWebappData(dir));
    assert.equal(a, b, 'two serializations of the same registry must be byte-identical');
    assert.ok(a.endsWith('\n'), 'output ends with a trailing newline');
    // Stable, indented, deterministic key order at top level:
    assert.match(a, /^\{\n {2}"\$schema": "agent-guide\.generated\/v1",/);
  });
  ```

- [ ] **Step 2: Run the test, watch it fail.**

  ```bash
  node --test scripts/agent-guide/emit-webapp.test.mjs
  ```

  Expected: failure — `serialize` is not exported yet, e.g. `serialize is not a function` / `# fail 1`.

- [ ] **Step 3: Implement `serialize()` + the CLI writer.** Append to `scripts/agent-guide/emit-webapp.mjs` (after `buildWebappData`):

  ```js
  import { writeFileSync } from 'node:fs';
  import { fileURLToPath } from 'node:url';
  import { dirname, resolve } from 'node:path';
  import { validateRegistry } from './validate.mjs';

  /**
   * Deterministic JSON serialization. `buildWebappData` already produces a fixed
   * key order (object-literal insertion order is stable), so a plain 2-space
   * JSON.stringify + trailing newline is byte-stable across runs.
   */
  export function serialize(data) {
    return JSON.stringify(data, null, 2) + '\n';
  }

  const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const REGISTRY_DIR = resolve(REPO_ROOT, 'docs/agent-guide/registry');
  const OUT_FILE = resolve(REPO_ROOT, 'website/src/lib/agent-guide.generated.json');

  /** CLI entrypoint: validate (fail-closed) → build → write. */
  export function main() {
    const result = validateRegistry('docs/agent-guide/registry', REPO_ROOT);
    if (result && result.ok === false) {
      const errs = (result.errors ?? []).join('\n  - ');
      console.error(`emit-webapp: registry is INVALID — refusing to emit:\n  - ${errs}`);
      process.exit(1);
    }
    const data = buildWebappData(REGISTRY_DIR);
    writeFileSync(OUT_FILE, serialize(data));
    console.error(`emit-webapp: wrote ${OUT_FILE}`);
  }

  // Run only when invoked directly (not when imported by tests).
  if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main();
  }
  ```

  > Note on `validateRegistry`'s return contract: F+B's validator either returns `{ok, errors}` or throws on invalid input. The guard above handles the `{ok:false}` shape; if your F+B build throws instead, the thrown error already aborts with a non-zero exit (fail-closed either way, satisfying spec decision #4). Do not swallow the throw.

- [ ] **Step 4: Run the test, watch it pass.**

  ```bash
  node --test scripts/agent-guide/emit-webapp.test.mjs
  ```

  Expected: `# pass 7`, `# fail 0`, exit 0.

- [ ] **Step 5: Commit.**

  ```bash
  git add scripts/agent-guide/emit-webapp.mjs scripts/agent-guide/emit-webapp.test.mjs
  git commit -m "feat(agent-guide): deterministic serialize + fail-closed CLI writer

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 4: Generate + commit `agent-guide.generated.json`; wire the Taskfile

**Files:**
- Modify: `Taskfile.yml` (add `agent-guide:webapp` after line 348; wire it into the `agent-guide:emit` umbrella deps)
- Create (generated, committed): `website/src/lib/agent-guide.generated.json`
- Test: `task agent-guide:webapp` then `git diff --exit-code website/src/lib/agent-guide.generated.json`

- [ ] **Step 1: Add the `agent-guide:webapp` task.** Open `Taskfile.yml`. The `test:docs-gen` block ends at line 348 (`- node --test scripts/docs-gen/*.test.mjs`) and `test:all` begins at line 350. Immediately after line 348 (the blank line 349, before `test:all:`), insert:

  ```yaml
  agent-guide:webapp:
    desc: "S2: regenerate website/src/lib/agent-guide.generated.json from the registry"
    cmds:
      - node scripts/agent-guide/emit-webapp.mjs
  ```

- [ ] **Step 2: Wire it as a dep of the existing `agent-guide:emit` umbrella.** On the rebased `main`, S1 owns the `agent-guide:emit` task (it lists `agent-guide:docs` under `deps:`). Add `agent-guide:webapp` to its `deps:` list — do NOT redefine the umbrella. For example, change:

  ```yaml
  agent-guide:emit:
    desc: "Regenerate all agent-guide artifacts"
    deps:
      - agent-guide:docs
  ```

  to:

  ```yaml
  agent-guide:emit:
    desc: "Regenerate all agent-guide artifacts"
    deps:
      - agent-guide:docs
      - agent-guide:webapp
  ```

- [ ] **Step 3: Verify (do NOT add) the `test:agent-guide` → `test:all` wiring.** `test:agent-guide` is an **F+B deliverable** already present in `test:all` on the rebased `main`, and it globs `scripts/agent-guide/*.test.mjs` — so `emit-webapp.test.mjs` is auto-covered. Confirm it, do not re-add it:

  ```bash
  grep -n 'test:agent-guide' Taskfile.yml
  ```

  Expected: at least two hits — the `test:agent-guide:` task definition and its entry under `test:all`'s `deps:`. If this grep returns **nothing**, the rebase is incomplete (F+B has not landed) — **stop** and rebase per the Prerequisites block. Do not add the entry yourself; the umbrella wiring is F+B/S1-owned.

  > In the current S2 worktree (pre-rebase) this grep returns nothing, which is the expected "stop" signal until S1+F+B are on `main`.

- [ ] **Step 4: Generate the artifact and verify determinism.** Run the task twice; the second run must produce no diff.

  ```bash
  task agent-guide:webapp
  git add website/src/lib/agent-guide.generated.json
  task agent-guide:webapp
  git diff --exit-code website/src/lib/agent-guide.generated.json && echo "DETERMINISTIC OK"
  ```

  Expected: first run writes `website/src/lib/agent-guide.generated.json`; the second run leaves it byte-identical, so `git diff --exit-code` prints `DETERMINISTIC OK` and exits 0. Inspect the file: it must start with `{`, contain `"$schema": "agent-guide.generated/v1"`, a `taxonomy` array of 4 entries each with a `color`, `goals` with resolved `flow[].tool_name_de`, `tools` with `kind_de`, and a `components` object keyed by slug.

- [ ] **Step 5: Validate the Taskfile parses and commit.**

  ```bash
  task --list >/dev/null && echo "TASKFILE OK"
  git add Taskfile.yml website/src/lib/agent-guide.generated.json
  git commit -m "feat(agent-guide): emit + commit agent-guide.generated.json; task agent-guide:webapp

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

  Expected: `task --list` exits 0 (`TASKFILE OK`).

---

## Task 5: Typed re-export `agentGuide.ts` + tier helpers

**Files:**
- Create: `website/src/lib/agentGuide.ts`
- Create (local vitest): `website/src/lib/agentGuide.test.ts`
- Test: `npm run test:unit --prefix website -- agentGuide`

vitest includes `src/**/*.{test,spec}.ts` (`website/vitest.config.ts:10`), so this test runs under `npm run test:unit` inside `website/`. It is **local-only** (not in CI).

- [ ] **Step 1: Write the failing test.** Create `website/src/lib/agentGuide.test.ts`. The third assertion blocks a **dangling tier id** explicitly via `taxonomy` membership — a referenced danger id with no taxonomy entry must FAIL here rather than silently passing through the `tierColor` `#888888` fallback.

  ```ts
  import { describe, expect, it } from 'vitest';
  import {
    goals, tools, taxonomy, components,
    tierFor, tierColor, tierEmoji, tierLabel, componentBySlug,
  } from './agentGuide';

  describe('agentGuide typed re-export', () => {
    it('exposes goals/tools/taxonomy/components from the generated JSON', () => {
      expect(Array.isArray(goals)).toBe(true);
      expect(Array.isArray(tools)).toBe(true);
      expect(Array.isArray(taxonomy)).toBe(true);
      expect(taxonomy.length).toBe(4);
      expect(typeof components).toBe('object');
      expect(Array.isArray(components)).toBe(false); // keyed by slug, not a list
    });

    it('tierFor resolves a taxonomy id to {emoji,label,color,meaning}', () => {
      const t = tierFor('safe');
      expect(t).toBeTruthy();
      expect(t!.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(t!.emoji).toBeTruthy();
      expect(t!.label).toBeTruthy();
      expect(t!.meaning).toBeTruthy();
    });

    it('every danger id referenced by a goal or tool exists in taxonomy (no dangling ids)', () => {
      const referenced = new Set<string>([
        ...goals.map(g => g.danger),
        ...tools.map(t => t.danger),
      ]);
      const tierIds = new Set(taxonomy.map(t => t.id));
      for (const id of referenced) {
        // Membership check — NOT a hex check — so a dangling id cannot hide
        // behind the tierColor('#888888') fallback.
        expect(tierIds.has(id), `tier "${id}" must exist in taxonomy`).toBe(true);
        expect(tierColor(id), `tierColor(${id})`).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(tierEmoji(id), `tierEmoji(${id})`).toBeTruthy();
        expect(tierLabel(id), `tierLabel(${id})`).toBeTruthy();
      }
    });

    it('componentBySlug returns the component for a known slug and undefined otherwise', () => {
      const someSlug = Object.keys(components)[0];
      expect(componentBySlug(someSlug)?.slug).toBe(someSlug);
      expect(componentBySlug('definitely-not-a-real-slug')).toBeUndefined();
    });
  });
  ```

- [ ] **Step 2: Run the test, watch it fail.**

  ```bash
  npm run test:unit --prefix website -- agentGuide
  ```

  Expected: failure resolving `./agentGuide`, e.g. `Failed to resolve import "./agentGuide"` (vitest reports the file as failed).

- [ ] **Step 3: Implement the typed re-export.** Create `website/src/lib/agentGuide.ts`. The default JSON import is a **value** import (compatible with `verbatimModuleSyntax: true` set at `website/tsconfig.json:4`); `resolveJsonModule` is inherited from `astro/tsconfigs/strict` (`website/tsconfig.json:2`).

  ```ts
  import data from './agent-guide.generated.json';

  export interface TierEntry {
    id: string;
    label_de: string;
    emoji: string;
    meaning_de: string;
    color: string;
  }

  export interface GuardrailChip {
    id: string;
    name_de: string;
    rule_de: string;
    why_de: string;
  }

  export interface GoalFlowStep {
    tool: string;
    tool_name_de: string;
    note_de: string;
  }

  export interface Goal {
    id: string;
    title_de: string;
    when_de: string;
    danger: string;
    flow: GoalFlowStep[];
    example_prompt_de: string;
    guardrails: GuardrailChip[];
    related: string[];
  }

  export interface Tool {
    id: string;
    name_de: string;
    kind: string;
    kind_de: string;
    summary_de: string;
    what_for_de: string;
    how_to_start_de: string;
    what_could_go_wrong_de: string;
    danger: string;
    guardrails: GuardrailChip[];
    related: string[];
    links: string[];
  }

  export interface Component {
    slug: string;
    kind: string;
    name: string;
    emoji: string;
    summary_de: string;
    sensitivity: string;
    url: string;
  }

  export const taxonomy: TierEntry[] = data.taxonomy as TierEntry[];
  export const goals: Goal[] = data.goals as Goal[];
  export const tools: Tool[] = data.tools as Tool[];
  export const components: Record<string, Component> = data.components as Record<string, Component>;

  /** Single resolver over taxonomy[]; the conveniences below are derived from it. */
  export function tierFor(id: string): { emoji: string; label: string; color: string; meaning: string } | undefined {
    const t = taxonomy.find(x => x.id === id);
    if (!t) return undefined;
    return { emoji: t.emoji, label: t.label_de, color: t.color, meaning: t.meaning_de };
  }

  export function tierColor(id: string): string {
    return tierFor(id)?.color ?? '#888888';
  }

  export function tierEmoji(id: string): string {
    return tierFor(id)?.emoji ?? '⚪';
  }

  export function tierLabel(id: string): string {
    return tierFor(id)?.label ?? id;
  }

  export function componentBySlug(slug: string): Component | undefined {
    return components[slug];
  }
  ```

- [ ] **Step 4: Run the test, watch it pass.**

  ```bash
  npm run test:unit --prefix website -- agentGuide
  ```

  Expected: the `agentGuide typed re-export` suite reports `4 passed`, exit 0.

- [ ] **Step 5: Commit.**

  ```bash
  git add website/src/lib/agentGuide.ts website/src/lib/agentGuide.test.ts
  git commit -m "feat(agent-guide): typed agentGuide.ts re-export + tier helpers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 6: `helpContent.admin.platform` — programmatic, non-empty actions

**Files:**
- Modify: `website/src/lib/helpContent.ts` (head: import + `platformHelp` const after line 13; inside `admin: {` at line 225-226 add `platform: platformHelp,`)
- Create (local vitest): `website/src/lib/helpContent.platform.test.ts`
- Test: `npm run test:unit --prefix website -- helpContent.platform`

This closes the §1 gap: `/admin/platform` currently renders the empty state because `helpContent.admin` has no `platform` key (verified — `admin:` opens at `helpContent.ts:225` with `dashboard:` first; no `platform`). The new section is built from `agentGuide.ts` components with the **non-empty `actions` fallback** so `HelpView.svelte:27`'s `{#if content.actions.length > 0}` always passes.

- [ ] **Step 1: Write the failing test.** Create `website/src/lib/helpContent.platform.test.ts`:

  ```ts
  import { describe, expect, it } from 'vitest';
  import { helpContent } from './helpContent';
  import { components } from './agentGuide';

  describe('helpContent.admin.platform', () => {
    it('exists with a non-empty title and description', () => {
      const p = helpContent.admin.platform;
      expect(p).toBeTruthy();
      expect(p.title).toBe('Plattform Hub');
      expect(p.description.length).toBeGreaterThan(0);
    });

    it('has NON-EMPTY actions (the §5.2 fallback guarantee — fixes the blank drawer)', () => {
      const p = helpContent.admin.platform;
      expect(p.actions.length).toBeGreaterThan(0);
      expect(p.actions.length).toBeLessThanOrEqual(8);
    });

    it('derives each action from a real component (emoji + name + summary)', () => {
      const p = helpContent.admin.platform;
      const names = Object.values(components).map(c => c.name);
      for (const action of p.actions) {
        expect(names.some(n => action.includes(n)),
          `action "${action}" must contain a known component name`).toBe(true);
      }
    });

    it('ships exactly one hand-authored guide pointing at the Agent-Anleitung view', () => {
      const p = helpContent.admin.platform;
      expect(p.guides.length).toBe(1);
      expect(p.guides[0].steps.join(' ')).toContain('Agent-Anleitung');
    });
  });
  ```

- [ ] **Step 2: Run the test, watch it fail.**

  ```bash
  npm run test:unit --prefix website -- helpContent.platform
  ```

  Expected: failure — `helpContent.admin.platform` is `undefined`, so `expect(p).toBeTruthy()` fails and `p.title` throws (`Cannot read properties of undefined`).

- [ ] **Step 3: Implement the platform section.** Edit `website/src/lib/helpContent.ts`. The `HelpGuide`/`HelpSection` interfaces are at lines 1-11 and `HelpContext` at line 13. Insert the import + `platformHelp` builder **immediately after line 13** (`export type HelpContext = 'portal' | 'admin';`) and before line 15 (`export const helpContent`):

  ```ts
  import { components } from './agentGuide';

  // ── S2: Plattform-Hub help, built programmatically from the agent-guide registry. ──
  // Only `title`, `description`, and the static guide are hand-authored German;
  // every component-specific string derives from the SSOT registry.
  const allComponents = Object.values(components);
  const sensitiveComponents = allComponents.filter(
    (c) => c.sensitivity === 'assisted' || c.sensitivity === 'forbidden',
  );
  // Non-empty guarantee: sensitive first; if none, fall back to first 8 in registry order.
  const actionSource = (sensitiveComponents.length > 0 ? sensitiveComponents : allComponents).slice(0, 8);

  const platformHelp: HelpSection = {
    title: 'Plattform Hub',
    description:
      'Hier siehst Du alle Bausteine der Plattform (Software-Dienste und Hardware-Knoten). ' +
      'Öffne „Agent-Anleitung", um zu lernen, wie Du sie bedienst — ohne etwas kaputtzumachen.',
    actions: actionSource.map((c) => `${c.emoji} ${c.name} — ${c.summary_de}`),
    guides: [
      {
        title: 'Wie finde ich Hilfe zu einem Baustein?',
        steps: [
          'Öffne den Sidekick (Knopf unten rechts).',
          'Tippe auf „Agent-Anleitung".',
          'Suche unter „Werkzeuge & Agenten" oder „Ich will …" nach dem passenden Eintrag.',
        ],
      },
    ],
  };
  ```

  Then register the key inside the existing `admin: { ... }` record. The `admin` block opens at line 225 (`admin: {`) with `dashboard:` as its first key (line 226). Add `platform: platformHelp,` as a new first entry — change:

  ```ts
    admin: {
      dashboard: {
  ```

  to:

  ```ts
    admin: {
      platform: platformHelp,
      dashboard: {
  ```

- [ ] **Step 4: Run the test, watch it pass.**

  ```bash
  npm run test:unit --prefix website -- helpContent.platform
  ```

  Expected: the `helpContent.admin.platform` suite reports `4 passed`, exit 0.

- [ ] **Step 5: Commit.**

  ```bash
  git add website/src/lib/helpContent.ts website/src/lib/helpContent.platform.test.ts
  git commit -m "feat(agent-guide): populate /admin/platform help from registry (non-empty actions)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 7: `AgentGuideView.svelte` — legend + goal cards + tool cards + clipboard

**Files:**
- Create: `website/src/components/assistant/AgentGuideView.svelte`
- Test: build-as-gate via Task 8 (`npm run build --prefix website`)

**TDD exemption (explicit).** This repo has **no Svelte component unit-test harness** — no existing Sidekick view (`HelpView.svelte`, `SidekickHome.svelte`, …) has a `.test.ts`. A pure red-green unit cycle on the markup is therefore not available. The red signal for this component is structural and is supplied by **Task 8**: Task 8 wires `PortalSidekick.svelte` to `import AgentGuideView from './assistant/AgentGuideView.svelte'` and render it; running `npm run build --prefix website` **before** this file exists fails with `Cannot find module './assistant/AgentGuideView.svelte'`, and creating this file (this task) turns that build green. To preserve red-green ordering, execute the import edit in Task 8 Step 1 first and observe the failing build, then create this component. (The two tasks are intentionally coupled; do not skip Task 8 Step 1's failing-build observation.)

The view takes **no props** (global catalog). It imports from `agentGuide.ts` only. It reuses the Sidekick CSS tokens (`--brass`, `--serif`, `--mono`, `--line`, `--fg`, `--fg-soft`, `--ink-800`, `--ink-850`, `--line-2`, `--mute` from the Sidekick panel CSS, loaded by `AdminLayout`/`PortalLayout`) and the HelpView structural idioms (eyebrow intro, `<details>` accordion), adding NEW badge/legend/clipboard/cross-link markup. Per reviewer grounding note: the base `Layout.astro` mounts the FAB but does **not** import the Sidekick panel CSS (only `AdminLayout`/`PortalLayout` do — same pre-existing condition as `HelpView`/`SidekickHome`). To degrade gracefully if the FAB is opened on a base-`Layout` page, every load-bearing token below ships a **safe fallback** (`var(--token, #fallback)`).

- [ ] **Step 1: Create the component.** Write `website/src/components/assistant/AgentGuideView.svelte`:

  ```svelte
  <script lang="ts">
    import { goals, tools, taxonomy, tierColor, tierEmoji, tierLabel } from '../../lib/agentGuide';

    let copiedId = $state<string | null>(null);

    async function copyPrompt(id: string, text: string) {
      try {
        await navigator.clipboard.writeText(text);
        copiedId = id;
        setTimeout(() => { if (copiedId === id) copiedId = null; }, 1600);
      } catch { /* clipboard unavailable — no-op */ }
    }

    function scrollToTool(id: string) {
      const el = document.getElementById(`ag-tool-${id}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  </script>

  <div class="ag-body">
    <div class="ag-intro">
      <span class="ag-eyebrow">
        <span class="ag-eyebrow-bar" aria-hidden="true"></span>
        Agent-Anleitung
      </span>
      <h3 class="ag-title">Ich will … — welches Werkzeug nehme ich?</h3>
      <p class="ag-desc">Wähle ein Ziel oder ein Werkzeug. Die Farbe zeigt, wie vorsichtig Du sein musst.</p>
    </div>

    <!-- Tier legend -->
    <ul class="ag-legend" aria-label="Gefahrenstufen">
      {#each taxonomy as tier (tier.id)}
        <li class="ag-legend-item" style="--tier: {tier.color}">
          <span class="ag-legend-badge">{tier.emoji} {tier.label_de}</span>
          <span class="ag-legend-text">{tier.meaning_de}</span>
        </li>
      {/each}
    </ul>

    <!-- A. Ziele -->
    <p class="ag-section-label">Ich will …</p>
    <div class="ag-cards">
      {#each goals as goal (goal.id)}
        <article class="ag-card">
          <header class="ag-card-head">
            <span class="ag-name">{goal.title_de}</span>
            <span class="ag-tier" style="--tier: {tierColor(goal.danger)}">
              {tierEmoji(goal.danger)} {tierLabel(goal.danger)}
            </span>
          </header>
          <p class="ag-when">{goal.when_de}</p>

          <ol class="ag-flow">
            {#each goal.flow as step, i (i)}
              <li><strong>{step.tool_name_de}</strong> — {step.note_de}</li>
            {/each}
          </ol>

          <div class="ag-prompt">
            <code class="ag-prompt-text">{goal.example_prompt_de}</code>
            <button class="ag-copy" onclick={() => copyPrompt(goal.id, goal.example_prompt_de)}>
              {copiedId === goal.id ? 'Kopiert ✓' : 'Diesen Prompt kopieren'}
            </button>
          </div>

          {#if goal.guardrails.length > 0}
            <div class="ag-chips">
              {#each goal.guardrails as g (g.id)}
                <details class="ag-chip">
                  <summary>{g.name_de}</summary>
                  <p class="ag-chip-rule">{g.rule_de}</p>
                  <p class="ag-chip-why">{g.why_de}</p>
                </details>
              {/each}
            </div>
          {/if}
        </article>
      {/each}
    </div>

    <!-- B. Werkzeuge & Agenten -->
    <p class="ag-section-label">Werkzeuge &amp; Agenten</p>
    <div class="ag-cards">
      {#each tools as tool (tool.id)}
        <article class="ag-card" id={`ag-tool-${tool.id}`}>
          <header class="ag-card-head">
            <span class="ag-name">{tool.name_de}</span>
            <span class="ag-kind">{tool.kind_de}</span>
            <span class="ag-tier" style="--tier: {tierColor(tool.danger)}">
              {tierEmoji(tool.danger)} {tierLabel(tool.danger)}
            </span>
          </header>
          <p class="ag-summary">{tool.summary_de}</p>

          <details class="ag-detail">
            <summary>Wofür ist das?</summary>
            <p>{tool.what_for_de}</p>
            <p class="ag-label">So startest Du</p><p>{tool.how_to_start_de}</p>
            <p class="ag-label">Was kann schiefgehen</p><p>{tool.what_could_go_wrong_de}</p>
          </details>

          {#if tool.guardrails.length > 0}
            <div class="ag-chips">
              {#each tool.guardrails as g (g.id)}
                <details class="ag-chip">
                  <summary>{g.name_de}</summary>
                  <p class="ag-chip-rule">{g.rule_de}</p>
                  <p class="ag-chip-why">{g.why_de}</p>
                </details>
              {/each}
            </div>
          {/if}

          {#if tool.related.length > 0}
            <div class="ag-related">
              {#each tool.related as relId (relId)}
                <button class="ag-related-chip" onclick={() => scrollToTool(relId)}>↳ {relId}</button>
              {/each}
            </div>
          {/if}
        </article>
      {/each}
    </div>
  </div>

  <style>
    .ag-body {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      padding-bottom: 28px;
    }

    /* Intro (mirrors HelpView eyebrow/title/desc tokens) */
    .ag-intro {
      padding: 24px 22px 18px;
      border-bottom: 1px solid var(--line, #243042);
    }
    .ag-eyebrow {
      font-family: var(--mono, 'Geist Mono', monospace);
      font-size: 11px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--brass, #e8c870);
      display: inline-flex;
      align-items: center;
      gap: 10px;
    }
    .ag-eyebrow-bar { width: 22px; height: 1px; background: currentColor; opacity: 0.8; }
    .ag-title {
      font-family: var(--serif, Georgia, serif);
      font-size: 22px;
      font-weight: 400;
      color: var(--fg, #e9eef5);
      margin: 18px 0 6px;
    }
    .ag-desc { font-size: 14px; color: var(--fg-soft, #aeb9c7); margin: 0; line-height: 1.55; max-width: 46ch; }

    .ag-section-label {
      font-family: var(--mono, 'Geist Mono', monospace);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.16em;
      color: var(--mute, #8a97a6);
      margin: 22px 22px 12px;
    }

    /* Legend */
    .ag-legend { list-style: none; margin: 16px 22px 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .ag-legend-item { display: flex; align-items: baseline; gap: 10px; font-size: 13px; color: var(--fg-soft, #aeb9c7); }
    .ag-legend-badge {
      font-family: var(--mono, 'Geist Mono', monospace);
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 999px;
      border: 1px solid var(--tier);
      color: var(--tier);
      white-space: nowrap;
      flex-shrink: 0;
    }

    /* Cards */
    .ag-cards { display: flex; flex-direction: column; gap: 10px; margin: 0 22px 18px; }
    .ag-card {
      border: 1px solid var(--line, #243042);
      border-radius: var(--radius-md, 12px);
      background: var(--ink-800, #16202e);
      padding: 14px 16px;
    }
    .ag-card-head { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
    .ag-name { font-family: var(--serif, Georgia, serif); font-size: 16px; color: var(--fg, #e9eef5); flex: 1 1 auto; }
    .ag-kind {
      font-family: var(--mono, 'Geist Mono', monospace);
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--mute, #8a97a6);
      border: 1px solid var(--line-2, #2a3543);
      border-radius: 999px;
      padding: 2px 7px;
    }
    .ag-tier {
      font-family: var(--mono, 'Geist Mono', monospace);
      font-size: 11px;
      border-radius: 999px;
      border: 1px solid var(--tier);
      color: var(--tier);
      padding: 2px 8px;
      white-space: nowrap;
    }
    .ag-when, .ag-summary { font-size: 13px; color: var(--fg-soft, #aeb9c7); margin: 8px 0 0; line-height: 1.5; }

    .ag-flow { margin: 10px 0 0; padding-left: 20px; display: flex; flex-direction: column; gap: 4px; }
    .ag-flow li { font-size: 13px; color: var(--fg-soft, #aeb9c7); line-height: 1.5; }
    .ag-flow li::marker { color: var(--brass, #e8c870); font-family: var(--mono, 'Geist Mono', monospace); font-size: 11px; }

    /* Copy-to-clipboard prompt */
    .ag-prompt {
      margin-top: 10px;
      background: var(--ink-850, #121b27);
      border: 1px solid var(--line, #243042);
      border-radius: 10px;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .ag-prompt-text { font-family: var(--mono, 'Geist Mono', monospace); font-size: 12px; color: var(--fg, #e9eef5); white-space: pre-wrap; }
    .ag-copy {
      align-self: flex-start;
      font-family: var(--mono, 'Geist Mono', monospace);
      font-size: 11px;
      color: var(--brass, #e8c870);
      background: transparent;
      border: 1px solid var(--brass-d, var(--line, #243042));
      border-radius: 999px;
      padding: 4px 10px;
      cursor: pointer;
    }
    .ag-copy:hover { background: oklch(0.80 0.09 75 / 0.08); }

    /* Guardrail chips (tap to expand rule/why) */
    .ag-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
    .ag-chip {
      border: 1px solid var(--line-2, #2a3543);
      border-radius: 999px;
      padding: 0;
      max-width: 100%;
    }
    .ag-chip summary {
      font-family: var(--mono, 'Geist Mono', monospace);
      font-size: 11px;
      color: var(--fg-soft, #aeb9c7);
      padding: 3px 10px;
      cursor: pointer;
      list-style: none;
    }
    .ag-chip summary::-webkit-details-marker { display: none; }
    .ag-chip[open] { border-radius: 10px; padding: 0 10px 8px; border-color: var(--brass-d, var(--line, #243042)); }
    .ag-chip-rule { font-size: 12px; color: var(--fg, #e9eef5); margin: 6px 0 2px; }
    .ag-chip-why { font-size: 12px; color: var(--mute, #8a97a6); margin: 0; font-style: italic; }

    /* Tool detail accordion (mirrors HelpView guide-item) */
    .ag-detail { margin-top: 10px; }
    .ag-detail summary {
      font-family: var(--serif, Georgia, serif);
      font-size: 14px;
      color: var(--fg, #e9eef5);
      cursor: pointer;
      list-style: none;
      padding: 6px 0;
    }
    .ag-detail summary::-webkit-details-marker { display: none; }
    .ag-detail p { font-size: 13px; color: var(--fg-soft, #aeb9c7); margin: 4px 0; line-height: 1.5; }
    .ag-label {
      font-family: var(--mono, 'Geist Mono', monospace);
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--brass, #e8c870);
      margin-top: 10px;
    }

    /* Cross-links */
    .ag-related { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
    .ag-related-chip {
      font-family: var(--mono, 'Geist Mono', monospace);
      font-size: 11px;
      color: var(--brass, #e8c870);
      background: transparent;
      border: 1px solid var(--line-2, #2a3543);
      border-radius: 999px;
      padding: 3px 9px;
      cursor: pointer;
    }
    .ag-related-chip:hover { border-color: var(--brass, #e8c870); }

    @media (max-width: 480px) {
      .ag-intro { padding-inline: 18px; }
      .ag-cards, .ag-legend, .ag-section-label { margin-inline: 18px; }
    }
  </style>
  ```

- [ ] **Step 2: Verify it typechecks/builds.** Run the website build (this catches Svelte type errors and a broken import against `agentGuide.ts`):

  ```bash
  npm run build --prefix website
  ```

  Expected: build completes with exit 0 (no `Cannot find module '../../lib/agentGuide'` and no Svelte compile error). If `agent-guide.generated.json` is missing, run `task agent-guide:webapp` first (Task 4). Note: this is the green half — the matching red signal was observed in Task 8 Step 1 (the import-before-create failing build).

- [ ] **Step 3: Commit.**

  ```bash
  git add website/src/components/assistant/AgentGuideView.svelte
  git commit -m "feat(agent-guide): AgentGuideView Sidekick view (legend + cards + clipboard)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 8: Wire `PortalSidekick.svelte` — View union, titleMap, render branch

**Files:**
- Modify: `website/src/components/PortalSidekick.svelte` (import after line 9; line 11 union; lines 41-48 titleMap; render branch after line 193)
- Test: `npm run build --prefix website`

This task supplies the **red signal for Task 7**: Step 1 adds the `AgentGuideView` import (and the render branch) before the component file exists, so the build fails on the missing module — exactly the red half of Task 7's coupled cycle. Then create `AgentGuideView.svelte` per Task 7, and this task's later steps turn the build green.

- [ ] **Step 1: Import the new view and observe the failing build (Task 7's red signal).** In `website/src/components/PortalSidekick.svelte`, after the existing import on line 9 (`import InboxSidekickView from './assistant/InboxSidekickView.svelte';`), add:

  ```ts
    import AgentGuideView from './assistant/AgentGuideView.svelte';
  ```

  Then, **before** creating `AgentGuideView.svelte`, run the build to watch it fail:

  ```bash
  npm run build --prefix website
  ```

  Expected: build FAILS with `Cannot find module './assistant/AgentGuideView.svelte'` (or the Vite/Astro equivalent "Could not resolve" error). This is the intended red signal. Now go execute **Task 7** (create `AgentGuideView.svelte`), then return here and continue with Step 2.

- [ ] **Step 2: Extend the `View` union.** Change line 11:

  ```ts
    type View = 'home' | 'support' | 'questionnaire' | 'help' | 'tickets' | 'inbox';
  ```

  to:

  ```ts
    type View = 'home' | 'support' | 'questionnaire' | 'help' | 'tickets' | 'inbox' | 'agent-guide';
  ```

- [ ] **Step 3: Add the title.** In the `titleMap` (lines 41-48), add the `agent-guide` entry. Change:

  ```ts
    const titleMap: Record<View, string> = {
      home: 'Sidekick',
      support: 'Feedback & Support',
      questionnaire: 'Fragebögen',
      help: 'Hilfe',
      tickets: 'Anfragen',
      inbox: 'Postfach',
    };
  ```

  to:

  ```ts
    const titleMap: Record<View, string> = {
      home: 'Sidekick',
      support: 'Feedback & Support',
      questionnaire: 'Fragebögen',
      help: 'Hilfe',
      tickets: 'Anfragen',
      inbox: 'Postfach',
      'agent-guide': 'Agent-Anleitung',
    };
  ```

- [ ] **Step 4: Add the render branch.** In `drawer-body`, after the `help` branch (lines 192-193, `{:else if view === 'help'}` / `<HelpView ... />`) and before the `tickets` branch (line 194), insert the new branch. The block becomes:

  ```svelte
      {:else if view === 'help'}
        <HelpView section={helpSection} context={helpContext} />
      {:else if view === 'agent-guide'}
        <AgentGuideView />
      {:else if view === 'tickets'}
        <TicketSidekickView onClose={closeDrawer} />
  ```

- [ ] **Step 5: Build and commit.**

  ```bash
  npm run build --prefix website
  ```

  Expected: exit 0 — `titleMap` satisfies `Record<View, string>` for the new member, the import resolves (Task 7 file now exists), and the branch compiles.

  ```bash
  git add website/src/components/PortalSidekick.svelte
  git commit -m "feat(agent-guide): wire agent-guide view into PortalSidekick

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 9: Wire `SidekickHome.svelte` — menu item + ordinals

**Files:**
- Modify: `website/src/components/assistant/SidekickHome.svelte` (line 2 union; `items` list lines 24-30)
- Test: `npm run build --prefix website`

The `View` union is **duplicated** here (Risk R3) and must be edited too. The new `agent-guide` item is **always shown** (`show: true`, unlike `help` which is gated on `!!helpSection`), with a **context-conditional** ordinal, placed just before `help`, and `help`'s ordinal is bumped.

- [ ] **Step 1: Extend the duplicated `View` union.** In `website/src/components/assistant/SidekickHome.svelte`, change line 2:

  ```ts
    type View = 'home' | 'support' | 'questionnaire' | 'help' | 'tickets' | 'inbox';
  ```

  to:

  ```ts
    type View = 'home' | 'support' | 'questionnaire' | 'help' | 'tickets' | 'inbox' | 'agent-guide';
  ```

- [ ] **Step 2: Add the menu item and bump the help ordinal.** Change the `items` `$derived` list (lines 24-30). Currently:

  ```ts
    const items = $derived<Item[]>([
      { id: 'tickets',       no: '01', title: 'Anfragen',           sub: 'Tickets erstellen & bearbeiten', badge: pendingTickets > 0 ? pendingTickets : undefined,       show: isAdmin },
      { id: 'inbox',         no: '02', title: 'Postfach',           sub: 'Nachrichten & Anfragen',         badge: pendingInbox > 0 ? pendingInbox : undefined,           show: isAdmin },
      { id: 'questionnaire', no: isAdmin ? '03' : '01', title: 'Fragebögen', sub: 'Aufgaben beantworten', badge: pendingQuestionnaires > 0 ? pendingQuestionnaires : undefined, show: true },
      { id: 'support',       no: isAdmin ? '04' : '02', title: 'Feedback & Support', sub: 'Fehler melden, Ideen teilen', show: true },
      { id: 'help',          no: isAdmin ? '05' : '03', title: 'Hilfe',        sub: 'Kontexthilfe für diese Seite', show: !!helpSection },
    ].filter(i => i.show));
  ```

  Change it to insert `agent-guide` before `help` (ordinal `05`/`03`) and bump `help` to `06`/`04`:

  ```ts
    const items = $derived<Item[]>([
      { id: 'tickets',       no: '01', title: 'Anfragen',           sub: 'Tickets erstellen & bearbeiten', badge: pendingTickets > 0 ? pendingTickets : undefined,       show: isAdmin },
      { id: 'inbox',         no: '02', title: 'Postfach',           sub: 'Nachrichten & Anfragen',         badge: pendingInbox > 0 ? pendingInbox : undefined,           show: isAdmin },
      { id: 'questionnaire', no: isAdmin ? '03' : '01', title: 'Fragebögen', sub: 'Aufgaben beantworten', badge: pendingQuestionnaires > 0 ? pendingQuestionnaires : undefined, show: true },
      { id: 'support',       no: isAdmin ? '04' : '02', title: 'Feedback & Support', sub: 'Fehler melden, Ideen teilen', show: true },
      { id: 'agent-guide',   no: isAdmin ? '05' : '03', title: 'Agent-Anleitung', sub: 'Lernen, wie alles funktioniert', show: true },
      { id: 'help',          no: isAdmin ? '06' : '04', title: 'Hilfe',        sub: 'Kontexthilfe für diese Seite', show: !!helpSection },
    ].filter(i => i.show));
  ```

  > `Item.id` is typed `View` (line 22), so the union edit in Step 1 is what makes `id: 'agent-guide'` typecheck.

- [ ] **Step 3: Build and verify.**

  ```bash
  npm run build --prefix website
  ```

  Expected: exit 0. `Item['id']` accepts `'agent-guide'` (union extended), and `onNavigate('agent-guide')` matches the `(view: View) => void` prop signature.

- [ ] **Step 4: Confirm the wiring is consistent across both files.** A quick grep proves both unions carry the new member (Risk R3 guard):

  ```bash
  grep -c "'agent-guide'" website/src/components/PortalSidekick.svelte website/src/components/assistant/SidekickHome.svelte
  ```

  Expected: each file reports `>= 2` (union member + usage); both nonzero. If `SidekickHome.svelte` shows `0`, the union edit was missed.

- [ ] **Step 5: Commit.**

  ```bash
  git add website/src/components/assistant/SidekickHome.svelte
  git commit -m "feat(agent-guide): add Agent-Anleitung menu item to SidekickHome

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 10: CI freshness gate in `ci.yml`

**Files:**
- Modify: `.github/workflows/ci.yml` (add a step after the test-inventory gate, after line 44, before line 46)
- Test: local dry-run of the gate logic; full validation lands when the PR runs CI on rebased `main`.

The CI gate for S2 is the **generated-JSON freshness diff** (website vitest is not in CI). It mirrors the existing "Verify test inventory is up to date" step (`ci.yml:38-44`).

- [ ] **Step 1: Add the gate step.** In `.github/workflows/ci.yml`, the test-inventory step spans lines 38-44 (ends at line 44 with `              exit 1` / `            fi`) and the "Validate Systembrett template" step is at line 46. Immediately after line 44 (the blank line 45) and before line 46, insert:

  ```yaml
        - name: Verify agent-guide webapp JSON is up to date
          run: |
            task agent-guide:webapp
            if ! git diff --exit-code website/src/lib/agent-guide.generated.json; then
              echo "ERROR: website/src/lib/agent-guide.generated.json is stale — run 'task agent-guide:webapp' locally and commit"
              exit 1
            fi
  ```

  > Indentation: match the existing steps (the `- name:` aligns with the `- name: Verify test inventory is up to date` line at column 7 — six spaces then `- name`).

- [ ] **Step 2: Validate the workflow YAML parses.** Use Node's YAML (the root `yaml` dep is present post-rebase) to assert the file is valid:

  ```bash
  node -e "const yaml=require('yaml');const fs=require('fs');yaml.parse(fs.readFileSync('.github/workflows/ci.yml','utf8'));console.log('CI YAML OK')"
  ```

  Expected: prints `CI YAML OK` (no parse error).

- [ ] **Step 3: Dry-run the gate locally.** Prove the gate is green against the committed artifact:

  ```bash
  task agent-guide:webapp
  git diff --exit-code website/src/lib/agent-guide.generated.json && echo "GATE GREEN"
  ```

  Expected: `GATE GREEN`, exit 0. If it prints a diff, the committed JSON is stale — `git add` it (it was regenerated) and re-commit before pushing.

- [ ] **Step 4: Confirm placement.** The new step must live in the `offline-tests` job (alongside the inventory gate), not the `security-scan` job:

  ```bash
  grep -n 'agent-guide webapp JSON\|test inventory is up to date\|Validate Systembrett' .github/workflows/ci.yml
  ```

  Expected: the three line numbers are consecutive in that order (inventory gate → agent-guide gate → Systembrett).

- [ ] **Step 5: Commit.**

  ```bash
  git add .github/workflows/ci.yml
  git commit -m "ci(agent-guide): freshness gate for agent-guide.generated.json

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Task 11: Full offline-suite + local vitest verification, then PR

**Files:**
- Test: `task test:all`; `npm run test:unit --prefix website`
- No file changes (verification + PR only).

- [ ] **Step 1: Run the full offline test umbrella.** This is what CI runs (minus the gates, which Tasks 4/10 cover):

  ```bash
  task test:all
  ```

  Expected: all dep tasks pass, including `test:agent-guide` (which globs `scripts/agent-guide/*.test.mjs` and now includes `emit-webapp.test.mjs` → `# pass 7`). Exit 0.

- [ ] **Step 2: Run the local website vitest suite.** These are local-only (not CI), but must pass before the PR:

  ```bash
  npm run test:unit --prefix website -- agentGuide helpContent.platform
  ```

  Expected: the `agentGuide typed re-export` (4 passed) and `helpContent.admin.platform` (4 passed) suites are green, exit 0.

- [ ] **Step 3: Re-run both gates to confirm the committed artifact is fresh.**

  ```bash
  task agent-guide:webapp
  git diff --exit-code website/src/lib/agent-guide.generated.json && echo "JSON GATE GREEN"
  task test:inventory
  git diff --exit-code website/src/data/test-inventory.json && echo "INVENTORY GATE GREEN"
  ```

  Expected: both print `... GATE GREEN`, exit 0. (The inventory gate may produce a diff if the new `.test.mjs`/`.test.ts` files changed the inventory — if so, `git add website/src/data/test-inventory.json` and commit it.)

- [ ] **Step 4: Verify the build one final time.**

  ```bash
  npm run build --prefix website && echo "BUILD GREEN"
  ```

  Expected: `BUILD GREEN`, exit 0.

- [ ] **Step 5: Commit any inventory regeneration, push, and open the PR.**

  ```bash
  git add -A
  git diff --cached --quiet || git commit -m "chore(agent-guide): regenerate test inventory for S2 tests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  git push -u origin feature/agent-guide-help
  ```

  Then open the PR with this body (covers spec §12 item 12):

  ```bash
  gh pr create --base main --title "feat(agent-guide): S2 — in-app help surface (Agent-Anleitung + platform drawer)" --body "$(cat <<'EOF'
  ## S2 — In-App Help Surface

  Renders the F+B agent-guide registry inside the website: a Sidekick-wide **Agent-Anleitung** view (goal catalog + tool/agent cards + danger-tier badges + copy-to-clipboard) and a populated **/admin/platform** help drawer — both from one committed generated artifact.

  ### Prerequisite + merge order
  - **Merge order S1 → S2 → S3 is enforced.** This PR depends on **S1** (`scripts/agent-guide/load.mjs` + the `agent-guide:emit` umbrella task) and **F+B** (`docs/agent-guide/registry/*.yaml`, `scripts/agent-guide/validate.mjs`, root `yaml@^2.8.3`, the `test:agent-guide` task already wired into `test:all`). The branch is rebased on a `main` that already contains both.

  ### What changed
  - `scripts/agent-guide/emit-webapp.mjs` — emitter (`buildWebappData` + `serialize` + fail-closed CLI), `node --test` covered.
  - `website/src/lib/agent-guide.generated.json` — committed contract; CI guards freshness via `git diff --exit-code`.
  - `website/src/lib/agentGuide.ts` — typed re-export + `tierFor/tierColor/tierEmoji/tierLabel/componentBySlug`.
  - `website/src/components/assistant/AgentGuideView.svelte` — new Sidekick view.
  - `website/src/lib/helpContent.ts` — new `admin.platform` section, **non-empty `actions`** (fixes the blank `/admin/platform` drawer).
  - `PortalSidekick.svelte` + `SidekickHome.svelte` — wiring (the `View` union is duplicated in both; both edited).
  - `Taskfile.yml` — `agent-guide:webapp`, wired as a dep of the existing `agent-guide:emit` umbrella.
  - `.github/workflows/ci.yml` — JSON freshness gate.

  ### Reviewer notes
  - **`PortalSidekick` mounts unconditionally** in all three layouts; the `ENABLE_ASSISTANT_ADMIN` / `ENABLE_ASSISTANT_PORTAL` flags gate only the separate `AssistantWidget`, not the Sidekick. So the new menu item is reachable wherever the FAB renders.
  - **Website vitest is local-only (not in CI).** The CI gate for S2 is the `agent-guide.generated.json` `git diff --exit-code`. `helpContent.platform.test.ts` (asserts non-empty `actions`) and `agentGuide.test.ts` (asserts no dangling tier ids) run via `npm run test:unit --prefix website`.

  🤖 Generated with [Claude Code](https://claude.com/claude-code)
  EOF
  )"
  ```

  Expected: `gh pr create` prints the PR URL. CI must go green (offline tests + both freshness gates) before merge; use squash-and-merge per the repo's Development Rules.
