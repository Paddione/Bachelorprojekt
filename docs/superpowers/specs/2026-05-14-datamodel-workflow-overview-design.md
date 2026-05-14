# Datamodel × Workflow Overview

**Date:** 2026-05-14
**Status:** Approved
**Slug:** `datamodel-skill-overview`
**Branch:** `feature/datamodel-skill-overview`

## Goal

Produce a single, dense, interactive HTML page on `docs.${PROD_DOMAIN}` that maps every shared-db table to the workflow step(s) that read or write it, marks the gaps where the all-encompassing data structure is incomplete, and stays automatically fresh when the schema changes. The page is a developer reference — optimized for re-finding "which step touches which table" and "where does data from skill X end up" in seconds.

## Audience

Patrick (the platform maintainer), reading the page to:
- Plan schema changes — see all upstream and downstream effects.
- Decide where new skill outputs should land.
- Audit the all-encompassing data structure: catch tables nothing writes to, skills whose output never reaches the DB, and broken cross-skill data flows.

Not in audience: end users, external reviewers, anyone needing a narrative tour. Those readers continue to use `architecture.md` and the existing service-specific docs.

## Scope

**In scope:** all four workflow families × all eight DB domains:

| Workflow family | Examples |
|---|---|
| Dev-Flow Skills | `brainstorming`, `writing-plans`, `dev-flow-plan`, `dev-flow-execute`, `plan-context.sh`, `plan-frontmatter-hook.sh`, `using-git-worktrees` |
| Agent Dispatch | `bachelorprojekt-{db,infra,ops,website,test,security}` from CLAUDE.md routing |
| CI/CD Pipeline | `track-pr.yml`, `track-plans.yml`, `build-website.yml`, `dev-auto-deploy.yml`, `tracking-import` CronJob, ArgoCD reconcile |
| App Data Flows | Keycloak SSO, Nextcloud Talk pipeline, Tickets/Bugs APIs, Coaching ingest, Arena gameplay, Brett snapshots |

| DB domain | Anchor schemas |
|---|---|
| CRM & Communication | `website.customers`, `chat_*` |
| Billing & Accounting | `website.invoice_*`, `bookkeeping_*` |
| Questionnaire & Coaching | `coaching.*`, `website.questionnaire_*` |
| Tickets & Issues | `tickets.tickets`, `tickets.events`, `bugs.bug_tickets` |
| Platform & Config | `website.service_*`, `website.brand_*` |
| Testing & CI | `website.test_*` |
| AI Assistant | `knowledge.*` |
| Bachelorprojekt & Superpowers | `bachelorprojekt.features`, `bachelorprojekt.v_timeline` |

**App-flow detail depth:** high-level steps with **table-level** mapping (e.g., "User Login → `keycloak.user`, `keycloak.user_session`"). Per-column writes are documented in the Domain Deep-dive section via the existing live Mermaid ER diagrams (already produced by `db-schema-diagram.py`), not in `workflow-map.yaml`.

**Out of scope:** replacing the existing `database.md` deep-dive of the website schema, generating Mermaid ER from anything but the live DB, runtime/dynamic pages (the output is committed static HTML).

## Architecture

```
        shared-db (mentolder)
            │ kubectl exec → psql introspection
            ▼
    ┌───────────────────────┐
    │ build-datamodel.py    │ ← scripts/datamodel/workflow-map.yaml
    │ (Python, no deps      │   (hand-curated Step → R/W tables + gaps)
    │  beyond stdlib + PyYAML)
    └─────────────┬─────────┘
                  │ writes
                  ▼
    k3d/docs-content/datamodel-workflow.md   (committed)
                  │
                  │ task docs:build  (existing scripts/build-docs.js)
                  ▼
    k3d/docs-content-built/datamodel-workflow.html
                  │
                  │ task docs:deploy
                  ▼
    https://docs.${PROD_DOMAIN}/#/datamodel-workflow  (both clusters)
```

The generator follows the same kubectl-exec connection pattern as `scripts/db-schema-diagram.py` so it can run without a port-forward and so the user has only one mental model for "regenerate docs from shared-db."

## Input: `scripts/datamodel/workflow-map.yaml`

Hand-curated. Lives next to the generator. Reviewed in PRs. Schema:

```yaml
# Ordered families — drives the lifecycle pipeline rendering left → right.
families:
  - id: dev-flow
    label: "Dev-Flow Skills"
    color: feature       # → green (matches dev-flow-overview-de.html palette)
  - id: agents
    label: "Agent Dispatch"
    color: audit         # → purple
  - id: ci
    label: "CI/CD Pipeline"
    color: gold
  - id: app
    label: "App Data Flows"
    color: chore         # → blue

# Stable ordering and labels for the eight domains discovered from the DB.
# The generator falls back to "Unknown — file an issue" for any new schema
# discovered in the DB that isn't listed here, so the surface is loud.
domain_order:
  - { id: crm,            label: "CRM & Communication" }
  - { id: billing,        label: "Billing & Accounting" }
  - { id: coaching,       label: "Questionnaire & Coaching" }
  - { id: tickets,        label: "Tickets & Issues" }
  - { id: platform,       label: "Platform & Config" }
  - { id: testing,        label: "Testing & CI" }
  - { id: ai,             label: "AI Assistant" }
  - { id: bachelorprojekt,label: "Bachelorprojekt & Superpowers" }

steps:
  - id: brainstorming
    family: dev-flow
    label: "brainstorming skill"
    description: "Turns user ideas into a spec via dialogue."
    writes:
      files: ["docs/superpowers/specs/*.md"]
    reads: {}
    gaps:
      - type: workflow-to-db
        target: "any DB table"
        explanation: |
          Session events live in .superpowers/brainstorm/*/state/events.
          They are never ingested — companion analytics, choice histories,
          and rejected options vanish on session end.

  - id: dev-flow-plan
    family: dev-flow
    label: "dev-flow-plan skill"
    writes:
      tables: ["tickets.tickets"]
      files:  ["docs/superpowers/specs/*.md", "docs/superpowers/plans/*.md"]
    reads:   {}
    gaps:    []

  - id: track-pr
    family: ci
    label: ".github/workflows/track-pr.yml"
    writes:
      files: ["tracking/pending/<pr>.json"]
    reads:  {}
    gaps:   []

  - id: tracking-import
    family: ci
    label: "tracking-import CronJob"
    writes:
      tables: ["bachelorprojekt.features"]
    reads:
      files: ["tracking/pending/*.json"]
    gaps: []

  # … one entry per documented workflow step. Initial inventory: ~25 steps.

# Edges that don't fit cleanly under a single step's gap list.
cross_skill_gaps:
  - from: dev-flow-plan
    to:   tracking-import
    via:  "tickets.tickets.external_id → bachelorprojekt.features (no ticket_id column today)"
    explanation: |
      Plans set tickets.tickets.external_id (T######) but
      bachelorprojekt.features stores PR# only. There's no join between
      a tracked feature and the ticket that triggered it.

# Optional auto-discovery rules. Off by default; turned on per heuristic.
heuristics:
  unbound_fk_candidates:
    enabled: true
    column_pattern: "_id$"
    exclude_schemas: ["keycloak", "nextcloud", "vaultwarden"]
  table_with_no_writer:
    enabled: true
    exclude_schemas: ["keycloak", "nextcloud", "vaultwarden", "pg_*"]
```

`writes` and `reads` accept two optional keys: `tables` (`schema.table` strings) and `files` (glob patterns). The generator resolves table refs against the live DB introspection — a typo aborts the build with a clear error.

## Output: `datamodel-workflow.md`

A single Markdown file with embedded HTML, Mermaid blocks, and inline `<style>` + `<script>`. `marked` preserves raw HTML, so the existing `scripts/build-docs.js` pipeline emits a normal docs page wrapped in the standard sidebar + theme. No build-docs.js modifications.

### Page structure (top → bottom)

1. **Hero — Lifecycle Pipeline.** Hand-rendered inline SVG (~600 × 360 px).
   - Top row: 4 family swimlanes left → right (dev-flow → agents → ci → app).
   - Bottom row: 8 domain pools.
   - Each step is a labeled `<rect>` in its family lane. Each write edge is a `<path>` to the matching pool. Edge color encodes gap type — solid green = covered, dashed red = `db-fk` gap, dashed orange = `workflow-to-db` gap, dashed purple = `cross-skill` gap.
   - All elements carry `data-step="<id>"` and `data-domain="<id>"` attributes — the JS uses these for hover-highlight.

2. **Matrix.** `<table>` with workflow steps as rows (grouped by family) and the eight domains as columns. Cells contain one of:
   - `W` (writes — bold green background)
   - `R` (reads — blue background)
   - `G` (gap — red background)
   - `P` (partial — yellow background)
   - empty (no relationship documented)
   Click on a non-empty cell expands a panel below the matrix with: which tables, which columns, which files, gap explanations.

3. **Skill Cards.** One `<article class="step-card">` per step, grouped by family in CSS grid. Each card lists `in:`, `out: tables`, `out: files`, and `gaps:` with the gap-type chip beside the explanation.

4. **Domain Deep-dives.** One section per domain with a pre-rendered Mermaid `erDiagram` block (the same blocks `db-schema-diagram.py` already emits) and a short "Touched by" list pulled from the YAML.

5. **Coverage Footer.** Numeric summary: "X of Y documented tables have at least one declared writer," "Z columns matched the unbound-FK heuristic," "N cross-skill gaps." Click a number jumps back to the relevant section.

## Interactivity

All inline, dependency-free, in a `<script>` block at the end of the MD file. Total JS budget: 4 KB minified.

| Interaction | Implementation |
|---|---|
| Hover lifecycle step | `mouseenter` on `[data-step]` → `document.querySelectorAll('[data-step="<id>"], [data-domain-of-step="<id>"]')` get `.is-highlight`. Reset on `mouseleave`. |
| Click matrix cell | Each `<td>` carries `data-step` + `data-domain`. Click renders the drill-down `<div class="cell-drilldown">` below the matrix with the cell's resolved tables/files/gaps. Re-click collapses. |
| Filter toolbar | Three toggle buttons above the matrix: "Only gaps," "Only writes," "Only reads." Each toggles a body-level class; CSS uses `body.filter-gaps .cell:not(.g) { opacity: 0.15 }` etc. |
| Search | Ctrl+K opens a fixed overlay with a search input. Build-time index is a JSON blob of `{kind, label, anchor}` for every step, table, and domain. Fuzzy match on keyup, Enter scrolls to the anchor. |
| Sticky TOC | The build-docs.js pipeline already injects an auto-TOC from `<h2>` elements. Our page emits four `<h2>`s (Hero, Matrix, Cards, Deep-dives, Coverage). |

The page is fully usable without JS: matrix is still readable, drill-downs are simply not expanded, lifecycle SVG still shows the edges, search becomes Strg+F. Progressive enhancement only.

## Gap classification

Three gap types, each visually distinct everywhere they appear:

| Type | Color | Where it surfaces |
|---|---|---|
| `db-fk` | red (`--fix`) | Lifecycle edge between two pools (when both pools host tables that should FK to each other); inside the matching domain's Deep-dive section as an annotation on the Mermaid block; inside the source step's card. |
| `workflow-to-db` | orange (`--gold`) | Lifecycle pool stays grey + carries a `⤬` badge for steps with file-only outputs; inside the originating step's card. |
| `cross-skill` | purple (`--audit`) | Lifecycle edge between two step rects (rare); listed in a "Cross-skill gaps" sub-section above the Skill Cards. |

The heuristic auto-discoveries are rendered with a `(heuristic)` tag and a slightly lower-opacity color — they're suggestions, not verdicts.

## Build & deploy

**New task** in `Taskfile.yml`:

```yaml
datamodel:build:
  desc: "Regenerate k3d/docs-content/datamodel-workflow.md from shared-db + workflow-map.yaml"
  vars:
    ENV: '{{.ENV | default "mentolder"}}'
  cmds:
    - |
      source scripts/env-resolve.sh "{{.ENV}}"
      NS="${WORKSPACE_NAMESPACE:-workspace}"
      KUBECTL_CTX="${ENV_CONTEXT}" KUBECTL_NS="$NS" \
        python3 scripts/datamodel/build-datamodel.py \
          --map scripts/datamodel/workflow-map.yaml \
          --out k3d/docs-content/datamodel-workflow.md
      echo "Written to k3d/docs-content/datamodel-workflow.md — review, then commit + task docs:deploy"
```

Manual cadence: regenerate before any `docs:deploy` that follows a schema change or a step inventory edit. Committed; PR diffs show the rendered Markdown changes. Out of scope: hooking it into CI on every schema migration (deferred).

**Sidebar entry** in `k3d/docs-content/_sidebar.md`, under "Referenz":

```markdown
- **Referenz**
  - [Glossar](glossary)
  - [Decision-Log](decisions)
  - [Datamodel × Workflow](datamodel-workflow)   <!-- new -->
```

## File inventory

| Path | New? | Notes |
|---|---|---|
| `scripts/datamodel/build-datamodel.py` | new | Python 3.11+, stdlib + PyYAML. Reuses `db-schema-diagram.py`'s `psql_multi()` pattern for kubectl-exec mode. |
| `scripts/datamodel/workflow-map.yaml` | new | Hand-curated mapping. Initial inventory ~25 steps. |
| `k3d/docs-content/datamodel-workflow.md` | new (generated, committed) | Output of the generator. |
| `k3d/docs-content/_sidebar.md` | edit | Add "Datamodel × Workflow" under Referenz. |
| `Taskfile.yml` | edit | Add `datamodel:build` task. |
| `docs/superpowers/specs/2026-05-14-datamodel-workflow-overview-design.md` | new | This spec. |
| `docs/superpowers/plans/datamodel-skill-overview.md` | new (written next) | Implementation plan. |

## Risks & footguns

1. **YAML drift.** A step that quietly changes its writes (e.g., `dev-flow-plan` learns to write to a new table) will not auto-update the YAML. **Mitigation:** the generator emits a "Coverage Footer" line that includes the YAML's last-modified date relative to the schema's newest column. If the schema is newer than the YAML by > 7 days, the footer carries a yellow warning.

2. **`build-docs.js` strips inline `<script>`?** It uses `marked` (which preserves HTML) and `cheerio` for post-processing (which preserves `<script>` by default). To be safe, the spec mandates an early-PR smoke test: regenerate, run `task docs:build`, grep the output `.html` for our `data-step` attributes and our `<script>` block.

3. **Mermaid pre-render cost.** The Domain Deep-dive section embeds 8 `erDiagram` blocks. `mmdc` runs serially today — building this page alone could add ~10–15 s to `task docs:build`. **Mitigation:** the existing `--fast` flag in `docs:build` already skips Mermaid pre-rendering (verified in `Taskfile.yml`); the developer iterates with `task docs:build FAST=true` and runs the full render only before deploy.

4. **Schema introspection requires shared-db access.** The generator depends on the mentolder cluster being reachable. **Mitigation:** the task fails loudly if `kubectl --context mentolder` can't list the `shared-db` pod; documentation says "run after `task argocd:status` or any other cluster-reachable command."

5. **Sidebar conflict.** `_sidebar.md` is appended to by multiple PRs; merge conflicts likely if multiple in-flight branches add entries. **Mitigation:** none beyond normal rebase. The entry is one line.

## Success criteria

After this lands:
- The page loads at `https://docs.mentolder.de/#/datamodel-workflow` (and on korczewski) within 200 ms.
- Hovering "dev-flow-plan" in the Lifecycle highlights the `Tickets & Issues` pool.
- Clicking the `dev-flow-plan × Tickets` matrix cell expands a panel showing `tickets.tickets` (and the columns the step writes).
- The Coverage Footer is non-zero in all three categories on day one (≥ 3 declared cross-skill gaps, ≥ 5 unbound-FK heuristic hits, ≥ 2 tables with no documented writer).
- Re-running `task datamodel:build` after a schema change shows a clean diff in `k3d/docs-content/datamodel-workflow.md`.
