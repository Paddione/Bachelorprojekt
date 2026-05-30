# Hetzner Worker Node Snapshot Guide

Use snapshots for rapid node replacement or cluster scaling. A snapshot captures
a fully-bootstrapped worker (cloud-init applied, k3s agent running, WireGuard
connected) so new nodes skip the install steps.

## Creating a Snapshot

1. **Provision a base node** using cloud-init:
   ```bash
   bash scripts/hetzner/render-cloud-init.sh \
     --node-ip <PUBLIC_IP> \
     --k3s-url <K3S_URL> \
     --k3s-token <TOKEN> \
     --ssh-key "$(cat ~/.ssh/id_ed25519.pub)" \
     --wg-conf-b64 <BASE64_WG_CONF> \
     > /tmp/ci.yaml
   hcloud server create \
     --name snapshot-base \
     --type cx22 \
     --image ubuntu-24.04 \
     --ssh-key <KEY_NAME> \
     --user-data-from-file /tmp/ci.yaml
   ```

2. **Wait for node to appear Ready** in the cluster:
   ```bash
   kubectl --context <CTX> get nodes -w
   ```

3. **Cordon and drain** so no workloads land on it during snapshotting:
   ```bash
   kubectl --context <CTX> cordon snapshot-base
   kubectl --context <CTX> drain snapshot-base --ignore-daemonsets --delete-emptydir-data
   ```

4. **Power off** the server:
   ```bash
   hcloud server poweroff snapshot-base
   ```

5. **Create the snapshot** (takes ~1–2 min):
   ```bash
   K3S_VERSION=$(grep "^k3s:" environments/versions.yaml | awk '{print $2}')
   DATE=$(date +%Y%m%d)
   hcloud server create-image snapshot-base \
     --type snapshot \
     --description "k3s-worker-${K3S_VERSION}-${DATE}"
   ```
   Note the snapshot ID printed in the output.

6. **Record the snapshot ID** in `environments/<env>.yaml`:
   ```yaml
   setup_vars:
     HETZNER_WORKER_SNAPSHOT_ID: "12345678"
   ```
   Commit this change.

7. **Delete or repurpose** the base server:
   ```bash
   hcloud server delete snapshot-base
   ```

## Scaling from Snapshot

```bash
SNAPSHOT_ID=$(grep HETZNER_WORKER_SNAPSHOT_ID environments/<env>.yaml | awk '{print $2}')
hcloud server create \
  --name <new-node-name> \
  --type cx22 \
  --image "$SNAPSHOT_ID" \
  --ssh-key <KEY_NAME>
```

k3s agent starts automatically on boot and rejoins the cluster.
No cloud-init needed.

## Snapshot Refresh Policy

Rebuild the snapshot whenever `environments/versions.yaml` bumps `k3s:`.
Stale snapshots join as old k3s versions and may behave unexpectedly.
The cluster-deployment skill Phase 4 prompts for a refresh after any k3s bump.
