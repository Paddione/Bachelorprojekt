---
title: p4 JS-Frontend auf Oracle-first umstellen
ticket_id: T901047
role: impl
---

# p4 — JavaScript / Frontend (T901047)

Ziel: Komponentenerkennung und Managerwahl belegen, Task-Befehle zuerst
ueber `vda.sh oracle` aufloesen (mit dokumentiertem Fallback), kein
format-on-save belegen. Haengt an p1. Home-Branch:
feat/nvim-js-frontend-T901047.

## File Structure

Alle Ziele liegen im Home-Repo (Paddione/dotfiles); Arbeitsverzeichnis
ist der Home-Worktree aus Task 0.

- `~/dotfiles/nvim/lua/chapters/js-frontend.lua` (Ist 196, S1 n/a)
- `~/dotfiles/nvim/runbooks/js-frontend.md` (S1 n/a)

## Task 0 — Home-Worktree und Home-Branch

```bash
HOME_WT="$HOME/.worktrees/dotfiles/feat/nvim-js-frontend-T901047"
python3 ~/scripts/agent-workspace.py create --repo /home/patrick feat/nvim-js-frontend-T901047
git -C "$HOME_WT" log --oneline -1
```

Basis ist home origin/master nach dem p1-Home-Merge. Alle Befehle mit
HOME_WT laufen im Home-Worktree; Befehle ohne HOME_WT laufen im
Bachelor-Worktree dieses Plan-Branches.

## Task 1 — Erkennung und Managerwahl belegen

```bash
ls -d components/VideoVault components/studio-server components/mentolder-web \
  components/mediaviewer-widget packages/*/ 2>&1
HOME_WT="$HOME/.worktrees/dotfiles/feat/nvim-js-frontend-T901047"
grep -n "BufWritePre\|format-on-save\|format on save" "$HOME_WT/dotfiles/nvim/lua/chapters/js-frontend.lua" \
  "$HOME_WT/dotfiles/nvim/lua/core/options.lua"; echo "format-check-rc=$?"
```

Erwartung: alle Checklisten-Komponenten existieren und werden vom
package.json-Scan gefunden; nirgends format-on-save. Der ls-Block laeuft
im Bachelor-Worktree, der grep-Block im Home-Worktree.

## Task 2 — Oracle-first mit Fallback

`M.command` kodiert Befehle heute fest. Umstellen: erst
`bash scripts/vda.sh oracle` befragen (Task-Oracle, Zieltext je
Komponente und Art dev/test/lint/build), bei totem Daemon auf die
bestehende Konstruktion (pnpm website, sonst npm, Playwright fuer
tests/e2e) zurueckfallen und den Fallback im Runbook dokumentieren.
Der Oracle-Aufruf laeuft zur Laufzeit im Nvim-Job, nicht beim Bauen der
Seite (Seitenbau bleibt seitenffektfrei).

Verifikation (beide Wege, erster Befehl im Bachelor-Worktree):

```bash
bash scripts/vda.sh oracle "teste Komponente website" 2>&1 | head -3
HOME_WT="$HOME/.worktrees/dotfiles/feat/nvim-js-frontend-T901047"
nvim --headless -u "$HOME_WT/dotfiles/nvim/init.lua" \
  -c "lua print(#require('chapters.js-frontend').components() .. ' Komponenten')" -c "qa!" 2>&1 | tail -1
```

## Task 3 — Home-Commit, Push, PR

Runbook-Schritte dev/test/lint/build in Aktionsreihenfolge pruefen.
Danach nur die Partial-Dateien stagen, commiten, pushen, PR stellen:

```bash
HOME_WT="$HOME/.worktrees/dotfiles/feat/nvim-js-frontend-T901047"
git -C "$HOME_WT" add dotfiles/nvim/lua/chapters/js-frontend.lua dotfiles/nvim/runbooks/js-frontend.md
git -C "$HOME_WT" commit -m "feat(T901047): oracle-first mit fallback"
git -C "$HOME_WT" push -u origin feat/nvim-js-frontend-T901047
(cd "$HOME_WT" && gh pr create --title "feat(T901047): oracle-first mit fallback" --body "Batch-1b p4. Haengt am p1-Home-Merge.")
```

Nach gruenen Checks squash-mergen, Home-Worktree und Home-Branch
raeumen (`git -C "$HOME" worktree prune`).
