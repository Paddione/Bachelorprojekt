## Task 1: Settings-Help-Aktionsmodul

Zweck. Dieses Partial implementiert das Aktionsmodul des Kapitels „Settings und Help" (Ticket T900667) als neue Datei. Es besitzt genau eine Datei, haengt von keinem anderen Partial ab und fuegt kein Plugin hinzu.

Live verifizierte Fakten (2026-09-28, alle Befehle auf dem Planungs-Host ausgefuehrt):

- Ziel-Neovim ist v0.12.5 unter `/usr/local/bin/nvim`; BATS-Runner ist `tests/unit/lib/bats-core/bin/bats` (Bats 1.13.0).
- `:Lazy` ist in der installierten lazy.nvim-Quelle registriert (`~/.local/share/nvim/lazy/lazy.nvim/lua/lazy/view/commands.lua`, Zeile 113, `nvim_create_user_command("Lazy", ...)`); der Bootstrap-Ref `stable` loest per `git ls-remote https://github.com/folke/lazy.nvim.git stable` auf (Tag 332b4cbc).
- `:WhichKey` ist in der installierten which-key-Quelle registriert (`~/.local/share/nvim/lazy/which-key.nvim/lua/which-key/config.lua`, Zeile 306); Aufrufform `:WhichKey [mode] [keys]`, ruft intern `require("which-key").show({mode, keys})` auf.
- `:checkhealth` ist eingebaut: Headless-Probe meldet `exists(':checkhealth')=2`; `stdpath('config')` ist `/home/patrick/.config/nvim`, `stdpath('data')` ist `/home/patrick/.local/share/nvim`.
- Alle dreizehn Kept-Plugins liegen installiert unter `~/.local/share/nvim/lazy/` (gitsigns, kubectl, lazy, lualine, devicons, opencode, plenary, snacks, telescope, toggleterm, tokyonight, trouble, which-key).
- `dotfiles/install.sh` enthaelt den nvim-Schritt in den Zeilen 136-162 (no-op bei Gleichheit ohne lazy-lock.json, sonst Backup plus Replace); die Live-Config `~/.config/nvim` ist derzeit ein leeres Verzeichnis, Host-Backups `~/.config/nvim-backup-*` existieren.
- Es gibt keinen Windows-Wrapper im Repo (nur die Referenz auf `%LOCALAPPDATA%\nvim\init.lua` in `dotfiles/nvim/README.md`); die Windows/WSL-Synchronisation ist daher Doku plus Pruefbefehle, kein Repo-File-Handling.

Target files (NEW):

- `dotfiles/nvim/lua/config/settings-help.lua` (settings-help.lua): Modul mit acht Aktionsfunktionen; Umfang etwa zweihundertzwanzig Zeilen.

### Steps

1. Overlap-Pruefung gegen das Plugin-Inventar. Keines der dreizehn Kept-Plugins in `dotfiles/nvim/lua/plugins/core.lua` (Snacks, Telescope, Gitsigns, Trouble, which-key, lualine, TokyoNight, devicons, OpenCode, kubectl.nvim, ToggleTerm, Plenary, lazy.nvim) stellt Config-Quellen-Oeffnen, Sync-Status, Backup oder Recovery bereit; `:Lazy`, `:WhichKey` und `:checkhealth` werden nur aufgerufen, nicht nachimplementiert. Pruefbefehl vom Worktree-Root:
   ```bash
   grep -c "nvim" dotfiles/nvim/lua/plugins/core.lua
   grep -rnE "settings-help|SettingsHelp" dotfiles/nvim/lua/ || echo "no prior settings-help module"
   ```
   Der zweite Befehl muss die Echo-Zeile ausgeben (Datei existiert noch nicht).

2. Erstelle `dotfiles/nvim/lua/config/settings-help.lua` (settings-help.lua) als Modul `M` mit Rueckgabe `M`. Uebernommen wird das files-search-Vertragsmodell: Git-Root wird zur Ausfuehrungszeit ueber `require('config.gitroot').root()` aufgeloest, mit WARN und frueher Rueckkehr ohne Root; Pfade an `:edit`/`:source` laufen durch `fnameescape()`; externe Vergleiche laufen ueber `vim.system` mit Argumentvektor (keine Shell, kein `vim.fn.system` mit String).

3. Implementiere genau diese acht Funktionen in genau dieser Reihenfolge (Dashboard- und Runbook-Reihenfolge):
   - `M.open_config_source(cwd)` — loest den Root auf, bildet `<root>/dotfiles/nvim/init.lua`, prueft Existenz per `vim.loop.fs_stat`, oeffnet per `:edit`; WARN mit dem fehlenden Pfad, wenn die Datei unter dem Root fehlt. Gibt den Zielpfad zurueck.
   - `M.sync_status(cwd)` — loest den Root auf, vergleicht `<root>/dotfiles/nvim` gegen `stdpath('config')` per `vim.system({'diff','-rq','-x','lazy-lock.json',src,dst})`, meldet per `vim.notify` Quelle, Live-Pfad und Zustand (`in-sync`, `differs`, `live-missing`) plus den Hinweis, dass Install und Windows-Wrapper-Abgleich manuell bleiben. Gibt den Zustand als String zurueck. Schreibt nichts.
   - `M.plugins()` — bei `vim.fn.exists(':Lazy') == 2` ein `vim.cmd('Lazy')`, sonst WARN (`lazy.nvim noch nicht geladen`).
   - `M.health()` — ein `vim.cmd('checkhealth')` (eingebaut, immer vorhanden).
   - `M.keybindings()` — bei `vim.fn.exists(':WhichKey') == 2` ein `vim.cmd('WhichKey')`, sonst WARN.
   - `M.reload(path)` — `path` default `stdpath('config') .. '/init.lua'`; `pcall(vim.cmd, 'source ' .. fnameescape)` plus Erfolgs-/Fehler-Notify. Gibt boolean zurueck.
   - `M.backup()` — Ziel `stdpath('config') .. '-backup-' .. os.date('%Y%m%d-%H%M%S')`; Kopie per `vim.system({'cp','-r',src,dst})`; Notify mit Ziel; gibt das Ziel zurueck, nil bei Fehler. Legt nichts ausser dem neuen Verzeichnis an.
   - `M.recover()` — listet `nvim-backup-*` neben `stdpath('config')` per `vim.fn.glob`; ohne Treffer WARN und Rueckkehr; sonst Notify mit juengstem Backup plus dem manuellen Restore-Befehl; fuehrt den Tausch (live aside, Backup an seinen Platz) nur aus, wenn `vim.fn.confirm()` bestaetigt. Gibt einen Status-String zurueck.

4. Habe Guards ein: keine `BufWritePre`-Autocommands (kein format-on-save), keine Git-Mutation, keine Netzwerkaufrufe, kein OpenSpec-Bezug, keine neuen Plugin-Specs. Selbstpruefung:
   ```bash
   grep -rnE "BufWritePre|openspec|OpenSpec|git (commit|push|add)" dotfiles/nvim/lua/config/settings-help.lua && exit 1 || echo "guards clean"
   ```

5. Beweise das Laden headless ohne Netzwerk. Lege eine Probe unter `/tmp` an (nicht im Repo) und fordere alle acht Funktionen an:
   ```bash
   cat > /tmp/sh-shape.lua <<'LUA'
   local stage = arg[1]
   package.path = stage .. '/lua/?.lua;' .. package.path
   local ok, m = pcall(require, 'config.settings-help')
   if not ok then io.stderr:write('LOAD FAILED\n'); os.exit(1) end
   for _, f in ipairs({'open_config_source','sync_status','plugins','health','keybindings','reload','backup','recover'}) do
     if type(m[f]) ~= 'function' then io.stderr:write('missing ' .. f .. '\n'); os.exit(1) end
   end
   print('all eight functions exist')
   os.exit(0)
   LUA
   nvim -l /tmp/sh-shape.lua dotfiles/nvim
   ```
   Erwartet: Exit 0 und die Zeile `all eight functions exist`.

6. Committe genau die eine Datei. `dotfiles/` ist gitignoriert, daher explizit force-adden:
   ```bash
   git add -f dotfiles/nvim/lua/config/settings-help.lua
   git commit -m "feat(T900667): settings-help action module [T900667]"
   git ls-files dotfiles/nvim/lua/config/settings-help.lua
   ```
   `git ls-files` muss genau die eine Datei nennen.

### Acceptance criteria

- `dotfiles/nvim/lua/config/settings-help.lua` (settings-help.lua) existiert, gibt `M` zurueck und stellt genau die acht Funktionen aus Schritt 3 in dieser Reihenfolge bereit.
- Jede Funktion mit Root-Bezug loest ihn zur Ausfuehrungszeit ueber `config.gitroot` auf und warnt ohne Root, statt zu raten oder zu schreiben.
- Die Guards aus Schritt 4 sind sauber: keine Autocommands beim Schreiben, keine Git-Mutation, kein OpenSpec-Bezug, kein neues Plugin.
- Die Headless-Probe aus Schritt 5 meldet alle acht Funktionen mit Exit 0.
- Der Commit traegt die Form `feat(T900667): <subject> [T900667]` und enthaelt genau die eine force-addete Datei.
