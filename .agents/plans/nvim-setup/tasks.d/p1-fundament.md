# p1 — Fundament (T901044)

Tickets: T901044 (EPIC T901043). Haengt von keinem Partial ab; alle
Kapitel-Partials (p2–p8) haengen von diesem ab.

## Kontext

Neuer Kern unter `dotfiles/nvim/`: Bootstrap, Modulstruktur `lua/core` und
`lua/chapters`, Dashboard-Shell mit Selbstregistrierung, Aktionsmodell,
Runbook-Master-Index, `gitroot` aus dem aktuellen Buffer. Alte Dateien
`lua/config/dashboard.lua` (989 Zeilen), `lua/config/gitroot.lua`,
`lua/config/editor.lua` und `lua/plugins/nodectl.lua` werden geloeschte
Vorgaenger (kein Reuse). SSOT-Entscheid aus dem Epic: `dotfiles/nvim` einzige
Quelle, `install.sh` Paragraph 5 einziger Weg nach live.

## Schritt 0 — Sichern und Proben (vor jeder Aenderung)

1. Live-Config sichern: `NVIM_BACKUP="$HOME/.config/nvim-backup-$(date
   +%Y%m%d-%H%M%S)"` ausserhalb aller Config-Verzeichnisse; nach dem Kopieren
   `diff -rq` Repo-gegen-Backup vergleichen und den Backup-Pfad im Ticket
   T901044 notieren.
2. Drift erheben: `diff -rq -x lazy-lock.json dotfiles/nvim ~/.config/nvim`
   (Erwartung gemaess I1: mehrere Dateien differieren; `user-services.lua`
   existiert nur live — Inhalt fuer p8 sichern, nicht verwerfen).
3. Home-Dotfiles-Repo pruefen (read-only): Whitelist-Eintrag und Index-Status
   von `.config/nvim` feststellen (`git check-ignore`, `git ls-files`);
   Ergebnis im Ticket vermerken. Dort wird in diesem Plan nichts geaendert.
4. `nvim --version` notieren (I2 nennt 0.12.5 — nur die Probe zaehlt).

## Task 1 — Kernmodule und Dashboard-Shell

Files:

- `dotfiles/nvim/init.lua`
- `dotfiles/nvim/lua/core/lazy.lua`
- `dotfiles/nvim/lua/core/options.lua`
- `dotfiles/nvim/lua/core/keymaps.lua`
- `dotfiles/nvim/lua/core/gitroot.lua`
- `dotfiles/nvim/lua/core/actions.lua`
- `dotfiles/nvim/lua/core/dashboard.lua`

`init.lua` schlank neu: Leader setzen, `lazy.nvim`-Bootstrap, genau drei
`setup()`-Aufrufe (core-Defaults, Dashboard, Kapitel-Registrierung).
`gitroot.lua`: Root aus dem Pfad des aktuellen Buffers (`expand('%:p')`,
`git rev-parse --show-toplevel` mit `cwd`-Fallback); unbenannte Buffer und
Dateien ausserhalb Git melden klar statt zu raten. `actions.lua`: Aktionstyp
`{ name, inputs, target, effect, cwd, on_error }`; Runner trennt
Fokussieren (Suche springt zur Aktion) und Ausfuehren (separater,
bestaetigter Schritt). `dashboard.lua`: Shell mit Home, Kategorieseiten,
Zurueck-Navigation; Kapitel registrieren sich per `register(name, page)`;
kein Monolith (Budget: neue Dateien, jeweils deutlich unter 800 Zeilen
Reserve). `lazy.lua` uebernimmt das konsolidierte Set erst in p2 — hier nur
die Lade-Mechanik ohne Plugin-Entscheide.

## Task 2 — Runbook-Index, Vorlage, Home; Altes loeschen

Files:

- `dotfiles/nvim/runbooks/index.md`
- `dotfiles/nvim/runbooks/home.md`
- `dotfiles/nvim/runbooks/_template.md`
- `dotfiles/nvim/runbooks/README.md`
- `dotfiles/nvim/README.md`
- `dotfiles/nvim/SETUP_CHECKLIST.md`

`index.md` ist der Master-Index: jede Kapitelseite mit Runbook-Pfad;
`_template.md` die Vorlage; `home.md` die Home-Seite. Aktionsnamen und
Runbook-Schritte tragen gleiche Namen und Reihenfolge (wird in p9
maschinengeprueft). `runbooks/README.md` (alter Stub-Index) entfernen oder
zum Pointer auf `index.md` schrumpfen. Top-`README.md` und
`SETUP_CHECKLIST.md` auf die neue Struktur umschreiben.
Alte Module `lua/config/dashboard.lua`, `lua/config/gitroot.lua`,
`lua/config/editor.lua`, `lua/plugins/nodectl.lua` loeschen.

## Task 3 — install.sh, Windows-Wrapper, Rollback

Files:

- `dotfiles/install.sh`
- `dotfiles/nvim/windows/init.lua`

`install.sh` Paragraph 5 bleibt unveraendert der einzige Weg nach live;
hoechstens Kommentar-Praezisierung (Datei Ist 169, Budget 631 — Aenderung
minimal halten). Drift-Check-Befehl (`diff -rq -x lazy-lock.json`) in
`SETUP_CHECKLIST.md` dokumentieren. `windows/init.lua` gegen die neue
Struktur pruefen (WSL-Routing erhalten). Rollback in `SETUP_CHECKLIST.md`:
Backup-Pfad zurueckkopieren, Schritt fuer Schritt.

## Akzeptanz (T901044-Checkliste)

Live-Backup mit Pfad im Ticket; SSOT-Regel dokumentiert; `install.sh`
einziger Weg; `init.lua` mit lazy-Bootstrap und `lua/core`-Struktur;
`gitroot` buffer-basiert; Shell mit Home/Kategorien/Zurueck;
Aktionsmodell mit Zwei-Schritt-Ausfuehrung; Master-Index plus Vorlage;
Windows-Wrapper geprueft; Rollback dokumentiert.

## Pruefbefehl

```bash
nvim -l .agents/plans/nvim-setup/probes/p1-load.lua dotfiles/nvim
test "$(nvim --headless -u NONE -c "set rtp+=dotfiles/nvim" \
  -c "lua print(#require('core.dashboard').pages())" -c "qa!" 2>&1 | tail -1)" -gt 0
grep -c '^|' dotfiles/nvim/runbooks/index.md
```

Erwartung: alle Kernmodule laden ohne Netzwerk, mindestens eine Seite
registriert, Index enthaelt alle Kapitelseiten.
