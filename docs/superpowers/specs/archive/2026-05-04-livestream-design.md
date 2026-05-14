# Livestream Feature — Design Spec

**Date:** 2026-05-04  
**Status:** Approved  
**Approach:** LiveKit (Option A)

## Overview

SSO-authenticated users (Keycloak) get a `/portal/stream` tab in the website portal where they can watch a live video stream. The host can stream via browser (WebRTC) or OBS (RTMP). Viewers have chat, emoji reactions, and a hand-raise ("Wortmeldung") for interactivity. Recordings are optional per stream.

## Requirements

| Requirement | Detail |
|---|---|
| Auth | Keycloak SSO only — no token, no access |
| Sources | Browser camera (WebRTC) and OBS/RTMP |
| Concurrent viewers | Up to ~100 |
| Interactivity | Chat + emoji reactions + hand raise + mic grant |
| Recording | Optional per stream, host decides at start |
| Scale | Hetzner cluster, ~100 Mbps egress at full load |

## Architecture

### Components

**New Kubernetes Deployments** (all in `workspace` namespace, defined in `k3d/livekit.yaml`):

| Pod | Purpose | Resources |
|---|---|---|
| `livekit-server` | WebRTC SFU — signaling, forwarding, chat, data messages | ~512 Mi / 0.5 CPU |
| `livekit-ingress` | RTMP → WebRTC conversion (OBS ingest) | ~256 Mi / 0.25 CPU |
| `livekit-egress` | On-demand recording via FFmpeg | ~2 Gi / 2 CPU (limit) |
| `livekit-redis` | Room state, signaling coordination | ~128 Mi / 0.1 CPU |

**Existing infrastructure reused:**
- CoTURN — configured as external TURN server for LiveKit
- Keycloak — OIDC source for user identity and role checks
- Traefik — Ingress for `livekit.*` (HTTP/WS); TCP LoadBalancer for `stream.*:1935` (RTMP)
- Nextcloud or PVC — recording storage

### New Domains

Added to `k3d/configmap-domains.yaml`:
```
LIVEKIT_DOMAIN: livekit.${PROD_DOMAIN}   # WebSocket/HTTP API
STREAM_DOMAIN:  stream.${PROD_DOMAIN}    # RTMP ingest (TCP LB, port 1935)
```

### New Secrets

Added to `environments/schema.yaml`, `k3d/secrets.yaml`, and sealed for prod:

| Secret | Purpose |
|---|---|
| `LIVEKIT_API_KEY` | Shared key between server, ingress, egress, website API |
| `LIVEKIT_API_SECRET` | Signs LiveKit JWTs in the website token endpoint |
| `LIVEKIT_RTMP_KEY` | Stream key shown to host for OBS configuration |
| `LIVEKIT_TURN_CREDENTIAL` | Reuses existing CoTURN credential from workspace-secrets |

## Auth Flow

```
User opens /portal/stream
  → Astro middleware checks Keycloak session cookie
  → POST /api/stream/token  (passes user.id + role from KC token)
  → Server signs LiveKit JWT with LIVEKIT_API_SECRET
      Viewer:  canPublish=false, canSubscribe=true
      Admin:   canPublish=true,  canSubscribe=true, roomAdmin=true
  → LiveKit SDK connects to Room "main-stream"
```

No valid Keycloak session → 401, redirect to login. No LiveKit room active → viewer sees "Kein Stream aktiv" state.

## UI

### Viewer Page — `website/src/pages/portal/stream.astro`

- New tab "Stream" in portal navigation (visible to all authenticated users)
- Video player via LiveKit React SDK, 16:9, with LIVE badge when active
- Chat sidebar: scrollable message list, online count, message input
- Reaction bar: 👍 ❤️ 🔥 sent as LiveKit Data Messages (broadcast to room)
- ✋ Wortmeldung button: sends a data message to host, shows user in host queue
- Offline state: "Kein Stream aktiv" placeholder

### Host/Admin Page — `website/src/pages/admin/stream.astro`

- Source selector: Browser camera (WebRTC publisher) or OBS/RTMP
- RTMP mode: displays `stream.*` URL and generated stream key
- Recording toggle: optional, starts LiveKit Egress on stream begin
- Live: shows viewer count, active chat, Wortmeldung queue with mic-grant button
- Stop stream button (ends LiveKit room, stops egress if active)

### New Svelte Components — `website/src/components/LiveStream/`

| Component | Purpose |
|---|---|
| `StreamPlayer.svelte` | LiveKit SDK wrapper, video element, LIVE badge |
| `StreamChat.svelte` | Chat messages, input, online count |
| `StreamReactions.svelte` | Reaction buttons, floating reaction animations |
| `StreamHandRaise.svelte` | Wortmeldung button (viewer) + queue panel (host) |
| `StreamOffline.svelte` | Placeholder when no room is active |

### New API Route — `website/src/pages/api/stream/token.ts`

- `POST /api/stream/token`
- Reads Keycloak session, determines role (`admin` realm role → publisher)
- Signs and returns a short-lived LiveKit JWT (TTL: 1h, renewable)

## Data Flow: Reactions & Hand Raise

LiveKit Data Messages (not chat) are used for ephemeral events:
- **Reactions:** `{ type: "reaction", emoji: "👍" }` — broadcast to room, client renders floating animation
- **Hand raise:** `{ type: "raise", userId: "..." }` — sent to host only (reliable delivery), host panel shows queue
- **Mic grant:** host sends `{ type: "grant", userId: "..." }` — server promotes participant to publisher temporarily

## Recording

- Admin toggles recording before starting stream
- On stream start: website API calls LiveKit Egress API to start a room composite recording
- Output: MP4 file, written to PVC `livekit-recordings` (dedicated 20Gi PVC in workspace namespace)
- On stream end: egress job completes, file is available at a static path served by the website
- Egress pod resources are request=0 (no idle cost), limit=2CPU/2Gi (only used during active recording)

## Kubernetes Specifics

**RTMP TCP LoadBalancer:** Port 1935 cannot go through a standard HTTP Ingress. A `Service` of type `LoadBalancer` is needed, similar to the existing coturn setup. In k3d dev, k3d maps this port via `--port 1935:1935@loadbalancer` in `k3d-config.yaml`.

**ArgoCD:** `livekit.yaml` is added to the base kustomization. The `applicationset.yaml` picks it up automatically for prod deploys.

**envsubst vars:** `LIVEKIT_DOMAIN` and `STREAM_DOMAIN` must be added to the envsubst list in `Taskfile.yml` for both dev deploy (line ~1117) and prod deploy (line ~1145).

## Files to Create / Modify

| File | Action |
|---|---|
| `k3d/livekit.yaml` | Create — all 4 deployments + services + ingress |
| `k3d/kustomization.yaml` | Add `livekit.yaml` |
| `k3d/configmap-domains.yaml` | Add `LIVEKIT_DOMAIN`, `STREAM_DOMAIN` |
| `k3d/secrets.yaml` | Add `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_RTMP_KEY` |
| `k3d-config.yaml` | Add port mapping for 1935 (RTMP) |
| `environments/schema.yaml` | Add 3 new secrets |
| `Taskfile.yml` | Add LIVEKIT_DOMAIN + STREAM_DOMAIN to envsubst lists |
| `website/src/pages/portal/stream.astro` | Create |
| `website/src/pages/admin/stream.astro` | Create |
| `website/src/pages/api/stream/token.ts` | Create |
| `website/src/components/LiveStream/*.svelte` | Create (5 components) |
| `website/src/layouts/AdminLayout.astro` | Add stream nav link |
| `website/package.json` | Add `livekit-client` (base JS SDK — custom Svelte wrappers, no framework components needed) |
