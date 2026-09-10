# ADR-008: Lokales k3s-Dev-Mesh — revidiert ADR-007 (WSL-Exit)

**Status:** Proposed — Partially supersedes [ADR-007](ADR-007-wsl-exit-fleet-native.md)
(Teil **C** „Windows-native Dev" + die Nachträge „kein lokaler Cluster" /
„Docker Desktop deinstallieren"). Löst [openspec/specs/work-vm-shared-dev.md]
(../../openspec/specs/work-vm-shared-dev.md) (T900104, Proxmox-VM) ab.
**Datum:** 2026-09-10 · Ticket: T900115
**Entscheidungssession:** Brainstorming 2026-09-10 (dev-flow-plan Phase A)

## Kontext — warum die Umkehr

ADR-007 traf am 2026-08-24 zwei Entscheidungen: **A)** Fleet-native Factory und
**C)** Windows-native Dev (Repo auf NTFS, opencode nativ auf Windows, kein WSL,
kein lokaler Cluster). Nachträge 2026-09-03 (Docker Desktop deinstallieren) und
2026-09-10/T900107 (dev-pod-Bundle als reines Server-Bundle) schärften das nach.

Teil **C** hält der Praxis nicht stand:

1. **Das Repo ist von Windows aus ohne WSL nicht steuerbar.** Belegt in der
   Session vom 2026-09-10: das PowerShell-Tool expandiert `$var` vor der
   WSL-Übergabe (Loop-Variablen werden leer), `rm -rf` / `Remove-Item -Recurse`
   auf Repo-Pfaden wird vom Sicherheitsfilter blockiert, Heredocs im Bash-Tool
   brechen ab, `wsl --exec` scheitert an der Git-Bash-Pfadübersetzung. Die
   Agenten-Toolchain (dev-flow, Skills, Ticket-CLI, git-crypt-Mechanik) läuft
   verlässlich nur aus einem Linux-Userland.
2. **Der tragende ADR-007-Grund ist entfallen.** ADR-007 begründete den Exit mit
   „der WSL-Host verhungert — MemFree 122 MB; volle 64 GB RAM + 16 GB VRAM nur
   ohne WSL". Operator-Aussage 2026-09-10: WSL hungert nicht mehr. Damit fällt
   das Kapazitätsargument, das Teil C trug.
3. **Neue Hardware ist da.** Drei Bare-Metal-Ubuntu-24.04 im Heim-LAN, alle
   frisch (kein k3s, kein Docker):

   | Host | Netz | CPU | RAM | Disk `/` | GPU |
   |---|---|---|---|---|---|
   | `gpu-metal` | `10.1.0.101` | i7-6700K (4c/8t) | 16 GB | 233 G (+465 G +931 G +238 G) | GTX 970, 4 GB |
   | `gpu-cluster` | `10.10.10.2` | i5-6500T (4c) | 16 GB | 233 G (+238 G) | — |
   | `gpu-cluster2` | `10.10.10.3` | i5-6500T (4c) | 16 GB | 937 G (+954 G) | — |

   `gpu-cluster`/`gpu-cluster2` waren früher k3s-Nodes (Altnamen `k3w-*` noch im
   DHCP). Gesamt 12 Kerne / 48 GB. Die echte GPU-Kapazität sitzt weiterhin im
   **WSL-GPU-Host** (`192.168.100.10`, ~16 GB VRAM lt. ADR-007) — die GTX 970 ist
   für LLM zu klein.
4. **Keine Proxmox-VM nötig.** work-vm-shared-dev (T900104) hätte eine dedizierte
   Debian-VM auf dem Proxmox-Host `dev` provisioniert. Mit vorhandener Bare-Metal
   entfällt das; der Operator-Ausschluss „keine zweite Linux-Umgebung" aus
   ADR-007 bleibt gewahrt, weil WSL und die Bare-Metal ohnehin existieren.

## Was von ADR-007 bleibt

Unangetastet: **A)** Fleet-native Factory (`factory-runner` Deployment in
`workspace-dev`), fleet-native bge-embed/-rerank, tickets-DB of record = Fleet
`shared-db`, dev-pod-Bundle als Server-Bundle (T900107), die GPU-Pfade für
ComfyUI/Whisper Windows-nativ. Revidiert wird **ausschließlich** „interaktive
Entwicklung ist Windows-nativ" und „es gibt keinen lokalen Cluster".

## Entscheidung

| # | Punkt |
|---|---|
| 1 | **Lokaler k3s-Dev-Cluster** — `gpu-metal` als Server (Control-Plane + etcd), `gpu-cluster` + `gpu-cluster2` als Agents. Der **WSL-GPU-Host tritt als GPU-Worker bei** (Node-Label `gpu=true`, Taint für GPU-Workloads). Neuer kubeconfig-Context **`devmesh`**. |
| 2 | **Voller Dev-Stack lokal** — der `workspace-dev`-äquivalente Stack (Website, shared-db, Nextcloud, Pocket ID, Collabora, …) läuft auf `devmesh`. `dev.mentolder.de` / `workspace-dev` auf **fleet bleibt** als geteilte/öffentliche Referenz-Umgebung. |
| 3 | **WireGuard-Dev-Mesh** — erweitert das bestehende `192.168.100.0/24`-Mesh um die 3 Bare-Metal, den WSL-GPU-Host (`.10`, bereits drin) sowie PK-Tablet und PK-L-1 (gekko). LAN-Peers (Bare-Metal) direkt, mobile Peers als Roaming-Clients. Überbrückt beide Subnetze (`10.1.0.x` / `10.10.10.x`, beide Gateway `10.0.0.1`, flach routbar). |
| 4 | **Repo pro Maschine** — jede Maschine hält einen eigenen, einmalig git-crypt-entsperrten Clone. **Kein** Shared-Clone wie in T900104 (pro Mensch genau eine physische Maschine). gekko wird auf PK-L-1 mit WSL + Clone + git-crypt-Key + `gh`-Auth aufgesetzt. |
| 5 | **Factory-Runner bleibt fleet-primär** (ADR-007 A unangetastet). `devmesh` kann optional zusätzlich einen Runner gegen die lokale DB fahren (schnelle Iteration), ohne den fleet-Runner zu ersetzen. |
| 6 | **k3d-Altlasten auflösen** — `scripts/factory/lib.sh` (`FACTORY_CTX=k3d-mentolder-dev`), `e2e-test-infrastructure.md`, `nextcloud-integration.md` (Deploy-Default), `tests/spec/work-vm-shared-dev/work-vm-guards.bats` und die CLAUDE.md-Regeln („fleet is the only kubeconfig context", „k3d is no longer used", „local development via k3d on the WSL host has been discontinued") werden auf den `devmesh`-Context bzw. die neue Realität umgeschrieben. |

### Nachtrag 2026-09-11 — Brainstorming SP-1..SP-5

Das Brainstorming der Teilprojekte hat die Entscheidungstabelle an vier Stellen geändert. Wo
dieser Nachtrag der Tabelle widerspricht, gilt der Nachtrag.

| # | Änderung | Grund |
|---|---|---|
| 1 | **Der WSL-GPU-Host wird kein k3s-Knoten** (ersetzt Teil von Punkt 1). GPU-Inferenz bleibt nativ; devmesh erreicht sie über einen Service mit statischem EndpointSlice auf die Tailnet-Adresse von PK-Desktop. | `sdlc-isolation` verlangt native GPU-Prozesse; ein k3s-Agent in WSL mit `networkingMode = mirrored` bräuchte das nvidia-container-toolkit und riskiert Flannel-Probleme. |
| 2 | **Drei Server im HA-Verbund** (`gpu-metal`, `gpu-cluster`, `gpu-cluster2`, embedded etcd) statt ein Server + zwei Agents. `local-path`-Storage, gepinnt auf `gpu-cluster2`. | Operator-Wahl: Wartung und Knotenausfall ohne Stillstand. |
| 3 | **Tailnet statt WireGuard-Dev-Mesh** (ersetzt Punkt 3). k3s-Knoten sprechen direkt über das LAN (Flannel `wireguard-native`); Clients erreichen devmesh zu Hause direkt und unterwegs über das bestehende Tailnet. Das `wg-gpu`-Mesh bleibt unverändert. | Plain WireGuard kennt keinen Endpoint-Failover und braucht für NAT↔NAT einen Hub; Tailscale ist schon im Einsatz. |
| 4 | **Vierter Host `ws-ubuntu-1`** (10.0.33.1, 4c/16 GB) trägt heute einen laufenden `k3d-mentolder-dev` (SDLC-Stack). Der Stack zieht in SP-3 nach devmesh, der Host tritt in SP-5 als Agent bei. | Im ursprünglichen Inventar übersehen. |

Weitere Festlegungen: führende Ticket-DB bleibt fleet (388 Tickets, gemessen 2026-09-11); die
devmesh-DB trägt Entwicklungsdaten, Ticket-Tooling verweigert dort Schreibzugriffe. Hostnamen
`*.devmesh.mentolder.de`, eigene Pocket ID, Deploy per `task devmesh:deploy` aus der
Arbeitskopie. gekko erhält den symmetrischen git-crypt-Key; Clones auf PK-Desktop, PK-L-1 und
PK-Tablet (je WSL). Die SP-5-Pfade heißen `openspec/specs/e2e-test-infrastructure.md` und
`openspec/specs/nextcloud-integration.md`.

| TP | Ticket | OpenSpec-Change |
|---|---|---|
| SP-1 | T900116 | `devmesh-tailnet` |
| SP-2 | T900117 | `devmesh-k3s-cluster` |
| SP-3 | T900118 | `devmesh-dev-stack` |
| SP-4 | T900119 | `dev-repo-per-machine` |
| SP-5 | T900120 | `devmesh-k3d-decommission` |

## Verworfene Alternativen

| Alternative | Grund |
|---|---|
| Proxmox-VM-Revival (work-vm-shared-dev / T900104) | Vorhandene Bare-Metal + WSL genügen; keine neue Linux-Umgebung nötig. Spec wird abgelöst. |
| k3d-in-WSL auf dem GPU-Host | Ein-Host-Cluster, kein echtes Multi-Node; wiederholt genau das Setup, das ADR-006/007 als fragil verworfen haben. |
| Bare-Metal-k3s **ohne** WSL-GPU-Worker | Einziger lokaler GPU (GTX 970, 4 GB) trägt kein LLM; ohne den WSL-Worker kein GPU-Dev lokal. |
| ADR-007 komplett zurücknehmen | Teil A (fleet-native Factory) und die fleet-nativen Linux-Dienste funktionieren; nur Teil C ist gescheitert. |

## Konsequenzen & Risiken

1. **RAM-Budget:** 48 GB gesamt ist für den vollen `workspace-dev`-Stack knapp.
   SP-3 muss die Resource-Requests dev-tauglich absenken und ggf. schwere
   Optionaldienste (Collabora, Talk-HPB) abschaltbar machen.
2. **Zwei Subnetze:** `gpu-metal` auf `10.1.0.0/24`, die anderen zwei auf
   `10.10.10.0/24`. Das Mesh (SP-1) muss beide überbrücken; k3s-Node-IPs und
   `--node-external-ip` entsprechend wählen.
3. **git-crypt-Key-Verteilung** auf 3+ Maschinen (SP-4) — sicherer Transport,
   `640 root:<grp>`, dokumentierter Rotationspfad. Verwandt:
   `windows-git-crypt-keyfile` (Memory).
4. **CLAUDE.md-Regeln werden unwahr** und müssen in SP-5 explizit ersetzt werden,
   sonst widersprechen sich Doku und Betrieb.
5. **gpu-metal `gpupod.service` :8080** läuft bereits — vor der k3s-Installation
   klären, ob der Port/Dienst kollidiert.
6. **ADR-007-Nachtrag nötig:** ADR-007 bekommt einen Verweis „Teil C teilweise
   revidiert durch ADR-008" (in diesem Change miterledigt).

## Programm (Teilprojekte)

Jedes TP durchläuft einzeln spec → plan → execute.

| TP | Inhalt |
|---|---|
| **SP-0** | **Diese ADR + Programm-Doc + Ticket T900115.** Kein Code. |
| **SP-1** | **WireGuard-Dev-Mesh** — Peer-Config für 3 Bare-Metal + WSL + PK-Tablet + PK-L-1, LAN vs. Roaming, DNS. Prior Art: `wireguard/wg-mesh-nodes.yaml`, `scripts/hetzner/generate-wg-conf.sh`. |
| **SP-2** | **k3s-Provisionierung** — Server/Agent-Rollen, WSL als GPU-Worker, Context `devmesh`, Storage (local-path/longhorn), Traefik-Ingress, lokale TLS-CA. Neues `dev-local/`-Overlay auf `k3d/`-Basis. |
| **SP-3** | **Dev-Stack auf `devmesh`** — voller Stack, Domain-Strategie, Secrets (sealed vs. plain für LAN), Pocket-ID lokal vs. geteilt, GitOps (flux-Branch vs. push-`task`). |
| **SP-4** | **Repo pro Maschine + gekko-Onboarding** — Per-Maschine-Clone, git-crypt-Key-Verteilung, Hooks, Identität. Ersetzt `openspec/specs/work-vm-shared-dev.md` durch das Per-Maschine-Modell. |
| **SP-5** | **k3d-Altlasten** — `FACTORY_CTX`, e2e, nextcloud-Deploy-Default, `work-vm-guards.bats`, CLAUDE.md-Regeln. Teilweise parallel zu SP-3/SP-4. |

## Inventar-Belege (Session 2026-09-10)

```bash
# Mesh-/Netzsicht vom WSL-GPU-Host
wsl -d k3d-dev -- bash -lc 'ip -br a; ip route; wg show'
# LAN-Discovery
wsl -d k3d-dev -- nmap -sn --system-dns 10.1.0.0/24 10.10.10.0/24
# Host-Specs (SSH gpu@<ip>, read-only: hostnamectl / nproc / free -h / nvidia-smi -L / lsblk)
```
