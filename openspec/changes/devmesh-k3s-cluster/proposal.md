# Proposal: devmesh-k3s-cluster

## Why

ADR-008 verlangt einen lokalen Mehrknoten-Cluster für den Dev-Stack. Vier Ubuntu-Hosts mit je
4 Kernen und 16 GB RAM stehen im Heimnetz bereit; drei davon sind frisch, der vierte
(`ws-ubuntu-1`) trägt bis SP-5 noch `k3d-mentolder-dev`. Es gibt heute kein Skript, das
einen solchen Cluster reproduzierbar aufsetzt — der devc-HA-Cluster aus #1244 wurde nie
gebaut, `taskfiles/Taskfile.devcluster.yml` ist stillgelegt.

_Ticket: T900117_ · Programm: T900115 (ADR-008) · blocked_by: T900116 (SP-1) · Nachfolger: T900118 (SP-3)

## What Changes

1. **Topologie:** `gpu-metal` (10.1.0.101) initialisiert den Cluster mit embedded etcd,
   `gpu-cluster` (10.10.10.2) und `gpu-cluster2` (10.10.10.3) treten als weitere Server bei.
   Drei Server bilden das etcd-Quorum; ein Knoten darf ausfallen.
2. **Netz:** `--node-ip` ist die LAN-Adresse, `--flannel-backend=wireguard-native`
   verschlüsselt Pod-Traffic zwischen den Knoten. `--tls-san` enthält LAN-Adressen und
   Tailnet-Namen aller drei Server.
3. **Installationsskript `scripts/devmesh/k3s-install.sh`** mit den Rollen `server-init`,
   `server-join`, `agent`; idempotent; k3s-Version gepinnt in `devmesh/inventory.yaml`.
4. **Preflight `scripts/devmesh/preflight.sh`** pro Host vor der Installation: RAM ≥ 15 GiB,
   Swap aus, Zeitsynchronisation aktiv, freie Ports (6443, 2379–2380, 10250, 51820/udp,
   80, 443), belegte Ports mit Prozessname (bekannt: `gpupod.service` auf :8080 bei
   `gpu-metal`), Plattentyp der etcd-Partition (`lsblk -d -o NAME,ROTA`), Erreichbarkeit
   der anderen Server auf 6443/2379.
5. **Storage:** k3s-Default `local-path`; `gpu-cluster2` bekommt das Label `storage=true`
   (937 G + 954 G Disks).
6. **etcd-Snapshots:** `--etcd-snapshot-schedule-cron='0 */6 * * *'`,
   `--etcd-snapshot-retention=20`.
7. **Kubeconfig-Context `devmesh`:** `task devmesh:kubeconfig` holt die Admin-Kubeconfig von
   `gpu-metal`, setzt den Server auf dessen Tailnet-Namen und merged sie als Context
   `devmesh`. `task devmesh:status` meldet Knoten, etcd-Mitglieder und den jüngsten Snapshot.
8. **Firewall (ufw):** k3s-Ports nur aus `10.0.0.0/8`; 22, 443, 6443 zusätzlich aus
   `100.64.0.0/10` (Tailnet).
9. **Inventar:** `devmesh/inventory.yaml` bekommt pro Server `k3s_role` und `labels`.

## Non-Goals

- Workloads, Ingress-Routen, Zertifikate (SP-3).
- Der WSL-GPU-Host wird kein Knoten; GPU-Inferenz bleibt nativ (ADR-008-Nachtrag).
- Longhorn oder andere replizierte Storage-Systeme.
- Beitritt von `ws-ubuntu-1` (SP-5, nach dem k3d-Abbau).
- Flux auf devmesh.

## Impact

- Specs: `local-dev-mesh` (ADDED)
- Dateien: `scripts/devmesh/k3s-install.sh`, `scripts/devmesh/preflight.sh`,
  `taskfiles/Taskfile.devmesh.yml` (neu, eingebunden in `Taskfile.yml`),
  `devmesh/inventory.yaml`, `tests/spec/local-dev-mesh/`
- Operator-Schritte: SSH-Zugang zu den drei Hosts aus WSL. `ssh gpu@<host>` endet in der
  PK-Desktop-Distro `k3d-dev` mit `Permission denied (publickey,password)` (gemessen 2026-09-11);
  der Key für `gpu@` muss dort bereitgestellt werden.
