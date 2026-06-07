---
title: "Brett: Beziehungs-/Spannungslinien (Slice 4)"
ticket_id: T000467
spec: docs/superpowers/specs/2026-06-07-brett-relationship-lines-design.md
branch: feature/brett-relationship-lines
domains: [website]
status: active
pr_number: null
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Persistente bidirektionale Linien zwischen Figuren (relationship/tension/resource) mit 3D-Darstellung, CRUD-Mutations, DB-Persistenz und Leiter-only Permissions.

**Architecture:** Sentinel-basierter `__lines__` Schlüssel im figureMap nach dem etablierten Brett-Muster; drei neue ADMIN_TYPES mit zusätzlichem Leiter-Role-Check; 3D-Rendering via CatmullRomCurve3 + THREE.Line in neuer `scene-lines.ts`-Datei; Feature-Flag `sf-t000467` für Dark Launch.

**Tech Stack:** TypeScript, Three.js, ws, node:test, tsx/jsdom
**Ticket-ID:** T000467

---

## Meilenstein 1: Shared Types

### Task 1.1: LineType und BrettLine zu state.ts hinzufügen

**Files:**
- Modify: `brett/src/types/state.ts`

- [x] **Step 1: LineType union und BrettLine Interface ergänzen**

Füge nach dem `FigureType`-Export in `brett/src/types/state.ts` ein:

```typescript
// ── Line types (Slice 4 / T000467) ──────────────────────────────────────────
export type LineType = 'relationship' | 'tension' | 'resource';

export interface BrettLine {
  /** Server-generierte ID (nanoid(8)). */
  id: string;
  /** figureId der Quellfigur. */
  fromId: string;
  /** figureId der Zielfigur. */
  toId: string;
  /** Visueller Linientyp. */
  lineType: LineType;
  /** playerId des Erstellers (informativ). */
  createdBy?: string;
}
```

- [x] **Step 2: TypeScript verifizieren**

Run: `cd /home/patrick/Bachelorprojekt/brett && npx tsc --noEmit`
Expected: PASS (keine neuen Fehler)

- [x] **Step 3: Commit**

```bash
git add brett/src/types/state.ts
git commit -m "feat(brett): add LineType + BrettLine shared types [T000467]"
```

---

### Task 1.2: Message-Typen für Linien ergänzen

**Files:**
- Modify: `brett/src/types/messages.ts`

- [x] **Step 1: Import BrettLine und LineType ergänzen**

Ändere die Import-Zeile am Anfang von `brett/src/types/messages.ts`:

```typescript
import type { Figure, FigureAppearance, FigureType, LineType, BrettLine, OptikSettings, Participant, Phase, Role } from './state';
```

- [x] **Step 2: ClientMessage-Varianten hinzufügen**

Füge am Ende der `ClientMessage`-Union (vor dem Semikolon) hinzu:

```typescript
  | { type: 'line_create'; fromId: string; toId: string; lineType: LineType }
  | { type: 'line_delete'; lineId: string }
  | { type: 'line_type_set'; lineId: string; lineType: LineType };
```

- [x] **Step 3: ServerMessage-Varianten hinzufügen**

Füge am Ende der `ServerMessage`-Union hinzu:

```typescript
  | { type: 'line_created'; line: BrettLine }
  | { type: 'line_deleted'; lineId: string }
  | { type: 'line_type_changed'; lineId: string; lineType: LineType };
```

- [x] **Step 4: snapshot ServerMessage um lines erweitern**

Ändere die `snapshot`-Variante der `ServerMessage`:

```typescript
  | { type: 'snapshot'; figures: Figure[]; stiffness?: number; locks?: ServerLock[]; phase?: Phase; sessionCode?: string | null; optik?: OptikSettings; participants?: Participant[]; lines?: BrettLine[] }
```

- [x] **Step 5: TypeScript verifizieren**

Run: `cd /home/patrick/Bachelorprojekt/brett && npx tsc --noEmit`
Expected: PASS (messages.test.ts wird Compilerfehler zeigen bis messages.test.ts in Meilenstein 4 aktualisiert wird — das ist erwartet; tsc --noEmit prüft nur die Typen, nicht die Tests)

- [x] **Step 6: Commit**

```bash
git add brett/src/types/messages.ts
git commit -m "feat(brett): add line_create/delete/type_set message types [T000467]"
```

---

## Meilenstein 2: Server — Mutation Core

### Task 2.1: applyMutation — drei neue Line-Cases

**Files:**
- Modify: `brett/src/server/figures.ts`

- [x] **Step 1: Import BrettLine am Anfang ergänzen**

Füge am Anfang von `brett/src/server/figures.ts` nach den bestehenden Typ-Importen hinzu:

```typescript
import type { BrettLine } from '../types/state';
```

- [x] **Step 2: ensureLines-Helper-Funktion hinzufügen**

Füge vor der `applyMutation`-Funktion in `brett/src/server/figures.ts` ein:

```typescript
/** Liest den __lines__-Sentinel und gibt eine kopierte lines-Map zurück (oder {}). */
function ensureLines(figs: Map<string, any>): Record<string, BrettLine> {
  return { ...(figs.get('__lines__')?.lines ?? {}) };
}
```

- [x] **Step 3: Drei neue Cases im applyMutation switch einfügen**

Füge in der `switch (msg.type)`-Struktur von `applyMutation`, direkt nach dem `figure_type_set`-Case und vor dem `clear`-Case, ein:

```typescript
    case 'line_create': {
      // Server-generierte ID muss im msg.id enthalten sein (ws-handler setzt sie).
      if (typeof msg.id === 'string' && msg.id &&
          typeof msg.fromId === 'string' && typeof msg.toId === 'string' &&
          msg.fromId !== msg.toId && msg.lineType) {
        const lines = ensureLines(figs);
        // Cap: maximal 100 Linien pro Room.
        if (Object.keys(lines).length >= 100) break;
        lines[msg.id] = {
          id: msg.id,
          fromId: msg.fromId,
          toId: msg.toId,
          lineType: msg.lineType,
          ...(msg.createdBy ? { createdBy: msg.createdBy } : {}),
        };
        figs.set('__lines__', { id: '__lines__', lines });
      }
      break;
    }
    case 'line_delete': {
      if (typeof msg.lineId === 'string') {
        const lines = ensureLines(figs);
        delete lines[msg.lineId];
        figs.set('__lines__', { id: '__lines__', lines });
      }
      break;
    }
    case 'line_type_set': {
      if (typeof msg.lineId === 'string' && msg.lineType) {
        const lines = ensureLines(figs);
        if (lines[msg.lineId]) {
          lines[msg.lineId] = { ...lines[msg.lineId], lineType: msg.lineType };
          figs.set('__lines__', { id: '__lines__', lines });
        }
      }
      break;
    }
```

- [x] **Step 4: delete-Case um Linien-Cleanup erweitern**

Im bestehenden `case 'delete':` in `applyMutation`, nach `figs.delete(msg.id)`, Linien bereinigen die die gelöschte Figur referenzieren:

```typescript
    case 'delete':
      figs.delete(msg.id);
      // Linien-Cleanup: Lösche alle Linien, die die gelöschte Figur referenzieren.
      if (typeof msg.id === 'string') {
        const linesEntry = figs.get('__lines__');
        if (linesEntry?.lines) {
          const updatedLines = { ...linesEntry.lines };
          for (const [lid, line] of Object.entries(updatedLines) as [string, any][]) {
            if (line.fromId === msg.id || line.toId === msg.id) {
              delete updatedLines[lid];
            }
          }
          figs.set('__lines__', { id: '__lines__', lines: updatedLines });
        }
      }
      break;
```

- [x] **Step 5: TypeScript verifizieren**

Run: `cd /home/patrick/Bachelorprojekt/brett && npx tsc --noEmit`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add brett/src/server/figures.ts
git commit -m "feat(brett): add line_create/delete/type_set mutations + figure delete cleanup [T000467]"
```

---

### Task 2.2: buildStateFromMutations — lines-Feld ergänzen

**Files:**
- Modify: `brett/src/server/phases.ts`

- [x] **Step 1: SPECIAL-Array um __lines__ erweitern**

In `buildStateFromMutations` in `brett/src/server/phases.ts`, ergänze `'__lines__'` im `SPECIAL`-Array:

```typescript
  const SPECIAL = [
    '__optik__', '__stiffness__',
    '__session_phase__', '__session_code__', '__admin_token_holder__',
    '__session_created_at__', '__session_last_activity__',
    '__coaching_steps__', '__roles__', '__lobby_settings__',
    '__lines__',  // ← NEU
  ];
```

- [x] **Step 2: lines-Extraktion und Result-Zuweisung**

Im selben `buildStateFromMutations`, nach dem `lobbySettingsEntry`-Block, hinzufügen:

```typescript
  const linesEntry = figs.get('__lines__');
  if (linesEntry?.lines) result.lines = Object.values(linesEntry.lines) as BrettLine[];
```

Und am Anfang der Datei den Import ergänzen:

```typescript
import type { Phase, BrettLine } from '../types/state';
```

- [x] **Step 3: seedFigureMapFromState — lines Round-Trip**

In `brett/src/server/figures.ts`, in der `seedFigureMapFromState`-Funktion, nach dem `lobbySettings`-Block hinzufügen:

```typescript
  if (state.lines && Array.isArray(state.lines)) {
    const linesMap: Record<string, BrettLine> = {};
    for (const line of state.lines) {
      if (line && typeof line.id === 'string') linesMap[line.id] = line;
    }
    map.set('__lines__', { id: '__lines__', lines: linesMap });
  }
```

- [x] **Step 4: TypeScript verifizieren**

Run: `cd /home/patrick/Bachelorprojekt/brett && npx tsc --noEmit`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add brett/src/server/phases.ts brett/src/server/figures.ts
git commit -m "feat(brett): expose lines in buildStateFromMutations + seed round-trip [T000467]"
```

---

### Task 2.3: ws-handler — ADMIN_TYPES + Handler

**Files:**
- Modify: `brett/src/server/ws-handler.ts`
- Modify: `brett/src/server/ws-admin-commands.ts`

- [x] **Step 1: ADMIN_TYPES in ws-handler.ts erweitern**

Im `ADMIN_TYPES`-Set in `brett/src/server/ws-handler.ts` drei neue Einträge hinzufügen:

```typescript
export const ADMIN_TYPES = new Set<string>([
  'admin_kick', 'admin_broadcast', 'admin_session_create', 'admin_handoff_token',
  'admin_round_stop', 'admin_round_pause', 'admin_coaching_steps_set',
  'admin_round_start', 'admin_assign_role', 'admin_assign_figure',
  'admin_set_template', 'admin_set_optik',
  'figure_type_set',
  // ── Line mutations (T000467) — leiter-exklusiv ────────────────────────────
  'line_create', 'line_delete', 'line_type_set',
]);
```

- [x] **Step 2: Join-Snapshot um lines erweitern**

Im `join`-Handler in `brett/src/server/ws-handler.ts`, im `ws.send(JSON.stringify({...}))` Aufruf, das `lines`-Feld ergänzen:

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
                lines: freshState.lines ?? [],  // ← NEU (T000467)
              }));
```

- [x] **Step 3: Handler in ws-admin-commands.ts implementieren**

In der `handleAdminMessage`-Funktion in `brett/src/server/ws-admin-commands.ts`, neue Cases im switch hinzufügen (nach dem `figure_type_set`-Case):

```typescript
    case 'line_create': {
      // Leiter-only check (zusätzlich zur isAdmin-Gate in ws-handler.ts)
      const state = deps.buildStateFromMutations(adminRoom) || {};
      const role = deps.resolveRole(ws, state.roles || {});
      if (role !== 'leiter') {
        try { ws.send(JSON.stringify({ type: 'error', reason: 'forbidden' })); } catch {}
        return;
      }
      // Validierungen
      const figMap = deps.figureMaps.get(adminRoom);
      if (typeof msg.fromId !== 'string' || typeof msg.toId !== 'string' ||
          !figMap?.has(msg.fromId) || !figMap?.has(msg.toId)) {
        try { ws.send(JSON.stringify({ type: 'error', reason: 'invalid-figure' })); } catch {}
        return;
      }
      if (msg.fromId === msg.toId) {
        try { ws.send(JSON.stringify({ type: 'error', reason: 'self-line' })); } catch {}
        return;
      }
      const validLineTypes = new Set(['relationship', 'tension', 'resource']);
      if (!validLineTypes.has(msg.lineType)) {
        try { ws.send(JSON.stringify({ type: 'error', reason: 'invalid-line-type' })); } catch {}
        return;
      }
      // ID generieren (crypto.randomUUID slice statt nanoid — keine neue Dep)
      const lineId = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
      const createdBy = resolvePlayerId(ws);
      deps.applyMutation(adminRoom, {
        type: 'line_create',
        id: lineId,
        fromId: msg.fromId,
        toId: msg.toId,
        lineType: msg.lineType,
        createdBy,
      });
      const newLine = { id: lineId, fromId: msg.fromId, toId: msg.toId, lineType: msg.lineType, createdBy };
      deps.broadcast(adminRoom, { type: 'line_created', line: newLine });
      deps.schedulePersist(adminRoom);
      break;
    }
    case 'line_delete': {
      const state2 = deps.buildStateFromMutations(adminRoom) || {};
      const role2 = deps.resolveRole(ws, state2.roles || {});
      if (role2 !== 'leiter') {
        try { ws.send(JSON.stringify({ type: 'error', reason: 'forbidden' })); } catch {}
        return;
      }
      if (typeof msg.lineId !== 'string') {
        try { ws.send(JSON.stringify({ type: 'error', reason: 'invalid-line-id' })); } catch {}
        return;
      }
      deps.applyMutation(adminRoom, { type: 'line_delete', lineId: msg.lineId });
      deps.broadcast(adminRoom, { type: 'line_deleted', lineId: msg.lineId });
      deps.schedulePersist(adminRoom);
      break;
    }
    case 'line_type_set': {
      const state3 = deps.buildStateFromMutations(adminRoom) || {};
      const role3 = deps.resolveRole(ws, state3.roles || {});
      if (role3 !== 'leiter') {
        try { ws.send(JSON.stringify({ type: 'error', reason: 'forbidden' })); } catch {}
        return;
      }
      const validTypes = new Set(['relationship', 'tension', 'resource']);
      if (typeof msg.lineId !== 'string' || !validTypes.has(msg.lineType)) {
        try { ws.send(JSON.stringify({ type: 'error', reason: 'invalid-params' })); } catch {}
        return;
      }
      deps.applyMutation(adminRoom, { type: 'line_type_set', lineId: msg.lineId, lineType: msg.lineType });
      deps.broadcast(adminRoom, { type: 'line_type_changed', lineId: msg.lineId, lineType: msg.lineType });
      deps.schedulePersist(adminRoom);
      break;
    }
```

- [x] **Step 4: TypeScript verifizieren**

Run: `cd /home/patrick/Bachelorprojekt/brett && npx tsc --noEmit`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add brett/src/server/ws-handler.ts brett/src/server/ws-admin-commands.ts
git commit -m "feat(brett): line_create/delete/type_set ADMIN_TYPES handler + join snapshot [T000467]"
```

---

## Meilenstein 3: Client — State + WS-Handling

### Task 3.1: STATE.lines ergänzen

**Files:**
- Modify: `brett/src/client/state.ts`

- [x] **Step 1: BrettLine import und STATE.lines ergänzen**

Ergänze in `brett/src/client/state.ts`:

```typescript
import type { BrettLine } from '../types/state';
```

Und im `AppState`-Interface sowie im `STATE`-Objekt:

```typescript
export interface AppState {
  figures: any[];
  selectedId: string | null;
  hoveredId: string | null;
  stiffness: number;
  online: number;
  lines: BrettLine[];  // ← NEU (T000467)
}
export const STATE: AppState = {
  figures: [],
  selectedId: null,
  hoveredId: null,
  stiffness: 0.65,
  online: 1,
  lines: [],  // ← NEU
};
```

- [x] **Step 2: TypeScript verifizieren**

Run: `cd /home/patrick/Bachelorprojekt/brett && npx tsc --noEmit`
Expected: PASS

- [x] **Step 3: Commit**

```bash
git add brett/src/client/state.ts
git commit -m "feat(brett): add STATE.lines for line entities [T000467]"
```

---

### Task 3.2: scene-lines.ts — neue Datei für 3D-Linien-Rendering

**Files:**
- Create: `brett/src/client/scene-lines.ts`

- [x] **Step 1: scene-lines.ts erstellen**

```typescript
// brett/src/client/scene-lines.ts — 3D-Linienrendering (T000467)
// Feature-Flag: window.__brettFeatures['sf-t000467']
import * as THREE from 'three';
import { STATE, getScene } from './state';
import type { BrettLine, LineType } from '../types/state';

export const LINE_COLORS: Record<LineType, number> = {
  relationship: 0x4ea1ff,  // Blau — neutraler Bezug
  tension:      0xe05555,  // Rot — Konflikt/Spannung
  resource:     0x55bb77,  // Grün — Unterstützung/Ressource
};

// Aktive THREE.Line Objekte, geindext nach lineId
const lineObjects = new Map<string, THREE.Line>();

// Letzte bekannte Positionen der Figuren (dirty-check für Frame-Loop Update)
const lastPositions = new Map<string, { x: number; z: number }>();

function isFeatureActive(): boolean {
  const feats: Record<string, boolean> =
    (typeof window !== 'undefined' && (window as any).__brettFeatures) || {};
  return feats['sf-t000467'] === true;
}

function getFigPos(figId: string): THREE.Vector3 | null {
  const fig = STATE.figures.find((f: any) => f.id === figId);
  if (!fig) return null;
  return new THREE.Vector3(fig.root.position.x, 0.5, fig.root.position.z);
}

function buildGeometry(line: BrettLine): THREE.BufferGeometry | null {
  const from = getFigPos(line.fromId);
  const to = getFigPos(line.toId);
  if (!from || !to) return null;
  const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 0.25, 0));
  const curve = new THREE.CatmullRomCurve3([from, mid, to]);
  const points = curve.getPoints(40);
  return new THREE.BufferGeometry().setFromPoints(points);
}

/** Rendert eine neue Linie in die Szene. No-op außerhalb des Feature-Flags. */
export function renderLine(line: BrettLine): void {
  if (!isFeatureActive()) return;
  removeLineFromScene(line.id); // idempotent — ggf. alte Version entfernen
  const geometry = buildGeometry(line);
  if (!geometry) return;
  let mesh: THREE.Line;
  if (line.lineType === 'tension') {
    const mat = new THREE.LineDashedMaterial({ color: LINE_COLORS[line.lineType], dashSize: 0.15, gapSize: 0.1 });
    mesh = new THREE.Line(geometry, mat);
    mesh.computeLineDistances();
  } else {
    const mat = new THREE.LineBasicMaterial({ color: LINE_COLORS[line.lineType] });
    mesh = new THREE.Line(geometry, mat);
  }
  getScene().scene.add(mesh);
  lineObjects.set(line.id, mesh);
}

/** Entfernt eine Linie aus der Szene und gibt Ressourcen frei. */
export function removeLineFromScene(lineId: string): void {
  const mesh = lineObjects.get(lineId);
  if (!mesh) return;
  getScene().scene.remove(mesh);
  mesh.geometry.dispose();
  if (Array.isArray(mesh.material)) {
    mesh.material.forEach(m => m.dispose());
  } else {
    (mesh.material as THREE.Material).dispose();
  }
  lineObjects.delete(lineId);
}

/** Alle Linien aus der Szene entfernen (beim snapshot-Reset). */
export function clearAllLines(): void {
  for (const id of [...lineObjects.keys()]) {
    removeLineFromScene(id);
  }
  lineObjects.clear();
  lastPositions.clear();
}

/** Re-rendert eine Linie mit neuer Geometrie (nach figure move oder type change). */
export function rerenderLine(lineId: string): void {
  if (!isFeatureActive()) return;
  const line = STATE.lines.find(l => l.id === lineId);
  if (!line) { removeLineFromScene(lineId); return; }
  renderLine(line);
}

/**
 * Frame-Loop Update: Aktualisiert Linienpositionen wenn sich Figuren bewegt haben.
 * Sollte einmal pro Frame nach dem mannequin-Update aufgerufen werden.
 * Dirty-Check: vergleicht aktuelle Position mit lastPositions um unnötige Rebuilds zu vermeiden.
 */
export function updateLinePositions(): void {
  if (!isFeatureActive()) return;
  if (lineObjects.size === 0) return;

  // Prüfe ob relevante Figuren bewegt wurden
  const affectedFigIds = new Set<string>();
  for (const line of STATE.lines) {
    const fromFig = STATE.figures.find((f: any) => f.id === line.fromId);
    const toFig = STATE.figures.find((f: any) => f.id === line.toId);
    if (!fromFig || !toFig) continue;
    const fromPos = lastPositions.get(line.fromId);
    const toPos = lastPositions.get(line.toId);
    const fromMoved = !fromPos || fromPos.x !== fromFig.root.position.x || fromPos.z !== fromFig.root.position.z;
    const toMoved = !toPos || toPos.x !== toFig.root.position.x || toPos.z !== toFig.root.position.z;
    if (fromMoved || toMoved) {
      affectedFigIds.add(line.fromId);
      affectedFigIds.add(line.toId);
    }
  }

  if (affectedFigIds.size === 0) return;

  // Update lastPositions
  for (const figId of affectedFigIds) {
    const fig = STATE.figures.find((f: any) => f.id === figId);
    if (fig) lastPositions.set(figId, { x: fig.root.position.x, z: fig.root.position.z });
  }

  // Neu rendern der betroffenen Linien
  for (const line of STATE.lines) {
    if (affectedFigIds.has(line.fromId) || affectedFigIds.has(line.toId)) {
      renderLine(line);
    }
  }
}
```

- [x] **Step 2: TypeScript verifizieren**

Run: `cd /home/patrick/Bachelorprojekt/brett && npx tsc --noEmit`
Expected: PASS

- [x] **Step 3: Commit**

```bash
git add brett/src/client/scene-lines.ts
git commit -m "feat(brett): scene-lines.ts 3D rendering with CatmullRomCurve3 + frame-loop update [T000467]"
```

---

### Task 3.3: ws-client.ts — Server-Message-Handler für Linien

**Files:**
- Modify: `brett/src/client/ws-client.ts`

- [x] **Step 1: scene-lines Imports ergänzen**

Füge am Anfang von `brett/src/client/ws-client.ts` nach den bestehenden Imports hinzu:

```typescript
import { renderLine, removeLineFromScene, clearAllLines, rerenderLine } from './scene-lines';
```

- [x] **Step 2: snapshot-Handler um lines erweitern**

Im `case 'snapshot':` Block, nach dem bestehenden `if (msg.optik) applyOptikToScene(msg.optik);`-Aufruf, hinzufügen:

```typescript
      // Linien zurücksetzen und neu aufbauen (T000467)
      clearAllLines();
      STATE.lines.length = 0;
      for (const line of (msg.lines || [])) {
        STATE.lines.push(line);
        renderLine(line);
      }
```

- [x] **Step 3: Drei neue Message-Handler Cases hinzufügen**

Im `switch (msg.type)` in `onWsMessage`, nach dem letzten bestehenden Case (vor `default`), hinzufügen:

```typescript
    case 'line_created': {
      STATE.lines.push(msg.line);
      renderLine(msg.line);
      break;
    }
    case 'line_deleted': {
      const idx = STATE.lines.findIndex(l => l.id === msg.lineId);
      if (idx !== -1) STATE.lines.splice(idx, 1);
      removeLineFromScene(msg.lineId);
      break;
    }
    case 'line_type_changed': {
      const l = STATE.lines.find(l => l.id === msg.lineId);
      if (l) {
        l.lineType = msg.lineType;
        rerenderLine(msg.lineId);
      }
      break;
    }
```

- [x] **Step 4: HANDLED_SERVER_TYPES in messages.test.ts erweitern (Vorab-Hinweis)**

Die drei neuen ServerMessage-Typen müssen in `brett/test/messages.test.ts` registriert werden — das erfolgt in Meilenstein 4 Task 4.1.

- [x] **Step 5: TypeScript verifizieren**

Run: `cd /home/patrick/Bachelorprojekt/brett && npx tsc --noEmit`
Expected: PASS — wenn messages.test.ts noch nicht aktualisiert wurde, sind nur die Typen entscheidend.

- [x] **Step 6: Commit**

```bash
git add brett/src/client/ws-client.ts
git commit -m "feat(brett): ws-client handles line_created/deleted/type_changed messages [T000467]"
```

---

### Task 3.4: updateLinePositions im Render-Loop einbinden

**Files:**
- Modify: `brett/src/client/main.ts` (oder die Datei die den Render-Loop hostet)

- [x] **Step 1: Import ergänzen**

Finde die Datei die `requestAnimationFrame` / den Render-Loop enthält (vermutlich `brett/src/client/main.ts` oder `brett/index.ts`). Import ergänzen:

```typescript
import { updateLinePositions } from './scene-lines';
```

- [x] **Step 2: updateLinePositions im Frame-Loop aufrufen**

Im Render-Loop, nach dem mannequin-Step-Update und vor `renderer.render()`, einfügen:

```typescript
  updateLinePositions();
```

- [x] **Step 3: TypeScript verifizieren**

Run: `cd /home/patrick/Bachelorprojekt/brett && npx tsc --noEmit`
Expected: PASS

- [x] **Step 4: Commit**

```bash
git add brett/src/client/main.ts  # ggf. anpassen an tatsächlichen Dateinamen
git commit -m "feat(brett): wire updateLinePositions into render loop [T000467]"
```

---

## Meilenstein 4: Tests

### Task 4.1: messages.test.ts — Exhaustiveness für neue Typen

**Files:**
- Modify: `brett/test/messages.test.ts`

- [x] **Step 1: HANDLED_SERVER_TYPES erweitern**

Ergänze in `brett/test/messages.test.ts` im `HANDLED_SERVER_TYPES`-Set:

```typescript
const HANDLED_SERVER_TYPES = new Set<ServerMessageType>([
  'snapshot', 'add', 'move', 'jump', 'update', 'delete', 'stiffness',
  'figure_locked', 'figure_unlocked', 'figure_lock_denied', 'locks_released_for',
  'info', 'presence_join', 'presence_leave', 'session_created', 'session_phase_change',
  'session_ended', 'admin_token_changed', 'coaching_steps_change', 'error',
  'role_changed', 'figure_owner_changed', 'lobby_ready_changed', 'lobby_settings_change',
  'figure_possessed', 'figure_released', 'figure_type_changed',
  // ── T000467 ───────────────────────────────────────────────────────────────
  'line_created', 'line_deleted', 'line_type_changed',
]);
```

- [x] **Step 2: routeServer Exhaustiveness-Switch erweitern**

In der `routeServer`-Funktion:

```typescript
    case 'line_created': return 'line_created';
    case 'line_deleted': return 'line_deleted';
    case 'line_type_changed': return 'line_type_changed';
```

- [x] **Step 3: routeClient Exhaustiveness-Switch erweitern**

In der `routeClient`-Funktion:

```typescript
    case 'line_create': return 'line_create';
    case 'line_delete': return 'line_delete';
    case 'line_type_set': return 'line_type_set';
```

Und die fehlenden possession-Typen ergänzen (falls noch nicht vorhanden):

```typescript
    case 'figure_possess': return 'figure_possess';
    case 'figure_release': return 'figure_release';
    case 'figure_type_set': return 'figure_type_set';
    case 'lobby_set_ready': return 'lobby_set_ready';
```

- [x] **Step 4: TypeScript + Tests verifizieren**

Run: `cd /home/patrick/Bachelorprojekt/brett && npx tsc --noEmit && node --test test/messages.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add brett/test/messages.test.ts
git commit -m "test(brett): extend messages.test.ts exhaustiveness for line types [T000467]"
```

---

### Task 4.2: lines.test.ts — Unit-Tests für Linien-Mutations

**Files:**
- Create: `brett/test/lines.test.ts`

- [x] **Step 1: Test-Datei anlegen**

```typescript
// brett/test/lines.test.ts — Meilenstein 4 / T000467
// Unit-Tests für applyMutation (line_*) + buildStateFromMutations + seedFigureMapFromState
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMutation,
  buildStateFromMutations,
  figures,
} from '../src/server/index';

const APP = { face: null, body: 'adult-average', accessories: { head: null, upper: null, feet: null } };

// ── line_create ──────────────────────────────────────────────────────────────
test('line_create: adds a line to __lines__ sentinel', () => {
  const room = 'lines-create-1';
  applyMutation(room, { type: 'add', figure: { id: 'fa', x: 0, z: 0, facingY: 0, appearance: APP } });
  applyMutation(room, { type: 'add', figure: { id: 'fb', x: 1, z: 1, facingY: 0, appearance: APP } });
  applyMutation(room, { type: 'line_create', id: 'l1', fromId: 'fa', toId: 'fb', lineType: 'relationship' });
  const state = buildStateFromMutations(room);
  assert.equal(state.lines.length, 1);
  assert.equal(state.lines[0].id, 'l1');
  assert.equal(state.lines[0].lineType, 'relationship');
});

test('line_create: fromId === toId is ignored (self-line prevention)', () => {
  const room = 'lines-self';
  applyMutation(room, { type: 'add', figure: { id: 'f1', x: 0, z: 0, facingY: 0, appearance: APP } });
  applyMutation(room, { type: 'line_create', id: 'lx', fromId: 'f1', toId: 'f1', lineType: 'tension' });
  const state = buildStateFromMutations(room);
  assert.equal(state.lines?.length ?? 0, 0, 'self-line must not be stored');
});

test('line_create: cap at 100 lines per room', () => {
  const room = 'lines-cap';
  applyMutation(room, { type: 'add', figure: { id: 'ca', x: 0, z: 0, facingY: 0, appearance: APP } });
  applyMutation(room, { type: 'add', figure: { id: 'cb', x: 1, z: 1, facingY: 0, appearance: APP } });
  for (let i = 0; i < 105; i++) {
    applyMutation(room, { type: 'line_create', id: `lc${i}`, fromId: 'ca', toId: 'cb', lineType: 'relationship' });
  }
  const state = buildStateFromMutations(room);
  assert.ok(state.lines.length <= 100, 'must not exceed 100 lines');
});

// ── line_delete ──────────────────────────────────────────────────────────────
test('line_delete: removes the targeted line', () => {
  const room = 'lines-delete-1';
  applyMutation(room, { type: 'add', figure: { id: 'fx', x: 0, z: 0, facingY: 0, appearance: APP } });
  applyMutation(room, { type: 'add', figure: { id: 'fy', x: 1, z: 1, facingY: 0, appearance: APP } });
  applyMutation(room, { type: 'line_create', id: 'ld1', fromId: 'fx', toId: 'fy', lineType: 'tension' });
  applyMutation(room, { type: 'line_create', id: 'ld2', fromId: 'fx', toId: 'fy', lineType: 'resource' });
  applyMutation(room, { type: 'line_delete', lineId: 'ld1' });
  const state = buildStateFromMutations(room);
  assert.equal(state.lines.length, 1);
  assert.equal(state.lines[0].id, 'ld2');
});

test('line_delete: deleting non-existent line is a no-op', () => {
  const room = 'lines-delete-noop';
  applyMutation(room, { type: 'line_delete', lineId: 'ghost' });
  const state = buildStateFromMutations(room);
  assert.equal(state.lines?.length ?? 0, 0, 'no-op on missing line');
});

// ── line_type_set ────────────────────────────────────────────────────────────
test('line_type_set: updates the lineType of an existing line', () => {
  const room = 'lines-type-1';
  applyMutation(room, { type: 'add', figure: { id: 'fa2', x: 0, z: 0, facingY: 0, appearance: APP } });
  applyMutation(room, { type: 'add', figure: { id: 'fb2', x: 1, z: 1, facingY: 0, appearance: APP } });
  applyMutation(room, { type: 'line_create', id: 'lt1', fromId: 'fa2', toId: 'fb2', lineType: 'relationship' });
  applyMutation(room, { type: 'line_type_set', lineId: 'lt1', lineType: 'tension' });
  const state = buildStateFromMutations(room);
  assert.equal(state.lines[0].lineType, 'tension');
});

// ── figure delete cascades to lines ─────────────────────────────────────────
test('figure delete removes all lines referencing that figure', () => {
  const room = 'lines-cascade';
  applyMutation(room, { type: 'add', figure: { id: 'fc1', x: 0, z: 0, facingY: 0, appearance: APP } });
  applyMutation(room, { type: 'add', figure: { id: 'fc2', x: 1, z: 1, facingY: 0, appearance: APP } });
  applyMutation(room, { type: 'add', figure: { id: 'fc3', x: 2, z: 2, facingY: 0, appearance: APP } });
  applyMutation(room, { type: 'line_create', id: 'lca', fromId: 'fc1', toId: 'fc2', lineType: 'tension' });
  applyMutation(room, { type: 'line_create', id: 'lcb', fromId: 'fc2', toId: 'fc3', lineType: 'resource' });
  applyMutation(room, { type: 'line_create', id: 'lcc', fromId: 'fc1', toId: 'fc3', lineType: 'relationship' });
  // Lösche fc2 — sollte lca und lcb entfernen, lcc bleibt
  applyMutation(room, { type: 'delete', id: 'fc2' });
  const state = buildStateFromMutations(room);
  assert.equal(state.lines.length, 1, 'only lcc should survive');
  assert.equal(state.lines[0].id, 'lcc');
});

// ── buildStateFromMutations — lines Feld ────────────────────────────────────
test('buildStateFromMutations: lines absent when no lines created → undefined or []', () => {
  const room = 'lines-empty';
  applyMutation(room, { type: 'add', figure: { id: 'fe', x: 0, z: 0, facingY: 0, appearance: APP } });
  const state = buildStateFromMutations(room);
  assert.ok(!state.lines || state.lines.length === 0, 'lines should be empty when none created');
});

// ── seedFigureMapFromState — Round-Trip ──────────────────────────────────────
test('seedFigureMapFromState: lines survive build→seed→build round-trip', () => {
  const roomA = 'lines-rt-A';
  applyMutation(roomA, { type: 'add', figure: { id: 'r1', x: 0, z: 0, facingY: 0, appearance: APP } });
  applyMutation(roomA, { type: 'add', figure: { id: 'r2', x: 1, z: 1, facingY: 0, appearance: APP } });
  applyMutation(roomA, { type: 'line_create', id: 'lr1', fromId: 'r1', toId: 'r2', lineType: 'tension' });

  const persisted = buildStateFromMutations(roomA);
  assert.equal(persisted.lines.length, 1);

  const freshMap = new Map<string, any>();
  figures.seedFigureMapFromState(freshMap, persisted);
  figures.figureMaps.set('lines-rt-B', freshMap);

  const rebuilt = buildStateFromMutations('lines-rt-B');
  assert.equal(rebuilt.lines.length, 1);
  assert.equal(rebuilt.lines[0].id, 'lr1');
  assert.equal(rebuilt.lines[0].lineType, 'tension');
  assert.equal(rebuilt.lines[0].fromId, 'r1');
  assert.equal(rebuilt.lines[0].toId, 'r2');
});
```

- [x] **Step 2: Tests ausführen**

Run: `cd /home/patrick/Bachelorprojekt/brett && node --test test/lines.test.ts`
Expected: All tests PASS

- [x] **Step 3: Commit**

```bash
git add brett/test/lines.test.ts
git commit -m "test(brett): lines.test.ts — CRUD mutations + round-trip + cascade [T000467]"
```

---

### Task 4.3: relay-gate.test.ts — Line-Permission-Tests

**Files:**
- Modify: `brett/test/relay-gate.test.ts`

- [x] **Step 1: Tests für line_create leiter/beobachter hinzufügen**

Füge am Ende von `brett/test/relay-gate.test.ts` hinzu:

```typescript
// ── T000467: Linien-Mutations sind in ADMIN_TYPES (isAdmin-Gate) ──────────────
test('T000467: line_create is in ADMIN_TYPES (not in RELAY_TYPES)', () => {
  const { ADMIN_TYPES, RELAY_TYPES } = require('../src/server/index') as any;
  assert.ok(ADMIN_TYPES.has('line_create'), 'line_create must be in ADMIN_TYPES');
  assert.ok(!RELAY_TYPES.has('line_create'), 'line_create must NOT be in RELAY_TYPES');
  assert.ok(ADMIN_TYPES.has('line_delete'), 'line_delete must be in ADMIN_TYPES');
  assert.ok(ADMIN_TYPES.has('line_type_set'), 'line_type_set must be in ADMIN_TYPES');
});
```

- [x] **Step 2: Tests ausführen**

Run: `cd /home/patrick/Bachelorprojekt/brett && node --test test/relay-gate.test.ts`
Expected: PASS

- [x] **Step 3: Commit**

```bash
git add brett/test/relay-gate.test.ts
git commit -m "test(brett): relay-gate.test.ts line_create in ADMIN_TYPES guard [T000467]"
```

---

## Meilenstein 5: Feature-Flag, Verifikation und PR

### Task 5.1: Feature-Flag DB-Eintrag und Gesamttest

**Files:**
- Kein Code-Change — Infrastruktur/DB-Schritt

- [x] **Step 1: Alle Tests im Brett-Projekt ausführen**

Run: `cd /home/patrick/Bachelorprojekt/brett && node --test test/*.test.ts`
Expected: Alle Tests PASS

Alternativ via Task-Oracle:
```bash
bash /home/patrick/Bachelorprojekt/scripts/task-oracle.sh 'run all brett unit tests'
```

- [x] **Step 2: TypeScript Final-Check**

Run: `cd /home/patrick/Bachelorprojekt/brett && npx tsc --noEmit`
Expected: PASS (keine Fehler)

- [x] **Step 3: Feature-Flag DB-Seed verifizieren**

Das Feature-Flag `sf-t000467` muss in der `brett_feature_flags` Tabelle gesetzt sein (oder äquivalent in der Konfiguration). Auf dem Dev-Cluster:
```bash
# Prüfen ob Tabelle existiert und Flag gesetzt werden kann
bash scripts/task-oracle.sh 'set brett feature flag sf-t000467'
```

Falls kein Feature-Flag-Mechanismus vorhanden: `window.__brettFeatures['sf-t000467'] = true` im Browser-Dev-Tools für lokalen Test ausreichen.

- [x] **Step 4: CI-Validierung lokal nachstellen**

Run: `cd /home/patrick/Bachelorprojekt && task test:all`
Expected: Alle Tests grün

- [x] **Step 5: Final-Commit und Push**

```bash
git add -A
git commit -m "chore(brett): final review + cleanup for relationship-lines [T000467]"
git push origin feature/brett-relationship-lines
```

---

### Task 5.2: PR erstellen

**Files:**
- Keine Code-Änderungen — GitHub PR

- [x] **Step 1: PR erstellen via gh**

```bash
gh pr create \
  --title "feat(brett): Beziehungs-/Spannungslinien (Slice 4) [T000467]" \
  --body "$(cat <<'EOF'
## Summary

- Fügt persistente Beziehungs-/Spannungslinien zwischen Figuren hinzu (relationship=blau/solid, tension=rot/dashed, resource=grün/solid)
- Neue Line-Entität mit `BrettLine` Interface; Sentinel `__lines__` im figureMaps-Pattern
- Drei neue WS-Mutations: `line_create`, `line_delete`, `line_type_set` (ADMIN_TYPES, Leiter-only)
- 3D-Darstellung via `CatmullRomCurve3` + `THREE.Line`/`LineDashedMaterial` in `scene-lines.ts`
- DB-Persistenz via bestehendes `brett_rooms.state`-JSONB, Round-Trip über `seedFigureMapFromState`
- Feature-Flag `sf-t000467` (Dark Launch)
- 12 neue Unit-Tests in `brett/test/lines.test.ts` + Exhaustiveness-Updates

## Test plan

- [x] `node --test test/lines.test.ts` → alle Tests grün
- [x] `node --test test/messages.test.ts` → Exhaustiveness-Router grün
- [x] `node --test test/relay-gate.test.ts` → ADMIN_TYPES Guard grün
- [x] `npx tsc --noEmit` → keine Typ-Fehler
- [x] `task test:all` → CI lokal grün

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [x] **Step 2: PR-URL notieren und Ticket schließen**

Nach erfolgreichem PR-Merge: `bash scripts/ticket.sh close --id T000467 --pr <pr-number>`

---

## Implementierungsreihenfolge (Zusammenfassung)

```
M1: Typen  →  M2: Server  →  M3: Client  →  M4: Tests  →  M5: Flag+PR
```

Jeder Meilenstein kompiliert nach Abschluss mit `tsc --noEmit`. Tests werden inkrementell hinzugefügt und sollen nach jedem Task-Commit grün bleiben.
