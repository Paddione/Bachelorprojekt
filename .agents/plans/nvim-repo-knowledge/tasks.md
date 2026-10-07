---
title: nvim-repo-knowledge implementation plan
ticket_id: T900661
domains: [developer-experience, vim]
status: staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# nvim-repo-knowledge — Implementation Plan

_partial-index —

## File Structure

### New files

- `dotfiles/nvim/lua/config/repo-knowledge.lua` (repo-knowledge.lua — read-only repository-knowledge actions: oracle discovery, K3 graph queries, docs/runbook pickers, explained checks, generated maps; .lua not S1-gated)
- `dotfiles/nvim/runbooks/repo-knowledge.md` (repo-knowledge.md — runbook chapter; .md not S1-gated)

### Changed files

- `dotfiles/nvim/lua/config/dashboard.lua` (dashboard.lua — Ist 271 lines, nicht-baselined; register the repo-knowledge chapter page at the pages-table anchor; .lua not S1-gated, no numeric budget claimed)
- `tests/spec/neovim-dashboard.bats` (neovim-dashboard.bats — Ist 778 lines, nicht-baselined; extend with repo-knowledge probes at a unique per-chapter anchor plus runbook-allowlist entry; .bats not S1-gated, no numeric budget claimed)

S1 note: no target carries a static limit here. Lua, Markdown and BATS-shell-test files have no S1 limit entries in `docs/code-quality/gates.yaml` (`s1.limits` covers only .astro/.ts/.svelte/.sh/.mjs/.mts/.py/.js/.jsx/.tsx/.cjs/.bash/.java/.php) and are not budget-capped; both changed files are nicht-baselined per `docs/code-quality/baseline.json` lookup. No baseline entries are added and no numeric budget is claimed for any file.

## Zweck

Dieses Kapitel baut die Dashboard-Seite „Repository & Code Knowledge" (Ticket T900661, EPIC T900654) als rein lesende Wissenszentrale in der projektbewussten Neovim-Konfiguration: Task-Discovery über das Task-Oracle, K3-Symbolsuche mit Caller/Callee-Verfolgung, Zugriff auf Runbooks, Projektanweisungen und Tool-Capability-Doku, ausgewählte Checks mit erklärter Wirkung sowie generierte Karten mit klar benannten Grenzen. Alle Fakten wurden am 2026-09-28 live erhoben: das Oracle meldet ohne laufenden LLM-Dienst ehrlich „No local LLM service" und nennt den manuellen `task --list`-Ersatz; der K3-Index (`codebase-memory-mcp cli`, stdin-JSON) meldet `status: ready` mit 100078 Nodes / 207661 Edges auf Head `db86a9b5`; die Check-Ziele `freshness:check`, `freshness:regenerate`, `freshness:graph-check` und `workspace:validate` existieren in der Taskliste; die Karten `docs/generated/graph.json`, `api-map.json`, `blast-radius.md`, `api-surface.md` liegen vor. Prior-art-Recherche: `grep -rn dotfiles/nvim docs/adr/` liefert keine Treffer, `grep -rln neovim-dashboard tests/spec/` liefert nur `tests/spec/neovim-dashboard.bats`. Es gilt: keine OpenSpec-Anbindung im Dashboard, keine Produktionsaktionen aus dem Editor, keine neuen Plugins (Telescope, ToggleTerm, Plenary sind im Bestand), kein Format-on-save, Git-Root immer aus dem aktuellen Buffer, WSL/Windows-Routing unangetastet.

## Partials

| id | plan | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-impl.md | impl | dotfiles/nvim/lua/config/repo-knowledge.lua, dotfiles/nvim/lua/config/dashboard.lua |  |
| p2 | tasks.d/p2-runbook.md | docs | dotfiles/nvim/runbooks/repo-knowledge.md | p1 |
| p3 | tasks.d/p3-tests.md | tests | tests/spec/neovim-dashboard.bats | p1,p2 |

Execution order honoring depends_on: p1 first, then p2, then p3. Each partial commits its own files as `feat(T900661): <subject> [T900661]` with explicit pathspecs (`git add -f` for dotfiles paths — dotfiles/ is gitignored, force-add per repo convention), never broad adds. Before touching a shared file the executor rebases onto latest origin/main and keeps every other chapter block intact.

## Task 4: Final verification across all partials

Steps:

1. Run the full relevant gate set from the worktree root:
   - `task test:changed`
   - `task freshness:regenerate`
   - `task freshness:check`
2. Re-run the plan linter on this index to confirm the shipped plan still passes: `bash scripts/plan-lint.sh .agents/plans/nvim-repo-knowledge/tasks.md` — exit 0, no new warnings versus the staged state.
3. Confirm each partial's acceptance criteria from its tasks.d file hold end to end (module shape, page order, K3 live behavior with graceful degradation, runbook step order, red-green proof) and that no partial touched files outside its manifest row.

Acceptance: all three gate commands green, plan-lint exit 0, every manifest target exists on the branch.
