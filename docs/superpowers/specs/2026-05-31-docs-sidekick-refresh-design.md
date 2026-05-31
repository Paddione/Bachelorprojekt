# Docs site refresh + Hilfesidekick skill-init prompts — Design

**Date:** 2026-05-31
**Branch:** `feature/docs-sidekick-refresh`
**Status:** spec (approved in brainstorming; pending written-spec review)

## Problem

`docs.mentolder.de` / `docs.korczewski.de` render a statically generated HTML site that
"looks ass and not ours": a generic light/blue editorial theme (`--accent:#2f6db5`,
Inter + Merriweather) with no brand identity, plus some stale content. Separately, the
website **Hilfesidekick** (the in-app help drawer) is on-brand but does not surface
copyable **skill-initialization prompts** (`/superpowers`, `/brainstorming`,
`dev-flow-plan`, …) that a user could paste into Claude Code.

## Key architectural fact (the backbone)

`docs/agent-guide/registry/*.yaml` is the **single source of truth**. Three emitters
project it:

- `scripts/agent-guide/emit-docs.mjs` → docs Markdown (`docs/agent-guide/10-ziele.md`,
  `20-werkzeuge.md`, `30-bausteine.md`)
- `scripts/agent-guide/emit-maps.mjs` → agent-readable tables (`docs/agent-guide/maps/*.md`)
- `scripts/agent-guide/emit-webapp.mjs` → `website/src/lib/agent-guide.generated.json`
  (consumed by the sidekick via `website/src/lib/agentGuide.ts`)

Therefore a skill-init prompt authored **once** in the registry flows to **both** the docs
site and the sidekick. This is the chosen approach. Rejected: hardcoding prompts in the
Svelte component (duplication / drift); a separate `skills.yaml` (skills already live in
`tools.yaml` as `kind: skill`).

## Approved scope decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Docs theme appetite | **Mid reskin** — keep editorial layout, swap to brand colors/fonts + branded header/footer |
| Per-brand distinctness | **Single neutral brand look** — one shared dark theme for both domains (no per-domain runtime switch, no two-image split) |
| Skill coverage | **Everything** — 3 named skills + full dev-flow chain + 6 routing agents |
| Sidekick placement | **Shelf + inline** — pinned "Schnellstart / Für Claude" shelf + inline copy on each card |

## Workstream A — Skill-init prompts (registry → sidekick)

### A1. Registry (SSOT) + emitters

1. **Add two `kind: skill` entries** to `docs/agent-guide/registry/tools.yaml`:
   - `/superpowers` (maps to the superpowers entrypoint / `using-superpowers`)
   - `/brainstorming` (maps to `superpowers:brainstorming`)
   - Full entries: `id`, `name_de`, `kind: skill`, `summary_de`, `what_for_de`,
     `how_to_start_de`, `what_could_go_wrong_de`, `danger`, `theme`, `guardrails`,
     `related`, `links`, `order`, `one_liner_de`.
2. **Add a new optional field `init_prompt_de`** (string, ≤200 chars) — the exact
   ready-to-paste German starter that triggers the entry in Claude Code.
   - Populate it for **all `kind: skill`** entries: the 2 new + `dev-flow-plan`,
     `dev-flow-execute`, `dev-flow-iterate`, `dev-flow-e2e`.
   - Populate it for the **6 `kind: agent`** entries too (a "delegate to X" starter),
     since coverage = everything. Field stays optional (no error if absent, e.g. for
     `task-oracle`).
3. **Thread the field through the pipeline:**
   - `scripts/agent-guide/validate.mjs` — accept `init_prompt_de` as an optional field;
     enforce `length ≤ 200`; only meaningful for `kind in {skill, agent}` (do not require
     it).
   - `scripts/agent-guide/emit-webapp.mjs` — include `init_prompt_de` in the emitted Tool
     object.
   - `scripts/agent-guide/emit-docs.mjs` — render it as a copyable `<code>` block in
     `20-werkzeuge.md` under a label like
     `Du kannst diesen Prompt kopieren und in Claude Code einfügen:`.
   - `scripts/agent-guide/emit-maps.mjs` — add an optional `Init` column to
     `tools-map.md` (empty for entries without it).
4. **Regenerate + commit:** run `task agent-guide:emit`; commit the regenerated
   `website/src/lib/agent-guide.generated.json` and the regenerated
   `docs/agent-guide/*.md` + `maps/*.md` so the `task test:agent-guide` CI gate passes.

### A2. Sidekick UI (`website/src/components/assistant/`)

1. `website/src/lib/agentGuide.ts` — add `init_prompt_de?: string` to the `Tool` interface.
2. **Inline (per-card):** `agent-guide/GuideCard.svelte` renders an `init_prompt_de` code
   block for `kind: skill` / `kind: agent` entries, reusing the existing
   `copyPrompt(id, text)` → `navigator.clipboard.writeText()` → `'Kopiert ✓'` (1.6 s)
   pattern. Label it **"In Claude Code einfügen"** to distinguish a paste-into-Claude
   action from an admin-UI action.
3. **Shelf (pinned):** `AgentGuideView.svelte` gains a top **"⚡ Schnellstart / Für Claude"**
   strip with one-tap copy buttons for `/superpowers`, `/brainstorming`, `dev-flow-plan`
   (read from the generated registry, not hardcoded strings).
4. **Visibility default:** show wherever Agent-Anleitung already appears (all three
   layouts). The view is already technical; no extra public-site gating in v1.
5. Styling reuses `website/src/styles/sidekick-panels.css` conventions (scoped under
   `.drawer`).

## Workstream B — Docs site (content + reskin)

### B1. Content fixes (then regenerate HTML)

- `README.md` — remove the **Tracking** service node + its edges from the Mermaid
  architecture diagram (service removed in PR #788).
- `docs/glossary.md` — remove/strike **Tracking** from the OIDC-clients list and the
  shared-db databases list (note "entfernt PR #788").
- `docs/dev-stack/README.md` — add an **archival notice** at the top (k3s-1 is now a
  fleet worker; the standalone k3s dev stack is legacy), mirroring
  `fleet-stage2-cutover-runbook.md`.
- *(Optional, low-cost)* add `docs/fleet-2026-05-31-what-changed.md` — single fleet
  cluster, `workspace` vs `workspace-korczewski` namespaces, dead contexts.

### B2. Mid reskin (single shared dark brand theme)

Touch `scripts/docs-gen/theme.mjs` (`editorialCss()`) and `scripts/docs-gen/templates.mjs`.

- **Palette** (`:root`), light/blue → one dark brand theme:
  - bg `--paper`/page → ink `#0b111c`; surfaces `--paper-2`/`--paper-3` → `#101826` /
    `#161f30`; text `--ink` → `#eef1f3`, `--ink-soft`/`--ink-mute` lightened for dark;
    `--line` → low-contrast dark borders.
  - `--accent` → **brass** (`~#e8c870`, the existing sidekick FAB / house color);
    `--accent-bg`/`--accent-line` derived.
  - Keep semantic `repo`/`plugin`/`warn` badge hues but tuned for a dark background.
  - `--code-bg`/`--code-ink` → dark code surfaces.
- **Typography:** `--font-sans` → **Geist**; `--font-serif` → **Instrument Serif** for
  headings; mono for code. Replace the Inter/Merriweather Google-Fonts import accordingly.
- **Chrome:** add a branded **header** (logo mark + "Dokumentation" wordmark) and a
  **footer** in `templates.mjs`, replacing the bare "Workspace MVP" title chrome.
- **Graph + pills:** convert hardcoded graph legend/node colors and cross-link pill
  colors in `theme.mjs` (and the landing graph emitters if needed) to **CSS variables** so
  the dark theme stays legible. **Do not re-render mermaid** — snapshots are SHA-keyed and
  cached; recolor strictly via CSS variables to avoid cache drift / illegible nodes.
- **Layout/page-shell structure stays** (that is the "mid" in mid reskin).
- Document the decision in a new **`DOCS-DESIGN-STANDARDS.md`** (parallel to
  `WEBSITE-STANDARDS.md`).

## Data flow

```
docs/agent-guide/registry/tools.yaml  (+ init_prompt_de)
        │  load.mjs + validate.mjs
        ├─ emit-docs.mjs  → docs/agent-guide/20-werkzeuge.md  ─┐
        ├─ emit-maps.mjs  → docs/agent-guide/maps/tools-map.md │→ docs site (B reskin renders it)
        └─ emit-webapp.mjs→ website/src/lib/agent-guide.generated.json
                                   │ agentGuide.ts
                                   └→ AgentGuideView.svelte (shelf) + GuideCard.svelte (inline copy)
```

## Testing

- **Unit:** `scripts/agent-guide/*.test.mjs` extended — `validate.mjs` rejects
  `init_prompt_de > 200`; `emit-webapp`/`emit-docs`/`emit-maps` include the field.
- **Regen gate:** `task test:agent-guide` (fails if `agent-guide.generated.json` is stale)
  must be green — regenerate + commit.
- **E2E:** extend `tests/e2e/specs/agent-guide-walkthrough.spec.ts` to assert the
  Schnellstart shelf copy button writes the expected text to the clipboard.
- **Inventory:** re-run `task test:inventory` and commit
  `website/src/data/test-inventory.json` if test wiring changes.
- **Manual:** `task docs:build` + visual check of a couple of pages + the landing graph in
  the dark theme.

## Deploy reality & guardrails (execution-time, not now)

- **`docs:sync` does NOT work** (read-only container rootfs). Docs changes ship via
  **rebuild image + `task docs:deploy`**, which rolls out to **both** namespaces
  (`workspace` + `workspace-korczewski`) on the **fleet** context via `FLEET_KUBECONFIG`.
- Sidekick changes ship via the **website** build + rollout (separate pipeline).
- All work via `feature/*` branch → PR → **squash-merge**; CI green first; pull --rebase
  before work.

## Packaging — one spec, one staged plan, two PRs

Independently shippable, different domains + deploy paths:

- **PR 1 — Skill prompts (Workstream A):** registry + emitters + sidekick UI → website rollout.
- **PR 2 — Docs site (Workstream B):** content fixes + mid reskin → docs image rebuild + rollout.

## Out of scope (YAGNI)

- Per-brand-distinct docs theming / runtime brand signal / two-image split (explicitly
  declined — single neutral look).
- Light/dark toggle in docs.
- A skill-library versioning scheme.
- Reworking the docs page-shell layout (only reskin, not relayout).
