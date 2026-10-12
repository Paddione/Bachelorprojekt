---
title: fleet auf gekko-hetzner neu ausrollen, ohne WireGuard
ticket_id: T016529
domains: [fleet, infrastructure, networking]
status: staged
---

# fleet-gekko-ohne-wg — Implementation Plan

Ein sequenzieller Plan (partials=1): alle Schritte wirken auf denselben
Cluster und sind durch die Operator-Gates G1 bis G4 in design.md
serialisiert. Spec: `.agents/plans/fleet-gekko-ohne-wg/design.md` mit den
Entscheidungen D1 bis D3, Q16, dem Monitoring-Entscheid (kube-prometheus
ohne Loki) und den Risiken R1 bis R4.

## File Structure

| Datei | Aenderung |
|---|---|
| `tests/py/spec/native_ported/spec/fleet-operations/test_fleet_no_wireguard.py` | Neuer Guard: keine wg-fleet-/10.20.0.x-Referenzen in prod, prod-fleet, cloud-init und scripts (RED zuerst) |
| `tests/py/spec/native_ported/spec/fleet-operations/test_wg_mesh_sync.py` | Entfaellt mit dem WG-Abbau (Task 10) |
| `docs/runbooks/fleet-gekko-relaunch.md` | Neues Runbook: Backup-, Bootstrap-, Migrations- und Cutover-Checklisten mit Gates G1 bis G4 |
| `docs/runbooks/ssh-zugang-fleet.md` | Auf Tailscale-Adminzugriff aktualisieren |
| `prod/cloud-init.yaml` | WG-Abschnitte entfernen, Server-Bootstrap fuer gekko (privates Netz, Tailscale) |
| `prod/cloud-init-join-cp.yaml` | Join fuer gekko-Server 2/3 ohne WG |
| `prod/cloud-init-worker.yaml` | Auf neuen fleet-Kontext pruefen und WG-Abschnitte entfernen |
| `scripts/hetzner/cloud-init-server.yaml.tmpl` | Node-IP aus privatem Netz, Flannel ueber privates Interface, tls-san Tailnet |
| `scripts/hetzner/cloud-init.yaml.tmpl` | Wie Server-Template, Worker-/Agent-Rolle bereinigen |
| `scripts/hetzner/render-cloud-init.sh` | Rendering fuer gekko-Nodes ohne WG-Parameter |
| `scripts/hetzner/generate-wg-conf.sh` | Entfaellt mit dem WG-Abbau (Task 10) |
| `scripts/wg-mesh-sync.sh` | Entfaellt mit dem WG-Abbau (Task 10) |
| `wireguard/wg-mesh-nodes.yaml` | Entfaellt mit dem WG-Abbau (Task 10), wie das ganze wireguard-Verzeichnis |
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

## Task 1 — RED-Guard: fleet ohne WireGuard

- Step: Neuen Test `tests/py/spec/native_ported/spec/fleet-operations/test_fleet_no_wireguard.py` schreiben. Er durchsucht prod, prod-fleet, die cloud-init-Dateien und scripts nach den Mustern wg-fleet, der alten WG-Adressierung und WG_MESH-Secret-Namen und schlaegt bei Treffern fehl.
- Step: `python3 -m pytest tests/py/spec/native_ported/spec/fleet-operations/test_fleet_no_wireguard.py -q` — expected: FAIL, weil der WG-Mesh heute noch in cloud-init, scripts und wireguard/ referenziert ist.
- Acceptance: Test ist rot aus dem richtigen Grund (Trefferliste benennt die Alt-Referenzen) und wird erst in Task 10 gruen.

## Task 2 — Inventar und Backup-Gate G1

- Step: Runbook `docs/runbooks/fleet-gekko-relaunch.md` mit Checklisten fuer G1 bis G4 anlegen.
- Step: etcd-Snapshot des alten Clusters ziehen; DB-Dumps (shared-db, Nextcloud, Pocket ID, Vaultwarden, Videovault, Brain) und alle Prod-Volumes sichern; die 3 local-path-PVCs auf gekko-hetzner-3/4 vorher separat sichern.
- Step: Restore-Probe mindestens fuer shared-db und ein Volume durchfuehren und im Runbook protokollieren.
- Acceptance: Gate G1 — Operator bestaetigt verifizierte Backups per Ticket-Kommentar auf T016529. Ohne G1 kein Task 4.

## Task 3 — Manifeste haerten (R3)

- Step: In prod und prod-fleet alle festen Node-Namen (pk-hetzner-8 fuer local-path/smb), alten WG-IPs und Longhorn-StorageClass-Referenzen fuer den Prod-Umfang entfernen oder auf local-path umstellen.
- Step: Flux-Ziel auf nur Prod-Kustomizations begrenzen; staging-, dev- und korczewski-Namespaces aus dem fleet-Pfad nehmen (Ziel devmesh, Q16).
- Acceptance: `grep -rn "pk-hetzner" prod/ prod-fleet/` liefert fuer den Prod-Umfang keine Treffer mehr; `kubectl kustomize` der Prod-Kustomization baut fehlerfrei.

## Task 4 — gekko aus altem fleet loesen

- Step: gekko-hetzner-2/3/4 drainen, Pods ziehen auf die pk-Server um; danach Nodes aus dem alten Cluster loeschen, k3s-Agent deinstallieren, wg-fleet auf diesen Nodes abbauen.
- Acceptance: Alter Cluster betreibt Prod allein auf den pk-Servern; gekko-Nodes sind leer und ohne k3s.

## Task 5 — Neuen Cluster aufsetzen

- Step: cloud-init-Templates in scripts/hetzner und prod auf Server-Rolle fuer gekko umstellen: node-ip aus dem privaten Netz, Flannel ueber das private Interface, Tailscale mit eigenem fleet-Tag, tls-san mit Tailnet-Namen und -IPs, Key-Ablauf aus. Das Rendering laeuft ueber `scripts/hetzner/render-cloud-init.sh` ohne WG-Parameter.
- Step: k3s server mit cluster-init auf gekko-hetzner-2 installieren, gekko-hetzner-3/4 als Server joinen (embedded etcd), Kubeconfig-Kontext fleet-new anlegen.
- Acceptance: 3 Server etcd-gesund; `kubectl --context fleet-new get nodes` zeigt alle gekko-Nodes Ready mit privaten Node-IPs; oeffentlich nur 80/443 erreichbar.

## Task 6 — Plattform auf dem neuen Cluster

- Step: Sealed-Secrets-Controller mit dem vorhandenen fleet-Key ausrollen, cert-manager mit ipv64-Webhook, Flux nur fuer Prod-Kustomizations, Traefik.
- Step: Schlankes Monitoring in `prod/monitoring/`: kube-prometheus ohne Loki, kurze Retention, Ressourcenlimits auf das gekko-RAM-Budget (R1) zuschneiden.
- Acceptance: Zertifikate werden auf dem neuen Cluster ausgestellt; Monitoring laeuft; Namespace-Liste enthaelt nur Prod plus Plattform.

## Task 7 — Daten migrieren

- Step: DB-Dumps aus Task 2 einspielen, Volumes per rsync ueber Tailscale oder Restore kopieren.
- Step: Nicht-Prod-Namespaces (staging, dev, korczewski, website-staging, website-korczewski) nach devmesh ueberfuehren.
- Acceptance: Prod-Dienste auf dem neuen Cluster mit echten Daten erreichbar (intern); kein Nicht-Prod-Namespace auf dem neuen fleet.

## Task 8 — Abnahme vor dem Umschalten (Gate G2)

- Step: Per resolve-/hosts-Eintrag gegen die gekko-IPs testen: Website, Nextcloud, Pocket ID, Vaultwarden, Zertifikatsgueltigkeit.
- Acceptance: Gate G2 — Operator bestaetigt die Abnahme per Ticket-Kommentar. DNS-TTL vorher senken.

## Task 9 — DNS-Cutover (Gate G3)

- Step: Erst nach ausdrucklicher Operator-Freigabe (Gate G3) die vier A-Records bei ipv64 auf die gekko-IPs umschalten.
- Acceptance: Prod-Domains loesen auf die gekko-IPs auf; Dienste extern gruen; alter Cluster bleibt als Rueckfall bis Task 10 bereit.

## Task 10 — Abbau und WireGuard-Cleanup

- Step: Erst nach Beobachtungsfenster und Operator-Freigabe (Gate G4) die pk-hetzner-Server bei Hetzner loeschen.
- Step: wireguard-Verzeichnis, `scripts/wg-mesh-sync.sh`, `scripts/hetzner/generate-wg-conf.sh`, WG-Abschnitte in cloud-init und Sealed Secrets mit WG_MESH-Bezug entfernen; `tests/py/spec/native_ported/spec/fleet-operations/test_wg_mesh_sync.py` loeschen.
- Step: `docs/adr/ADR-014-fleet-gekko-ohne-wireguard.md` schreiben, in ADR-001 den Superseded-Vermerk setzen, `docs/runbooks/ssh-zugang-fleet.md` auf Tailscale aktualisieren. Das k3s-interne flannel-wg in devmesh bleibt unberuehrt.
- Acceptance: `python3 -m pytest tests/py/spec/native_ported/spec/fleet-operations/test_fleet_no_wireguard.py -q` ist gruen; kein WG_VPN-Bezug mehr in prod, prod-fleet und scripts ausserhalb von devmesh.

## Task 11 — Verifikation

- Step: `task test:changed` ausfuehren und Ergebnis festhalten.
- Step: `task freshness:regenerate` ausfuehren.
- Step: `task freshness:check` ausfuehren.
- Acceptance: Alle drei Kommandos gruen; neuer Guard aus Task 1 gruen; Ticket-Kommentar auf T016529 mit Cutover- und Abbau-Evidenz (G1 bis G4).
