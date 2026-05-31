---
topic: agent-guide-sidekick-ux
date: 2026-05-31
status: approved
branch: feature/agent-guide-sidekick-ux
domains: [website]
---

# Agent-Anleitung Sidekick — Redesign (grouped · collapsible · color-coded · searchable)

## 1. Context

The **Agent-Anleitung** (Agent-Guide) is a drawer/sidekick in the Astro+Svelte website that teaches a
**non-developer owner** (Patrick) and stakeholders *"I want to do X → which tool/agent do I use, and how
careful must I be?"*.

**Current implementation (verified):**
- Render component: `website/src/components/assistant/AgentGuideView.svelte` (inside `PortalSidekick.svelte`,
  a ~380px drawer; 640px when expanded).
- Data layer: `website/src/lib/agentGuide.ts` → imports `website/src/lib/agent-guide.generated.json`.
- Content is **generated** by `task agent-guide:emit` (→ `scripts/agent-guide/emit-webapp.mjs`) from the YAML
  registry in `docs/agent-guide/registry/` (`taxonomy.yaml`, `goals.yaml`, `tools.yaml`, `guardrails.yaml`,
  `components.yaml`). Emitters are unit-tested (`emit-webapp.test.mjs`, `validate.test.mjs`, `load.test.mjs`, …).
- CSS lives **globally** in `website/src/styles/sidekick-panels.css`, scoped under `.drawer .ag-*` — this is
  deliberate: Svelte 5 + Vite drop the *scoped* CSS of drawer sub-views that mount after navigation, which once
  shipped this view unstyled in prod (fixed in PR #1263). **All new CSS must follow this convention.**
- Content today: 4 danger tiers (`safe`/`caution`/`assisted`/`forbidden`, each with a color), **8 goals**
  ("Ich will…"), **11 tools** (`kind` = skill|task|agent), 7 guardrails.

**Current gaps (what the user asked to fix):** no thematic grouping (two flat sections "Ich will…" /
"Werkzeuge & Agenten"); cards are always fully expanded (only guardrail chips collapse); color encodes only
danger tier; no search; no index for fast finding.

## 2. Goals / Non-goals

**Goals**
- Group the 19 cards **thematically**; goals and tools co-located per theme.
- Every card **collapses to a single line**, scannable at a glance.
- **Color-coded** (domain + danger tier, kept visually distinct) and **indexed** for fast find.
- **Substring search** that fires from **≥ 3 characters**, German-friendly (umlaut-normalized).
- Plus an approved set of enhancements (§4 D).

**Non-goals (this iteration)** — see §10.

## 3. Audience constraints
- Primary user is a **non-developer**. Language is German. Wording must avoid jargon (or explain it).
- Drawer is narrow (~380px). Touch/click first; keyboard is a bonus, not the primary input.
- On-premises / DSGVO: no third-party calls, no per-keystroke logging.
- Content stays in **YAML registry** (PR-reviewable) → emitter → generated JSON → Svelte. Logic stays in
  testable modules. Presentation stays in small Svelte components.

## 4. Decisions

### A. Information architecture
- **7 theme groups**, goals + tools co-located, driven by a new `themes.yaml` + a per-card `theme` field:

  | Theme (id) | Label | Emoji | Cards |
  |---|---|---|---|
  | `website` | Website | 🌐 | website-text-aendern (🟢), agent-website (🟡) |
  | `betrieb` | Betrieb & Status | 🛠 | dienst-status-pruefen (🟢), agent-ops (🟢) |
  | `entwickeln` | Entwickeln (Dev-Flow) | ⚙ | bug-beheben (🟡), feature-bauen (🟡), dev-flow-plan (🟡), dev-flow-execute (🟡), dev-flow-iterate (🟡), task-oracle (🟢) |
  | `testen` | Testen | 🧪 | dev-flow-e2e (🟡), agent-test (🟡) |
  | `ausrollen` | Ausrollen & Infrastruktur | 🚀 | aenderung-ausrollen (🟠), cluster-neu-aufsetzen (🔴), agent-infra (🟠) |
  | `datenbank` | Datenbank | 🗄 | datenbank-aendern (🟠), agent-db (🟠) |
  | `sicherheit` | Sicherheit & Geheimnisse | 🔒 | secret-aendern (🔴), agent-security (🟠) |

  Total: 8 goals + 11 tools = **19 cards**. Task-Orakel lives in `entwickeln`. Testen stays separate.
- **Grouping-axis toggle** (segmented control above the cards), pure client-side reduce over the loaded data,
  choice persisted in localStorage:
  - **Thema** (default) — the table above.
  - **Gefahr** — 4 tier headers (🟢→🔴), reusing taxonomy emoji/label/color; doubles as a safety map.
  - **Art** — Ziel / Skill / Agent / Aufgabe (from goal-vs-tool + existing `kind`).
- **"Häufig" shelf** pinned at the very top: cards flagged `common: true` (e.g. website-text-aendern,
  dienst-status-pruefen, bug-beheben, agent-ops, task-oracle). They still appear in their normal group; the
  shelf is an additional quick-access band, hidden while a text search is active.

### B. Collapse interaction
- A card's header becomes a focusable **button**; the body (flow, prompt, `Wofür`-details, guardrail chips,
  related, "Mehr dazu") lives in an animated wrapper.
- **Collapsed single line:** `[tier dot 🟢] Titel … [right meta]` where right meta = goals → `N Schritte`,
  tools → existing `kind_de` pill. A **3px tier-colored `border-left`** on `.ag-card` makes the closed column
  read as a color index down the edge.
- **Defaults:** first visit = all collapsed (pure index). **Independent multi-open** (NOT accordion — a goal
  and its tool may stay open together). Group headers also collapse.
- **Controls:** "Alles ausklappen / Alles einklappen". Open-state = a `Set<string>` of card ids in Svelte
  `$state` (NOT native `<details>`, so search can **force-open** matches), persisted under a versioned
  localStorage key `ag-open-v1` (debounced write, rehydrate in `$effect`).
- Existing guardrail `<details>` chips remain as a nested second disclosure level inside an open card.
- Height animation via the `grid-template-rows: 0fr → 1fr` technique, guarded by `prefers-reduced-motion`.

### C. Color & safety encoding
- **Domain** = emoji icon + a **subtle cool-hue** header tint (blue/indigo/purple/cyan/teal/slate/violet).
  The warm green→amber→orange→red ramp is **reserved for danger tiers** so the two signals never collide.
- **Danger tier** = 🟢🟡🟠🔴 dot on the collapsed line **and** the 3px left-border stripe.
- **Colorblind / low-vision:** redundant encoding (emoji + border + the legend's `meaning_de`); a visually
  hidden span carries `meaning_de` inside each tier chip for screen readers; verify tier colors meet ≥4.5:1
  text / ≥3:1 non-text contrast on both the mentolder and `body.kore` backgrounds.
- **Rote Stopp-Karte für 🔴** (forbidden): the expanded body renders as a distinct **red-stop panel** — stop
  sentence first, an `escalate_to_de` line (default "Patrick"), and the prompt copy button relabeled
  *"Prompt nur nach Rücksprache kopieren."* Driven by data already in the registry (`danger` + a new optional
  `escalate_to_de`).

### D. Find — search + index
- **Sticky find-bar** under the intro containing, in order: the **tier-filter rail** (the legend becomes 4
  clickable tier toggles with per-tier counts), the **grouping-axis toggle**, the **domain-chip index**, and
  the **search input** (`type=search`, visually-hidden label "Anleitung durchsuchen", placeholder hint
  "≥ 3 Zeichen").
- **Search logic** (extracted to `lib/agentGuideSearch.ts`, unit-tested):
  - Build a per-item haystack once (19 items, cheap): lowercased `title_de/name_de` + `one_liner_de/when_de/
    summary_de` + flow notes + guardrail `name_de`/`rule_de` + `kind_de` + curated `aliases_de`.
  - **Diacritics stripped on both query and haystack** (`ä→ae`, `ö→oe`, `ü→ue`, `ß→ss`) so "aendern" matches
    "ändern".
  - Below 3 chars: no filtering (everything shown, collapsed). At ≥ 3 chars: keep items whose haystack
    `includes(normalizedQuery)`.
- **Behavior:** filter the list down to matches; auto-open matching groups; **force-open** matched cards (add
  ids to the expanded Set); wrap the first match in a **neutral brass `<mark class="ag-hl">`** (never a tier
  hue, so "match" never reads as "danger"); show a live **"N Treffer"** count in an `aria-live="polite"`
  region. Debounce ~120ms. Empty-state "Nichts gefunden" with 2–3 alias suggestion chips.
- **Composition:** tier filter × domain chip × text search compose multiplicatively. "/" focuses the search,
  Esc clears (progressive enhancement; not required for the non-dev path).
- **Curated `aliases_de`** per card make everyday words hit, e.g.
  `secret-aendern → [passwort, geheimnis, api-schlüssel, zertifikat, rotieren, credentials]`,
  `aenderung-ausrollen → [deploy, ausrollen, live, produktion, release]`,
  `agent-ops → [warum rot, crash, logs, läuft nicht, status]`.

### E. Cross-links & actionability
- One `id → {label_de, kind, danger, domId}` lookup built from `goals[] + tools[]`.
- **Two-way named jumps:** related chips render the human German name + tier dot (`↳ 🟠 Infrastruktur-Agent`),
  never the raw slug. `scrollToEntry(id)` resolves a goal **or** tool, **adds it to the expanded Set** (opens,
  not lands-on-collapsed), scrolls (reduced-motion guard), moves focus, briefly flashes a brass ring. Render
  `goal.related` too (currently dead data).
- **Clickable flow steps:** each goal `flow[].tool` becomes a button → `scrollToEntry('ag-tool-…')`.
- **"Mehr dazu" link row** inside an expanded card from a promoted `links` field → targets that already exist
  in-repo: `docs/agent-guide/maps/{goals,tools,danger}-map.md` rows and the skill/agent source served by the
  docs site.

### F. Onboarding
- **Glossar** group ("Begriffe kurz erklärt") from a new `glossary.yaml` (~12 one-line German definitions:
  Skill, Agent, Task, PR, Branch, Merge, Deploy, Cluster, Secret, ENV, Guardrail, CI), searchable through the
  same substring search.

## 5. Data model / pipeline changes

**New registry files**
- `docs/agent-guide/registry/themes.yaml` — list of `{id, label_de, emoji, order, accent?, blurb_de?}`.
- `docs/agent-guide/registry/glossary.yaml` — list of `{term, def_de}`.

**New optional per-card fields** (in `goals.yaml` / `tools.yaml`)
- `theme: <theme-id>` (both)
- `aliases_de: [..]` (both)
- `common: true` + optional `order: <int>` (both)
- `links: [{label_de, url}]` (both — promotes today's empty `string[]`)
- `one_liner_de: <≤80 chars>` (**goals only** — tools already have `summary_de`; goals' `when_de` is a full
  sentence, too tall for one line)
- `escalate_to_de: <name>` (optional, forbidden cards; default "Patrick")

**Emitter (`emit-webapp.mjs`)** — additive: pass the new fields through; resolve a top-level `themes[]`
(ordered) and attach each item's `theme` (fallback `allgemein` if ever missing); emit `glossary[]`. Generated
JSON stays on the existing `$schema` (`agent-guide.generated/v1`) — additive only, **no version bump**.

**Validation (`validate.mjs`)** — allowlist-based, so unknown keys already pass. Add light, opt-in checks:
`theme ∈ themes`, `one_liner_de` length ≤ 80, `links[].url` non-empty. Keep CI green.

**Types** — extend `Goal` / `Tool` interfaces + add `Theme`, `GlossaryEntry`, `LinkRef` in `agentGuide.ts`.

**Regeneration** — run `task agent-guide:emit` and **commit** the updated `agent-guide.generated.json`
(treated like the test-inventory: the committed artifact must match the emitter output).

## 6. Component architecture

Split `assistant/AgentGuideView.svelte` (keep the file as the orchestrator) into small, focused components in
`website/src/components/assistant/agent-guide/`:
- `AgentGuideView.svelte` — owns state (`expanded: Set`, `query`, `tierFilter`, `axis`, `domainFilter`),
  derives groups, renders the find-bar + shelf + groups.
- `GuideFindBar.svelte` — tier-filter rail, axis toggle, domain chips, search input + count.
- `GuideGroup.svelte` — collapsible theme/tier/art group header + its cards.
- `GuideCard.svelte` — collapsed line ↔ expanded body (goal or tool variant), red-stop panel for forbidden,
  cross-link chips, flow steps, "Mehr dazu".
- `lib/agentGuideSearch.ts` — **pure** functions: `normalize()`, `buildHaystack()`, `matches()`,
  `groupBy(axis)`, `sortCommonFirst()`. No DOM, fully unit-testable.

All styles go into `website/src/styles/sidekick-panels.css` under `.drawer .ag-*` (+ a global
`@media (prefers-reduced-motion: reduce)` block). **No scoped `<style>` blocks** in the drawer sub-views.

## 7. Accessibility
- Group as `<nav>`/`role=region` with labelled headers; collapse buttons expose `aria-expanded`; search count
  in `aria-live=polite`; tier conveyed by emoji + border + SR text, never color alone; visible focus rings;
  `prefers-reduced-motion` disables collapse/scroll animations; touch targets ≥ ~44px.

## 8. Testing
- **Vitest** (`agentGuide.test.ts` + a new `agentGuideSearch.test.ts`): umlaut normalization, ≥3-char gate,
  substring across each searched field, `aliases_de` hit, `groupBy` for all three axes, `common`-first sort.
- **Emitter** (`emit-webapp.test.mjs`): `themes[]` resolution + ordering, new-field passthrough, `glossary[]`
  emission, fallback theme. **`validate.test.mjs`**: new light checks pass on good data, fail on bad.
- **Playwright filmable E2E** — extend the existing agent-guide walkthrough (`task
  test:e2e:agent-guide:film`): open drawer → all collapsed → expand a card → search "daten" filters +
  highlights + shows count → axis toggle to Gefahr → tier filter to 🔴 → forbidden card shows red-stop →
  cross-link jump force-opens target. (Nav needs `networkidle` + retry-click per the known gotcha.)
- **CI:** committed `agent-guide.generated.json` must equal `task agent-guide:emit` output; `task test:all`
  green.

## 9. Acceptance criteria
1. Opening the Agent-Anleitung shows **7 theme groups**, all cards **collapsed to one line**, each with a tier
   dot + left-border stripe; first card-count fits the drawer without horizontal scroll.
2. Clicking a card expands it inline; multiple can be open; "Alles einklappen" closes all; state survives a
   drawer close/reopen.
3. Typing **≥ 3 chars** filters to matching cards, force-opens + highlights matches, shows a live count;
   "aendern" finds "ändern"; "passwort" finds the Security card (via `aliases_de`).
4. Domain chips + tier-filter rail + axis toggle (Thema/Gefahr/Art) all work and compose with search.
5. A 🔴 forbidden card expands into the red-stop panel with the "wen fragen" line and relabeled copy button.
6. Related chips show human names and jump-open their target; goal flow steps jump to their tool card;
   "Mehr dazu" links resolve.
7. Glossar group renders and is searchable.
8. Vitest + emitter tests + the Playwright walkthrough pass; CI (`task test:all`) is green; the regenerated
   `agent-guide.generated.json` is committed.

## 10. Out of scope (noted as "später")
Shareable URL deep-links; the 60-Sek-Intro card; the 🔒/✋ enforcement glyph (both deselected by the user);
reverse "Wird benutzt von" index; copy-flow-as-Markdown-checklist; failed-search telemetry / "Lücke melden";
a separate decision-tree wizard; a 2-column expanded-mode grid. (Sourced from the improvement-sweep "cut"
list — recorded so a future iteration can pick them up.)
