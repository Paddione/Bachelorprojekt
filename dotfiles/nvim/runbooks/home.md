---
page: home
ticket: T901044
status: complete
actions:
  - Editor
  - Files & Search
  - JavaScript / Frontend
  - GitHub
  - SDLC
  - Repository & Code Knowledge
  - AI & Agents
  - Models & Inference
  - ComfyUI & Images
  - ML & Training
  - Infrastructure
  - MCP Servers
  - User Services
  - Tests & Plans
  - Settings & Help
---

## Voraussetzungen

- Neovim ist installiert und auf `PATH` (verifiziertes Ziel: v0.12.5).
- Die Repo-Config ist via `dotfiles/install.sh` (Paragraph 5) nach
  `~/.config/nvim` installiert (siehe `../README.md`).

## Geordnete Schritte

1. **Editor**: Kapitel oeffnen — LSP/Treesitter/Completion-Faehigkeiten.
2. **Files & Search**: Kapitel oeffnen — Datei finden, Repo-grep, Buffer.
3. **JavaScript / Frontend**: Kapitel oeffnen — dev/test/lint/build je Komponente.
4. **GitHub**: Kapitel oeffnen — PR-Anzeige, Checks, Logs, Release.
5. **SDLC**: Kapitel oeffnen — Tickets, Claims, Nachrichten, CI-Gates.
6. **Repository & Code Knowledge**: Kapitel oeffnen — Symbol-/Graph-Suche.
7. **AI & Agents**: Kapitel oeffnen — Agent im Terminal starten.
8. **Models & Inference**: Kapitel oeffnen — Loadout-Status/Start/Stopp.
9. **ComfyUI & Images**: Kapitel oeffnen — Status, Start, Workflows.
10. **ML & Training**: Kapitel oeffnen — Datensaetze, Laeufe, Boxen.
11. **Infrastructure**: Kapitel oeffnen — Cluster-Status, Pods, Logs.
12. **MCP Servers**: Kapitel oeffnen — Server-Status, Registry.
13. **User Services**: Kapitel oeffnen — systemd-User-Units.
14. **Tests & Plans**: Kapitel oeffnen — Test-zu-Datei, Plan-/Skill-Browser.
15. **Settings & Help**: Kapitel oeffnen — Lazy, checkhealth, Recovery.

Jeder Schritt oeffnet nur die Kapitelseite (Fokussieren). Ausfuehren ist
auf jeder Seite ein zweiter, bestaetigter Schritt. `<BS>` geht zurueck,
`0` zurueck zu Home.

## Erwartetes Ergebnis

Home rendert genau die 15 Kapitelzeilen oben, in dieser Reihenfolge, jede
als Linkzeile. Auswaehlen wechselt auf die Kapitelseite; das Oeffnen
fuehrt keine Shell-Kommandos, Datei-Schreibzugriffe oder Statuswechsel aus.

## Troubleshooting

- **Dashboard erscheint nicht auf `<leader>h` oder `:Dashboard`.**
  `:messages` auf Lua-Fehler aus `core.dashboard` pruefen; Config-Abgleich
  via `dotfiles/install.sh` sicherstellen.
- **Kapitelliste kuerzer als 15 Zeilen.** Ein Kapitelmodul laedt nicht:
  `nvim -l`-Probe je `chapters.*`-Modul einzeln fahren, Fehler in
  `:messages` lesen.

## Recovery

Keine: Home veraendert nichts. Bei defekter Darstellung `g:dashboard_startup = 0`
setzen und Neovim ohne Dateiargumente neu starten.
