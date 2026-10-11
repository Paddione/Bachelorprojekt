---
title: nvim-batch-1b Implementation Plan
ticket_id: T901792
domains: [neovim, dashboard, dev-tooling]
status: staged
---

# nvim-batch-1b — Implementation Plan

Re-Plan fuer T901792 (Welle 1, zweiter Versuch): acht Feature-Kinder
T901044–T901051 als Partials p1–p8 plus Tests-Rolle p9. Ersetzt den Plan
nvim-batch-1 (Branch feature/nvim-batch-1-T901792, geloeschter Stand):
dessen Ziele lagen stale auf Bachelorprojekt/dotfiles/*, das seit PR
#6463/T901648 ein Symlink ins Home-Repo ist — ein Bachelor-PR waere
implementierungsleer geblieben (STALE-STATE-Beleg im T901044-Verlauf).
Alle impl-Ziele sind hier ins Home-Repo umgerootet (Pfade der Form
~/dotfiles/..., siehe Home-Repo-Flow); die Beweissicherung aus T901044
(Live-Backup /tmp/nvim-live-backup-20261011-011823, Drift nur
runbooks/models-inference.md, Dashboard-Spec 25/25 gruen) wird
wiederverwendet. T901212 ist done (Home-PR Paddione/dotfiles#60,
Bachelor-PR Paddione/Bachelorprojekt#6533) und kein Partial mehr. Jedes
Kind wird mit diesem Index gestagt (Hold); die Ausfuehrung folgt den
depends_on-Kanten.

## Home-Repo-Flow (gilt fuer alle impl-Partials)

Seit PR #6463/T901648 ist Bachelorprojekt/dotfiles ein Symlink auf
../dotfiles (Home-Repo Paddione/dotfiles, Zweig master). Alle nvim-Ziele
liegen dadurch im Home-Repo; ein Bachelor-Commit kann sie nicht tragen.
Jedes impl-Partial arbeitet deshalb nach dem T901212-Muster (Home-PR plus
Bachelor-PR, dort #60 und #6533):

- Manifest- und File-Structure-Pfade der Form ~/dotfiles/... bedeuten:
  Pfad dotfiles/... im Home-Repo, ausgecheckt im Home-Worktree des
  Partials (Variable HOME_WT, Pfad ~/.worktrees/dotfiles/<home-branch>).
- Task 0 jedes impl-Partials legt Home-Worktree und Home-Branch an
  (Basis home origin/master); alle nvim-Befehle laufen dort.
- Bachelor-Pfade ohne HOME_WT (scripts/, docs/, environments/, tests/,
  ...) laufen im Bachelor-Worktree dieses Plan-Branches.
- Der Schluss-Task jedes impl-Partials committet, pusht und stellt den
  Home-PR (gh pr create); nach gruenen Checks squash-mergen, Worktree
  und Branch raeumen.
- Die pytest-Spec stagt die Config ueber den Symlink aus dem
  Home-Hauptcheckout — vor dem Tests-Partial alle Home-PRs des Batches
  mergen und den Hauptcheckout ziehen (siehe Tests-Partial Task 0).

## File Structure

| Datei | Ist | Budget |
| `~/dotfiles/nvim/init.lua` | 20 | n/a |
| `~/dotfiles/nvim/lua/core/dashboard.lua` | 276 | n/a |
| `~/dotfiles/nvim/lua/core/actions.lua` | 64 | n/a |
| `~/dotfiles/nvim/lua/core/gitroot.lua` | 38 | n/a |
| `~/dotfiles/nvim/lua/core/lazy.lua` | 67 | n/a |
| `~/dotfiles/nvim/lua/core/options.lua` | 21 | n/a |
| `~/dotfiles/nvim/lua/core/keymaps.lua` | 11 | n/a |
| `~/dotfiles/nvim/runbooks/index.md` | 26 | n/a |
| `~/dotfiles/nvim/runbooks/_template.md` | 38 | n/a |
| `~/dotfiles/nvim/runbooks/home.md` | 69 | n/a |
| `~/dotfiles/nvim/windows/init.lua` | 46 | n/a |
| `~/dotfiles/install.sh` | 183 | n/a |
| `~/dotfiles/nvim/SETUP_CHECKLIST.md` | 21 | n/a |
| `~/dotfiles/nvim/README.md` | 49 | n/a |
| `~/dotfiles/nvim/lua/chapters/editor.lua` | 220 | n/a |
| `~/dotfiles/nvim/lua/plugins/editor.lua` | 46 | n/a |
| `~/dotfiles/nvim/lua/plugins/core.lua` | 22 | n/a |
| `~/dotfiles/nvim/runbooks/editor.md` | 50 | n/a |
| `~/dotfiles/nvim/setup-tools.sh` | 12 | n/a |
| `~/dotfiles/nvim/lazy-lock.json` | 23 | n/a |
| `~/dotfiles/nvim/lua/chapters/files-search.lua` | 125 | n/a |
| `~/dotfiles/nvim/runbooks/files-search.md` | 44 | n/a |
| `~/dotfiles/nvim/lua/chapters/js-frontend.lua` | 196 | n/a |
| `~/dotfiles/nvim/runbooks/js-frontend.md` | 48 | n/a |
| `~/dotfiles/nvim/lua/chapters/github.lua` | 81 | n/a |
| `~/dotfiles/nvim/runbooks/github.md` | 41 | n/a |
| `~/dotfiles/nvim/lua/chapters/sdlc.lua` | 145 | n/a |
| `~/dotfiles/nvim/runbooks/sdlc.md` | 66 | n/a |
| `~/dotfiles/nvim/lua/chapters/repo-knowledge.lua` | 149 | n/a |
| `~/dotfiles/nvim/runbooks/repo-knowledge.md` | 49 | n/a |
| `~/dotfiles/nvim/lua/chapters/ai-agents.lua` | 104 | n/a |
| `~/dotfiles/nvim/runbooks/ai-agents.md` | 40 | n/a |
| `tests/py/spec/native_ported/spec/test_neovim_dashboard.py` | 713 | 87 |
| `components/website/src/data/test-inventory.json` | n/a | n/a |

Ist-Werte der Home-Dateien verifiziert am Home-Worktree auf home
origin/master (ac26c7e, inkl. #60); die pytest-Spec am
Bachelor-Worktree. Das Kuerzel n/a bei Home-Dateien heisst
Home-Repo-Geltung mit eigenen Gates — es wird kein Bachelor-S1-Budget
fuer sie behauptet. Einzige wirksame Bachelor-Zahl: pytest-Spec Ist 713,
Limit 800, Rest 87.

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-fundament.md | impl | ~/dotfiles/nvim/init.lua, ~/dotfiles/nvim/lua/core/dashboard.lua, ~/dotfiles/nvim/lua/core/actions.lua, ~/dotfiles/nvim/lua/core/gitroot.lua, ~/dotfiles/nvim/lua/core/lazy.lua, ~/dotfiles/nvim/lua/core/options.lua, ~/dotfiles/nvim/lua/core/keymaps.lua, ~/dotfiles/nvim/runbooks/index.md, ~/dotfiles/nvim/runbooks/_template.md, ~/dotfiles/nvim/runbooks/home.md, ~/dotfiles/nvim/windows/init.lua, ~/dotfiles/install.sh, ~/dotfiles/nvim/SETUP_CHECKLIST.md, ~/dotfiles/nvim/README.md |  |
| p2 | tasks.d/p2-editor.md | impl | ~/dotfiles/nvim/lua/chapters/editor.lua, ~/dotfiles/nvim/lua/plugins/editor.lua, ~/dotfiles/nvim/lua/plugins/core.lua, ~/dotfiles/nvim/runbooks/editor.md, ~/dotfiles/nvim/setup-tools.sh, ~/dotfiles/nvim/lazy-lock.json | p1 |
| p3 | tasks.d/p3-files-search.md | impl | ~/dotfiles/nvim/lua/chapters/files-search.lua, ~/dotfiles/nvim/runbooks/files-search.md | p1,p2 |
| p4 | tasks.d/p4-js-frontend.md | impl | ~/dotfiles/nvim/lua/chapters/js-frontend.lua, ~/dotfiles/nvim/runbooks/js-frontend.md | p1 |
| p5 | tasks.d/p5-github.md | impl | ~/dotfiles/nvim/lua/chapters/github.lua, ~/dotfiles/nvim/runbooks/github.md | p1 |
| p6 | tasks.d/p6-sdlc.md | impl | ~/dotfiles/nvim/lua/chapters/sdlc.lua, ~/dotfiles/nvim/runbooks/sdlc.md | p1 |
| p7 | tasks.d/p7-repo-knowledge.md | impl | ~/dotfiles/nvim/lua/chapters/repo-knowledge.lua, ~/dotfiles/nvim/runbooks/repo-knowledge.md | p1 |
| p8 | tasks.d/p8-ai-agents.md | impl | ~/dotfiles/nvim/lua/chapters/ai-agents.lua, ~/dotfiles/nvim/runbooks/ai-agents.md | p1 |
| p9 | tasks.d/p9-tests.md | tests | tests/py/spec/native_ported/spec/test_neovim_dashboard.py, components/website/src/data/test-inventory.json | p1,p2,p3,p4,p5,p6,p7,p8 |

Ausfuehrungsreihenfolge: p1 zuerst (harte Kante zu allen Kapiteln), p2
vor p3 (Picker-Entscheid), p9 zuletzt (Tests-Rolle mit rot-gruen-Schritt
nach allen Home-Merges plus Home-Pull).

## Verify (finaler Task, nach allen Partials)

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Dazu: `task test:inventory` nach Test-Aenderungen (p9 Task 3), keine
Baseline-Eintraege, Commit-Scope je Kind als Ticket-Scope
(`feat(T901044): …`). Reihenfolge beachten: erst alle Home-PRs mergen,
dann Home-Hauptcheckout ziehen, dann pytest und Verify (p9 Task 0).
