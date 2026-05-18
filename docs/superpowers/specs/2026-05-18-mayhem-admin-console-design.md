# Mayhem Admin Console — Design Spec

**Date:** 2026-05-18  
**Branch:** feature/mayhem-admin-console  
**Status:** Approved

---

## Overview

An in-game admin console for the Brett (Systembrett) service that lets admin users control the Mayhem game environment and join rooms as spectator or player. The console lives entirely inside the brett 3D scene — no separate admin page needed.

**Key decisions:**
- Layout: floating panel overlay inside brett (right edge slide-in)
- Auth: brett becomes a standalone Keycloak OIDC client (`brett-app`)
- Room entry: room browser overlay inside brett (no `?room=` param required for admins)
- Admin join mode: spectator by default, switchable to player at join time
- Controls: all six (mayhem toggle, mode switch, kick, bots, reset round, broadcast link)

---

## User Flow

1. Admin navigates to `brett.mentolder.de` (no room param)
2. Brett server detects no session → redirects to Keycloak login
3. After KC login, brett recognises `admin` role → shows room browser overlay
4. Admin selects a room and chooses Spectator (default) or Player
5. Brett 3D scene loads; admin panel tab appears on right edge
6. Admin clicks tab → panel slides open with all six controls
7. Controls send admin-only WebSocket messages; server validates session before relay

Non-admin users skip steps 2–4 (room browser never shows) and see no panel tab.

---

## Architecture

### Brett server (`brett/server.js`)

#### OIDC auth (new)

Three new HTTP routes using `openid-client`:

| Route | Purpose |
|---|---|
| `GET /auth/login` | Redirects to KC authorize endpoint; stores `?returnTo` in state |
| `GET /auth/callback` | Exchanges code for tokens; writes `brett_session` cookie (HttpOnly, Secure, 8h TTL); redirects to original URL |
| `GET /auth/me` | Returns `{ userId, name, isAdmin }` from session — called by client JS on load |

Session store: in-memory Map keyed by session ID from cookie. TTL matches KC access token expiry (default 8h). Single-pod, no Redis needed.

New env vars:

| Var | Example |
|---|---|
| `KC_URL` | `https://auth.mentolder.de` |
| `KC_REALM` | `workspace` |
| `KC_CLIENT_ID` | `brett-app` |
| `KC_CLIENT_SECRET` | (sealed) |

#### Admin REST endpoint (new)

`GET /api/admin/rooms` — requires valid admin session.

Response: array of room objects assembled from in-memory state:

```json
[
  {
    "token": "abc123",
    "name": "Team-Aufstellung",
    "playerCount": 3,
    "maxPlayers": 4,
    "mayhem": true,
    "gameMode": "deathmatch",
    "lastActive": "2026-05-18T14:32:00Z"
  }
]
```

Room name comes from the DB snapshot (`brett_rooms.state`). Player count from `rooms` Map size. Mayhem + mode from `figureMaps` (`__mayhem__`, `__game_mode__` entries). Empty rooms (no active WS connections) are included but flagged.

#### Admin WebSocket command validation (new)

Seven new admin-only WS message types. Server checks admin session before relaying:

| Type | Payload | Server action |
|---|---|---|
| `admin_mayhem_toggle` | `{ enabled: bool }` | Relay as `mayhem_mode`; update figureMap |
| `admin_mode_set` | `{ mode: "warmup"\|"deathmatch"\|"lms" }` | Relay as `game_mode_change`; update figureMap |
| `admin_kick` | `{ playerId: string }` | Send `player_leave` to victim WS; close their connection |
| `admin_bot_spawn` | `{}` | Relay `bot_spawn` to all peers in room; add `bot_spawn` to `RELAY_TYPES` in server.js |
| `admin_bot_despawn` | `{ botId: string }` | Relay `bot_despawn`; remove from figureMap; add `bot_despawn` to `RELAY_TYPES` |
| `admin_round_reset` | `{}` | Relay `round_reset` to all; clear lmsAlive; reset kill counts |
| `admin_broadcast` | `{}` | Server-side: call website broadcast API (`POST /api/admin/brett/broadcast`) |

If sender has no valid admin session: drop the message silently (no error to avoid fingerprinting).

#### New dependencies

```json
"openid-client": "^5.x",
"express-session": "^1.x"
```

---

### Brett client (vanilla JS, no bundler)

#### `brett/public/assets/room-browser.js` (new)

Rendered when `auth/me` returns `isAdmin: true` and no `?room=` query param is present.

- Centered overlay on blurred 3D background
- Fetches `GET /api/admin/rooms` on mount, auto-refreshes every 10s
- Displays: room name, player count indicators (●●● ○), mayhem badge, game mode badge
- "Neuer Raum" button: generates a random token, navigates to `?room=<token>`
- "Beitreten" button: opens join dialog

#### `brett/public/assets/admin-panel.js` (new)

Injected into the scene by `scene.js` when `isAdmin: true`.

Structure: fixed-position div on the right edge. A vertical "⚔ ADMIN" tab toggles the panel open/closed.

Panel sections top to bottom:

1. **Room info** — name, player count
2. **Mayhem toggle** — AN / AUS buttons; active state highlighted green
3. **Mode selector** — three buttons (Warmup / Deathmatch / LMS); active highlighted purple
4. **Bots** — minus/count/plus; count shows current bot count from figureMap
5. **Player list** — one row per connected player (name from `player_join` message); Kick button per player; bots show "Entf." instead
6. **Actions** — "↩ Runde neu starten" and "🔗 Link senden" (triggers `admin_broadcast`)

All controls send admin-only WS messages. UI state updates optimistically then corrects on next snapshot.

#### Join dialog

Modal shown by `room-browser.js` before navigating into a room. Two options:

- **Zuschauen** (default, gold border) — free-fly camera, no avatar spawned, invisible to players
- **Mitspielen** — spawns avatar at next spawn slot, sends `player_join`

Selection stored in sessionStorage; panel reads it to know whether to send `player_join` on scene init.

#### Spectator camera

When join mode is `spectator`, `scene.js` skips the avatar spawn and enables free-fly camera (WASD + mouse look) without physics. Implemented by reusing the existing `MayhemChaseCamera` in free mode — no target object. Admin can switch to player mid-session via a "Mitspielen" button in the panel header.

#### `brett/public/assets/scene.js` (modified)

On load: call `GET /auth/me`. If `isAdmin`:
- Mount `RoomBrowser` if no `?room=` param
- Mount `AdminPanel` after scene init
- Apply join mode from sessionStorage

---

### Keycloak realm (`k3d/realm-workspace-dev.json` + prod variants)

Add new client `brett-app`:

```json
{
  "clientId": "brett-app",
  "enabled": true,
  "publicClient": false,
  "redirectUris": [
    "http://brett.localhost/auth/callback",
    "https://brett.mentolder.de/auth/callback",
    "https://brett.korczewski.de/auth/callback"
  ],
  "webOrigins": ["+"],
  "protocol": "openid-connect",
  "standardFlowEnabled": true
}
```

Admin role check uses existing `workspace` realm role `admin` — no new roles needed.

---

### Secrets

**Dev** (`k3d/secrets.yaml`): add `BRETT_KC_CLIENT_SECRET` (dev placeholder value).

**Prod** (`environments/.secrets/mentolder.yaml` + `korczewski.yaml`): add `BRETT_KC_CLIENT_SECRET` with real values; re-seal both envs.

---

### Website proxy (`website/src/pages/admin/brett/[...path].astro`)

Add `/auth/` to the allowed paths allowlist so the OIDC redirect flow works when users arrive via the admin section:

```js
const allowed = [
  /^api\//,
  /^auth\//,          // new
  /^three\.min\.js$/,
  /^art-library\//,
  /^healthz$/,
];
```

---

## Error handling

- **KC unreachable at login:** brett shows a "Login nicht möglich" error page with a retry link
- **Session expired mid-session:** `auth/me` returns 401 → client redirects to `/auth/login?returnTo=<current-url>`
- **Admin WS command from non-admin:** silently dropped server-side
- **`/api/admin/rooms` with no rooms in memory:** returns `[]` (not an error)
- **Bot spawn when room is full (4/4):** server rejects with `{ type: "admin_error", reason: "room_full" }` — panel disables the + button when `playerCount >= 4`

---

## Testing

- `brett/test/server-mayhem.test.js` — extend with admin WS command validation tests (non-admin sender gets no relay)
- `brett/test/server-mayhem.test.js` — test `/api/admin/rooms` returns correct shape
- Manual: open brett in two browser tabs (one admin, one regular) — confirm panel only appears for admin tab
- Manual: join as spectator → confirm no `player_join` sent, no avatar visible to player tab
- Manual: kick a player → confirm their WS is closed and `player_leave` propagates

---

## Out of scope (v1)

- Persistent admin action log
- Admin chat overlay
- Spectator name tags / admin visibility to players
- Multiple simultaneous admin sessions (works, but no coordination UI)
