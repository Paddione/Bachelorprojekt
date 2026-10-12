---
title: "p2-tasks-firewall — Deploy-/Check-Tasks und ufw"
ticket_id: T016515
domains: [scripts, infra]
status: draft
---

# lan-dns-adguard — Implementation Plan

Partial-Plan `p2-tasks-firewall` fuer T016515.

## File Structure

| Datei | Ist | Budget |
| `taskfiles/Taskfile.devmesh.yml` | 142 | n/a |
| `scripts/devmesh/k3s-install.sh` | 156 | 644 |
| `scripts/devmesh/lan-dns-firewall.sh` | 0 | 800 |

## Task 1 — lan-dns-firewall.sh

Liest k3s-Hosts (`k3s_role` gesetzt) aus `devmesh/inventory.yaml`
(`DEVMESH_INVENTORY` ueberschreibbar), setzt per SSH (Muster
`k3s-install.sh`: `DEVMESH_SSH_USER`, `DEVMESH_SSH_KEY`, BatchMode) idempotent
`ufw allow from 10.0.0.0/8 to any port 53 proto udp|tcp comment 'lan-dns'`.
`DRY_RUN=1` gibt nur Host und Befehle aus. Exit 0 ok, 1 Host fehlgeschlagen
(Name im Output), 2 Vorbedingung fehlt.

## Task 2 — k3s-install.sh

Im UFW-Block fuer alle Rollen zwei Zeilen fuer Port 53 (udp, tcp) aus
10.0.0.0/8 mit Kommentar `lan-dns`, damit neue Nodes sie mitbringen.

## Task 3 — Taskfile.devmesh.yml

- `dns:deploy`: Precondition Context devmesh;
  `bash scripts/devmesh/lan-dns-firewall.sh`, dann
  `kubectl --context devmesh apply -k dev-local/lan-dns`,
  `rollout status deploy/adguard -n lan-dns --timeout=180s`.
- `dns:check`: fuer jede `lan_ip` der k3s-Server `dig +time=3 +tries=1
  @<ip> <testname>` und Ausgabe ok/FEHLT je IP; Exit 1, wenn eine IP nicht
  antwortet, 2 wenn `dig` fehlt. Testname per `NAME=` (Default `quad9.net`).
- Kopfkommentar um beide Tasks ergaenzen.

Akzeptanzkriterien:

- `DRY_RUN=1 bash scripts/devmesh/lan-dns-firewall.sh` listet alle k3s-Hosts
  mit beiden ufw-Befehlen und fuehrt kein SSH aus.
- `task --dry devmesh:dns:deploy` zeigt Firewall-Skript und `apply -k`.
