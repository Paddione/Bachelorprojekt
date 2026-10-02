---
title: nvim-settings-help implementation plan
ticket_id: T900667
domains: [nvim, test, docs]
status: staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# nvim-settings-help — Implementation Plan

_partial-index —

## Zweck

Dieser Plan baut das zehnte Dashboard-Kapitel „Settings und Help" (Ticket T900667, EPIC T900654): eine Seite mit acht Aktionen rund um Config-Quelle, Synchronisationsstatus, Plugin-Verwaltung, Health, Keybindings, Reload, Backup und Recovery — dazu das Runbook-Kapitel und die BATS-Abdeckung. Alle Fakten dahinter wurden am 2026-09-28 live verifiziert; die Fundstellen stehen in den Partial-Kontexten.

## File Structure

### New files

- `dotfiles/nvim/lua/config/settings-help.lua` (settings-help.lua — eight chapter actions; .lua not S1-gated)
- `dotfiles/nvim/runbooks/settings-help.md` (settings-help.md — chapter runbook; .md not S1-gated)

### Changed files

- `dotfiles/nvim/lua/config/dashboard.lua` (dashboard.lua — register the settings-help page; Ist 271 lines; .lua not S1-gated)
- `dotfiles/nvim/runbooks/README.md` (runbook master index — flip the chapter line to complete; Ist 43 lines; .md not S1-gated)
- `tests/spec/neovim-dashboard.bats` (neovim-dashboard.bats — chapter tests; Ist 778 lines; .bats not S1-gated)
- `components/website/src/data/test-inventory.json` (test-inventory.json — regenerated; Ist 6038 lines; .json not S1-gated)

S1 note: `gates.yaml` s1.limits covers .astro/.ts/.svelte/.sh/.mjs/.mts/.py/.js/.jsx/.tsx/.cjs/.bash/.java/.php only — .lua/.md/.bats/.json carry no static limit (confirmed via grep on 2026-09-28). All four existing targets report nicht-baselined via the baseline jq lookup, so no line arithmetic applies and this index claims no numeric line values beyond the Ist sizes above. No baseline entries may be added.

Prior art (T002829 grep, 2026-09-28): `grep -rn dotfiles/nvim docs/adr/` returned no hits; `grep -rln neovim-dashboard tests/spec/` returned exactly `tests/spec/neovim-dashboard.bats` (the file this plan extends).

## Partials

| id | plan | role | target_files | depends_on | min_tier | ctx_tokens |
|----|------|------|--------------|------------|----------|------------|
| p1 | tasks.d/p1-module.md | impl | dotfiles/nvim/lua/config/settings-help.lua |  | 27b-local | 32000 |
| p2 | tasks.d/p2-registration.md | impl | dotfiles/nvim/lua/config/dashboard.lua | p1 | 4b-local | 16000 |
| p3 | tasks.d/p3-runbook.md | impl | dotfiles/nvim/runbooks/settings-help.md, dotfiles/nvim/runbooks/README.md | p2 | 4b-local | 16000 |
| p4 | tasks.d/p4-tests.md | tests | tests/spec/neovim-dashboard.bats, components/website/src/data/test-inventory.json | p1,p2,p3 | 27b-local | 32000 |

Execution order honoring depends_on: p1 first, then p2, then p3, then p4; then Task 5. Each partial commits its own files as `feat(T900667): <subject> [T900667]` with explicit pathspecs (`git add -f` for dotfiles paths — dotfiles/ is gitignored, force-add per repo convention), never broad adds. Before touching shared files (dashboard.lua, runbooks/README.md, neovim-dashboard.bats), the executor rebases onto latest origin/main and keeps every other chapter block byte-identical. No partial creates openspec/ dirs; the dashboard must not integrate OpenSpec.

## Task 5: Final verification across all partials

Steps:

1. Run the full relevant gate set from the worktree root:
   - `task test:changed`
   - `task freshness:regenerate`
   - `task freshness:check`
2. Re-run the plan linter on this index to confirm the shipped plan still passes: `bash scripts/plan-lint.sh .agents/plans/nvim-settings-help/tasks.md` — exit 0, no new warnings versus the staged state.
3. Confirm each partial's acceptance criteria from its tasks.d file hold end to end (module loads, page order, runbook coverage, headless tests green) and that no partial touched files outside its manifest row.

Acceptance: all three gate commands green, plan-lint exit 0, every manifest target exists on the branch.
