# Cluster Deployment Skill Upgrade — Design

**Date:** 2026-05-30
**Topic:** Version pinning, runtime version discovery, and Hetzner node automation for the cluster-deployment skill

---

## Overview

The `cluster-deployment` skill is upgraded along two axes:

1. **Version awareness** — all component versions are discovered at runtime, pinned in `environments/versions.yaml`, and sourced by every install/upgrade command.
2. **Hetzner node automation** — cloud-init templates and a snapshot workflow eliminate manual node setup steps for both fresh provisioning and scaling/replacement.

---

## Architecture

### New Files

```
environments/versions.yaml               # pinned component versions (SSOT)
scripts/discover-versions.sh            # queries upstream, updates versions.yaml
scripts/hetzner/cloud-init.yaml.tmpl    # cloud-init template (envsubst)
scripts/hetzner/render-cloud-init.sh    # renders template for a specific node
scripts/hetzner/snapshot-guide.md       # how to create/maintain Hetzner snapshots
```

### Modified Files

```
.claude/skills/cluster-deployment/SKILL.md   # restructured into 4 phases
```

---

## Component Versions Manifest

**`environments/versions.yaml`** is the single source of truth for all component versions. It is never edited manually — only by `discover-versions.sh`.

```yaml
# Managed by scripts/discover-versions.sh — do not edit manually
k3s: v1.32.4+k3s1
flux: v2.5.1
sealed_secrets_chart: 2.17.3
cert_manager: v1.17.2
longhorn_chart: 1.8.1
```

> **Traefik note:** Traefik is managed by k3s's built-in HelmController (HelmChart CRD). Its version is pinned by k3s itself and should not be overridden here unless a `HelmChartConfig` override is introduced. Omit `traefik_chart` until that decision is made.

The skill sources this file at the top of any fresh-cluster operation:

```bash
source <(grep -v '^#' environments/versions.yaml | sed 's/: /=/')
```

---

## Version Discovery Script

**`scripts/discover-versions.sh`** queries upstream for each component:

| Component | Source |
|-----------|--------|
| k3s | GitHub releases API: `k3s-io/k3s` |
| Flux | GitHub releases API: `fluxcd/flux2` |
| Sealed Secrets | `helm search repo sealed-secrets/sealed-secrets -o json` |
| cert-manager | `helm search repo jetstack/cert-manager -o json` |
| Longhorn | `helm search repo longhorn/longhorn -o json` |
| Traefik | Managed by k3s HelmController — skip unless overriding via HelmChartConfig |

**Flags:**
- Default (no flags): dry-run, prints what would change
- `--update`: writes changes to `environments/versions.yaml`
- `--commit`: also stages and commits with message `chore: bump component versions to <date>`

**Skip heuristic:** If `versions.yaml` was modified within the last 7 days, the skill notes this and offers to skip discovery. In CI/automation contexts, `--update` only (no commit); the diff is logged.

Helm repos must be added before running:
```bash
helm repo add longhorn https://charts.longhorn.io
helm repo add sealed-secrets https://bitnami-labs.github.io/sealed-secrets
helm repo add jetstack https://charts.jetstack.io
helm repo add traefik https://traefik.github.io/charts
helm repo update
```

---

## Hetzner Node Setup

### Cloud-Init (Fresh Nodes)

**`scripts/hetzner/cloud-init.yaml.tmpl`** is an envsubst template covering:

- SSH key injection (`${HETZNER_SSH_KEY_NAME}` / authorized_keys)
- UFW rules: default-deny, allow 22/80/443/6443 + WireGuard port + LiveKit UDP ranges (50000-60000, 30000-40000)
- `open-iscsi` install + `iscsid` enable (required by Longhorn)
- WireGuard install + peer config from `wireguard/` templates (`${WG_PEER_CONFIG}`)
- k3s agent install: `INSTALL_K3S_VERSION=${k3s}`, joining via `${K3S_TOKEN}` + `${K3S_URL}`
- Node labels applied via k3s config: `node-role.kubernetes.io/worker=true`, `flannel-iface=wg-mesh`, `node-ip=${NODE_IP}`
- Hetzner-specific hardening: `DEBIAN_FRONTEND=noninteractive`, apt lock retry loop, unattended-upgrades disabled during provisioning

**`scripts/hetzner/render-cloud-init.sh`** — thin wrapper:
```bash
# Usage:
bash scripts/hetzner/render-cloud-init.sh ENV=mentolder NODE_IP=<public-ip> > /tmp/cloud-init-rendered.yaml
hcloud server create --user-data-from-file /tmp/cloud-init-rendered.yaml \
  --name <name> --type <type> --image ubuntu-24.04 --ssh-key <key>
```

Sources `environments/<env>.yaml`, `environments/versions.yaml`, and `environments/.secrets/<env>.yaml` (for `K3S_TOKEN`), then runs envsubst over the template.

### Snapshot (Scaling / Replacement)

**`scripts/hetzner/snapshot-guide.md`** documents the snapshot lifecycle:

1. Provision a base server with cloud-init (above)
2. Wait for node `Ready` in the cluster
3. Cordon + drain the node
4. Power off: `hcloud server poweroff <name>`
5. Snapshot: `hcloud server create-image <name> --type snapshot --description "k3s-worker-${k3s}-$(date +%Y%m%d)"`
6. Record the image ID in `environments/<env>.yaml` as `HETZNER_WORKER_SNAPSHOT_ID`
7. Resume the node or delete it

For scaling from snapshot:
```bash
hcloud server create --image $HETZNER_WORKER_SNAPSHOT_ID \
  --name <name> --type <type> --ssh-key <key>
```
No cloud-init needed — k3s agent auto-starts on boot.

**Snapshot refresh trigger:** Whenever `versions.yaml` bumps `k3s`, the skill's Phase 4 prompts to rebuild the snapshot.

---

## Updated Skill Structure

The skill is restructured from 3 phases to 4:

### Phase 0 — Version Discovery (new)

Runs at the start of any fresh-cluster operation. Invokes `discover-versions.sh --update --commit`. If `versions.yaml` is fresh (<7 days), operator may skip. Sources the file before proceeding.

### Phase 1 — Node Provisioning (new step prepended to existing Phase 1)

Fork on context:
- **Fresh node** → render cloud-init, `hcloud server create`, wait for `kubectl get node` Ready
- **Scaling/replacement** → `hcloud server create --image $HETZNER_WORKER_SNAPSHOT_ID`, wait for Ready

Existing Steps 1.1–1.5 (sealed secrets, certs, Longhorn, workspace deploy, Flux bootstrap) are unchanged in order but all `helm install` commands gain `--version $<component>_chart` and k3s installs use `INSTALL_K3S_VERSION=$k3s`.

### Phase 2 — Deployment Assistance & Diagnosis (enhanced)

Adds a **version drift check** step after Step 2.1:
```bash
# Compare deployed vs pinned versions
helm list -A -o json | jq '.[] | {name, chart, app_version}'
# Compare against environments/versions.yaml
```
Flags any component that is behind the pinned version. Operator decides whether to upgrade in-place or schedule.

### Phase 3 — dev.mentolder.de Stack Operations (lightly updated)

`task dev:cluster:create` note: k3d image tag should match the pinned k3s version. Add to the dev deploy preamble:
```bash
source <(grep -v '^#' environments/versions.yaml | sed 's/: /=/')
# k3d cluster create uses --image rancher/k3s:${k3s}-k3s1
```

### Phase 4 — Snapshot Maintenance (new)

Short section: when `versions.yaml` bumps `k3s`, rebuild the Hetzner worker snapshot following `scripts/hetzner/snapshot-guide.md`. Record new image ID in `environments/<env>.yaml` and commit.

---

## Error Handling

- `discover-versions.sh` exits non-zero if any upstream query fails; the operator is prompted to retry or manually set the version.
- `render-cloud-init.sh` aborts if any required env var is unset (uses `set -u`).
- If a node doesn't reach `Ready` within a configurable timeout (default 5 min), the skill logs the node events and halts.

---

## Testing

- `discover-versions.sh --dry-run` (default) is safe to run any time; verify it parses all upstreams correctly.
- Render a cloud-init file for a non-existent node to validate envsubst coverage: `bash scripts/hetzner/render-cloud-init.sh ENV=mentolder NODE_IP=1.2.3.4 | yamllint -`.
- Existing BATS tests (`task test:all`) cover kustomize manifest structure — the Longhorn StorageClass requirement is already tested.

---

## Out of Scope

- Automating `hcloud server create` end-to-end from within the skill (operator still runs `hcloud` CLI manually with the rendered file — full automation is Phase 2 work).
- Version pinning for application-layer Helm charts (Nextcloud, Vaultwarden, etc.) — those are separately managed.
- Korczewski cluster node automation — korczewski runs on the user's GPU machine, not Hetzner.
