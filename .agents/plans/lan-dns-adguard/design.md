---
title: "lan-dns-adguard — Design"
ticket_id: T016515
status: approved
---

# Ausfallsicheres LAN-DNS in devmesh

## Ziel

AdGuard Home laeuft redundant in devmesh und wird Upstream-DNS der Fritzbox.
Faellt devmesh aus, beantwortet 9.9.9.9 die Anfragen. Kein Geraet im LAN
verliert dadurch Adressvergabe oder Namensaufloesung.

## Entscheidungen (mit Operator abgestimmt, 2026-10-12)

| # | Entscheidung |
|---|---|
| D1 | AdGuard Home `v0.107.79` als eigene Komponente `dev-local/lan-dns/`, Namespace `lan-dns`, 2 Replicas mit Pod-Anti-Affinity (hostname, required), PDB minAvailable 1. Service `LoadBalancer` UDP+TCP 53 ueber die vorhandene k3s-ServiceLB, kein MetalLB. |
| D2 | Fritzbox-Upstream: bevorzugt `10.10.10.2`, alternativ `9.9.9.9`. Umstellung ist ein Operator-Schritt aus dem Runbook. |
| D3 | Reihenfolge: deployen, von LAN-Client gegen 10.10.10.2 und 10.10.10.3 pruefen, eine Replica loeschen und erneut pruefen, erst dann Fritzbox umstellen. Rueckweg: Fritzbox auf Anbieter-DNS. |
| D4 | DHCP bleibt auf der Fritzbox. Pi-AdGuard (10.0.0.2) bleibt bis zum erfolgreichen Cutover, danach tritt der Pi als Worker bei (eigenes Ticket). |
| D5 | AdGuard wird zusaetzlich Tailnet-Resolver: der Tailscale-Operator in devmesh exponiert `adguard-dns` als Tailnet-Geraet `lan-dns` (Tag `tag:lan-dns`). In der Tailscale-Admin-Konsole: globale Nameserver `lan-dns` (100.x) zuerst, `9.9.9.9` als zweiter. Ersetzt den Pi (`dns`, 100.79.93.76), heute einziger Tailnet-Resolver. |
| D6 | Split-DNS: `fritz.box` und `home` loest AdGuard selbst ueber die Fritzbox (10.0.0.1) auf. Die Tailnet-Split-Routen auf 10.0.0.2 entfallen, weil alle Anfragen ohnehin bei AdGuard landen. |
| D7 | Subnet-Route `10.0.0.0/24` redundant: gpu-cluster und gpu-cluster2 geben sie zusaetzlich frei (Inventarfeld `subnet_routes`), `autoApprovers` in `devmesh/tailnet-policy.hujson`. Tailscale schaltet zwischen mehreren Routern derselben Route automatisch um. Der Pi bleibt Router bis zu seinem Abbau. |

## Ausgangslage (gemessen 2026-10-12)

Der Pi `raspberrypi` (10.0.0.2, Tailnet `dns`) ist (a) einziger globaler
Tailnet-Resolver (`tailscale dns status` auf pk-desktop: Resolvers
100.79.93.76), (b) Ziel der Split-Routen `fritz.box` und `home`, (c)
Subnet-Router fuer `10.0.0.0/24` (`tailscale status --self --json`:
PrimaryRoutes). Faellt er aus, loesen Tailnet-Geraete nichts mehr auf; so
erklaert sich der beobachtete Ausfall der Coding-Agents. Der LLM-Proxy liegt
nicht auf dem Pi, sondern in devmesh (`llm-services`, :18235).
Die alte AdGuard-Konfiguration wird nicht uebernommen (Operator: keine
nennenswerten Anpassungen), die neue ist vollstaendig in Git.

## Abgeleitete Festlegungen

- **Eigener Lebenszyklus:** nicht Teil von `devmesh:deploy` (App-Stack in
  `workspace`), sondern `task devmesh:dns:deploy` und `task devmesh:dns:check`.
  Ein Neuaufbau des App-Stacks beruehrt das LAN-DNS nicht.
- **Keine DNS-Schleife:** Fritzbox fragt AdGuard, AdGuard darf nicht ueber die
  Fritzbox aufloesen. Upstreams und Bootstrap nur als IP-Literal
  (`tls://9.9.9.9`, `tls://149.112.112.112`, `https://1.1.1.1/dns-query`),
  Pod mit `dnsPolicy: None` und `nameservers: [9.9.9.9, 1.1.1.1]`.
- **Deklarative Konfiguration:** `AdGuardHome.yaml` als ConfigMap, ein
  initContainer kopiert sie in ein emptyDir (AdGuard schreibt die Datei
  zurueck). Aenderungen in der Web-UI sind fluechtig, Quelle ist Git.
- **Web-UI nicht exponiert:** Port 3000 nur als ClusterIP, Zugriff per
  `kubectl port-forward`. Damit ist kein Admin-Secret noetig.
- **AdGuard-Konfiguration fuer unsere Nutzung:** `ratelimit: 0`, weil alle
  LAN-Anfragen von der Fritzbox (10.0.0.1) und alle Tailnet-Anfragen vom
  Operator-Proxy kommen, ein Limit pro Client wuerde also alle drosseln.
  DNSSEC an, Cache 4 MB mit `cache_optimistic` (abgelaufene Eintraege bei
  Upstream-Stoerung), `refuse_any`, kein EDNS-Client-Subnet. Filter: AdGuard DNS
  filter. Lokale Domains `fritz.box`, `home` und Reverse-Lookups fuer
  10.0.0.0/8 per Upstream-Regel an 10.0.0.1.
- **Firewall:** auf den devmesh-Nodes ist ufw aktiv (deny incoming/routed).
  Regel `from 10.0.0.0/8 to any port 53` (udp, tcp) wie bei 80/443 in
  `k3s-install.sh` fuer neue Nodes; fuer bestehende Nodes setzt
  `devmesh:dns:deploy` dieselbe Regel idempotent per SSH.
- **Ausfallverhalten Fritzbox:** dass die Fritzbox 9.9.9.9 nur im Fehlerfall
  nutzt, ist nicht belegt. Der Runbook-Test stoppt AdGuard gezielt und prueft
  die Aufloesung ueber die Fritzbox.

## Risiken

- R4 Die Live-Tailnet-ACL weicht moeglicherweise vom Repo-Soll ab. Die neuen
  Regeln (`autogroup:member` -> `tag:lan-dns:53`, `autoApprovers`) spielt der
  Operator ein; vorher Live-ACL pruefen.

- R1 ServiceLB bindet hostPort 53 auf allen Nodes; systemd-resolved belegt nur
  127.0.0.53/54, kein Konflikt (gemessen auf gpu-cluster).
- R2 Ohne gemeinsamen Speicher hat jede Replica eigene Query-Logs und
  Statistiken. Akzeptiert.
- R3 IPv6-DNS der Fritzbox bleibt unveraendert, IPv6-Anfragen laufen
  ungefiltert. Im Runbook als optionaler Schritt.
