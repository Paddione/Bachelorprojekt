# Netzwerk-Adressplan

<!-- GENERIERT aus docs/agent-guide/registry/networks.yaml — nicht von Hand editieren.
     Neu erzeugen: task networks:map · Prüfen: task networks:check -->

Jeder IP-Bereich des Projekts, nach Adresse sortiert. Eine Überschneidung ist
nicht verboten, aber erklärungspflichtig: der Guard verlangt, dass beide
beteiligten Bereiche einander nennen, mit Grund und Absicherung.

| Bereich | Eigentümer | Zweck | Status | Konfiguriert in |
|---|---|---|---|---|
| `10.0.0.0/8` | Haushalt (FritzBox 10.0.0.1) | Heimnetz — Arbeitsplätze, Laptops, Proxmox-Hosts, IoT | active | FritzBox-DHCP (nicht im Repo konfiguriert) |
| `10.13.14.0/24` | korczewski (abgebaut) | WireGuard-Mesh des ehemaligen korczewski-Standalone-Clusters | retired | wireguard/wg-mesh-nodes.yaml (Sektion korczewski) |
| `10.20.0.0/24` | fleet-Cluster | WireGuard-Overlay wg-fleet; zugleich die InternalIP der Kubernetes-Knoten (10.20.0.1 bis 10.20.0.6) und die Adresse des terminal-sidekick (10.20.0.10) | active | wireguard/wg-mesh-nodes.yaml (Sektion fleet) |
| `10.42.0.0/16` | fleet-Cluster | Pod-Netz; k3s vergibt daraus je Knoten ein /24 | active | .spec.podCIDR der Knoten (k3s-Default) |
| `10.42.0.0/16` | k3d-mentolder-dev (lokaler Entwicklungscluster) | Pod-Netz des lokalen k3d-Clusters | active | .spec.podCIDR der k3d-Knoten (k3s-Default) |
| `10.43.0.0/16` | fleet-Cluster | Service-Netz (ClusterIP), kubernetes.default auf 10.43.0.1 | active | k3s-Default |
| `10.43.0.0/16` | k3d-mentolder-dev (lokaler Entwicklungscluster) | Service-Netz des lokalen k3d-Clusters | active | k3s-Default |
| `100.64.0.0/10` | Tailnet (p.korczewski) | NAT-durchdringendes Overlay; trägt derzeit pk-desktop (100.102.71.114) und pk-hetzner-8 (100.118.49.94) | active | Tailscale-Dienst auf den Geräten |
| `172.17.0.0/16` | Docker (Entwicklungsrechner) | Default-Bridge | active | Docker-Daemon |
| `172.18.0.0/16` | Docker (Entwicklungsrechner) | Netz factory-sandbox-egress der Software-Factory | active | Docker-Daemon |
| `172.23.0.0/16` | Docker (Entwicklungsrechner) | Netz des k3d-Clusters k3d-mentolder-dev | active | Docker-Daemon (k3d) |
| `192.168.100.0/24` | mentolder | WireGuard-Mesh; GPU-Host auf .10, Laptops auf .11 und .12, Hetzner-Knoten auf .33 bis .35 | active | wireguard/wg-mesh-nodes.yaml (Sektion mentolder) |
| `192.168.100.0/24` | Hetzner Cloud | Privates Netz der Server pk-hetzner-4 (.5), pk-hetzner-6 (.6), pk-hetzner-8 (.8) | active | Hetzner-Cloud-Konsole (nicht im Repo konfiguriert) |

## Erklärte Überschneidungen

| Bereich | überschneidet | Grund | Absicherung |
|---|---|---|---|
| `home-lan` | `korczewski-mesh` | Das /8 umfasst 10.13.14.0/24 vollständig. | Der zugehörige Cluster ist abgebaut, der Bereich steht auf retired — es fließt kein Verkehr, der falsch geroutet werden könnte. |
| `home-lan` | `fleet-overlay` | Das /8 umfasst 10.20.0.0/24 vollständig. | Der WireGuard-Adapter trägt /32-Routen je Peer; Longest-Prefix schlägt die /8-Link-Route des LAN. |
| `home-lan` | `pod-cidr-fleet` | Das /8 umfasst 10.42.0.0/16 vollständig. | Pro erreichbarem Knoten wird dessen podCIDR als /24 über den Tunnel geroutet. Fehlt eine dieser Routen, läuft der Verkehr still ins LAN — die Fehlerklasse aus T002491. |
| `home-lan` | `pod-cidr-k3d-dev` | Das /8 umfasst 10.42.0.0/16 vollständig. | Der lokale k3d-Cluster ist über die Docker-Bridge erreichbar, nicht über eine 10.42-Route auf dem Host. |
| `home-lan` | `service-cidr-fleet` | Das /8 umfasst 10.43.0.0/16 vollständig. | Service-Adressen werden nie vom Host aus adressiert, nur clusterintern über kube-proxy. |
| `home-lan` | `service-cidr-k3d-dev` | Das /8 umfasst 10.43.0.0/16 vollständig. | Wie beim fleet-Service-Netz: clusterintern, nie vom Host adressiert. |
| `korczewski-mesh` | `home-lan` | Liegt vollständig im /8 des Heimnetzes. | Außer Dienst — es fließt kein Verkehr. |
| `fleet-overlay` | `home-lan` | Liegt vollständig im /8 des Heimnetzes. | /32-Routen je Peer schlagen die /8-Link-Route per Longest-Prefix. |
| `pod-cidr-fleet` | `home-lan` | Liegt vollständig im /8 des Heimnetzes. | Je erreichbarem Knoten eine explizite /24-Route über den Tunnel. |
| `pod-cidr-fleet` | `pod-cidr-k3d-dev` | Identischer Bereich — k3s benutzt in beiden Clustern denselben Default, fleet vergibt daraus 10.42.0.0/24 bis 10.42.6.0/24, der lokale Dev-Cluster 10.42.0.0/24 und 10.42.1.0/24. | Die beiden Cluster sind auf dem Entwicklungsrechner nicht gleichzeitig über 10.42er Routen erreichbar. Deshalb lassen sich die Pod-CIDRs der fleet-Control-Plane dort NICHT als Route nachtragen — sie kollidierten mit dem lokalen Cluster. Wer Pods der CP-Knoten vom Host aus erreichen muss, geht über kubectl port-forward statt über eine Route. |
| `pod-cidr-k3d-dev` | `home-lan` | Liegt vollständig im /8 des Heimnetzes. | Erreichbarkeit läuft über die Docker-Bridge, nicht über Host-Routen. |
| `pod-cidr-k3d-dev` | `pod-cidr-fleet` | Identischer Bereich, derselbe k3s-Default in beiden Clustern. | Siehe pod-cidr-fleet — auf dem Entwicklungsrechner ist immer nur einer der beiden Bereiche routbar. |
| `service-cidr-fleet` | `home-lan` | Liegt vollständig im /8 des Heimnetzes. | Clusterintern über kube-proxy, nie vom Host adressiert. |
| `service-cidr-fleet` | `service-cidr-k3d-dev` | Identischer Bereich, derselbe k3s-Default in beiden Clustern. | Clusterintern, keine Host-Route in beiden Fällen. |
| `service-cidr-k3d-dev` | `home-lan` | Liegt vollständig im /8 des Heimnetzes. | Clusterintern über kube-proxy, nie vom Host adressiert. |
| `service-cidr-k3d-dev` | `service-cidr-fleet` | Identischer Bereich, derselbe k3s-Default in beiden Clustern. | Clusterintern, keine Host-Route in beiden Fällen. |
| `mentolder-mesh` | `hetzner-private` | Derselbe Bereich wird von Hetzner als privates Netz derselben Server vergeben — pk-hetzner-4/6/8 tragen dort .5, .6 und .8, während die Registry ihnen .33, .34 und .35 zuweist. | Auf den Hetzner-Knoten darf keine Route für 192.168.100.0/24 als Ganzes gesetzt werden; die Peers stehen mit /32-AllowedIPs in der WireGuard-Konfiguration. Eine Umnummerierung ist der saubere Ausweg und bewusst als eigener Vorgang zurückgestellt. |
| `hetzner-private` | `mentolder-mesh` | Identischer Bereich auf denselben Maschinen. | Siehe mentolder-mesh — /32-AllowedIPs statt einer /24-Route. |

## Anmerkungen

- **`home-lan`** — Das /8 ist ungewöhnlich weit und der Grund für die meisten Einträge unter overlaps. Beobachtete Hosts liegen in 10.0.0.x, 10.1.0.x und 10.10.0.x — ein engeres Präfix würde eine Neuvergabe im gesamten Haushalt bedeuten und ist bewusst zurückgestellt (Operator-Entscheidung 2026-08-19).
- **`korczewski-mesh`** — Der Cluster wurde mit PR #1189 abgebaut; die Marke läuft seither auf fleet im Namespace workspace-korczewski. Der Eintrag bleibt stehen, damit eine Neuvergabe dieses Bereichs als Kollision auffällt.
- **`fleet-overlay`** — Die Präfixlänge ist /24, belegt am lebenden Cluster. openspec/specs/ rustdesk-server.md nannte bis T012645 fälschlich /16 — in einer ufw-Freigabe hätte das 255-mal mehr Adressen geöffnet als beabsichtigt.
- **`tailscale`** — Der einzige Bereich, der ohne eigenes Zutun kollisionsfrei bleibt — Tailscale benutzt den für Carrier-Grade-NAT reservierten Block, den sonst niemand vergibt.
- **`mentolder-mesh`** — Auf dem WSL-Entwicklungsrechner trägt .10 zweimal auf: einmal auf wg0 in WSL und einmal auf dem gespiegelten Windows-Adapter wg-gpu (WSL läuft in networkingMode = mirrored, Windows-Adapter erscheinen dort als eth*). Das ist eine Doppelvergabe innerhalb desselben Bereichs, keine Überschneidung zweier Bereiche, und deshalb nicht unter overlaps abgebildet.
- **`hetzner-private`** — Bis T012645 war dieser Bereich im Repo überhaupt nicht bekannt. Genau das ist der Grund für diese Registry: ein Netz, das niemand deklariert hat, kann mit keinem Prüflauf kollidieren.
