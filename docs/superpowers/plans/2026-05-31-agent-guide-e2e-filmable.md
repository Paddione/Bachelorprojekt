---
title: Filmable per-guidestep E2E walkthrough of the in-app Agent-Anleitung
ticket_id: T000382
domains: [test, website]
status: active
pr_number: null
---

# Filmable per-guidestep E2E walkthrough of the in-app Agent-Anleitung

> **For agentic workers:** REQUIRED SUB-SKILL — use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan was authored by a session that had just shipped S3; it is **staged, not yet implemented**. Pick it up with `dev-flow-execute`.

**Goal:** Add headed, **filmable** Playwright E2E tests that walk through the in-app **Agent-Anleitung** view one guide-step at a time — so Patrick can sit next to the run and screen-record it for gekko — *and* leave behind a headless, data-driven regression spec that CI can run nightly.

---

## Why this plan exists (current state — read first)

The "AI-Agent Operating Guide" shipped in three surfaces:

| Surface | Ticket / PR | What it is |
|---|---|---|
| **S1 — docs-site** | T000376 / #1251 | `docs/agent-guide/{10-ziele,20-werkzeuge,30-bausteine}.md` (4 pages) |
| **S2 — in-app view** | T000377 / #1253 | `AgentGuideView.svelte` inside `PortalSidekick`, fed by `agent-guide.generated.json` |
| **S3 — repo maps** | T000378 / #1257 | `docs/agent-guide/maps/{goals,tools,danger}-map.md` (grep surface) |

All three are merged. **S2 shipped the view but no E2E coverage** — there are zero `agent-guide`/`Anleitung` Playwright specs on `main` (`git ls-tree -r --name-only origin/main | grep -iE 'e2e|playwright' | grep -i agent` → empty). This plan fills that gap, and it is the *original* request behind the whole program: "for each guidestep, headed e2e playwright tests that I can also sit by and film for gekko."

The three registry-derived surfaces are all generated from the same SSOT (`docs/agent-guide/registry/*.yaml` → `agent-guide.generated.json`). The E2E here asserts the **rendered view matches that SSOT**, closing the loop.

---

## The single most important discovery (de-risks the whole thing)

**The walkthrough needs NO login.** Verified:

- `PortalSidekick` is mounted in `website/src/layouts/Layout.astro` (the **public** site layout — used by `index.astro`, `impressum.astro`, `leistungen.astro`, …) with no auth guard (`<PortalSidekick client:load />`, line ~87).
- `AgentGuideView.svelte` renders **entirely from a bundled JSON import** (`import data from './agent-guide.generated.json'` via `agentGuide.ts`). It makes **no API calls** — the only `fetch` in `PortalSidekick` (`/api/auth/me`) just populates badge counts and is wrapped in try/catch; the drawer opens and the agent-guide view renders regardless of auth.

⇒ The film/test target can be the **public homepage** (`/`) of any environment — `pnpm dev` on `localhost:4321`, `web.mentolder.de`, or `web.dev.mentolder.de` — with **no Keycloak storageState, no `.auth/*.json`, no secrets**. This is unlike every existing auth-gated spec (e.g. `brett-mentolder-auth-setup.spec.ts`). Do **not** copy their OIDC setup; you don't need it.

---

## Navigation path & selector reference (verified against the components)

Sequence to reach the view from any public page:

1. `await page.goto('/')`
2. Click the floating button: `page.locator('button.fab')` — `aria-label="Sidekick öffnen"`. Opens the drawer at `view='home'`.
3. Click the menu row: `page.getByRole('button', { name: /Agent-Anleitung/ })` (a `.sk-row`, `aria-label="Agent-Anleitung — Lernen, wie alles funktioniert"`). Calls `onNavigate('agent-guide')`.
4. View renders: container `.ag-body`; drawer header title becomes `Agent-Anleitung` (`titleMap['agent-guide']`).

Inside `AgentGuideView` (`website/src/components/assistant/AgentGuideView.svelte`):

| Element | Selector | Notes |
|---|---|---|
| Tier legend (4 tiers) | `.ag-legend .ag-legend-item` → `.ag-legend-badge` | text = `{emoji} {label_de}` |
| Goal section label | text `Ich will …` | precedes goal cards |
| **Goal card (the "guidestep")** | `.ag-cards:first .ag-card` | 8 of them |
| Goal title | `.ag-card .ag-name` | `goal.title_de` |
| Goal tier badge | `.ag-card .ag-tier` | `{emoji} {label}` |
| Goal "when" line | `.ag-when` | `goal.when_de` |
| Goal flow steps | `.ag-flow li` | `<strong>{tool_name_de}</strong> — {note_de}` |
| Prompt text | `.ag-prompt-text` | `goal.example_prompt_de` |
| **Copy-prompt button** | `.ag-copy` | label `Diesen Prompt kopieren` → `Kopiert ✓` after click |
| Goal guardrail chips | `.ag-card .ag-chip > summary` | `<details>`; text = `guardrail.name_de`; expands to `.ag-chip-rule` / `.ag-chip-why` |
| Tools section | second `.ag-cards` | 11 tool cards |
| Tool card | `#ag-tool-{id}` | stable id anchor |
| Tool kind chip | `.ag-kind` | `tool.kind_de` |
| Tool detail accordion | `.ag-detail > summary` ("Wofür ist das?") | expands what-for / how-to-start / what-could-go-wrong |
| Tool cross-link | `.ag-related-chip` | click → `scrollToTool(relId)` smooth-scrolls to `#ag-tool-{relId}` |

**Data source for assertions:** import the SSOT directly so the test is data-driven and self-updating:
```ts
import { goals, tools, taxonomy } from '../../../website/src/lib/agentGuide';
// or read website/src/lib/agent-guide.generated.json relative to repo root
```
Resolve the import path from `tests/e2e/specs/` carefully (it's outside `website/`); a `tsconfig`/`paths` alias or a direct JSON read with `fs` is simplest — see Task 1.

---

## Design: one spec, two run-modes

Write **one** spec, gate the cinematic behaviour behind an env flag so the same file serves CI and filming:

- **Headless / CI mode (default):** fast, asserts every goal + tool + tier renders and matches the SSOT, copy button toggles label. Runs in the nightly `e2e.yml` website project. No video.
- **Film mode (`AG_FILM=1`):** headed, `slowMo`, `video: 'on'`, larger viewport, an on-page step banner + deliberate `waitForTimeout` pauses and `scrollIntoView` per guide-step, so the run is watchable and self-recording. Invoked via a dedicated task target.

Detect with `const FILM = !!process.env.AG_FILM;` inside the spec and branch the pacing helpers only.

---

## Tasks

### Task 0 — Branch & worktree
- [ ] `dev-flow-execute` will already have set up the branch `feature/agent-guide-e2e-filmable` (this plan is committed on it). Confirm `pnpm install` in `tests/e2e/` (`cd tests/e2e && npm ci`) and that `npx playwright install chromium` has run.

### Task 1 — Navigation + data helpers (TDD: write the failing nav test first)
- [ ] Add `tests/e2e/lib/agent-guide.ts` exporting:
  - `openAgentGuide(page)` — performs steps 1–4 above, returns the `.ag-body` locator; `await expect(body).toBeVisible()`.
  - `loadGuideData()` — reads `website/src/lib/agent-guide.generated.json` (resolve via `path.join(__dirname, '..', '..', '..', 'website', 'src', 'lib', 'agent-guide.generated.json')`) and returns `{ goals, tools, taxonomy }`. (Reading the JSON avoids cross-package TS import friction; the JSON is the exact SSOT the view renders.)
- [ ] First red test: `agent-guide-walkthrough.spec.ts` → `goto('/')`, `openAgentGuide`, assert header title `Agent-Anleitung` and `.ag-body` visible. Run headless against `pnpm dev`; make it green.

### Task 2 — Per-goal ("guidestep") assertions, data-driven
- [ ] For each `goal` in `loadGuideData().goals`, a `test()` (or `test.step`) named `Ziel: {goal.title_de}` that asserts, scoped to that goal's `.ag-card`:
  - title (`.ag-name`) === `goal.title_de`
  - tier badge (`.ag-tier`) contains the taxonomy `emoji` + `label_de` for `goal.danger`
  - every `goal.flow[i].tool_name_de` appears in `.ag-flow`
  - `.ag-prompt-text` === `goal.example_prompt_de`
  - each `goal.guardrails[].name_de` appears as an `.ag-chip summary`; clicking one reveals `.ag-chip-rule`
- [ ] Copy-button behaviour: grant clipboard (`test.use({ permissions: ['clipboard-read','clipboard-write'] })` or `context.grantPermissions`), click `.ag-copy`, assert label flips to `Kopiert ✓`, and (headless) read `navigator.clipboard.readText()` === prompt. **Gotcha:** clipboard is flaky in headless WebKit — pin this test to the chromium project.

### Task 3 — Tools section + cross-links
- [ ] For each `tool`, assert `#ag-tool-{id}` exists, `.ag-name`/`.ag-kind`/`.ag-tier` match SSOT, the `.ag-detail` accordion opens and shows `what_for_de`.
- [ ] Pick one tool with `related.length>0`, click its `.ag-related-chip`, assert the target `#ag-tool-{relId}` is scrolled into view (`toBeInViewport()`).

### Task 4 — Tier legend
- [ ] Assert `.ag-legend-item` count === `taxonomy.length` (4) and each badge text contains the tier's emoji+label.

### Task 5 — Film mode (the gekko deliverable)
- [ ] Add `tests/e2e/playwright.film.config.ts` extending the base config with: `use.headless=false`, `use.launchOptions.slowMo=700`, `use.video='on'`, `use.viewport={width:1440,height:900}`, `retries:0`, `workers:1`, `reporter:[['html',{open:'never'}]]`, `testMatch:['**/agent-guide-walkthrough.spec.ts']`.
- [ ] In the spec, when `AG_FILM`, between guide-steps: `scrollIntoView`, inject a fixed-position step banner via `page.evaluate` (e.g. "Schritt 3/8 — Ich will einen Fehler beheben"), and `await page.waitForTimeout(1500)` so it's filmable. Keep all of this behind the flag so CI stays fast.
- [ ] Add a Taskfile target `test:e2e:agent-guide:film` → `AG_FILM=1 WEBSITE_URL=${WEBSITE_URL:-http://localhost:4321} npx playwright test --config tests/e2e/playwright.film.config.ts`. Videos land in `tests/e2e/test-results/**/video.webm`; the HTML report bundles them. Document that Patrick can also literally watch the headed Chromium window live.
- [ ] Decide target env (see Decisions). Default: `pnpm dev` on `localhost:4321` (hermetic). Live-site filming = `WEBSITE_URL=https://web.mentolder.de`.

### Task 6 — Wire into the suite + inventory
- [ ] Add `**/agent-guide-walkthrough.spec.ts` to the `website` project `testMatch` in `tests/e2e/playwright.config.ts` (headless/CI path only — the film config is separate and never runs in CI).
- [ ] Confirm `e2e.yml` picks it up (it runs the website project nightly against both brands). The spec is brand-agnostic (public homepage), so it passes on mentolder and korczewski.
- [ ] Regenerate `website/src/data/test-inventory.json` (`task test:inventory`) and commit — CI fails if it drifts (see CLAUDE.md). Add an `FA-*` id/title if the inventory convention requires one (grep an existing `fa-*` spec header for the `@id`/describe-title pattern).

### Task 7 — "How to film for gekko" note
- [ ] Add a short `tests/e2e/smoke/README.md`-style note (or extend it) documenting: the one-command film target, where the video is written, how to pick the env, and that no auth/secrets are needed.

---

## Verification (before PR)
- [ ] `cd tests/e2e && npx playwright test --project=website agent-guide-walkthrough.spec.ts` (headless) — green against `pnpm dev`.
- [ ] `task test:e2e:agent-guide:film` — produces a watchable headed run + a `video.webm`; eyeball it end-to-end (this is the actual gekko artifact).
- [ ] `task test:inventory` → no diff after commit.
- [ ] `task test:all` stays green (offline gate — the new spec is e2e-only, shouldn't affect it, but confirm the inventory step).
- [ ] Code-review gate (dev-flow-execute Step 3.8) before merge.

---

## Decisions for Patrick (resolve at execute time)
1. **Film target** — hermetic `localhost:4321` (`pnpm dev`), or the live `web.mentolder.de` (real deployed build, nicer for gekko)? *Recommendation: film the live site, run CI assertions against localhost.*
2. **Scope of "each guidestep"** — goals only (8 cards), or goals **and** tools (8 + 11)? *Recommendation: CI asserts both; the film walks the 8 goals + the tier legend (tools as a fast scroll-through), to keep the recording ~2–3 min.*
3. **Per-goal granularity** — one `test()` per goal (clean per-step video segmentation, more setup overhead) vs one test with `test.step()` per goal (single continuous film). *Recommendation: `test.step()` for the film, parametrized `test()` for CI.*

---

## Risks & gotchas
- **Clipboard in headless** — flaky outside chromium; pin the copy-button assertion to chromium and grant permissions explicitly.
- **FAB overlap / z-index** — the drawer is `z-index:9050`, FAB `9040`; CookieConsent banner may sit on top on first visit. Dismiss/accept cookies first (`goto('/')` → accept consent) or the FAB click may be intercepted. Check `CookieConsent.svelte` for its accept selector.
- **Mobile breakpoint** — `<768px` switches to a full-width drawer + backdrop; film at ≥1440px so layout matches the doc-site.
- **Website rebuild lag** — if filming the live site right after a `website/**` merge, the deployed build can be ~3–4 min behind (build-website.yml). Verify the Agent-Anleitung row is present before recording.
- **Brand parity** — korczewski uses the Kore homepage but the same `PortalSidekick`; the public-page selectors are identical. If a Kore page suppresses the FAB, target `/impressum` instead of `/`.
- **Do not** read `environments/.secrets/*.yaml` — unlike the auth-gated specs, this walkthrough needs no secret. (Per standing instruction, those files are off-limits without an explicit ask.)

---

## Out of scope
- Visual-regression / screenshot diffing of the cards (separate concern).
- Re-testing S1 docs pages or S3 maps (those have their own freshness gates in CI).
- Any change to the registry SSOT or the emitters.
