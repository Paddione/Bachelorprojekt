---
ticket_id: T900108
plan_ref: openspec/changes/dev-pod-ssh/tasks.md
status: active
date: 2026-09-10
---

# Design: dev-pod-ssh

_Ticket: T900108 · Ziel-SSOT: `openspec/specs/mcp-gateway.md`_

## Ausgangslage

- `~/.ssh/config` (patrick, gekko) enthält `Host dev-pod` / `Host dev-pod/gekko` mit
  `ProxyCommand kubectl --context fleet -n workspace-dev exec -i deploy/dev-pod -- nc 127.0.0.1 22`.
  `kubectl exec` ohne `-c` landet im Default-Container (`mcp-node`, das Image enthält `nc`) und
  verbindet dort auf die Loopback-Adresse des **Pod**-Netz-Namespace — also auf jeden Container
  im Pod, der `127.0.0.1:22` bindet.
- Das Deployment `k3d/dev-pod/deployment.yaml` (T900107) hat drei Container, keinen sshd.
- Pod-Level `securityContext`: `runAsNonRoot: true`, `runAsUser: 1000`, `fsGroup: 1000`.
- `net.ipv4.ip_unprivileged_port_start` ist im Pod gemessen `0` (containerd-Default) — uid 1000
  darf Port 22 binden.
- Dev-Node `gekko-hetzner-2` (role=dev): 4 CPU / ~7.6 GiB allokierbar, belegt 800m / 512Mi Requests.

## Entscheidungen (Brainstorming 2026-09-10)

| Frage | Entscheidung | Verworfen |
|---|---|---|
| Umgebung | Voller Dev-Container `dev-shell` | Schlanke Shell ohne Toolchain |
| Nutzer | Gemeinsames Konto uid 1000, sshd ohne root | Getrennte Konten mit root-sshd (Ausnahme von runAsNonRoot) |
| Persistenz | Eigenes PVC `dev-pod-home` | emptyDir |
| Umfang | Heute nur Plan, Umsetzung per `dev-flow-execute` später | Plan + Umsetzung in einem Zug |

## Architektur

### Container `dev-shell`

- Image `ghcr.io/paddione/dev-shell:latest`, gebaut aus `docker/dev-shell/Dockerfile`
  über die bestehende Matrix in `.github/workflows/build-dev-pod.yml`.
- Basis `node:22-bookworm-slim` (glibc — Claude Code und native npm-Module laufen dort ohne
  musl-Sonderwege). Alle Werkzeuge zur **Bauzeit** (Requirement "Container images carry their
  dependencies"): `openssh-server`, `git`, `git-crypt`, `bash`, `curl`, `jq`, `less`, `vim-tiny`,
  `tmux`, `postgresql-client`, `ca-certificates`, `kubectl` v1.36.1 (Cluster-Server-Version),
  `task`, `gh`, `pnpm`, `@anthropic-ai/claude-code@2.1.267`.
- `securityContext`: `runAsNonRoot: true`, `runAsUser: 1000`, `allowPrivilegeEscalation: false`.
- Ressourcen: requests `cpu 100m / memory 256Mi`, limits `cpu 2 / memory 3Gi`.
  Summe aller Memory-Requests 416Mi + 256Mi = 672Mi (Guard `< 960Mi` bleibt grün).

### Zwei Login-Namen auf einer uid

OpenSSH ohne root kann nur den Nutzer authentifizieren, unter dessen uid es läuft
(`getuid() == pw->pw_uid`). Der Vergleich läuft über die **uid**, nicht den Namen. Deshalb:

- Das Basis-Konto `node` (uid 1000) wird zu `patrick` umbenannt, Home `/home/dev`, Shell `/bin/bash`.
- `gekko` wird als zweiter passwd-Eintrag mit uid 1000 / gid 1000 / `/home/dev` angelegt.
- Beide Shadow-Einträge tragen `*` (nicht gesperrt, kein Passwort). `!` würde sshd als
  gesperrtes Konto ablehnen.
- `AuthorizedKeysFile /var/lib/dev-shell/authorized_keys/%u` — jeder Name hat nur seinen Key.

### sshd-Konfiguration (`docker/dev-shell/sshd_config`)

```
Port 22
ListenAddress 127.0.0.1
HostKey /home/dev/.ssh-host/ssh_host_ed25519_key
PidFile /tmp/sshd.pid
AuthorizedKeysFile /var/lib/dev-shell/authorized_keys/%u
AllowUsers patrick gekko
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
UsePAM no
StrictModes yes
X11Forwarding no
AllowTcpForwarding local
Subsystem sftp internal-sftp
```

- **Nur Loopback.** Der Pod-IP-Port 22 bleibt geschlossen; auch aus dem wg-Mesh (Pod-Netz
  10.42.0.0/16 wird geroutet) ist sshd nicht erreichbar. Zugang = Recht auf `pods/exec` in
  `workspace-dev`.
- **`StrictModes yes` bleibt.** Die Keys liegen deshalb nicht unter `/tmp` (1777) oder im
  fsGroup-Home (2775, group-writable) — beides würde `safe_path` ablehnen — sondern unter
  `/var/lib/dev-shell/authorized_keys/` (im Image angelegt, Owner 1000, Mode 0700).
- `AllowTcpForwarding local` erlaubt `ssh -L` auf die MCP-Ports im selben Pod.

### Startpfad (`docker/dev-shell/entrypoint.sh`, POSIX sh)

1. Host-Key `ed25519` unter `/home/dev/.ssh-host/` erzeugen, falls nicht vorhanden (PVC →
   stabil über Neustarts), `chmod 600`.
2. Pubkeys aus der ConfigMap (`/etc/dev-shell/keys/{patrick,gekko}`) nach
   `/var/lib/dev-shell/authorized_keys/<name>` kopieren, Mode 0600.
3. `exec /usr/sbin/sshd -D -e -f /etc/ssh/sshd_config`.

Kein Paketmanager, kein Clone, kein Netzzugriff im Startpfad.

### Pod-Ebene

- `securityContext.sysctls: [{name: net.ipv4.ip_unprivileged_port_start, value: "0"}]` —
  explizit statt auf den containerd-Default zu vertrauen (safe sysctl, pro Pod-Netz-Namespace).
- Neues Volume `home` → PVC `dev-pod-home` (`k3d/dev-pod/home-pvc.yaml`, Longhorn, RWO, 20Gi).
- Neues Volume `authorized-keys` → ConfigMap `dev-pod-authorized-keys`
  (`k3d/dev-pod/authorized-keys.yaml`, Keys `patrick`, `gekko`).
- `dev-pod-repo` wird von `dev-shell` **read-only** unter `/workspace/repo` gemountet.
- Kein neuer Port in `service.yaml`, kein `containerPort` für 22.

### Pubkeys

Öffentliche Schlüssel, kein Secret. Die ConfigMap wird **nicht** per envsubst befüllt (das
`prod-fleet/dev-pod`-Overlay ist bewusst platzhalterfrei), sondern trägt die Keys literal.
Drift-Schutz: ein BATS-Guard vergleicht sie mit `PATRICK_SSH_PUBLIC_KEY` /
`GEKKO_SSH_PUBLIC_KEY` aus `environments/mentolder.yaml`.

### Identität im Container

`kubectl` in `dev-shell` nutzt ohne eigene Kubeconfig die ServiceAccount `dev-pod`
(get/list/watch). Das ist gewollt (Requirement "read-only Identität") und wird nicht erweitert;
wer mutieren will, legt eine persönliche Kubeconfig in `/home/dev/.kube/` ab.

## Rollout-Risiko und Gegenmaßnahme

Das Deployment nutzt `strategy: Recreate`. Merged der PR, bevor `ghcr.io/paddione/dev-shell:latest`
existiert, beendet Flux den laufenden Pod und der neue hängt in `ImagePullBackOff` — **alle
In-Cluster-MCP-Server wären bis zum Image-Push weg.** Gegenmaßnahme im Plan: das Image vor dem
Merge per `gh workflow run build-dev-pod.yml --ref <branch>` bauen und
`docker manifest inspect ghcr.io/paddione/dev-shell:latest` prüfen.

## Offene Risiken

- **Zwei Namen, eine uid, sshd ohne root** ist in dieser Kombination nicht im Repo erprobt.
  Der Plan verifiziert es vor dem Push lokal mit `docker run` + `ssh` gegen einen Test-Key;
  schlägt es fehl, ist die Rückfallebene ein einziger Login-Name (`dev`) mit beiden Keys und
  angepasster SSH-Config — Rückfrage an den User, keine stille Abweichung.
- `kubectl exec -i … nc` verbindet ohne `-c` in `mcp-node`; ändert sich der Default-Container
  (Annotation `kubectl.kubernetes.io/default-container`), bleibt der Weg gültig, solange das
  Ziel-Image `nc` enthält. `dev-shell` bringt `nc` (`netcat-openbsd`) ebenfalls mit.
