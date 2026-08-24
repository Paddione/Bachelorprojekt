# ADR-007: WSL-Exit — Fleet-native Factory und Windows-nativer Dev-Desktop

**Status:** Accepted
**Datum:** 2026-08-24
**Ticket:** T016422 (Epic) · Kinder T016424–T016438
**Supersedes:** [ADR-006](ADR-006-sdlc-isolation-dev-host.md)

## Kontext

ADR-006 entschied, dass Dienste zum Dev-Host (WSL2 auf der Heim-Workstation)
wandern. Diese Prämisse ist am 2026-08-24 hinfällig geworden:

- `.wslconfig` wurde auf 10 GB RAM / 4 Kerne abgesenkt; `MemFree` lag bei
  **122 MB** — WSL verhungert.
- FreeToken-native Serving (Windows-Seite) braucht die vollen **64 GB
  Host-RAM + 16 GB VRAM**, um die MoE-Modelle mit Experten-Banks zu halten.
- Der lokale k3d-Cluster (E2 aus ADR-006) wäre in diesem RAM-Budget nicht
  betreibbar gewesen.

Der Dev-Host verschwindet als Linux-Laufzeitumgebung vollständig
(`wsl --shutdown`). Alle Linux-Workloads brauchen neue Heimatorte.

## Entscheidung

Aufteilung nach Option A+C aus der Explore-Session vom 2026-08-24:

**A) Fleet-nativ:** Der Factory-Dispatcher (bisher systemd User-Timer →
`wakeup.sh` → headless Agent auf dem Dev-Host) wird ein single-replica
Deployment „factory-runner" im Fleet mit RWX-Workdir (Repo-Clone +
`.worktrees`), SealedSecrets-Credentials und Tick-Anstoß per CronJob. Die
single-replica-Bauweise erhält die File-Lock-Semantik von `agent-lock.sh`.

**C) Windows-nativ:** Der Repo-Checkout zieht auf NTFS (Git Bash, Developer
Mode für Symlinks, `core.symlinks=true`); opencode läuft nativ auf Windows.
Drei P0-Spikes gatewayen diesen Pfad: opencode-Windows-Viability, NTFS-Clone
mit Symlinks+git-crypt, Fleet→Windows:1919-Route über wg/NAT.

### Bereits im Fleet (keine Migration nötig)

bge-embed/rerank (T002551), tickets-DB of record (MCP-Monolith-Pfad),
gitlab-runner + registry-cache (seit ~21.8.), Dev-Stack-Kern in
`workspace-dev`.

### Verworfene Alternativen

| Alternative | Grund der Verwerfung |
|---|---|
| Proxmox dev-vm Revival | Eine zweite Linux-Umgebung soll gerade weg |
| Dev-in-Pod / Thin-Client | Worker-RAM zu 85–112 % belegt, WAN-Latenz |
| llm-proxy-Migration | FreeToken-native hat ihn obsolet gemacht |
| WSL registry-cache Behaltung | Duplikat des In-Cluster-Deployments |

### E17-Write-Authority

Die Bedenken aus dem sdlc-cockpit-design (E17: Schreib-Authority über
Cluster-Grenzen hinweg) gelten fort: Der factory-runner schreibt über
SealedSecrets-coupled Credentials gegen GitHub, nicht direkt in Cluster-
Ressourcen. Jede Erweiterung, die dem Runner Schreibrechte auf Live-
Manifeste gibt, braucht eine erneute Abwägung in diesem ADR.

## Umsetzungsmapping (Kinder-Tickets)

| Ticket | Inhalt |
|---|---|
| T016424 | fix brett-dev CrashLoopBackOff (tmp emptyDir) |
| T016425 | gekko-hetzner-2 dekommissionieren + Longhorn/Prometheus-Rebuild |
| T016428 | WSL-Docker-Container gitlab-registry-cache löschen (Operator) |
| T016429 | sdlc-console von k3d nach fleet, llm-proxy-host-Hack ersetzt |
| T016430 | interne Endpoints für bge-embed/rerank + shared-db |
| T016433 | factory-runner Pod (single-replica, RWX, SealedSecrets, CronJob) |
| T016436 | dieses ADR + .gitattributes eol=lf + Windows-Setup-Doku |
| T016438 | Finetuning-Pfad auf HF Jobs Cloud |

## Konsequenzen

**Positiv:** FreeToken bekommt den vollen Host; die Factory wird unabhängig
von der Heim-Workstation (Night-Ticks laufen weiter, wenn der Desktop aus
ist — dann vollständig über die Cloud-Eskalationskette deepseek/alibaba);
der Blast Radius des Dev-Stacks bleibt vom Kundenprodukt getrennt.

**Negativ:** FreeToken ist für Night-Ticks nur Best-Effort erreichbar
(P0-Spike wg/NAT); die Eskalationskette wird First-Class und kostet
API-Budget. Der Windows-Dev-Pfad hängt an NTFS-Symlink- und git-crypt-
Funktionalität unter Git Bash — genau dafür stehen die P0-Spikes vorab.

## Migration-Gate

Der systemd User-Timer auf dem WSL-Host wird disabled, BEVOR der Fleet-
CronJob aktiviert wird (Reihenfolge disable-vor-enable; siehe T016433).
