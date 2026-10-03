---
title: nvim-infrastructure implementation plan
ticket_id: T900664
domains: [developer-experience, vim]
status: staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# nvim-infrastructure — Implementation Plan

_partial-index —

Zweck: Dieses Kapitel bringt Node- und Cluster-Status, Pods, Services, Pod-Logs, eine explizite Context- und Namespace-Auswahl (fleet, devmesh; korczewski bleibt gesperrt) sowie eine Setup-Checkliste als sechs Dashboard-Aktionen in die projektbewusste Neovim-Konfiguration. Alle Aktionen sind lesend oder rein lokal (Context-Umschaltung im lokalen kubeconfig); Produktionsmutationen bleiben manuell in der Shell. Es kommt kein neues Plugin hinzu (kubectl.nvim und ToggleTerm werden weiterverwendet), OpenSpec bleibt aus dem Dashboard heraus, und das Windows/WSL-Routing bleibt unangetastet.

Live-Erhebung (2026-09-28, kein Snapshot): `nvim` v0.12.5 unter `/usr/local/bin/nvim`; `kubectl` v1.36.3 unter `/usr/local/bin/kubectl`; `kubectx` vorhanden; Contexts `fleet` (aktuell) und `devmesh`; korczewski frozen per `flux/clusters/fleet/ks-korczewski.yaml` (`suspend: true`, T002479); 6 Nodes Ready und `workspace`-Pods/Services live auf fleet verifiziert; Task-Targets `workspace:deploy`, `workspace:status`, `clusters:status`, `workspace:validate` in `task --list` vorhanden. Prior-Art (T002829): `docs/adr/` ohne Treffer zu `dotfiles/nvim`; `tests/spec/` mit genau einem Treffer (`tests/spec/neovim-dashboard.bats`). Registrierungs-Anker: der `infrastructure = {`-Block in `dotfiles/nvim/lua/config/dashboard.lua` (Stub plus Status-Link); der `['infrastructure-status']`-Block der Foundation bleibt unveraendert.

## File Structure

### New files

- `dotfiles/nvim/lua/config/infrastructure.lua` (infrastructure.lua — sechs Infrastruktur-Aktionen, lesend plus lokale Context-Auswahl; .lua nicht S1-gemessen)
- `dotfiles/nvim/runbooks/infrastructure.md` (infrastructure.md — Runbook-Kapitel nach `_template.md`; .md nicht S1-gemessen)

### Changed files

- `dotfiles/nvim/lua/config/dashboard.lua` (MODIFY: Infrastruktur-Stub durch die echte Kapitelseite ersetzen, Status-Link behalten; Ist 271 Zeilen, S1-nicht-baselined; .lua hat keinen S1-Limit-Eintrag in `gates.yaml`, daher ist keine Zahl als Limit anwendbar und es wird bewusst keine Zahl behauptet)
- `tests/spec/neovim-dashboard.bats` (EXTEND: Infrastruktur-Proben an neuem T900664-Anker anhaengen plus ein Eintrag in der bestehenden Runbook-Allowlist; Ist 778 Zeilen, S1-nicht-baselined; .bats hat keinen S1-Limit-Eintrag in `gates.yaml`, daher ist keine Zahl als Limit anwendbar und es wird bewusst keine Zahl behauptet)

S1 note: no target carries a static limit here. Lua, Markdown and BATS-shell-test files have no S1 limit entries (verified via the `gates.yaml` limits read: only .astro/.ts/.svelte/.sh/.mjs/.mts/.py/.js/.jsx/.tsx/.cjs/.bash/.java/.php are listed) and both changed files resolve to `nicht-baselined` in `baseline.json`. No baseline entries are added and no numeric budget is claimed for any file.

Bewusst nicht geaendert (Praezedenz T900657, gemergt in #6082): `dotfiles/nvim/runbooks/README.md` behaelt die `status: stub`-Zeile fuer Infrastructure. Ein Flip auf `complete` wuerde den Foundation-Test auf genau zehn Stub-Eintraege brechen und ueber acht parallele Kapitel-Tickets zaehlen; die Index-Konsolidierung folgt in einem eigenen Ticket. Ebenfalls bewusst nicht geaendert: `components/website/src/data/test-inventory.json` (reine BATS-Erweiterung, keine Website-Tests; Praezedenz T900657).

## Partials

| id | plan | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-impl.md | impl | dotfiles/nvim/lua/config/infrastructure.lua, dotfiles/nvim/lua/config/dashboard.lua |  |
| p2 | tasks.d/p2-tests-runbook.md | tests | dotfiles/nvim/runbooks/infrastructure.md, tests/spec/neovim-dashboard.bats | p1 |

Execution order honoring depends_on: p1 first, then p2. Each partial rebases onto latest `origin/main` before touching shared files (`dashboard.lua`, `neovim-dashboard.bats`) and keeps other chapters blocks. Each partial commits its own files as `feat(T900664): <subject> [T900664]` with explicit pathspecs (`git add -f` for dotfiles paths — `dotfiles/` is gitignored, force-add per repo convention), never broad adds.

## Task 3: Final verification across all partials

Steps:

1. Run the full relevant gate set from the worktree root:
   - `task test:changed`
   - `task freshness:regenerate`
   - `task freshness:check`
2. Re-run the plan linter on this index to confirm the shipped plan still passes: `bash scripts/plan-lint.sh .agents/plans/nvim-infrastructure/tasks.md` — exit 0, no new warnings versus the staged state.
3. Confirm each partial's acceptance criteria from its tasks.d file hold end to end (module shape, page order with kept Status link, context guard, runbook parity, red-green proof) and that no partial touched files outside its manifest row.

Acceptance: all three gate commands green, plan-lint exit 0, every manifest target exists on the branch.
