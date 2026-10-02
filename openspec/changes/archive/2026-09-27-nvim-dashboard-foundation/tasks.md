---
title: nvim-dashboard-foundation implementation plan
ticket_id: T900655
domains: [test, docs]
status: completed
---

# nvim-dashboard-foundation — Implementation Plan

_partial-index —

## File Structure

### New files

- `dotfiles/nvim/init.lua` (init.lua — bootstrap: leader, lazy.nvim stable, requires; .lua not S1-gated)
- `dotfiles/nvim/lua/config/editor.lua` (editor.lua — reviewed editing defaults; .lua not S1-gated)
- `dotfiles/nvim/lua/plugins/core.lua` (core.lua — lazy specs, exactly the 13 kept plugins; .lua not S1-gated)
- `dotfiles/nvim/lua/config/gitroot.lua` (gitroot.lua — buffer-based Git-root function; .lua not S1-gated)
- `dotfiles/nvim/lua/config/dashboard.lua` (dashboard.lua — Snacks shell, fixed chapter order; .lua not S1-gated)
- `dotfiles/nvim/runbooks/README.md` (runbook master index; .md not S1-gated)
- `dotfiles/nvim/runbooks/_template.md` (_template.md — runbook template; .md not S1-gated)
- `dotfiles/nvim/runbooks/home.md` (home.md — Home reference runbook; .md not S1-gated)
- `dotfiles/nvim/README.md` (config README: install, usage, rollback; .md not S1-gated)
- `tests/spec/neovim-dashboard.bats` (neovim-dashboard.bats — headless tests; .bats not S1-gated)

### Changed files

| `dotfiles/install.sh` | 169 | 631 |

- `docs/runbooks/neovim-plugin-scouting.md` (durable-facts refresh; .md not S1-gated)
- `components/website/src/data/test-inventory.json` (regenerated via test inventory; .json not S1-gated)

S1 note: only `.sh` files carry a static limit here (800). `dotfiles/install.sh` is not baselined: Ist 169, wirksame Schwelle 800, Restbudget 631. All other targets (.lua/.md/.bats/.json) have no S1 limit entry and are not budget-capped. No baseline entries may be added.

## Partials

| id | plan | role | target_files | depends_on | min_tier | ctx_tokens |
|----|------|------|--------------|------------|----------|------------|
| p1 | tasks.d/p1-core.md | impl | dotfiles/nvim/init.lua, dotfiles/nvim/lua/config/editor.lua, dotfiles/nvim/lua/plugins/core.lua |  | 27b-local | 32000 |
| p2 | tasks.d/p2-navigation.md | impl | dotfiles/nvim/lua/config/gitroot.lua, dotfiles/nvim/lua/config/dashboard.lua |  | 27b-local | 32000 |
| p3 | tasks.d/p3-runbooks.md | impl | dotfiles/nvim/runbooks/README.md, dotfiles/nvim/runbooks/_template.md, dotfiles/nvim/runbooks/home.md | p2 | 4b-local | 32000 |
| p4 | tasks.d/p4-install-docs.md | impl | dotfiles/nvim/README.md, dotfiles/install.sh, docs/runbooks/neovim-plugin-scouting.md |  | 4b-local | 32000 |
| p5 | tasks.d/p5-tests.md | tests | tests/spec/neovim-dashboard.bats, components/website/src/data/test-inventory.json | p1,p2,p3 | 27b-local | 32000 |

Execution order honoring depends_on: p1, p2, p4 first (any order, p3 after p2); p5 after p1, p2, p3; then Task 6. Each partial commits its own files as `feat(T900655): <subject> [T900655]` with explicit pathspecs (`git add -f` for dotfiles paths — dotfiles/ is gitignored, force-add per repo convention), never broad adds.

## Task 6: Final verification across all partials

Steps:

1. Run the full relevant gate set from the worktree root:
   - `task test:changed`
   - `task freshness:regenerate`
   - `task freshness:check`
2. Re-run the plan linter on this index to confirm the shipped plan still passes: `bash scripts/plan-lint.sh openspec/changes/nvim-dashboard-foundation/tasks.md` — exit 0, no new warnings versus the staged state.
3. Confirm each partial's acceptance criteria from its tasks.d file hold end to end (headless startup, gitroot cases, dashboard order, runbook coverage, install idempotency) and that no partial touched files outside its manifest row.

Acceptance: all three gate commands green, plan-lint exit 0, every manifest target exists on the branch.
