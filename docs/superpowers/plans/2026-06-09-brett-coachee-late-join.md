---
title: Brett — Coachee Late-Join Implementation Plan
ticket_id: T000555
domains: [website, test]
status: active
pr_number: null
---

# Brett — Coachee Late-Join Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add UI to the Brett 3D board so the host can keep sharing the invite link after starting, a coachee can late-join mid-session, the leader gets notified on join, and the leader can assign roles from a participants panel — all client-only, no server/protocol changes.

**Architecture:** Three new client UI modules under `brett/src/client/ui/` (invite button, participants panel, late-join toast), plus a new `setLateJoinHandler` hook in `ws-client.ts` and wiring in `board-boot.ts`, plus two slot `<div>`s in `index.html`. Each module follows the codebase convention (see `ui/lobby.ts`): a **pure, node-testable builder** function for view-model/derivation logic, and a **thin DOM mount** that consumes it. Tests target the pure builders and use lightweight injected DOM/clipboard stubs — the project has **no jsdom** and all tests must be offline-safe (`node:test` + `tsx`).

**Tech Stack:** TypeScript, vanilla DOM (no framework), Three.js board (untouched), `node:test` + `tsx` test runner (`MOCK_DB=true tsx --test test/*.test.ts`), CSS custom properties (`--brett-*` tokens).

---

## Background & Key Constraints (read before starting)

These are load-bearing facts discovered from the codebase. Violating them breaks tests or runtime.

1. **No jsdom.** `brett/package.json` test script is `MOCK_DB=true tsx --test test/*.test.ts test/*.test.js test/*.test.mjs`. There is no `document` global under node. Existing UI tests (e.g. `test/lobby-render.test.ts`, `test/timeline.test.ts`) only exercise **pure logic** (`buildLobbyViewModel`, mock controllers) and never touch a real DOM. **Follow this pattern:** put all branchy logic in pure exported functions; keep `document.*` calls inside a `mount*` function that is NOT unit-tested directly. Where a test must verify a DOM-ish side effect (clipboard write, toast count), inject a **minimal hand-rolled stub** through a function parameter — never import jsdom.

2. **Lobby/roster types** (`brett/src/client/lobby-store.ts`):
   - `LobbyState = { roster: Record<string, RosterEntry>; phase: Phase | null; sessionCode: string | null; settings; adminTokenHolder; coachingSteps }`
   - `RosterEntry` fields used here: `{ userId: string; name: string; color: string; role?: Role; ready?: boolean }`
   - `Role = 'leiter' | 'stellvertreter' | 'beobachter'` (`brett/src/types/state.ts:7`)
   - `Phase = 'lobby' | 'warmup' | 'active' | 'paused' | 'ended'` (`brett/src/types/state.ts:5`)

3. **`admin_assign_role` message already exists** in the protocol: `{ type: 'admin_assign_role'; targetPlayerId: string; role: Role }` (`brett/src/types/messages.ts:26`). The participants panel sends this via `wsClient.sendClient(msg)`. No new message types.

4. **`presence_join` message:** `{ type: 'presence_join'; participant: Participant }` where `Participant = { userId; name; color; isAdmin?; role?; ready? }` (`brett/src/types/state.ts:77`, `brett/src/types/messages.ts:62`). The participant **name** is at `msg.participant.name`.

5. **Phase tracking lives in `lobbyState.phase`** inside `ws-client.ts` (module-level `let lobbyState`). The late-join hook reads `lobbyState.phase` — there is no separate `currentPhase` variable. The spec's pseudo-code `currentPhase` maps to `lobbyState.phase`. The `presence_join` case is handled in `onWsMessage` at `ws-client.ts:468-478` (shared `case 'presence_join': case 'presence_leave': …`). **Crucially:** the reducer runs first and updates `lobbyState`, so the late-join hook must read the phase that was current *before* this join was applied to decide "mid-session" — but phase is not changed by `presence_join` (only by `session_phase_change`), so reading `lobbyState.phase` after the reducer is equivalent. Fire the hook only when phase is `'active'`, `'warmup'`, or `'paused'` (i.e. NOT `'lobby'` and NOT `null`).

6. **`board-boot.ts` topbar element:** the topbar is `<div id="topbar">` in `brett/public/index.html:297`. The two new slot divs (`#topbar-invite-slot`, `#topbar-participants-slot`) go inside it. `board-boot.ts` queries them by id and passes them to the mount functions. The leader's own role is read via `wsClient.getLobbyState()?.roster?.[currentUser.userId]?.role` (same pattern used at `board-boot.ts:204` and `:493`).

7. **`wsClient` is imported as `import * as wsClient from './ws-client'`** in `board-boot.ts:18`. New exports (`setLateJoinHandler`) are reachable as `wsClient.setLateJoinHandler`.

8. **Invite URL format** (spec §`buildInviteUrl`): `${window.location.origin}/api/join?code=${encodeURIComponent(code)}`. This matches the existing session-toast link in `index.html:437` (`/api/join?code=...`). `buildInviteUrl` must be a **pure exported function** so it is unit-testable without `window` — accept `origin` as a parameter (default `window.location.origin` inside the DOM mount, but the pure function takes it explicitly).

9. **Styling:** use `--brett-*` CSS custom properties (see `ui/lobby.ts` `lobbyCss()` for the token names: `--brett-fg`, `--brett-brass`, `--brett-brass-dim`, `--brett-ink-850`, `--brett-line`, `--brett-font-sans`, `--brett-font-mono`, `--brett-radius-sm`). Each module injects an idempotent id-guarded `<style>` tag (same pattern as `injectLobbyStyles`). No hardcoded brand hex.

10. **Commit discipline:** small commits per task. Branch is `feature/brett-coachee-late-join` (already checked out in this worktree). Do NOT push or open a PR — that is the executor's/finishing skill's job.

---

## File Structure

**Create:**
- `brett/src/client/ui/topbar-invite.ts` — pure `buildInviteUrl(origin, code)` + `mountInviteButton(anchorEl, getSessionCode)` DOM mount (button, clipboard, popup).
- `brett/src/client/ui/topbar-participants.ts` — pure `buildParticipantRows(state)` + `mountParticipantsButton(anchorEl, deps)` returning `{ update }`.
- `brett/src/client/ui/late-join-toast.ts` — `showLateJoinToast(name, opts?)` toast renderer (stacking + auto-dismiss).
- `brett/test/topbar-invite.test.ts`
- `brett/test/topbar-participants.test.ts`
- `brett/test/late-join-toast.test.ts`

**Modify:**
- `brett/src/client/ws-client.ts` — add `lateJoinHandler` + `setLateJoinHandler` + fire-on-`presence_join` logic.
- `brett/src/client/board-boot.ts` — mount the three modules, register the late-join hook, extend the lobby-change handler to call `participantsPanel.update()`.
- `brett/public/index.html` — two new slot `<div>`s inside `#topbar`.
- `brett/test/ws-client-late-join.test.ts` *(new test file for the ws-client hook — created in Task 4)*.

---

## Task 1: `ws-client.ts` — `setLateJoinHandler` hook

**Files:**
- Modify: `brett/src/client/ws-client.ts` (add handler near the other injected handlers ~line 74-78; fire in the `presence_join` case ~line 468-478)
- Test: `brett/test/ws-client-late-join.test.ts` (create)

The late-join detection is pure decision logic: *"given the current phase and an incoming participant name, should we notify, and with what name?"* Extract that into a pure exported function so it is testable without a WebSocket.

- [ ] **Step 1: Write the failing test**

Create `brett/test/ws-client-late-join.test.ts`:

```typescript
// brett/test/ws-client-late-join.test.ts
// Offline-safe: tests the pure late-join decision helper, no WS, no DOM.
import { test } from 'node:test';
import assert from 'node:assert';
import { decideLateJoin } from '../src/client/ws-client';

test('decideLateJoin: fires with name when phase is active', () => {
  assert.deepStrictEqual(decideLateJoin('active', { name: 'Carla' } as any), { notify: true, name: 'Carla' });
});

test('decideLateJoin: fires when phase is warmup or paused', () => {
  assert.strictEqual(decideLateJoin('warmup', { name: 'X' } as any).notify, true);
  assert.strictEqual(decideLateJoin('paused', { name: 'Y' } as any).notify, true);
});

test('decideLateJoin: does NOT fire in lobby phase', () => {
  assert.deepStrictEqual(decideLateJoin('lobby', { name: 'Z' } as any), { notify: false, name: 'Z' });
});

test('decideLateJoin: does NOT fire when phase is null', () => {
  assert.strictEqual(decideLateJoin(null, { name: 'Z' } as any).notify, false);
});

test('decideLateJoin: does NOT fire when phase is ended', () => {
  assert.strictEqual(decideLateJoin('ended', { name: 'Z' } as any).notify, false);
});

test('decideLateJoin: falls back to "Unbekannt" when participant has no name', () => {
  const r = decideLateJoin('active', undefined as any);
  assert.deepStrictEqual(r, { notify: true, name: 'Unbekannt' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd brett && MOCK_DB=true npx tsx --test test/ws-client-late-join.test.ts`
Expected: FAIL — `decideLateJoin` is not exported / not defined.

- [ ] **Step 3: Add the pure helper + handler plumbing**

In `brett/src/client/ws-client.ts`, after the `onLobbyChange` handler block (after line 78), add:

```typescript
// ── T000XXX: Late-join notification hook ──────────────────────────────────────
// Fired when a participant joins AFTER the round has started (not in lobby).
// board-boot wires this to show a toast (leader only) + refresh the participants
// panel. Pure decision logic lives in decideLateJoin() so it is node-testable.
import type { Participant } from '../types/state';

export function decideLateJoin(
  phase: Phase | null,
  participant: Participant | undefined,
): { notify: boolean; name: string } {
  const name = participant?.name ?? 'Unbekannt';
  const inSession = phase === 'active' || phase === 'warmup' || phase === 'paused';
  return { notify: inSession, name };
}

let lateJoinHandler: ((name: string) => void) | null = null;
export function setLateJoinHandler(cb: ((name: string) => void) | null): void {
  lateJoinHandler = cb;
}
```

Note: `Phase` is already imported at the top (`import type { Phase } from '../types/state';`, line 4). Add `Participant` to that same import line instead of a duplicate import if the linter complains:

```typescript
import type { Phase } from '../types/state';
import type { Participant } from '../types/state';
```
(Both forms are valid; keep one import per line to match file style.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd brett && MOCK_DB=true npx tsx --test test/ws-client-late-join.test.ts`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Fire the hook in the `presence_join` case**

In `onWsMessage`, the `presence_join` variant is currently folded into a shared `case` block (lines 468-478). Split `presence_join` out so it can fire the late-join hook **after** the reducer/`onLobbyChange`, using the phase that the reducer left in place (`presence_join` does not change phase, so reading post-reducer phase is correct).

Replace:

```typescript
    case 'presence_join':
    case 'presence_leave':
    case 'role_changed':
    case 'lobby_ready_changed':
    case 'session_created': {
      const prevPhase = lobbyState.phase;
      lobbyState = applyLobbyServerMessage(lobbyState, msg);
      onLobbyChange(lobbyState);
      if (lobbyState.phase !== prevPhase) onPhaseChange(lobbyState.phase);
      break;
    }
```

with:

```typescript
    case 'presence_join': {
      const prevPhase = lobbyState.phase;
      lobbyState = applyLobbyServerMessage(lobbyState, msg);
      onLobbyChange(lobbyState);
      if (lobbyState.phase !== prevPhase) onPhaseChange(lobbyState.phase);
      // Late-join: notify when someone joins mid-session (not in lobby).
      const decision = decideLateJoin(lobbyState.phase, msg.participant);
      if (decision.notify) lateJoinHandler?.(decision.name);
      break;
    }

    case 'presence_leave':
    case 'role_changed':
    case 'lobby_ready_changed':
    case 'session_created': {
      const prevPhase = lobbyState.phase;
      lobbyState = applyLobbyServerMessage(lobbyState, msg);
      onLobbyChange(lobbyState);
      if (lobbyState.phase !== prevPhase) onPhaseChange(lobbyState.phase);
      break;
    }
```

- [ ] **Step 6: Run the full brett test suite to confirm no regression**

Run: `cd brett && npm test`
Expected: PASS — existing suite green (especially `presence-lobby.test.ts`, `lobby-store.test.ts`) plus the new file.

- [ ] **Step 7: Typecheck**

Run: `cd brett && npx tsc -p tsconfig.client.json --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add brett/src/client/ws-client.ts brett/test/ws-client-late-join.test.ts
git commit -m "feat(brett): add setLateJoinHandler hook for mid-session joins"
```

---

## Task 2: `topbar-invite.ts` — invite button + popup + clipboard

**Files:**
- Create: `brett/src/client/ui/topbar-invite.ts`
- Test: `brett/test/topbar-invite.test.ts`

The branchy logic is: (a) building the invite URL, and (b) deciding whether the button is visible (sessionCode present or not). Both go into pure exported functions. The popup/clipboard DOM behavior lives in `mountInviteButton`; clipboard is injected so a test can assert it was called with the right URL.

- [ ] **Step 1: Write the failing test**

Create `brett/test/topbar-invite.test.ts`:

```typescript
// brett/test/topbar-invite.test.ts
// Offline-safe: tests the pure URL builder + visibility predicate. No jsdom.
import { test } from 'node:test';
import assert from 'node:assert';
import { buildInviteUrl, inviteButtonVisible } from '../src/client/ui/topbar-invite';

test('buildInviteUrl: builds an encoded /api/join URL from origin + code', () => {
  assert.strictEqual(
    buildInviteUrl('https://brett.example.com', 'KRB-9A2'),
    'https://brett.example.com/api/join?code=KRB-9A2',
  );
});

test('buildInviteUrl: percent-encodes codes with special characters', () => {
  assert.strictEqual(
    buildInviteUrl('https://x.test', 'A B+C'),
    'https://x.test/api/join?code=A%20B%2BC',
  );
});

test('inviteButtonVisible: true only when a non-empty session code exists', () => {
  assert.strictEqual(inviteButtonVisible('KRB-9A2'), true);
  assert.strictEqual(inviteButtonVisible(null), false);
  assert.strictEqual(inviteButtonVisible(''), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd brett && MOCK_DB=true npx tsx --test test/topbar-invite.test.ts`
Expected: FAIL — module / exports not found.

- [ ] **Step 3: Write the module (pure helpers + DOM mount)**

Create `brett/src/client/ui/topbar-invite.ts`:

```typescript
// brett/src/client/ui/topbar-invite.ts
// "Einladen" button in the board topbar. Visible only while a session code
// exists. Click copies the invite link immediately and opens a popup showing
// the full link with a "Kopiert ✓" confirmation. Pure helpers (buildInviteUrl,
// inviteButtonVisible) are node-testable; DOM lives in mountInviteButton.

/** Pure: build the shareable join URL. `origin` is passed explicitly so this is
 * testable without `window`. */
export function buildInviteUrl(origin: string, code: string): string {
  return `${origin}/api/join?code=${encodeURIComponent(code)}`;
}

/** Pure: the button is only meaningful when a non-empty session code exists. */
export function inviteButtonVisible(code: string | null | undefined): boolean {
  return typeof code === 'string' && code.length > 0;
}

const INVITE_STYLE_ID = 'brett-topbar-invite';

function injectStyles(doc: Document = document): void {
  if (doc.getElementById(INVITE_STYLE_ID)) return;
  const el = doc.createElement('style');
  el.id = INVITE_STYLE_ID;
  el.textContent = [
    '.brett-invite-btn{font-family:var(--brett-font-sans,sans-serif);font-size:12px;',
    'background:var(--brett-brass,#c8a96e);color:var(--brett-ink-900,#0b111c);border:none;',
    'border-radius:var(--brett-radius-sm,8px);padding:6px 12px;cursor:pointer;font-weight:600;}',
    '.brett-invite-wrap{position:relative;display:inline-block;}',
    '.brett-invite-popup{position:absolute;top:calc(100% + 6px);right:0;z-index:60;',
    'background:var(--brett-ink-850,#101824);border:1px solid var(--brett-line,rgba(255,255,255,0.12));',
    'border-radius:var(--brett-radius-sm,8px);padding:10px 12px;min-width:240px;',
    'font-family:var(--brett-font-mono,monospace);font-size:11px;color:var(--brett-fg,#e7ead0);}',
    '.brett-invite-popup__link{user-select:all;word-break:break-all;color:var(--brett-brass,#c8a96e);}',
    '.brett-invite-popup__status{margin-top:6px;color:var(--brett-fg-soft,#aab);}',
  ].join('');
  doc.head.appendChild(el);
}

export interface InviteMountOptions {
  /** Injected for tests; defaults to the real clipboard. */
  writeClipboard?: (text: string) => Promise<void> | void;
  /** Injected for tests; defaults to window.location.origin. */
  getOrigin?: () => string;
}

/**
 * Mount the "Einladen" button into `anchorEl`. The button auto-shows/hides based
 * on `getSessionCode()` — call the returned `refresh()` whenever the session code
 * may have changed (board-boot wires this to lobbyChange). Returns a cleanup fn.
 */
export function mountInviteButton(
  anchorEl: HTMLElement,
  getSessionCode: () => string | null,
  opts: InviteMountOptions = {},
): { refresh: () => void; destroy: () => void } {
  injectStyles();
  const writeClipboard = opts.writeClipboard
    ?? ((t: string) => navigator.clipboard?.writeText(t));
  const getOrigin = opts.getOrigin ?? (() => window.location.origin);

  const wrap = document.createElement('div');
  wrap.className = 'brett-invite-wrap';
  const btn = document.createElement('button');
  btn.className = 'brett-invite-btn';
  btn.type = 'button';
  btn.textContent = '🔗 Einladen';
  btn.setAttribute('aria-haspopup', 'true');
  wrap.appendChild(btn);
  anchorEl.appendChild(wrap);

  let popup: HTMLDivElement | null = null;
  let statusTimer: ReturnType<typeof setTimeout> | null = null;

  function closePopup(): void {
    if (popup) { popup.remove(); popup = null; }
    document.removeEventListener('click', onOutside, true);
  }

  function onOutside(e: MouseEvent): void {
    if (popup && !wrap.contains(e.target as Node)) closePopup();
  }

  function openPopup(url: string): void {
    closePopup();
    popup = document.createElement('div');
    popup.className = 'brett-invite-popup';
    const link = document.createElement('div');
    link.className = 'brett-invite-popup__link';
    link.textContent = url;
    const status = document.createElement('div');
    status.className = 'brett-invite-popup__status';
    status.textContent = 'Kopiert ✓';
    popup.append(link, status);
    wrap.appendChild(popup);
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { status.textContent = 'Link zum Teilen'; }, 2000);
    // Defer the outside-click listener so the click that opened the popup
    // doesn't immediately close it.
    setTimeout(() => document.addEventListener('click', onOutside, true), 0);
  }

  btn.addEventListener('click', () => {
    const code = getSessionCode();
    if (!inviteButtonVisible(code)) return;
    const url = buildInviteUrl(getOrigin(), code!);
    try { void writeClipboard(url); } catch { /* clipboard blocked — popup still shows the link */ }
    openPopup(url);
  });

  function refresh(): void {
    wrap.style.display = inviteButtonVisible(getSessionCode()) ? 'inline-block' : 'none';
    if (!inviteButtonVisible(getSessionCode())) closePopup();
  }

  refresh();

  return {
    refresh,
    destroy() {
      if (statusTimer) clearTimeout(statusTimer);
      closePopup();
      wrap.remove();
    },
  };
}
```

Note: the spec's signature is `mountInviteButton(anchorEl, getSessionCode): void`. We return `{ refresh, destroy }` instead of `void` so board-boot can re-evaluate visibility when the session code arrives asynchronously (the snapshot/`session_created` may land after mount). This is a superset of the spec contract and breaks nothing.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd brett && MOCK_DB=true npx tsx --test test/topbar-invite.test.ts`
Expected: PASS — 3 tests green.

- [ ] **Step 5: Typecheck**

Run: `cd brett && npx tsc -p tsconfig.client.json --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add brett/src/client/ui/topbar-invite.ts brett/test/topbar-invite.test.ts
git commit -m "feat(brett): add topbar invite button with link popup + clipboard"
```

---

## Task 3: `late-join-toast.ts` — stacking auto-dismiss toast

**Files:**
- Create: `brett/src/client/ui/late-join-toast.ts`
- Test: `brett/test/late-join-toast.test.ts`

The testable surface: the toast **text** for a given name, and the **container management** (stacking N toasts, dismissing after the timeout). DOM is injected via a tiny stub so we can assert without jsdom.

- [ ] **Step 1: Write the failing test**

Create `brett/test/late-join-toast.test.ts`:

```typescript
// brett/test/late-join-toast.test.ts
// Offline-safe: tests pure text + container stacking via a minimal DOM stub.
import { test } from 'node:test';
import assert from 'node:assert';
import { lateJoinToastText, showLateJoinToast } from '../src/client/ui/late-join-toast';

test('lateJoinToastText: formats the join message', () => {
  assert.strictEqual(lateJoinToastText('Carla'), 'Carla ist beigetreten');
});

// Minimal DOM stub: just enough surface for the toast container logic.
function makeStubEl() {
  const el: any = {
    children: [] as any[],
    style: {},
    className: '',
    textContent: '',
    appendChild(c: any) { this.children.push(c); c.parentNode = this; return c; },
    remove() {
      if (this.parentNode) {
        const i = this.parentNode.children.indexOf(this);
        if (i >= 0) this.parentNode.children.splice(i, 1);
      }
    },
  };
  return el;
}

test('showLateJoinToast: appends a toast carrying the name; multiple stack', () => {
  const host = makeStubEl();
  let timers = 0;
  const stub = {
    createEl: () => makeStubEl(),
    container: host,
    setTimeout: (_fn: () => void, _ms: number) => { timers++; return 0 as any; },
  };
  showLateJoinToast('Anna', stub as any);
  showLateJoinToast('Ben', stub as any);
  assert.strictEqual(host.children.length, 2, 'two toasts stack in the container');
  assert.strictEqual(host.children[0].textContent, 'Anna ist beigetreten');
  assert.strictEqual(host.children[1].textContent, 'Ben ist beigetreten');
  assert.strictEqual(timers, 2, 'each toast schedules its own auto-dismiss');
});

test('showLateJoinToast: auto-dismiss removes the toast when the timer fires', () => {
  const host = makeStubEl();
  let fire: (() => void) | null = null;
  const stub = {
    createEl: () => makeStubEl(),
    container: host,
    setTimeout: (fn: () => void, _ms: number) => { fire = fn; return 0 as any; },
  };
  showLateJoinToast('Cem', stub as any);
  assert.strictEqual(host.children.length, 1);
  fire!();
  assert.strictEqual(host.children.length, 0, 'toast removed after timeout fires');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd brett && MOCK_DB=true npx tsx --test test/late-join-toast.test.ts`
Expected: FAIL — module / exports not found.

- [ ] **Step 3: Write the module**

Create `brett/src/client/ui/late-join-toast.ts`:

```typescript
// brett/src/client/ui/late-join-toast.ts
// Top-right toast shown to the leader when someone late-joins. Auto-dismisses
// after 3s; multiple toasts stack. Pure text in lateJoinToastText(); the DOM
// surface is injected (LateJoinToastDeps) so it is testable without jsdom.

/** Pure: the toast body text for a given participant name. */
export function lateJoinToastText(name: string): string {
  return `${name} ist beigetreten`;
}

const TOAST_STYLE_ID = 'brett-late-join-toast';
const TOAST_CONTAINER_ID = 'brett-late-join-toasts';
const DISMISS_MS = 3000;

function injectStyles(doc: Document = document): void {
  if (doc.getElementById(TOAST_STYLE_ID)) return;
  const el = doc.createElement('style');
  el.id = TOAST_STYLE_ID;
  el.textContent = [
    `#${TOAST_CONTAINER_ID}{position:fixed;top:56px;right:16px;z-index:80;`,
    'display:flex;flex-direction:column;gap:8px;pointer-events:none;}',
    '.brett-late-join-toast{font-family:var(--brett-font-sans,sans-serif);font-size:13px;',
    'background:var(--brett-ink-850,#101824);color:var(--brett-fg,#e7ead0);',
    'border:1px solid var(--brett-brass-dim,rgba(200,169,110,0.3));',
    'border-left:3px solid var(--brett-brass,#c8a96e);',
    'border-radius:var(--brett-radius-sm,8px);padding:10px 14px;',
    'box-shadow:0 4px 16px rgba(0,0,0,0.4);animation:brett-toast-in 0.2s ease-out;}',
    '@keyframes brett-toast-in{from{opacity:0;transform:translateX(20px);}to{opacity:1;transform:none;}}',
  ].join('');
  doc.head.appendChild(el);
}

function ensureContainer(doc: Document = document): HTMLElement {
  let c = doc.getElementById(TOAST_CONTAINER_ID);
  if (!c) {
    c = doc.createElement('div');
    c.id = TOAST_CONTAINER_ID;
    doc.body.appendChild(c);
  }
  return c;
}

/** Injectable DOM surface — defaults to the real document in the browser. */
export interface LateJoinToastDeps {
  createEl: () => any;
  container: any;
  setTimeout: (fn: () => void, ms: number) => any;
}

function realDeps(): LateJoinToastDeps {
  injectStyles();
  return {
    createEl: () => document.createElement('div'),
    container: ensureContainer(),
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  };
}

/**
 * Show a late-join toast for `name`. Stacks in a fixed top-right container and
 * auto-dismisses after 3s. `deps` is injected only in tests.
 */
export function showLateJoinToast(name: string, deps: LateJoinToastDeps = realDeps()): void {
  const toast = deps.createEl();
  toast.className = 'brett-late-join-toast';
  toast.textContent = lateJoinToastText(name);
  deps.container.appendChild(toast);
  deps.setTimeout(() => { toast.remove(); }, DISMISS_MS);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd brett && MOCK_DB=true npx tsx --test test/late-join-toast.test.ts`
Expected: PASS — 3 tests green.

- [ ] **Step 5: Typecheck**

Run: `cd brett && npx tsc -p tsconfig.client.json --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add brett/src/client/ui/late-join-toast.ts brett/test/late-join-toast.test.ts
git commit -m "feat(brett): add stacking late-join toast notification"
```

---

## Task 4: `topbar-participants.ts` — participants panel + role assignment

**Files:**
- Create: `brett/src/client/ui/topbar-participants.ts`
- Test: `brett/test/topbar-participants.test.ts`

Two pure surfaces: (a) `buildParticipantRows(state)` derives the roster rows (color/name/role) from `LobbyState` — same shape as `buildLobbyViewModel`'s rows but standalone here; (b) `roleOptions()` / `canAssignRoles(isLeiter)` decide whether the dropdown shows. The `sendClient` call for role change is verified by asserting the message a click would build via a pure `buildAssignRoleMessage(targetPlayerId, role)`.

- [ ] **Step 1: Write the failing test**

Create `brett/test/topbar-participants.test.ts`:

```typescript
// brett/test/topbar-participants.test.ts
// Offline-safe: tests the pure roster-row derivation + role-assign message builder.
import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildParticipantRows,
  buildAssignRoleMessage,
  ROLE_OPTIONS,
} from '../src/client/ui/topbar-participants';
import { createLobbyState, type LobbyState } from '../src/client/lobby-store';

function seed(): LobbyState {
  return {
    ...createLobbyState(),
    phase: 'active',
    sessionCode: 'KRB-9A2',
    roster: {
      u1: { userId: 'u1', name: 'Anna', color: '#4ea1ff', role: 'leiter', ready: true },
      u2: { userId: 'u2', name: 'Ben', color: '#3fb950', role: 'beobachter', ready: false },
    },
  };
}

test('buildParticipantRows: maps roster into ordered rows with name/color/role', () => {
  const rows = buildParticipantRows(seed());
  assert.strictEqual(rows.length, 2);
  const anna = rows.find((r) => r.userId === 'u1')!;
  assert.strictEqual(anna.name, 'Anna');
  assert.strictEqual(anna.color, '#4ea1ff');
  assert.strictEqual(anna.role, 'leiter');
});

test('buildParticipantRows: empty roster yields no rows', () => {
  assert.deepStrictEqual(buildParticipantRows(createLobbyState()), []);
});

test('ROLE_OPTIONS: offers beobachter and stellvertreter for assignment', () => {
  assert.deepStrictEqual(ROLE_OPTIONS.map((o) => o.value), ['beobachter', 'stellvertreter']);
});

test('buildAssignRoleMessage: builds the admin_assign_role protocol message', () => {
  assert.deepStrictEqual(
    buildAssignRoleMessage('u2', 'stellvertreter'),
    { type: 'admin_assign_role', targetPlayerId: 'u2', role: 'stellvertreter' },
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd brett && MOCK_DB=true npx tsx --test test/topbar-participants.test.ts`
Expected: FAIL — module / exports not found.

- [ ] **Step 3: Write the module**

Create `brett/src/client/ui/topbar-participants.ts`:

```typescript
// brett/src/client/ui/topbar-participants.ts
// 👥 button in the board topbar opening a toggle panel with the participant
// roster. Leiter can reassign roles (beobachter ⇄ stellvertreter) via a dropdown
// that sends admin_assign_role. Pure helpers (buildParticipantRows,
// buildAssignRoleMessage, ROLE_OPTIONS) are node-testable; DOM in mount*.

import type { Role } from '../../types/state';
import type { ClientMessage } from '../../types/messages';
import type { LobbyState } from '../lobby-store';

export interface ParticipantRow {
  userId: string;
  name: string;
  color: string;
  role: Role | undefined;
}

/** Pure: derive roster rows from lobby state (insertion order of the roster map). */
export function buildParticipantRows(state: LobbyState): ParticipantRow[] {
  return Object.values(state.roster).map((p) => ({
    userId: p.userId,
    name: p.name,
    color: p.color,
    role: p.role,
  }));
}

/** Roles a leader may assign from the panel (leiter itself is not assignable here). */
export const ROLE_OPTIONS: ReadonlyArray<{ value: Role; label: string }> = [
  { value: 'beobachter', label: 'Beobachter' },
  { value: 'stellvertreter', label: 'Stellvertreter' },
];

const ROLE_LABEL: Record<Role, string> = {
  leiter: 'Leiter',
  stellvertreter: 'Stellvertreter',
  beobachter: 'Beobachter',
};

/** Pure: build the admin_assign_role message a dropdown change emits. */
export function buildAssignRoleMessage(targetPlayerId: string, role: Role): ClientMessage {
  return { type: 'admin_assign_role', targetPlayerId, role };
}

export interface ParticipantsDeps {
  getLobbyState: () => LobbyState;
  sendClient: (msg: ClientMessage) => void;
  isLeiter: () => boolean;
}

const PARTS_STYLE_ID = 'brett-topbar-participants';

function injectStyles(doc: Document = document): void {
  if (doc.getElementById(PARTS_STYLE_ID)) return;
  const el = doc.createElement('style');
  el.id = PARTS_STYLE_ID;
  el.textContent = [
    '.brett-parts-btn{font-family:var(--brett-font-sans,sans-serif);font-size:13px;',
    'background:transparent;color:var(--brett-fg,#e7ead0);',
    'border:1px solid var(--brett-line,rgba(255,255,255,0.12));',
    'border-radius:var(--brett-radius-sm,8px);padding:6px 10px;cursor:pointer;}',
    '.brett-parts-wrap{position:relative;display:inline-block;}',
    '.brett-parts-panel{position:absolute;top:calc(100% + 6px);right:0;z-index:60;',
    'background:var(--brett-ink-850,#101824);border:1px solid var(--brett-line,rgba(255,255,255,0.12));',
    'border-radius:var(--brett-radius-sm,8px);padding:10px 12px;min-width:240px;',
    'font-family:var(--brett-font-sans,sans-serif);font-size:13px;color:var(--brett-fg,#e7ead0);}',
    '.brett-parts-row{display:flex;align-items:center;gap:8px;padding:5px 0;}',
    '.brett-parts-dot{width:10px;height:10px;border-radius:50%;flex:0 0 auto;}',
    '.brett-parts-name{flex:1 1 auto;}',
    '.brett-parts-role{color:var(--brett-mute,#8a93a3);font-size:11px;}',
    '.brett-parts-select{background:var(--brett-ink-850,#101824);color:var(--brett-fg,#e7ead0);',
    'border:1px solid var(--brett-line-2,rgba(255,255,255,0.18));border-radius:6px;',
    'padding:2px 6px;font-size:11px;}',
  ].join('');
  doc.head.appendChild(el);
}

/**
 * Mount the 👥 button + toggle panel into `anchorEl`. Returns `{ update }` which
 * re-renders the panel body from the current lobby state — board-boot calls it on
 * every lobbyChange and on late-join.
 */
export function mountParticipantsButton(
  anchorEl: HTMLElement,
  deps: ParticipantsDeps,
): { update: () => void } {
  injectStyles();

  const wrap = document.createElement('div');
  wrap.className = 'brett-parts-wrap';
  const btn = document.createElement('button');
  btn.className = 'brett-parts-btn';
  btn.type = 'button';
  btn.textContent = '👥';
  btn.title = 'Teilnehmer';
  btn.setAttribute('aria-haspopup', 'true');
  btn.setAttribute('aria-expanded', 'false');
  wrap.appendChild(btn);
  anchorEl.appendChild(wrap);

  let panel: HTMLDivElement | null = null;

  function renderBody(): void {
    if (!panel) return;
    panel.innerHTML = '';
    const rows = buildParticipantRows(deps.getLobbyState());
    const isLeiter = deps.isLeiter();
    const title = document.createElement('div');
    title.className = 'brett-parts-role';
    title.textContent = `Teilnehmer (${rows.length})`;
    panel.appendChild(title);
    for (const row of rows) {
      const rowEl = document.createElement('div');
      rowEl.className = 'brett-parts-row';
      const dot = document.createElement('span');
      dot.className = 'brett-parts-dot';
      dot.style.background = row.color;
      const name = document.createElement('span');
      name.className = 'brett-parts-name';
      name.textContent = row.name;
      rowEl.append(dot, name);
      // Leiter sees a role dropdown for non-leader participants; everyone else
      // sees a static role label.
      if (isLeiter && row.role !== 'leiter') {
        const sel = document.createElement('select');
        sel.className = 'brett-parts-select';
        for (const opt of ROLE_OPTIONS) {
          const o = document.createElement('option');
          o.value = opt.value;
          o.textContent = opt.label;
          if (opt.value === row.role) o.selected = true;
          sel.appendChild(o);
        }
        sel.addEventListener('change', () => {
          deps.sendClient(buildAssignRoleMessage(row.userId, sel.value as Role));
        });
        rowEl.appendChild(sel);
      } else {
        const roleEl = document.createElement('span');
        roleEl.className = 'brett-parts-role';
        roleEl.textContent = row.role ? ROLE_LABEL[row.role] : '–';
        rowEl.appendChild(roleEl);
      }
      panel.appendChild(rowEl);
    }
  }

  function closePanel(): void {
    if (panel) { panel.remove(); panel = null; }
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onOutside, true);
  }

  function onOutside(e: MouseEvent): void {
    if (panel && !wrap.contains(e.target as Node)) closePanel();
  }

  function openPanel(): void {
    panel = document.createElement('div');
    panel.className = 'brett-parts-panel';
    wrap.appendChild(panel);
    renderBody();
    btn.setAttribute('aria-expanded', 'true');
    setTimeout(() => document.addEventListener('click', onOutside, true), 0);
  }

  btn.addEventListener('click', () => {
    if (panel) closePanel(); else openPanel();
  });

  return {
    update() { if (panel) renderBody(); },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd brett && MOCK_DB=true npx tsx --test test/topbar-participants.test.ts`
Expected: PASS — 4 tests green.

- [ ] **Step 5: Typecheck**

Run: `cd brett && npx tsc -p tsconfig.client.json --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add brett/src/client/ui/topbar-participants.ts brett/test/topbar-participants.test.ts
git commit -m "feat(brett): add participants panel with leader role assignment"
```

---

## Task 5: `index.html` — topbar slot divs

**Files:**
- Modify: `brett/public/index.html` (inside `#topbar`, in the right-aligned group at lines 313-353)

Add the two slot divs in the right-aligned `.group` (the one with `style="margin-left:auto;"`) so the new buttons sit next to the online indicator.

- [ ] **Step 1: Add the slot divs**

In `brett/public/index.html`, find (around line 351-352):

```html
      <button id="appearance-btn" disabled title="Aussehen bearbeiten">✦ Aussehen</button>
      <span id="online-indicator">● <span id="online-count">1</span> online</span>
```

Replace with:

```html
      <button id="appearance-btn" disabled title="Aussehen bearbeiten">✦ Aussehen</button>
      <div id="topbar-participants-slot"></div>
      <div id="topbar-invite-slot"></div>
      <span id="online-indicator">● <span id="online-count">1</span> online</span>
```

- [ ] **Step 2: Verify the slots are present**

Run: `grep -n "topbar-invite-slot\|topbar-participants-slot" brett/public/index.html`
Expected: two matches, both inside `#topbar`.

- [ ] **Step 3: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): add topbar slots for invite + participants buttons"
```

---

## Task 6: `board-boot.ts` — wire the three modules + late-join hook

**Files:**
- Modify: `brett/src/client/board-boot.ts` (imports at top ~lines 21-34; wiring after `persons.initPersons()` ~line 69, and the lobby-change handler)

`board-boot.ts` currently has NO `setLobbyChangeHandler` call of its own (the lobby screen owns that in app-shell). To keep the participants panel in sync without stealing the lobby screen's handler, we read state lazily and refresh on the **late-join hook** plus a lightweight polling-free approach: register our own `setLobbyChangeHandler` only if board-boot is the active view. **Verify first** whether another module already calls `wsClient.setLobbyChangeHandler` at runtime for the board view.

- [ ] **Step 1: Check for an existing lobbyChange consumer in the board path**

Run: `grep -rn "setLobbyChangeHandler" brett/src/client/`
Expected: shows where it is wired (likely `app-shell.ts` / `main.ts`). If the board view does not set it, board-boot can safely set it. If it IS set elsewhere for the board view, **wrap** rather than overwrite: capture the existing behavior by chaining. Record the finding before editing.

- [ ] **Step 2: Add imports**

In `brett/src/client/board-boot.ts`, after the existing `ui/*` imports (after line 34 `import { renderTimeline } from './ui/timeline';`), add:

```typescript
import { mountInviteButton } from './ui/topbar-invite';
import { mountParticipantsButton } from './ui/topbar-participants';
import { showLateJoinToast } from './ui/late-join-toast';
```

- [ ] **Step 3: Mount the modules + register the late-join hook**

In `bootBoard()`, after `persons.initPersons();` (line 69), add:

```typescript
  // ── Coachee late-join UI (T000XXX) ─────────────────────────────────
  const inviteSlot = document.getElementById('topbar-invite-slot');
  const participantsSlot = document.getElementById('topbar-participants-slot');

  const myRole = () => wsClient.getLobbyState()?.roster?.[currentUser.userId]?.role;

  let inviteCtl: { refresh: () => void } | null = null;
  if (inviteSlot) {
    inviteCtl = mountInviteButton(inviteSlot, () => wsClient.getLobbyState()?.sessionCode ?? null);
  }

  let participantsPanel: { update: () => void } | null = null;
  if (participantsSlot) {
    participantsPanel = mountParticipantsButton(participantsSlot, {
      getLobbyState: wsClient.getLobbyState,
      sendClient: wsClient.sendClient,
      isLeiter: () => myRole() === 'leiter',
    });
  }

  wsClient.setLateJoinHandler((name) => {
    if (myRole() === 'leiter') showLateJoinToast(name);
    participantsPanel?.update();
  });

  // Keep invite-button visibility + panel in sync when the roster/session code
  // changes. Chain onto any existing lobbyChange consumer rather than clobbering.
  const prevLobbyChange = wsClient.getLobbyChangeHandler?.() ?? null;
  wsClient.setLobbyChangeHandler((state) => {
    prevLobbyChange?.(state);
    inviteCtl?.refresh();
    participantsPanel?.update();
  });
```

This references `wsClient.getLobbyChangeHandler` — add that getter in Step 4.

- [ ] **Step 4: Add a `getLobbyChangeHandler` getter in ws-client.ts (chaining safety)**

In `brett/src/client/ws-client.ts`, next to `setLobbyChangeHandler` (lines 74-78), add a getter so board-boot can chain instead of clobbering:

```typescript
let onLobbyChange: (state: LobbyState) => void = () => {};
export function setLobbyChangeHandler(fn: (state: LobbyState) => void): void {
  onLobbyChange = fn;
}
export function getLobbyChangeHandler(): (state: LobbyState) => void {
  return onLobbyChange;
}
```

(The `let onLobbyChange`/`setLobbyChangeHandler` already exist — only **add** the `getLobbyChangeHandler` export; do not duplicate the others.)

- [ ] **Step 5: Typecheck the whole client**

Run: `cd brett && npx tsc -p tsconfig.client.json --noEmit`
Expected: no errors. (If `getLobbyChangeHandler?.()` optional-call triggers a "always defined" lint, drop the `?.` — it is a real export now.)

- [ ] **Step 6: Run the full brett test suite**

Run: `cd brett && npm test`
Expected: PASS — all existing + new tests green.

- [ ] **Step 7: Commit**

```bash
git add brett/src/client/board-boot.ts brett/src/client/ws-client.ts
git commit -m "feat(brett): wire invite/participants/late-join into board boot"
```

---

## Task 7: Build verification + manual smoke checklist

**Files:** none (verification only)

- [ ] **Step 1: Client build**

Run the brett client build to confirm the new modules bundle cleanly.
Run: `cd brett && grep -E '"build' package.json` to find the build script, then run it (e.g. `npm run build` or the esbuild/vite script listed).
Expected: build succeeds, no unresolved imports.

- [ ] **Step 2: Full typecheck (client + server)**

Run: `cd brett && npx tsc -p tsconfig.client.json --noEmit && npx tsc -p tsconfig.server.json --noEmit`
Expected: no errors.

- [ ] **Step 3: Full test suite once more**

Run: `cd brett && npm test`
Expected: all green.

- [ ] **Step 4: Record the manual smoke checklist in the PR body (do NOT run live here)**

The following require a running brett + a started session; note them for the executor/QA, do not block the plan on them:
- Host starts a round → "🔗 Einladen" button appears in the topbar; click copies the link and shows the popup with "Kopiert ✓" for 2s, then "Link zum Teilen"; clicking outside closes it.
- Open the invite link in a second browser as a coachee mid-session → the coachee joins the board.
- The leader sees a top-right toast "<name> ist beigetreten" that auto-dismisses after 3s; a non-leader does NOT see the toast.
- 👥 button opens the participants panel showing the roster (color dot + name + role); as leader, the role dropdown changes a participant between Beobachter/Stellvertreter and the change propagates (`admin_assign_role` → `role_changed`).

- [ ] **Step 5: Commit (if any verification-driven fixups were made)**

```bash
git add -A
git commit -m "chore(brett): verification fixups for coachee late-join UI"
```

(Skip this commit if Steps 1-3 were clean with no edits.)

---

## Self-Review Notes

- **Spec coverage:** Goal 1 (host shares link post-start) → Task 2 + Task 5 + Task 6. Goal 2 (coachee late-join) → already works server-side; the invite link (Task 2) is the missing UI. Goal 3 (leader notified) → Task 1 (hook) + Task 3 (toast) + Task 6 (leader-gated wiring). Goal 4 (role assignment) → Task 4 + Task 6. Each spec file in the spec table is created/modified by a task.
- **No-jsdom constraint** is honored: every test targets pure exported functions or uses an injected DOM/clipboard/timer stub. No test imports jsdom.
- **Type consistency:** `admin_assign_role`/`targetPlayerId`/`role` match `messages.ts:26`; `Role` literals (`leiter`/`stellvertreter`/`beobachter`) match `state.ts:7`; `Phase` literals match `state.ts:5`; `LobbyState.roster`/`sessionCode`/`phase` match `lobby-store.ts`; `presence_join` payload `msg.participant.name` matches `messages.ts:62`.
- **Spec deviation (documented):** `mountInviteButton` returns `{ refresh, destroy }` instead of `void`, and `mountParticipantsButton` returns `{ update }` per spec; the invite addition lets board-boot re-evaluate visibility when the session code arrives asynchronously. Superset of the spec contract, breaks nothing.
- **Phase mapping (documented):** the spec's `currentPhase` is the module-level `lobbyState.phase` in ws-client; there is no separate variable. The hook fires on `active`/`warmup`/`paused`, not `lobby`/`null`/`ended`.
- **Open verification gate in Task 6 Step 1:** the executor must confirm whether the board view already wires `setLobbyChangeHandler`; the plan chains via `getLobbyChangeHandler` to avoid clobbering. If the grep shows the board view never sets it, the chain is a harmless no-op (`prevLobbyChange` is the default `() => {}`).
