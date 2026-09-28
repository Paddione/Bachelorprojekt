---
page: settings-help
ticket: T900667
status: complete
actions:
  - open-config-source
  - sync-status
  - plugins
  - health
  - keybindings
  - reload-config
  - backup-config
  - recover-config
---

## Voraussetzungen

- Installierte Config: `bash dotfiles/install.sh` hat den nvim-Schritt
  (Zeilen 136-162, idempotent: no-op bei Gleichheit ohne
  lazy-lock.json, sonst Backup plus Replace) ausgefuehrt, sodass
  `~/.config/nvim` die Repo-Config enthaelt.
- Neovim v0.12.5 (`/usr/local/bin/nvim`); `stdpath('config')` ist
  `/home/patrick/.config/nvim`, `stdpath('data')` ist
  `/home/patrick/.local/share/nvim`.
- Git-Checkout als Arbeitsbasis: `open-config-source` und `sync-status`
  loesen ihr Arbeitsverzeichnis zur Ausfuehrungszeit ueber
  `config.gitroot.root()` auf (nil-Guard: ohne Repository erscheint eine
  Warnung, keine Aktion startet).
- `:Lazy` und `:WhichKey` existieren erst nach dem Plugin-Start
  (lazy.nvim und which-key.nvim laden per lazy/Event); vorher melden die
  Aktionen `plugins` und `keybindings` eine Warnung statt zu oeffnen.
- Kein Netzwerk zur Laufzeit noetig; ripgrep wird in diesem Kapitel
  nicht gebraucht.

## Geordnete Schritte

Fokus-versus-Ausfuehrung: Die Seite erreichen Sie ueber das Dashboard
(`<leader>h`, Kapitel "Settings & Help", Taste `0` auf Home). Eine Zeile
anzusteuern (Cursor bewegen) wirkt nichts — erst Enter bzw. die Taste
der jeweiligen Zeile startet die Aktion.

1. **open-config-source** (Taste `o`): Oeffnet die gemeinsame
   Config-Quelle `<git-root>/dotfiles/nvim/init.lua` per `:edit` zum
   Lesen. Fehlt die Datei unter dem Root, erscheint eine Warnung mit dem
   fehlenden Pfad und es wird nichts geoeffnet.

2. **sync-status** (Taste `s`): Vergleicht die gemeinsame Config-Quelle
   `<git-root>/dotfiles/nvim` gegen die Live-Config `~/.config/nvim`
   per `diff -rq -x lazy-lock.json <repo>/dotfiles/nvim
   ~/.config/nvim` und meldet Quelle, Live-Pfad und Zustand
   (`in-sync`, `differs`, `live-missing`). Die Aktion schreibt nichts;
   Install (`bash dotfiles/install.sh`) und der Windows-Wrapper-Abgleich
   bleiben manuell. Windows/WSL-Synchronisation: Der native Wrapper
   `%LOCALAPPDATA%\nvim\init.lua` liegt nur auf dem Windows-Host (nicht
   im Repo) und spiegelt die WSL-seitige Live-Config; pruefen Sie ihn per
   Handprotokoll in `dotfiles/nvim/README.md` ("Manual
   Windows-wrapper test protocol", sechs Punkte). Ohne Windows-Host gilt
   das Protokoll als nicht ausgefuehrt, nie als bestanden.

3. **plugins** (Taste `p`): Oeffnet die lazy.nvim-Verwaltung per `:Lazy`
   (in der installierten lazy.nvim-Quelle registriert,
   `lua/lazy/view/commands.lua`, Zeile 113). Ist lazy.nvim noch nicht
   geladen, erscheint die Warnung `lazy.nvim noch nicht geladen`.

4. **health** (Taste `c`): Oeffnet `:checkhealth` (eingebaut, immer
   vorhanden; Headless-Probe meldet `exists(':checkhealth')=2`).

5. **keybindings** (Taste `w`): Oeffnet die which-key-Uebersicht per
   `:WhichKey [mode] [keys]` (in der installierten which-key-Quelle
   registriert, `lua/which-key/config.lua`, Zeile 306; ruft intern
   `require("which-key").show({mode, keys})` auf). Ist which-key noch
   nicht geladen, erscheint eine Warnung.

6. **reload-config** (Taste `r`): Laedt `~/.config/nvim/init.lua` neu
   (`:source`, Pfad per `fnameescape` maskiert) und meldet Erfolg oder
   Fehler. Eine kaputte Config erscheint als Warnung, nicht als
   unbehandelter Fehler.

7. **backup-config** (Taste `b`): Kopiert die Live-Config per `cp -r`
   in ein neues Verzeichnis `~/.config/nvim-backup-<Zeitstempel>`
   (Format `%Y%m%d-%H%M%S`, z. B. `nvim-backup-20260928-041500`) und
   meldet das Ziel. Es wird nichts ausser dem neuen Verzeichnis angelegt.

8. **recover-config** (Taste `u`): Listet `nvim-backup-*` neben
   `~/.config/nvim` auf. Ohne Treffer warnt die Aktion und veraendert
   nichts. Sonst meldet sie das juengste Backup plus den manuellen
   Restore-Befehl und fuehrt den Tausch (Live-Config beiseite nach
   `nvim-before-recover-<Zeitstempel>`, Backup an ihren Platz) nur aus,
   wenn die Rueckfrage per `vim.fn.confirm()` bestaetigt wird.

## Erwartetes Ergebnis

- Die Seite "Settings & Help" zeigt genau acht Aktionen in dieser
  Reihenfolge: `open-config-source`, `sync-status`, `plugins`,
  `health`, `keybindings`, `reload-config`, `backup-config`,
  `recover-config`.
- `open-config-source` oeffnet `<git-root>/dotfiles/nvim/init.lua` im
  aktuellen Buffer bzw. warnt mit dem fehlenden Pfad.
- `sync-status` meldet Quelle, Live-Pfad und Zustand (`in-sync`,
  `differs` oder `live-missing`) plus den Hinweis auf manuellen Install
  und Windows-Wrapper-Abgleich; es wird nichts geschrieben.
- `plugins` oeffnet das `:Lazy`-Fenster bzw. warnt bei noch nicht
  geladenem lazy.nvim.
- `health` oeffnet `:checkhealth`.
- `keybindings` oeffnet die `:WhichKey`-Uebersicht bzw. warnt bei noch
  nicht geladenem which-key.
- `reload-config` laedt die Live-`init.lua` neu und meldet Erfolg;
  Fehler erscheinen als Warnung.
- `backup-config` legt genau ein neues `nvim-backup-*`-Verzeichnis an
  und nennt das Ziel.
- `recover-config` nennt das juengste Backup plus manuellen Befehl und
  tauscht nur nach Bestaetigung; ohne Backups warnt es und aendert nichts.

## Troubleshooting

- **Warnung "no project root"**: Der aktuelle Buffer liegt ausserhalb
  eines Git-Repository. `git rev-parse --show-toplevel` im Buffer
  pruefen; in einen Checkout wechseln, dann erneut versuchen.
- **`:Lazy` / `:WhichKey` meldet Unbekannt bzw. Warnung "noch nicht
  geladen"**: Die Plugins laden erst beim Start (lazy/Event `VeryLazy`).
  Einmal eine Datei oeffnen bzw. `:Lazy` manuell aufrufen, dann die
  Aktion wiederholen. Alle dreizehn Kept-Plugins liegen installiert
  unter `~/.local/share/nvim/lazy/`.
- **Live-Config fehlt** (`sync-status` meldet `live-missing`,
  `backup-config` warnt): `bash dotfiles/install.sh` ausfuehren, um
  `~/.config/nvim` aus der Repo-Quelle anzulegen.
- **Leere Backup-Liste** (`recover-config` warnt "no backups"): Es
  existiert kein `~/.config/nvim-backup-*`. Zuerst `backup-config`
  ausfuehren, um einen Wiederherstellungspunkt zu erzeugen.
- **Reload-Fehler** (`reload-config` meldet "reload failed"): Die
  `init.lua` enthaelt einen Lua-Fehler. Fehlermeldung in der Warnung
  lesen, Datei per `open-config-source` oeffnen, korrigieren, erneut
  laden. Notfalls per `recover-config` auf das juengste Backup zurueck.

## Recovery

- Kapitel entfernen: `dotfiles/nvim/lua/config/settings-help.lua`
  loeschen und den `['settings-help']`-Block in
  `dotfiles/nvim/lua/config/dashboard.lua` entfernen — die
  Auto-Stub-Schleife uebernimmt die Seite wieder (`settings-help` bleibt
  in der Kapitelreihenfolge, Taste `0`).
- Voll-Rollback der Live-Config per Backup-Verzeichnis:
  `mv ~/.config/nvim ~/.config/nvim.tmp && cp -r
  ~/.config/nvim-backup-<Zeitstempel> ~/.config/nvim`, dann Neovim neu
  starten. Host-Backups (`~/.config/nvim-backup-*`) werden von keiner
  Aktion ausser `recover-config` (nach Bestaetigung) angefasst.

## Quellen

- Stand 2026-09-28, alle Befehle auf dem Planungs-Host ausgefuehrt:
  `nvim --version` (v0.12.5), `:Lazy`-Registrierung
  (`~/.local/share/nvim/lazy/lazy.nvim/lua/lazy/view/commands.lua:113`),
  `:WhichKey`-Registrierung
  (`~/.local/share/nvim/lazy/which-key.nvim/lua/which-key/config.lua:306`),
  `:checkhealth`-Probe (`exists(':checkhealth')=2`),
  `dotfiles/install.sh` Zeilen 136-162,
  `dotfiles/nvim/README.md` (Windows-Wrapper-Protokoll). Vorlage
  `_template.md`, Ton nach `files-search.md`.
