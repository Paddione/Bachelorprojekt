# Dev Secret Leakage Prevention — Design

**Date:** 2026-04-17
**Status:** Approved

## Problem

Five concrete scenarios can cause dev secrets (from `k3d/secrets.yaml`) to reach a production cluster:

| ID | Scenario | Vector |
|----|----------|--------|
| R1 | `$patch: delete` removed from `prod/kustomization.yaml` | Bad merge / rebase conflict |
| R2 | `kubectl apply -f k3d/secrets.yaml --context korczewski` | Manual debugging mistake |
| R3 | Wrong ArgoCD `workspace-overlay` annotation (`k3d` instead of `prod-*`) | Mis-registering a cluster |
| R4 | Sealed secret file contains dev values | `env:generate` used with dev defaults, then sealed |
| R5 | New schema secret missing from prod sealed file | Schema updated, `env:validate` not run before ArgoCD sync |

ArgoCD's `ignoreDifferences: Secret /data` protects _existing_ secrets from being overwritten, but provides no protection when a secret is created fresh (new cluster, deleted secret, or first deploy).

## Approach: CI Enforcement Layer

Five targeted additions. No new infrastructure. All fit into existing CI, Taskfile, and scripts.

---

## Components

### 1. CI: kustomize-build-secrets-check (R1)

**File:** `.github/workflows/ci.yml`

New CI step that builds every prod overlay and greps the output for any known `dev*`-prefixed values from `k3d/secrets.yaml`. Uses a regex anchored to the actual prefixes present:

```
dev(keycloak|nextcloud|shared|vaultwarden|admin|signaling|turn|collabora|whiteboard|recording|website|claude|cron|transcriber|smtp)
```

Step fails (exit 1) if any match is found. This catches removal or corruption of the `$patch: delete` stanza in `prod/kustomization.yaml` before the PR merges.

Runs against: all directories matching `prod*/` (base prod plus per-cluster overlays if they exist).

### 2. CI: env:validate:all (R5)

**File:** `.github/workflows/ci.yml`

Add `task env:validate:all` as a CI step. Uses the existing `--schema-only` flag — no cluster access needed. Validates all `environments/*.yaml` files against `environments/schema.yaml`, including checking that all required secret keys exist in each prod environment's sealed secret file.

Catches: new secrets added to schema without updating the sealed files for prod environments.

### 3. workspace:deploy context guard (R2, R3)

**File:** `Taskfile.yml` — `workspace:deploy` task

Before any `kubectl apply` in non-dev environments, verify the active kubectl context matches the expected context from the environment file:

```bash
active_ctx=$(kubectl config current-context 2>/dev/null || echo "")
if [ "$active_ctx" != "$ENV_CONTEXT" ]; then
  echo "ERROR: Active kubectl context '$active_ctx' != expected '$ENV_CONTEXT'"
  echo "Fix: kubectl config use-context $ENV_CONTEXT"
  exit 1
fi
```

Blocks accidental applies to the wrong cluster. Does not apply to `ENV=dev` (k3d local).

### 4. dev label on k3d/secrets.yaml (R2 — audit layer)

**File:** `k3d/secrets.yaml`

Add `labels: environment: dev` to the `workspace-secrets` Secret. Any accidental manual apply to a prod cluster becomes visible via:

```bash
kubectl get secret workspace-secrets -n workspace --show-labels
```

No enforcement, but provides immediate visual audit trail and makes the intent explicit in the manifest.

### 5. env:seal dev-value guard (R4)

**File:** `scripts/env-seal.sh`

Before encrypting, scan the plaintext secrets file for any value matching `^dev[a-z]` (the `dev*` pattern used in `k3d/secrets.yaml`). If found, print a warning listing the affected keys and require `--force` to proceed:

```
WARNING: The following secrets appear to contain dev placeholder values:
  KEYCLOAK_DB_PASSWORD = "devkeycloakdb..."
Re-run with --force to seal anyway, or fix the values first.
```

This catches the case where `env:generate` was run carelessly or `.secrets/<env>.yaml` was manually copied from a dev template.

---

## Data Flow

```
PR opened
  └─ CI: kustomize build prod/ | grep dev* → fail if match (R1)
  └─ CI: task env:validate:all --schema-only → fail if drift (R5)

task workspace:deploy ENV=korczewski
  └─ env:validate (existing) → schema check
  └─ context guard (new) → active context == ENV_CONTEXT (R2, R3)
  └─ kubectl apply sealed-secrets/korczewski.yaml

task env:seal ENV=korczewski
  └─ dev-value scan (new) → warn/block if dev* values found (R4)
  └─ kubeseal encrypt
```

---

## Files Changed

| File | Change |
|------|--------|
| `.github/workflows/ci.yml` | Add kustomize-secrets-check step + env:validate:all step |
| `Taskfile.yml` | Add context guard to `workspace:deploy` for non-dev envs |
| `k3d/secrets.yaml` | Add `labels: environment: dev` to workspace-secrets |
| `scripts/env-seal.sh` | Add dev-value scan before encryption |

---

## What This Does Not Cover

- ArgoCD overlay annotation misconfiguration (R3 partial): the context guard in `workspace:deploy` doesn't help here since ArgoCD deploys autonomously. Mitigation: CI's kustomize build check covers R1 (same root cause for wrong overlay), and ArgoCD cluster registration is manual/infrequent.
- Sealed secrets controller key rotation: out of scope.
- Runtime secret value validation (e.g. password strength): out of scope.
