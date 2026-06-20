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
          [ Fleet Cluster (unified k3s — 6 nodes) ]
     CP: pk-hetzner-4 (LiveKit) / pk-hetzner-6 / pk-hetzner-8
     Workers: gekko-hetzner-2 / gekko-hetzner-3 / gekko-hetzner-4
     (LiveKit pinned to pk-hetzner-4 via nodeAffinity; hostNetwork: true)
                      ▲
                      │  (WireGuard mesh overlay — wg-fleet)
                      ▼
        [ Local Workstation / WSL Host ] ◄──► [ GPU Worker (Ollama) ]
           (OpenClaw Gateway)                 (RTX 5070 Ti - 10.10.0.3)
```

---

## Phase 1 — Host Node Provisioning (Hetzner Cloud & Proxmox LAN)

Interactive flow for provisioning a new server or resetting an existing server in Rescue Mode.

> [!NOTE]
> For provisioning/enrolling local bare-metal or LAN nodes using Proxmox Automated Installation, refer to **Step 1.0b** of the [cluster-deployment skill](file:///home/patrick/Bachelorprojekt/.claude/skills/cluster-deployment/SKILL.md#step-10b-enroll--provision-proxmox-nodes-bare-metal--lan).

Vollständige Hetzner-Provisioning-Befehle (hcloud auth, Input-Collection, WireGuard-Key-Management, Cloud-init-Generation, Deployment, Peer/k3s-Verification) leben in [references/hetzner-provisioning.md](references/hetzner-provisioning.md).

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

Since LiveKit binds candidate IPs directly to its host via `hostNetwork: true`, it is pinned via `nodeAffinity` to `pk-hetzner-4` (fleet cluster).
If the pod is not scheduled, verify node labels:
```bash
kubectl get nodes --context fleet --show-labels | grep pk-hetzner-4
# Apply pin label if missing:
kubectl label node pk-hetzner-4 livekit-pin-node=true --context fleet
```

DNS records for `livekit.mentolder.de` and `stream.mentolder.de` **must** point directly to `pk-hetzner-4`'s public IP (`204.168.244.104`).
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

OpenClaw verbindet die Developer-Workstation (WSL) mit dem GPU-Worker. Setup, Status/Logs,
Backup/Restore/Reset und Troubleshooting leben in [references/wsl-openclaw.md](references/wsl-openclaw.md).

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

## Verwandte Skills

| Skill | Beziehung |
|-------|-----------|
| `cluster-deployment` | Querschnitt — Node-Provisionierung |
| `fleet-ops` | Querschnitt — Fleet-WireGuard-Mesh |
| `mishap-tracker` | Abschluss — protokolliert Frictions |
