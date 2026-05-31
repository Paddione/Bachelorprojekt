# Design Spec — AI-Agent Guide: In-App Help Surface (S2)

**Date:** 2026-05-31
**Branch:** feature/agent-guide-help
**Status:** approved design (brainstorming complete), spec for review
**Program:** AI-Agent Operating Guide & Guardrails, sub-project S2 (in-app help surface), one of six.

---

## 1. Problem & Motivation

The repo now has a single source of truth (SSOT) for "how do I operate this platform safely" — the YAML registry under `docs/agent-guide/registry/` produced by sub-project F+B (`taxonomy`, `guardrails`, `tools`, `goals`, `components`). That registry is currently only consumable by build-time scripts. Nothing in the running **website app** exposes it to the human operator.

Two concrete gaps exist in the live app today:

1. **No goal/tool catalog anywhere in the app.** The Sidekick assistant drawer (`website/src/components/PortalSidekick.svelte`) has views for Anfragen (tickets), Postfach (inbox), Fragebögen, Feedback & Support, and page-context Hilfe (the `View` union at `PortalSidekick.svelte:11`) — but no surface that answers "Ich will X — welches Werkzeug nehme ich, und was kann schiefgehen?". The operator has to leave the app and read `CLAUDE.md`.

2. **The platform hub help drawer is blank.** `/admin/platform` renders `PlatformHub.svelte` inside `AdminLayout.astro`. The layout derives `helpSection` from the path: `adminSection('/admin/platform')` returns `'platform'` (verified — `AdminLayout.astro:33-40`), and passes `helpSection="platform"` + `helpContext="admin"` to the Sidekick (`AdminLayout.astro:333`). But **`helpContent.admin` has no `platform` key** (verified — `helpContent.ts:225` opens `admin:` with keys `dashboard`, `bugs`, `meetings`, `termine`, `clients`, `projekte`, `tickets`, … but no `platform`; a grep for `platform` over the file returns zero matches). So `HelpView.svelte` falls through to its empty state: *"Für diesen Bereich ist noch keine Hilfe verfügbar."* (`HelpView.svelte:59`). The wiring is already in place; only the content is missing.

S2 closes both gaps by rendering the F+B registry inside the app — without re-authoring any German text that already lives in the registry.

## 2. Audience persona

ONE inexperienced solo operator, German-speaking, working *inside* the repo via Claude Code but also operating the live platform through the website's admin/portal UI. Knows *what* they want ("change the website text", "fix this bug", "what is this Keycloak thing?") but not *how* the tooling works. Needs guardrails so they "can't do anything wrong." All operator-facing text is German, Du-form, friendly; every technical term explained in parentheses on first use. For S2 specifically, this operator is in a browser — they will not run a CLI to "find" help; the help must surface itself where they already are (the Sidekick FAB, and the page they are looking at).

## 3. Goals / Non-goals

### Goals
- **G1 — Agent-Anleitung view (Sidekick-wide).** A new standalone Sidekick view `AgentGuideView.svelte` renders the "Ich will …" goal catalog and the tool/agent cards, each with a danger-tier badge (color + emoji + German label from `taxonomy.yaml`). Reachable everywhere the Sidekick FAB renders via a new menu item in `SidekickHome.svelte` (see §4 for the precise reach — the FAB itself mounts unconditionally in all three layouts).
- **G2 — Platform-hub help.** Add a `platform` entry to the `admin` context of `helpContent.ts`, derived from the registry's component summaries, so the currently-blank `/admin/platform` drawer fills in. Includes a short hand-authored intro and a control that opens the Agent-Anleitung view.
- **G3 — Registry stays SSOT.** Both surfaces render from one generated artifact (`agent-guide.generated.json`); no German prose is duplicated by hand except a single short intro sentence for the platform section.
- **G4 — CI freshness gate.** A `git diff --exit-code` gate on the committed generated JSON, mirroring the existing `test-inventory.json` gate.

### Non-goals (explicit deferrals)
- **No DB writes.** S2 is pure in-app render data. It does **not** touch the `platform.software_assets` hub `description` column — that is F+B's `gen-platform-descriptions.mjs` / `platform-descriptions.generated.json` DB-seed path (see §6.3). The two artifacts stay separate.
- **No HTML docs surface** (`docs.<domain>`) — that is **S1**.
- **No terse LLM-routing Markdown tables** linked from `CLAUDE.md` — that is **S3**.
- **No enforcement hooks.** Danger tiers are *displayed* here; runtime enforcement is sub-project E (out of scope, downstream consumer of the taxonomy only).
- **No new API routes / no server roundtrip.** The generated JSON is imported at build time exactly like other static data; `AgentGuideView` and the `platform` help section are statically rendered from it. No `/api/...` endpoint is added.
- **No per-page context-keying of the Agent-Anleitung view.** Unlike `HelpView` (keyed on `helpContent[context][section]`), `AgentGuideView` is one global catalog reachable from anywhere the Sidekick FAB renders. The *platform* helpContent entry **is** page-context-keyed (`helpSection === 'platform'`, `helpContext === 'admin'`).
- **No change to the `AssistantWidget` env gating.** Whether the separate `AssistantWidget` is enabled (`ENABLE_ASSISTANT_ADMIN` / `ENABLE_ASSISTANT_PORTAL`) is out of scope; S2 only adds an item to the always-mounted `PortalSidekick` (see §4 / §7.5).

## 4. Architecture

```
docs/agent-guide/registry/*.yaml   ← SSOT (F+B)
            │
   scripts/agent-guide/load.mjs     ← shared reader  (PREREQUISITE: introduced by S1)
   loadRegistry(dir) → {goals, tools, components, taxonomy, guardrails}
   helpers: tierFor(id), toolById(id), guardrailById(id)
            │
   scripts/agent-guide/emit-webapp.mjs   ← S2 emitter (this spec)
   • runs F+B validateRegistry() first (fail-closed)
   • projects only the fields the UI needs
            │
            ▼
website/src/lib/agent-guide.generated.json   ← committed artifact (the contract)
            │
   imported at build time (resolveJsonModule via astro/tsconfigs/strict)
            ├──────────────────────────────┐
            ▼                               ▼
website/src/lib/agentGuide.ts          website/src/lib/helpContent.ts
(thin typed re-export + helpers)       (new `platform` section in `admin`)
            │                               │
            ▼                               ▼
AgentGuideView.svelte                  HelpView.svelte (unchanged)
(new Sidekick view)                    renders helpContent.admin.platform
            │                               │
            └──────────► SidekickHome.svelte ◄──────────┘
                         (new menu item → 'agent-guide')
                         PortalSidekick.svelte (new view branch)
```

Both consumers read **one** generated file. The emitter never reads the website code; the website never reads YAML. The single parse path is `load.mjs` (S1), so taxonomy/tool/goal IDs resolve identically across S1/S2/S3.

**Reachability of the Agent-Anleitung item (verified, important nuance).** The `PortalSidekick` FAB+drawer is mounted **unconditionally** in all three layouts: `Layout.astro:87` (base — no `helpSection`/`helpContext`, so `helpContext` defaults to `'portal'`), `PortalLayout.astro:284`, and `AdminLayout.astro:333`. In the two app-shell layouts the `ENABLE_ASSISTANT_ADMIN` / `ENABLE_ASSISTANT_PORTAL` env flags (default `'false'`, read at `AdminLayout.astro:8` / `PortalLayout.astro:10`) gate **only the separate `AssistantWidget` component** (`AdminLayout.astro:329-331`, `PortalLayout.astro:280-282`) — **not** `PortalSidekick`, which renders outside that ternary. Therefore the new always-shown `agent-guide` menu item appears wherever a `PortalSidekick` mounts, i.e. effectively app-wide, independent of those flags. We say "Sidekick-wide" rather than "app-wide" only to be precise that it lives in the Sidekick drawer (the operator opens the FAB first); no env flag is a prerequisite for it.

## 5. Information architecture / what gets rendered

### 5.1 Agent-Anleitung view (`AgentGuideView.svelte`)
Reuses `HelpView.svelte`'s **design tokens and structural idioms** — the same eyebrow/intro header, the scrollable body, `<details>` accordions, brass accents (`--brass` / `--serif` / `--mono` from the Sidekick panel CSS), and the `#0f1623` drawer background. It is **not** a near-copy: `HelpView` has no danger badges, no copy-to-clipboard, no legend, and no cross-link scrolling, so this view introduces new card/badge/legend/clipboard markup on top of the shared visual language. Two sections:

**A. "Ich will …" — Ziele (goals).** A card per `goals[]` entry, in registry order:
- Title (`title_de`, the verbatim "Ich will …" line).
- `when_de` as a one-line subtitle ("Wann brauche ich das?").
- A danger-tier badge (emoji + `label_de`, colored per tier — see §6.4).
- The ordered `flow` rendered as a numbered list, each step showing the tool's `name_de` (pre-resolved at emit time, see §6.2) + the step `note_de`.
- A copy-to-clipboard control on `example_prompt_de` ("Diesen Prompt kopieren") — the verbatim text the operator pastes to the agent.
- Guardrail chips: each `guardrails[]` entry shown as a small pill labelled `name_de`; tapping a chip expands its `rule_de`/`why_de` rationale (both carried in the emitted shape — see §6.2).

**B. Werkzeuge & Agenten (tools).** A card per `tools[]` entry:
- `name_de` + a `kind` badge (`skill` / `agent` / `task` → German label, pre-resolved to `kind_de`).
- `summary_de` (one line) and `what_for_de` (inside an expandable `<details>`, like the HelpView guide accordion).
- Danger-tier badge.
- `how_to_start_de` ("So startest Du") and `what_could_go_wrong_de` ("Was kann schiefgehen") as two labelled blocks.
- `related` tool ids → cross-link chips that scroll to the related card.

A short legend at the top maps each tier emoji/color to its `meaning_de` so a first-time reader understands the badges. The view takes **no `section`/`context` props** — it is a global catalog (contrast: `HelpView` takes `section` + `context`).

### 5.2 Platform-hub help section (`helpContent.admin.platform`)
Fills the existing `HelpView` shape (`{ title, description, actions[], guides[] }`):
- **title:** "Plattform Hub" (hand-authored, one string).
- **description:** a single hand-authored intro sentence (Du-form), e.g. *"Hier siehst Du alle Bausteine der Plattform (Software-Dienste und Hardware-Knoten). Öffne „Agent-Anleitung", um zu lernen, wie Du sie bedienst — ohne etwas kaputtzumachen."*
- **actions:** derived from the generated JSON's component summaries. **Primary rule:** one bullet per *sensitive* component (`sensitivity` is `assisted` or `forbidden`), formatted `"{emoji} {name} — {summary_de}"`, so the operator sees at a glance which platform pieces need care, capped at 8 (in registry order). **Mandatory non-empty fallback:** if *zero* components are tagged `assisted`/`forbidden` (plausible — F+B may tag most components `safe`/`caution`), fall back to the first 8 components in registry order regardless of sensitivity. This guarantees the §1 gap fix renders a populated drawer no matter how F+B assigns `sensitivity` — `actions` is never empty, so `HelpView`'s `{#if content.actions.length > 0}` gate (`HelpView.svelte:27`) always passes.
- **guides:** one hand-authored guide *"Wie finde ich Hilfe zu einem Baustein?"* whose steps point the operator to the Agent-Anleitung view and the per-component cards.

Because `description`/`actions` are built from imported JSON at module load, the registry remains SSOT — `helpContent.ts` imports the generated JSON and constructs the `platform` section programmatically rather than re-typing German strings (see §7.3, the recommended SSOT-preserving option).

## 6. Data consumed (registry fields used) + generated artifact shape

### 6.1 Registry fields consumed
- **taxonomy.yaml:** `id`, `label_de`, `emoji`, `meaning_de` (badge text + legend). `doc_treatment`/`enforcement_default` are **not** rendered (docs/enforcement concerns).
- **goals.yaml:** `id`, `title_de`, `when_de`, `flow` (`{tool, note_de}`), `example_prompt_de`, `danger`, `guardrails`, `related`.
- **tools.yaml:** `id`, `name_de`, `kind`, `summary_de`, `what_for_de`, `how_to_start_de`, `what_could_go_wrong_de`, `danger`, `guardrails`, `related`. (`links` carried through for optional "Mehr erfahren" anchors; the in-app view treats them as plain hrefs.)
- **guardrails.yaml:** `id`, `name_de` (chip labels), `rule_de`, `why_de` (the expandable rationale shown when a chip is tapped — emitted, see §6.2). `enforced_by` is **not** rendered.
- **components.yaml:** `slug`, `kind`, `name`, `emoji`, `summary_de`, `sensitivity`, `url`. `what_for_de`/`placeholder_en`/`links` are **not** needed by S2's two surfaces (the longer `what_for_de` is an S1 docs concern); only the ≤140-char `summary_de` + identity fields feed the platform help actions.

### 6.2 Generated artifact shape (`website/src/lib/agent-guide.generated.json`) — the contract
This snippet is **authoritative**: every field the Svelte UI reads appears here, and nothing the UI reads is absent. The shape is denormalized so the components never resolve IDs at runtime (tool names inside a goal flow, tier colors, guardrail names + rationale are all pre-resolved at emit time).

```json
{
  "$schema": "agent-guide.generated/v1",
  "generatedFrom": "docs/agent-guide/registry",
  "taxonomy": [
    { "id": "safe",      "label_de": "Sicher",         "emoji": "🟢", "meaning_de": "Kannst Du bedenkenlos selbst machen.", "color": "#3fb37f" },
    { "id": "caution",   "label_de": "Vorsicht",       "emoji": "🟡", "meaning_de": "Geht meistens gut — lies kurz mit.",   "color": "#e8c870" },
    { "id": "assisted",  "label_de": "Nur mit Hilfe",  "emoji": "🟠", "meaning_de": "Frag den Agenten, mach es nicht blind.","color": "#e08a3c" },
    { "id": "forbidden", "label_de": "Niemals allein", "emoji": "🔴", "meaning_de": "Niemals ohne Rücksprache.",            "color": "#d65a5a" }
  ],
  "goals": [
    {
      "id": "change-website-text",
      "title_de": "Ich will den Text auf der Website ändern",
      "when_de": "Wenn auf einer Seite etwas Falsches oder Veraltetes steht.",
      "danger": "safe",
      "flow": [
        { "tool": "agent-website", "tool_name_de": "Website-Agent", "note_de": "Sag ihm, welche Seite und welcher Text." }
      ],
      "example_prompt_de": "Ändere auf der Startseite die Überschrift zu „Willkommen bei Mentolder“.",
      "guardrails": [
        { "id": "G-ENV-EXPLICIT", "name_de": "Umgebung immer angeben",
          "rule_de": "Gib bei jedem Befehl an, welche Umgebung gemeint ist.",
          "why_de": "Ohne ENV trifft ein Deploy still den falschen Cluster." }
      ],
      "related": ["fix-a-bug"]
    }
  ],
  "tools": [
    {
      "id": "dev-flow-plan",
      "name_de": "Entwicklungs-Plan starten",
      "kind": "skill",
      "kind_de": "Fertigkeit",
      "summary_de": "Plant eine Änderung, bevor irgendetwas angefasst wird.",
      "what_for_de": "Wählt den Pfad (Feature/Fix/Chore), richtet einen isolierten Arbeitsbereich ein und schreibt einen Plan.",
      "how_to_start_de": "Beschreibe einfach, was Du ändern willst — der Plan-Ablauf startet von selbst.",
      "what_could_go_wrong_de": "Nichts Gefährliches: es schreibt nur einen Plan, deployt nichts.",
      "danger": "safe",
      "guardrails": [],
      "related": ["dev-flow-execute"],
      "links": []
    }
  ],
  "components": {
    "keycloak": {
      "slug": "keycloak", "kind": "software", "name": "Keycloak", "emoji": "🔐",
      "summary_de": "Zentrale Anmeldung (SSO) für alle Dienste.",
      "sensitivity": "assisted", "url": "https://auth.mentolder.de"
    }
  }
}
```

Notes on the contract:
- `taxonomy[].color` is added by the emitter (a fixed hex per tier id) so the Svelte badge does not hardcode colors — single source for the tier palette.
- `goals[].flow[].tool_name_de` is pre-resolved via `toolById()` at emit time; the UI never needs `load.mjs` helpers.
- `goals[].guardrails[]` and `tools[].guardrails[]` carry `{id, name_de, rule_de, why_de}` so a chip can expand to its rationale without a second lookup (resolved via `guardrailById()` at emit time).
- `components` is an **object keyed by slug** (the platform help looks components up by slug; the catalog never iterates them positionally).
- The file is **committed** and reviewed in PRs (mirrors `test-inventory.json` and F+B's `platform-descriptions.generated.json`).

### 6.3 Relationship to F+B's `platform-descriptions.generated.json` (keep separate)
| | `platform-descriptions.generated.json` (F+B) | `agent-guide.generated.json` (S2) |
|---|---|---|
| Producer | `scripts/gen-platform-descriptions.mjs` (`buildDescriptions()`) | `scripts/agent-guide/emit-webapp.mjs` (this spec) |
| Consumer | `website/src/lib/platform-db.ts` → seeds hub `platform.software_assets.description` column via `ensurePlatformSchema()` | `AgentGuideView.svelte` + `helpContent.ts` (in-app render) |
| Shape | `{software:{slug:{de,en}}, hardware:{…}}` (DB seed strings) | goals[] / tools[] / taxonomy[] / components{slug} (render data) |
| Lifecycle | written at build, read by runtime DDL seed | imported at build into Svelte components |

Both flow from the **same** registry via the **same** shared reader (`load.mjs`), but they are **separate artifacts with separate consumers**. Do not merge them and do not have one import the other. The platform help `actions` come from S2's `components{}` (render summaries), **not** from the DB column F+B seeds — even though both ultimately trace to `components.yaml.summary_de`.

> Note on grounding: the `platform-db.ts` JSON-import + `ensurePlatformSchema()` consumer pattern is an **F+B addition** that lands with F+B — in the current S2 worktree, `website/src/lib/platform-db.ts:1` imports only `pool from './website-db'` and has neither yet. S2 does not depend on that import existing; it depends only on the language-level `resolveJsonModule` capability, which is real today (see §7.2).

### 6.4 Tier color palette (emitter-owned)
The 4 tier ids map to fixed hex values emitted into `taxonomy[].color` (`safe` green, `caution` brass/amber, `assisted` orange, `forbidden` red — values shown in the §6.2 snippet). The Svelte badge reads `color` from the JSON; no color logic lives in the component, so re-theming is a one-line emitter change.

## 7. Mechanism (emitter + integration points, concrete file paths)

### 7.1 Emitter — `scripts/agent-guide/emit-webapp.mjs`
- Imports `loadRegistry`, `tierFor`, `toolById`, `guardrailById` from `scripts/agent-guide/load.mjs` (S1 prerequisite) and `validateRegistry` from `scripts/agent-guide/validate.mjs` (F+B).
- CLI entrypoint:
  1. `validateRegistry('docs/agent-guide/registry', repoRoot)` — **fail closed**; abort with non-zero exit if the registry is invalid (mirrors decision #4).
  2. `loadRegistry('docs/agent-guide/registry')`.
  3. Project into the §6.2 shape: pre-resolve tier colors, goal-flow tool names (`toolById`), guardrail name+rationale (`guardrailById`); key components by slug; drop fields the UI does not use.
  4. Write `website/src/lib/agent-guide.generated.json` with a trailing newline and stable key order (deterministic output so the diff gate is meaningful).
- Exports `buildWebappData(registryDir) → object` for unit testing (mirrors F+B's `buildDescriptions()` export pattern).

### 7.2 Typed re-export — `website/src/lib/agentGuide.ts`
A thin module that `import data from './agent-guide.generated.json'`. This works because `website/tsconfig.json` extends `astro/tsconfigs/strict` (verified — `website/tsconfig.json:2`), which turns on `resolveJsonModule`; a default JSON import is a *value* import, so it is compatible with the `verbatimModuleSyntax: true` also set in that tsconfig (`website/tsconfig.json:3`). This is the same language mechanism F+B uses for `platform-descriptions.generated.json`. The module exports typed `goals`, `tools`, `taxonomy`, `components`, plus small lookups:
- `tierFor(id) → { emoji, label, color, meaning }` (single resolver over `taxonomy[]`), and the thin conveniences `tierColor(id)`, `tierEmoji(id)`, `tierLabel(id)` derived from it (used by the §7.4 snippet);
- `componentBySlug(slug)`.

Svelte components import from here, not from the raw JSON, so the contract surface is one typed module.

### 7.3 helpContent integration — `website/src/lib/helpContent.ts`
Add a `platform` key to the `admin` record, built programmatically from `agentGuide.ts` (the SSOT-preserving option, recommended over hand-typing component strings):

```ts
import { components } from './agentGuide';

const allComponents = Object.values(components);
const sensitive = allComponents.filter(
  c => c.sensitivity === 'assisted' || c.sensitivity === 'forbidden',
);
// Non-empty guarantee: sensitive first; if none, fall back to first 8 in registry order.
const actionSource = (sensitive.length > 0 ? sensitive : allComponents).slice(0, 8);

const platformHelp: HelpSection = {
  title: 'Plattform Hub',
  description:
    'Hier siehst Du alle Bausteine der Plattform (Software-Dienste und Hardware-Knoten). ' +
    'Öffne „Agent-Anleitung", um zu lernen, wie Du sie bedienst — ohne etwas kaputtzumachen.',
  actions: actionSource.map(c => `${c.emoji} ${c.name} — ${c.summary_de}`),
  guides: [{
    title: 'Wie finde ich Hilfe zu einem Baustein?',
    steps: [
      'Öffne den Sidekick (Knopf unten rechts).',
      'Tippe auf „Agent-Anleitung".',
      'Suche unter „Werkzeuge & Agenten" oder „Ich will …" nach dem passenden Eintrag.',
    ],
  }],
};
// ... inside `admin: { ... }`:  platform: platformHelp,
```

Only the two hand-authored German sentences (`title`, `description`) and the static guide live here; everything component-specific derives from the registry. `HelpView.svelte` is **unchanged** — it already renders `title/description/actions/guides` (`HelpView.svelte:23-56`), and `adminSection('/admin/platform')` already yields `'platform'` (`AdminLayout.astro:33-40`), so adding the key makes the existing-but-empty drawer populate.

### 7.4 AgentGuideView — `website/src/components/assistant/AgentGuideView.svelte`
New component modeled on `HelpView.svelte`'s layout/CSS tokens (eyebrow/intro, `<details>` accordion, brass accents) but adding new badge/legend/clipboard/cross-link markup not present in HelpView. Takes **no props** (global catalog). Imports `goals`, `tools`, `taxonomy`, and the tier lookups from `agentGuide.ts`. Renders the legend, the goal cards, and the tool cards per §5.1. Example of one rendered tool card:

```svelte
<article class="ag-card">
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
</article>
```

`tierColor`/`tierEmoji`/`tierLabel` are the §7.2 exports (all backed by the single `tierFor()` resolver), so every call here resolves.

### 7.5 Sidekick wiring — `SidekickHome.svelte` + `PortalSidekick.svelte`
- **`PortalSidekick.svelte`:** extend the `View` union (line 11) to include `'agent-guide'`; import `AgentGuideView`; add `agent-guide: 'Agent-Anleitung'` to `titleMap` (lines 41-48); add a render branch `{:else if view === 'agent-guide'}<AgentGuideView />` in `drawer-body` (after the `help` branch at line 192-193).
- **`SidekickHome.svelte`:** extend its local `View` union (line 2 — the union is duplicated here, verified) with `'agent-guide'`; add an `Item` to the `$derived` `items` list (lines 24-30) with `show: true` (always shown — the catalog is global, unlike the `help` item which is gated on `!!helpSection` at line 29). The `no` ordinal is **context-conditional**, not a flat string: the existing items already compute `no` via `isAdmin ? '0X' : '0Y'` ternaries (lines 27-29) because the visible item set differs between portal (`questionnaire`/`support`/`help` → `01`/`02`/`03`) and admin (`tickets`/`inbox` push everything down by two). Insert the agent-guide item just before `help` with a matching conditional ordinal, e.g. `{ id: 'agent-guide', no: isAdmin ? '05' : '03', title: 'Agent-Anleitung', sub: 'Lernen, wie alles funktioniert', show: true }`, and bump the `help` item to `isAdmin ? '06' : '04'`. (Exact ordinals are mechanical; the load-bearing facts are: always shown, distinct ordinals per context, placed adjacent to `help`.)
- **Cross-link from platform help → Agent-Anleitung:** the platform `HelpView` guide (§7.3) instructs the operator to tap the Agent-Anleitung item. `HelpView.svelte` itself stays prop-driven and does not navigate; the `SidekickHome` menu item is the entry point, keeping `HelpView.svelte` unchanged.

### 7.6 Taskfile — `Taskfile.yml`
Per program decision #5, S2 adds exactly one task:
- `agent-guide:webapp` — runs `node scripts/agent-guide/emit-webapp.mjs`.

The umbrella `agent-guide:emit` (and `agent-guide:docs`) are **S1 deliverables** — S1 lands first, so the umbrella already exists when S2 merges. S2 only **adds `agent-guide:webapp` as a dependency of the existing `agent-guide:emit`** umbrella; it does **not** create the umbrella. (S3 later adds `agent-guide:maps` the same way.) This keeps umbrella ownership unambiguous and avoids a merge conflict over who defines it.

## 8. Verification (tests + CI freshness gate)

### 8.1 CI freshness gate (the S2 gate)
Website **vitest is not in CI** (confirmed — `ci.yml` runs `npm ci`, `task test:all`, the `test:inventory` diff gate, the Systembrett template check, and the security scan; `test:unit` is not invoked). Therefore the CI gate for S2 is the **generated-JSON freshness diff**, mirroring the existing `test-inventory.json` gate (`ci.yml`, the "Verify test inventory is up to date" step):

```yaml
- name: Verify agent-guide webapp JSON is up to date
  run: |
    task agent-guide:webapp
    if ! git diff --exit-code website/src/lib/agent-guide.generated.json; then
      echo "ERROR: website/src/lib/agent-guide.generated.json is stale — run 'task agent-guide:webapp' locally and commit"
      exit 1
    fi
```

`task agent-guide:webapp` runs `validateRegistry` internally (the emitter calls it and fails closed), so a stale-or-invalid registry fails CI. The gate lives next to the existing inventory gate in the offline-tests job.

**CI-ordering constraint (load-bearing).** This `ci.yml` step depends on artifacts that do not exist on `main` until S1 + F+B merge: `scripts/agent-guide/load.mjs` (S1), `scripts/agent-guide/validate.mjs` + the registry YAML (F+B), the `agent-guide:emit` umbrella (S1), and the root `yaml@^2.8.3` devDependency installed by `npm ci` (F+B). The gate must therefore be introduced **only after S1 and F+B are on `main`**, consistent with the enforced merge order S1 → S2 → S3 (§10). S2's branch rebases on `main` after S1 lands; the `ci.yml` change is part of the S2 PR but assumes those prerequisites are already present, so it goes green rather than red.

### 8.2 Emitter unit tests — `scripts/agent-guide/emit-webapp.test.mjs`
`node --test` (the project's `*.test.mjs` convention, e.g. the `scripts/docs-gen/*.test.mjs` family). Assert that `buildWebappData()` against a small fixture registry:
- produces all four taxonomy tiers with non-empty `color`;
- pre-resolves every `goals[].flow[].tool_name_de` (no unresolved tool ids) and every guardrail to `{id, name_de, rule_de, why_de}`;
- keys `components` by slug and includes only the §6.1 fields;
- is byte-stable across two runs (determinism guard for the diff gate).

Wired into the F+B `test:agent-guide` task family / `test:all`, so it runs offline in CI.

### 8.3 Component vitest (local) — `npm run test:unit`
Mirroring existing website tests (`website/src/lib/platform-db.ensure.test.ts`-style, `website-db-init-hotpath.test.ts`), add local-only vitest:
- `website/src/lib/helpContent.platform.test.ts` — asserts `helpContent.admin.platform` exists, has a non-empty `description`, and **`actions` is non-empty** (proving the §5.2 fallback guarantee) with each action string deriving from a `components` entry (e.g. contains a known component name). This pins the §1 gap fix.
- `website/src/lib/agentGuide.test.ts` — asserts the typed re-export exposes `goals`/`tools`/`taxonomy`/`components`, and that `tierColor()`/`tierEmoji()`/`tierLabel()` return a value for every `danger` referenced by a goal or tool (no dangling tier ids).

These run via `npm run test:unit` locally (and are encouraged in the PR description) but are **not** the CI gate — the JSON diff is.

## 9. Risks & open items

- **R1 — S1 not yet merged.** `load.mjs` is introduced by S1. If S2 is implemented before S1 merges, the emitter cannot import it. Mitigation: enforced build order S1 → S2 (§10); S2's branch rebases on `main` after S1 lands.
- **R2 — Registry field drift.** If F+B renames a `*_de` field, the emitter breaks. Mitigation: `validateRegistry` runs first (fail closed) and the emitter's projection asserts required fields; the freshness gate surfaces any change as a diff.
- **R3 — `View` union duplicated in two files.** `View` is declared in both `PortalSidekick.svelte:11` and `SidekickHome.svelte:2`. Both must be edited; a shared type would be cleaner. Open item: optionally extract `View` to a shared `types.ts` (deferred — keep S2 minimal, just edit both).
- **R4 — Component count for `actions`.** Filtering to `assisted`/`forbidden` and capping at 8 is a judgement call; with the §5.2 non-empty fallback the drawer always populates, but if many components are tagged sensitive the list is truncated at 8. Open item: confirm the cap with the operator after first render (sensible default: 8).
- **R5 — Color contrast.** Emitter-supplied tier hex must read against the Sidekick dark `#0f1623` drawer background (`PortalSidekick.svelte:263`). Open item: pick AA-contrast values (the §6.2 snippet values are starting points, to be eyeballed against the drawer).
- **R6 — JSON import in `.ts` under `verbatimModuleSyntax`.** `website/tsconfig.json:3` sets `verbatimModuleSyntax: true`; a default JSON import is a *value* (not type) import so it is fine, and `resolveJsonModule` is inherited from `astro/tsconfigs/strict` (`website/tsconfig.json:2`). The typed re-export must use a value import. Mechanism verified against the tsconfig directly (not against `platform-db.ts`, whose JSON import is an unmerged F+B addition — see §6.3 note).
- **R7 — CI gate lands before its prerequisites.** If S2's `ci.yml` change merged before S1/F+B, the gate would go red (missing `load.mjs`/registry/`yaml` dep). Mitigation: §8.1's CI-ordering constraint ties the gate's introduction to the S1 → S2 merge order.

## 10. Prerequisites & build order

- **PREREQUISITE — S1's shared reader `scripts/agent-guide/load.mjs`.** S2's emitter imports `loadRegistry`/`tierFor`/`toolById`/`guardrailById` from it. **S2 must merge after S1.**
- **PREREQUISITE — S1's `agent-guide:emit` umbrella task.** S2 adds `agent-guide:webapp` and wires it as a dep of the already-existing umbrella (§7.6); it does not create the umbrella.
- **PREREQUISITE — F+B registry + tooling** (`docs/agent-guide/registry/*.yaml`, `scripts/agent-guide/validate.mjs`, root `yaml@^2.8.3` devDependency, the `platform-descriptions.generated.json` precedent). Already done/merging per program context; the emitter calls `validateRegistry` and fails closed.
- **Merge / build order: S1 → S2 → S3.** Each spec states this explicitly and is otherwise self-contained. S2 depends on S1 (for `load.mjs` + the umbrella) and on F+B; it does not depend on S3.
- Root `yaml@^2.8.3` devDependency and `node>=22.13.0` engine (F+B) are reused; S2 adds no new runtime dependency.

## 11. Downstream (what this unblocks)

- **The operator gets in-app guardrails.** The Agent-Anleitung view and the populated platform drawer mean the German-speaking solo operator can discover "which tool, and what could go wrong" without leaving the browser — directly serving the program's "can't do anything wrong" goal.
- **Sub-project E (enforcement hooks)** can later consume the **same** `taxonomy[].id` values that S2 now *displays* as badges; the in-app danger tiers and the future enforced tiers share one vocabulary. S2 does not implement enforcement — it only renders the tier the registry assigns.
- **S3 (LLM routing maps)** reuses the identical `load.mjs` parse path S2 declares as a prerequisite, so goal/tool/tier IDs render consistently between the human in-app surface (S2) and the agent-facing Markdown (S3).
- Establishes the **committed-generated-JSON + diff-gate** pattern for a Svelte/Astro consumer, reusable by future registry-derived UI.

## 12. Deliverables checklist (for the plan)

- [ ] `scripts/agent-guide/emit-webapp.mjs` — emitter; imports `load.mjs` (S1) + `validateRegistry` (F+B); exports `buildWebappData()`; writes `website/src/lib/agent-guide.generated.json` deterministically; fail-closed on invalid registry.
- [ ] `website/src/lib/agent-guide.generated.json` — committed generated artifact (the contract, §6.2; guardrail objects carry `rule_de`/`why_de`).
- [ ] `website/src/lib/agentGuide.ts` — typed re-export of the generated JSON + `tierFor()`/`tierColor()`/`tierEmoji()`/`tierLabel()`/`componentBySlug()` helpers.
- [ ] `website/src/components/assistant/AgentGuideView.svelte` — new Sidekick-wide view (goals + tools + tier legend), reusing HelpView tokens with new badge/legend/clipboard markup.
- [ ] `website/src/lib/helpContent.ts` — add `platform` key to `admin`, built from `agentGuide.ts` components with the non-empty `actions` fallback; only `title` + `description` + the static guide hand-authored.
- [ ] `website/src/components/PortalSidekick.svelte` — extend `View` union (line 11), `titleMap` (lines 41-48), import + render branch for `AgentGuideView` (after line 193).
- [ ] `website/src/components/assistant/SidekickHome.svelte` — extend `View` union (line 2), add always-shown `agent-guide` menu item with context-conditional `no` ordinal, bump the `help` ordinal.
- [ ] `Taskfile.yml` — add `agent-guide:webapp` task and wire it as a dep of the existing `agent-guide:emit` umbrella (owned by S1).
- [ ] `.github/workflows/ci.yml` — add the `git diff --exit-code website/src/lib/agent-guide.generated.json` freshness gate next to the test-inventory gate (introduced after S1+F+B per §8.1).
- [ ] `scripts/agent-guide/emit-webapp.test.mjs` — `node --test` emitter unit tests (tiers, resolved flow names, resolved guardrails, slug keying, determinism); wired into `test:agent-guide`/`test:all`.
- [ ] `website/src/lib/helpContent.platform.test.ts` + `website/src/lib/agentGuide.test.ts` — local vitest (`npm run test:unit`); the helpContent test asserts non-empty `actions`.
- [ ] PR description: state S1 prerequisite + merge order S1 → S2 → S3; note that `PortalSidekick` mounts unconditionally (the `ENABLE_ASSISTANT_*` flags gate only the separate `AssistantWidget`); note vitest is local-only and the JSON diff is the CI gate.
