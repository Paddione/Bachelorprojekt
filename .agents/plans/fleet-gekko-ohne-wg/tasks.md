---
title: fleet auf gekko-hetzner neu ausrollen, ohne WireGuard
ticket_id: T016529
domains: [fleet, infrastructure, networking]
status: staged
---

# fleet-gekko-ohne-wg — Implementation Plan

Spec: `.agents/plans/fleet-gekko-ohne-wg/design.md` mit den Entscheidungen
D1 bis D3, Q16, dem Monitoring-Entscheid (kube-prometheus ohne Loki), den
Gates G1 bis G4 und den Risiken R1 bis R4. Die Ausfuehrung ist durch die
Operator-Gates serialisiert; die Partials bilden diese Reihenfolge ueber
depends_on ab.

## File Structure

| Datei | Aenderung |
|---|---|
| `tests/py/spec/native_ported/spec/fleet-operations/test_fleet_no_wireguard.py` | Neuer Guard: keine wg-fleet-/Alt-IP-Referenzen in prod, prod-fleet, cloud-init und scripts (RED zuerst) |
| `tests/py/spec/native_ported/spec/fleet-operations/test_wg_mesh_sync.py` | Entfaellt mit dem WG-Abbau (p4) |
| `docs/runbooks/fleet-gekko-relaunch.md` | Neues Runbook: Backup-, Bootstrap-, Migrations- und Cutover-Checklisten mit Gates G1 bis G4 |
| `docs/runbooks/ssh-zugang-fleet.md` | Auf Tailscale-Adminzugriff aktualisieren |
| `prod/cloud-init.yaml` | WG-Abschnitte entfernen, Server-Bootstrap fuer gekko (privates Netz, Tailscale) |
| `prod/cloud-init-join-cp.yaml` | Join fuer gekko-Server ohne WG |
| `prod/cloud-init-worker.yaml` | Auf neuen fleet-Kontext pruefen und WG-Abschnitte entfernen |
| `scripts/hetzner/cloud-init-server.yaml.tmpl` | Node-IP aus privatem Netz, Flannel ueber privates Interface, tls-san Tailnet |
| `scripts/hetzner/cloud-init.yaml.tmpl` | Agent-Rolle bereinigen, kein WG |
| `scripts/hetzner/render-cloud-init.sh` | Rendering fuer gekko-Nodes ohne WG-Parameter |
| `scripts/hetzner/generate-wg-conf.sh` | Entfaellt mit dem WG-Abbau (p4) |
| `scripts/wg-mesh-sync.sh` | Entfaellt mit dem WG-Abbau (p4) |
| `wireguard/wg-mesh-nodes.yaml` | Entfaellt mit dem WG-Abbau (p4), wie das ganze wireguard-Verzeichnis |
| `prod-fleet/mentolder/kustomization.yaml` | Nur Prod-Kustomization, feste Node-Namen und Longhorn-Referenzen entfernen |
| `prod/monitoring/kustomization.yaml` | Schlankes kube-prometheus ohne Loki, kurze Retention |
| `environments/fleet.yaml` | Neuer Cluster-Kontext und Node-Inventar gekko |
| `docs/adr/ADR-014-fleet-gekko-ohne-wireguard.md` | Neue ADR: kehrt die Node-Rollen aus ADR-001 um, dokumentiert D1 bis D3 |
| `docs/adr/ADR-001-fleet-konsolidierung.md` | Statusvermerk: Node-Rollen durch ADR-014 superseded |

`scripts/wg-mesh-sync.sh` hat Ist 371 bei Budget 429.
`scripts/hetzner/generate-wg-conf.sh` hat Ist 164 bei Budget 636.
`scripts/hetzner/render-cloud-init.sh` hat Ist 110 bei Budget 690.
`tests/py/spec/test_fleet_operations.py` hat Ist 769 bei Budget 31.
`tests/py/spec/native_ported/spec/fleet-operations/test_wg_mesh_sync.py` hat Ist 334 bei Budget 466.

Budget-Folge: `tests/py/spec/test_fleet_operations.py` darf nicht wachsen
(Budget 31). Der neue Guard liegt deshalb in einer eigenen Datei mit
Wachstumsreserve statt in der Bestanddatei; die WG-Altdateien werden
geloescht, nicht erweitert.

<!-- vitest: kein neuer Test noetig, weil keine Website-Lib-/API-Dateien beruehrt werden; Absicherung laeuft ueber den pytest-Guard. -->

## Partials

| id | file | role | target_files | depends_on |
|---|---|---|---|---|
| p1 | tasks.d/p1-cluster.md | impl | scripts/hetzner/cloud-init-server.yaml.tmpl, scripts/hetzner/cloud-init.yaml.tmpl, scripts/hetzner/render-cloud-init.sh, environments/fleet.yaml | p5 |
| p2 | tasks.d/p2-manifeste.md | impl | prod/cloud-init.yaml, prod/cloud-init-join-cp.yaml, prod/cloud-init-worker.yaml, prod-fleet/mentolder/kustomization.yaml, prod/monitoring/kustomization.yaml | p5 |
| p3 | tasks.d/p3-ops.md | impl | docs/runbooks/fleet-gekko-relaunch.md | p1, p2 |
| p4 | tasks.d/p4-cleanup.md | impl | wireguard/wg-mesh-nodes.yaml, scripts/wg-mesh-sync.sh, scripts/hetzner/generate-wg-conf.sh, tests/py/spec/native_ported/spec/fleet-operations/test_wg_mesh_sync.py, docs/adr/ADR-014-fleet-gekko-ohne-wireguard.md, docs/adr/ADR-001-fleet-konsolidierung.md, docs/runbooks/ssh-zugang-fleet.md | p3 |
| p5 | tasks.d/p5-tests.md | tests | tests/py/spec/native_ported/spec/fleet-operations/test_fleet_no_wireguard.py | |

p5 hat keine Abhaengigkeit und laeuft deshalb zuerst (RED-Guard);
gruen wird der Guard erst durch p4. Die Schlusspruefung steht im
Verify-Task unten.

## Task 11 — Verifikation

- Step: `task test:changed` ausfuehren und Ergebnis festhalten.
- Step: `task freshness:regenerate` ausfuehren.
- Step: `task freshness:check` ausfuehren.
- Acceptance: Alle drei Kommandos gruen; Guard aus p5 gruen; Ticket-Kommentar auf T016529 mit Cutover- und Abbau-Evidenz (G1 bis G4).
