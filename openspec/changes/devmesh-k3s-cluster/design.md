# Design: devmesh-k3s-cluster

## Goals

- Reproduzierbarer HA-Cluster auf drei Bare-Metal-Servern, aufsetzbar mit einem Skript pro Host.
- Ein Knotenausfall stoppt den Cluster nicht.
- Fehlkonfigurationen (Ports, Swap, Platte) fallen vor der Installation auf, nicht danach.

## Non-Goals

- Workloads und Stack-Konfiguration (SP-3).
- GPU-Scheduling.
- Hochverfügbarer Storage.

## Inventar (gemessen 2026-09-10/11)

| Host | LAN | CPU | RAM | Disks | Rolle |
|---|---|---|---|---|---|
| gpu-metal | 10.1.0.101 | i7-6700K 4c/8t | 16 GB | 233 G `/` + 465 G + 931 G + 238 G | server-init |
| gpu-cluster | 10.10.10.2 | i5-6500T 4c | 16 GB | 233 G + 238 G | server-join |
| gpu-cluster2 | 10.10.10.3 | i5-6500T 4c | 16 GB | 937 G + 954 G | server-join, `storage=true` |
| ws-ubuntu-1 | 10.0.33.1 | 4c | 16 GB | 243 G | agent (SP-5) |

```bash
# gpu-*: ADR-008 Inventar-Belege (ssh gpu@<ip> hostnamectl; nproc; free -h; lsblk)
# ws-ubuntu-1: Kapazitaet des k3d-Nodes spiegelt den Host
kubectl --context k3d-mentolder-dev get node k3d-mentolder-dev-server-0 -o jsonpath='{.status.capacity}'
```

## Decisions

### D1 — Drei Server statt ein Server

Vom Operator gewählt (Brainstorming 2026-09-11). Kosten: etcd auf jedem Server (~0,5–1 GB
RAM, fsync-Last). Nutzen: Wartung und Ausfall eines Knotens ohne Stillstand. Der Preflight
misst den Plattentyp; liegt etcd auf einer rotierenden Platte, bricht er mit Exit 1 ab, weil
etcd-Latenzen dort Leader-Wechsel auslösen.

### D2 — LAN-Adressen für Knoten, Flannel wireguard-native

Die Hosts liegen in `10.1.0.0/24` und `10.10.10.0/24`, beide über Gateway `10.0.0.1` routbar.
Knoten-Traffic über das LAN vermeidet doppelte Kapselung und macht den Cluster unabhängig
vom Tailnet. `wireguard-native` verschlüsselt Pod-zu-Pod-Traffic trotzdem, weil das Heimnetz
auch andere Geräte trägt. Port 51820/udp auf den Servern kollidiert nicht mit dem `wg0` von
PK-Desktop, weil PK-Desktop kein Knoten ist.

### D3 — API-Endpunkt über den Tailnet-Namen von gpu-metal

Ein LAN-VIP (kube-vip, Vorarbeit `k3d/dev-cluster/`) wäre unterwegs nicht erreichbar. Der
Tailnet-Name funktioniert zu Hause (direkter Pfad) und unterwegs. Fällt `gpu-metal` aus,
schaltet `task devmesh:kubeconfig SERVER=<name>` den Context auf einen anderen Server um.
Damit das Zertifikat passt, stehen alle drei Tailnet-Namen und LAN-Adressen in `--tls-san`.

### D4 — local-path mit Label statt Longhorn

Longhorn kostet RAM und CPU auf jedem Knoten und repliziert über 1-GbE. Stateful Workloads
laufen stattdessen auf `gpu-cluster2` (größte Disks) über `nodeSelector: storage=true`;
Ausfallschutz kommt aus Backups (SP-3), nicht aus Replikation.

### D5 — Versionspin im Inventar

Die k3s-Version steht als `k3s_version` in `devmesh/inventory.yaml`. Das Skript installiert
genau diese Version; ein Upgrade ist eine Änderung dieser Zeile plus erneuter Lauf pro Host.

### D6 — Skript mit Rollen statt Cloud-Init

Die Hosts sind installiert und laufen; Cloud-Init-Templates (`scripts/hetzner/cloud-init*.tmpl`)
passen nur für Neuinstallationen. Das Skript läuft per SSH und ist idempotent: ein zweiter
Lauf auf einem fertigen Knoten ändert nichts und endet mit Exit 0.

## Risks

- **R1** Plattentyp unbekannt, bis der Preflight läuft. Ist eine etcd-Partition rotierend,
  muss die Datenplatte gewechselt oder `--etcd-arg` auf eine SSD zeigen.
- **R2** `gpupod.service` auf `gpu-metal` belegt :8080; k3s nutzt den Port nicht, Traefik
  nur 80/443. Der Preflight meldet ihn als bekannt, nicht als Fehler.
- **R3** 48 GB bis zum Beitritt von `ws-ubuntu-1` (SP-3 Profil `core`).
- **R4** Asymmetrische Subnetze: blockiert der Router Traffic zwischen `10.1.0.0/24` und
  `10.10.10.0/24` auf 2379/51820, scheitert der Join. Der Preflight prüft das vorher.

## Testing

- BATS `tests/spec/local-dev-mesh/k3s-install.bats`: Dry-Run-Modus (`DRY_RUN=1`) gibt für jede
  Rolle die erwarteten Flags aus (`--cluster-init` nur bei `server-init`, `--node-ip` gleich
  Inventar-`lan_ip`, `--flannel-backend=wireguard-native`).
- BATS `tests/spec/local-dev-mesh/preflight.bats` mit gestubbten `ss`, `lsblk`, `free`,
  `swapon`: belegter Port → Exit 1 mit Prozessname; rotierende etcd-Platte → Exit 1;
  fehlendes `ss` → Exit 2.
- Live-Abnahme: `task devmesh:status` meldet drei `Ready`-Knoten, drei etcd-Mitglieder und
  einen Snapshot jünger als 6 Stunden.
