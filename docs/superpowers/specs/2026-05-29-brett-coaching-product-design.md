# Brett Coaching as a Multiuser Product — Design

**Date:** 2026-05-29
**Branch:** `feature/brett-coaching-product`
**Grilling ticket:** T000297
**Brand/target:** `brett.mentolder.de` (gekko)

## Goal

Turn Brett's **coaching mode** into a genuinely usable multiuser coaching tool for
gekko/mentolder: a remote session with **1 coach + 3 participants**, each on their
own device, working a shared 3D constellation board live. Polish the facilitation
experience (named session steps, presence, reliable sync, figure labels, a clean
coaching-only UI, a low-friction join flow) and hide korczewski's 5 personal
characters on the mentolder brand.

The coaching *board* (Three.js scene, mannequin placement, drag-and-drop, appearance
editing) already works. What is missing is the **session layer** on top of it.

## Decisions (from grilling T000297 + brainstorming)

| # | Decision | Choice |
|---|----------|--------|
| Join model | How coach + participants identify | **Everyone via Keycloak SSO.** Coach = `isAdmin` role; participants = authenticated non-admins. |
| Phase model | What "session phases" mean | **Coach-defined named steps**, layered over the existing `warmup→active→paused→ended` lifecycle. Editable default template. |
| Edit conflict | Two people grab one figure | **Soft-lock while dragging** (server-authoritative). No coach board-freeze. |
| Presence | How much presence to show | **Names panel + name/colour on grabbed figure.** No free-floating 3D pointer. |
| Build approach | Code structure | **New coaching ES modules + single WebSocket** (gate `ws.mjs` so coaching uses one connection). |
| Brand gating | Strictness | **UI-level hide** of the 5 characters on mentolder. Server keeps validating against the full spec (no hard-block). |

## Architecture

A new **coaching-session layer** of small ES modules under
`brett/public/assets/coaching/`, loaded **only in coaching mode**, all communicating
over a **single** WebSocket connection. `server.js` gains coaching-specific message
types and an authentication gate. Brett becomes brand-aware via `/api/config`.

### Client modules (mirror existing `mode-state.mjs` + `node:test` pattern)

- **`coaching/phases.mjs`** — ordered list of labelled steps with an editable default
  template (`Aufstellen → Wahrnehmen → Verändern → Abschluss`), `advance()`, `back()`,
  `setSteps()`, current index. Pure logic, no DOM.
- **`coaching/presence.mjs`** — participant roster (`userId`, `name`, assigned colour),
  `join`/`leave`, and a `holds` map (who currently holds which figure). Pure logic.
- **`coaching/locks.mjs`** — soft-lock map `figureId → {userId, name, colour}`;
  `acquire()`, `release()`, `releaseAllFor(userId)`, expiry. Pure logic.
- **`coaching/wire.mjs`** — thin wrapper over the single WS connection exposing
  `send(type, payload)` and `on(type, handler)`. Both the inline board code and the
  coaching modules use this one wire.
- **`coaching/hud.mjs`** — renders the phase HUD, presence panel, and join overlay
  (DOM). Coaching-mode only; never present in mayhem mode.

### Single-WebSocket consolidation (the sync fix)

`index.html` currently opens **two** WebSocket connections to `/sync`: the inline
`connectWS()` and `ws.mjs`'s `connect()` (via `main.js`), both sending `join`. This
double-join is a likely desync source. In **coaching mode** the inline `connectWS()`
is the sole connection; `ws.mjs.connect()` is gated to **mayhem mode only**. The
coaching modules attach to the single connection through `coaching/wire.mjs`.

## Server changes (`brett/server.js`)

### Authentication gate
Serving the coaching board requires an authenticated session (reuses the existing
OIDC login flow + `express-session`). Unauthenticated requests to the board redirect
to the login start route. The WS upgrade already shares the session, so the handler
sees `ws._session` (`userId`, `name`, `isAdmin`). `session.name` drives presence.

### New / extended WS messages
- **`presence_join` / `presence_leave`** — on WS open after `join`, register the
  participant `{userId, name}` and broadcast; on close, broadcast leave. Roster is
  included in `snapshot`.
- **`coaching_step_change`** — admin-only. Sets `{steps[], index}`, persists to room
  state, broadcasts to all. Non-admin senders are rejected.
- **`figure_lock` / `figure_unlock`** — server-authoritative. Lock is granted only if
  the figure is unheld; on grant, broadcast `figure_locked {id, userId, name, colour}`;
  on release/disconnect, broadcast `figure_unlocked {id}`. A disconnecting user's locks
  are auto-released.
- **`label`** — folded into `add` and `update`. `applyMutation`'s `update` case accepts
  a `label` field; `add` carries `label`; both persist in `state.figures[*]`. (Today
  `label` is client-only and never synced.)

### Join-by-code
`GET /api/join?code=XXX-XXX` resolves the code via the existing `resolveSessionCode()`
and redirects to `/?room=<token>` (behind the auth gate). Reuses the existing
Crockford-base32 session-code generator. Invalid/unknown code → error page.

### Brand awareness
`/api/config` returns a `brand` field sourced from a new `BRETT_BRAND` env var
(default `mentolder`).

### Snapshot extension
The `snapshot` sent on join/reconnect carries, in addition to figures:
`participants[]` (roster), `coachingSteps {steps[], index}`, and `locks[]` — so a
reconnecting client fully rehydrates.

## Data flow

1. **Coach** (admin) logs in via SSO → creates a session (`admin_session_create`,
   already exists) → receives a session code → shares the join link/code.
2. **Participant** opens the link → SSO login → code resolves to the room → `join`
   → receives the full `snapshot` → board + phase HUD + presence panel render.
3. **Coach advances a step** → `coaching_step_change` broadcast → every HUD updates.
4. **Participant grabs a figure** → `figure_lock`; if granted, drags it (their
   name/colour shows on the figure), `move` broadcasts, release → `figure_unlock`.
5. **Label edit** → `update {id, changes:{label}}` → broadcast + persisted.

## Brand gating (UI-level)

`BRETT_BRAND=mentolder` is set in `k3d/brett.yaml`; the korczewski overlay
(`prod-korczewski/`) sets `BRETT_BRAND=korczewski`. The 5 `NAMED_PERSONS`
(`portrait-patrick`, `portrait-christina`, `portrait-papa`, `portrait-martina`,
`portrait-oskar`, defined at `brett/public/index.html:1746`) render in the figure
panel **only when `brand === 'korczewski'`** — hidden on mentolder. The server
continues to validate appearance against the full `placement_spec.json` (no
hard-block), per the chosen strictness level.

## Error handling & edge cases

- **Reconnect / reload:** `snapshot` re-hydrates figures, roster, steps+index, and
  locks. Locks held by a disconnected user are auto-released server-side.
- **Lock contention:** server is authoritative; the client requests a lock and only
  begins dragging after `figure_locked` confirms ownership; a denied grab is ignored.
- **Unauthenticated access:** board GET and WS both require a session; redirect to
  login / close the socket otherwise.
- **Invalid session code:** join page shows a clear error, no room created.
- **Touch / tablet (≥768px):** figure drag uses the existing pointer events; HUD and
  panels are responsive.

## Testing

- **`node:test` units:** `coaching/phases.mjs`, `coaching/presence.mjs`,
  `coaching/locks.mjs` (pure logic — advance/back, join/leave, acquire/deny/release).
- **Server tests:** lock grant/deny + auto-release on disconnect; admin-only step
  change (non-admin rejected); label persists through `add`/`update`; `/api/join`
  resolves a code; `/api/config` returns brand.
- **`coaching-isolation.test.mjs`:** extend to assert the coaching HUD is present in
  coaching mode and that no mayhem UI element appears.
- **Brand filter:** the 5 `NAMED_PERSONS` are absent from the figure panel when
  `brand === 'mentolder'` and present when `korczewski`.
- **E2E (later, via dev-flow-e2e):** coach + participant join and sync a figure;
  coach advances a step and the participant sees it; a label appears for both; the
  presence panel lists both; and on mentolder none of the 5 characters are offered.

## Out of scope

- Video / audio chat (handled by Talk, not Brett).
- Multiple co-coaches or coach handover (exactly one coach per session).
- Server-side hard-block of the 5 characters (UI hide only, per decision).
- Any change to the Mayhem / combat mode.
- Live free-floating 3D pointer cursors.
- Board-freeze / per-participant edit-rights management.

## Key files

- `brett/server.js` — WS protocol, `figureMaps`, session phases, admin token, DB persistence, auth.
- `brett/public/index.html` — coaching board, inline WS handler, figure panel, `NAMED_PERSONS` (line 1746).
- `brett/public/assets/main.js` — mode gate, mayhem init bridge, dynamic button injection.
- `brett/public/assets/mode-state.mjs` / `mode-select.mjs` — mode state machine + overlay.
- `brett/public/assets/ws.mjs` — reconnecting WS client (to be gated to mayhem-only in coaching mode).
- `brett/public/assets/figure-pack/placement_spec.json` — figure schema + valid keys incl. the 5 `portrait-*` faces.
- `brett/test/coaching-isolation.test.mjs` — coaching/mayhem isolation contract (to extend).
- `k3d/brett.yaml` (+ `prod-korczewski/` overlay) — `BRETT_BRAND` env.
