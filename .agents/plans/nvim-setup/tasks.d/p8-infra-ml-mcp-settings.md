# p8 — Kapitel Infrastructure + ML + MCP + Settings (T901054, T901056, T901057, T901058)

Tickets: T901054, T901056, T901057, T901058 (EPIC T901043). Haengt ab von: p1
(Backup-Pfad aus Schritt 0 fuer die Settings-Recovery).

## Kontext

K8: fleet erreichbar, devmesh-Verbindung verweigert, Forward-Service haengt;
hart codierter Knoten; Telescope-Doppel in `plugins/core.lua` und
`plugins/nodectl.lua` (Bereinigung in p2, Nutzung hier nur lesend). I4: keine
Einstiege fuer Tests/Plaene/Skills (p9), ML-Zonen, MCP-Server. K10:
Recovery-Pfade zeigen auf geloeschte Backups. K11: `user-services.lua`
existiert nur live, mit hart codierter Sortierung.

## Schritt 0 — Proben

`kubectl config get-contexts` (nur fleet/devmesh gueltig);
`kubectl get nodes` (kein hart codierter Name); Forward-Units
(devmesh-forward, pgvector-forward, postgres-prod-forward, mcp-gateway)
Status; ML-Zonen live erheben (`ml/`, `.agents/training`,
`scripts/finetune`, `~/unsloth-boxes` — aktive Pipelines und Einstiegspunkte);
MCP-Serverliste aus `docs/agent-guide/registry/mcp.yaml` lesen, je Server
Unit und Port proben; Backup-Pfad aus p1 gegen K10-Recovery-Pfade abgleichen.

## Task 1 — Infrastructure-Kapitel (T901054)

Files:

- `dotfiles/nvim/lua/chapters/infrastructure.lua`
- `dotfiles/nvim/runbooks/infrastructure.md`

Ein Kapitel (Status und Node Control zusammengelegt). Contexts und Knoten
aus Laufzeit-Abfragen; kubectl.nvim, k9s und lazygit als Terminal-Aktionen;
keine Deploy-Aktion; Port-Forward-Units als Status. Alte Dateien
`lua/config/infrastructure.lua`, `lua/config/nodectl.lua` und
`runbooks/infrastructure-status.md` (geht in `infrastructure.md` auf)
loeschen. Runbook nach dem Vertrag.

## Task 2 — ML-, MCP- und Settings-Kapitel (T901056, T901057, T901058)

Files:

- `dotfiles/nvim/lua/chapters/ml-training.lua`
- `dotfiles/nvim/lua/chapters/mcp-servers.lua`
- `dotfiles/nvim/lua/chapters/settings-help.lua`
- `dotfiles/nvim/lua/chapters/user-services.lua`
- `dotfiles/nvim/runbooks/ml-training.md`
- `dotfiles/nvim/runbooks/mcp-servers.md`
- `dotfiles/nvim/runbooks/settings-help.md`
- `dotfiles/nvim/runbooks/user-services.md`

ML: Datensatz oeffnen, Lauf-Status/Log, Box-Status; kein Trainingsstart ohne
explizite Bestaetigung. MCP: Status pro Server (Unit + Port), Logs der
zugehoerigen User-Unit. Settings: Lazy, which-key, checkhealth,
Config-Recovery auf den p1-Backup-Pfad (K10-Pfade ersetzen). User-Services:
Live-Datei ins Repo uebernehmen, hart codierte Sortierung entfernen;
Start/Stop/Restart nur nach expliziter Auswahl. Runbooks nach dem Vertrag.

## Akzeptanz

Infra: ein Kapitel, Laufzeit-Contexts/Knoten, drei Terminal-Aktionen, kein
Deploy, Forward-Units als Status. ML/MCP/Settings: Aktionen wie oben, alle
Starts bestaetigt, Recovery auf realen Backup-Pfad, keine hart codierte
Sortierung.

## Pruefbefehl

```bash
nvim --headless -u NONE -c "set rtp+=dotfiles/nvim" \
  -c "lua print(#require('chapters.infrastructure').actions(), #require('chapters.ml-training').actions(), #require('chapters.mcp-servers').actions(), #require('chapters.settings-help').actions())" -c "qa!" 2>&1 | tail -1
```

Erwartung: vier Zahlen, alle groesser null.
