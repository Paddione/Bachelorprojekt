---
title: p6 SDLC um Plan-Review erweitern
ticket_id: T901049
role: impl
---

# p6 — SDLC (T901049)

Ziel: Lese-Aktionen belegen, fehlende Plan-Review-Aktion ergaenzen,
Mutationsfreiheit belegen. Haengt an p1. Home-Branch:
feat/nvim-sdlc-T901049.

## File Structure

Alle Ziele liegen im Home-Repo (Paddione/dotfiles); Arbeitsverzeichnis
ist der Home-Worktree aus Task 0.

- `~/dotfiles/nvim/lua/chapters/sdlc.lua` (Ist 145, S1 n/a)
- `~/dotfiles/nvim/runbooks/sdlc.md` (S1 n/a)

## Task 0 — Home-Worktree und Home-Branch

```bash
HOME_WT="$HOME/.worktrees/dotfiles/feat/nvim-sdlc-T901049"
python3 ~/scripts/agent-workspace.py create --repo /home/patrick feat/nvim-sdlc-T901049
git -C "$HOME_WT" log --oneline -1
```

Basis ist home origin/master nach dem p1-Home-Merge. Alle Befehle mit
HOME_WT laufen im Home-Worktree.

## Task 1 — Bestand und Dispatcher belegen

```bash
HOME_WT="$HOME/.worktrees/dotfiles/feat/nvim-sdlc-T901049"
grep -n "name = " "$HOME_WT/dotfiles/nvim/lua/chapters/sdlc.lua"
test -x ~/scripts/sdlc-tool.sh && echo "dispatcher ok"
grep -n -i "stage-plan\|release-hold\|update-status" "$HOME_WT/dotfiles/nvim/lua/chapters/sdlc.lua"; echo "mut-rc=$? (1 erwartet)"
```

Erwartung: ticket-show/search, claims-list, messages-read, plan-lint,
ci-gates, cfr-show; Dispatcher vorhanden; keine Mutation aus dem Editor.

## Task 2 — Plan-Review-Aktion ergaenzen

Die Checkliste verlangt Plan-Review rendern — keine Aktion ruft
`scripts/plan-review/plan-review.sh render` auf. Neue Aktion
`plan-review-render` mit Plan-Eingabe (lesend, oeffnet das gerenderte
Review), naechsten freien Taste zuordnen, Runbook-Schritt in
Aktionsreihenfolge ergaenzen. Danach:

```bash
HOME_WT="$HOME/.worktrees/dotfiles/feat/nvim-sdlc-T901049"
nvim --headless -u "$HOME_WT/dotfiles/nvim/init.lua" \
  -c "lua print(table.concat(require('chapters.sdlc').actions(), ','))" -c "qa!" 2>&1 | tail -1
```

Erwartung: die neue Aktion erscheint in der Liste.

## Task 3 — Home-Commit, Push, PR

Nur die Partial-Dateien stagen, commiten, pushen, PR stellen:

```bash
HOME_WT="$HOME/.worktrees/dotfiles/feat/nvim-sdlc-T901049"
git -C "$HOME_WT" add dotfiles/nvim/lua/chapters/sdlc.lua dotfiles/nvim/runbooks/sdlc.md
git -C "$HOME_WT" commit -m "feat(T901049): plan-review-aktion ergaenzt"
git -C "$HOME_WT" push -u origin feat/nvim-sdlc-T901049
(cd "$HOME_WT" && gh pr create --title "feat(T901049): plan-review-aktion ergaenzt" --body "Batch-1b p6. Haengt am p1-Home-Merge.")
```

Nach gruenen Checks squash-mergen, Home-Worktree und Home-Branch
raeumen (`git -C "$HOME" worktree prune`).
