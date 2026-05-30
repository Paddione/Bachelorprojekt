---
name: host-node-networking
description: Unified runbook for host node provisioning (Hetzner, cloud-init, Rescue Mode), WireGuard mesh network layout, host firewalls (UFW rules), LiveKit WebRTC networking (DNS pinning, ICE candidates), and WSL OpenClaw local gateway operations.
---

> **Mishap Tracking:** As you execute this skill, maintain a running `MISHAP_LOG`.
> For every anomaly, unexpected state, broken component, security concern, or
> configuration drift you notice — even if unrelated to the current task — add
> an entry with: `type` (broken/degraded/suspicious/security/drift), `title`,
> `description`, and `component`. Invoke `mishap-tracker` at the very end.

# host-node-networking

This runbook covers host-level networking, node provisioning, firewall rules, and VPN tunnel configurations across the Bachelorprojekt platform.

---

## 🗺️ Network Architecture & VPN Mesh ("Netplan")

The platform operates across stands of physical servers and local workstations connected via a WireGuard-mesh VPN overlay (`wg-mesh` on subnet `10.13.13.0/24` or `192.168.100.0/24` depending on cluster).

```
          [ Hetzner Cloud CP Nodes ]
             gekko-hetzner-1 (INIT)
             gekko-hetzner-2 (JOIN)
             gekko-hetzner-3 (JOIN / LiveKit)
                      ▲
                      │  (WireGuard mesh overlay)
                      ▼
        [ Local Workstation / WSL Host ] ◄──► [ GPU Worker (Ollama) ]
           (OpenClaw Gateway)                 (RTX 5070 Ti - 10.10.0.3)
```

---

## Phase 1 — Host Node Provisioning (Hetzner Cloud)

Interactive flow for provisioning a new server or resetting an existing server in Rescue Mode.

### Step 1.0: Authenticate hcloud CLI

The Hetzner Cloud API token is stored per-env in `environments/.secrets/<env>.yaml` as `HETZNER_API_KEY`.

```bash
# Read the token for the target env (file is gitignored/local)
HETZNER_API_KEY=$(grep '^HETZNER_API_KEY' environments/.secrets/<env>.yaml | awk '{print $2}' | tr -d '"')

# Create or switch to the env's hcloud context (token stored in ~/.config/hcloud/cli.toml)
hcloud context create <env>   # prompts for token — paste $HETZNER_API_KEY
# — or update an existing context:
hcloud context use <env>
```

Verify the correct project is active before proceeding:
```bash
hcloud context active   # should show <env>
hcloud server list      # should list the env's nodes
```

> **Tip:** Use `mentolder` and `fleet` as context names so `hcloud context use <env>` switches cleanly between clusters. (The `korczewski` hcloud context now manages the fleet cluster's hosts pk-hetzner-4/6/8.)

### Step 1.1: Input Collection

Collect the target details from the user:
```
Mode?
  [1] New server    — paste cloud-config as User Data when creating in Hetzner
  [2] Reset         — existing server via Rescue Mode reinstall

Role?
  [1] Control-Plane INIT    → prod/cloud-init.yaml
  [2] Control-Plane JOIN    → prod/cloud-init-join-cp.yaml
  [3] Worker / Agent        → prod/cloud-init-worker.yaml

Target env?       mentolder / fleet
Node name?        e.g. gekko-hetzner-5
Node public IP?   e.g. 178.104.x.x
```

For JOIN and WORKER also obtain:
```
Existing CP IP (for server URL):
K3S token (from live CP):
```
Get the K3S token from the active cluster:
```bash
ssh patrick@<CP_IP> "sudo cat /var/lib/rancher/k3s/server/node-token"
```

### Step 1.2: WireGuard Mesh Key Management

Check `environments/.secrets/<env>.yaml` for an existing private key:
```bash
grep "WG_MESH_<SCHEMA_KEY>_PRIVATE_KEY" environments/.secrets/<env>.yaml 2>/dev/null
```

* **Recovery path:** If the key exists, reuse it. Derive the public key to verify:
  `echo "<PRIVATE_KEY>" | wg pubkey`
* **First-time provisioning:** Generate a new keypair:
  ```bash
  # Preferred (needs wireguard-tools):
  WG_PRIVATE=$(wg genkey)
  WG_PUBLIC=$(echo "$WG_PRIVATE" | wg pubkey)
  ```
  Store it in `.secrets/<env>.yaml` and re-seal using `task env:seal ENV=<env>`. Add the public key and mesh IP to `wireguard/wg-mesh-nodes.yaml`.

### Step 1.3: Generate Config/Setup Script

Build the WireGuard peer block for every other node in the mesh:
```
[Peer]
# <node_name>
PublicKey = <public_key>
Endpoint = <endpoint>          # omit line if endpoint is ""
AllowedIPs = <wg_ip>/32
PersistentKeepalive = 25
```

For **New Servers**, insert the peer blocks and key replacements into `prod/cloud-init.yaml` templates using 6-space indentation. Save to `/tmp/cloud-init-ready.yaml`.

For **Rescue Mode Resets**, prepare a bash setup script saved to `/tmp/setup-<nodename>.sh` containing system tuning, firewall rules, and the WireGuard wg-mesh config.

### Step 1.4: Deployment

* **New Server:** Create the server using the hcloud CLI or console, injecting the cloud-init:
  ```bash
  hcloud server create --context <env> --name <hostname> --type cx32 --image ubuntu-24.04 \
    --user-data-from-file /tmp/cloud-init-ready.yaml
  ```
* **Rescue Mode Reset:** Re-install the base image from rescue:
  ```bash
  hcloud server enable-rescue --context <env> --type linux64 <server-id> && \
  hcloud server reset --context <env> <server-id>
  # SSH into rescue, partition, and install base image:
  /root/.oldroot/nfs/install/installimage -a -c /tmp/installimage.conf
  reboot
  ```
  Once rebooted, SSH in and execute the setup script:
  ```bash
  ssh root@<NODE_IP> bash -s < /tmp/setup-<nodename>.sh
  ```

### Step 1.5: Peer & k3s Verification

Add the new node's public key to existing peers:
```bash
sudo wg set wg-mesh peer <PUBLIC_KEY> allowed-ips <WG_IP>/32 endpoint <ENDPOINT>
```
Verify the node is ready in Kubernetes and label it:
```bash
kubectl get nodes --context <env> -o wide
# Label appropriately: node-role.kubernetes.io/control-plane="" OR node-role.kubernetes.io/worker=""
```

---

## Phase 2 — Host Firewall & Port Mappings (UFW)

The Hetzner hosts enforce a strict deny-by-default inbound firewall. The following ports must be open on the node hosting the service:

| Protocol | Ports | Purpose | Service Location |
|---|---|---|---|
| TCP | 22 | Host SSH access | All nodes |
| TCP | 80/443 | Web Traffic Ingress | Ingress controller |
| TCP | 6443 | Kubernetes API Server | Control-plane nodes |
| UDP | 51820 | WireGuard VPN Tunnel | VPN mesh peers |
| TCP/UDP | 3478, 5349 | coturn TURN/STUN (media relay) | coturn node |
| UDP | 49152-49252 | coturn TURN relay ports | coturn node |
| TCP | 7880 | LiveKit Signaling (WebSocket) | livekit-server host |
| TCP | 7881 | LiveKit RTC TCP fallback | livekit-server host |
| UDP | 50000-60000 | LiveKit RTC UDP media | livekit-server host |
| UDP | 30000-40000 | LiveKit Ingress/Egress media | livekit-server host |

Configure rules directly on the host:
```bash
ssh patrick@<node-ip> "sudo ufw allow <port>/<proto> && sudo ufw reload"
```

---

## Phase 3 — LiveKit WebRTC Stack Setup

LiveKit handles multi-user audio/video streams on `mentolder`.

### Step 3.1: Node Pinning & DNS Pinning

Since LiveKit binds candidate IPs directly to its host via `hostNetwork: true`, it is pinned via `nodeAffinity` to `gekko-hetzner-3`.
If the pod is not scheduled, verify node labels:
```bash
kubectl get nodes --context mentolder --show-labels | grep gekko-hetzner-3
# Apply pin label if missing:
kubectl label node gekko-hetzner-3 livekit-pin-node=true --context mentolder
```

DNS records for `livekit.mentolder.de` and `stream.mentolder.de` **must** point directly to `gekko-hetzner-3`'s public IP (`46.225.125.59`).
Verify with:
```bash
dig livekit.mentolder.de +short
```
If misconfigured, correct the records:
```bash
task livekit:dns-pin ENV=mentolder APPLY=true
```

### Step 3.2: Testing the Stream

1. Create a stream room in `/admin/stream`.
2. Configure OBS using Server: `rtmp://stream.mentolder.de/live` and your room's stream key.
3. Start the stream in OBS and open `/portal/stream` to view the stream.
4. If the stream is stuck, force-restart the server to clear active rooms:
   ```bash
   task livekit:end-stream ENV=mentolder
   ```

---

## Phase 4 — WSL OpenClaw Gateway Operations

OpenClaw connects the developer workstation (WSL) to the GPU worker.

### Step 4.1: Setup and Startup

Install OpenClaw on the WSL host:
```bash
task openclaw:install
task openclaw:configure  # Writes config pointing to Ollama at 10.10.0.3
task openclaw:start      # Starts daemon
```

### Step 4.2: Backup, Restore & Reset

* **Backup:** `task openclaw:backup` (snapshots configuration to `~/.openclaw` archive).
* **Restore:** `task openclaw:restore` (restores config).
* **Wipe:** `task openclaw:wipe CONFIRM=yes` (destructive reset, requires explicit confirmation).

---

## Troubleshooting & Common Blockers

| Component | Symptom | Cause / Fix |
|---|---|---|
| **WireGuard** | Handshakes not forming | Public key mismatch. Re-derive: `echo <PRIVATE_KEY> \| wg pubkey` and verify match with peer configs. |
| **UFW** | Node appears Ready, but pod-to-pod communications fail | Flannel traffic blocked. Ensure UDP port 8472 and VPN port 51820 are allowed in UFW. |
| **LiveKit** | ICE fails to connect / audio muted in browser | 1. Ensure `livekit` DNS is pinned to the single node hosting the server. <br>2. Chrome blocks audio without a user click gesture first. |
| **OpenClaw** | Connection Refused / 503 | Check if Ollama is running on the GPU host (`10.10.0.3`) and that the WireGuard tunnel is active. |

---

## Post-Execution: Mishap Report

After completing all steps in this skill, invoke `mishap-tracker` with your accumulated `MISHAP_LOG`. If no mishaps were found, `mishap-tracker` exits cleanly.
