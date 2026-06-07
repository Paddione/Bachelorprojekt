# Brett D — Possession-System & Observer-Modus — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a possession model where participants can "embody" figures and see the scene from their POV, plus explicit observer join.

**Architecture:** Figure-centric: `figure.possessor` field tracks who embodies a figure. Two new relay-gated mutations (`figure_possess`/`figure_release`). Auto-release on disconnect. Client-local POV camera with 600ms lerp to head-bone position. Observer toggle inline in existing lobby dialog.

**Tech Stack:** TypeScript, Three.js, ws, node:test, tsx/jsdom

**Ticket-ID:** null

---

## Meilenstein 1: Shared Types

### Task 1.1: FigureType enum + possessor auf Figure

**Files:**
- Modify: `brett/src/types/state.ts`

- [ ] **Step 1: Add FigureType enum and possessor field**

```typescript
// Add after the Role type:

export type FigureType = 'coachee' | 'team_active' | 'team_passive' | 'saboteur' | 'resource';

// Add to the Figure interface (after ownerId):
  /** Possession — who currently embodies this figure (playerId or null). */
  possessor?: string | null;
  /** Semantic figure type from the design system. */
  figureType?: FigureType;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS (no new errors beyond existing baseline)

- [ ] **Step 3: Commit**

```bash
git add brett/src/types/state.ts
git commit -m "feat(brett): add FigureType + possessor field to shared types [D-spec]"
```

### Task 1.2: Message types for possession + figure type

**Files:**
- Modify: `brett/src/types/messages.ts`

- [ ] **Step 1: Add ClientMessage variants**

Add to `ClientMessage` union:
```typescript
  | { type: 'figure_possess'; figureId: string }
  | { type: 'figure_release'; figureId?: string }
  | { type: 'figure_type_set'; figureId: string; figureType: FigureType }
```

Import `FigureType` from `./state` at the top.

- [ ] **Step 2: Add ServerMessage variants**

Add to `ServerMessage` union:
```typescript
  | { type: 'figure_possessed'; figureId: string; playerId: string; playerName?: string }
  | { type: 'figure_released'; figureId: string; playerId: string }
  | { type: 'figure_type_changed'; figureId: string; figureType: FigureType }
// Also add possessor to snapshot figures:
// (The snapshot type already carries Figure[] which now has possessor)
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add brett/src/types/messages.ts
git commit -m "feat(brett): add possession + figure_type message types [D-spec]"
```

---

## Meilenstein 2: Server — Possession Core

### Task 2.1: applyMutation für figure_possess / figure_release / figure_type_set

**Files:**
- Modify: `brett/src/server/figures.ts`

- [ ] **Step 1: Add mutation cases to applyMutation switch**

Add these cases inside the `switch (msg.type)` block in `applyMutation()`, before the default/fallthrough:

```typescript
    case 'figure_possess': {
      if (typeof msg.figureId === 'string' && figs.has(msg.figureId)) {
        const fig = figs.get(msg.figureId);
        // Gate: figure must not already have a possessor
        if (fig.possessor) break;
        figs.set(msg.figureId, { ...fig, possessor: msg.playerId });
      }
      break;
    }
    case 'figure_release': {
      if (typeof msg.figureId === 'string' && figs.has(msg.figureId)) {
        const fig = figs.get(msg.figureId);
        if (fig.possessor === msg.playerId) {
          figs.set(msg.figureId, { ...fig, possessor: null });
        }
      }
      break;
    }
    case 'figure_release_all': {
      // Release ALL figures possessed by a player (used on disconnect)
      for (const [fid, fig] of figs.entries()) {
        if (fig.possessor === msg.playerId) {
          figs.set(fid, { ...fig, possessor: null });
        }
      }
      break;
    }
    case 'figure_type_set': {
      if (typeof msg.figureId === 'string' && figs.has(msg.figureId) && msg.figureType) {
        const fig = figs.get(msg.figureId);
        figs.set(msg.figureId, { ...fig, figureType: msg.figureType });
      }
      break;
    }
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add brett/src/server/figures.ts
git commit -m "feat(brett): add possession + figure_type mutations to applyMutation [D-spec]"
```

### Task 2.2: Permissions — canMutate + MutationType erweitern

**Files:**
- Modify: `brett/src/server/permissions.ts`

- [ ] **Step 1: Add new mutation types to MutationType union**

```typescript
export type MutationType =
  | 'add' | 'move' | 'update' | 'jump' | 'delete'
  | 'clear' | 'stiffness' | 'snapshot' | 'request_state_snapshot'
  | 'figure_lock'
  | 'figure_possess' | 'figure_release';  // ← ADD
```

- [ ] **Step 2: Add possession to canMutate allow-list**

In the `switch (ctx.msgType)` block, add `case 'figure_possess':` and `case 'figure_release':` to the explicit allow-list (alongside `case 'figure_lock':`):

```typescript
    case 'figure_lock':
    case 'figure_possess':
    case 'figure_release':
      break;
```

- [ ] **Step 3: Allow beobachter to possess (transition Observer → possessor)**

Add a new block BEFORE `// beobachter ... → read-only`:

```typescript
  // beobachter may possess a free figure (transition Observer → possessor).
  // figure_release is also permitted for beobachter (own figure only — gate
  // in ws-handler enforces playerId match).
  if (ctx.role === 'beobachter') {
    if (ctx.msgType === 'figure_possess' || ctx.msgType === 'figure_release') {
      return true;
    }
    return false; // read-only for everything else
  }
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add brett/src/server/permissions.ts
git commit -m "feat(brett): add possession mutations to canMutate + MutationType [D-spec]"
```

### Task 2.3: ws-handler — figure_possess / figure_release routing

**Files:**
- Modify: `brett/src/server/ws-handler.ts`

- [ ] **Step 1: Add figure_possess/figure_release to RELAY_TYPES (actually NO — these are special)**

*Decision:* `figure_possess` and `figure_release` need custom handling (broadcast different message types, possessor gating). Add them as a NEW handler block alongside `figure_lock`/`figure_unlock` — NOT in RELAY_TYPES.

Add this block right after the `figure_unlock` handler (around line 337) and before `lobby_set_ready`:

```typescript
        // ── Possession ───────────────────────────────────────────────
        if (msg.type === 'figure_possess' && typeof msg.figureId === 'string') {
          if (!gateMutation(ws, room, 'figure_possess', msg.figureId, deps)) {
            try { ws.send(JSON.stringify({ type: 'error', reason: 'forbidden' })); } catch {}
            return;
          }
          // Gate: figure must not already have a possessor
          const figMap = deps.figureMaps.get(room);
          const existingFig = figMap?.get(msg.figureId);
          if (existingFig?.possessor) {
            try { ws.send(JSON.stringify({ type: 'error', reason: 'figure_already_possessed' })); } catch {}
            return;
          }
          const playerId = resolvePlayerId(ws);
          deps.applyMutation(room, { type: 'figure_possess', figureId: msg.figureId, playerId });
          deps.broadcast(room, {
            type: 'figure_possessed',
            figureId: msg.figureId,
            playerId,
            playerName: ws._session?.name || 'Teilnehmer',
          });
          deps.schedulePersist(room);
          return;
        }
        if (msg.type === 'figure_release') {
          // figureId optional — when omitted, release ALL own possessions
          const targetId = msg.figureId;
          if (!gateMutation(ws, room, 'figure_release', targetId, deps)) {
            try { ws.send(JSON.stringify({ type: 'error', reason: 'forbidden' })); } catch {}
            return;
          }
          const playerId = resolvePlayerId(ws);
          if (typeof targetId === 'string') {
            // Release specific figure — gate: must be own possession (or leiter)
            const figMap = deps.figureMaps.get(room);
            const fig = figMap?.get(targetId);
            const role = deps.resolveRole(ws, deps.buildStateFromMutations(room)?.roles || {});
            if (fig?.possessor !== playerId && role !== 'leiter') {
              try { ws.send(JSON.stringify({ type: 'error', reason: 'forbidden' })); } catch {}
              return;
            }
            deps.applyMutation(room, { type: 'figure_release', figureId: targetId, playerId });
            deps.broadcast(room, { type: 'figure_released', figureId: targetId, playerId });
          } else {
            // Release ALL — scan + release each possessed figure
            const figMap = deps.figureMaps.get(room);
            if (figMap) {
              for (const [fid, f] of figMap.entries()) {
                if (f.possessor === playerId) {
                  deps.applyMutation(room, { type: 'figure_release', figureId: fid, playerId });
                  deps.broadcast(room, { type: 'figure_released', figureId: fid, playerId });
                }
              }
            }
          }
          deps.schedulePersist(room);
          return;
        }
```

- [ ] **Step 2: Add figure_type_set to ADMIN_TYPES or as a leader-gated mutation**

Add to the `ADMIN_TYPES` Set (line 60-63):
```typescript
  'admin_set_template', 'admin_set_optik',
  'figure_type_set',  // ← ADD (leader-only via isAdmin gate)
]);
```

Add the handler in `ws-admin-commands.ts` or inline — for now, since it's simple, handle it inline after the `figure_release` block:

```typescript
        if (msg.type === 'figure_type_set' && typeof msg.figureId === 'string' && msg.figureType) {
          if (!ws._session?.isAdmin) {
            try { ws.send(JSON.stringify({ type: 'error', reason: 'forbidden' })); } catch {}
            return;
          }
          deps.applyMutation(room, { type: 'figure_type_set', figureId: msg.figureId, figureType: msg.figureType });
          deps.broadcast(room, { type: 'figure_type_changed', figureId: msg.figureId, figureType: msg.figureType });
          deps.schedulePersist(room);
          return;
        }
```

- [ ] **Step 3: Auto-release possessions on disconnect**

In the `ws.on('close')` handler (around line 394), add after the owner-orphan block:

```typescript
        // Auto-release possessions on disconnect
        const figMap = deps.figureMaps.get(room);
        if (figMap && pid !== 'anon') {
          const releasedIds: string[] = [];
          for (const [fid, f] of figMap.entries()) {
            if (f.possessor === pid) {
              deps.applyMutation(room, { type: 'figure_release', figureId: fid, playerId: pid });
              releasedIds.push(fid);
            }
          }
          for (const fid of releasedIds) {
            deps.broadcast(room, { type: 'figure_released', figureId: fid, playerId: pid });
          }
          if (releasedIds.length) deps.schedulePersist(room);
        }
```

- [ ] **Step 4: Add possessor to join snapshot**

In the join handler (around line 263-279), the snapshot already sends `figures: snaps` which are the Figure objects from figureMaps — since `possessor` is now on Figure, it flows automatically. Verify by reading the snapshot construction.

No code change needed — `possessor` is a regular Figure field that survives the snapshot path.

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add brett/src/server/ws-handler.ts
git commit -m "feat(brett): wire possession + figure_type routing in ws-handler [D-spec]"
```

### Task 2.4: seedFigureMapFromState — possessor + figureType persistence

**Files:**
- Modify: `brett/src/server/figures.ts`

- [ ] **Step 1: Verify possessor survives round-trip**

Check `seedFigureMapFromState()` — it copies figure objects verbatim from `state.figures` into the map. Since `possessor` and `figureType` are regular Figure fields, they survive the DB round-trip automatically.

No code change needed.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit (if changes needed, otherwise skip)**

---

## Meilenstein 3: Server Unit Tests

### Task 3.1: figure_possess Gate + Success Tests

**Files:**
- Create: `brett/test/possession.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
// brett/test/possession.test.ts — D-spec: Possession/Observer
import { test } from 'node:test';
import assert from 'node:assert';
import {
  applyMutation,
  buildStateFromMutations,
  figureMaps,
  canMutate,
  resolveRole,
  wsHandler,
} from '../src/server/index';

const { gateMutation } = wsHandler as any;

const APPEARANCE = { face: null, body: 'adult-average', accessories: { head: null, upper: null, feet: null } };

function figureById(room: string, id: string): any {
  return buildStateFromMutations(room).figures.find((f: any) => f.id === id);
}

function gateDeps() {
  return { buildStateFromMutations, figureMaps, canMutate, resolveRole };
}

// ── figure_possess ──────────────────────────────────────────────────

test('D: figure_possess sets possessor on free figure', () => {
  const room = 'possess-1';
  applyMutation(room, { type: 'add', figure: { id: 'f1', x: 0, z: 0, facingY: 0, appearance: APPEARANCE } });
  applyMutation(room, { type: 'figure_possess', figureId: 'f1', playerId: 'u1' });
  assert.strictEqual(figureById(room, 'f1').possessor, 'u1');
});

test('D: figure_possess on already-possessed figure is a no-op (gate)', () => {
  const room = 'possess-2';
  applyMutation(room, { type: 'add', figure: { id: 'f1', x: 0, z: 0, facingY: 0, appearance: APPEARANCE } });
  applyMutation(room, { type: 'figure_possess', figureId: 'f1', playerId: 'u1' });
  // Second possess by u2 should NOT overwrite
  applyMutation(room, { type: 'figure_possess', figureId: 'f1', playerId: 'u2' });
  assert.strictEqual(figureById(room, 'f1').possessor, 'u1', 'first possessor sticks');
});

test('D: figure_possess on non-existent figure is a no-op', () => {
  const room = 'possess-ghost';
  applyMutation(room, { type: 'figure_possess', figureId: 'ghost', playerId: 'u1' });
  assert.strictEqual(buildStateFromMutations(room).figures.length, 0);
});

// ── figure_release ──────────────────────────────────────────────────

test('D: figure_release clears possessor when player matches', () => {
  const room = 'release-1';
  applyMutation(room, { type: 'add', figure: { id: 'f1', x: 0, z: 0, facingY: 0, appearance: APPEARANCE } });
  applyMutation(room, { type: 'figure_possess', figureId: 'f1', playerId: 'u1' });
  applyMutation(room, { type: 'figure_release', figureId: 'f1', playerId: 'u1' });
  assert.strictEqual(figureById(room, 'f1').possessor, null);
});

test('D: figure_release by wrong player does NOT clear possessor', () => {
  const room = 'release-2';
  applyMutation(room, { type: 'add', figure: { id: 'f1', x: 0, z: 0, facingY: 0, appearance: APPEARANCE } });
  applyMutation(room, { type: 'figure_possess', figureId: 'f1', playerId: 'u1' });
  applyMutation(room, { type: 'figure_release', figureId: 'f1', playerId: 'u2' });
  assert.strictEqual(figureById(room, 'f1').possessor, 'u1', 'wrong player cannot release');
});

// ── figure_release_all ──────────────────────────────────────────────

test('D: figure_release_all clears all possessions for a player', () => {
  const room = 'release-all';
  for (const id of ['f1', 'f2', 'f3']) {
    applyMutation(room, { type: 'add', figure: { id, x: 0, z: 0, facingY: 0, appearance: APPEARANCE } });
  }
  applyMutation(room, { type: 'figure_possess', figureId: 'f1', playerId: 'u1' });
  applyMutation(room, { type: 'figure_possess', figureId: 'f2', playerId: 'u1' });
  applyMutation(room, { type: 'figure_possess', figureId: 'f3', playerId: 'u2' });
  applyMutation(room, { type: 'figure_release_all', playerId: 'u1' });
  assert.strictEqual(figureById(room, 'f1').possessor, null);
  assert.strictEqual(figureById(room, 'f2').possessor, null);
  assert.strictEqual(figureById(room, 'f3').possessor, 'u2', 'other player untouched');
});

// ── Snapshot carries possessor ──────────────────────────────────────

test('D: buildStateFromMutations includes possessor in figure objects', () => {
  const room = 'snap-possessor';
  applyMutation(room, { type: 'add', figure: { id: 'f1', x: 0, z: 0, facingY: 0, appearance: APPEARANCE } });
  applyMutation(room, { type: 'figure_possess', figureId: 'f1', playerId: 'u1' });
  const state = buildStateFromMutations(room);
  assert.strictEqual(state.figures[0].possessor, 'u1');
});

// ── canMutate ───────────────────────────────────────────────────────

test('D canMutate: beobachter may figure_possess (transition Observer → possessor)', () => {
  assert.strictEqual(canMutate({ msgType: 'figure_possess', role: 'beobachter', playerId: 'u-beob', figureOwnerId: null, allowRepresentativeAdd: false }), true);
});

test('D canMutate: beobachter may figure_release', () => {
  assert.strictEqual(canMutate({ msgType: 'figure_release', role: 'beobachter', playerId: 'u-beob', figureOwnerId: null, allowRepresentativeAdd: false }), true);
});

test('D canMutate: stellvertreter may NOT figure_possess', () => {
  assert.strictEqual(canMutate({ msgType: 'figure_possess', role: 'stellvertreter', playerId: 'u-stellv', figureOwnerId: 'u-stellv', allowRepresentativeAdd: false }), false);
});

test('D canMutate: leiter may figure_possess', () => {
  assert.strictEqual(canMutate({ msgType: 'figure_possess', role: 'leiter', playerId: 'u-leiter', figureOwnerId: null, allowRepresentativeAdd: false }), true);
});

// ── figure_type_set ─────────────────────────────────────────────────

test('D: figure_type_set writes figureType', () => {
  const room = 'ftype-1';
  applyMutation(room, { type: 'add', figure: { id: 'f1', x: 0, z: 0, facingY: 0, appearance: APPEARANCE } });
  applyMutation(room, { type: 'figure_type_set', figureId: 'f1', figureType: 'saboteur' });
  assert.strictEqual(figureById(room, 'f1').figureType, 'saboteur');
});

test('D: figure_type_set on non-existent figure is a no-op', () => {
  const room = 'ftype-ghost';
  applyMutation(room, { type: 'figure_type_set', figureId: 'ghost', figureType: 'coachee' });
  assert.strictEqual(buildStateFromMutations(room).figures.length, 0);
});
```

- [ ] **Step 2: Run tests to verify they fail (mutations not yet in types)**

Run: `cd brett && npx tsx --test test/possession.test.ts`
Expected: Some tests FAIL (TypeScript errors for new mutation types in permissions.ts if not committed yet — this is expected if Tasks 2.1/2.2 aren't done yet)

- [ ] **Step 3: After Tasks 2.1-2.3 are complete, run tests**

Run: `cd brett && npx tsx --test test/possession.test.ts`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add brett/test/possession.test.ts
git commit -m "test(brett): add possession mutation unit tests [D-spec]"
```

---

## Meilenstein 4: Client — Lobby Observer-Toggle & Figur-Typ

### Task 4.1: Observer-Toggle im Lobby-Dialog

**Files:**
- Modify: `brett/src/client/ui/lobby-coaching.ts` (or the lobby screen file)
- Note: Check which file renders the join dialog / lobby screen

- [ ] **Step 1: Find the lobby join form**

Read the lobby screen file and locate the name input + join button.

- [ ] **Step 2: Add observer checkbox**

Add this HTML element in the join form, right after the name input:

```html
<label class="lobby-observer-toggle">
  <input type="checkbox" id="join-as-observer" />
  <span>Als Beobachter beitreten</span>
</label>
```

- [ ] **Step 3: Pass observer flag on join**

When sending the join message, include the observer flag if checked:

```typescript
const asObserver = (document.getElementById('join-as-observer') as HTMLInputElement)?.checked ?? false;
// Pass via join message or a separate mechanism
// The server already handles role assignment — observer flag means no initial figure
```

- [ ] **Step 4: Style the toggle with theme tokens**

Add CSS using the theme tokens (inline style or class):

```css
.lobby-observer-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--brett-font-mono);
  font-size: 11px;
  color: var(--brett-mute);
  padding: 6px 0;
}
```

- [ ] **Step 5: Commit**

```bash
git add brett/src/client/ui/lobby-coaching.ts
git commit -m "feat(brett): add observer toggle to lobby join dialog [D-spec]"
```

### Task 4.2: Figur-Typ-Dropdown im Roster

**Files:**
- Modify: `brett/src/client/ui/lobby-coaching.ts` (or the roster component file)

- [ ] **Step 1: Add figure type dropdown to roster items**

For each figure in the roster, render a `<select>` dropdown with the 5 types:

```typescript
const FIGURE_TYPE_OPTIONS: { value: FigureType; label: string }[] = [
  { value: 'coachee', label: 'Coachee' },
  { value: 'team_active', label: 'Team · aktiv' },
  { value: 'team_passive', label: 'Team · passiv' },
  { value: 'saboteur', label: 'Saboteur' },
  { value: 'resource', label: 'Ressource' },
];

function renderFigureTypeDropdown(figureId: string, currentType: FigureType | undefined, isLeader: boolean): string {
  const disabled = isLeader ? '' : 'disabled';
  return `<select class="roster-figure-type" data-figure-id="${figureId}" ${disabled}>
    ${FIGURE_TYPE_OPTIONS.map(o => `
      <option value="${o.value}" ${currentType === o.value ? 'selected' : ''}>${o.label}</option>
    `).join('')}
  </select>`;
}
```

- [ ] **Step 2: Send figure_type_set on change**

Add event listener for the dropdown:

```typescript
document.addEventListener('change', (e) => {
  const sel = e.target as HTMLSelectElement;
  if (!sel.classList.contains('roster-figure-type')) return;
  const figureId = sel.dataset.figureId!;
  const figureType = sel.value as FigureType;
  const ws = getWs();
  if (ws && isWsReady()) {
    sendClient({ type: 'figure_type_set', figureId, figureType });
  }
});
```

- [ ] **Step 3: Handle figure_type_changed server message**

In `ws-client.ts` `onWsMessage`, add a case for `figure_type_changed`:

```typescript
    case 'figure_type_changed':
      // Update local state — figure type change (roster re-render handled by lobby store)
      break;
```

- [ ] **Step 4: Commit**

```bash
git add brett/src/client/ui/lobby-coaching.ts brett/src/client/ws-client.ts
git commit -m "feat(brett): add figure type dropdown to roster [D-spec]"
```

---

## Meilenstein 5: Client — Board Visuals (Possession States)

### Task 5.1: Freie-Figur-Ring (brass dashed pulse)

**Files:**
- Modify: `brett/src/client/mannequin.ts`
- Modify: `brett/src/client/board-boot.ts`

- [ ] **Step 1: Add possession ring to figure root on creation**

In `makeMannequin()`, add a dashed ring mesh after the existing selection ring:

```typescript
  // Possession indicator ring (dashed brass, pulsing — shown for free figures)
  const possessionRingGeo = new THREE.TorusGeometry(0.52, 0.02, 8, 48);
  const possessionRingMat = new THREE.MeshBasicMaterial({
    color: 0xc8a96e,
    transparent: true,
    opacity: 0.45,
  });
  const possessionRing = new THREE.Mesh(possessionRingGeo, possessionRingMat);
  possessionRing.rotation.x = -Math.PI / 2;
  possessionRing.position.y = 0.02;
  possessionRing.visible = false;
  root.add(possessionRing);
```

Add `possessionRing` to the return object.

- [ ] **Step 2: Add possession state update function**

In `board-boot.ts` or a new `board-possession.ts`, add a function that updates all figure visuals based on `possessor` state:

```typescript
function updatePossessionVisuals(figures: any[], currentUserId: string): void {
  for (const fig of figures) {
    const possessor = fig._serverPossessor; // set from snapshot/updates
    const isMine = possessor === currentUserId;
    const isOthers = possessor && possessor !== currentUserId;
    
    if (!possessor && !fig._ownerLock) {
      // Free — show dashed ring (pulsing)
      fig.possessionRing.visible = true;
      fig.possessionRing.material.opacity = 0.35 + Math.sin(performance.now() * 0.003) * 0.15;
      fig.possessionRing.material.color.set(0xc8a96e); // brass
      // Remove glow
      clearPossessionGlow(fig);
    } else if (isMine) {
      // Own possession — brass glow
      fig.possessionRing.visible = true;
      fig.possessionRing.material.opacity = 0.75;
      fig.possessionRing.material.color.set(0xc8a96e); // brass
      addPossessionGlow(fig, 0xc8a96e, 18, 0.35);
    } else if (isOthers) {
      // Foreign possession — sage glow
      fig.possessionRing.visible = true;
      fig.possessionRing.material.opacity = 0.55;
      fig.possessionRing.material.color.set(0x7fa37a); // sage
      addPossessionGlow(fig, 0x7fa37a, 14, 0.3);
    }
  }
}
```

- [ ] **Step 3: Call updatePossessionVisuals in tick loop**

In the tick function in `board-boot.ts`:

```typescript
  updatePossessionVisuals(STATE.figures, currentUser.userId);
```

- [ ] **Step 4: Handle figure_possessed / figure_released messages in ws-client.ts**

```typescript
    case 'figure_possessed': {
      const fig = STATE.figures.find(f => f.id === msg.figureId);
      if (fig) fig._serverPossessor = msg.playerId;
      break;
    }
    case 'figure_released': {
      const fig = STATE.figures.find(f => f.id === msg.figureId);
      if (fig) fig._serverPossessor = null;
      break;
    }
```

- [ ] **Step 5: Set _serverPossessor from snapshot**

In the snapshot handler in `ws-client.ts`:

```typescript
      for (const f of (msg.figures || [])) {
        const fig = mannequin.makeMannequin(f.id, { x: f.x ?? 0, z: f.z ?? 0 });
        // ... existing setup ...
        fig._serverPossessor = f.possessor ?? null;  // ← ADD
        STATE.figures.push(fig);
      }
```

- [ ] **Step 6: Click handler for free figure possession**

In `board-boot.ts`, in the click/select handler, add logic to send `figure_possess` when clicking a free figure:

```typescript
    // After picking a figure via pickMannequinBody:
    const fig = mannequin.pickMannequinBody(e);
    if (fig && !fig._serverPossessor && !activeLocks.get(fig.id)) {
      // Click on free figure → possess it
      const ws = getWs();
      if (isWsReady() && ws) {
        ws.send(JSON.stringify({ type: 'figure_possess', figureId: fig.id }));
      }
    }
```

- [ ] **Step 7: Commit**

```bash
git add brett/src/client/mannequin.ts brett/src/client/board-boot.ts brett/src/client/ws-client.ts
git commit -m "feat(brett): add possession visual states on board [D-spec]"
```

### Task 5.2: Floating Labels (possessor name above figure)

**Files:**
- Modify: `brett/src/client/mannequin.ts`

- [ ] **Step 1: Create floating label sprite in makeMannequin**

```typescript
  // Floating possessor label (hidden by default)
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 256;
  labelCanvas.height = 64;
  const labelTex = new THREE.CanvasTexture(labelCanvas);
  const labelSpriteMat = new THREE.SpriteMaterial({ map: labelTex, transparent: true, depthTest: false });
  const labelSprite = new THREE.Sprite(labelSpriteMat);
  labelSprite.position.y = 2.4;
  labelSprite.scale.set(2.0, 0.5, 1);
  labelSprite.visible = false;
  root.add(labelSprite);
```

Add `labelSprite` to the return object.

- [ ] **Step 2: Add label update function**

```typescript
export function updatePossessorLabel(fig: any, name: string, color: string): void {
  const ctx = (fig.labelSprite.material.map.image as HTMLCanvasElement).getContext('2d')!;
  ctx.clearRect(0, 0, 256, 64);
  ctx.font = 'bold 20px "Geist Mono", monospace';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name.toUpperCase(), 128, 32);
  fig.labelSprite.material.map.needsUpdate = true;
  fig.labelSprite.visible = true;
}

export function clearPossessorLabel(fig: any): void {
  fig.labelSprite.visible = false;
}
```

- [ ] **Step 3: Commit**

```bash
git add brett/src/client/mannequin.ts
git commit -m "feat(brett): add floating possessor name labels [D-spec]"
```

---

## Meilenstein 6: Client — HUD (Observer-Hint + Possession-Controls)

### Task 6.1: Observer-Hint Bar + Possession Buttons

**Files:**
- Modify: `brett/src/client/ui/hud.ts`

- [ ] **Step 1: Add observer hint bar HTML**

```html
<div id="observer-hint" class="observer-hint" style="display:none">
  Klicke eine freie Figur, um sie zu verkörpern
</div>
<div id="possession-controls" class="possession-controls" style="display:none">
  <button id="btn-release-possession" class="brett-btn brett-btn--ghost">
    🚶 Loslassen
  </button>
</div>
```

- [ ] **Step 2: Add update logic**

```typescript
export function updatePossessionHud(possessedFigureId: string | null, isObserver: boolean): void {
  const hintEl = document.getElementById('observer-hint');
  const controlsEl = document.getElementById('possession-controls');
  
  if (isObserver && !possessedFigureId) {
    if (hintEl) hintEl.style.display = 'block';
    if (controlsEl) controlsEl.style.display = 'none';
  } else if (possessedFigureId) {
    if (hintEl) hintEl.style.display = 'none';
    if (controlsEl) controlsEl.style.display = 'flex';
  } else {
    if (hintEl) hintEl.style.display = 'none';
    if (controlsEl) controlsEl.style.display = 'none';
  }
}
```

- [ ] **Step 3: Wire release button**

```typescript
document.getElementById('btn-release-possession')?.addEventListener('click', () => {
  const ws = getWs();
  if (isWsReady() && ws) {
    ws.send(JSON.stringify({ type: 'figure_release' })); // no figureId → release all
  }
});
```

- [ ] **Step 4: Style with theme tokens**

```css
.observer-hint {
  font-family: var(--brett-font-mono);
  font-size: 10px;
  color: var(--brett-brass);
  border: 1px dashed var(--brett-brass-dim);
  padding: 6px 14px;
  border-radius: var(--brett-radius-sm);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
```

- [ ] **Step 5: Commit**

```bash
git add brett/src/client/ui/hud.ts
git commit -m "feat(brett): add observer hint + possession control HUD [D-spec]"
```

---

## Meilenstein 7: Client — POV-Kamera

### Task 7.1: Camera lerp to figure head position

**Files:**
- Create: `brett/src/client/pov-camera.ts`
- Modify: `brett/src/client/board-boot.ts`

- [ ] **Step 1: Create pov-camera.ts**

```typescript
// brett/src/client/pov-camera.ts — D-spec: POV Camera
import * as THREE from 'three';
import { getScene, STATE } from './state';

let povFigureId: string | null = null;
let lerpStart: { pos: THREE.Vector3; target: THREE.Vector3; startTime: number } | null = null;
const LERP_DURATION_MS = 600;

const _headWorld = new THREE.Vector3();
const _headDir = new THREE.Vector3(0, 0, -1);

export function getPovFigureId(): string | null { return povFigureId; }

export function startPov(figureId: string): void {
  const fig = STATE.figures.find(f => f.id === figureId);
  if (!fig) return;
  const { camera } = getScene();
  
  // Get head world position
  const headBone = fig.bones?.head;
  if (!headBone) return;
  headBone.getWorldPosition(_headWorld);
  
  // Get facing direction (figure's forward is -Z in local space)
  const facingNub = new THREE.Vector3(0, 0, -1);
  fig.root.localToWorld(facingNub);
  const lookTarget = _headWorld.clone().add(
    facingNub.sub(fig.root.position).normalize().multiplyScalar(2)
  );
  
  lerpStart = {
    pos: camera.position.clone(),
    target: _headWorld.clone().add(new THREE.Vector3(0, 0.2, 0)), // slightly above head
    startTime: performance.now(),
  };
  povFigureId = figureId;
  
  // Store look target for the lerp
  (lerpStart as any).lookTarget = lookTarget;
}

export function stopPov(): void {
  const { camera } = getScene();
  lerpStart = {
    pos: camera.position.clone(),
    target: new THREE.Vector3(4, 4, 6), // default bird's eye
    startTime: performance.now(),
  };
  (lerpStart as any).lookTarget = new THREE.Vector3(0, 1, 0);
  povFigureId = null;
}

export function tickPov(): void {
  if (!lerpStart) return;
  const { camera } = getScene();
  const now = performance.now();
  const t = Math.min(1, (now - lerpStart.startTime) / LERP_DURATION_MS);
  const e = 1 - Math.pow(1 - t, 3); // ease-out-cubic
  
  camera.position.lerpVectors(lerpStart.pos, lerpStart.target, e);
  camera.lookAt((lerpStart as any).lookTarget);
  
  if (t >= 1) {
    lerpStart = null;
  }
}
```

- [ ] **Step 2: Integrate into board-boot.ts tick loop**

```typescript
  import { tickPov } from './pov-camera';
  
  function tick() {
    // ... existing code ...
    tickPov(); // AFTER camera orbit update, so POV overrides orbit
    // ... render ...
  }
```

- [ ] **Step 3: Trigger POV on figure_possessed**

In `ws-client.ts`, when receiving `figure_possessed` for own figures:

```typescript
    case 'figure_possessed': {
      const fig = STATE.figures.find(f => f.id === msg.figureId);
      if (fig) fig._serverPossessor = msg.playerId;
      // Start POV if it's our own possession
      if (msg.playerId === currentUser.userId) {
        import('./pov-camera').then(m => m.startPov(msg.figureId));
      }
      break;
    }
```

- [ ] **Step 4: Stop POV on figure_released (own)**

```typescript
    case 'figure_released': {
      const fig = STATE.figures.find(f => f.id === msg.figureId);
      if (fig) fig._serverPossessor = null;
      if (msg.playerId === currentUser.userId) {
        import('./pov-camera').then(m => m.stopPov());
      }
      break;
    }
```

- [ ] **Step 5: Shift+Drag temporarily exits POV**

In the orbit drag handler in `scene.ts`, when POV is active and Shift+Drag starts, call `stopPov()`. When the drag ends and the figure is still possessed, restart POV.

- [ ] **Step 6: Commit**

```bash
git add brett/src/client/pov-camera.ts brett/src/client/board-boot.ts brett/src/client/ws-client.ts brett/src/client/scene.ts
git commit -m "feat(brett): add POV camera lerp to figure head [D-spec]"
```

---

## Meilenstein 8: Integration & Wiring

### Task 8.1: Wire snapshot possessor into client state on join

**Files:**
- Modify: `brett/src/client/ws-client.ts`

Already done in Task 5.1 Step 5. Verify.

### Task 8.2: Lobby roster shows observer entries

**Files:**
- Modify: `brett/src/client/ui/lobby-coaching.ts`

- [ ] **Step 1: Render observer role in roster**

```typescript
function renderRosterEntry(entry: RosterEntry): string {
  const isObserver = entry.role === 'beobachter';
  const icon = isObserver ? '👁' : '';
  return `<div class="roster-entry ${isObserver ? 'roster-observer' : ''}">
    <span class="roster-icon">${icon}</span>
    <span class="roster-name">${entry.name}</span>
    <span class="roster-role">${isObserver ? 'Beobachter' : entry.role ?? ''}</span>
  </div>`;
}
```

- [ ] **Step 2: Commit**

```bash
git add brett/src/client/ui/lobby-coaching.ts
git commit -m "feat(brett): show observer entries in lobby roster [D-spec]"
```

### Task 8.3: End-to-End smoke test (manual checklist)

- [ ] **Check 1:** Observer joins → sees "Klicke eine freie Figur" hint
- [ ] **Check 2:** Observer clicks free figure → becomes possessor, POV camera lerps to head
- [ ] **Check 3:** HUD shows "👁 POV aktiv" + "🚶 Loslassen"
- [ ] **Check 4:** Other participants see sage glow + floating name
- [ ] **Check 5:** Press "Loslassen" → camera returns, figure is free again
- [ ] **Check 6:** Leader changes figure type → all participants see new color swatch
- [ ] **Check 7:** Possessor disconnects → figure auto-releases

---

## Meilenstein 9: Client Unit Tests

### Task 9.1: HUD State Tests

**Files:**
- Create: `brett/test/possession-hud.test.tsx`

- [ ] **Step 1: Write HUD state tests using tsx/jsdom**

(Pattern depends on existing client test infrastructure — adapt to match existing patterns)

### Task 9.2: CanMutate + Mutation Tests (already in Meilenstein 3)

Already covered by `possession.test.ts`.

---

## Meilenstein 10: Polish & Final Verification

### Task 10.1: Run full test suite

```bash
cd brett && npx tsx --test test/possession.test.ts
cd brett && npx tsx --test test/relay-gate.test.ts
# ... all other brett tests
```

- [ ] All tests PASS (including new possession tests)

### Task 10.2: Run typecheck

```bash
cd brett && npx tsc --noEmit
```

- [ ] No new type errors

### Task 10.3: Run full CI test suite

```bash
cd /tmp/wt-brett-possession && task test:all
```

- [ ] All BATS + kustomize + vitest checks PASS

### Task 10.4: Commit final plan updates

```bash
git add docs/superpowers/plans/2026-06-07-brett-d-possession-observer.md
git commit -m "chore(brett): finalize D-possession implementation plan"
```
