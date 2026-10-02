---
page: ai-agents
ticket: T900662
status: complete
actions:
  - ask
  - select
  - send-context
  - list-skills
  - session-new
---

## Voraussetzungen

- Neovim v0.12.5 mit der Dashboard-Foundation (T900655) und der AI & Agents Seite (T900662 p1).
- **opencode.nvim** ist in `plugins/core.lua` enthalten (T900655) — kein neues Plugin noetig. Pruefen: `:checkhealth opencode` meldet keine Fehler.
- Die **opencode CLI** liegt auf dem `PATH` (verifiziert: v2.0.18). Pruefen: `opencode --version` liefert eine Version. Der Server muss mit Port-Freigabe laufen, damit das Plugin ihn findet: `opencode --port` starten (Server-Discovery; ohne laufenden Server startet das Plugin andernfalls selbst einen via `term://opencode --port`).
- Die **muse CLI** liegt auf dem `PATH` (nur fuer die list-skills Aktion noetig). Pruefen: `muse skills list --source all` endet mit Exit-Code 0 und zeigt die Kopfzeile `NAME SCOPE ACTIVATION DESCRIPTION PATH`.
- Der aktuelle Buffer muss innerhalb eines Git-Repository liegen: Alle Aktionen loesen ihr Arbeitsverzeichnis zur Ausfuehrungszeit ueber `config.gitroot.root()` auf (nil-Guard: ohne Repository erscheint eine Warnung, keine Aktion startet).

## Geordnete Schritte

1. **ask**: Oeffnen Sie die Seite (Dashboard: `<leader>h`, Kapitel "AI & Agents"). Der Fokus auf der Zeile hat keine Nebenwirkung (focus-versus-execute: erst die Enter-Taste bzw. die gezeigte Taste fuehrt die Aktion aus). Druecken Sie `a`. Die OpenCode-Prompt-Eingabe oeffnet, vorbelegt mit `@this: ` (Range bzw. Selektion wenn vorhanden, sonst Cursorposition). Mit `<Up>` blaettern Sie durch fruehere asks, mit `<Tab>` vervollstaendigen Sie Kontexte und Subagenten.

2. **select**: Druecken Sie `s` (erst fokussieren, dann Taste druecken). Der Picker oeffnet sich ueber OpenCode-Prompts, -Kommandos und -Server (Snacks-Picker mit Highlight und Vorschau). Mit Enter starten Sie den gewaehlten Eintrag.

3. **send-context**: Druecken Sie `c`. Die Aktion haengt `@buffer @diagnostics` (aktueller Buffer plus dessen Diagnostics) an die OpenCode-Sitzung an. Das Leerzeichen am Ende ist Absicht: opencode.nvim haengt den Prompt damit an statt die Eingabe zu ersetzen. Kontext-Platzhalter im Ueberblick: `@this` (Range/Selektion, sonst Cursor), `@buffer`, `@buffers`, `@diagnostics`, `@marks`, `@quickfix`, `@visible`.

4. **list-skills**: Druecken Sie `k`. Die Aktion fuehrt live `muse skills list --source all` aus und zeigt die Ausgabe in einem schreibgeschuetzten Scratch-Buffer (nur Lesen; der Buffer ist `readonly` und nicht veraenderbar). Mit `:bdelete` schliessen Sie ihn wieder.

5. **session-new**: Druecken Sie `n`. Die Aktion startet via `session.new` eine neue OpenCode-Sitzung. Weitere Lifecycle-Kommandos (`session.select`, `session.compact`, `session.interrupt`, `session.undo`, `session.redo`, `session.share`) erreichen Sie ueber den `select`-Picker.

Fokus-versus-Ausfuehrung: Das Navigieren auf der Seite (Cursor bewegen) fuehrt **keine** Aktion aus ("focus-no-side-effect", per headless Probe verifiziert); erst Enter bzw. der Buchstabe der jeweiligen Zeile startet die Aktion.

Kategorie-Workflows und ihre Agenten-Faehigkeiten:

| Workflow | Agenten-Faehigkeit |
|----------|-------------------|
| review | `review`-Prompt auf `@this` (Korrektheit und Lesbarkeit pruefen) |
| fix | `fix`-Prompt auf `@diagnostics` |
| explain | `explain`-Prompt auf `@this` |
| implement | `implement`-Prompt auf `@this` |
| test | `test`-Prompt auf `@this` (Tests hinzufuegen) |
| document | `document`-Prompt auf `@this` (Kommentare hinzufuegen) |
| session lifecycle | `session.new` / `session.select` / `session.compact` / `session.interrupt` |
| skill discovery | `list-skills` (live `muse skills list --source all`) |

Alle Prompts und Kommandos starten Sie ueber `ask` bzw. den `select`-Picker; die Tabelle ordnet nur zu, sie fuehrt nichts aus.

### Abgrenzung: Blink ist menschliche Tippvervollstaendigung, Agenten navigieren ueber Werkzeuge

Blink (`blink.cmp`, verdrahtet durch `setup_blink()` in `lua/config/editor-capabilities.lua`) ist ausschliesslich menschliche Tippvervollstaendigung: LSP-, Pfad-, Snippet- und Buffer-Quellen mit dem Standard-Keymap-Preset und **keiner** Agenten- oder LLM-Verdrahtung. Agenten vervollstaendigen niemals ueber Blink — sie navigieren ueber ihre eigenen Werkzeuge (OpenCode-Kontext-Platzhalter, -Prompts und -Kommandos). Diese Trennung ist Absicht und muss so bleiben: keine Agenten-Verdrahtung in Blink einbauen.

## Erwartetes Ergebnis

- Die Seite "AI & Agents" zeigt genau fuenf Aktionen in dieser Reihenfolge: `ask`, `select`, `send-context`, `list-skills`, `session-new`.
- `ask` oeffnet die Prompt-Eingabe mit `@this`-Kontext; `select` oeffnet den Picker ueber Prompts, Kommandos und Server; `send-context` haengt `@buffer @diagnostics` an; `list-skills` zeigt die live Skills-Liste in einem schreibgeschuetzten Buffer; `session-new` startet eine neue Sitzung (Ausfuehrungszeit-Aufloesung des Git-Root; verschachtelte Pfade, Linked Worktrees und Verzeichnisse mit Leerzeichen loesen korrekt auf den Toplevel auf).
- Headless-Start des Moduls (`require('config.ai-agents')`) endet mit Exit-Code 0 und definiert genau die fuenf Funktionen `ask`, `select`, `send_context`, `list_skills`, `session_new`.
- Es werden keine `BufWritePre`-Autocommands angelegt — keine Formatierung beim Speichern.

## Troubleshooting

- **Aktion startet nicht / Warnung "no git root"**: Der Buffer liegt ausserhalb eines Git-Repositories. `git rev-parse --show-toplevel` im Buffer-Verzeichnis pruefen; in ein Repository wechseln.
- **"opencode.nvim not loaded"**: Das Plugin wurde nicht geladen. `:Lazy` oeffnen und sicherstellen, dass `opencode.nvim` installiert ist (Teil von `plugins/core.lua`); `:checkhealth opencode` erneut ausfuehren.
- **Server nicht gefunden / Aktionen bleiben still**: Kein `opencode`-Server mit Port-Freigabe erreichbar. `opencode --port` in einem Terminal starten und erneut `:checkhealth opencode` ausfuehren.
- **Permission-Request bleibt haengen**: OpenCode fragt Berechtigungen ueber seine eigene UI an — die Anfrage dort bestaetigen oder ablehnen, dann die Aktion wiederholen.
- **"muse CLI not found"**: `muse` fehlt auf dem `PATH`. Installieren oder `PATH` korrigieren; danach `muse skills list --source all` manuell pruefen (muss Exit 0 liefern).
- **Aktionen funktionieren headless nicht** (Test-Kontext): In `nvim -l`-Proben wird ein Fake-opencode verwendet; im echten Editor ist opencode.nvim via lazy verfuegbar.

## Recovery

- Die Aktionen schreiben keine Dateien und setzen keine dauerhaften Zustaende: Es gibt nichts Persistentes zurueckzurollen. Der Skills-Scratch-Buffer ist fluechtig (`:bdelete`).
- Festhaengende Sitzung: Lifecycle-Kommandos `session.new` / `session.compact` / `session.interrupt` ueber den `select`-Picker (oder direkt als `opencode.command(...)`) — neue Sitzung starten, alte komprimieren oder unterbrechen.
- Seite entfernen = p1-Modul entfernen: `dotfiles/nvim/lua/config/ai-agents.lua` loeschen und den `ai-agents`-Eintrag in `dotfiles/nvim/lua/config/dashboard.lua` entfernen (der Auto-Stub uebernimmt wieder).
- Konfiguration komplett zuruecksetzen: `mv ~/.config/nvim ~/.config/nvim.tmp && mv ~/.config/nvim.old-20260927 ~/.config/nvim` (falls ein alter Stand existiert) und Neovim neu starten.

## Quellen

- Stand 2026-09-28, live verifiziert: opencode.nvim in `plugins/core.lua` (lazy-lock `06770e2`); Plugin-README (`ask`/`select`/`prompt`/`operator`/`command`, Kontext-Platzhalter, eingebaute Prompts, Session-Kommandos, `:checkhealth opencode`, `opencode --port`); opencode CLI v2.0.18; `muse skills list --source all` Exit 0; Neovim v0.12.5; `setup_blink()` in `lua/config/editor-capabilities.lua` ohne Agenten-Verdrahtung.
