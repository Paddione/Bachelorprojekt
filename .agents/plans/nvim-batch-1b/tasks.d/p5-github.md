---
title: p5 GitHub verifizieren
ticket_id: T901048
role: impl
---

# p5 — GitHub (T901048)

Ziel: Merge-Freiheit und die fuenf Anzeige-Aktionen belegen, gh-axi/gh-Trennung belegen. Haengt an p1.
Keine bekannten Luecken. Home-Branch: feat/nvim-github-T901048.

## File Structure

Alle Ziele liegen im Home-Repo (Paddione/dotfiles); Arbeitsverzeichnis
ist der Home-Worktree aus Task 0.

- `~/dotfiles/nvim/lua/chapters/github.lua` (Ist 81, S1 n/a)
- `~/dotfiles/nvim/runbooks/github.md` (S1 n/a)

## Task 0 — Home-Worktree und Home-Branch

```bash
HOME_WT="$HOME/.worktrees/dotfiles/feat/nvim-github-T901048"
python3 ~/scripts/agent-workspace.py create --repo /home/patrick feat/nvim-github-T901048
git -C "$HOME_WT" log --oneline -1
```

Basis ist home origin/master nach dem p1-Home-Merge. Alle Befehle mit
HOME_WT laufen im Home-Worktree.

## Task 1 — Keine Merge-Aktion, fuenf Aktionen

```bash
HOME_WT="$HOME/.worktrees/dotfiles/feat/nvim-github-T901048"
grep -n -i "merge" "$HOME_WT/dotfiles/nvim/lua/chapters/github.lua"; echo "merge-rc=$? (1 erwartet)"
grep -n "name = " "$HOME_WT/dotfiles/nvim/lua/chapters/github.lua"
grep -n "gh-axi\|'gh'" "$HOME_WT/dotfiles/nvim/lua/chapters/github.lua"
```

Erwartung: kein Merge-Treffer (rc 1), genau pr-view, pr-comments,
pr-checks, failure-logs, release-view; Anzeige via gh-axi, --json/-q via
gh direkt (T004612-Trennung).

## Task 2 — Runbook-Vertrag

Namen und Reihenfolge im Runbook mit den Aktionen abgleichen, bei
Abweichung das Runbook korrigieren.

## Task 3 — Home-Commit, Push, PR

Nur die Partial-Dateien stagen, commiten, pushen, PR stellen:

```bash
HOME_WT="$HOME/.worktrees/dotfiles/feat/nvim-github-T901048"
git -C "$HOME_WT" add dotfiles/nvim/lua/chapters/github.lua dotfiles/nvim/runbooks/github.md
git -C "$HOME_WT" commit -m "feat(T901048): github verifiziert ohne merge-aktion"
git -C "$HOME_WT" push -u origin feat/nvim-github-T901048
(cd "$HOME_WT" && gh pr create --title "feat(T901048): github verifiziert ohne merge-aktion" --body "Batch-1b p5. Haengt am p1-Home-Merge.")
```

Nach gruenen Checks squash-mergen, Home-Worktree und Home-Branch
raeumen (`git -C "$HOME" worktree prune`).
