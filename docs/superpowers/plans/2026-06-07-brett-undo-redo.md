---
title: "Brett: Undo/Redo Mutations-Stack (Slice 3)"
ticket_id: T000470
spec: docs/superpowers/specs/2026-06-07-brett-undo-redo-design.md
branch: feature/brett-undo-redo
domains: [website]
status: executed
pr_number: null
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementiere einen server-seitigen Undo/Redo-Mutations-Stack (max. 20 Schritte) für Board-Mutationen, isAdmin-gated, mit HUD-Buttons und Keyboard-Shortcuts, sodass Coaching-Leiter versehentliche Änderungen rückgängig machen können.

**Architecture:** Neues `undo-stack.ts`-Modul (pure Utility, keine Zirkelabhängigkeiten) wird vom ws-handler koordiniert: capture-before → applyMutation → capture-after → pushUndo → broadcast undo_stack_changed. Undo/Redo-Nachrichten werden als ADMIN_TYPES gerouted (isAdmin-Gate). Der Stack ist rein in-memory, nicht persistiert.

**Tech Stack:** TypeScript, Three.js, ws, node:test, tsx/jsdom

**Ticket-ID:** T000470

---

## Meilenstein 1: Shared Types

### Task 1.1: Neue Message-Typen in messages.ts

**Files:**
- Modify: `brett/src/types/messages.ts`

- [ ] **Step 1: ClientMessage um session_undo / session_redo erweitern**

Füge nach der letzten `| { type: 'figure_type_set'; ... }`-Zeile in der `ClientMessage`-Union hinzu:

```typescript
  | { type: 'session_undo' }
  | { type: 'session_redo' }
```

- [ ] **Step 2: ServerMessage um undo_stack_changed erweitern**

Füge in der `ServerMessage`-Union (vor der `error`-Zeile) ein:

```typescript
  | { type: 'undo_stack_changed'; canUndo: boolean; canRedo: boolean; undoCount: number; redoCount: number }
```

- [ ] **Step 3: TypeScript verifizieren**

Run: `cd /tmp/wt-brett-undo-redo/brett && npx tsc --noEmit`
Expected: PASS (keine neuen Fehler)

- [ ] **Step 4: Commit**

```bash
git add brett/src/types/messages.ts
git commit -m "feat(brett): add session_undo/redo + undo_stack_changed message types [T000470]"
```

---

## Meilenstein 2: Server — Undo-Stack-Modul

### Task 2.1: undo-stack.ts erstellen (pure Utility)

**Files:**
- Create: `brett/src/server/undo-stack.ts`

- [ ] **Step 1: Datei mit UndoEntry-Interface und Stack-Maps anlegen**

```typescript
// brett/src/server/undo-stack.ts — T000470: Undo/Redo Mutations-Stack (Slice 3)
//
// Pure utility — KEIN statischer Import von figures.ts oder ws-handler.ts.
// Wird vom ws-handler via Dependency-Injection koordiniert.
// Stack ist rein in-memory (nicht persistiert).

export interface UndoEntry {
  /** Zustand VOR der Mutation, pro Figur-ID.
   *  null = Figur existierte nicht (→ Undo eines 'add' = löschen) */
  before: Map<string, any | null>;
  /** Zustand NACH der Mutation (für Redo).
   *  null = Figur wurde gelöscht (→ Redo eines 'delete' = löschen) */
  after:  Map<string, any | null>;
  /** Mutations-Typ der ursprünglichen Operation (z.B. 'add', 'move') */
  mutationType: string;
  /** Unix-Timestamp (Date.now()) */
  ts: number;
}

/** Maximale Stack-Tiefe pro Raum. */
export const UNDO_LIMIT = 20;

/**
 * Undo-bare Mutations-Typen. Alles AUSSER diesen löst keinen Stack-Eintrag aus.
 * Ephemere Operationen (figure_possess, figure_release, phasen, presence) sind
 * explizit NICHT enthalten.
 */
export const UNDOABLE_TYPES = new Set<string>([
  'add', 'move', 'update', 'delete', 'clear',
  'stiffness', 'snapshot', 'figure_type_set',
]);

// ── In-Memory Stacks (room → stack) ──────────────────────────────────────────
export const undoStacks = new Map<string, UndoEntry[]>();
export const redoStacks = new Map<string, UndoEntry[]>();
```

- [ ] **Step 2: captureBeforeSnapshot implementieren**

```typescript
/**
 * Liest den Zustand der von `msg` betroffenen Figuren VOR der Mutation aus
 * der figureMap des Raumes. Gibt eine Map<figureId, snapshot|null> zurück.
 *
 * Für 'clear' und 'snapshot': snapshot ALLER Nicht-Sentinel-Figuren.
 * Für 'stiffness': { '__stiffness__': aktueller Wert-Eintrag }
 * Für 'add': { [msg.figure.id]: null } (Figur existiert noch nicht)
 * Für 'delete'/'move'/'update'/'figure_type_set': { [msg.id || msg.figureId]: aktueller Stand }
 */
export function captureBeforeSnapshot(
  room: string,
  msg: any,
  figureMaps: Map<string, Map<string, any>>,
): Map<string, any | null> {
  const figs = figureMaps.get(room);
  const snap = new Map<string, any | null>();
  if (!figs) return snap;

  switch (msg.type) {
    case 'clear': {
      // Alle Nicht-Sentinel-Figuren erfassen
      for (const [id, fig] of figs.entries()) {
        if (!id.startsWith('__')) {
          snap.set(id, { ...fig });
        }
      }
      break;
    }
    case 'snapshot': {
      // Gleiche Logik wie clear — alles überschreiben
      for (const [id, fig] of figs.entries()) {
        if (!id.startsWith('__')) {
          snap.set(id, { ...fig });
        }
      }
      break;
    }
    case 'stiffness': {
      const entry = figs.get('__stiffness__');
      snap.set('__stiffness__', entry ? { ...entry } : null);
      break;
    }
    case 'add': {
      const figData = msg.figure ?? msg.fig;
      const id = figData?.id;
      if (typeof id === 'string') {
        // Figur existiert noch nicht → null
        snap.set(id, figs.has(id) ? { ...figs.get(id) } : null);
      }
      break;
    }
    case 'delete':
    case 'move':
    case 'update': {
      const id = msg.id;
      if (typeof id === 'string') {
        snap.set(id, figs.has(id) ? { ...figs.get(id) } : null);
      }
      break;
    }
    case 'figure_type_set': {
      const id = msg.figureId;
      if (typeof id === 'string') {
        snap.set(id, figs.has(id) ? { ...figs.get(id) } : null);
      }
      break;
    }
  }
  return snap;
}
```

- [ ] **Step 3: captureAfterSnapshot implementieren**

```typescript
/**
 * Liest den Zustand der betroffenen Figuren NACH der Mutation.
 * Gibt die gleichen IDs wie `before` zurück, jetzt mit dem aktuellen Zustand
 * (oder null wenn die Figur durch delete/clear entfernt wurde).
 */
export function captureAfterSnapshot(
  before: Map<string, any | null>,
  figureMaps: Map<string, Map<string, any>>,
  room: string,
  msg: any,
): Map<string, any | null> {
  const figs = figureMaps.get(room);
  const snap = new Map<string, any | null>();

  // Für clear/snapshot: alle aktuellen Nicht-Sentinel-Figuren PLUS alle, die
  // vorher existierten (damit Redo die neuen kennt und Undo die alten).
  if (msg.type === 'clear' || msg.type === 'snapshot') {
    // Alles, was jetzt da ist
    if (figs) {
      for (const [id, fig] of figs.entries()) {
        if (!id.startsWith('__')) snap.set(id, { ...fig });
      }
    }
    // Alles, was vorher da war aber jetzt weg ist → null
    for (const [id] of before.entries()) {
      if (!id.startsWith('__') && !snap.has(id)) snap.set(id, null);
    }
    return snap;
  }

  if (msg.type === 'stiffness') {
    const entry = figs?.get('__stiffness__');
    snap.set('__stiffness__', entry ? { ...entry } : null);
    return snap;
  }

  // Für alle anderen: gleiche IDs wie before lesen
  for (const [id] of before.entries()) {
    snap.set(id, figs?.has(id) ? { ...figs.get(id) } : null);
  }
  return snap;
}
```

- [ ] **Step 4: pushUndo / getUndoStatus / clearStacks implementieren**

```typescript
/**
 * Schiebt einen neuen UndoEntry auf den Undo-Stack des Raumes.
 * Löscht den Redo-Stack (neue Aktion unterbricht Redo-Kette).
 * Trimmt auf UNDO_LIMIT (älteste Einträge zuerst verwerfen).
 */
export function pushUndo(room: string, entry: UndoEntry): void {
  if (!undoStacks.has(room)) undoStacks.set(room, []);
  const stack = undoStacks.get(room)!;
  stack.push(entry);
  // Älteste Einträge trimmen
  if (stack.length > UNDO_LIMIT) {
    stack.splice(0, stack.length - UNDO_LIMIT);
  }
  // Redo-Stack löschen (neue Mutation bricht Redo-Kette)
  redoStacks.delete(room);
}

/**
 * Führt Undo durch: poppt letzten Undo-Eintrag, appliziert `before`-Zustand
 * auf figureMaps, schiebt Eintrag auf Redo-Stack.
 * Gibt `{ applied: true, entry }` bei Erfolg oder `{ applied: false }` zurück.
 */
export function performUndo(
  room: string,
  figureMaps: Map<string, Map<string, any>>,
): { applied: true; entry: UndoEntry } | { applied: false } {
  const stack = undoStacks.get(room);
  if (!stack || stack.length === 0) return { applied: false };
  const entry = stack.pop()!;
  applySnapshot(room, entry.before, figureMaps);
  if (!redoStacks.has(room)) redoStacks.set(room, []);
  redoStacks.get(room)!.push(entry);
  return { applied: true, entry };
}

/**
 * Führt Redo durch: poppt letzten Redo-Eintrag, appliziert `after`-Zustand,
 * schiebt Eintrag zurück auf Undo-Stack.
 */
export function performRedo(
  room: string,
  figureMaps: Map<string, Map<string, any>>,
): { applied: true; entry: UndoEntry } | { applied: false } {
  const redoStack = redoStacks.get(room);
  if (!redoStack || redoStack.length === 0) return { applied: false };
  const entry = redoStack.pop()!;
  applySnapshot(room, entry.after, figureMaps);
  if (!undoStacks.has(room)) undoStacks.set(room, []);
  undoStacks.get(room)!.push(entry);
  return { applied: true, entry };
}

/**
 * Appliziert einen Snapshot auf figureMaps: jede ID → Wert setzt oder löscht
 * die Figur im Map. null = löschen.
 */
function applySnapshot(
  room: string,
  snapshot: Map<string, any | null>,
  figureMaps: Map<string, Map<string, any>>,
): void {
  let figs = figureMaps.get(room);
  if (!figs) {
    figs = new Map();
    figureMaps.set(room, figs);
  }
  for (const [id, val] of snapshot.entries()) {
    if (val === null) {
      figs.delete(id);
    } else {
      figs.set(id, { ...val });
    }
  }
}

/**
 * Gibt den aktuellen Undo/Redo-Status zurück (für das undo_stack_changed-Event).
 */
export function getUndoStatus(room: string): {
  canUndo: boolean;
  canRedo: boolean;
  undoCount: number;
  redoCount: number;
} {
  const undoCount = undoStacks.get(room)?.length ?? 0;
  const redoCount = redoStacks.get(room)?.length ?? 0;
  return { canUndo: undoCount > 0, canRedo: redoCount > 0, undoCount, redoCount };
}

/**
 * Löscht beide Stacks für den Raum (aufgerufen bei Last-Leave / Cleanup).
 */
export function clearStacks(room: string): void {
  undoStacks.delete(room);
  redoStacks.delete(room);
}
```

- [ ] **Step 5: TypeScript verifizieren**

Run: `cd /tmp/wt-brett-undo-redo/brett && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add brett/src/server/undo-stack.ts
git commit -m "feat(brett): add undo-stack module (pure utility, in-memory) [T000470]"
```

---

### Task 2.2: UndoStack-Deps in WsDeps + ADMIN_TYPES

**Files:**
- Modify: `brett/src/server/ws-handler.ts`

- [ ] **Step 1: WsDeps Interface um Undo-Funktionen erweitern**

In der `WsDeps`-Interface (nach `flushImmediate`):

```typescript
  // T000470: Undo/Redo-Stack
  captureBeforeSnapshot: (room: string, msg: any) => Map<string, any | null>;
  captureAfterSnapshot: (before: Map<string, any | null>, room: string, msg: any) => Map<string, any | null>;
  pushUndo: (room: string, entry: import('./undo-stack').UndoEntry) => void;
  performUndo: (room: string) => { applied: true; entry: import('./undo-stack').UndoEntry } | { applied: false };
  performRedo: (room: string) => { applied: true; entry: import('./undo-stack').UndoEntry } | { applied: false };
  getUndoStatus: (room: string) => { canUndo: boolean; canRedo: boolean; undoCount: number; redoCount: number };
  clearUndoStacks: (room: string) => void;
```

- [ ] **Step 2: session_undo und session_redo zu ADMIN_TYPES hinzufügen**

In der `ADMIN_TYPES`-Set-Definition (nach `'figure_type_set'`):

```typescript
export const ADMIN_TYPES = new Set<string>([
  'admin_kick', 'admin_broadcast', 'admin_session_create', 'admin_handoff_token',
  'admin_round_stop', 'admin_round_pause', 'admin_coaching_steps_set',
  'admin_round_start', 'admin_assign_role', 'admin_assign_figure',
  'admin_set_template', 'admin_set_optik',
  'figure_type_set',
  'session_undo', 'session_redo',   // ← T000470
]);
```

- [ ] **Step 3: Im RELAY_TYPES-Block: Undo-Snapshot-Capture vor applyMutation einweben**

Ersetze den bestehenden RELAY_TYPES-Block (ca. Zeile 405–437) mit undo-aware Version:

```typescript
        if (RELAY_TYPES.has(msg.type)) {
          if (!gateMutation(ws, room, msg.type, msg.id, deps)) {
            try { ws.send(JSON.stringify({ type: 'error', reason: 'forbidden' })); } catch {}
            return;
          }
          if (msg.type === 'request_state_snapshot') {
            return;
          }

          // T000470: Undo-Snapshot-Capture für undo-bare Mutations
          const isUndoable = deps.captureBeforeSnapshot && undoStack.UNDOABLE_TYPES.has(msg.type);
          let beforeSnap: Map<string, any | null> | null = null;
          if (isUndoable) {
            beforeSnap = deps.captureBeforeSnapshot(room, msg);
          }

          deps.applyMutation(room, msg);
          deps.broadcast(room, msg, ws);

          if (isUndoable && beforeSnap) {
            const afterSnap = deps.captureAfterSnapshot(beforeSnap, room, msg);
            deps.pushUndo(room, {
              before: beforeSnap,
              after: afterSnap,
              mutationType: msg.type,
              ts: Date.now(),
            });
            deps.broadcast(room, { type: 'undo_stack_changed', ...deps.getUndoStatus(room) });
          }

          // Stellvertreter-Add: Ownership setzen
          if (msg.type === 'add') {
            const newId = (msg.figure ?? msg.fig)?.id;
            const playerId = resolvePlayerId(ws);
            const role = deps.resolveRole(ws, deps.buildStateFromMutations(room)?.roles || {});
            if (role === 'stellvertreter' && typeof newId === 'string') {
              deps.applyMutation(room, { type: 'figure_owner_set', figureId: newId, ownerId: playerId });
              deps.broadcast(room, { type: 'figure_owner_changed', figureId: newId, ownerId: playerId });
            }
          }
          if (msg.type === 'clear') {
            deps.flushImmediate(room).catch((err: any) => console.error('[brett] flush:', err));
          }
          if (msg.type !== 'clear') {
            deps.schedulePersist(room);
          }
        }
```

Hinweis: `undoStack` muss am Anfang von ws-handler.ts importiert werden:
```typescript
import * as undoStack from './undo-stack';
```

- [ ] **Step 4: TypeScript verifizieren**

Run: `cd /tmp/wt-brett-undo-redo/brett && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add brett/src/server/ws-handler.ts
git commit -m "feat(brett): wire undo-snapshot capture into RELAY_TYPES block + ADMIN_TYPES [T000470]"
```

---

### Task 2.3: Admin-Handler für session_undo / session_redo

**Files:**
- Modify: `brett/src/server/ws-admin-commands.ts`

- [ ] **Step 1: Import von undo-stack am Anfang der Datei**

```typescript
import * as undoStack from './undo-stack';
```

- [ ] **Step 2: Handler-Cases in handleAdminMessage switch hinzufügen**

Füge nach dem `admin_set_optik`-Case (vor dem default) ein:

```typescript
    case 'session_undo': {
      const result = deps.performUndo(adminRoom);
      if (result.applied) {
        // Re-Snapshot an alle: buildStateFromMutations gibt aktuellen Zustand
        const freshState = deps.buildStateFromMutations(adminRoom);
        if (freshState) {
          const figures = Object.values(freshState.figures ?? {});
          deps.broadcast(adminRoom, {
            type: 'snapshot',
            figures,
            stiffness: freshState.stiffness,
            phase: freshState.sessionPhase,
            sessionCode: freshState.sessionCode,
            optik: freshState.optik,
          });
        }
        deps.broadcast(adminRoom, {
          type: 'undo_stack_changed',
          ...deps.getUndoStatus(adminRoom),
        });
        deps.schedulePersist(adminRoom);
      } else {
        try {
          ws.send(JSON.stringify({ type: 'error', reason: 'undo-stack-empty' }));
        } catch {}
      }
      break;
    }

    case 'session_redo': {
      const result = deps.performRedo(adminRoom);
      if (result.applied) {
        const freshState = deps.buildStateFromMutations(adminRoom);
        if (freshState) {
          const figures = Object.values(freshState.figures ?? {});
          deps.broadcast(adminRoom, {
            type: 'snapshot',
            figures,
            stiffness: freshState.stiffness,
            phase: freshState.sessionPhase,
            sessionCode: freshState.sessionCode,
            optik: freshState.optik,
          });
        }
        deps.broadcast(adminRoom, {
          type: 'undo_stack_changed',
          ...deps.getUndoStatus(adminRoom),
        });
        deps.schedulePersist(adminRoom);
      } else {
        try {
          ws.send(JSON.stringify({ type: 'error', reason: 'redo-stack-empty' }));
        } catch {}
      }
      break;
    }
```

- [ ] **Step 3: TypeScript verifizieren**

Run: `cd /tmp/wt-brett-undo-redo/brett && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add brett/src/server/ws-admin-commands.ts
git commit -m "feat(brett): add session_undo/redo handlers in admin commands [T000470]"
```

---

### Task 2.4: index.ts — Undo-Deps verdrahten + Re-Export

**Files:**
- Modify: `brett/src/server/index.ts`

- [ ] **Step 1: undo-stack importieren**

Füge nach den bestehenden `import`-Zeilen hinzu:

```typescript
import * as undoStackModule from './undo-stack';
```

- [ ] **Step 2: Wrapper-Funktionen für figureMaps-Injection erstellen**

Da `undo-stack.ts` kein `figureMaps` direkt kennt (Dependency Injection), werden
Wrapper in index.ts definiert, die `figures.figureMaps` hineingeben:

```typescript
function captureBeforeSnapshot(room: string, msg: any): Map<string, any | null> {
  return undoStackModule.captureBeforeSnapshot(room, msg, figures.figureMaps);
}
function captureAfterSnapshot(before: Map<string, any | null>, room: string, msg: any): Map<string, any | null> {
  return undoStackModule.captureAfterSnapshot(before, figures.figureMaps, room, msg);
}
function pushUndo(room: string, entry: undoStackModule.UndoEntry): void {
  undoStackModule.pushUndo(room, entry);
}
function performUndo(room: string) {
  return undoStackModule.performUndo(room, figures.figureMaps);
}
function performRedo(room: string) {
  return undoStackModule.performRedo(room, figures.figureMaps);
}
function getUndoStatus(room: string) {
  return undoStackModule.getUndoStatus(room);
}
function clearUndoStacks(room: string): void {
  undoStackModule.clearStacks(room);
}
```

- [ ] **Step 3: wsDeps-Objekt erweitern**

Im `wsDeps`-Objekt (nach `sessionMiddleware`) hinzufügen:

```typescript
  captureBeforeSnapshot,
  captureAfterSnapshot,
  pushUndo,
  performUndo,
  performRedo,
  getUndoStatus,
  clearUndoStacks,
```

- [ ] **Step 4: clearUndoStacks im Last-Leave-Pfad aufrufen**

Im `ws.on('close')`-Handler in ws-handler.ts (nach `deps.figureMaps.delete(room)`):

```typescript
        if (!deps.rooms.has(room)) {
          deps.figureMaps.delete(room);
          deps.clearUndoStacks?.(room);  // T000470: Stacks beim Last-Leave bereinigen
        }
```

- [ ] **Step 5: Re-Exporte für Tests hinzufügen**

Am Ende von index.ts:

```typescript
export const undoStacks = undoStackModule.undoStacks;
export const redoStacks = undoStackModule.redoStacks;
export const UNDOABLE_TYPES = undoStackModule.UNDOABLE_TYPES;
export { undoStackModule };
```

- [ ] **Step 6: TypeScript verifizieren**

Run: `cd /tmp/wt-brett-undo-redo/brett && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add brett/src/server/index.ts brett/src/server/ws-handler.ts
git commit -m "feat(brett): wire undo-stack deps into wsDeps + cleanup on last-leave [T000470]"
```

---

## Meilenstein 3: Server Unit-Tests

### Task 3.1: undo-redo.test.ts erstellen

**Files:**
- Create: `brett/test/undo-redo.test.ts`

- [ ] **Step 1: Test-Datei schreiben**

```typescript
// brett/test/undo-redo.test.ts — T000470: Undo/Redo Mutations-Stack Unit-Tests
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMutation,
  buildStateFromMutations,
  figureMaps,
  undoStackModule,
} from '../src/server/index';

const {
  captureBeforeSnapshot,
  captureAfterSnapshot,
  pushUndo,
  performUndo,
  performRedo,
  getUndoStatus,
  clearStacks,
  undoStacks,
  redoStacks,
  UNDO_LIMIT,
} = undoStackModule;

const APPEARANCE = {
  face: null,
  body: 'adult-average',
  accessories: { head: null, upper: null, feet: null },
};

function freshFig(id: string, extra: any = {}): any {
  return { id, x: 0, z: 0, facingY: 0, appearance: APPEARANCE, ...extra };
}

// ── Grundlegendes Stack-Verhalten ────────────────────────────────────────────

test('undo-redo: Stack ist leer bei unbekanntem Raum', () => {
  const status = getUndoStatus('room-nonexistent');
  assert.equal(status.canUndo, false);
  assert.equal(status.canRedo, false);
  assert.equal(status.undoCount, 0);
  assert.equal(status.redoCount, 0);
});

test('undo-redo: pushUndo erhöht undoCount', () => {
  const room = 'ur-push-1';
  applyMutation(room, { type: 'add', figure: freshFig('f1') });
  const before = captureBeforeSnapshot(room, { type: 'move', id: 'f1' }, figureMaps);
  applyMutation(room, { type: 'move', id: 'f1', x: 2, z: 3, facingY: 0 });
  const after = captureAfterSnapshot(before, figureMaps, room, { type: 'move', id: 'f1' });
  pushUndo(room, { before, after, mutationType: 'move', ts: Date.now() });
  assert.equal(getUndoStatus(room).undoCount, 1);
});

test('undo-redo: Stack wird auf UNDO_LIMIT getrimmt', () => {
  const room = 'ur-trim-1';
  applyMutation(room, { type: 'add', figure: freshFig('f1') });
  for (let i = 0; i < UNDO_LIMIT + 5; i++) {
    const before = captureBeforeSnapshot(room, { type: 'move', id: 'f1' }, figureMaps);
    applyMutation(room, { type: 'move', id: 'f1', x: i, z: 0, facingY: 0 });
    const after = captureAfterSnapshot(before, figureMaps, room, { type: 'move', id: 'f1' });
    pushUndo(room, { before, after, mutationType: 'move', ts: Date.now() });
  }
  assert.equal(getUndoStatus(room).undoCount, UNDO_LIMIT, 'Stack bleibt bei UNDO_LIMIT');
});

// ── Undo: move ────────────────────────────────────────────────────────────────

test('undo-redo: move → Undo restauriert vorherige Position', () => {
  const room = 'ur-move-1';
  applyMutation(room, { type: 'add', figure: freshFig('f1', { x: 1, z: 2 }) });

  const before = captureBeforeSnapshot(room, { type: 'move', id: 'f1' }, figureMaps);
  applyMutation(room, { type: 'move', id: 'f1', x: 5, z: 7, facingY: 0 });
  const after = captureAfterSnapshot(before, figureMaps, room, { type: 'move', id: 'f1' });
  pushUndo(room, { before, after, mutationType: 'move', ts: Date.now() });

  // Verifizieren: figure ist jetzt bei (5, 7)
  const stateAfter = buildStateFromMutations(room);
  assert.equal(stateAfter.figures.find((f: any) => f.id === 'f1').x, 5);

  // Undo ausführen
  const result = performUndo(room, figureMaps);
  assert.equal(result.applied, true);

  // Figur muss wieder bei (1, 2) sein (Startwert beim freshFig + add-Normalisierung)
  const stateUndone = buildStateFromMutations(room);
  const fig = stateUndone.figures.find((f: any) => f.id === 'f1');
  assert.ok(fig, 'Figur muss existieren nach Undo');
  assert.equal(fig.x, 1);
  assert.equal(fig.z, 2);
});

// ── Undo: add (Figur löschen) ─────────────────────────────────────────────────

test('undo-redo: add → Undo entfernt die Figur', () => {
  const room = 'ur-add-1';
  const msg = { type: 'add', figure: freshFig('f-add') };
  const before = captureBeforeSnapshot(room, msg, figureMaps);
  applyMutation(room, msg);
  const after = captureAfterSnapshot(before, figureMaps, room, msg);
  pushUndo(room, { before, after, mutationType: 'add', ts: Date.now() });

  assert.equal(buildStateFromMutations(room).figures.length, 1, 'Figur existiert nach add');
  performUndo(room, figureMaps);
  assert.equal(buildStateFromMutations(room).figures.length, 0, 'Figur weg nach Undo-add');
});

// ── Undo: delete (Figur restaurieren) ────────────────────────────────────────

test('undo-redo: delete → Undo restauriert die Figur', () => {
  const room = 'ur-del-1';
  applyMutation(room, { type: 'add', figure: freshFig('f-del', { x: 3, z: 4 }) });
  const msg = { type: 'delete', id: 'f-del' };
  const before = captureBeforeSnapshot(room, msg, figureMaps);
  applyMutation(room, msg);
  const after = captureAfterSnapshot(before, figureMaps, room, msg);
  pushUndo(room, { before, after, mutationType: 'delete', ts: Date.now() });

  assert.equal(buildStateFromMutations(room).figures.length, 0, 'Figur weg nach delete');
  performUndo(room, figureMaps);
  const fig = buildStateFromMutations(room).figures.find((f: any) => f.id === 'f-del');
  assert.ok(fig, 'Figur nach Undo-delete wieder vorhanden');
  assert.equal(fig.x, 3);
});

// ── Undo: clear ────────────────────────────────────────────────────────────────

test('undo-redo: clear → Undo restauriert alle Figuren', () => {
  const room = 'ur-clear-1';
  applyMutation(room, { type: 'add', figure: freshFig('fc1') });
  applyMutation(room, { type: 'add', figure: freshFig('fc2') });
  applyMutation(room, { type: 'add', figure: freshFig('fc3') });

  const msg = { type: 'clear' };
  const before = captureBeforeSnapshot(room, msg, figureMaps);
  applyMutation(room, msg);
  const after = captureAfterSnapshot(before, figureMaps, room, msg);
  pushUndo(room, { before, after, mutationType: 'clear', ts: Date.now() });

  assert.equal(buildStateFromMutations(room).figures.length, 0, 'Board leer nach clear');
  performUndo(room, figureMaps);
  assert.equal(buildStateFromMutations(room).figures.length, 3, 'Alle 3 Figuren nach Undo-clear');
});

// ── Redo ──────────────────────────────────────────────────────────────────────

test('undo-redo: Undo dann Redo restauriert letzten Zustand', () => {
  const room = 'ur-redo-1';
  applyMutation(room, { type: 'add', figure: freshFig('fr1', { x: 0, z: 0 }) });

  const msg = { type: 'move', id: 'fr1', x: 8, z: 9, facingY: 0 };
  const before = captureBeforeSnapshot(room, msg, figureMaps);
  applyMutation(room, msg);
  const after = captureAfterSnapshot(before, figureMaps, room, msg);
  pushUndo(room, { before, after, mutationType: 'move', ts: Date.now() });

  // Undo → Figur bei (0, 0)
  performUndo(room, figureMaps);
  const stateUndone = buildStateFromMutations(room);
  assert.equal(stateUndone.figures.find((f: any) => f.id === 'fr1').x, 0);

  // Redo → Figur wieder bei (8, 9)
  const redoResult = performRedo(room, figureMaps);
  assert.equal(redoResult.applied, true);
  const stateRedone = buildStateFromMutations(room);
  assert.equal(stateRedone.figures.find((f: any) => f.id === 'fr1').x, 8);
  assert.equal(stateRedone.figures.find((f: any) => f.id === 'fr1').z, 9);
});

test('undo-redo: Neue Mutation löscht Redo-Stack', () => {
  const room = 'ur-redo-clear-1';
  applyMutation(room, { type: 'add', figure: freshFig('frx') });

  const msg1 = { type: 'move', id: 'frx', x: 1, z: 0, facingY: 0 };
  const before1 = captureBeforeSnapshot(room, msg1, figureMaps);
  applyMutation(room, msg1);
  const after1 = captureAfterSnapshot(before1, figureMaps, room, msg1);
  pushUndo(room, { before: before1, after: after1, mutationType: 'move', ts: Date.now() });

  performUndo(room, figureMaps);
  assert.equal(getUndoStatus(room).canRedo, true, 'canRedo nach Undo');

  // Neue Mutation löscht Redo
  const msg2 = { type: 'move', id: 'frx', x: 99, z: 0, facingY: 0 };
  const before2 = captureBeforeSnapshot(room, msg2, figureMaps);
  applyMutation(room, msg2);
  const after2 = captureAfterSnapshot(before2, figureMaps, room, msg2);
  pushUndo(room, { before: before2, after: after2, mutationType: 'move', ts: Date.now() });

  assert.equal(getUndoStatus(room).canRedo, false, 'Redo-Stack nach neuer Mutation leer');
});

// ── Undo auf leerem Stack ──────────────────────────────────────────────────────

test('undo-redo: performUndo auf leerem Stack → { applied: false }', () => {
  const room = 'ur-empty-1';
  const result = performUndo(room, figureMaps);
  assert.equal(result.applied, false);
});

test('undo-redo: performRedo auf leerem Redo-Stack → { applied: false }', () => {
  const room = 'ur-empty-redo-1';
  const result = performRedo(room, figureMaps);
  assert.equal(result.applied, false);
});

// ── stiffness Undo-bar ────────────────────────────────────────────────────────

test('undo-redo: stiffness → Undo restauriert alten Wert', () => {
  const room = 'ur-stiff-1';
  applyMutation(room, { type: 'stiffness', value: 0.5 });

  const msg = { type: 'stiffness', value: 0.9 };
  const before = captureBeforeSnapshot(room, msg, figureMaps);
  applyMutation(room, msg);
  const after = captureAfterSnapshot(before, figureMaps, room, msg);
  pushUndo(room, { before, after, mutationType: 'stiffness', ts: Date.now() });

  assert.equal(buildStateFromMutations(room).stiffness, 0.9, 'stiffness nach Mutation');
  performUndo(room, figureMaps);
  assert.equal(buildStateFromMutations(room).stiffness, 0.5, 'stiffness nach Undo');
});

// ── clearStacks ───────────────────────────────────────────────────────────────

test('undo-redo: clearStacks entfernt beide Stacks', () => {
  const room = 'ur-cleanup-1';
  applyMutation(room, { type: 'add', figure: freshFig('fclean') });
  const msg = { type: 'delete', id: 'fclean' };
  const before = captureBeforeSnapshot(room, msg, figureMaps);
  applyMutation(room, msg);
  const after = captureAfterSnapshot(before, figureMaps, room, msg);
  pushUndo(room, { before, after, mutationType: 'delete', ts: Date.now() });

  assert.equal(getUndoStatus(room).canUndo, true);
  clearStacks(room);
  assert.equal(getUndoStatus(room).canUndo, false);
  assert.equal(getUndoStatus(room).canRedo, false);
});

// ── UNDOABLE_TYPES enthält erwartete Typen ────────────────────────────────────

test('undo-redo: UNDOABLE_TYPES enthält alle erwarteten Typen', () => {
  const expected = ['add', 'move', 'update', 'delete', 'clear', 'stiffness', 'snapshot', 'figure_type_set'];
  for (const t of expected) {
    assert.ok(undoStackModule.UNDOABLE_TYPES.has(t), `UNDOABLE_TYPES muss ${t} enthalten`);
  }
});

test('undo-redo: UNDOABLE_TYPES enthält figure_possess NICHT', () => {
  assert.equal(undoStackModule.UNDOABLE_TYPES.has('figure_possess'), false);
});

test('undo-redo: UNDOABLE_TYPES enthält session_phase_set NICHT', () => {
  assert.equal(undoStackModule.UNDOABLE_TYPES.has('session_phase_set'), false);
});
```

- [ ] **Step 2: Tests ausführen**

Run: `cd /tmp/wt-brett-undo-redo/brett && npx tsx --test test/undo-redo.test.ts`
Expected: ALLE PASS

- [ ] **Step 3: Commit**

```bash
git add brett/test/undo-redo.test.ts
git commit -m "test(brett): add undo-redo stack unit tests [T000470]"
```

---

### Task 3.2: Permissions-Test-Ergänzung für session_undo/redo

**Files:**
- Modify: `brett/test/permissions.test.ts`

- [ ] **Step 1: Tests am Ende von permissions.test.ts hinzufügen**

```typescript
// ── T000470: session_undo/redo sind NICHT in canMutate (ADMIN_TYPES-Gate) ────

import { wsHandler as _wsHandler } from '../src/server/index';
const { ADMIN_TYPES } = _wsHandler as any;

test('T000470: session_undo ist in ADMIN_TYPES', () => {
  assert.ok(ADMIN_TYPES.has('session_undo'), 'session_undo muss in ADMIN_TYPES sein');
});

test('T000470: session_redo ist in ADMIN_TYPES', () => {
  assert.ok(ADMIN_TYPES.has('session_redo'), 'session_redo muss in ADMIN_TYPES sein');
});
```

- [ ] **Step 2: Bestehende permissions-Tests verifizieren**

Run: `cd /tmp/wt-brett-undo-redo/brett && npx tsx --test test/permissions.test.ts`
Expected: ALLE PASS (inkl. neue Tests)

- [ ] **Step 3: Commit**

```bash
git add brett/test/permissions.test.ts
git commit -m "test(brett): add permissions tests for session_undo/redo in ADMIN_TYPES [T000470]"
```

---

## Meilenstein 4: Client — Undo/Redo-State-Management

### Task 4.1: ws-client.ts — undo_stack_changed Handler

**Files:**
- Modify: `brett/src/client/ws-client.ts`

- [ ] **Step 1: UndoState-Singleton und Setter anlegen**

Am Anfang von ws-client.ts (nach den bestehenden Singleton-Deklarationen):

```typescript
// ── T000470: Undo/Redo-Stack-Status ──────────────────────────────────────────
export const undoState = {
  canUndo: false,
  canRedo: false,
  undoCount: 0,
  redoCount: 0,
};

let onUndoStateChange: ((state: typeof undoState) => void) | null = null;
export function setUndoStateChangeHandler(fn: typeof onUndoStateChange): void {
  onUndoStateChange = fn;
}

function applyUndoStateChange(
  canUndo: boolean, canRedo: boolean, undoCount: number, redoCount: number,
): void {
  undoState.canUndo = canUndo;
  undoState.canRedo = canRedo;
  undoState.undoCount = undoCount;
  undoState.redoCount = redoCount;
  if (onUndoStateChange) onUndoStateChange({ ...undoState });
}
```

- [ ] **Step 2: Handler im onWsMessage-switch hinzufügen**

Füge nach dem `figure_type_changed`-Case ein:

```typescript
    case 'undo_stack_changed':
      applyUndoStateChange(msg.canUndo, msg.canRedo, msg.undoCount, msg.redoCount);
      break;
```

- [ ] **Step 3: Public-Send-Helpers für Undo/Redo**

```typescript
export function sendUndo(): void {
  send({ type: 'session_undo' });
}

export function sendRedo(): void {
  send({ type: 'session_redo' });
}
```

- [ ] **Step 4: TypeScript verifizieren**

Run: `cd /tmp/wt-brett-undo-redo/brett && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add brett/src/client/ws-client.ts
git commit -m "feat(brett): add undo_stack_changed handler + sendUndo/Redo helpers [T000470]"
```

---

## Meilenstein 5: Client — HUD-Buttons und Keyboard-Shortcuts

### Task 5.1: hud.ts — Undo/Redo-Buttons

**Files:**
- Modify: `brett/src/client/ui/hud.ts`

- [ ] **Step 1: Undo/Redo-Button-Referenzen (lazy) anlegen**

```typescript
// ── T000470: Undo/Redo-Buttons (lazy — headless-safe) ────────────────────────
let _undoBtnEl: HTMLButtonElement | null | undefined = undefined;
let _redoBtnEl: HTMLButtonElement | null | undefined = undefined;

function getUndoBtn(): HTMLButtonElement | null {
  if (_undoBtnEl === undefined) {
    _undoBtnEl = document.getElementById('btn-undo') as HTMLButtonElement | null;
  }
  return _undoBtnEl;
}

function getRedoBtn(): HTMLButtonElement | null {
  if (_redoBtnEl === undefined) {
    _redoBtnEl = document.getElementById('btn-redo') as HTMLButtonElement | null;
  }
  return _redoBtnEl;
}
```

- [ ] **Step 2: updateUndoRedoButtons-Funktion exportieren**

```typescript
/**
 * Synchronisiert den enabled/disabled-Zustand der Undo/Redo-Buttons mit dem
 * aktuellen Stack-Status aus dem Server.
 * Wird von ws-client.ts via onUndoStateChange aufgerufen.
 * T000470: Feature-Flag 'undo-redo' (DARK-LAUNCH — kein No-Op wenn Flag fehlt,
 * da isAdmin-Gate schon auf Server-Seite schützt).
 */
export function updateUndoRedoButtons(canUndo: boolean, canRedo: boolean): void {
  const undoBtn = getUndoBtn();
  const redoBtn = getRedoBtn();
  if (undoBtn) {
    undoBtn.disabled = !canUndo;
    undoBtn.style.opacity = canUndo ? '1' : '0.4';
    undoBtn.style.cursor = canUndo ? 'pointer' : 'default';
  }
  if (redoBtn) {
    redoBtn.disabled = !canRedo;
    redoBtn.style.opacity = canRedo ? '1' : '0.4';
    redoBtn.style.cursor = canRedo ? 'pointer' : 'default';
  }
}
```

- [ ] **Step 3: TypeScript verifizieren**

Run: `cd /tmp/wt-brett-undo-redo/brett && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add brett/src/client/ui/hud.ts
git commit -m "feat(brett): add updateUndoRedoButtons to HUD [T000470]"
```

---

### Task 5.2: board-boot.ts — Buttons anlegen + Keyboard-Shortcuts verdrahten

**Files:**
- Modify: `brett/src/client/board-boot.ts`

- [ ] **Step 1: Undo/Redo-Buttons DOM-Elemente im bootBoard() erzeugen**

Füge nach dem `releaseBtn`-Block (D-spec Possession-Button) ein:

```typescript
  // ── T000470: Undo/Redo-Buttons (isAdmin-only, Dark-Launch) ────────────────
  const undoBtn = document.createElement('button');
  undoBtn.id = 'btn-undo';
  undoBtn.textContent = '↩ Rückgängig';
  Object.assign(undoBtn.style, {
    display: 'none',    // Initial versteckt, wird via updateUndoRedoBtnVisibility gesetzt
    fontFamily: 'var(--brett-font-mono, monospace)',
    fontSize: '10px',
    padding: '4px 10px',
    borderRadius: 'var(--brett-radius-sm, 6px)',
    border: '1px solid var(--brett-border, rgba(255,255,255,0.12))',
    background: 'var(--brett-surface-1, rgba(0,0,0,0.45))',
    color: 'var(--brett-fg, #e8e8e8)',
    cursor: 'pointer',
    opacity: '0.4',
    pointerEvents: 'auto',
  });
  undoBtn.disabled = true;

  const redoBtn = document.createElement('button');
  redoBtn.id = 'btn-redo';
  redoBtn.textContent = '↪ Wiederholen';
  Object.assign(redoBtn.style, { ...undoBtn.style });
  redoBtn.disabled = true;

  document.body.appendChild(undoBtn);
  document.body.appendChild(redoBtn);
```

- [ ] **Step 2: Click-Handler für Undo/Redo-Buttons**

```typescript
  undoBtn.addEventListener('click', () => {
    wsClient.sendUndo();
  });
  redoBtn.addEventListener('click', () => {
    wsClient.sendRedo();
  });
```

- [ ] **Step 3: Sichtbarkeit basierend auf isAdmin steuern**

```typescript
  // Buttons nur für isAdmin sichtbar machen
  try {
    const me = await (await fetch('/auth/me')).json();
    if (me.isAdmin) {
      undoBtn.style.display = 'inline-block';
      redoBtn.style.display = 'inline-block';
    }
  } catch { /* anon — Buttons bleiben versteckt */ }
```

Hinweis: Der /auth/me-Fetch ist bereits oben im bootBoard() vorhanden (currentUser-Initialisierung).
Kombiniere: wenn `me.isAdmin` setze sowohl `currentUser.isAdmin = true` als auch die Sichtbarkeit.

- [ ] **Step 4: onUndoStateChange in ws-client verdrahten**

```typescript
  wsClient.setUndoStateChangeHandler(({ canUndo, canRedo }) => {
    hud.updateUndoRedoButtons(canUndo, canRedo);
  });
```

- [ ] **Step 5: Keyboard-Shortcuts (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z)**

```typescript
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    // T000470: Undo/Redo Shortcuts — nur wenn kein Textfeld fokussiert ist
    const tag = (document.activeElement as HTMLElement)?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

    if (e.ctrlKey && !e.shiftKey && e.key === 'z') {
      e.preventDefault();
      wsClient.sendUndo();
    } else if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
      e.preventDefault();
      wsClient.sendRedo();
    }
  }, { capture: false });
```

- [ ] **Step 6: TypeScript verifizieren**

Run: `cd /tmp/wt-brett-undo-redo/brett && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add brett/src/client/board-boot.ts
git commit -m "feat(brett): wire undo/redo buttons + Ctrl+Z/Y keyboard shortcuts [T000470]"
```

---

## Meilenstein 6: Client Unit-Tests (HUD + WS-Client)

### Task 6.1: undo-redo-hud.test.ts erstellen

**Files:**
- Create: `brett/test/undo-redo-hud.test.ts`

- [ ] **Step 1: HUD-State-Tests schreiben**

```typescript
// brett/test/undo-redo-hud.test.ts — T000470: HUD-Buttons Undo/Redo Unit-Tests
// Tests laufen unter node:test mit tsx (kein DOM — nur die exportierten Pure-Funktionen)
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Direkt aus ws-client.ts importieren (kein DOM-Zugriff in diesem Modul)
import { undoState, applyUndoStateChange as _apply } from '../src/client/ws-client';

// applyUndoStateChange ist intern — via Event-Handler testen
import { setUndoStateChangeHandler, undoState as us } from '../src/client/ws-client';

test('undoState: initialer Zustand ist canUndo=false, canRedo=false', () => {
  assert.equal(us.canUndo, false);
  assert.equal(us.canRedo, false);
  assert.equal(us.undoCount, 0);
  assert.equal(us.redoCount, 0);
});

test('undoState: Handler wird aufgerufen wenn undo_stack_changed simuliert', () => {
  let callCount = 0;
  let lastState: any = null;
  setUndoStateChangeHandler((s) => { callCount++; lastState = s; });

  // Direktes Triggern via onWsMessage mit simulierter Nachricht
  // (kein echtes DOM/WS — nur die Reducer-Logik testen)
  // Da applyUndoStateChange intern ist, testen wir via onWsMessage
  const { onWsMessage } = require('../src/client/ws-client');
  const fakeEvt = {
    data: JSON.stringify({
      type: 'undo_stack_changed',
      canUndo: true, canRedo: false, undoCount: 3, redoCount: 0,
    }),
  };
  // Simuliere MessageEvent
  onWsMessage(fakeEvt);

  assert.equal(callCount, 1, 'Handler einmal aufgerufen');
  assert.equal(lastState.canUndo, true);
  assert.equal(lastState.undoCount, 3);

  setUndoStateChangeHandler(null); // cleanup
});
```

Hinweis: Falls `onWsMessage` in ws-client.ts nicht direkt exportiert ist, testen wir stattdessen
nur die `undoState`-Struktur und den `setUndoStateChangeHandler` (Mock-Pattern aus lobby-store.test.ts).

- [ ] **Step 2: Tests ausführen**

Run: `cd /tmp/wt-brett-undo-redo/brett && npx tsx --test test/undo-redo-hud.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add brett/test/undo-redo-hud.test.ts
git commit -m "test(brett): add HUD undo-state handler unit tests [T000470]"
```

---

## Meilenstein 7: Integration, Verifikation & CI

### Task 7.1: Vollständiger TypeScript-Check + Test-Suite

**Files:**
- Keine neuen Dateien — Verifikation aller bestehenden Tests

- [ ] **Step 1: Kompletter TypeScript-Check**

Run: `cd /tmp/wt-brett-undo-redo/brett && npx tsc --noEmit`
Expected: PASS, keine neuen Fehler

- [ ] **Step 2: Alle Brett-Tests ausführen**

Run: `cd /tmp/wt-brett-undo-redo/brett && npx tsx --test test/undo-redo.test.ts test/undo-redo-hud.test.ts test/permissions.test.ts test/relay-gate.test.ts`
Expected: ALLE PASS

- [ ] **Step 3: Vollständige CI-Test-Suite**

Run: `cd /tmp/wt-brett-undo-redo && bash scripts/task-oracle.sh 'run all offline tests'`
Expected: `task test:all` PASS

- [ ] **Step 4: Commit (falls Korrekturen nötig)**

```bash
git add -p
git commit -m "fix(brett): undo-redo integration fixes [T000470]"
```

---

### Task 7.2: Manuelle End-to-End Verifikation (Checkliste)

- [ ] **Check 1:** Admin bewegt eine Figur → Undo-Button wird enabled (↩ Rückgängig)
- [ ] **Check 2:** Admin klickt Undo → Figur springt zur ursprünglichen Position, Redo-Button enabled
- [ ] **Check 3:** Admin klickt Redo → Figur kehrt zur verschobenen Position zurück
- [ ] **Check 4:** Ctrl+Z feuert Undo, Ctrl+Y feuert Redo (Tastenkürzel funktionieren)
- [ ] **Check 5:** Nach 20 Undos: Stack bleibt bei 20 (kein weiterer Undo möglich)
- [ ] **Check 6:** Nicht-Admin sieht die Buttons NICHT
- [ ] **Check 7:** figure_possess löst KEINEN Undo-Stack-Eintrag aus
- [ ] **Check 8:** Alle Clients im Raum erhalten undo_stack_changed nach jeder Mutation
- [ ] **Check 9:** Undo eines `clear` restauriert alle vorherigen Figuren

---

### Task 7.3: Final Commit + PR-Vorbereitung

- [ ] **Step 1: Plan-Datei als ausgeführt markieren**

Setze in der Plan-Datei `status: executed` (wird nach PR-Merge gemacht).

- [ ] **Step 2: Branch pushen**

```bash
git push origin feature/brett-undo-redo
```

- [ ] **Step 3: PR erstellen**

```bash
gh pr create \
  --title "feat(brett): Undo/Redo Mutations-Stack — Slice 3 [T000470]" \
  --body "$(cat <<'EOF'
## Summary
- Server-seitiger Undo/Redo-Stack (max. 20 Schritte) in `brett/src/server/undo-stack.ts`
- Undo/Redo für Board-Mutationen: add, move, update, delete, clear, stiffness, snapshot, figure_type_set
- WS-Mutations: `session_undo` / `session_redo` (ADMIN_TYPES-gated, isAdmin only)
- HUD-Buttons (↩/↪) + Ctrl+Z / Ctrl+Y Keyboard-Shortcuts
- Teilnehmer-Joins/-Leaves und Phasenübergänge sind nicht undo-bar

## Test plan
- [ ] `npx tsx --test test/undo-redo.test.ts` — alle Stack-Unit-Tests grün
- [ ] `npx tsx --test test/permissions.test.ts` — session_undo/redo in ADMIN_TYPES
- [ ] `task test:all` — CI-Suite grün
- [ ] Manuelle E2E: Undo/Redo-Buttons funktionieren, Ctrl+Z/Y, Nicht-Admin sieht keine Buttons

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: CI grün abwarten und PR mergen**

```bash
gh pr checks --watch
gh pr merge --squash
```
