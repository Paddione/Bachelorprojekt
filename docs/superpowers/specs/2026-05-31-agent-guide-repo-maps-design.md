# Design Spec — AI-Agent Guide: Repo-Map Surface (S3)

**Date:** 2026-05-31
**Branch:** feature/agent-guide-maps
**Status:** approved design (brainstorming complete), spec for review
**Program:** AI-Agent Operating Guide & Guardrails — sub-project **S3** (Repo-Map surface), one of six.

---

## 1. Problem & Motivation

The program produced a single source of truth (SSOT): a YAML registry under `docs/agent-guide/registry/` (taxonomy, guardrails, tools, goals, components) plus a validator. That registry is *data*. On its own it teaches nobody and routes nothing — it has to be **rendered for a specific audience**.

There are two distinct readers of this material, and the cardinal mistake would be to serve them the same artifact:

1. A **human operator in a browser** on the docs site (`docs.<domain>`) who needs teaching prose, worked examples, and links they can click. That is sub-project **S1**.
2. An **LLM agent (and the operator) reading files directly inside Claude Code** — grepping the repo, following a link from `CLAUDE.md`, deciding which skill/agent/goal applies to a request. This reader does not want prose. It wants a terse, scannable, deterministic **map**: "Ich will X → run this flow → danger tier Y → guardrails Z." That is sub-project **S3**, the surface specified here.

Today the agent has the Agent Routing table in `CLAUDE.md` (lines 3-14) and `.claude/skills/OVERVIEW.md`, but those are **hand-maintained**, list *agents* and *skills* but not the operator's **goals**, and carry **no danger taxonomy and no guardrail references**. When the registry changes (a new goal, a re-tiered guardrail), nothing in the repo updates. S3 closes that gap: it generates committed, registry-derived Markdown maps that an agent can rely on as the routing-and-safety contract preview, kept fresh by a CI gate.

The "one real subtlety" this spec must resolve (see §9 and §7.4): the maps live under `docs/`, and the docs-site generator (`scripts/docs-gen/discover.mjs`) recursively scans `docs/**/*.md` (function `discoverDocs`, lines 131-155). So the maps will be **picked up by the docs build too** unless we decide otherwise. This spec makes that decision explicitly.

---

## 2. Audience persona

The program's primary persona is **one inexperienced solo operator**, German-speaking, working *inside* the repo via Claude Code. They know *what* they want ("ändere den Website-Text", "fix diesen Bug") but not *how* the tooling works, and they need guardrails so they "can't do anything wrong." All operator-facing text is **German, Du-form**, friendly, every technical term explained in parentheses on first use.

S3 has a **second, equal reader the other surfaces do not share: the LLM agent itself.** The maps are written so that:
- the **operator** can open `docs/agent-guide/maps/goals-map.md` in the editor and find the right entry point by scanning the "Ich will …" column, and
- the **agent** can grep the same file and deterministically map an intent to a flow, a danger tier, and the guardrail ids it must honor.

Concretely this means the German `*_de` registry fields are rendered verbatim (for the human), while the structural columns — tool ids, taxonomy ids, guardrail ids — are rendered as **stable kebab-case identifiers** (for the agent). The maps are terse: tables and short lists, never paragraphs. Teaching, examples, and "warum" narration are explicitly **out of scope here** — that is S1's job (§3).

---

## 3. Goals / Non-goals

### Goals
- Add an emitter `scripts/agent-guide/emit-maps.mjs` that reads the registry through the **shared reader `scripts/agent-guide/load.mjs`** (introduced by S1; see §10) and writes three **committed** Markdown maps under `docs/agent-guide/maps/`:
  - `goals-map.md` — one row per goal: *Ich will … → Weg (flow) → Tier → Guardrails*.
  - `tools-map.md` — compact reference of the beginner-spine skills + the 6 routing agents (id, kind, danger, one-liner).
  - `danger-map.md` — the 4 tiers, and which goals/tools (and, transitively, guardrails) fall under each (the enforcement-contract preview).
- Each generated file carries a `<!-- DO NOT EDIT … -->` header naming the emitter.
- Validate the registry (F+B's `validateRegistry` / `task test:agent-guide`) **before** emitting; never emit from an invalid registry.
- Add **one hand-written discovery pointer** to `CLAUDE.md` and to `.claude/skills/OVERVIEW.md`. The pointer line is authored once by a human, not generated.
- Wire a `task agent-guide:maps` Taskfile entry and a **CI freshness gate** (`git diff --exit-code docs/agent-guide/maps/`) that mirrors the existing test-inventory step exactly.
- Resolve the docs-build double-pickup explicitly (§7.4): **exclude** `docs/agent-guide/maps/` from the docs-site generator via the existing prefix mechanism.

### Non-goals (explicit deferrals)
- **No teaching prose, no HTML, no docs-site rendering.** That is **S1** — human teaching pages rendered to HTML at `docs.<domain>`. S1 and S3 consume the *same registry* but use a *different template and serve a different audience*. They are deliberately **not** collapsed: S1 = teaching pages on the docs **site** for a human in a browser; S3 = terse agent-facing maps in the **repo**, linked from `CLAUDE.md`. (Sharpened further in §9.)
- **No in-app web component / hub render.** That is **S2** (`agent-guide:webapp`).
- **No auto-injection of generated content into `CLAUDE.md` / `AGENTS.md` / `GEMINI.md`.** Those are authoritative agent-routing files; only a **single hand-added pointer line** goes in (§7.3).
- **No enforcement hooks.** The danger taxonomy and `enforced_by` fields are surfaced as a *preview* of the enforcement contract; actually wiring hooks is **sub-project E**, a later cycle, and only a downstream consumer of this taxonomy (§11).
- **No new registry fields.** S3 is a pure renderer; if a column needs data the registry lacks, that is an F+B change, not an S3 change. In particular, S3 derives a guardrail's tier **transitively** from the goals/tools that reference it (§5.3/§6.1) rather than asking F+B to add a `danger` field to `guardrails.yaml`.
- **No edits to the existing docs-gen pipeline behavior** beyond adding one entry to its exclusion list (§7.4).

---

## 4. Architecture

```
docs/agent-guide/registry/*.yaml        (SSOT — produced by F+B)
            │
            │  loadRegistry(dir)         (shared reader — produced by S1: scripts/agent-guide/load.mjs)
            ▼
   ┌─────────────────────────────────────────────┐
   │  scripts/agent-guide/emit-maps.mjs   (S3)    │
   │  1. validateRegistry(dir, repoRoot)  ── fail-closed on invalid
   │  2. loadRegistry(dir) → {goals,tools,         │
   │       components,taxonomy,guardrails}         │
   │  3. render 3 Markdown templates              │
   │  4. write docs/agent-guide/maps/*.md         │
   └─────────────────────────────────────────────┘
            │
            ▼
   docs/agent-guide/maps/{goals,tools,danger}-map.md   (COMMITTED, reviewable in PRs)
            │                         ▲
            │ linked from             │ freshness: task agent-guide:maps + CI git diff --exit-code
            ▼                         │
   CLAUDE.md + .claude/skills/OVERVIEW.md   (one hand-added pointer line each)

   docs/agent-guide/maps/  ──✗──▶  scripts/docs-gen/discover.mjs   (EXCLUDED — added to DOC_EXCLUDE_PREFIXES)
```

Three load-bearing architectural choices, all consistent with the rest of the program:

1. **One parse path.** S3 never parses YAML directly. It calls `validateRegistry` and then `loadRegistry`, both of which — **post-S1** — route through the single parse path in `scripts/agent-guide/load.mjs`. This is part of S1's contract: S1 refactors the YAML loading currently inline in `validate.mjs` *out into* `load.mjs`, so `validateRegistry` and `loadRegistry` share one reader and produce byte-identical registry semantics for S1, S2, and S3. The merge order **S1 → S2 → S3** exists precisely so this shared reader is present before S3 needs it (§10). (Until S1 lands, S3 is developed against a local stand-in of `loadRegistry`; the "one parse path" guarantee holds only after the real import is switched in — see §9.)
2. **Generated artifacts are committed, not built on the fly.** The maps live in git, are diffable in PRs, and are guarded by a CI freshness gate — mirroring the established `website/src/data/test-inventory.json` pattern (`scripts/build-test-inventory.sh` + the ci.yml "Verify test inventory is up to date" step at lines 38-44). The agent reads a checked-in file; it never runs a generator.
3. **Fail-closed on an invalid registry.** The emitter runs F+B's validator first and exits non-zero before writing anything, so a malformed registry can never produce a malformed (but committed-looking) map.

---

## 5. Information architecture / what gets rendered

Three files, each a thin template over the same registry. All are terse — tables and short lists only. **Every row in every table is sorted by entity `id`** (goals, tools, taxonomy entries, guardrails) so diffs are deterministic and the freshness gate never flaps (§6.2).

### 5.1 `goals-map.md` — the intent → flow → safety map
The primary agent-routing artifact. One row per `goals.yaml` entry, **sorted by goal `id`**.

| Column | Source | Form |
|---|---|---|
| **Ich will …** | `goal.title_de` | German prose (human) |
| **Weg (Flow)** | `goal.flow[].tool` joined ` → ` | tool **ids** (agent) |
| **Tier** | `goal.danger` → `tierFor(id)` | emoji + `label_de` |
| **Guardrails** | `goal.guardrails[]` | guardrail **ids** |
| **Prompt** | `goal.example_prompt_de` | verbatim German (operator copy-paste) |

A short preamble names the file's purpose and points at `tools-map.md` / `danger-map.md` for the id legends. Free-text cells (`title_de`, `example_prompt_de`) are passed through the cell-escaping invariant in §6.2 so a prompt containing a literal `|` cannot break the GFM table.

### 5.2 `tools-map.md` — the beginner-spine + 6 agents reference
One row per `tools.yaml` entry. To avoid mislabeling `task-oracle` (which is `kind: task`) as a skill, entries are grouped into **three** sections, in this fixed order: **Skills** (`kind: skill`), **Tasks** (`kind: task`), **Agenten** (`kind: agent`). Within each section, rows are **sorted by tool `id`**. (Equivalently: a single section heading "Skills & Tasks" could carry both, but separate "Skills" and "Tasks" groups are clearer for the agent and are the chosen rendering.)

| Column | Source | Form |
|---|---|---|
| **Id** | `tool.id` | stable id (agent) |
| **Name** | `tool.name_de` | German (human) |
| **Art** | `tool.kind` | `skill` / `task` / `agent` |
| **Tier** | `tool.danger` → `tierFor` | emoji + `label_de` |
| **Wofür** | `tool.summary_de` | one-liner German |
| **Guardrails** | `tool.guardrails[]` | ids |

### 5.3 `danger-map.md` — the enforcement-contract preview
The 4 tiers from `taxonomy.yaml` (`safe` 🟢, `caution` 🟡, `assisted` 🟠, `forbidden` 🔴), in canonical tier order (`safe → caution → assisted → forbidden`), each as a small section:
- heading: `emoji label_de` + `meaning_de`;
- `enforcement_default` rendered as a labeled line (so the agent sees the intended default before sub-project E exists);
- a bullet list of **goals** at that tier (`goal.danger` resolves here → `id` + `title_de`), sorted by goal id;
- a bullet list of **tools** at that tier (`tool.danger` resolves here → `id` + `name_de`), sorted by tool id;
- a bullet list of **guardrails** that fall under this tier **transitively** — i.e. every guardrail referenced by at least one goal or tool of this tier (id + `name_de`), sorted by guardrail id, de-duplicated within the tier.

**Why transitive?** `guardrails.yaml` entries carry **no `danger`/tier field** (the F+B contract is `id`, `name_de`, `rule_de`, `why_de`, `enforced_by`). Tiers attach only to **goals** and **tools** (which have a `danger` field). A guardrail therefore has no intrinsic tier; S3 assigns it the tier(s) of the goals/tools that *use* it. A guardrail referenced from goals/tools of more than one tier appears under **each** such tier (clearly the correct semantics: a "pull-first" rule that gates both a 🟡 and a 🔴 flow is relevant to both). This needs no registry change and keeps S3 a pure renderer.

This is the file that makes the taxonomy the connective tissue: it cross-references goals, tools, and guardrails back to their tier, giving the agent a single place to answer "wie gefährlich ist das, und welche Regeln gelten?".

A short legend at the top of `goals-map.md`/`tools-map.md` (or a shared note pointing at `danger-map.md`) explains the four emoji once.

---

## 6. Data consumed (registry fields used) + generated artifact shape

### 6.1 Registry fields consumed
- **goals.yaml:** `id`, `title_de`, `flow[].tool`, `danger`, `guardrails[]`, `example_prompt_de`. (`when_de`, `flow[].note_de`, `related` are **not** rendered — they belong to S1's teaching surface; keeping them out preserves S3's terseness.)
- **tools.yaml:** `id`, `name_de`, `kind`, `summary_de`, `danger`, `guardrails[]`. (`what_for_de`, `how_to_start_de`, `what_could_go_wrong_de`, `related`, `links` are S1-surface fields, omitted here.)
- **taxonomy.yaml:** `id`, `label_de`, `emoji`, `meaning_de`, `enforcement_default`.
- **guardrails.yaml:** `id`, `name_de` — used to resolve guardrail names wherever an id is referenced from goals/tools, and to label guardrails in `danger-map.md`'s transitive per-tier lists. (`rule_de`, `why_de`, `enforced_by` are not expanded in the terse map; in particular `guardrails.yaml` has **no** tier field, which is why `danger-map.md` derives a guardrail's tier transitively from referencing goals/tools — see §5.3.)
- **components.yaml:** **not consumed by S3.** Components are a hub/docs-site concern (S1/S2). S3 stays focused on goals/tools/danger routing.

Helpers from the shared reader are used directly: `tierFor(id)` to resolve a `danger` id to its taxonomy entry (emoji + label), `toolById(id)` to validate that every `flow[].tool` resolves, `guardrailById(id)` to resolve guardrail names. A referenced id that does not resolve is a **hard error** in the emitter (caught earlier by `validateRegistry`, but defended again here so a partial registry can never emit a map with dangling ids).

### 6.2 Generated artifact shape
Each file is plain GitHub-Flavored Markdown, **no YAML frontmatter** (frontmatter would be noise for the agent reader and risks the docs-gen frontmatter parser treating these as publishable pages — see §7.4). Every file begins with the exact header:

```markdown
<!-- DO NOT EDIT — generated by scripts/agent-guide/emit-maps.mjs; edit the registry -->
```

**Determinism invariants.** Output is fully deterministic so `git diff --exit-code` is meaningful and the freshness gate never flaps:
- stable sort by `id` within every table/list (§5),
- fixed column order,
- no timestamps or host-specific data,
- LF line endings, single trailing newline.

**Cell-escaping invariant (table-safety).** Registry free-text fields (`title_de`, `example_prompt_de`, and any `*_de` rendered into a table cell) are German prose that will frequently contain the pipe character `|`, the arrow `→`, or embedded newlines — any literal `|` breaks GFM table rendering and any newline breaks the row. The renderer therefore applies a single escaping pass to **every** value placed in a table cell:
- replace each `|` with `\|`,
- collapse any run of whitespace containing a newline (`\r`/`\n`) to a single space,
- trim leading/trailing whitespace.

This is a renderer-level invariant (applied uniformly, not per-field) so that no future free-text field can silently break a table. It is asserted by a unit test (§8.1: a goal whose `example_prompt_de` contains a `|` must render as `\|` and keep the row intact). Bullet-list values in `danger-map.md` are not table cells but still get newline-collapsing for one-line-per-bullet stability.

### 6.3 Realistic snippet — `goals-map.md`

```markdown
<!-- DO NOT EDIT — generated by scripts/agent-guide/emit-maps.mjs; edit the registry -->

# Ziel-Karte (Goals Map)

Diese Datei ist die Routing-Karte für Agenten und Operator: Intention → Weg → Gefahr → Regeln.
Die Tier-Emojis (🟢🟡🟠🔴) sind in `danger-map.md` erklärt, die Werkzeug-Ids in `tools-map.md`.

| Ich will … | Weg (Flow) | Tier | Guardrails | Prompt |
|---|---|---|---|---|
| Ich will den Website-Text ändern | dev-flow-plan → dev-flow-execute | 🟡 Vorsicht | G-PULL-FIRST, G-PR-ONLY | „Ändere auf der Startseite den Begrüßungstext zu …“ |
| Ich will einen Bug beheben | dev-flow-plan → dev-flow-iterate → dev-flow-execute | 🟡 Vorsicht | G-PULL-FIRST, G-PR-ONLY | „Fix den Fehler: Login-Knopf reagiert nicht …“ |
| Ich will ein Passwort/Secret rotieren | agent-security | 🔴 Niemals allein | G-ENV-EXPLICIT, G-SEAL-ORDER | „Rotiere das DB-Passwort für die mentolder-Umgebung …“ |
| Ich will wissen, ob ein Dienst läuft | agent-ops | 🟢 Sicher | — | „Läuft Nextcloud auf mentolder gerade?“ |
```

(Values are illustrative; the emitter renders verbatim from the registry, sorted by goal `id`. The dash `—` is the rendering for an empty `guardrails[]`. A `|` appearing inside any cell value is emitted escaped as `\|` so the table never breaks.)

---

## 7. Mechanism (the emitter + integration points, concrete file paths)

### 7.1 Emitter — `scripts/agent-guide/emit-maps.mjs`
A single ESM module, runnable as a CLI (`node scripts/agent-guide/emit-maps.mjs`) and importable for tests. Behavior:
1. Resolve `registryDir = docs/agent-guide/registry` and `repoRoot` relative to the module (mirroring how `scripts/build-test-inventory.sh` derives `REPO_ROOT` from `BASH_SOURCE` at line 5, and how F+B's `scripts/agent-guide/validate.mjs` resolves paths).
2. `validateRegistry(registryDir, repoRoot)` — F+B's export. On any error, print the validator's diagnostics and `process.exit(1)` **before writing anything**.
3. `loadRegistry(registryDir)` from `scripts/agent-guide/load.mjs` (S1) → `{ goals, tools, components, taxonomy, guardrails }` plus helpers `tierFor`, `toolById`, `guardrailById`. (Both `validateRegistry` and `loadRegistry` share the single `load.mjs` parse path post-S1 — see §4 claim 1.)
4. Render the three templates (pure string functions: `renderGoalsMap`, `renderToolsMap`, `renderDangerMap` — exported so tests can assert on output without touching disk). Each cell-bound value goes through the shared `escapeCell()` helper (§6.2).
5. Write `docs/agent-guide/maps/goals-map.md`, `tools-map.md`, `danger-map.md` (create the dir if absent).
6. Print a one-line summary per file (`Wrote N goal rows to …`), matching the existing build-test-inventory ergonomics (`echo "Wrote …"` at line 49 of `build-test-inventory.sh`).

The emitter does **no YAML parsing of its own** — that is the whole point of depending on S1's `load.mjs`.

### 7.2 Taskfile — `agent-guide:maps`
Add a task that mirrors `test:inventory` (Taskfile.yml lines 360-363):

```yaml
  agent-guide:maps:
    desc: Regenerate docs/agent-guide/maps/*.md from the agent-guide registry
    cmds:
      - node scripts/agent-guide/emit-maps.mjs
```

It joins the umbrella `agent-guide:emit` (alongside S1's `agent-guide:docs` and S2's `agent-guide:webapp`), per the approved Taskfile additions. The umbrella is defined by whichever surface merges the scaffold (S1, first to merge); S3 contributes the `agent-guide:maps` leaf and appends it to `agent-guide:emit`'s `cmds`/`deps`.

Two test-running concerns must be kept distinct here:
- **The emit-maps UNIT tests run in `task test:all`.** They are added to F+B's `task test:agent-guide` `node --test` glob (which globs `scripts/agent-guide/*.test.mjs`), and F+B has already wired `test:agent-guide` into `test:all`'s deps (per PROGRAM CONTEXT). So `scripts/agent-guide/emit-maps.test.mjs` runs inside `test:all`.
- **The git-diff FRESHNESS gate does NOT run in `test:all`.** It lives solely as a dedicated step in `ci.yml` (§8.2), exactly like the test-inventory gate — `test:inventory` (lines 360-363) is likewise *not* a `test:all` dep (`test:all` deps are lines 350-358); the freshness check is the separate ci.yml step at lines 38-44. S3 follows that precedent: unit tests in `test:all`, freshness gate in `ci.yml` only.

### 7.3 Discovery pointer (hand-added, once)
Two one-line, human-authored pointers — **not generated, never auto-injected**:

- **`CLAUDE.md`** — a single line in the Agent Routing region (near lines 3-14, alongside the existing routing guidance). The pointer uses a **repo-relative inline-code path** (`docs/agent-guide/maps/`), which is portable and preferred over the machine/user-specific absolute `file:///home/patrick/Bachelorprojekt/docs/...` form used for the WSL-BOOTSTRAP link at line 202. Suggested text:
  > Für Ziel-, Werkzeug- und Gefahren-Routing siehe die generierten Karten unter `docs/agent-guide/maps/` (`goals-map.md`, `tools-map.md`, `danger-map.md`) — aus der Registry generiert, nicht von Hand editieren.

- **`.claude/skills/OVERVIEW.md`** — one line near the top pointing the agent at `docs/agent-guide/maps/goals-map.md` as the goal-level routing companion to the skill table.

Because `AGENTS.md` is a **symlink to `CLAUDE.md`** (verified: `AGENTS.md -> CLAUDE.md`), the `CLAUDE.md` pointer automatically appears in `AGENTS.md` with zero extra work — and we deliberately do **not** touch `GEMINI.md` (a separate, standalone satellite file, not a symlink) with generated content. This satisfies the "do not auto-inject into authoritative routing files" rule while still making the maps discoverable.

### 7.4 Docs-build double-pickup — **decision: exclude the maps from the docs site**
`scripts/docs-gen/discover.mjs` recursively walks `docs/**/*.md` in `discoverDocs()` (lines 131-155, `walk()` at 142-153) and would otherwise publish every map as a docs-site page. The pipeline's **only** exclusion mechanism is the hardcoded `DOC_EXCLUDE_PREFIXES` array (lines 16-19), matched by path prefix in the `excluded()` closure (lines 136-140) and applied both to directories (line 143) and files (line 148). There is **no** `publish:false`/`draft` frontmatter flag in the frontmatter parser to opt a single doc out (verified: the frontmatter reader recognizes only `title/name/description/summary/domain(s)`; the `draft` token in `registry.mjs` is an unrelated local variable, not a publish toggle).

**Decision (recommended): add `join('docs', 'agent-guide', 'maps')` to `DOC_EXCLUDE_PREFIXES`.** Rationale:
- The maps are **agent-facing repo artifacts**, not human teaching pages. Publishing terse id-tables to `docs.<domain>` would duplicate (and visually undercut) **S1's** purpose-built teaching pages for the same registry — exactly the S1/S3 collapse the program forbids (§3, §9). Two surfaces, two audiences; the docs site is S1's territory.
- The exclusion is a **one-line, low-risk** change to an existing, tested array. `scripts/docs-gen/discover.test.mjs` already covers the exclusion path for `docs/superpowers/specs` and `docs/superpowers/plans` (assertions at lines 70-71); we extend it and that test rather than introducing a new opt-out mechanism.
- It keeps the docs-site graph/navigation clean. The maps have no narrative body, only tables and id lists, so they would likely render as low-value or orphan pages on the public site graph (`scripts/docs-gen/graph-layout.mjs`) with nothing for cross-linking to anchor on.

Alternative considered and rejected: leave them published ("terse maps are harmless on the site"). Rejected because it blurs the S1/S3 boundary, creates a second, lower-quality rendering of the same data on the public site, and likely adds low-value pages to the docs graph. Excluding is cleaner and reversible (one array entry).

> Note: `docs/agent-guide/registry/*.yaml` are not `*.md`, so they are already invisible to `discoverDocs` (which only collects files whose name ends in `.md`, line 148); only `docs/agent-guide/maps/*.md` need the exclusion. If S1 places any narrative `*.md` *outside* `maps/` (e.g. `docs/agent-guide/` index pages intended for the site), those remain publishable — the exclusion is scoped to `maps/` exactly.

---

## 8. Verification (tests + CI freshness gate)

### 8.1 Unit tests — `scripts/agent-guide/emit-maps.test.mjs`
Run via `node --test` (the convention already used across `scripts/docs-gen/*.test.mjs` — see `test:docs-gen` at Taskfile line 348 — and F+B's `scripts/agent-guide/*.test.mjs`). Assertions, against a small fixture registry:
- **Header & rows:** `renderGoalsMap` emits the `DO NOT EDIT` header as line 1, one table row per goal (sorted by id), ids joined by ` → ` for flows, and `—` for empty guardrail lists.
- **Cell-escaping (table-safety):** a fixture goal whose `example_prompt_de` contains a literal `|` (and an embedded newline) renders with `\|` and a single-line cell — the table structure stays intact (asserts the §6.2 invariant).
- **Tools grouping:** `renderToolsMap` emits three sections in order — Skills (`kind: skill`), Tasks (`kind: task`), Agenten (`kind: agent`) — so `task-oracle` (kind:task) lands under "Tasks" and all 6 routing agents land under "Agenten"; rows within each section are sorted by id.
- **Danger map / transitive guardrails:** `renderDangerMap` lists exactly the 4 tiers in canonical order (`safe → caution → assisted → forbidden`); a goal/tool is bucketed under its own `danger` tier; and a guardrail referenced by a goal/tool of a given tier appears under **that** tier (transitive derivation, de-duplicated) — and a guardrail referenced from two different tiers appears under both.
- **Fail-closed:** given an invalid registry (a `flow.tool` id with no `tools.yaml` entry, or a `goal.danger` id with no taxonomy entry), the emitter throws / exits non-zero and writes **no** file.
- **Determinism:** rendering the same registry twice yields byte-identical output (sort stability, no timestamps, LF + trailing newline).

Add `scripts/agent-guide/emit-maps.test.mjs` so it is matched by the `test:agent-guide` task's `node --test scripts/agent-guide/*.test.mjs` glob (F+B wires that task into `test:all` deps), so it runs inside `task test:all`.

### 8.2 CI freshness gate — mirror test-inventory exactly
Add a step to the `offline-tests` job in `.github/workflows/ci.yml`, modeled byte-for-byte on the existing "Verify test inventory is up to date" step (lines 38-44):

```yaml
      - name: Verify agent-guide maps are up to date
        run: |
          task agent-guide:maps
          if ! git diff --exit-code docs/agent-guide/maps/; then
            echo "ERROR: docs/agent-guide/maps/ is stale — run 'task agent-guide:maps' locally and commit"
            exit 1
          fi
```

This is the same contract operators already know from test-inventory: **regenerate locally, commit the result; CI fails if the committed maps differ from a fresh emit.** Because the emitter validates first, a registry that breaks the maps fails CI here too.

### 8.3 Local validation
`task agent-guide:maps && git diff --exit-code docs/agent-guide/maps/` reproduces the CI gate locally before pushing. `task test:agent-guide` (F+B) covers registry validity + the emit-maps unit tests.

---

## 9. Risks & open items

- **S1 prerequisite timing.** S3 imports `scripts/agent-guide/load.mjs`, which **S1 introduces** (and which S1 also makes `validateRegistry` route through, so S3's "one parse path" claim depends on S1 landing). If S3 merges before S1, the import fails. Mitigated by the enforced merge order S1 → S2 → S3 (§10) and by S3's plan stating the dependency. Until S1 lands, S3 is developed against a local stand-in of the agreed `loadRegistry` signature, then switched to the real import — but **not merged** before S1.
- **S1/S3 boundary erosion.** The standing risk for this surface is someone "enriching" the maps with prose, examples, or `why_de` narration — which would re-create S1 inside the repo. **Mitigation, stated as a hard rule:** S3 renders **only** the columns in §5/§6.1; any field requiring sentences (`when_de`, `note_de`, `what_for_de`, `rule_de`, `why_de`) is S1-only. Reviewers reject map PRs that add prose. *S1 = human teaching pages on the docs SITE; S3 = terse agent-facing maps in the REPO linked from `CLAUDE.md`. Same registry, different template + audience.*
- **Table-safety regression.** Free-text German cells (`title_de`, `example_prompt_de`) can carry `|` or newlines and break GFM tables. Mitigated by the uniform `escapeCell()` invariant (§6.2) and its unit test (§8.1).
- **Guardrail-tier derivation surprises.** Because a guardrail's tier is derived transitively (§5.3), a guardrail used by both a 🟡 and a 🔴 flow shows under both tiers in `danger-map.md`. This is intended, but could look like duplication to a casual reader. Mitigated by a one-line note in `danger-map.md`'s preamble explaining the transitive rule, and by the per-tier de-duplication so it appears at most once *per tier*.
- **Freshness-gate flapping.** A non-deterministic emitter would make CI flap. Mitigated by the determinism unit test (§8.1) — fixed sort by id, no timestamps, LF + trailing newline.
- **Docs-gen exclusion regression.** If a future refactor of `discover.mjs` replaces `DOC_EXCLUDE_PREFIXES` with another mechanism, the maps could silently reappear on the docs site. Mitigated by extending `scripts/docs-gen/discover.test.mjs` to assert `docs/agent-guide/maps/` is excluded, so the contract is test-pinned.
- **Pointer drift.** The hand-added `CLAUDE.md` / `OVERVIEW.md` pointers are not generated and could rot if the maps move. Low risk (paths are stable, kebab-case, program-owned); accepted, with the pointer text naming the directory rather than individual files where possible.
- **Open item (cross-surface):** the exact owner of the `agent-guide:emit` umbrella scaffold is S1 (first to merge). S3's plan appends its `agent-guide:maps` leaf to that umbrella; if S1's final shape differs, S3 adapts the append site. No registry-shape open items — S3 is a pure consumer and needs no new F+B fields (the guardrail-tier need is met transitively).

---

## 10. Prerequisites & build order

**Merge/build order: S1 → S2 → S3.** S3 is the last to merge.

S3 depends on:
1. **F+B (DONE/merging)** — the registry under `docs/agent-guide/registry/*.yaml`, the validator `scripts/agent-guide/validate.mjs` (export `validateRegistry(dir, repoRoot)`), the root `yaml@^2.8.3` devDependency, and `task test:agent-guide` (wired into `test:all` deps). Verified consumers/precedents in this worktree (origin/main, pre-F+B): the test-inventory committed-artifact pattern (`scripts/build-test-inventory.sh` deriving `REPO_ROOT` from `BASH_SOURCE` at line 5 and printing `Wrote …` at line 49; `task test:inventory` at Taskfile lines 360-363, *not* a `test:all` dep; ci.yml gate at lines 38-44), the docs-gen discovery (`scripts/docs-gen/discover.mjs` `DOC_EXCLUDE_PREFIXES` 16-19 / `discoverDocs` 131-155) and its test (`discover.test.mjs` exclusion assertions 70-71), the routing files (`CLAUDE.md` table 3-14, WSL link at 202; `AGENTS.md` symlink → `CLAUDE.md`; standalone `GEMINI.md`; `.claude/agents/*.md`; `.claude/skills/OVERVIEW.md`). The registry/validator/`load.mjs` files and the `test:agent-guide` / `agent-guide:*` Taskfile entries are **not yet present** in this worktree — they arrive via the F+B and S1 merges, as expected.
2. **S1** — introduces the **shared reader `scripts/agent-guide/load.mjs`** (`loadRegistry(dir)` + `tierFor`, `toolById`, `guardrailById`), refactored out of the inline loading currently in `validate.mjs` such that `validateRegistry` and `loadRegistry` share one parse path. S3 imports it; it **must** exist first. S1 also lands the `agent-guide:emit` umbrella scaffold that S3 extends.

S3 is otherwise **self-contained**: it adds one emitter, one test, one Taskfile leaf, one ci.yml step, one `discover.mjs` exclusion entry (+ test extension), and two hand-added pointer lines.

---

## 11. Downstream (what this unblocks)

- **The agent's day-to-day routing.** Once merged, every Claude Code session in this repo can grep `docs/agent-guide/maps/goals-map.md` to map an operator intent to a flow + tier + guardrails — the first machine-readable, registry-backed routing contract beyond the hand-maintained `CLAUDE.md` table.
- **Sub-project E (enforcement hooks — separate later cycle).** `danger-map.md` is the **enforcement-contract preview**: it surfaces each tier's `enforcement_default` and the goals/tools/guardrails that fall under it, so that when E wires `enforced_by` hooks, the human-readable contract already exists and is diffable. E consumes the taxonomy; it does not block S3.
- **Operator self-service.** The operator gains a single, German, copy-paste-ready "Ich will …" table (with verbatim `example_prompt_de`) — the lowest-friction entry point into the whole guardrailed workflow, complementing S1's teaching pages and S2's in-app surface.

---

## 12. Deliverables checklist (for the plan)

- [ ] `scripts/agent-guide/emit-maps.mjs` — emitter: `validateRegistry` → `loadRegistry` → render 3 templates → write `docs/agent-guide/maps/*.md`; exports `renderGoalsMap`, `renderToolsMap`, `renderDangerMap` + a shared `escapeCell()`; fail-closed on invalid registry / dangling ids.
- [ ] `docs/agent-guide/maps/goals-map.md`, `tools-map.md`, `danger-map.md` — generated, committed, each with the `<!-- DO NOT EDIT … -->` header; deterministic (sort-by-id, LF, trailing newline); table cells escaped.
- [ ] `scripts/agent-guide/emit-maps.test.mjs` — header/row/grouping (Skills/Tasks/Agenten), transitive guardrail-tier bucketing, cell-escaping, fail-closed, determinism (run via `node --test`, matched by the `test:agent-guide` glob, runs in `task test:all`).
- [ ] `Taskfile.yml` — add `agent-guide:maps`; append it to the `agent-guide:emit` umbrella.
- [ ] `.github/workflows/ci.yml` — add "Verify agent-guide maps are up to date" step in `offline-tests`, mirroring the test-inventory step (lines 38-44) with `git diff --exit-code docs/agent-guide/maps/`.
- [ ] `scripts/docs-gen/discover.mjs` — add `join('docs', 'agent-guide', 'maps')` to `DOC_EXCLUDE_PREFIXES`; extend `scripts/docs-gen/discover.test.mjs` to assert the exclusion (mirroring the specs/plans assertions at lines 70-71).
- [ ] `CLAUDE.md` — one hand-added, repo-relative pointer line to `docs/agent-guide/maps/` (auto-propagates to `AGENTS.md` via the existing symlink; `GEMINI.md` left untouched).
- [ ] `.claude/skills/OVERVIEW.md` — one hand-added pointer line to `docs/agent-guide/maps/goals-map.md`.
- [ ] Confirm `node scripts/agent-guide/emit-maps.mjs` + `git diff --exit-code docs/agent-guide/maps/` is clean locally; `task test:agent-guide` green.
- [ ] Branch `feature/agent-guide-maps`; PR + internal ticket; **merge after S1 (and S2)**.
