---
title: nvim-batch-1 Implementation Plan
ticket_id: T901792
domains: [neovim, dashboard, dev-tooling]
status: staged
---

# nvim-batch-1 — Implementation Plan

Batch-Plan fuer T901792 (Welle 1): acht Feature-Kinder T901044–T901051
als Partials p1–p8 plus Tests-Rolle p9. T901212 (Home-Repo) hat einen
eigenen Plan unter `.agents/plans/nvim-ssot-umzug/tasks.md`. Jedes Kind
wird mit diesem Index gestagt (Hold); die Ausfuehrung folgt den
depends_on-Kanten.

## File Structure

| Datei | Ist | Budget |
| `dotfiles/nvim/init.lua` | 20 | n/a |
| `dotfiles/nvim/lua/core/dashboard.lua` | 276 | n/a |
| `dotfiles/nvim/lua/core/actions.lua` | 64 | n/a |
| `dotfiles/nvim/lua/core/gitroot.lua` | 38 | n/a |
| `dotfiles/nvim/lua/core/lazy.lua` | 67 | n/a |
| `dotfiles/nvim/lua/core/options.lua` | 21 | n/a |
| `dotfiles/nvim/lua/core/keymaps.lua` | 11 | n/a |
| `dotfiles/nvim/runbooks/index.md` | n/a | n/a |
| `dotfiles/nvim/runbooks/_template.md` | n/a | n/a |
| `dotfiles/nvim/runbooks/home.md` | n/a | n/a |
| `dotfiles/nvim/windows/init.lua` | 46 | n/a |
| `dotfiles/install.sh` | 183 | 617 |
| `dotfiles/nvim/SETUP_CHECKLIST.md` | n/a | n/a |
| `dotfiles/nvim/README.md` | n/a | n/a |
| `dotfiles/nvim/lua/chapters/editor.lua` | 220 | n/a |
| `dotfiles/nvim/lua/plugins/editor.lua` | 46 | n/a |
| `dotfiles/nvim/lua/plugins/core.lua` | 22 | n/a |
| `dotfiles/nvim/runbooks/editor.md` | n/a | n/a |
| `dotfiles/nvim/setup-tools.sh` | 12 | 788 |
| `dotfiles/nvim/lazy-lock.json` | n/a | n/a |
| `dotfiles/nvim/lua/chapters/files-search.lua` | 125 | n/a |
| `dotfiles/nvim/runbooks/files-search.md` | n/a | n/a |
| `dotfiles/nvim/lua/chapters/js-frontend.lua` | 196 | n/a |
| `dotfiles/nvim/runbooks/js-frontend.md` | n/a | n/a |
| `dotfiles/nvim/lua/chapters/github.lua` | 81 | n/a |
| `dotfiles/nvim/runbooks/github.md` | n/a | n/a |
| `dotfiles/nvim/lua/chapters/sdlc.lua` | 145 | n/a |
| `dotfiles/nvim/runbooks/sdlc.md` | n/a | n/a |
| `dotfiles/nvim/lua/chapters/repo-knowledge.lua` | 149 | n/a |
| `dotfiles/nvim/runbooks/repo-knowledge.md` | n/a | n/a |
| `dotfiles/nvim/lua/chapters/ai-agents.lua` | 104 | n/a |
| `dotfiles/nvim/runbooks/ai-agents.md` | n/a | n/a |
| `tests/py/spec/native_ported/spec/test_neovim_dashboard.py` | 713 | 87 |
| `components/website/src/data/test-inventory.json` | n/a | n/a |

Budgets: S1 misst `.lua`, `.md`, `.json` nicht (kein Limit in
`gates.yaml`); wirksame Zahlen nur fuer `.sh` und `.py` (Restbudgets
617, 788, 87 — verifiziert per `plan-lint.sh residual_budget`).

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-fundament.md | impl | dotfiles/nvim/init.lua, dotfiles/nvim/lua/core/dashboard.lua, dotfiles/nvim/lua/core/actions.lua, dotfiles/nvim/lua/core/gitroot.lua, dotfiles/nvim/lua/core/lazy.lua, dotfiles/nvim/lua/core/options.lua, dotfiles/nvim/lua/core/keymaps.lua, dotfiles/nvim/runbooks/index.md, dotfiles/nvim/runbooks/_template.md, dotfiles/nvim/runbooks/home.md, dotfiles/nvim/windows/init.lua, dotfiles/install.sh, dotfiles/nvim/SETUP_CHECKLIST.md, dotfiles/nvim/README.md |  |
| p2 | tasks.d/p2-editor.md | impl | dotfiles/nvim/lua/chapters/editor.lua, dotfiles/nvim/lua/plugins/editor.lua, dotfiles/nvim/lua/plugins/core.lua, dotfiles/nvim/runbooks/editor.md, dotfiles/nvim/setup-tools.sh, dotfiles/nvim/lazy-lock.json | p1 |
| p3 | tasks.d/p3-files-search.md | impl | dotfiles/nvim/lua/chapters/files-search.lua, dotfiles/nvim/runbooks/files-search.md | p1,p2 |
| p4 | tasks.d/p4-js-frontend.md | impl | dotfiles/nvim/lua/chapters/js-frontend.lua, dotfiles/nvim/runbooks/js-frontend.md | p1 |
| p5 | tasks.d/p5-github.md | impl | dotfiles/nvim/lua/chapters/github.lua, dotfiles/nvim/runbooks/github.md | p1 |
| p6 | tasks.d/p6-sdlc.md | impl | dotfiles/nvim/lua/chapters/sdlc.lua, dotfiles/nvim/runbooks/sdlc.md | p1 |
| p7 | tasks.d/p7-repo-knowledge.md | impl | dotfiles/nvim/lua/chapters/repo-knowledge.lua, dotfiles/nvim/runbooks/repo-knowledge.md | p1 |
| p8 | tasks.d/p8-ai-agents.md | impl | dotfiles/nvim/lua/chapters/ai-agents.lua, dotfiles/nvim/runbooks/ai-agents.md | p1 |
| p9 | tasks.d/p9-tests.md | tests | tests/py/spec/native_ported/spec/test_neovim_dashboard.py, components/website/src/data/test-inventory.json | p1,p2,p3,p4,p5,p6,p7,p8 |

Ausfuehrungsreihenfolge: p1 zuerst (harte Kante zu allen Kapiteln), p2
vor p3 (Picker-Entscheid), p9 zuletzt (Tests-Rolle mit rot-gruen-Schritt).

## Verify (finaler Task, nach allen Partials)

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Dazu: `task test:inventory` nach Test-Aenderungen (p9 Task 3), keine
Baseline-Eintraege, Commit-Scope je Kind als Ticket-Scope
(`feat(T901044): …`).
