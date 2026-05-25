# Brett Mayhem · Polished 1v1 with Spectators

**Status:** draft
**Date:** 2026-05-25
**Surface:** brett.korczewski.de (3D game) + web.korczewski.de (homepage banner)

## Context

Brett mayhem already has a working duel mode: BO3 rounds (`brett/public/assets/mayhem/game-mode.js`), hero-select for 4 heroes, a fighter-side score+HP HUD (`#duel-score-hud`), late-join auto-spectator (`_isSpectator` path in `mayhem.js`), and a match-end overlay that auto-returns to warmup after 5s. The bones work. What's missing is polish: spectators see a barely-styled pill, scoring is host-decided (host disconnect = scoring breaks silently), there's no rematch button, no invite/share UX (today: paste a URL in Discord), no sound theatre for the match.

This spec scopes a polish pass across five dimensions, organised into three coordinated PRs.

## Goals (in scope)

1. **Spectator-specific HUD** — dedicated top-bar with both fighter portraits, BO3 round dots, both HP bars; bottom-right footer with spectating-target + Tab/F hint.
2. **SFX + feel** — round-start gong, KO stinger on round end, crowd cheer on match end.
3. **Server-authoritative duel scoring** — server's existing `handleDuelDeath` (at `brett/server.js:544`) becomes the broadcaster; host client stops emitting `duel_round_end` / `duel_match_end`.
4. **Match-end overlay + rematch** — visually polished overlay with portraits, hero recap, BO3 score; three buttons: *Rematch (same heroes)* / *Rematch (pick new heroes)* / *Back to warmup*. Rematch needs both fighters to confirm.
5. **Invite / share / spectator link** — in-room *Invite* popover that mints `?role=fighter` and `?role=spectator` URLs with QR codes, plus a "⚔ Duell läuft" banner on web.korczewski.de while a duel is in `fighting` phase.

## Non-goals (out of scope)

The following were considered and explicitly skipped:

- **Pre-match + round intros** — no "PLAYER A vs PLAYER B" intro, no "ROUND 2" banner between rounds. Today's hardcoded 3s round-reset pause stays as-is.
- **Cinematic spectator camera** — no auto-cam; Tab + F manual controls stay.
- **Forfeit / disconnect handling** — if a fighter closes their tab mid-match, the duel may hang. Accepted risk: this is a friends-only game; the user does not want the complexity of host migration, reconnect grace, or auto-forfeit detection. Server-auth scoring helps a bit (host disconnect no longer breaks scoring), but a dying-client-that-never-sent-`player_death` still hangs.
- **Match history persistence** — no DB table for duel results; no "my duels" page or leaderboard.
- **OBS-friendly overlay mode** — no `?obs=1` chrome-stripping for streamers.

## Architecture overview

Three PRs, ship-independent except where PR 2's new server-broadcast events feed PR 1's spectator HUD round-dot updates (same message names + payload shape as the existing host-emitted events, so no rework).

| PR | Surface | Protocol delta | Coupling |
|----|---------|----------------|----------|
| **1 — Presentation polish** | brett client only | none | independent |
| **2 — Match flow** | brett client + brett server | 2 messages move host→server, 6 new types | server-auth pre-req for rematch |
| **3 — Discovery** | brett client + brett server + website | 1 new HTTP route, 2 new URL params | independent |

Branch / merge plan: each PR squash-merges to `main`. PR 1 and PR 3 can land in any order; PR 2 contains the only protocol change and lands on its own to keep the diff reviewable.

## PR 1 — Presentation polish

**Goal:** spectators get a real HUD; everyone gets duel theatre SFX. Zero protocol change.

**Files touched:**
- `brett/public/assets/mayhem/mayhem.js` — replace `#spectator-hud` pill (lines 801–815) with a structured top-bar block: hero portraits + BO3 round dots + both HP bars. Bottom-right footer keeps the Tab/F controls hint but as a separate styled block. New `_updateSpectatorHud()` re-renders on `hp_update` and `duel_round_end`. Hook three new SFX into existing call sites: round start (`_startDuelRound`), round end (`_onDuelRoundEnd`), match end (`_onDuelEnd`).
- `brett/public/assets/mayhem/heroes.js` — add `portrait` field per hero pointing at the existing `assets/figure-pack/faces/portrait-{patrick,tina,martina,oskar}.png`.
- `brett/public/assets/mayhem/audio.js` — three rows to `SFX_MAP`: `duel-gong`, `ko-stinger`, `crowd-cheer`.
- New asset files: `brett/public/assets/sfx/duel-gong.ogg`, `ko-stinger.ogg`, `crowd-cheer.ogg` — sourced from Freesound.org (CC0), credited in `brett/public/assets/sfx/CREDITS.md`.

**Visual reference:** the polished spectator HUD top-bar — portrait squares, BO3 dots (filled / leading / pending), 130px HP bars; dark-glass pill styling matching today's `#duel-score-hud`.

**Isolation:** spec-HUD code is a single function pair (`_showSpectatorHud` / new `_updateSpectatorHud`) — no callers outside `mayhem.js`.

**Testing:**
- Playwright smoke (group `services`): open a duel room as 3rd party via test auth (`/auth/e2e-login`, per PR #1090); assert `#spectator-hud-v2` is present with two `img[src*="portrait-"]` portraits and three BO3 dot elements.
- Manual verification on dev cluster — SFX timing.

## PR 2 — Match flow

**Goal:** server-auth scoring + polished match-end overlay + rematch button.

**Why coupled:** the rematch button needs server-side per-room state (`rematchRequests`), and that state mirrors the same authoritative-server pattern as moving the round/match-end broadcast off the host. Splitting means defining the same `duelRooms[room]` mutation surface twice. Single coordinated PR is cheaper.

### Server changes (`brett/server.js`)

- `handleDuelDeath` at line 544 already runs server-side. Currently its return value is discarded at line 881. Capture it; `broadcast(room, { type: 'duel_round_end' | 'duel_match_end', winner, winsA, winsB })`.
- New: `const rematchRequests = new Map()` alongside `duelRooms`.
- New handler for `rematch_request`: stash `{ sameHeroes }` per fighter slot (resolve slot from `duelRooms[room].playerA` / `.playerB` vs `ws._playerId`); when both present, broadcast `duel_reset { mode: 'same' | 'select' }` (mode is `'select'` if at least one wanted new heroes), reset `duelRooms[room].winsA = winsB = 0`, clear `rematchRequests[room]`. Until both present, broadcast `rematch_state { requested: [...], opponent }` to update UI.
- New handler for `duel_abandoned_request` (from any fighter): broadcast `duel_abandoned { reason: 'fighter_request' }`, clear `rematchRequests[room]`, clear the inactivity timer (below).
- 60s server-side inactivity timer **started when the server broadcasts `duel_match_end`**, cleared on any `rematch_request` / `duel_abandoned_request` for that room, restarted on `duel_reset` if mode is `'select'` (gives time to pick heroes). On expiry → broadcast `duel_abandoned { reason: 'timeout' }`.
- 3s server-side delay after `duel_round_end` (and not match_end) → broadcast `duel_round_start { round }`. Replaces the per-client local `setTimeout` round-reset drift in today's `_onDuelRoundEnd`.
- **`duel_round_end` and `duel_match_end`**: today these are in `RELAY_TYPES` (line 518) — the host emits, server relays. Polished: remove from `RELAY_TYPES` and have the server construct + `broadcast()` them directly from inside the `player_death` handler. Atomic with the client-side stop-emitting change.
- **New types — none added to `RELAY_TYPES` or `TRANSIENT_TYPES`.** All 6 are handled with dedicated code paths:
  - `rematch_request`, `duel_abandoned_request` (client → server) — own `if (msg.type === ...)` blocks at the top of the WS message handler, before the generic relay path; never enter `applyMutation` or `schedulePersist`.
  - `duel_round_start`, `rematch_state`, `duel_reset`, `duel_abandoned` (server → clients) — constructed and broadcast by the server, never echoed back by clients.

### Client changes (`brett/public/assets/mayhem/mayhem.js`)

- Remove host-side emission of `duel_round_end` / `duel_match_end` (lines 627, 630, 1304–1309). The host still calls `gameMode.handleDuelDeath()` to update its local model for HUD purposes, but does not broadcast.
- Remove hardcoded 5s auto-warmup `setTimeout` in `_onDuelEnd` (line 670). Server-driven instead.
- Replace today's `_showDuelMatchResult` overlay with the polished one: winner portrait (highlighted, `#d7b06a` border), loser portrait (dimmed), score (`2 — 1` typography), hero recap (`KATANA · PISTOLE · RIFLE` for Patrick etc.), three buttons. Each button emits its corresponding message.
- New listener: `duel_reset` → close overlay; if `mode === 'same'` call `localRespawn()` + `_buildDuelHud(0, 0)`; if `mode === 'select'` reset to hero-select UI.
- New listener: `duel_round_start` → reset local HP, `localRespawn()`, refill `_duelHpFillA/B` to 100%. Replaces local setTimeout in `_onDuelRoundEnd`.
- New listener: `rematch_state` → render "⏳ {opponent} hat um Rematch gebeten · warte auf {me}" indicator inside the match-end overlay.
- New listener: `duel_abandoned` → close overlay; if host, emit `game_mode_change { mode: 'warmup' }`.

### Testing

- New `brett/test/duel-server-auth.test.js` (Node test runner, matching existing `brett/test/` style): start a server, simulate `player_death` from a fighter, assert server broadcasts `duel_round_end`. Then simulate both `rematch_request` events, assert `duel_reset` with mode resolution.
- Playwright E2E (group `services`): two fighters via `/auth/e2e-login`, complete a 2–0 match, assert match-end overlay visible; click *Rematch (same heroes)* on both clients, assert overlay closes and round 1 starts again.

### Migration / risk

- The proto-drift CI guard between `arena-server/src/proto/messages.ts` and `website/src/components/arena/shared/lobbyTypes.ts` does **not** cover brett — brett's WS contract is just string keys in `RELAY_TYPES`. So this change has no guard. Mitigation: the test above plus the deployment is to korczewski only and rollback is `git revert + task feature:brett`.
- If a client is on the old version and the server is on the new version: client still emits `duel_round_end`, server relays it, all clients receive the duplicate event. The duplicate is idempotent for HUD render (same payload) so no visible bug — the score just gets "set to 2-1" twice in a row.
- If a client is on the new version and the server is on the old version: server doesn't broadcast `duel_round_end` itself, so the new client never sees the event. The match hangs. Mitigation: deploy server first, then client. `task feature:brett` rebuilds and rolls out the brett image which contains both — they update atomically.

## PR 3 — Discovery (invite, share, spectator link, live banner)

**Goal:** make it possible to send "play with me" / "watch me" links without out-of-band code-pasting, and surface a live duel to anyone visiting web.korczewski.de.

### Brett client

- `brett/public/assets/main.js` — read `?role=` query param from `location.search` at boot. If `role === 'spectator'` skip the room-browser modal and call the existing spectator entry path. If `role === 'fighter'` skip the room-browser modal and auto-join into the next free fighter slot (delegates to current `mayhem.js` hero-select if mode is `duel`, otherwise just joins normally).
- `brett/public/assets/mayhem/mayhem.js` — new module `_buildInvitePopover()` triggered by a small "Einladen" button added to `_buildDuelHud`. Renders the modal: room code, two URL rows (fighter + spectator), QR for each, "Live-Banner aktivieren" checkbox. Uses `navigator.clipboard.writeText` for copy.

### Brett server

- New `app.get('/api/duels/live', ...)` — no auth (we already broadcast playerIds to all peers; live status alone is less). Returns `[{ room, phase, round, bestOf, startedAt }]` for each room whose `duelRooms.get(room)` is non-null AND whose game mode (from `buildStateFromMutations`) is `duel`. Cached 5s via a tiny in-memory map. No fighter names in the response — keeps the brett→website coupling minimal.

### Website

- `website/src/components/kore/DuelLiveBanner.svelte` (new) — polls `https://brett.korczewski.de/api/duels/live` every 20s. When the array is non-empty, renders the banner (gradient strip, pulsing dot, "⚔ DUELL LÄUFT · Runde N · BO3 · seit M Min", "ZUSCHAUEN →" link targeting `brett.korczewski.de/?room=X&role=spectator`). When empty, renders nothing.
- `website/src/pages/index.astro` — mount `<DuelLiveBanner client:idle />` only when `process.env.BRAND_ID ?? process.env.BRAND === 'korczewski'`. Mentolder unaffected.

### Dependencies

- `brett/package.json` — add `qrcode-svg` (5 KB, zero transitive deps, MIT). Client-side QR rendering only.

### Testing

- BATS test for `GET /api/duels/live` (empty + with duel active) — pure HTTP, no WS.
- Playwright E2E (group `services`): visit `brett.korczewski.de/?room=X&role=spectator` → assert no room-browser modal renders + the spectator HUD appears. Visit `web.korczewski.de` while a duel is live → assert the banner is present and the "Zuschauen" link's `href` carries `role=spectator`.

### Isolation

- `?role=` is purely client-side gating — server doesn't know or care about role; it still just receives `join` + `player_join`. Cheap, no protocol surface.
- Banner only mounts on Kore homepage (`BRAND === 'korczewski'`); mentolder is unaffected.
- PR 3 has no dependency on PR 1 or PR 2 — can land first.

## Cross-cutting

### Error handling

- `/api/duels/live` unreachable: `DuelLiveBanner` swallows the fetch error and renders nothing. No degraded state visible to the user. Banner re-tries on next 20s tick.
- WS reconnect during a duel: existing snapshot rehydration in `brett/server.js` (line 819) covers this. New server-broadcast events (`duel_round_end` etc.) are not re-played on reconnect, but the rejoining client gets the current `duelRooms[room]` state via a snapshot extension (add `duelState` to the snapshot payload — small follow-up inside PR 2).
- Rematch button double-click: disable button on first click + re-enable on `rematch_state` or `duel_reset` reception.
- Match-end overlay closed via browser-level dismissal (Esc, back-button): no-op — overlay re-opens on next render tick. The only way to leave the match-end state is to click one of the three buttons or wait for the 60s server timeout.
- `?role=fighter` URL clicked but lobby is full (2 fighters present): client falls through to spectator auto-detect path. No new branch — the existing late-join logic at `mayhem.js:1237` already handles this.

### Testing summary

| PR | New tests |
|----|-----------|
| 1 | 1 Playwright smoke (spec HUD render) |
| 2 | 1 Node test (server-auth scoring + rematch flow) + 1 Playwright E2E (full duel + rematch) |
| 3 | 1 BATS (`/api/duels/live` shape) + 1 Playwright E2E (role param + banner render) |

All Playwright tests live under `tests/e2e/` and run via the `services` group (per `reference_e2e_test_groups`).

### Deployment

Per `arena-brett-deploy` skill and `feedback_website_deploy` memory:
- PR 1 + PR 2: `task feature:brett` (rebuilds + rolls out brett image on korczewski).
- PR 3: `task feature:brett` for the server-side changes + `task feature:website ENV=korczewski` for the banner. The mentolder website is **not** redeployed for PR 3 (no change for that brand).

PR 2 specifically: deploy order is server-then-client, but since `feature:brett` ships both atomically inside one image, this resolves itself.

## Open questions

None blocking. One nice-to-have to flag in writing-plans:

- The fighter display name on the match-end overlay (`PATRICK GEWINNT`) currently isn't available server-side — brett tracks `_playerId` strings, not display names. The hero-name is fine (from `HEROES[heroId].name`). For the winner banner, the cheapest fix is to have clients send `display_name` as part of `duel_start` so the server can echo it back. This is a small extension — flag for the implementation plan.

## Risks

| Risk | Mitigation |
|------|------------|
| PR 2 client/server version skew during deploy | Atomic via single brett image; staging on dev cluster first via `task dev:cluster` |
| `qrcode-svg` adds bundle weight | 5 KB gzipped, zero deps — acceptable for an in-room popover that loads on-demand |
| No CI guard for brett WS protocol | Add a `brett/test/proto-types.test.js` listing `RELAY_TYPES` + `TRANSIENT_TYPES` + asserting no duplicates, deferred to a follow-up unless inline-able in PR 2 |
| `/api/duels/live` polling adds load | 5s server cache + 20s client poll = ~12 requests/min per visitor. Negligible at korczewski's traffic scale; revisit only if monitoring shows it |

## Out of repo

- The 3 SFX files need to be sourced from Freesound.org under CC0 before PR 1 can land. Plan step: pick + download + drop into `brett/public/assets/sfx/` + update `CREDITS.md`.
