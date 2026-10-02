---
title: nvim-editor-wiring implementation plan
ticket_id: T900747
domains: [vim, developer-experience]
status: staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# nvim-editor-wiring — Implementation Plan

_partial-index —

Zweck: Die dormant `plugins/editor.lua` (T900656, shipped) wird in `init.lua`
verdrahtet und die Verdrahtung headless getestet, damit Treesitter, LSP und
Blink im Startup-Pfad landen und ein Dormant-Zustand kuenftig sofort rot
wird. Alle Fakten unten wurden am 2026-09-28 live erhoben und per
Headless-Prototyp verifiziert (unwired: 13 Registry-Namen; wired: 16).

## File Structure

### New files

None.

### Changed files

- `dotfiles/nvim/init.lua` (init.lua — add the editor import line; Ist 38, .lua not S1-gated, no numeric budget claimed)
- `tests/spec/neovim-dashboard.bats` (neovim-dashboard.bats — append wiring probe plus test; Ist 2451, .bats not S1-gated, no numeric budget claimed)
- `components/website/src/data/test-inventory.json` (only if freshness regeneration changes it; Ist 6038, .json not S1-gated, no numeric budget claimed)

S1 note: no target carries a static limit here. Lua, BATS-shell-test and JSON files have no S1 limit entries (verified via `grep -A15 '  limits:' docs/code-quality/gates.yaml`) and are not budget-capped; both shared files report `nicht-baselined` via the baseline jq lookup. No baseline entries are added and no numeric budget is claimed for any file.

Prior art (T002829): `grep -rn -e 'plugins/editor' -e 'editor-capabilities' docs/adr/` has no hits; `grep -rln 'plugins/editor\|editor-capabilities' tests/spec/` hits only `tests/spec/neovim-dashboard.bats`, the suite this plan extends.

## Partials

| id | plan | role | target_files | depends_on | min_tier | ctx_tokens |
|----|------|------|--------------|------------|----------|------------|
| p1 | tasks.d/p1-impl.md | impl | dotfiles/nvim/init.lua |  | 4b-local | 32000 |
| p2 | tasks.d/p2-tests.md | tests | tests/spec/neovim-dashboard.bats, components/website/src/data/test-inventory.json | p1 | 27b-local | 80000 |

Execution order honoring depends_on: p1 first, then p2, then Task 3. Each partial commits its own files as `feat(T900747): <subject> [T900747]` with explicit pathspecs (`git add -f` for dotfiles paths — dotfiles/ is gitignored, force-add per repo convention), never broad adds. Before touching a shared file (`init.lua`, `neovim-dashboard.bats`), the executor rebases onto the latest `origin/main` first and keeps every other block intact (one-line import after the core line in p1; anchor-based append with unique `T900747 editor wiring` markers in p2). `plugins/editor.lua`, `config/editor-capabilities.lua`, and all runbooks stay untouched: T900656 shipped and this ticket is wiring scope only, no revert.

## Task 3: Final verification across all partials

Steps:

1. Run the full relevant gate set from the worktree root:
   - `task test:changed`
   - `task freshness:regenerate`
   - `task freshness:check`
2. Re-run the plan linter on this index to confirm the shipped plan still passes: `bash scripts/plan-lint.sh .agents/plans/nvim-editor-wiring/tasks.md` — exit 0, no new warnings versus the staged state.
3. Confirm each partial's acceptance criteria from its tasks.d file hold end to end (single-line import, registry names, clean startup, zero BufWritePre autocmds, red-green proof) and that no partial touched files outside its manifest row.

Acceptance: all three gate commands green, plan-lint exit 0, every manifest target exists on the branch.
