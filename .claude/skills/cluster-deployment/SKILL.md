---
name: cluster-deployment
description: Unified runbook for environment deployment, cluster creation, deployment assistance, gap analysis, and dev.mentolder.de stack operations.
---

> **Mishap Tracking:** As you execute this skill, maintain a running `MISHAP_LOG`.
> For every anomaly, unexpected state, broken component, security concern, or
> configuration drift you notice — even if unrelated to the current task — add
> an entry with: `type` (broken/degraded/suspicious/security/drift), `title`,
> `description`, and `component`. Invoke `mishap-tracker` at the very end.

# cluster-deployment

This runbook covers environment deployment, bootstrapping, diagnostic assistance, and operations for both the production and development Kubernetes clusters.

---

## ⚠️ Mandatory Ordering for Fresh Clusters

When setting up a new environment from scratch, you must execute the steps in this specific order to prevent production credentials from being silently overwritten or resources failing to bind:

1. **Sealed Secrets controller** (`sealed-secrets:install`) must exist *before* any SealedSecret resource is applied.
2. **Fetch cluster sealing certificate** (`env:fetch-cert`) must run *after* a cluster reset to update the sealing keys.
3. **Seal secrets** (`env:seal`) must occur *after* fetching the certificate, using the correct keypair.
4. **Install cert-manager** (`cert:install`) must be done to provision CRDs *before* `workspace:deploy` is called.
5. **DNS API Secret** (`cert:secret -- <key>`) must be stored in both namespaces *before* deploying to avoid ACME challenge failures.
6. **Install the Longhorn storage provisioner** (`task ha:setup`, or the helm install + `iscsid` enable inside `scripts/setup-ha-cluster.sh`) must exist *before* `workspace:deploy`. The `prod-mentolder/` overlay declares `storageClassName: longhorn` for `livekit-recordings-pvc`, `nextcloud-data-pvc`, `vaultwarden-data-pvc`, and `docuseal-data-pvc` (the last three added by #1165 / T000317). On a fresh cluster these PVCs stay **Pending forever** — and nextcloud, vaultwarden, docuseal, and livekit-egress never start — unless the `longhorn` StorageClass and the host-level `iscsid` service are present first. `local-path` (k3s built-in) does **not** satisfy these claims.
7. **Deploy workspace** (`workspace:deploy`) applies SealedSecrets and all other base manifests.

---

## Phase 1 — Environment Initialization & Deployment (New Cluster)

### Step 1.1: Scaffold Environment Config
If the environment YAML does not exist:
```bash
# Initialize from schema
task env:init ENV=<env>

# Edit configuration properties (domain, context name, overlay, SMTP, etc.)
$EDITOR environments/<env>.yaml

# Validate against the environment schema
task env:validate ENV=<env>
```

### Step 1.2: Install Sealed Secrets & Certs
```bash
# Install and verify controller
task sealed-secrets:install ENV=<env>
task sealed-secrets:status ENV=<env>

# Fetch sealing cert (writes to environments/certs/<env>.pem)
task env:fetch-cert ENV=<env>
```

### Step 1.3: Generate & Seal Credentials
```bash
# Generate plaintext config (gitignored)
task env:generate ENV=<env>
# Review environments/.secrets/<env>.yaml and replace MANAGED_EXTERNALLY placeholders.

# Seal and commit secrets
task env:seal ENV=<env>
git add environments/sealed-secrets/<env>.yaml && git commit -m "chore: sealed secrets for <env>"
```

### Step 1.4: Install Cert-Manager
```bash
task cert:install ENV=<env>

# Install the ipv64 DNS API key (required for ACME challenge)
task cert:secret -- <ipv64-api-key> ENV=<env>
```

### Step 1.4b: Install Longhorn Storage Provisioner (mentolder)
The `prod-mentolder/` overlay binds four PVCs to `storageClassName: longhorn`. Longhorn is **not** part of `workspace:deploy` — it is installed once by the HA bootstrap script. After a true teardown it must be re-installed before the workspace deploy.
```bash
# Full HA bootstrap (provisions k3s nodes + Traefik + Longhorn + iscsid)
task ha:setup
# ...or, if the k3s cluster already exists and only storage is missing, install Longhorn directly:
#   helm repo add longhorn https://charts.longhorn.io && helm repo update
#   helm install longhorn longhorn/longhorn -n longhorn-system --create-namespace
#   kubectl patch storageclass longhorn -p '{"metadata":{"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'
# iscsid must be enabled on EVERY node or Longhorn volumes fail to attach (see setup-ha-cluster.sh).

# Verify the StorageClass exists before deploying — else longhorn PVCs hang Pending:
kubectl --context <ctx> get storageclass longhorn
```

### Step 1.5: Workspace Deploy & Flux Bootstrap
```bash
# Apply SealedSecrets and base manifests
task workspace:deploy ENV=<env>

# Bootstrap Flux GitOps
kubectl apply -f flux/clusters/<env>/ --context <ctx>
flux reconcile source git flux-system --context <ctx>
flux reconcile kustomization workspace --context <ctx>
```

---

## Phase 2 — Deployment Assistance & Cluster Diagnosis

For existing clusters that may be degraded, follow this phased assessment flow:

### Step 2.1: Prerequisite Checks
Check that CLI utilities are available:
```bash
for tool in docker kubectl task k3d git flux kubeseal; do
  command -v $tool >/dev/null 2>&1 && echo "✅ $tool" || echo "❌ $tool MISSING"
done
```

### Step 2.2: Config & Secret Validation
Verify files are valid and present:
```bash
task env:validate ENV=<env>
# Check presence ofenvironments/sealed-secrets/<env>.yaml and environments/certs/<env>.pem
```

### Step 2.3: Namespace & Pod Status
Retrieve the status of running resources:
```bash
kubectl --context <ctx> -n <WORKSPACE_NAMESPACE> get pods
flux get kustomizations --context <ctx>
```
Diagnose any failing pods or Flux reconciliations:
```bash
flux describe kustomization workspace --context <ctx>
```

### Step 2.4: Execute Post-Deploy Setup Sequences
Once the base cluster is healthy, execute the post-deploy configurations in sequence:
```bash
task workspace:office:deploy ENV=<env>     # Deploy Collabora Office
task workspace:post-setup ENV=<env>        # Nextcloud app OIDC configs
task workspace:talk-setup ENV=<env>        # Signaling and coturn configs
task workspace:recording-setup ENV=<env>   # Recording backend configs
task workspace:admin-users-setup ENV=<env> # Provision Keycloak admin users
task workspace:vaultwarden:seed ENV=<env>  # Seed Vaultwarden credentials
```

---

## Phase 3 — dev.mentolder.de Stack Operations

The development stack runs inside a k3d cluster hosted on the LAN node `k3s-1`. 

### Step 3.1: Cluster Lifecycle
```bash
# Create cluster (MUST run from k3s-1 machine via task wrapper)
task dev:cluster:create

# Deploy dev resources (website + workspace manifests)
task dev:deploy
```

### Step 3.2: Development Tasks
* **Firewall Access:** Expose dev sish tunnels by opening the firewall:
  ```bash
  task dev:firewall:open
  ```
  *(Requires your public key in `DEV_SISH_AUTHORIZED_KEYS` and CIDR in `DEV_SSH_ALLOWLIST`).*
* **Database Refresh:** The dev DB drops and refreshes from prod snapshots nightly at 03:30 UTC. Force a manual refresh with:
  ```bash
  task dev:db:refresh
  ```
* **Secret Materialization:** In k3d, we do *not* run SealedSecrets. Instead, extract secrets into plaintext secrets inside the dev cluster:
  ```bash
  task dev:_materialise-secrets
  ```

---

## Troubleshooting & Common Blockers

| Component | Symptom | Fix |
|---|---|---|
| **Flux** | Old revision reconciled | Reconcile GitRepository source first: `flux reconcile source git flux-system --context <ctx>` |
| **Sealed Secrets** | Adoption refused by controller | Delete the plain secret first: `kubectl delete secret knowledge-secrets -n <ns>` |
| **Dev Access** | 403 authorization loop | Ensure the user is added to the Keycloak `/dev-access` group in the admin panel. |
| **Dev DB** | Data disappearing | Ensure you are not relying on dev DB data, as it is wiped and overwritten nightly. |

---

## Post-Execution: Mishap Report

After completing all steps in this skill, invoke `mishap-tracker` with your accumulated `MISHAP_LOG`. If no mishaps were found, `mishap-tracker` exits cleanly.
