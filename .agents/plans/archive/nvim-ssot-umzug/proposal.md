# Proposal: nvim-ssot-umzug (T901212)

## Befund (verifiziert 2026-10-11)

- SSOT ist `Bachelorprojekt/dotfiles/nvim`, PR #6348 auf main gemergt —
  die Ticket-Voraussetzung ist erfuellt.
- Das Home-Repo (`/home/patrick`, master, hinter origin/master) trackt
  `.config/nvim` weiter: 50 Dateien in `git ls-files`, kein
  `check-ignore`-Treffer. Whitelist in `~/.gitignore` Zeilen 24–26
  (`!.config/nvim/`, `!.config/nvim/**`).
- Live-Config `~/.config/nvim` ist Arbeitsstand des Editors und bleibt
  unangetastet; `dotfiles/install.sh` Paragraph 5 bleibt der einzige Weg
  Repo nach live.
- Der Home-Checkout ist dirty (fremde WIP-Eintraege) und bleibt unberuehrt;
  der Eingriff laeuft in Worktree-Branch `docs/nvim-ssot-T901212`.

## Was der Plan tut

1. Rot: bats-Test `tests/spec/home-nvim-ssot.bats` belegt, dass
   `.config/nvim` noch getrackt ist (Fail vor dem Eingriff).
2. Im Home-Worktree: `git rm --cached` fuer `.config/nvim`, Whitelist aus
   `~/.gitignore` entfernen, Commit, Push, PR, Merge nach Gruen.
3. Gruen: derselbe Test belegt, dass nichts mehr getrackt ist und
   `~/.config/nvim/init.lua` live weiter existiert.
4. Ticket T901212 schliessen (done, fixed).

## Nicht-Ziele

Keine Aenderung an `dotfiles/nvim`, kein Live-Eingriff, kein
install.sh-Umbau. Ausfuehrung erst nach Operator-Freigabe (Hold).
