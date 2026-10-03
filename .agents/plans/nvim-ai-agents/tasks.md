---
title: nvim-ai-agents implementation plan
ticket_id: T900662
domains: [developer-experience, vim]
status: staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# nvim-ai-agents — Implementation Plan

_partial-index —

Zweck: Das Dashboard-Kapitel „AI und Agents" (Ticket T900662, EPIC T900654) macht die vorhandene OpenCode-Integration, die Agenten-Skills und die Session-Steuerung vom Neovim-Dashboard aus erreichbar und dokumentiert die Abgrenzung zwischen menschlicher Tippvervollstaendigung (Blink) und Agenten-Navigation ueber Werkzeuge. Alle Fakten unten wurden am 2026-09-28 live erhoben; OpenSpec bleibt aus dem Dashboard heraus.

## File Structure

### New files

- `dotfiles/nvim/lua/config/ai-agents.lua` (ai-agents.lua — chapter actions for OpenCode, skills and session control; .lua not S1-gated, no numeric budget claimed)
- `dotfiles/nvim/runbooks/ai-agents.md` (ai-agents.md — runbook chapter; .md not S1-gated, no numeric budget claimed)

### Changed files

- `dotfiles/nvim/lua/config/dashboard.lua` (dashboard.lua — register the ai-agents chapter page; Ist 271, .lua not S1-gated, no numeric budget claimed)
- `tests/spec/neovim-dashboard.bats` (neovim-dashboard.bats — append ai-agents probes; Ist 778, .bats not S1-gated, no numeric budget claimed)
- `components/website/src/data/test-inventory.json` (only if freshness regeneration changes it; Ist 6038, .json not S1-gated, no numeric budget claimed)

S1 note: no target carries a static limit here. Lua, Markdown, BATS-shell-test and JSON files have no S1 limit entries (verified via `grep -A15 '  limits:' docs/code-quality/gates.yaml`) and are not budget-capped; both shared files report `nicht-baselined` via the baseline jq lookup. No baseline entries are added and no numeric budget is claimed for any file.

Prior art (T002829): `grep -rn dotfiles/nvim docs/adr/` has no hits; `grep -rln neovim-dashboard tests/spec/` hits only `tests/spec/neovim-dashboard.bats`, the suite this plan extends.

## Partials

| id | plan | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-impl.md | impl | dotfiles/nvim/lua/config/ai-agents.lua, dotfiles/nvim/lua/config/dashboard.lua |  |
| p2 | tasks.d/p2-runbook.md | impl | dotfiles/nvim/runbooks/ai-agents.md | p1 |
| p3 | tasks.d/p3-tests.md | tests | tests/spec/neovim-dashboard.bats, components/website/src/data/test-inventory.json | p1,p2 |

Execution order honoring depends_on: p1 first, then p2, then p3, then Task 4. Each partial commits its own files as `feat(T900662): <subject> [T900662]` with explicit pathspecs (`git add -f` for dotfiles paths — dotfiles/ is gitignored, force-add per repo convention), never broad adds. Before touching a shared file (`dashboard.lua`, `neovim-dashboard.bats`), the executor rebases onto the latest `origin/main` first and keeps every other chapter block intact (anchor-based appends only, unique `T900662 ai-agents` markers). The dashboard must not integrate OpenSpec. `runbooks/README.md` stays untouched: the foundation suite asserts exactly ten `status: stub` entries, and the shipped files-search chapter (T900657) set the precedent of landing its runbook without flipping its index line.

## Task 4: Final verification across all partials

Steps:

1. Run the full relevant gate set from the worktree root:
   - `task test:changed`
   - `task freshness:regenerate`
   - `task freshness:check`
2. Re-run the plan linter on this index to confirm the shipped plan still passes: `bash scripts/plan-lint.sh .agents/plans/nvim-ai-agents/tasks.md` — exit 0, no new warnings versus the staged state.
3. Confirm each partial's acceptance criteria from its tasks.d file hold end to end (module shape, page order, skills listing, session control, runbook step order, red-green proof) and that no partial touched files outside its manifest row.

Acceptance: all three gate commands green, plan-lint exit 0, every manifest target exists on the branch.
