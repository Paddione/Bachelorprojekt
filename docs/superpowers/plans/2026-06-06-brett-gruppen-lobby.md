---
title: "Brett — Gruppen-Aufstellungs-Lobby + UI-Facelift — Implementation Plan"
ticket_id: T000459
domains: [brett, frontend]
status: active
pr_number: null
spec: docs/superpowers/specs/2026-06-06-brett-gruppen-lobby-design.md
---

# Brett — Gruppen-Aufstellungs-Lobby + UI-Facelift — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Overview

The Coaching-**Systembrett** (`brett/`) is a production 3D multiplayer board (TypeScript, Three.js 0.184, `ws` WebSocket, PostgreSQL-JSONB persistence) for systemic constellation work. Today the client boots straight into the 3D board and the role model is flat (one admin + everyone equal, serialized only by short-lived figure locks). This plan adds a **Hauptmenü → Hybrid-Lobby (with pre-game settings) → Runde starten** flow, **full role enforcement** (Leiter / Stellvertreter / Beobachter, owner-scoped mutation), the **four pre-game settings** with real substance (Szenario-Vorlage · Rollen & Teilnehmer · Coaching-Ablauf · Board-Optik), and a **mentolder-brand UI facelift** — while fixing six review-confirmed latent inconsistencies in the touched code.

The work ships as **one plan, internally staged A–E** (each phase independently mergeable and green on its own): **Fundament → Fluss → Rechte → Substanz → Politur**.

- **Worktree:** `feature/brett-gruppen-lobby` at `/home/patrick/Projects/wt-brett-gruppen-lobby`. All `target_files` are repo-relative; `brett/` is the worktree's brett package.
- **Test harness (⚠️ not `task test:all`):** the Brett suite runs via `cd brett && npm test` (`MOCK_DB=true tsx --test`), `npm run typecheck` (client + server `tsc --noEmit`), and `npm run build` (vite + `tsc -p tsconfig.server.json`). CI: `build-brett.yml` + the Brett-Typecheck gate. Server unit tests import the **real** `applyMutation`/`buildStateFromMutations`/handlers from `../src/server/index` (pattern: `test/session-state.test.ts`). Pure client-logic tests are WebGL/DOM-free.
- **Phase ordering:** A before all. B before C (assignment before enforcement). D after B/C. E last. Cross-phase interface boundaries are fixed by the Shared Interface Contract below — every phase-author MUST honour it verbatim.

---

## Shared Interface Contract

> Authoritative TypeScript signatures for `feature/brett-gruppen-lobby`. All phase-authors (A–E) MUST use these verbatim. Paths relative to repo root; `brett/` = the worktree at `/home/patrick/Projects/wt-brett-gruppen-lobby/brett`. `file:line` citations are against the **current** code being changed.

### 1. `Phase` union — `src/types/state.ts:5` (CHANGED)

```ts
// was: export type Phase = 'warmup' | 'active' | 'paused' | 'ended';
export type Phase = 'lobby' | 'warmup' | 'active' | 'paused' | 'ended';
```

`lobby` is the fifth phase, prepended. Non-terminal. Drives the client view-machine (§6a) via the **`sessionPhase`** field (not the dead `phase`, see §4.6 fix).

### 2. `Role` — `src/types/state.ts` (NEW)

```ts
export type Role = 'leiter' | 'stellvertreter' | 'beobachter';
```

Defined in `state.ts`; imported by `messages.ts` and `permissions.ts`. `'anon'`/unknown identity MUST resolve to `beobachter` and may never bear a role above it.

### 3. `OptikSettings` / `LobbySettings` — `src/types/state.ts` (NEW)

```ts
export interface OptikSettings {
  floor?: string;
  sky?: 'day' | 'dusk' | 'calm';
  lightMood?: 'neutral' | 'warm' | 'cool';
}

export interface LobbySettings {
  templateId?: string;
  optik?: OptikSettings;
  maxParticipants?: number;
  allowRepresentativeAdd?: boolean;   // Default: false (Stellvertreter darf NICHT add/delete)
}
```

### 4. `Participant` — `src/types/state.ts:27-32` (EXTENDED)

```ts
export interface Participant {
  userId: string;
  name: string;
  color: string;
  isAdmin?: boolean;
  role?: Role;        // NEW — persisted via __roles__ sentinel (§7)
  ready?: boolean;    // NEW — ephemeral live-lobby status (NOT persisted)
}
```

### 5. `Figure` — `src/types/state.ts:14-25` (EXTENDED)

```ts
export interface Figure {
  id: string;
  x: number;
  z: number;
  facingY: number;
  label?: string;
  color?: string;
  scale?: number;
  preset?: string;
  boneOverrides?: Record<string, { x: number; z: number }>;
  appearance: FigureAppearance;
  ownerId?: string;   // NEW — SERVER-AUTHORITATIVE. Stripped from all client add/update
                      // payloads (like `id`). Changed ONLY via admin_assign_figure.
}
```

### 6. `ClientMessage` — `src/types/messages.ts:4-26` (NEW variants, 1 REMOVED, 1 field-fix)

```ts
// REMOVED (dead 'optik' seam, §4.1 — also drop from RELAY_TYPES):
//   | { type: 'optik'; id: string; value: unknown }        ← messages.ts:13 DELETE

// FIELD-FIX (§4.2): toPlayerId → targetPlayerId (handler already reads targetPlayerId @ ws-handler.ts:264)
//   was: | { type: 'admin_handoff_token'; toPlayerId: string }   ← messages.ts:23
   | { type: 'admin_handoff_token'; targetPlayerId: string }

// NEW variants:
   | { type: 'admin_round_start' }
   | { type: 'admin_assign_role'; targetPlayerId: string; role: Role }
   | { type: 'admin_assign_figure'; figureId: string; toPlayerId: string | null }
   | { type: 'admin_set_template'; templateId: string }
   | { type: 'admin_set_optik'; settings: OptikSettings }
   | { type: 'lobby_set_ready'; ready: boolean }   // ONLY non-privileged new message
```

Add `import type { ..., Role, OptikSettings } from './state';` at `messages.ts:1`.

### 7. `ServerMessage` — `src/types/messages.ts:29-50` (NEW variants + drift-fixes)

```ts
// DRIFT-FIX (§4.3): union must match the runtime broadcast payloads.
//   was: | { type: 'session_phase_change'; phase: Phase }              ← messages.ts:46
   | { type: 'session_phase_change'; phase: Phase; transitionedAt: string; reason: string }
//   was: | { type: 'admin_token_changed'; holder: string | null }      ← messages.ts:48
   | { type: 'admin_token_changed'; holderPlayerId: string | null; reason: string }
//   session_ended also carries a runtime `reason` (ws-handler.ts:355, sessions.ts:133):
//   was: | { type: 'session_ended' }                                   ← messages.ts:47
   | { type: 'session_ended'; reason?: string }

// NEW variants:
   | { type: 'role_changed'; userId: string; role: Role }
   | { type: 'figure_owner_changed'; figureId: string; ownerId: string | null }
   | { type: 'lobby_ready_changed'; userId: string; ready: boolean }
   | { type: 'lobby_settings_change'; templateId?: string; optik?: OptikSettings }
```

`snapshot` keeps its existing shape (`messages.ts:30`); only the **value** of `phase` changes at the call site (§4.6 → `phase: freshState.sessionPhase`).

### 8. `RELAY_TYPES` / `ADMIN_TYPES` — `src/server/ws-handler.ts:36-43` (CHANGED)

```ts
// RELAY_TYPES: remove 'optik' (§4.1), add 'jump' (§4.5).  ← ws-handler.ts:37
export const RELAY_TYPES = new Set<string>([
  'add', 'move', 'update', 'jump', 'delete', 'clear', 'stiffness', 'snapshot', 'request_state_snapshot'
]);

// ADMIN_TYPES: append all FIVE new admin_* (§5b BLOCKER).  ← ws-handler.ts:41-43
export const ADMIN_TYPES = new Set<string>([
  'admin_kick', 'admin_broadcast', 'admin_session_create', 'admin_handoff_token',
  'admin_round_stop', 'admin_round_pause', 'admin_coaching_steps_set',
  'admin_round_start', 'admin_assign_role', 'admin_assign_figure',
  'admin_set_template', 'admin_set_optik',
]);
```

> Each new `admin_*` ALSO needs a `case` in the post-`isAdmin` `switch` (`ws-handler.ts:220+`). Membership without a `case` is a silent no-op. `lobby_set_ready` goes in NEITHER set — it gets its own branch (emits `lobby_ready_changed`). `jump` is relayed + canMutate-gated but has NO `applyMutation` case (ephemeral; the relay path tolerates RELAY_TYPES without an `applyMutation` branch — `applyMutation`'s switch has no `default`).

### 9. `canMutate` — `src/server/permissions.ts` (NEW, the sole chokepoint)

```ts
import type { Role } from '../types/state';

/** Full gated set = post-§4.1 RELAY_TYPES (optik removed, jump added) PLUS figure_lock.
 *  This is the exact `msgType` union — NOT `string`, so Default-Deny is type-driven. */
export type MutationType =
  | 'add' | 'move' | 'update' | 'jump' | 'delete'
  | 'clear' | 'stiffness' | 'snapshot' | 'request_state_snapshot'
  | 'figure_lock';

export interface MutateContext {
  msgType: MutationType;
  role: Role;                       // resolved ONLY from ws._session.userId via __roles__;
                                    // unknown/anon → 'beobachter' (fail-closed identity)
  playerId: string;                 // canonical identity (resolvePlayerId, §10)
  figureOwnerId?: string | null;    // figureMaps.get(room).get(msg.id)?.ownerId for the target
  allowRepresentativeAdd?: boolean; // from LobbySettings.allowRepresentativeAdd
}

/** Pure. FAIL-CLOSED: any MutationType not explicitly allowed for `role` returns false.
 *  Called BEFORE apply/broadcast in the `if (RELAY_TYPES.has(msg.type))` block
 *  (ws-handler.ts:201) AND in the figure_lock branch (ws-handler.ts:178-192). */
export function canMutate(ctx: MutateContext): boolean;
```

**Matrix (the rule body must implement exactly this; everything else → `false`):**

| `msgType` | leiter | stellvertreter | beobachter |
|---|---|---|---|
| `move` `update` `jump` `delete` | ✅ | `figureOwnerId === playerId` | ❌ |
| `figure_lock` | ✅ | `figureOwnerId === playerId` | ❌ |
| `add` | ✅ | only if `allowRepresentativeAdd` | ❌ |
| `clear` `snapshot` `stiffness` | ✅ (leiter-only) | ❌ | ❌ |
| `request_state_snapshot` | ✅ | ✅ | ✅ (read-only, no broadcast) |
| *(any other)* | **Default-Deny** | **Default-Deny** | **Default-Deny** |

Denial → `{ type: 'error', reason: 'forbidden' }` to the sender, NO broadcast (also for `figure_lock` — NOT `figure_lock_denied`).

### 10. `resolvePlayerId` — `src/server/ws-handler.ts` (NEW, exported)

```ts
/** Canonical identity. OIDC-first; client-supplied id / 'anon' only WITHOUT a session.
 *  = ws._session?.userId ?? ws._playerId ?? 'anon'
 *  Used everywhere: participant-map key, ws._playerId, lock owner, removeParticipant,
 *  Figure.ownerId, __roles__ keys, canMutate.ctx.playerId. */
export function resolvePlayerId(ws: any): string;
```

> Role-bearing identity is stricter: roles key on `ws._session?.userId` ONLY (anon → `beobachter`). `msg.playerId` is ignored when a session exists — at `ws-handler.ts:124` (join-seed `playerId`) AND `ws-handler.ts:205` (`player_join` write). Prevents `{type:'join', playerId:'<leiter-userId>'}` role escalation.

### 11. `seedFigureMapFromState` — `src/server/figures.ts` (NEW, exported)

```ts
/** Extracted from the inline join-seed (ws-handler.ts:86-118) into a pure, unit-testable
 *  function. Re-seeds the figureMap from a persisted (buildStateFromMutations-shaped) state,
 *  INCLUDING the new __roles__ and __lobby_settings__ sentinels. */
export function seedFigureMapFromState(map: Map<string, any>, state: any): void;
```

> §4.6 fix lives here: read `state.sessionPhase` / `state.sessionCreatedAt` / `state.sessionLastActivity` (the field names `buildStateFromMutations` emits at `phases.ts:46,49,50`) — NOT `state.phase` / `state.createdAt` / `state.lastActivity` (ws-handler.ts:100,109,112, which are always `undefined` after a DB round-trip).

### 12. Sentinel shapes (figureMap entries, `__coaching_steps__`/`__optik__` precedent)

Stored as figureMap values keyed by their `id`; filtered out of `figures` and surfaced by `buildStateFromMutations` (`phases.ts:29-53` — add both to the `SPECIAL` array and emit them):

```ts
// __roles__ — Map userId→Role
{ id: '__roles__'; roles: Record<string /*userId*/, Role> }
//   buildStateFromMutations → result.roles = entry.roles

// __lobby_settings__ — the four pre-game settings
{ id: '__lobby_settings__'; settings: LobbySettings }
//   buildStateFromMutations → result.lobbySettings = entry.settings

// __optik__ — EXISTING shape (figures.ts:64), now actually populated by admin_set_optik:
{ id: '__optik__'; settings: OptikSettings }
//   buildStateFromMutations → result.optik = entry.settings   (phases.ts:44, unchanged)
```

`applyMutation` (`figures.ts:19`) gains cases that write these sentinels (e.g. `roles_set`, `lobby_settings_set`), and the `admin_set_optik` case replaces the broken `optik` case (`figures.ts:62-66`, which read `msg.settings` but was fed `msg.value`).

### 13. `lobby_settings_change` optik-propagation contract

```
client → admin_set_optik { settings: OptikSettings }
  → ws-handler: in ADMIN_TYPES → isAdmin gate → switch case 'admin_set_optik':
      applyMutation(room, { type:'optik_set', settings })   // writes __optik__ sentinel
      broadcast(room, { type:'lobby_settings_change', optik: settings })  // to OTHER clients
      schedulePersist(room)
  → ws-client.ts onWsMessage: NEW case 'lobby_settings_change':
      if (msg.optik) applyOptikToScene(msg.optik)   // works in-board too, not just lobby
      if (msg.templateId) updateLobbySettingsUI(msg.templateId)
```

`admin_set_template` propagates the same way via `lobby_settings_change{templateId}`. Apply + UI land in Phase D; the protocol/union edits may land in Phase B alongside the other drift-fixes.

### 14. Signatures that KEEP their shape but change behavior (no caller change)

```ts
// src/server/sessions.ts:167 — SIGNATURE UNCHANGED, body rewritten (§5a Late-Join BLOCKER):
export function shouldRejectReconnect(room: string, playerId: string | null):
  { reject: boolean; code?: number; message?: string };
//   New matrix: lobby/warmup/no-session → admit; ended → 410;
//   active|paused → admit real late-joiner (!wasPreviouslyInRoom(room, playerId)), else 409.

// src/server/index.ts:269 — verifyClient now threads the real playerId (was hard `null`):
const decision = sessions.shouldRejectReconnect(room, url.searchParams.get('playerId'));
//   Client appends `&playerId=<id>` to the /sync URL (ws-client.ts:54).

// src/server/phases.ts:17 — SIGNATURE UNCHANGED, gains a per-edge allowlist (§5a):
export function transitionPhase(room: string, newPhase: Phase):
  { ok: boolean; from?: Phase | null; to?: Phase; reason?: string };
//   VALID_PHASES (phases.ts:4) += 'lobby'. Allowed edges: lobby→active, active↔paused, *→ended.
//   Reject active→lobby etc. checkSessionIdle (sessions.ts:195) exempt-list += 'lobby'.
```

### 15. Exhaustiveness — `test/messages.test.ts` (THREE hand-kept sites)

When editing the unions, update all three in lockstep:
- `HANDLED_SERVER_TYPES` literal (`messages.test.ts:8-13`) — add `role_changed`, `figure_owner_changed`, `lobby_ready_changed`, `lobby_settings_change`.
- `routeServer` switch (`messages.test.ts:19-44`) — same new `case`s.
- `routeClient` switch (`messages.test.ts:46-70`) — **remove** `case 'optik'`; add the 6 new client cases; rename the `admin_handoff_token` field is transparent (no case change).

`assertNever` default branches are tsc-enforced; `HANDLED_SERVER_TYPES` is NOT — pull it by hand.

#### Grounding map (files cited)
- `brett/src/types/state.ts` (Phase:5, Figure:14-25, Participant:27-32)
- `brett/src/types/messages.ts` (ClientMessage:4-26 incl optik:13/handoff:23; ServerMessage:29-50 incl phase_change:46/token_changed:48; assertNever:65)
- `brett/src/server/ws-handler.ts` (RELAY_TYPES:36-38, ADMIN_TYPES:41-43, join-seed:86-118, identity:124/205, figure_lock:178-192, relay gate:201, isAdmin gate:215, admin switch:220-287, broadcast drift:246-255, close:295-317)
- `brett/src/server/figures.ts` (applyMutation:19-101, optik case:62-66, update-strip:42)
- `brett/src/server/phases.ts` (VALID_PHASES:4, transitionPhase:17, buildStateFromMutations SPECIAL:29-53, sessionPhase emit:46)
- `brett/src/server/sessions.ts` (shouldRejectReconnect:167-185, checkSessionIdle:195, grace:78-109, wasPreviouslyInRoom:163)
- `brett/src/server/rooms.ts` (Participant map:4, PARTICIPANT_PALETTE:6, addParticipant:38)
- `brett/src/server/index.ts` (verifyClient:264-279, snapshot routes:144-218)
- `brett/src/client/ws-client.ts` (connectWS URL:54, onWsMessage:91, default:246)
- `brett/test/messages.test.ts` (HANDLED_SERVER_TYPES:8-13, routeServer:19, routeClient:46)

---

## Blocker coverage

The hardened spec carries six review blockers. Each is closed by the task(s) below:

| # | Review blocker | Closed by |
|---|---|---|
| 1 | **Late-Join guard rebuild** (`shouldRejectReconnect` matrix + `verifyClient` threading + client `&playerId=` URL; §5a) | **B9** |
| 2 | **ADMIN_TYPES wiring** (all five new `admin_*` in `ADMIN_TYPES` **and** with a real switch `case`; §5b) | **B8** (`admin_round_start`), **B11** (`admin_assign_role`), **C5** (`admin_assign_figure`), **D4** (`admin_set_optik`), **D5** (`admin_set_template`) |
| 3 | **`canMutate` chokepoint** (single fail-closed gate over whole `RELAY_TYPES` + `figure_lock`, Default-Deny; §5d) | **C3** (pure `canMutate` + matrix), **C5** (wire gate into relay block + `figure_lock` branch) |
| 4 | **Identity from session** (`resolvePlayerId` + strict `resolveRole`; `msg.playerId` ignored when a session exists; anon → `beobachter`; §5c) | **B10** (`resolvePlayerId` + presence), **C4** (join-seed/`player_join` hardening + spoof test), **C3** (`resolveRole`) |
| 5 | **`jump` relay (§4.5)** (`jump` → `RELAY_TYPES`, relayed + canMutate-gated, no `applyMutation` case) | **C5** |
| 6 | **`sessionPhase` drift (§4.6)** (seed reads `state.sessionPhase`; snapshot sends `phase: freshState.sessionPhase`) | **B4** |

All six blockers are covered by existing tasks; no extra task is required.

---

## Phase A — Fundament + Hauptmenü

**Goal (spec §9 row A):** mergeable, green-on-its-own slice that lands the design-system foundation (mentolder tokens + UI primitives), the **Hauptmenü** as the first screen, the client **view-state-machine scaffold** with a **lazy** Three.js mount, and re-skins the two most-visible existing panels (status pill, fig-panel). Green gate = view-machine test + `npm run typecheck` + `npm run build`.

**Scope guardrails honoring the shared contract:**
- Phase A does **NOT** add `'lobby'` to the `Phase` union (`state.ts:5`) — that ships in **Phase B** (contract §1). The view-machine therefore reads the snapshot phase as a **runtime string** and maps `'lobby'` defensively, so A stays decoupled from B's type change.
- Phase A touches **no** server file, **no** `messages.ts`/`messages.test.ts` union (those are B/C). It adds only client modules + two CSS re-skins.
- All new client modules must be **node/tsx-importable** (no top-level `document`/`window`/`three` access — DOM only inside functions), so their pure logic is unit-testable under the existing `MOCK_DB=true tsx --test` harness. This is the opposite of the legacy `hud.ts:4` / `fig-panel.ts:54-56` top-level-`getElementById` pattern.

**Extracted mentolder brand tokens (verbatim from `website/src/styles/global.css:5-51`) — the SSOT for A1:**

| token | value | token | value |
|---|---|---|---|
| ink-900 | `#0b111c` | fg | `#eef1f3` |
| ink-850 / surface | `#101826` | fg-soft | `#cdd3d9` |
| ink-800 / surface-hover | `#17202e` | mute | `#8c96a3` |
| ink-750 | `#1d2736` | mute-2 | `#6a727e` |
| brass | `oklch(0.80 0.09 75)` | sage | `oklch(0.80 0.06 160)` |
| brass-2 | `oklch(0.86 0.09 75)` | border | `rgba(255,255,255,0.10)` |
| brass-dim | `oklch(0.80 0.09 75 / 0.14)` | line | `rgba(255,255,255,0.07)` |
| radius | `22px` | line-2 | `rgba(255,255,255,0.12)` |
| font-sans | `"Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif` | font-serif | `"Newsreader", "Iowan Old Style", Georgia, serif` |
| font-mono | `"Geist Mono", ui-monospace, "SFMono-Regular", Menlo, monospace` | maxw | `1240px` |

**Task dependency order:** A1 → A3 → A4 → A5 ; A2 (parallel, consumed by A5) ; A6 (after A1) ; A7 last.

---

### A1 — Design tokens extracted from the mentolder website → `theme.ts` — [x] DONE

- **target_files:** `brett/src/client/ui/theme.ts` (new), `brett/test/theme.test.ts` (new)
- **failing test first (red):** `brett/test/theme.test.ts` (`node --test` via tsx) imports `{ tokens, themeCss }` from `../src/client/ui/theme` and asserts:
  - `tokens.color.ink900 === '#0b111c'`, `tokens.color.surface === '#101826'`, `tokens.color.fg === '#eef1f3'`, `tokens.color.mute === '#8c96a3'`, `tokens.color.brass === 'oklch(0.80 0.09 75)'`, `tokens.color.line === 'rgba(255, 255, 255, 0.07)'`.
  - `tokens.font.sans.includes('Geist')`, `tokens.radius === '22px'`.
  - `typeof themeCss() === 'string'` and the output **contains** every CSS var the rest of Phase A consumes: `--brett-ink-900:#0b111c`, `--brett-surface:`, `--brett-surface-hover:`, `--brett-fg:`, `--brett-fg-soft:`, `--brett-mute:`, `--brett-brass:`, `--brett-brass-dim:`, `--brett-line:`, `--brett-line-2:`, `--brett-radius:22px`, `--brett-font-sans:`.
  - Importing the module under node does **not** throw (proves no top-level DOM access).
  - Red because `theme.ts` does not exist.
- **implementation:** Create `theme.ts` exporting (1) a pure nested `tokens` object mirroring the table above verbatim; (2) pure `themeCss(): string` that emits a `:root { --brett-…: …; }` block (flat `--brett-<name>` var names matching the website convention); (3) `injectTheme(doc: Document = document): void` that appends an id-guarded `<style id="brett-theme">` containing `themeCss()` — idempotent, DOM access only inside the function body.
- **acceptance_criteria:**
  - `tokens` values match `website/src/styles/global.css` exactly (documented duplication, no runtime coupling).
  - `themeCss()` is pure and side-effect-free; module import succeeds under tsx/node.
  - `injectTheme` is idempotent (second call replaces, not duplicates, the `<style>`).
- **verify:** `cd brett && npm test` (theme.test green) && `npm run typecheck`

---

### A2 — View-state-machine + lazy-scene-mount scaffold → `app-shell.ts` — [x] DONE

- **target_files:** `brett/src/client/app-shell.ts` (new), `brett/test/app-shell.test.ts` (new)
- **failing test first (red):** `brett/test/app-shell.test.ts` imports `{ viewForPhase, createAppShell }` from `../src/client/app-shell` and asserts:
  - `viewForPhase(null) === 'menu'`, `viewForPhase(undefined) === 'menu'`, `viewForPhase('menu') === 'menu'`, `viewForPhase('lobby') === 'lobby'`, `viewForPhase('warmup') === 'board'`, `viewForPhase('active') === 'board'`, `viewForPhase('paused') === 'board'`, `viewForPhase('ended') === 'summary'`.
  - With mock hooks `{ mountBoard: spy, renderView: spy }`: shell starts at `getView() === 'menu'`; `mountBoard` called **0×** while in menu; after first `setPhase('active')` (or `goTo('board')`) `mountBoard` called **exactly 1×** and `renderView` got `'board'`; a **second** board entry does **not** call `mountBoard` again (lazy-once); `renderView` fires on every transition with the resolved view.
  - This is the **lazy-mount smoke** (spec §11): proves `initScene` cannot run until board view is entered.
  - Red because `app-shell.ts` does not exist.
- **implementation:** Create `app-shell.ts` with **zero static browser imports** (no `three`/`scene`/`board-boot` at top level). Export the pure `viewForPhase(phase: string | null | undefined): ViewState` (`ViewState = 'menu' | 'lobby' | 'board' | 'summary'`) and `createAppShell(hooks: { mountBoard: () => void | Promise<void>; renderView: (v: ViewState) => void }): { setPhase(phase): void; goTo(v: ViewState): void; getView(): ViewState }` with an internal `boardMounted` latch so `mountBoard` fires once on first board entry.
- **acceptance_criteria:**
  - Pure mapping covers all current phases + defensively maps `'lobby'` and unknown→`'menu'` without importing B's `Phase` type.
  - `mountBoard` invoked at most once, only on first `board` entry; default view `'menu'`.
  - Module importable under node/tsx (no eager Three.js).
- **verify:** `cd brett && npm test` (app-shell.test green) && `npm run typecheck`

---

### A3 — UI primitives (Panel/Button/Field/Drawer/RosterItem/Badge) → `primitives.ts` — [x] DONE

- **target_files:** `brett/src/client/ui/primitives.ts` (new), `brett/test/primitives.test.ts` (new)
- **failing test first (red):** `brett/test/primitives.test.ts` imports the **pure class-helpers** and `primitivesCss` from `../src/client/ui/primitives` and asserts:
  - `buttonClass({ variant: 'primary' }) === 'brett-btn brett-btn--primary'`, `buttonClass({}) === 'brett-btn'`, `buttonClass({ variant: 'ghost' }) === 'brett-btn brett-btn--ghost'`.
  - `badgeClass({ tone: 'leiter' }).includes('brett-badge--leiter')`, `panelClass({ pad: true }).includes('brett-panel')`.
  - `typeof primitivesCss() === 'string'` and it contains `.brett-panel{`, `.brett-btn{`, `.brett-field{`, `.brett-drawer{`, `.brett-roster-item{`, `.brett-badge{`, and references `var(--brett-` (consumes A1 tokens, not raw hex).
  - The DOM factories are exported as functions (`typeof Panel === 'function'`, …`Button`, `Field`, `Drawer`, `RosterItem`, `Badge`).
  - Module import under node does not throw (DOM only inside factory bodies).
  - Red because `primitives.ts` does not exist.
- **implementation:** Create `primitives.ts` exporting (1) pure helpers `panelClass`/`buttonClass`/`fieldClass`/`drawerClass`/`rosterItemClass`/`badgeClass` that map variant options → BEM-ish class strings; (2) DOM factories `Panel`/`Button`/`Field`/`Drawer`/`RosterItem`/`Badge` that build `HTMLElement`s using those classes; (3) pure `primitivesCss(): string` styling all `.brett-*` classes **exclusively via `var(--brett-*)`** (so the look is token-driven); (4) `injectPrimitivesStyles(doc = document)` (id-guarded `<style id="brett-primitives">`). If the file nears the 300-line convention (§6d), split `RosterItem`/`Badge` into `primitives-roster.ts` — re-export from `primitives.ts`.
- **acceptance_criteria:**
  - Pure helpers produce deterministic class strings (fully node-tested).
  - `primitivesCss()` uses only `var(--brett-*)` for color/typo/radius (no hardcoded brand hex).
  - Factories typecheck under `tsconfig.client.json`; no top-level DOM.
- **verify:** `cd brett && npm test` (primitives.test green) && `npm run typecheck`

---

### A4 — Hauptmenü screen → `menu.ts` (mentolder look)

- **target_files:** `brett/src/client/ui/menu.ts` (new), `brett/test/menu-model.test.ts` (new)
- **failing test first (red):** `brett/test/menu-model.test.ts` imports the **pure** `{ menuModel, isValidJoinCode }` from `../src/client/ui/menu` and asserts:
  - `menuModel({ userId: 'u1', name: 'Anna', isAdmin: true })` returns items whose ids include `'new-session'`, `'join'`, `'saved'`, `'settings'`, and an identity line equal to `'angemeldet als: Anna'`.
  - `menuModel({ userId: 'anon', name: 'Teilnehmer', isAdmin: false })` **omits** `'new-session'` (spec §6b: „Neue Session" nur Leiter/Admin) but still includes `'join'`, `'saved'`, `'settings'`.
  - `isValidJoinCode('KRB-9A2') === true`, `isValidJoinCode('') === false`, `isValidJoinCode('xx') === false` (6-char session-code shape per existing join flow).
  - Importing `menu.ts` under node does not throw.
  - Red because `menu.ts` does not exist.
- **implementation:** Create `menu.ts` exporting the pure `menuModel(user)` (admin-gated item list + identity line) and `isValidJoinCode(code)`, plus `mountMenu(container: HTMLElement, opts: { user; onNewSession: () => void; onJoin: (code: string) => void; onSavedList: () => void; onSettings: () => void }): void` that renders the Hauptmenü using A3 primitives (title „SYSTEMBRETT / Systemische Aufstellung", the four action cards, the join `Field` + the `angemeldet als …` footer with Logout link). „Neue Session" calls `onNewSession`; „Session beitreten" validates via `isValidJoinCode` then `onJoin(code)` (which navigates to `/api/join?code=`, matching today's `index.html:328` toast link).
- **acceptance_criteria:**
  - Admin-only visibility of „Neue Session" enforced by the pure model (tested).
  - DOM render composes only A3 primitives + A1 tokens; no top-level DOM.
  - Per spec §6b note: in Phase A „Neue Session" drives the existing `warmup` board flow (no `lobby` seed yet) — wired in A5.
- **verify:** `cd brett && npm test` (menu-model.test green) && `npm run typecheck`

---

### A5 — Lazy board-boot refactor + wire menu as the entry screen

- **target_files:** `brett/src/client/board-boot.ts` (new — receives the moved boot logic), `brett/src/client/main.ts` (rewritten thin), `brett/public/index.html` (add menu root, neutralize the legacy no-`?room` join-overlay auto-mount, call the design-system injectors)
- **failing test first (red):** `brett/test/no-eager-three.test.ts` (new) reads the **source text** of `src/client/main.ts` and asserts it contains **no static** import of Three.js or the scene/board (`from 'three'`, `from './scene'`, `from './board-boot'`), and that it **does** contain a dynamic `import('./board-boot')`. This enforces the lazy-mount architecture node-side (browser smoke is impossible under tsx). Red now because today's `main.ts:1,3` statically `import * as THREE from 'three'` / `import { initScene } from './scene'`.
- **implementation:**
  - Move the **entire** current `main.ts` `boot()` body (scene init, dependency wiring, input handlers, `connectWS`, seed figure, tick loop, PostFx) verbatim into `board-boot.ts` exporting `export async function bootBoard(): Promise<void>`.
  - Rewrite `main.ts` to be thin and Three-free: `injectTheme()` + `injectPrimitivesStyles()`, then `createAppShell({ mountBoard: () => import('./board-boot').then(m => m.bootBoard()), renderView })` where `renderView` toggles the `#brett-menu` overlay vs. the board DOM. On load: if the URL has `?room`, `appShell.goTo('board')` (preserve today's deep-link + legacy coaching HUD); otherwise `mountMenu(...)` and stay in `'menu'`, with `onNewSession`/`onJoin` calling `appShell.goTo('board')`.
  - In `public/index.html`: add an empty `<div id="brett-menu">` overlay root; guard the inline `<script>` so the legacy `mountJoinOverlay({})` (lines 315-318) does **not** auto-mount when the new menu is the entry (the menu supersedes it); leave the `?room`/coaching-HUD branch intact.
- **acceptance_criteria:**
  - `main.ts` has no static `three`/`scene`/`board-boot` import; `board-boot.ts` holds the moved logic unchanged in behavior.
  - With no `?room`, the Hauptmenü renders first; „Neue Session"/„Beitreten" mounts the board (scene initialized exactly once — guaranteed by A2 latch).
  - With `?room=…`, the client deep-links straight to the board (no regression to existing join/coaching path).
  - `npm run build` emits `board-boot` as a **separate lazy chunk** (proves the scene/Three bundle is deferred).
- **verify:** `cd brett && npm test` (no-eager-three green) && `npm run typecheck` && `npm run build`

---

### A6 — Re-skin status pill + fig-panel onto the brett tokens

- **target_files:** `brett/public/index.html` (the `<style>` rules for `#status-pill`, `#fig-panel`, `#fig-panel-title`, `#fig-panel-add`, `.fig-color-swatch.active`, `#fig-label-input`)
- **failing test first (red):** `brett/test/no-hardcoded-brand-css.test.ts` (new) reads `public/index.html` and asserts that the `#status-pill { … }` and `#fig-panel { … }` / `#fig-panel-add { … }` rule blocks reference `var(--brett-` and contain **none** of the legacy brand literals `#0e1014`, `#161a22`, `#c8a96e` (scoped to those rule blocks — the appearance-drawer keeps its hex until Phase E). Red now because those blocks are full of raw hex (`index.html:24-101`).
- **implementation:** Replace the hardcoded hex/`rgba` in the status-pill and fig-panel CSS blocks with `var(--brett-surface)`, `var(--brett-ink-850)`, `var(--brett-line)`, `var(--brett-line-2)`, `var(--brett-brass)`, `var(--brett-fg)`, `var(--brett-radius)` (with sensible literal fallbacks). Visual parity with the mentolder palette; no DOM/JS behavior change (`hud.ts` `updateStatusPill` text logic untouched). The consumed vars are guaranteed present by A1's `themeCss()` (and asserted in A1's test).
- **acceptance_criteria:**
  - Status-pill and fig-panel rule blocks use `var(--brett-*)` exclusively for brand color/typo/radius (no raw `#0e1014`/`#161a22`/`#c8a96e`).
  - Rendered look matches the mentolder dark + brass theme; build unaffected.
  - Appearance-drawer / HUD untouched (deferred to Phase E).
- **verify:** `cd brett && npm test` (no-hardcoded-brand-css green) && `npm run typecheck` && `npm run build`

---

### A7 — Phase A green-gate + menu→board smoke

- **target_files:** none (verification only)
- **failing test first (red):** N/A — aggregates A1-A6. (Before A1-A6 land, the suite/typecheck/build fail; this task is the explicit Definition-of-Done gate.)
- **implementation:** Run the full Phase A gate and a manual board-mount smoke; fix any cross-task fallout (e.g. a token name drift between A1 and A3/A6, or a `tsconfig.client.json` include miss for the new `ui/*` files).
- **acceptance_criteria:**
  - `npm test` fully green (existing suite + new `theme`/`app-shell`/`primitives`/`menu-model`/`no-eager-three`/`no-hardcoded-brand-css` tests).
  - `npm run typecheck` (both client+server projects) green; `npm run build` green with a deferred `board-boot` chunk.
  - Manual/dev smoke (`npm run dev`, browser at `:5173`): Hauptmenü renders first in mentolder look with no `?room`; clicking „Neue Session"/„Beitreten" mounts the 3D board (no console errors, scene appears only then); `?room=…` deep-links straight to the board.
- **verify:** `cd brett && npm test && npm run typecheck && npm run build` (then `npm run dev` + manual browser smoke)

---

**Grounding notes for implementers (current code):**
- Today's `main.ts` eagerly `import * as THREE` (`:1`) and calls `initScene()` at the top of `boot()` (`:14`) — A5 moves this whole body into `board-boot.ts`.
- `scene.ts:21` appends the renderer canvas to `document.body` and `scene.ts:158` registers `setScene(...)`; keeping this inside `bootBoard()` (lazy) is what makes the menu Three-free.
- Legacy entry/overlay logic lives in the inline `<script type="module">` at `public/index.html:306-331` (`mountJoinOverlay` when no `?room`); A5 guards its auto-mount.
- `hud.ts:4` and `fig-panel.ts:54-56` use top-level `getElementById` — the new `theme/app-shell/primitives/menu` modules must **not** copy that pattern (keeps them tsx-importable for the unit tests above).
- Brand-token SSOT confirmed at `website/src/styles/global.css:5-51`.

### Definition of Done — Phase A

- `cd brett && npm test` fully green (existing suite + new `theme`/`app-shell`/`primitives`/`menu-model`/`no-eager-three`/`no-hardcoded-brand-css` tests).
- `cd brett && npm run typecheck` (client + server projects) clean.
- `cd brett && npm run build` succeeds with a **deferred `board-boot` lazy chunk** (proves Three.js is no longer eager).
- Manual smoke (`npm run dev`): Hauptmenü renders first in mentolder look with no `?room`; „Neue Session"/„Beitreten" mounts the 3D scene exactly once; `?room=…` deep-links straight to the board.
- No server file, no `messages.ts`/`messages.test.ts` union edits (those are B/C).

---

## Phase B — Hybrid-Lobby + Fluss

> **Worktree:** `feature/brett-gruppen-lobby` at `/home/patrick/Projects/wt-brett-gruppen-lobby`. All `target_files` are repo-relative (`brett/…`). Server tests use `node --test` via `tsx` with `MOCK_DB=true` (already set by the `npm test` script) and import the **real** `applyMutation` / `buildStateFromMutations` / etc. from `../src/server/index`. Client logic tests are pure (no WebGL/DOM).
>
> **Ordering / dependencies:** B1→B2 (types before unions) → B3→B4 (persistence + seed) → B5,B6 (phases) → B7,B8 (lobby flow) → B9 (late-join) → B10 (identity/presence) → B11,B12 (role/ready protocol) → B13,B14 (hardening/grace) → B15,B16 (client). B depends only on **Phase A** artifacts (`src/client/ui/theme.ts` + primitives, `src/client/app-shell.ts` view-machine, lazy scene mount) — an *earlier* phase. **Out of scope (do NOT touch — Phase C/D own them):** `src/server/permissions.ts` / `canMutate`, `jump`→`RELAY_TYPES`, `Figure.ownerId` + the client-`add`/`update` strip, `admin_assign_figure`, the join-identity *spoof-hardening* at ws-handler `:124`/`:205`, the `optik` removal from `RELAY_TYPES`/`ClientMessage` + the `figures.ts` optik-seam fix, `admin_set_template`/`admin_set_optik` server cases, and the 4-settings substance/apply. B adds the **ServerMessage** `lobby_settings_change`/`figure_owner_changed` *union variants + client router cases* (so the router is complete), but their *apply* lands in C/D.

---

### B1 — Domain types: `lobby` phase, `Role`, settings, Participant flags
- **target_files:** `brett/src/types/state.ts`, `brett/test/lobby-types.test.ts` (new)
- **failing test first (red):** `test/lobby-types.test.ts` (`node --test`) imports `Phase`, `Role`, `OptikSettings`, `LobbySettings`, `Participant` from `../src/types/state` and asserts at value+type level: `const p: Phase = 'lobby'` compiles; `const r: Role = 'beobachter'`; a `Participant` literal with `role: 'leiter'` and `ready: true` is assignable; an `OptikSettings` with `sky: 'dusk'` and a `LobbySettings` with `allowRepresentativeAdd: false`. Fails to compile (`npm run typecheck`) until the types exist.
- **implementation:**
  - `Phase` (state.ts:5) → `'lobby' | 'warmup' | 'active' | 'paused' | 'ended'` (prepend `lobby`, non-terminal).
  - Add `export type Role = 'leiter' | 'stellvertreter' | 'beobachter';`.
  - Add `OptikSettings` (`floor?`, `sky?: 'day'|'dusk'|'calm'`, `lightMood?: 'neutral'|'warm'|'cool'`) and `LobbySettings` (`templateId?`, `optik?: OptikSettings`, `maxParticipants?`, `allowRepresentativeAdd?` — JSDoc: default `false`).
  - Extend `Participant` (state.ts:27-32) with `role?: Role` (persisted via `__roles__`) and `ready?: boolean` (ephemeral, NOT persisted).
  - **Do NOT** add `Figure.ownerId` here — that field + its strip is Phase C.
- **acceptance_criteria:**
  - `Phase` union has exactly the 5 members, `lobby` first.
  - `Role`, `OptikSettings`, `LobbySettings` exported from `state.ts`.
  - `Participant.role`/`ready` optional; no other interface changed.
  - `lobby-types.test.ts` passes.
- **verify:** `cd brett && npm run typecheck && npm test`

### B2 — Message unions: drift-fixes (§4.2/§4.3) + new variants + 3-site exhaustiveness
- **target_files:** `brett/src/types/messages.ts`, `brett/test/messages.test.ts`
- **failing test first (red):** Update the **three** hand-kept sites in `messages.test.ts` *first*: add `role_changed`, `figure_owner_changed`, `lobby_ready_changed`, `lobby_settings_change` to `HANDLED_SERVER_TYPES` (:8-13) and to `routeServer` (:19-44); add `admin_round_start`, `admin_assign_role`, `lobby_set_ready` cases to `routeClient` (:46-70). This makes `tsc` fail on the `assertNever` default branches (and `HANDLED_SERVER_TYPES` literal) until the unions below exist.
- **implementation (`messages.ts`):**
  - Line 1: `import type { ..., Role, OptikSettings } from './state';`.
  - §4.2 field-fix: `admin_handoff_token` `toPlayerId` → `targetPlayerId` (`:23`). Handler already reads `targetPlayerId` (ws-handler `:264`); no client send-site exists yet (verified — grep clean).
  - Add to `ClientMessage`: `admin_round_start`, `{ admin_assign_role; targetPlayerId: string; role: Role }`, `{ lobby_set_ready; ready: boolean }`. (Leave `optik` in place — its removal is Phase D; do **not** add `admin_assign_figure`/`admin_set_*` — C/D.)
  - §4.3 drift-fixes on `ServerMessage`: `session_phase_change` → `{ phase: Phase; transitionedAt: string; reason: string }` (:46); `admin_token_changed` → `{ holderPlayerId: string | null; reason: string }` (:48); `session_ended` → `{ reason?: string }` (:47).
  - Add to `ServerMessage`: `{ role_changed; userId: string; role: Role }`, `{ figure_owner_changed; figureId: string; ownerId: string | null }`, `{ lobby_ready_changed; userId: string; ready: boolean }`, `{ lobby_settings_change; templateId?: string; optik?: OptikSettings }`.
- **acceptance_criteria:**
  - `tsc` green: every union member has a `routeServer`/`routeClient` case; `HANDLED_SERVER_TYPES` matches the documented client handler set.
  - The 3 broadcast drift-fixes now match the runtime payloads emitted at ws-handler `:246-255` / sessions `:125,132,133`.
  - No `admin_assign_figure`/`admin_set_template`/`admin_set_optik` member added; `optik` still present.
- **verify:** `cd brett && npm run typecheck && npm test`

### B3 — Persistence sentinels `__roles__` / `__lobby_settings__`
- **target_files:** `brett/src/server/figures.ts`, `brett/src/server/phases.ts`, `brett/test/lobby-persistence.test.ts` (new)
- **failing test first (red):** `test/lobby-persistence.test.ts` imports `applyMutation`, `buildStateFromMutations` from `../src/server/index`; asserts: after `applyMutation(room, { type:'roles_set', roles:{ u1:'leiter', u2:'beobachter' } })` and `applyMutation(room, { type:'lobby_settings_set', settings:{ templateId:'fam5', allowRepresentativeAdd:false } })`, `buildStateFromMutations(room)` returns `state.roles.u1 === 'leiter'` and `state.lobbySettings.templateId === 'fam5'`, and `state.figures` is empty (sentinels excluded).
- **implementation:**
  - `figures.ts` `applyMutation` (switch :21-100): add `case 'roles_set'` → `figs.set('__roles__', { id:'__roles__', roles: msg.roles })` (guard `msg.roles && typeof === 'object'`); add `case 'lobby_settings_set'` → `figs.set('__lobby_settings__', { id:'__lobby_settings__', settings: msg.settings })`.
  - `phases.ts` `buildStateFromMutations`: add `'__roles__'`, `'__lobby_settings__'` to the `SPECIAL` array (:29-34); after the existing sentinel reads, emit `if (rolesEntry) result.roles = rolesEntry.roles;` and `if (lobbySettingsEntry) result.lobbySettings = lobbySettingsEntry.settings;`.
- **acceptance_criteria:**
  - Both sentinels round-trip through `applyMutation` → `buildStateFromMutations`.
  - Sentinels never leak into `state.figures`.
  - `__optik__` handling untouched (Phase D).
- **verify:** `cd brett && npm test`

### B4 — `seedFigureMapFromState` extraction + §4.6 `sessionPhase` seed/send fix
- **target_files:** `brett/src/server/figures.ts`, `brett/src/server/ws-handler.ts`, `brett/test/seed-figuremap.test.ts` (new)
- **failing test first (red):** `test/seed-figuremap.test.ts` imports `seedFigureMapFromState` (new) via `figures` re-export from `../src/server/index`, plus `applyMutation`/`buildStateFromMutations`. Build a state in room A (phase `lobby` via `session_phase_set`, a figure, `roles_set`, `lobby_settings_set`), call `const persisted = buildStateFromMutations('A')`, then `seedFigureMapFromState(freshMap, persisted)` into an empty `Map`, register that map for room B, and assert `buildStateFromMutations('B')` re-emits `sessionPhase === 'lobby'`, the figure, `roles`, and `lobbySettings`. Fails (function missing + seed reads wrong field names).
- **implementation:**
  - `figures.ts`: add `export function seedFigureMapFromState(map: Map<string, any>, state: any): void` extracted from the inline join-seed (ws-handler `:86-118`). It seeds figures (array/object), `__coaching_steps__`, `__session_code__`, `__admin_token_holder__`, `__stiffness__`, **and** `__roles__` (from `state.roles`) + `__lobby_settings__` (from `state.lobbySettings`). **§4.6:** read `state.sessionPhase` → `__session_phase__`, `state.sessionCreatedAt` → `__session_created_at__`, `state.sessionLastActivity` → `__session_last_activity__` (NOT `state.phase`/`createdAt`/`lastActivity`, which are `undefined` after a DB round-trip).
  - `ws-handler.ts`: replace the inline `if (map.size === 0 && state.figures) { … }` block (:86-118) with `if (map.size === 0) deps.seedFigureMapFromState(map, state);`; add `seedFigureMapFromState` to `WsDeps` and to the `wsDeps` wiring in `index.ts`.
  - `ws-handler.ts` snapshot send (:145): `phase: freshState.phase` → `phase: freshState.sessionPhase`.
- **acceptance_criteria:**
  - `seedFigureMapFromState` is pure (no module globals), exported, unit-tested via the persistence round-trip.
  - Phase survives a `build → seed → build` cycle.
  - Snapshot `phase` field is now populated (no longer always `undefined`).
- **verify:** `cd brett && npm test`

### B5 — `lobby` phase + per-edge transition allowlist
- **target_files:** `brett/src/server/phases.ts`, `brett/test/session-state.test.ts`
- **failing test first (red):** In `session-state.test.ts` add: `transitionPhase(room, ...)` with seed `lobby` → `active` returns `{ok:true}`; seed `active` → `lobby` returns `{ok:false, reason:'invalid-edge'}`; keep existing `warmup → active` (:25-32) green and `ended → *` (:34-40) → `terminal-phase`. Fails until allowlist + `VALID_PHASES` updated.
- **implementation:**
  - `VALID_PHASES` (phases.ts:4) `+= 'lobby'`.
  - In `transitionPhase` (:17-24), after the terminal-phase check, add a per-edge allowlist: allowed `from→to` = `lobby→active`, `warmup→active` (keep legacy/Phase-A flow + existing test green), `active→paused`, `paused→active`, and `*→ended`. Any other edge (e.g. `active→lobby`, `paused→lobby`, `lobby→paused`) → `{ ok:false, reason:'invalid-edge', from:current, to:newPhase }`. A `null`/undefined `current` (initial seed) is **not** routed through `transitionPhase` (seeds use `applyMutation(session_phase_set)` directly), so leave that path permissive.
- **acceptance_criteria:**
  - `lobby→active` allowed; `active→lobby` and other illegal edges rejected with `invalid-edge`.
  - Existing `warmup→active`, `active↔paused`, terminal-guard tests unchanged and green.
- **verify:** `cd brett && npm test`

### B6 — Idle-sweep exempts `lobby`
- **target_files:** `brett/src/server/sessions.ts`, `brett/test/idle-timeout.test.ts`
- **failing test first (red):** Add to `idle-timeout.test.ts`: seed phase `lobby`, set `__session_last_activity__` to `Date.now() - 300_000`, assert `checkSessionIdle(room).ended === false` and phase stays `lobby`. Fails (current exempt only `warmup`/`ended`).
- **implementation:** `checkSessionIdle` (sessions.ts:195): exempt condition `if (!phase || phase === 'ended' || phase === 'warmup')` → add `|| phase === 'lobby'`.
- **acceptance_criteria:** An open lobby is never swept to `ended`; `active`/`paused` idle behavior unchanged.
- **verify:** `cd brett && npm test`

### B7 — Session create seeds `lobby` (not `warmup`)
- **target_files:** `brett/src/server/sessions.ts`, `brett/src/server/ws-handler.ts`, `brett/test/session-state.test.ts`
- **failing test first (red):** Update `session-state.test.ts:51-60` (`admin_session_create`) title + assertion to expect `state.sessionPhase === 'lobby'`. Fails until `handleAdminSessionCreate` changes.
- **implementation:**
  - `sessions.ts` `handleAdminSessionCreate` (:115): `applyMutation(room, { type:'session_phase_set', phase:'lobby' })` (was `'warmup'`). Creator still gets `session_admin_token_set` (= `leiter` + admin token, §10/§3).
  - `ws-handler.ts` `admin_session_create` case (:247): broadcast `session_phase_change` with `phase: 'lobby'` (was `'warmup'`).
- **acceptance_criteria:**
  - `handleAdminSessionCreate` seeds `lobby`; broadcast announces `lobby`.
  - `session-state.test.ts` create-test green at `lobby`.
- **verify:** `cd brett && npm test`

### B8 — `admin_round_start` (lobby→active, idempotent)
- **target_files:** `brett/src/server/sessions.ts`, `brett/src/server/ws-handler.ts`, `brett/test/round-start.test.ts` (new)
- **failing test first (red):** `test/round-start.test.ts` imports `handleAdminRoundStart` (new, re-exported via `index`), `applyMutation`, `buildStateFromMutations`. Seed `lobby`; `handleAdminRoundStart(room, broadcastFn)` → `{ok:true}`, phase `active`, broadcasts a `session_phase_change{phase:'active'}`. Call again (already `active`) → idempotent no-op: `{ok:true}` (or `noop:true`), **no** second broadcast, phase still `active`.
- **implementation:**
  - `sessions.ts`: add `export function handleAdminRoundStart(room, broadcastFn)`: read current phase; if already `active` → return `{ ok:true, noop:true }` without broadcasting; else `transitionPhase(room, 'active')` (uses B5 `lobby→active`), and on `ok` broadcast `{ type:'session_phase_change', phase:'active', transitionedAt:new Date().toISOString(), reason:'round-start' }`.
  - `ws-handler.ts`: append `'admin_round_start'` to `ADMIN_TYPES` (:41-43); add `case 'admin_round_start':` in the post-`isAdmin` switch (:220+) → `deps.handleAdminRoundStart(adminRoom, m => deps.broadcast(adminRoom, m)); deps.schedulePersist(adminRoom);`. Add `handleAdminRoundStart` to `WsDeps` + `index.ts` wiring + re-export.
- **acceptance_criteria:**
  - `admin_round_start` is in `ADMIN_TYPES` **and** has a switch `case` (no silent no-op).
  - Double-start is idempotent (single broadcast, phase stays `active`).
- **verify:** `cd brett && npm test`

### B9 — Late-Join-Guard rebuild (`shouldRejectReconnect` + `verifyClient` threading + client URL)
- **target_files:** `brett/src/server/sessions.ts`, `brett/src/server/index.ts`, `brett/src/client/ws-client.ts`, `brett/test/reconnect-guard.test.ts`
- **failing test first (red):** **Invert** `reconnect-guard.test.ts`:
  - `:35-41` first-time join during `active` (`!wasPreviouslyInRoom`) → `decision.reject === false` (admit late-joiner).
  - keep `:17-25` true reconnect of a previously-tracked player during `active` → `reject:true, code:409`.
  - `ended` → `reject:true, code:410`.
  - `lobby`/`warmup`/no-session → `reject:false`.
  Fails against the current "active always 409" body.
- **implementation:**
  - `sessions.ts` `shouldRejectReconnect(room, playerId)` (:167-185) rewrite, **signature unchanged**: `phase` undefined/`lobby`/`warmup` → `{reject:false}`; `ended` → `{reject:true, code:410, message:'Session ist beendet.'}`; `active`/`paused` → if `!wasPreviouslyInRoom(room, playerId)` → `{reject:false}` (real late-joiner) else `{reject:true, code:409, message:'Reconnect nicht möglich während aktiver Runde …'}`.
  - `index.ts` `verifyClient` (:269): `sessions.shouldRejectReconnect(room, url.searchParams.get('playerId'))` (thread the real param instead of hard `null`).
  - `ws-client.ts` `connectWS` (:54): append `&playerId=${encodeURIComponent(id)}` to the `/sync` URL when the client knows its identity (from the board bootstrap/config); omit when unknown (server `null` → admit, matrix-safe).
- **acceptance_criteria:**
  - Late-joiner (`!wasPreviouslyInRoom`) admitted during `active`/`paused`; true reconnect-of-active → 409; `ended` → 410.
  - `verifyClient` no longer passes hard `null`; client appends `playerId` when known.
  - Inverted `reconnect-guard.test.ts` fully green.
- **verify:** `cd brett && npm test`

### B10 — `resolvePlayerId` + presence-in-lobby (canonical identity for roster liveness)
- **target_files:** `brett/src/server/ws-handler.ts`, `brett/src/server/index.ts`, `brett/test/presence-lobby.test.ts` (new)
- **failing test first (red):** `test/presence-lobby.test.ts` imports `resolvePlayerId` (new, re-exported via `index`); asserts: `resolvePlayerId({ _session:{ userId:'oidc-u1' }, _playerId:'spoof' }) === 'oidc-u1'` (session-first); `resolvePlayerId({ _playerId:'p2' }) === 'p2'`; `resolvePlayerId({}) === 'anon'`. (Server-message presence wiring is covered structurally; the pure helper is the unit-tested surface.)
- **implementation:**
  - `ws-handler.ts`: add `export function resolvePlayerId(ws: any): string { return ws._session?.userId ?? ws._playerId ?? 'anon'; }`; re-export via `index.ts`.
  - Presence-in-lobby fix: in the join block, emit `presence_join` whenever a session exists (`activeState.sessionCode` is already true in `lobby`), keying the participant on `resolvePlayerId(ws)` for `addParticipant`/`ws._playerId`. In `ws.on('close')` (:304-307) replace the `ws._session?.userId` guard with `const pid = resolvePlayerId(ws); if (pid !== 'anon') { deps.removeParticipant(room, pid); deps.broadcast(room, { type:'presence_leave', userId: pid }); }` so late-joiners/anon-in-lobby are also removed. Use `resolvePlayerId(ws)` for the lock-owner `userId` (:180, :194) too.
  - **Scope guard:** do NOT change the join-write to *ignore* `msg.playerId` at `:124`/`:205` beyond using `resolvePlayerId` (session-first) — the explicit msg.playerId spoof-hardening + spoof-test are Phase C.
- **acceptance_criteria:**
  - `resolvePlayerId` exported, session-first, anon fallback; unit-tested.
  - Roster emits `presence_join`/`presence_leave` in `lobby`, keyed on canonical identity (anon also leaves).
- **verify:** `cd brett && npm test`

### B11 — `admin_assign_role` (role assignment + display) with member validation
- **target_files:** `brett/src/server/ws-handler.ts`, `brett/src/server/index.ts`, `brett/test/assign-role.test.ts` (new)
- **failing test first (red):** `test/assign-role.test.ts` exercises the role-assignment path through an exported helper `handleAssignRole(room, targetPlayerId, role, deps)` (new, thin, re-exported): with `targetPlayerId` a current participant → returns `{ok:true}`, writes `roles_set` so `buildStateFromMutations(room).roles[targetPlayerId] === role`, and the broadcastFn receives `{type:'role_changed', userId, role}`. With a non-member `targetPlayerId` → `{ok:false, reason:'not-in-room'}` and **no** `roles_set`, **no** broadcast.
- **implementation:**
  - `ws-handler.ts`: append `'admin_assign_role'` to `ADMIN_TYPES`; add `case 'admin_assign_role':` → validate via `deps.listParticipants(adminRoom).some(p => p.userId === msg.targetPlayerId)`; if not → `ws.send({type:'error', reason:'not-in-room'})` and return; else merge into the `__roles__` map (read current `buildStateFromMutations(adminRoom).roles ?? {}`, set `targetPlayerId: msg.role`, `applyMutation(adminRoom, { type:'roles_set', roles })`), `broadcast({type:'role_changed', userId: msg.targetPlayerId, role: msg.role})`, `schedulePersist`. Factor the body into the exported `handleAssignRole` helper for the test.
  - `'anon'` may never receive a role above `beobachter`: reject `targetPlayerId === 'anon'` as `not-in-room` (anon is never a real participant key).
- **acceptance_criteria:**
  - `admin_assign_role` in `ADMIN_TYPES` + has a `case`; isAdmin-gated.
  - Non-member target → `error: not-in-room`, no state change/broadcast.
  - Role persisted in `__roles__`; `role_changed` broadcast carries `{userId, role}`.
- **verify:** `cd brett && npm test`

### B12 — `lobby_set_ready` (non-privileged) → `lobby_ready_changed`
- **target_files:** `brett/src/server/ws-handler.ts`, `brett/test/lobby-ready.test.ts` (new)
- **failing test first (red):** `test/lobby-ready.test.ts` drives an exported helper `handleLobbySetReady(ws, msg, deps)` (new, thin): for a ws with a resolvable identity, `lobby_set_ready{ready:true}` broadcasts `{type:'lobby_ready_changed', userId: resolvePlayerId(ws), ready:true}`; `ready:false` broadcasts `ready:false`. Assert it is **not** added to `ADMIN_TYPES` (no isAdmin gate) and **not** in `RELAY_TYPES` (no `applyMutation`/persist — `ready` is ephemeral).
- **implementation:**
  - `ws-handler.ts`: add a dedicated branch (after the `figure_unlock` branch, before the `RELAY_TYPES` block) — `if (msg.type === 'lobby_set_ready') { deps.broadcast(room, { type:'lobby_ready_changed', userId: resolvePlayerId(ws), ready: !!msg.ready }); return; }`. Do **not** add it to `ADMIN_TYPES` or `RELAY_TYPES`; do **not** `schedulePersist` (ephemeral live-lobby status).
- **acceptance_criteria:**
  - `lobby_set_ready` handled in its own branch; emits `lobby_ready_changed{userId, ready}`.
  - No admin gate, no persistence, not in either Set.
- **verify:** `cd brett && npm test`

### B13 — WS session-sync hardening (`_sessionReady` gate)
- **target_files:** `brett/src/server/ws-handler.ts`, `brett/test/session-ready-gate.test.ts` (new)
- **failing test first (red):** `test/session-ready-gate.test.ts` imports exported `gateSessionReady(ws, send)` (new): for `ws` without `_sessionReady`, returns `false` and `send` received `{type:'error', reason:'not-ready'}`; for `ws` with `_sessionReady === true`, returns `true` and `send` not called.
- **implementation:**
  - `ws-handler.ts`: in the `wss.on('connection')` handler set `ws._sessionReady = true` synchronously after the `sessionMiddleware(req, {}, () => { ws._session = req.session; })` callback (and unconditionally `true` when no middleware), so isAdmin/role resolution never runs on an `undefined` session.
  - Add `export function gateSessionReady(ws, send): boolean` (returns `false` + sends `{type:'error',reason:'not-ready'}` when `!ws._sessionReady`). At the top of `ws.on('message')` (after JSON parse, allowing `pong`), short-circuit non-`pong` messages when `!gateSessionReady(ws, m => ws.send(JSON.stringify(m)))`.
- **acceptance_criteria:**
  - Messages arriving before the session is wired get `error: not-ready` (no `undefined`-session crash); `pong` still allowed.
  - `gateSessionReady` is pure/exported and unit-tested.
- **verify:** `cd brett && npm test`

### B14 — Leiter-disconnect grace wiring
- **target_files:** `brett/src/server/ws-handler.ts`, `brett/src/server/index.ts`, `brett/test/leader-grace.test.ts` (new)
- **failing test first (red):** `test/leader-grace.test.ts` imports an exported `onLeaderDisconnect(room, leavingPlayerId, phase, deps)` (new) plus `getAdminTokenHolder`, `tokenGraceTimers`, `applyMutation`. Seed room with `session_admin_token_set{playerId:'leader1'}` and phase `active`; `onLeaderDisconnect(room, 'leader1', 'active', deps)` → `tokenGraceTimers.has(room) === true` (grace started). For a non-holder (`onLeaderDisconnect(room, 'guest', 'active', deps)`) and for a terminal phase (`'ended'`) → no timer set. (Full timeout-reassignment behavior is already covered by the existing `admin-token` grace tests.)
- **implementation:**
  - `ws-handler.ts`: add `export function onLeaderDisconnect(room, leavingPlayerId, phase, deps)`: if `phase !== 'ended'` **and** `leavingPlayerId === deps.getAdminTokenHolder(room)` → `deps.beginTokenGrace(room, leavingPlayerId)`.
  - Wire into `ws.on('close')` (:295-317): compute `const pid = resolvePlayerId(ws)` and the current phase from `deps.buildStateFromMutations(room)?.sessionPhase`, then call `onLeaderDisconnect(room, pid, phase, deps)`.
  - Maintain presence for reassignment: on join, if `ws._session?.isAdmin`, accumulate the admin into `deps.setRoomAdminPresence(room, [...existing, pid])`; if the (re)joining admin is the current token holder, call `deps.reclaimAdminToken(room, pid)` to cancel a pending grace.
  - Add `getAdminTokenHolder`, `beginTokenGrace`, `setRoomAdminPresence`, `reclaimAdminToken`, `roomAdminPresence` to `WsDeps` + `index.ts` wiring (most already exported by `sessions`).
- **acceptance_criteria:**
  - Token holder leaving a non-`ended` phase starts grace; non-holder/terminal does not.
  - Re-joining holder cancels grace; `onLeaderDisconnect` is exported + unit-tested.
- **verify:** `cd brett && npm test`

### B15 — Client router: pure lobby reducer + new `onWsMessage` cases (§6c gaps)
- **target_files:** `brett/src/client/lobby-store.ts` (new), `brett/src/client/ws-client.ts`, `brett/test/lobby-store.test.ts` (new)
- **failing test first (red):** `test/lobby-store.test.ts` (`node --test`, no DOM) imports `createLobbyState`, `applyLobbyServerMessage` from `../src/client/lobby-store`. Asserts a pure reducer: `presence_join` adds a roster entry; `presence_leave` removes it; `role_changed` sets `roster[userId].role`; `lobby_ready_changed` sets `roster[userId].ready`; `session_phase_change{phase:'active'}` sets `state.phase='active'` (drives view-machine → board); `lobby_settings_change{templateId}` stores `state.settings.templateId`; `session_created{code}` stores `state.sessionCode`; unknown type → unchanged.
- **implementation:**
  - `lobby-store.ts`: pure `LobbyState` (roster map `userId→{name,color,role,ready}`, `phase`, `sessionCode`, `settings`) + `applyLobbyServerMessage(state, msg): LobbyState`.
  - `ws-client.ts` `onWsMessage` (:103-248, currently `default: break`): **add** cases — `init`, `presence_join`, `presence_leave`, `session_phase_change`, `session_created`, `session_ended`, `admin_token_changed`, `coaching_steps_change`, `error`, plus the new `role_changed`, `figure_owner_changed`, `lobby_ready_changed`, `lobby_settings_change` — each delegating to `applyLobbyServerMessage` and notifying the Phase A view-machine on phase change. `figure_owner_changed` and the optik part of `lobby_settings_change` are **routed/stored only** in B (badge/optik *apply* = C/D); the case existing prevents silent drops. Keep the existing board cases (`snapshot`/`move`/`add`/…) intact.
- **acceptance_criteria:**
  - `lobby-store.ts` is pure (no DOM/WebGL/`window`), fully covered by `lobby-store.test.ts`.
  - Every §6c-listed server type has a non-default `onWsMessage` case; board cases unchanged.
  - `npm run typecheck` green (cases match the B2 `ServerMessage` union).
- **verify:** `cd brett && npm test && npm run typecheck`

### B16 — Lobby screen (DOM) + view-machine `lobby` view
- **target_files:** `brett/src/client/ui/lobby.ts` (new), `brett/src/client/app-shell.ts` (Phase A — extend), `brett/test/lobby-render.test.ts` (new, jsdom-free pure render-model)
- **failing test first (red):** `test/lobby-render.test.ts` imports a pure `buildLobbyViewModel(state)` from `ui/lobby.ts`; given a `LobbyState` (4 participants, mixed roles, 2 ready, `sessionCode:'KRB-9A2'`, `isLeader:true`) asserts the view-model: roster rows with `{name, role, ready}`, `readyCount === 2`, `canStart === true` (leader), `startLabel === 'Runde starten'`; for `isLeader:false`, `canStart === false` and a "Bereit"-toggle is present. (DOM mounting is integration; E2E lands in Phase C.)
- **implementation:**
  - `ui/lobby.ts`: pure `buildLobbyViewModel(state)` + a `mountLobby(container, vm, handlers)` that renders with Phase A primitives (`Panel`/`Button`/`Field`/`RosterItem`/`Badge`) and `theme.ts` tokens — session code + copy, live roster (name/role-badge/ready-dot), read-only settings *display* (templateId/optik/maxParticipants — substance/edit = Phase D), a "Bereit" toggle (→ `send({type:'lobby_set_ready', ready})`) and a leader-only "Runde starten" (→ `send({type:'admin_round_start'})`).
  - `app-shell.ts`: add a `lobby` view to the Phase A view-machine, driven by `sessionPhase === 'lobby'` (mounts `mountLobby`, no Three.js scene); `active`/`paused` → board view (lazy scene); `ended` → summary.
- **acceptance_criteria:**
  - `buildLobbyViewModel` pure + unit-tested; `canStart` leader-gated; ready-count correct.
  - Lobby view mounts without initializing the Three.js scene; phase transitions route menu→lobby→board (and late-join `active` → board directly).
  - `npm run build` (vite + `tsc -p tsconfig.server.json`) and `npm run typecheck` green.
- **verify:** `cd brett && npm test && npm run typecheck && npm run build`

### Definition of Done — Phase B

- `cd brett && npm test` green — incl. new `lobby-types`, `lobby-persistence`, `seed-figuremap`, `round-start`, `presence-lobby`, `assign-role`, `lobby-ready`, `session-ready-gate`, `leader-grace`, `lobby-store`, `lobby-render`, and the **updated** `messages.test.ts` (3-site exhaustiveness), `session-state.test.ts` (create → `lobby`), `reconnect-guard.test.ts` (late-join inverted), `idle-timeout.test.ts` (lobby exempt).
- `cd brett && npm run typecheck` clean (every `ServerMessage`/`ClientMessage` union member has its `routeServer`/`routeClient`/`onWsMessage` case).
- `cd brett && npm run build` succeeds.
- Persistence round-trip (`__roles__`/`__lobby_settings__`) green; phase survives `build → seed → build`; snapshot `phase` field populated (§4.6 closed).
- Late-Join guard rebuilt (blocker 1) and `sessionPhase` drift fixed (blocker 6); `admin_round_start`/`admin_assign_role` wired into `ADMIN_TYPES` + switch (blocker 2 partial); `resolvePlayerId` + presence-in-lobby landed (blocker 4 partial).

---

## Phase C — Rollen-Durchsetzung

> **Scope (spec §5d/§5c, §9 Phase-C row):** `Figure.ownerId` (server-authoritative, stripped from client `add`/`update`); the single fail-closed `canMutate` chokepoint over the WHOLE post-§4.1 `RELAY_TYPES` set **plus** `figure_lock`; `jump`→`RELAY_TYPES`; figure assignment (`admin_assign_figure`); canonical identity from `ws._session.userId` (`resolvePlayerId` + strict `resolveRole`); owner-orphan handling on leave/demote. Tests: `canMutate` matrix, identity-spoof, E2E observer-cannot-move.
>
> **Dependencies (do NOT re-author these — assume merged from earlier phases):**
> - **Phase A:** `sessionPhase`-driven view-machine.
> - **Phase B:** `Role` type in `state.ts`; `__roles__` sentinel + `buildStateFromMutations(room).roles` emission; `admin_assign_role` ADMIN_TYPES case + `role_changed`; `lobby` phase; `&playerId=` threading; presence-in-lobby.
> - **Phase D (lands AFTER C):** `__lobby_settings__` / `lobbySettings.allowRepresentativeAdd`. Phase C reads it **defensively** (`?? false`), so C stays green whether or not D has shipped (the spec default for `allowRepresentativeAdd` is `false` = fail-closed).
> - Phase C does **not** touch the `optik` seam (§4.1 is B/D). Because C gates *all* `RELAY_TYPES` through `canMutate` with Default-Deny, a lingering `optik` relay (if still present) returns `forbidden` instead of its current silent no-op — harmless, the seam is dead.
>
> **Test harness:** server tests run via `cd brett && npm test` (`MOCK_DB=true tsx --test`), importing the REAL `applyMutation`/`buildStateFromMutations`/`canMutate`/`resolvePlayerId`/etc. from `../src/server/index`. The E2E runs via the website Playwright suite in `tests/e2e/` against a live brett (dev-flow-e2e).

---

### C1 — `Figure.ownerId` type + server-authoritative ownership in `applyMutation`

- **target_files:**
  - `brett/src/types/state.ts`
  - `brett/src/server/figures.ts`
  - `brett/src/server/index.ts` (re-export `figure_owner_set` is internal; no new export here yet)
  - `brett/test/figure-owner.test.ts` (NEW)
- **failing test first (red):** `brett/test/figure-owner.test.ts` imports `{ applyMutation, buildStateFromMutations }` from `../src/server/index` and asserts:
  - After `applyMutation(room, { type:'add', figure:{ id:'f1', x:0, z:0, facingY:0, appearance:{...}, ownerId:'attacker' } })`, `buildStateFromMutations(room).figures[0].ownerId` is `undefined` (client-supplied `ownerId` is stripped on add, exactly like `id`).
  - After `applyMutation(room, { type:'update', id:'f1', changes:{ ownerId:'attacker', x:5 } })`, the figure's `x===5` **but** `ownerId` is still `undefined` (stripped on update).
  - After `applyMutation(room, { type:'figure_owner_set', figureId:'f1', ownerId:'beob-1' })`, `ownerId==='beob-1'`; then `applyMutation(room, { type:'figure_owner_set', figureId:'f1', ownerId:null })` → `ownerId===null`.
  - `figure_owner_set` against a non-existent figureId is a no-op (no throw, no phantom figure created).
- **implementation:**
  - `state.ts`: add `ownerId?: string;` to `Figure` (per contract §5).
  - `figures.ts` `applyMutation`:
    - `add` case: `const { ownerId: _stripOwner, ...figData2 } = (msg.figure ?? msg.fig);` (or `delete` the field before the spread) so `ownerId` never lands from the client.
    - `update` case: extend the existing strip — `const { id: _ignoredId, ownerId: _ignoredOwner, ...safeChanges } = msg.changes;`.
    - New `case 'figure_owner_set':` — if `figs.has(msg.figureId)`, write `figs.set(msg.figureId, { ...figs.get(msg.figureId), ownerId: msg.ownerId ?? null })`; else no-op.
- **acceptance_criteria:**
  - `Figure` carries an optional `ownerId`.
  - Client `add`/`update` payloads can never set/change `ownerId` (server-authoritative).
  - `figure_owner_set` is the only mutation that writes `ownerId`; tolerates `null` (unassign) and missing target.
  - `buildStateFromMutations` surfaces `ownerId` on figures (it already spreads figure values; verify `__*__` sentinels still excluded).
- **verify:** `cd brett && npm test -- test/figure-owner.test.ts && npm run typecheck`

---

### C2 — Message-union variants `admin_assign_figure` / `figure_owner_changed` + exhaustiveness (3 sites)

- **target_files:**
  - `brett/src/types/messages.ts`
  - `brett/test/messages.test.ts`
- **failing test first (red):** in `brett/test/messages.test.ts`:
  - Add `'figure_owner_changed'` to the `HANDLED_SERVER_TYPES` literal (§15 site 1).
  - Add `case 'figure_owner_changed': return 'figure_owner_changed';` to `routeServer` (site 2) and `case 'admin_assign_figure': return 'admin_assign_figure';` to `routeClient` (site 3).
  - Before the union edits land, `tsc` fails on the new `case`s referencing non-existent variants (and `routeClient`/`routeServer` `assertNever` would error once the union has variants with no case) — this is the red.
- **implementation:** in `messages.ts`:
  - `ClientMessage` += `| { type: 'admin_assign_figure'; figureId: string; toPlayerId: string | null }` (contract §6).
  - `ServerMessage` += `| { type: 'figure_owner_changed'; figureId: string; ownerId: string | null }` (contract §7).
  - No new import needed (these variants use only `string`/`null`).
- **acceptance_criteria:**
  - Both variants exist verbatim per the contract.
  - All THREE hand-kept exhaustiveness sites updated in lockstep; `assertNever` default branches compile.
  - `messages.test.ts` passes (exhaustiveness guards green).
- **verify:** `cd brett && npm test -- test/messages.test.ts && npm run typecheck`

---

### C3 — `canMutate` + strict `resolveRole` (pure chokepoint, `src/server/permissions.ts`)

- **target_files:**
  - `brett/src/server/permissions.ts` (NEW)
  - `brett/src/server/index.ts` (wire `import * as permissions` + `export const canMutate = permissions.canMutate; export const resolveRole = permissions.resolveRole;`)
  - `brett/test/permissions.test.ts` (NEW)
- **failing test first (red):** `brett/test/permissions.test.ts` imports `{ canMutate, resolveRole }` from `../src/server/index` and asserts the **entire** contract §9 matrix:
  - **leiter:** `move/update/jump/delete/figure_lock/add/clear/snapshot/stiffness/request_state_snapshot` → all `true` (regardless of `figureOwnerId`).
  - **stellvertreter:** `move/update/jump/delete/figure_lock` → `true` **iff** `figureOwnerId === playerId`, else `false`; `add` → `true` **iff** `allowRepresentativeAdd === true`, else `false`; `clear/snapshot/stiffness` → `false`; `request_state_snapshot` → `true`.
  - **beobachter:** `move/update/jump/delete/figure_lock/add/clear/snapshot/stiffness` → `false`; `request_state_snapshot` → `true` (read is **never** denied for any role — explicit assert).
  - **Default-Deny:** `canMutate({ msgType:'optik' as any, role:'leiter', ... })` and any unknown `msgType` → `false` for every role.
  - `resolveRole({ _session:{ userId:'u1' } }, { u1:'leiter' })` → `'leiter'`; `resolveRole({ _session:{ userId:'u1' } }, {})` → `'beobachter'`; `resolveRole({ _playerId:'spoof' }, { spoof:'leiter' })` → `'beobachter'` (no session ⇒ never above beobachter); `resolveRole({}, {})` → `'beobachter'`.
- **implementation:** `permissions.ts`:
  ```ts
  import type { Role } from '../types/state';
  export type MutationType =
    | 'add' | 'move' | 'update' | 'jump' | 'delete'
    | 'clear' | 'stiffness' | 'snapshot' | 'request_state_snapshot' | 'figure_lock';
  export interface MutateContext {
    msgType: MutationType; role: Role; playerId: string;
    figureOwnerId?: string | null; allowRepresentativeAdd?: boolean;
  }
  export function canMutate(ctx: MutateContext): boolean { /* matrix below */ }
  export function resolveRole(ws: any, roles: Record<string, Role>): Role {
    const uid = ws?._session?.userId;
    if (!uid) return 'beobachter';
    return roles[uid] ?? 'beobachter';
  }
  ```
  Body, fail-closed (every path not explicitly allowed → `false`):
  - `request_state_snapshot` → `true` for all roles (read-only).
  - `role==='leiter'` → `true` for all `MutationType`.
  - `role==='stellvertreter'`: `move|update|jump|delete|figure_lock` → `ctx.figureOwnerId === ctx.playerId`; `add` → `ctx.allowRepresentativeAdd === true`; everything else → `false`.
  - `role==='beobachter'` → `false` (except the `request_state_snapshot` early-return).
  - final `return false;`.
- **acceptance_criteria:**
  - `canMutate` is pure (no Three.js, no I/O), exhaustively matches the §9 matrix incl. Default-Deny.
  - `resolveRole` keys strictly on `ws._session.userId`; anon/unknown → `beobachter`.
  - `MutationType` is the exact union (no `optik`), so Default-Deny is type-driven.
- **verify:** `cd brett && npm test -- test/permissions.test.ts && npm run typecheck`

---

### C4 — `resolvePlayerId` helper + identity hardening + spoof test

- **target_files:**
  - `brett/src/server/ws-handler.ts` (export `resolvePlayerId`; harden join-seed `:124` and `player_join` write `:205`; harden `figure_lock`/`close` identity reads)
  - `brett/src/server/index.ts` (`export const resolvePlayerId = wsHandler.resolvePlayerId;`)
  - `brett/test/identity-spoof.test.ts` (NEW)
- **failing test first (red):** `brett/test/identity-spoof.test.ts` imports `{ resolvePlayerId, resolveRole, canMutate }` from `../src/server/index` and asserts:
  - `resolvePlayerId({ _session:{ userId:'beob-1' }, _playerId:'leiter-1' })` === `'beob-1'` (session beats a spoofed `_playerId`).
  - `resolvePlayerId({ _playerId:'p1' })` === `'p1'`; `resolvePlayerId({})` === `'anon'`.
  - **Spoof scenario:** with `roles = { 'leiter-1':'leiter', 'beob-1':'beobachter' }`, a ws `{ _session:{ userId:'beob-1' }, _playerId:'leiter-1' }`:
    - `resolveRole(ws, roles)` === `'beobachter'` (role keyed on session id, not the spoofed `_playerId`).
    - `canMutate({ msgType:'move', role: resolveRole(ws, roles), playerId: resolvePlayerId(ws), figureOwnerId:'leiter-1' })` === `false`.
  - **Anon-escalation guard:** ws `{ _playerId:'leiter-1' }` (no session) → `resolveRole(ws, roles)` === `'beobachter'` (a session-less client supplying a privileged id can never inherit a role above beobachter).
- **implementation:**
  - `ws-handler.ts`: `export function resolvePlayerId(ws: any): string { return ws?._session?.userId ?? ws?._playerId ?? 'anon'; }` (contract §10).
  - Join-seed (`ws-handler.ts:124`): replace `const playerId = msg.playerId || ws._session?.userId || 'anon';` with `const playerId = ws._session?.userId ?? msg.playerId ?? 'anon';` then set `ws._playerId = playerId;` so `resolvePlayerId(ws)` is canonical thereafter. (Session id wins over any client-supplied `msg.playerId`; anon path still honors `msg.playerId` for tracking.)
  - `player_join` relay write (`ws-handler.ts:205`): replace `ws._playerId = msg.playerId; deps.trackPlayerInRoom(room, msg.playerId);` with `const pid = ws._session?.userId ?? msg.playerId ?? ws._playerId ?? 'anon'; ws._playerId = pid; deps.trackPlayerInRoom(room, pid);`.
  - `figure_lock` branch (`:180`) and `figure_unlock` (`:194`) and `close` handler (`:299`): replace the ad-hoc `ws._session?.userId || ws._playerId || 'anon'` reads with `resolvePlayerId(ws)`.
- **acceptance_criteria:**
  - One canonical `resolvePlayerId` used for lock owner, unlock, close, and (C5) `canMutate.ctx.playerId`.
  - When a session exists, `msg.playerId` can never override identity (no `{type:'join', playerId:'<leiter-id>'}` escalation).
  - Role-bearing identity (`resolveRole`) is strictly session-keyed; anon → `beobachter`.
- **verify:** `cd brett && npm test -- test/identity-spoof.test.ts && npm run typecheck`

---

### C5 — Wire the chokepoint: `jump`→`RELAY_TYPES`, `canMutate` gate (RELAY + `figure_lock`), `admin_assign_figure`

- **target_files:**
  - `brett/src/server/ws-handler.ts` (`RELAY_TYPES` += `jump`; `ADMIN_TYPES` += `admin_assign_figure`; gate the relay block `:201` and `figure_lock` branch `:178`; new `admin_assign_figure` switch case; stellvertreter-add owner stamping; thread `permissions`/`resolveRole` via `deps`)
  - `brett/src/server/index.ts` (pass `canMutate`/`resolveRole` into `wsDeps`; `export const RELAY_TYPES` already derived)
  - `brett/test/relay-gate.test.ts` (NEW)
- **failing test first (red):** `brett/test/relay-gate.test.ts` imports `{ RELAY_TYPES }` from `../src/server/index` and asserts `RELAY_TYPES.includes('jump')` (currently `false` → red). Also asserts `RELAY_TYPES.includes('move')` (regression guard) and that the array still contains `request_state_snapshot`. (The end-to-end "gate is actually invoked before apply/broadcast" assertion is owned by C3 for the pure matrix + C7 for live behavior; this task's automated red is the `jump` membership + typecheck/build.)
- **implementation:** in `ws-handler.ts`:
  - `RELAY_TYPES`: add `'jump'` (contract §8). (Leave `optik` removal to B/D — not C's scope.)
  - `ADMIN_TYPES`: add `'admin_assign_figure'`.
  - Extend `WsDeps` with `canMutate: Function; resolveRole: Function;` and have `index.ts` inject `permissions.canMutate` / `permissions.resolveRole`.
  - **Relay gate** (`if (RELAY_TYPES.has(msg.type))`, `:201`), BEFORE `applyMutation`/`broadcast`:
    ```ts
    const state = deps.buildStateFromMutations(room) || {};
    const roles = state.roles || {};
    const role = deps.resolveRole(ws, roles);
    const playerId = resolvePlayerId(ws);
    const figureOwnerId = deps.figureMaps.get(room)?.get(msg.id)?.ownerId ?? null;
    const allowRepresentativeAdd = !!state.lobbySettings?.allowRepresentativeAdd; // D may be absent ⇒ false
    if (!deps.canMutate({ msgType: msg.type, role, playerId, figureOwnerId, allowRepresentativeAdd })) {
      try { ws.send(JSON.stringify({ type:'error', reason:'forbidden' })); } catch {}
      return;
    }
    ```
    Keep the existing `player_join`/`clear`/`schedulePersist` tail. For a permitted **stellvertreter `add`**, after `applyMutation`, stamp ownership server-side: `deps.applyMutation(room, { type:'figure_owner_set', figureId:(msg.figure ?? msg.fig).id, ownerId: playerId })` and `deps.broadcast(room, { type:'figure_owner_changed', figureId, ownerId: playerId })`.
  - **`figure_lock` branch** (`:178`): before `acquireFigureLock`, compute `role`/`playerId`/`figureOwnerId` as above and gate with `canMutate({ msgType:'figure_lock', ... })`. On denial → `ws.send({type:'error', reason:'forbidden'})` and `return` (NOT `figure_lock_denied`). Lock-contention (lock already held) still emits the existing `figure_lock_denied`.
  - **`admin_assign_figure` case** (post-`isAdmin` switch, `:220+`):
    - `if (typeof msg.figureId !== 'string') return;`
    - validate target figure exists: `if (!deps.figureMaps.get(adminRoom)?.has(msg.figureId)) { ws.send({type:'error',reason:'not-found'}); return; }`
    - if `msg.toPlayerId !== null`, validate membership: `if (!deps.listParticipants(adminRoom).some((p:any)=>p.userId===msg.toPlayerId)) { ws.send({type:'error',reason:'not-in-room'}); return; }`
    - `deps.applyMutation(adminRoom, { type:'figure_owner_set', figureId: msg.figureId, ownerId: msg.toPlayerId })`
    - `deps.broadcast(adminRoom, { type:'figure_owner_changed', figureId: msg.figureId, ownerId: msg.toPlayerId })`
    - `deps.schedulePersist(adminRoom)`
- **acceptance_criteria:**
  - `jump` is relayed (in `RELAY_TYPES`) and passes through the same `canMutate` gate as `move` (no `applyMutation` case needed — ephemeral; relay path tolerates it).
  - **Every** `RELAY_TYPES` message AND `figure_lock` passes through `canMutate` before apply/broadcast; denial → `{type:'error',reason:'forbidden'}` to sender, no broadcast, no state change (fail-closed Default-Deny applies to any non-matrix type).
  - `admin_assign_figure` is in `ADMIN_TYPES` with a real switch case (isAdmin-gated), validates figure existence + target membership (or `null` unassign), writes ownership via `figure_owner_set`, broadcasts `figure_owner_changed`, persists.
  - Permitted stellvertreter `add` stamps `ownerId=self` and broadcasts `figure_owner_changed`.
  - `request_state_snapshot` from any role (incl. beobachter) is never denied.
- **verify:** `cd brett && npm test -- test/relay-gate.test.ts && npm run typecheck && npm run build`

---

### C6 — Owner-orphan handling on leave + demote (`orphanFiguresForUser`)

- **target_files:**
  - `brett/src/server/figures.ts` (NEW exported `orphanFiguresForUser`)
  - `brett/src/server/index.ts` (`export const orphanFiguresForUser = figures.orphanFiguresForUser;` + inject into `wsDeps`)
  - `brett/src/server/ws-handler.ts` (call on `close`; call in the existing `admin_assign_role` case on demotion-to-beobachter)
  - `brett/test/figure-owner.test.ts` (extend)
- **failing test first (red):** extend `brett/test/figure-owner.test.ts`, importing `{ orphanFiguresForUser }` from `../src/server/index`:
  - Seed `figure_owner_set` for `f1→'beob-1'`, `f2→'beob-1'`, `f3→'beob-2'`.
  - `orphanFiguresForUser(room, 'beob-1')` returns `['f1','f2']` (order-insensitive) and after the call `buildStateFromMutations(room)` shows `f1.ownerId===null`, `f2.ownerId===null`, `f3.ownerId==='beob-2'` (untouched).
  - `orphanFiguresForUser(room, 'nobody')` returns `[]` and mutates nothing.
- **implementation:**
  - `figures.ts`:
    ```ts
    export function orphanFiguresForUser(room: string, userId: string): string[] {
      const figs = figureMaps.get(room);
      if (!figs || !userId) return [];
      const changed: string[] = [];
      for (const [fid, fig] of figs.entries()) {
        if (fig && fig.ownerId === userId) { figs.set(fid, { ...fig, ownerId: null }); changed.push(fid); }
      }
      return changed;
    }
    ```
  - `ws-handler.ts` `close` handler (`:295`): after `releaseLocksForUser`, `const orphaned = deps.orphanFiguresForUser(room, uid); for (const fid of orphaned) deps.broadcast(room, { type:'figure_owner_changed', figureId: fid, ownerId: null }); if (orphaned.length) deps.schedulePersist(room);` (use the `uid = resolvePlayerId(ws)` from C4).
  - `ws-handler.ts` existing `admin_assign_role` case (shipped in Phase B): after the role is written, if `msg.role === 'beobachter'`, call `deps.orphanFiguresForUser(adminRoom, msg.targetPlayerId)`, broadcast a `figure_owner_changed{ownerId:null}` per changed figure, and `schedulePersist`. (A demoted owner can no longer mutate their figures, so they must be released.)
- **acceptance_criteria:**
  - Leaving the room nulls `ownerId` on all figures owned by the leaver and broadcasts `figure_owner_changed` per figure.
  - Demotion to `beobachter` orphans that user's figures the same way.
  - `orphanFiguresForUser` is pure-ish (scans + mutates only the room's figureMap), returns the changed ids, tolerates unknown user.
- **verify:** `cd brett && npm test -- test/figure-owner.test.ts && npm run typecheck && npm run build`

---

### C7 — E2E: observer cannot move (two browser contexts)

- **target_files:**
  - `brett/src/server/index.ts` (parameterize `/auth/e2e-login` to accept distinct identities)
  - `tests/e2e/specs/brett-roles.spec.ts` (NEW)
  - `tests/e2e/playwright.config.ts` (register the spec under the `brett-mentolder` project `testMatch`)
- **failing test first (red):** `tests/e2e/specs/brett-roles.spec.ts` (Playwright) — fails until C1–C6 enforcement + the parameterized login exist:
  1. Two independent `browser.newContext()` (Leiter + Beobachter). Each authenticates against brett via `POST /auth/e2e-login` (header `x-e2e-secret: BRETT_OIDC_SECRET`) with **distinct** `{ userId, name }` bodies — `leiter-e2e` (isAdmin true) and `beob-e2e` (isAdmin true; OIDC-admin on purpose, to prove enforcement keys on ROLE, not the isAdmin claim).
  2. Leiter creates a session (→ becomes `leiter`); Beobachter joins the same room (defaults to `beobachter`). Leiter assigns Beobachter role `beobachter` explicitly (via the lobby control or `admin_assign_role` over the live socket), then starts the round (`admin_round_start`, `lobby→active`).
  3. Beobachter selects a figure and attempts a `move`.
  - **Asserts:** Beobachter receives `{type:'error', reason:'forbidden'}` AND the figure's authoritative position in the **Leiter** context (`window.STATE.figures[…].x/z`) is unchanged after the attempt.
- **implementation:**
  - `index.ts` `/auth/e2e-login`: when the secret matches, read optional `req.body.userId` / `req.body.name` / `req.body.isAdmin` and use them (defaulting to `e2e-admin` / `E2E Admin` / `true`) so two contexts can hold distinct, role-distinct identities. Keep the 403 when the secret is missing/wrong.
  - Spec drives role assignment + round-start through the live client hooks / WS (prefer protocol-level driving over coupling to Phase B/D DOM selectors), then issues the Beobachter move and reads `window.STATE` from both contexts.
  - Register `'**/brett-roles.spec.ts'` in the `brett-mentolder` project `testMatch` (authenticated brett project; the spec opens its own contexts so the project `storageState` is incidental).
- **acceptance_criteria:**
  - A round-active session with an assigned `beobachter` rejects the observer's `move` server-side (`forbidden`), and the figure does not move for any client.
  - The test uses two distinct authenticated identities and proves enforcement is driven by the assigned **role**, independent of the OIDC `isAdmin` claim.
  - Spec is registered and discoverable via `--project=brett-mentolder`.
- **verify:** `cd tests/e2e && BRETT_URL=http://brett.localhost BRETT_OIDC_SECRET=$BRETT_OIDC_SECRET npx playwright test --project=brett-mentolder brett-roles.spec.ts` (live brett; dev-flow-e2e). Plus the server change stays green offline: `cd brett && npm run typecheck && npm run build`.

### Definition of Done — Phase C

- `cd brett && npm test && npm run typecheck && npm run build` all green — incl. `canMutate` matrix (`permissions.test.ts`), identity-spoof (`identity-spoof.test.ts`), `ownerId` strip/orphan (`figure-owner.test.ts`), relay-gate (`relay-gate.test.ts`), and `messages.test.ts` exhaustiveness for the two new variants.
- `canMutate` is the **sole** chokepoint over the whole `RELAY_TYPES` set + `figure_lock`, fail-closed Default-Deny (blocker 3); `jump` is in `RELAY_TYPES` and gated (blocker 5).
- Identity is session-authoritative — `msg.playerId` cannot escalate role; anon → `beobachter` (blocker 4 complete); `admin_assign_figure` wired into `ADMIN_TYPES` + switch (blocker 2 partial).
- C7 Playwright observer-gate green against a live brett (two distinct identities; enforcement keyed on role, not the OIDC `isAdmin` claim).

---

## Phase D — Settings-Substanz

> **Scope:** Wire the four pre-game settings with real substance (Szenario-Vorlage · Coaching-Ablauf · Board-Optik · Rollen/Teilnehmer), repair the dead `optik` seam (§4.1), replace the self-contained optik reimpl with a real-`applyMutation` test, and ship the additive `brett_snapshots.is_template` migration.
>
> **Preconditions (earlier phases, do NOT re-author):**
> - **B**: `messages.ts` union edits already landed — `admin_set_optik`, `admin_set_template`, `lobby_set_ready`, `lobby_settings_change` exist; the dead `optik` variant is removed; `messages.test.ts` exhaustiveness (3 sites) updated; `ADMIN_TYPES` membership for the five new `admin_*` is present (D **re-asserts** membership idempotently so it is self-consistent); `seedFigureMapFromState` (`figures.ts`) exists and re-seeds the `__lobby_settings__` sentinel; the `ws-client.ts` `onWsMessage` default no longer drops unknown messages.
> - **C**: `canMutate` chokepoint + `ownerId`-strip are live, so the leiter is permitted to drive `snapshot`/template apply.
> - All server tests use `node:test` + `tsx`, `MOCK_DB=true`, importing the **real** `applyMutation`/`buildStateFromMutations`/handlers from `../src/server/index` (pattern: `test/session-state.test.ts`, `test/coaching-steps.test.ts`). All pure client-logic tests import three.js/DOM-free modules only.
>
> **Note on B↔D protocol overlap:** the `admin_set_optik`/`admin_set_template`/`lobby_settings_change` union variants are §4.1-family edits that the contract permits to land in B alongside the other drift-fixes (§13). If, at execution time, B did **not** carry them, the first D task that touches `messages.ts` MUST add them (and update the 3 exhaustiveness sites) before its handler work — D depends on those variants existing, not on B having authored them.

---

### D1 — Additive `brett_snapshots.is_template` migration

- **target_files**: `k3d/website-schema.yaml`
- **failing test (red)**: `brett/test/snapshots-template-migration.test.ts` — reads `path.join(__dirname, '..', '..', 'k3d', 'website-schema.yaml')` and asserts the text contains an idempotent `ALTER TABLE brett_snapshots ADD COLUMN IF NOT EXISTS is_template boolean NOT NULL DEFAULT false` and a partial index `CREATE INDEX IF NOT EXISTS idx_brett_snapshots_template ON brett_snapshots(is_template) WHERE is_template`. Red because neither exists today (`website-schema.yaml:603-615`).
- **implementation**: Immediately after the `brett_snapshots` CREATE block + its two indexes (`website-schema.yaml:610-615`), append the additive `ALTER TABLE … ADD COLUMN IF NOT EXISTS is_template boolean NOT NULL DEFAULT false;` and the partial index. Mirror the existing idempotent `ADD COLUMN IF NOT EXISTS` precedent at `:618`.
- **acceptance_criteria**:
  - Column is additive, `NOT NULL DEFAULT false` → existing snapshots become non-templates, no row rewrite needed.
  - Statement is idempotent (re-applying the schema is a no-op).
  - No `brand` column added (per §5c — per-namespace DBs are physically separate; YAGNI).
- **verify**: `cd brett && npm test` (migration structure test green). Cluster apply is integration-only (`task` schema apply on shared-db, both namespaces).

---

### D2 — Repair the dead optik seam (`optik_set`) + real-`applyMutation` test

- **target_files**: `brett/src/server/figures.ts`; **new** `brett/test/optik.test.ts`; **delete** `tests/unit/brett-optik-server.js`
- **failing test (red)**: `brett/test/optik.test.ts` imports `applyMutation`, `buildStateFromMutations` from `../src/server/index` and asserts:
  - `applyMutation(room, { type: 'optik_set', settings: { floor:'felt-green', sky:'dusk', lightMood:'warm' } })` stores `__optik__` with those settings.
  - `buildStateFromMutations(room).optik` deep-equals the settings; `state.figures` excludes `__optik__`.
  - `applyMutation(room, { type: 'clear' })` removes `__optik__`.
  - Non-object `settings` is ignored (no `__optik__` written).
  - Unset → `result.optik === undefined`.
  Red because `applyMutation` only has the broken `case 'optik'` (reads `msg.settings` but is never fed it) and no `optik_set` (`figures.ts:62-66`).
- **implementation**: Replace `case 'optik':` (`figures.ts:62-66`) with `case 'optik_set':` keeping the same body (`figs.set('__optik__', { id:'__optik__', settings: msg.settings })` guarded by `typeof msg.settings === 'object'`). Delete `tests/unit/brett-optik-server.js` (its self-contained reimpl is replaced).
- **acceptance_criteria**:
  - Optik is exercised against the **real** server `applyMutation`, not a reimpl.
  - `grep -rl brett-optik-server tests/` returns no live runner reference (it was a standalone `node` script, not in any BATS runner; only doc/index mentions remain).
  - `__optik__` already in `SPECIAL`/`buildStateFromMutations` (`phases.ts:31,44`) — unchanged.
- **verify**: `cd brett && npm test`

---

### D3 — `__lobby_settings__` sentinel persistence (`lobby_settings_set`, merge)

- **target_files**: `brett/src/server/figures.ts` (new `lobby_settings_set` case), `brett/src/server/phases.ts` (`SPECIAL` + emit `lobbySettings`)
- **failing test (red)**: `brett/test/lobby-settings.test.ts`:
  - `applyMutation(room, { type:'lobby_settings_set', settings:{ templateId:'t1' } })` then `applyMutation(room, { type:'lobby_settings_set', settings:{ maxParticipants:8, allowRepresentativeAdd:true } })` → `buildStateFromMutations(room).lobbySettings` deep-equals `{ templateId:'t1', maxParticipants:8, allowRepresentativeAdd:true }` (**merge**, not overwrite).
  - `state.figures` excludes `__lobby_settings__`.
  - Roundtrip via Phase-B `seedFigureMapFromState`: `build → seedFigureMapFromState(freshMap, builtState) → buildStateFromMutations` preserves `lobbySettings` (dependency-gated on B's seed recognizing `__lobby_settings__`, §11).
  Red because there is no `lobby_settings_set` case and `__lobby_settings__` is absent from `SPECIAL`.

  > **Note:** B3 already adds a `lobby_settings_set` case (overwrite) + `SPECIAL` membership. D3 **upgrades** that case to **merge** semantics and re-asserts the `SPECIAL`/emit wiring; if B3's case is already present, this task changes only the body (overwrite → shallow-merge) and adds the merge + roundtrip assertions.
- **implementation**: Add/upgrade `case 'lobby_settings_set':` in `applyMutation` to **merge** `msg.settings` into the existing `figs.get('__lobby_settings__')?.settings` (shallow merge, ignore non-object). Ensure `'__lobby_settings__'` is in the `SPECIAL` array (`phases.ts:29-34`) and emit `if (lobbySettingsEntry) result.lobbySettings = lobbySettingsEntry.settings`.
- **acceptance_criteria**:
  - Merge semantics: setting one field never clobbers the others.
  - `LobbySettings` shape per contract (`templateId?`, `optik?`, `maxParticipants?`, `allowRepresentativeAdd?`).
  - Excluded from `figures`; survives the persist→seed roundtrip.
- **verify**: `cd brett && npm test`

---

### D4 — Board-Optik handler: `admin_set_optik` substance + propagation

- **target_files**: `brett/src/server/sessions.ts` (new `handleAdminSetOptik`), `brett/src/server/ws-handler.ts` (ADMIN switch case + membership), `brett/src/server/index.ts` (re-export + wsDeps)
- **failing test (red)**: `brett/test/admin-set-optik.test.ts` imports `handleAdminSetOptik` from `../src/server/index`; calls `handleAdminSetOptik(room, { floor:'felt-green', sky:'dusk', lightMood:'warm' }, collect)` and asserts:
  - `collect` received `{ type:'lobby_settings_change', optik:{…} }` (the OTHER-clients propagation payload, §13).
  - `buildStateFromMutations(room).optik` deep-equals the settings (server-state persisted via `optik_set`).
  Red because `handleAdminSetOptik` does not exist.
- **implementation**:
  - `sessions.ts`: `export function handleAdminSetOptik(room, settings, broadcastFn) { applyMutation(room, { type:'optik_set', settings }); broadcastFn({ type:'lobby_settings_change', optik: settings }); return { ok:true }; }` (uses the `applyMutation` already injected via `initSessions`, `index.ts:22`).
  - `index.ts`: `export const handleAdminSetOptik = sessions.handleAdminSetOptik;` + add to `wsDeps`.
  - `ws-handler.ts`: ensure `'admin_set_optik' ∈ ADMIN_TYPES` (`:41-43`); add `case 'admin_set_optik':` in the post-`isAdmin` switch (`:220+`) → `deps.handleAdminSetOptik(adminRoom, msg.settings, (m) => deps.broadcast(adminRoom, m, ws)); deps.schedulePersist(adminRoom);` (excludes sender — §13 "to OTHER clients").
- **acceptance_criteria**:
  - Optik persists in server state (late-joiners get it in their `snapshot`/`init`, since it is NOT a raw relay).
  - Propagated via `lobby_settings_change{optik}`, sender excluded.
  - Gated by the existing `isAdmin` check (membership in `ADMIN_TYPES`); membership-without-case no-op avoided.
- **verify**: `cd brett && npm test && npm run typecheck`

---

### D5 — Szenario-Vorlage handler: `admin_set_template` choice persist + propagation

- **target_files**: `brett/src/server/sessions.ts` (new `handleAdminSetTemplate`), `brett/src/server/ws-handler.ts` (case + membership), `brett/src/server/index.ts` (re-export + wsDeps)
- **failing test (red)**: `brett/test/admin-set-template.test.ts`: `handleAdminSetTemplate(room, 'tpl-1', collect)` asserts:
  - `collect` received `{ type:'lobby_settings_change', templateId:'tpl-1' }`.
  - `buildStateFromMutations(room).lobbySettings.templateId === 'tpl-1'` (persisted via `lobby_settings_set` merge).
  Red because `handleAdminSetTemplate` does not exist.
- **implementation**:
  - `sessions.ts`: `handleAdminSetTemplate(room, templateId, broadcastFn) { applyMutation(room, { type:'lobby_settings_set', settings:{ templateId } }); broadcastFn({ type:'lobby_settings_change', templateId }); return { ok:true }; }`.
  - `index.ts` re-export + `wsDeps`.
  - `ws-handler.ts`: ensure `'admin_set_template' ∈ ADMIN_TYPES`; add `case 'admin_set_template':` → `deps.handleAdminSetTemplate(adminRoom, msg.templateId, (m) => deps.broadcast(adminRoom, m, ws));` then trigger the figure apply (D7) + `deps.schedulePersist(adminRoom);`.
- **acceptance_criteria**:
  - Template **choice** is persisted in `lobbySettings` (survives reload / late-join roster) independent of the figure apply.
  - Propagated via `lobby_settings_change{templateId}`, sender excluded.
- **verify**: `cd brett && npm test && npm run typecheck`

---

### D6 — Template figure-seed (pure seeder)

- **target_files**: `brett/src/server/figures.ts` (new `seedFiguresFromTemplate`), `brett/src/server/index.ts` (re-export)
- **failing test (red)**: `brett/test/template-seed.test.ts`:
  - Pre-seed `room` with a stale figure + a `__session_phase__` sentinel.
  - `seedFiguresFromTemplate(room, { figures:[{ id:'a', x:1, z:2, facingY:0, appearance:{…} }, { id:'b', … }] })`.
  - `buildStateFromMutations(room).figures` has exactly `a` and `b` (stale figure gone); the `__session_phase__` sentinel is **preserved**.
  Red because `seedFiguresFromTemplate` does not exist.
- **implementation**: `export function seedFiguresFromTemplate(room, templateState) { const figs = ensureFigureMap(room); for (const [id] of figs) if (!id.startsWith('__')) figs.delete(id); for (const f of (templateState?.figures ?? [])) if (f && typeof f.id === 'string') applyMutation(room, { type:'add', figure: f }); }` — clears only non-sentinel figures, reuses `applyMutation('add')` (so `appearance` defaulting/200-cap apply). Re-export from `index.ts`.
- **acceptance_criteria**:
  - Replaces the figure set; sentinels (`__optik__`, `__session_phase__`, `__lobby_settings__`, …) untouched.
  - Pure (no DB), unit-tested under `MOCK_DB=true`.
- **verify**: `cd brett && npm test`

---

### D7 — Template apply orchestrator + DB load wiring

- **target_files**: `brett/src/server/figures.ts` (new `applyTemplateToRoom`), `brett/src/server/db.ts` (new `loadSnapshotState`), `brett/src/server/ws-handler.ts` (wire into `admin_set_template`), `brett/src/server/index.ts` (re-export + wsDeps)
- **failing test (red)**: `brett/test/template-apply.test.ts`: `applyTemplateToRoom(room, { figures:[{ id:'x', x:1, z:2, facingY:0, appearance:{…} }] }, collect)` asserts:
  - `buildStateFromMutations(room).figures` equals the template figures.
  - `collect` received a `{ type:'snapshot', figures:[…] }` reflecting the seeded board (so all clients render it).
  Red because `applyTemplateToRoom` does not exist.
- **implementation**:
  - `figures.ts`: `applyTemplateToRoom(room, templateState, broadcastFn) { seedFiguresFromTemplate(room, templateState); const figs = buildStateFromMutations(room)?.figures ?? []; broadcastFn({ type:'snapshot', figures: figs }); }` (server-authoritative — does not trust a client figure payload).
  - `db.ts`: `export async function loadSnapshotState(id) { const { rows } = await pool.query('SELECT state FROM brett_snapshots WHERE id = $1', [id]); return rows[0]?.state ?? null; }`.
  - `ws-handler.ts` `case 'admin_set_template'` (after D5's choice-persist): `const snap = await deps.loadSnapshotState(msg.templateId); if (snap) deps.applyTemplateToRoom(adminRoom, snap, (m) => deps.broadcast(adminRoom, m)); deps.schedulePersist(adminRoom);` (broadcast to all so the leiter's board also reflects the server-authoritative seed).
  - Add `loadSnapshotState`, `applyTemplateToRoom` to `wsDeps` + `index.ts` re-exports.
- **acceptance_criteria**:
  - Template figures land in **server** state (persist + late-join safe), not just a relay — closes the latent "`snapshot` has no `applyMutation` case" persistence gap for templates.
  - Orchestrator is unit-tested (pure); the DB read is the only integration edge.
- **verify**: `cd brett && npm test && npm run typecheck && npm run build`

---

### D8 — `/api/snapshots` `is_template` wiring (list + create)

- **target_files**: `brett/src/server/index.ts` (extract `buildSnapshotListQuery` + `parseSnapshotInsert`, use in GET/POST `/api/snapshots`)
- **failing test (red)**: `brett/test/snapshots-route.test.ts` imports the two pure helpers from `../src/server/index` and asserts:
  - `buildSnapshotListQuery({ isTemplate: true })` returns `{ sql, args }` whose SELECT lists `is_template`, whose WHERE filters `is_template = true`, and is a **valid standalone filter** (no `room`/`customer_id` required — today the route 400s without one, `index.ts:148-150`).
  - `buildSnapshotListQuery({ room:'r1' })` still filters `room_token`.
  - `parseSnapshotInsert({ name:'T', state:{ figures:[] }, is_template:true })` → `{ valid:true, values:{ …, is_template:true } }`; omitting `is_template` defaults to `false`; missing `name`/`state.figures` → `{ valid:false }`.
  Red because the helpers don't exist and the routes don't handle `is_template`.
- **implementation**: Extract `buildSnapshotListQuery({ room, customerId, isTemplate })` and `parseSnapshotInsert(body)` as pure exported functions; the GET route uses the former (SELECT adds `is_template`; allow `is_template=true` alone), the POST route uses the latter (INSERT adds `is_template`, default `false`).
- **acceptance_criteria**:
  - Lobby "Vorlage" dropdown can list curated templates via `GET /api/snapshots?is_template=true`.
  - Admins create a template via `POST /api/snapshots` with `is_template:true`; default stays non-template.
  - Helpers are pure/unit-tested; routes are thin wrappers (route/DB path is the integration edge per §5c).
- **verify**: `cd brett && npm test && npm run typecheck`

---

### D9 — Rollen/Teilnehmer: palette extension (>6) + `maxParticipants`

- **target_files**: `brett/src/server/rooms.ts` (new `colorForIndex`, use in `addParticipant`)
- **failing test (red)**: `brett/test/palette.test.ts`:
  - `colorForIndex(0..5)` equals `PARTICIPANT_PALETTE[0..5]` exactly.
  - `colorForIndex(6..11)` yields **distinct, non-recycled** colors (assert no value in indices 6-11 collides with indices 0-11 — i.e. no `% length` wrap).
  - `addParticipant` for 8 distinct users yields 8 distinct colors.
  - (Reaffirm D3) `applyMutation(room, { type:'lobby_settings_set', settings:{ maxParticipants:8 } })` → `buildStateFromMutations(room).lobbySettings.maxParticipants === 8`.
  Red because `colorForIndex` does not exist and `addParticipant` recycles via `% PARTICIPANT_PALETTE.length` (`rooms.ts:47`).
- **implementation**: `export function colorForIndex(i) { return i < PARTICIPANT_PALETTE.length ? PARTICIPANT_PALETTE[i] : 'hsl(' + ((i * 137.508) % 360) + ' 62% 58%)'; }` (golden-angle rotation past the 6 brand colors). `addParticipant` uses `colorForIndex(m.size)` instead of the modulo wrap.
- **acceptance_criteria**:
  - First 6 participants keep the curated brand palette; beyond 6 get distinct HSL-rotated colors (no recycling).
  - `maxParticipants` is persisted in `lobbySettings` (the cap is enforced at the presence/join site authored in Phase B; D supplies the value).
- **verify**: `cd brett && npm test`

---

### D10 — Coaching-Ablauf: lobby step builder + survives round-start

- **target_files**: **new** `brett/src/client/lobby-coaching.ts` (pure `buildCoachingStepsPayload`); `brett/src/client/ui/lobby.ts` (wire the editor to emit `admin_coaching_steps_set`)
- **failing test (red)**: `brett/test/coaching-lobby.test.ts`:
  - Pure client logic: `buildCoachingStepsPayload('Schritt A\nSchritt B\n\n  ')` → `{ steps:['Schritt A','Schritt B'], index:0 }` (trims, drops blank lines); empty input → `null` (no message sent).
  - Server substance (real handlers): `applyMutation(room, { type:'coaching_steps_set', steps:['A','B'], index:0 })`, then `applyMutation(room, { type:'session_phase_set', phase:'lobby' })`, then `transitionPhase(room, 'active')` → `buildStateFromMutations(room).coachingSteps` is intact and `sessionPhase === 'active'`.
  Red because `buildCoachingStepsPayload` does not exist (and confirms the `lobby→active` edge from Phase B preserves coaching steps).
- **implementation**: `lobby-coaching.ts` exports the pure builder (no three.js/DOM import). The lobby "Ablauf bearbeiten" UI uses it to emit `{ type:'admin_coaching_steps_set', steps, index }` (existing server path, `ws-handler.ts:281-285`). No new server mutation needed — the existing `__coaching_steps__` sentinel is untouched by `transitionPhase`.
- **acceptance_criteria**:
  - Steps built in the lobby become the active coaching steps after `admin_round_start` (lobby→active), index starts at 0.
  - Empty/whitespace-only editor sends nothing.
  - Pure builder is three.js/DOM-free → importable by `tsx --test`.
- **verify**: `cd brett && npm test`

---

### D11 — Client apply: optik on scene-mount + live `lobby_settings_change`

- **target_files**: **new** `brett/src/client/ui/optik-map.ts` (pure `optikToSceneParams`); `brett/src/client/scene.ts` or new `brett/src/client/ui/optik.ts` (`applyOptikToScene`); `brett/src/client/ws-client.ts` (new `lobby_settings_change` case + apply `state.optik` on snapshot/init)
- **failing test (red)**: `brett/test/optik-apply.test.ts` (pure client logic, no WebGL): imports `optikToSceneParams` and asserts:
  - `optikToSceneParams({ floor:'felt-green', sky:'dusk', lightMood:'warm' })` returns deterministic scene params (e.g. `{ floorColor, skyPreset:'dusk', lightColor, lightIntensity }`).
  - Undefined/partial input falls back to documented defaults (`sky:'day'`, `lightMood:'neutral'`).
  Red because `optikToSceneParams` does not exist.
- **implementation**:
  - `optik-map.ts`: pure `optikToSceneParams(optik: OptikSettings)` (three.js/DOM-free) mapping the three OptikSettings fields to concrete scene params.
  - `applyOptikToScene(optik, sceneRefs)` (in the three-aware module) consumes `optikToSceneParams` and mutates floor material/sky/light (`scene.ts` floor `:88-97`, sky `:25-41`, lights).
  - `ws-client.ts`: add `case 'lobby_settings_change':` → `if (msg.optik) applyOptikToScene(msg.optik); if (msg.templateId) updateLobbySettingsUI(msg.templateId);` (works in-board, not just lobby, §13). In the `snapshot`/`init` handler, if the incoming state carries `optik`, call `applyOptikToScene` on mount so late-joiners and reloads render the saved optik.
- **acceptance_criteria**:
  - Optik is applied (a) live on `lobby_settings_change{optik}` and (b) on scene mount from persisted state — closing the §4.1 dead seam end-to-end.
  - `templateId` change updates the lobby settings UI.
  - The pure mapper is unit-tested; the three.js apply is build/typecheck-verified.
- **verify**: `cd brett && npm test && npm run typecheck && npm run build`

---

### D12 — Phase-D green gate

- **target_files**: none (verification only)
- **failing test (red)**: n/a — this task asserts the whole phase is green together.
- **implementation**: Run the full Brett gate after D1–D11 land. Ensure no orphaned reference to the deleted `tests/unit/brett-optik-server.js` in any live runner; regenerate `docs/code-quality/repo-index.json` only if a code-quality gate requires it (out of D's hot path, note for the orchestrator).
- **acceptance_criteria**:
  - `npm test` green (incl. new `optik.test.ts`, `lobby-settings.test.ts`, `admin-set-optik.test.ts`, `admin-set-template.test.ts`, `template-seed.test.ts`, `template-apply.test.ts`, `snapshots-route.test.ts`, `palette.test.ts`, `coaching-lobby.test.ts`, `optik-apply.test.ts`, `snapshots-template-migration.test.ts`).
  - `npm run typecheck` clean (client + server projects).
  - `npm run build` succeeds (vite + `tsc -p tsconfig.server.json`).
  - The four settings are wired with substance: Vorlage (load+seed), Optik (persist+propagate+apply), Ablauf (lobby-built, active at start), Rollen/Teilnehmer (palette extension + maxParticipants).
- **verify**: `cd brett && npm test && npm run typecheck && npm run build`

---

**Grounding notes for the executor (absolute paths):**
- Repair seam: `/home/patrick/Projects/wt-brett-gruppen-lobby/brett/src/server/figures.ts` (broken `optik` case at lines 62-66; `applyMutation` switch has no `default` and no `snapshot` case — templates must seed via `applyTemplateToRoom`, not the relay).
- Sentinel emit: `/home/patrick/Projects/wt-brett-gruppen-lobby/brett/src/server/phases.ts` (`SPECIAL` array lines 29-34, emit block 43-53).
- Handler family precedent + `applyMutation` injection: `/home/patrick/Projects/wt-brett-gruppen-lobby/brett/src/server/sessions.ts` (`initSessions` line 15, `handleAdminRoundStop/Pause` lines 129/137).
- ADMIN switch + RELAY/ADMIN sets: `/home/patrick/Projects/wt-brett-gruppen-lobby/brett/src/server/ws-handler.ts` (RELAY 36-38, ADMIN 41-43, switch 220-287; `schedulePersist` precedent at 256/268/284).
- Routes + re-exports + wsDeps: `/home/patrick/Projects/wt-brett-gruppen-lobby/brett/src/server/index.ts` (snapshots routes 145-218, `wsDeps` 281-310, re-export block 342-391).
- Migration target: `/home/patrick/Projects/wt-brett-gruppen-lobby/k3d/website-schema.yaml` (`brett_snapshots` 603-615; idempotent `ADD COLUMN IF NOT EXISTS` precedent at 618).
- Reimpl to delete: `/home/patrick/Projects/wt-brett-gruppen-lobby/tests/unit/brett-optik-server.js` (standalone `node` script, not in any BATS runner).
- Client apply targets: `/home/patrick/Projects/wt-brett-gruppen-lobby/brett/src/client/ws-client.ts` (`onWsMessage` switch, `snapshot` 104-149, `default` 246) and `/home/patrick/Projects/wt-brett-gruppen-lobby/brett/src/client/scene.ts` (floor 88-97, sky 25-41).

### Definition of Done — Phase D

- `cd brett && npm test && npm run typecheck && npm run build` all green — incl. new `optik.test.ts`, `lobby-settings.test.ts`, `admin-set-optik.test.ts`, `admin-set-template.test.ts`, `template-seed.test.ts`, `template-apply.test.ts`, `snapshots-route.test.ts`, `palette.test.ts`, `coaching-lobby.test.ts`, `optik-apply.test.ts`, `snapshots-template-migration.test.ts`.
- The four settings are wired with **substance**: Vorlage (DB load + figure seed), Optik (persist + propagate + scene apply — §4.1 dead seam closed end-to-end), Ablauf (lobby-built, active at round-start), Rollen/Teilnehmer (palette extension >6 + `maxParticipants`).
- The `brett_snapshots.is_template` migration is additive + idempotent; no `tests/unit/brett-optik-server.js` reference remains in any live runner.
- All five new `admin_*` are in `ADMIN_TYPES` **with** a real switch case (blocker 2 complete: `admin_set_optik` D4, `admin_set_template` D5, the prior three from B8/B11/C5).

---

## Phase E — Rest-Facelift

> **Scope (spec §9, row E):** re-skin the remaining in-board chrome — appearance drawer, HUD lock badges, topbar buttons, persons panel, and the remaining floating panels — onto the mentolder design system. Phase A already re-skinned the **status pill** and **fig-panel** ("Status/fig-panel angeglichen") and ships `src/client/ui/theme.ts`, which injects the brand CSS custom properties at runtime. Phase E **consumes** those tokens — it does not define them.
>
> **Dependency:** Phase A only (earlier). No protocol/server contract from §1–§15 is touched. The token names used below match the existing SSOT `brett/public/assets/figure-pack/colors_and_type.css` (`--brass`, `--brass-soft/-deep`, `--slate-0..3`, `--parchment`, `--parchment-2/3`, `--font-sans/-serif/-mono`, `--radius-sm/-md/-lg/-pill`, `--shadow-1/-2`, `--hairline`, `--hairline-soft`) — these are what Phase A's `theme.ts` injects. Every reference uses `var(--token, <current-literal>)` form, so the skin **degrades to today's exact look** if a token is absent (zero visual regression) and upgrades automatically once `theme.ts` is present. If Phase A renamed any token, update the `var(--…, fallback)` name only and keep the literal fallback.
>
> **Two shared test files (created here, appended across tasks):** `brett/test/skin.test.ts` (pure unit tests for the canvas/SVG token-resolution helpers — canvas 2D and SVG `data:` URIs cannot use CSS `var()`, so those colors must be resolved in JS and are genuinely unit-testable) and `brett/test/facelift-tokens.test.ts` (a region-scoped guard that fails if a re-skinned CSS region still contains a **standalone** hex literal — hex is permitted **only** as the fallback argument of `var(--token, #hex)`).

---

### E1 — Token-resolution helper + token-driven HUD lock badge

**target_files**
- `brett/src/client/ui/skin.ts` (NEW — pure, **zero** `three`/DOM imports at module top-level so it loads under `tsx --test`)
- `brett/src/client/ui/hud.ts` (EDIT — `setFigureLockBadge`)
- `brett/test/skin.test.ts` (NEW)

**failing test first (red)** — `test/skin.test.ts` (`node --test` via tsx), importing `../src/client/ui/skin`:
- `resolveToken('--brass', '#c8a96e')` (no `getVar`) returns the fallback `'#c8a96e'`.
- `resolveToken('--brass', '#c8a96e', (n) => n === '--brass' ? ' #abcdef ' : '')` returns `'#abcdef'` (trimmed; injected resolver wins).
- `resolveToken('--brass', '#c8a96e', () => '')` returns the fallback (empty var → fallback).
- `lockBadgeStyle()` returns `{ bg, text, font }` where `bg === '#c8a96e'` (brass fallback, **not** the legacy `#4ea1ff`), `text === '#0e1014'` (slate-0 fallback, not legacy `#161b22`), and `font` contains `'bold 24px'` and a sans family token value (default `'system-ui'`).
- `lockBadgeStyle('#e06b6b').bg === '#e06b6b'` — an explicit lock/participant color passes through unchanged.
- `lockBadgeStyle(undefined, (n) => n === '--brass' ? '#112233' : '').bg === '#112233'` — resolver feeds the default bg.

Red because `skin.ts` does not exist and `hud.ts` hardcodes `#4ea1ff`/`#161b22`/`system-ui`.

**implementation**
- `skin.ts`:
  ```ts
  export type VarGetter = (name: string) => string;
  export function resolveToken(name: string, fallback: string, getVar?: VarGetter): string {
    if (!getVar) return fallback;
    const v = getVar(name)?.trim();
    return v || fallback;
  }
  export interface BadgeStyle { bg: string; text: string; font: string; }
  export function lockBadgeStyle(color?: string, getVar?: VarGetter): BadgeStyle {
    return {
      bg:   color || resolveToken('--brass', '#c8a96e', getVar),
      text: resolveToken('--slate-0', '#0e1014', getVar),
      font: `bold 24px ${resolveToken('--font-sans', 'system-ui, sans-serif', getVar)}`,
    };
  }
  ```
- `hud.ts`: add a browser resolver `const cssVar: VarGetter = (n) => getComputedStyle(document.documentElement).getPropertyValue(n);` and in `setFigureLockBadge` replace the literal `ctx.fillStyle = color || '#4ea1ff'`, the `ctx.font = 'bold 24px system-ui, sans-serif'`, and `ctx.fillStyle = '#161b22'` with values from `lockBadgeStyle(color, cssVar)`. No change to sprite geometry, lifecycle, or `lockSprites`/`activeLocks` handling.

**acceptance_criteria**
- `skin.ts` imports nothing from `three` or the DOM at module scope (verifiable by inspection / clean `tsx --test` load).
- Lock-badge bubble color = locker's participant color when present, else the brass token; badge text and font come from tokens.
- No behavior change to badge create/clear/`clearLockBadgesForUser`; `test/hud-model.test.ts` and all existing tests stay green.

**verify** — `cd brett && MOCK_DB=true npx tsx --test test/skin.test.ts` then `cd brett && npm test`

---

### E2 — Appearance drawer + appearance-button CSS → tokens

**target_files**
- `brett/public/index.html` (EDIT — the `#appearance-btn` rules and the entire `/* ── Appearance Drawer ── */` `<style>` region, lines ≈120–193: drawer shell, `.drawer-header/-section/-footer`, `.thumb-grid/.thumb-item`, `.acc-group*`, `.drawer-close/-cancel/-apply`)
- `brett/test/facelift-tokens.test.ts` (NEW — first guard case)

**failing test first (red)** — `test/facelift-tokens.test.ts` reads `public/index.html`, slices the CSS between the marker `/* ── Appearance Drawer` and `</style>`, strips every `var\([^)]*\)` expression, and asserts the remainder contains **no** `#[0-9a-fA-F]{3,8}` literal; additionally asserts the region references `var(--slate-1`, `var(--brass`, `var(--parchment`, and `var(--radius-`. Red because the region currently hardcodes `#161a22`, `#c8a96e`, `#0a0a14`, `#e7ead0`, etc.

**implementation** — replace standalone literals in the appearance-drawer + `#appearance-btn` rules with tokens (fallback = current literal), e.g.:
- panel/drawer bg `#161a22` → `var(--slate-1, #161922)`; raised/hover wash → `var(--slate-2, #1f2330)`.
- brass accents `#c8a96e` → `var(--brass, #c8a96e)`; brass borders/hover → `var(--brass-soft, #e0c690)` / `var(--brass, #c8a96e)`.
- text `#e7ead0` → `var(--parchment, #e7ead0)`; muted label greys → `var(--parchment-2/-3)`.
- apply-button fg `#0a0a14` → `var(--slate-0, #0e1014)`.
- radii `4/6/10px` → `var(--radius-sm/-md/-lg)`; drawer shadow → `var(--shadow-2)`; divider/hairlines → `var(--hairline-soft)`.
- Keep all geometry (widths, transitions, grid templates), the `.open` transform, and DOM ids/classes untouched — `appearance.ts` selectors must keep resolving.

**acceptance_criteria**
- Guard case green; appearance drawer + trigger button render in mentolder tokens; no `appearance.ts` selector breaks (drawer still opens/closes, thumbs still populate).
- Visual diff vs. main is a palette refinement only (no layout shift) given fallbacks equal current literals.

**verify** — `cd brett && MOCK_DB=true npx tsx --test test/facelift-tokens.test.ts`

---

### E3 — Appearance placeholder thumbnails (SVG `data:` URIs) → tokens via `skin.ts`

**target_files**
- `brett/src/client/ui/skin.ts` (EDIT — add `placeholderSvg`)
- `brett/src/client/ui/appearance.ts` (EDIT — `buildFaceGrid`, `buildBodyGrid`, `buildAccGrid` placeholder `data:` URIs)
- `brett/test/skin.test.ts` (EDIT — add cases)

**failing test first (red)** — append to `test/skin.test.ts`:
- `placeholderSvg('Keine', 'empty')` returns a string starting `data:image/svg+xml,` whose decoded body uses the muted slate bg + tertiary-text tokens' fallbacks (`#0e1014`/`#161922` family for the rect, `--parchment-3` `#7c8071` for the dash) and **does not** contain the legacy `#222`/`#666`.
- `placeholderSvg('adult-average', 'body')` decoded body uses `var`-resolved slate-1 bg (`#161922`, not `#1a1f2a`) and brass text (`#c8a96e`), and embeds the label text `adult-average` (HTML-escaped).
- A `getVar` stub injected as the optional 3rd arg overrides the resolved fills (proves token-driven, parallels E1).

Red because `placeholderSvg` does not exist and `appearance.ts` inlines `#1a1f2a`/`#c8a96e`/`#222`/`#666`.

**implementation**
- `skin.ts`: `export function placeholderSvg(label: string, variant: 'empty' | 'body', getVar?: VarGetter): string` — builds the same 56×56 SVG the current code emits, but fills come from `resolveToken` (`--slate-1`/`--parchment-3` for `empty`, `--slate-1`/`--brass` for `body`); returns `'data:image/svg+xml,' + encodeURIComponent(svg)`. Escape `label` for XML.
- `appearance.ts`: replace the three inline SVG `data:` URIs (the two `makeThumbItem('data:image/svg+xml,<svg…fill="%23222"…>', 'Keine', …)` null items and the body-grid SVG) with `placeholderSvg('Keine', 'empty', cssVar)` / `placeholderSvg(body, 'body', cssVar)`, reusing a `cssVar` resolver as in E1. No change to grid-building, click handlers, `syncDrawerToFig`, or `applyAppearanceToFig`.

**acceptance_criteria**
- `skin.ts` stays DOM/three-free at import; `appearance.ts` keeps all existing behavior (thumbs select/highlight, "Keine" clears).
- Placeholder thumbnails render in brand tokens; `test/appearance.test.ts` stays green.

**verify** — `cd brett && MOCK_DB=true npx tsx --test test/skin.test.ts` then `cd brett && npm run typecheck`

---

### E4 — Topbar chrome → tokens (preset/icon buttons, stiffness, online indicator)

**target_files**
- `brett/public/index.html` (EDIT — `#topbar`, `.preset-btn`, `.icon-btn`, `#stiffness`, the topbar `@media` block, and a NEW rule for `#online-indicator`)
- `brett/test/facelift-tokens.test.ts` (EDIT — add a topbar guard case)

**failing test first (red)** — append a case that slices the CSS between a NEW marker `/* ── Topbar chrome (Phase E) ──` and the next marker `/* ── Character-Editor Panel`, strips `var(…)`, and asserts no standalone hex remains and that `var(--brass`, `var(--parchment`, and `var(--slate` appear. Red because the topbar rules currently use `#c8a96e`, `rgba(231,234,208,…)`, `#0e1014` literals and the marker does not yet exist.

**implementation**
- Wrap the topbar button/slider rules in the new `/* ── Topbar chrome (Phase E) ── */` marker (do **not** move the Phase-A `#fig-panel`/`#status-pill` rules into it — keep them under the existing `/* ── Character-Editor Panel ── */` marker to avoid a Phase-A collision).
- Replace literals: button borders/hover washes → `var(--hairline-soft)` / `var(--slate-2)`; `accent-color:#c8a96e` → `var(--brass, #c8a96e)`; radii → `var(--radius-sm)`; text → `var(--parchment, #e7ead0)`.
- Add a `#online-indicator` rule (currently unstyled — inherits topbar): `font-size: var(--fs-small,13px); color: var(--parchment-2,#b9bda3);` with the `●` accented via `var(--brass)` if split into a child span (optional; keep markup change minimal).
- Leave topbar layout/geometry and the mobile `@media` dimensions intact (token-swap colors only).

**acceptance_criteria**
- Topbar guard case green; topbar buttons, stiffness slider accent, and online indicator render in tokens; no Phase-A region touched.

**verify** — `cd brett && MOCK_DB=true npx tsx --test test/facelift-tokens.test.ts`

---

### E5 — Persons panel + remaining floating panels → tokens (inline styles → tokenized classes)

**target_files**
- `brett/src/client/ui/persons.ts` (EDIT — `buildPersonsPanel` inline `cssText`)
- `brett/public/index.html` (EDIT — add `.person-btn`, `.coop-hud*`, `.session-toast` classes under a `/* ── Remaining panels (Phase E) ── */` marker; convert the `#coop-hud` inline-styled block and the `session_created` toast's `toast.style.cssText` to those classes)
- `brett/test/facelift-tokens.test.ts` (EDIT — add a remaining-panels guard case)

**failing test first (red)** — append a case that asserts: (a) the `/* ── Remaining panels (Phase E) ──` CSS region (after `var(…)` strip) contains no standalone hex and references `var(--slate`, `var(--brass`, `var(--parchment`; **and** (b) `src/client/ui/persons.ts` source contains no standalone structural hex literal in `buildPersonsPanel` (the only color allowed there is the **data-driven** `${p.color}` border-left, which is per-person data, not chrome). Red because `persons.ts` hardcodes nothing today but uses raw `cssText` structural styling, the coop-hud/toast blocks inline `#0a0a14`/`#4a7`/`#c9aa71`/`#161b22ee`/`#3fb950`/`#ffaa44`/`#58a6ff`, and the marker/classes don't exist.

**implementation**
- `persons.ts`: replace the static parts of `btn.style.cssText` with a `btn.className = 'fig-size-btn person-btn'` class; keep only the data-driven `btn.style.borderLeft = \`3px solid ${p.color}\``. Move avatar-img sizing into `.person-btn img`. (Keep `fig-size-btn` so it inherits the Phase-A swatch skin.)
- `index.html`: add `.person-btn`, `.coop-hud`, `.coop-hud .label`, `.coop-progress`, `.boss-hp`, `.session-toast` rules using tokens (`--slate-1/-0`, `--brass`, `--parchment`, `--radius-md`, `--shadow-2`, `--font-mono` for the CO-OP/code readouts). Replace the `#coop-hud` element's inline `style="…"` with `class="coop-hud"` (preserve `display:none` via the class default + the JS toggle), and rewrite the `session_created` handler's `toast.style.cssText`/inline child styles to `toast.className = 'session-toast'` + class rules. Keep semantic accent hues (success green, warn red for boss HP) as dedicated tokens or `var(--…, #literal)` so the guard's `var()`-fallback rule passes.

**acceptance_criteria**
- Remaining-panels guard case green; persons buttons, the (hidden) co-op HUD, and the session-created toast render via tokenized classes; `p.color` per-person accent preserved.
- `initPersons`/`buildPersonsPanel` behavior unchanged; `test/brand-persons.test.ts` stays green.

**verify** — `cd brett && MOCK_DB=true npx tsx --test test/facelift-tokens.test.ts` then `cd brett && npm test`

---

### E6 — Phase gate: typecheck + build (+ optional visual regression)

**target_files**
- none new (verification task); optional NEW `brett/test/visual/board-facelift.spec.ts` + Playwright config **only if** a Playwright harness is stood up.

**failing test first (red)** — run the full suite and the type/build gates *before* claiming Phase E done; they are the red→green signal for the phase. (The behavioral red-first work lives in E1–E5.) If the optional visual harness is added, a first screenshot run with no committed baseline fails ("missing baseline") until the baseline is generated and reviewed.

**implementation / steps**
- Run `cd brett && npm test` — all `node --test` suites green, including the new `skin.test.ts` and `facelift-tokens.test.ts`.
- Run `cd brett && npm run typecheck` — `tsc --noEmit` on client+server clean (the new `skin.ts` and the `hud.ts`/`appearance.ts`/`persons.ts` edits type-check).
- Run `cd brett && npm run build` — `vite build && tsc -p tsconfig.server.json` succeeds (no broken imports of `skin.ts`).
- **Optional visual regression** (spec §9 "optional visuelle Regression"): if/when a Playwright harness exists for brett, add `test/visual/board-facelift.spec.ts` that loads the board with `?room=…`, opens the appearance drawer, triggers a figure lock to render a badge, and `toHaveScreenshot()`-compares the topbar + drawer + badge against a committed baseline. There is **no** Playwright config in `brett/` today (suite is `node --test`); treat this as additive and do not block the merge on it. Fallback: a manual screenshot via the `run` skill against `npm run dev`, attached to the PR.

**acceptance_criteria**
- `npm test`, `npm run typecheck`, and `npm run build` all green (the mandatory Phase-E gates per §9: "Typecheck, optional visuelle Regression").
- No regression in existing suites (`hud-model`, `appearance`, `brand-persons`, message/exhaustiveness, etc.).
- Every re-skinned region (E2/E4/E5 guard regions) and the canvas/SVG helpers (E1/E3) are token-driven; zero standalone brand-hex literals remain in the re-skinned chrome except as `var(--token, #hex)` fallbacks.
- If the optional visual baseline was generated, it is reviewed and committed; otherwise a before/after screenshot is attached to the PR.

**verify** — `cd brett && npm test && npm run typecheck && npm run build` (optional: `cd brett && npx playwright test test/visual/board-facelift.spec.ts` if the harness exists)

---

**Phase E grounding notes (for the executor)**
- `brett/src/client/ui/hud.ts:18,28,29` hold the lock-badge literals (`#4ea1ff`, `bold 24px system-ui…`, `#161b22`) replaced in E1; `hud.ts:4` (`document.getElementById('status-pill')!` at module scope) is why the badge helper must live in DOM-free `skin.ts`, not in `hud.ts`, to be unit-testable.
- `brett/src/client/ui/appearance.ts:128,151,168` hold the SVG placeholder literals (`%23222`/`%23666`, `#1a1f2a`/`#c8a96e`) replaced in E3; `appearance.ts:76` (`getElementById('appearance-drawer')!` at module scope) is the same reason the SVG builder goes in `skin.ts`.
- `brett/public/index.html:120–193` = appearance-drawer CSS (E2); `:11–29` + topbar `@media` = topbar chrome (E4); `:286–304` (coop-hud) + `:325–328` (session toast) = remaining panels (E5).
- The Phase-A boundary: do **not** edit the `#status-pill` (`index.html:24–28`) or `#fig-panel*` (`index.html:31–103`) rules — those are Phase A's deliverable; Phase E only adds the new region markers around the topbar/remaining-panel rules.

### Definition of Done — Phase E

- `cd brett && npm test && npm run typecheck && npm run build` all green — incl. new `skin.test.ts` and `facelift-tokens.test.ts`; no regression in `hud-model`/`appearance`/`brand-persons`/message-exhaustiveness suites.
- Every re-skinned region (appearance drawer E2, topbar E4, remaining panels E5) and the canvas/SVG helpers (E1/E3) are token-driven; zero standalone brand-hex literals remain except as `var(--token, #hex)` fallbacks.
- Phase-A regions (`#status-pill`, `#fig-panel*`) untouched; no server/protocol contract touched.
- Optional visual baseline reviewed + committed, or a before/after screenshot attached to the PR (per spec §9 "optional visuelle Regression").

---

## Affected-files coverage (spec §12)

Every file in the spec's §12 orientation list is covered by at least one task above:

| §12 file | Task(s) |
|---|---|
| `src/types/state.ts` (Phase/Participant/Figure/Role/Optik/Lobby) | B1 (Phase/Role/settings/Participant), C1 (`Figure.ownerId`) |
| `src/types/messages.ts` (new variants, optik removal, drift-fix) | B2 (drift + new + handoff field), C2 (`admin_assign_figure`/`figure_owner_changed`), D2 (`optik` variant removal — via the §13 B/D overlap note) |
| `src/server/phases.ts` (lobby, per-edge allowlist, sentinels, sessionPhase) | B3 (sentinels), B4 (sessionPhase seed), B5 (lobby + allowlist), D3 (`lobbySettings` emit) |
| `src/server/figures.ts` (optik fix, ownerId strip, sentinels, seed) | B3 (sentinels), B4 (`seedFigureMapFromState`), C1 (`ownerId` strip + `figure_owner_set`), C6 (`orphanFiguresForUser`), D2 (`optik_set`), D3 (`lobby_settings_set` merge), D6 (`seedFiguresFromTemplate`), D7 (`applyTemplateToRoom`) |
| `src/server/permissions.ts` (NEW, `canMutate`) | C3 |
| `src/server/ws-handler.ts` (gate, ADMIN_TYPES+cases, late-join, presence, grace, session-flag, identity, jump, sessionPhase) | B4, B7, B8, B10, B11, B12, B13, B14, C4, C5, C6, D4, D5, D7 |
| `src/server/sessions.ts` (create→lobby, reconnect rebuild, idle exempt, grace) | B6 (idle exempt), B7 (create→lobby), B8 (`handleAdminRoundStart`), B9 (`shouldRejectReconnect`), B14 (grace), D4/D5 (optik/template handlers) |
| `src/server/index.ts` (verifyClient playerId, snapshot routes is_template) | B4/B8/B9/B10/B11/B14 (wsDeps + re-exports), B9 (`verifyClient`), C3/C4/C5/C6 (permissions wiring), C7 (`/auth/e2e-login`), D4/D5/D7 (re-exports), D8 (`is_template` routes) |
| `src/server/rooms.ts` (palette extension, role/ready, canonical key) | D9 (palette + maxParticipants); role/ready/key flow through `__roles__` (B3) + `resolvePlayerId` (B10/C4) |
| `src/client/app-shell.ts` (NEW, view-machine) | A2 (scaffold), B16 (lobby view) |
| `src/client/main.ts` (lazy scene bootstrap) | A5 |
| `src/client/ws-client.ts` (router cases, &playerId= URL) | B9 (`&playerId=`), B15 (router cases), D11 (`lobby_settings_change` apply) |
| `src/client/ui/theme.ts` + primitives (NEW, design system) | A1 (theme), A3 (primitives) |
| `src/client/ui/menu.ts`, `src/client/ui/lobby.ts` (NEW, screens) | A4 (menu), B16 (lobby), D10 (lobby coaching editor) |
| `test/messages.test.ts` (exhaustiveness 3 sites) | B2, C2 |
| `test/session-state.test.ts` (create→lobby) | B5, B7 |
| `test/reconnect-guard.test.ts` (late-join inverted) | B9 |
| `test/optik.test.ts` (NEW, replaces reimpl) | D2 |
| DB: `brett_snapshots` migration (`is_template`) | D1 |

---

## Phase summary

| Phase | Tasks | Delivers (mergeable) |
|---|---|---|
| **A** | A1–A7 (7) | Design tokens + primitives + Hauptmenü + view-machine scaffold (lazy scene) + status/fig-panel re-skin |
| **B** | B1–B16 (16) | `lobby` phase + per-edge allowlist + idle-exempt + Late-Join rebuild + lobby screen + live roster + role assignment + client-router cases + drift-fixes §4.2/§4.3/§4.6 + leader-grace + session-sync hardening |
| **C** | C1–C7 (7) | `ownerId` (server-authoritative) + `canMutate` chokepoint (fail-closed) + `jump`→RELAY_TYPES + figure assignment + session-authoritative identity + owner-orphan handling + E2E observer-gate |
| **D** | D1–D12 (12) | The four settings with substance (Vorlage/Optik/Ablauf/Rollen) + §4.1 optik-seam repair + optik propagation + `is_template` migration |
| **E** | E1–E6 (6) | Rest-facelift (appearance drawer, HUD badges, topbar, persons + remaining panels) onto mentolder tokens |

**Total: 48 tasks.** All six review blockers covered (table above); no blocker required a net-new task.
