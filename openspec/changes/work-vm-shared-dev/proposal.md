# Proposal: work-vm-shared-dev

## Why

Es gibt keinen Ort mehr für interaktive Repo-Arbeit beider Menschen: dev.mentolder.de
läuft als Container-Stack (`workspace-dev`) auf dem fleet-Cluster, und die alten
Dev-Boxen (k3s-1, Proxmox dev-vm k3d unter 10.0.0.26, WSL-k3d) sind decommissioned
(T002630). Fleet-Nodes kommen als Dev-Box nicht in Frage (single Prod-Cluster;
gekko-hetzner-2 als öffentlicher Edge trägt Traefik+Longhorn und ist aktuell krank:
longhorn-manager CrashLoopBackOff). Die Factory hat ihren eigenen Runner-Pod; für
patrick und gekko fehlt ein gemeinsamer, persistenter Arbeitsplatz mit dem Repo.

## What

Eine dedizierte Work-VM (kein Cluster-Node) auf dem Proxmox-Host `dev` (10.0.0.25,
Home-LAN hinter NAT): Debian 12 cloud-init mit Nutzern `patrick` und `gekko`
(vorhandene Pubkeys, hardened sshd), Toolchain (task, node 22, npm, pnpm, gh,
git-crypt, kubectl — openspec über den Repo-Wrapper, ohne k3d/go), und **einem geteilten Repo-Clone**
`/srv/bachelorprojekt` (Gruppe `dev`, `core.sharedRepository=group`, setgid+ACL,
umask 002, git-crypt-unlock, merge.ours-Driver, Hooks). main bleibt pull-only und
wird per `--ff-only`-systemd-Timer aktuell gehalten; echte Arbeit läuft in
Worktrees (Repo-Konvention). Ein `flock`-Wrapper serialisiert npm/pnpm-Installs.
Wiederverwendet werden `scripts/provision-dev-vm.sh` (env-overridable) und
`prod/cloud-init-dev-vm.yaml`; die VM tritt dem Cluster NICHT bei.

_Ticket: T900104_
