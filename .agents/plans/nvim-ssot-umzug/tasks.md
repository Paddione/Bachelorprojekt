---
title: nvim-ssot-umzug Implementation Plan
ticket_id: T901212
domains: [neovim, dotfiles, home-repo, dev-tooling]
status: staged
---

# nvim-ssot-umzug — Implementation Plan

Single-Plan fuer T901212: `.config/nvim` aus dem Home-Repo austragen
(SSOT bleibt `Bachelorprojekt/dotfiles/nvim`). Der Eingriff laeuft im
Home-Worktree auf Branch `docs/nvim-ssot-T901212`; der Home-Hauptcheckout
(master, dirty) wird nicht umgeschaltet und nicht committed. Voraussetzung
(dotfiles/nvim auf main, PR #6348) ist erfuellt.

## File Structure

- `tests/spec/home-nvim-ssot.bats` (neu, rot-gruen-Test)
- Home-Repo: `~/.gitignore` (Whitelist Zeilen 24–26 entfernen)
- Home-Repo-Index: `.config/nvim/**` (50 Dateien, nur ent-tragen)

## Task 1 — Rot: Test schreiben und scheitern sehen

Neuen Test `tests/spec/home-nvim-ssot.bats` anlegen (Stil der
`tests/spec/*.bats`-Dateien, Home-Pfad flexibel ueber `HOME`):

```bash
@test "home repo tracks no .config/nvim files" {
  [ -z "$(git -C "$HOME" ls-files .config/nvim)" ]
}
@test "live config still present" {
  [ -f "$HOME/.config/nvim/init.lua" ]
}
@test "gitignore carries no nvim whitelist" {
  ! grep -q "config/nvim" "$HOME/.gitignore"
}
```

Rotlauf:

```bash
bats tests/spec/home-nvim-ssot.bats
```

expected: FAIL — alle drei Faelle scheitern, solange das Home-Repo die
50 Dateien trackt und die Whitelist steht.

## Task 2 — Home-Worktree und Branch anlegen

```bash
git -C "$HOME" worktree list
python3 ~/scripts/agent-workspace.py create --repo /home/patrick docs/nvim-ssot-T901212
```

Danach im neuen Worktree (`~/.worktrees/dotfiles/docs/nvim-ssot-T901212`
oder ausgegebener Pfad) weiterarbeiten. Alle Git-Aufrufe mit
`git -C <home-worktree>`, nie im Home-Hauptcheckout.

## Task 3 — Austragen, Whitelist entfernen, verifizieren

Im Home-Worktree:

```bash
git rm --cached -r .config/nvim
sed -i '/^\!\\.config\/nvim\/$/d; /^\!\\.config\/nvim\/\*\*$/d' .gitignore
grep -n "nvim" .gitignore || echo "keine nvim-Whitelist mehr"
git status --porcelain | head -10
ls .config/nvim/init.lua
```

Erwartung: Index-Eintraege weg, Whitelist-Zeilen weg, Live-Dateien im
Worktree weiter vorhanden (nur `--cached`, kein Loeschen).

## Task 4 — Commit, Push, PR, Merge

Commit-Scope als Ticket-Scope (`docs(T901212): …` — `docs` ist
zulaessig, Ticket-Scope ebenso):

```bash
git commit -m "docs(T901212): .config/nvim aus Home-Repo austragen"
git push -u origin docs/nvim-ssot-T901212
gh pr create --title "docs(T901212): .config/nvim austragen, SSOT dotfiles/nvim" --body "SSOT bleibt Bachelorprojekt/dotfiles/nvim (PR #6348 auf main). Nur Index-Eingriff, keine Live-Aenderung."
```

Nach gruenen Checks squash-mergen, Worktree und Branch aufraeumen,
`git -C "$HOME" worktree prune`.

## Task 5 — Gruen: Test und Ticket schliessen

```bash
bats tests/spec/home-nvim-ssot.bats
```

Erwartung: alle Faelle gruen. Danach `task test:inventory` (neue
Testdatei) und Ticket T901212 auf done (fixed) setzen.

## Task 6 — Verify (finaler Task)

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Dazu: `components/website/src/data/test-inventory.json` mitcommitten,
keine Baseline-Eintraege, Home-Hauptcheckout unveraendert lassen.
