---
title: "p1-manifests — AdGuard-Komponente lan-dns"
ticket_id: T016515
domains: [infra]
status: draft
---

# lan-dns-adguard — Implementation Plan

Partial-Plan `p1-manifests` fuer T016515. Zieldateien exklusiv unter
`dev-local/lan-dns/`.

## File Structure

| Datei | Ist | Budget |
| `dev-local/lan-dns/kustomization.yaml` | 0 | n/a |
| `dev-local/lan-dns/adguard.yaml` | 0 | n/a |
| `dev-local/lan-dns/AdGuardHome.yaml` | 0 | n/a |

## Task 1 — Kustomization

`namespace: lan-dns`; Ressourcen `adguard.yaml`; `configMapGenerator`
`adguard-config` aus `AdGuardHome.yaml` (Hash-Suffix an, damit
Config-Aenderungen einen Rollout ausloesen).

## Task 2 — adguard.yaml

1. `Namespace lan-dns`.
2. `Deployment adguard`: `replicas: 2`, Image `adguard/adguardhome:v0.107.79`,
   `podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution` auf
   `kubernetes.io/hostname`, `dnsPolicy: None` mit
   `dnsConfig.nameservers: [9.9.9.9, 1.1.1.1]`.
   initContainer (busybox, gepinnt) kopiert `/config-ro/AdGuardHome.yaml`
   nach `/opt/adguardhome/conf/`; `conf` und `work` sind emptyDir.
   Ports 53/UDP, 53/TCP, 3000/TCP. Readiness- und Liveness-Probe tcpSocket 53.
   Ressourcen: requests 50m/64Mi, limits 256Mi.
3. `PodDisruptionBudget adguard` mit `minAvailable: 1`.
4. `Service adguard-dns`: `type: LoadBalancer`, Ports 53/UDP und 53/TCP,
   `externalTrafficPolicy: Local` NICHT setzen (ServiceLB leitet von jedem
   Node an eine gesunde Replica weiter).
5. `Service adguard-ui`: `ClusterIP`, Port 3000. Kein Ingress.

## Task 3 — AdGuardHome.yaml

Minimalkonfiguration mit `schema_version` passend zu v0.107.79:
`http.address: 0.0.0.0:3000`, `users: []`, `dns.bind_hosts: [0.0.0.0]`,
`dns.port: 53`, `upstream_dns` und `bootstrap_dns` nur IP-Literale
(`tls://9.9.9.9`, `tls://149.112.112.112`, `https://1.1.1.1/dns-query`;
Bootstrap `9.9.9.10`, `1.1.1.1`), `upstream_mode: parallel`, Standard-Filterliste
AdGuard DNS filter. Lokale Namen (`fritz.box`, PTR fuer 10.0.0.0/8) per
`private_networks`/`local_ptr_upstreams` an `10.0.0.1`
(die Fritzbox kennt ihre DHCP-Namen; keine Schleife, weil die Fritzbox
lokale Namen selbst beantwortet).
Vor dem Commit Schemaversion gegen einen lokalen Lauf des Images pruefen
(`docker run --rm adguard/adguardhome:v0.107.79 --check-config -c ...`).

Akzeptanzkriterien:

- `kubectl kustomize dev-local/lan-dns` rendert ohne Fehler.
- Kein Upstream/Bootstrap enthaelt einen Hostnamen.
