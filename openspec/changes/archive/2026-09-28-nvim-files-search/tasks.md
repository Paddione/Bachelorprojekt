---
title: nvim-files-search implementation plan
ticket_id: T900657
domains: [developer-experience, vim]
status: staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# nvim-files-search — Implementation Plan

_partial-index —

## File Structure

### New files

- `dotfiles/nvim/lua/config/files-search.lua` (files-search.lua — gitroot search actions; .lua not S1-gated)
- `dotfiles/nvim/runbooks/files-search.md` (files-search.md — runbook chapter; .md not S1-gated)

### Changed files

- `dotfiles/nvim/lua/config/dashboard.lua` (dashboard.lua — wire the files-search chapter page; .lua not S1-gated, no numeric budget claimed)
- `tests/spec/neovim-dashboard.bats` (neovim-dashboard.bats — extend with files-search probes; .bats not S1-gated, no numeric budget claimed)

S1 note: no target carries a static limit here. Lua, Markdown and BATS-shell-test files have no S1 limit entries and are not budget-capped. No baseline entries are added and no numeric budget is claimed for any file.

## Partials

| id | plan | role | target_files | depends_on | min_tier | ctx_tokens |
|----|------|------|--------------|------------|----------|------------|
| p1 | tasks.d/p1-impl.md | impl | dotfiles/nvim/lua/config/files-search.lua, dotfiles/nvim/lua/config/dashboard.lua |  | 27b-local | 32000 |
| p2 | tasks.d/p2-tests-runbook.md | tests | dotfiles/nvim/runbooks/files-search.md, tests/spec/neovim-dashboard.bats | p1 | 4b-local | 32000 |

Execution order honoring depends_on: p1 first, then p2. Each partial commits its own files as `feat(T900657): <subject> [T900657]` with explicit pathspecs, never broad adds.

## Task 6: Final verification across all partials

Steps:

1. Run the full relevant gate set from the worktree root:
   - `task test:changed`
   - `task freshness:regenerate`
   - `task freshness:check`
2. Re-run the plan linter on this index to confirm the shipped plan still passes: `bash scripts/plan-lint.sh openspec/changes/nvim-files-search/tasks.md` — exit 0, no new warnings versus the staged state.
3. Confirm each partial's acceptance criteria from its tasks.d file hold end to end (module shape, page order, nested/worktree/space-path resolution, runbook step order, red-green proof) and that no partial touched files outside its manifest row.

Acceptance: all three gate commands green, plan-lint exit 0, every manifest target exists on the branch.
