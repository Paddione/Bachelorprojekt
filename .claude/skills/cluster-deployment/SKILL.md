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

When setting up a new environment from scratch, execute in this order:

0. **Discover and pin component versions** (Phase 0) before any install step.
1. **Provision Hetzner nodes** (Phase 1, Step 1.0) — cloud-init for fresh nodes, snapshot for scaling.
2. **Sealed Secrets controller** (`sealed-secrets:install`) must exist *before* any SealedSecret resource is applied.
3. **Fetch cluster sealing certificate** (`env:fetch-cert`) must run *after* a cluster reset to update the sealing keys.
4. **Seal secrets** (`env:seal`) must occur *after* fetching the certificate, using the correct keypair.
5. **Install cert-manager** (`cert:install`) must be done to provision CRDs *before* `workspace:deploy` is called.
6. **DNS API Secret** (`cert:secret -- <key>`) must be stored in both namespaces *before* deploying to avoid ACME challenge failures.
7. **Install Longhorn storage provisioner** — must exist *before* `workspace:deploy`. The `prod-mentolder/` overlay declares `storageClassName: longhorn` for `livekit-recordings-pvc`, `nextcloud-data-pvc`, `vaultwarden-data-pvc`, and `docuseal-data-pvc`. On a fresh cluster these PVCs stay **Pending forever** unless the `longhorn` StorageClass and host-level `iscsid` are present first.
8. **Deploy workspace** (`workspace:deploy`) applies SealedSecrets and all other base manifests.

---

## Phase 0 — Version Discovery & Pinning (New Cluster or Upgrade)

Run at the start of any fresh cluster operation or before any component upgrade.

```bash
# Check what's available upstream (dry run — no changes)
bash scripts/discover-versions.sh

# If versions.yaml is older than 7 days or you want to upgrade:
bash scripts/discover-versions.sh --update --commit

# Source pinned versions for all subsequent commands in this session
source <(grep -v '^#' environments/versions.yaml | sed 's/: /=/')
export K3S_VERSION="${k3s}"
```

After sourcing, the following shell variables are available:
- `$k3s` / `$K3S_VERSION` — k3s version for node install
- `$flux` — Flux version
- `$sealed_secrets_chart` — Helm chart version
- `$cert_manager` — Helm chart version
- `$longhorn_chart` — Helm chart version

> **Skip heuristic:** If `environments/versions.yaml` was modified within the last 7 days and you are not intentionally upgrading, you may skip the `--update` call and go straight to sourcing.

---

## Phase 1 — Environment Initialization & Deployment (New Cluster)

### Step 1.0: Provision Hetzner Nodes

Node roles for each environment:
- **korczewski**: `pk-hetzner-4` = control-plane (server); `pk-hetzner-6`, `pk-hetzner-8` = workers (agent)
- **mentolder**: `gekko-hetzner-2/3/4` = control-plane (server); Raspberry Pi `k3w-*` = workers (agent)

Fork based on role:

**Control-plane node (cluster-init — first CP only):**
```bash
# WireGuard private key from environments/.secrets/<env>.yaml → WG_MESH_<SCHEMA_KEY>_PRIVATE_KEY
WG_KEY=$(grep WG_MESH_PK4_PRIVATE_KEY environments/.secrets/korczewski.yaml | awk '{print $2}')
WG_CONF_B64=$(bash scripts/hetzner/generate-wg-conf.sh \
  --env korczewski --node-name pk-hetzner-4 --private-key "$WG_KEY" | base64 -w0)

bash scripts/hetzner/render-cloud-init.sh \
  --template scripts/hetzner/cloud-init-server.yaml.tmpl \
  --node-ip 204.168.244.104 --node-wg-ip 10.13.14.1 --wg-listen-port 51820 \
  --k3s-url "" --k3s-token <TOKEN> \
  --ssh-key "$(cat ~/.ssh/id_ed25519.pub)" \
  --wg-conf-b64 "$WG_CONF_B64" \
  > /tmp/ci-pk4.yaml

hcloud server create \
  --name pk-hetzner-4 --type cx22 \
  --image ubuntu-24.04 \
  --ssh-key <KEY_NAME> \
  --user-data-from-file /tmp/ci-pk4.yaml
kubectl --context korczewski get nodes -w
```

**Worker node (agent — joins existing CP):**
```bash
# Retrieve k3s join token from the running CP node
K3S_TOKEN=$(ssh patrick@204.168.244.104 "sudo cat /var/lib/rancher/k3s/server/node-token")

WG_KEY=$(grep WG_MESH_PK6_PRIVATE_KEY environments/.secrets/korczewski.yaml | awk '{print $2}')
WG_CONF_B64=$(bash scripts/hetzner/generate-wg-conf.sh \
  --env korczewski --node-name pk-hetzner-6 --private-key "$WG_KEY" | base64 -w0)

bash scripts/hetzner/render-cloud-init.sh \
  --node-ip 37.27.251.38 --node-wg-ip 10.13.14.2 --wg-listen-port 51820 \
  --k3s-url https://10.13.14.1:6443 --k3s-token "$K3S_TOKEN" \
  --ssh-key "$(cat ~/.ssh/id_ed25519.pub)" \
  --wg-conf-b64 "$WG_CONF_B64" \
  > /tmp/ci-pk6.yaml

hcloud server create \
  --name pk-hetzner-6 --type cx22 \
  --image ubuntu-24.04 \
  --ssh-key <KEY_NAME> \
  --user-data-from-file /tmp/ci-pk6.yaml
kubectl --context korczewski get nodes -w
```

> Node data (IPs, WG IPs, schema keys) is the source of truth in `wireguard/wg-mesh-nodes.yaml`.
> Adding a node there automatically includes it in every other node's WireGuard peer list.

**Scaling/replacement (snapshot):**
```bash
# Load snapshot ID recorded during last snapshot creation
source <(bash scripts/env-resolve.sh <env> 2>/dev/null) || true
hcloud server create \
  --name <name> --type cx22 \
  --image "${HETZNER_WORKER_SNAPSHOT_ID}" \
  --ssh-key <KEY_NAME>
# k3s agent starts automatically — no cloud-init needed
kubectl --context <ctx> get nodes -w
```

### Step 1.1: Scaffold Environment Config
If the environment YAML does not exist:
```bash
task env:init ENV=<env>
$EDITOR environments/<env>.yaml
task env:validate ENV=<env>
```

### Step 1.2: Install Sealed Secrets & Certs
```bash
# Phase 0 must have been run first — $sealed_secrets_chart must be set
helm repo add sealed-secrets https://bitnami-labs.github.io/sealed-secrets && helm repo update
helm install sealed-secrets sealed-secrets/sealed-secrets \
  -n kube-system \
  --version "${sealed_secrets_chart}"
task sealed-secrets:status ENV=<env>
task env:fetch-cert ENV=<env>
```

### Step 1.3: Generate & Seal Credentials
```bash
task env:generate ENV=<env>
# Review environments/.secrets/<env>.yaml and replace MANAGED_EXTERNALLY placeholders.
task env:seal ENV=<env>
git add environments/sealed-secrets/<env>.yaml && git commit -m "chore: sealed secrets for <env>"
```

### Step 1.4: Install Cert-Manager (pinned version)
```bash
# Phase 0 must have been run first — $cert_manager must be set
helm repo add jetstack https://charts.jetstack.io && helm repo update
helm install cert-manager jetstack/cert-manager \
  -n cert-manager --create-namespace \
  --version "${cert_manager}" \
  --set crds.enabled=true

task cert:secret -- <ipv64-api-key> ENV=<env>
```

### Step 1.4b: Install Longhorn (pinned version)
```bash
# Phase 0 must have been run first — $longhorn_chart must be set
helm repo add longhorn https://charts.longhorn.io && helm repo update
helm install longhorn longhorn/longhorn \
  -n longhorn-system --create-namespace \
  --version "${longhorn_chart}"
kubectl patch storageclass longhorn \
  -p '{"metadata":{"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'

# iscsid must be enabled on EVERY node (handled by cloud-init — verify):
# kubectl --context <ctx> get nodes -o wide
kubectl --context <ctx> get storageclass longhorn
```

### Step 1.5: Workspace Deploy & Flux Bootstrap
```bash
task workspace:deploy ENV=<env>
kubectl apply -f flux/clusters/<env>/ --context <ctx>
flux reconcile source git flux-system --context <ctx>
flux reconcile kustomization workspace --context <ctx>
```

---

## Phase 2 — Deployment Assistance & Cluster Diagnosis

For existing clusters that may be degraded, follow this phased assessment flow:

### Step 2.1: Prerequisite Checks
```bash
for tool in docker kubectl task k3d git flux kubeseal helm; do
  command -v $tool >/dev/null 2>&1 && echo "✅ $tool" || echo "❌ $tool MISSING"
done
```

### Step 2.2: Version Drift Check
Compare deployed component versions against pinned versions:
```bash
source <(grep -v '^#' environments/versions.yaml | sed 's/: /=/')
echo "Pinned versions:"
echo "  sealed-secrets: $sealed_secrets_chart"
echo "  cert-manager:   $cert_manager"
echo "  longhorn:       $longhorn_chart"
echo ""
echo "Deployed versions:"
helm list -A -o json | jq -r \
  '.[] | select(.name | test("sealed-secrets|cert-manager|longhorn")) | "  \(.name): \(.chart)"'
```
Flag any component that is behind the pinned version and schedule an upgrade.

### Step 2.3: Config & Secret Validation
```bash
task env:validate ENV=<env>
# Verify presence of environments/sealed-secrets/<env>.yaml and environments/certs/<env>.pem
```

### Step 2.4: Namespace & Pod Status
```bash
kubectl --context <ctx> -n <WORKSPACE_NAMESPACE> get pods
flux get kustomizations --context <ctx>
flux describe kustomization workspace --context <ctx>
```

### Step 2.5: Execute Post-Deploy Setup Sequences
```bash
task workspace:office:deploy ENV=<env>
task workspace:post-setup ENV=<env>
task workspace:talk-setup ENV=<env>
task workspace:recording-setup ENV=<env>
task workspace:admin-users-setup ENV=<env>
task workspace:vaultwarden:seed ENV=<env>
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

Note: the k3d image tag should match the pinned k3s version. If `dev:cluster:create`
supports a `K3S_VERSION` env var, source `environments/versions.yaml` first:
```bash
source <(grep -v '^#' environments/versions.yaml | sed 's/: /=/')
K3S_VERSION="${k3s}" task dev:cluster:create
```

### Step 3.2: Development Tasks
```bash
# Expose dev sish tunnels
task dev:firewall:open

# Force DB refresh from prod snapshot
task dev:db:refresh

# Materialise secrets into dev cluster (no SealedSecrets controller in k3d)
task dev:_materialise-secrets
```

---

## Phase 4 — Snapshot Maintenance

After any `k3s` version bump in `environments/versions.yaml`, rebuild the Hetzner worker snapshot so scaling nodes stay in sync with fresh nodes.

```bash
# 1. Confirm the bump
grep "^k3s:" environments/versions.yaml

# 2. Follow scripts/hetzner/snapshot-guide.md to:
#    - provision a fresh base node with cloud-init
#    - wait for Ready, cordon/drain, power off
#    - hcloud server create-image → note new snapshot ID
#    - update environments/<env>.yaml HETZNER_WORKER_SNAPSHOT_ID
#    - commit

# 3. Verify the ID is recorded
grep HETZNER_WORKER_SNAPSHOT_ID environments/<env>.yaml
```

---

## Troubleshooting & Common Blockers

| Component | Symptom | Fix |
|---|---|---|
| **Flux** | Old revision reconciled | Reconcile GitRepository source first: `flux reconcile source git flux-system --context <ctx>` |
| **Sealed Secrets** | Adoption refused by controller | Delete the plain secret first: `kubectl delete secret knowledge-secrets -n <ns>` |
| **Dev Access** | 403 authorization loop | Add user to Keycloak `/dev-access` group in the admin panel |
| **Dev DB** | Data disappearing | Dev DB is wiped and overwritten nightly — do not rely on it for persistent data |
| **Longhorn PVC** | PVC stuck Pending | Verify `kubectl get storageclass longhorn` exists; check `iscsid` is running on all nodes |
| **Version drift** | Helm chart mismatch | Run Phase 0 version discovery + upgrade the drifted component via `helm upgrade` with pinned version |
| **Snapshot stale** | New node joins with old k3s | Rebuild snapshot per Phase 4 after any k3s bump in versions.yaml |

---

## Post-Execution: Mishap Report

After completing all steps in this skill, invoke `mishap-tracker` with your accumulated `MISHAP_LOG`. If no mishaps were found, `mishap-tracker` exits cleanly.
