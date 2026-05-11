---
title: Arena — last-man-standing in-website multiplayer
date: 2026-05-11
status: draft
owner: patrick
domains: [website, infra, security, db, test]
brand: mentolder + korczewski (cross-cluster)
related:
  - "Kore Design System latest/README.md"
  - "Kore Design System latest/ui_kits/arena/"
  - "Kore Design System latest/sandbox.jsx"
---

# Arena — design spec

A 4-player last-man-standing browser game embedded into the mentolder website, openable by Patrick (admin) from anywhere on the site and joinable by any logged-in Keycloak user on either brand. v1 is the "once to death for fun when I wish so" milestone. Coop campaign is out of v1 scope but the architecture leaves hooks for it.

The visual + UI language is **Kore.** (the Kubernetes-studio brand) — top-down isometric sprites, aubergine ink surfaces, plasma lime accent, Instrument Serif headlines, Geist UI, JetBrains Mono for metadata/eyebrows. The full design system lives in `Kore Design System latest/` and is treated as authoritative for visual rules and gameplay constants.

## 0 · Glossary

- **Arena** — the game itself; a top-down battle royale.
- **Lobby** — a join window after the host opens a match, before play starts. Identified by a 6-char code.
- **Brand** — `mentolder` or `korczewski`; both clusters connect to the same game server.
- **arena-server** — the new Node + Express + Socket.io + Drizzle service, deployed only in the mentolder cluster.
- **Admin role** — Keycloak realm role `arena_admin` in the mentolder workspace realm. Gate for hosting.
- **Bot** — a server-side AI player that fills missing slots up to 4.
- **RESPECT** — design-system cosmetic currency. Not persisted in v1.

## 1 · Goals

1. **One-click "open a match from anywhere on mentolder"** — admin-only trigger, global banner notifies every logged-in user across both brands.
2. **Cross-brand play** — mentolder and korczewski Keycloak users share lobbies; both brands' websites talk to one game server.
3. **Bots-always-fill** — every match has 4 players; missing slots filled by simple AI.
4. **Full design-spec gameplay** — 2 HP + 1 armor, 1-damage guns + instant melee, 60s item cycle, 90s powerup cycle, shrinking zone, all 5 powerups + 6 pickups, the `sandbox.jsx` map ported 1:1.
5. **4 normal-people characters**, mechanically identical, distinguishable only by appearance: blonde guy, brown-haired guy, long red-haired girl, blonde long-haired girl.
6. **Single round per match** (last alive wins, no time limit), rematch flow, results archived to Postgres.
7. **Coop campaign hooks**, not implementation. The data + protocol leaves room for it.

## 2 · Non-goals (v1)

- RESPECT currency, leaderboards, lifetime stats.
- Voice chat (LiveKit infra exists but is not wired in).
- Procedural / multiple maps.
- Loadouts, cosmetics, stores.
- Replay system.
- Bot difficulty selector in admin UI (single "medium" preset shipped).
- Telemetry to Grafana.
- Anonymous / guest play.

## 3 · System overview

```
                       Keycloak (mentolder)          Keycloak (korczewski)
                            \                              /
                             \                            /
                          [arena-server]  Pod (mentolder cluster, workspace ns)
                          - Express + Socket.io + Drizzle (TS)
                          - 30 Hz authoritative tick
                          - JWT issuer trust list = [mentolder, korczewski]
                          - REST: /lobby/active, /lobby/open, /match/:id, /healthz
                          - WSS: /ws  (single socket, room per lobby)
                                 |
                            shared-db  (mentolder)
                            schema "arena": matches, match_players, lobbies
                                 ^
                                 |
       ┌─────────────────────────┴────────────────────────────┐
       │                                                       │
[ web.mentolder.de ]                                  [ web.korczewski.de ]
 Astro+Svelte                                          Astro+Svelte
 Global <ArenaBanner/> in 3 layouts                    Same component, same SSE endpoint
 SSE: /api/arena/active   (Astro endpoint —            SSE: /api/arena/active   (proxies
   proxies to arena-server)                             to same arena-server)
 /portal/arena → React island → PixiJS canvas         /portal/arena → same React island
 /admin/arena → host-only "Open lobby" UI             (no host UI; admin lives in mentolder)
```

## 4 · Frontend

### 4.1 Banner (Svelte, global)

- Lives in `website/src/components/arena/ArenaBanner.svelte`.
- Injected into `Layout.astro`, `PortalLayout.astro`, `AdminLayout.astro` (one-line include each).
- Renders only when the Keycloak session cookie is present (anonymous pages: hidden).
- 44px tall, sticky top, z-index 1000, Kore palette + grain overlay.
- States: `idle` (hidden), `open` (banner with countdown + Join), `in-progress` (dimmer, Spectate), `closing` (600ms fade out).
- Dismissible per-lobby via `sessionStorage['arena:dismissed:'+code]`.
- Permanent silent mode via `localStorage['arena:silent']`, toggle in `/admin/arena`.

### 4.2 Game island (React + Pixi)

- `website/src/components/arena/ArenaIsland.tsx` — React 18 island, mounted on `/portal/arena` via `client:only="react"`.
- PixiJS 8 renders the world (floor, walls, props, players, bullets, FX, decals, zone ring).
- React-DOM overlay renders the HUD (HP pips, kill feed, minimap, timer, alive count, ping pill, death overlay).
- Scenes: `LobbyScene`, `MatchScene`, `SpectatorScene`, `ResultsScene`.
- Net: single Socket.io connection, JWT in handshake, input buffer @ 30 Hz.

### 4.3 Folder layout (frontend)

```
website/src/components/arena/
├── ArenaBanner.svelte
├── ArenaIsland.tsx
├── pixi/
│   ├── PixiApp.ts
│   ├── scenes/{Lobby,Match,Spectator,Results}Scene.ts
│   ├── entities/{Player,Bullet,Pickup,Powerup,Decal}.ts
│   ├── map/{concrete-arena.ts,tiles.ts}
│   ├── hud/{HudOverlay,DeathOverlay}.tsx
│   └── net/{socket.ts,inputBuffer.ts}
└── shared/lobbyTypes.ts            ← mirror of arena-server/src/proto/messages.ts
```

### 4.4 Astro endpoints

- `website/src/pages/api/arena/active.ts` — SSE; one upstream long-poll to `arena-server`, fans out to all browser tabs.
- `website/src/pages/api/arena/start.ts` — admin-only POST; relays to `arena-server`'s `POST /lobby/open` with the user's JWT.
- `website/src/pages/api/arena/token.ts` — mints a short-lived access token (`aud: arena`) from the existing OIDC session.

### 4.5 Page routes

- `website/src/pages/portal/arena.astro` — mounts `<ArenaIsland client:only="react" />`.
- `website/src/pages/admin/arena.astro` — host UI: Open lobby button + recent matches table.

### 4.6 Assets

Copied from `Kore Design System latest/` into `website/public/arena/`:
- Sprite PNGs (placeholder Warrior/Rogue/Mage/Tank/Zombie until 4 normal-people sprites exist).
- Weapon SVGs: `Glock`, `Deagle`, `M4A1`.
- Prop sprites: crate, bush, pillar, barrel, sandbag, terminal, server rack, locker, cone, vent, door.
- Pickup SVGs: HealthPack, MedSyringe, ArmorPlate, AmmoBox, Keycard, RespectCoin.
- Powerup SVGs: Shield, Speed, Damage, EMP, Cloak.
- FX SVGs: Explosion, Smoke, MuzzleFlash, BulletHit, BloodSplat, BloodPool, HealAura, ShieldBubble, EMPBurst, BulletHole, Footprint.
- Brand fonts: Geist, Instrument Serif, JetBrains Mono (woff2).

The 4 normal-people sprites do not exist yet; v1 stubs them with CSS portraits from `Kore Design System latest/characters/` while the asset pipeline (Blender EEVEE, 60° iso, 256×256 PNG, warm key + cool fill + rim) is run.

## 5 · Game server (arena-server)

### 5.1 Folder layout

```
arena-server/
├── src/
│   ├── index.ts
│   ├── config.ts
│   ├── auth/{jwt.ts,jwks.ts}
│   ├── http/{routes.ts,middleware.ts}
│   ├── ws/{server.ts,handlers.ts,broadcasters.ts}
│   ├── lobby/{lifecycle.ts,countdown.ts,botfill.ts}
│   ├── game/{state.ts,tick.ts,physics.ts,weapons.ts,items.ts,powerups.ts,zone.ts,map.ts,constants.ts}
│   ├── bots/{ai.ts,nav.ts}
│   ├── db/{schema.ts,migrate.ts,repo.ts,migrations/}
│   └── proto/messages.ts
├── package.json
├── tsconfig.json
├── Dockerfile
└── README.md
```

Sibling to `website/`, `brett/`, `k3d/`. Uses pnpm.

### 5.2 Tick loop (30 Hz)

Each tick (33.3ms):
1. Drain input buffer; one input per socket per tick.
2. Apply bot AI decisions.
3. Apply movement; resolve AABB collisions against walls/cover.
4. Process actions: fire (raycast + damage), melee (cone check), pickup (radius check), dodge (i-frame flag).
5. Tick projectiles (hitscan, one-frame).
6. Tick zone (radius shrink, outside-damage tick).
7. Tick item / powerup spawn timers.
8. Build state diff vs last sent snapshot; broadcast to room.
9. Check win condition; if met → slow-mo → results.

### 5.3 State authority

Server-authoritative. Clients send only inputs; client-side movement prediction is allowed for snappiness; server state always wins on next tick. No client-authoritative damage. Hitscan only; no projectile travel.

### 5.4 JWT validation

`jose` library, two issuers trusted:
- `https://auth.mentolder.de/realms/workspace`
- `https://auth.korczewski.de/realms/workspace`

JWKS caches managed independently (1h TTL + key-rotation refresh on unknown `kid`). `aud: arena`. `arena_admin` realm role grants `/lobby/open`, mentolder realm only.

Player key: `<sub>@<brand>`. Bots: `bot_1`..`bot_3` (no brand).

### 5.5 Room model

One Socket.io room per lobby (key = lobby code). v1 enforces a singleton via `POST /lobby/open` returning `409 Conflict` if any non-`closed` lobby exists. Code paths remain multi-tenant-ready.

### 5.6 Bot AI

State machine: `WANDER` → `ENGAGE` (visible enemy ≤ 350px, prefer 200px) → `LOOT` (visible pickup ≤ 150px) → `FLEE` (HP=1, find nearest cover) → `RECENTER` (outside zone).

A* over a 32px walkable grid. LOS check via raycast against wall AABBs. Knobs: `aimNoise` (radians), `reactionMs`, `decisionInterval`. v1 ships one "medium" preset.

## 6 · Network protocol

Single Socket.io connection per player. JWT in handshake `auth.token`.

### 6.1 Client → server

```ts
type ClientMsg =
  | { t: 'lobby:open' }                                  // admin only
  | { t: 'lobby:join'; code: string }
  | { t: 'lobby:ready'; ready: boolean }
  | { t: 'lobby:leave' }
  | { t: 'input'; seq: number; wasd: 0..8; aim: number;  // aim quantized to 1/256 rad
        fire: boolean; melee: boolean;
        pickup: boolean; dodge: boolean; tick: number }
  | { t: 'spectator:follow'; target: string | null }
  | { t: 'rematch:vote'; yes: boolean }
  | { t: 'forfeit' }
  | { t: 'auth:refresh'; token: string }
```

### 6.2 Server → client

```ts
type ServerMsg =
  | { t: 'lobby:state'; code: string;
        phase: 'open'|'waiting'|'starting'|'in-match'|'results'|'closed';
        players: PlayerSlot[]; expiresAt?: number; countdownMs?: number }
  | { t: 'match:full-snapshot'; tick: number; state: MatchState }
  | { t: 'match:diff'; tick: number; ops: DiffOp[] }
  | { t: 'match:event'; events: GameEvent[] }
  | { t: 'match:end'; results: MatchResult[]; matchId: string }
  | { t: 'error'; code: string; message: string }
```

### 6.3 Sync model

- New / reconnecting client: `match:full-snapshot`.
- Subsequent ticks: `match:diff` (changed fields only).
- Out-of-band one-shots: `match:event` (kill, pickup, dodge i-frame start, etc.) for SFX + HUD.
- Wire format: JSON. Bandwidth budget ~3-5 KB/s per client. Acceptable for 4 players.
- Local input prediction: movement only.
- Tick rate: 30 Hz server, 30 Hz outbound; client renders at vsync with 33ms interpolation.

### 6.4 Anti-cheat posture

Server-authoritative. Clients cannot damage, set HP, teleport, or pick up items outside their pickup radius. Aim is just an angle (bounded). 60/min/IP rate limit on handshake.

### 6.5 Reconnection

Pawn idle for 10s on disconnect. Same-subject reconnect resumes. After 10s → AFK (free kill).

### 6.6 Protocol versioning

`protocolVersion: 1` in handshake. Server rejects mismatches with a clear error.

## 7 · Banner mechanics

### 7.1 Visual contract

```
[ ARENA · LOBBY OPEN ]   patrick is opening an arena · 2 / 4 in
                         ── join in 0:38 ──   [ Join ]      [ × ]
```

Mono eyebrow tracked 0.18em; Instrument Serif italic for the host name; mono countdown. Lime hairline border-bottom; aubergine fill with grain overlay.

### 7.2 Data flow

```
arena-server  ←──long-poll──  Astro server (per pod)  ──SSE──→  Browser EventSource
```

One upstream long-poll per Astro pod; fans out via SSE to all tabs. Cross-brand: each Astro server hits the same upstream. No browser-to-game-server connection for banner state.

### 7.3 Host trigger

- `/admin/arena` page (Astro + Svelte), inside `AdminLayout`.
- Only renders content if JWT has `arena_admin` role (mentolder realm).
- "Open lobby" button → `POST /api/arena/start` → arena-server `POST /lobby/open` → returns `{ code, expiresAt }`.
- Host's tab redirects to `/portal/arena?lobby=<code>` (auto-joins).

## 8 · Lobby lifecycle

```
admin POST /lobby/open
        │
        ▼
   ┌──────────────┐   60s join window, banner everywhere
   │     OPEN     │   host auto-joined
   │  code=ZK4M9X │
   └──────┬───────┘
          │
   ┌──────┴─────────────────────┐
   │                            │
4 humans                   countdown=0 with ≥0 humans
   │                            │
   ▼                            ▼
 ┌──────────┐         ┌─────────────────────┐
 │ STARTING │         │ BOT-FILL + STARTING │  T-5s
 └────┬─────┘         └──────────┬──────────┘
      └──────────────┬──────────┘
                     ▼
              ┌─────────────┐
              │  IN-MATCH   │ 30 Hz tick, server simulates
              └──────┬──────┘
                     │ 1 alive
                     ▼
              ┌─────────────┐
              │  SLOW-MO    │ 0.8s
              └──────┬──────┘
                     ▼
              ┌─────────────┐
              │   RESULTS   │ 30s rematch vote
              └──────┬──────┘
                     │
       ≥2 humans vote │   any "Back" or 30s
                     │
   ┌─────────────────┴─────────┐
   ▼                            ▼
 OPEN (new code,             CLOSED
 humans pre-joined)
```

Phase semantics:

| Phase | Duration | Banner |
|-------|----------|--------|
| open | 60s max | "patrick is opening · n/4 · 0:38" |
| starting | 5s | "match starting · 0:04" |
| in-match | open-ended | "match in progress · m/4 alive · [Spectate]" |
| slow-mo | 0.8s | unchanged |
| results | 30s max | "match ended · waiting for rematch" |
| closed | — | hidden |

Bots fill at the `starting` transition, not before — humans see a real n/4 count during the wait.

Rematch requires ≥2 humans voting yes within 30s. Host doesn't have to be one of them.

Forfeit (Esc) = instant death, marked `forfeit` in match log, enter spectator.

## 9 · Game systems

All constants live in `arena-server/src/game/constants.ts`.

### 9.1 Player

| Stat | Value |
|------|-------|
| HP | 2 |
| Armor | 0 → 1 (cap) |
| Move speed | 180 px/s |
| Hitbox | AABB 24×24 |
| Dodge | 0.4s i-frame, 1.2s cooldown, 90 px distance |
| Spawn | 4 corners, 1.5s invuln |

### 9.2 Weapons (all hitscan, 1 damage)

| Weapon | Fire rate | Mag | Reload | Spread | Range |
|--------|-----------|-----|--------|--------|-------|
| Glock (starter, ∞ ammo) | 2.5/s | 12 | 1.4s | 3° | 500px |
| Deagle | 1.5/s | 7 | 2.0s | 1° | 700px |
| M4A1 | 8/s | 30 | 2.4s | 5° | 600px |
| Melee (Space) | 0.8s cd | — | — | 90° cone | 40px (OHKO) |

### 9.3 Items (60s spawn cycle, 3 items per drop, from 12-spot table)

| Item | Effect |
|------|--------|
| HealthPack | +1 HP (cap 2) |
| MedSyringe | +1 HP, 0.4s cast (vulnerable) |
| ArmorPlate | +1 armor (cap 1) |
| AmmoBox | refill current weapon |
| Keycard | unlock door at (420, 62) — opens M4A1 cache |
| RespectCoin | +5 cosmetic score (results only, no persistence) |

### 9.4 Powerups (90s spawn cycle, single instance)

| Powerup | Effect | Duration |
|---------|--------|----------|
| Shield | invuln | 3s |
| Speed | +60% move | 5s |
| Damage | 2× weapon damage | 5s |
| EMP | 250px burst, disables enemy weapons & shields | 3s |
| Cloak | sprite α=0.15 to others, hides nameplate | 4s |

Stack additively. EMP does not disable powerups.

### 9.5 Zone

- Starts at full map; begins shrinking at t=30s.
- Linear to 200px radius over 180s.
- Outside-damage: 1 / 3s.

### 9.6 Map

Port `sandbox.jsx` 1:1. Walls (4 boxing), 3 cover walls at (300,200), (820,300), (500,460), sandbags at (150,300), locked door at (420,62) (Keycard target — M4A1 cache behind), unlocked door at (680, MAP_H-62), vents at (420,420) and (780,120) as paired teleporters (4s/player cooldown). Merchant, turret, drone: decorative only in v1. Supply drop at (330, 340) is first-drop location.

### 9.7 Decals & FX

Server emits one-shot decal placements. Clients render and persist for the rest of the match.

### 9.8 Win condition

1 player alive AND ≥2 ever-alive. Edge: solo human vs bots, human dies → bot winner recorded.

## 10 · Data model

PostgreSQL schema `arena` in **mentolder** shared-db (korczewski writes nothing — its players' matches archive into mentolder).

```sql
CREATE SCHEMA IF NOT EXISTS arena;

CREATE TABLE arena.matches (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  lobby_code      char(6)       NOT NULL,
  opened_at       timestamptz   NOT NULL,
  started_at      timestamptz   NOT NULL,
  ended_at        timestamptz   NOT NULL,
  duration_s      integer       GENERATED ALWAYS AS (EXTRACT(EPOCH FROM (ended_at - started_at))::int) STORED,
  winner_player   text          NULL,
  map             text          NOT NULL DEFAULT 'concrete-arena',
  bot_count       smallint      NOT NULL DEFAULT 0,
  human_count     smallint      NOT NULL,
  forfeit_count   smallint      NOT NULL DEFAULT 0,
  results_jsonb   jsonb         NOT NULL
);
CREATE INDEX matches_started_idx ON arena.matches (started_at DESC);

CREATE TABLE arena.match_players (
  match_id        uuid          NOT NULL REFERENCES arena.matches(id) ON DELETE CASCADE,
  player_key      text          NOT NULL,
  display_name    text          NOT NULL,
  brand           text          NULL,
  is_bot          boolean       NOT NULL,
  character_id    text          NOT NULL,
  place           smallint      NOT NULL,
  kills           smallint      NOT NULL DEFAULT 0,
  deaths          smallint      NOT NULL DEFAULT 0,
  forfeit         boolean       NOT NULL DEFAULT false,
  PRIMARY KEY (match_id, player_key)
);
CREATE INDEX match_players_key_idx ON arena.match_players (player_key, match_id DESC);

CREATE TABLE arena.lobbies (
  code            char(6)       PRIMARY KEY,
  phase           text          NOT NULL,
  host_key        text          NOT NULL,
  opened_at       timestamptz   NOT NULL DEFAULT now(),
  expires_at      timestamptz   NOT NULL,
  state_jsonb     jsonb         NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX lobbies_phase_idx ON arena.lobbies (phase) WHERE phase != 'closed';
```

`player_key = sub@brand` for humans, `bot_<n>` for bots. Drizzle migrations live in `arena-server/src/db/migrations/`. Match-end writes 1 + 4 rows in a single transaction; the `match:end` socket message is emitted only after commit.

Backups: existing `task workspace:backup` already snapshots all shared-db schemas.

DB role: `arena_app` with USAGE on schema + SELECT/INSERT/UPDATE on tables. Password lives in `environments/.secrets/mentolder.yaml` as `arena_db_password`, sealed via `task env:seal ENV=mentolder`.

## 11 · Identity & Keycloak

Two new OIDC clients, one per realm:

| Cluster | Issuer | Client | Type |
|---------|--------|--------|------|
| mentolder | `https://auth.mentolder.de/realms/workspace` | `arena` | public, PKCE |
| korczewski | `https://auth.korczewski.de/realms/workspace` | `arena` | public, PKCE |

`validRedirectUris: https://web.<brand>.de/portal/arena*` + `/admin/arena*`. `webOrigins: https://web.<brand>.de`. New realm role `arena_admin` (mentolder only).

Configs added to `prod-mentolder/realm-workspace-mentolder.json` and `prod-korczewski/realm-workspace-korczewski.json`; applied with `task keycloak:sync ENV=<env>`.

Token issuance: `/api/arena/token` Astro endpoint mints a short-lived `aud: arena` access token from the existing Keycloak session. Stored in React island memory; never persisted. Refresh: client requests a new one ~60s before `exp`, server validates on `auth:refresh` socket message.

Token validation: `jose` library, two JWKS caches keyed by issuer URL. `aud: arena`. `arena_admin` role grants `/lobby/open` (mentolder realm only).

Failure modes:
- Either Keycloak down → players from that brand can't get tokens; other brand unaffected.
- JWKS unreachable → 1h grace from cached keys; then reject new connections with clear error.

## 12 · Deployment & infrastructure

### 12.1 New manifest: `k3d/arena.yaml`

- Deployment `arena-server` in `workspace` ns, `replicas: 1`, `Recreate` strategy.
- Container: `registry.local/arena-server:<tag>`, port 8090.
- Env: `PORT`, `ENV`, `WORKSPACE_NAMESPACE`, `KEYCLOAK_ISSUER_MENTOLDER`, `KEYCLOAK_ISSUER_KORCZEWSKI`, `DB_URL` (from SealedSecret), `LOG_LEVEL`.
- Probes: `/healthz` for readiness + liveness.
- Resources: requests 200m/256Mi, limits 1000m/512Mi.
- Service: ClusterIP, port 80 → 8090.
- IngressRoute: `arena-ws.${PROD_DOMAIN}` on `websecure`, wildcard TLS, CORS middleware allowlisting both brand origins.

### 12.2 Per-env overlays

- `prod-mentolder/arena-server-patch.yaml`: pin nodeAffinity to Hetzner nodes, wire real host.
- `prod-korczewski/`: no arena patches. Website here sets `ARENA_WS_URL=https://arena-ws.mentolder.de` only.

### 12.3 Bootstrap

- `k3d/migrations-arena.yaml`: Job creates `arena_app` role + `arena` schema. Run by `workspace:post-setup`.
- SealedSecret holds `arena_db_password` + `arena_db_url`.

### 12.4 envsubst variables

`PROD_DOMAIN`, `PROD_DOMAIN_DASH`, `WORKSPACE_NAMESPACE` must be added to the envsubst variable lists in the relevant Taskfile deploy tasks (per the gotcha note in CLAUDE.md).

### 12.5 Website changes

- Three layout files include `<ArenaBanner/>` (one line each).
- New `ARENA_WS_URL` env var in `k3d/website.yaml` ConfigMap, set to `https://arena-ws.mentolder.de` on both clusters.
- New `/portal/arena` and `/admin/arena` pages, plus three `/api/arena/*` endpoints.
- Ships on the next `task feature:website` deploy.

### 12.6 Taskfile commands

```bash
task arena:build              # docker build + import/push
task arena:deploy ENV=<env>   # build + apply manifests (korczewski: skip manifest apply)
task arena:status ENV=<env>
task arena:logs ENV=<env>     # mentolder only
task arena:db ENV=mentolder
task arena:teardown ENV=<env>
```

Inlined into `Taskfile.yml`. Convention follows `brett:*` / `livekit:*`.

### 12.7 ArgoCD

No new ApplicationSet. arena lives inside the existing `workspace` Application; the per-cluster overlay (`prod-mentolder` vs `prod-korczewski`) decides whether to include it.

### 12.8 CI

- New job `arena-server` in `.github/workflows/ci.yml`: `pnpm install && pnpm test && pnpm build`.
- Existing `test:manifests` validates `k3d/arena.yaml` structurally.
- `task workspace:verify` extended with a `/healthz` smoke check.

### 12.9 Failure & rollback

- Pod crash → game offline; banner returns to idle. Website unaffected.
- Bad release → `task arena:deploy` with previous image tag. Match-in-progress is lost (acceptable v1).
- DB corruption → existing `task workspace:restore -- all <timestamp> --context mentolder`.
- TLS renewal → existing cert-manager + ipv64 DNS-01 flow; wildcard cert covers `arena-ws.mentolder.de`.

## 13 · Testing

### 13.1 arena-server unit & integration (vitest)

`auth/jwt.test.ts`, `game/tick.test.ts`, `game/weapons.test.ts`, `game/items.test.ts`, `game/powerups.test.ts`, `game/zone.test.ts`, `lobby/lifecycle.test.ts`, `bots/ai.test.ts`, `bots/nav.test.ts`, `db/repo.test.ts`.

Tick determinism: same inputs → same diff sequence (replay reproducibility).

### 13.2 Protocol contract

`proto/messages.test.ts` round-trips every variant. CI diffs `arena-server/src/proto/messages.ts` against `website/src/components/arena/shared/lobbyTypes.ts` to catch drift.

### 13.3 End-to-end (Playwright)

- `tests/e2e/arena-banner.spec.ts` — banner appears on `/` when lobby opens, correct host + countdown, disappears on close, dismiss per-lobby, cross-brand (lobby opened on mentolder shows banner on korczewski page).
- `tests/e2e/arena-match.spec.ts` — admin opens lobby, second user joins, 60s expires with 2 humans + 2 bots, match runs, win-by-forfeit, results render, match row in DB.

Banner spec tagged `@smoke`; match spec `@e2e` (nightly).

### 13.4 Test IDs

| ID | Title | Type |
|----|-------|------|
| FA-30 | Arena · lobby open by admin shows banner across both brands | BATS+Playwright |
| FA-31 | Arena · 4-player match (2 humans + 2 bots) runs and archives | Playwright |
| FA-32 | Arena · rematch flow re-opens lobby with same humans | Playwright |
| FA-33 | Arena · forfeit (Esc) eliminates player and moves them to spectator | Playwright |
| SA-11 | Arena · non-admin cannot POST `/api/arena/start` | BATS |
| SA-12 | Arena · cross-realm JWT (korczewski user) accepted by arena-server | BATS |
| SA-13 | Arena · forged JWT (untrusted issuer) rejected | BATS |
| NFA-10 | Arena · `/healthz` p95 < 200ms under 4-player load | BATS |

Each gets a BATS scaffold in `tests/cases/<id>/`. `task test:inventory` regenerated and committed.

### 13.5 Not tested in v1

Latency under realistic networks; sprite rendering visual diffs; bot fairness; long-running stability (covered by livenessProbe restarts).

## 14 · Future scope (NOT v1)

### 14.1 Coop campaign

- Lobby `mode: 'campaign'` alongside `mode: 'battle-royale'`. Same state machine, different `MatchState` shape.
- New `arena-server/src/campaign/` module: PvE waves, NPC enemies (reuse Turret/Drone sprites + Zombie character).
- `Campaign` map type. `arena-server/src/game/maps/` directory.
- Persistence: `arena.matches.mode` + `arena.matches.level_id`. New `arena.campaign_progress` table.
- Banner shows "patrick is running campaign · wave 3 · 2/4 in".
- Friendly bots flip the team flag in existing `bots/ai.ts`.

### 14.2 Second-pass items

| Item | Cost |
|------|------|
| RESPECT currency + leaderboard | small |
| Procedural / multiple maps | medium |
| LiveKit voice chat | medium |
| Bot difficulty selector in admin UI | trivial |
| Cosmetic loadout / store | large |
| Spectator-only public join | medium |
| Replay system | medium |
| Anti-AFK warning | trivial |
| Match telemetry → Grafana | small |

### 14.3 v1 decisions that must not change

- Player key format `sub@brand` (aggregations depend on stability).
- `results_jsonb` snapshot (cheap reads in v1; don't normalize away).
- Protocol versioning (`protocolVersion: 1` from day one).
- Tick rate 30 Hz (changing breaks recorded inputs).
- Multi-tenant room types in code (singleton only enforced by `/lobby/open` check, not by types).

## 15 · Out-of-tree assets to produce

- 4 normal-people character sprites: blonde guy, brown-haired guy, long red-haired girl, blonde long-haired girl. Pipeline: Blender EEVEE, 60° iso, 256×256 PNG, warm key + cool fill + rim, transparent BG. v1 ships with CSS-portrait stubs from `Kore Design System latest/characters/` while the renders are produced.
- 10–15 SFX (gunshots × 3 weapons, footsteps × 2 surfaces, hits × 2, pickups × 3, zone alarm, dodge whoosh, slow-mo riser). Royalty-free pack or commissioned set; OGG, mono, 16-bit/44.1kHz.

## 16 · Open questions / known unknowns

- **Astro 4 server-side SSE behavior under Cloudflare / Traefik**: must confirm long-poll → SSE plumbing survives the reverse proxy without buffering. Test on dev cluster first; fallback is plain JSON polling at 2s interval if SSE is hostile.
- **Astro React island bundle size**: PixiJS 8 is ~300KB gzipped. Acceptable on a portal page; not acceptable on the main marketing pages — banner is Svelte (small), and the React island only loads on `/portal/arena` (Astro routes split bundles by page).
- **Pixi text vs DOM text**: HUD overlay in React-DOM means crisper text and accessibility, but layered z-order against a Pixi canvas needs care on mobile browsers. Test on iOS Safari before sign-off.

## 17 · Build sequence (handover to writing-plans)

The implementation plan that follows this spec should sequence work as:

1. arena-server skeleton (Express + Socket.io + Drizzle bootstrap, `/healthz`, dual-issuer JWT validation, no game logic).
2. Database migrations (`arena.matches`, `arena.match_players`, `arena.lobbies`, `arena_app` role).
3. Lobby lifecycle (open, join, ready, 60s countdown, bot fill, state machine, no actual match).
4. Astro `/api/arena/active` SSE + `/api/arena/start` + `/api/arena/token` endpoints.
5. `ArenaBanner.svelte` + layout injection. Manual smoke: open lobby via curl, banner appears on both brands.
6. Game tick loop without combat (movement + collisions only, single player).
7. Combat: weapons, melee, damage, dodge, kill feed events.
8. Items + powerups + zone.
9. Map ports (sandbox.jsx coords, walls, doors, vents, decals).
10. React + Pixi client: PixiApp + LobbyScene + MatchScene with input + minimal render.
11. HUD overlay (HP pips, kill feed, timer, alive count, minimap, ping pill).
12. Bot AI.
13. Slow-mo + ResultsScene + rematch vote + match archival.
14. SFX wiring.
15. Spectator scene.
16. Keycloak realm-config additions (clients + role).
17. Deployment manifests + Taskfile commands + envsubst additions + SealedSecret.
18. Unit + integration + Playwright + BATS tests for the new FA-/SA-/NFA- IDs.
19. CI job + `task test:inventory` regeneration.
20. `task arena:deploy ENV=mentolder` + `task feature:website` deploy + smoke `/healthz` + manual end-to-end match.
