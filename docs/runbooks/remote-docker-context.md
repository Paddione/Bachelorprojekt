# Runbook: Remote-Docker-Context (Break-Glass)

_Ticket: T900054_ · Ergänzung zum WSL-Exit

## Kontext

Mit dem WSL-Exit (Operator-Entscheidung 2026-09-03) gibt es **keinen lokalen Dev-Cluster** mehr.
Die sechs Image-Builds (website, docs, brett, studio-server, talk-transcriber, einvoice-sidecar)
laufen ausschliesslich über CI (`build-*.yml`). Falls lokal dennoch ein Image gebaut oder importiert
werden muss, dient dieser Runbook als Break-Glass.

## Voraussetzungen

- SSH-Zugang zu einem Fleet-Host (pk-hetzner-4/6/8) mit installiertem Docker
- SSH-Key des Dev-Hosts auf dem Zielhost in `~/.ssh/authorized_keys`
- `kubectl` im Fleet-kubeconfig-Kontext erreichbar

## Remote-Context einrichten

```bash
docker context create remote --docker host=ssh://patrick@pk-hetzner-4
docker context use remote
```

Damit laufen alle `docker`-Befehle auf dem Fleet-Host. Images werden dort gebaut und stehen
sofort dem k3d-Cluster (über `ghcr.io`) zur Verfügung — kein `k3d image import` noetig.

## Pendant-Lücke

Zwei systemd-Units auf dem Windows-Host (`mcp-postgres-local.service`, `pgvector-forward.service`)
binden `kubectl --context fleet port-forward` und sind damit fleet-basiert. Sie haben **kein
Windows-Pendant** in `start-windows.ps1` und sind ebenfalls kein "toter Zustand" mehr — sie
sind nur unbedient.

**Optionen:**
1. **Scheduled Task:** Einmalig einen Windows-Scheduled-Task anlegen, der
   `kubectl --context fleet port-forward ...` beim Login startet.
2. **Manuell:** Operator startet den port-forward manuell, wenn nodig.
3. **Ticket:** Eigenes Ticket fuer einen persistenten Windows-Startmechanismus.

Diese Lücke ist bewusst **nicht** in diesem Change geschlossen — ein Windows-Scheduled-Task
waere neues Laufzeitverhalten.

### Nicht loeschbare tote Units

Drei Units sind tot, bleiben aber im Repo, weil bestehende Zusicherungen sie voraussetzen
(T900054). Ihre Kopfzeile nennt jeweils den Grund:

| Unit | Was sie festhaelt |
|---|---|
| `scripts/llm-proxy/llm-proxy.service` / `-lan.service` | `tests/spec/local-llm-proxy.bats` (T002277), `proxy-env-token-guard.bats` (T002556) und der SSOT-Spec `local-llm-proxy.md` |
| `scripts/mcp-gateway/k3d-postgres-forward.service` | `scripts/mcp-gateway/watchdog-check.sh:70-71` und `watchdog-tunnel-liveness.bats` (T002543) |

Sie fallen mit ihrem jeweiligen Requirement — im llm-proxy-Rueckbau bzw. im Watchdog-Rueckbau,
nicht einzeln.

### Linux-Units ohne Windows-Pendant

Daneben stehen elf Units unter `scripts/`, die auf dem Windows-Host **gar nicht** mehr laufen
koennen: sie binden WSL-Pfade (`/home/patrick/...`), einen Linux-Systembenutzer oder eine
GUI-App unter WSLg. `start-windows.ps1` deckt keine von ihnen ab. Jede traegt seit T900054 eine
`# Status:`-Kopfzeile, die auf diesen Abschnitt zeigt:

| Unit | Warum sie hier steht |
|---|---|
| `scripts/factory/mcp-go/factory-mcp.service` | `/home/patrick/...` als WorkingDirectory und ExecStart |
| `scripts/factory/sdlc-github-poller.service` / `.timer` | dito; GitHub-Rueckkanal des Dev-Hosts |
| `scripts/mcp-cors-proxy/mcp-cors-proxy.service` | systemd-USER-Unit, kein Windows-Aequivalent |
| `scripts/mcp-gateway/mcp-gateway-watchdog.service` / `.timer` | bewacht `mcp-gateway.service`, die selbst tot ist |
| `scripts/sdlc/sdlc-backup.service` / `.timer` | `/home/patrick/...`; taegliche SDLC-Sicherung |
| `scripts/lm-studio/lmstudio-bge-autoload.service` / `.timer` | setzt LM Studio als GUI-App unter WSLg voraus |
| `scripts/llm/ollama.service` | Linux-System-Unit, `/usr/local/bin/ollama` unter Benutzer `ollama` |

Auch hier gilt: Pendant bauen = neues Laufzeitverhalten, also eigenes Ticket. Die Units bleiben
als Referenz fuer einen Linux-Host im Repo, statt geloescht zu werden.

## Verweis

- `scripts/mcp-gateway/mcp-postgres-local.service` — Pendant-Lücke dokumentiert in Kopfzeile
- `scripts/semantic-code-search/pgvector-forward.service` — Pendant-Lücke dokumentiert in Kopfzeile
- `docs/runbooks/decommission-k3s-node.md` — Node-Decommissionierung (anderes Thema)
- `scripts/factory/verify-decommission.sh` — Verifikation (anderes Thema)
