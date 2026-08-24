# Design — wsl-exit-fleet-factory (T016422)

## Kontext

Der WSL-Host wird stillgelegt (`wsl --shutdown`), damit FreeToken-native Serving
(Qwen3.6-35B-A3B-NVFP4) die vollen 64 GB Host-RAM erhält. `.wslconfig` wurde bereits
auf 10 GB / 4 Kerne abgesenkt (2026-08-24); gemessen: MemFree 122 MB — WSL verhungert.
Diese Änderung superseded **ADR-006** („Es wandern Dienste zu ihm hin, nicht der Host").

## Entscheidungen

| ID | Entscheidung | Begründung |
|----|--------------|------------|
| D1 | Factory-Dispatcher = **single-replica Deployment** `factory-runner` im Fleet (workspace-dev), RWX-Longhorn-Workdir mit Repo-Clone + `.worktrees/`, Tick per CronJob | Erhält File-Lock-Semantik (agent-lock.sh, Worktrees, Session-Koordination) ohne Redesign; QA-Sandbox-Design (2026-07-14) hatte k8s-Job bereits als Fallback skizziert |
| D2 | Credentials (git-crypt-Key, gh-PAT, Cloud-API-Keys) als **SealedSecrets**; sealing = Operator-Schritt via kubeseal | Repo-Konvention (flux-sealed-secrets); E17-Bedenken aus sdlc-cockpit-design werden im ADR dokumentiert |
| D3 | FreeToken :1919 wird für Night-Ticks **best-effort** (Workstation kann aus sein) | Eskalationskette deepseek/alibaba wird First-Class-Failover statt Notfallpfad |
| D4 | sdlc-console zieht ins Fleet (workspace-dev), der `llm-proxy-host`-Endpoints-Hack (172.23.0.1) entfällt | k3d-spezifisch; Fleet-CoreDNS löst keine Host-Bridge-IPs auf |
| D5 | Interne IngressRoutes für bge-embed/-rerank (Cross-Namespace-Ref nach workspace) | MCPs konsumieren direkt über wg-mesh statt kubectl port-forward |
| D6 | brett-dev bekommt tmp **emptyDir** (uid 1000) | CrashLoop-Ursache verifiziert: `mkdir '/tmp/tsx-1000' ENOENT`, 152 Restarts |
| D7 | Training → HF Jobs Cloud; GPU-Node im Fleet bleibt Option | Worker sind 4 vCPU / 8 GB ohne GPU |
| D8 | gekko-hetzner-2: Rejoin bevorzugen (Maschine ping-bar, Longhorn-Record READY=False) | Heilt degraded Prometheus-Replik (38 GB TSDB) und Worker-RAM-Druck (85 %/112 %) — Operator-Aktion |

## Verworfene Alternativen

| Alternative | Warum verworfen |
|---|---|
| Proxmox dev-vm Revival (B) | Sollte laut User keine zweite Linux-Umgebung mehr geben |
| Dev-in-Pod / Thin-Client (D) | Worker-RAM 85–112 % belegt; WAN-Latenz für interaktives Editieren; native Toolchain geht verloren |
| llm-proxy migrieren | FreeToken-native (T014105) hat ihn obsolet gemacht — retire statt portieren |
| WSL registry-cache behalten | Duplikat des seit ~21.8. laufenden In-Cluster-Deployments — Operator löscht ihn |
| Mehrere Runner-Replicas | Bräche agent-lock.sh/Worktree-File-Locks; späteres Redesign (DB-Locks) möglich |

## Constraints

- **P0-Spikes als Gate** vor Cutover: opencode-Windows-Viability · NTFS-Clone
  (Symlinks + git-crypt + core.symlinks=true, Developer Mode) · Fleet→Windows:1919-Route
  durch FritzBox-NAT über wg.
- flux-dev muss zuerst grün werden (D6), sonst landen neue Manifests auf rotem Kustomization.
- Partials disjunkt; letzte Rolle = Tests (plan-lint STRUCT2).
- Live-Ops-Aktionen (hetzner-2 Rejoin, WSL-Docker-Cleanup, k3d-Teardown, kubeseal)
  sind **Operator-Schritte** und werden im ADR/Runbook dokumentiert, nicht vom Agenten ausgeführt.
- Keine Brand-Domain-Literale in Code-Snippets.
