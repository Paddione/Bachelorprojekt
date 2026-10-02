---
page: files-search
ticket: T900657
status: complete
actions:
  - find-file
  - live-grep
  - buffers
  - recent-files
  - related-open
---

## Voraussetzungen

- Neovim v0.12.5 mit der Dashboard-Foundation (T900655) und der Files & Search Seite (T900657 p1, commit 2cc198ed6).
- **Telescope** ist in `plugins/core.lua` enthalten (T900655) — kein neues Plugin noetig. Pruefen: `:Telescope` oeffnet den Picker bzw. `:checkhealth telescope` meldet keine Fehler.
- **ripgrep** (`rg`) ist Voraussetzung fuer die live-grep Aktion: `rg --version` liefert eine Version. Ohne `rg` zeigt live-grep keine Ergebnisse (siehe Troubleshooting).
- Der aktuelle Buffer muss innerhalb eines Git-Repository liegen: Alle Aktionen loesen ihr Arbeitsverzeichnis zur Ausfuehrungszeit ueber `config.gitroot.root()` auf (nil-Guard: ohne Repository erscheint eine Warnung, keine Aktion startet).
- Kein Netzwerk zur Laufzeit noetig; keine Binaries werden von der Konfiguration installiert.

## Geordnete Schritte

1. **find-file**: Oeffnen Sie die Seite (Dashboard: `<leader>h`, Kapitel "Files & Search"). Der Fokus auf der Zeile hat keine Nebenwirkung (focus-versus-execute: erst die Enter-Taste bzw. die gezeigte Taste fuehrt die Aktion aus). Druecken Sie `f`. Der Telescope-Picker `find_files` oeffnet im Git-Root des aktuellen Buffers (versteckte Dateien eingeschlossen, `hidden = true`). Mit Enter oeffnet sich die gewaehlte Datei im aktuellen Buffer.

2. **live-grep**: Druecken Sie `g` (erst fokussieren, dann Taste druecken). Telescope `live_grep` durchsucht den Git-Root live mit ripgrep. Mit Enter springen Sie in die Trefferzeile. Fuer mehrere Treffer als Liste: `<C-q>` uebergibt die markierten Treffer an die Quickfix-Liste (`M.send_to_quickfix` schreibt sie via `setqflist` + `copen`). Die Quickfix-Liste mit `:cclose` wieder schliessen.

3. **buffers**: Druecken Sie `b`. Telescope `buffers` listet die offenen Buffer auf (auf den Git-Root des aktuellen Buffers beschraenkt). Mit Enter wechseln Sie zu dem gewaehlten Buffer.

4. **recent-files**: Druecken Sie `r`. Telescope `oldfiles` zeigt die zuletzt bearbeiteten Dateien — gefiltert auf den aktuellen Git-Root (`only_cwd = true`). Mit Enter oeffnen Sie die Datei.

5. **related-open**: Druecken Sie `o`. Die Aktion sucht verwandte Dateien zum aktuellen Buffer anhand der festen Regeln im Modul `config/files-search.lua` (Erklaerungstabelle siehe unten) und oeffnet den ersten existierenden Kandidaten via `:edit` (Pfad mit `fnameescape` maskiert). Gibt es keinen Kandidaten, erscheint eine Warnung. Die Regeln (existence-checked, erste Treffer gewinnt):
   - A: `dotfiles/nvim/lua/config/<name>.lua` <-> `dotfiles/nvim/runbooks/<name>.md`
   - B: `tests/spec/neovim-<name>.bats` <-> `dotfiles/nvim/lua/config/<name>.lua` (beide Richtungen)
   - C/D: `components/website/src/**/<Name>.astro|svelte` <-> `docs/agent-guide/<kebab-case>.md` (PascalCase <-> kebab-case)

Fokus-versus-Ausfuehrung: Das Navigieren auf der Seite (Cursor bewegen) fuehrt **keine** Aktion aus ("focus-no-side-effect", per headless Probe verifiziert); erst Enter bzw. der Buchstabe der jeweiligen Zeile startet die Aktion.

## Erwartetes Ergebnis

- Die Seite "Files & Search" zeigt genau fuenf Aktionen in dieser Reihenfolge: `find-file`, `live-grep`, `buffers`, `recent-files`, `related-open`.
- Jede Aktion oeffnet den zugehoerigen Telescope-Picker im Git-Root des aktuellen Buffers (Ausfuehrungszeit-Aufloesung; verschachtelte Pfade, Linked Worktrees und Verzeichnisse mit Leerzeichen loesen korrekt auf den Toplevel auf).
- `find-file`/`live-grep`/`buffers`/`recent-files` oeffnen Dateien bzw. wechseln den Buffer; live-grep unterstuetzt den `<C-q>`-Handoff in die Quickfix-Liste.
- `related-open` oeffnet die verwandte Datei oder meldet eine Warnung, wenn nichts passt.
- Headless-Start des Moduls (`require('config.files-search')`) endet mit Exit-Code 0 und definiert genau die fuenf Aktionen plus `send_to_quickfix`.
- Es werden keine `BufWritePre`-Autocommands angelegt — keine Formatierung beim Speichern.

## Troubleshooting

- **Aktionstartet nicht / Warnung "no git root"**: Der Buffer liegt ausserhalb eines Git-Repositories. `git rev-parse --show-toplevel` im Buffer pruefen; in ein Repository wechseln.
- **live-grep zeigt keine Ergebnisse / Fehler**: ripgrep fehlt. `rg --version` pruefen; `rg` installieren (Linux/WSL: Systempaket oder `cargo install ripgrep`; Windows native: Binary von GitHub Releases in den PATH) oder auf `find-file` ausweichen.
- **`:Telescope` meldet Unbekannt**: Das Plugin wurde nicht geladen. `:Lazy` oeffnen und sicherstellen, dass `telescope` installiert ist (Teil von `plugins/core.lua`); `:Lazy install` bei Bedarf.
- **related-open oeffnet die falsche Datei**: Die Regeln sind existence-checked und nehmen den ersten Treffer — pruefen Sie, ob mehrere Kandidaten existieren und welche Regel zuerst zuschlaegt (Reihenfolge A, B, C, D im Modul).
- **Quickfix-Liste bleibt offen**: `:cclose` schliesst sie; die Liste ist fluechtig und wird nicht gespeichert.
- **Pickers funktionieren headless nicht** (Test-Kontext): In `nvim -l`-Proben wird ein Fake-Telescope verwendet; im echten Editor ist Telescope via lazy verfuegbar.

## Recovery

- Die Aktionen schreiben keine Dateien und setzen keine dauerhaften Zustände: Es gibt nichts Persistentes zurueckzurollen ausser der (fluechtigen) Quickfix-Liste (`:cclose`).
- Seite entfernen = p1-Modul entfernen: `dotfiles/nvim/lua/config/files-search.lua` loeschen und den `files-search`-Eintrag in `dotfiles/nvim/lua/config/dashboard.lua` entfernen (der Auto-Stub uebernimmt wieder).
- Konfiguration komplett zuruecksetzen: `mv ~/.config/nvim ~/.config/nvim.tmp && mv ~/.config/nvim.old-20260927 ~/.config/nvim` (falls ein alter Stand existiert) und Neovim neu starten.

## Quellen

- Stand 2026-09-27. Keine neuen Upstream-Referenzen in T900657: Telescope ist bereits in `plugins/core.lua` (T900655) gepinnt. Die related-file Regeln wurden live aus der Repo-Layout-Struktur abgeleitet (components/website/src, tests/spec, docs/agent-guide, dotfiles/nvim/lua/config, dotfiles/nvim/runbooks) und per headless Probe am Stand des p1-Commits 2cc198ed6 verifiziert.
