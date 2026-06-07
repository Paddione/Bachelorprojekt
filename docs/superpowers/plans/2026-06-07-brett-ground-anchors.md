---
title: "Brett: Boden-Anker & Zonen (Slice 4)"
ticket_id: T000468
spec: docs/superpowers/specs/2026-06-07-brett-ground-anchors-design.md
branch: feature/brett-ground-anchors
domains: [website]
status: active
pr_number: null
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Boden-Anker (kleine feste Punkt-Marker) und Zonen (farbige Flächen mit Beschriftung) auf dem Brett-Boden hinzufügen, nur Admin kann anlegen/löschen, mit vier neuen WS-Mutations und vollständiger DB-Persistenz.

**Architecture:** Neue `Anchor`- und `Zone`-Entitäten werden als Sentinel-Keys (`__anchors__`, `__zones__`) in `figureMaps` gespeichert und via `buildStateFromMutations` / `seedFigureMapFromState` persistiert; vier neue ADMIN_TYPES (`anchor_create`, `anchor_delete`, `zone_create`, `zone_delete`) werden im Admin-Handler verarbeitet und client-seitig als Three.js-Meshes gerendert.

**Tech Stack:** TypeScript, Three.js, ws, node:test, tsx/jsdom

**Ticket-ID:** T000468

---

## Meilenstein 1: Shared Types

### Task 1.1: Neue Typen `Anchor`, `Zone`, `ZoneShape` in `state.ts`

**Files:**
- Modify: `brett/src/types/state.ts`

- [ ] **Step 1: `Anchor`- und `Zone`-Interfaces hinzufügen**

  Am Ende der Datei nach dem `RoomState`-Interface einfügen:

  ```typescript
  // ── Boden-Anker & Zonen (T000468) ────────────────────────────────────────────

  /** Kleiner fester Punkt-Marker auf dem Boden des Bretts. */
  export interface Anchor {
    /** Server-seitig generierte ID. */
    id: string;
    /** Board X-Koordinate. */
    x: number;
    /** Board Z-Koordinate. */
    z: number;
    /** Optionale Beschriftung. */
    label?: string;
    /** CSS-Farbe, z.B. '#c8a96e'. Default: '#c8a96e'. */
    color?: string;
  }

  export type ZoneShape = 'rect' | 'circle';

  /** Farbige Fläche auf dem Boden mit optionaler Beschriftung. */
  export interface Zone {
    /** Server-seitig generierte ID. */
    id: string;
    /** Mittelpunkt X. */
    x: number;
    /** Mittelpunkt Z. */
    z: number;
    /** Form: 'rect' (Rechteck) oder 'circle' (Kreis). */
    shape: ZoneShape;
    /** Breite in Board-Einheiten (nur für 'rect'). Default: 2.0 */
    width?: number;
    /** Tiefe in Board-Einheiten (nur für 'rect'). Default: 2.0 */
    height?: number;
    /** Radius in Board-Einheiten (nur für 'circle'). Default: 1.5 */
    radius?: number;
    /** Optionale Beschriftung. */
    label?: string;
    /** CSS-Farbe, z.B. '#4ea1ff'. Default: '#4ea1ff'. */
    color?: string;
    /** Deckkraft der Fläche, 0..1. Default: 0.25 */
    opacity?: number;
  }
  ```

- [ ] **Step 2: TypeScript verifizieren**

  Run: `cd /home/patrick/Bachelorprojekt/brett && npx tsc --noEmit`  
  Expected: PASS (keine neuen Fehler)

- [ ] **Step 3: Commit**

  ```bash
  cd /tmp/wt-brett-ground-anchors
  git add brett/src/types/state.ts
  git commit -m "feat(brett): add Anchor + Zone types to shared state [T000468]"
  ```

---

### Task 1.2: Neue ClientMessage- und ServerMessage-Typen in `messages.ts`

**Files:**
- Modify: `brett/src/types/messages.ts`

- [ ] **Step 1: Import der neuen Typen ergänzen**

  Erste Zeile von `messages.ts` anpassen (Import um `Anchor`, `Zone` erweitern):

  ```typescript
  import type { Anchor, Figure, FigureAppearance, FigureType, OptikSettings, Participant, Phase, Role, Zone } from './state';
  ```

- [ ] **Step 2: Vier neue ClientMessage-Varianten hinzufügen**

  Ans Ende der `ClientMessage`-Union, vor dem abschließenden Semikolon / nach dem letzten `|`-Member:

  ```typescript
    | { type: 'anchor_create'; anchor: Omit<Anchor, 'id'> }
    | { type: 'anchor_delete'; anchorId: string }
    | { type: 'zone_create'; zone: Omit<Zone, 'id'> }
    | { type: 'zone_delete'; zoneId: string };
  ```

- [ ] **Step 3: Snapshot-ServerMessage um `anchors` und `zones` erweitern**

  Die bestehende `snapshot`-Zeile in `ServerMessage` anpassen:

  ```typescript
    | { type: 'snapshot'; figures: Figure[]; stiffness?: number; locks?: ServerLock[];
        phase?: Phase; sessionCode?: string | null; optik?: OptikSettings;
        participants?: Participant[];
        anchors?: Anchor[];
        zones?: Zone[];
      }
  ```

- [ ] **Step 4: Vier neue ServerMessage-Varianten hinzufügen**

  Nach dem letzten bestehenden Member der `ServerMessage`-Union (vor `| { type: 'error' ... }`):

  ```typescript
    | { type: 'anchor_added'; anchor: Anchor }
    | { type: 'anchor_removed'; anchorId: string }
    | { type: 'zone_added'; zone: Zone }
    | { type: 'zone_removed'; zoneId: string }
  ```

- [ ] **Step 5: TypeScript verifizieren**

  Run: `cd /home/patrick/Bachelorprojekt/brett && npx tsc --noEmit`  
  Expected: PASS

- [ ] **Step 6: Commit**

  ```bash
  cd /tmp/wt-brett-ground-anchors
  git add brett/src/types/messages.ts
  git commit -m "feat(brett): add anchor/zone WS message types [T000468]"
  ```

---

## Meilenstein 2: Server — Mutations & State

### Task 2.1: `generateId()` + vier neue `applyMutation`-Cases in `figures.ts`

**Files:**
- Modify: `brett/src/server/figures.ts`

- [ ] **Step 1: `generateId()`-Hilfsfunktion am Anfang der Datei hinzufügen**

  Direkt nach den ersten `export const`-Zeilen (nach `figureLocks`):

  ```typescript
  // ── ID-Generator für Anker & Zonen ───────────────────────────────────────────
  const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
  function generateId(): string {
    let s = '';
    for (let i = 0; i < 12; i++) s += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
    return s;
  }
  ```

- [ ] **Step 2: Vier neue Cases im `applyMutation`-Switch hinzufügen**

  Direkt vor dem abschließenden `}` der `switch`-Anweisung in `applyMutation`, nach `case 'lobby_settings_set'`:

  ```typescript
    case 'anchor_create': {
      if (msg.anchor && typeof msg.anchor === 'object') {
        const existing: any[] = figs.get('__anchors__')?.anchors ?? [];
        const newAnchor = { ...msg.anchor, id: typeof msg.anchor.id === 'string' ? msg.anchor.id : generateId() };
        figs.set('__anchors__', { id: '__anchors__', anchors: [...existing, newAnchor] });
      }
      break;
    }
    case 'anchor_delete': {
      if (typeof msg.anchorId === 'string') {
        const existing: any[] = figs.get('__anchors__')?.anchors ?? [];
        figs.set('__anchors__', { id: '__anchors__', anchors: existing.filter((a: any) => a.id !== msg.anchorId) });
      }
      break;
    }
    case 'zone_create': {
      if (msg.zone && typeof msg.zone === 'object') {
        const existing: any[] = figs.get('__zones__')?.zones ?? [];
        const newZone = { ...msg.zone, id: typeof msg.zone.id === 'string' ? msg.zone.id : generateId() };
        figs.set('__zones__', { id: '__zones__', zones: [...existing, newZone] });
      }
      break;
    }
    case 'zone_delete': {
      if (typeof msg.zoneId === 'string') {
        const existing: any[] = figs.get('__zones__')?.zones ?? [];
        figs.set('__zones__', { id: '__zones__', zones: existing.filter((z: any) => z.id !== msg.zoneId) });
      }
      break;
    }
  ```

- [ ] **Step 3: TypeScript verifizieren**

  Run: `cd /home/patrick/Bachelorprojekt/brett && npx tsc --noEmit`  
  Expected: PASS

- [ ] **Step 4: Commit**

  ```bash
  cd /tmp/wt-brett-ground-anchors
  git add brett/src/server/figures.ts
  git commit -m "feat(brett): add anchor/zone mutations to applyMutation [T000468]"
  ```

---

### Task 2.2: `buildStateFromMutations` um `anchors` und `zones` erweitern

**Files:**
- Modify: `brett/src/server/phases.ts`

- [ ] **Step 1: Neue Sentinel-Keys in `SPECIAL`-Array aufnehmen**

  In `buildStateFromMutations`, die `SPECIAL`-Array-Definition anpassen:

  ```typescript
  const SPECIAL = [
    '__optik__', '__stiffness__',
    '__session_phase__', '__session_code__', '__admin_token_holder__',
    '__session_created_at__', '__session_last_activity__',
    '__coaching_steps__', '__roles__', '__lobby_settings__',
    '__anchors__', '__zones__',   // NEU T000468
  ];
  ```

- [ ] **Step 2: `anchors` und `zones` ins Result-Objekt einfügen**

  Am Ende von `buildStateFromMutations`, vor `return result`:

  ```typescript
  const anchorsEntry = figs.get('__anchors__');
  const zonesEntry   = figs.get('__zones__');
  result.anchors = anchorsEntry?.anchors ?? [];
  result.zones   = zonesEntry?.zones   ?? [];
  ```

- [ ] **Step 3: TypeScript verifizieren**

  Run: `cd /home/patrick/Bachelorprojekt/brett && npx tsc --noEmit`  
  Expected: PASS

- [ ] **Step 4: Commit**

  ```bash
  cd /tmp/wt-brett-ground-anchors
  git add brett/src/server/phases.ts
  git commit -m "feat(brett): expose anchors/zones in buildStateFromMutations [T000468]"
  ```

---

### Task 2.3: `seedFigureMapFromState` um `anchors` und `zones` erweitern

**Files:**
- Modify: `brett/src/server/figures.ts`

- [ ] **Step 1: Neue Seed-Cases in `seedFigureMapFromState` hinzufügen**

  Am Ende von `seedFigureMapFromState`, nach dem `lobbySettings`-Block:

  ```typescript
  if (state.anchors && Array.isArray(state.anchors) && state.anchors.length > 0) {
    map.set('__anchors__', { id: '__anchors__', anchors: state.anchors });
  }
  if (state.zones && Array.isArray(state.zones) && state.zones.length > 0) {
    map.set('__zones__', { id: '__zones__', zones: state.zones });
  }
  ```

- [ ] **Step 2: TypeScript verifizieren**

  Run: `cd /home/patrick/Bachelorprojekt/brett && npx tsc --noEmit`  
  Expected: PASS

- [ ] **Step 3: Commit**

  ```bash
  cd /tmp/wt-brett-ground-anchors
  git add brett/src/server/figures.ts
  git commit -m "feat(brett): reseed anchors/zones in seedFigureMapFromState [T000468]"
  ```

---

### Task 2.4: WS-Handler — ADMIN_TYPES + Admin-Handler für Anker/Zonen

**Files:**
- Modify: `brett/src/server/ws-handler.ts`
- Modify: `brett/src/server/ws-admin-commands.ts`

- [ ] **Step 1: Vier neue Typen zu `ADMIN_TYPES` hinzufügen**

  In `ws-handler.ts`, die `ADMIN_TYPES`-Set-Definition erweitern:

  ```typescript
  export const ADMIN_TYPES = new Set<string>([
    'admin_kick', 'admin_broadcast', 'admin_session_create', 'admin_handoff_token', 'admin_round_stop', 'admin_round_pause', 'admin_coaching_steps_set',
    'admin_round_start', 'admin_assign_role', 'admin_assign_figure',
    'admin_set_template', 'admin_set_optik',
    'figure_type_set',
    'anchor_create', 'anchor_delete', 'zone_create', 'zone_delete',  // NEU T000468
  ]);
  ```

- [ ] **Step 2: Join-Snapshot um `anchors` und `zones` erweitern**

  In `ws-handler.ts`, im Join-Snapshot-Block die `ws.send`-Payload anpassen. Den Block suchen, in dem `type: 'snapshot'` für den beitretenden Client gesendet wird:

  ```typescript
  // Im Join-Snapshot-Versand (suche nach: type: 'snapshot', figures):
  const snapshotState = deps.buildStateFromMutations(room);
  ws.send(JSON.stringify({
    type: 'snapshot',
    figures: snapshotFigures,
    stiffness: snapshotState?.stiffness,
    locks: snapshotLocks,
    phase: snapshotState?.sessionPhase,
    sessionCode: snapshotState?.sessionCode ?? null,
    optik: snapshotState?.optik,
    participants: snapshotParticipants,
    anchors: snapshotState?.anchors ?? [],   // NEU T000468
    zones: snapshotState?.zones ?? [],       // NEU T000468
  }));
  ```

  HINWEIS: Der genaue Snapshot-Block muss im WS-Handler gefunden und entsprechend ergänzt werden.

- [ ] **Step 3: Handler in `ws-admin-commands.ts` hinzufügen**

  Am Ende der `handleAdminMessage`-Funktion, in den `switch (msg.type)`-Block (vor oder nach dem `figure_type_set`-Case):

  ```typescript
  case 'anchor_create': {
    if (!msg.anchor || typeof msg.anchor !== 'object' ||
        typeof msg.anchor.x !== 'number' || typeof msg.anchor.z !== 'number') {
      try { ws.send(JSON.stringify({ type: 'error', reason: 'invalid_anchor' })); } catch {}
      return;
    }
    deps.applyMutation(room, { type: 'anchor_create', anchor: msg.anchor });
    // Hole die ID, die applyMutation vergeben hat
    const builtAnchors = deps.buildStateFromMutations(room)?.anchors ?? [];
    const added = builtAnchors[builtAnchors.length - 1];
    if (added) {
      deps.broadcast(room, { type: 'anchor_added', anchor: added });
    }
    deps.schedulePersist(room);
    return;
  }
  case 'anchor_delete': {
    if (typeof msg.anchorId !== 'string') {
      try { ws.send(JSON.stringify({ type: 'error', reason: 'invalid_anchor_id' })); } catch {}
      return;
    }
    deps.applyMutation(room, { type: 'anchor_delete', anchorId: msg.anchorId });
    deps.broadcast(room, { type: 'anchor_removed', anchorId: msg.anchorId });
    deps.schedulePersist(room);
    return;
  }
  case 'zone_create': {
    if (!msg.zone || typeof msg.zone !== 'object' ||
        typeof msg.zone.x !== 'number' || typeof msg.zone.z !== 'number' ||
        (msg.zone.shape !== 'rect' && msg.zone.shape !== 'circle')) {
      try { ws.send(JSON.stringify({ type: 'error', reason: 'invalid_zone' })); } catch {}
      return;
    }
    deps.applyMutation(room, { type: 'zone_create', zone: msg.zone });
    const builtZones = deps.buildStateFromMutations(room)?.zones ?? [];
    const addedZone = builtZones[builtZones.length - 1];
    if (addedZone) {
      deps.broadcast(room, { type: 'zone_added', zone: addedZone });
    }
    deps.schedulePersist(room);
    return;
  }
  case 'zone_delete': {
    if (typeof msg.zoneId !== 'string') {
      try { ws.send(JSON.stringify({ type: 'error', reason: 'invalid_zone_id' })); } catch {}
      return;
    }
    deps.applyMutation(room, { type: 'zone_delete', zoneId: msg.zoneId });
    deps.broadcast(room, { type: 'zone_removed', zoneId: msg.zoneId });
    deps.schedulePersist(room);
    return;
  }
  ```

- [ ] **Step 4: TypeScript verifizieren**

  Run: `cd /home/patrick/Bachelorprojekt/brett && npx tsc --noEmit`  
  Expected: PASS

- [ ] **Step 5: Commit**

  ```bash
  cd /tmp/wt-brett-ground-anchors
  git add brett/src/server/ws-handler.ts brett/src/server/ws-admin-commands.ts
  git commit -m "feat(brett): ADMIN_TYPES + handler for anchor/zone WS mutations [T000468]"
  ```

---

## Meilenstein 3: Tests

### Task 3.1: Neue Testdatei `anchor-zone.test.ts`

**Files:**
- Create: `brett/test/anchor-zone.test.ts`

- [ ] **Step 1: Test-Datei anlegen**

  ```typescript
  // brett/test/anchor-zone.test.ts — T000468
  import { test } from 'node:test';
  import assert from 'node:assert';
  import { applyMutation, buildStateFromMutations, figures } from '../src/server/index';

  // ── anchor_create ────────────────────────────────────────────────────────────

  test('anchor_create: Anker wird korrekt angelegt', () => {
    const room = 'az-test-ac-1';
    applyMutation(room, { type: 'anchor_create', anchor: { x: 2, z: 3, label: 'Start', color: '#c8a96e' } });
    const state = buildStateFromMutations(room);
    assert.ok(Array.isArray(state.anchors), 'state.anchors ist ein Array');
    assert.strictEqual(state.anchors.length, 1);
    const a = state.anchors[0];
    assert.strictEqual(typeof a.id, 'string', 'ID wurde generiert');
    assert.ok(a.id.length >= 1, 'ID ist nicht leer');
    assert.strictEqual(a.x, 2);
    assert.strictEqual(a.z, 3);
    assert.strictEqual(a.label, 'Start');
    assert.strictEqual(a.color, '#c8a96e');
  });

  test('anchor_create: Mehrere Anker kumulieren', () => {
    const room = 'az-test-ac-2';
    applyMutation(room, { type: 'anchor_create', anchor: { x: 1, z: 1 } });
    applyMutation(room, { type: 'anchor_create', anchor: { x: 2, z: 2 } });
    applyMutation(room, { type: 'anchor_create', anchor: { x: 3, z: 3 } });
    const state = buildStateFromMutations(room);
    assert.strictEqual(state.anchors.length, 3, 'drei Anker vorhanden');
  });

  test('anchor_create: ungültige Payload wird ignoriert', () => {
    const room = 'az-test-ac-3';
    applyMutation(room, { type: 'anchor_create', anchor: null });
    applyMutation(room, { type: 'anchor_create' });
    const state = buildStateFromMutations(room);
    assert.strictEqual(state.anchors.length, 0, 'ungültige Payloads werden ignoriert');
  });

  // ── anchor_delete ────────────────────────────────────────────────────────────

  test('anchor_delete: Anker wird entfernt, andere bleiben', () => {
    const room = 'az-test-ad-1';
    applyMutation(room, { type: 'anchor_create', anchor: { x: 1, z: 1, id: 'a1' } });
    applyMutation(room, { type: 'anchor_create', anchor: { x: 2, z: 2, id: 'a2' } });
    applyMutation(room, { type: 'anchor_delete', anchorId: 'a1' });
    const state = buildStateFromMutations(room);
    assert.strictEqual(state.anchors.length, 1, 'nur noch ein Anker übrig');
    assert.strictEqual(state.anchors[0].x, 2, 'richtiger Anker geblieben');
  });

  test('anchor_delete: unbekannte ID ist ein No-Op', () => {
    const room = 'az-test-ad-2';
    applyMutation(room, { type: 'anchor_create', anchor: { x: 5, z: 5 } });
    applyMutation(room, { type: 'anchor_delete', anchorId: 'nonexistent' });
    const state = buildStateFromMutations(room);
    assert.strictEqual(state.anchors.length, 1, 'Anker unberührt bei unbekannter ID');
  });

  // ── zone_create ───────────────────────────────────────────────────────────────

  test('zone_create: Rechteck-Zone wird korrekt angelegt', () => {
    const room = 'az-test-zc-1';
    applyMutation(room, { type: 'zone_create', zone: { x: 0, z: 0, shape: 'rect', width: 3, height: 2, label: 'Ressourcen', color: '#4ea1ff', opacity: 0.3 } });
    const state = buildStateFromMutations(room);
    assert.ok(Array.isArray(state.zones), 'state.zones ist ein Array');
    assert.strictEqual(state.zones.length, 1);
    const z = state.zones[0];
    assert.strictEqual(typeof z.id, 'string', 'ID wurde generiert');
    assert.strictEqual(z.shape, 'rect');
    assert.strictEqual(z.width, 3);
    assert.strictEqual(z.height, 2);
    assert.strictEqual(z.label, 'Ressourcen');
    assert.strictEqual(z.color, '#4ea1ff');
    assert.strictEqual(z.opacity, 0.3);
  });

  test('zone_create: Kreis-Zone wird korrekt angelegt', () => {
    const room = 'az-test-zc-2';
    applyMutation(room, { type: 'zone_create', zone: { x: 1, z: -1, shape: 'circle', radius: 2.5, color: '#3fb950' } });
    const state = buildStateFromMutations(room);
    assert.strictEqual(state.zones.length, 1);
    assert.strictEqual(state.zones[0].shape, 'circle');
    assert.strictEqual(state.zones[0].radius, 2.5);
  });

  test('zone_create: ungültige Payload wird ignoriert', () => {
    const room = 'az-test-zc-3';
    applyMutation(room, { type: 'zone_create', zone: null });
    applyMutation(room, { type: 'zone_create' });
    const state = buildStateFromMutations(room);
    assert.strictEqual(state.zones.length, 0, 'ungültige Payloads werden ignoriert');
  });

  // ── zone_delete ───────────────────────────────────────────────────────────────

  test('zone_delete: Zone wird entfernt, andere bleiben', () => {
    const room = 'az-test-zd-1';
    applyMutation(room, { type: 'zone_create', zone: { x: 0, z: 0, shape: 'rect', id: 'z1' } });
    applyMutation(room, { type: 'zone_create', zone: { x: 5, z: 5, shape: 'circle', id: 'z2' } });
    applyMutation(room, { type: 'zone_delete', zoneId: 'z1' });
    const state = buildStateFromMutations(room);
    assert.strictEqual(state.zones.length, 1, 'nur noch eine Zone übrig');
    assert.strictEqual(state.zones[0].shape, 'circle', 'richtige Zone geblieben');
  });

  test('zone_delete: unbekannte ID ist ein No-Op', () => {
    const room = 'az-test-zd-2';
    applyMutation(room, { type: 'zone_create', zone: { x: 0, z: 0, shape: 'rect' } });
    applyMutation(room, { type: 'zone_delete', zoneId: 'nonexistent' });
    const state = buildStateFromMutations(room);
    assert.strictEqual(state.zones.length, 1, 'Zone unberührt bei unbekannter ID');
  });

  // ── buildStateFromMutations ────────────────────────────────────────────────────

  test('buildStateFromMutations: anchors und zones immer als Array (auch wenn leer)', () => {
    const room = 'az-test-bs-1';
    // Kein Anker/Zone angelegt
    const state = buildStateFromMutations(room);
    assert.ok(state === null || Array.isArray(state?.anchors), 'anchors ist Array oder State ist null');
    // Mit einem Eintrag
    applyMutation(room, { type: 'anchor_create', anchor: { x: 0, z: 0 } });
    const state2 = buildStateFromMutations(room);
    assert.ok(Array.isArray(state2.anchors));
    assert.ok(Array.isArray(state2.zones));
    assert.strictEqual(state2.zones.length, 0, 'zones leer wenn keine Zone angelegt');
  });

  test('buildStateFromMutations: anchors/zones sind kein Sentinel-Figure', () => {
    const room = 'az-test-bs-2';
    applyMutation(room, { type: 'anchor_create', anchor: { x: 1, z: 1 } });
    applyMutation(room, { type: 'zone_create', zone: { x: 0, z: 0, shape: 'circle' } });
    const state = buildStateFromMutations(room);
    // figures darf keine __anchors__ / __zones__ enthalten
    const figIds = state.figures.map((f: any) => f.id);
    assert.ok(!figIds.includes('__anchors__'), '__anchors__ darf nicht in figures auftauchen');
    assert.ok(!figIds.includes('__zones__'), '__zones__ darf nicht in figures auftauchen');
  });

  // ── Persistenz-Round-Trip ─────────────────────────────────────────────────────

  test('seedFigureMapFromState: anchors und zones überleben build → seed → build', () => {
    const room = 'az-test-rt-1';
    applyMutation(room, { type: 'anchor_create', anchor: { x: 2, z: -1, label: 'Anker A', color: '#c8a96e', id: 'rt-a1' } });
    applyMutation(room, { type: 'zone_create', zone: { x: 0, z: 0, shape: 'rect', width: 4, height: 3, label: 'Zone B', color: '#4ea1ff', id: 'rt-z1' } });

    const persisted = buildStateFromMutations(room);
    assert.strictEqual(persisted.anchors.length, 1);
    assert.strictEqual(persisted.zones.length, 1);

    const freshMap = new Map<string, any>();
    figures.seedFigureMapFromState(freshMap, persisted);
    figures.figureMaps.set('az-test-rt-1-b', freshMap);

    const rebuilt = buildStateFromMutations('az-test-rt-1-b');
    assert.strictEqual(rebuilt.anchors.length, 1, 'Anker nach Round-Trip vorhanden');
    assert.strictEqual(rebuilt.anchors[0].id, 'rt-a1');
    assert.strictEqual(rebuilt.anchors[0].label, 'Anker A');
    assert.strictEqual(rebuilt.zones.length, 1, 'Zone nach Round-Trip vorhanden');
    assert.strictEqual(rebuilt.zones[0].id, 'rt-z1');
    assert.strictEqual(rebuilt.zones[0].label, 'Zone B');
    assert.strictEqual(rebuilt.zones[0].width, 4);
  });

  test('seedFigureMapFromState: leere anchors/zones werden nicht als Sentinel gesetzt', () => {
    const room = 'az-test-rt-2';
    // State ohne Anker/Zonen
    applyMutation(room, { type: 'stiffness', value: 0.5 });
    const persisted = buildStateFromMutations(room);
    assert.ok(Array.isArray(persisted.anchors) && persisted.anchors.length === 0);

    const freshMap = new Map<string, any>();
    figures.seedFigureMapFromState(freshMap, persisted);
    // __anchors__ sollte NICHT gesetzt sein, wenn keine vorhanden
    assert.strictEqual(freshMap.get('__anchors__'), undefined, '__anchors__ nicht gesetzt wenn leer');
    assert.strictEqual(freshMap.get('__zones__'), undefined, '__zones__ nicht gesetzt wenn leer');
  });

  // ── ADMIN_TYPES Guard ─────────────────────────────────────────────────────────

  test('ADMIN_TYPES enthält alle vier anchor/zone Typen', () => {
    const { wsHandler } = require('../src/server/index');
    const { ADMIN_TYPES } = wsHandler;
    assert.ok(ADMIN_TYPES.has('anchor_create'), 'anchor_create in ADMIN_TYPES');
    assert.ok(ADMIN_TYPES.has('anchor_delete'), 'anchor_delete in ADMIN_TYPES');
    assert.ok(ADMIN_TYPES.has('zone_create'), 'zone_create in ADMIN_TYPES');
    assert.ok(ADMIN_TYPES.has('zone_delete'), 'zone_delete in ADMIN_TYPES');
  });
  ```

- [ ] **Step 2: Tests ausführen**

  Run: `cd /home/patrick/Bachelorprojekt/brett && node --test test/anchor-zone.test.ts 2>&1 | head -60`  
  Expected: Alle Tests PASS (grün)

- [ ] **Step 3: TypeScript verifizieren**

  Run: `cd /home/patrick/Bachelorprojekt/brett && npx tsc --noEmit`  
  Expected: PASS

- [ ] **Step 4: Commit**

  ```bash
  cd /tmp/wt-brett-ground-anchors
  git add brett/test/anchor-zone.test.ts
  git commit -m "test(brett): anchor/zone mutation + round-trip tests [T000468]"
  ```

---

### Task 3.2: Messages-Exhaustiveness-Test ergänzen

**Files:**
- Modify: `brett/test/messages.test.ts`

- [ ] **Step 1: Neue ClientMessage-Typen in den Exhaustiveness-Test aufnehmen**

  In `messages.test.ts`, im Test für die ClientMessage-Typen die neuen Typen zur erwarteten Liste hinzufügen:

  ```typescript
  // In dem Test, der alle ClientMessage-Typen prüft:
  // Füge zu der erwarteten Typen-Liste hinzu:
  'anchor_create',
  'anchor_delete',
  'zone_create',
  'zone_delete',
  ```

- [ ] **Step 2: Neue ServerMessage-Typen in den Exhaustiveness-Test aufnehmen**

  ```typescript
  // In dem Test, der alle ServerMessage-Typen prüft:
  'anchor_added',
  'anchor_removed',
  'zone_added',
  'zone_removed',
  ```

- [ ] **Step 3: Tests ausführen**

  Run: `cd /home/patrick/Bachelorprojekt/brett && node --test test/messages.test.ts 2>&1`  
  Expected: PASS

- [ ] **Step 4: Commit**

  ```bash
  cd /tmp/wt-brett-ground-anchors
  git add brett/test/messages.test.ts
  git commit -m "test(brett): anchor/zone message types in exhaustiveness test [T000468]"
  ```

---

## Meilenstein 4: Client-Side 3D-Rendering

### Task 4.1: Neues Modul `ground-objects.ts` für 3D-Darstellung

**Files:**
- Create: `brett/src/client/ground-objects.ts`

- [ ] **Step 1: Modul anlegen**

  ```typescript
  // brett/src/client/ground-objects.ts — T000468
  // 3D-Rendering von Boden-Ankern und Zonen.
  // DARK-LAUNCH: Wird von board-boot.ts und ws-client.ts nur aufgerufen, wenn
  // window.__brettFeatures['t000468-ground-anchors'] gesetzt ist.

  import * as THREE from 'three';
  import type { Anchor, Zone } from '../types/state';
  import { getScene } from './state';

  // Mesh-Maps: anchorId / zoneId → THREE.Group (enthält Mesh + optionalen Sprite)
  export const anchorMeshes = new Map<string, THREE.Group>();
  export const zoneMeshes   = new Map<string, THREE.Group>();

  // ── Hilfsfunktion: Label-Sprite ───────────────────────────────────────────────

  function makeLabelSprite(text: string, color: string): THREE.Sprite {
    const canvas  = document.createElement('canvas');
    canvas.width  = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(10,14,24,0.72)';
    if ((ctx as any).roundRect) {
      (ctx as any).roundRect(2, 2, 252, 60, 10);
    } else {
      ctx.rect(2, 2, 252, 60);
    }
    ctx.fill();
    ctx.font = 'bold 20px monospace';
    ctx.fillStyle = color || '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 32);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.4, 0.35, 1);
    return sprite;
  }

  function disposeSprite(sprite: THREE.Sprite): void {
    sprite.material.map?.dispose();
    sprite.material.dispose();
  }

  function disposeGroup(g: THREE.Group): void {
    g.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.geometry?.dispose();
        if (Array.isArray(m.material)) {
          m.material.forEach((mt) => mt.dispose());
        } else {
          (m.material as THREE.Material)?.dispose();
        }
      }
      if ((obj as THREE.Sprite).isSprite) {
        disposeSprite(obj as THREE.Sprite);
      }
    });
  }

  // ── Anchor-Rendering ──────────────────────────────────────────────────────────

  export function applyAnchorAdded(anchor: Anchor): void {
    if (anchorMeshes.has(anchor.id)) return; // Duplikat-Guard
    const { scene } = getScene();
    const group = new THREE.Group();
    group.position.set(anchor.x, 0, anchor.z);

    // Kegelförmiger Marker (Basis breit, oben schmal)
    const geo = new THREE.CylinderGeometry(0.04, 0.14, 0.22, 8);
    const mat = new THREE.MeshStandardMaterial({
      color: anchor.color ?? '#c8a96e',
      roughness: 0.6,
      metalness: 0.2,
      emissive: anchor.color ?? '#c8a96e',
      emissiveIntensity: 0.18,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 0.11; // leicht über dem Boden
    group.add(mesh);

    // Kleiner Leuchtring am Boden
    const ringGeo = new THREE.RingGeometry(0.18, 0.24, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: anchor.color ?? '#c8a96e',
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.002;
    group.add(ring);

    // Label (falls vorhanden)
    if (anchor.label) {
      const sprite = makeLabelSprite(anchor.label, anchor.color ?? '#c8a96e');
      sprite.position.set(0, 0.7, 0);
      group.add(sprite);
    }

    scene.add(group);
    anchorMeshes.set(anchor.id, group);
  }

  export function applyAnchorRemoved(anchorId: string): void {
    const group = anchorMeshes.get(anchorId);
    if (!group) return;
    try {
      const { scene } = getScene();
      scene.remove(group);
    } catch { /* scene nicht initialisiert */ }
    disposeGroup(group);
    anchorMeshes.delete(anchorId);
  }

  // ── Zone-Rendering ────────────────────────────────────────────────────────────

  export function applyZoneAdded(zone: Zone): void {
    if (zoneMeshes.has(zone.id)) return; // Duplikat-Guard
    const { scene } = getScene();
    const group = new THREE.Group();
    group.position.set(zone.x, 0, zone.z);

    const color  = zone.color   ?? '#4ea1ff';
    const opacity = zone.opacity ?? 0.25;

    // Flächen-Mesh
    let geo: THREE.BufferGeometry;
    if (zone.shape === 'circle') {
      geo = new THREE.CircleGeometry(zone.radius ?? 1.5, 48);
    } else {
      geo = new THREE.PlaneGeometry(zone.width ?? 2.0, zone.height ?? 2.0);
    }
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.003; // leicht über dem Boden, unter Ankern
    group.add(mesh);

    // Rand-Outline
    let outlineGeo: THREE.BufferGeometry;
    if (zone.shape === 'circle') {
      const r = zone.radius ?? 1.5;
      const segments = 48;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(angle) * r, 0, Math.sin(angle) * r));
      }
      outlineGeo = new THREE.BufferGeometry().setFromPoints(pts);
    } else {
      const w2 = (zone.width ?? 2.0) / 2;
      const h2 = (zone.height ?? 2.0) / 2;
      const corners = [
        new THREE.Vector3(-w2, 0, -h2),
        new THREE.Vector3( w2, 0, -h2),
        new THREE.Vector3( w2, 0,  h2),
        new THREE.Vector3(-w2, 0,  h2),
        new THREE.Vector3(-w2, 0, -h2),
      ];
      outlineGeo = new THREE.BufferGeometry().setFromPoints(corners);
    }
    const outlineMat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: Math.min(1, opacity * 2.5),
    });
    const outline = new THREE.Line(outlineGeo, outlineMat);
    outline.position.y = 0.004;
    group.add(outline);

    // Label (falls vorhanden)
    if (zone.label) {
      const sprite = makeLabelSprite(zone.label, color);
      sprite.position.set(0, 0.4, 0);
      group.add(sprite);
    }

    scene.add(group);
    zoneMeshes.set(zone.id, group);
  }

  export function applyZoneRemoved(zoneId: string): void {
    const group = zoneMeshes.get(zoneId);
    if (!group) return;
    try {
      const { scene } = getScene();
      scene.remove(group);
    } catch { /* scene nicht initialisiert */ }
    disposeGroup(group);
    zoneMeshes.delete(zoneId);
  }

  // ── Snapshot-Initialisierung ──────────────────────────────────────────────────

  /**
   * Beim Beitreten eines Raums: alle vorhandenen Anker und Zonen aus dem
   * Server-Snapshot in die Szene rendern. Bestehende Meshes werden zuerst
   * entfernt (idempotent bei reconnect).
   */
  export function initGroundObjectsFromSnapshot(anchors: Anchor[], zones: Zone[]): void {
    // Cleanup bestehender Meshes
    for (const [id] of anchorMeshes) applyAnchorRemoved(id);
    for (const [id] of zoneMeshes)   applyZoneRemoved(id);

    // Neu rendern
    for (const anchor of anchors) applyAnchorAdded(anchor);
    for (const zone   of zones)   applyZoneAdded(zone);
  }
  ```

- [ ] **Step 2: TypeScript verifizieren**

  Run: `cd /home/patrick/Bachelorprojekt/brett && npx tsc --noEmit`  
  Expected: PASS

- [ ] **Step 3: Commit**

  ```bash
  cd /tmp/wt-brett-ground-anchors
  git add brett/src/client/ground-objects.ts
  git commit -m "feat(brett): 3D ground-objects module for anchors and zones [T000468]"
  ```

---

### Task 4.2: `ws-client.ts` — neue ServerMessage-Typen behandeln

**Files:**
- Modify: `brett/src/client/ws-client.ts`

- [ ] **Step 1: Import von `ground-objects.ts` und neue Cases im WS-Client-Switch**

  Am Anfang von `ws-client.ts` (Import-Block) ergänzen:

  ```typescript
  import * as groundObjects from './ground-objects';
  ```

  Im `switch (msg.type)`-Block in der WS-`onmessage`-Handler-Funktion, nach den bestehenden Cases, neue Cases hinzufügen:

  ```typescript
  case 'anchor_added': {
    if ((window as any).__brettFeatures?.['t000468-ground-anchors']) {
      groundObjects.applyAnchorAdded(msg.anchor);
    }
    break;
  }
  case 'anchor_removed': {
    if ((window as any).__brettFeatures?.['t000468-ground-anchors']) {
      groundObjects.applyAnchorRemoved(msg.anchorId);
    }
    break;
  }
  case 'zone_added': {
    if ((window as any).__brettFeatures?.['t000468-ground-anchors']) {
      groundObjects.applyZoneAdded(msg.zone);
    }
    break;
  }
  case 'zone_removed': {
    if ((window as any).__brettFeatures?.['t000468-ground-anchors']) {
      groundObjects.applyZoneRemoved(msg.zoneId);
    }
    break;
  }
  ```

- [ ] **Step 2: Snapshot-Handler um `anchors` und `zones` ergänzen**

  Im `snapshot`-Case in `ws-client.ts`, nach dem bestehenden Snapshot-Verarbeitungs-Code:

  ```typescript
  case 'snapshot': {
    // ... bestehende Logik bleibt unverändert ...
    // NEU: Ground-Objects aus Snapshot initialisieren
    if ((window as any).__brettFeatures?.['t000468-ground-anchors']) {
      groundObjects.initGroundObjectsFromSnapshot(msg.anchors ?? [], msg.zones ?? []);
    }
    break;
  }
  ```

- [ ] **Step 3: TypeScript verifizieren**

  Run: `cd /home/patrick/Bachelorprojekt/brett && npx tsc --noEmit`  
  Expected: PASS

- [ ] **Step 4: Commit**

  ```bash
  cd /tmp/wt-brett-ground-anchors
  git add brett/src/client/ws-client.ts
  git commit -m "feat(brett): handle anchor/zone server messages in ws-client [T000468]"
  ```

---

### Task 4.3: Admin-UI für Anker & Zonen in `board-boot.ts`

**Files:**
- Modify: `brett/src/client/board-boot.ts`

- [ ] **Step 1: Anker-Setzen-Button (nur für Admins, hinter Feature Flag)**

  In `board-boot.ts`, nach dem bestehenden `releaseBtn`-Block (oder am Ende der `bootBoard`-Funktion, vor dem Render-Loop):

  ```typescript
  // ── T000468: Admin-Toolbar für Anker & Zonen (DARK-LAUNCH) ──────────────────
  if ((window as any).__brettFeatures?.['t000468-ground-anchors']) {
    // Initialisierung verschoben bis nach Auth, damit currentUser.isAdmin bekannt ist
    // Toolbar-Aufbau nach WS-Verbindung in wsClient.setWsOpenHandler-Callback (siehe unten)
    wsClient.setGroundObjectsAdminUi({
      initAdminToolbar: (isAdmin: boolean) => {
        if (!isAdmin) return;

        const toolbar = document.createElement('div');
        toolbar.id = 'ground-objects-toolbar';
        Object.assign(toolbar.style, {
          position: 'absolute',
          bottom: '96px',
          right: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          zIndex: '20',
        });

        // Anker-Button
        const anchorBtn = document.createElement('button');
        anchorBtn.textContent = '⚓ Anker';
        anchorBtn.title = 'Boden-Anker setzen (Klick auf Boden)';
        Object.assign(anchorBtn.style, {
          fontFamily: 'var(--brett-font-mono, monospace)',
          fontSize: '10px',
          padding: '6px 10px',
          background: 'rgba(200,169,110,0.15)',
          border: '1px solid rgba(200,169,110,0.4)',
          color: 'var(--brett-brass, #c8a96e)',
          borderRadius: 'var(--brett-radius-sm, 8px)',
          cursor: 'pointer',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        });

        let anchorPlacingMode = false;
        anchorBtn.addEventListener('click', () => {
          anchorPlacingMode = !anchorPlacingMode;
          anchorBtn.style.background = anchorPlacingMode
            ? 'rgba(200,169,110,0.35)' : 'rgba(200,169,110,0.15)';
          anchorBtn.title = anchorPlacingMode
            ? 'Klicke auf den Boden, um einen Anker zu setzen (Esc abbrechen)'
            : 'Boden-Anker setzen';
          (window as any).__brettAnchorPlacing = anchorPlacingMode;
        });

        // Zonen-Button
        const zoneBtn = document.createElement('button');
        zoneBtn.textContent = '▭ Zone';
        zoneBtn.title = 'Bodenzone zeichnen';
        Object.assign(zoneBtn.style, {
          fontFamily: 'var(--brett-font-mono, monospace)',
          fontSize: '10px',
          padding: '6px 10px',
          background: 'rgba(78,161,255,0.15)',
          border: '1px solid rgba(78,161,255,0.4)',
          color: 'var(--brett-blue, #4ea1ff)',
          borderRadius: 'var(--brett-radius-sm, 8px)',
          cursor: 'pointer',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        });

        let zonePlacingMode = false;
        zoneBtn.addEventListener('click', () => {
          zonePlacingMode = !zonePlacingMode;
          zoneBtn.style.background = zonePlacingMode
            ? 'rgba(78,161,255,0.35)' : 'rgba(78,161,255,0.15)';
          (window as any).__brettZonePlacing = zonePlacingMode;
        });

        toolbar.appendChild(anchorBtn);
        toolbar.appendChild(zoneBtn);
        document.body.appendChild(toolbar);
      },
    });
  }
  ```

  HINWEIS: Die Funktion `setGroundObjectsAdminUi` muss in `ws-client.ts` als exportierter Setter hinzugefügt werden (inject-Pattern wie `setLockBadgeFns`). Alternativ kann die Admin-Toolbar direkt im `wsOpen`-Callback von `board-boot.ts` aufgebaut werden, wenn `isAdmin` via `fetch('/auth/me')` bekannt ist.

- [ ] **Step 2: Bodenboden-Klick für Anker-Placement in der Render-Loop verdrahten**

  In `board-boot.ts`, im `renderer.domElement.addEventListener('click', ...)` Block (wo Figurenauswahl passiert), vor der bestehenden Figuren-Klick-Logik:

  ```typescript
  // T000468: Anker-Placement-Modus
  if ((window as any).__brettFeatures?.['t000468-ground-anchors'] &&
      (window as any).__brettAnchorPlacing) {
    // Raycasting gegen den Boden-Mesh
    const { floor } = sceneApi;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(floor);
    if (hits.length > 0) {
      const pt = hits[0].point;
      const ws = wsClient.getWsForAdmin();
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'anchor_create',
          anchor: { x: Math.round(pt.x * 10) / 10, z: Math.round(pt.z * 10) / 10 },
        }));
      }
      (window as any).__brettAnchorPlacing = false;
      // Reset Button-Style über ein CustomEvent
      document.dispatchEvent(new CustomEvent('brett:anchor-placed'));
    }
    return; // Kein figure-select wenn Anchor-Placing aktiv
  }
  ```

- [ ] **Step 3: TypeScript verifizieren**

  Run: `cd /home/patrick/Bachelorprojekt/brett && npx tsc --noEmit`  
  Expected: PASS

- [ ] **Step 4: Commit**

  ```bash
  cd /tmp/wt-brett-ground-anchors
  git add brett/src/client/board-boot.ts
  git commit -m "feat(brett): admin UI toolbar for anchor/zone placement [T000468]"
  ```

---

## Meilenstein 5: CI-Integration & Abschluss

### Task 5.1: Test-Inventar aktualisieren und Gesamt-Test-Suite prüfen

**Files:**
- Modify: `website/src/data/test-inventory.json`

- [ ] **Step 1: Neue Testdatei zum Inventar hinzufügen**

  Run: `cd /home/patrick/Bachelorprojekt && bash scripts/task-oracle.sh 'regenerate test inventory'`  
  Expected: Gibt den richtigen Task-Befehl zurück. Danach:

  ```bash
  cd /home/patrick/Bachelorprojekt && task test:inventory
  ```

  Prüfen ob `brett/test/anchor-zone.test.ts` im Inventar auftaucht.

- [ ] **Step 2: Gesamt-Test-Suite lokal ausführen**

  Run: `cd /home/patrick/Bachelorprojekt/brett && node --test test/anchor-zone.test.ts test/messages.test.ts test/permissions.test.ts test/seed-figuremap.test.ts 2>&1 | tail -20`  
  Expected: Alle Tests PASS, keine Fehler

- [ ] **Step 3: TypeScript final verifizieren**

  Run: `cd /home/patrick/Bachelorprojekt/brett && npx tsc --noEmit`  
  Expected: PASS ohne Fehler

- [ ] **Step 4: Commit**

  ```bash
  cd /tmp/wt-brett-ground-anchors
  git add website/src/data/test-inventory.json
  git commit -m "chore(brett): update test inventory for anchor-zone tests [T000468]"
  ```

---

### Task 5.2: Full CI-Simulation und Pull Request

**Files:**  
(keine neuen Dateien, PR-Erstellung)

- [ ] **Step 1: Lokal CI simulieren**

  Run:
  ```bash
  cd /home/patrick/Bachelorprojekt
  task test:all 2>&1 | tail -30
  ```
  Expected: PASS (alle bestehenden + neuen Tests grün)

- [ ] **Step 2: TypeScript-Check brett**

  Run: `cd /home/patrick/Bachelorprojekt/brett && npx tsc --noEmit`  
  Expected: 0 Fehler

- [ ] **Step 3: Branch pushen und PR erstellen**

  ```bash
  cd /tmp/wt-brett-ground-anchors
  git push -u origin feature/brett-ground-anchors
  ```

  Dann PR erstellen:
  ```bash
  gh pr create \
    --title "feat(brett): Boden-Anker & Zonen (Slice 4) [T000468]" \
    --body "## Summary

  - Neue Entitäten \`Anchor\` und \`Zone\` mit DB-Persistenz via Sentinel-Pattern
  - 4 neue WS-Mutations (ADMIN_TYPES): \`anchor_create\`, \`anchor_delete\`, \`zone_create\`, \`zone_delete\`
  - Three.js-Rendering: Anker als leuchtende Kegel mit Ring, Zonen als semi-transparente Flächen mit Outline
  - Feature-Flag: \`window.__brettFeatures['t000468-ground-anchors']\` (Dark-Launch)
  - 18+ neue Tests in \`brett/test/anchor-zone.test.ts\`

  ## Test plan
  - [ ] \`node --test brett/test/anchor-zone.test.ts\` — alle Tests grün
  - [ ] \`npx tsc --noEmit\` in \`brett/\` — kein Fehler
  - [ ] \`task test:all\` — CI grün
  - [ ] Manuell: Feature-Flag aktivieren, Admin-Toolbar erscheint, Anker/Zone setzbar, nach Reconnect noch sichtbar

  Ticket: T000468

  🤖 Generated with [Claude Code](https://claude.com/claude-code)" \
    --base main
  ```

- [ ] **Step 4: PR-URL notieren, Ticket T000468 auf `done` setzen**

  ```bash
  cd /home/patrick/Bachelorprojekt
  bash scripts/ticket.sh update --id T000468 --status done --pr <PR_NUMBER>
  ```

---

## Zusammenfassung der Dateien

| Datei | Aktion | Inhalt |
|---|---|---|
| `brett/src/types/state.ts` | Modify | `Anchor`, `Zone`, `ZoneShape` Types |
| `brett/src/types/messages.ts` | Modify | 4 Client- + 4 Server-Message-Typen, Snapshot erweitert |
| `brett/src/server/figures.ts` | Modify | `generateId()` + 4 neue `applyMutation`-Cases + `seedFigureMapFromState`-Erweiterung |
| `brett/src/server/phases.ts` | Modify | `SPECIAL`-Array + `anchors`/`zones` in `buildStateFromMutations` |
| `brett/src/server/ws-handler.ts` | Modify | `ADMIN_TYPES` + Join-Snapshot mit `anchors`/`zones` |
| `brett/src/server/ws-admin-commands.ts` | Modify | 4 neue Admin-Handler-Cases |
| `brett/src/client/ground-objects.ts` | Create | 3D-Rendering-Modul (Anker-Kegel, Zonen-Flächen, Labels, Dispose) |
| `brett/src/client/ws-client.ts` | Modify | Neue ServerMessage-Cases + Snapshot-Handler |
| `brett/src/client/board-boot.ts` | Modify | Admin-Toolbar (DARK-LAUNCH) |
| `brett/test/anchor-zone.test.ts` | Create | 18+ Tests (create/delete/round-trip/ADMIN_TYPES) |
| `brett/test/messages.test.ts` | Modify | Exhaustiveness-Test erweitert |
| `website/src/data/test-inventory.json` | Modify | Inventar aktualisiert |
