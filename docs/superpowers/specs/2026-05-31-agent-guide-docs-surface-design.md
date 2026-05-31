# Design Spec — AI-Agent Guide: Docs-Site Surface (S1)

**Date:** 2026-05-31
**Branch:** feature/agent-guide-docs
**Status:** approved design (brainstorming complete), spec for review
**Program:** "AI-Agent Operating Guide & Guardrails" — sub-project S1, one of six.

---

## 1. Problem & Motivation

Sub-project **F+B** produced a single source of truth (SSOT) for the whole platform: a YAML registry under `docs/agent-guide/registry/` (`taxonomy.yaml`, `guardrails.yaml`, `tools.yaml`, `goals.yaml`, `components.yaml`) plus a validator (`scripts/agent-guide/validate.mjs`). That registry is structured data — it is not, by itself, something a human reads. It needs **rendered surfaces**, one per audience.

S1 is the **human-teaching surface**: it renders the registry as German pages on the documentation site already served at `docs.<domain>` (`docs.mentolder.de` / `docs.korczewski.de`). Today an inexperienced solo operator who opens the docs site finds reference material written by and for engineers (runbooks, a DB schema diagram, skill/agent reference cards). There is no "Was will ich tun?" ("What do I want to do?") entry point that takes a beginner from an *intent* ("I want to change the website text") to the *right tool*, the *exact prompt to paste*, and an honest *what-could-go-wrong* warning tied to a danger tier.

S1 closes that gap by emitting three generated German pages (the "three lenses" — goals, tools, components) plus one hand-authored narrative landing page, all into `docs/agent-guide/`, where the **existing, unchanged** build-docs pipeline auto-discovers and publishes them. No new deploy path, no new render engine — S1 is a thin emitter that writes Markdown the docs site already knows how to render.

## 2. Audience persona

ONE inexperienced solo operator, German-speaking, working *inside* the repo via Claude Code. They know *what* they want ("change the website text", "fix this bug") but not *how* the tooling works. They read the docs site **in a browser**, as prose, not as terse tables. They need:

- a friendly **starting question** ("Was will ich tun?") that routes them by intent, not by tool name;
- the **exact prompt** to give the agent, copy-pasteable;
- an honest, color-coded **danger signal** so they "can't do anything wrong";
- every technical term explained in parentheses on first use (e.g. "Worktree (isolierter Arbeits-Ordner)").

All operator-facing text on this surface is German, Du-form, friendly. This is the **human** audience. The LLM-agent audience (terse, grep-friendly) is sub-project **S3** and is explicitly out of scope here (see §3, §5).

## 3. Goals / Non-goals

### Goals
- **G1** — Introduce the shared registry reader `scripts/agent-guide/load.mjs` (S1 owns it; S2/S3 consume it). Define its API precisely (§6, §7) as the contract S2/S3 depend on.
- **G2** — Emit three GENERATED German Markdown pages into `docs/agent-guide/` from the registry, each carrying a "DO NOT EDIT" marker and `domain:` frontmatter:
  - `10-ziele.md` — Lens 1, the "Ich will …" goal catalog (from `goals.yaml`).
  - `20-werkzeuge.md` — Lens 2, tool + agent reference cards (from `tools.yaml`).
  - `30-bausteine.md` — Lens 3, the platform components / enriched hub (from `components.yaml`).
- **G3** — Ship one HAND-AUTHORED, committed, hand-edited landing page `00-anleitung.md` ("Was will ich tun?") that teaches and links into the three generated pages.
- **G4** — Wire the emitter behind `task agent-guide:docs` (and the umbrella `task agent-guide:emit`), and add a CI freshness gate (`git diff --exit-code` over the generated trio) mirroring the existing `test-inventory.json` gate.
- **G5** — Cross-link the four pages to each other and into existing docs pages (skills/agents) using the docs generator's native `[[wikilink]]` and `[label](file.md)` mechanisms, so the registry's `links`/`related`/`tool`/`guardrails` references become live navigation. Where a tool/agent id does not equal its discovered page slug (see §6, §7.2), the emitter maps the id to the real slug before emitting the wikilink.
- **G6** — Never emit from an invalid registry: the emitter runs F+B's `validateRegistry` (or `task test:agent-guide`) first.

### Non-goals (explicit deferrals)
- **Not S3.** S1 emits *human teaching pages* (prose, examples, copy-paste prompts). S3 emits *terse routing-style Markdown tables for an LLM agent grepping the repo*, linked from `CLAUDE.md`. Same registry, two templates, two consumers — they are **not** collapsed. S1 does not touch `CLAUDE.md` and does not emit agent-facing maps.
- **Not S2.** The in-app webapp render of the enriched hub (`agent-guide:webapp`) is S2's surface. S1 does **not** render into the Astro website; `30-bausteine.md` is the *docs-site* component lens, distinct from the website's `platform-db.ts`-backed hub.
- **No change to the core build-docs pipeline.** S1 relies on the existing recursive `docs/**/*.md` discovery (`scripts/docs-gen/discover.mjs`). No new orchestrator step, no new page type, no new special-case in `buildPages`.
- **No new deploy path.** Publishing rides the existing `task docs:deploy` (image rebuild + rollout on both clusters).
- **No enforcement.** Guardrail *enforcement* (hooks) is sub-project E, a later cycle. S1 only *renders* the taxonomy and guardrail text; it is the "docs-only" treatment of each guardrail.

## 4. Architecture

```
docs/agent-guide/registry/*.yaml         (F+B SSOT — prerequisite, not created here)
        │
        ▼
scripts/agent-guide/load.mjs             (NEW, S1-owned: ONE parse path)
   loadRegistry(dir) → { goals, tools, components, taxonomy, guardrails }
   + helpers: tierFor(id), toolById(id), guardrailById(id)
        │
        ├──────────────► scripts/agent-guide/validate.mjs   (F+B; emitter calls validateRegistry first)
        │
        ▼
scripts/agent-guide/emit-docs.mjs        (NEW, S1: the emitter)
   reads registry via loadRegistry, renders German Markdown
        │
        ▼  (writes, COMMITTED to git)
docs/agent-guide/
   00-anleitung.md      ← HAND-AUTHORED (not regenerated)
   10-ziele.md          ← GENERATED  (fence-first frontmatter + DO-NOT-EDIT marker)
   20-werkzeuge.md      ← GENERATED
   30-bausteine.md      ← GENERATED
        │
        ▼  (UNCHANGED existing pipeline auto-discovers docs/**/*.md)
scripts/build-docs.mjs → docs-gen/{discover,registry,render-markdown,templates,theme}.mjs
        │
        ▼
k3d/docs-content-built/{00-anleitung,10-ziele,20-werkzeuge,30-bausteine}.html   (committed build output)
        │
        ▼  task docs:deploy  →  ghcr.io/paddione/workspace-docs:latest  →  docs.<domain>
```

The key architectural decision is that S1 produces **input to** an existing, well-tested pipeline rather than a parallel renderer. The generated `.md` files follow the same *generated-then-committed-then-rendered* lifecycle as the precedent `docs/db-schema-diagram.md`: machine-generated, committed to git, and discovered + rendered by `build-docs.mjs` (`scripts/build-docs.mjs` line 115 `discoverSources` → line 126 `buildPages` → lines 140–153 render loop → `k3d/docs-content-built/<slug>.html`).

One important difference from that precedent is called out so the spec is not overstated: `docs/db-schema-diagram.md` carries **no frontmatter and no marker comment** — it opens with an `# H1` and a `> Generated by …` blockquote (verified), and its slug (`db-schema`) and domain (`db`) are pinned by a hardcoded `src.name === 'db-schema-diagram'` special-case in `registry.mjs` `buildPages` (lines 227–228 for the slug, lines 246–247 for the domain). S1 deliberately does **not** add a special-case. Instead it is the **first published doc to drive its domain from frontmatter** `domain:` (see §6). So the analogy is the *lifecycle*, not the metadata mechanism.

### Why the generated files are committed (not built on the fly)
This mirrors two existing precedents in the repo:
1. **`docs/db-schema-diagram.md`** — generated by `task db:diagram`, committed, then rendered by `build-docs.mjs` (the *generated-then-committed-then-rendered* pattern S1 reuses).
2. **`website/src/data/test-inventory.json`** — generated by `task test:inventory`, committed, and guarded by a CI `git diff --exit-code` gate (`.github/workflows/ci.yml` lines 38–43).

Committing keeps the generated Markdown reviewable in PRs and lets the docs Docker build (`scripts/docs.Dockerfile`, invoked by `build-docs.yml` on `docs-v*` tags and by `task docs:deploy`) run with no registry/YAML dependency at image-build time — it only needs the already-committed `.md`.

## 5. Information architecture / what gets rendered

Four pages land in `docs/agent-guide/`. Filenames are numeric-prefixed so they sort predictably and yield clean, stable slugs. The slugs were verified against the generator's `slugify()` (`scripts/docs-gen/registry.mjs` lines 44–51):

| File | Kind | Slug (verified) | Output HTML | Lens |
|------|------|-----------------|-------------|------|
| `00-anleitung.md` | hand-authored | `00-anleitung` | `00-anleitung.html` | Landing — "Was will ich tun?" |
| `10-ziele.md` | generated | `10-ziele` | `10-ziele.html` | Lens 1 — Ziele ("Ich will …") |
| `20-werkzeuge.md` | generated | `20-werkzeuge` | `20-werkzeuge.html` | Lens 2 — Werkzeuge (Tools + Agents) |
| `30-bausteine.md` | generated | `30-bausteine` | `30-bausteine.html` | Lens 3 — Bausteine (Komponenten) |

(`outPathFor` for a repo `doc` page returns `${slug}.html` — `scripts/docs-gen/registry.mjs` line 79 — so each page publishes at its bare slug.)

### `00-anleitung.md` — the narrative landing (HAND-AUTHORED)
Teaches the beginner the mental model in friendly German Du-form:
- "Du weißt *was* du willst, aber nicht *wie*? Fang hier an." — sets the frame.
- A short explanation of the four danger tiers (🟢 Sicher / 🟡 Vorsicht / 🟠 Nur mit Hilfe / 🔴 Niemals allein), drawn conceptually from `taxonomy.yaml` but written by hand for narrative flow.
- A "Drei Linsen" section that explains and links into the three generated pages via wikilinks: `[[10-ziele]]`, `[[20-werkzeuge]]`, `[[30-bausteine]]`.
- A worked example walking one intent end-to-end ("Ich will den Website-Text ändern") so the reader sees the goal → tool → prompt chain once before browsing the catalog.

This file is **never regenerated**. The CI freshness gate (§8) globs the *generated* set only, so editors can freely improve the prose.

### `10-ziele.md` — Lens 1, the goal catalog (GENERATED)
One section per `goals.yaml` entry. Each goal renders as:
- an H2 with the `title_de` ("Ich will …") — H2 because the generator builds the on-page TOC ("Auf dieser Seite") from H2 headings when there are ≥2 (`scripts/docs-gen/render-markdown.mjs` lines 184–198), giving the operator a free navigable index;
- a danger badge resolved through `tierFor(goal.danger)` (emoji + `label_de`);
- a `when_de` line ("Wann?");
- the ordered `flow` rendered as a numbered list, each step naming its tool (wikilinked into `20-werkzeuge.md`, or — for the spine *skills* `dev-flow-*` whose ids equal their discovered SKILL.md slug — directly to the skill page) plus the step's `note_de`;
- the verbatim `example_prompt_de` in a fenced code block (so the generator's Copy button — `injectCopyButtons`, `render-markdown.mjs` lines 205–214 — lets the operator copy the prompt with one click);
- the guardrails (`guardrailById(id).name_de`) and `related` goals (in-page anchor links).

### `20-werkzeuge.md` — Lens 2, tool + agent reference cards (GENERATED)
One H2 card per `tools.yaml` entry (the beginner-spine skills `dev-flow-plan`/`dev-flow-execute`/`dev-flow-iterate`/`dev-flow-e2e`, `task-oracle`, and the six routing agents `agent-website/ops/infra/test/db/security`). Each card: `name_de`, a `kind` pill (Skill/Agent/Task), `summary_de`, `what_for_de`, `how_to_start_de`, a danger badge via `tierFor`, `what_could_go_wrong_de`, its guardrails, and `related`/`links`.

**Wikilink targets must be mapped, not copied verbatim from the id.** Verified against discovery:
- The four `dev-flow-*` spine **skills** have ids that equal their discovered SKILL.md slug (`.claude/skills/dev-flow-plan/SKILL.md` → slug `dev-flow-plan`, etc. — `discover.mjs` lines 75–90 use `basename(dir)`). For these, the emitter emits `[[dev-flow-plan]]` directly and the generator resolves it.
- The six **agents** have tools.yaml ids `agent-website/ops/infra/test/db/security`, but the discovered agent pages come from `.claude/agents/bachelorprojekt-<x>.md` (verified files: `bachelorprojekt-website.md`, `…-ops.md`, `…-infra.md`, `…-test.md`, `…-db.md`, `…-security.md`), and the page slug is `basename(md,'.md')` → `bachelorprojekt-<x>` (`discover.mjs` line 98). So the emitter MUST map the tools.yaml id `agent-<x>` → slug `bachelorprojekt-<x>` before emitting `[[bachelorprojekt-<x>]]`. Emitting `[[agent-website]]` would dangle (it is a design-time dead link, not a future-rename risk).
- `task-oracle` is `kind: task` and has **no** `.claude/skills/task-oracle/` directory, so no discovered page exists. The emitter MUST render it as a plain `[task-oracle](<url-from-links>)` link (or styled non-link text), never a `[[…]]` wikilink.

The single mapping rule the emitter applies: emit `[[slug]]` **only** when the resolved slug is one the docs generator will discover (spine skills → own slug; agents → `bachelorprojekt-<x>`); otherwise emit a plain `[label](url)`. (Agent pages are discovered as `type: agent`, `discover.mjs` lines 94–101; the generator resolves `[[…]]` against the registry and rewrites relative `.md` links, `render-markdown.mjs` lines 226–262.)

### `30-bausteine.md` — Lens 3, the platform components (GENERATED)
One H2 per `components.yaml` entry (~28 software + 9 hardware), grouped software-first then hardware. Each: `emoji` + `name`, a `kind` pill, `what_for_de` (the longer description), a `sensitivity` danger badge via `tierFor`, and `url`/`links` as plain `[label](url)` links. This is the docs-site rendering of the enriched hub; the website's in-app hub (S2) is separate and DB-seeded.

### Grouping on the docs site
All four pages are `type: doc`. The generator lists them in the **Docs** section index (`scripts/build-docs.mjs` lines 204–214, `renderSectionIndex` in `templates.mjs` lines 187–207) and on the domain-clustered landing graph. Two distinct clustering mechanisms apply, and they behave differently:

- **Landing graph** clusters nodes *by domain* (graph layout groups by domain). Declaring `domain: general` on all four keeps them together there.
- **Docs section index** does **not** cluster by domain. `renderSectionIndex` filters by `type` and renders cards in the order the `pages` array carries them (lines 188 + 211–212), and that order is the discovery order: `discoverSources` sorts by `(type, sourcePath.localeCompare)` (`discover.mjs` lines 173–176). Because all four files share the `docs/agent-guide/` path prefix and `00`/`10`/`20`/`30` numeric filename prefixes, they sort *lexically adjacent by `sourcePath`* in the Docs index — so they cluster there by **filename prefix**, independent of domain.

To keep the pages from being mis-attributed to a brand/role domain on the graph (and to make the assignment deterministic), every generated page declares `domain: general` in frontmatter (see §6). `00-anleitung.md` does the same so the four travel together on the graph.

## 6. Data consumed (registry fields used) + generated artifact shape

### Registry fields consumed per page
- **`10-ziele.md`** ← `goals.yaml`: `id`, `title_de`, `when_de`, `flow[].{tool,note_de}`, `example_prompt_de`, `danger`, `guardrails`, `related`. Resolves `danger` → `taxonomy.yaml` (`emoji`, `label_de`) via `tierFor`; resolves `flow[].tool` → `tools.yaml` via `toolById` (for the display name + wikilink/slug target); resolves `guardrails` → `guardrails.yaml` via `guardrailById` (`name_de`).
- **`20-werkzeuge.md`** ← `tools.yaml`: `id`, `name_de`, `kind`, `summary_de`, `what_for_de`, `how_to_start_de`, `what_could_go_wrong_de`, `danger`, `guardrails`, `related`, `links`. Resolves `danger`, `guardrails` as above; maps `id`→discovered slug per §5 for the wikilink.
- **`30-bausteine.md`** ← `components.yaml`: `slug`, `kind`, `name`, `emoji`, `what_for_de`, `sensitivity`, `url`, `links`. Resolves `sensitivity` → taxonomy via `tierFor`. (`summary_de` and `placeholder_en` are the DB-seed / webapp fields — used by S2's `gen-platform-descriptions.mjs`, not by S1.)
- **`taxonomy.yaml`** is read by all three to render danger badges (`emoji` + `label_de`).

### The `domain:` frontmatter decision
The generator recognises a `domain:` frontmatter key and accepts it only if it is one of `DOMAINS = ['website','ops','infra','test','db','security','general']` (`scripts/docs-gen/registry.mjs` line 35; consumed in `assignDomain` step 2, lines 169–176, fed from frontmatter by `buildPages` line 232 via `firstString(data,['domain'])`). No **published** `docs/*.md` currently declares `domain:` — the only file that does (`docs/superpowers/specs/2026-05-30-fleet-unified-cluster-design.md`) lives in the `docs/superpowers/specs` subtree, which discovery explicitly excludes (`discover.mjs` lines 16–19), so it never reaches `buildPages`. S1 is therefore the first **published** doc to drive its domain from frontmatter. Without it, the keyword fallback (`assignDomain` step 3, lines 177–189) would mis-route these pages: a goals page mentioning "website", "deploy", or "test" would be silently assigned to a brand/role domain by accident.

**Decision: all four pages declare `domain: general`.** Rationale: this guide is cross-cutting operator onboarding, not the property of any one routing role in the CLAUDE.md table. `general` is the canonical catch-all in `DOMAINS` and the value the graph already uses for unmatched pages (`registry.mjs` line 34 comment: "`null` domains are treated as 'general' by the graph"). Declaring it explicitly makes the assignment deterministic rather than depending on keyword roulette, and keeps the four pages clustered together on the landing graph. (In the Docs section index the clustering is by filename prefix instead — see §5.)

### Generated artifact shape (header contract — FENCE FIRST)
Every GENERATED file MUST open with the YAML frontmatter fence as its **very first line**, because `parseFrontmatter`/`gray-matter` only treats a *leading* `---\n…\n---` fence as frontmatter, and the tolerant fallback `parseFrontmatterLoose` anchors its regex at `^---\r?\n` (`scripts/docs-gen/frontmatter.mjs` lines 21–24, 53). If any line — including an HTML comment — precedes the fence, gray-matter returns `data:{}` and treats the whole block as body, so `domain: general` is **never parsed** and `assignDomain` falls through to the keyword fallback (the exact mis-routing this spec prevents).

**Hard contract:**
1. Line 1 is `---` (opening fence).
2. The frontmatter carries `title:`, `domain: general`, and a `generated_by:` key that records the generator, so the "do not edit" signal survives even in the raw frontmatter:
   ```yaml
   generated_by: scripts/agent-guide/emit-docs.mjs
   ```
3. The closing `---` fence.
4. Immediately after the closing fence, a human-visible DO-NOT-EDIT HTML comment as the **first body line** (it passes through `marked.parse` untouched and is harmless in the published HTML), followed by the H1.

This ordering is mandatory; there is no "comment-first" variant. The unit test asserts each generated file's first line is exactly `---`, and the render smoke test asserts `domain` resolves to `general`.

### Short realistic snippet — top of `10-ziele.md`
```markdown
---
title: "Ziele — Was will ich tun?"
domain: general
generated_by: scripts/agent-guide/emit-docs.mjs
---
<!-- DO NOT EDIT — generated by scripts/agent-guide/emit-docs.mjs -->
# Ziele — „Ich will …"

> Diese Seite wird automatisch aus der Registry erzeugt
> (`docs/agent-guide/registry/goals.yaml`). Nicht von Hand bearbeiten.
> Zur Erklärung der Linsen: [[00-anleitung]].

## Ich will den Text der Website ändern

🟢 **Sicher** · Du kannst hier nichts kaputt machen.

**Wann?** Wenn du eine Überschrift, einen Preis oder einen Absatz
auf der Website (deiner öffentlichen Seite) anpassen willst.

**So gehst du vor:**

1. [[dev-flow-plan]] — beschreibt der KI dein Ziel; sie legt einen
   Plan an (eine Schritt-für-Schritt-Liste).
2. [[dev-flow-execute]] — die KI setzt den Plan um und öffnet einen
   Pull Request (Änderungsvorschlag).

**Diesen Prompt kannst du der KI geben:**

​```text
Ich möchte auf der Website den Preis für das Erstgespräch
von 90 € auf 120 € ändern. Bitte plane das und setze es um.
​```

**Schutzregeln (Guardrails):** Umgebung immer explizit angeben (G-ENV-EXPLICIT).

**Verwandt:** „Ich will einen Fehler auf der Website melden" (siehe unten).
```

(The `​```text` fences above carry a zero-width marker only so this spec's own code fence does not terminate; the emitter writes plain ```` ```text ````. The `[[dev-flow-plan]]`/`[[dev-flow-execute]]` wikilinks resolve because those spine-skill ids equal their discovered SKILL.md slugs; an agent reference would instead be emitted as `[[bachelorprojekt-website]]` per §5.)

## 7. Mechanism (the emitter + integration point, concrete file paths)

### 7.1 `scripts/agent-guide/load.mjs` — the shared reader (S1 introduces it)
S1 **owns** the introduction of the one-parse-path reader that S2 and S3 import. API:

```js
// scripts/agent-guide/load.mjs
/**
 * @param {string} dir  path to docs/agent-guide/registry
 * @returns {{ goals: object[], tools: object[], components: object[],
 *             taxonomy: object[], guardrails: object[] }}
 *   Arrays are the parsed top-level entry lists of each *.yaml, in file order.
 */
export function loadRegistry(dir) { /* parse {taxonomy,guardrails,tools,goals,components}.yaml */ }

/** taxonomy entry for an id, or undefined. */            export function tierFor(id) { … }
/** tools.yaml entry for an id, or undefined. */          export function toolById(id) { … }
/** guardrails.yaml entry for an id, or undefined. */     export function guardrailById(id) { … }
```

It refactors the inline `load(dir, file)` YAML parsing currently in `scripts/agent-guide/validate.mjs` (the F+B validator) into this single module. **Recommended but not forced:** refactor `validate.mjs` to import `loadRegistry` so there is exactly one parse path and the two cannot drift. This spec flags that refactor as optional — if a reviewer prefers to keep `validate.mjs` standalone for blast-radius reasons, `load.mjs` simply reuses the same `yaml@^2.8.3` dependency F+B already added to the root `package.json`. Either way, the helper signatures above are the **frozen contract** S2 and S3 declare as a prerequisite.

`load.mjs` uses the root devDependency `yaml@^2.8.3` (added by F+B; the loader pattern mirrors `validate.mjs`'s existing inline `load(dir,file)`).

### 7.2 `scripts/agent-guide/emit-docs.mjs` — the docs emitter
- Imports `loadRegistry`, `tierFor`, `toolById`, `guardrailById` from `./load.mjs`.
- Imports `validateRegistry` from `./validate.mjs` and runs it first; aborts non-zero on any error (mirrors the program-wide rule "never emit from an invalid registry"). Equivalently it can shell to `task test:agent-guide` — the spec uses the in-process `validateRegistry(dir, repoRoot)` call for speed.
- Renders three German Markdown strings (one per lens) using small pure template functions and writes them to `docs/agent-guide/{10-ziele,20-werkzeuge,30-bausteine}.md`. It does **not** write `00-anleitung.md` (hand-authored).
- **Wikilink-slug mapping** (per §5): a single helper resolves a tools.yaml id to the slug the docs generator discovers — spine skills (`dev-flow-*`) → identical slug; agents (`agent-<x>`) → `bachelorprojekt-<x>`; `task-oracle` and any tool without a discovered page → no wikilink (plain `[label](url)`). The emitter emits `[[slug]]` only for the mapped, discoverable slugs.
- **Determinism clause (enforced by the byte-identical fixture test in §8):** iterate every registry array strictly in file order (no sorting, no reordering); no `Date`/timestamps; no `Intl`/locale-dependent collation; no environment-dependent absolute paths in the output. This guarantees the CI `git diff` gate is meaningful across machines.
- Cross-links are emitted as the generator's native syntax: `[[<slug>]]` for in-repo page references (goals→tools/skills via mapped slugs, page→`00-anleitung`, agent→`bachelorprojekt-<x>`) and `[label](url)` for external `links`/`url` and for un-discoverable tools. The generator resolves `[[…]]` via `registry.resolve` and rewrites relative `.md` links (`scripts/docs-gen/render-markdown.mjs` lines 226–262); unresolved refs degrade gracefully to plain text and surface in the build report's `unresolved` list (`build-docs.mjs` lines 133, 143).

### 7.3 Build-docs integration — zero core changes
The existing recursive discovery walks `docs/**/*.md`, excluding only `docs/superpowers/specs` and `docs/superpowers/plans` (`scripts/docs-gen/discover.mjs` lines 16–19, 130–155). `docs/agent-guide/*.md` is **not** excluded, so all four pages are picked up automatically as `type: 'doc'`, `provenance: 'repo'`. They flow through `buildPages` → `renderMarkdown` → `renderPage` and are written to `k3d/docs-content-built/<slug>.html` by `runBuild` (`build-docs.mjs` lines 140–153). They appear in the Docs section index (lines 204–214), the search index (`search.json`), and the landing graph — all for free.

**One caveat to verify in implementation:** `discover.mjs` does not currently exclude `docs/agent-guide/registry/`. The registry YAMLs are not `.md` files, so the `*.md` walk filter (`discover.mjs` line 148, `e.name.endsWith('.md')`) skips them — no extra exclusion is needed. (Confirmed: discovery only collects `.md` entries.)

### 7.4 Taskfile entries
Add to `Taskfile.yml`, alongside the existing `docs:build` (line 2009) and `db:diagram` (line 1166) precedents:

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

`agent-guide:webapp` (S2) and `agent-guide:maps` (S3) are added by their respective sub-projects; the umbrella `agent-guide:emit` is created here and extended by them.

### 7.5 Deploy — unchanged
Publishing rides the existing `task docs:deploy` (`Taskfile.yml` lines 2014–2036): it re-runs `node scripts/build-docs.mjs`, rebuilds `ghcr.io/paddione/workspace-docs:latest` from `scripts/docs.Dockerfile`, and rolls out the `docs` Deployment on both clusters. The `docs-v*`-tag CI workflow (`.github/workflows/build-docs.yml`) does the same on release. No new deploy path, no `docs.yaml` change.

## 8. Verification (tests + CI freshness gate)

### Unit tests (node --test)
Add `scripts/agent-guide/emit-docs.test.mjs` and `scripts/agent-guide/load.test.mjs`, run via the F+B-wired `task test:agent-guide` (already a dep of `test:all`). Assertions:
- `loadRegistry` returns the five arrays; `tierFor`/`toolById`/`guardrailById` resolve known ids and return `undefined` for unknown ones.
- The emitter produces deterministic output (rendering the same fixture registry twice is byte-identical).
- **Each generated page's first line is exactly `---`** (fence-first contract), the frontmatter carries `domain: general` and `generated_by: scripts/agent-guide/emit-docs.mjs`, and the first body line is the DO-NOT-EDIT comment.
- Every `flow[].tool` / `guardrails` / `danger` id in the fixture resolves (no dangling reference renders as a raw id).
- **Every emitted `[[…]]` target equals a slug the docs generator will discover.** The test builds a small fixture set of discovered slugs — the four `dev-flow-*` spine skills plus `bachelorprojekt-website/ops/infra/test/db/security` — and asserts membership for every wikilink the emitter writes; and asserts `task-oracle` is emitted as a plain `[…](…)` link, never a wikilink. This closes the registry-resolves-but-wikilink-dangles gap (the agent id→slug mismatch).
- The emitter aborts (non-zero) when handed an invalid registry (validate-first guarantee).

### Render smoke test (reuse the existing harness)
The docs-gen smoke harness (`scripts/docs-gen/build-smoke.test.mjs`, run by `task test:docs-gen`) builds a fixture repo through `runBuild`. Extend it (or add a focused test) to drop the four `docs/agent-guide/*.md` into the fixture and assert:
- they are discovered and rendered to `<slug>.html`;
- the `domain` resolves to `general` (via `buildPages`/`assignDomain`) — proving the fence-first frontmatter parses;
- a `[[10-ziele]]` wikilink in `00-anleitung.md` rewrites to `./10-ziele.html` (resolved, not in the `unresolved` report list);
- an agent wikilink `[[bachelorprojekt-website]]` resolves to the rendered agent page (and is **not** in `unresolved`), confirming the id→slug mapping works end-to-end in the real build.

### CI freshness gate (mirror test-inventory)
Add a step to `.github/workflows/ci.yml` immediately after the existing "Verify test inventory is up to date" step (lines 38–43), using the identical pattern:

```yaml
- name: Verify agent-guide docs are up to date
  run: |
    task agent-guide:docs
    if ! git diff --exit-code docs/agent-guide/10-ziele.md docs/agent-guide/20-werkzeuge.md docs/agent-guide/30-bausteine.md; then
      echo "ERROR: generated agent-guide docs are stale — run 'task agent-guide:docs' locally and commit"
      exit 1
    fi
```

The glob targets **only the generated trio**; `00-anleitung.md` is intentionally excluded so hand edits never trip the gate. CI already runs `npm ci` so the `yaml` dependency F+B added is present, and `task test:all` already runs `task test:agent-guide` transitively.

## 9. Risks & open items

- **R1 — Prerequisite ordering.** S1 cannot merge before F+B lands the registry + `validate.mjs` + root `yaml` dep. Confirmed absent in the current worktree (`/tmp/wt-agent-guide-surfaces` has no `docs/agent-guide/`, no `scripts/agent-guide/`, no root `yaml` devDependency). Mitigation: S1's PR declares F+B as a merge prerequisite; CI on the S1 branch only goes green once F+B is in `main`.
- **R2 — `domain: general` keyword bleed.** If a future maintainer drops `domain: general` from a generated page, the keyword fallback (`assignDomain` step 3) would mis-route it. Mitigation: the emitter always writes `domain: general` as the second frontmatter line; the unit test asserts its presence; the freshness gate catches drift.
- **R3 — Wikilink-slug mismatch (design-time, not just rename-time).** Two classes: (a) tools.yaml agent ids `agent-<x>` ≠ discovered slugs `bachelorprojekt-<x>`, and `task-oracle` has no discovered page at all — both are design-time dead links if emitted naïvely. Mitigation: the emitter's id→slug mapping (§5, §7.2) plus the unit assertion that every `[[…]]` target is a discoverable slug and the smoke assertion that `[[bachelorprojekt-website]]` resolves. (b) Future renames of a spine skill or agent page would re-introduce a dangling link; the smoke test on the headline links and the build report's `unresolved` list surface such regressions.
- **R4 — Frontmatter fence ordering.** The fence MUST be line 1 or `domain: general` is silently ignored (parses as body). Mitigation: hard contract in §6, a unit assertion that line 1 is exactly `---`, and the render smoke test asserting `domain` resolves to `general`.
- **R5 — Snapshot pruning.** `build-docs.mjs` prunes unused mermaid snapshots (lines 240–253). The agent-guide pages contain no diagrams, so they neither create nor strand snapshots — no interaction. (Noted to preempt a false-positive review concern.)
- **Open item:** whether to also link the four pages from the docs landing hero copy. Deferred — the landing graph and Docs section index already surface them; a hand-edit to the landing template is optional polish, not required for S1.

## 10. Prerequisites & build order

- **Prerequisite:** sub-project **F+B** merged to `main` — provides `docs/agent-guide/registry/*.yaml`, `scripts/agent-guide/validate.mjs` (`validateRegistry(dir, repoRoot)`), root `yaml@^2.8.3`, and `task test:agent-guide` (already a dep of `test:all`).
- **Merge/build order for the three surfaces: S1 → S2 → S3.** S1 is the **first** surface to merge because it introduces `scripts/agent-guide/load.mjs` — the shared reader S2 and S3 import. S2 and S3 each declare `load.mjs` a prerequisite and are otherwise self-contained.
- S1 itself is self-contained beyond the F+B prerequisite: it adds `load.mjs`, `emit-docs.mjs`, the four `docs/agent-guide/*.md` (three generated + one hand-authored), the Taskfile entries, the tests, and the CI gate. It requires **no** change to the core `scripts/docs-gen/` modules or `scripts/build-docs.mjs` (in particular, no new `buildPages` special-case — unlike `db-schema-diagram`, S1 drives its domain through frontmatter).

## 11. Downstream (what this unblocks)

- **S2 (webapp surface)** imports `loadRegistry`/`tierFor`/`toolById`/`guardrailById` from the `load.mjs` S1 introduces, and adds `task agent-guide:webapp` under the `agent-guide:emit` umbrella S1 created. It renders the enriched hub into the Astro website (DB-seeded via F+B's `gen-platform-descriptions.mjs`).
- **S3 (agent-map surface)** likewise imports `load.mjs` and adds `task agent-guide:maps`; it emits terse, grep-friendly Markdown tables linked from `CLAUDE.md` for the LLM-agent audience. S1's human pages and S3's agent maps are deliberately distinct surfaces over the same registry.
- **Sub-project E (enforcement hooks, later cycle)** is a downstream *consumer of the taxonomy and guardrail ids* that S1 renders in "docs-only" treatment. S1 makes those ids visible to humans; E will wire `enforced_by` hooks. Out of scope here; mentioned only as the eventual destination of the taxonomy.

## 12. Deliverables checklist (for the plan)

- [ ] `scripts/agent-guide/load.mjs` — `loadRegistry(dir)` + `tierFor`/`toolById`/`guardrailById`; uses root `yaml@^2.8.3`.
- [ ] (Optional, recommended) refactor `scripts/agent-guide/validate.mjs` to import `loadRegistry` so there is one parse path.
- [ ] `scripts/agent-guide/emit-docs.mjs` — validate-first; deterministic (file-order, no Date/Intl/abs-paths); fence-FIRST frontmatter (`title`, `domain: general`, `generated_by`) + DO-NOT-EDIT comment as first body line; id→slug wikilink mapping (spine skills→own slug, agents→`bachelorprojekt-<x>`, task-oracle/un-discoverable→plain link); writes `docs/agent-guide/{10-ziele,20-werkzeuge,30-bausteine}.md`.
- [ ] `docs/agent-guide/00-anleitung.md` — hand-authored German landing ("Was will ich tun?"), wikilinking the three generated pages.
- [ ] `docs/agent-guide/10-ziele.md`, `20-werkzeuge.md`, `30-bausteine.md` — committed generated output (run `task agent-guide:docs`).
- [ ] `Taskfile.yml` — add `agent-guide:docs` and umbrella `agent-guide:emit`.
- [ ] `.github/workflows/ci.yml` — add the `git diff --exit-code docs/agent-guide/{10-ziele,20-werkzeuge,30-bausteine}.md` freshness step (after the test-inventory step, lines 38–43).
- [ ] `scripts/agent-guide/load.test.mjs` and `scripts/agent-guide/emit-docs.test.mjs` (run by `task test:agent-guide`) — including the fence-first assertion and the every-`[[…]]`-target-is-a-discoverable-slug assertion.
- [ ] Extend `scripts/docs-gen/build-smoke.test.mjs` (or add a focused test) to assert discovery, `domain: general` resolution, and `[[…]]` wikilink resolution (incl. `[[bachelorprojekt-website]]`) for the agent-guide pages.
- [ ] Verify locally: `task agent-guide:docs` → `git status` clean re-run; `task docs:build` renders the four `*.html` into `k3d/docs-content-built/`; `task test:all` green.
- [ ] PR + internal ticket; PR body notes F+B as merge prerequisite and S1→S2→S3 order.
