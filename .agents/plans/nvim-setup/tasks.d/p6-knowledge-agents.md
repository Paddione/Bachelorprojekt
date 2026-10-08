# p6 — Kapitel Repository & Code Knowledge + AI & Agents (T901050, T901051)

Tickets: T901050, T901051 (EPIC T901043). Haengt ab von: p1.

## Kontext

K5: Graph-CLI vorhanden (52 355 Knoten laut Befund — zur Laufzeit neu
zaehlen); semantische Suche ohne Backend tot; Verweis auf das abgeschaffte
`docs/brain/` (dort liegt `k3-code-graph.md` nicht mehr — Ersatzpfad im Plan
vermerken oder Verweis entfernen). K6: nur opencode und muse bekannt;
installiert sind zusaetzlich claude, codex, qwen, pi, agy.

## Schritt 0 — Proben

Graph-Knoten zaehlen; CLI-Aufrufform (`cli <tool> '<json>'` mit
Positionsargument) live verifizieren; Backend der semantischen Suche auf
Erreichbarkeit proben; `command -v` je Agent-CLI (opencode, muse, claude,
codex, qwen, pi, agy); `opencode.nvim`-Probe (laden/funktionsfaehig?).

## Task 1 — Knowledge-Kapitel (T901050)

Files:

- `dotfiles/nvim/lua/chapters/repo-knowledge.lua`
- `dotfiles/nvim/runbooks/repo-knowledge.md`

Aktionen: Symbol suchen, Aufrufkette, Architektur-Layer, Code-Snippet — alle
als verifizierte CLI-Form. Semantische Suche nur bei erreichbarem Backend
anbieten, sonst klare Meldung statt toter Aktion. brain-Verweise entfernen
oder durch aktuellen Doc-Pfad ersetzen. Alte Datei
`lua/config/repo-knowledge.lua` loeschen. Runbook nach dem Vertrag.

## Task 2 — Agents-Kapitel (T901051)

Files:

- `dotfiles/nvim/lua/chapters/ai-agents.lua`
- `dotfiles/nvim/runbooks/ai-agents.md`

Agent-CLIs zur Laufzeit per `executable()`-Probe erkennen, nur vorhandene
anzeigen. Aktionen: Agent im Terminal im Git-Root starten, Datei oder
Auswahl als Kontext uebergeben. `opencode.nvim` behalten oder ersetzen, mit
Begruendung im Runbook. Alte Datei `lua/config/ai-agents.lua` loeschen.
Runbook nach dem Vertrag.

## Akzeptanz

Knowledge: vier Graph-Aktionen in verifizierter Aufrufform; Semantik mit
Backend-Guard; keine brain-Verweise. Agents: nur vorhandene CLIs sichtbar;
Start mit Kontextuebergabe; Plugin-Entscheid begruendet.

## Pruefbefehl

```bash
nvim --headless -u NONE -c "set rtp+=dotfiles/nvim" \
  -c "lua print(#require('chapters.repo-knowledge').actions(), #require('chapters.ai-agents').agents())" -c "qa!" 2>&1 | tail -1
```

Erwartung: zwei Zahlen groesser null; Agentenliste enthaelt nur live
vorhandene CLIs.
