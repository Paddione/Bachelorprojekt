## Task 2: Dashboard-Registrierung der Settings-Help-Seite

Zweck. Dieses Partial registriert die Seite `settings-help` in der Dashboard-Shell (Ticket T900667). Es aendert genau eine geteilte Datei, haengt von p1 ab (die Aktionsfunktionen muessen existieren) und fasst keine andere Kachel an.

Live verifizierte Fakten (2026-09-28):

- `dotfiles/nvim/lua/config/dashboard.lua` (Ist 271 Zeilen, nicht-baselined, kein S1-Limit fuer .lua) fuehrt `settings-help` bereits in der festen Kapitelreihenfolge (Taste `0`, zehnter Eintrag) und versorgt fehlende Seiten per Auto-Stub-Schleife; die Registrierung ersetzt nur den Stub durch eine echte Seite.
- Exakter Registrierungsanker ist das Ende des `['files-search']`-Blocks in der `pages`-Tabelle (Kommentar `T900657 p2`, schliessende Klammern, danach die schliessende Klammer der Tabelle): Der neue `['settings-help']`-Block wird direkt dahinter eingefuegt, vor dem Tabellenende.
- Tasten `o s p c w r b u` sind frei (weder `q` noch `0` noch Navigations-/Home-Tasten); `j`/`k`/`h`/`l` bleiben bewusst unbelegt, damit die dokumentierte Navigation intakt bleibt.

Target files (CHANGED, eine geteilte Datei):

- `dotfiles/nvim/lua/config/dashboard.lua` (dashboard.lua): genau ein neuer Seiten-Block per Anker-Append; alle anderen Kapitel-Bloecke bleiben byte-identisch.

### Steps

1. Rebase zuerst auf den neuesten Stand, weil acht Kapitel-Branches dieselbe Datei anfassen:
   ```bash
   git fetch origin
   git rebase origin/main
   ```
   Danach `git status --short` pruefen: keine fremden Aenderungen im Baum.

2. Fuege den `['settings-help']`-Seitenblock direkt nach dem `['files-search']`-Block in der `pages`-Tabelle ein (Anker: das Blockende mit `related-open`-Effekt plus Tabellenende). Der Block traegt `title = 'Settings & Help'` und genau acht `action()`-Zeilen in dieser Reihenfolge, jede mit `inputs = {}`, `on_error = function() end` und einem `effect`, das die Ausfuehrungszeit-`cwd` an die gleichnamige Modulfunktion durchreicht:
   - Taste `o`, Name `open-config-source`, Effekt `require('config.settings-help').open_config_source(cwd)`
   - Taste `s`, Name `sync-status`, Effekt `require('config.settings-help').sync_status(cwd)`
   - Taste `p`, Name `plugins`, Effekt `require('config.settings-help').plugins()`
   - Taste `c`, Name `health`, Effekt `require('config.settings-help').health()`
   - Taste `w`, Name `keybindings`, Effekt `require('config.settings-help').keybindings()`
   - Taste `r`, Name `reload-config`, Effekt `require('config.settings-help').reload()`
   - Taste `b`, Name `backup-config`, Effekt `require('config.settings-help').backup()`
   - Taste `u`, Name `recover-config`, Effekt `require('config.settings-help').recover()`
   Kein OpenSpec-Eintrag, kein Link, keine zusaetzliche Seite.

3. Beweise, dass nur der neue Block dazukam:
   ```bash
   git diff --stat dotfiles/nvim/lua/config/dashboard.lua
   git diff dotfiles/nvim/lua/config/dashboard.lua | grep -E "^-" | grep -v "^---" && exit 1 || echo "append-only"
   ```
   Der Diff muss rein additiv sein (`append-only`).

4. Beweise Reihenfolge und Home-Stabilitaet headless:
   ```bash
   cat > /tmp/sh-order.lua <<'LUA'
   local stage, outfile = arg[1], arg[2]
   package.path = stage .. '/lua/?.lua;' .. package.path
   local dashboard = require('config.dashboard')
   local rows = dashboard.sections('settings-help')
   local f = io.open(outfile, 'w')
   for _, r in ipairs(rows[3]) do if r.name then f:write(r.name .. '\n') end end
   f:close()
   os.exit(0)
   LUA
   nvim -l /tmp/sh-order.lua dotfiles/nvim /tmp/sh-order.out
   printf 'open-config-source\nsync-status\nplugins\nhealth\nkeybindings\nreload-config\nbackup-config\nrecover-config\n' | diff - /tmp/sh-order.out
   ```
   Der `diff` muss leer ausgehen (exakte Acht-Namen-Reihenfolge).

5. Committe genau die eine Datei mit explizitem Pathspec:
   ```bash
   git add -f dotfiles/nvim/lua/config/dashboard.lua
   git commit -m "feat(T900667): register settings-help dashboard page [T900667]"
   git show --stat --oneline HEAD
   ```
   Der Stat muss genau eine Datei nennen.

### Acceptance criteria

- `dotfiles/nvim/lua/config/dashboard.lua` (dashboard.lua) enthaelt den `['settings-help']`-Block mit genau den acht Aktionen aus Schritt 2 in dieser Reihenfolge und mit diesen Tasten.
- Der Datei-Diff gegen den Rebase-Stand ist rein additiv; fremde Kapitel-Bloecke sind unveraendert.
- Die Headless-Probe aus Schritt 4 bestaetigt die Acht-Namen-Reihenfolge per leerem `diff`.
- Kein OpenSpec-Bezug wurde eingetragen (`grep -rn OpenSpec dotfiles/nvim/lua/config/dashboard.lua` bleibt leer).
- Der Commit traegt die Form `feat(T900667): <subject> [T900667]` und enthaelt genau diese eine Datei.
