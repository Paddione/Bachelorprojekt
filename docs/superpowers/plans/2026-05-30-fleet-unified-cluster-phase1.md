---
domains: [infra]
status: ready
spec: docs/superpowers/specs/2026-05-30-fleet-unified-cluster-design.md
---

# fleet Unified Cluster — Phase 1 (Provision 3 CPs) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up an empty, healthy 3-control-plane HA k3s cluster named `fleet` on the existing pk-hetzner-4/6/8 boxes, on a fresh `wg-fleet` WireGuard mesh, running k3s `v1.36.1+k3s1`.

**Architecture:** SSH in-place re-bootstrap of three SSH-managed boxes that currently run live korczewski. A backup-verify gate runs first (teardown is irreversible). pk-4 bootstraps embedded etcd via `--cluster-init`; pk-6/pk-8 join as additional control-plane/etcd members. The pod overlay rides the new mesh via `--flannel-iface=wg-fleet` — the fix the 2026-05 reverted merge lacked.

**Tech Stack:** k3s (embedded etcd HA), WireGuard (`wg-fleet`), flannel (vxlan over wg), SealedSecrets, bash provisioning scripts, SSH.

**Scope boundary (hard):** NO workloads, secrets-on-cluster, Longhorn, cert-manager, Flux, or data. Done when `kubectl --context fleet get nodes` shows 3x `Ready control-plane,etcd v1.36.1+k3s1`. Phases 2+ (both-brand hosting, storage, data restore, worker join, decommission) are separate specs/plans.

**Node facts (verified 2026-05-30):**
| Node | SSH public IP | wg-fleet IP | schema_key |
|---|---|---|---|
| pk-hetzner-4 | 204.168.244.104 | 10.20.0.1 | WG_MESH_PK4_FLEET |
| pk-hetzner-6 | 37.27.251.38   | 10.20.0.2 | WG_MESH_PK6_FLEET |
| pk-hetzner-8 | 62.238.23.79   | 10.20.0.3 | WG_MESH_PK8_FLEET |

SSH user: `patrick` (verified reachable to all three; sudo available). k3s version pinned in `environments/versions.yaml` → `k3s: v1.36.1+k3s1`.

## File map

- Modify: `wireguard/wg-mesh-nodes.yaml` — add `fleet:` block (subnet, port, 3 CP peers + public keys)
- Create: `environments/fleet.yaml` — env config scaffold (from korczewski shape)
- Create: `environments/.secrets/fleet.yaml` — **gitignored** — k3s token + 3 CP wg private keys
- Reference (no edit): `scripts/hetzner/generate-wg-conf.sh`, `scripts/hetzner/cloud-init-server.yaml.tmpl` (script source of truth for the k3s/wg/ufw steps)

---

### Task 0: Pre-flight tooling

**Files:** none (local environment)

- [x] **Step 1: Verify required local tools**

Run:
```bash
for t in kubectl ssh kubeseal yq base64; do command -v "$t" >/dev/null && echo "OK $t" || echo "MISSING $t"; done
command -v wg >/dev/null && echo "OK wg" || echo "MISSING wg (install wireguard-tools for keygen)"
```
Expected: all `OK`. If `wg` is MISSING, install it (`sudo apt-get install -y wireguard-tools`) — needed to generate the fresh CP keypairs. `yq` is used to edit the mesh registry; if missing, install `yq` (mikefarah) or edit YAML by hand.

- [x] **Step 2: Confirm pinned k3s version**

Run: `grep '^k3s:' environments/versions.yaml`
Expected: `k3s: v1.36.1+k3s1`

- [x] **Step 3: Re-verify SSH reachability (non-destructive)**

Run:
```bash
for h in 204.168.244.104 37.27.251.38 62.238.23.79; do
  ssh -o BatchMode=yes -o ConnectTimeout=8 patrick@$h 'echo OK $(hostname)'; done
```
Expected: `OK pk-hetzner-4`, `OK pk-hetzner-6`, `OK pk-hetzner-8`.

---

### Task 1: Backup-verify gate (BLOCKING — runs before any teardown)

**Files:** none (verification only); record evidence in commit message of Task 4.

- [x] **Step 1: Confirm a fresh restorable korczewski backup exists on Filen**

Run:
```bash
bash scripts/backup-restore.sh filen-pull --env korczewski --list 2>&1 | tail -20 || \
  echo "FALLBACK: inspect scripts/backup-restore.sh for the correct --list/list subcommand"
```
Expected: a recent (today) backup artifact listed covering the korczewski DB and the
4 Longhorn PVCs (`nextcloud-data`, `vaultwarden-data`, `docuseal-data`, `livekit-recordings`).

> If `--list` is not the supported flag, read `scripts/backup-restore.sh` usage header
> and use the documented subcommand. Do NOT proceed past this task without a confirmed,
> dated, restorable backup.

- [x] **Step 2: Record the backup evidence**

Capture the snapshot id/timestamp into a scratch note:
```bash
echo "korczewski backup verified $(date -u +%FT%TZ): <SNAPSHOT_ID/PATH>" | tee /tmp/fleet-backup-evidence.txt
```
Expected: file written. This string goes into the Task 4 commit body.

- [x] **Step 3: GATE — explicit human confirmation**

STOP. Do not continue to Task 2's destructive steps until a human confirms the backup
is acceptable. Teardown of pk-4 destroys live korczewski etcd irreversibly.

---

### Task 2: Generate wg-fleet keypairs + secrets file

**Files:**
- Create: `environments/.secrets/fleet.yaml` (gitignored)

- [x] **Step 1: Confirm `.secrets/` is gitignored**

Run: `git check-ignore environments/.secrets/fleet.yaml && echo IGNORED || echo "NOT IGNORED — STOP"`
Expected: `IGNORED`. If not ignored, stop and fix `.gitignore` before writing secrets.

- [x] **Step 2: Generate 3 fresh WireGuard keypairs**

Run:
```bash
for n in PK4 PK6 PK8; do
  priv=$(wg genkey); pub=$(echo "$priv" | wg pubkey)
  echo "WG_MESH_${n}_FLEET_PRIVATE_KEY: $priv"
  echo "# WG_MESH_${n}_FLEET public: $pub"
done
```
Expected: three private keys + their public keys printed. **Record the public keys** —
they go into `wg-mesh-nodes.yaml` (Task 3); private keys go into the secrets file.

- [x] **Step 3: Generate the k3s cluster token**

Run: `echo "K3S_FLEET_TOKEN: $(openssl rand -hex 32)"`
Expected: a 64-char hex token.

- [x] **Step 4: Write `environments/.secrets/fleet.yaml`**

Create the file with the four secrets from steps 2–3:
```yaml
# environments/.secrets/fleet.yaml — GITIGNORED. Input to `task env:seal` later.
K3S_FLEET_TOKEN: <token from step 3>
WG_MESH_PK4_FLEET_PRIVATE_KEY: <priv from step 2>
WG_MESH_PK6_FLEET_PRIVATE_KEY: <priv from step 2>
WG_MESH_PK8_FLEET_PRIVATE_KEY: <priv from step 2>
```

- [x] **Step 5: Verify the file parses and is not staged**

Run: `yq '. | keys' environments/.secrets/fleet.yaml && git status --porcelain environments/.secrets/fleet.yaml`
Expected: 4 keys listed; `git status` prints **nothing** (ignored).

---

### Task 3: Add `fleet:` block to the mesh registry

**Files:**
- Modify: `wireguard/wg-mesh-nodes.yaml`

- [x] **Step 1: Append the `fleet:` block**

Add at the end of `wireguard/wg-mesh-nodes.yaml`, substituting the **public** keys from Task 2 Step 2:
```yaml
fleet:
  # Unified consolidation cluster — fresh mesh (design 2026-05-30).
  wg_subnet: "10.20.0.0/24"
  listen_port: 51820
  nodes:
    - name: pk-hetzner-4
      endpoint: "204.168.244.104:51820"
      wg_ip: "10.20.0.1"
      schema_key: WG_MESH_PK4_FLEET
      public_key: "<pk4 public key>"
    - name: pk-hetzner-6
      endpoint: "37.27.251.38:51820"
      wg_ip: "10.20.0.2"
      schema_key: WG_MESH_PK6_FLEET
      public_key: "<pk6 public key>"
    - name: pk-hetzner-8
      endpoint: "62.238.23.79:51820"
      wg_ip: "10.20.0.3"
      schema_key: WG_MESH_PK8_FLEET
      public_key: "<pk8 public key>"
```

- [x] **Step 2: Verify the generator accepts the new env**

Run:
```bash
bash scripts/hetzner/generate-wg-conf.sh --env fleet --node-name pk-hetzner-4 \
  --private-key "$(grep PK4_FLEET environments/.secrets/fleet.yaml | awk '{print $2}')" | head -20
```
Expected: a valid `[Interface]` + two `[Peer]` blocks (pk-6, pk-8), Address `10.20.0.1/24`,
ListenPort `51820`. If the script errors on `--env fleet`, read it — it may key off the
top-level YAML map name; the `fleet:` block added in Step 1 satisfies that.

- [x] **Step 3: Commit the registry change**

```bash
git add wireguard/wg-mesh-nodes.yaml
git commit -m "feat(infra): add fleet wg-mesh block (3 CP nodes, 10.20.0.0/24)"
```

---

### Task 4: Scaffold `environments/fleet.yaml`

**Files:**
- Create: `environments/fleet.yaml`

- [x] **Step 1: Write the env config**

```yaml
# environments/fleet.yaml — unified consolidation cluster (Phase 1: empty 3-CP).
environment: fleet
context: fleet
domain: PLACEHOLDER-PHASE2   # both brands resolved in Phase 2 — not used by bootstrap
overlay: prod-fleet          # created in Phase 2; no overlay applied in Phase 1
workspace_namespace: workspace
env_vars: {}
setup_vars: {}
```

- [x] **Step 2: Sanity-parse**

Run: `yq '.environment, .context' environments/fleet.yaml`
Expected: `fleet` then `fleet`.

> Do NOT run `task env:validate ENV=fleet` here — schema validation expects a full prod
> env (domain/SMTP/etc.) that Phase 1 intentionally omits. Validation belongs to Phase 2.

- [x] **Step 3: Commit**

```bash
git add environments/fleet.yaml
git commit -m "feat(infra): scaffold fleet env config (Phase 1 bootstrap)

korczewski backup verified before teardown:
$(cat /tmp/fleet-backup-evidence.txt)"
```

---

### Task 5: Bootstrap pk-hetzner-4 (first CP, cluster-init)

**Files:** none (remote node mutation over SSH)

- [x] **Step 1: Render the wg-fleet config for pk-4 and the k3s install command**

Run locally:
```bash
PK4_PRIV=$(grep PK4_FLEET environments/.secrets/fleet.yaml | awk '{print $2}')
TOKEN=$(grep K3S_FLEET_TOKEN environments/.secrets/fleet.yaml | awk '{print $2}')
bash scripts/hetzner/generate-wg-conf.sh --env fleet --node-name pk-hetzner-4 \
  --private-key "$PK4_PRIV" > /tmp/wg-fleet-pk4.conf
cat /tmp/wg-fleet-pk4.conf
```
Expected: valid wg config printed.

- [x] **Step 2: Tear down old korczewski k3s on pk-4 + install prerequisites**

Run:
```bash
ssh patrick@204.168.244.104 'sudo /usr/local/bin/k3s-uninstall.sh; \
  sudo apt-get update -qq && sudo apt-get install -y wireguard open-iscsi ufw curl jq'
```
Expected: uninstall completes (or "not found" if already gone); packages install.

- [x] **Step 3: Install wg-fleet on pk-4**

Run:
```bash
scp /tmp/wg-fleet-pk4.conf patrick@204.168.244.104:/tmp/wg-fleet.conf
ssh patrick@204.168.244.104 'sudo install -m600 /tmp/wg-fleet.conf /etc/wireguard/wg-fleet.conf && \
  sudo systemctl enable --now wg-quick@wg-fleet && \
  sudo wg show wg-fleet | head -5'
```
Expected: `interface: wg-fleet` with listening port 51820 and 2 peers.

- [x] **Step 4: UFW rules on pk-4**

Run:
```bash
ssh patrick@204.168.244.104 'sudo ufw allow 22/tcp && sudo ufw allow 51820/udp && \
  sudo ufw allow in on wg-fleet to any port 6443 proto tcp && \
  sudo ufw allow in on wg-fleet to any port 8472 proto udp && \
  sudo ufw allow in on wg-fleet to any port 10250 proto tcp && \
  sudo ufw --force enable && sudo ufw status verbose | head -20'
```
Expected: rules present, ufw active.

- [x] **Step 5: Install k3s with cluster-init**

Run:
```bash
ssh patrick@204.168.244.104 "curl -sfL https://get.k3s.io | \
  INSTALL_K3S_VERSION=v1.36.1+k3s1 sh -s - server \
  --cluster-init --flannel-iface=wg-fleet \
  --node-ip=10.20.0.1 --tls-san=10.20.0.1 --token='$TOKEN'"
```
Expected: install completes, `k3s` service active.

- [x] **Step 6: Verify pk-4 is Ready**

Run: `ssh patrick@204.168.244.104 'sudo k3s kubectl get nodes -o wide'`
Expected: `pk-hetzner-4  Ready  control-plane,etcd  v1.36.1+k3s1  10.20.0.1`.

---

### Task 6: Join pk-hetzner-6 and pk-hetzner-8 (server-join)

**Files:** none (remote node mutation over SSH)

- [x] **Step 1: pk-6 — render wg config, tear down, prereqs, wg, ufw**

Run (mirrors Task 5 Steps 1–4 with pk-6 values):
```bash
PK6_PRIV=$(grep PK6_FLEET environments/.secrets/fleet.yaml | awk '{print $2}')
bash scripts/hetzner/generate-wg-conf.sh --env fleet --node-name pk-hetzner-6 \
  --private-key "$PK6_PRIV" > /tmp/wg-fleet-pk6.conf
ssh patrick@37.27.251.38 'sudo /usr/local/bin/k3s-uninstall.sh; sudo apt-get update -qq && \
  sudo apt-get install -y wireguard open-iscsi ufw curl jq'
scp /tmp/wg-fleet-pk6.conf patrick@37.27.251.38:/tmp/wg-fleet.conf
ssh patrick@37.27.251.38 'sudo install -m600 /tmp/wg-fleet.conf /etc/wireguard/wg-fleet.conf && \
  sudo systemctl enable --now wg-quick@wg-fleet && \
  sudo ufw allow 22/tcp && sudo ufw allow 51820/udp && \
  sudo ufw allow in on wg-fleet to any port 6443 proto tcp && \
  sudo ufw allow in on wg-fleet to any port 8472 proto udp && \
  sudo ufw allow in on wg-fleet to any port 10250 proto tcp && \
  sudo ufw --force enable && sudo wg show wg-fleet | head -3'
```
Expected: wg-fleet up on pk-6 with peers.

- [x] **Step 2: pk-6 — join as control-plane**

Run:
```bash
TOKEN=$(grep K3S_FLEET_TOKEN environments/.secrets/fleet.yaml | awk '{print $2}')
ssh patrick@37.27.251.38 "curl -sfL https://get.k3s.io | \
  INSTALL_K3S_VERSION=v1.36.1+k3s1 sh -s - server \
  --server https://10.20.0.1:6443 --flannel-iface=wg-fleet \
  --node-ip=10.20.0.2 --tls-san=10.20.0.2 --token='$TOKEN'"
```
Expected: install completes.

- [x] **Step 3: pk-8 — render wg config, tear down, prereqs, wg, ufw**

Run (same as Step 1 with pk-8 = 62.238.23.79, PK8, 10.20.0.3):
```bash
PK8_PRIV=$(grep PK8_FLEET environments/.secrets/fleet.yaml | awk '{print $2}')
bash scripts/hetzner/generate-wg-conf.sh --env fleet --node-name pk-hetzner-8 \
  --private-key "$PK8_PRIV" > /tmp/wg-fleet-pk8.conf
ssh patrick@62.238.23.79 'sudo /usr/local/bin/k3s-uninstall.sh; sudo apt-get update -qq && \
  sudo apt-get install -y wireguard open-iscsi ufw curl jq'
scp /tmp/wg-fleet-pk8.conf patrick@62.238.23.79:/tmp/wg-fleet.conf
ssh patrick@62.238.23.79 'sudo install -m600 /tmp/wg-fleet.conf /etc/wireguard/wg-fleet.conf && \
  sudo systemctl enable --now wg-quick@wg-fleet && \
  sudo ufw allow 22/tcp && sudo ufw allow 51820/udp && \
  sudo ufw allow in on wg-fleet to any port 6443 proto tcp && \
  sudo ufw allow in on wg-fleet to any port 8472 proto udp && \
  sudo ufw allow in on wg-fleet to any port 10250 proto tcp && \
  sudo ufw --force enable && sudo wg show wg-fleet | head -3'
```
Expected: wg-fleet up on pk-8.

- [x] **Step 4: pk-8 — join as control-plane**

Run:
```bash
ssh patrick@62.238.23.79 "curl -sfL https://get.k3s.io | \
  INSTALL_K3S_VERSION=v1.36.1+k3s1 sh -s - server \
  --server https://10.20.0.1:6443 --flannel-iface=wg-fleet \
  --node-ip=10.20.0.3 --tls-san=10.20.0.3 --token='$TOKEN'"
```
Expected: install completes.

- [x] **Step 5: Verify 3-node etcd quorum from pk-4**

Run: `ssh patrick@204.168.244.104 'sudo k3s kubectl get nodes -o wide'`
Expected: 3x `Ready control-plane,etcd v1.36.1+k3s1` with IPs `10.20.0.1/2/3`.

---

### Task 7: Wire up local `fleet` kubecontext + final verification

**Files:** `~/.kube/config` (local, not committed)

- [x] **Step 1: Confirm workstation can reach 10.20.0.1:6443**

The workstation (`pk-l-1`) is already a korczewski mesh participant but NOT yet on
`wg-fleet`. Choose ONE:
- (a) SSH tunnel: `ssh -fN -L 16443:10.20.0.1:6443 patrick@204.168.244.104` (then use
  `https://127.0.0.1:16443` as the server), OR
- (b) add the workstation to `wg-fleet` (deferred worker-join territory — prefer the tunnel for Phase 1).

Run (option a): `ssh -fN -L 16443:10.20.0.1:6443 patrick@204.168.244.104 && echo tunnel-up`
Expected: `tunnel-up`.

- [x] **Step 2: Fetch + rewrite kubeconfig as context `fleet`**

Run:
```bash
ssh patrick@204.168.244.104 'sudo cat /etc/rancher/k3s/k3s.yaml' \
  | sed 's#https://127.0.0.1:6443#https://127.0.0.1:16443#' \
  | sed 's#: default#: fleet#g; s#name: default#name: fleet#g' > /tmp/fleet.kubeconfig
KUBECONFIG=~/.kube/config:/tmp/fleet.kubeconfig kubectl config view --flatten > /tmp/merged.kubeconfig
cp ~/.kube/config ~/.kube/config.bak.$(date +%s) && cp /tmp/merged.kubeconfig ~/.kube/config
kubectl config get-contexts -o name | grep fleet
```
Expected: `fleet` context present. (A backup of the previous kubeconfig is kept.)

- [x] **Step 3: FINAL verification — empty healthy 3-CP cluster**

Run:
```bash
kubectl --context fleet get nodes -o wide
kubectl --context fleet get pods -A
```
Expected:
- 3x `Ready control-plane,etcd v1.36.1+k3s1` (10.20.0.1/2/3).
- Only system pods (coredns, local-path-provisioner, metrics-server, traefik, svclb) Running. No workspace/website workloads (correct — Phase 1 is empty).

- [x] **Step 4: Mark Phase 1 complete**

Run:
```bash
echo "fleet Phase 1 complete $(date -u +%FT%TZ): 3-CP HA empty cluster on wg-fleet" \
  | tee -a /tmp/fleet-backup-evidence.txt
```
Phase 2 (overlay, storage, certs, data restore, worker join) begins from a fresh
spec/plan once this is green.

---

## Self-Review

- **Spec coverage:** wg-fleet mesh (Task 3) ✓; fleet env + token (Tasks 2,4) ✓; SSH
  re-bootstrap cluster-init + 2 joins with `--flannel-iface=wg-fleet` (Tasks 5–6) ✓;
  backup gate before teardown (Task 1) ✓; kubeconfig reachability resolved via tunnel
  (Task 7) ✓; scope boundary (empty cluster) enforced in final verify (Task 7 Step 3) ✓.
- **Deferred items** (overlay, Longhorn, cert-manager, data, workers, decommission) are
  explicitly out of this plan per the spec — no tasks, by design.
- **Placeholder scan:** `domain: PLACEHOLDER-PHASE2` is an intentional, documented
  non-bootstrap field (Task 4 Step 1) — not a plan gap.
- **Consistency:** node IPs/keys/token names identical across Tasks 2–7
  (`WG_MESH_PK{4,6,8}_FLEET_PRIVATE_KEY`, `K3S_FLEET_TOKEN`, `10.20.0.{1,2,3}`).
