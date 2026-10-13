# ADR-014: fleet auf gekko-hetzner neu ausrollen, ohne WireGuard

**Status:** Accepted  
**Datum:** 2026-10-13  
**Ticket:** T016529  
**Supersedes:** [ADR-001](ADR-001-fleet-konsolidierung.md) (hinsichtlich Node-Rollen und WireGuard-Mesh)

## Kontext

Der bisherige fleet-Cluster (ADR-001) lief verteilt über zwei Hetzner-Standorte (hel1-dc2 und nbg1-dc3) mit drei Control-Plane-Nodes (`pk-hetzner-4/6/8`) und drei Worker-Nodes (`gekko-hetzner-2/3/4`). Die Knotenkommunikation erfolgte über ein WireGuard-Mesh-VPN (`wg-fleet`, `10.20.0.0/16`), auf dem auch Flannel VXLAN aufsetzte.

Dieser Aufbau hatte gravierende Nachteile:
1. **Hohe Latenz & Ausfallanfälligkeit:** Cross-Datacenter-Traffic über WireGuard belastete die etcd-Synchronisation und Flannel.
2. **Betriebskomplexität:** Separates WireGuard-Schlüsselmanagement (`scripts/wg-mesh-sync.sh`, `scripts/hetzner/generate-wg-conf.sh`), Dead-Peer-Affinitäten und Fragilität bei Node-Reboots.
3. **Speicherdruck:** Longhorn-Replikation über das VPN verbrauchte signifikanten Arbeitsspeicher und Bandbreite auf den kleineren Gekko-Nodes.

## Entscheidungen

### D1: Privates Hetzner-Netzwerk und Tailscale statt WireGuard-Mesh
- k3s läuft auf den drei Gekko-Nodes (`gekko-hetzner-2/3/4`) mit `--node-ip 192.168.200.x` und Flannel über die private Schnittstelle `enp7s0` im selben Rechenzentrum (`nbg1-dc3`).
- Kein WireGuard-VPN (`wg-fleet`, toter Mesh `192.168.100.0/24`) mehr im Prod-Umfang.
- Admin- und Clusterzugriff (`kubectl`, SSH) erfolgt über Tailscale; k3s wird mit `--tls-san` für Tailnet-Hostnamen und -IPs konfiguriert.
- Öffentlich sind ausschließlich Port 80/443 (Traefik Ingress) sowie die STUN/TURN-Ports (3478/5349 für Coturn) freigegeben.

### D2: 3 Server mit embedded etcd
- Alle drei Gekko-Nodes agieren als k3s-Server mit embedded etcd (`cluster-init` auf Node 2, Join von Node 3 und 4).
- Die bisherigen Server `pk-hetzner-4/6/8` werden nach erfolgreicher Datenmigration, Abnahme und DNS-Cutover dekommissioniert und gelöscht.

### D3: Lokaler Speicher (local-path) statt Longhorn
- Kein Longhorn-Storage im neuen Cluster; alle PVCs nutzen die `local-path` StorageClass.
- Datensicherheit wird durch automatisierte, regelmäßige Dumps der shared PostgreSQL-Datenbank und Volume-Backups (z. B. Nextcloud, Vaultwarden, Brain) gewährleistet.

### Q16: Konsolidierter Scope (nur Prod-Workloads)
- fleet betreibt ausschließlich den Namespace `workspace` (Website, Cert-Manager, Sealed-Secrets, Flux, Traefik, Coturn) sowie ein schlankes Monitoring (kube-prometheus ohne Loki, kurze Retention).
- Nicht-Prod-Namespaces (`workspace-staging`, `workspace-dev`, `workspace-korczewski`) ziehen vollständig in den lokalen `devmesh`-Cluster um.

## Konsequenzen

### Positive Konsequenzen
- **Keine WireGuard-VPN-Schicht:** Vollständiger Entfall von `wireguard/`, `scripts/wg-mesh-sync.sh` und `scripts/hetzner/generate-wg-conf.sh`.
- **Hohe Performance:** Interner Traffic nutzt das native Hetzner-Gigabit-Privatnetzwerk ohne VPN-Overhead.
- **Ressourceneinsparung:** Geringerer RAM-Verbrauch durch Entfall von Longhorn und Loki auf den Gekko-Nodes (21 GiB Gesamt-RAM).
- **Geringere Angriffsfläche:** Kein offener SSH-Port auf öffentlichen IPs der Nodes.

### Negative Konsequenzen / Trade-offs
- Node-Ausfall führt bei `local-path` bis zur Wiederherstellung oder dem Restore aus Backup zum Stillstand der auf diesem Node gebundenen Daten. Robuste Backup-Verifikation ist essenziell.
