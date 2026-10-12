---
title: "p1-impl — hostNetwork statt ServiceLB"
ticket_id: T016520
domains: [infra, scripts]
status: draft
---

# lan-dns-hostnetwork — Implementation Plan

Partial-Plan `p1-impl` fuer T016520.

## Task 1 — Manifeste

1. `Deployment` + PDB durch `DaemonSet adguard` ersetzen: `hostNetwork: true`,
   `nodeSelector: {lan-dns: "true"}`, `dnsPolicy: None` wie bisher,
   `updateStrategy` RollingUpdate maxUnavailable 1, keine `ports` mit hostPort.
2. initContainer: `env HOST_IP` aus `status.hostIP`; Befehl kopiert die
   ConfigMap und ersetzt den Platzhalter `__HOST_IP__` per `sed`.
3. `AdGuardHome.yaml`: `dns.bind_hosts: [__HOST_IP__]`; UI bleibt
   `127.0.0.1:3000` (auf hostNetwork der localhost des Nodes; Kommentar).
4. `adguard-dns`: `type: ClusterIP`, Tailscale-Annotationen unveraendert.

## Task 2 — Inventar und Deploy-Skript

1. Inventarfeld `lan_dns: true` bei gpu-cluster und gpu-cluster2, im
   Kopfkommentar dokumentieren.
2. `scripts/devmesh/lan-dns-deploy.sh`: Schritte mit Praefix-Ausgabe
   `pre-check:` (getent auf jedem k3s-Host per SSH), `firewall:`
   (lan-dns-firewall.sh), `label:` (`lan-dns=true` fuer lan_dns-Hosts,
   `lan-dns-` fuer alle anderen), `apply:`, `rollout:` (DaemonSet),
   `post-check:` (getent auf jedem Host plus `dig @<lan_ip>` je lan_dns-Host).
   Scheitert der Post-Check: `rollback:` = `kubectl delete -k dev-local/lan-dns`,
   erneute Node-DNS-Pruefung, Exit 1. `DRY_RUN=1` gibt nur die Schritte aus.
3. Taskfile: `dns:deploy` ruft das Skript; `dns:check` fragt die `lan_dns`-Hosts.

## Task 3 — Runbook

Aufbau-Skizze und Abschnitte 1, 2, 6 auf hostNetwork/DaemonSet anpassen;
Vorfall T016520 als Warnung: kein LoadBalancer/NodePort auf Port 53.

Akzeptanzkriterien:

- `kubectl kustomize dev-local/lan-dns` rendert; `--check-config` des Images
  akzeptiert die Konfiguration nach Platzhalter-Ersetzung.
