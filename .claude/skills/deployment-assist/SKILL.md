---
name: deployment-assist
description: Use when the user wants to deploy, set up, or diagnose the workspace platform — after a fresh clone or on a partially-deployed environment. Guides through environment selection, credential check, status assessment, and sequential task execution until everything is running.
---

> **Mishap Tracking:** As you execute this skill, maintain a running `MISHAP_LOG`.
> For every anomaly, unexpected state, broken component, security concern, or
> configuration drift you notice — even if unrelated to the current task — add
> an entry with: `type` (broken/degraded/suspicious/security/drift), `title`,
> `description`, and `component`. Invoke `mishap-tracker` at the very end.

# deployment-assist

Interactive deployment guide. Runs a phased assessment of what exists, what's missing, and what credentials are needed, then offers to execute required tasks in order.

---

## Phase 0 — Environment Selection

Ask the user which target they want to work with:

```
Which environment?
  [1] dev       — local k3d cluster (docker required)
  [2] mentolder — prod cluster (mentolder.de)
  [3] korczewski — prod cluster (korczewski.de)
  [4] all-prods — both prod clusters
```

Set `ENV` to the chosen value. For `all-prods`, run the fan-out `*:all-prods` tasks where available; otherwise run each prod env sequentially.

---

## Phase 1 — Prerequisite Tools

Run these checks. Report missing tools immediately — stop until they're resolved.

```bash
# Required tools
for tool in docker kubectl task k3d git flux; do
  command -v $tool >/dev/null 2>&1 && echo "✅ $tool" || echo "❌ $tool MISSING"
done

# For prod: also check
command -v kubeseal >/dev/null 2>&1 && echo "✅ kubeseal" || echo "⚠️  kubeseal (needed for env:seal)"
```

For **dev**: docker + k3d are required.
For **prod**: kubectl context for the target env must be reachable, and Flux must be installed.

```bash
# Check kubeconfig / context reachability
kubectl config get-contexts
kubectl --context <ENV_CONTEXT> get nodes 2>&1 | head -5

# Check Flux health
flux check --context <ENV_CONTEXT> 2>&1 | tail -10
```

---

## Phase 2 — Credential & Config Assessment

Check what exists. Report status line by line.

### 2a. Environment config file

```bash
# Does environments/<env>.yaml exist?
[[ -f environments/<env>.yaml ]] && echo "✅ environments/<env>.yaml" || echo "❌ MISSING"

# Validate it
task env:validate ENV=<env> 2>&1 | tail -5
```

If the file is missing: `task env:init ENV=<new>` to scaffold it, then prompt the user to fill in required fields from `environments/schema.yaml`.

### 2b. Plaintext secrets (only needed for sealing, gitignored)

```bash
[[ -f environments/.secrets/<env>.yaml ]] \
  && echo "✅ .secrets/<env>.yaml present (can seal)" \
  || echo "⚠️  .secrets/<env>.yaml absent — need plaintext secrets to (re)seal"
```

If absent and **sealed-secrets already exist** on disk → sealing step is skippable; use the committed sealed secret.
If absent and **no sealed secret exists** → user must supply secrets before deploying prod.

### 2c. Sealed secrets (committed, prod only)

```bash
[[ -f environments/sealed-secrets/<env>.yaml ]] \
  && echo "✅ sealed-secrets/<env>.yaml committed" \
  || echo "❌ No sealed secret — run: task env:seal ENV=<env>"
```

### 2d. Sealing cert

```bash
[[ -f environments/certs/<env>.pem ]] \
  && echo "✅ sealing cert present" \
  || echo "⚠️  Run: task env:fetch-cert ENV=<env>"
```

### 2e. Flux GitRepository source (prod only)

```bash
flux get sources git --context <ENV_CONTEXT> -n flux-system
```

The `flux-system` GitRepository must be `Ready` before any Kustomization can reconcile. If it's not, check SSH key and GitHub access.

---

## Phase 3 — Cluster & Namespace Status

```bash
# Check if cluster is reachable
kubectl --context <ctx> get nodes -o wide 2>&1

# Check Flux Kustomizations
flux get kustomizations --context <ctx>

# Check workspace namespace pods
kubectl --context <ctx> -n <WORKSPACE_NAMESPACE> get pods 2>&1

# Website namespace
kubectl --context <ctx> -n <WEBSITE_NAMESPACE> get pods 2>&1
```

Classify each Flux Kustomization:
- `Ready True` → ✅ Flux-managed and reconciled
- `Ready False` / `Progressing` → ❌ needs attention — run `flux describe kustomization <name> --context <ctx>`

Classify each pod group:
- `Running` + `Ready` → ✅ deployed
- `Pending` / `CrashLoopBackOff` / absent → ❌ needs attention

For **dev**: also check if the k3d cluster exists:
```bash
k3d cluster list
```

---

## Phase 4 — Gap Analysis Table

Build and print a table like this before offering any action:

```
ENVIRONMENT: mentolder
──────────────────────────────────────────────────────
PREREQUISITE              STATUS
──────────────────────────────────────────────────────
Tools (docker/kubectl/task/flux) ✅ all present
environments/mentolder.yaml ✅ present + valid
.secrets/mentolder.yaml     ⚠️  absent (ok if sealed)
sealed-secrets/mentolder.yaml ✅ committed
sealing cert                ✅ present
Cluster reachable           ✅ 9 nodes Ready
Flux GitRepository          ✅ Ready
──────────────────────────────────────────────────────
FLUX KUSTOMIZATION        STATUS          RECONCILE
──────────────────────────────────────────────────────
workspace                  ✅ Ready       flux reconcile kustomization workspace
website                    ❌ Not Ready   flux reconcile kustomization website
──────────────────────────────────────────────────────
COMPONENT                 STATUS          TASK
──────────────────────────────────────────────────────
workspace core             ✅ Running
website                    ❌ Missing      feature:website
Collabora (office)         ❌ Missing      workspace:office:deploy
Post-setup (Nextcloud apps) ❓ Unknown    workspace:post-setup
Talk HPB signaling         ❓ Unknown     workspace:talk-setup
Recording backend          ❓ Unknown     workspace:recording-setup
Whiteboard                 ❓ Unknown     workspace:whiteboard-setup
Brett (Systembrett)        ✅ Running
Admin users                ❓ Unknown     workspace:admin-users-setup
Vaultwarden seed           ❓ Unknown     workspace:vaultwarden:seed
Transcriber bot            ❓ Unknown     workspace:transcriber-setup
──────────────────────────────────────────────────────
```

Use `task workspace:status ENV=<env>` output to populate pod status. Mark components `❓ Unknown` when there's no pod-level signal (post-setup jobs don't leave a running pod).

---

## Phase 5 — Execution Plan

Present the ordered task list that resolves all gaps. Ask: **"Run all in order, pick specific ones, or skip?"**

### Dev deployment order (fresh)

```
1. task cluster:create
2. task workspace:up          ← full automated setup (includes office + post-config)
```

`workspace:up` covers everything for dev. If it was already run partially, jump to the first failing step:

```
2b. task workspace:deploy
3.  task workspace:office:deploy
4.  task workspace:post-setup
5.  task workspace:talk-setup
6.  task workspace:recording-setup
7.  task workspace:whiteboard-setup
8.  task workspace:systembrett-setup
9.  task workspace:admin-users-setup
10. task workspace:vaultwarden:seed
11. task workspace:transcriber-setup
```

### Prod deployment order (per env) — Flux-managed

On a live prod cluster managed by Flux, the primary path is:

```
# Verify Flux is healthy and reconciling
flux check --context <ctx>
flux get kustomizations --context <ctx>

# Force an immediate reconcile (e.g. after pushing a fix to main)
flux reconcile kustomization workspace --context <ctx> --with-source
flux reconcile kustomization website  --context <ctx> --with-source

# Roll new website image (build → push → Flux picks up new tag automatically via ImagePolicy)
task feature:website          # builds + pushes + waits for Flux image-update commit
```

**Fresh cluster / disaster recovery** — Flux cannot bootstrap itself; run this order manually:

```
1.  task sealed-secrets:install ENV=<env>    (controller must exist before any SealedSecret)
2.  task env:fetch-cert ENV=<env>            (refresh sealing cert from new controller)
3.  task env:seal ENV=<env>                  (re-encrypt with new cert)
4.  task cert:install ENV=<env>              (cert-manager CRDs before workspace:deploy)
5.  task cert:secret -- <ipv64-key> ENV=<env>
6.  task workspace:deploy ENV=<env>          (applies SealedSecrets + base manifests)
    # After this, Flux Kustomizations can take over:
7.  kubectl apply -f flux/clusters/<env>/    (install Flux Kustomizations)
8.  flux reconcile source git flux-system --context <ctx>
9.  task workspace:office:deploy ENV=<env>
10. task workspace:post-setup ENV=<env>
11. task workspace:talk-setup ENV=<env>
12. task workspace:recording-setup ENV=<env>
13. task workspace:whiteboard-setup ENV=<env>
14. task workspace:systembrett-setup ENV=<env>
15. task workspace:admin-users-setup ENV=<env>
16. task workspace:vaultwarden:seed ENV=<env>
17. task workspace:transcriber-setup ENV=<env>
```

For `all-prods`, substitute fan-out tasks where they exist (`feature:deploy`, `feature:website`, `workspace:post-setup:all-prods`, etc.) and run env-specific ones twice.

---

## Phase 6 — Execute & Monitor

For each task the user approves:

1. Run it and stream output.
2. After completion, check status: `task workspace:status ENV=<env>` (or equivalent).
3. Report result: ✅ succeeded / ❌ failed + relevant log snippet.
4. If a task fails: run `task workspace:logs ENV=<env> -- <svc>` for the failing pod. Diagnose before proceeding.
5. Move to the next task only on success.

For Flux-managed components, also check:
```bash
flux get kustomizations --context <ctx>
flux events --context <ctx> -n flux-system
```

After all tasks complete, run a final health check:

```bash
task health          # cross-cluster status + connectivity
task workspace:verify ENV=<env>   # smoke probes
flux get all -n flux-system --context <ctx>   # Flux objects all Ready
```

Report a final summary table with all components green.

---

## Quick Checks (ad-hoc, no full run)

```bash
task workspace:status ENV=<env>
task clusters:status          # both prod clusters at once
task health                   # full connectivity check

# Flux-specific
flux get kustomizations --context <ctx>
flux get sources git --context <ctx>
flux logs --context <ctx>     # recent reconciler events
```

---

## Flux CD Architecture (prod only)

Both prod clusters run Flux v2. Key objects in `flux-system`:

| Kustomization | Path | substituteFrom |
|---|---|---|
| `workspace` | `prod-mentolder/` or `prod-korczewski/` | `cluster-vars` ConfigMap |
| `website`   | `flux/apps/website-{env}/`              | `cluster-vars` + `website-vars` + `website-vars-secret` (optional) |

**`cluster-vars` ConfigMap** (per cluster, `flux/clusters/<env>/vars-configmap.yaml`):
`PROD_DOMAIN`, `WORKSPACE_NAMESPACE`, `WEBSITE_NAMESPACE`, `DEV_DOMAIN`, `BRAND_NAME`, `BRAND_ID`, `WEBSITE_IMAGE`

**`website-vars` ConfigMap** (`flux/apps/website-{env}/website-vars-configmap.yaml`):
All website-specific env vars: SMTP_HOST/PORT/SECURE/USER, CONTACT_*, LEGAL_*, LLM_ENABLED, SYSTEMTEST_LOOP_ENABLED, etc.

**Image automation**: Flux's `ImageRepository` + `ImagePolicy` watches `ghcr.io/paddione/{WEBSITE_IMAGE}` for new tags. On push, `ImageUpdateAutomation` commits the new tag to `flux/apps/website-{env}/image-tag.yaml` on `main`, then Flux reconciles and rolls the Deployment.

### Flux Footguns

| Problem | Root Cause | Fix |
|---|---|---|
| `${VAR}` in embedded script replaced with empty string | Script file embedded in ConfigMap via `configMapGenerator`; Flux's `substituteFrom` scans all YAML text for `${IDENTIFIER}` | Escape as `$${VAR}` — Flux reduces `$$` → `$` at reconcile time |
| `${VAR:=default}` is safe | The `:` breaks the identifier; Flux skips non-`[A-Za-z_][A-Za-z0-9_]*` content | No action needed |
| ConfigMap data value is YAML boolean | `SMTP_SECURE: false` (unquoted) → YAML bool; `map[string]string` unmarshal may fail | Always quote: `SMTP_SECURE: "false"`, `SMTP_PORT: "587"` |
| Variable not substituted (shows `${VAR}` literally) | Var is in template but not in any `substituteFrom` source | Add it to `cluster-vars` or `website-vars` ConfigMap |
| Flux can't bootstrap a fresh cluster | SealedSecrets controller must exist before Flux can apply SealedSecrets | Run `sealed-secrets:install` + `env:fetch-cert` + `env:seal` before applying Flux Kustomizations |
| `knowledge-secrets` conflict | `secretGenerator` Secret has same name as SealedSecret; controller refuses to adopt | `kubectl delete secret knowledge-secrets -n $WS_NS` then re-apply |
| Website image not auto-updating | `ImageUpdateAutomation` requires write access to repo | Set `default_workflow_permissions=write` at repo level in GitHub settings |

### Flux Reconcile Commands

```bash
# Force re-sync from git (after pushing a fix)
flux reconcile source git flux-system --context <ctx>

# Force reconcile a specific Kustomization
flux reconcile kustomization workspace --context <ctx> --with-source
flux reconcile kustomization website   --context <ctx> --with-source

# Suspend/resume reconciliation (e.g. during manual surgery)
flux suspend kustomization workspace --context <ctx>
flux resume  kustomization workspace --context <ctx>

# Describe a failing Kustomization
flux describe kustomization website --context <ctx>
flux events --context <ctx> -n flux-system --for Kustomization/website
```

### What Flux Manages vs What Tasks Still Own

| Responsibility | Owner |
|---|---|
| Reconciling workspace manifests from git | Flux `workspace` Kustomization |
| Reconciling website ConfigMap + Deployment from git | Flux `website` Kustomization |
| Rolling a new website image after build | Flux ImageUpdateAutomation (auto) or `task feature:website` (manual) |
| SealedSecrets encryption/rotation | `task env:seal` + `task secrets:sync` |
| Collabora, CoTURN, post-setup | Manual tasks (not Flux-managed) |
| Fresh cluster bring-up ordering | Manual tasks (Flux can't bootstrap itself) |

---

## Common Blockers & Fixes

| Symptom | Fix |
|---------|-----|
| `kubeconfig` missing | Copy cluster kubeconfig or run `k3d kubeconfig get` |
| Sealed secret fails to decrypt | `task env:fetch-cert ENV=<env>` then `task env:seal ENV=<env>` |
| `env:seal` fails | Ensure `.secrets/<env>.yaml` exists and `kubeseal` is installed |
| Pod stuck `Pending` | Check node resources: `kubectl describe pod <pod>` |
| `workspace:post-setup` hangs | Nextcloud is slow on first boot — wait 2 min, re-run |
| Office (Collabora) not ready | Collabora starts slowly; check: `task workspace:logs ENV=<env> -- collabora` |
| `workspace:up` fails mid-way | Re-run the specific failed step — `workspace:up` is not idempotent mid-run |
| Missing `MANAGED_EXTERNALLY` error | Run `task env:generate ENV=<env>` to populate signaling/TURN secrets |
| Flux Kustomization stuck `Progressing` | `flux describe kustomization <name>` → usually a missing substitution var or bad YAML |
| Flux not picking up new image tag | Check `flux get images all --context <ctx>` — ImagePolicy may need `flux reconcile image repository` |

---

## Post-Execution: Mishap Report

After completing all steps in this skill, invoke `mishap-tracker` with your
accumulated `MISHAP_LOG`. If no mishaps were found, `mishap-tracker` exits
cleanly with "No mishaps found."
