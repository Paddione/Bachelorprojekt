---
title: nvim-github implementation plan
ticket_id: T900659
domains: [developer-experience, vim]
status: staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# nvim-github — Implementation Plan

_partial-index —

Zweck: Diese Planung fuehrt das GitHub-Kapitel (EPIC T900654, Kapitel 3) des
projektbewussten Neovim-Dashboards ein. Das Kapitel bildet den Runbook-Ablauf
Change vorbereiten, reviewen, CI pruefen, mergen und aufraeumen auf neun
Dashboard-Aktionen ab, uebernimmt die Repo-Konventionen aus dem
git-workflow-Skill (gh-axi fuer Anzeige, gh direkt fuer Mutationen und
maschinenlesbare Ausgabe, Squash-Merge, Branch-Praefixe), zeigt vor jeder
Aktion Ziel-Repo, Branch und PR an, schuetzt Mutationen mit dem kanonischen
Guard (sichtbarer Target-Hinweis plus bewusste Bestaetigung) und erhaelt die
bestehende Gitsigns-Funktion ohne neues Plugin.

## File Structure

### New files

- `dotfiles/nvim/lua/config/github.lua` (github.lua — GitHub chapter actions backed by gh and git; .lua not S1-gated)
- `dotfiles/nvim/runbooks/github.md` (github.md — runbook chapter in dashboard order; .md not S1-gated)

### Changed files

- `dotfiles/nvim/lua/config/dashboard.lua` (dashboard.lua — register the github chapter page after the files-search block; .lua not S1-gated, no numeric budget claimed)
- `tests/spec/neovim-dashboard.bats` (neovim-dashboard.bats — extend with github probes at a unique anchor plus allowlist accept; .bats not S1-gated, no numeric budget claimed)

S1 note: `wc -l` reports dashboard.lua at 271 lines and neovim-dashboard.bats at
778 lines; the `jq` baseline lookup reports both paths as nicht-baselined; the
gates.yaml read command (`grep -A15 '  limits:' docs/code-quality/gates.yaml`)
lists limits only for .astro/.ts/.svelte/.sh/.mjs/.mts/.py/.js/.jsx/.tsx/.cjs/
.bash/.java/.php, so .lua/.md/.bats carry no S1 limit and are not budget-capped.
No baseline entries are added and no numeric budget is claimed for any file.

Prior art (T002829 grep, 2026-09-28): `docs/adr/` carries no hits for
dotfiles/nvim and none for nvim or neovim; `tests/spec/` carries exactly one
hit, the existing suite file neovim-dashboard.bats extended by this plan.

## Partials

| id | plan | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-impl.md | impl | dotfiles/nvim/lua/config/github.lua, dotfiles/nvim/lua/config/dashboard.lua |  |
| p2 | tasks.d/p2-tests-runbook.md | tests | dotfiles/nvim/runbooks/github.md, tests/spec/neovim-dashboard.bats | p1 |

Execution order honoring depends_on: p1 first, then p2, then Task 3. Each
partial commits its own files as `feat(T900659): <subject> [T900659]` with
explicit pathspecs (`git add -f` for dotfiles paths — dotfiles/ is gitignored,
force-add per repo convention documented in dotfiles/nvim/README.md), never
broad adds. Each partial rebases onto latest origin/main before touching a
shared file (`git fetch origin main`, then rebase the branch) and keeps every
other chapter block byte-identical. The runbook master index
runbooks/README.md stays untouched: its stub-count test requires all ten
numbered entries stub-marked, and the files-search precedent shipped the same
way. The dashboard must not integrate OpenSpec. The Windows wrapper routing
stays untouched.

## Task 3: Final verification across all partials

Steps:

1. Run the full relevant gate set from the worktree root:
   - `task test:changed`
   - `task freshness:regenerate`
   - `task freshness:check`
2. Re-run the plan linter on this index to confirm the shipped plan still passes: `bash scripts/plan-lint.sh .agents/plans/nvim-github/tasks.md` — exit 0, no new warnings versus the staged state.
3. Confirm each partial's acceptance criteria from its tasks.d file hold end to end (module shape, page order, guard behavior, target display, gitsigns preservation, zero format-on-save autocmds, runbook step order, red-green proof) and that no partial touched files outside its manifest row.

Acceptance: all three gate commands green, plan-lint exit 0, every manifest target exists on the branch.
