---
ticket_id: T901043
plan_ref: .agents/plans/nvim-setup/tasks.md
status: active
date: 2026-10-07
---

# nvim-setup — Design Spec (EPIC T901043)

Zielstruktur des Neuaufbaus. Alte Module unter `dotfiles/nvim/lua/config/`
und `lua/plugins/nodectl.lua` werden geloeschte Vorgaenger (kein Reuse);
Runbooks unter `dotfiles/nvim/runbooks/` werden auf das neue Aktionsmodell
umgeschrieben.

## Modulbaum (Ziel)

```text
dotfiles/nvim/
  init.lua                        # slim: lazy-Bootstrap, leader, setup-Aufrufe
  lua/core/
    lazy.lua                      # Plugin-Set (konsolidiert, siehe unten)
    options.lua                   # Editor-Defaults (aus config/editor.lua, neu)
    keymaps.lua                   # globale Leader-Maps (<leader>h etc.)
    gitroot.lua                   # Git-Root aus aktuellem Buffer
    actions.lua                   # Aktionsmodell-Typ + Runner
    dashboard.lua                 # Shell: Home, Kategorieseiten, Zurueck
  lua/chapters/
    editor.lua                    # T901045
    files-search.lua              # T901046
    js-frontend.lua               # T901047
    github.lua                    # T901048
    sdlc.lua                      # T901049
    repo-knowledge.lua            # T901050
    ai-agents.lua                 # T901051
    models-inference.lua          # T901052
    comfyui-images.lua            # T901053
    infrastructure.lua            # T901054 (inkl. Node-Control)
    ml-training.lua               # T901056
    mcp-servers.lua               # T901057
    settings-help.lua             # T901058 (Teil 1)
    user-services.lua             # T901058 (Teil 2, aus Live-Config uebernommen)
  lua/plugins/
    core.lua                      # behalten, um Telescope-Doppel zu bereinigen
    editor.lua                    # behalten, Picker/Terminal-Entscheid
  windows/init.lua                # Wrapper gegen neue Struktur pruefen
  runbooks/
    index.md                      # Master-Index (NEU, SSOT der Vollstaendigkeit)
    home.md                       # Home-Seite
    _template.md                  # Vorlage
    editor.md files-search.md js-frontend.md github.md sdlc.md
    repo-knowledge.md ai-agents.md models-inference.md comfyui-images.md
    infrastructure.md ml-training.md mcp-servers.md settings-help.md
    user-services.md               # je ein Runbook pro Kapitelseite
```

## Aktionsmodell (alle Kapitel, T901044-Vorgabe)

Jede Aktion: `{ name, inputs, target, effect, cwd, on_error }`.
`cwd` immer Git-Root des aktuellen Buffers (unbenannte Buffer und Dateien
ausserhalb Git: Fallback mit klarer Meldung). Suche fokussiert die Aktion
(Cursor/Liste), Ausfuehren ist ein separater, bestaetigter Schritt.
Kapitel registrieren sich in der Shell (` chapters.register(name, page) `);
kein Monolith.

## Runbook-Vertrag (alle Kapitel)

- Jede Seite hat ein Runbook, gelistet im Master-Index (`index.md`).
- Aktionsnamen und Runbook-Schritte: gleiche Namen, gleiche Reihenfolge.
- Maschinenpruefung: Index-Parsen gegen registrierte Kapitel (p1-Probe,
  p9-Gate).

## SSOT- und Verbotsregeln (aus Epic, hier normativ)

- `dotfiles/nvim` einzige Quelle; `install.sh` Para 5 einziger Weg nach live
  (Drift-Check-Befehl dokumentiert, `lazy-lock.json` aus dem Vergleich aus).
- Kein format-on-save, keine versteckten Deployments, keine Git-Mutationen
  oder Merges aus dem Editor (Merge-Aktion aus K3 ersatzlos streichen).
- Nur lesende/lokal pruefende Aktionen im SDLC-Kapitel (kein `stage-plan`,
  `release-hold`, Statuswechsel aus dem Editor).
- Start/Stop/Restart (Models, ComfyUI, Units, Trainings) nur nach expliziter
  Auswahl + Bestaetigung.
- Anzeige via `gh-axi`, `--json`/`-q`-Parsen via `gh` direkt (T004612).
- Task-Befehle im JS-Kapitel via `bash scripts/vda.sh oracle` ermitteln.
- Loadouts aus `scripts/llm/loadouts.json` lesen; Server-Liste aus
  `docs/agent-guide/registry/mcp.yaml`; Contexts aus
  `kubectl config get-contexts` (nur fleet/devmesh); Knoten aus
  `kubectl get nodes`; Komponentenliste aus `package.json`-Dateien zur
  Laufzeit; ComfyUI-Port aus Service/Umgebung, nicht Konstante.

## Start-Hypothesen mit Verifikationspflicht (aus Ticket-Befunden)

I1 Drift/live-only Dateien; I2 kein LSP-Server, Treesitter-Pin, `fd` fehlt;
I4 Test-/Plan-/Skill-/ML-Zonen ohne Einstieg; I5 Plugin-Doppel; K2 nur 3 von
~8 Komponenten; K3 Merge-Aktion; K4 fehlende devflow-Werkzeuge; K5 toter
Knowledge-Suche ohne Backend, brain-Verweis; K6 nur 2 von 7 Agent-CLIs;
K7 tote Units/Ports; K8 devmesh-Verbindungsfehler, hart codierter Knoten,
Telescope-Doppel; K9 Port-Drift 8190/8189, inaktiver Dienst; K10 Recovery auf
geloeschte Backups; K11 live-only `user-services.lua` mit hart codierter
Sortierung. Jede Hypothese wird im Partial-Proben-Schritt bestaetigt oder
korrigiert —-gueltig ist nur die Live-Probe.

## Plugin-Konsolidierung (p2, Entscheidung mit Ueberschneidungsvergleich)

- Picker: genau eines aus snacks.picker / telescope.
- Terminal: genau eines aus snacks.terminal / toggleterm.
- Completion: blink.cmp behalten oder ersetzen (Begruendung im Plan-Step).
- `fd`: installieren oder `rg`-Fallback als Standard dokumentieren.
- `:checkhealth` fehlerfrei fuer gewaehlte Server als Gate.

## Teststrategie

- `tests/spec/neovim-dashboard.bats` auf neue Struktur umstellen (p9):
  Output-Verifikation headless Proben; RED via
  `NVIM_DASHBOARD_CONFIG_SRC=<leeres Verzeichnis>` (`expected: FAIL`),
  GREEN nach Aufbau; Runbook-Index-Vollstaendigkeit als eigener Block.
- Pro Partial: headless Modul-Probe (`nvim -l` / `--headless`) als
  Pruefbefehl, disjunkt zum BATS-File (D1: BATS-Datei gehoert nur p9).
- `task test:inventory` nach Test-Aenderung; `test-inventory.json` gehoert p9.
