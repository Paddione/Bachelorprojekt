---
name: deployment-assist
description: Use when the user wants to deploy, set up, or diagnose the workspace platform — after a fresh clone or on a partially-deployed environment. Guides through environment selection, credential check, status assessment, and sequential task execution until everything is running.
---

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
for tool in docker kubectl task k3d git; do
  command -v $tool >/dev/null 2>&1 && echo "✅ $tool" || echo "❌ $tool MISSING"
done

# For prod: also check
command -v kubeseal >/dev/null 2>&1 && echo "✅ kubeseal" || echo "⚠️  kubeseal (needed for env:seal)"
```

For **dev**: docker + k3d are required.
For **prod**: kubectl context for the target env must be reachable.

```bash
# Check kubeconfig / context reachability
kubectl config get-contexts
kubectl --context <ENV_CONTEXT> get nodes 2>&1 | head -5
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

---

## Phase 3 — Cluster & Namespace Status

```bash
# Check if cluster is reachable
kubectl --context <ctx> get nodes -o wide 2>&1

# Check namespace pods
kubectl --context <ctx> -n <WORKSPACE_NAMESPACE> get pods 2>&1

# Website namespace
kubectl --context <ctx> -n <WEBSITE_NAMESPACE> get pods 2>&1
```

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
Tools (docker/kubectl/task) ✅ all present
environments/mentolder.yaml ✅ present + valid
.secrets/mentolder.yaml     ⚠️  absent (ok if sealed)
sealed-secrets/mentolder.yaml ✅ committed
sealing cert                ✅ present
Cluster reachable           ✅ 9 nodes Ready
──────────────────────────────────────────────────────
COMPONENT                 STATUS          TASK
──────────────────────────────────────────────────────
workspace core             ✅ Running
website                    ❌ Missing      website:redeploy
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

### Prod deployment order (per env)

```
1.  task env:fetch-cert ENV=<env>          (if cert missing)
2.  task env:generate ENV=<env>            (if .secrets absent and no sealed secret)
3.  task env:seal ENV=<env>                (if sealed secret absent or .secrets updated)
4.  task sealed-secrets:install            (if sealed-secrets controller not running)
5.  task workspace:deploy ENV=<env>
6.  task website:deploy ENV=<env>          (if website missing)
7.  task workspace:office:deploy ENV=<env>
8.  task workspace:post-setup ENV=<env>
9.  task workspace:talk-setup ENV=<env>
10. task workspace:recording-setup ENV=<env>
11. task workspace:whiteboard-setup ENV=<env>
12. task workspace:systembrett-setup ENV=<env>
13. task workspace:admin-users-setup ENV=<env>
14. task workspace:vaultwarden:seed ENV=<env>
15. task workspace:transcriber-setup ENV=<env>
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

After all tasks complete, run a final health check:

```bash
task health          # cross-cluster status + connectivity
task workspace:verify ENV=<env>   # smoke probes
```

Report a final summary table with all components green.

---

## Quick Checks (ad-hoc, no full run)

If the user just wants status without running anything:

```bash
task workspace:status ENV=<env>
task clusters:status          # both prod clusters at once
task health                   # full connectivity check
```

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
