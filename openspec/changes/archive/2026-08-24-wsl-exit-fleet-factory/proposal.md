# Proposal: wsl-exit-fleet-factory

## Why

Der WSL-Host am Heim-PC wird stillgelegt, damit FreeToken-native Serving die
gesamten Host-Ressourcen erhält (aktuell: WSL-Limit 10 GB bei 122 MB MemFree,
FreeToken hält ~20 GB Experten-Banks). Alle Linux-Workloads — Dev-Stack,
SDLC-Console und vor allem der **Factory-Dispatcher** (bisher systemd User-Timer
auf WSL) — müssen auf das Fleet-Cluster bzw. an ihren neuen Ort wandern.
Damit wird ADR-006 (Dienste wandern zum Dev-Host) superseded: der Dev-Host
verschwindet als Laufzeitumgebung vollständig.

## What

1. **Fix**: brett-dev im Fleet läuft in CrashLoopBackOff (fehlendes tmp-Volume,
   uid 1000) und blockiert die flux-dev-Reconciliation — Voraussetzung für alles Weitere.
2. **Feature**: `factory-runner` — single-replica Deployment mit RWX-Workdir
   (Repo-Clone + Worktrees), SealedSecrets-Credentials, CronJob-Tick-Anstoß.
3. **Feature**: sdlc-console auf dem Fleet, ohne den k3d-Bridge-IP-Hack.
4. **Feature**: interne IngressRoutes für bge-embed/-rerank, damit MCPs ohne
   kubectl port-forward arbeiten.
5. **Docs/ADR**: ADR-006-Supersession inkl. Operator-Runbook (gekko-hetzner-2
   Rejoin, WSL-Docker-Cleanup, kubeseal-Prozess), eol=lf-Guard in .gitattributes.

Nicht Bestandteil dieses Changes (Operator-/Spike-Aktionen): opencode-Windows-Viability-Spike,
NTFS-Clone-Test, Fleet→Windows-Routentest, hetzner-2 Rejoin selbst, WSL-Teardown.

_Ticket: T016422_
