---
title: Agent-Anleitung „Mental-Model" Start — Implementation Plan
ticket_id: T000385
domains: [website, test]
status: active
pr_number: null
---

# Agent-Anleitung „Mental-Model" Start — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsible "🧭 So funktioniert die Plattform" card (flow ribbon + infra territory map) above the existing Agent-Anleitung catalog; clicking a flow station or a territory node filters the catalog, and a teaching layer (concept line + glossary tooltips) onboards collaborators.

**Architecture:** Additive changes to a tested SSOT→emitter→UI pipeline. The registry (`docs/agent-guide/registry/*.yaml`) gains a new `flow.yaml`, optional `stages`/`concept_de` on goals/tools, and optional `area`/`theme`/`relates_to` on components. `emit-webapp.mjs` projects these into a new `map` block in `agent-guide.generated.json`. A new `GuideMap.svelte` renders the map and emits a `mapFilter` consumed by the existing search pipeline as an extra filter axis. A pure `splitGlossaryTerms` helper + `GlossaryTerm.svelte` add inline term popovers.

**Tech Stack:** Node ESM emitters (`node:test`), Svelte 5 runes (`$state`/`$derived`/`$effect`/`$props`), TypeScript, vitest (`website/src/lib/*.test.ts`), Playwright E2E, YAML registry. Tasks run via `task agent-guide:webapp`, `task test:agent-guide`, and `cd website && pnpm test:unit`.

---

## Conventions & invariants (read before starting)

- **Components are DB-bound.** `validate.mjs:95-100` cross-checks every `components.yaml` slug against `website/src/db/migrations/*platform_assets*`. **Never add or remove a component slug** — only add fields (`area`/`theme`/`relates_to`) to existing entries.
- **`links` ≠ drill targets.** `links: [{label_de,url}]` are external URLs. In-app drill targets use the new `relates_to: [<goal/tool id>]`.
- **Brittle test:** `website/src/lib/agentGuideSearch.test.ts:71` asserts the `website` theme has exactly **2** entries. New content goals/tools must **not** use `theme: website`.
- **Strict test:** `scripts/agent-guide/emit-webapp.test.mjs:97` asserts the emitted component object has exactly 7 keys. Task 2 updates this test before changing the emitter.
- **Stale-check:** `task test:agent-guide` regenerates `agent-guide.generated.json` and runs `git diff --exit-code` on it. After any registry change you MUST run `task agent-guide:emit` and commit the regenerated artifacts (webapp JSON + docs/*.md + maps/*.md).
- **CSS lives in one file**, not component-scoped: `website/src/styles/sidekick-panels.css`, all rules under `.drawer .ag-*` (Svelte-5/Vite prunes unrendered component CSS). Use the existing tokens: `var(--tier)`, `var(--accent)`, `var(--brass)`, `var(--fg)`, `var(--mute)`, `var(--line)`, `var(--serif)`, `var(--mono)`, `--ink-900: #0f1623`, and `color-mix(in srgb, …)`.
- Work happens in the worktree `/tmp/wt-agent-guide-mental-model` on branch `feature/agent-guide-mental-model`. Run commands from the repo root of that worktree.

## File structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `docs/agent-guide/registry/flow.yaml` | Ordered flow-ribbon stations (SSOT). |
| Create | `scripts/agent-guide/map-areas.mjs` | Shared constant: ordered territory areas (imported by emit + validate). |
| Modify | `scripts/agent-guide/validate.mjs` | Load+validate flow.yaml; check `stages`/`area`/`theme`/`relates_to` refs; warn on empty station. |
| Modify | `scripts/agent-guide/validate.test.mjs` | Fixtures + assertions for the new validation. |
| Modify | `scripts/agent-guide/emit-webapp.mjs` | Emit `map` block + `stages`/`concept_de` passthrough. |
| Modify | `scripts/agent-guide/emit-webapp.test.mjs` | Update component-keys test; add map-block tests. |
| Modify | `docs/agent-guide/registry/{goals,tools,components}.yaml` | Author `stages`/`concept_de`/`area`/`theme`/`relates_to` + 3 new goals. |
| Modify | `website/src/lib/agentGuide.ts` | Types + exports for `stages`, `concept_de`, `map`. |
| Modify | `tests/e2e/lib/agent-guide.ts` | Mirror new types + expose `map` in `loadGuideData`. |
| Modify | `website/src/lib/agentGuideSearch.ts` | `stages` on `GuideEntry`; pure `mapFilterIds` + `splitGlossaryTerms`. |
| Modify | `website/src/lib/agentGuideSearch.test.ts` | vitest for the two new pure helpers. |
| Create | `website/src/components/assistant/agent-guide/GuideMap.svelte` | Render flow ribbon + territory lanes; emit `onSelect`. |
| Create | `website/src/components/assistant/agent-guide/GlossaryTerm.svelte` | Inline term chip + popover. |
| Modify | `website/src/components/assistant/AgentGuideView.svelte` | Mount map; `mapFilter`/`mapOpen` state; first-run; active-filter chip. |
| Modify | `website/src/components/assistant/agent-guide/GuideCard.svelte` | Render `concept_de` line with glossary annotation. |
| Modify | `website/src/styles/sidekick-panels.css` | `.ag-map*`, `.ag-concept`, `.ag-gloss*`, `.ag-mapfilter*` styles. |
| Modify | `tests/e2e/specs/agent-guide-walkthrough.spec.ts` | Map render/click/collapse/glossary E2E + film step. |

---

## Task 1: flow.yaml + territory-areas module + validation

**Files:**
- Create: `docs/agent-guide/registry/flow.yaml`
- Create: `scripts/agent-guide/map-areas.mjs`
- Create: `scripts/agent-guide/fixtures/bad-stage-ref/` (+ copy of a good registry with one bad `stages` ref)
- Modify: `scripts/agent-guide/validate.mjs`
- Test: `scripts/agent-guide/validate.test.mjs`

- [ ] **Step 1: Create the territory-areas module**

Create `scripts/agent-guide/map-areas.mjs`:

```js
// scripts/agent-guide/map-areas.mjs
// Emitter-owned presentation metadata for the territory map lanes.
// Components opt onto the map by setting `area: <one of these ids>`.
export const TERRITORY_AREAS = [
  { id: 'dienste',   label_de: 'Dienste',             order: 1 },
  { id: 'plattform', label_de: 'Plattform & Cluster', order: 2 },
  { id: 'daten',     label_de: 'Daten & Geheimnisse', order: 3 },
];
export const TERRITORY_AREA_IDS = new Set(TERRITORY_AREAS.map((a) => a.id));
```

- [ ] **Step 2: Create flow.yaml**

Create `docs/agent-guide/registry/flow.yaml`:

```yaml
# docs/agent-guide/registry/flow.yaml
# Stations of the "Dein Weg: Idee → live" ribbon. `order` drives left→right.
# `danger` must be a taxonomy id. Goals/tools opt onto a station via `stages: [<id>]`.
- { id: idee,       label_de: "Idee",       emoji: "💡", danger: safe,     order: 1, blurb_de: "Was soll sich ändern? Noch nichts angefasst." }
- { id: brainstorm, label_de: "Brainstorm", emoji: "🧠", danger: safe,     order: 2, blurb_de: "Die Idee zu einem klaren Design schärfen." }
- { id: plan,       label_de: "Plan",       emoji: "📋", danger: caution,  order: 3, blurb_de: "Einen Schritt-für-Schritt-Plan schreiben." }
- { id: code,       label_de: "Code+TDD",   emoji: "💻", danger: caution,  order: 4, blurb_de: "Erst den Test, dann die Umsetzung." }
- { id: pr-ci,      label_de: "PR+CI",      emoji: "🔀", danger: assisted, order: 5, blurb_de: "Pull Request öffnen — CI muss grün sein." }
- { id: deploy,     label_de: "Deploy",     emoji: "🚀", danger: assisted, order: 6, blurb_de: "Die Änderung live bringen (Flux / Task)." }
- { id: live,       label_de: "Live",       emoji: "🌍", danger: safe,     order: 7, blurb_de: "Läuft es? Status und Logs prüfen." }
```

- [ ] **Step 3: Write the failing validation fixture + test**

Create the bad fixture by copying the good one and injecting a dangling stage ref. Run:

```bash
cd /tmp/wt-agent-guide-mental-model
cp -r scripts/agent-guide/fixtures/good scripts/agent-guide/fixtures/bad-stage-ref
cat > scripts/agent-guide/fixtures/bad-stage-ref/flow.yaml <<'EOF'
- { id: plan, label_de: "Plan", emoji: "📋", danger: caution, order: 1, blurb_de: "x" }
EOF
```

Then append a `stages: [does-not-exist]` to the first goal in `scripts/agent-guide/fixtures/bad-stage-ref/goals.yaml` (add the two lines under that goal):

```yaml
  stages: [does-not-exist]
```

Add to `scripts/agent-guide/validate.test.mjs`:

```js
test('dangling stages reference is rejected', () => {
  const res = validateRegistry(join(here, 'fixtures', 'bad-stage-ref'));
  assert.equal(res.ok, false);
  assert.ok(
    res.errors.some((e) => e.includes('stages') && e.includes('does-not-exist')),
    `expected a stages-ref error, got: ${JSON.stringify(res.errors)}`,
  );
});

test('good fixture still validates with a flow.yaml present', () => {
  // good fixture has no flow.yaml → flow checks are skipped, not errors
  const res = validateRegistry(join(here, 'fixtures', 'good'));
  assert.equal(res.ok, true, JSON.stringify(res.errors, null, 2));
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `node --test scripts/agent-guide/validate.test.mjs`
Expected: FAIL on `dangling stages reference is rejected` (validate doesn't know `stages` yet, so no error is produced → `res.ok` is `true`).

- [ ] **Step 5: Implement validation in validate.mjs**

In `scripts/agent-guide/validate.mjs`, add the import at the top (after the existing imports):

```js
import { TERRITORY_AREA_IDS } from './map-areas.mjs';
```

Inside `validateRegistry`, after the `themes`/`themeIds` block (around line 37), load flow and build id sets:

```js
  let flow = [];
  try { flow = load(dir, 'flow.yaml'); } catch { flow = []; }
  const flowIds = new Set((flow ?? []).map((f) => f && f.id));

  const goalIdSet = new Set(goals.map((g) => g.id));
  const cardIdSet = new Set([...goalIdSet, ...toolIds]); // valid relates_to / drill targets
```

Add flow-shape validation (only when a flow.yaml exists) right after:

```js
  for (const f of flow ?? []) {
    for (const k of ['id', 'label_de', 'emoji', 'danger', 'order', 'blurb_de'])
      req(f?.[k] !== undefined && f?.[k] !== null, `flow[${f?.id}]: missing '${k}'`);
    if (f?.danger) req(taxIds.has(f.danger), `flow[${f?.id}]: danger '${f.danger}' not in taxonomy`);
  }
```

Extend `checkCardExtras` (the opt-in block) to validate `stages`. Add inside that arrow function, before its closing brace:

```js
    for (const s of card?.stages ?? [])
      req(flowIds.size === 0 || flowIds.has(s), `${label}: stage '${s}' not in flow.yaml`);
```

Add component field validation. Inside the existing `for (const c of components)` loop, after the `sensitivity` check (line ~92), add:

```js
    if (c?.area !== undefined && c?.area !== null)
      req(TERRITORY_AREA_IDS.has(c.area), `components[${c?.slug}]: area '${c.area}' not a known territory area`);
    if (c?.theme !== undefined && c?.theme !== null && themeIds.size > 0)
      req(themeIds.has(c.theme), `components[${c?.slug}]: theme '${c.theme}' not in themes.yaml`);
    for (const rid of c?.relates_to ?? [])
      req(cardIdSet.has(rid), `components[${c?.slug}]: relates_to '${rid}' not a known goal/tool id`);
```

Add a non-fatal warnings array. Near the top of `validateRegistry` (after `const errors = [];`):

```js
  const warnings = [];
```

After all checks, before `return`, warn on empty stations:

```js
  if (flowIds.size > 0) {
    const usedStages = new Set();
    for (const card of [...goals, ...tools])
      for (const s of card?.stages ?? []) usedStages.add(s);
    for (const f of flow) if (!usedStages.has(f.id)) warnings.push(`flow station '${f.id}' has no goal/tool (stages)`);
  }
```

Change the return to include warnings:

```js
  return { ok: errors.length === 0, errors, warnings };
```

Update the CLI block at the bottom to print warnings without failing:

```js
if (import.meta.url === `file://${process.argv[1]}`) {
  const repoRoot = process.cwd();
  const res = validateRegistry(join(repoRoot, 'docs', 'agent-guide', 'registry'), repoRoot);
  for (const w of res.warnings ?? []) console.warn('⚠', w);
  if (!res.ok) { for (const e of res.errors) console.error('✗', e); process.exit(1); }
  console.log('✓ agent-guide registry valid');
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `node --test scripts/agent-guide/validate.test.mjs`
Expected: PASS (all tests, including the new two).

- [ ] **Step 7: Commit**

```bash
git add scripts/agent-guide/flow.yaml docs/agent-guide/registry/flow.yaml \
  scripts/agent-guide/map-areas.mjs scripts/agent-guide/validate.mjs \
  scripts/agent-guide/validate.test.mjs scripts/agent-guide/fixtures/bad-stage-ref
git commit -m "feat(agent-guide): flow.yaml + validation for stages/area/theme/relates_to"
```

> Note: `flow.yaml` belongs under `docs/agent-guide/registry/`, not `scripts/`. The `git add` above lists the registry path; remove the stray `scripts/agent-guide/flow.yaml` token if your shell created nothing there.

---

## Task 2: Emitter emits the `map` block + `stages`/`concept_de`

**Files:**
- Modify: `scripts/agent-guide/emit-webapp.mjs`
- Test: `scripts/agent-guide/emit-webapp.test.mjs`

- [ ] **Step 1: Update the strict component-keys test (it will break otherwise)**

In `scripts/agent-guide/emit-webapp.test.mjs`, the test `buildWebappData: keys components by slug with only the §6.1 fields` (lines ~93-104) asserts an exact 7-key set. Replace its body so the base keys remain required but the new optional keys are allowed only when present. Replace lines 93-104 with:

```js
test('buildWebappData: keys components by slug with the base fields (+ optional map fields)', () => {
  const data = buildWebappData(fixtureRegistry());
  assert.ok(data.components.keycloak, 'components is an object keyed by slug');
  const kc = data.components.keycloak;
  const BASE = ['emoji', 'kind', 'name', 'sensitivity', 'slug', 'summary_de', 'url'];
  for (const k of BASE) assert.ok(k in kc, `component keeps base field '${k}'`);
  assert.equal(kc.sensitivity, 'assisted');
  // The fixture component has no area/theme/relates_to → those keys must be ABSENT.
  assert.ok(!('area' in kc) && !('theme' in kc) && !('relates_to' in kc));
  // what_for_de / placeholder_en / links are NOT needed by S2 → dropped
  assert.ok(!('what_for_de' in kc));
  assert.ok(!('placeholder_en' in kc));
  assert.ok(!('links' in kc));
});
```

- [ ] **Step 2: Write the failing map-block tests**

Append to `scripts/agent-guide/emit-webapp.test.mjs`:

```js
// ── Map block (flow ribbon + territory) ──────────────────────────────────────
function fixtureRegistryMapped() {
  const dir = fixtureRegistryThemed();
  writeFileSync(join(dir, 'flow.yaml'), [
    '- { id: idee, label_de: "Idee", emoji: "💡", danger: safe, order: 1, blurb_de: "PR Idee." }',
    '- { id: plan, label_de: "Plan", emoji: "📋", danger: caution, order: 2, blurb_de: "Plan ENV." }',
    '',
  ].join('\n'));
  // give the themed goal a stage + concept, the plan tool a stage
  writeFileSync(join(dir, 'goals.yaml'), [
    '- id: change-website-text',
    '  title_de: "Ich will den Text auf der Website ändern"',
    '  when_de: "Wenn etwas Falsches dasteht."', '  danger: safe',
    '  theme: website', '  one_liner_de: "Text korrigieren."',
    '  concept_de: "Konzept: ein PR ist ein Änderungsvorschlag."',
    '  stages: [plan]',
    '  flow:', '    - { tool: agent-website, note_de: "Sag ihm, welche Seite." }',
    '  example_prompt_de: "Ändere die Überschrift."',
    '  guardrails: [G-ENV-EXPLICIT]', '  related: []', '',
  ].join('\n'));
  // tag keycloak onto the map; mailpit stays off-map
  writeFileSync(join(dir, 'components.yaml'), [
    '- { slug: keycloak, kind: software, name: "Keycloak", emoji: "🔐", summary_de: "SSO.", what_for_de: "x", placeholder_en: "x", sensitivity: assisted, url: "https://auth", links: [], area: plattform, theme: website, relates_to: [change-website-text] }',
    '- { slug: mailpit,  kind: software, name: "Mailpit",  emoji: "📭", summary_de: "Test.", what_for_de: "x", placeholder_en: "x", sensitivity: safe, url: "https://mail", links: [] }',
    '',
  ].join('\n'));
  return dir;
}

test('buildWebappData: emits a map.flow ordered by station order with resolved goal/tool ids', () => {
  const data = buildWebappData(fixtureRegistryMapped());
  assert.ok(data.map && Array.isArray(data.map.flow));
  assert.deepEqual(data.map.flow.map((s) => s.id), ['idee', 'plan']);
  const plan = data.map.flow.find((s) => s.id === 'plan');
  assert.equal(plan.label_de, 'Plan');
  assert.equal(plan.danger, 'caution');
  assert.deepEqual(plan.goalIds, ['change-website-text']);
  assert.deepEqual(data.map.flow.find((s) => s.id === 'idee').goalIds, []);
});

test('buildWebappData: emits map.territory areas with only opted-in components, carrying accent', () => {
  const data = buildWebappData(fixtureRegistryMapped());
  const plattform = data.map.territory.find((a) => a.id === 'plattform');
  assert.ok(plattform, 'plattform area present');
  assert.deepEqual(plattform.nodes.map((n) => n.slug), ['keycloak']);
  const kc = plattform.nodes[0];
  assert.equal(kc.sensitivity, 'assisted');
  assert.equal(kc.theme, 'website');
  assert.equal(kc.accent, '#4a9eff');                 // resolved from themes.yaml
  assert.deepEqual(kc.relatesTo, ['change-website-text']);
  // mailpit has no area → must not appear anywhere in territory
  const allSlugs = data.map.territory.flatMap((a) => a.nodes.map((n) => n.slug));
  assert.ok(!allSlugs.includes('mailpit'));
});

test('buildWebappData: passes stages + concept_de onto goals', () => {
  const data = buildWebappData(fixtureRegistryMapped());
  const g = data.goals.find((x) => x.id === 'change-website-text');
  assert.deepEqual(g.stages, ['plan']);
  assert.equal(g.concept_de, 'Konzept: ein PR ist ein Änderungsvorschlag.');
});

test('buildWebappData: tolerates a registry with no flow.yaml (empty map.flow)', () => {
  const data = buildWebappData(globalThis.__agFixtureRegistry());
  assert.deepEqual(data.map.flow, []);
  assert.ok(Array.isArray(data.map.territory));
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test scripts/agent-guide/emit-webapp.test.mjs`
Expected: FAIL — the map tests fail (`data.map` is undefined) and the determinism `$schema` regex test still passes.

- [ ] **Step 4: Implement the emitter changes**

In `scripts/agent-guide/emit-webapp.mjs`, add the import (after line 8):

```js
import { TERRITORY_AREAS } from './map-areas.mjs';
```

Inside `buildWebappData`, change the `goals` projection to pass `stages` + `concept_de` (modify the returned object literal, lines ~91-111). Add these two properties before the `escalate_to_de` spread:

```js
    stages: g.stages ?? [],
    concept_de: g.concept_de ?? (g.flow?.[0] ? (toolById(g.flow[0].tool)?.summary_de ?? '') : ''),
```

Add `stages` to the `tools` projection (object literal lines ~70-89), before the `init_prompt_de` spread:

```js
    stages: t.stages ?? [],
```

Change the `components` projection to include the optional map fields. Replace the `components` loop (lines ~113-124) with:

```js
  const themeAccent = (id) => themes.find((t) => t.id === id)?.accent ?? '#888888';
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
      ...(c.area ? { area: c.area } : {}),
      ...(c.theme ? { theme: c.theme } : {}),
      ...(c.relates_to ? { relates_to: c.relates_to } : {}),
    };
  }
```

Build the `map` object. Add this just before the final `return {…}` (after the `components` loop):

```js
  const flowRaw = loadOptionalList(registryDir, 'flow');
  const flowStations = flowRaw
    .map((s) => ({
      id: s.id, label_de: s.label_de, emoji: s.emoji, danger: s.danger,
      order: s.order ?? 999, blurb_de: s.blurb_de ?? '',
      goalIds: reg.goals.filter((g) => (g.stages ?? []).includes(s.id)).map((g) => g.id),
      toolIds: reg.tools.filter((t) => (t.stages ?? []).includes(s.id)).map((t) => t.id),
    }))
    .sort((a, b) => a.order - b.order);

  const territory = TERRITORY_AREAS
    .map((a) => ({
      id: a.id, label_de: a.label_de, order: a.order,
      nodes: reg.components
        .filter((c) => c.area === a.id)
        .map((c) => ({
          slug: c.slug, name: c.name, emoji: c.emoji, sensitivity: c.sensitivity,
          theme: c.theme ?? null, accent: c.theme ? themeAccent(c.theme) : '#888888',
          relatesTo: c.relates_to ?? [],
        })),
    }));

  const map = { flow: flowStations, territory };
```

Add `map` to the returned object (the `return {…}` literal, after `components,`):

```js
    components,
    map,
  };
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test scripts/agent-guide/emit-webapp.test.mjs`
Expected: PASS (all tests, including the 4 new map tests and the updated component-keys test).

- [ ] **Step 6: Commit**

```bash
git add scripts/agent-guide/emit-webapp.mjs scripts/agent-guide/emit-webapp.test.mjs
git commit -m "feat(agent-guide): emit map block + stages/concept_de passthrough"
```

---

## Task 3: Author registry content (stages, concept_de, territory tags, new goals)

**Files:**
- Modify: `docs/agent-guide/registry/goals.yaml`
- Modify: `docs/agent-guide/registry/tools.yaml`
- Modify: `docs/agent-guide/registry/components.yaml`
- Regenerate + commit: `website/src/lib/agent-guide.generated.json`, `docs/agent-guide/{10-ziele,20-werkzeuge,30-bausteine}.md`, `docs/agent-guide/maps/*.md`

- [ ] **Step 1: Add `stages` to existing tools**

In `docs/agent-guide/registry/tools.yaml`, add a `stages:` line to each tool below (insert after its `theme:` line):

- `superpowers`: `stages: [brainstorm]`
- `brainstorming`: `stages: [idee, brainstorm]`
- `dev-flow-plan`: `stages: [plan]`
- `dev-flow-execute`: `stages: [code, pr-ci]`
- `dev-flow-iterate`: `stages: [code, deploy]`
- `dev-flow-e2e`: `stages: [live]`
- `agent-infra`: `stages: [deploy]`
- `agent-ops`: `stages: [live]`

(Leave `task-oracle`, `agent-website`, `agent-test`, `agent-db`, `agent-security` without `stages`.)

- [ ] **Step 2: Add `stages` + `concept_de` to existing goals**

In `docs/agent-guide/registry/goals.yaml`, add to each goal:

- `website-text-aendern`: `stages: [code]` and `concept_de: "Konzept: Inhalte ändert man über einen Branch + PR, nicht direkt auf main."`
- `dienst-status-pruefen`: `stages: [live]` and `concept_de: "Konzept: Status/Logs lesen ist 🟢 — es verändert nichts."`
- `bug-beheben`: `stages: [plan, code, pr-ci, deploy]` and `concept_de: "Konzept: erst ein Test, der den Fehler zeigt (TDD), dann der Fix."`
- `feature-bauen`: `stages: [plan, code, pr-ci, deploy]` and `concept_de: "Konzept: jede neue Funktion durchläuft Plan → Code → PR → Deploy."`
- `aenderung-ausrollen`: `stages: [deploy, live]` and `concept_de: "Konzept: Deploy heißt einen gemergten Stand in einer Umgebung (ENV) aktivieren."`
- `datenbank-aendern`: `stages: [plan, code, deploy]` and `concept_de: "Konzept: Schema-Änderungen treffen beide Marken — immer als Migration."`
- `secret-aendern`, `cluster-neu-aufsetzen`: leave without `stages` (forbidden, off the normal flow).

- [ ] **Step 3: Add three onboarding goals (fills idee / pr-ci / live)**

Append to `docs/agent-guide/registry/goals.yaml`:

```yaml
- id: idee-starten
  title_de: "Ich habe eine Idee — wie fange ich an?"
  when_de: "Du willst etwas verändern, weißt aber noch nicht, wie der Weg aussieht."
  flow:
    - tool: brainstorming
      note_de: "Beschreibe die Idee; der Brainstorming-Skill schärft sie zu einem Design."
    - tool: dev-flow-plan
      note_de: "Danach schreibt der Planungs-Skill einen Schritt-für-Schritt-Plan."
  example_prompt_de: "Ich habe eine Idee für die Plattform und möchte sie erst gemeinsam durchdenken."
  danger: safe
  theme: entwickeln
  one_liner_de: "Von der Idee zum Plan — der erste Schritt."
  common: true
  order: 6
  stages: [idee, brainstorm]
  concept_de: "Konzept: jede Änderung beginnt mit Brainstorm → Plan, bevor Code entsteht."
  aliases_de: [idee, anfangen, start, neu, wie]
  guardrails: [G-PULL-FIRST]
  related: [feature-bauen, bug-beheben]
- id: pr-oeffnen
  title_de: "Ich will einen Pull Request öffnen und CI grün bekommen"
  when_de: "Der Code ist fertig und soll als Pull Request geprüft und gemergt werden."
  flow:
    - tool: dev-flow-execute
      note_de: "Pusht den Branch, öffnet den PR und wartet, bis die CI-Checks grün sind."
  example_prompt_de: "Bitte öffne einen Pull Request für diesen Branch und sag mir, ob die CI grün ist."
  danger: assisted
  theme: entwickeln
  one_liner_de: "Branch als PR einreichen und CI abwarten."
  stages: [pr-ci]
  concept_de: "Konzept: nichts kommt nach main ohne PR + grüne CI (Squash-Merge)."
  aliases_de: [pr, "pull request", ci, merge, review]
  guardrails: [G-PR-NOT-MAIN]
  related: [feature-bauen, aenderung-ausrollen]
- id: deploy-pruefen
  title_de: "Ich will prüfen, ob mein Deploy wirklich live ist"
  when_de: "Nach einem Deploy willst du sehen, ob die Änderung in der echten Umgebung angekommen ist."
  flow:
    - tool: agent-ops
      note_de: "Lässt Pod-Status und Logs prüfen, ob der neue Stand läuft."
    - tool: dev-flow-e2e
      note_de: "Verifiziert per E2E-Test gegen die Live-URL, dass das Feature funktioniert."
  example_prompt_de: "Ist der letzte Deploy für mentolder live? Prüfe Status, Logs und mach einen E2E-Check."
  danger: safe
  theme: betrieb
  one_liner_de: "Nach dem Deploy prüfen, ob alles läuft."
  common: true
  order: 7
  stages: [live]
  concept_de: "Konzept: Deploy ≠ live — erst Status, Logs und ein E2E-Check bestätigen es."
  aliases_de: [deploy, live, pruefen, status, "ist es da"]
  guardrails: [G-ENV-EXPLICIT]
  related: [aenderung-ausrollen, dienst-status-pruefen]
```

(These use themes `entwickeln`/`betrieb` — **never `website`** — so `agentGuideSearch.test.ts:71` stays valid.)

- [ ] **Step 4: Tag territory components**

In `docs/agent-guide/registry/components.yaml`, add `area`, `theme`, and (where natural) `relates_to` to the curated set below. Add the three lines under each listed component's existing fields. **Only these slugs get tagged; all others stay off the map.**

```yaml
# website:         area: dienste    theme: website     relates_to: [website-text-aendern]
# nextcloud:       area: dienste    theme: betrieb
# collabora:       area: dienste    theme: betrieb
# vaultwarden:     area: dienste    theme: sicherheit
# docuseal:        area: dienste    theme: betrieb
# livekit:         area: dienste    theme: betrieb
# keycloak:        area: plattform  theme: sicherheit  relates_to: [secret-aendern]
# traefik:         area: plattform  theme: ausrollen
# k3s:             area: plattform  theme: ausrollen    relates_to: [cluster-neu-aufsetzen]
# cert-manager:    area: plattform  theme: sicherheit
# postgresql:      area: daten      theme: datenbank    relates_to: [datenbank-aendern]
# sealed-secrets:  area: daten      theme: sicherheit   relates_to: [secret-aendern]
```

For example, the `website` entry becomes:

```yaml
- slug: website
  kind: software
  name: "Website"
  emoji: "🌐"
  sensitivity: caution
  placeholder_en: "Astro + Svelte frontend"
  summary_de: "Die öffentliche Webseite und das Kundenportal. Hier ändert man Texte, Preise und sieht eigene Daten."
  what_for_de: "Das mit Astro + Svelte gebaute Frontend (die Web-Oberfläche). Öffentliche Seite plus eingeloggtes Kundenportal."
  url: null
  links: []
  area: dienste
  theme: website
  relates_to: [website-text-aendern]
```

Apply the analogous three (or two) lines to `nextcloud`, `collabora`, `vaultwarden`, `docuseal`, `livekit`, `keycloak`, `traefik`, `k3s`, `cert-manager`, `postgresql`, `sealed-secrets` per the table above.

- [ ] **Step 5: Validate, regenerate all surfaces, and review the diff**

Run:
```bash
cd /tmp/wt-agent-guide-mental-model
node scripts/agent-guide/validate.mjs        # expect: ✓ agent-guide registry valid (no ✗; ⚠ only if a station is empty)
task agent-guide:emit                         # regenerates webapp JSON + docs/*.md + maps/*.md
git --no-pager diff --stat
```
Expected: `validate.mjs` prints `✓` (and no warnings, since every station now has a card). `agent-guide.generated.json` now contains a `map` key; `goals[]` carry `stages`/`concept_de`.

- [ ] **Step 6: Commit**

```bash
git add docs/agent-guide/registry/goals.yaml docs/agent-guide/registry/tools.yaml \
  docs/agent-guide/registry/components.yaml \
  website/src/lib/agent-guide.generated.json \
  docs/agent-guide/10-ziele.md docs/agent-guide/20-werkzeuge.md docs/agent-guide/30-bausteine.md \
  docs/agent-guide/maps/goals-map.md docs/agent-guide/maps/tools-map.md docs/agent-guide/maps/danger-map.md
git commit -m "content(agent-guide): stages/concept_de, territory tags, 3 onboarding goals"
```

---

## Task 4: TypeScript types (`agentGuide.ts` + E2E lib)

**Files:**
- Modify: `website/src/lib/agentGuide.ts`
- Modify: `tests/e2e/lib/agent-guide.ts`

- [ ] **Step 1: Extend types and exports in agentGuide.ts**

In `website/src/lib/agentGuide.ts`, add `stages` + `concept_de?` to `Goal` (after `order: number;`) and `stages` to `Tool` (after `order: number;`):

```ts
  stages: string[];
  concept_de?: string;   // Goal only
```
```ts
  stages: string[];      // Tool
```

Add the map interfaces (after the `Component` interface, before the `export const` block):

```ts
export interface FlowStation {
  id: string;
  label_de: string;
  emoji: string;
  danger: string;
  order: number;
  blurb_de: string;
  goalIds: string[];
  toolIds: string[];
}

export interface TerritoryNode {
  slug: string;
  name: string;
  emoji: string;
  sensitivity: string;
  theme: string | null;
  accent: string;
  relatesTo: string[];
}

export interface TerritoryArea {
  id: string;
  label_de: string;
  order: number;
  nodes: TerritoryNode[];
}

export interface MapData {
  flow: FlowStation[];
  territory: TerritoryArea[];
}
```

Add the export (after `export const components …`):

```ts
export const guideMap: MapData = (data.map ?? { flow: [], territory: [] }) as MapData;
```

- [ ] **Step 2: Mirror types + expose map in the E2E lib**

In `tests/e2e/lib/agent-guide.ts`: add `stages: string[];` + `concept_de?: string;` to `Goal`, `stages: string[];` to `Tool`, and the `FlowStation`/`TerritoryNode`/`TerritoryArea`/`MapData` interfaces (copy from Step 1). Add `map: MapData;` to `GuideData`, and in `loadGuideData` add:

```ts
    map: (raw.map ?? { flow: [], territory: [] }) as MapData,
```

- [ ] **Step 3: Typecheck**

Run: `cd /tmp/wt-agent-guide-mental-model/website && pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no errors from `agentGuide.ts` (pre-existing unrelated errors, if any, are out of scope — confirm none reference our files).

- [ ] **Step 4: Commit**

```bash
cd /tmp/wt-agent-guide-mental-model
git add website/src/lib/agentGuide.ts tests/e2e/lib/agent-guide.ts
git commit -m "feat(agent-guide): types for stages/concept_de + map data"
```

---

## Task 5: Pure search helpers — `mapFilterIds` + `splitGlossaryTerms`

**Files:**
- Modify: `website/src/lib/agentGuideSearch.ts`
- Test: `website/src/lib/agentGuideSearch.test.ts`

- [ ] **Step 1: Write the failing vitest cases**

Append to `website/src/lib/agentGuideSearch.test.ts`. First extend the imports at the top:

```ts
import { goals, tools, taxonomy, themes, guideMap, glossary } from './agentGuide';
import {
  MIN_QUERY, normalize, buildEntries, matches, filterEntries,
  groupBy, sortCommonFirst, highlight, mapFilterIds, splitGlossaryTerms,
} from './agentGuideSearch';
```

Then append:

```ts
describe('buildEntries: stages', () => {
  it('carries the stages array onto each entry', () => {
    const e = ALL.find(x => x.id === 'bug-beheben')!;
    expect(Array.isArray(e.stages)).toBe(true);
    expect(e.stages).toContain('plan');
  });
});

describe('mapFilterIds', () => {
  it('returns null for a null filter (no restriction)', () => {
    expect(mapFilterIds(null, guideMap)).toBeNull();
  });
  it('flow filter → the station goalIds+toolIds set', () => {
    const ids = mapFilterIds({ kind: 'flow', id: 'plan' }, guideMap)!;
    const plan = guideMap.flow.find(s => s.id === 'plan')!;
    expect(ids.has(plan.goalIds[0] ?? plan.toolIds[0])).toBe(true);
    expect(ids.has('dienst-status-pruefen')).toBe(false); // live station, not plan
  });
  it('node filter → the territory node relatesTo set', () => {
    const node = guideMap.territory.flatMap(a => a.nodes).find(n => n.relatesTo.length > 0)!;
    const ids = mapFilterIds({ kind: 'node', id: node.slug }, guideMap)!;
    expect(ids.has(node.relatesTo[0])).toBe(true);
  });
  it('unknown id → empty set (filters everything out, never throws)', () => {
    expect(mapFilterIds({ kind: 'flow', id: 'nope' }, guideMap)!.size).toBe(0);
  });
});

describe('splitGlossaryTerms', () => {
  const terms = glossary.map(g => g.term); // includes 'PR', 'CI', 'Deploy', …
  it('splits a known whole-word term into a marked segment', () => {
    const segs = splitGlossaryTerms('Öffne einen PR und warte auf CI.', terms);
    expect(segs.some(s => s.term === 'PR')).toBe(true);
    expect(segs.some(s => s.term === 'CI')).toBe(true);
    expect(segs.map(s => s.text).join('')).toBe('Öffne einen PR und warte auf CI.');
  });
  it('does not match inside a larger word', () => {
    const segs = splitGlossaryTerms('Preisliste', ['PR']);
    expect(segs.every(s => !s.term)).toBe(true);
    expect(segs.map(s => s.text).join('')).toBe('Preisliste');
  });
  it('returns one plain segment when there are no terms', () => {
    expect(splitGlossaryTerms('nichts hier', [])).toEqual([{ text: 'nichts hier' }]);
  });
});
```

- [ ] **Step 2: Run vitest to verify failure**

Run: `cd /tmp/wt-agent-guide-mental-model/website && pnpm test:unit -- agentGuideSearch`
Expected: FAIL — `mapFilterIds`/`splitGlossaryTerms` are not exported; `e.stages` undefined.

- [ ] **Step 3: Implement in agentGuideSearch.ts**

Add `stages` to the `GuideEntry` interface (after `aliases_de: string[];`):

```ts
  stages: string[];
```

In `buildEntries`, add `stages` to both the goal and tool entry objects:

```ts
    // goal entry — add:
    stages: g.stages ?? [],
```
```ts
    // tool entry — add:
    stages: t.stages ?? [],
```

Add the import of map types at the top (extend the existing type import):

```ts
import type { Goal, Tool, Theme, TierEntry, MapData } from './agentGuide';
```

Append the two pure helpers at the end of the file:

```ts
export type MapFilter = { kind: 'flow' | 'node'; id: string } | null;

/** Resolve a map selection to the set of entry ids it permits, or null = no restriction. */
export function mapFilterIds(filter: MapFilter, map: MapData): Set<string> | null {
  if (!filter) return null;
  if (filter.kind === 'flow') {
    const s = map.flow.find(f => f.id === filter.id);
    return new Set([...(s?.goalIds ?? []), ...(s?.toolIds ?? [])]);
  }
  const node = map.territory.flatMap(a => a.nodes).find(n => n.slug === filter.id);
  return new Set(node?.relatesTo ?? []);
}

export interface GlossSegment { text: string; term?: string; }

/** Split `text` into segments, marking the first whole-word occurrence of each glossary
 *  term (longest term first). Whole-word = bounded by non-word chars; case-insensitive. */
export function splitGlossaryTerms(text: string, terms: string[]): GlossSegment[] {
  const wanted = [...terms].filter(Boolean).sort((a, b) => b.length - a.length);
  const used = new Set<string>();
  let segs: GlossSegment[] = [{ text }];
  for (const term of wanted) {
    const next: GlossSegment[] = [];
    for (const seg of segs) {
      if (seg.term || used.has(term)) { next.push(seg); continue; }
      const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?=[^\\p{L}\\p{N}]|$)`, 'iu');
      const m = re.exec(seg.text);
      if (!m) { next.push(seg); continue; }
      const start = m.index + m[1].length;
      const end = start + m[2].length;
      if (seg.text.slice(0, start)) next.push({ text: seg.text.slice(0, start) });
      next.push({ text: seg.text.slice(start, end), term });
      if (seg.text.slice(end)) next.push({ text: seg.text.slice(end) });
      used.add(term);
    }
    segs = next;
  }
  return segs.length ? segs : [{ text }];
}
```

- [ ] **Step 4: Run vitest to verify pass**

Run: `cd /tmp/wt-agent-guide-mental-model/website && pnpm test:unit -- agentGuideSearch`
Expected: PASS (all describe blocks, including the 3 new ones).

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-agent-guide-mental-model
git add website/src/lib/agentGuideSearch.ts website/src/lib/agentGuideSearch.test.ts
git commit -m "feat(agent-guide): stages on entries + pure mapFilterIds/splitGlossaryTerms"
```

---

## Task 6: `GuideMap.svelte` — flow ribbon + territory lanes

**Files:**
- Create: `website/src/components/assistant/agent-guide/GuideMap.svelte`

- [ ] **Step 1: Create the component**

Create `website/src/components/assistant/agent-guide/GuideMap.svelte`:

```svelte
<script lang="ts">
  import type { MapData } from '../../../lib/agentGuide';
  import { tierColor, tierEmoji, tierLabel } from '../../../lib/agentGuide';
  import { splitGlossaryTerms } from '../../../lib/agentGuideSearch';
  import GlossaryTerm from './GlossaryTerm.svelte';

  let {
    map,
    active = null,
    glossaryTerms = [],
    onSelect,
  }: {
    map: MapData;
    active?: { kind: 'flow' | 'node'; id: string } | null;
    glossaryTerms?: string[];
    onSelect: (sel: { kind: 'flow' | 'node'; id: string; label: string } | null) => void;
  } = $props();

  const isActive = (kind: 'flow' | 'node', id: string) =>
    active?.kind === kind && active?.id === id;

  function pick(kind: 'flow' | 'node', id: string, label: string) {
    if (isActive(kind, id)) onSelect(null);          // toggle off
    else onSelect({ kind, id, label });
  }
</script>

<div class="ag-map" aria-label="So funktioniert die Plattform">
  <!-- Flow ribbon -->
  <p class="ag-section-label">Dein Weg: Idee → live</p>
  <ol class="ag-flowband">
    {#each map.flow as s, i (s.id)}
      <li>
        <button
          type="button"
          class="ag-flow-station"
          class:on={isActive('flow', s.id)}
          style="--tier: {tierColor(s.danger)}"
          aria-pressed={isActive('flow', s.id)}
          title={s.blurb_de}
          onclick={() => pick('flow', s.id, s.label_de)}
        >
          <span aria-hidden="true">{s.emoji}</span>
          <span class="ag-flow-name">{s.label_de}</span>
          <span class="ag-sr">– {tierLabel(s.danger)}, {s.goalIds.length + s.toolIds.length} Einträge</span>
        </button>
      </li>
      {#if i < map.flow.length - 1}<li class="ag-flow-arrow" aria-hidden="true">→</li>{/if}
    {/each}
  </ol>

  <!-- Territory map -->
  <p class="ag-section-label">Die Plattform: was läuft wo</p>
  <div class="ag-territory">
    {#each map.territory.filter(a => a.nodes.length) as area (area.id)}
      <div class="ag-terr-area">
        <span class="ag-terr-label">{area.label_de}</span>
        <div class="ag-terr-nodes">
          {#each area.nodes as n (n.slug)}
            <button
              type="button"
              class="ag-terr-node"
              class:on={isActive('node', n.slug)}
              style="--accent: {n.accent}; --tier: {tierColor(n.sensitivity)}"
              aria-pressed={isActive('node', n.slug)}
              onclick={() => pick('node', n.slug, n.name)}
            >
              <span aria-hidden="true">{n.emoji}</span> {n.name}
              <span aria-hidden="true" class="ag-terr-dot">{tierEmoji(n.sensitivity)}</span>
              <span class="ag-sr">Gefahrenstufe {tierLabel(n.sensitivity)}</span>
            </button>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>
```

> The component renders the active station's blurb via the parent's filter chip (Task 8); the `splitGlossaryTerms`/`GlossaryTerm` import is used in Task 7's pairing — keep the imports, they are referenced once the concept line lands. If `pnpm check` flags an unused import before Task 7, leave it; Task 7 wires it. (Alternatively move the import line into Task 7's edit.)

- [ ] **Step 2: Commit (compiles; rendered/tested in Task 8 + Task 10)**

```bash
git add website/src/components/assistant/agent-guide/GuideMap.svelte
git commit -m "feat(agent-guide): GuideMap component (flow ribbon + territory)"
```

---

## Task 7: `GlossaryTerm.svelte` + concept line in GuideCard

**Files:**
- Create: `website/src/components/assistant/agent-guide/GlossaryTerm.svelte`
- Modify: `website/src/components/assistant/agent-guide/GuideCard.svelte`

- [ ] **Step 1: Create GlossaryTerm.svelte**

Create `website/src/components/assistant/agent-guide/GlossaryTerm.svelte`:

```svelte
<script lang="ts">
  let { term, def }: { term: string; def: string } = $props();
  let open = $state(false);
</script>

<span class="ag-gloss-wrap">
  <button
    type="button"
    class="ag-gloss"
    aria-expanded={open}
    onclick={() => (open = !open)}
    onmouseenter={() => (open = true)}
    onmouseleave={() => (open = false)}
  >{term}</button>
  {#if open}
    <span class="ag-gloss-pop" role="note">{def}</span>
  {/if}
</span>
```

- [ ] **Step 2: Render the concept line in GuideCard (goal branch)**

In `website/src/components/assistant/agent-guide/GuideCard.svelte`, extend the imports:

```ts
  import { glossary } from '../../../lib/agentGuide';
  import { highlight, splitGlossaryTerms, type GuideEntry } from '../../../lib/agentGuideSearch';
  import GlossaryTerm from './GlossaryTerm.svelte';
```

Add a derived term list + def lookup in the `<script>`:

```ts
  const glossTerms = glossary.map(g => g.term);
  const glossDef = (t: string) => glossary.find(g => g.term === t)?.def_de ?? '';
  const conceptSegs = $derived(
    entry.kind === 'goal' && goal?.concept_de
      ? splitGlossaryTerms(goal.concept_de, glossTerms)
      : [],
  );
```

In the goal branch, immediately after the `{#if !isForbidden}<p class="ag-when">…</p>{/if}` line (line ~70), insert the concept line:

```svelte
        {#if conceptSegs.length}
          <p class="ag-concept">
            {#each conceptSegs as seg}{#if seg.term}<GlossaryTerm term={seg.term} def={glossDef(seg.term)} />{:else}{seg.text}{/if}{/each}
          </p>
        {/if}
```

- [ ] **Step 3: Build the website to confirm it compiles**

Run: `cd /tmp/wt-agent-guide-mental-model/website && pnpm build`
Expected: build succeeds (Astro/Svelte compile clean). If `pnpm build` is slow/unavailable, run `pnpm exec svelte-check --threshold error` and confirm no errors in the three touched components.

- [ ] **Step 4: Commit**

```bash
cd /tmp/wt-agent-guide-mental-model
git add website/src/components/assistant/agent-guide/GlossaryTerm.svelte \
  website/src/components/assistant/agent-guide/GuideCard.svelte
git commit -m "feat(agent-guide): glossary tooltips + concept line on goal cards"
```

---

## Task 8: Wire the map into AgentGuideView

**Files:**
- Modify: `website/src/components/assistant/AgentGuideView.svelte`

- [ ] **Step 1: Import + state**

In `website/src/components/assistant/AgentGuideView.svelte`, extend imports:

```ts
  import { goals, tools, taxonomy, themes, glossary, guideMap, tierColor, tierEmoji } from '../../lib/agentGuide';
  import {
    buildEntries, filterEntries, groupBy, sortCommonFirst, normalize, mapFilterIds, MIN_QUERY,
    type Axis, type GuideEntry, type MapFilter,
  } from '../../lib/agentGuideSearch';
  import GuideMap from './agent-guide/GuideMap.svelte';
```

Add state (after `let glossaryOpen = $state(false);`):

```ts
  let mapFilter = $state<MapFilter>(null);
  let mapOpen = $state(true);
  const MAP_KEY = 'ag-map-v1';
  const glossTerms = glossary.map(g => g.term);
```

- [ ] **Step 2: First-run + persistence for the map**

In the `onMount` block, after the axis rehydrate, add:

```ts
      const rawMap = localStorage.getItem(MAP_KEY);
      if (rawMap === 'open' || rawMap === 'closed') mapOpen = rawMap === 'open';
      else mapOpen = true; // first run: map open to onboard newcomers
```

Add a persist effect (next to the axis effect):

```ts
  $effect(() => { if (hydrated) { try { localStorage.setItem(MAP_KEY, mapOpen ? 'open' : 'closed'); } catch { /* ignore */ } } });
```

- [ ] **Step 3: Compose the map filter into the pipeline**

Change the `preFiltered` derivation to also honor `mapFilter`:

```ts
  const allowedByMap = $derived(mapFilterIds(mapFilter, guideMap)); // Set<string> | null
  const preFiltered = $derived(
    ALL.filter(e =>
      (allowedByMap === null || allowedByMap.has(e.id)) &&
      (domainFilter === null || e.theme === domainFilter) &&
      (tierFilter.size === 0 || tierFilter.has(e.danger)),
    ),
  );
```

- [ ] **Step 4: Render the map + active-filter chip**

In the markup, replace the `<div class="ag-intro">…</div>` block's closing and the `<GuideFindBar … />` with a map section inserted between them. Immediately after the `</div>` that closes `.ag-intro` (line ~164), insert:

```svelte
  {#if guideMap.flow.length}
    <section class="ag-map-section">
      <button type="button" class="ag-map-toggle" aria-expanded={mapOpen} onclick={() => (mapOpen = !mapOpen)}>
        <span class="ag-map-toggle-icon" aria-hidden="true">🧭</span>
        <span class="ag-map-toggle-label">So funktioniert die Plattform</span>
        <span class="ag-chevron" aria-hidden="true">{mapOpen ? '▾' : '▸'}</span>
      </button>
      {#if mapOpen}
        <p class="ag-map-hint">Neu hier? Folge dem Band von links — klick eine Station oder einen Baustein, um die passenden Karten zu sehen.</p>
        <GuideMap map={guideMap} active={mapFilter} glossaryTerms={glossTerms} onSelect={(sel) => (mapFilter = sel)} />
      {/if}
      {#if mapFilter}
        <button type="button" class="ag-mapfilter-chip" onclick={() => (mapFilter = null)}>
          Gefiltert: {mapFilter.kind === 'flow' ? 'Station' : 'Baustein'} ✕
        </button>
      {/if}
    </section>
  {/if}
```

- [ ] **Step 5: Auto-scroll catalog into view when a map filter is applied**

Add a handler and call it on select. Replace the `onSelect={(sel) => (mapFilter = sel)}` above with `onSelect={selectMap}` and add the function near `jumpTo`:

```ts
  function selectMap(sel: MapFilter) {
    mapFilter = sel;
    if (!sel) return;
    requestAnimationFrame(() => {
      document.querySelector('.ag-findbar')?.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start',
      });
    });
  }
```

- [ ] **Step 6: Build to confirm it compiles**

Run: `cd /tmp/wt-agent-guide-mental-model/website && pnpm build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
cd /tmp/wt-agent-guide-mental-model
git add website/src/components/assistant/AgentGuideView.svelte
git commit -m "feat(agent-guide): mount map, mapFilter pipeline, first-run + persistence"
```

---

## Task 9: Styles (`.ag-map*`, `.ag-concept`, `.ag-gloss*`, `.ag-mapfilter*`)

**Files:**
- Modify: `website/src/styles/sidekick-panels.css`

- [ ] **Step 1: Append the styles**

Append to the `.ag-*` region of `website/src/styles/sidekick-panels.css` (after the existing `.drawer .ag-group-cards` rule, ~line 1805):

```css
/* ── Mental-model map ──────────────────────────────────────────────────────── */
.drawer .ag-map-section { margin: 12px 22px 0; }
.drawer .ag-map-toggle {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 8px 10px; border: 0; border-left: 4px solid var(--brass, #e8c870);
  background: color-mix(in srgb, var(--brass, #e8c870) 12%, transparent);
  border-radius: 8px; color: var(--fg); cursor: pointer; text-align: left;
}
.drawer .ag-map-toggle:focus-visible { outline: 2px solid var(--brass); outline-offset: -2px; }
.drawer .ag-map-toggle-label { flex: 1 1 auto; font-family: var(--serif); font-size: 15px; }
.drawer .ag-map-hint { margin: 8px 2px; font-size: 12px; color: var(--mute); }
.drawer .ag-map { display: flex; flex-direction: column; gap: 6px; }
.drawer .ag-flowband { list-style: none; display: flex; flex-wrap: wrap; align-items: center;
  gap: 4px; padding: 0; margin: 2px 0 10px; }
.drawer .ag-flow-arrow { color: var(--mute); font-size: 12px; }
.drawer .ag-flow-station {
  display: inline-flex; align-items: center; gap: 5px; padding: 5px 9px;
  font-size: 12px; color: var(--fg); cursor: pointer;
  background: transparent; border: 1px solid color-mix(in srgb, var(--tier) 45%, transparent);
  border-left: 3px solid var(--tier); border-radius: 7px;
}
.drawer .ag-flow-station.on { background: color-mix(in srgb, var(--tier) 18%, transparent); }
.drawer .ag-flow-station:focus-visible { outline: 2px solid var(--brass); outline-offset: 1px; }
.drawer .ag-flow-name { font-weight: 600; }
.drawer .ag-territory { display: flex; flex-direction: column; gap: 8px; }
.drawer .ag-terr-area { border: 1px dashed color-mix(in srgb, var(--line) 70%, transparent);
  border-radius: 8px; padding: 7px 9px; }
.drawer .ag-terr-label { display: block; font-family: var(--mono); font-size: 10px;
  text-transform: uppercase; letter-spacing: 0.4px; color: var(--mute); margin-bottom: 6px; }
.drawer .ag-terr-nodes { display: flex; flex-wrap: wrap; gap: 6px; }
.drawer .ag-terr-node {
  display: inline-flex; align-items: center; gap: 5px; padding: 4px 8px;
  font-size: 11.5px; color: var(--fg); cursor: pointer; background: transparent;
  border: 1px solid color-mix(in srgb, var(--accent, var(--line)) 40%, transparent);
  border-left: 3px solid var(--accent, var(--line)); border-radius: 7px;
}
.drawer .ag-terr-node.on { background: color-mix(in srgb, var(--accent) 16%, transparent); }
.drawer .ag-terr-node:focus-visible { outline: 2px solid var(--brass); outline-offset: 1px; }
.drawer .ag-terr-dot { font-size: 10px; }
.drawer .ag-mapfilter-chip {
  margin-top: 8px; padding: 4px 10px; font-size: 11px; cursor: pointer;
  color: var(--ink-900, #0f1623); background: var(--brass, #e8c870);
  border: 0; border-radius: 999px; font-weight: 600;
}

/* ── Concept line + glossary tooltip ───────────────────────────────────────── */
.drawer .ag-concept { margin: 2px 0 8px; font-size: 12.5px; color: var(--mute); font-style: italic; }
.drawer .ag-gloss-wrap { position: relative; display: inline-block; }
.drawer .ag-gloss {
  border: 0; background: transparent; padding: 0; cursor: help; color: inherit;
  font: inherit; border-bottom: 1px dotted var(--brass, #e8c870);
}
.drawer .ag-gloss:focus-visible { outline: 2px solid var(--brass); outline-offset: 2px; }
.drawer .ag-gloss-pop {
  position: absolute; left: 0; top: 130%; z-index: 5; width: max-content; max-width: 240px;
  padding: 6px 9px; font-size: 11.5px; font-style: normal; color: var(--fg);
  background: var(--ink-900, #0f1623); border: 1px solid var(--line);
  border-radius: 6px; box-shadow: 0 4px 14px rgba(0,0,0,.4);
}
@media (prefers-reduced-motion: reduce) { .drawer .ag-flow-station, .drawer .ag-terr-node { transition: none; } }
```

- [ ] **Step 2: Build + eyeball**

Run: `cd /tmp/wt-agent-guide-mental-model/website && pnpm build`
Expected: build succeeds. (Visual check happens in the E2E film step / `task dev-flow-iterate`.)

- [ ] **Step 3: Commit**

```bash
cd /tmp/wt-agent-guide-mental-model
git add website/src/styles/sidekick-panels.css
git commit -m "style(agent-guide): map, concept line, glossary tooltip styles"
```

---

## Task 10: E2E coverage

**Files:**
- Modify: `tests/e2e/specs/agent-guide-walkthrough.spec.ts`
- Modify: `tests/e2e/lib/agent-guide.ts` (helper)

- [ ] **Step 1: Add a helper to open the map (it is open by default, but ensure)**

In `tests/e2e/lib/agent-guide.ts`, add:

```ts
/** Ensures the mental-model map is expanded; returns the .ag-map locator. */
export async function ensureMapOpen(page: Page) {
  const toggle = page.locator('.ag-map-toggle');
  if (await toggle.count()) {
    const open = await toggle.getAttribute('aria-expanded');
    if (open !== 'true') await toggle.click();
  }
  const map = page.locator('.ag-map');
  await expect(map).toBeVisible({ timeout: 5_000 });
  return map;
}
```

- [ ] **Step 2: Write the failing E2E assertions**

Add to `tests/e2e/specs/agent-guide-walkthrough.spec.ts` (import `ensureMapOpen` and `map` from the lib):

```ts
import { openAgentGuide, expandCardByTitle, loadGuideData, ensureMapOpen, showFilmBanner, removeFilmBanner } from '../lib/agent-guide';
const { goals, tools, taxonomy, themes, glossary, map } = loadGuideData();

test('Mental-Model-Karte zeigt Fluss-Band und Gebietskarte', async ({ page }) => {
  await openAgentGuide(page);
  await ensureMapOpen(page);
  await expect(page.locator('.ag-flow-station')).toHaveCount(map.flow.length);
  await expect(page.locator('.ag-terr-node').first()).toBeVisible();
});

test('Klick auf eine Fluss-Station filtert den Katalog', async ({ page }) => {
  await openAgentGuide(page);
  await ensureMapOpen(page);
  const plan = map.flow.find(s => s.id === 'plan')!;
  await page.locator('.ag-flow-station', { hasText: plan.label_de }).click();
  await expect(page.locator('.ag-mapfilter-chip')).toBeVisible();
  // a known plan goal card is present, an unrelated live goal is not
  await expect(page.locator('.ag-name', { hasText: 'Fehler beheben' })).toBeVisible();
  await expect(page.locator('.ag-name', { hasText: 'Dienste laufen' })).toHaveCount(0);
});

test('Klick auf einen Baustein filtert auf seine verknüpften Karten', async ({ page }) => {
  await openAgentGuide(page);
  await ensureMapOpen(page);
  const node = map.territory.flatMap(a => a.nodes).find(n => n.relatesTo.length > 0)!;
  await page.locator('.ag-terr-node', { hasText: node.name }).first().click();
  await expect(page.locator('.ag-mapfilter-chip')).toBeVisible();
  await expect(page.locator('.ag-card-head')).toHaveCount(node.relatesTo.length);
});

test('Konzept-Zeile + Glossar-Tooltip auf einer Ziel-Karte', async ({ page }) => {
  await openAgentGuide(page);
  const conceptGoal = goals.find(g => g.concept_de)!;
  const card = await expandCardByTitle(page, conceptGoal.title_de);
  await expect(card.locator('.ag-concept')).toBeVisible();
  const gloss = card.locator('.ag-gloss').first();
  if (await gloss.count()) {
    await gloss.click();
    await expect(card.locator('.ag-gloss-pop').first()).toBeVisible();
  }
});

test('Karte einklappen bleibt nach Reload erhalten', async ({ page }) => {
  await openAgentGuide(page);
  await ensureMapOpen(page);
  await page.locator('.ag-map-toggle').click();                    // collapse
  await expect(page.locator('.ag-map')).toHaveCount(0);
  await page.reload();
  await page.waitForLoadState('networkidle');
  // re-open drawer + guide after reload, then assert the map stayed collapsed
  await openAgentGuide(page);
  await expect(page.locator('.ag-map-toggle')).toHaveAttribute('aria-expanded', 'false');
});
```

> Title substrings (`'Fehler beheben'`, `'Dienste laufen'`) match existing goal titles. If a title changes, update the substring.

- [ ] **Step 3: Run the E2E spec against a local preview**

The E2E suite runs against a base URL. Use the dev iterate flow or a local preview:

Run: `cd /tmp/wt-agent-guide-mental-model && task test:e2e:agent-guide` (or the project's standard E2E invocation; see `Taskfile.yml:376` for the film variant).
Expected: the 5 new tests pass alongside the existing ones. If the runner needs a base URL, start `cd website && pnpm build && pnpm preview` and point the Playwright `baseURL` at it per the existing E2E config.

- [ ] **Step 4: Commit**

```bash
cd /tmp/wt-agent-guide-mental-model
git add tests/e2e/specs/agent-guide-walkthrough.spec.ts tests/e2e/lib/agent-guide.ts
git commit -m "test(agent-guide): E2E for map render/filter/glossary/collapse"
```

---

## Task 11: Full verification + regenerate-and-commit gate

**Files:** none new — verification only.

- [ ] **Step 1: Registry + emitter gate (CI parity)**

Run: `cd /tmp/wt-agent-guide-mental-model && task test:agent-guide`
Expected: `node --test` green; `validate.mjs` prints `✓`; the `git diff --exit-code` on `agent-guide.generated.json` passes (i.e. the committed JSON already matches the emitter — it does, because Task 3 regenerated+committed it). If it reports "stale", run `task agent-guide:emit` and `git commit` the result, then re-run.

- [ ] **Step 2: Unit (vitest) gate**

Run: `cd /tmp/wt-agent-guide-mental-model/website && pnpm test:unit`
Expected: all `agentGuide*.test.ts` pass, including the pre-existing brittle `website` theme count (still 2) and the new `mapFilterIds`/`splitGlossaryTerms`/`stages` tests.

- [ ] **Step 3: Offline test suite (CI parity)**

Run: `cd /tmp/wt-agent-guide-mental-model && task test:all`
Expected: green. In particular the test-inventory check passes (no test-id changes here, but confirm `website/src/data/test-inventory.json` is unchanged or regenerated per CI: `task test:inventory` then commit if it differs).

- [ ] **Step 4: Build gate**

Run: `cd /tmp/wt-agent-guide-mental-model/website && pnpm build`
Expected: Astro build succeeds.

- [ ] **Step 5: Final review against the spec**

Confirm each spec section maps to a task: A→Tasks 6/8, B→Tasks 1/2/3, C→Tasks 5/6/8, D→Tasks 5/7, E→Task 8, F→Task 3, G→Tasks 1/2/5/10. Confirm no `agent-guide/maps/` emitter code changed (only regenerated output). Confirm no new component slug was introduced.

- [ ] **Step 6: Hand off to dev-flow-execute's PR step**

This plan is implemented on `feature/agent-guide-mental-model`. Open the PR per the project flow (squash-merge, CI green). After merge, deploy the website (`task feature:website` / per the deploy table) so both brands pick up the new bundle.

---

## Self-review (author)

- **Spec coverage:** A (experience) → GuideMap + AgentGuideView (T6/T8). B (data model) → flow.yaml/areas/validate (T1), emitter (T2), content (T3). C (render/interaction) → mapFilter pipeline + pure helper (T5/T8), GuideMap (T6). D (teaching) → splitGlossaryTerms + GlossaryTerm + concept line (T5/T7). E (onboarding/polish) → first-run + persistence + styles (T8/T9). F (content coverage) → 3 new goals + station fill + validate warning (T1/T3). G (testing) → node:test (T1/T2), vitest (T5), Playwright (T10). All covered.
- **Placeholder scan:** every code step shows real code; no TBD/TODO.
- **Type consistency:** `MapFilter` is `{kind:'flow'|'node'; id:string} | null` everywhere (search export, GuideMap prop is the non-null variant, AgentGuideView state is `MapFilter`); `guideMap`/`map` naming — exported as `guideMap` from `agentGuide.ts` (avoids clash with JS `Map`), aliased to `map` only in the E2E `loadGuideData` return; `mapFilterIds(filter, map)` takes `MapData`. `stages` is `string[]` on Goal/Tool/GuideEntry/registry consistently. Component emit adds `area`/`theme`/`relates_to` (snake_case in registry+emit) → territory node exposes `relatesTo` (camelCase) — the rename is intentional and only crosses the emitter boundary once (tested in T2).
- **Known coupling handled:** T2 Step 1 fixes the strict component-keys test before the emitter change; T3 keeps the `website` theme at 2 entries.
