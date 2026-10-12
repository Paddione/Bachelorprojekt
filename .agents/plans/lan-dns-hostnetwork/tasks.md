---
title: "lan-dns-hostnetwork — Implementation Plan"
ticket_id: T016520
domains: [infra, scripts, testing]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: T016515
depends_on_plans: []
---

# lan-dns-hostnetwork — Implementation Plan

Fix fuer den Ausfall der Node-DNS beim ersten `devmesh:dns:deploy` (T016515).

_Ticket: T016520_

Root-Cause-Analyse (Symptom vs. Ursache getrennt): Symptom (Fakt,
2026-10-12 20:38-20:42 UTC): `getent hosts registry-1.docker.io` schlug auf
allen vier devmesh-Nodes fehl, Image-Pulls endeten mit `lookup ...: Try
again`; `dig @10.0.0.1` vom LAN funktionierte. Ursache (belegt): die
k3s-ServiceLB legt fuer `adguard-dns` (LoadBalancer, Port 53) hostPort-DNAT
an, die fuer jede lokale Zieladresse greift, also auch fuer den
systemd-resolved-Stub `127.0.0.53:53`. Beleg: nach `kubectl delete svc
adguard-dns` loesten alle Nodes sofort wieder auf.

Loesung: AdGuard als DaemonSet mit `hostNetwork` auf Nodes mit Label
`lan-dns=true` (Quelle: Inventarfeld `lan_dns`), Bind an die Node-LAN-IP
(initContainer setzt `status.hostIP`). `adguard-dns` wird ClusterIP (nur
Tailscale-Operator). Deploy-Skript prueft Node-DNS vor und nach dem Rollout und
nimmt bei Fehler alles zurueck.

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `dev-local/lan-dns/adguard.yaml` | 127 | n/a (YAML) |
| `dev-local/lan-dns/AdGuardHome.yaml` | 61 | n/a (YAML) |
| `devmesh/inventory.yaml` | 83 | n/a (YAML) |
| `scripts/devmesh/lan-dns-deploy.sh` | 0 (neu) | 800 |
| `taskfiles/Taskfile.devmesh.yml` | 176 | n/a (YAML) |
| `docs/runbooks/devmesh-lan-dns.md` | 152 | n/a (Doku) |
| `tests/py/spec/native_ported/spec/local-dev-mesh/test_lan_dns.py` | 185 | 615 |

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-impl.md | impl | `dev-local/lan-dns/adguard.yaml`, `dev-local/lan-dns/AdGuardHome.yaml`, `devmesh/inventory.yaml`, `scripts/devmesh/lan-dns-deploy.sh`, `taskfiles/Taskfile.devmesh.yml`, `docs/runbooks/devmesh-lan-dns.md` |  |
| p2 | tasks.d/p2-tests.md | tests | `tests/py/spec/native_ported/spec/local-dev-mesh/test_lan_dns.py` | p1 |

## Tasks

- [ ] **0. Rotphase (liegt vor):** `python3 -m pytest -q tests/py/spec/native_ported/spec/local-dev-mesh/test_lan_dns.py` -> expected: FAIL (5 failed, 5 passed).
- [ ] **1. Partial p1** (`tasks.d/p1-impl.md`): DaemonSet mit hostNetwork, ClusterIP-Service, Bind-Platzhalter, Inventarfeld `lan_dns`, Deploy-Skript mit Vor-/Nachpruefung und Rueckbau, Tasks, Runbook.
- [ ] **2. Partial p2** (`tasks.d/p2-tests.md`): Datei vollstaendig gruen, Task-Listen-Golden bei geaenderten Beschreibungen per `task test:evals:update`.
- [ ] **3. Live-Deploy** (Operator-Freigabe liegt vor): `task devmesh:dns:deploy`, danach `task devmesh:dns:check` und Node-DNS auf allen Hosts.
- [ ] **4. Finaler Verifikations-Task.** In dieser Reihenfolge:
  `task test:changed`, `task freshness:regenerate`, `task freshness:check`.
  Umwelt-Ausschluesse im Ausfuehrungsreport belegen.
