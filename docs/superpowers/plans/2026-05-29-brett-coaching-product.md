---
title: Brett Coaching Multiuser Product — Implementation Plan
ticket_id: T000301
domains: [infra, test]
status: active
pr_number: null
---

# Brett Coaching Multiuser Product — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Brett's coaching mode into a usable multiuser coaching tool for gekko/mentolder (1 coach + 3 participants, remote), with coach-defined session steps, presence, soft-lock editing, synced figure labels, a clean coaching-only UI, an SSO-gated join flow, and UI-level hiding of korczewski's 5 personal characters on mentolder.

**Architecture:** A new coaching-session layer of small ES modules under `brett/public/assets/coaching/` (pure logic, `node:test`-covered), loaded only in coaching mode and talking over a single WebSocket. `server.js` gains coaching-specific mutations/handlers (steps, locks, presence) and an auth gate, all exposed as exported functions so they unit-test via `require('../server.js')` with `MOCK_DB=true`. Brett becomes brand-aware via `/api/config`.

**Tech Stack:** Node.js (CommonJS server `server.js`), browser ES modules (`.mjs`), `ws` WebSocket server, `express` + `express-session` + OIDC, PostgreSQL (`brett_rooms.state` JSONB), `node:test` + `node:assert`.

**Conventions confirmed from the codebase:**
- Pure client modules live in `brett/public/assets/` and are tested with `node --test` (see `mode-state.mjs` + `mode-state.test.mjs`).
- Server unit tests do `process.env.MOCK_DB = 'true'` then `require('../server.js')` and call exported functions directly (see `test/session-state.test.js`, `test/server-config.test.js`). New server logic MUST be exported.
- Figure mutations flow through `applyMutation(room, msg)` + `broadcast(room, msg, ws)`; meta-state uses `__sentinel__` keys filtered out by the `SPECIAL` array in `buildStateFromMutations`.
- Run a single test file from repo root: `node --test brett/test/<file>`.

---

## Task 1: Phase-step model module (`coaching/phases.mjs`)

Coach-defined ordered steps with an editable default template, layered over the existing lifecycle.

**Files:**
- Create: `brett/public/assets/coaching/phases.mjs`
- Test: `brett/test/phases.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// brett/test/phases.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPhaseState, DEFAULT_STEPS } from '../public/assets/coaching/phases.mjs';

test('defaults to the constellation template at index 0', () => {
  const p = createPhaseState();
  assert.deepEqual(p.steps(), DEFAULT_STEPS);
  assert.equal(p.index(), 0);
  assert.equal(p.label(), 'Aufstellen');
});

test('advance/back clamp at the ends', () => {
  const p = createPhaseState();
  assert.equal(p.advance(), 1);
  assert.equal(p.label(), 'Wahrnehmen');
  p.setIndex(p.steps().length - 1);
  assert.equal(p.advance(), p.steps().length - 1); // clamped
  p.setIndex(0);
  assert.equal(p.back(), 0); // clamped
});

test('setSteps replaces the list and clamps index into range', () => {
  const p = createPhaseState({ steps: ['A', 'B', 'C'], index: 2 });
  p.setSteps(['X']);
  assert.deepEqual(p.steps(), ['X']);
  assert.equal(p.index(), 0);
  assert.equal(p.label(), 'X');
});

test('setSteps ignores empty / non-string lists', () => {
  const p = createPhaseState();
  assert.equal(p.setSteps([]), false);
  assert.equal(p.setSteps(['ok', 5]), false);
  assert.deepEqual(p.steps(), DEFAULT_STEPS);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test brett/test/phases.test.mjs`
Expected: FAIL — `Cannot find module '.../coaching/phases.mjs'`

- [ ] **Step 3: Write minimal implementation**

```js
// brett/public/assets/coaching/phases.mjs
export const DEFAULT_STEPS = ['Aufstellen', 'Wahrnehmen', 'Verändern', 'Abschluss'];

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

export function createPhaseState({ steps = DEFAULT_STEPS, index = 0 } = {}) {
  let _steps = Array.isArray(steps) && steps.length ? steps.slice() : DEFAULT_STEPS.slice();
  let _index = clamp(index | 0, 0, _steps.length - 1);
  return {
    steps: () => _steps.slice(),
    index: () => _index,
    label: () => _steps[_index],
    advance() { _index = clamp(_index + 1, 0, _steps.length - 1); return _index; },
    back() { _index = clamp(_index - 1, 0, _steps.length - 1); return _index; },
    setIndex(n) { _index = clamp(n | 0, 0, _steps.length - 1); return _index; },
    setSteps(list) {
      if (!Array.isArray(list) || list.length === 0) return false;
      if (!list.every((s) => typeof s === 'string' && s.length)) return false;
      _steps = list.slice();
      _index = clamp(_index, 0, _steps.length - 1);
      return true;
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test brett/test/phases.test.mjs`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add brett/public/assets/coaching/phases.mjs brett/test/phases.test.mjs
git commit -m "feat(brett): coaching phase-step model [T000301]"
```

---

## Task 2: Presence roster module (`coaching/presence.mjs`)

Tracks who is in the room and which figure each holds. Names come from the SSO session.

**Files:**
- Create: `brett/public/assets/coaching/presence.mjs`
- Test: `brett/test/presence.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// brett/test/presence.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPresence, PRESENCE_PALETTE } from '../public/assets/coaching/presence.mjs';

test('join assigns a stable colour and lists participants', () => {
  const pr = createPresence();
  pr.join({ userId: 'u1', name: 'Coach' });
  pr.join({ userId: 'u2', name: 'Anna' });
  const list = pr.list();
  assert.equal(list.length, 2);
  assert.equal(list[0].color, PRESENCE_PALETTE[0]);
  assert.equal(list[1].color, PRESENCE_PALETTE[1]);
});

test('re-join is idempotent (same userId keeps one entry + colour)', () => {
  const pr = createPresence();
  pr.join({ userId: 'u1', name: 'Coach' });
  const c1 = pr.get('u1').color;
  pr.join({ userId: 'u1', name: 'Coach Renamed' });
  assert.equal(pr.list().length, 1);
  assert.equal(pr.get('u1').color, c1);
  assert.equal(pr.get('u1').name, 'Coach Renamed');
});

test('leave removes the participant and clears their holds', () => {
  const pr = createPresence();
  pr.join({ userId: 'u1', name: 'Coach' });
  pr.setHold('fig-1', 'u1');
  pr.leave('u1');
  assert.equal(pr.list().length, 0);
  assert.equal(pr.holderOf('fig-1'), null);
});

test('setHold / clearHold track who holds which figure', () => {
  const pr = createPresence();
  pr.join({ userId: 'u1', name: 'Coach' });
  pr.setHold('fig-1', 'u1');
  assert.equal(pr.holderOf('fig-1'), 'u1');
  pr.clearHold('fig-1');
  assert.equal(pr.holderOf('fig-1'), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test brett/test/presence.test.mjs`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```js
// brett/public/assets/coaching/presence.mjs
export const PRESENCE_PALETTE = ['#4ea1ff', '#3fb950', '#f0a35e', '#c06be0', '#e06b8b', '#6be0d0'];

export function createPresence() {
  const people = new Map();   // userId -> { userId, name, color }
  const holds = new Map();     // figureId -> userId
  let nextColor = 0;
  return {
    join({ userId, name }) {
      if (!userId) return;
      if (people.has(userId)) { people.get(userId).name = name; return; }
      const color = PRESENCE_PALETTE[nextColor % PRESENCE_PALETTE.length];
      nextColor++;
      people.set(userId, { userId, name: name || userId, color });
    },
    leave(userId) {
      people.delete(userId);
      for (const [fig, owner] of holds) if (owner === userId) holds.delete(fig);
    },
    get(userId) { return people.get(userId) || null; },
    list() { return [...people.values()]; },
    setHold(figureId, userId) { holds.set(figureId, userId); },
    clearHold(figureId) { holds.delete(figureId); },
    holderOf(figureId) { return holds.get(figureId) || null; },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test brett/test/presence.test.mjs`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add brett/public/assets/coaching/presence.mjs brett/test/presence.test.mjs
git commit -m "feat(brett): coaching presence roster module [T000301]"
```

---

## Task 3: Soft-lock model module (`coaching/locks.mjs`)

Client-side mirror of the server-authoritative figure locks (for rendering the lock/owner badge).

**Files:**
- Create: `brett/public/assets/coaching/locks.mjs`
- Test: `brett/test/locks.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// brett/test/locks.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocks } from '../public/assets/coaching/locks.mjs';

test('acquire grants only when unheld', () => {
  const l = createLocks();
  assert.equal(l.acquire('fig-1', { userId: 'u1', name: 'A', color: '#fff' }), true);
  assert.equal(l.acquire('fig-1', { userId: 'u2', name: 'B', color: '#000' }), false);
  assert.equal(l.owner('fig-1').userId, 'u1');
});

test('release only by the owner', () => {
  const l = createLocks();
  l.acquire('fig-1', { userId: 'u1', name: 'A', color: '#fff' });
  assert.equal(l.release('fig-1', 'u2'), false);
  assert.equal(l.release('fig-1', 'u1'), true);
  assert.equal(l.owner('fig-1'), null);
});

test('releaseAllFor drops every lock held by a user', () => {
  const l = createLocks();
  l.acquire('fig-1', { userId: 'u1', name: 'A', color: '#fff' });
  l.acquire('fig-2', { userId: 'u1', name: 'A', color: '#fff' });
  l.acquire('fig-3', { userId: 'u2', name: 'B', color: '#000' });
  l.releaseAllFor('u1');
  assert.equal(l.owner('fig-1'), null);
  assert.equal(l.owner('fig-2'), null);
  assert.equal(l.owner('fig-3').userId, 'u2');
});

test('replaceAll rehydrates from a snapshot list', () => {
  const l = createLocks();
  l.replaceAll([{ figureId: 'fig-9', userId: 'u5', name: 'Z', color: '#abc' }]);
  assert.equal(l.owner('fig-9').userId, 'u5');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test brett/test/locks.test.mjs`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```js
// brett/public/assets/coaching/locks.mjs
export function createLocks() {
  const locks = new Map(); // figureId -> { userId, name, color }
  return {
    acquire(figureId, owner) {
      if (locks.has(figureId)) return false;
      locks.set(figureId, { userId: owner.userId, name: owner.name, color: owner.color });
      return true;
    },
    release(figureId, userId) {
      const cur = locks.get(figureId);
      if (!cur || cur.userId !== userId) return false;
      locks.delete(figureId);
      return true;
    },
    releaseAllFor(userId) {
      for (const [fig, o] of locks) if (o.userId === userId) locks.delete(fig);
    },
    owner(figureId) { return locks.get(figureId) || null; },
    list() { return [...locks.entries()].map(([figureId, o]) => ({ figureId, ...o })); },
    replaceAll(arr) {
      locks.clear();
      for (const e of arr || []) locks.set(e.figureId, { userId: e.userId, name: e.name, color: e.color });
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test brett/test/locks.test.mjs`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add brett/public/assets/coaching/locks.mjs brett/test/locks.test.mjs
git commit -m "feat(brett): coaching soft-lock model module [T000301]"
```

---

## Task 4: Brand-aware persons filter (`coaching/brand.mjs`)

Pure filter that hides brand-tagged characters. The 5 korczewski portraits are tagged `brand: 'korczewski'`.

**Files:**
- Create: `brett/public/assets/coaching/brand.mjs`
- Test: `brett/test/brand-persons.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// brett/test/brand-persons.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterPersonsForBrand } from '../public/assets/coaching/brand.mjs';

const PERSONS = [
  { key: 'portrait-patrick', label: 'Patrick', brand: 'korczewski' },
  { key: 'portrait-oskar', label: 'Oskar', brand: 'korczewski' },
  { key: 'generic-1', label: 'Generic' },
];

test('mentolder hides korczewski-tagged persons', () => {
  const out = filterPersonsForBrand(PERSONS, 'mentolder');
  assert.deepEqual(out.map((p) => p.key), ['generic-1']);
});

test('korczewski shows its own persons + untagged', () => {
  const out = filterPersonsForBrand(PERSONS, 'korczewski');
  assert.deepEqual(out.map((p) => p.key), ['portrait-patrick', 'portrait-oskar', 'generic-1']);
});

test('unknown/undefined brand fails safe — hides all brand-tagged persons', () => {
  const out = filterPersonsForBrand(PERSONS, undefined);
  assert.deepEqual(out.map((p) => p.key), ['generic-1']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test brett/test/brand-persons.test.mjs`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```js
// brett/public/assets/coaching/brand.mjs
// A person with no `brand` is shown everywhere. A brand-tagged person is shown
// only on its own brand. Unknown brand fails safe (hides brand-tagged persons).
export function filterPersonsForBrand(persons, brand) {
  return (persons || []).filter((p) => !p.brand || p.brand === brand);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test brett/test/brand-persons.test.mjs`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add brett/public/assets/coaching/brand.mjs brett/test/brand-persons.test.mjs
git commit -m "feat(brett): brand-aware persons filter [T000301]"
```

---

## Task 5: Server exposes brand via `/api/config`

`buildConfig` is asserted with `deepStrictEqual` in existing tests — DO NOT add fields to it. Add a separate `resolveBrand(env)` and merge it in the route.

**Files:**
- Modify: `brett/server.js` — `/api/config` route (line ~245) + `module.exports` (line ~1492)
- Test: `brett/test/brand-config.test.js`

- [ ] **Step 1: Write the failing test**

```js
// brett/test/brand-config.test.js
'use strict';
process.env.MOCK_DB = 'true';
const test = require('node:test');
const assert = require('node:assert');
const { resolveBrand } = require('../server.js');

test('resolveBrand defaults to mentolder', () => {
  assert.strictEqual(resolveBrand({}), 'mentolder');
});
test('resolveBrand reads BRETT_BRAND', () => {
  assert.strictEqual(resolveBrand({ BRETT_BRAND: 'korczewski' }), 'korczewski');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test brett/test/brand-config.test.js`
Expected: FAIL — `resolveBrand is not a function`

- [ ] **Step 3: Implement**

Add near `buildConfig` (after line ~243):

```js
function resolveBrand(env) {
  return env.BRETT_BRAND || 'mentolder';
}
```

Replace the `/api/config` route (line ~245):

```js
app.get('/api/config', (_req, res) =>
  res.json({ ...buildConfig(process.env), brand: resolveBrand(process.env) }));
```

Add `resolveBrand,` to `module.exports` (line ~1492 block).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test brett/test/brand-config.test.js`
Expected: PASS (2 tests)

Also re-run the existing config test to prove no regression:
Run: `node --test brett/test/server-config.test.js`
Expected: PASS (4 tests, unchanged)

- [ ] **Step 5: Commit**

```bash
git add brett/server.js brett/test/brand-config.test.js
git commit -m "feat(brett): expose brand via /api/config [T000301]"
```

---

## Task 6: Coaching-board auth gate

Coaching deployments (`defaultMode === 'coaching'`) require an authenticated session to load the board. Mayhem deployments stay public. Extract the decision into a pure exported function.

**Files:**
- Modify: `brett/server.js` — add `boardAuthRedirect`, a gate middleware before `express.static` (line ~225), exports
- Test: `brett/test/board-auth.test.js`

- [ ] **Step 1: Write the failing test**

```js
// brett/test/board-auth.test.js
'use strict';
process.env.MOCK_DB = 'true';
const test = require('node:test');
const assert = require('node:assert');
const { boardAuthRedirect } = require('../server.js');

test('coaching deployment + no session → redirect to login with returnTo', () => {
  const r = boardAuthRedirect({ session: {}, path: '/' }, { /* coaching default */ });
  assert.strictEqual(r, '/auth/login?returnTo=%2F');
});
test('coaching deployment + authenticated session → no redirect', () => {
  const r = boardAuthRedirect({ session: { userId: 'u1' }, path: '/' }, {});
  assert.strictEqual(r, null);
});
test('mayhem deployment → never gates', () => {
  const r = boardAuthRedirect({ session: {}, path: '/' }, { BRETT_DEFAULT_MODE: 'mayhem' });
  assert.strictEqual(r, null);
});
test('e2e secret header bypasses the gate', () => {
  const r = boardAuthRedirect(
    { session: {}, path: '/', header: () => 'sekret' },
    { BRETT_OIDC_SECRET: 'sekret' });
  assert.strictEqual(r, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test brett/test/board-auth.test.js`
Expected: FAIL — `boardAuthRedirect is not a function`

- [ ] **Step 3: Implement**

Add after `resolveBrand` (Task 5):

```js
// Returns a redirect URL when the coaching board must be gated, else null.
function boardAuthRedirect(req, env) {
  if (buildConfig(env).defaultMode !== 'coaching') return null; // mayhem stays public
  if (req.session && req.session.userId) return null;
  const e2eSecret = env.BRETT_OIDC_SECRET;
  if (e2eSecret && typeof req.header === 'function' && req.header('x-e2e-secret') === e2eSecret) return null;
  const returnTo = encodeURIComponent(req.path || '/');
  return `/auth/login?returnTo=${returnTo}`;
}
```

Insert the gate middleware **before** `app.use(express.static(...))` (line ~225) — it must guard the HTML board only:

```js
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path !== '/' && req.path !== '/index.html') return next();
  const redirect = boardAuthRedirect(req, process.env);
  if (redirect) return res.redirect(redirect);
  next();
});
```

Add `boardAuthRedirect,` to `module.exports`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test brett/test/board-auth.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add brett/server.js brett/test/board-auth.test.js
git commit -m "feat(brett): gate coaching board behind SSO session [T000301]"
```

---

## Task 7: Server — coach-defined steps mutation + snapshot

Persist `{steps, index}` as a `__coaching_steps__` sentinel; broadcast `coaching_steps_change`; include in snapshot + DB state + join hydration.

**Files:**
- Modify: `brett/server.js` — `applyMutation` (add case), `buildStateFromMutations` SPECIAL + result, snapshot blocks (lines ~1145 and ~1075), join hydration (line ~1119), admin dispatch (`ADMIN_TYPES` line ~1305 + a `case`)
- Test: `brett/test/coaching-steps.test.js`

- [ ] **Step 1: Write the failing test**

```js
// brett/test/coaching-steps.test.js
'use strict';
process.env.MOCK_DB = 'true';
const test = require('node:test');
const assert = require('node:assert');
const { applyMutation, buildStateFromMutations } = require('../server.js');

test('coaching_steps_set persists steps+index and stays out of figures', () => {
  const room = 'steps-test-1';
  applyMutation(room, { type: 'add', figure: { id: 'f1', x: 0, z: 0 } });
  applyMutation(room, { type: 'coaching_steps_set', steps: ['A', 'B'], index: 1 });
  const state = buildStateFromMutations(room);
  assert.deepStrictEqual(state.coachingSteps, { steps: ['A', 'B'], index: 1 });
  assert.strictEqual(state.figures.length, 1);
  assert.ok(!state.figures.find((f) => f.id === '__coaching_steps__'));
});

test('coaching_steps_set ignores invalid payloads', () => {
  const room = 'steps-test-2';
  applyMutation(room, { type: 'coaching_steps_set', steps: 'nope', index: 0 });
  const state = buildStateFromMutations(room);
  assert.strictEqual(state.coachingSteps, undefined);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test brett/test/coaching-steps.test.js`
Expected: FAIL — `state.coachingSteps` is undefined in test 1

- [ ] **Step 3: Implement**

In `applyMutation`, add a case alongside the other `session_*_set` cases (after line ~943):

```js
    case 'coaching_steps_set': {
      if (Array.isArray(msg.steps) && msg.steps.length &&
          msg.steps.every((s) => typeof s === 'string' && s.length)) {
        const idx = Math.max(0, Math.min((msg.index | 0), msg.steps.length - 1));
        figs.set('__coaching_steps__', { id: '__coaching_steps__', steps: msg.steps.slice(), index: idx });
      }
      break;
    }
```

In `buildStateFromMutations`: add `'__coaching_steps__'` to the `SPECIAL` array (line ~970), then after the `lastActivityEntry` handling add:

```js
  const coachingStepsEntry = figs.get('__coaching_steps__');
  if (coachingStepsEntry) result.coachingSteps = { steps: coachingStepsEntry.steps, index: coachingStepsEntry.index };
```

In the **join** snapshot (line ~1145) and **request_state_snapshot** snapshot (line ~1075), add `coachingSteps: state.coachingSteps,` to the emitted object.

In **join hydration** (after line ~1137, the `sessionLastActivity` block):

```js
          if (state.coachingSteps && Array.isArray(state.coachingSteps.steps)) {
            figs.set('__coaching_steps__', {
              id: '__coaching_steps__',
              steps: state.coachingSteps.steps,
              index: state.coachingSteps.index | 0,
            });
          }
```

In **admin dispatch**: add `'admin_coaching_steps_set'` to the `ADMIN_TYPES` array (line ~1305), then add a `case` in that switch:

```js
          case 'admin_coaching_steps_set': {
            applyMutation(adminRoom, { type: 'coaching_steps_set', steps: msg.steps, index: msg.index });
            broadcast(adminRoom, { type: 'coaching_steps_change', steps: msg.steps, index: msg.index });
            schedulePersist(adminRoom);
            break;
          }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test brett/test/coaching-steps.test.js`
Expected: PASS (2 tests)
Run: `node --test brett/test/session-state.test.js` — Expected: PASS (no regression on SPECIAL filtering)

- [ ] **Step 5: Commit**

```bash
git add brett/server.js brett/test/coaching-steps.test.js
git commit -m "feat(brett): admin coach-defined session steps [T000301]"
```

---

## Task 8: Server — figure soft-lock (authoritative) + auto-release

**Files:**
- Modify: `brett/server.js` — new lock map + functions (near `figureMaps`, line ~840), WS handlers for `figure_lock`/`figure_unlock` (in the message loop, before the `RELAY_TYPES` block ~1236), close handler (line ~1421), snapshot blocks, exports
- Test: `brett/test/figure-locks.test.js`

- [ ] **Step 1: Write the failing test**

```js
// brett/test/figure-locks.test.js
'use strict';
process.env.MOCK_DB = 'true';
const test = require('node:test');
const assert = require('node:assert');
const { acquireFigureLock, releaseFigureLock, releaseLocksForUser, listFigureLocks } = require('../server.js');

test('lock is granted once then denied until released', () => {
  const room = 'lock-test-1';
  assert.strictEqual(acquireFigureLock(room, 'f1', { userId: 'u1', name: 'A', color: '#fff' }), true);
  assert.strictEqual(acquireFigureLock(room, 'f1', { userId: 'u2', name: 'B', color: '#000' }), false);
  assert.strictEqual(releaseFigureLock(room, 'f1', 'u2'), false); // wrong owner
  assert.strictEqual(releaseFigureLock(room, 'f1', 'u1'), true);
  assert.strictEqual(acquireFigureLock(room, 'f1', { userId: 'u2', name: 'B', color: '#000' }), true);
});

test('releaseLocksForUser frees everything that user held', () => {
  const room = 'lock-test-2';
  acquireFigureLock(room, 'f1', { userId: 'u1', name: 'A', color: '#fff' });
  acquireFigureLock(room, 'f2', { userId: 'u1', name: 'A', color: '#fff' });
  releaseLocksForUser(room, 'u1');
  assert.strictEqual(listFigureLocks(room).length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test brett/test/figure-locks.test.js`
Expected: FAIL — `acquireFigureLock is not a function`

- [ ] **Step 3: Implement**

Add near `const figureMaps = new Map();` (line ~840):

```js
const figureLocks = new Map(); // roomToken -> Map<figureId, { userId, name, color }>
function ensureFigureLocks(room) {
  if (!figureLocks.has(room)) figureLocks.set(room, new Map());
  return figureLocks.get(room);
}
function acquireFigureLock(room, figureId, owner) {
  const m = ensureFigureLocks(room);
  if (m.has(figureId)) return false;
  m.set(figureId, { userId: owner.userId, name: owner.name, color: owner.color });
  return true;
}
function releaseFigureLock(room, figureId, userId) {
  const m = figureLocks.get(room);
  const cur = m && m.get(figureId);
  if (!cur || cur.userId !== userId) return false;
  m.delete(figureId);
  return true;
}
function releaseLocksForUser(room, userId) {
  const m = figureLocks.get(room);
  if (!m) return;
  for (const [fig, o] of m) if (o.userId === userId) m.delete(fig);
}
function listFigureLocks(room) {
  const m = figureLocks.get(room);
  if (!m) return [];
  return [...m.entries()].map(([figureId, o]) => ({ figureId, ...o }));
}
```

In the WS message loop, add before the `if (RELAY_TYPES.includes(msg.type))` block (line ~1236):

```js
      if (msg.type === 'figure_lock' && typeof msg.id === 'string') {
        const owner = {
          userId: ws._session?.userId || ws._playerId || 'anon',
          name: ws._session?.name || 'Teilnehmer',
          color: msg.color || '#4ea1ff',
        };
        if (acquireFigureLock(room, msg.id, owner)) {
          broadcast(room, { type: 'figure_locked', id: msg.id, userId: owner.userId, name: owner.name, color: owner.color });
        } else {
          try { ws.send(JSON.stringify({ type: 'figure_lock_denied', id: msg.id })); } catch {}
        }
        return;
      }
      if (msg.type === 'figure_unlock' && typeof msg.id === 'string') {
        const uid = ws._session?.userId || ws._playerId || 'anon';
        if (releaseFigureLock(room, msg.id, uid)) {
          broadcast(room, { type: 'figure_unlocked', id: msg.id });
        }
        return;
      }
```

In the `ws.on('close', ...)` handler (line ~1421), inside `handleDisconnect` aftermath, add after `const room = ws._room;` guard:

```js
    if (room) {
      const uid = ws._session?.userId || ws._playerId;
      if (uid) {
        releaseLocksForUser(room, uid);
        broadcast(room, { type: 'locks_released_for', userId: uid });
      }
    }
```

In both snapshot emit blocks (join ~1145 and request_state_snapshot ~1075), add `locks: listFigureLocks(ws._room),` (join) / `locks: listFigureLocks(room),` (request_state_snapshot).

Add `acquireFigureLock, releaseFigureLock, releaseLocksForUser, listFigureLocks,` to `module.exports`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test brett/test/figure-locks.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add brett/server.js brett/test/figure-locks.test.js
git commit -m "feat(brett): server-authoritative figure soft-locks [T000301]"
```

---

## Task 9: Server — participant presence

Register the SSO identity as a participant on join; broadcast join/leave; include roster in snapshot.

**Files:**
- Modify: `brett/server.js` — participant map + functions (near `figureLocks`), join handler (line ~1095), close handler, snapshot blocks, exports
- Test: `brett/test/participants.test.js`

- [ ] **Step 1: Write the failing test**

```js
// brett/test/participants.test.js
'use strict';
process.env.MOCK_DB = 'true';
const test = require('node:test');
const assert = require('node:assert');
const { addParticipant, removeParticipant, listParticipants } = require('../server.js');

test('addParticipant is idempotent per userId and assigns a colour', () => {
  const room = 'part-test-1';
  addParticipant(room, { userId: 'u1', name: 'Coach' });
  addParticipant(room, { userId: 'u1', name: 'Coach' });
  addParticipant(room, { userId: 'u2', name: 'Anna' });
  const list = listParticipants(room);
  assert.strictEqual(list.length, 2);
  assert.ok(list[0].color);
  assert.notStrictEqual(list[0].color, list[1].color);
});

test('removeParticipant drops the entry', () => {
  const room = 'part-test-2';
  addParticipant(room, { userId: 'u1', name: 'Coach' });
  removeParticipant(room, 'u1');
  assert.strictEqual(listParticipants(room).length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test brett/test/participants.test.js`
Expected: FAIL — `addParticipant is not a function`

- [ ] **Step 3: Implement**

Add near `figureLocks` (line ~840):

```js
const PARTICIPANT_PALETTE = ['#4ea1ff', '#3fb950', '#f0a35e', '#c06be0', '#e06b8b', '#6be0d0'];
const roomParticipants = new Map(); // roomToken -> Map<userId, { userId, name, color }>
function addParticipant(room, { userId, name }) {
  if (!userId) return null;
  if (!roomParticipants.has(room)) roomParticipants.set(room, new Map());
  const m = roomParticipants.get(room);
  if (m.has(userId)) { m.get(userId).name = name || m.get(userId).name; return m.get(userId); }
  const color = PARTICIPANT_PALETTE[m.size % PARTICIPANT_PALETTE.length];
  const p = { userId, name: name || userId, color };
  m.set(userId, p);
  return p;
}
function removeParticipant(room, userId) {
  const m = roomParticipants.get(room);
  if (m) m.delete(userId);
}
function listParticipants(room) {
  const m = roomParticipants.get(room);
  return m ? [...m.values()] : [];
}
```

In the **join** handler, right after `broadcastInfo(msg.room);` (line ~1162) and before `return;`:

```js
        if (ws._session?.userId) {
          const p = addParticipant(msg.room, { userId: ws._session.userId, name: ws._session.name });
          if (p) broadcast(msg.room, { type: 'presence_join', ...p });
        }
```

In the `ws.on('close')` handler, alongside the lock release (Task 8):

```js
      if (uid && ws._session?.userId) {
        removeParticipant(room, ws._session.userId);
        broadcast(room, { type: 'presence_leave', userId: ws._session.userId });
      }
```

In both snapshot emit blocks, add `participants: listParticipants(<room>),` (use `ws._room` in join, `room` in request_state_snapshot).

Add `addParticipant, removeParticipant, listParticipants,` to `module.exports`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test brett/test/participants.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add brett/server.js brett/test/participants.test.js
git commit -m "feat(brett): participant presence roster (server) [T000301]"
```

---

## Task 10: Server — join-by-code endpoint + label persistence guard

`GET /api/join?code=` resolves a session code to its room and redirects. Also add a regression test proving figure `label` already persists through `add`/`update` (it relies on the generic spread, so we lock that behaviour in).

**Files:**
- Modify: `brett/server.js` — add `resolveJoinTarget` + `GET /api/join` route (after `/api/config`), exports
- Test: `brett/test/join-code.test.js`, `brett/test/figure-label.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// brett/test/join-code.test.js
'use strict';
process.env.MOCK_DB = 'true';
const test = require('node:test');
const assert = require('node:assert');
const { registerSessionCode, resolveJoinTarget } = require('../server.js');

test('resolveJoinTarget redirects a known code to its room', () => {
  registerSessionCode('ABC-DEF', 'room-xyz');
  assert.deepStrictEqual(resolveJoinTarget('ABC-DEF'), { redirect: '/?room=room-xyz' });
});
test('resolveJoinTarget errors on unknown code', () => {
  assert.deepStrictEqual(resolveJoinTarget('ZZZ-ZZZ'), { error: 'unknown-code' });
});
test('resolveJoinTarget errors on malformed code', () => {
  assert.deepStrictEqual(resolveJoinTarget('garbage'), { error: 'unknown-code' });
});
```

```js
// brett/test/figure-label.test.js
'use strict';
process.env.MOCK_DB = 'true';
const test = require('node:test');
const assert = require('node:assert');
const { applyMutation, buildStateFromMutations } = require('../server.js');

test('label rides along on add and persists', () => {
  const room = 'label-test-1';
  applyMutation(room, { type: 'add', figure: { id: 'f1', x: 0, z: 0, label: 'Mutter' } });
  assert.strictEqual(buildStateFromMutations(room).figures.find((f) => f.id === 'f1').label, 'Mutter');
});
test('label updates via update.changes', () => {
  const room = 'label-test-2';
  applyMutation(room, { type: 'add', figure: { id: 'f1', x: 0, z: 0 } });
  applyMutation(room, { type: 'update', id: 'f1', changes: { label: 'Vater' } });
  assert.strictEqual(buildStateFromMutations(room).figures.find((f) => f.id === 'f1').label, 'Vater');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test brett/test/join-code.test.js` — Expected: FAIL (`resolveJoinTarget is not a function`)
Run: `node --test brett/test/figure-label.test.js` — Expected: PASS already (proves the server side needs no change) OR FAIL if a regression exists. If it PASSES, keep it as a guard and proceed.

- [ ] **Step 3: Implement join endpoint**

Add after the `/api/config` route:

```js
function resolveJoinTarget(code) {
  const room = typeof code === 'string' ? resolveSessionCode(code) : null;
  return room ? { redirect: `/?room=${room}` } : { error: 'unknown-code' };
}

app.get('/api/join', (req, res) => {
  const result = resolveJoinTarget(req.query.code);
  if (result.redirect) return res.redirect(result.redirect);
  return res.status(404).type('text/plain').send('Unbekannter oder abgelaufener Session-Code.');
});
```

Add `resolveJoinTarget,` to `module.exports`. (No server change needed for labels — the `add`/`update` spread already carries `label`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test brett/test/join-code.test.js` — Expected: PASS (3)
Run: `node --test brett/test/figure-label.test.js` — Expected: PASS (2)

- [ ] **Step 5: Commit**

```bash
git add brett/server.js brett/test/join-code.test.js brett/test/figure-label.test.js
git commit -m "feat(brett): /api/join by session code + label persistence guard [T000301]"
```

---

## Task 11: Single-WebSocket gate (`coaching/ws-gate.mjs`) + wire into main.js

Coaching mode must use exactly one WebSocket. `ws.mjs`'s connection is gated to mayhem mode only; the inline `connectWS()` in `index.html` remains the sole coaching connection.

**Files:**
- Create: `brett/public/assets/coaching/ws-gate.mjs`
- Modify: `brett/public/assets/main.js` (gate the `ws.mjs` `connect()` call)
- Test: `brett/test/ws-gate.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// brett/test/ws-gate.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldConnectAuxWs } from '../public/assets/coaching/ws-gate.mjs';

test('aux ws.mjs connection only runs in mayhem mode', () => {
  assert.equal(shouldConnectAuxWs('mayhem'), true);
  assert.equal(shouldConnectAuxWs('coaching'), false);
  assert.equal(shouldConnectAuxWs('mode-select'), false);
  assert.equal(shouldConnectAuxWs(undefined), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test brett/test/ws-gate.test.mjs`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```js
// brett/public/assets/coaching/ws-gate.mjs
// The inline connectWS() in index.html is the single coaching connection.
// ws.mjs should only open a second socket in mayhem mode.
export function shouldConnectAuxWs(mode) {
  return mode === 'mayhem';
}
```

In `brett/public/assets/main.js`, locate the `connect(...)` call from `ws.mjs` (grep: `import { connect`). Wrap it so it only runs when `shouldConnectAuxWs(chosen)` is true:

```js
import { shouldConnectAuxWs } from './coaching/ws-gate.mjs';
// ... where ws.mjs connect() was called unconditionally:
if (shouldConnectAuxWs(chosen)) {
  connect(/* existing args unchanged */);
}
```

(If `main.js` does not currently call `ws.mjs`'s `connect()`, confirm via `grep -n "connect(" brett/public/assets/main.js` and gate whichever call opens the second `/sync` socket. Document the exact line touched in the commit body.)

- [ ] **Step 4: Run test + manual smoke**

Run: `node --test brett/test/ws-gate.test.mjs` — Expected: PASS
Manual (during Task 17 dev-iterate): open the coaching board, DevTools → Network → WS — confirm **one** `/sync` socket, not two.

- [ ] **Step 5: Commit**

```bash
git add brett/public/assets/coaching/ws-gate.mjs brett/public/assets/main.js brett/test/ws-gate.test.mjs
git commit -m "fix(brett): single WebSocket in coaching mode [T000301]"
```

---

## Task 12: HUD view-model (`coaching/hud-model.mjs`)

Pure mapping from session state → render model for the phase HUD + presence panel. Keeps the DOM code in `hud.mjs` thin and the logic testable.

**Files:**
- Create: `brett/public/assets/coaching/hud-model.mjs`
- Test: `brett/test/hud-model.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// brett/test/hud-model.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHudModel } from '../public/assets/coaching/hud-model.mjs';

test('builds phase line + participant rows; coach sees controls', () => {
  const m = buildHudModel({
    steps: ['Aufstellen', 'Wahrnehmen'], index: 1,
    participants: [{ userId: 'u1', name: 'Coach', color: '#fff' }],
    isAdmin: true,
  });
  assert.equal(m.phaseLabel, 'Wahrnehmen');
  assert.equal(m.phaseProgress, '2 / 2');
  assert.equal(m.showControls, true);
  assert.equal(m.participants.length, 1);
});

test('non-admin hides controls; empty steps yields a placeholder', () => {
  const m = buildHudModel({ steps: [], index: 0, participants: [], isAdmin: false });
  assert.equal(m.showControls, false);
  assert.equal(m.phaseLabel, '—');
  assert.equal(m.phaseProgress, '0 / 0');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test brett/test/hud-model.test.mjs`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```js
// brett/public/assets/coaching/hud-model.mjs
export function buildHudModel({ steps = [], index = 0, participants = [], isAdmin = false } = {}) {
  const total = steps.length;
  const safeIndex = total ? Math.max(0, Math.min(index, total - 1)) : 0;
  return {
    phaseLabel: total ? steps[safeIndex] : '—',
    phaseProgress: `${total ? safeIndex + 1 : 0} / ${total}`,
    canBack: isAdmin && safeIndex > 0,
    canAdvance: isAdmin && safeIndex < total - 1,
    showControls: !!isAdmin,
    participants: participants.map((p) => ({ name: p.name, color: p.color, userId: p.userId })),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test brett/test/hud-model.test.mjs`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add brett/public/assets/coaching/hud-model.mjs brett/test/hud-model.test.mjs
git commit -m "feat(brett): coaching HUD view-model [T000301]"
```

---

## Task 13: Coaching HUD renderer + wire (`coaching/hud.mjs`, `coaching/wire.mjs`)

Render the phase HUD + presence panel into the DOM, wired to the single WS via a thin `wire`. Loaded only in coaching mode. DOM behaviour is verified by Task 15 (isolation test) + Task 17 (dev-iterate) + E2E.

**Files:**
- Create: `brett/public/assets/coaching/wire.mjs`, `brett/public/assets/coaching/hud.mjs`
- Modify: `brett/public/index.html` — expose the inline `ws` for the wire; mount the HUD in coaching mode
- Test: covered indirectly (hud-model in Task 12; isolation in Task 15)

- [ ] **Step 1: Implement `wire.mjs`**

```js
// brett/public/assets/coaching/wire.mjs
// Thin adapter over the single coaching WebSocket exposed by index.html as window.__brettWS.
export function createWire(getSocket) {
  const handlers = new Map();
  function dispatch(msg) { (handlers.get(msg.type) || []).forEach((fn) => fn(msg)); }
  return {
    attach() {
      const ws = getSocket();
      if (!ws) return false;
      ws.addEventListener('message', (ev) => {
        let msg; try { msg = JSON.parse(ev.data); } catch { return; }
        dispatch(msg);
      });
      return true;
    },
    on(type, fn) { const a = handlers.get(type) || []; a.push(fn); handlers.set(type, a); },
    send(type, payload = {}) {
      const ws = getSocket();
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type, ...payload }));
    },
  };
}
```

- [ ] **Step 2: Implement `hud.mjs`** (renders phase HUD + presence panel; coach gets prev/next)

```js
// brett/public/assets/coaching/hud.mjs
import { buildHudModel } from './hud-model.mjs';
import { createPhaseState } from './phases.mjs';
import { createPresence } from './presence.mjs';

export function mountCoachingHud({ wire, isAdmin, root = document.body }) {
  const phase = createPhaseState();
  const presence = createPresence();

  const el = document.createElement('div');
  el.id = 'coaching-hud';
  el.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:50;' +
    'background:#161b22ee;border:1px solid #2a3340;border-radius:10px;padding:8px 14px;color:#e6edf3;' +
    'font:13px/1.3 system-ui,sans-serif;display:flex;gap:14px;align-items:center;';
  root.appendChild(el);

  const panel = document.createElement('div');
  panel.id = 'coaching-participants';
  panel.style.cssText = 'position:fixed;top:12px;right:12px;z-index:50;background:#161b22ee;' +
    'border:1px solid #2a3340;border-radius:10px;padding:8px 12px;color:#e6edf3;font:13px system-ui;min-width:140px;';
  root.appendChild(panel);

  function render() {
    const m = buildHudModel({ steps: phase.steps(), index: phase.index(), participants: presence.list(), isAdmin });
    el.innerHTML = '';
    const lbl = document.createElement('span');
    lbl.textContent = `Phase: ${m.phaseLabel} (${m.phaseProgress})`;
    el.appendChild(lbl);
    if (m.showControls) {
      const back = document.createElement('button'); back.textContent = '‹'; back.disabled = !m.canBack;
      const fwd = document.createElement('button'); fwd.textContent = '›'; fwd.disabled = !m.canAdvance;
      back.onclick = () => { phase.back(); pushSteps(); render(); };
      fwd.onclick = () => { phase.advance(); pushSteps(); render(); };
      el.appendChild(back); el.appendChild(fwd);
    }
    panel.innerHTML = '<strong>Teilnehmer</strong>';
    for (const p of m.participants) {
      const row = document.createElement('div');
      row.style.cssText = `margin-top:4px;border-left:3px solid ${p.color};padding-left:6px;`;
      row.textContent = p.name;
      panel.appendChild(row);
    }
  }
  function pushSteps() { wire.send('admin_coaching_steps_set', { steps: phase.steps(), index: phase.index() }); }

  wire.on('snapshot', (m) => {
    if (m.coachingSteps?.steps) phase.setSteps(m.coachingSteps.steps), phase.setIndex(m.coachingSteps.index | 0);
    for (const p of m.participants || []) presence.join(p);
    render();
  });
  wire.on('coaching_steps_change', (m) => { phase.setSteps(m.steps); phase.setIndex(m.index | 0); render(); });
  wire.on('presence_join', (m) => { presence.join(m); render(); });
  wire.on('presence_leave', (m) => { presence.leave(m.userId); render(); });

  render();
  return { render };
}
```

- [ ] **Step 3: Wire into `index.html`** — expose the inline socket and mount in coaching mode

In the inline `connectWS()` (line ~1345), after the socket is created (`ws = new WebSocket(...)`), add `window.__brettWS = ws;`. Then at the bottom of the inline script add a module-typed bootstrap (only when not mayhem):

```html
<script type="module">
  import { createWire } from '/assets/coaching/wire.mjs';
  import { mountCoachingHud } from '/assets/coaching/hud.mjs';
  const cfg = await fetch('/api/config').then((r) => r.json());
  if (cfg.defaultMode === 'coaching') {
    const me = await fetch('/auth/me').then((r) => r.json()).catch(() => ({}));
    const wire = createWire(() => window.__brettWS);
    const tryAttach = () => { if (!wire.attach()) setTimeout(tryAttach, 150); };
    tryAttach();
    mountCoachingHud({ wire, isAdmin: !!me.isAdmin });
  }
</script>
```

- [ ] **Step 4: Verify lint/parse**

Run: `node --check brett/server.js` (sanity) and re-run all brett unit tests:
`node --test brett/test/hud-model.test.mjs brett/test/phases.test.mjs brett/test/presence.test.mjs`
Expected: PASS. DOM behaviour verified in Task 15 + Task 17.

- [ ] **Step 5: Commit**

```bash
git add brett/public/assets/coaching/wire.mjs brett/public/assets/coaching/hud.mjs brett/public/index.html
git commit -m "feat(brett): coaching phase HUD + presence panel [T000301]"
```

---

## Task 14: Brand-gate the named-persons panel in `index.html`

Tag the 5 portraits with `brand:'korczewski'` and filter via the tested module before building the panel (dynamic import avoids the parse-time race).

**Files:**
- Modify: `brett/public/index.html` (lines ~1746 `NAMED_PERSONS`, ~1754 the IIFE)

- [ ] **Step 1: Tag the persons** — change `NAMED_PERSONS` (line ~1746) so every entry carries `brand: 'korczewski'`:

```js
  const NAMED_PERSONS = [
    { key: 'portrait-patrick',   label: 'Patrick',   color: '#6f8db8', brand: 'korczewski' },
    { key: 'portrait-christina', label: 'Christina', color: '#c06be0', brand: 'korczewski' },
    { key: 'portrait-papa',      label: 'Papa',      color: '#808080', brand: 'korczewski' },
    { key: 'portrait-martina',   label: 'Martina',   color: '#6be0a0', brand: 'korczewski' },
    { key: 'portrait-oskar',     label: 'Oskar',     color: '#c8a96e', brand: 'korczewski' },
  ];
```

- [ ] **Step 2: Gate the panel build** — convert the IIFE `(function buildPersonsPanel() { ... })()` (line ~1754) into a named function `function buildPersonsPanel(persons) {` that iterates `persons` instead of `NAMED_PERSONS`, then replace the immediate invocation with a brand-resolving bootstrap:

```js
  function buildPersonsPanel(persons) {
    const grid = document.getElementById('fig-panel-persons');
    if (!grid) return;
    grid.innerHTML = '';
    for (const p of persons) {
      /* ...unchanged button-building body, using p... */
    }
  }
  fetch('/api/config').then((r) => r.json()).then(async (cfg) => {
    const { filterPersonsForBrand } = await import('/assets/coaching/brand.mjs');
    buildPersonsPanel(filterPersonsForBrand(NAMED_PERSONS, cfg.brand));
  }).catch(() => buildPersonsPanel([])); // fail safe: hide brand-tagged persons
```

- [ ] **Step 3: Verify the filter unit test still passes**

Run: `node --test brett/test/brand-persons.test.mjs`
Expected: PASS. Visual confirmation in Task 17 (mentolder dev: no portraits; korczewski dev: all 5).

- [ ] **Step 4: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): hide korczewski named-persons on mentolder (UI) [T000301]"
```

---

## Task 15: Figure labels + soft-lock client wiring + isolation test

Send `label` in the `add` message, send an `update` when the label input changes, and request/observe soft-locks on grab/release. Extend the isolation test for the new HUD.

**Files:**
- Modify: `brett/public/index.html` (the `add` send ~1502, the `#fig-label-input` handler ~729, the drag grab/release in the pointer handlers)
- Modify: `brett/test/coaching-isolation.test.mjs`

- [ ] **Step 1: Extend the isolation test (write first, expect partial fail)**

Append to `brett/test/coaching-isolation.test.mjs`:

```js
test('index.html loads the coaching HUD bootstrap module', () => {
  assert.ok(
    html.includes("import { mountCoachingHud }") || html.includes("coaching/hud.mjs"),
    'coaching HUD module must be imported in index.html'
  );
});

test('named persons are brand-tagged so mentolder can hide them', () => {
  assert.ok(html.includes("brand: 'korczewski'"), 'NAMED_PERSONS entries must carry a brand tag');
});

test('add message carries the figure label', () => {
  // The add payload must include label so it syncs/persists.
  assert.ok(/type:\s*['"]add['"][\s\S]{0,400}label/.test(html), 'add payload should include label');
});
```

Run: `node --test brett/test/coaching-isolation.test.mjs`
Expected: FAIL on the new assertions (HUD import + add-label) until the edits below land. (HUD import passes if Task 13 is merged; add-label fails.)

- [ ] **Step 2: Send `label` in the `add` message** — at the `add` send (line ~1502), include `label`:

```js
    ws.send(JSON.stringify({ type: 'add', id: fig.id, x: fig.x, z: fig.z, appearance: fig.appearance, label: fig.label || '' }));
```

(The server already persists arbitrary figure fields — no server change.)

- [ ] **Step 3: Sync label edits** — in the `#fig-label-input` handler (line ~729), after `fig.label = ...`, broadcast an update:

```js
    fig.label = e.target.value;
    sendUpdate(fig, { label: fig.label });
```

Confirm `sendUpdate(fig, changes)` emits `{ type:'update', id, changes }`; if it only sends appearance, extend it to spread `changes` so `{ label }` is included.

- [ ] **Step 4: Soft-lock on grab/release** — in the pointer-down that begins dragging a figure, send `figure_lock`; on pointer-up send `figure_unlock`; on `figure_locked`/`figure_unlocked`/`figure_lock_denied` messages, set a visual state and block dragging a figure locked by someone else. Add to the inline message switch (near where `move`/`update` are handled):

```js
    else if (msg.type === 'figure_locked') { setFigureLockBadge(msg.id, msg.name, msg.color); }
    else if (msg.type === 'figure_unlocked') { clearFigureLockBadge(msg.id); }
    else if (msg.type === 'figure_lock_denied') { cancelDragFor(msg.id); }
    else if (msg.type === 'locks_released_for') { clearLockBadgesForUser(msg.userId); }
```

Implement `setFigureLockBadge/clearFigureLockBadge/cancelDragFor/clearLockBadgesForUser` as small DOM/scene helpers (a label sprite or outline on the mannequin). On drag start: `ws.send(JSON.stringify({ type:'figure_lock', id: fig.id }))` and only begin moving once not denied; on drag end: `ws.send(JSON.stringify({ type:'figure_unlock', id: fig.id }))`.

- [ ] **Step 5: Run isolation test + commit**

Run: `node --test brett/test/coaching-isolation.test.mjs`
Expected: PASS (all, including new assertions)

```bash
git add brett/public/index.html brett/test/coaching-isolation.test.mjs
git commit -m "feat(brett): sync figure labels + soft-lock client wiring [T000301]"
```

---

## Task 16: Join-by-code overlay (`coaching/join.mjs`)

A small overlay so a participant can enter a session code; submitting navigates to `/api/join?code=...` (which redirects into the room). The coach's code already arrives via the `session_created` WS message — surface it for sharing.

**Files:**
- Create: `brett/public/assets/coaching/join.mjs`
- Modify: `brett/public/index.html` (mount the overlay in coaching mode when no `?room=` is present; show the coach's code on `session_created`)
- Test: `brett/test/join-overlay.test.mjs` (pure helper)

- [ ] **Step 1: Write the failing test for the code-normaliser helper**

```js
// brett/test/join-overlay.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCode, joinUrl } from '../public/assets/coaching/join.mjs';

test('normalizeCode uppercases, strips spaces, inserts the dash', () => {
  assert.equal(normalizeCode('abc def'), 'ABC-DEF');
  assert.equal(normalizeCode('ABCDEF'), 'ABC-DEF');
  assert.equal(normalizeCode('abc-def'), 'ABC-DEF');
});

test('joinUrl builds the encoded endpoint', () => {
  assert.equal(joinUrl('ABC-DEF'), '/api/join?code=ABC-DEF');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test brett/test/join-overlay.test.mjs`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `join.mjs`**

```js
// brett/public/assets/coaching/join.mjs
export function normalizeCode(raw) {
  const s = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  return s.length === 6 ? `${s.slice(0, 3)}-${s.slice(3)}` : s;
}
export function joinUrl(code) {
  return `/api/join?code=${encodeURIComponent(code)}`;
}
export function mountJoinOverlay({ root = document.body, navigate = (u) => { window.location.href = u; } } = {}) {
  const wrap = document.createElement('div');
  wrap.id = 'coaching-join';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;' +
    'background:#0e1116ee;color:#e6edf3;font:15px system-ui;';
  wrap.innerHTML = '<div style="background:#161b22;border:1px solid #2a3340;border-radius:12px;padding:24px;min-width:280px">' +
    '<h2 style="margin:0 0 12px">Session beitreten</h2>' +
    '<input id="cj-code" placeholder="ABC-DEF" maxlength="7" ' +
    'style="width:100%;padding:10px;background:#0b0f14;border:1px solid #2a3340;border-radius:8px;color:#e6edf3;font:16px monospace">' +
    '<button id="cj-go" style="margin-top:12px;width:100%;padding:10px;border:0;border-radius:8px;background:#4ea1ff;color:#04111f;font-weight:600">Beitreten</button>' +
    '<p id="cj-err" style="color:#f0a35e;min-height:18px;margin:8px 0 0;font-size:13px"></p></div>';
  root.appendChild(wrap);
  const input = wrap.querySelector('#cj-code');
  input.addEventListener('input', () => { input.value = normalizeCode(input.value); });
  wrap.querySelector('#cj-go').addEventListener('click', () => {
    const code = normalizeCode(input.value);
    if (code.length !== 7) { wrap.querySelector('#cj-err').textContent = 'Bitte 6 Zeichen eingeben.'; return; }
    navigate(joinUrl(code));
  });
  return { remove: () => wrap.remove() };
}
```

- [ ] **Step 4: Mount in `index.html`** — in the coaching bootstrap module (Task 13), before mounting the HUD, show the overlay when there is no room yet:

```js
    const hasRoom = new URLSearchParams(location.search).has('room');
    if (!hasRoom) {
      const { mountJoinOverlay } = await import('/assets/coaching/join.mjs');
      mountJoinOverlay({});
    }
```

And on `session_created` (coach path), surface the code for sharing — add a `wire.on('session_created', ...)` that shows `code` in a small toast with the shareable link `${location.origin}/api/join?code=${code}`.

Run: `node --test brett/test/join-overlay.test.mjs` — Expected: PASS (2)

- [ ] **Step 5: Commit**

```bash
git add brett/public/assets/coaching/join.mjs brett/public/index.html brett/test/join-overlay.test.mjs
git commit -m "feat(brett): session-code join overlay [T000301]"
```

---

## Task 17: Deploy config — `BRETT_BRAND` env per cluster

**Files:**
- Modify: `k3d/brett.yaml` (add `BRETT_BRAND` env, default `mentolder`)
- Modify: `prod-korczewski/` overlay (set `BRETT_BRAND=korczewski` for the brett Deployment)

- [ ] **Step 1: Add the env to the base manifest** — in `k3d/brett.yaml`, in the brett container `env:` list, add:

```yaml
            - name: BRETT_BRAND
              value: "mentolder"
```

- [ ] **Step 2: Override in the korczewski overlay** — locate the brett patch in `prod-korczewski/` (grep: `grep -rn "brett" prod-korczewski/`). Add a strategic-merge or JSON patch setting `BRETT_BRAND=korczewski`. If the env already exists in base, use a JSON `op: replace` on the correct index (see CLAUDE.md gotcha) or a strategic-merge patch:

```yaml
# prod-korczewski/brett-brand-patch.yaml (referenced from kustomization.yaml patches)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: brett
spec:
  template:
    spec:
      containers:
        - name: brett
          env:
            - name: BRETT_BRAND
              value: "korczewski"
```

Register the patch in `prod-korczewski/kustomization.yaml` under `patches:`.

- [ ] **Step 3: Validate manifests**

Run: `task workspace:validate`
Expected: PASS (both overlays build). If `BRETT_BRAND` is referenced via `envsubst` anywhere, it is a static literal here — no envsubst var list change needed.

- [ ] **Step 4: Commit**

```bash
git add k3d/brett.yaml prod-korczewski/
git commit -m "feat(brett): BRETT_BRAND env (mentolder default, korczewski override) [T000301]"
```

---

## Task 18: Full brett test sweep + manifest validation

**Files:** none (verification task)

- [ ] **Step 1: Run the complete brett unit suite**

```bash
node --test \
  brett/test/phases.test.mjs brett/test/presence.test.mjs brett/test/locks.test.mjs \
  brett/test/brand-persons.test.mjs brett/test/ws-gate.test.mjs brett/test/hud-model.test.mjs \
  brett/test/join-overlay.test.mjs \
  brett/test/brand-config.test.js brett/test/board-auth.test.js brett/test/coaching-steps.test.js \
  brett/test/figure-locks.test.js brett/test/participants.test.js brett/test/join-code.test.js \
  brett/test/figure-label.test.js brett/test/coaching-isolation.test.js brett/test/session-state.test.js \
  brett/test/server-config.test.js
```
Expected: ALL PASS.

- [ ] **Step 2: Run the CI-relevant brett node tests named in CLAUDE.md** (regression guard)

```bash
npm ci --prefix brett
node --test brett/test/ws-reconnect.test.mjs brett/test/physics.test.js brett/test/mode-state.test.mjs
./scripts/tests/systembrett-template.test.sh
```
Expected: PASS.

- [ ] **Step 3: Offline + manifest validation**

```bash
task test:all
task workspace:validate
```
Expected: PASS.

- [ ] **Step 4: Commit (if any test inventory regenerated)**

```bash
task test:inventory && git diff --exit-code website/src/data/test-inventory.json || {
  git add website/src/data/test-inventory.json
  git commit -m "chore(tests): regenerate test inventory for brett coaching [T000301]"
}
```

---

## Self-Review Notes (author checklist — completed)

- **Spec coverage:** reliable sync → Task 11 (single WS) + Tasks 8/9 (authoritative lock/presence) + snapshot rehydration (7/8/9); presence → 2/9/12/13; coach-defined steps → 1/7/12/13; labels → 10/15; coaching-only UI → 13/15 (isolation); join flow → 10/16; SSO gate → 6; brand gating → 4/5/14/17; mobile → existing pointer events (HUD uses responsive fixed panels); edge cases (reconnect/auto-release/invalid code) → 8 (close) / 10 / snapshot.
- **Placeholders:** none — every code step shows the code; the one "confirm exact line" note (Task 11 `connect()` call site) is a verification instruction, not a code placeholder.
- **Type consistency:** owner objects use `{userId,name,color}` consistently across `locks.mjs`, server lock fns, and HUD; messages `coaching_steps_change`, `figure_locked/unlocked/lock_denied`, `presence_join/leave`, `locks_released_for` are produced (server) and consumed (hud/index) with matching shapes; snapshot adds `coachingSteps`, `participants`, `locks`.

## Verification before completion

After all tasks: 1 coach (admin) + a second authenticated browser join the same room; placing/moving a figure shows on both < 1s with exactly one `/sync` socket each; coach advances a step → both HUDs update; a label appears for both; the presence panel lists both names; on a mentolder dev deploy none of the 5 portraits appear in the figure panel; reconnect re-hydrates board + steps + locks. Full E2E is authored later via the `dev-flow-e2e` skill.
