---
name: livekit-setup
description: Use when setting up, repairing, or debugging LiveKit — covers DNS pinning, ufw firewall rules, node affinity, ICE failure diagnosis, and stream/recording verification. Triggers on: LiveKit ICE fails, stream not working, RTMP ingestion broken, recording failing, livekit pod issues.
---

> **Mishap Tracking:** As you execute this skill, maintain a running `MISHAP_LOG`.
> For every anomaly, unexpected state, broken component, security concern, or
> configuration drift you notice — even if unrelated to the current task — add
> an entry with: `type` (broken/degraded/suspicious/security/drift), `title`,
> `description`, and `component`. Invoke `mishap-tracker` at the very end.

# livekit-setup

Setup and repair guide for the LiveKit WebRTC streaming stack on mentolder.

**mentolder-only:** LiveKit runs on the mentolder cluster only (`livekit.mentolder.de`, `stream.mentolder.de`). The arena-server on korczewski uses a separate WebRTC path.

---

## Architecture quick-reference

| Component | Runs on | Note |
|---|---|---|
| `livekit-server` | `gekko-hetzner-3` (46.225.125.59) | `hostNetwork: true`, pinned via `nodeAffinity` |
| `livekit-ingress` | `gekko-hetzner-3` | RTMP intake for OBS |
| `livekit-egress` | any node | Recording to PVC |
| DNS `livekit.<domain>` | → `46.225.125.59` | Must pin — browsers hit random node otherwise |
| DNS `stream.<domain>` | → `46.225.125.59` | RTMP also needs pin-node IP |

**Why node pinning matters:** `hostNetwork: true` binds ICE candidates to the host's IP. If a browser connects to a non-LiveKit node via DNS, ICE silently fails (~66% of the time with 3 nodes). The DNS pin forces all connections to the node where LiveKit actually listens.

---

## Phase 1: Check current status

```bash
task livekit:status ENV=mentolder
```

Expected output:
- `livekit-server` pod: `1/1 Running` on `gekko-hetzner-3`
- `livekit-ingress` pod: `1/1 Running` on `gekko-hetzner-3`
- `livekit.mentolder.de` and `stream.mentolder.de` DNS → `46.225.125.59`

---

## Phase 2: DNS pinning

LiveKit and stream DNS **must** point to the pin node (`46.225.125.59`). Verify:

```bash
dig livekit.mentolder.de +short
dig stream.mentolder.de +short
```

Both should return `46.225.125.59`. If not:

```bash
# Print the API calls that would fix DNS (dry-run)
task livekit:dns-pin ENV=mentolder

# Apply them:
task livekit:dns-pin ENV=mentolder APPLY=true
```

`livekit:dns-pin` updates the ipv64 DDNS A records for `livekit.<domain>` and `stream.<domain>` via the ipv64 API. It also covers `turn.<domain>` (used by Janus coturn).

After changing DNS, allow up to 60s for propagation before testing.

---

## Phase 3: Firewall rules

The Hetzner host firewall blocks all ports except 80/443 by default. LiveKit needs additional ports open on `gekko-hetzner-3`:

| Protocol | Ports | Purpose |
|---|---|---|
| TCP | 7880 | LiveKit signaling (WebSocket) |
| TCP | 7881 | RTMP → LiveKit ingress |
| UDP | 50000-60000 | ICE media (browser ↔ server) |
| UDP | 30000-40000 | Ingress/egress media |

Check if ports are open:
```bash
ssh root@gekko-hetzner-3 "ufw status numbered | grep -E '7880|7881|50000|30000'"
```

Open missing ports:
```bash
task livekit:firewall-open NODE=46.225.125.59
```

This SSHes to the node and runs the ufw rules. Requires SSH access to `root@gekko-hetzner-3`.

**Note:** Janus TURN uses `20000-20200/udp` — this range is NOT included in `livekit:firewall-open`. If coturn is broken, open it separately:
```bash
ssh root@gekko-hetzner-3 "ufw allow 20000:20200/udp && ufw reload"
```

---

## Phase 4: Node affinity verification

`livekit-server` must run on `gekko-hetzner-3`. Check:

```bash
kubectl get pod -n workspace --context mentolder \
  -l app=livekit-server -o wide
```

If it's on a different node, the `nodeAffinity` in `k3d/livekit-server.yaml` is not matching. Check the node labels:

```bash
kubectl get nodes --context mentolder --show-labels | grep gekko-hetzner-3
```

The affinity selector requires a specific label. If the label is missing:
```bash
kubectl label node gekko-hetzner-3 \
  livekit-pin-node=true --context mentolder
```

---

## Phase 5: Test the stream

### RTMP/OBS path

1. Open `https://web.mentolder.de/admin/stream`
2. Create a room and copy the stream key
3. In OBS: Settings → Stream → Server: `rtmp://stream.mentolder.de/live`, Key: `<stream-key>`
4. Start streaming
5. Open `https://web.mentolder.de/portal/stream` to verify viewer side

### Browser WebRTC path

The `Room.connect()` call in the website JavaScript **must run from a user gesture** (button click). Chrome blocks `AudioContext` creation otherwise — the room connects but audio is silently muted.

Common debugging:
```bash
# Check livekit-server logs for connection attempts
task livekit:logs ENV=mentolder

# Check ingress logs (RTMP)
task livekit:logs ENV=mentolder -- ingress

# Check egress logs (recording)
task livekit:logs ENV=mentolder -- egress

# List recordings in PVC
task livekit:recordings ENV=mentolder
```

---

## Phase 6: Recording

Recordings are saved as MP4 to the egress PVC. To list:
```bash
task livekit:recordings ENV=mentolder
```

If recording is failing, check `livekit-egress` logs:
```bash
task livekit:logs ENV=mentolder -- egress
```

Common egress failure: PVC out of space. Check:
```bash
kubectl exec -n workspace --context mentolder \
  deployment/livekit-egress -- df -h /recordings
```

---

## Emergency: force-close a room

If a stream is stuck (e.g. OBS crashed but room is still "live"):
```bash
task livekit:end-stream ENV=mentolder
```

This restarts `livekit-server`, which closes all active rooms.

---

## Post-Execution: Mishap Report

After completing all steps in this skill, invoke `mishap-tracker` with your
accumulated `MISHAP_LOG`. If no mishaps were found, `mishap-tracker` exits
cleanly with "No mishaps found."
