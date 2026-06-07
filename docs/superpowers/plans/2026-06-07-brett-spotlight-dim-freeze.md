---
title: "Brett: Spotlight/Dim/Freeze (Slice 2)"
ticket_id: T000471
spec: docs/superpowers/specs/2026-06-07-brett-spotlight-dim-freeze-design.md
branch: feature/brett-spotlight-dim-freeze
domains: [website]
status: active
pr_number: null
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin-Moderationswerkzeuge Spotlight, Dim und Freeze fuer das Brett implementieren — session-global sichtbar, server-authoritative, mit Material-Override-Visuals im Three.js-Client.

**Architecture:** Neuer Sentinel `__moderation__` in `figureMaps` speichert den Moderation-State (spotlight/dim/freeze). Admin-Commands in `ws-admin-commands.ts` schreiben diesen State; `gateMutation` in `ws-handler.ts` blockiert Figurbewegungen im Freeze-Zustand fuer Nicht-Leiter. Client-seitig rendert `updateModerationVisuals()` in `mannequin.ts` per-Frame die Hervorhebungen via Material-Override.

**Tech Stack:** TypeScript, Three.js, ws, node:test, tsx/jsdom

**Ticket-ID:** T000471

---

## Meilenstein 1: Typen und Nachrichten

### Task 1.1: Neue Message-Typen eintragen

**Files:**
- Modify: `brett/src/types/messages.ts`

- [ ] **Step 1: Admin-Client-Messages hinzufuegen**

Fuege nach der letzten `ClientMessage`-Zeile (`| { type: 'figure_type_set'; ... }`) folgende Varianten ein:

```typescript
  | { type: 'admin_spotlight_set'; figureId: string | null }
  | { type: 'admin_dim_set'; figureId: string | null }
  | { type: 'admin_freeze_set'; frozen: boolean }
```

- [ ] **Step 2: Server-Message hinzufuegen**

Fuege nach `| { type: 'figure_type_changed'; figureId: string; figureType: FigureType }` ein:

```typescript
  | { type: 'moderation_state'; spotlight: string | null; dim: string | null; freeze: boolean }
```

- [ ] **Step 3: TypeScript verifizieren**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS — falls `messages.test.ts` Compile-Fehler zeigt (routeServer nicht exhaustiv), weiter mit Task 1.2.

- [ ] **Step 4: Commit**

```bash
git add brett/src/types/messages.ts
git commit -m "feat(brett): add spotlight/dim/freeze message types [T000471]"
```

### Task 1.2: messages.test.ts auf Vollstaendigkeit erweitern

**Files:**
- Modify: `brett/test/messages.test.ts`

- [ ] **Step 1: routeServer um moderation_state erweitern**

In der `routeServer`-Funktion, nach `case 'figure_type_changed': return 'figure_type_changed';` einfuegen:

```typescript
    case 'moderation_state': return 'moderation_state';
```

- [ ] **Step 2: routeClient um neue Admin-Types erweitern**

In der `routeClient`-Funktion, nach `case 'figure_type_set': return 'figure_type_set';` einfuegen. Ausserdem die fehlenden possession-Types nachtragen, falls noch nicht vorhanden:

```typescript
    case 'figure_possess': return 'figure_possess';
    case 'figure_release': return 'figure_release';
    case 'figure_type_set': return 'figure_type_set';
    case 'admin_spotlight_set': return 'admin_spotlight_set';
    case 'admin_dim_set': return 'admin_dim_set';
    case 'admin_freeze_set': return 'admin_freeze_set';
```

- [ ] **Step 3: HANDLED_SERVER_TYPES erweitern**

In der `HANDLED_SERVER_TYPES`-Konstante `'moderation_state'` sowie fehlende possession-Types ergaenzen:

```typescript
const HANDLED_SERVER_TYPES = new Set<ServerMessageType>([
  // ... vorhandene Eintraege ...
  'figure_possessed', 'figure_released', 'figure_type_changed',
  'moderation_state',
]);
```

- [ ] **Step 4: TypeScript verifizieren**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS (keine Compile-Fehler im assertNever-Default mehr)

- [ ] **Step 5: Tests ausfuehren**

Run: `cd brett && node --test test/messages.test.ts`
Expected: alle Tests PASS

- [ ] **Step 6: Commit**

```bash
git add brett/test/messages.test.ts
git commit -m "test(brett): extend messages.test.ts for moderation_state exhaustiveness [T000471]"
```

---

## Meilenstein 2: Server — Mutation, State, Persistence

### Task 2.1: applyMutation — Moderation-Sentinel

**Files:**
- Modify: `brett/src/server/figures.ts`

- [ ] **Step 1: Drei neue Mutation-Cases hinzufuegen**

Fuege innerhalb des `switch (msg.type)` Blocks in `applyMutation()`, nach dem `case 'lobby_settings_set':` Block ein:

```typescript
    case 'moderation_spotlight_set': {
      const prev = figs.get('__moderation__') ?? { id: '__moderation__', spotlight: null, dim: null, freeze: false };
      figs.set('__moderation__', { ...prev, spotlight: msg.figureId ?? null });
      break;
    }
    case 'moderation_dim_set': {
      const prev = figs.get('__moderation__') ?? { id: '__moderation__', spotlight: null, dim: null, freeze: false };
      figs.set('__moderation__', { ...prev, dim: msg.figureId ?? null });
      break;
    }
    case 'moderation_freeze_set': {
      const prev = figs.get('__moderation__') ?? { id: '__moderation__', spotlight: null, dim: null, freeze: false };
      figs.set('__moderation__', { ...prev, freeze: !!msg.frozen });
      break;
    }
```

- [ ] **Step 2: seedFigureMapFromState erweitern**

In `seedFigureMapFromState()`, nach dem `if (state.lobbySettings ...)` Block:

```typescript
  if (state.moderation && typeof state.moderation === 'object') {
    map.set('__moderation__', {
      id: '__moderation__',
      spotlight: state.moderation.spotlight ?? null,
      dim: state.moderation.dim ?? null,
      freeze: state.moderation.freeze ?? false,
    });
  }
```

- [ ] **Step 3: TypeScript verifizieren**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add brett/src/server/figures.ts
git commit -m "feat(brett): add moderation sentinel mutations to applyMutation [T000471]"
```

### Task 2.2: buildStateFromMutations — Moderation exponieren

**Files:**
- Modify: `brett/src/server/phases.ts`

- [ ] **Step 1: Sentinel in SPECIAL-Liste und Extraktion hinzufuegen**

In `buildStateFromMutations()`:

1. `'__moderation__'` zur `SPECIAL`-Array-Konstante hinzufuegen:

```typescript
  const SPECIAL = [
    '__optik__', '__stiffness__',
    '__session_phase__', '__session_code__', '__admin_token_holder__',
    '__session_created_at__', '__session_last_activity__',
    '__coaching_steps__', '__roles__', '__lobby_settings__',
    '__moderation__',   // ← NEU
  ];
```

2. Extraktion nach dem `lobbySettingsEntry`-Block hinzufuegen:

```typescript
  const moderationEntry = figs.get('__moderation__');
  if (moderationEntry) {
    result.moderation = {
      spotlight: moderationEntry.spotlight ?? null,
      dim: moderationEntry.dim ?? null,
      freeze: moderationEntry.freeze ?? false,
    };
  }
```

- [ ] **Step 2: TypeScript verifizieren**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add brett/src/server/phases.ts
git commit -m "feat(brett): expose moderation state in buildStateFromMutations [T000471]"
```

### Task 2.3: Freeze-Gate in gateMutation

**Files:**
- Modify: `brett/src/server/ws-handler.ts`

- [ ] **Step 1: Freeze-Gate nach dem REG-1-Bypass einfuegen**

In `gateMutation()`, nach dem `if (!state.sessionCode && ...)` Block (REG-1 free-board bypass) und vor `const role = deps.resolveRole(...)`:

```typescript
  // Freeze-Gate: block move/update/jump for non-leaders when room is frozen.
  // Leiter bypass: the leiter may still demonstrate figure movement when frozen.
  const FREEZE_BLOCKED: MutationType[] = ['move', 'update', 'jump'];
  if (state.moderation?.freeze && FREEZE_BLOCKED.includes(msgType)) {
    const freezeRole = deps.resolveRole(ws, roles);
    if (freezeRole !== 'leiter') return false;
  }
```

- [ ] **Step 2: ADMIN_TYPES erweitern**

In der `ADMIN_TYPES`-Set-Deklaration die drei neuen Admin-Types hinzufuegen:

```typescript
export const ADMIN_TYPES = new Set<string>([
  'admin_kick', 'admin_broadcast', 'admin_session_create', 'admin_handoff_token',
  'admin_round_stop', 'admin_round_pause', 'admin_coaching_steps_set',
  'admin_round_start', 'admin_assign_role', 'admin_assign_figure',
  'admin_set_template', 'admin_set_optik',
  'figure_type_set',
  'admin_spotlight_set', 'admin_dim_set', 'admin_freeze_set',  // ← NEU
]);
```

- [ ] **Step 3: TypeScript verifizieren**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add brett/src/server/ws-handler.ts
git commit -m "feat(brett): add freeze gate to gateMutation + spotlight/dim/freeze to ADMIN_TYPES [T000471]"
```

### Task 2.4: handleAdminMessage — drei neue Admin-Commands

**Files:**
- Modify: `brett/src/server/ws-admin-commands.ts`

- [ ] **Step 1: Helper-Funktion getModerationState hinzufuegen**

Fuege eine private Hilfsfunktion am Anfang der Datei (nach den Imports) ein:

```typescript
function getModerationState(deps: Pick<WsDeps, 'figureMaps'>, room: string): { spotlight: string | null; dim: string | null; freeze: boolean } {
  const entry = deps.figureMaps.get(room)?.get('__moderation__');
  return {
    spotlight: entry?.spotlight ?? null,
    dim: entry?.dim ?? null,
    freeze: entry?.freeze ?? false,
  };
}
```

- [ ] **Step 2: Drei neue Cases in handleAdminMessage**

Fuege nach dem `case 'figure_type_set':` Block (vor der schliessenden geschweiften Klammer des switch) ein:

```typescript
    case 'admin_spotlight_set': {
      // figureId: string|null — null deaktiviert den Spotlight
      const figureId = (typeof msg.figureId === 'string') ? msg.figureId : null;
      // Validate: wenn figureId gesetzt, muss die Figur existieren
      if (figureId !== null && !deps.figureMaps.get(adminRoom)?.has(figureId)) {
        try { ws.send(JSON.stringify({ type: 'error', reason: 'not-found' })); } catch {}
        return;
      }
      deps.applyMutation(adminRoom, { type: 'moderation_spotlight_set', figureId });
      const state = getModerationState(deps, adminRoom);
      deps.broadcast(adminRoom, { type: 'moderation_state', ...state });
      deps.schedulePersist(adminRoom);
      break;
    }
    case 'admin_dim_set': {
      const figureId = (typeof msg.figureId === 'string') ? msg.figureId : null;
      if (figureId !== null && !deps.figureMaps.get(adminRoom)?.has(figureId)) {
        try { ws.send(JSON.stringify({ type: 'error', reason: 'not-found' })); } catch {}
        return;
      }
      deps.applyMutation(adminRoom, { type: 'moderation_dim_set', figureId });
      const state = getModerationState(deps, adminRoom);
      deps.broadcast(adminRoom, { type: 'moderation_state', ...state });
      deps.schedulePersist(adminRoom);
      break;
    }
    case 'admin_freeze_set': {
      const frozen = !!msg.frozen;
      deps.applyMutation(adminRoom, { type: 'moderation_freeze_set', frozen });
      const state = getModerationState(deps, adminRoom);
      deps.broadcast(adminRoom, { type: 'moderation_state', ...state });
      deps.schedulePersist(adminRoom);
      break;
    }
```

- [ ] **Step 3: TypeScript verifizieren**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add brett/src/server/ws-admin-commands.ts
git commit -m "feat(brett): handleAdminMessage admin_spotlight_set/dim_set/freeze_set [T000471]"
```

---

## Meilenstein 3: Tests — Server-Seite

### Task 3.1: Neue Testdatei admin-spotlight.test.ts

**Files:**
- Create: `brett/test/admin-spotlight.test.ts`

- [ ] **Step 1: Testdatei anlegen**

```typescript
// brett/test/admin-spotlight.test.ts — T000471: Spotlight/Dim/Freeze
import { test } from 'node:test';
import assert from 'node:assert';
import {
  applyMutation,
  buildStateFromMutations,
  figureMaps,
} from '../src/server/index';
import { wsHandler } from '../src/server/index';

const { gateMutation } = wsHandler as any;

const APPEARANCE = { face: null, body: 'adult-average', accessories: { head: null, upper: null, feet: null } };

function moderation(room: string) {
  return buildStateFromMutations(room)?.moderation ?? { spotlight: null, dim: null, freeze: false };
}

function gateDeps() {
  return { buildStateFromMutations, figureMaps, canMutate: (ctx: any) => ctx.role === 'leiter', resolveRole: (_ws: any, roles: any) => roles?.['uid'] ?? 'beobachter' };
}

// ── applyMutation: moderation_spotlight_set ──────────────────────────────────

test('moderation_spotlight_set: sets spotlight figureId', () => {
  const room = 'sdf-spotlight-1';
  applyMutation(room, { type: 'moderation_spotlight_set', figureId: 'f1' });
  assert.strictEqual(moderation(room).spotlight, 'f1');
});

test('moderation_spotlight_set: null clears spotlight', () => {
  const room = 'sdf-spotlight-2';
  applyMutation(room, { type: 'moderation_spotlight_set', figureId: 'f1' });
  applyMutation(room, { type: 'moderation_spotlight_set', figureId: null });
  assert.strictEqual(moderation(room).spotlight, null);
});

test('moderation_spotlight_set: does not affect dim or freeze', () => {
  const room = 'sdf-spotlight-3';
  applyMutation(room, { type: 'moderation_freeze_set', frozen: true });
  applyMutation(room, { type: 'moderation_dim_set', figureId: 'f2' });
  applyMutation(room, { type: 'moderation_spotlight_set', figureId: 'f1' });
  const m = moderation(room);
  assert.strictEqual(m.spotlight, 'f1');
  assert.strictEqual(m.dim, 'f2');
  assert.strictEqual(m.freeze, true);
});

// ── applyMutation: moderation_dim_set ───────────────────────────────────────

test('moderation_dim_set: sets dim figureId independently', () => {
  const room = 'sdf-dim-1';
  applyMutation(room, { type: 'moderation_dim_set', figureId: 'f3' });
  const m = moderation(room);
  assert.strictEqual(m.dim, 'f3');
  assert.strictEqual(m.spotlight, null);
  assert.strictEqual(m.freeze, false);
});

test('moderation_dim_set: null clears dim', () => {
  const room = 'sdf-dim-2';
  applyMutation(room, { type: 'moderation_dim_set', figureId: 'f3' });
  applyMutation(room, { type: 'moderation_dim_set', figureId: null });
  assert.strictEqual(moderation(room).dim, null);
});

// ── applyMutation: moderation_freeze_set ────────────────────────────────────

test('moderation_freeze_set: sets freeze to true', () => {
  const room = 'sdf-freeze-1';
  applyMutation(room, { type: 'moderation_freeze_set', frozen: true });
  assert.strictEqual(moderation(room).freeze, true);
});

test('moderation_freeze_set: sets freeze to false', () => {
  const room = 'sdf-freeze-2';
  applyMutation(room, { type: 'moderation_freeze_set', frozen: true });
  applyMutation(room, { type: 'moderation_freeze_set', frozen: false });
  assert.strictEqual(moderation(room).freeze, false);
});

test('moderation_freeze_set: does not affect spotlight or dim', () => {
  const room = 'sdf-freeze-3';
  applyMutation(room, { type: 'moderation_spotlight_set', figureId: 'f1' });
  applyMutation(room, { type: 'moderation_dim_set', figureId: 'f2' });
  applyMutation(room, { type: 'moderation_freeze_set', frozen: true });
  const m = moderation(room);
  assert.strictEqual(m.spotlight, 'f1');
  assert.strictEqual(m.dim, 'f2');
  assert.strictEqual(m.freeze, true);
});

// ── buildStateFromMutations: moderation exponiert ───────────────────────────

test('buildStateFromMutations: moderation absent → null (no sentinel set)', () => {
  const room = 'sdf-state-absent';
  // Raum ohne Moderation-Sentinel
  applyMutation(room, { type: 'add', figure: { id: 'f0', x: 0, z: 0, facingY: 0, appearance: APPEARANCE } });
  const state = buildStateFromMutations(room);
  assert.ok(!state.moderation || state.moderation.spotlight === null, 'no spotlight without sentinel');
});

test('buildStateFromMutations: moderation.freeze survives setzen + lesen', () => {
  const room = 'sdf-state-freeze';
  applyMutation(room, { type: 'moderation_freeze_set', frozen: true });
  assert.strictEqual(buildStateFromMutations(room).moderation.freeze, true);
});

// ── seedFigureMapFromState: Moderation DB-Roundtrip ─────────────────────────

test('seedFigureMapFromState: moderation state survives roundtrip', () => {
  const room = 'sdf-seed-1';
  applyMutation(room, { type: 'moderation_spotlight_set', figureId: 'fig-x' });
  applyMutation(room, { type: 'moderation_freeze_set', frozen: true });
  const state = buildStateFromMutations(room);
  // Simulate DB roundtrip: clear map, seed from persisted state
  figureMaps.delete(room);
  const { seedFigureMapFromState } = require('../src/server/figures');
  const newMap = new Map<string, any>();
  seedFigureMapFromState(newMap, state);
  figureMaps.set(room, newMap);
  const restored = moderation(room);
  assert.strictEqual(restored.spotlight, 'fig-x');
  assert.strictEqual(restored.freeze, true);
});
```

- [ ] **Step 2: Tests ausfuehren**

Run: `cd brett && node --test test/admin-spotlight.test.ts`
Expected: alle Tests PASS (Sentry-Roundtrip-Test kann require-Import-Problem geben — bei Bedarf auf direkten Import umstellen)

- [ ] **Step 3: TypeScript verifizieren**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add brett/test/admin-spotlight.test.ts
git commit -m "test(brett): admin-spotlight.test.ts — Spotlight/Dim/Freeze server unit tests [T000471]"
```

### Task 3.2: permissions.test.ts — Freeze-Gate-Tests

**Files:**
- Modify: `brett/test/permissions.test.ts`

- [ ] **Step 1: Import gateMutation und Freeze-Gate-Tests hinzufuegen**

Fuege am Ende der Datei nach den resolveRole-Tests ein:

```typescript
// ── Freeze-Gate (T000471) ────────────────────────────────────────────────────
import { wsHandler } from '../src/server/index';
import { applyMutation, buildStateFromMutations, figureMaps } from '../src/server/index';

const { gateMutation } = wsHandler as any;

function freezeDeps() {
  return {
    buildStateFromMutations,
    figureMaps,
    canMutate,
    resolveRole,
  };
}

test('Freeze-Gate: non-leiter move blocked when freeze active', () => {
  const room = 'freeze-gate-1';
  applyMutation(room, { type: 'session_code_set', code: 'FRZ-001' });
  applyMutation(room, { type: 'roles_set', roles: { 'p1': 'stellvertreter' } });
  applyMutation(room, { type: 'moderation_freeze_set', frozen: true });
  const ws = { _session: { userId: 'p1' }, _room: room };
  const allowed = gateMutation(ws, room, 'move', undefined, freezeDeps());
  assert.strictEqual(allowed, false, 'move must be blocked for stellvertreter when frozen');
});

test('Freeze-Gate: leiter move allowed even when freeze active', () => {
  const room = 'freeze-gate-2';
  applyMutation(room, { type: 'session_code_set', code: 'FRZ-002' });
  applyMutation(room, { type: 'roles_set', roles: { 'admin1': 'leiter' } });
  applyMutation(room, { type: 'moderation_freeze_set', frozen: true });
  const ws = { _session: { userId: 'admin1' }, _room: room };
  const allowed = gateMutation(ws, room, 'move', undefined, freezeDeps());
  assert.strictEqual(allowed, true, 'leiter must still be able to move when frozen');
});

test('Freeze-Gate: move allowed for all when freeze inactive', () => {
  const room = 'freeze-gate-3';
  applyMutation(room, { type: 'session_code_set', code: 'FRZ-003' });
  applyMutation(room, { type: 'roles_set', roles: { 'p2': 'stellvertreter' } });
  applyMutation(room, { type: 'moderation_freeze_set', frozen: false });
  applyMutation(room, { type: 'add', figure: { id: 'f1', x: 0, z: 0, facingY: 0, appearance: { face: null, body: 'adult-average', accessories: {} } } });
  applyMutation(room, { type: 'figure_owner_set', figureId: 'f1', ownerId: 'p2' });
  const ws = { _session: { userId: 'p2' }, _room: room };
  const allowed = gateMutation(ws, room, 'move', 'f1', freezeDeps());
  assert.strictEqual(allowed, true, 'stellvertreter must be able to move own figure when not frozen');
});

test('Freeze-Gate: beobachter jump blocked when freeze active', () => {
  const room = 'freeze-gate-4';
  applyMutation(room, { type: 'session_code_set', code: 'FRZ-004' });
  applyMutation(room, { type: 'roles_set', roles: { 'obs1': 'beobachter' } });
  applyMutation(room, { type: 'moderation_freeze_set', frozen: true });
  const ws = { _session: { userId: 'obs1' }, _room: room };
  const allowed = gateMutation(ws, room, 'jump', undefined, freezeDeps());
  assert.strictEqual(allowed, false, 'beobachter jump must be blocked when frozen');
});
```

- [ ] **Step 2: Tests ausfuehren**

Run: `cd brett && node --test test/permissions.test.ts`
Expected: alle Tests PASS

- [ ] **Step 3: Commit**

```bash
git add brett/test/permissions.test.ts
git commit -m "test(brett): Freeze-Gate tests in permissions.test.ts [T000471]"
```

---

## Meilenstein 4: Client — WS-Empfang und Moderation-State

### Task 4.1: Moderation-State im WS-Client empfangen

**Files:**
- Modify: `brett/src/client/ws-client.ts`

- [ ] **Step 1: Moderation-State-Variable und Accessor anlegen**

Fuege nach `let lobbyState: LobbyState = createLobbyState();` ein:

```typescript
// Moderation-State (T000471): Spotlight / Dim / Freeze
export interface ClientModerationState {
  spotlight: string | null;
  dim: string | null;
  freeze: boolean;
}
let moderationState: ClientModerationState = { spotlight: null, dim: null, freeze: false };
export function getModerationState(): ClientModerationState { return moderationState; }

// Injected callback: fired when moderation state changes (board-boot wires this)
let onModerationChange: (state: ClientModerationState) => void = () => {};
export function setModerationChangeHandler(fn: (state: ClientModerationState) => void): void {
  onModerationChange = fn;
}
```

- [ ] **Step 2: moderation_state case in onWsMessage**

Fuege nach `case 'figure_type_changed':` folgenden Case ein:

```typescript
    case 'moderation_state': {
      moderationState = { spotlight: msg.spotlight, dim: msg.dim, freeze: msg.freeze };
      onModerationChange(moderationState);
      break;
    }
```

- [ ] **Step 3: Snapshot-Handling — Moderation aus Snapshot laden**

Im `case 'snapshot':` Block, nach `if (msg.optik) applyOptikToScene(msg.optik);` einfuegen:

```typescript
      // T000471: rehydrate moderation state from join snapshot
      if ((msg as any).moderation) {
        moderationState = {
          spotlight: (msg as any).moderation.spotlight ?? null,
          dim: (msg as any).moderation.dim ?? null,
          freeze: (msg as any).moderation.freeze ?? false,
        };
        onModerationChange(moderationState);
      }
```

- [ ] **Step 4: Snapshot-ServerMessage-Type um moderation erweitern**

In `messages.ts`, die `snapshot`-ServerMessage-Variante um `moderation?` ergaenzen:

```typescript
  | { type: 'snapshot'; figures: Figure[]; stiffness?: number; locks?: ServerLock[]; phase?: Phase; sessionCode?: string | null; optik?: OptikSettings; participants?: Participant[]; moderation?: { spotlight: string | null; dim: string | null; freeze: boolean } }
```

- [ ] **Step 5: TypeScript verifizieren**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add brett/src/client/ws-client.ts brett/src/types/messages.ts
git commit -m "feat(brett): receive moderation_state in ws-client + rehydrate from snapshot [T000471]"
```

### Task 4.2: Snapshot-Serialisierung server-seitig

**Files:**
- Modify: `brett/src/server/ws-handler.ts`

- [ ] **Step 1: Moderation in Join-Snapshot aufnehmen**

Im `join`-Handler, bei der Snapshot-Zusammenstellung (wo `optik: freshState.optik` steht), `moderation` hinzufuegen:

```typescript
              ws.send(JSON.stringify({
                type: 'snapshot',
                figures: snaps,
                stiffness: freshState.stiffness,
                locks: locks,
                phase: freshState.sessionPhase,
                sessionCode: freshState.sessionCode,
                participants: freshState.participants,
                optik: freshState.optik,
                moderation: freshState.moderation ?? null,  // ← NEU
              }));
```

- [ ] **Step 2: TypeScript verifizieren**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add brett/src/server/ws-handler.ts
git commit -m "feat(brett): include moderation in join snapshot [T000471]"
```

---

## Meilenstein 5: Client — Visuelle Umsetzung

### Task 5.1: updateModerationVisuals in mannequin.ts

**Files:**
- Modify: `brett/src/client/mannequin.ts`

- [ ] **Step 1: Freeze-Eis-Sprite zur Mannequin-Fabrik hinzufuegen**

In `makeMannequin()`, nach dem `labelSprite`-Block (vor `const { scene } = getScene();`), ein Freeze-Sprite anlegen:

```typescript
  // Freeze indicator sprite (T000471) — shown when room is frozen
  const freezeCanvas = document.createElement('canvas');
  freezeCanvas.width = 64;
  freezeCanvas.height = 64;
  const freezeCtx = freezeCanvas.getContext('2d')!;
  freezeCtx.font = '40px serif';
  freezeCtx.fillStyle = '#7dc8f7';
  freezeCtx.textAlign = 'center';
  freezeCtx.textBaseline = 'middle';
  freezeCtx.fillText('❄', 32, 32);
  const freezeTex = new THREE.CanvasTexture(freezeCanvas);
  const freezeSpriteMat = new THREE.SpriteMaterial({ map: freezeTex, transparent: true, depthTest: false, depthWrite: false });
  const freezeSprite = new THREE.Sprite(freezeSpriteMat);
  freezeSprite.position.y = 2.1;
  freezeSprite.scale.set(0.5, 0.5, 1);
  freezeSprite.visible = false;
  root.add(freezeSprite);
```

Und im `return`-Statement des `makeMannequin`-Objekts `freezeSprite` hinzufuegen:

```typescript
    freezeSprite,
```

- [ ] **Step 2: updateModerationVisuals Funktion hinzufuegen**

Fuege nach `updatePossessionVisuals` eine neue exportierte Funktion ein:

```typescript
// ── Moderation Visuals (T000471) ───────────────────────────────────────────

export interface ModerationVisualState {
  spotlight: string | null;
  dim: string | null;
  freeze: boolean;
}

const SPOTLIGHT_EMISSIVE = new THREE.Color(0xc8a96e); // brass glow
const DIM_OPACITY = 0.18;
const FREEZE_TINT = new THREE.Color(0x7dc8f7);        // ice blue

/**
 * Per-frame moderation visual updater. Applies emissive glow (spotlight),
 * opacity dimming (dim), and blue ice tint + freeze sprite (freeze) to figure
 * meshes via material override. Caches original material values for restore.
 */
export function updateModerationVisuals(figures: any[], state: ModerationVisualState): void {
  const hasModeration = state.spotlight !== null || state.dim !== null || state.freeze;

  for (const fig of figures) {
    const isSpotlit = state.spotlight !== null && fig.id === state.spotlight;
    const isDimTarget = state.dim !== null && fig.id === state.dim;
    const shouldGlow  = isSpotlit || isDimTarget;
    const shouldDim   = (state.spotlight !== null && !isSpotlit) ||
                        (state.dim !== null && !isDimTarget);

    // Freeze sprite
    if (fig.freezeSprite) {
      fig.freezeSprite.visible = state.freeze;
    }

    // Cache original material values on first moderation frame
    if (hasModeration && !fig._moderationCache) {
      fig._moderationCache = new Map<string, { color: THREE.Color; emissive: THREE.Color; opacity: number; transparent: boolean }>();
      fig.root.traverse((o: any) => {
        if (o.isMesh && o.material && !o.userData.isContact && o !== fig.ring && o !== fig.possessionRing) {
          const m = o.material;
          fig._moderationCache.set(o.uuid, {
            color: m.color.clone(),
            emissive: m.emissive ? m.emissive.clone() : new THREE.Color(0x000000),
            opacity: m.opacity ?? 1,
            transparent: m.transparent ?? false,
          });
        }
      });
    }

    // Restore original materials when moderation is cleared
    if (!hasModeration && fig._moderationCache) {
      fig.root.traverse((o: any) => {
        if (o.isMesh && o.material && !o.userData.isContact && o !== fig.ring && o !== fig.possessionRing) {
          const cached = fig._moderationCache.get(o.uuid);
          if (cached) {
            o.material.color.copy(cached.color);
            if (o.material.emissive) o.material.emissive.copy(cached.emissive);
            o.material.opacity = cached.opacity;
            o.material.transparent = cached.transparent;
            o.material.needsUpdate = true;
          }
        }
      });
      fig._moderationCache = null;
      return;
    }

    if (!hasModeration) continue;

    // Apply moderation visuals
    fig.root.traverse((o: any) => {
      if (o.isMesh && o.material && !o.userData.isContact && o !== fig.ring && o !== fig.possessionRing) {
        const m = o.material;
        // Spotlight/Dim glow
        if (shouldGlow && m.emissive) {
          m.emissive.copy(SPOTLIGHT_EMISSIVE);
          m.emissiveIntensity = 0.55;
          m.opacity = 1.0;
          m.transparent = false;
        }
        // Dim (other figures fade)
        if (shouldDim) {
          m.opacity = DIM_OPACITY;
          m.transparent = true;
          if (m.emissive) m.emissive.set(0x000000);
        }
        // Freeze tint (overlaid on spotlight/dim)
        if (state.freeze) {
          const cached = fig._moderationCache?.get(o.uuid);
          const baseColor = cached ? cached.color : m.color;
          m.color.copy(baseColor).lerp(FREEZE_TINT, 0.3);
        }
        m.needsUpdate = true;
      }
    });
  }
}

export function clearModerationVisuals(figures: any[]): void {
  updateModerationVisuals(figures, { spotlight: null, dim: null, freeze: false });
}
```

- [ ] **Step 3: TypeScript verifizieren**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS (Three.js-Typen sind importiert; falls `emissiveIntensity` fehlt, cast via `(m as any).emissiveIntensity`)

- [ ] **Step 4: Commit**

```bash
git add brett/src/client/mannequin.ts
git commit -m "feat(brett): updateModerationVisuals + freeze sprite in mannequin [T000471]"
```

### Task 5.2: board-boot.ts — Moderation-Tick und Freeze-Banner

**Files:**
- Modify: `brett/src/client/board-boot.ts`

- [ ] **Step 1: Imports erweitern**

In der Import-Sektion von `board-boot.ts`:

```typescript
import * as mannequin from './mannequin';
import type { ClientModerationState } from './ws-client';
```

- [ ] **Step 2: Freeze-Indikator-Banner anlegen**

In `bootBoard()`, nach dem `releaseBtn`-Block (vor dem Stiffness-Slider):

```typescript
  // T000471: Freeze-Indikator-Banner
  const freezeBanner = document.createElement('div');
  freezeBanner.id = 'freeze-indicator';
  freezeBanner.textContent = '❄ EINGEFROREN — Figuren koennen nicht bewegt werden';
  Object.assign(freezeBanner.style, {
    display: 'none',
    position: 'absolute',
    top: '44px',
    left: '50%',
    transform: 'translateX(-50%)',
    fontFamily: 'var(--brett-font-mono), monospace',
    fontSize: '10px',
    color: '#7dc8f7',
    border: '1px solid rgba(125,200,247,0.3)',
    background: 'rgba(0,16,32,0.85)',
    padding: '4px 18px',
    borderRadius: '6px',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    zIndex: '25',
    pointerEvents: 'none',
  });
  document.body.appendChild(freezeBanner);
```

- [ ] **Step 3: Moderation-State-Handler registrieren**

Nach `wsClient.connectWS();`:

```typescript
  // T000471: Wire moderation change handler — update visuals on server push
  let currentModerationState: ClientModerationState = { spotlight: null, dim: null, freeze: false };
  wsClient.setModerationChangeHandler((state) => {
    currentModerationState = state;
    freezeBanner.style.display = state.freeze ? 'block' : 'none';
  });
```

- [ ] **Step 4: Moderation-Tick im Render-Loop aufrufen**

Im `tick()`-Loop, nach `mannequin.updatePossessionVisuals(STATE.figures, currentUser.userId);`:

```typescript
    // T000471: Moderation visuals (Spotlight/Dim/Freeze)
    mannequin.updateModerationVisuals(STATE.figures, currentModerationState);
```

- [ ] **Step 5: Freeze-Gate im Drag-Handler**

Im `mousedown`-Handler, nach dem `const lock = activeLocks.get(fig.id);` Check, vor dem Drag-Start:

```typescript
      // T000471: Freeze-Gate on client — show visual feedback, don't start drag
      if (currentModerationState.freeze) {
        // Leiter-check: fetch role from lobby state
        const myRole = wsClient.getLobbyState()?.participants?.find((p: any) => p.userId === currentUser.userId)?.role;
        if (myRole !== 'leiter') {
          e.preventDefault();
          return; // Server will also reject; client skips drag start
        }
      }
```

- [ ] **Step 6: TypeScript verifizieren**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add brett/src/client/board-boot.ts
git commit -m "feat(brett): freeze banner + moderation tick in board-boot [T000471]"
```

---

## Meilenstein 6: Vollstaendige Test-Suite und CI

### Task 6.1: Alle Tests lokal ausfuehren

**Files:**
- (keine Dateiänderungen)

- [ ] **Step 1: Brett-Testsuite ausfuehren**

Run: `cd brett && node --test test/`
Expected: alle Tests PASS — insbesondere:
  - `admin-spotlight.test.ts` — neue Spotlight/Dim/Freeze Tests
  - `permissions.test.ts` — Freeze-Gate Tests
  - `messages.test.ts` — moderation_state exhaustiveness
  - `server-admin.test.ts` — vorhandene Admin-Tests unveraendert

- [ ] **Step 2: TypeScript full compile**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS (0 errors)

- [ ] **Step 3: Repo-Tests ausfuehren**

Run: `bash /tmp/wt-brett-spotlight-dim-freeze/scripts/task-oracle.sh 'run all offline tests'` oder `task test:all` im Repo-Root
Expected: CI-relevante Tests PASS

- [ ] **Step 4: Commit (falls noetig fuer kleine Fixes)**

```bash
git add -p
git commit -m "fix(brett): post-test cleanup for spotlight/dim/freeze [T000471]"
```

### Task 6.2: PR erstellen

- [ ] **Step 1: Branch pushen**

```bash
git push -u origin feature/brett-spotlight-dim-freeze
```

- [ ] **Step 2: PR anlegen**

```bash
gh pr create \
  --title "feat(brett): Spotlight/Dim/Freeze Moderation-Werkzeuge (Slice 2) [T000471]" \
  --body "## Summary
- Neuer Sentinel \`__moderation__\` speichert Spotlight/Dim/Freeze-State session-global
- Admin-Commands: \`admin_spotlight_set\`, \`admin_dim_set\`, \`admin_freeze_set\` in \`ws-admin-commands.ts\`
- Freeze-Gate in \`gateMutation\`: Nicht-Leiter koennen Figuren nicht bewegen wenn Raum eingefroren ist
- Client: \`moderation_state\`-Empfang in \`ws-client.ts\`, Rehydration aus Join-Snapshot
- Client: \`updateModerationVisuals()\` in \`mannequin.ts\` — emissive Glow (Spotlight/Dim), Opacity-Dim, Eis-Toenung + Freeze-Sprite
- Freeze-Banner in \`board-boot.ts\` mit visueller Indikation
- Neue Tests: \`admin-spotlight.test.ts\` (Sentinel-Roundtrip, DB-Seed), Freeze-Gate in \`permissions.test.ts\`

## Test plan
- [ ] \`cd brett && node --test test/admin-spotlight.test.ts\` → alle PASS
- [ ] \`cd brett && node --test test/permissions.test.ts\` → Freeze-Gate Tests PASS
- [ ] \`cd brett && node --test test/messages.test.ts\` → moderation_state exhaustiveness PASS
- [ ] \`cd brett && npx tsc --noEmit\` → 0 errors
- [ ] \`task test:all\` im Repo-Root → CI-relevante Tests PASS

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 3: CI beobachten**

```bash
gh pr checks --watch
```
Expected: alle CI-Checks PASS

- [ ] **Step 4: Nach Merge — Branch aufraemen**

```bash
git checkout main && git pull --rebase origin main
git branch -d feature/brett-spotlight-dim-freeze
```
