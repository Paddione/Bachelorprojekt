---
title: p3 Files und Search verifizieren
ticket_id: T901046
role: impl
---

# p3 — Files & Search (T901046)

Ziel: die fuenf Aktionen und den p2-Picker belegen. Haengt an p1
(Fundament) und p2 (Picker-Entscheid). Keine bekannten Luecken — reines
Verify-Partial mit Dokupflege bei Fund. Home-Branch:
feat/nvim-files-search-T901046.

## File Structure

Alle Ziele liegen im Home-Repo (Paddione/dotfiles); Arbeitsverzeichnis
ist der Home-Worktree aus Task 0.

- `~/dotfiles/nvim/lua/chapters/files-search.lua` (Ist 125, S1 n/a)
- `~/dotfiles/nvim/runbooks/files-search.md` (S1 n/a)

## Task 0 — Home-Worktree und Home-Branch

```bash
HOME_WT="$HOME/.worktrees/dotfiles/feat/nvim-files-search-T901046"
python3 ~/scripts/agent-workspace.py create --repo /home/patrick feat/nvim-files-search-T901046
git -C "$HOME_WT" log --oneline -1
```

Basis ist home origin/master nach den p1- und p2-Home-Merges (Picker aus
p2 uebernehmen). Alle Befehle mit HOME_WT laufen im Home-Worktree.

## Task 1 — Aktionen und Picker belegen

```bash
HOME_WT="$HOME/.worktrees/dotfiles/feat/nvim-files-search-T901046"
grep -n "name = " "$HOME_WT/dotfiles/nvim/lua/chapters/files-search.lua"
grep -n "snacks.picker" "$HOME_WT/dotfiles/nvim/lua/chapters/files-search.lua" | head -3
grep -n "executable('fd')\|rg-files\|rg fallback" "$HOME_WT/dotfiles/nvim/lua/chapters/files-search.lua" "$HOME_WT/dotfiles/nvim/runbooks/files-search.md"
```

Erwartung: find-file, live-grep, buffers, recent-files, related-open;
alle ueber snacks.picker; fd-Probe mit dokumentiertem rg-Fallback.
`related-open` (repo-weite Suche ab Git-Root) deckt die Checklisten-Zeile
Worktree-weite Suche ab — im Runbook als solche benennen, falls der Name
fehlt.

## Task 2 — Runbook-Namen angleichen

Aktionsnamen und Runbook-Schritte muessen gleiche Namen und Reihenfolge
tragen (Epic-Vertrag). Abweichung im Runbook korrigieren, Code bleibt
unberuehrt. Danach:

```bash
HOME_WT="$HOME/.worktrees/dotfiles/feat/nvim-files-search-T901046"
grep -n "find-file\|live-grep\|buffers\|recent" "$HOME_WT/dotfiles/nvim/runbooks/files-search.md" | head -6
```

## Task 3 — Home-Commit, Push, PR

Nur die Partial-Dateien stagen, commiten, pushen, PR stellen:

```bash
HOME_WT="$HOME/.worktrees/dotfiles/feat/nvim-files-search-T901046"
git -C "$HOME_WT" add dotfiles/nvim/lua/chapters/files-search.lua dotfiles/nvim/runbooks/files-search.md
git -C "$HOME_WT" commit -m "feat(T901046): files-search verifiziert und runbook angeglichen"
git -C "$HOME_WT" push -u origin feat/nvim-files-search-T901046
(cd "$HOME_WT" && gh pr create --title "feat(T901046): files-search verifiziert und runbook angeglichen" --body "Batch-1b p3. Haengt an den p1/p2-Home-Merges.")
```

Nach gruenen Checks squash-mergen, Home-Worktree und Home-Branch
raeumen (`git -C "$HOME" worktree prune`).
