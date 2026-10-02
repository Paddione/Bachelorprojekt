---
page: repo-knowledge
ticket: T900661
status: complete
actions:
  - task-discover
  - k3-status
  - k3-symbol
  - k3-trace
  - project-docs
  - runbook-open
  - check-freshness
  - check-manifests
  - code-maps
---

## Voraussetzungen

- Neovim v0.12.5 mit der Dashboard-Foundation (T900655) und der Repository & Code Knowledge Seite (T900661 p1).
- **Telescope** und **ToggleTerm** sind in `plugins/core.lua` enthalten (T900655) — kein neues Plugin noetig. Pruefen: `:Telescope` oeffnet den Picker, `:ToggleTerm` oeffnet ein Terminal.
- Die Picker brauchen einen Datei-Finder (`rg`, `fd`/`fdfind` oder `find`; Telescope waehlt in dieser Reihenfolge). Verifiziert: `rg` ist vorhanden.
- Der K3-Codegraph (`codebase-memory-mcp`-Binary) ist **optional**: Fehlt das Binary oder ist kein Index bereit, melden die K3-Aktionen eine Warnung mit Verweis auf `docs/brain/k3-code-graph.md`, statt zu scheitern. Verifiziert am 2026-09-28: Binary 0.9.0 antwortet, Index `home-patrick-Bachelorprojekt` meldet `status: ready` (100078 Nodes / 207661 Edges, Head `db86a9b5`).
- Der aktuelle Buffer muss innerhalb eines Git-Repository liegen: Alle Aktionen loesen ihr Arbeitsverzeichnis zur Ausfuehrungszeit ueber `config.gitroot.root()` auf (nil-Guard: ohne Repository erscheint eine Warnung, keine Aktion startet).
- Die Check-Aktionen brauchen `task` im PATH (`task freshness:check`, `task workspace:validate`); die Oracle-Aktion braucht `bash scripts/vda.sh oracle` im Projektroot.
- Kein Netzwerk zur Laufzeit noetig; keine Binaries werden von der Konfiguration installiert.

## Geordnete Schritte

1. **task-discover**: Oeffnen Sie die Seite (Dashboard: `<leader>h`, Kapitel "Repository & Code Knowledge"). Der Fokus auf der Zeile hat keine Nebenwirkung (focus-versus-execute: erst die Enter-Taste bzw. die gezeigte Taste fuehrt die Aktion aus). Druecken Sie `t`. Die Aktion fragt per `vim.ui.input` nach einer Suchanfrage (leere Eingabe bricht ab), oeffnet dann ein ToggleTerm im Git-Root und fuehrt `bash scripts/vda.sh oracle '<Anfrage>'` aus. Laeuft kein LLM-Dienst, meldet das Oracle ehrlich "No local LLM service" und nennt den manuellen `task --list`-Ersatz; das Terminal bleibt in beiden Faellen sichtbar.

2. **k3-status**: Druecken Sie `s` (erst fokussieren, dann Taste). Die Aktion prueft live, ob `codebase-memory-mcp` im PATH liegt, fragt per stdin-JSON `cli index_status` den Indexstand ab (Projekt-Slug aus dem Git-Root abgeleitet, Fallback ueber `cli list_projects` fuer Linked Worktrees) und meldet per `vim.notify` Status, Node-/Edge-Zahlen und den Index-Head — plus Drift-Abgleich gegen `git rev-parse HEAD` ("matches HEAD" oder "drift: index … vs HEAD …"). Kein Index oder kein Binary: Warnung mit Verweis auf `docs/brain/k3-code-graph.md`, kein Fehler.

3. **k3-symbol**: Druecken Sie `y`. Die Aktion fragt nach einem Symbol (leere Eingabe bricht ab), sucht per stdin-JSON `cli search_graph` und schreibt Treffer (`name — qualified_name`, Datei + Zeile) in die Quickfix-Liste (`setqflist` + `copen`). Null Treffer melden "zero hits" und lassen die Quickfix-Liste unangetastet. Hinweis: Die K3-BM25-Suche ist fuzzy — auch unsinnige Begriffe koennen Treffer liefern; nur `total=0` ist ein verlaessliches Leer-Signal.

4. **k3-trace**: Druecken Sie `r`. Die Aktion fragt nach einem Symbol (am besten der vollstaendige `qualified_name` aus einer `k3-symbol`-Suche), verfolgt per stdin-JSON `cli trace_path` Aufrufer und Aufgerufene (Tiefe 2) und schreibt die Zeilen als Texteintraege ("caller hop N: …" / "callee hop N: …") in die Quickfix-Liste — Trace-Zeilen tragen keine Dateiposition. Keine Zeilen melden "no callers or callees"; ein unbekanntes Symbol meldet die K3-Fehlermeldung plus Suchempfehlung. Die Liste mit `:cclose` wieder schliessen.

5. **project-docs**: Druecken Sie `p`. Der Telescope-Picker `find_files` oeffnet im Git-Root, eingegrenzt per `search_dirs` auf die Verzeichnisse `docs/` und `docs/agent-guide/registry/` (Verzeichnisse statt Dateien: `fd`-basierte Finder weisen Dateipfade in `search_dirs` zurueck — live verifiziert). Zusaetzlich meldet die Aktion direkte `:edit`-Kurzwege fuer die Root-Anleitungen (`AGENTS.md`, `CLAUDE.md`, `llms.txt`, `docs/agent-guide/registry/capabilities.yaml`), soweit vorhanden. Mit Enter oeffnet sich die gewaehlte Datei.

6. **runbook-open**: Druecken Sie `o`. Der Telescope-Picker `find_files` oeffnet direkt im Verzeichnis `docs/runbooks` des Git-Roots. Fehlt das Verzeichnis, erscheint eine Warnung statt eines leeren Pickers. Mit Enter oeffnet sich das gewaehlte Runbook.

7. **check-freshness**: Druecken Sie `f`. Die Aktion meldet zuerst die erklaerte Wirkung (read-only Gate: schlaegt fehl, wenn generierte Artefakte veraltet sind, und regeneriert nichts — Regeneration ist das separate manuelle `task freshness:regenerate`), oeffnet dann ein ToggleTerm im Git-Root und fuehrt `task freshness:check` aus. Ein Gate-Fehler nennt das verletzte Artefakt im Terminal.

8. **check-manifests**: Druecken Sie `m`. Die Aktion meldet zuerst die erklaerte Wirkung (Kustomize-Dry-Run-Validierung ohne Cluster-Schreibzugriffe; Production bleibt manuell), oeffnet dann ein ToggleTerm im Git-Root und fuehrt `task workspace:validate` aus.

9. **code-maps**: Druecken Sie `c`. Die Aktion meldet zuerst die Kartengrenzen (generierte Artefakte, moeglicherweise veraltet — pruefen via `task freshness:graph-check`; Karten liefern keine operativen Befehle), oeffnet dann den Telescope-Picker `find_files` ueber `docs/generated/` und `docs/agent-guide/maps/` zur reinen Ansicht. Das Modul baut aus Karteninhalten grundsaetzlich keine Shell-Befehle.

Fokus-versus-Ausfuehrung: Das Navigieren auf der Seite (Cursor bewegen) fuehrt **keine** Aktion aus ("focus-no-side-effect", per headless Probe verifiziert); erst Enter bzw. der Buchstabe der jeweiligen Zeile startet die Aktion.

Leitplanken (EPIC): Generierte Karten zeigen ihre Grenzen und liefern keine ungeprueften Betriebsbefehle; das Dashboard bindet kein OpenSpec ein und fuehrt keine Produktionsaktionen aus dem Editor aus.

## Erwartetes Ergebnis

- Die Seite "Repository & Code Knowledge" zeigt genau neun Aktionen in dieser Reihenfolge: `task-discover`, `k3-status`, `k3-symbol`, `k3-trace`, `project-docs`, `runbook-open`, `check-freshness`, `check-manifests`, `code-maps` (Tasten `t s y r p o f m c`).
- Jede Aktion loest den Git-Root des aktuellen Buffers zur Ausfuehrungszeit auf und warnt ohne Repository, statt zu starten.
- `task-discover` zeigt immer ein Terminal (Oracle-Ausgabe oder ehrliche No-LLM-Meldung mit `task --list`-Hinweis).
- `k3-status` meldet Indexstand plus Drift-Abgleich ("matches HEAD" / "drift: …"); ohne Binary oder Index erscheint die Warnung mit Verweis auf `docs/brain/k3-code-graph.md`.
- `k3-symbol`/`k3-trace` fuellen die Quickfix-Liste oder melden den Leerstand ("zero hits" / "no callers or callees"), ohne sie anzutasten.
- `project-docs`/`runbook-open`/`code-maps` oeffnen Telescope-Picker mit den dokumentierten Suchraeumen; `project-docs` nennt zusaetzlich die `:edit`-Kurzwege.
- `check-freshness`/`check-manifests` melden vor dem Terminal die erklaerte Wirkung und fuehren dann das jeweilige `task`-Ziel aus.
- Headless-Start des Moduls (`require('config.repo-knowledge')`) endet mit Exit-Code 0 und definiert genau die neun Aktionen plus `send_to_quickfix`.
- Es werden keine `BufWritePre`-Autocommands angelegt — keine Formatierung beim Speichern.

## Troubleshooting

- **Aktion startet nicht / Warnung "no git root"**: Der Buffer liegt ausserhalb eines Git-Repositories (auch: Quickfix- oder Terminal-Buffer nach `:copen`/ToggleTerm — erst in einen Datei-Buffer wechseln). `git rev-parse --show-toplevel` im Buffer pruefen.
- **Oracle meldet "No local LLM service"**: Kein Fehler — so designed. Der genannte `task --list`-Befehl ist der manuelle Ersatz. Mit laufendem Ollama/Opencode-Dienst antwortet das Oracle direkt.
- **K3-Warnung "not on PATH"**: `codebase-memory-mcp` fehlt im PATH. Installations-/Pfad-Doku: `docs/brain/k3-code-graph.md`. Alle anderen Aktionen funktionieren weiter.
- **K3-Warnung "no K3 index covers …"**: Der Git-Root ist kein indexiertes Projekt (z. B. fremdes Repository). Index abgleichen: `echo '{}' | codebase-memory-mcp cli list_projects`.
- **K3-Warnung "not ready"**: Index wird (re-)gebaut oder ist veraltet — spaeter erneut versuchen bzw. Reindex anstossen (siehe `docs/brain/k3-code-graph.md`).
- **K3-Suche meldet Treffer fuer Unsinn / keine Treffer fuer Bekanntes**: BM25 ist fuzzy; nur `total=0` ("zero hits") ist verlaesslich leer. Bei unerwarteter Leere prueft `k3-status` zuerst den Drift-Stand.
- **K3-Trace meldet "function not found"**: Der exakte `qualified_name` ist noetig (Format aus `k3-symbol`-Treffern uebernehmen); die Warnung nennt die Such-Empfehlung des K3-Dienstes.
- **Check schlaegt fehl**: Das Terminal nennt das verletzte Gate (`freshness:check` → veraltetes Artefakt, manuell `task freshness:regenerate`; `workspace:validate` → Manifestfehler in der Kustomize-Ausgabe). Die Checks schreiben nichts.
- **`:Telescope` meldet Unbekannt**: Das Plugin wurde nicht geladen. `:Lazy` oeffnen und sicherstellen, dass `telescope` installiert ist (Teil von `plugins/core.lua`); `:Lazy install` bei Bedarf. Gleiches gilt fuer `:ToggleTerm` und `toggleterm`.
- **Quickfix-Liste bleibt offen**: `:cclose` schliesst sie; die Liste ist fluechtig und wird nicht gespeichert.
- **Pickers funktionieren headless nicht** (Test-Kontext): In `nvim -l`-Proben wird ein Fake-Telescope verwendet; im echten Editor ist Telescope via lazy verfuegbar.

## Recovery

- Die Aktionen schreiben keine Dateien und setzen keine dauerhaften Zustaende: Es gibt nichts Persistentes zurueckzurollen ausser der (fluechtigen) Quickfix-Liste (`:cclose`) und offenen ToggleTerm-Sitzungen (schliessen ohne Nebeneffekte).
- Seite entfernen = p1-Modul entfernen: `dotfiles/nvim/lua/config/repo-knowledge.lua` loeschen und den `repo-knowledge`-Eintrag in `dotfiles/nvim/lua/config/dashboard.lua` entfernen (der Auto-Stub uebernimmt wieder).
- Konfiguration komplett zuruecksetzen: `mv ~/.config/nvim ~/.config/nvim.tmp && mv ~/.config/nvim.old-20260927 ~/.config/nvim` (falls ein alter Stand existiert) und Neovim neu starten.

## Quellen

- Stand 2026-09-28. K3-CLI-Formen (`index_status`, `search_graph`, `trace_path`, `list_projects` via stdin-JSON; Ergebniszeilen-Felder; stderr-Logzeile), Oracle-Fallback-Text, die vier Task-Ziele (`freshness:check`, `freshness:regenerate`, `freshness:graph-check`, `workspace:validate`), Kartenpfade (`docs/generated/`, `docs/agent-guide/maps/`), Runbook-Verzeichnis (`docs/runbooks/`) und das `search_dirs`-Verhalten (`rg` ok, `fdfind` weist Dateipfade zurueck) wurden live gegen Binary 0.9.0 und Telescope `40aedd8` verifiziert. Keine neuen Upstream-Referenzen in T900661: Telescope und ToggleTerm sind bereits in `plugins/core.lua` (T900655) gepinnt.
