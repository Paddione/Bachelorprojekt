## Task 3: Runbook-Kapitel und Master-Index

Zweck. Dieses Partial schreibt das Runbook-Kapitel „Settings und Help" (Ticket T900667) und schaltet die Kapitelzeile im Master-Index auf complete. Es besitzt genau zwei Dateien und haengt von p2 ab (Aktionsnamen und Reihenfolge muessen final sein).

Live verifizierte Fakten (2026-09-28, alle gehoeren als belegte Aussagen ins Runbook):

- Vorlage ist `dotfiles/nvim/runbooks/_template.md` (Frontmatter `page`/`ticket`/`status`/`actions` plus die fuenf Abschnitte Voraussetzungen, Geordnete Schritte, Erwartetes Ergebnis, Troubleshooting, Recovery); Referenz fuer Ton und Detailtiefe ist `dotfiles/nvim/runbooks/files-search.md`.
- Master-Index ist `dotfiles/nvim/runbooks/README.md` (Ist 43 Zeilen, nicht-baselined, kein S1-Limit fuer .md); Kapitelzeile ist Nummer 10 (`Settings & Help`, T900667, derzeit `status: stub`).
- Install- und Sync-Quelle ist `dotfiles/install.sh`, nvim-Schritt Zeilen 136-162; Sync-Pruefbefehl `diff -rq -x lazy-lock.json <repo>/dotfiles/nvim ~/.config/nvim`.
- Windows-Wrapper ist `%LOCALAPPDATA%\nvim\init.lua` (nur auf dem Windows-Host, nicht im Repo); Handprotokoll mit sechs Punkten steht in `dotfiles/nvim/README.md` („Manual Windows-wrapper test protocol"); ohne Windows-Host gilt das Protokoll als nicht ausgefuehrt, nie als bestanden.
- Befehlsbelege: `:Lazy` (lazy.nvim commands.lua:113), `:WhichKey [mode] [keys]` (which-key config.lua:306), `:checkhealth` eingebaut, Neovim v0.12.5, ripgrep wird hier nicht gebraucht.

Target files (eine NEW, eine CHANGED):

- `dotfiles/nvim/runbooks/settings-help.md` (settings-help.md, NEW): Kapitel-Runbook, etwa einhundertvierzig Zeilen.
- `dotfiles/nvim/runbooks/README.md` (README.md, CHANGED): genau eine Zeile flippen (Nummer 10 auf complete plus Dateilink); alle anderen Zeilen byte-identisch.

### Steps

1. Rebase zuerst auf den neuesten Stand, weil alle Kapitel-Branches den Master-Index anfassen:
   ```bash
   git fetch origin
   git rebase origin/main
   ```

2. Schreibe `dotfiles/nvim/runbooks/settings-help.md` (settings-help.md) nach der Vorlage. Frontmatter: `page: settings-help`, `ticket: T900667`, `status: complete`, `actions` mit genau den acht Dashboard-Namen in Dashboard-Reihenfolge (`open-config-source`, `sync-status`, `plugins`, `health`, `keybindings`, `reload-config`, `backup-config`, `recover-config`). Die fuenf Abschnitte:
   - Voraussetzungen: installierte Config (`bash dotfiles/install.sh`), Neovim v0.12.5, Git-Checkout als Arbeitsbasis, Hinweis dass `:Lazy`/`:WhichKey` erst nach Plugin-Start existieren.
   - Geordnete Schritte: acht nummerierte Schritte, jeder beginnt mit dem fetten Aktionsnamen in Dashboard-Reihenfolge; Fokus-versus-Ausfuehrung erklaeren (Zeile ansteuern wirkt nichts, erst Enter/Taste startet); `sync-status` erklaert die gemeinsame Config-Quelle, den diff-Pruefbefehl und die Windows/WSL-Synchronisation inklusive Wrapper-Pfad und Handprotokoll-Verweis; `backup-config`/`recover-config` beschreiben die Backup- und Recovery-Prozedur (Zeitstempel-Format `%Y%m%d-%H%M%S`, manuelle Bestaetigung bei Recovery).
   - Erwartetes Ergebnis: acht Zeilen in Reihenfolge, beobachtbare Wirkung je Aktion.
   - Troubleshooting: je ein Eintrag fuer fehlenden Git-Root, fehlendes `:Lazy`/`:WhichKey`, fehlende Live-Config, leere Backup-Liste, Reload-Fehler.
   - Recovery: Entfernen des Kapitels (Moduldatei plus Dashboard-Block loeschen, Auto-Stub uebernimmt), Voll-Rollback per Backup-Verzeichnis.
   Jeder Sachbehauptung liegt ein oben genannter Live-Beleg zugrunde; kein OpenSpec-Bezug.

3. Flippe im Master-Index genau die zehnte Kapitelzeile auf `status: complete` mit Link auf `settings-help.md`:
   ```bash
   git diff dotfiles/nvim/runbooks/README.md
   ```
   Der Diff muss genau eine geaenderte Zeile zeigen, keine weitere Datei beruehren.

4. Pruefe Form und Abdeckung per Grep:
   ```bash
   for s in Voraussetzungen "Geordnete Schritte" "Erwartetes Ergebnis" Troubleshooting Recovery; do grep -q "^## $s" dotfiles/nvim/runbooks/settings-help.md || { echo "missing section: $s"; exit 1; }; done
   grep -q "^status: complete" dotfiles/nvim/runbooks/settings-help.md
   awk '/^actions:/{f=1; next} f && /^  - /{sub(/^  - /,""); print; next} f && !/^  - /{exit}' dotfiles/nvim/runbooks/settings-help.md > /tmp/sh-actions.txt
   printf 'open-config-source\nsync-status\nplugins\nhealth\nkeybindings\nreload-config\nbackup-config\nrecover-config\n' | diff - /tmp/sh-actions.txt
   grep -rnE "OpenSpec|openspec" dotfiles/nvim/runbooks/settings-help.md && exit 1 || echo "runbook clean"
   ```
   Alle Befehle muessen gruen ausgehen, der `diff` leer.

5. Committe genau die zwei Dateien mit expliziten Pathspecs:
   ```bash
   git add -f dotfiles/nvim/runbooks/settings-help.md dotfiles/nvim/runbooks/README.md
   git commit -m "feat(T900667): settings-help runbook and index flip [T900667]"
   git show --stat --oneline HEAD
   ```
   Der Stat muss genau zwei Dateien nennen.

### Acceptance criteria

- `dotfiles/nvim/runbooks/settings-help.md` (settings-help.md) existiert mit korrektem Frontmatter, den fuenf Pflichtabschnitten und acht Schritten in Dashboard-Namen und -Reihenfolge.
- `dotfiles/nvim/runbooks/README.md` (README.md) markiert Kapitel 10 als complete mit Dateilink; alle anderen Zeilen sind unveraendert.
- Alle Grep-Pruefungen aus Schritt 4 sind gruen; kein OpenSpec-Bezug steht im Runbook.
- Der Commit traegt die Form `feat(T900667): <subject> [T900667]` und enthaelt genau diese zwei Dateien.
