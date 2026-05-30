---
name: arena-brett-deploy
description: Use when building, deploying, or debugging the arena-server (korczewski-only WebSocket game server) or brett (3D multiplayer game), including proto-drift copy step, CORS configuration, and deploy constraints unique to each service.
---

# arena-brett-deploy — Arena & Brett Deployment

## Overview

**Arena** is a korczewski-only WebSocket multiplayer server. **Brett** is a 3D game (Systembrett) deployed to both clusters. Both have deploy constraints that aren't obvious from the generic Taskfile docs.

---

## Arena Server (korczewski-only)

### Deploy

```bash
task arena:build                   # Build image (+ k3d import in dev)
task arena:push                    # Push to ghcr.io/paddione/arena-server:latest
task arena:deploy ENV=korczewski   # Build, push, and roll out to fleet cluster (workspace-korczewski)
task feature:arena                 # Shorthand: build + deploy to the korczewski brand on fleet
```

**`task arena:deploy ENV=mentolder` exits early with an explanation** — arena intentionally lives only on the korczewski brand (namespace `workspace-korczewski` on the fleet cluster).

### Proto-Drift Copy Step (CI enforced)

`arena-server/src/proto/messages.ts` and `website/src/components/arena/shared/lobbyTypes.ts` must be **byte-identical**. CI fails if they diverge.

After any change to `messages.ts`:

```bash
cp arena-server/src/proto/messages.ts website/src/components/arena/shared/lobbyTypes.ts
diff arena-server/src/proto/messages.ts website/src/components/arena/shared/lobbyTypes.ts
# Must produce no output
```

Do this before committing. The CI job `arena-proto-drift` is the gate.

### CORS Configuration

Arena validates JWT from **both** Keycloak realms and allows CORS from both website origins:
- `https://web.mentolder.de`
- `https://web.korczewski.de`

Both websites point to `arena-ws.korczewski.de`. When modifying arena CORS config, ensure both origins remain in the allow-list.

### Day-2 Commands

```bash
task arena:status ENV=korczewski   # Pod + service status
task arena:logs ENV=korczewski     # Tail logs
task arena:db ENV=korczewski       # psql into arena schema
task arena:sync ENV=korczewski     # Hot-copy src into running pod + rebuild (no image push — fast dev loop)
task arena:teardown ENV=<env>      # Remove resources
```

### Arena Unit Tests (required before PR)

```bash
cd arena-server && pnpm install --frozen-lockfile && pnpm test && pnpm build
```

---

## Brett (3D Multiplayer Game)

### Deploy

```bash
task brett:build               # Build image (+ k3d import in dev)
task brett:push                # Push to registry
task brett:deploy ENV=<env>    # Build, import/push, and roll out
task feature:brett             # Fan-out: build + deploy to mentolder standalone + fleet cluster (korczewski brand)
task brett:logs ENV=<env>      # Tail logs
```

### Brett Skin Management API

Mixamo-GLB skins are managed via an admin-protected REST API. Files land under `brett/public/assets/skins/<id>/`.

```
GET  /api/skins           — skin catalog (public); first entry is always the "default" mannequin
POST /api/skins/upload    — admin-only; multipart/form-data with name, glb (≤20 MB), thumb (optional, ≤512 KB)
                            validateGlb() rejects any GLB missing a mixamorigHips bone → HTTP 400
DELETE /api/skins/:id     — admin-only; "default" is write-protected → HTTP 400
```

### Brett Unit Tests (required before PR)

```bash
npm ci --prefix brett && \
  node --test brett/test/ws-reconnect.test.mjs \
       brett/test/physics.test.js \
       brett/test/damage.test.mjs \
       brett/test/pickups.test.mjs \
       brett/test/mode-state.test.mjs \
       brett/test/skin-validator.test.js \
       brett/test/skin-catalog.test.js \
       brett/test/skin-upload.test.js
```

Also run the Systembrett template validation:

```bash
./scripts/tests/systembrett-template.test.sh
```

### Brett-Specific Notes

- Brett image uses `:latest` tag **intentionally** — do not pin to a digest. It is rebuilt and re-imported/pushed on every release.
- The Mayhem admin panel in-game uses OIDC (Keycloak) — changes to realm config can break the in-game admin.
- `task brett:bot-setup ENV=<env>` registers the `/brett` slash command in Nextcloud Talk — run after first deploy or Talk integration changes.

---

## Verification After Deploy

```bash
# Arena
task arena:status ENV=korczewski
# Check wss://arena-ws.korczewski.de connects and JWT from both realms validates

# Brett
task brett:logs ENV=mentolder
task brett:logs ENV=korczewski
# Spot-check game loads at brett.mentolder.de and brett.korczewski.de
```
