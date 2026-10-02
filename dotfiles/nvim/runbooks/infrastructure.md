---
page: infrastructure
ticket: T900664
status: complete
actions:
  - cluster-status
  - pods
  - services
  - pod-logs
  - context-select
  - setup-checklist
  - Node Control
  - Status
---

## Voraussetzungen

- Neovim v0.12.5 mit der Dashboard-Foundation (T900655) und der Infrastructure-Seite (T900664 p1).
- **kubectl** ist auf dem `PATH` verfuegbar (`kubectl version --client` liefert v1.36.3 oder neuer). Ohne kubectl warnen alle Aktionen mit einem Installationshinweis, statt zu scheitern.
- Die kubeconfig kennt genau die Contexts **fleet** (Produktion) und **devmesh** (lokales Mesh, ADR-008); `kubectl config get-contexts` listet beide. Die Marke **korczewski ist frozen** (`flux/clusters/fleet/ks-korczewski.yaml`, `suspend: true`, T002479) — jeder Namespace mit `korczewski` im Namen wird von `context-select` verweigert.
- Der Namespace `workspace` existiert auf fleet (Punkte und Services live verifiziert am 2026-09-28).
- Die kept Plugins **kubectl.nvim** (`:Kubectl`) und **ToggleTerm** (`:ToggleTerm`) sind in `plugins/core.lua` enthalten (T900655) — kein neues Plugin noetig. Pruefen: `:Kubectl` oeffnet die Pods-Ansicht, `:ToggleTerm` oeffnet ein Terminal.
- Windows/WSL: Das Routing bleibt unberuehrt — kubectl wird ueber den vererbten `PATH` aufgeloest, es gibt keine hartcodierten Pfade.
- Kein Netzwerk zur Laufzeit noetig ausser dem Cluster-Zugriff selbst; Produktionsmutationen (apply, delete, scale, deploy) bietet das Kapitel bewusst nicht an — sie bleiben manuelle Shell-Arbeit.

## Geordnete Schritte

1. **cluster-status**: Oeffnen Sie die Seite (Dashboard: `<leader>h`, Kapitel "Infrastructure"). Der Fokus auf der Zeile hat keine Nebenwirkung (focus-versus-execute: erst Enter bzw. die gezeigte Taste fuehrt die Aktion aus). Druecken Sie `c`. Ein Scratch-Buffer zeigt `kubectl get nodes` und `kubectl config get-contexts` (rein lesend).

2. **pods**: Druecken Sie `p`. Die kept kubectl.nvim-Ansicht (`:Kubectl`) oeffnet sich. Ist das Lazy-Plugin noch nicht geladen, erscheint ein Hinweis (`:Kubectl` einmal aufrufen, dann erneut versuchen).

3. **services**: Druecken Sie `v`. Ein Scratch-Buffer zeigt `kubectl get svc -n <namespace>` fuer den aktuell gewaehlten Namespace (Standard: `workspace`).

4. **pod-logs**: Druecken Sie `l`. Die Aktion listet die Pods (`kubectl get pods -n <namespace> -o name`); Sie waehlen **manuell genau einen Pod** aus (`vim.ui.select`, keine automatische Auswahl). Seine Logs laufen danach in einem kept ToggleTerm-Terminal (`kubectl logs -n <ns> <pod> -f --tail=200`). Abbrechen ohne Auswahl ist jederzeit moeglich.

5. **context-select**: Druecken Sie `x`. Die Aktion zeigt zuerst die aktuelle Auswahl (`context=<ctx> namespace=<ns>`), dann waehlen Sie den Context aus genau `{ fleet, devmesh }` und geben den Namespace ein. Ein Namespace mit `korczewski` im Namen wird **verweigert** (Frozen-Marke, siehe Voraussetzungen) — es findet kein Wechsel statt. Sonst wechseln Sie erst nach expliziter Bestaetigung (`Yes, switch`) via `kubectl config use-context` (nur lokale kubeconfig); der In-Memory-Status (`fleet`/`workspace` als Standard) wird danach aktualisiert.

6. **setup-checklist**: Druecken Sie `k`. Ein Scratch-Buffer meldet je eine Zeile pro Pruefung: kubectl auf dem `PATH`, Contexts `fleet` und `devmesh` erreichbar, gewaehlter Namespace vorhanden, kubectl.nvim- und ToggleTerm-Specs in `plugins/core.lua` vorhanden.

7. **Node Control**: Druecken Sie `n`. Der kept Link fuehrt auf die Unterseite `infrastructure-node` (T900800, nodectl-Layer): Probe-Anzeigezeilen (Contexts `fleet`/`devmesh`, `gpu-cluster-3` Ready), fehlende Binaries und die SETUP_CHECKLIST.md-Punkte. `r` aktualisiert die Proben explizit (die Seite rendert selbst keine Proben), `n` oeffnet die Checkliste zum Bearbeiten.

8. **Status**: Druecken Sie `s`. Der kept Foundation-Link fuehrt auf die Unterseite `infrastructure-status` (T900655, eigenes Runbook `infrastructure-status.md`) — dort liegt die Beispielaktion `Show current buffer git root`.

Fokus-versus-Ausfuehrung: Das Navigieren auf der Seite (Cursor bewegen, Suchtreffer fokussieren) fuehrt **keine** Aktion aus ("focus-no-side-effect", per headless Probe verifiziert); erst Enter bzw. der Buchstabe der jeweiligen Zeile startet die Aktion.

## Erwartetes Ergebnis

- Die Seite "Infrastructure" zeigt genau sechs Aktionen in dieser Reihenfolge: `cluster-status`, `pods`, `services`, `pod-logs`, `context-select`, `setup-checklist`, danach die kept Links `Node Control` und `Status` auf die Unterseiten.
- `cluster-status`/`services`/`setup-checklist` zeigen Scratch-Buffer (fluechtig, `bufhidden=wipe`); `pods` oeffnet `:Kubectl`; `pod-logs` oeffnet ein ToggleTerm mit dem Log-Tail; `context-select` meldet die aktuelle Auswahl zuerst und wechselt nur nach Bestaetigung.
- `context-select` gegen einen `korczewski`-Namespace verweigert mit Verweis auf die frozen Kustomization — ohne `use-context`-Aufruf, ohne Statusaenderung.
- Headless-Start des Moduls (`require('config.infrastructure')`) endet mit Exit-Code 0 und definiert genau die sechs Aktionen plus `M.state` (`context = 'fleet'`, `namespace = 'workspace'`).
- Es werden keine `BufWritePre`-Autocommands angelegt — keine Formatierung beim Speichern. Die Aktionen schreiben nichts Persistentes (keine Dateien, nur lokale kubeconfig bei bestaetigtem Context-Wechsel).

## Troubleshooting

- **Warnung "kubectl not found on PATH"**: kubectl fehlt im vererbten `PATH`. Installieren (https://kubernetes.io/docs/tasks/tools/), Neovim neu starten; alle Aktionen degradieren bis dahin zu Warnungen.
- **"context fleet/devmesh: MISSING" in der Checkliste**: kubeconfig kennt den Context nicht. `kubectl config get-contexts` pruefen; Context-Namen muessen exakt `fleet`/`devmesh` lauten.
- **"namespace <ns>: MISSING"**: Der gewaehlte Namespace existiert im aktuellen Context nicht. Mit `context-select` zurueck auf `workspace` wechseln.
- **Verweigerung bei korczewski-Namespace**: Erwartetes Verhalten — die Marke ist frozen (`suspend: true`, T002479). Keinen Workaround suchen; Produktionsaktionen bleiben manuell.
- **`:Kubectl` meldet Unbekannt / ToggleTerm oeffnet nicht**: Das kept Plugin wurde nicht geladen. `:Lazy` oeffnen und sicherstellen, dass `kubectl.nvim`/`toggleterm.nvim` installiert sind (Teil von `plugins/core.lua`); `:Lazy install` bei Bedarf, dann Aktion erneut ausfuehren.
- **`kubectl get pods` schlaegt fehl / Context nicht erreichbar**: Cluster-Zugriff pruefen (`kubectl cluster-info --context fleet`); bei VPN/Netzproblemen spaeter erneut versuchen. Die Aktion meldet den kubectl-Fehlertext als Notification.
- **Seite zeigt keine Aktionen**: `config.infrastructure` laedt nicht (`:messages` pruefen); sicherstellen, dass `lua/config/infrastructure.lua` im Staging liegt.

## Recovery

- Die Lese-Aktionen schreiben nichts: Scratch-Buffer einfach schliessen (`:bdelete`), ToggleTerm-Terminals mit `<C-d>`/`:ToggleTerm` beenden.
- Falscher Context nach `context-select`: mit derselben Aktion zurueckwechseln oder manuell `kubectl config use-context <alter-ctx>` in der Shell. Der Modul-Status folgt beim naechsten bestaetigten Wechsel.
- Seite entfernen = p1-Modul entfernen: `dotfiles/nvim/lua/config/infrastructure.lua` loeschen und den `infrastructure`-Block in `dotfiles/nvim/lua/config/dashboard.lua` auf den Stub zuruecksetzen.
- Konfiguration komplett zuruecksetzen: `mv ~/.config/nvim ~/.config/nvim.tmp && mv ~/.config/nvim.old-20260927 ~/.config/nvim` (falls ein alter Stand existiert) und Neovim neu starten.
