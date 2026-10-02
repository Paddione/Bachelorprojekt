## Task 4: BATS-Abdeckung und Test-Inventar

Zweck. Dieses Partial haengt die Kapitel-Tests an die bestehende BATS-Datei an und regeneriert das Test-Inventar (Ticket T900667). Es besitzt genau zwei Dateien und haengt von p1, p2 und p3 ab (Modul, Seite und Runbook muessen stehen, bevor die Tests gruen werden koennen).

Live verifizierte Fakten (2026-09-28):

- Testdatei ist `tests/spec/neovim-dashboard.bats` (Ist 778 Zeilen, nicht-baselined, kein S1-Limit fuer .bats); Runner ist `tests/unit/lib/bats-core/bin/bats` (Bats 1.13.0); Laufform `./tests/runner.sh local` existiert, der direkte BATS-Aufruf ist zusaetzlich gefordert.
- Das Setup der Datei staget die Config aus `NVIM_DASHBOARD_CONFIG_SRC` (Default Repo-`dotfiles/nvim`) nach `$XDG_CONFIG_HOME/nvim`; XDG-Homes zeigen auf fluechtige BATS-TMP-Verzeichnisse — Backup-/Reload-Proben landen daher automatisch im TMP und beruehren nie das echte Home.
- Per-chapter-Anker ist neu und eindeutig: `# ── T900667 settings-help ──`. Alle neuen Proben folgen dem Muster der Datei (Lua-Probe schreiben, `nvim -l` starten, Ergebnisdatei asserten); kein Source-Grep als Ersatz fuer Output-Verifikation.
- Inventardatei ist `components/website/src/data/test-inventory.json` (Ist 6038 Zeilen, nicht-baselined, kein S1-Limit fuer .json); Regeneration per `task test:inventory`.

Target files (beide CHANGED):

- `tests/spec/neovim-dashboard.bats` (neovim-dashboard.bats): Tests nur unter dem T900667-Anker am Dateiende anhaengen; fremde Kapitel-Bloecke byte-identisch lassen.
- `components/website/src/data/test-inventory.json` (test-inventory.json): nur via `task test:inventory` regenerieren, nie von Hand editieren.

### Steps

1. Rot-Phase zuerst: Die neuen Tests muessen gegen eine Config ohne das Kapitel fehlschlagen. Lege ein leeres Config-Verzeichnis an, zeige per Env-Override darauf und starte den echten Runner — expected: FAIL:
   ```bash
   mkdir -p /tmp/sh-empty-config
   NVIM_DASHBOARD_CONFIG_SRC=/tmp/sh-empty-config tests/unit/lib/bats-core/bin/bats tests/spec/neovim-dashboard.bats -f 'settings-help'
   echo "filter exit: $?"
   ```
   Der gefilterte Lauf muss fehlschlagen (Modul und Seite fehlen im Staging); halte die failing-Ausgabe im Commit-Kommentar der Ausfuehrung fest. Danach ohne Override weiterarbeiten.

2. Rebase zuerst auf den neuesten Stand, weil alle Kapitel-Branches dieselbe Testdatei erweitern:
   ```bash
   git fetch origin
   git rebase origin/main
   ```

3. Haenge unter dem Anker `# ── T900667 settings-help ──` am Dateiende genau diese Faelle an (jeder als `@test "neovim-dashboard: settings-help ..."`):
   - Modulform: `config.settings-help` laedt headless und stellt alle acht Funktionen (vergleiche p1-Schritt 3).
   - Seitenreihenfolge: `dashboard.sections('settings-help')` liefert die acht Namen in Dashboard-Reihenfolge (Soll/Ist per `diff`).
   - Config-Quellziel: In einem fluechtigen Scratch-Repo oeffnet `open_config_source` exakt `<root>/dotfiles/nvim/init.lua` (Pfad per ueberschriebenem `vim.cmd.edit`-Recorder fangen).
   - Sync-Status: Gegen ein gestagtes Paar (Quelle mit/ohne Abweichung) meldet `sync_status` `in-sync` bzw. `differs`; Rueckgabestring asserten.
   - Reload-Marker: `reload` mit einer TMP-Datei, die eine globale Marke setzt, kehrt true zurueck und die Marke ist gesetzt.
   - Backup: `backup` legt genau ein neues `nvim-backup-*`-Verzeichnis unter `$XDG_CONFIG_HOME` an (vorher/nachher per `ls -d` vergleichen).
   - Recovery ohne Backups: `recover` bei leerer Backup-Liste warnt und veraendert nichts (Verzeichnisliste vorher/nachher identisch).
   - Runbook-Abdeckung: `runbooks/settings-help.md` existiert, traegt `status: complete`, seine `actions`-Liste gleicht der Dashboard-Reihenfolge per `diff`, alle fuenf `##`-Abschnitte sind vorhanden, und die Master-Index-Zeile steht auf complete.
   Kein Fall greift auf das echte Home zu; jeder Fall nutzt das Datei-Setup (Staging plus TMP-XDG).

4. Gruen-Phase: voller Datei-Lauf mit dem echten Runner:
   ```bash
   tests/unit/lib/bats-core/bin/bats tests/spec/neovim-dashboard.bats
   ```
   Exit 0, kein uebersprungener settings-help-Fall (skips nur bei fehlendem `nvim` oder unerreichbarem Plugin-Host, wie im Datei-Setup vorgesehen).

5. Regeneriere das Inventar und committe genau die zwei Dateien:
   ```bash
   task test:inventory
   git add tests/spec/neovim-dashboard.bats components/website/src/data/test-inventory.json
   git commit -m "feat(T900667): settings-help bats coverage [T900667]"
   git show --stat --oneline HEAD
   ```
   Der Stat muss genau zwei Dateien nennen.

### Acceptance criteria

- Die Rot-Phase aus Schritt 1 ist belegt: gefilterter Lauf gegen leere Config schlaegt fehl wie dort festgehalten.
- `tests/spec/neovim-dashboard.bats` (neovim-dashboard.bats) enthaelt alle acht Faelle aus Schritt 3 unter dem T900667-Anker; der Rest der Datei ist unveraendert.
- Der volle Runner-Lauf aus Schritt 4 ist gruen mit Exit 0.
- `components/website/src/data/test-inventory.json` (test-inventory.json) ist regeneriert und mitcommittet.
- Der Commit traegt die Form `feat(T900667): <subject> [T900667]` und enthaelt genau diese zwei Dateien.
