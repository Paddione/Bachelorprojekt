---
title: "wsl-exit-factory-runner — Implementation Plan"
ticket_id: T016433
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans:
  - wsl-exit-adr007
  - wsl-exit-internal-endpoints
---

# wsl-exit-factory-runner — Implementation Plan

_Ticket: T016433_

## File Structure

```
k3d/factory-runner/deployment.yaml        # NEU: single-replica Deployment (strategy Recreate)
k3d/factory-runner/workdir-pvc.yaml       # NEU: Longhorn-PVC für Repo-Clone + .worktrees
k3d/factory-runner/cronjob.yaml           # NEU: Tick-Anstoß wakeup.sh mit timeout-Wrap
prod-fleet/mentolder/factory-secrets.yaml # NEU: SealedSecrets (git-crypt-Key, gh-PAT, API-Keys, autopilot.env)
flux/clusters/fleet/kustomization.yaml    # Kustomization-Eintrag factory-runner
tests/spec/software-factory/factory-runner.bats  # NEU
```

## Tasks

- [ ] **PVC + Deployment.** Longhorn-PVC (Größe: Repo + parallele Worktrees,
      ~10Gi Startwert); Deployment `factory-runner`, replicas=1, strategy
      Recreate, Image mit git+claude/opencode-CLI+task-Laufzeit (bestehendes
      CI-Runner-Image prüfen und wiederverwenden, falls tauglich).
- [ ] **SealedSecrets.** Muster `flux/clusters/fleet/bootstrap/github-token-
      sealedsecret.yaml`; kubeseal-Schritte als Operator-Runbook-Abschnitt im
      PR (Werte NIE ins Repo). Env-File wird als Secret-Datei gemountet;
      FACTORY_ENV_FILE zeigt auf den Mount-Pfad.
- [ ] **CronJob.** schedule = bisheriger systemd-Intervall; command wrappt
      `timeout ${RUNTIME_MAX_SEC}` um wakeup.sh; idle-retick bleibt in
      wakeup.sh (keine Doppellogik im CronJob).
- [ ] **Flux-Anbindung.** Kustomization im fleet-Cluster-Verzeichnis ergänzen;
      `task workspace:validate` muss grün sein.
- [ ] **Migration-Gate dokumentieren.** Reihenfolge disable WSL-Timer → enable
      CronJob als Kommentar im cronjob.yaml UND Abschnitt im ADR-007/Epic.
- [ ] **BATS-Test.** Assertions: deployment hat replicas=1 & strategy
      Recreate; cronjob wrappt timeout; secrets sind SealedSecrets (kein
      plaintext Secret-Manifest); kein hardcoded Hostname.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/factory-runner.bats
# expected: FAIL (red — factory-runner manifests do not exist yet)
```

- [ ] **Fix-Step (GREEN).** Manifeste gemäß Tasks; Test grün.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/factory-runner.bats
task workspace:validate
```

- [ ] **Final Verification.** Die drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
