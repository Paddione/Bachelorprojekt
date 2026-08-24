# P2 — factory-runner Manifest (fleet-nativer Dispatcher)

```yaml
title: "P2 factory-runner-manifest"
ticket_id: T016422
domains: [infra]
status: active
target_files:
  - k3d/dev-stack/factory-runner.yaml
```

Ziel: Der bisherige WSL-Dispatcher (systemd User-Timer → `scripts/factory/wakeup.sh`)
wird als single-replica Deployment im Fleet betrieben. Design-Entscheidungen D1–D3.

Interface-Fakten (aus `scripts/factory/wakeup.sh` Header): cd in den Repo-Clone →
flock-Single-Flight → git-crypt unlock falls gelockt → headless Dispatcher-Tick mit
Idle-Retick-Loop. Das Skript bleibt unverändert — der Pod stellt nur seine Laufzeitumgebung.

## Tasks

- [ ] **T2.1** PVC `factory-runner-workdir`: RWX, `storageClassName: longhorn`, 20Gi.
  Kommentar: nimmt Repo-Clone + `.worktrees/` auf; RWX damit CronJob-Pod (gleicher
  Mount) und Runner parallel lesen können, während flock Schreibzugriffe serialisiert.

- [ ] **T2.2** Deployment `factory-runner`, `replicas: 1` (KEIN HPA, kein RollingUpdate-
  maxSurge-Spiel: File-Locks + Worktree-Claims sind single-writer). securityContext
  nach Vorbild `k3d/gitlab-runner-stack/registry-cache.yaml` (runAsNonRoot, feste UID,
  drop ALL, seccomp RuntimeDefault). Volume-Mount nach `/workspace`.

- [ ] **T2.3** Container-Image wählen und **digest-gepinnt** eintragen. Kandidaten
  prüfen (Reihenfolge): (a) existierendes Agent-/Tooling-Image aus
  `.github/workflows/` oder `components/*/Dockerfile`; (b) `ghcr.io/paddione/website-sdlc`
  als Basis erweitert um git/gh/go-task/claude-cli via neues Dockerfile
  `docker/factory-runner/Dockerfile`. Muss enthalten: git, git-crypt, gh, node,
  go-task, claude/opencode-CLI, jq. Task schließt erst, wenn Image-Referenz +
  Pin-Strategie im Manifest-Kommentar dokumentiert sind.

- [ ] **T2.4** Env-Defaults (S3-konform: keine Brand-Domains):

      ```yaml
      - name: LLM_BASE_URL          # FreeToken via wg-mesh; P0-Spike verifiziert Route
        value: "http://192.168.100.10:1919/v1"
      - name: LLM_FALLBACK_PROVIDER  # Eskalationskette wird First-Class (Design D3)
        value: "deepseek"
      ```

- [ ] **T2.5** RBAC für Tick-Anstoß: ServiceAccount `factory-tick` + Role
  (`pods/exec`, `pods/log` auf deploy/factory-runner in workspace-dev) + RoleBinding.

- [ ] **T2.6** CronJob `factory-tick` mit gepinntem `alpine/k8s:1.36.2@sha256:44ef494...`
  (Digest wie in k3d/ bereits verwendet), Schedule = bisheriger Timer-Takt,
  Command: `kubectl --namespace workspace-dev exec deploy/factory-runner --
  bash scripts/factory/wakeup.sh`. Kommentar: Single-Flight bleibt im wakeup-flock.

- [ ] **T2.7** SealedSecret-Platzhalter als Kommentarblock (KEINE Werte): Operator
  versiegelt per kubeseal vor Erstdeploy — git-crypt-Key, GITHUB_PAT,
  DEEPSEEK_API_KEY, ALIBABA_API_KEY, OPENCODE_ZEN_KEY. Mount als Dateien unter
  `/workspace/.secrets/`.

## Verify

```bash
kustomize build k3d/dev-stack | grep -c 'name: factory-runner'
grep -E 'replicas: 1$' k3d/dev-stack/factory-runner.yaml
task workspace:validate
```
