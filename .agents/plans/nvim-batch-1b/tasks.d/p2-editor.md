---
title: p2 Editor-Faehigkeiten vervollstaendigen
ticket_id: T901045
role: impl
---

# p2 — Editor (T901045)

Ziel: Go- und SQL-Server entscheiden und eintragen, Treesitter-Pin gegen
nvim v0.12.5 verifizieren, Rest der Checkliste belegen. Haengt an p1
(Fundament), liefert den Picker-Entscheid fuer p3. Home-Branch:
feat/nvim-editor-T901045.

## File Structure

Alle Ziele liegen im Home-Repo (Paddione/dotfiles); Arbeitsverzeichnis
ist der Home-Worktree aus Task 0.

- `~/dotfiles/nvim/lua/chapters/editor.lua` (Ist 220, S1 n/a)
- `~/dotfiles/nvim/lua/plugins/editor.lua` (Ist 46, S1 n/a)
- `~/dotfiles/nvim/lua/plugins/core.lua` (Ist 22, S1 n/a)
- `~/dotfiles/nvim/runbooks/editor.md` (S1 n/a)
- `~/dotfiles/nvim/setup-tools.sh` (Ist 12, Home-Repo)
- `~/dotfiles/nvim/lazy-lock.json` (S1 n/a, generiert)

## Task 0 — Home-Worktree und Home-Branch

```bash
HOME_WT="$HOME/.worktrees/dotfiles/feat/nvim-editor-T901045"
python3 ~/scripts/agent-workspace.py create --repo /home/patrick feat/nvim-editor-T901045
git -C "$HOME_WT" log --oneline -1
```

Basis ist home origin/master nach dem p1-Home-Merge (Fundament zuerst).
Alle Befehle mit HOME_WT laufen im Home-Worktree; Befehle ohne HOME_WT
laufen im Bachelor-Worktree dieses Plan-Branches.

## Task 1 — Bestehendes belegen

```bash
HOME_WT="$HOME/.worktrees/dotfiles/feat/nvim-editor-T901045"
grep -n "bin =" "$HOME_WT/dotfiles/nvim/lua/chapters/editor.lua"
grep -n "snacks.picker\|snacks.terminal\|blink.cmp" "$HOME_WT/dotfiles/nvim/lua/chapters/editor.lua" | head -5
grep -n "I5-Bereinigung" -A6 "$HOME_WT/dotfiles/nvim/lua/plugins/core.lua" | head -8
command -v fd && echo "fd ok" || grep -n "Fallback" "$HOME_WT/dotfiles/nvim/runbooks/files-search.md"
```

Erwartung: 11 Server mit Mason-Weg, Picker/Terminal/Completion je einfach
mit Begruendung, fd-Probe mit dokumentiertem Fallback.

## Task 2 — Go- und SQL-Server eintragen

Die Checkliste nennt Go und SQL, `SERVERS` hat beide nicht. Je Sprache
genau einen Server waehlen (gopls; SQL: Ueberlegung zwischen sqlls und
sqls im Runbook festhalten), in `SERVERS` mit Binary und Mason-Hinweis
eintragen, `PARSERS` um `go` ergaenzen (sql ist drin), Installationsweg
als Runbook-Schritt in `runbooks/editor.md` dokumentieren. Kein stilles
Auto-Install: `checkhealth` meldet fehlende Server als Hinweis.

Anschliessend headless verifizieren:

```bash
HOME_WT="$HOME/.worktrees/dotfiles/feat/nvim-editor-T901045"
nvim --headless -u "$HOME_WT/dotfiles/nvim/init.lua" \
  -c "lua require('chapters.editor').checkhealth()" -c "qa!" 2>&1 | grep -E "gopls|sql|error"
```

Erwartung: beide Server erscheinen ohne das Wort error.

## Task 3 — Treesitter-Pin gegen nvim 0.12 verifizieren

Pin ist v0.9.3 (Ziel nvim v0.12.5). Upstream-Kompatibilitaet live pruefen:

```bash
HOME_WT="$HOME/.worktrees/dotfiles/feat/nvim-editor-T901045"
nvim --headless -u "$HOME_WT/dotfiles/nvim/init.lua" \
  -c "lua require('chapters.editor').setup_treesitter()" -c "qa!" 2>&1 | tail -3
nvim --version | head -1
```

Bleibt der Pin fehlerfrei, im Plugin-Kommentar als verifiziert fuer
v0.12.5 datieren. Schlaegt er fehl, auf den passenden Zweig umstellen,
`lazy-lock.json` aktualisieren, denselben Befehl wiederholen.

## Task 4 — Home-Commit, Push, PR

Nur die Partial-Dateien stagen, commiten, pushen, PR stellen:

```bash
HOME_WT="$HOME/.worktrees/dotfiles/feat/nvim-editor-T901045"
git -C "$HOME_WT" add dotfiles/nvim/lua/chapters/editor.lua dotfiles/nvim/lua/plugins/editor.lua dotfiles/nvim/lua/plugins/core.lua dotfiles/nvim/runbooks/editor.md dotfiles/nvim/setup-tools.sh dotfiles/nvim/lazy-lock.json
git -C "$HOME_WT" commit -m "feat(T901045): go- und sql-server plus treesitter-nachweis"
git -C "$HOME_WT" push -u origin feat/nvim-editor-T901045
(cd "$HOME_WT" && gh pr create --title "feat(T901045): go- und sql-server plus treesitter-nachweis" --body "Batch-1b p2. Haengt am p1-Home-Merge; liefert den Picker-Entscheid fuer p3.")
```

Nach gruenen Checks squash-mergen, Home-Worktree und Home-Branch
raeumen (`git -C "$HOME" worktree prune`).
