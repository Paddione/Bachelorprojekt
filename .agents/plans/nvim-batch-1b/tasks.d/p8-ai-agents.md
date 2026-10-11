---
title: p8 AI-Agents Auswahlkontext umsetzen
ticket_id: T901051
role: impl
---

# p8 — AI & Agents (T901051)

Ziel: Laufzeit-Probe und Dateikontext belegen, Auswahlkontext echt
umsetzen, opencode-Begruendung belegen. Haengt an p1. Home-Branch:
feat/nvim-ai-agents-T901051.

## File Structure

Alle Ziele liegen im Home-Repo (Paddione/dotfiles); Arbeitsverzeichnis
ist der Home-Worktree aus Task 0.

- `~/dotfiles/nvim/lua/chapters/ai-agents.lua` (Ist 104, S1 n/a)
- `~/dotfiles/nvim/runbooks/ai-agents.md` (S1 n/a)

## Task 0 — Home-Worktree und Home-Branch

```bash
HOME_WT="$HOME/.worktrees/dotfiles/feat/nvim-ai-agents-T901051"
python3 ~/scripts/agent-workspace.py create --repo /home/patrick feat/nvim-ai-agents-T901051
git -C "$HOME_WT" log --oneline -1
```

Basis ist home origin/master nach dem p1-Home-Merge. Alle Befehle mit
HOME_WT laufen im Home-Worktree.

## Task 1 — Probe und Dateikontext belegen

```bash
HOME_WT="$HOME/.worktrees/dotfiles/feat/nvim-ai-agents-T901051"
for c in opencode muse claude codex qwen pi agy; do command -v $c >/dev/null && echo "$c ok"; done
grep -n "opencode.nvim" "$HOME_WT/dotfiles/nvim/runbooks/ai-agents.md" | head -3
```

Erwartung: vorhandene CLIs erscheinen, fehlende nicht; das Runbook
begruendet opencode.nvim (snacks-kompatibel, kein zweites Plugin).

## Task 2 — Auswahlkontext umsetzen

`selection-context` meldet heute nur einen Hinweis. Umsetzen: visuelle
Auswahl in eine temporaere Datei ausserhalb des Repos schreiben, Agent
mit dieser Datei als Kontext im Git-Root starten, Pfad im Runbook
dokumentieren. Keine Zwischenablage-Tricks, keine Seiteneffekte beim
Bauen der Seite. Danach:

```bash
HOME_WT="$HOME/.worktrees/dotfiles/feat/nvim-ai-agents-T901051"
nvim --headless -u "$HOME_WT/dotfiles/nvim/init.lua" \
  -c "lua print(table.concat(require('chapters.ai-agents').agents(), ','))" -c "qa!" 2>&1 | tail -1
```

## Task 3 — Home-Commit, Push, PR

Nur die Partial-Dateien stagen, commiten, pushen, PR stellen:

```bash
HOME_WT="$HOME/.worktrees/dotfiles/feat/nvim-ai-agents-T901051"
git -C "$HOME_WT" add dotfiles/nvim/lua/chapters/ai-agents.lua dotfiles/nvim/runbooks/ai-agents.md
git -C "$HOME_WT" commit -m "feat(T901051): auswahlkontext umgesetzt"
git -C "$HOME_WT" push -u origin feat/nvim-ai-agents-T901051
(cd "$HOME_WT" && gh pr create --title "feat(T901051): auswahlkontext umgesetzt" --body "Batch-1b p8. Haengt am p1-Home-Merge.")
```

Nach gruenen Checks squash-mergen, Home-Worktree und Home-Branch
raeumen (`git -C "$HOME" worktree prune`).
