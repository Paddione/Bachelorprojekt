---
title: Agent-Anleitung Sidekick UX Implementation Plan
ticket_id: T000383
domains: [website]
status: active
pr_number: null
---

# Agent-Anleitung Sidekick UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Agent-Anleitung drawer so its 19 guide cards are grouped by theme, collapse to a single scannable line, are color-coded by domain + danger tier, and are findable through a sticky index + ≥3-char umlaut-normalized substring search — plus a glossary, a red-stop panel for forbidden actions, a "Häufig" shelf, a grouping-axis toggle, and two-way cross-links.

**Architecture:** Content stays in the YAML registry (`docs/agent-guide/registry/`) → `task agent-guide:emit` → generated JSON → typed `agentGuide.ts`. New: two registry files (`themes.yaml`, `glossary.yaml`) + additive per-card fields. All search/grouping logic lives in a **pure, unit-tested** module `website/src/lib/agentGuideSearch.ts`. Presentation splits into small Svelte 5 components under `website/src/components/assistant/agent-guide/`, orchestrated by the existing `AgentGuideView.svelte`. **All CSS goes into the global sheet `website/src/styles/sidekick-panels.css` under `.drawer .ag-*`** — never a scoped `<style>` block (Svelte 5 + Vite drop scoped CSS of after-navigation drawer sub-views; see the file header in that sheet).

**Tech Stack:** Astro + Svelte 5 (runes: `$state`/`$derived`/`$effect`), Vitest (website unit tests), `node:test` (emitter/validate), Playwright (E2E), `yaml` (registry parsing), `go-task` (Taskfile orchestration).

**Source spec:** `docs/superpowers/specs/2026-05-31-agent-guide-sidekick-ux-design.md`

**Conventions for every task:** Work in the worktree `/tmp/wt-agent-guide-sidekick-ux` on branch `feature/agent-guide-sidekick-ux`. Use **absolute paths** in commands. Website unit tests run from `website/` (`npm run test:unit`); emitter/validate tests run from the repo root (`npm run test:agent-guide` or `node --test scripts/agent-guide/*.test.mjs`); E2E from `tests/e2e/`. Commit after each green task.

**On Svelte components & TDD:** This repo has **no Svelte component unit-test harness** — UI is verified by (a) the Vitest-tested pure logic in `agentGuideSearch.ts`, (b) the Playwright walkthrough, and (c) a production build (`npm run build`). So Tasks 1–6 are strict red-green-commit TDD; the Svelte component Tasks 7–11 are written complete, then **verified together in Task 13** by build + E2E. Do not skip Task 13.

---

## File Structure

**Create:**
- `docs/agent-guide/registry/themes.yaml` — 7 theme groups `{id,label_de,emoji,order,accent,blurb_de}`.
- `docs/agent-guide/registry/glossary.yaml` — ~12 one-line German term definitions `{term,def_de}`.
- `website/src/lib/agentGuideSearch.ts` — pure search/group/highlight logic.
- `website/src/lib/agentGuideSearch.test.ts` — Vitest for the above.
- `website/src/components/assistant/agent-guide/GuideCard.svelte` — collapsed line ↔ expanded body (goal/tool variant + red-stop panel).
- `website/src/components/assistant/agent-guide/GuideGroup.svelte` — collapsible group header + its cards.
- `website/src/components/assistant/agent-guide/GuideFindBar.svelte` — tier rail + axis toggle + domain chips + search input + count.

**Modify:**
- `docs/agent-guide/registry/goals.yaml` — add `theme`, `one_liner_de`, `aliases_de`, `common`/`order`, `links` (+ keep `related`).
- `docs/agent-guide/registry/tools.yaml` — add `theme`, `aliases_de`, `common`/`order`; promote `links` to objects.
- `scripts/agent-guide/emit-webapp.mjs` — pass new fields, resolve `themes[]`, emit `glossary[]`, attach `theme` (+ default), default `escalate_to_de`.
- `scripts/agent-guide/emit-webapp.test.mjs` — new assertions.
- `scripts/agent-guide/validate.mjs` — opt-in checks (theme membership, `one_liner_de` length, `links[].url`).
- `scripts/agent-guide/validate.test.mjs` — new assertions + a bad fixture.
- `website/src/lib/agentGuide.ts` — `Theme`/`GlossaryEntry`/`LinkRef` types, extend `Goal`/`Tool`, export `themes`/`glossary`.
- `website/src/lib/agentGuide.test.ts` — new assertions.
- `website/src/lib/agent-guide.generated.json` — regenerated artifact (committed).
- `website/src/components/assistant/AgentGuideView.svelte` — rewritten as orchestrator (owns state, renders find-bar + shelf + groups + glossary).
- `website/src/styles/sidekick-panels.css` — new `.ag-*` rules + a `prefers-reduced-motion` block.
- `Taskfile.yml` — add an `agent-guide.generated.json` freshness guard to `test:agent-guide`.
- `tests/e2e/lib/agent-guide.ts` — extend types, expose `themes`/`glossary`, add helpers.
- `tests/e2e/specs/agent-guide-walkthrough.spec.ts` — rewrite assertions for the new grouped/collapsible/searchable UI.
- `scripts/agent-guide/fixtures/bad-link-url/` — new validate fixture (one new dir of 5 YAML files).

---

## Task 1: Registry — themes, glossary, and per-card fields

**Files:**
- Create: `docs/agent-guide/registry/themes.yaml`
- Create: `docs/agent-guide/registry/glossary.yaml`
- Modify: `docs/agent-guide/registry/goals.yaml`
- Modify: `docs/agent-guide/registry/tools.yaml`

This task is pure data; it is verified by the emitter/validate tests in Tasks 2–3. No code runs yet, so there is no red-green here — just author the data exactly, then a parse check.

- [ ] **Step 1: Create `themes.yaml`** (cool-hue accents only — the warm green→amber→orange→red ramp is reserved for danger tiers, so no accent uses those hues)

```yaml
# docs/agent-guide/registry/themes.yaml
# Thematic groups for the Agent-Anleitung. `order` drives display order.
# `accent` is a COOL hue only (blue/indigo/violet/purple/cyan/teal/slate) so it
# never collides with the warm danger-tier ramp (green→amber→orange→red).
- { id: website,    label_de: "Website",                   emoji: "🌐", order: 1, accent: "#4a9eff", blurb_de: "Inhalte und Aussehen der Webseite." }
- { id: betrieb,    label_de: "Betrieb & Status",          emoji: "🛠", order: 2, accent: "#7e9aa6", blurb_de: "Läuft alles? Logs und Status ansehen." }
- { id: entwickeln, label_de: "Entwickeln (Dev-Flow)",     emoji: "⚙", order: 3, accent: "#b89bff", blurb_de: "Planen, bauen, umsetzen — der Dev-Flow." }
- { id: testen,     label_de: "Testen",                    emoji: "🧪", order: 4, accent: "#00bcd4", blurb_de: "Automatische Tests schreiben und ausführen." }
- { id: ausrollen,  label_de: "Ausrollen & Infrastruktur", emoji: "🚀", order: 5, accent: "#5ad1c4", blurb_de: "Änderungen live bringen, Cluster verwalten." }
- { id: datenbank,  label_de: "Datenbank",                 emoji: "🗄", order: 6, accent: "#6c8cff", blurb_de: "Schema, Migrationen und Daten." }
- { id: sicherheit, label_de: "Sicherheit & Geheimnisse",  emoji: "🔒", order: 7, accent: "#c77dff", blurb_de: "Secrets, Keycloak, Zertifikate." }
```

- [ ] **Step 2: Create `glossary.yaml`** (~12 jargon-free one-liners)

```yaml
# docs/agent-guide/registry/glossary.yaml
# Short German definitions for the "Begriffe kurz erklärt" group. Searchable.
- { term: "Skill",     def_de: "Eine vordefinierte Anleitung, die der Agent Schritt für Schritt abarbeitet." }
- { term: "Agent",     def_de: "Ein spezialisierter KI-Helfer für ein Themengebiet (z. B. Website, Datenbank)." }
- { term: "Task",      def_de: "Ein benannter Befehl aus der Taskfile, z. B. zum Deployen oder Testen." }
- { term: "PR",        def_de: "Pull Request — ein Änderungsvorschlag, der vor dem Zusammenführen geprüft wird." }
- { term: "Branch",    def_de: "Eine abgetrennte Arbeitskopie des Codes, auf der gefahrlos entwickelt wird." }
- { term: "Merge",     def_de: "Das Zusammenführen eines geprüften Branches in den Hauptstand (main)." }
- { term: "Deploy",    def_de: "Das Ausrollen einer Änderung in eine laufende Umgebung." }
- { term: "Cluster",   def_de: "Der Verbund von Servern, auf dem alle Dienste laufen (Kubernetes)." }
- { term: "Secret",    def_de: "Ein Geheimnis wie Passwort oder Schlüssel; verschlüsselt gespeichert." }
- { term: "ENV",       def_de: "Die Ziel-Umgebung eines Befehls, z. B. ENV=mentolder oder ENV=dev." }
- { term: "Guardrail", def_de: "Eine Schutzregel, die gefährliche Aktionen bremst oder blockiert." }
- { term: "CI",        def_de: "Continuous Integration — automatische Tests bei jedem Pull Request." }
```

- [ ] **Step 3: Add fields to each goal in `goals.yaml`.** For every goal, insert `theme`, `one_liner_de` (≤80 chars), `aliases_de`, and (where flagged) `common`/`order`, after the existing `danger:` line. Keep `flow`, `example_prompt_de`, `guardrails`, `related` unchanged. Exact additions per goal:

```yaml
# website-text-aendern  → after its `danger: safe` line add:
  theme: website
  one_liner_de: "Inhalt oder Preis auf der Website korrigieren."
  common: true
  order: 1
  aliases_de: [text, inhalt, preis, startseite, webseite, aendern]

# dienst-status-pruefen → after `danger: safe`:
  theme: betrieb
  one_liner_de: "Nachsehen, ob alle Dienste laufen."
  common: true
  order: 2
  aliases_de: [status, laeuft, gesund, pods, health, uebersicht]

# bug-beheben → after `danger: caution`:
  theme: entwickeln
  one_liner_de: "Etwas funktioniert nicht — finden und reparieren."
  common: true
  order: 3
  aliases_de: [fehler, bug, kaputt, "geht nicht", reparieren, fix]

# feature-bauen → after `danger: caution`:
  theme: entwickeln
  one_liner_de: "Eine neue Funktion oder Seite hinzufügen."
  aliases_de: [funktion, feature, neu, seite, bauen]

# aenderung-ausrollen → after `danger: assisted`:
  theme: ausrollen
  one_liner_de: "Einen gemergten Stand live schalten."
  aliases_de: [deploy, ausrollen, live, produktion, release]

# datenbank-aendern → after `danger: assisted`:
  theme: datenbank
  one_liner_de: "Tabelle, Spalte oder Index ergänzen."
  aliases_de: [datenbank, schema, migration, tabelle, spalte, sql]

# secret-aendern → after `danger: forbidden`:
  theme: sicherheit
  one_liner_de: "Passwort, Schlüssel oder Zertifikat rotieren."
  aliases_de: [passwort, geheimnis, "api-schluessel", zertifikat, rotieren, credentials, secret]

# cluster-neu-aufsetzen → after `danger: forbidden`:
  theme: ausrollen
  one_liner_de: "Cluster nach einem Ausfall neu aufbauen."
  aliases_de: [cluster, reset, neuaufbau, sealedsecrets, ausfall]
```

> Note: `escalate_to_de` is intentionally omitted — the emitter defaults forbidden cards to "Patrick" (Task 2). `links` is omitted on goals here; we seed editorial links only on tools (Step 5) to keep this iteration tight while still satisfying the render path.

- [ ] **Step 4: Add fields to each tool in `tools.yaml`.** For every tool, insert `theme` (after `danger:`) and `aliases_de`, and `common`/`order` for the two flagged tools. Promote `links: []` to objects only where seeded (Step 5); leave the rest as `links: []`.

```yaml
# dev-flow-plan      → theme: entwickeln ; aliases_de: [plan, planen, brainstorm, spec]
# dev-flow-execute   → theme: entwickeln ; aliases_de: [umsetzen, implementieren, ausfuehren, pr]
# dev-flow-iterate   → theme: entwickeln ; aliases_de: [dev, iterieren, ausprobieren, "dev-cluster"]
# dev-flow-e2e       → theme: testen     ; aliases_de: [e2e, playwright, "end-to-end", walkthrough]
# task-oracle        → theme: entwickeln ; common: true ; order: 5 ; aliases_de: [task, orakel, befehl, taskfile, kommando]
# agent-website      → theme: website    ; aliases_de: [website, astro, svelte, css, frontend]
# agent-ops          → theme: betrieb    ; common: true ; order: 4 ; aliases_de: ["warum rot", crash, logs, "laeuft nicht", status, betrieb]
# agent-infra        → theme: ausrollen  ; aliases_de: [infra, kubernetes, kustomize, manifest, deploy]
# agent-test         → theme: testen     ; aliases_de: [test, bats, playwright, vitest]
# agent-db           → theme: datenbank  ; aliases_de: [datenbank, postgres, schema, backup, query]
# agent-security     → theme: sicherheit ; aliases_de: [secret, keycloak, oidc, sealedsecret, zertifikat, rotieren]
```

Insert each `theme:`/`aliases_de:`/`common:`/`order:` as sibling keys under the matching tool (same indentation as `danger:`). Example for `agent-ops` (full block after edit):

```yaml
- id: agent-ops
  name_de: "Betriebs-Agent (ops)"
  kind: agent
  summary_de: "Schaut nach, warum etwas nicht läuft – liest Logs und Status, ohne etwas zu verändern."
  what_for_de: "Für Fragen wie 'Warum ist Dienst X rot?' oder 'Läuft alles?'. Liest Pod-Status und Protokolle (Logs)."
  how_to_start_de: "Frag z. B.: 'Warum startet Nextcloud nicht?' oder 'Zeig mir den Status aller Dienste.'"
  what_could_go_wrong_de: "Beim reinen Nachschauen kaum etwas. Vorsicht erst, wenn er etwas neu startet (das ist 🟡)."
  danger: safe
  theme: betrieb
  common: true
  order: 4
  aliases_de: ["warum rot", crash, logs, "laeuft nicht", status, betrieb]
  guardrails: [G-CONTEXT-CHECK]
  related: [agent-infra]
  links: []
```

- [ ] **Step 5: Seed editorial `links` on two tools** (so the "Mehr dazu" render path has real data). Editorial content links may carry full URLs (unlike k8s manifest hostnames, which `configmap-domains.yaml` owns). Replace `links: []` on these two tools:

```yaml
# agent-website:
  links:
    - { label_de: "Claude-Code-Doku", url: "https://docs.mentolder.de/claude-code.html" }
# agent-security:
  links:
    - { label_de: "Begriffe & Glossar", url: "https://docs.mentolder.de/glossary.html" }
```

> Both target pages exist in `k3d/docs-content-built/` (`claude-code.html`, `glossary.html`). The component opens them in a new tab. (Follow-up parked in §10 of the spec: brand-aware docs host.)

- [ ] **Step 6: Sanity-parse all four registry files** (catches YAML typos before any emitter runs)

Run:
```bash
cd /tmp/wt-agent-guide-sidekick-ux && node -e "const {parse}=require('yaml');const fs=require('fs');for(const f of ['themes','glossary','goals','tools']){const a=parse(fs.readFileSync('docs/agent-guide/registry/'+f+'.yaml','utf8'));console.log(f, Array.isArray(a)?a.length+' entries':'NOT A LIST');}"
```
Expected:
```
themes 7 entries
glossary 12 entries
goals 8 entries
tools 11 entries
```

- [ ] **Step 7: Commit**

```bash
cd /tmp/wt-agent-guide-sidekick-ux
git add docs/agent-guide/registry/
git commit -m "feat(agent-guide): add themes/glossary registry + per-card theme/alias/common/links fields"
```

---

## Task 2: Emitter — pass new fields, resolve themes, emit glossary

**Files:**
- Modify: `scripts/agent-guide/emit-webapp.mjs`
- Test: `scripts/agent-guide/emit-webapp.test.mjs`

The emitter must stay tolerant of registries **without** `themes.yaml`/`glossary.yaml` (the other emitters' fixtures and `emit-webapp`'s own existing fixture don't have them), so load them optionally with a `[]` fallback. `$schema` stays `agent-guide.generated/v1` (additive only).

- [ ] **Step 1: Write the failing tests.** Append to `scripts/agent-guide/emit-webapp.test.mjs`:

```js
// ── Task 2 (new): themes, glossary, per-card field passthrough ───────────────
import { readFileSync, existsSync } from 'node:fs';

/** Extend the shared fixture with themes.yaml + glossary.yaml + new card fields. */
function fixtureRegistryThemed() {
  const dir = globalThis.__agFixtureRegistry();
  writeFileSync(join(dir, 'themes.yaml'), [
    '- { id: website,    label_de: "Website",       emoji: "🌐", order: 1, accent: "#4a9eff", blurb_de: "Webseite." }',
    '- { id: entwickeln, label_de: "Entwickeln",    emoji: "⚙",  order: 2, accent: "#b89bff", blurb_de: "Dev-Flow." }',
    '',
  ].join('\n'));
  writeFileSync(join(dir, 'glossary.yaml'), [
    '- { term: "PR",  def_de: "Ein Änderungsvorschlag." }',
    '- { term: "ENV", def_de: "Die Ziel-Umgebung." }',
    '',
  ].join('\n'));
  // Re-author goals/tools with the new fields the fixture didn't carry:
  writeFileSync(join(dir, 'tools.yaml'), [
    '- id: agent-website',
    '  name_de: "Website-Agent"', '  kind: agent', '  summary_de: "Ändert Website-Texte."',
    '  what_for_de: "Pflegt Inhalte."', '  how_to_start_de: "Sag, welche Seite."',
    '  what_could_go_wrong_de: "Falsche Seite."', '  danger: safe',
    '  theme: website', '  common: true', '  order: 1', '  aliases_de: [text, inhalt]',
    '  guardrails: []', '  related: [dev-flow-plan]',
    '  links: [{ label_de: "Doku", url: "https://example/doc.html" }]',
    '- id: dev-flow-plan',
    '  name_de: "Entwicklungs-Plan starten"', '  kind: skill', '  summary_de: "Plant eine Änderung."',
    '  what_for_de: "Wählt den Pfad."', '  how_to_start_de: "Beschreibe es."',
    '  what_could_go_wrong_de: "Nichts Gefährliches."', '  danger: safe',
    '  theme: entwickeln', '  aliases_de: [plan]', '  guardrails: [G-ENV-EXPLICIT]',
    '  related: []', '  links: []', '',
  ].join('\n'));
  writeFileSync(join(dir, 'goals.yaml'), [
    '- id: change-website-text',
    '  title_de: "Ich will den Text auf der Website ändern"',
    '  when_de: "Wenn etwas Falsches dasteht."', '  danger: forbidden',
    '  theme: website', '  one_liner_de: "Text korrigieren."',
    '  common: true', '  order: 2', '  aliases_de: [text, ueberschrift]',
    '  flow:', '    - { tool: agent-website, note_de: "Sag ihm, welche Seite." }',
    '  example_prompt_de: "Ändere die Überschrift."',
    '  guardrails: [G-ENV-EXPLICIT]', '  related: []', '',
  ].join('\n'));
  return dir;
}

test('buildWebappData: emits ordered themes[] from themes.yaml', () => {
  const data = buildWebappData(fixtureRegistryThemed());
  assert.ok(Array.isArray(data.themes));
  assert.deepEqual(data.themes.map(t => t.id), ['website', 'entwickeln']);
  assert.equal(data.themes[0].label_de, 'Website');
  assert.equal(data.themes[0].emoji, '🌐');
  assert.equal(data.themes[0].accent, '#4a9eff');
});

test('buildWebappData: emits glossary[] from glossary.yaml', () => {
  const data = buildWebappData(fixtureRegistryThemed());
  assert.deepEqual(data.glossary.map(g => g.term), ['PR', 'ENV']);
  assert.equal(data.glossary[0].def_de, 'Ein Änderungsvorschlag.');
});

test('buildWebappData: passes through theme/one_liner_de/aliases_de/common/order/links', () => {
  const data = buildWebappData(fixtureRegistryThemed());
  const goal = data.goals.find(g => g.id === 'change-website-text');
  assert.equal(goal.theme, 'website');
  assert.equal(goal.one_liner_de, 'Text korrigieren.');
  assert.equal(goal.common, true);
  assert.equal(goal.order, 2);
  assert.deepEqual(goal.aliases_de, ['text', 'ueberschrift']);

  const tool = data.tools.find(t => t.id === 'agent-website');
  assert.equal(tool.theme, 'website');
  assert.deepEqual(tool.aliases_de, ['text', 'inhalt']);
  assert.equal(tool.common, true);
  assert.deepEqual(tool.links, [{ label_de: 'Doku', url: 'https://example/doc.html' }]);
});

test('buildWebappData: defaults escalate_to_de to "Patrick" on forbidden cards only', () => {
  const data = buildWebappData(fixtureRegistryThemed());
  const forbidden = data.goals.find(g => g.id === 'change-website-text'); // danger: forbidden in fixture
  assert.equal(forbidden.escalate_to_de, 'Patrick');
  const tool = data.tools.find(t => t.id === 'agent-website'); // danger: safe
  assert.equal(tool.escalate_to_de, undefined, 'non-forbidden cards carry no escalate_to_de');
});

test('buildWebappData: tolerates a registry with no themes.yaml/glossary.yaml', () => {
  const data = buildWebappData(globalThis.__agFixtureRegistry()); // original fixture, no themes file
  assert.deepEqual(data.themes, []);
  assert.deepEqual(data.glossary, []);
  // missing theme falls back to 'allgemein'
  assert.equal(data.goals[0].theme, 'allgemein');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /tmp/wt-agent-guide-sidekick-ux && node --test scripts/agent-guide/emit-webapp.test.mjs`
Expected: FAIL — the new tests error (e.g. `data.themes` is `undefined`, `goal.theme` is `undefined`).

- [ ] **Step 3: Implement the emitter changes.** Edit `scripts/agent-guide/emit-webapp.mjs`:

(a) Add the imports. The file already imports `writeFileSync` from `node:fs` and `dirname, resolve` from `node:path` — **merge** the new names into those existing lines (do not add duplicate import statements), and add the `yaml` import:

```js
// change existing line 4 to:
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
// change existing line 6 to:
import { dirname, resolve, join } from 'node:path';
// add a new import line:
import { parse as parseYaml } from 'yaml';
```

Then add an optional-file loader (after the imports, before `resolveGuardrail`):

```js
/** Load an optional registry list file; return [] if it does not exist. */
function loadOptionalList(registryDir, name) {
  const file = join(registryDir, `${name}.yaml`);
  if (!existsSync(file)) return [];
  const parsed = parseYaml(readFileSync(file, 'utf8'));
  return Array.isArray(parsed) ? parsed : [];
}
```

(b) In `buildWebappData`, after `const reg = loadRegistry(registryDir);`, load the two optional lists and build `themes`/`glossary`:

```js
  const themesRaw = loadOptionalList(registryDir, 'themes');
  const themes = themesRaw
    .map(t => ({
      id: t.id, label_de: t.label_de, emoji: t.emoji,
      order: t.order ?? 999, accent: t.accent ?? '#888888', blurb_de: t.blurb_de ?? '',
    }))
    .sort((a, b) => a.order - b.order);
  const themeIds = new Set(themes.map(t => t.id));

  const glossary = loadOptionalList(registryDir, 'glossary')
    .map(g => ({ term: g.term, def_de: g.def_de }));
```

(c) In the `tools` map, append the new fields (after `links`):

```js
    links: t.links ?? [],
    theme: themeIds.has(t.theme) ? t.theme : (t.theme ?? 'allgemein'),
    aliases_de: t.aliases_de ?? [],
    common: t.common === true,
    order: t.order ?? 999,
    ...(t.danger === 'forbidden' ? { escalate_to_de: t.escalate_to_de ?? 'Patrick' } : {}),
```

(d) In the `goals` map, append the new fields (after `related`):

```js
    related: g.related ?? [],
    links: g.links ?? [],
    theme: themeIds.has(g.theme) ? g.theme : (g.theme ?? 'allgemein'),
    one_liner_de: g.one_liner_de ?? g.when_de,
    aliases_de: g.aliases_de ?? [],
    common: g.common === true,
    order: g.order ?? 999,
    ...(g.danger === 'forbidden' ? { escalate_to_de: g.escalate_to_de ?? 'Patrick' } : {}),
```

> Note on the `theme` fallback: when `themes.yaml` is absent (`themeIds` empty) but a card declares a `theme`, `themeIds.has(...)` is false, so we keep `t.theme ?? 'allgemein'`. When a card declares **no** theme at all, it falls back to `'allgemein'`. Both behaviours are covered by the Step-1 tests.

(e) In the returned object literal, add `themes` and `glossary` (keep `$schema` first; place them after `taxonomy`):

```js
  return {
    $schema: 'agent-guide.generated/v1',
    generatedFrom: 'docs/agent-guide/registry',
    taxonomy,
    themes,
    goals,
    tools,
    components,
    glossary,
  };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /tmp/wt-agent-guide-sidekick-ux && node --test scripts/agent-guide/emit-webapp.test.mjs`
Expected: PASS — all tests (original + 5 new) green.

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-agent-guide-sidekick-ux
git add scripts/agent-guide/emit-webapp.mjs scripts/agent-guide/emit-webapp.test.mjs
git commit -m "feat(agent-guide): emit themes[]/glossary[] + per-card fields (additive v1)"
```

---

## Task 3: Validation — opt-in checks for the new fields

**Files:**
- Modify: `scripts/agent-guide/validate.mjs`
- Test: `scripts/agent-guide/validate.test.mjs`
- Create: `scripts/agent-guide/fixtures/bad-link-url/` (5 YAML files)

Checks must be **opt-in** so the existing `fixtures/good` (no themes, no new fields) keeps passing. Rules: if a card declares `theme` AND `themes.yaml` is non-empty, that theme must exist; `one_liner_de` (when present) ≤ 80 chars; each `links[]` entry (when an object) must have a non-empty `url`.

- [ ] **Step 1: Create the bad fixture.** Copy the good fixture, then break one link. Run:

```bash
cd /tmp/wt-agent-guide-sidekick-ux
cp -r scripts/agent-guide/fixtures/good scripts/agent-guide/fixtures/bad-link-url
```

Then edit `scripts/agent-guide/fixtures/bad-link-url/tools.yaml` — add a malformed `links` to the **first** tool (a `url`-less object). Append these two lines under that tool's existing keys (match its indentation):

```yaml
  links:
    - { label_de: "Kaputt", url: "" }
```

- [ ] **Step 2: Write the failing tests.** Append to `scripts/agent-guide/validate.test.mjs`:

```js
test('good fixture still validates after opt-in checks are added', () => {
  const res = validateRegistry(join(here, 'fixtures', 'good'));
  assert.equal(res.ok, true, JSON.stringify(res.errors, null, 2));
});

test('empty link url is rejected', () => {
  const res = validateRegistry(join(here, 'fixtures', 'bad-link-url'));
  assert.equal(res.ok, false);
  assert.ok(
    res.errors.some((e) => e.includes('link') && e.includes('url')),
    `expected a link-url error, got: ${JSON.stringify(res.errors)}`,
  );
});
```

- [ ] **Step 3: Run to verify failure**

Run: `cd /tmp/wt-agent-guide-sidekick-ux && node --test scripts/agent-guide/validate.test.mjs`
Expected: FAIL — `bad-link-url` still validates as ok (the empty-url check doesn't exist yet).

- [ ] **Step 4: Implement the checks.** Edit `scripts/agent-guide/validate.mjs`:

(a) After the existing `const components = load(dir, 'components.yaml');` line, load themes optionally:

```js
  let themes = [];
  try { themes = load(dir, 'themes.yaml'); } catch { themes = []; }
  const themeIds = new Set((themes ?? []).map((t) => t && t.id));
```

(b) Add a shared per-card field checker. Inside `validateRegistry`, after the `goals` loop and before the `components` loop, add:

```js
  // Opt-in checks on the new additive fields (skip silently when absent).
  const checkCardExtras = (card, label) => {
    if (card?.theme && themeIds.size > 0)
      req(themeIds.has(card.theme), `${label}: theme '${card.theme}' not in themes.yaml`);
    if (typeof card?.one_liner_de === 'string')
      req(card.one_liner_de.length <= 80, `${label}: one_liner_de > 80 chars`);
    for (const l of card?.links ?? []) {
      if (l && typeof l === 'object')
        req(typeof l.url === 'string' && l.url.length > 0, `${label}: link has empty 'url'`);
    }
  };
  for (const t of tools) checkCardExtras(t, `tools[${t?.id}]`);
  for (const g of goals) checkCardExtras(g, `goals[${g?.id}]`);
```

- [ ] **Step 5: Run to verify pass**

Run: `cd /tmp/wt-agent-guide-sidekick-ux && node --test scripts/agent-guide/validate.test.mjs`
Expected: PASS — good fixture ok, `bad-link-url` rejected with a link-url error.

- [ ] **Step 6: Validate the REAL registry** (now that Task 1 added themes + fields)

Run: `cd /tmp/wt-agent-guide-sidekick-ux && node scripts/agent-guide/validate.mjs`
Expected: `✓ agent-guide registry valid`

- [ ] **Step 7: Commit**

```bash
cd /tmp/wt-agent-guide-sidekick-ux
git add scripts/agent-guide/validate.mjs scripts/agent-guide/validate.test.mjs scripts/agent-guide/fixtures/bad-link-url/
git commit -m "feat(agent-guide): opt-in registry validation for theme/one_liner/link fields"
```

---

## Task 4: TypeScript types + exports in `agentGuide.ts`

**Files:**
- Modify: `website/src/lib/agentGuide.ts`
- Test: `website/src/lib/agentGuide.test.ts`

- [ ] **Step 1: Write the failing tests.** Append inside the `describe(...)` block in `website/src/lib/agentGuide.test.ts` (and extend the top import):

Change the import line to also pull `themes` and `glossary`:
```ts
import {
  goals, tools, taxonomy, components, themes, glossary,
  tierFor, tierColor, tierEmoji, tierLabel, componentBySlug,
} from './agentGuide';
```

Add these tests:
```ts
  it('exposes themes[] (ordered) and glossary[] from the generated JSON', () => {
    expect(Array.isArray(themes)).toBe(true);
    expect(themes.length).toBe(7);
    expect(themes.map(t => t.id)).toEqual(
      [...themes].sort((a, b) => a.order - b.order).map(t => t.id),
    );
    expect(Array.isArray(glossary)).toBe(true);
    expect(glossary.length).toBeGreaterThanOrEqual(10);
  });

  it('every goal/tool carries a theme that exists in themes[]', () => {
    const ids = new Set(themes.map(t => t.id));
    for (const g of goals) expect(ids.has(g.theme), `goal ${g.id} theme`).toBe(true);
    for (const t of tools) expect(ids.has(t.theme), `tool ${t.id} theme`).toBe(true);
  });

  it('every goal has a one_liner_de ≤ 80 chars', () => {
    for (const g of goals) {
      expect(typeof g.one_liner_de).toBe('string');
      expect(g.one_liner_de.length).toBeLessThanOrEqual(80);
    }
  });

  it('forbidden cards carry escalate_to_de', () => {
    for (const g of goals.filter(x => x.danger === 'forbidden')) {
      expect(g.escalate_to_de).toBeTruthy();
    }
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /tmp/wt-agent-guide-sidekick-ux/website && npm run test:unit -- src/lib/agentGuide.test.ts`
Expected: FAIL — `themes`/`glossary` are not exported; `g.theme`/`g.one_liner_de` are type errors / undefined. (If the dev hasn't run `npm ci` in `website/` yet, run it first.)

- [ ] **Step 3: Implement the types + exports.** Edit `website/src/lib/agentGuide.ts`:

Add new interfaces (after `TierEntry`):
```ts
export interface LinkRef {
  label_de: string;
  url: string;
}

export interface Theme {
  id: string;
  label_de: string;
  emoji: string;
  order: number;
  accent: string;
  blurb_de: string;
}

export interface GlossaryEntry {
  term: string;
  def_de: string;
}
```

Extend `Goal` (add fields before the closing brace):
```ts
export interface Goal {
  id: string;
  title_de: string;
  when_de: string;
  danger: string;
  flow: GoalFlowStep[];
  example_prompt_de: string;
  guardrails: GuardrailChip[];
  related: string[];
  links: LinkRef[];
  theme: string;
  one_liner_de: string;
  aliases_de: string[];
  common: boolean;
  order: number;
  escalate_to_de?: string;
}
```

Extend `Tool` (change `links` type, add fields):
```ts
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
  links: LinkRef[];
  theme: string;
  aliases_de: string[];
  common: boolean;
  order: number;
  escalate_to_de?: string;
}
```

Add the exports (after the `components` export):
```ts
export const themes: Theme[] = (data.themes ?? []) as Theme[];
export const glossary: GlossaryEntry[] = (data.glossary ?? []) as GlossaryEntry[];
```

- [ ] **Step 4: Run to verify pass**

Run: `cd /tmp/wt-agent-guide-sidekick-ux/website && npm run test:unit -- src/lib/agentGuide.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-agent-guide-sidekick-ux
git add website/src/lib/agentGuide.ts website/src/lib/agentGuide.test.ts
git commit -m "feat(agent-guide): typed Theme/GlossaryEntry/LinkRef + extended Goal/Tool"
```

---

## Task 5: Regenerate the committed JSON + add a CI freshness guard

**Files:**
- Modify: `website/src/lib/agent-guide.generated.json` (regenerated artifact)
- Modify: `Taskfile.yml` (`test:agent-guide` task)

- [ ] **Step 1: Regenerate the artifact**

Run: `cd /tmp/wt-agent-guide-sidekick-ux && node scripts/agent-guide/emit-webapp.mjs`
Expected: `emit-webapp: wrote .../agent-guide.generated.json`

- [ ] **Step 2: Eyeball the diff** (it should be purely additive)

Run: `cd /tmp/wt-agent-guide-sidekick-ux && git --no-pager diff --stat website/src/lib/agent-guide.generated.json && node -e "const d=require('./website/src/lib/agent-guide.generated.json'); console.log('themes', d.themes.length, 'glossary', d.glossary.length, 'goal0.theme', d.goals[0].theme, 'goal0.one_liner', JSON.stringify(d.goals[0].one_liner_de));"`
Expected: `themes 7 glossary 12 goal0.theme website goal0.one_liner "Inhalt oder Preis auf der Website korrigieren."`

- [ ] **Step 3: Add the freshness guard.** Edit the `test:agent-guide` task in `Taskfile.yml` (lines ~350–358). Append two commands after the existing `node scripts/gen-platform-descriptions.mjs` block so the committed JSON must equal the emitter output (mirrors the existing platform-descriptions guard):

```yaml
  test:agent-guide:
    desc: "Validate the AI-agent guide registry (unit tests + real registry + generated JSON freshness)"
    cmds:
      - node --test scripts/agent-guide/*.test.mjs
      - node scripts/agent-guide/validate.mjs
      - node scripts/gen-platform-descriptions.mjs
      - |
        git diff --exit-code website/src/lib/platform-descriptions.generated.json \
          || (echo "ERROR: platform-descriptions.generated.json is stale — run node scripts/gen-platform-descriptions.mjs and commit"; exit 1)
      - node scripts/agent-guide/emit-webapp.mjs
      - |
        git diff --exit-code website/src/lib/agent-guide.generated.json \
          || (echo "ERROR: agent-guide.generated.json is stale — run 'task agent-guide:emit' and commit"; exit 1)
```

- [ ] **Step 4: Verify the guard passes on the freshly-committed artifact**

Run: `cd /tmp/wt-agent-guide-sidekick-ux && node scripts/agent-guide/emit-webapp.mjs && git diff --exit-code website/src/lib/agent-guide.generated.json && echo "FRESH ✓"`
Expected: `FRESH ✓` (no diff, because Step 1 already wrote it).

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-agent-guide-sidekick-ux
git add website/src/lib/agent-guide.generated.json Taskfile.yml
git commit -m "feat(agent-guide): regenerate generated JSON + CI freshness guard"
```

---

## Task 6: Pure search/group/highlight module

**Files:**
- Create: `website/src/lib/agentGuideSearch.ts`
- Test: `website/src/lib/agentGuideSearch.test.ts`

This is the heart of search + grouping, fully pure and Vitest-covered. The Svelte components consume it.

- [ ] **Step 1: Write the failing tests.** Create `website/src/lib/agentGuideSearch.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { goals, tools, taxonomy, themes } from './agentGuide';
import {
  MIN_QUERY, normalize, buildEntries, matches, filterEntries,
  groupBy, sortCommonFirst, highlight,
} from './agentGuideSearch';

const ALL = buildEntries(goals, tools);

describe('normalize', () => {
  it('lowercases and folds umlauts so "Ändern" === "aendern"', () => {
    expect(normalize('Ändern')).toBe('aendern');
    expect(normalize('aendern')).toBe('aendern');
    expect(normalize('Ö Ü ß')).toBe('oe ue ss');
  });
  it('strips other diacritics too', () => {
    expect(normalize('café')).toBe('cafe');
  });
});

describe('buildEntries', () => {
  it('produces one entry per goal + tool with a precomputed haystack', () => {
    expect(ALL.length).toBe(goals.length + tools.length);
    for (const e of ALL) {
      expect(e.haystack).toBe(e.haystack.toLowerCase());
      expect(e.domId.startsWith('ag-goal-') || e.domId.startsWith('ag-tool-')).toBe(true);
    }
  });
  it('goal entries use one_liner_de, tool entries use summary_de', () => {
    const goalE = ALL.find(e => e.kind === 'goal')!;
    const toolE = ALL.find(e => e.kind === 'tool')!;
    expect(goalE.one_liner_de).toBeTruthy();
    expect(toolE.one_liner_de).toBeTruthy();
  });
});

describe('matches / filterEntries', () => {
  it('does not filter below MIN_QUERY chars', () => {
    expect(MIN_QUERY).toBe(3);
    expect(filterEntries(ALL, 'da').length).toBe(ALL.length);
    expect(filterEntries(ALL, '').length).toBe(ALL.length);
  });
  it('"daten" matches the Datenbank cards', () => {
    const res = filterEntries(ALL, 'daten');
    expect(res.length).toBeGreaterThanOrEqual(2);
    expect(res.some(e => e.id === 'datenbank-aendern')).toBe(true);
    expect(res.some(e => e.id === 'agent-db')).toBe(true);
  });
  it('umlaut query "aendern" finds the website-text goal (title has "ändern")', () => {
    const res = filterEntries(ALL, 'aendern');
    expect(res.some(e => e.id === 'website-text-aendern')).toBe(true);
  });
  it('alias "passwort" finds the security goal via aliases_de', () => {
    const res = filterEntries(ALL, 'passwort');
    expect(res.some(e => e.id === 'secret-aendern')).toBe(true);
  });
  it('matches() is a pure haystack includes (case/diacritic-insensitive)', () => {
    const sec = ALL.find(e => e.id === 'secret-aendern')!;
    expect(matches(sec, 'PASSWORT')).toBe(true);
    expect(matches(sec, 'zzz-nope')).toBe(false);
  });
});

describe('groupBy', () => {
  it('thema: groups by theme, ordered by themes[].order, with theme meta', () => {
    const groups = groupBy(ALL, 'thema', themes, taxonomy);
    expect(groups.map(g => g.key)).toEqual(themes.map(t => t.id));
    const website = groups.find(g => g.key === 'website')!;
    expect(website.label_de).toBe('Website');
    expect(website.emoji).toBe('🌐');
    expect(website.entries.length).toBe(2);
  });
  it('gefahr: groups by danger in taxonomy order with tier meta', () => {
    const groups = groupBy(ALL, 'gefahr', themes, taxonomy);
    expect(groups.map(g => g.key)).toEqual(['safe', 'caution', 'assisted', 'forbidden']);
    expect(groups.find(g => g.key === 'forbidden')!.color).toMatch(/^#/);
  });
  it('art: groups into Ziel/Fertigkeit/Agent/Aufgabe', () => {
    const groups = groupBy(ALL, 'art', themes, taxonomy);
    expect(groups.map(g => g.key)).toEqual(['ziel', 'skill', 'agent', 'task']);
    expect(groups.find(g => g.key === 'ziel')!.entries.length).toBe(goals.length);
  });
  it('drops empty groups', () => {
    const onlyWebsite = ALL.filter(e => e.theme === 'website');
    const groups = groupBy(onlyWebsite, 'thema', themes, taxonomy);
    expect(groups.length).toBe(1);
    expect(groups[0].key).toBe('website');
  });
});

describe('sortCommonFirst', () => {
  it('puts common entries first, ordered by .order', () => {
    const sorted = sortCommonFirst(ALL);
    const firstCommon = sorted.filter(e => e.common);
    expect(firstCommon.length).toBeGreaterThanOrEqual(4);
    expect(sorted.slice(0, firstCommon.length).every(e => e.common)).toBe(true);
    const orders = firstCommon.map(e => e.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });
});

describe('highlight', () => {
  it('wraps the first raw case-insensitive match', () => {
    expect(highlight('Datenbank ändern', 'daten')).toEqual([
      { text: 'Daten', mark: true },
      { text: 'bank ändern', mark: false },
    ]);
  });
  it('wraps umlaut-normalized matches, mapping back to original characters', () => {
    expect(highlight('Text ändern', 'aendern')).toEqual([
      { text: 'Text ', mark: false },
      { text: 'ändern', mark: true },
    ]);
  });
  it('returns a single unmarked segment below MIN_QUERY or on no match', () => {
    expect(highlight('Hallo', 'ha')).toEqual([{ text: 'Hallo', mark: false }]);
    expect(highlight('Hallo', 'xyz')).toEqual([{ text: 'Hallo', mark: false }]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /tmp/wt-agent-guide-sidekick-ux/website && npm run test:unit -- src/lib/agentGuideSearch.test.ts`
Expected: FAIL — module `./agentGuideSearch` does not exist.

- [ ] **Step 3: Implement the module.** Create `website/src/lib/agentGuideSearch.ts`:

```ts
import type { Goal, Tool, Theme, TierEntry } from './agentGuide';

export type Axis = 'thema' | 'gefahr' | 'art';
export const MIN_QUERY = 3;

export interface GuideEntry {
  id: string;
  domId: string;            // 'ag-goal-…' | 'ag-tool-…'
  kind: 'goal' | 'tool';
  title_de: string;         // goal.title_de | tool.name_de
  one_liner_de: string;     // goal.one_liner_de | tool.summary_de
  danger: string;
  theme: string;
  art: 'ziel' | 'skill' | 'agent' | 'task';
  artLabel: string;         // 'Ziel' | 'Fertigkeit' | 'Agent' | 'Aufgabe'
  common: boolean;
  order: number;
  aliases_de: string[];
  haystack: string;         // normalized
  goal?: Goal;
  tool?: Tool;
}

export interface Group {
  key: string;
  label_de: string;
  emoji?: string;
  color?: string;
  order: number;
  entries: GuideEntry[];
}

export interface Segment { text: string; mark: boolean; }

const ART_LABEL: Record<string, string> = {
  ziel: 'Ziel', skill: 'Fertigkeit', agent: 'Agent', task: 'Aufgabe',
};
const ART_ORDER = ['ziel', 'skill', 'agent', 'task'];

/** Lowercase + fold German umlauts + strip remaining diacritics. */
export function normalize(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

function goalHaystack(g: Goal): string {
  const parts = [
    g.title_de, g.one_liner_de, g.when_de,
    ...(g.flow ?? []).flatMap(f => [f.tool_name_de, f.note_de]),
    ...(g.guardrails ?? []).flatMap(gr => [gr.name_de, gr.rule_de]),
    ...(g.aliases_de ?? []),
  ];
  return normalize(parts.join('  '));
}

function toolHaystack(t: Tool): string {
  const parts = [
    t.name_de, t.summary_de, t.what_for_de, t.kind_de,
    ...(t.guardrails ?? []).flatMap(gr => [gr.name_de, gr.rule_de]),
    ...(t.aliases_de ?? []),
  ];
  return normalize(parts.join('  '));
}

export function buildEntries(goals: Goal[], tools: Tool[]): GuideEntry[] {
  const goalEntries: GuideEntry[] = goals.map(g => ({
    id: g.id, domId: `ag-goal-${g.id}`, kind: 'goal',
    title_de: g.title_de, one_liner_de: g.one_liner_de,
    danger: g.danger, theme: g.theme,
    art: 'ziel', artLabel: ART_LABEL.ziel,
    common: g.common, order: g.order, aliases_de: g.aliases_de ?? [],
    haystack: goalHaystack(g), goal: g,
  }));
  const toolEntries: GuideEntry[] = tools.map(t => {
    const art = (t.kind === 'skill' || t.kind === 'agent' || t.kind === 'task') ? t.kind : 'task';
    return {
      id: t.id, domId: `ag-tool-${t.id}`, kind: 'tool',
      title_de: t.name_de, one_liner_de: t.summary_de,
      danger: t.danger, theme: t.theme,
      art, artLabel: ART_LABEL[art] ?? t.kind_de,
      common: t.common, order: t.order, aliases_de: t.aliases_de ?? [],
      haystack: toolHaystack(t), tool: t,
    };
  });
  return [...goalEntries, ...toolEntries];
}

export function matches(entry: GuideEntry, query: string): boolean {
  const q = normalize(query.trim());
  return q.length > 0 && entry.haystack.includes(q);
}

/** Gate: below MIN_QUERY chars, return everything; otherwise keep matches. */
export function filterEntries(entries: GuideEntry[], query: string): GuideEntry[] {
  if (query.trim().length < MIN_QUERY) return entries;
  return entries.filter(e => matches(e, query));
}

export function groupBy(
  entries: GuideEntry[], axis: Axis, themes: Theme[], taxonomy: TierEntry[],
): Group[] {
  const buckets = new Map<string, GuideEntry[]>();
  const push = (key: string, e: GuideEntry) => {
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(e);
  };

  if (axis === 'thema') {
    for (const e of entries) push(e.theme, e);
    return themes
      .filter(t => buckets.has(t.id))
      .map(t => ({ key: t.id, label_de: t.label_de, emoji: t.emoji, color: t.accent, order: t.order, entries: buckets.get(t.id)! }))
      .concat(
        buckets.has('allgemein')
          ? [{ key: 'allgemein', label_de: 'Allgemein', emoji: '•', color: '#888888', order: 999, entries: buckets.get('allgemein')! }]
          : [],
      );
  }

  if (axis === 'gefahr') {
    for (const e of entries) push(e.danger, e);
    return taxonomy
      .filter(t => buckets.has(t.id))
      .map((t, i) => ({ key: t.id, label_de: t.label_de, emoji: t.emoji, color: t.color, order: i, entries: buckets.get(t.id)! }));
  }

  // axis === 'art'
  for (const e of entries) push(e.art, e);
  return ART_ORDER
    .filter(k => buckets.has(k))
    .map((k, i) => ({ key: k, label_de: ART_LABEL[k], order: i, entries: buckets.get(k)! }));
}

/** Common entries first (by .order), then the rest in original order. */
export function sortCommonFirst(entries: GuideEntry[]): GuideEntry[] {
  const common = entries.filter(e => e.common).sort((a, b) => a.order - b.order);
  const rest = entries.filter(e => !e.common);
  return [...common, ...rest];
}

/** Wrap the first match of `query` in a marked segment. Matching is umlaut/diacritic
 *  insensitive: normalize both sides, find the match in normalized space, then map the
 *  start/end back to ORIGINAL character offsets (ä→"ae" changes length, so keep a
 *  normalized-index → original-index table and always cut on whole original chars). */
export function highlight(text: string, query: string): Segment[] {
  const q = normalize(query.trim());
  if (q.length < MIN_QUERY) return [{ text, mark: false }];
  let norm = '';
  const map: number[] = [];                       // map[i] = original index of normalized char i
  for (let oi = 0; oi < text.length; oi++) {
    const n = normalize(text[oi]);
    for (let k = 0; k < n.length; k++) { norm += n[k]; map.push(oi); }
  }
  const idx = norm.indexOf(q);
  if (idx === -1) return [{ text, mark: false }];
  const startOrig = map[idx];
  const endOrig = map[idx + q.length - 1] + 1;    // include the whole last original char
  return [
    { text: text.slice(0, startOrig), mark: false },
    { text: text.slice(startOrig, endOrig), mark: true },
    { text: text.slice(endOrig), mark: false },
  ].filter(s => s.text.length > 0);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd /tmp/wt-agent-guide-sidekick-ux/website && npm run test:unit -- src/lib/agentGuideSearch.test.ts`
Expected: PASS (all groups).

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-agent-guide-sidekick-ux
git add website/src/lib/agentGuideSearch.ts website/src/lib/agentGuideSearch.test.ts
git commit -m "feat(agent-guide): pure search/group/highlight module + vitest"
```

---

## Task 7: `GuideCard.svelte` — collapsed line ↔ expanded body

**Files:**
- Create: `website/src/components/assistant/agent-guide/GuideCard.svelte`

A presentational card. Collapsed = one line (`[tier dot] Titel … [right meta]`) with a tier-colored 3px left-border. Expanded = goal body (one-liner, flow, prompt, guardrails, related, "Mehr dazu") OR tool body (`Wofür/So startest Du/Was kann schiefgehen`, guardrails, related, "Mehr dazu"); a **red-stop panel** replaces the normal body when `danger === 'forbidden'`. No scoped `<style>` — all classes are styled in Task 11.

- [ ] **Step 0: Create the component directory**

Run: `mkdir -p /tmp/wt-agent-guide-sidekick-ux/website/src/components/assistant/agent-guide`

- [ ] **Step 1: Create the component**

```svelte
<script lang="ts">
  import { tierColor, tierEmoji, tierLabel, tierFor } from '../../../lib/agentGuide';
  import { highlight, type GuideEntry } from '../../../lib/agentGuideSearch';

  let {
    entry,
    open = false,
    query = '',
    copiedId = null,
    onToggle,
    onJump,
    onCopy,
  }: {
    entry: GuideEntry;
    open?: boolean;
    query?: string;
    copiedId?: string | null;
    onToggle: (id: string) => void;
    onJump: (id: string) => void;
    onCopy: (id: string, text: string) => void;
  } = $props();

  const isForbidden = $derived(entry.danger === 'forbidden');
  const goal = $derived(entry.goal);
  const tool = $derived(entry.tool);
  const rightMeta = $derived(
    entry.kind === 'goal'
      ? `${goal!.flow.length} Schritt${goal!.flow.length === 1 ? '' : 'e'}`
      : entry.artLabel,
  );
</script>

<article
  id={entry.domId}
  class="ag-card"
  class:ag-card-open={open}
  class:ag-card-forbidden={isForbidden}
  style="--tier: {tierColor(entry.danger)}"
>
  <button
    type="button"
    class="ag-card-head"
    aria-expanded={open}
    aria-controls={`${entry.domId}-body`}
    onclick={() => onToggle(entry.id)}
  >
    <span class="ag-dot" aria-hidden="true">{tierEmoji(entry.danger)}</span>
    <span class="ag-name">
      {#each highlight(entry.title_de, query) as seg}{#if seg.mark}<mark class="ag-hl">{seg.text}</mark>{:else}{seg.text}{/if}{/each}
    </span>
    <span class="ag-meta">{rightMeta}</span>
    <span class="ag-chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
    <span class="ag-sr">Gefahrenstufe: {tierLabel(entry.danger)} – {tierFor(entry.danger)?.meaning}</span>
  </button>

  <div class="ag-card-body" id={`${entry.domId}-body`} data-open={open}>
    <div class="ag-card-body-inner">
      {#if isForbidden}
        <!-- Rote Stopp-Karte -->
        <div class="ag-redstop" role="note">
          <p class="ag-redstop-stop">🔴 Nicht allein ausführen.</p>
          <p class="ag-redstop-why">
            {entry.kind === 'goal' ? goal!.when_de : tool!.what_could_go_wrong_de}
          </p>
          <p class="ag-redstop-who">Zuerst fragen: <strong>{(goal?.escalate_to_de ?? tool?.escalate_to_de) ?? 'Patrick'}</strong></p>
        </div>
      {/if}

      {#if entry.kind === 'goal'}
        {#if !isForbidden}<p class="ag-when">{goal!.when_de}</p>{/if}
        {#if goal!.flow.length}
          <ol class="ag-flow">
            {#each goal!.flow as step, i (i)}
              <li>
                <button type="button" class="ag-flow-jump" onclick={() => onJump(`ag-tool-${step.tool}`)}>
                  {step.tool_name_de}
                </button> — {step.note_de}
              </li>
            {/each}
          </ol>
        {/if}
        <div class="ag-prompt">
          <code class="ag-prompt-text">{goal!.example_prompt_de}</code>
          <button class="ag-copy" onclick={() => onCopy(entry.id, goal!.example_prompt_de)}>
            {copiedId === entry.id ? 'Kopiert ✓' : (isForbidden ? 'Prompt nur nach Rücksprache kopieren' : 'Diesen Prompt kopieren')}
          </button>
        </div>
        {#if goal!.guardrails.length}
          <div class="ag-chips">
            {#each goal!.guardrails as g (g.id)}
              <details class="ag-chip"><summary>{g.name_de}</summary><p class="ag-chip-rule">{g.rule_de}</p><p class="ag-chip-why">{g.why_de}</p></details>
            {/each}
          </div>
        {/if}
        {#if goal!.related.length}
          <div class="ag-related">
            {#each goal!.related as relId (relId)}
              {@const rel = entry.related?.[relId]}
              <button class="ag-related-chip" onclick={() => onJump(rel?.domId ?? `ag-goal-${relId}`)}>
                ↳ {#if rel}{tierEmoji(rel.danger)} {rel.label}{:else}{relId}{/if}
              </button>
            {/each}
          </div>
        {/if}
      {:else}
        {#if !isForbidden}<p class="ag-summary">{tool!.what_for_de}</p>{/if}
        <p class="ag-label">So startest Du</p><p class="ag-bodytext">{tool!.how_to_start_de}</p>
        <p class="ag-label">Was kann schiefgehen</p><p class="ag-bodytext">{tool!.what_could_go_wrong_de}</p>
        {#if tool!.guardrails.length}
          <div class="ag-chips">
            {#each tool!.guardrails as g (g.id)}
              <details class="ag-chip"><summary>{g.name_de}</summary><p class="ag-chip-rule">{g.rule_de}</p><p class="ag-chip-why">{g.why_de}</p></details>
            {/each}
          </div>
        {/if}
        {#if tool!.related.length}
          <div class="ag-related">
            {#each tool!.related as relId (relId)}
              {@const rel = entry.related?.[relId]}
              <button class="ag-related-chip" onclick={() => onJump(rel?.domId ?? `ag-tool-${relId}`)}>
                ↳ {#if rel}{tierEmoji(rel.danger)} {rel.label}{:else}{relId}{/if}
              </button>
            {/each}
          </div>
        {/if}
      {/if}

      {#if (goal?.links ?? tool?.links ?? []).length}
        <div class="ag-morelinks">
          <span class="ag-label">Mehr dazu</span>
          {#each (goal?.links ?? tool?.links ?? []) as l (l.url)}
            <a class="ag-morelink" href={l.url} target="_blank" rel="noopener noreferrer">{l.label_de} ↗</a>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</article>
```

> **Cross-link name resolution:** `entry.related` is an optional `Record<id, {label,kind,danger,domId}>` injected by the orchestrator (Task 10) so related goal chips render human names. For tools we already key by id; the orchestrator passes the same lookup. To keep the type simple, add `related?: Record<string, { label: string; kind: string; danger: string; domId: string }>` to `GuideEntry` in `agentGuideSearch.ts` (optional field, defaults undefined — does not affect Task 6 tests). Make that one-line type addition now.

- [ ] **Step 2: Add the optional `related` field to `GuideEntry`.** Edit `website/src/lib/agentGuideSearch.ts` — add to the `GuideEntry` interface (after `tool?: Tool;`):

```ts
  related?: Record<string, { label: string; kind: string; danger: string; domId: string }>;
```

- [ ] **Step 3: Type-check compiles** (no Svelte unit test; verified in Task 13 build). Quick check:

Run: `cd /tmp/wt-agent-guide-sidekick-ux/website && npx svelte-check --threshold error --diagnostic-sources js,svelte src/components/assistant/agent-guide/GuideCard.svelte 2>&1 | tail -5 || true`
Expected: no **errors** referencing `GuideCard.svelte` (warnings are acceptable; a full check runs in Task 13).

- [ ] **Step 4: Commit**

```bash
cd /tmp/wt-agent-guide-sidekick-ux
git add website/src/components/assistant/agent-guide/GuideCard.svelte website/src/lib/agentGuideSearch.ts
git commit -m "feat(agent-guide): GuideCard — collapsed line, expanded body, red-stop panel"
```

---

## Task 8: `GuideGroup.svelte` — collapsible group header + cards

**Files:**
- Create: `website/src/components/assistant/agent-guide/GuideGroup.svelte`

- [ ] **Step 1: Create the component**

```svelte
<script lang="ts">
  import GuideCard from './GuideCard.svelte';
  import type { Group } from '../../../lib/agentGuideSearch';

  let {
    group,
    groupOpen = true,
    expanded,
    query = '',
    copiedId = null,
    onToggleGroup,
    onToggleCard,
    onJump,
    onCopy,
  }: {
    group: Group;
    groupOpen?: boolean;
    expanded: Set<string>;
    query?: string;
    copiedId?: string | null;
    onToggleGroup: (key: string) => void;
    onToggleCard: (id: string) => void;
    onJump: (id: string) => void;
    onCopy: (id: string, text: string) => void;
  } = $props();
</script>

<section class="ag-group" style={group.color ? `--accent: ${group.color}` : ''}>
  <button
    type="button"
    class="ag-group-head"
    aria-expanded={groupOpen}
    onclick={() => onToggleGroup(group.key)}
  >
    {#if group.emoji}<span class="ag-group-emoji" aria-hidden="true">{group.emoji}</span>{/if}
    <span class="ag-group-label">{group.label_de}</span>
    <span class="ag-group-count">{group.entries.length}</span>
    <span class="ag-chevron" aria-hidden="true">{groupOpen ? '▾' : '▸'}</span>
  </button>

  {#if groupOpen}
    <div class="ag-group-cards">
      {#each group.entries as entry (entry.id)}
        <GuideCard
          {entry}
          open={expanded.has(entry.id)}
          {query}
          {copiedId}
          onToggle={onToggleCard}
          {onJump}
          {onCopy}
        />
      {/each}
    </div>
  {/if}
</section>
```

- [ ] **Step 2: Commit**

```bash
cd /tmp/wt-agent-guide-sidekick-ux
git add website/src/components/assistant/agent-guide/GuideGroup.svelte
git commit -m "feat(agent-guide): GuideGroup — collapsible group header"
```

---

## Task 9: `GuideFindBar.svelte` — tier rail + axis toggle + domain chips + search

**Files:**
- Create: `website/src/components/assistant/agent-guide/GuideFindBar.svelte`

- [ ] **Step 1: Create the component**

```svelte
<script lang="ts">
  import type { TierEntry, Theme } from '../../../lib/agentGuide';
  import type { Axis } from '../../../lib/agentGuideSearch';

  let {
    taxonomy,
    themes,
    tierCounts,
    query = '',
    axis = 'thema',
    tierFilter,
    domainFilter = null,
    resultCount = 0,
    searching = false,
    onQuery,
    onAxis,
    onToggleTier,
    onToggleDomain,
  }: {
    taxonomy: TierEntry[];
    themes: Theme[];
    tierCounts: Record<string, number>;
    query?: string;
    axis?: Axis;
    tierFilter: Set<string>;
    domainFilter?: string | null;
    resultCount?: number;
    searching?: boolean;
    onQuery: (v: string) => void;
    onAxis: (a: Axis) => void;
    onToggleTier: (id: string) => void;
    onToggleDomain: (id: string | null) => void;
  } = $props();

  const AXES: { id: Axis; label: string }[] = [
    { id: 'thema', label: 'Thema' },
    { id: 'gefahr', label: 'Gefahr' },
    { id: 'art', label: 'Art' },
  ];
</script>

<div class="ag-findbar">
  <!-- Tier-filter rail (the legend, now clickable) -->
  <ul class="ag-tier-rail" aria-label="Nach Gefahrenstufe filtern">
    {#each taxonomy as tier (tier.id)}
      <li>
        <button
          type="button"
          class="ag-tier-toggle"
          class:on={tierFilter.has(tier.id)}
          style="--tier: {tier.color}"
          aria-pressed={tierFilter.has(tier.id)}
          onclick={() => onToggleTier(tier.id)}
        >
          <span aria-hidden="true">{tier.emoji}</span>
          <span class="ag-tier-toggle-label">{tier.label_de}</span>
          <span class="ag-tier-toggle-count">{tierCounts[tier.id] ?? 0}</span>
        </button>
      </li>
    {/each}
  </ul>

  <!-- Grouping-axis toggle -->
  <div class="ag-axis" role="group" aria-label="Gruppierung wählen">
    {#each AXES as a (a.id)}
      <button type="button" class="ag-axis-btn" class:on={axis === a.id} aria-pressed={axis === a.id} onclick={() => onAxis(a.id)}>{a.label}</button>
    {/each}
  </div>

  <!-- Domain-chip index -->
  <div class="ag-chip-index" role="group" aria-label="Nach Thema springen">
    <button type="button" class="ag-index-chip" class:on={domainFilter === null} onclick={() => onToggleDomain(null)}>Alle</button>
    {#each themes as t (t.id)}
      <button type="button" class="ag-index-chip" class:on={domainFilter === t.id} style="--accent: {t.accent}" onclick={() => onToggleDomain(t.id)}>{t.emoji} {t.label_de}</button>
    {/each}
  </div>

  <!-- Search -->
  <div class="ag-search">
    <span class="ag-search-icon" aria-hidden="true">🔎</span>
    <label class="ag-sr" for="ag-search-input">Anleitung durchsuchen</label>
    <input
      id="ag-search-input"
      class="ag-search-input"
      type="search"
      placeholder="Suchen … (ab 3 Zeichen)"
      value={query}
      oninput={(e) => onQuery((e.currentTarget as HTMLInputElement).value)}
    />
  </div>
  <p class="ag-search-count" aria-live="polite">
    {#if searching}{resultCount} Treffer{/if}
  </p>
</div>
```

- [ ] **Step 2: Commit**

```bash
cd /tmp/wt-agent-guide-sidekick-ux
git add website/src/components/assistant/agent-guide/GuideFindBar.svelte
git commit -m "feat(agent-guide): GuideFindBar — tier rail, axis toggle, domain index, search"
```

---

## Task 10: `AgentGuideView.svelte` — orchestrator rewrite

**Files:**
- Modify: `website/src/components/assistant/AgentGuideView.svelte` (full rewrite; import path from `PortalSidekick.svelte` is unchanged)

Owns all state, derives groups, wires persistence, force-opens search matches, and renders: intro → find-bar → "Häufig" shelf (hidden while searching) → groups → Glossar → empty-state.

- [ ] **Step 1: Replace the component entirely**

```svelte
<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { goals, tools, taxonomy, themes, glossary, tierColor, tierEmoji } from '../../lib/agentGuide';
  import {
    buildEntries, filterEntries, groupBy, sortCommonFirst, normalize, MIN_QUERY,
    type Axis, type GuideEntry,
  } from '../../lib/agentGuideSearch';
  import GuideFindBar from './agent-guide/GuideFindBar.svelte';
  import GuideGroup from './agent-guide/GuideGroup.svelte';
  import GuideCard from './agent-guide/GuideCard.svelte';

  // ── Cross-link lookup: id → human label/kind/danger/domId ──────────────────
  const lookup: Record<string, { label: string; kind: string; danger: string; domId: string }> = {};
  for (const g of goals) lookup[g.id] = { label: g.title_de, kind: 'goal', danger: g.danger, domId: `ag-goal-${g.id}` };
  for (const t of tools) lookup[t.id] = { label: t.name_de, kind: 'tool', danger: t.danger, domId: `ag-tool-${t.id}` };

  // Entries (pure, computed once) — inject the related lookup so goal chips show names.
  const ALL: GuideEntry[] = buildEntries(goals, tools).map(e => ({ ...e, related: lookup }));

  // ── State ──────────────────────────────────────────────────────────────────
  let expanded = $state(new Set<string>());
  // Every group key across all three axes — so groups are OPEN by default on any axis
  // (cards collapsed, group structure visible). Keyed by theme id / tier id / art key.
  let groupsOpen = $state(new Set<string>([
    ...themes.map(t => t.id), ...taxonomy.map(t => t.id), 'ziel', 'skill', 'agent', 'task',
  ]));
  let hydrated = $state(false);
  let query = $state('');
  let axis = $state<Axis>('thema');
  let tierFilter = $state(new Set<string>());           // empty = all
  let domainFilter = $state<string | null>(null);       // null = all (theme-based)
  let copiedId = $state<string | null>(null);
  let glossaryOpen = $state(false);

  const OPEN_KEY = 'ag-open-v1';
  const AXIS_KEY = 'ag-axis-v1';
  const prefersReducedMotion = () =>
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── Rehydrate ONCE on mount (read BEFORE the persist effects can write) ───────
  onMount(() => {
    try {
      const rawOpen = localStorage.getItem(OPEN_KEY);
      if (rawOpen) expanded = new Set(JSON.parse(rawOpen) as string[]);
      const rawAxis = localStorage.getItem(AXIS_KEY);
      if (rawAxis === 'thema' || rawAxis === 'gefahr' || rawAxis === 'art') axis = rawAxis as Axis;
    } catch { /* ignore */ }
    hydrated = true;   // gate the persist effects so they never clobber saved state
  });

  // ── Persist (debounced) — only after hydration ───────────────────────────────
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    if (!hydrated) return;
    const snapshot = JSON.stringify([...expanded]);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(OPEN_KEY, snapshot); } catch { /* ignore */ }
    }, 250);
  });
  $effect(() => { if (hydrated) { try { localStorage.setItem(AXIS_KEY, axis); } catch { /* ignore */ } } });

  // ── Derivations ──────────────────────────────────────────────────────────────
  const searching = $derived(query.trim().length >= MIN_QUERY);

  // domain + tier pre-filter (applied before text search for tier counts)
  const preFiltered = $derived(
    ALL.filter(e =>
      (domainFilter === null || e.theme === domainFilter) &&
      (tierFilter.size === 0 || tierFilter.has(e.danger)),
    ),
  );
  const visible = $derived(filterEntries(preFiltered, query));
  const currentGroups = $derived(groupBy(visible, axis, themes, taxonomy));
  const shelfEntries = $derived(sortCommonFirst(preFiltered).filter(e => e.common));
  const resultCount = $derived(visible.length);

  // Glossar: its own disclosure, not folded into ALL. `glossaryShown` = manual state
  // OR a live search hit, so it auto-reveals on a matching query and is closable again
  // once the search clears.
  const glossaryHit = $derived(
    searching && glossary.some(g => normalize(`${g.term} ${g.def_de}`).includes(normalize(query.trim()))),
  );
  const glossaryShown = $derived(glossaryOpen || glossaryHit);

  // Tier counts over the domain + text filtered set (independent of the tier filter).
  const tierCounts = $derived.by(() => {
    const base = filterEntries(ALL.filter(e => domainFilter === null || e.theme === domainFilter), query);
    const counts: Record<string, number> = {};
    for (const t of taxonomy) counts[t.id] = 0;
    for (const e of base) counts[e.danger] = (counts[e.danger] ?? 0) + 1;
    return counts;
  });

  // When a search is active, force-open matched cards + their groups. Writes are
  // `untrack`ed and change-guarded so this effect can never re-trigger itself
  // (reading `expanded` tracked here would otherwise create an infinite loop).
  $effect(() => {
    if (!searching) return;
    const ids = visible.map(e => e.id);
    const keys = currentGroups.map(g => g.key);
    untrack(() => {
      let changed = false;
      const next = new Set(expanded);
      for (const id of ids) if (!next.has(id)) { next.add(id); changed = true; }
      if (changed) expanded = next;
      let gchanged = false;
      const g = new Set(groupsOpen);
      for (const k of keys) if (!g.has(k)) { g.add(k); gchanged = true; }
      if (gchanged) groupsOpen = g;
    });
  });

  // ── Handlers ─────────────────────────────────────────────────────────────────
  function toggleCard(id: string) {
    const next = new Set(expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    expanded = next;
  }
  function toggleGroup(key: string) {
    const next = new Set(groupsOpen);
    next.has(key) ? next.delete(key) : next.add(key);
    groupsOpen = next;
  }
  function expandAll() { expanded = new Set(ALL.map(e => e.id)); }
  function collapseAll() { expanded = new Set(); }

  async function copyPrompt(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      copiedId = id;
      setTimeout(() => { if (copiedId === id) copiedId = null; }, 1600);
    } catch { /* clipboard unavailable */ }
  }

  function jumpTo(domId: string) {
    const id = domId.replace(/^ag-(goal|tool)-/, '');
    const next = new Set(expanded);
    next.add(id);
    expanded = next;                       // open, don't land on a collapsed card
    requestAnimationFrame(() => {
      const el = document.getElementById(domId);
      if (!el) return;
      el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
      const head = el.querySelector<HTMLElement>('.ag-card-head');
      head?.focus();
      el.classList.add('ag-flash');
      setTimeout(() => el.classList.remove('ag-flash'), 900);
    });
  }
</script>

<div class="ag-body">
  <div class="ag-intro">
    <span class="ag-eyebrow"><span class="ag-eyebrow-bar" aria-hidden="true"></span>Agent-Anleitung</span>
    <h3 class="ag-title">Ich will … — welches Werkzeug nehme ich?</h3>
    <p class="ag-desc">Gruppiert nach Thema. Tippe ≥ 3 Zeichen zum Suchen. Die Farbe zeigt, wie vorsichtig Du sein musst.</p>
  </div>

  <GuideFindBar
    {taxonomy} {themes} {tierCounts} {query} {axis} {tierFilter} {domainFilter}
    {resultCount} {searching}
    onQuery={(v) => (query = v)}
    onAxis={(a) => (axis = a)}
    onToggleTier={(id) => { const n = new Set(tierFilter); n.has(id) ? n.delete(id) : n.add(id); tierFilter = n; }}
    onToggleDomain={(id) => (domainFilter = id)}
  />

  <div class="ag-controls">
    <button type="button" class="ag-control-btn" onclick={expandAll}>Alles ausklappen</button>
    <button type="button" class="ag-control-btn" onclick={collapseAll}>Alles einklappen</button>
  </div>

  {#if !searching && shelfEntries.length}
    <!-- Quick-access band: shortcut chips that jump+open the real in-group card.
         (Rendering full cards here would duplicate their DOM ids — breaking getElementById
         and `#id` selectors — so the shelf is chips, per spec §A "additional quick-access band".) -->
    <section class="ag-shelf" aria-label="Häufig gebraucht">
      <p class="ag-section-label">Häufig</p>
      <div class="ag-shelf-chips">
        {#each shelfEntries as entry (entry.id)}
          <button type="button" class="ag-shelf-chip" style="--tier: {tierColor(entry.danger)}" onclick={() => jumpTo(entry.domId)}>
            <span aria-hidden="true">{tierEmoji(entry.danger)}</span> {entry.title_de}
          </button>
        {/each}
      </div>
    </section>
  {/if}

  {#if resultCount === 0}
    <p class="ag-empty">Nichts gefunden. Versuch z. B. <button class="ag-related-chip" onclick={() => (query = 'passwort')}>passwort</button>, <button class="ag-related-chip" onclick={() => (query = 'deploy')}>deploy</button> oder <button class="ag-related-chip" onclick={() => (query = 'status')}>status</button>.</p>
  {:else}
    {#each currentGroups as group (group.key)}
      <GuideGroup
        {group}
        groupOpen={groupsOpen.has(group.key)}
        {expanded} {query} {copiedId}
        onToggleGroup={toggleGroup}
        onToggleCard={toggleCard}
        onJump={jumpTo}
        onCopy={copyPrompt}
      />
    {/each}
  {/if}

  <!-- Glossar -->
  {#if glossary.length}
    <section class="ag-glossary">
      <button type="button" class="ag-group-head" aria-expanded={glossaryShown} onclick={() => (glossaryOpen = !glossaryOpen)}>
        <span class="ag-group-emoji" aria-hidden="true">📖</span>
        <span class="ag-group-label">Begriffe kurz erklärt</span>
        <span class="ag-group-count">{glossary.length}</span>
        <span class="ag-chevron" aria-hidden="true">{glossaryShown ? '▾' : '▸'}</span>
      </button>
      {#if glossaryShown}
        <dl class="ag-glossary-list">
          {#each glossary as g (g.term)}
            <div class="ag-glossary-row"><dt>{g.term}</dt><dd>{g.def_de}</dd></div>
          {/each}
        </dl>
      {/if}
    </section>
  {/if}
</div>

<!--
  Styles for .ag-* live in src/styles/sidekick-panels.css (scoped under .drawer),
  NOT in a scoped <style> block here. Svelte 5 + Vite drop the scoped CSS of
  drawer sub-views that only mount after navigation (this view is one of them),
  so the production bundle shipped this component completely unstyled. The global
  sheet is loaded by every layout that mounts PortalSidekick.
-->
```

> **Glossary search (spec §F: "searchable through the same substring search"):** the Glossar group is its own disclosure, not folded into `ALL`. The `glossaryShown = glossaryOpen || glossaryHit` derived (already in the script above) auto-reveals the group whenever a glossary `term`/`def_de` matches the normalized query, and falls back to the user's manual `glossaryOpen` state once the search clears — so it is always closable. `normalize` is imported from `agentGuideSearch` in the import block above; **no `$effect` is used** (a `glossaryOpen = true` effect would never let the user close it).

- [ ] **Step 2: Commit**

```bash
cd /tmp/wt-agent-guide-sidekick-ux
git add website/src/components/assistant/AgentGuideView.svelte
git commit -m "feat(agent-guide): orchestrator — find-bar, shelf, groups, glossary, persistence"
```

---

## Task 11: CSS — new `.ag-*` rules + reduced-motion

**Files:**
- Modify: `website/src/styles/sidekick-panels.css`

Keep every existing `.ag-*` rule (intro, eyebrow, prompt, copy, chips, flow markers, related-chip — all still used). **Modify** the `.ag-card` / `.ag-card-head` / `.ag-name` rules for the new collapsible structure, and **append** the new rules before the closing `@media (max-width: 480px)` block.

- [ ] **Step 1: Replace the existing `.ag-card`, `.ag-card-head`, and `.ag-name` rules** (lines ~1565–1573). Find:

```css
.drawer .ag-cards { display: flex; flex-direction: column; gap: 10px; margin: 0 22px 18px; }
.drawer .ag-card {
  border: 1px solid var(--line);
  border-radius: var(--radius-md, 12px);
  background: var(--ink-800);
  padding: 14px 16px;
}
.drawer .ag-card-head { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.drawer .ag-name { font-family: var(--serif); font-size: 16px; color: var(--fg); flex: 1 1 auto; }
```

Replace with:

```css
.drawer .ag-cards { display: flex; flex-direction: column; gap: 10px; margin: 0 22px 18px; }
.drawer .ag-card {
  border: 1px solid var(--line);
  border-left: 3px solid var(--tier, var(--line));
  border-radius: var(--radius-md, 12px);
  background: var(--ink-800);
  overflow: hidden;
}
.drawer .ag-card-head {
  display: flex; align-items: center; gap: 8px;
  width: 100%; padding: 11px 14px;
  background: transparent; border: 0; cursor: pointer; text-align: left;
  font: inherit; color: inherit; min-height: 44px;
}
.drawer .ag-card-head:hover { background: oklch(1 0 0 / 0.02); }
.drawer .ag-card-head:focus-visible { outline: 2px solid var(--brass); outline-offset: -2px; }
.drawer .ag-dot { font-size: 12px; flex-shrink: 0; }
.drawer .ag-name { font-family: var(--serif); font-size: 15px; color: var(--fg); flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.drawer .ag-card-open .ag-name { white-space: normal; }
.drawer .ag-meta { font-family: var(--mono); font-size: 10px; color: var(--mute); white-space: nowrap; flex-shrink: 0; }
.drawer .ag-chevron { font-size: 10px; color: var(--mute); flex-shrink: 0; }
.drawer .ag-sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
```

- [ ] **Step 2: Append the new block** immediately before the final `@media (max-width: 480px) {` rule (~line 1680):

```css
/* ── Collapsible card body (grid-rows 0fr→1fr animation) ───────────────────── */
.drawer .ag-card-body {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 220ms ease;
}
.drawer .ag-card-body[data-open="true"] { grid-template-rows: 1fr; }
.drawer .ag-card-body-inner { overflow: hidden; min-height: 0; padding: 0 14px; }
.drawer .ag-card-body[data-open="true"] .ag-card-body-inner { padding: 0 14px 14px; }
.drawer .ag-bodytext { font-size: 13px; color: var(--fg-soft); margin: 4px 0; line-height: 1.5; }
.drawer .ag-flash { box-shadow: 0 0 0 2px var(--brass); transition: box-shadow 120ms ease; }

/* Flow-step jump buttons */
.drawer .ag-flow-jump {
  font: inherit; font-weight: 600; color: var(--brass);
  background: transparent; border: 0; padding: 0; cursor: pointer; text-decoration: underline dotted;
}
.drawer .ag-flow-jump:hover { color: var(--fg); }

/* Search highlight — neutral brass, never a tier hue */
.drawer .ag-hl { background: oklch(0.80 0.09 75 / 0.30); color: var(--fg); border-radius: 3px; padding: 0 1px; }

/* Red-stop panel (forbidden) */
.drawer .ag-card-forbidden { border-left-color: var(--tier); }
.drawer .ag-redstop {
  border: 1px solid color-mix(in srgb, var(--tier) 50%, transparent);
  background: color-mix(in srgb, var(--tier) 12%, transparent);
  border-radius: 10px; padding: 10px 12px; margin-top: 12px;
}
.drawer .ag-redstop-stop { font-weight: 700; color: var(--fg); margin: 0 0 4px; font-size: 14px; }
.drawer .ag-redstop-why { font-size: 13px; color: var(--fg-soft); margin: 0 0 6px; line-height: 1.5; }
.drawer .ag-redstop-who { font-size: 13px; color: var(--fg); margin: 0; }

/* "Mehr dazu" link row */
.drawer .ag-morelinks { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 12px; }
.drawer .ag-morelink { font-family: var(--mono); font-size: 11px; color: var(--brass); text-decoration: none; border-bottom: 1px solid transparent; }
.drawer .ag-morelink:hover { border-bottom-color: var(--brass); }

/* ── Find-bar (sticky) ─────────────────────────────────────────────────────── */
.drawer .ag-findbar {
  position: sticky; top: 0; z-index: 3;
  margin: 14px 22px 0; padding: 12px;
  background: var(--ink-850); border: 1px solid var(--line); border-radius: 12px;
  display: flex; flex-direction: column; gap: 10px;
}
.drawer .ag-tier-rail { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.drawer .ag-tier-toggle {
  display: inline-flex; align-items: center; gap: 5px;
  font-family: var(--mono); font-size: 10.5px; color: var(--tier);
  background: transparent; border: 1px solid color-mix(in srgb, var(--tier) 55%, transparent);
  border-radius: 999px; padding: 3px 8px; cursor: pointer; min-height: 28px;
}
.drawer .ag-tier-toggle.on { background: color-mix(in srgb, var(--tier) 18%, transparent); color: var(--fg); }
.drawer .ag-tier-toggle-count { opacity: 0.7; }
.drawer .ag-axis { display: inline-flex; background: var(--ink-800); border: 1px solid var(--line); border-radius: 999px; padding: 2px; align-self: flex-start; }
.drawer .ag-axis-btn {
  font-family: var(--mono); font-size: 11px; color: var(--fg-soft);
  background: transparent; border: 0; border-radius: 999px; padding: 4px 12px; cursor: pointer; min-height: 30px;
}
.drawer .ag-axis-btn.on { background: var(--brass); color: var(--ink-900, #0f1623); }
.drawer .ag-chip-index { display: flex; flex-wrap: wrap; gap: 5px; }
.drawer .ag-index-chip {
  font-family: var(--mono); font-size: 10.5px; color: var(--fg-soft);
  background: transparent; border: 1px solid var(--line-2); border-radius: 999px;
  padding: 3px 9px; cursor: pointer; min-height: 28px;
}
.drawer .ag-index-chip.on { border-color: var(--accent, var(--brass)); color: var(--fg); background: color-mix(in srgb, var(--accent, var(--brass)) 16%, transparent); }
.drawer .ag-search { display: flex; align-items: center; gap: 8px; border: 1px solid var(--line-2); border-radius: 8px; padding: 6px 10px; background: var(--ink-800); }
.drawer .ag-search-icon { opacity: 0.7; }
.drawer .ag-search-input { flex: 1 1 auto; background: transparent; border: 0; color: var(--fg); font-family: var(--sans, inherit); font-size: 13px; outline: none; }
.drawer .ag-search-count { font-family: var(--mono); font-size: 11px; color: var(--mute); margin: 0; min-height: 14px; }

.drawer .ag-controls { display: flex; gap: 8px; margin: 12px 22px 0; }
.drawer .ag-control-btn { font-family: var(--mono); font-size: 11px; color: var(--fg-soft); background: transparent; border: 1px solid var(--line-2); border-radius: 999px; padding: 4px 10px; cursor: pointer; }
.drawer .ag-control-btn:hover { border-color: var(--brass); color: var(--fg); }

/* ── Groups ────────────────────────────────────────────────────────────────── */
.drawer .ag-group { margin: 14px 22px 0; }
.drawer .ag-shelf { margin-top: 14px; }
.drawer .ag-shelf-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 0; }
.drawer .ag-shelf-chip {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 12px; color: var(--fg); cursor: pointer; text-align: left;
  background: var(--ink-800); border: 1px solid var(--line);
  border-left: 3px solid var(--tier, var(--line)); border-radius: 8px;
  padding: 6px 10px; min-height: 34px;
}
.drawer .ag-shelf-chip:hover { border-color: var(--brass); }
.drawer .ag-group-head {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 9px 10px; min-height: 44px;
  background: color-mix(in srgb, var(--accent, var(--line)) 12%, transparent);
  border: 0; border-left: 4px solid var(--accent, var(--line)); border-radius: 8px;
  cursor: pointer; text-align: left; font: inherit; color: var(--fg);
}
.drawer .ag-group-head:focus-visible { outline: 2px solid var(--brass); outline-offset: -2px; }
.drawer .ag-group-emoji { font-size: 13px; }
.drawer .ag-group-label { flex: 1 1 auto; font-family: var(--serif); font-size: 15px; }
.drawer .ag-group-count { font-family: var(--mono); font-size: 11px; color: var(--mute); }
.drawer .ag-group-cards { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }

/* ── Empty state ───────────────────────────────────────────────────────────── */
.drawer .ag-empty { margin: 18px 22px; font-size: 13px; color: var(--fg-soft); line-height: 1.7; }

/* ── Glossar ───────────────────────────────────────────────────────────────── */
.drawer .ag-glossary { margin: 18px 22px 0; }
.drawer .ag-glossary-list { margin: 8px 0 0; padding: 0; }
.drawer .ag-glossary-row { display: grid; grid-template-columns: minmax(70px, auto) 1fr; gap: 10px; padding: 6px 0; border-top: 1px solid var(--line); }
.drawer .ag-glossary-row dt { font-family: var(--mono); font-size: 12px; color: var(--brass); }
.drawer .ag-glossary-row dd { margin: 0; font-size: 13px; color: var(--fg-soft); line-height: 1.5; }

/* ── Reduced motion ────────────────────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .drawer .ag-card-body { transition: none; }
  .drawer .ag-flash { transition: none; }
}
```

- [ ] **Step 2b: Extend the small-screen block.** In the final `@media (max-width: 480px)` rule, add `.ag-findbar`, `.ag-group`, `.ag-glossary`, `.ag-controls`, and `.ag-empty` to the margin-inline override so they line up at 18px:

```css
@media (max-width: 480px) {
  .drawer .ag-intro { padding-inline: 18px; }
  .drawer .ag-cards,
  .drawer .ag-legend,
  .drawer .ag-findbar,
  .drawer .ag-group,
  .drawer .ag-glossary,
  .drawer .ag-controls,
  .drawer .ag-empty,
  .drawer .ag-section-label { margin-inline: 18px; }
}
```

- [ ] **Step 3: Commit**

```bash
cd /tmp/wt-agent-guide-sidekick-ux
git add website/src/styles/sidekick-panels.css
git commit -m "feat(agent-guide): drawer CSS — collapsible cards, find-bar, groups, red-stop, glossary"
```

---

## Task 12: E2E — extend the walkthrough for the new UI

**Files:**
- Modify: `tests/e2e/lib/agent-guide.ts`
- Modify: `tests/e2e/specs/agent-guide-walkthrough.spec.ts`

The old spec asserts a flat two-section layout that no longer exists. Rewrite it for: collapsed-by-default → expand → search → axis toggle → tier filter → red-stop → cross-link. Keep the dual-mode (CI vs `AG_FILM`) structure.

- [ ] **Step 1: Extend the E2E data lib.** Edit `tests/e2e/lib/agent-guide.ts`:

(a) Extend the `Goal` and `Tool` interfaces to mirror Task 4 (add `theme`, `one_liner_de` on Goal; `theme`, `aliases_de`, `common`, `order` on both; change `links` to `{ label_de: string; url: string }[]`). Add:

```ts
export interface Theme { id: string; label_de: string; emoji: string; order: number; accent: string; blurb_de: string; }
export interface GlossaryEntry { term: string; def_de: string; }
```

(b) Add to `Goal`: `one_liner_de: string; theme: string; aliases_de: string[]; common: boolean; order: number; escalate_to_de?: string;` and change `links` to `{ label_de: string; url: string }[]`. Add the same `theme/aliases_de/common/order` to `Tool` and change its `links` type too.

(c) Extend `GuideData` + `loadGuideData`:

```ts
export interface GuideData {
  goals: Goal[];
  tools: Tool[];
  taxonomy: TierEntry[];
  themes: Theme[];
  glossary: GlossaryEntry[];
}

export function loadGuideData(): GuideData {
  const jsonPath = path.join(__dirname, '../../../website/src/lib/agent-guide.generated.json');
  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  return {
    goals: raw.goals as Goal[],
    tools: raw.tools as Tool[],
    taxonomy: raw.taxonomy as TierEntry[],
    themes: raw.themes as Theme[],
    glossary: raw.glossary as GlossaryEntry[],
  };
}
```

(d) `openAgentGuide` stays as-is (selectors `.fab`, `.sk-home`, `button.sk-row` "Agent-Anleitung", `.ag-body` are unchanged). Add one helper to expand a card by title:

```ts
/** Clicks a collapsed card's header (by visible title) to expand it; returns the card locator. */
export async function expandCardByTitle(page: Page, title: string) {
  const card = page.locator('.ag-card').filter({ has: page.locator('.ag-name', { hasText: title }) }).first();
  await card.locator('.ag-card-head').click();
  await expect(card.locator('.ag-card-head')).toHaveAttribute('aria-expanded', 'true');
  return card;
}
```

- [ ] **Step 2: Rewrite the spec.** Replace `tests/e2e/specs/agent-guide-walkthrough.spec.ts` with:

```ts
/**
 * Agent-Anleitung E2E — dual-mode spec (grouped/collapsible/searchable UI).
 * CI mode (default): headless assertions.  Film mode (AG_FILM=1): headed walkthrough.
 * No login required — PortalSidekick is on the public Layout.astro.
 */
import { test, expect } from '@playwright/test';
import { openAgentGuide, expandCardByTitle, loadGuideData, showFilmBanner, removeFilmBanner } from '../lib/agent-guide';

const FILM = !!process.env.AG_FILM;
const FILM_PAUSE = 1500;
const { goals, tools, taxonomy, themes, glossary } = loadGuideData();

test('öffnet die Agent-Anleitung und zeigt den Titel', async ({ page }) => {
  await openAgentGuide(page);
  await expect(page.locator('.sk-title')).toContainText('Agent-Anleitung');
});

test('zeigt alle 7 Themen-Gruppen, Karten standardmäßig eingeklappt', async ({ page }) => {
  await openAgentGuide(page);
  await expect(page.locator('.ag-group')).toHaveCount(themes.length);
  // Exactly one card head per goal + tool (the Häufig shelf renders chips, not cards).
  const heads = page.locator('.ag-card-head');
  await expect(heads).toHaveCount(goals.length + tools.length);
  for (let i = 0; i < 5; i++) {
    await expect(heads.nth(i)).toHaveAttribute('aria-expanded', 'false');
  }
});

test('eine Karte lässt sich aus- und wieder einklappen', async ({ page }) => {
  await openAgentGuide(page);
  const card = await expandCardByTitle(page, goals[0].title_de);
  await expect(card.locator('.ag-prompt-text')).toBeVisible();
  await card.locator('.ag-card-head').click();
  await expect(card.locator('.ag-card-head')).toHaveAttribute('aria-expanded', 'false');
});

test('Suche ab 3 Zeichen filtert, öffnet Treffer und zeigt einen Zähler', async ({ page }) => {
  await openAgentGuide(page);
  const input = page.locator('.ag-search-input');
  await input.fill('daten');
  // Datenbank cards visible, count shown
  await expect(page.locator('.ag-search-count')).toContainText('Treffer');
  await expect(page.locator('.ag-card').filter({ has: page.locator('.ag-name', { hasText: 'Datenbank' }) }).first()).toBeVisible();
  await expect(page.locator('.ag-hl').first()).toBeVisible();   // highlight present
});

test('Umlaut-Suche: "aendern" findet die Website-Text-Karte', async ({ page }) => {
  await openAgentGuide(page);
  await page.locator('.ag-search-input').fill('aendern');
  await expect(page.locator('.ag-name', { hasText: 'ändern' }).first()).toBeVisible();
});

test('Alias-Suche: "passwort" findet die Sicherheits-Karte', async ({ page }) => {
  await openAgentGuide(page);
  await page.locator('.ag-search-input').fill('passwort');
  await expect(page.locator('.ag-name', { hasText: 'Passwort' }).first()).toBeVisible();
});

test('Achsen-Umschalter auf "Gefahr" zeigt Tier-Gruppen', async ({ page }) => {
  await openAgentGuide(page);
  await page.locator('.ag-axis-btn', { hasText: 'Gefahr' }).click();
  // group headers now carry tier labels
  await expect(page.locator('.ag-group-label', { hasText: 'Niemals allein' })).toBeVisible();
});

test('Tier-Filter auf 🔴 zeigt nur Forbidden-Karten', async ({ page }) => {
  await openAgentGuide(page);
  const forbiddenTier = taxonomy.find(t => t.id === 'forbidden')!;
  await page.locator('.ag-tier-toggle', { hasText: forbiddenTier.label_de }).click();
  // Expand the first forbidden goal and assert the red-stop panel
  const forbiddenGoal = goals.find(g => g.danger === 'forbidden')!;
  const card = await expandCardByTitle(page, forbiddenGoal.title_de);
  await expect(card.locator('.ag-redstop')).toBeVisible();
  await expect(card.locator('.ag-redstop-who')).toContainText('Patrick');
  await expect(card.locator('.ag-copy')).toContainText('Rücksprache');
});

test('Cross-Link: Flow-Schritt springt zur Werkzeug-Karte und öffnet sie', async ({ page }) => {
  await openAgentGuide(page);
  // bug-beheben → first flow step is dev-flow-plan
  const goal = goals.find(g => g.id === 'bug-beheben')!;
  const card = await expandCardByTitle(page, goal.title_de);
  await card.locator('.ag-flow-jump').first().click();
  const target = page.locator('#ag-tool-' + goal.flow[0].tool);
  await expect(target).toBeInViewport({ timeout: 3_000 });
  await expect(target.locator('.ag-card-head')).toHaveAttribute('aria-expanded', 'true');
});

test('Glossar lässt sich öffnen und ist durchsuchbar', async ({ page }) => {
  await openAgentGuide(page);
  await page.locator('.ag-group-head', { hasText: 'Begriffe kurz erklärt' }).click();
  await expect(page.locator('.ag-glossary-row').first()).toBeVisible();
  await expect(page.locator('.ag-glossary-row')).toHaveCount(glossary.length);
});

test('Prompt-Kopieren-Button wechselt zu "Kopiert ✓"', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openAgentGuide(page);
  const card = await expandCardByTitle(page, goals[0].title_de);
  const copyBtn = card.locator('.ag-copy');
  await copyBtn.click();
  await expect(copyBtn).toHaveText('Kopiert ✓', { timeout: 2_000 });
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(goals[0].example_prompt_de);
});

if (FILM) {
  test('Filmable Walkthrough — gruppiert, suchen, Stopp-Karte', async ({ page }) => {
    await openAgentGuide(page);
    await showFilmBanner(page, 'Agent-Anleitung — 7 Themengruppen');
    await page.waitForTimeout(FILM_PAUSE);

    await showFilmBanner(page, 'Eine Karte ausklappen');
    await expandCardByTitle(page, goals[0].title_de);
    await page.waitForTimeout(FILM_PAUSE);

    await showFilmBanner(page, 'Suchen: „daten"');
    await page.locator('.ag-search-input').fill('daten');
    await page.waitForTimeout(FILM_PAUSE);
    await page.locator('.ag-search-input').fill('');

    await showFilmBanner(page, 'Umschalten auf „Gefahr"');
    await page.locator('.ag-axis-btn', { hasText: 'Gefahr' }).click();
    await page.waitForTimeout(FILM_PAUSE);

    await showFilmBanner(page, 'Rote Stopp-Karte');
    const forbiddenGoal = goals.find(g => g.danger === 'forbidden')!;
    const card = await expandCardByTitle(page, forbiddenGoal.title_de);
    await card.locator('.ag-redstop').scrollIntoViewIfNeeded();
    await page.waitForTimeout(FILM_PAUSE);
    await removeFilmBanner(page);
  });
}
```

- [ ] **Step 3: Run the spec against a local dev server** (CI mode). In one terminal start the Astro dev server (SSR-safe, serves :4321); in another, once :4321 responds, run the spec:

```bash
# terminal A
cd /tmp/wt-agent-guide-sidekick-ux/website && npm run dev
# terminal B
cd /tmp/wt-agent-guide-sidekick-ux/tests/e2e && npm ci >/dev/null 2>&1; \
  ./node_modules/.bin/playwright install chromium >/dev/null 2>&1 || true; \
  WEBSITE_URL=http://localhost:4321 ./node_modules/.bin/playwright test --config playwright.local.config.ts agent-guide-walkthrough
```
Expected: all `agent-guide-walkthrough` tests PASS. First open `tests/e2e/playwright.local.config.ts` and confirm `use.baseURL` reads `WEBSITE_URL`; if it expects a different env var, pass that instead. (`npm run dev` is used over `build && preview` because the site is SSR — `astro preview` may not serve the API routes.)

- [ ] **Step 4: Commit**

```bash
cd /tmp/wt-agent-guide-sidekick-ux
git add tests/e2e/lib/agent-guide.ts tests/e2e/specs/agent-guide-walkthrough.spec.ts
git commit -m "test(agent-guide): E2E walkthrough for grouped/collapsible/searchable UI"
```

---

## Task 13: Full verification + final artifact freshness

**Files:** none new — runs the whole gate.

- [ ] **Step 1: Regenerate + confirm the committed JSON is fresh**

Run: `cd /tmp/wt-agent-guide-sidekick-ux && task agent-guide:emit && git diff --exit-code website/src/lib/agent-guide.generated.json && echo "JSON FRESH ✓"`
Expected: `JSON FRESH ✓`. If `emit-maps`/`emit-docs` produced changes (because the new registry fields flow into maps/docs too), review and `git add docs/agent-guide/ && git commit -m "docs(agent-guide): regenerate maps/docs from extended registry"`.

- [ ] **Step 2: Run the agent-guide registry gate**

Run: `cd /tmp/wt-agent-guide-sidekick-ux && task test:agent-guide`
Expected: all `node:test` suites pass; `validate.mjs` prints `✓ agent-guide registry valid`; both freshness guards pass.

- [ ] **Step 3: Run the website unit tests**

Run: `cd /tmp/wt-agent-guide-sidekick-ux/website && npm run test:unit`
Expected: PASS — including `agentGuide.test.ts` and `agentGuideSearch.test.ts`.

- [ ] **Step 4: Type-check the new components** (best-effort; the authoritative gate is the build in Step 5)

Run: `cd /tmp/wt-agent-guide-sidekick-ux/website && npx astro check 2>&1 | tail -20 || npx svelte-check --threshold error 2>&1 | tail -20 || true`
Expected: no errors referencing `AgentGuideView.svelte` / `agent-guide/*.svelte` (usually a prop type or a missing import). If neither checker is installed in this project, skip — Step 5's build compiles every Svelte component and fails on a fatal error.

- [ ] **Step 5: Production build (proves CSS ships + components compile)**

Run: `cd /tmp/wt-agent-guide-sidekick-ux/website && npm run build`
Expected: build succeeds. Then confirm the new CSS is in the built bundle:
```bash
cd /tmp/wt-agent-guide-sidekick-ux/website && grep -rl 'ag-findbar' dist/ | head -1 && echo "CSS SHIPPED ✓"
```
Expected: a `dist/**/*.css` path + `CSS SHIPPED ✓`. (This is the exact regression PR #1263 fixed — the global-sheet convention must keep the styles in the prod bundle.)

- [ ] **Step 6: Run the offline test umbrella** (mirrors CI)

Run: `cd /tmp/wt-agent-guide-sidekick-ux && task test:all`
Expected: green. If `test:unit` here runs the website Vitest suite, it includes the two new test files.

- [ ] **Step 7: Run the E2E walkthrough once more** (per Task 12 Step 3) to confirm the final state, both CI mode and a quick `AG_FILM=1` smoke:

```bash
cd /tmp/wt-agent-guide-sidekick-ux && task test:e2e:agent-guide:film WEBSITE_URL=http://localhost:4321
```
Expected: the film test passes and a video is written under `tests/e2e/test-results/**/video.webm`. (Requires the preview server from Task 12 Step 3 running.)

- [ ] **Step 8: Final commit (if Step 1 produced map/doc regen) + push**

```bash
cd /tmp/wt-agent-guide-sidekick-ux
git status
git push -u origin feature/agent-guide-sidekick-ux
```

---

## Acceptance criteria → task mapping (self-check)

| Spec §9 criterion | Implemented by |
|---|---|
| 1. 7 theme groups, all cards collapsed to one line, tier dot + left-border | Tasks 1, 6 (`groupBy`), 7 (`.ag-card` collapsed), 10, 11 |
| 2. Click expands inline; multi-open; "Alles einklappen"; survives reopen | Task 10 (`expanded` Set, `expandAll`/`collapseAll`, localStorage `ag-open-v1`) |
| 3. ≥3-char filter, force-open + highlight + live count; "aendern"→"ändern"; "passwort"→Security | Tasks 6 (`normalize`/`filterEntries`/`highlight`), 10 (force-open effect, count) |
| 4. Domain chips + tier rail + axis toggle compose with search | Tasks 9, 10 (`preFiltered`/`visible`/`tierCounts`) |
| 5. 🔴 card → red-stop panel + "wen fragen" + relabeled copy | Tasks 2 (`escalate_to_de` default), 7 (red-stop block), 11 (CSS) |
| 6. Related chips human names + jump-open; flow steps jump; "Mehr dazu" resolve | Tasks 7 (chips/flow/links), 10 (`lookup`, `jumpTo`) |
| 7. Glossar renders + searchable | Tasks 1, 2 (`glossary[]`), 10 (Glossar section + `glossaryHit`) |
| 8. Vitest + emitter + Playwright pass; CI green; generated JSON committed | Tasks 5 (freshness guard), 13 (full gate) |

## Notes for the executor
- **No scoped `<style>` blocks** in any drawer sub-view — every rule lives in `sidekick-panels.css` under `.drawer .ag-*`. Task 13 Step 5 fails if styles don't ship.
- **`ENV=` is irrelevant here** — this is website-only; no deploy in this plan. Deployment to prod happens on merge via `build-website.yml` (auto build+rollout on `website/**` push to main).
- **Commit the regenerated `agent-guide.generated.json`** — CI now fails if it's stale (Task 5 guard).
- If `svelte-check` (Task 13 Step 4) flags `$derived.by` or `Set` reactivity issues, the fix is to always reassign Sets (`expanded = next`) rather than mutate in place — the code above already does this; preserve that pattern.
