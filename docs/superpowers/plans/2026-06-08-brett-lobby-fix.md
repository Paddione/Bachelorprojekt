---
title: Brett Lobby Fix Implementation Plan
ticket_id: T000544
domains: [website]
status: active
pr_number: null
---

# Brett Lobby Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three connected Brett-lobby bugs (T000544): the leiter cannot start a round, stale participants linger in the lobby, and the lobby settings panel is read-only.

**Architecture:** Server-authoritative lobby. `admin_session_create` (in `ws-admin-commands.ts`) must register the creator as a participant + broadcast a `presence_join` with role `leiter`, and must clear the prior round's `roomParticipants` first. The client lobby store (`lobby-store.ts`) resets its roster on an `admin-create` phase change and the `isLeader` derivation falls back to `adminTokenHolder`. The lobby UI (`lobby.ts`) exposes interactive `<select>` controls for the leiter that emit the already-existing `admin_set_template` / `admin_set_optik` client messages; non-leaders keep the read-only rows.

**Tech Stack:** TypeScript, Node.js, `node:test` + `tsx` runner (pure, no jsdom — UI logic is tested via the pure view-model builder, never via DOM). WebSocket message protocol typed in `brett/src/types/messages.ts` and `brett/src/types/state.ts`.

---

## Conventions & Commands

- **Run a single test file:** `MOCK_DB=true npm --prefix brett exec -- tsx --test test/<file>.test.ts`
- **Run the whole brett suite:** `MOCK_DB=true npm --prefix brett test`
- **Typecheck (must stay clean):** `npm --prefix brett run typecheck`
- All paths below are relative to the repo root (`/tmp/wt-brett-lobby-fix`).
- TDD per fix: write the failing test, run it red, implement, run it green, commit.
- No direct push to `main`. PR via `gh pr create` at the end.
- Deploy is out of scope for this plan (post-merge, from a clean worktree, via `task feature:brett`).

### Key existing facts (verified against the worktree)

- `brett/src/server/rooms.ts`: `roomParticipants` is `Map<string, Map<string, {userId,name,color}>>`. Exports `addParticipant`, `removeParticipant`, `listParticipants`, `colorForIndex`. **No `clearParticipants` yet.**
- `brett/src/server/ws-admin-commands.ts`: `admin_session_create` case is at lines ~60–92. It calls `deps.handleAdminSessionCreate`, broadcasts `session_phase_change{reason:'admin-create'}` + `admin_token_changed{reason:'handoff'}`, but never touches participants. `deps` is `WsDeps` and already carries `addParticipant`, `listParticipants`, `broadcast`. `clearParticipants` must be added to `WsDeps` and wired in `index.ts`.
- `brett/src/server/index.ts`: deps object wires `addParticipant: rooms.addParticipant` etc. around lines 430–456. Also re-exports `rooms.*` near lines 565–568 for tests.
- `brett/src/client/lobby-store.ts`: `RosterEntry`, `LobbyState`, `createLobbyState()`, `applyLobbyServerMessage()`. The `session_phase_change` case currently returns `{ ...state, phase: msg.phase }` (no roster reset).
- `brett/src/client/main.ts` line 57: `const isLeader = state.roster[user.userId]?.role === 'leiter';` (lines 51–71 are `renderLobby`).
- `brett/src/client/ui/lobby.ts`: `LobbyViewModel`, `buildLobbyViewModel(state, {isLeader})`, `LobbyHandlers`, `mountLobby()`. Settings rows are read-only `settingRow()` calls at lines 135–137.
- `brett/src/types/state.ts`: `OptikSettings { floor?: string; sky?: 'day'|'dusk'|'calm'; lightMood?: 'neutral'|'warm'|'cool' }`; `Participant { userId; name; color; isAdmin?; role?; ready? }`; `Role = 'leiter'|'stellvertreter'|'beobachter'`.
- `brett/src/types/messages.ts`: client messages include `{type:'admin_set_template'; templateId:string}` and `{type:'admin_set_optik'; settings:OptikSettings}` (lines 28–29) — handlers already exist server-side.
- **`/api/templates` returns coaching templates** with fields `id`, `name`, `description`, `steps`, `is_system` (from `coaching-templates.ts`) — NOT `label`. The plan uses `name` with a `label` fallback for safety.
- Tests are pure (no jsdom). UI behaviour is asserted on the **view-model builder**, not on rendered DOM.

---

## File Structure

- **Modify** `brett/src/server/rooms.ts` — add `clearParticipants(room)`.
- **Modify** `brett/src/server/ws-handler.ts` — add `clearParticipants: Function;` to `WsDeps`.
- **Modify** `brett/src/server/index.ts` — wire `clearParticipants: rooms.clearParticipants` into the deps object; re-export for tests.
- **Modify** `brett/src/server/ws-admin-commands.ts` — in `admin_session_create`: clear participants, add the creator, broadcast `presence_join{role:'leiter'}`.
- **Modify** `brett/src/client/lobby-store.ts` — `session_phase_change` with `reason==='admin-create'` & `phase==='lobby'` resets the roster.
- **Modify** `brett/src/client/main.ts` — `isLeader` also true when `state.adminTokenHolder === user.userId`; wire `onSetTemplate`/`onSetOptik` handlers.
- **Modify** `brett/src/client/ui/lobby.ts` — add `editable` to the view-model, extend `LobbyHandlers` with `onSetTemplate`/`onSetOptik`, render interactive controls for the leiter.
- **Modify** `brett/test/lobby-store.test.ts` — roster-reset + leiter-presence assertions.
- **Create** `brett/test/lobby-admin-session-create.test.ts` — server integration: creator becomes participant with role `leiter`.
- **Modify** `brett/test/lobby-render.test.ts` — view-model `editable` flag assertions for Bug 3.

---

## Task 1: Server — `clearParticipants` in rooms.ts (Bug 2, server side)

**Files:**
- Modify: `brett/src/server/rooms.ts` (after `removeParticipant`, ~line 66)
- Modify: `brett/src/server/index.ts` (re-export near line 567)
- Test: `brett/test/participants.test.ts` (extend) — confirm via existing harness

- [ ] **Step 1: Write the failing test**

Append to `brett/test/participants.test.ts`:

```ts
test('clearParticipants empties the room roster', () => {
  const { addParticipant, listParticipants, clearParticipants } = require('../src/server/index');
  const room = 'clear-participants-room';
  addParticipant(room, { userId: 'a', name: 'A' });
  addParticipant(room, { userId: 'b', name: 'B' });
  assert.strictEqual(listParticipants(room).length, 2);
  clearParticipants(room);
  assert.strictEqual(listParticipants(room).length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `MOCK_DB=true npm --prefix brett exec -- tsx --test test/participants.test.ts`
Expected: FAIL — `clearParticipants is not a function`.

- [ ] **Step 3: Implement `clearParticipants` in rooms.ts**

In `brett/src/server/rooms.ts`, after the `removeParticipant` function (the block ending at line 66):

```ts
export function clearParticipants(room: string): void {
  roomParticipants.delete(room);
}
```

- [ ] **Step 4: Wire it into deps + re-export in index.ts**

In `brett/src/server/index.ts`, in the deps object (next to `removeParticipant: rooms.removeParticipant,` ~line 435):

```ts
  clearParticipants: rooms.clearParticipants,
```

And in the test re-export block (next to `export const removeParticipant = rooms.removeParticipant;` ~line 566):

```ts
export const clearParticipants = rooms.clearParticipants;
```

- [ ] **Step 5: Add `clearParticipants` to the `WsDeps` interface**

In `brett/src/server/ws-handler.ts`, in `export interface WsDeps {` (next to the existing `addParticipant: Function;` ~line 13):

```ts
  clearParticipants: Function;
```

- [ ] **Step 6: Run test + typecheck**

Run: `MOCK_DB=true npm --prefix brett exec -- tsx --test test/participants.test.ts`
Expected: PASS.
Run: `npm --prefix brett run typecheck`
Expected: clean (no errors).

- [ ] **Step 7: Commit**

```bash
git add brett/src/server/rooms.ts brett/src/server/index.ts brett/src/server/ws-handler.ts brett/test/participants.test.ts
git commit -m "feat(brett): add clearParticipants to reset room roster [T000544]"
```

---

## Task 2: Server — creator joins as leiter on `admin_session_create` (Bug 1 + Bug 2)

**Files:**
- Create: `brett/test/lobby-admin-session-create.test.ts`
- Modify: `brett/src/server/ws-admin-commands.ts` (the `admin_session_create` case, ~lines 60–92)

- [ ] **Step 1: Write the failing integration test**

Create `brett/test/lobby-admin-session-create.test.ts`:

```ts
// brett/test/lobby-admin-session-create.test.ts — T000544
// After admin_session_create the creator must be a registered participant and
// receive a presence_join with role 'leiter'; stale participants must be cleared.
import { test } from 'node:test';
import assert from 'node:assert';
import { handleAdminMessage } from '../src/server/ws-admin-commands';
import {
  addParticipant,
  listParticipants,
  clearParticipants,
  handleAdminSessionCreate,
  buildStateFromMutations,
  applyMutation,
  schedulePersist,
  broadcast,
} from '../src/server/index';

function makeDeps(collected: any[]) {
  return {
    rooms: new Map(),
    addParticipant,
    listParticipants,
    clearParticipants,
    handleAdminSessionCreate,
    buildStateFromMutations,
    applyMutation,
    schedulePersist: () => {},
    broadcast: (_room: string, msg: any) => collected.push(msg),
  } as any;
}

test('admin_session_create registers the creator as a leiter participant', async () => {
  const room = 'admin-create-creator';
  const collected: any[] = [];
  const ws = { _playerId: 'leader-1', _session: { name: 'Coach' }, send: () => {} };

  await handleAdminMessage(ws, { type: 'admin_session_create' }, room, makeDeps(collected));

  const parts = listParticipants(room);
  assert.strictEqual(parts.some((p: any) => p.userId === 'leader-1'), true);

  const join = collected.find((m) => m.type === 'presence_join');
  assert.ok(join, 'expected a presence_join broadcast');
  assert.strictEqual(join.participant.userId, 'leader-1');
  assert.strictEqual(join.participant.role, 'leiter');
  assert.strictEqual(join.participant.ready, false);
});

test('admin_session_create clears stale participants before adding the creator', async () => {
  const room = 'admin-create-stale';
  const collected: any[] = [];
  addParticipant(room, { userId: 'ghost', name: 'Ghost' });
  const ws = { _playerId: 'leader-2', _session: { name: 'Coach2' }, send: () => {} };

  await handleAdminMessage(ws, { type: 'admin_session_create' }, room, makeDeps(collected));

  const parts = listParticipants(room);
  assert.strictEqual(parts.some((p: any) => p.userId === 'ghost'), false);
  assert.strictEqual(parts.some((p: any) => p.userId === 'leader-2'), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `MOCK_DB=true npm --prefix brett exec -- tsx --test test/lobby-admin-session-create.test.ts`
Expected: FAIL — no `presence_join` in `collected`; `ghost` still present.

- [ ] **Step 3: Implement creator-join + clear in the `admin_session_create` case**

In `brett/src/server/ws-admin-commands.ts`, locate the `admin_session_create` case. Immediately AFTER the `admin_token_changed` broadcast block (the one ending with `reason: 'handoff', });`) and BEFORE `deps.schedulePersist(adminRoom);`, insert:

```ts
      // T000544 / Bug 2: drop the previous round's participants so re-joiners
      // and stale entries don't bleed into the new lobby snapshot.
      deps.clearParticipants(adminRoom);
      // T000544 / Bug 1: register the creator as a participant and announce a
      // presence_join with role 'leiter' so the leiter's own client derives
      // isLeader === true (and thus canStart). The role mirrors the __roles__
      // mutation handleAdminSessionCreate already wrote server-side.
      const creatorParticipant = deps.addParticipant(adminRoom, {
        userId: playerId,
        name: ws._session?.name || playerId,
      });
      if (creatorParticipant) {
        deps.broadcast(adminRoom, {
          type: 'presence_join',
          participant: { ...creatorParticipant, role: 'leiter', ready: false },
        });
      }
```

Note: `playerId` is already in scope (declared at the top of the case as `ws._playerId || ws._session?.name`).

- [ ] **Step 4: Run test to verify it passes**

Run: `MOCK_DB=true npm --prefix brett exec -- tsx --test test/lobby-admin-session-create.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Guard against regression in the broader admin suite + typecheck**

Run: `MOCK_DB=true npm --prefix brett exec -- tsx --test test/session-state.test.ts test/messages.test.ts test/admin-token.test.ts`
Expected: PASS.
Run: `npm --prefix brett run typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add brett/src/server/ws-admin-commands.ts brett/test/lobby-admin-session-create.test.ts
git commit -m "fix(brett): register creator as leiter participant on session create [T000544]"
```

---

## Task 3: Client — lobby store resets roster on admin-create + isLeader fallback (Bug 1 + Bug 2)

**Files:**
- Modify: `brett/src/client/lobby-store.ts` (the `session_phase_change` case, lines 63–64)
- Modify: `brett/test/lobby-store.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `brett/test/lobby-store.test.ts`:

```ts
test('session_phase_change(reason=admin-create) clears the roster', () => {
  let s = createLobbyState();
  s = applyLobbyServerMessage(s, { type: 'presence_join', participant: { userId: 'old', name: 'Old', color: '#4ea1ff' } });
  assert.strictEqual(Object.keys(s.roster).length, 1);
  s = applyLobbyServerMessage(s, { type: 'session_phase_change', phase: 'lobby', transitionedAt: 't', reason: 'admin-create' });
  assert.deepStrictEqual(s.roster, {});
  assert.strictEqual(s.phase, 'lobby');
});

test('session_phase_change with a non-admin-create reason keeps the roster', () => {
  let s = createLobbyState();
  s = applyLobbyServerMessage(s, { type: 'presence_join', participant: { userId: 'u', name: 'U', color: '#4ea1ff' } });
  s = applyLobbyServerMessage(s, { type: 'session_phase_change', phase: 'active', transitionedAt: 't', reason: 'round-start' });
  assert.strictEqual(s.roster.u.name, 'U');
  assert.strictEqual(s.phase, 'active');
});

test('presence_join with role leiter is reflected in the roster (isLeader invariant)', () => {
  let s = createLobbyState();
  s = applyLobbyServerMessage(s, { type: 'presence_join', participant: { userId: 'me', name: 'Me', color: '#4ea1ff', role: 'leiter', ready: false } });
  assert.strictEqual(s.roster.me.role, 'leiter');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `MOCK_DB=true npm --prefix brett exec -- tsx --test test/lobby-store.test.ts`
Expected: FAIL — the admin-create test fails (roster not cleared). The other two should already pass (kept as invariants).

- [ ] **Step 3: Implement the roster reset**

In `brett/src/client/lobby-store.ts`, replace the `session_phase_change` case (currently lines 63–64):

```ts
    case 'session_phase_change':
      return { ...state, phase: msg.phase };
```

with:

```ts
    case 'session_phase_change':
      // T000544 / Bug 2: a fresh admin-created lobby must not inherit the prior
      // round's roster. The server clears its participant map + re-broadcasts a
      // presence_join for the creator, so we reset here and let those rebuild it.
      if (msg.reason === 'admin-create' && msg.phase === 'lobby') {
        return { ...state, phase: msg.phase, roster: {} };
      }
      return { ...state, phase: msg.phase };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `MOCK_DB=true npm --prefix brett exec -- tsx --test test/lobby-store.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Implement the `isLeader` fallback in main.ts**

In `brett/src/client/main.ts`, in `renderLobby` (line 57), replace:

```ts
    const isLeader = state.roster[user.userId]?.role === 'leiter';
```

with:

```ts
    // T000544 / Bug 1 (defense in depth): the server now broadcasts a
    // presence_join{role:'leiter'} for the creator, but also fall back to the
    // adminTokenHolder so the start button appears even if the join races the
    // first render.
    const isLeader = state.roster[user.userId]?.role === 'leiter'
      || state.adminTokenHolder === user.userId;
```

- [ ] **Step 6: Typecheck**

Run: `npm --prefix brett run typecheck`
Expected: clean. (`adminTokenHolder` exists on `LobbyState`.)

- [ ] **Step 7: Commit**

```bash
git add brett/src/client/lobby-store.ts brett/src/client/main.ts brett/test/lobby-store.test.ts
git commit -m "fix(brett): reset lobby roster on admin-create + isLeader adminToken fallback [T000544]"
```

---

## Task 4: Client — editable settings view-model (Bug 3, pure logic)

**Files:**
- Modify: `brett/src/client/ui/lobby.ts` (add `editable` to `LobbyViewModel` + `buildLobbyViewModel`)
- Modify: `brett/test/lobby-render.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `brett/test/lobby-render.test.ts`:

```ts
test('buildLobbyViewModel: leader gets editable settings', () => {
  const vm = buildLobbyViewModel(seed(), { isLeader: true });
  assert.strictEqual(vm.settings.editable, true);
});

test('buildLobbyViewModel: non-leader gets read-only settings', () => {
  const vm = buildLobbyViewModel(seed(), { isLeader: false });
  assert.strictEqual(vm.settings.editable, false);
});

test('buildLobbyViewModel: settings expose raw optik for controls', () => {
  const s: LobbyState = { ...seed(), settings: { templateId: 't1', optik: { sky: 'dusk', lightMood: 'warm' } } };
  const vm = buildLobbyViewModel(s, { isLeader: true });
  assert.strictEqual(vm.settings.optik?.sky, 'dusk');
  assert.strictEqual(vm.settings.optik?.lightMood, 'warm');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `MOCK_DB=true npm --prefix brett exec -- tsx --test test/lobby-render.test.ts`
Expected: FAIL — `vm.settings.editable` / `vm.settings.optik` undefined.

- [ ] **Step 3: Extend the view-model type + builder**

In `brett/src/client/ui/lobby.ts`, change the `settings` block of `LobbyViewModel` (lines 27–33) to:

```ts
  /** Settings panel. `editable` gates the leiter's interactive controls. */
  settings: {
    templateId?: string;
    coachingTemplateId?: string;
    optikLabel?: string;
    optik?: import('../../types/state').OptikSettings;
    maxParticipants?: number;
    editable: boolean;
  };
```

And in `buildLobbyViewModel`, change the returned `settings` object (lines 62–67) to:

```ts
    settings: {
      templateId: state.settings.templateId,
      coachingTemplateId: state.settings.coachingTemplateId,
      optikLabel: optikLabel(state),
      optik: state.settings.optik,
      maxParticipants: state.settings.maxParticipants,
      editable: opts.isLeader,
    },
```

- [ ] **Step 4: Run tests + typecheck**

Run: `MOCK_DB=true npm --prefix brett exec -- tsx --test test/lobby-render.test.ts`
Expected: PASS.
Run: `npm --prefix brett run typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add brett/src/client/ui/lobby.ts brett/test/lobby-render.test.ts
git commit -m "feat(brett): expose editable + raw optik in lobby view-model [T000544]"
```

---

## Task 5: Client — interactive settings controls in mountLobby (Bug 3, DOM render)

DOM is not unit-tested here (the suite is jsdom-free). This task wires the controls and the handlers; verification is the typecheck plus the post-merge manual/E2E check.

**Files:**
- Modify: `brett/src/client/ui/lobby.ts` (`LobbyHandlers` + the settings render block, lines 82–88 and 129–137)
- Modify: `brett/src/client/main.ts` (`renderLobby` handler wiring, lines 59–69)

- [ ] **Step 1: Extend `LobbyHandlers`**

In `brett/src/client/ui/lobby.ts`, add to the `LobbyHandlers` interface (after `onCoachingSteps?` at line 87):

```ts
  /** Leader-only: change the scenario template (admin_set_template). */
  onSetTemplate?: (templateId: string) => void;
  /** Leader-only: change board optik (admin_set_optik). */
  onSetOptik?: (settings: import('../../types/state').OptikSettings) => void;
```

- [ ] **Step 2: Render interactive controls for the leiter**

In `brett/src/client/ui/lobby.ts`, replace the three read-only setting rows (lines 135–137):

```ts
  settingsPanel.appendChild(settingRow('Vorlage', vm.settings.templateId ?? '–'));
  settingsPanel.appendChild(settingRow('Optik', vm.settings.optikLabel ?? '–'));
  settingsPanel.appendChild(settingRow('Max. Teiln.', vm.settings.maxParticipants != null ? String(vm.settings.maxParticipants) : '–'));
```

with:

```ts
  if (vm.settings.editable && handlers.onSetTemplate && handlers.onSetOptik) {
    // Template <select> — populated async from /api/templates (coaching
    // templates; fields id + name). label falls back to name → id.
    const tplSelect = document.createElement('select');
    tplSelect.className = 'brett-lobby__select';
    tplSelect.dataset.role = 'setting-template';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Vorlage wählen …';
    tplSelect.appendChild(placeholder);
    tplSelect.addEventListener('change', () => {
      if (tplSelect.value) handlers.onSetTemplate!(tplSelect.value);
    });
    fetch('/api/templates')
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Array<{ id: string; name?: string; label?: string }>) => {
        for (const t of Array.isArray(list) ? list : []) {
          const opt = document.createElement('option');
          opt.value = t.id;
          opt.textContent = t.label ?? t.name ?? t.id;
          if (t.id === vm.settings.templateId) opt.selected = true;
          tplSelect.appendChild(opt);
        }
      })
      .catch(() => { /* leave placeholder only */ });
    settingsPanel.appendChild(settingControl('Vorlage', tplSelect));

    // Sky <select>.
    const skySelect = document.createElement('select');
    skySelect.className = 'brett-lobby__select';
    skySelect.dataset.role = 'setting-sky';
    for (const [value, text] of [['day', 'Tag'], ['dusk', 'Dämmerung'], ['calm', 'Ruhig']] as const) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = text;
      if (vm.settings.optik?.sky === value) opt.selected = true;
      skySelect.appendChild(opt);
    }
    skySelect.addEventListener('change', () => {
      handlers.onSetOptik!({ sky: skySelect.value as 'day' | 'dusk' | 'calm' });
    });
    settingsPanel.appendChild(settingControl('Himmel', skySelect));

    // LightMood <select>.
    const moodSelect = document.createElement('select');
    moodSelect.className = 'brett-lobby__select';
    moodSelect.dataset.role = 'setting-mood';
    for (const [value, text] of [['neutral', 'Neutral'], ['warm', 'Warm'], ['cool', 'Kühl']] as const) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = text;
      if (vm.settings.optik?.lightMood === value) opt.selected = true;
      moodSelect.appendChild(opt);
    }
    moodSelect.addEventListener('change', () => {
      handlers.onSetOptik!({ lightMood: moodSelect.value as 'neutral' | 'warm' | 'cool' });
    });
    settingsPanel.appendChild(settingControl('Licht', moodSelect));

    settingsPanel.appendChild(settingRow('Max. Teiln.', vm.settings.maxParticipants != null ? String(vm.settings.maxParticipants) : '–'));
  } else {
    settingsPanel.appendChild(settingRow('Vorlage', vm.settings.templateId ?? '–'));
    settingsPanel.appendChild(settingRow('Optik', vm.settings.optikLabel ?? '–'));
    settingsPanel.appendChild(settingRow('Max. Teiln.', vm.settings.maxParticipants != null ? String(vm.settings.maxParticipants) : '–'));
  }
```

- [ ] **Step 3: Add the `settingControl` helper + select CSS**

In `brett/src/client/ui/lobby.ts`, after the existing `settingRow` function (ends at line 217), add:

```ts
function settingControl(label: string, control: HTMLElement): HTMLElement {
  const row = document.createElement('div');
  row.className = 'brett-lobby__setting';
  const k = document.createElement('span');
  k.className = 'brett-lobby__setting-label';
  k.textContent = label;
  row.append(k, control);
  return row;
}
```

And in `lobbyCss()` (the array returned ~lines 224–247), add this entry before the closing `].join('')`:

```ts
    '.brett-lobby__select{background:var(--brett-ink-850);color:var(--brett-fg);',
    'border:1px solid var(--brett-line-2);border-radius:8px;padding:4px 8px;',
    'font-family:var(--brett-font-sans);}',
```

- [ ] **Step 4: Wire the handlers in main.ts**

In `brett/src/client/main.ts`, in the `mountLobby(...)` handlers object inside `renderLobby` (after the `onCoachingSteps` block, before the closing `});` at line 69), add:

```ts
      onSetTemplate: isLeader
        ? (id) => ws.sendClient({ type: 'admin_set_template', templateId: id })
        : undefined,
      onSetOptik: isLeader
        ? (s) => ws.sendClient({ type: 'admin_set_optik', settings: s })
        : undefined,
```

- [ ] **Step 5: Typecheck + full suite**

Run: `npm --prefix brett run typecheck`
Expected: clean.
Run: `MOCK_DB=true npm --prefix brett test`
Expected: PASS (whole suite — confirms no regression in lobby-render, lobby-store, admin tests).

- [ ] **Step 6: Commit**

```bash
git add brett/src/client/ui/lobby.ts brett/src/client/main.ts
git commit -m "feat(brett): interactive template/optik controls in lobby for leiter [T000544]"
```

---

## Task 6: Full verification + PR

- [ ] **Step 1: Run the complete brett suite + typecheck one final time**

Run: `npm --prefix brett run typecheck`
Expected: clean.
Run: `MOCK_DB=true npm --prefix brett test`
Expected: all tests PASS (new: `lobby-admin-session-create`, extended: `lobby-store`, `lobby-render`, `participants`).

- [ ] **Step 2: Confirm the branch is pushed**

```bash
git push -u origin fix/brett-lobby-start-roster-settings
```

- [ ] **Step 3: Open the PR**

```bash
gh pr create --base main --head fix/brett-lobby-start-roster-settings \
  --title "fix(brett): lobby start button, stale roster, and settings controls [T000544]" \
  --body "$(cat <<'EOF'
## Summary
Fixes three connected Brett-lobby bugs (T000544):

- **Bug 1 (critical):** the leiter could not start a round. The server now
  registers the session creator as a participant and broadcasts
  `presence_join{role:'leiter'}` on `admin_session_create`; the client also
  derives `isLeader` from `adminTokenHolder` as defense in depth.
- **Bug 2:** stale participants from the previous round lingered. The server
  clears `roomParticipants` on `admin_session_create`; the client resets its
  roster on `session_phase_change{reason:'admin-create'}`.
- **Bug 3:** the lobby settings panel was read-only. The leiter now gets
  interactive `<select>` controls (template / sky / light mood) that emit the
  existing `admin_set_template` / `admin_set_optik` messages.

## Test plan
- New `brett/test/lobby-admin-session-create.test.ts` (server integration).
- Extended `lobby-store.test.ts` (roster reset + leiter invariant) and
  `lobby-render.test.ts` (editable view-model).
- `MOCK_DB=true npm --prefix brett test` green; `npm --prefix brett run typecheck` clean.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Verify CI is green before merge.** Squash-and-merge per repo policy. Deploy post-merge from a clean worktree via `task feature:brett` (out of scope here).

---

## Self-Review Notes

- **Spec coverage:** Bug 1 → Tasks 2 (server) + 3 (client fallback). Bug 2 → Tasks 1 + 2 (server clear) + 3 (client reset). Bug 3 → Tasks 4 (view-model) + 5 (controls + handlers). All three covered.
- **Discrepancy resolved:** ticket said `/api/templates` returns `id`/`label`; the actual route returns coaching templates with `id`/`name`. Task 5 reads `t.label ?? t.name ?? t.id`, so it works either way.
- **Type consistency:** `clearParticipants` named identically in `rooms.ts`, `WsDeps`, `index.ts` deps + re-export, the integration test, and the `admin_session_create` call site. `OptikSettings` imported inline where used in `lobby.ts`. `presence_join` participant matches the `Participant` type (`role`, `ready` optional). `admin_set_template`/`admin_set_optik` match the existing `ClientMessage` union.
- **Testing reality:** the brett suite is jsdom-free; DOM rendering (Task 5) is verified by typecheck + post-merge E2E/manual, while the *logic* (editable gating, optik exposure) is unit-tested via `buildLobbyViewModel` (Task 4).
