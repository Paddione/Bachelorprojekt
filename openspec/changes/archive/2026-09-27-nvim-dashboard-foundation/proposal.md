# Proposal: nvim-dashboard-foundation

## Why

Die projektbewusste Neovim-Konfiguration (EPIC T900654) wird neu aufgebaut: `~/.config/nvim` ist leer, die alte Config liegt nur noch als Referenz unter `~/.config/nvim.old-20260927`, und kein Teil der alten Config ist je im Repo getrackt worden. Ohne ein gemeinsames Grundgerüst (Bootstrap, Git-Root-Funktion, Dashboard-Shell, Aktionsmodell, Runbook-Index) kann keines der zehn Kapitel-Tickets (T900657–T900664, T900666, T900667) und kein Editor-Ticket (T900656) implementiert werden — jede Seite braucht die Shell, jede Aktion die Git-Root-Funktion, jedes Kapitel die Runbook-Vorlage und den Master-Index. Dieses Ticket liefert das Fundament, auf dem alle anderen aufbauen, und verankert es als testbare Repo-SSOT (`dotfiles/nvim/`).

## What

- Neues Grundgerüst als Repo-SSOT: `init.lua`, lazy.nvim-Bootstrap, Modulstruktur unter `lua/` (`editor`, `gitroot`, `dashboard`, `plugins/core`), per `git add -f` getrackt; exakt die 13 Bestands-Plugins, keine neuen.
- Git-Root-Funktion: pufferbasiertes `git rev-parse --show-toplevel` mit Worktree-/Edge-Case-Abfang (unbenannte Buffer, Dateien außerhalb Git).
- Dashboard-Shell auf snacks.nvim: Home/Index mit fester Kapitelreihenfolge, Kategorieseiten, Unterseiten, Zurück-Navigation; Suche fokussiert Aktionen, Ausführen bleibt ein separater Schritt; sichtbares Aktionsmodell (Name, Eingaben, Ziel/Wirkung, Arbeitsverzeichnis, Fehlerverhalten).
- Runbook-System: Vorlage (Voraussetzungen, Schritte, Ergebnis, Troubleshooting, Recovery + Maschinen-Kopf), Master-Index mit Stub-Markierung, Home-Referenz-Runbook, BATS-Abdeckungsprüfung (Namen/Reihenfolge Index ↔ Dashboard).
- Install-Weg (`install.sh` + README), Rollback-Doku, Windows-Wrapper-Verhaltenstest, Scouting-Runbook-Aktualisierung.
- BATS-Headless-Tests mit Rotphase (`expected: FAIL`) + Test-Inventar-Regeneration.

Nicht enthalten: Kapitel-Inhalte/Runbooks (Kapitel-Tickets), Treesitter/LSP/Blink (T900656), nodectl-Verdrahtung (T900664), openclaw-Selbstheilungslogik (T900538 — hier nur andockfähige Struktur).

_Design-Spec: `design.md` (SSOT für Entscheidungen). Ticket: T900655_
