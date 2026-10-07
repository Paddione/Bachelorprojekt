---
title: nvim-js-frontend implementation plan
ticket_id: T900658
domains: [test, docs]
status: ready
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# nvim-js-frontend — Implementation Plan

_partial-index —_

## Zweck

Dieser Plan baut das Dashboard-Kapitel JavaScript / Frontend (Ticket T900658, EPIC T900654) als projektbewusste Neovim-Seite. Die Seite deckt Astro, Svelte, JavaScript, TypeScript, HTML und CSS ab: Navigation zu Pages, Components, Layouts, Routes und Design-System-Ressourcen sowie die Aktionen dev, preview, lint, type-check, build und test mit korrekten Paketgrenzen (Website per pnpm, Brett und Root per npm, niemals npm innerhalb von `components/website`). Eine Statusaktion bindet die LSP- und Treesitter-Faehigkeiten aus dem Editor-Ticket T900656 an. Jede Seite erhaelt ein vollstaendiges Runbook mit Voraussetzungen, geordneten Schritten, erwartetem Ergebnis, Troubleshooting und Recovery. Alle Befehle und Pfade in diesem Plan wurden am 2026-09-28 live im Worktree verifiziert; Annahmen aus alten Snapshots wurden nicht uebernommen.

## File Structure

### New files

- `dotfiles/nvim/lua/config/js-frontend.lua` (js-frontend.lua — chapter module: navigation plus lifecycle actions; .lua not S1-gated)
- `dotfiles/nvim/runbooks/js-frontend.md` (js-frontend.md — chapter runbook; .md not S1-gated)

### Changed files

- `dotfiles/nvim/lua/config/dashboard.lua` (Ist 271 Zeilen — anchor-based page registration after the files-search block; .lua not S1-gated)
- `dotfiles/nvim/runbooks/README.md` (Ist 43 Zeilen — index line flip from stub to complete; .md not S1-gated)
- `tests/spec/neovim-dashboard.bats` (Ist 778 Zeilen — anchor-based test append at end of file; .bats not S1-gated)
- `components/website/src/data/test-inventory.json` (Ist 6038 Zeilen — regenerated via the repo task; .json not S1-gated)

S1 note: none of the six touched paths carries an S1 limit — `docs/code-quality/gates.yaml` under `s1.limits` lists only compiler-adjacent extensions and has no `.lua`, `.md`, `.bats` or `.json` entry (verified via grep), and the `jq` baseline lookup reports all four existing files as nicht-baselined. No line arithmetic applies; the two new files stay small with growth reserve. No baseline entries may be added.

## Verifizierte Scout-Fakten

- Prior art (T002829): `grep -rn dotfiles/nvim docs/adr/` finds nothing; `grep -rln neovim-dashboard tests/spec/` finds only the suite `tests/spec/neovim-dashboard.bats` itself.
- Target Neovim is v0.12.5 at `/usr/local/bin/nvim`; the BATS runner is `tests/unit/lib/bats-core/bin/bats`.
- Website (`components/website`, pnpm — `pnpm-lock.yaml` present): `dev` runs `astro dev`, `preview` runs `astro preview`, `lint` runs `eslint . --max-warnings 0`, `astro:check` runs `astro check`, `build` runs `astro build`, `test` runs `node tests/api.test.mjs`, `test:unit` runs `vitest run`. Never run npm inside this directory.
- Brett (`components/brett`, npm — `package-lock.json` present): `dev` runs server plus client concurrently, `lint` runs `eslint .`, `typecheck` covers the client plus server configs, `build` runs `vite build` plus the server tsc, `test` runs the tsx suite; there is no `preview` script.
- Repo root (npm): only `typecheck` (`tsc --build`) plus `test:*` variants exist; there are no dev, preview, lint, build or plain test scripts.
- Taskfile: `website:dev` runs the Astro dev server locally; `design:check-sync` compares `design/leitstand-ds/_tokens.css` with `components/website/src/styles/sdlc-leitstand.css`.
- Navigation roots (all verified present): `components/website/src/pages/` (route pages incl. `index.astro` and `[service].astro`), `components/website/src/pages/api/` (API routes), `components/website/src/components/` (Astro plus Svelte components), `components/website/src/layouts/` (`Layout.astro`, `AdminLayout.astro`, `PortalLayout.astro`), and the design pair `design/leitstand-ds/` plus `components/website/src/styles/`.
- Editor capabilities (T900656, `dotfiles/nvim/lua/config/editor-capabilities.lua`): Treesitter parsers include `astro`, `svelte`, `javascript`, `typescript`, `html` and `css`; LSP servers include `ts_ls`, `astro`, `svelte`, `html` and `cssls`. The new `lsp-status` action reports exactly this set. No new plugin enters the kept inventory: Telescope covers navigation, ToggleTerm covers lifecycle commands.
- Registration anchor in `dotfiles/nvim/lua/config/dashboard.lua`: the `local pages` table holds the `['files-search']` block (lines 97-142); the new `['js-frontend']` block goes directly after it, before the table close. The line `2. **JavaScript / Frontend** — T900658 — status: stub` in `dotfiles/nvim/runbooks/README.md` flips to complete.

## Gepinnte Aktionsreihenfolge

Dashboard order equals runbook `actions` order equals runbook step order (keys are single letters, pinned for test determinism):

1. `goto-page` (key `p`) — Telescope file picker rooted at `components/website/src/pages/`
2. `goto-component` (key `c`) — Telescope file picker rooted at `components/website/src/components/`
3. `goto-layout` (key `l`) — Telescope file picker rooted at `components/website/src/layouts/`
4. `goto-route` (key `r`) — Telescope file picker rooted at `components/website/src/pages/api/`
5. `goto-design` (key `d`) — Telescope file picker over `design/leitstand-ds/` plus `components/website/src/styles/`
6. `dev` (key `v`) — start the dev server for the buffer target via ToggleTerm
7. `preview` (key `w`) — preview the built site (website only; other buffers get a warning)
8. `lint` (key `n`) — run the linter for the buffer target via ToggleTerm
9. `type-check` (key `t`) — run the type checker for the buffer target via ToggleTerm
10. `build` (key `b`) — run the build for the buffer target via ToggleTerm
11. `test` (key `e`) — run the test suite for the buffer target via ToggleTerm
12. `lsp-status` (key `s`) — report LSP client plus Treesitter parser status for the frontend set

## Partials

| id | plan | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-module.md | impl | dotfiles/nvim/lua/config/js-frontend.lua |  |
| p2 | tasks.d/p2-runbook.md | docs | dotfiles/nvim/runbooks/js-frontend.md | p1 |
| p3 | tasks.d/p3-registration.md | impl | dotfiles/nvim/lua/config/dashboard.lua, dotfiles/nvim/runbooks/README.md | p1 |
| p4 | tasks.d/p4-tests.md | tests | tests/spec/neovim-dashboard.bats, components/website/src/data/test-inventory.json | p1,p2,p3 |

Execution order honoring depends_on: p1 first; p2 and p3 after p1 (any order); p4 after p1, p2 and p3; then Task 5. Each partial commits its own files as `feat(T900658): <subject> [T900658]` with explicit pathspecs (`git add -f` for dotfiles paths — dotfiles/ is gitignored, force-add per repo convention), never broad adds. Before touching shared files the executor rebases onto latest origin/main and keeps other chapters blocks byte-identical. The dashboard must not integrate OpenSpec; production actions stay manual; Windows/WSL routing stays untouched; no format-on-save and no hidden deployments or Git mutations.

## Task 5: Final verification across all partials

Steps:

1. Run the full relevant gate set from the worktree root:
   - `task test:changed`
   - `task freshness:regenerate`
   - `task freshness:check`
2. Re-run the plan linter on this index to confirm the shipped plan still passes: `bash scripts/plan-lint.sh .agents/plans/nvim-js-frontend/tasks.md` — exit 0, no new warnings versus the staged state.
3. Confirm each partial's acceptance criteria from its tasks.d file hold end to end (module loads headless, the page lists twelve actions in order, the runbook matches, the index is complete, the suite is green) and that no partial touched files outside its manifest row.

Acceptance: all three gate commands green, plan-lint exit 0, every manifest target exists on the branch.
