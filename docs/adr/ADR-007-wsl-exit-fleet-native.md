# ADR-007: WSL-Exit — Fleet-native Factory & Windows-native Dev

**Status:** Accepted — Supersedes [ADR-006](ADR-006-sdlc-isolation-dev-host.md)
**Datum:** 2026-08-24 · Ticket: T016422
**Entscheidungssession:** Explore 2026-08-24 (Operator-Beschluss: Option **A+C**)

## Kontext

Der WSL-Host am Heim-PC verhungert. Gemessen am 2026-08-24:

- `.wslconfig` bereits auf 10 GB RAM / 4 Kerne abgesenkt → `MemFree: 122 MB`
- FreeToken-native Serving braucht ~20 GB Experten-RAM zusätzlich zum Modell;
  volle 64 GB Host-RAM + 16 GB VRAM stehen nur ohne WSL zur Verfügung
- Fleet-Worker sind bei 85 % / 112 % RAM belegt — Dev-in-Pod/Thin-Client scheidet
  damit als Ausweichziel aus

Gleichzeitig ist der Linux-Anteil des Alltags bereits fleet-seitig gelöst:
bge-embed/-rerank (T002551), tickets-DB of record = Fleet shared-db,
gitlab-runner + registry-cache (seit ~21.8.), dev-stack-Kern in workspace-dev.
WSL hält nur noch drei Dinge fest: den Factory-Dispatcher (systemd User-Timer),
die sdlc-console und die lokalen MCP-Tunnel.

## Was von ADR-006 bleibt

ADR-006 begründete die SDLC-Isolation („Es wandern Dienste zu ihm hin, nicht der
Host") für eine Ära, in der das Fine-tuning in WSL lief. Diese Begründung entfällt:
Unsloth-Training wandert auf HF Jobs Cloud (T016440). Windows-nativ bleiben die
GPU-Pfade für ComfyUI und Whisper — sie brauchen kein Linux-Userland.

## Entscheidung

**A) Fleet-native Factory.** Der Dispatcher wird als single-replica Deployment
`factory-runner` im Fleet betrieben (workspace-dev):

- RWX-Longhorn-PVC (`factory-runner-workdir`, 20Gi) trägt Repo-Clone + `.worktrees/`
- Tick per CronJob (`*/5 * * * *` = bisheriger Timer-Takt) via `kubectl exec` in
  den Runner-Pod; `scripts/factory/wakeup.sh` bleibt NICHT geändert
- Single-Flight bleibt im wakeup-flock — deshalb KEIN HPA, keine Replica-Spills
- Credentials als SealedSecrets (kubeseal = Operator-Schritt); RBAC-Rolle darf nur
  `exec` auf deploy/factory-runner

**C) Windows-native Dev.** Repo-Checkout wandert auf NTFS (Git Bash, Developer
Mode Symlinks, `core.symlinks=true`); opencode läuft nativ auf Windows gegen
FreeToken :1919 lokal.

**Verworfen:**

| Alternative | Grund |
|---|---|
| Proxmox dev-VM Revival (B) | User-Ausschluss: keine zweite Linux-Umgebung |
| Dev-in-Pod / Thin-Client (D) | Worker-RAM 85–112 %, WAN-Latenz, native Toolchain geht verloren |
| llm-proxy migrieren | FreeToken-native (T014105) hat ihn obsolet gemacht — retire statt portieren |
| WSL registry-cache behalten | Duplikat des In-Cluster-Deployments seit ~21.8. |
| Docker Desktop Hyper-V-Backend | Installiert und technisch möglich, aber von Docker seit Jahren als deprecated geführt; der Zweck (lokales k3d) ist mit dem WSL-Exit entfallen. |

**Nachtrag 2026-09-03 (Operator-Entscheidung): Docker Desktop deinstallieren.**

`wsl -l -v` zeigte `docker-desktop` als laufende WSL2-Distro (0.1 GB), `k3d-dev` gestoppt (414.5 GB vhdx). `kubectl config get-contexts` listet keine k3d-Kontexte mehr (nur `fleet` und `hetzner`) — der lokale Dev-Cluster ist faktisch tot. Docker Desktop wird **deinstalliert** (nicht auf Hyper-V umgestellt). `wsl --shutdown` ist damit kein letzter Schritt mehr, sondern kann parallel zum letzten Cleanup erfolgen.

## Konsequenzen

1. **P0-Spikes als Gate vor dem Cutover** (T016432):
   - opencode-Viability nativ auf Windows
   - NTFS-Clone: Symlinks + git-crypt + `core.symlinks=true` (Developer Mode)
   - Fleet → Windows:1919-Route durch FritzBox-NAT über wg-mesh
2. **E17-Write-Authority:** Die Credentials bündeln sich jetzt im Runner-Pod
   (git-crypt-Key, PATs, Cloud-API-Keys). Gegenmaßnahmen: SealedSecrets statt
   Plaintext, minimale exec-only RBAC-Rolle, kein ServiceAccount-Token im
   Runner selbst (`automountServiceAccountToken: false`).
3. **FreeToken = best-effort für Night-Ticks** (Design D3): die Workstation kann
   aus sein. Die Eskalationskette deepseek/alibaba wird First-Class-Failover.
4. **flux-dev zuerst grün:** der brett-CrashLoop (/tmp emptyDir, T016426) blockiert
   die flux-dev-Kustomization — der Fix geht allen neuen Manifesten voraus.

---

## Operator-Anhang (Runbook)

> Alle Schritte hier sind **Operator-Aufgaben** — kein Agenten-Task
> (tasks.md:63). Reihenfolge ist verbindlich; jeder Schritt listet sein
> Verifikationskommando.

### A.1 P0-Spikes (T016432 — Gate)

1. **opencode auf Windows**: Installation nativ (kein WSL!), Session gegen
   FreeToken :1919 starten, Edit/Write/Bash-Tools smoke-testen. Ergebnis
   dokumentieren — scheitert der Spike, fällt der Cutover aus.
2. **NTFS-Clone**: `git clone` auf NTFS-Laufwerk, Developer Mode aktiv,
   `git config --global core.symlinks true`, git-crypt unlock mit bp-secrets.key,
   Pre-commit-Hook-Lauf prüfen. Symlink-Check: `dir .agents/skills/dev-flow-*`
   muss die Directory-Symlinks zeigen.
3. **Fleet → Windows:1919**: aus einem Fleet-Worker `curl http://192.168.100.10:1919/v1/models`
   durch die FritzBox-NAT über wg-mesh. Scheitert der Spike: LLM_BASE_URL im
   factory-runner.yaml anpassen oder Night-Ticks rein cloud-eskalierend betreiben.

### A.2 gekko-hetzner-2: Rejoin oder Dekommissionierung

Bevorzugt **Rejoin** (Maschine ping-bar, Longhorn-Record READY=False heilbar):

```bash
kubectl get nodes -o wide                       # Ist-Zustand
# Auf gekko-hetzner-2: k3s-Agent-Dienst neu hochziehen + Token gegenprüfen
kubectl delete node gekko-hetzner-2             # nur wenn Stale-Record
# Danach: Longhorn-Replikat-Rebuild für die degradierte Prometheus-PVC abwarten
kubectl -n longhorn-system get volumes.longhorn.io | grep -i prometheus
```

Saubere Dekommissionierung nur, wenn der Node physisch nicht zurückkommt:
Node drainen, Longhorn-Replikat löschen, Prometheus-PVC neu binden
(38 GB TSDB-Rebuild dauert; Warnstufe einplanen).

### A.3 WSL-Docker-Cleanup

```powershell
docker rm -f gitlab-registry-cache               # Duplikat zum In-Cluster-Deployment
docker ps --format '{{.Names}}'                  # Restbestand prüfen
```

### A.4 kubeseal — Runner- UND Console-Credentials

Ein Lauf, zwei Secrets (beide VOR dem Erstdeploy, sonst bleibt flux-dev rot):

```bash
# 1) Runner-Credentials (T2.7) → ns workspace-dev
kubectl create secret generic factory-runner-secrets -n workspace-dev \
  --from-file=bp-secrets.key=<pfad>/bp-secrets.key \
  --from-file=autopilot.env=$HOME/.config/factory/autopilot.env \
  --from-literal=GITHUB_PAT=<pat> \
  --from-literal=DEEPSEEK_API_KEY=<key> \
  --from-literal=ALIBABA_API_KEY=<key> \
  --from-literal=OPENCODE_ZEN_KEY=<key> \
  --dry-run=client -o json \
| kubeseal --controller-namespace kube-system --format yaml \
  > environments/sealed-secrets/workspace-dev-factory-runner.yaml

# 2) sdlc-console-Secrets → ns workspace-dev (4 Keys, siehe sdlc-console.yaml)
kubectl create secret generic website-secrets -n workspace-dev \
  --from-literal=WEBSITE_DB_PASSWORD=$(kubectl -n website get secret website-secrets -o jsonpath='{.data.WEBSITE_DB_PASSWORD}' | base64 -d) \
  --from-literal=POCKET_ID_WEBSITE_SECRET=$(kubectl -n website get secret website-secrets -o jsonpath='{.data.POCKET_ID_WEBSITE_SECRET}' | base64 -d) \
  --from-literal=CRON_SECRET=$(kubectl -n website get secret website-secrets -o jsonpath='{.data.CRON_SECRET}' | base64 -d) \
  --from-literal=GITHUB_PAT=<pat> \
  --dry-run=client -o json \
| kubeseal --controller-namespace kube-system --format yaml \
  > environments/sealed-secrets/workspace-dev-website-secrets.yaml
```

Beide Dateien landen committed im Repo; die Quell-Secrets danach löschen
(`kubectl -n workspace-dev delete secret ...`) — SealedSecret-Controller legt
sie selbst wieder an.

### A.5 Cutover-Reihenfolge

1. PR von T016422 gemergt, Flux rendert neues Artefakt, **flux-dev = Ready**
   (`flux get kustomization flux-dev -n flux-system`)
2. brett-Pod Ready (`kubectl -n workspace-dev rollout status deploy/brett`)
3. A.4 ausgeführt (SealedSecrets committed + reconciled)
4. factory-runner-Pod Ready, manueller Probe-Tick:
   `kubectl -n workspace-dev exec deploy/factory-runner -- bash scripts/factory/wakeup.sh`
   → Queue-Tick läuft, Ticket-Bewegung in der DB sichtbar
5. Interne Endpoints: Operator-DNS `bge-embed.internal` / `bge-rerank.internal`
   auf die Fleet-Edge legen, Smoke über wg-mesh (`curl -s http://bge-embed.internal/healthz`)
6. sdlc-console Ready gegen shared-db.workspace (Session-Login smoke)
7. **Erst jetzt:** `wsl --shutdown` — letzter Schritt, nie davor
8. k3d-Teardown (optional, nach einer stabilen Woche fleet-nativ): lokale
   k3d-Cluster stoppen → docker registry-cache/ggfs. Reste entfernen →
   `.wslconfig`-Aufräumnotiz; Reihenfolge bewusst NACH dem Beobachtungszeitraum
