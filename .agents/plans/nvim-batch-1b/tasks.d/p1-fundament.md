---
title: p1 Fundament verifizieren und haerten
ticket_id: T901044
role: impl
---

# p1 — Fundament (T901044)

Ziel: jede Checklisten-Zeile von T901044 gegen den Home-Stand belegen,
die Beweissicherung aus dem Ticket-Verlauf wiederverwenden
(Live-Backup, Drift, Dashboard-Spec 25/25), die T901212-Postcondition
pruefen, die `lua/dashboard`-Abweichung schriftlich begruenden. Kein
Umbau ohne Beleg. Home-Branch: feat/nvim-fundament-T901044.

## File Structure

Alle Ziele liegen im Home-Repo (Paddione/dotfiles); Arbeitsverzeichnis
ist der Home-Worktree aus Task 0.

- `~/dotfiles/nvim/init.lua` (Ist 20, S1 n/a — kein .lua-Limit)
- `~/dotfiles/nvim/lua/core/dashboard.lua` (Ist 276, S1 n/a)
- `~/dotfiles/nvim/lua/core/actions.lua` (Ist 64, S1 n/a)
- `~/dotfiles/nvim/lua/core/gitroot.lua` (Ist 38, S1 n/a)
- `~/dotfiles/nvim/lua/core/lazy.lua` (Ist 67, S1 n/a)
- `~/dotfiles/nvim/lua/core/options.lua` (Ist 21, S1 n/a)
- `~/dotfiles/nvim/lua/core/keymaps.lua` (Ist 11, S1 n/a)
- `~/dotfiles/nvim/runbooks/index.md`, `~/dotfiles/nvim/runbooks/_template.md`,
  `~/dotfiles/nvim/runbooks/home.md` (S1 n/a)
- `~/dotfiles/nvim/windows/init.lua` (Ist 46, S1 n/a)
- `~/dotfiles/install.sh` (Ist 183, Home-Repo)
- `~/dotfiles/nvim/SETUP_CHECKLIST.md`, `~/dotfiles/nvim/README.md` (S1 n/a)

## Task 0 — Home-Worktree und Home-Branch

```bash
HOME_WT="$HOME/.worktrees/dotfiles/feat/nvim-fundament-T901044"
python3 ~/scripts/agent-workspace.py create --repo /home/patrick feat/nvim-fundament-T901044
git -C "$HOME_WT" log --oneline -1
```

Basis ist home origin/master (inkl. T901212-Austragung #60). Alle Befehle
mit HOME_WT laufen im Home-Worktree; Befehle ohne HOME_WT laufen im
Bachelor-Worktree dieses Plan-Branches.

## Task 1 — Live-Backup wiederverwenden und Drift messen

Das Live-Backup aus der Beweissicherung wiederverwenden; nur bei Verlust
neu anlegen und den Pfad per Ticket-Kommentar an T901044 haengen:

```bash
HOME_WT="$HOME/.worktrees/dotfiles/feat/nvim-fundament-T901044"
ls -d /tmp/nvim-live-backup-20261011-011823 || { STAMP=$(date +%Y%m%d-%H%M%S); cp -r ~/.config/nvim /tmp/nvim-live-backup-$STAMP; }
diff -rq -x lazy-lock.json "$HOME_WT/dotfiles/nvim" ~/.config/nvim \
  && echo "kein Drift" || echo "Drift siehe oben"
```

Erwartung: Backup vorhanden, hoechstens `runbooks/models-inference.md`
Drift (ausserhalb Batch-1). Den Drift-Befehl in
`~/dotfiles/nvim/SETUP_CHECKLIST.md` als Befehl dokumentieren, falls er
dort fehlt (Ticket-Zeile: Drift-Check als Befehl).

## Task 2 — Kernmodule gegen Checkliste verifizieren

Je Zeile einen Beleg per Befehl erheben, keine Sichtpruefung allein:

```bash
HOME_WT="$HOME/.worktrees/dotfiles/feat/nvim-fundament-T901044"
grep -c "require('core" "$HOME_WT/dotfiles/nvim/init.lua"
grep -n "register" "$HOME_WT/dotfiles/nvim/lua/core/dashboard.lua" | head -3
grep -n "Ausfuehren" "$HOME_WT/dotfiles/nvim/lua/core/actions.lua" | head -3
nvim --headless -u NONE -c "set rtp+=$HOME_WT/dotfiles/nvim" \
  -c "lua print(require('core.gitroot') and 'gitroot ok')" -c "qa!" 2>&1 | tail -1
```

Belegpflicht: init-Aufrufe (3 setup), Selbstregistrierung, Zwei-Schritt,
gitroot-Meldungen. Abweichung festhalten: kein eigenes `lua/dashboard/`-
Verzeichnis — die Shell lebt in `core/dashboard.lua` (276 Zeilen, kein
Monolith). Begruendung in `runbooks/index.md` als Hinweis ergaenzen, kein
Umbau.

## Task 3 — Runbook-Vertrag und Windows-Wrapper verifizieren

```bash
HOME_WT="$HOME/.worktrees/dotfiles/feat/nvim-fundament-T901044"
grep -c "T90104\|T90105" "$HOME_WT/dotfiles/nvim/runbooks/index.md"
test -f "$HOME_WT/dotfiles/nvim/runbooks/_template.md" && echo "Vorlage ok"
grep -n "core.dashboard" "$HOME_WT/dotfiles/nvim/windows/init.lua" | head -3
grep -n "## Rollback" -A3 "$HOME_WT/dotfiles/nvim/SETUP_CHECKLIST.md"
```

Erwartung: Index deckt alle Seiten ab, Vorlage existiert, Wrapper prueft
die neue Struktur, Rollback ist dokumentiert. Die Ticket-Zeile
tests/spec/neovim-dashboard.bats meint die heutigen Guards: die pytest-Spec
tests/py/spec/native_ported/spec/test_neovim_dashboard.py (p9) und
tests/spec/home-nvim-ssot.bats (T901212, unangetastet).

## Task 4 — SSOT-Nachweis

T901212 ist done (Home-PR Paddione/dotfiles#60, Commit ac26c7e). Die
Postcondition am Home-Worktree belegen:

```bash
HOME_WT="$HOME/.worktrees/dotfiles/feat/nvim-fundament-T901044"
git -C "$HOME_WT" ls-files .config/nvim | wc -l
grep -n "config/nvim" "$HOME_WT/.gitignore" || echo "keine nvim-Whitelist (erwartet)"
grep -n "live" "$HOME_WT/dotfiles/install.sh" | head -5
```

Erwartung: 0 getrackte Dateien, keine Whitelist, install.sh als Weg
Home-Repo nach live. SSOT-Lesart seit T901648: einzige Quelle ist
~/dotfiles/nvim im Home-Repo; Bachelorprojekt/dotfiles ist der Symlink
dorthin (kein Revert).

## Task 5 — Home-Commit, Push, PR

Nur die Partial-Dateien stagen, commiten, pushen, PR stellen:

```bash
HOME_WT="$HOME/.worktrees/dotfiles/feat/nvim-fundament-T901044"
git -C "$HOME_WT" add dotfiles/nvim/init.lua dotfiles/nvim/lua/core/dashboard.lua dotfiles/nvim/lua/core/actions.lua dotfiles/nvim/lua/core/gitroot.lua dotfiles/nvim/lua/core/lazy.lua dotfiles/nvim/lua/core/options.lua dotfiles/nvim/lua/core/keymaps.lua dotfiles/nvim/runbooks/index.md dotfiles/nvim/runbooks/_template.md dotfiles/nvim/runbooks/home.md dotfiles/nvim/windows/init.lua dotfiles/install.sh dotfiles/nvim/SETUP_CHECKLIST.md dotfiles/nvim/README.md
git -C "$HOME_WT" commit -m "feat(T901044): fundament verifiziert und Abweichung begruendet"
git -C "$HOME_WT" push -u origin feat/nvim-fundament-T901044
(cd "$HOME_WT" && gh pr create --title "feat(T901044): fundament verifiziert und Abweichung begruendet" --body "Batch-1b p1. Verify-first gegen home origin/master; Beweissicherung aus T901044 wiederverwendet.")
```

Nach gruenen Checks squash-mergen, Home-Worktree und Home-Branch
raeumen (`git -C "$HOME" worktree prune`).

Pruefbefehl: `bats tests/spec/home-nvim-ssot.bats` (Bachelor-Worktree)
bleibt unberuehrt; dieses Partial prueft mit den Befehlen aus Task 2
und 3.
