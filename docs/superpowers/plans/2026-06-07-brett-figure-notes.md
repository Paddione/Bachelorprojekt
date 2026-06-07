---
title: "Brett: Notizen & Statements pro Figur (Slice 5)"
ticket_id: T000469
spec: docs/superpowers/specs/2026-06-07-brett-figure-notes-design.md
branch: feature/brett-figure-notes
domains: [website]
status: active
pr_number: null
---

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Füge pro Figur ein persistiertes, WS-synchronisiertes Notizfeld hinzu — mit Side-Panel-UI, `figure_note_set`-Mutation und optionalem Billboard-Sprite über der Figur.

**Architecture:** `note?: string` direkt im `Figure`-Interface (kein neuer Sentinel), server-autoritativ via neuer `figure_note_set`-Mutation und `figure_note_changed`-Broadcast; Billboard hinter Feature-Flag `sf-t000469`; `MutationType` und `canMutate` um den neuen Typ erweitert.

**Tech Stack:** TypeScript, Three.js, ws, node:test, tsx/jsdom

**Ticket-ID:** T000469

---

## Meilenstein 1: Shared Types & Permissions

### Task 1.1: `note` Feld zu `Figure` Interface hinzufügen

**Files:**
- Modify: `brett/src/types/state.ts`

- [ ] **Step 1: `note?: string` zum `Figure`-Interface hinzufügen**

```typescript
// In brett/src/types/state.ts, innerhalb des Figure-Interface nach `figureType?`:
  /**
   * Freitext-Notiz zur Figur (Aussagen, Perspektiven, Statements).
   * Gesetzt via figure_note_set (server-authoritative, via applyMutation).
   */
  note?: string;
```

- [ ] **Step 2: TypeScript verifizieren**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS (kein Fehler durch das optionale Feld)

- [ ] **Step 3: Commit**

```bash
git add brett/src/types/state.ts
git commit -m "feat(brett): add note field to Figure interface [T000469]"
```

---

### Task 1.2: Message-Typen für `figure_note_set` und `figure_note_changed`

**Files:**
- Modify: `brett/src/types/messages.ts`

- [ ] **Step 1: `figure_note_set` zu `ClientMessage` hinzufügen**

Ergänze am Ende der `ClientMessage`-Union (nach `figure_type_set`):
```typescript
  | { type: 'figure_note_set'; figureId: string; note: string }
```

- [ ] **Step 2: `figure_note_changed` zu `ServerMessage` hinzufügen**

Ergänze am Ende der `ServerMessage`-Union (nach `figure_type_changed`):
```typescript
  | { type: 'figure_note_changed'; figureId: string; note: string }
```

- [ ] **Step 3: TypeScript verifizieren**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add brett/src/types/messages.ts
git commit -m "feat(brett): add figure_note_set / figure_note_changed message types [T000469]"
```

---

### Task 1.3: `MutationType` und `canMutate` für `figure_note_set`

**Files:**
- Modify: `brett/src/server/permissions.ts`

- [ ] **Step 1: `figure_note_set` zu `MutationType` hinzufügen**

```typescript
// In brett/src/server/permissions.ts:
export type MutationType =
  | 'add' | 'move' | 'update' | 'jump' | 'delete'
  | 'clear' | 'stiffness' | 'snapshot' | 'request_state_snapshot'
  | 'figure_lock' | 'figure_possess' | 'figure_release'
  | 'figure_note_set';  // Slice 5: Notizen pro Figur
```

- [ ] **Step 2: `canMutate` um `figure_note_set` erweitern**

Im `canMutate`-Switch den `beobachter`-Zweig und den `stellvertreter`-Zweig anpassen. Suche die `beobachter`-Section und füge `figure_note_set` zur deny-Liste hinzu (beobachter darf nicht schreiben). Im `stellvertreter`-Zweig ownership-gated analog zu `move`/`update`:

```typescript
// Innerhalb canMutate, Stellvertreter-Zweig:
// OWNER_GATED: erlaubt wenn figureOwnerId === playerId
const OWNER_GATED_NOTE = new Set<MutationType>(['move', 'update', 'jump', 'delete', 'figure_lock', 'figure_note_set']);
if (OWNER_GATED_NOTE.has(ctx.msgType)) {
  return ctx.figureOwnerId === ctx.playerId;
}
```

Für leiter bleibt `return true` unverändert.

Für beobachter: `figure_note_set` ist **nicht** in der allow-Liste (`figure_possess`, `figure_release`), daher automatisch `false` durch den Default-Deny.

- [ ] **Step 3: TypeScript verifizieren**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add brett/src/server/permissions.ts
git commit -m "feat(brett): add figure_note_set to MutationType + canMutate [T000469]"
```

---

## Meilenstein 2: Server-Side Mutation & WS-Handler

### Task 2.1: `applyMutation`-Case für `figure_note_set`

**Files:**
- Modify: `brett/src/server/figures.ts`

- [ ] **Step 1: Case `figure_note_set` in `applyMutation`-Switch hinzufügen**

Einfügen nach dem `figure_type_set`-Case (vor dem abschließenden `case 'clear':`):

```typescript
    case 'figure_note_set': {
      // Notiz-Mutation: Server-autoritativ, max. 1000 Zeichen.
      // figureId muss existieren — kein Phantom-Figure-Erzeugen.
      if (typeof msg.figureId === 'string' && figs.has(msg.figureId)) {
        const note = typeof msg.note === 'string' ? msg.note.slice(0, 1000) : '';
        figs.set(msg.figureId, { ...figs.get(msg.figureId), note });
      }
      break;
    }
```

- [ ] **Step 2: TypeScript verifizieren**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add brett/src/server/figures.ts
git commit -m "feat(brett): applyMutation case for figure_note_set [T000469]"
```

---

### Task 2.2: WS-Handler-Block für `figure_note_set`

**Files:**
- Modify: `brett/src/server/ws-handler.ts`

- [ ] **Step 1: Handler-Block für `figure_note_set` einfügen**

Einfügen NACH dem `figure_release`-Block und VOR dem `lobby_set_ready`-Check (analog zum Possession-Pattern):

```typescript
        // ── Notiz-Mutation (Slice 5, T000469) ──────────────────────────────────
        if (msg.type === 'figure_note_set') {
          if (typeof msg.figureId !== 'string' || typeof msg.note !== 'string') return;
          if (!gateMutation(ws, room, 'figure_note_set', msg.figureId, deps)) {
            try { ws.send(JSON.stringify({ type: 'error', reason: 'forbidden' })); } catch {}
            return;
          }
          deps.applyMutation(room, {
            type: 'figure_note_set',
            figureId: msg.figureId,
            note: msg.note,
          });
          deps.broadcast(room, {
            type: 'figure_note_changed',
            figureId: msg.figureId,
            note: msg.note.slice(0, 1000),
          });
          deps.schedulePersist(room);
          return;
        }
```

- [ ] **Step 2: Sicherstellen dass `figure_note_set` NICHT in `RELAY_TYPES` oder `ADMIN_TYPES` landet**

Prüfe:
```typescript
// RELAY_TYPES enthält 'figure_note_set' NICHT (eigener Handler oben)
// ADMIN_TYPES enthält 'figure_note_set' NICHT (non-admin Mutation)
```

Run: `cd brett && grep -n "figure_note_set" src/server/ws-handler.ts`
Expected: nur der neue Handler-Block

- [ ] **Step 3: TypeScript verifizieren**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add brett/src/server/ws-handler.ts
git commit -m "feat(brett): ws-handler block for figure_note_set mutation [T000469]"
```

---

## Meilenstein 3: Client-Side Panel & WS-Client

### Task 3.1: DOM-Elemente für Notizfeld in `index.html`

**Files:**
- Modify: `brett/public/index.html`

- [ ] **Step 1: `<textarea>` und Label in `#fig-panel` einfügen**

Im `#fig-panel`-Dialog, nach dem `#fig-label-input`-Block und VOR dem `#fig-panel-add`-Button einfügen:

```html
          <span class="fig-panel-label">Notiz / Statement</span>
          <textarea id="fig-note-textarea"
            placeholder="Was spricht diese Figur? Was sieht sie?"
            maxlength="1000"
            rows="4"></textarea>
```

- [ ] **Step 2: CSS für `#fig-note-textarea` hinzufügen**

Im `<style>`-Block nach den `#fig-label-input`-Regeln:

```css
    #fig-note-textarea {
      background: var(--brett-ink-850, #101826);
      border: 1px solid var(--brett-line-2, rgba(255,255,255,0.12));
      border-radius: 5px;
      color: var(--brett-fg, #eef1f3);
      font: inherit;
      font-size: 12px;
      padding: 5px 8px;
      width: 100%;
      resize: vertical;
      min-height: 72px;
      line-height: 1.4;
    }
    #fig-note-textarea:focus {
      outline: none;
      border-color: var(--brett-brass, oklch(0.80 0.09 75));
    }
    #fig-note-textarea::placeholder {
      color: rgba(231,234,208,0.3);
    }
```

- [ ] **Step 3: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): add note textarea to fig-panel HTML+CSS [T000469]"
```

---

### Task 3.2: `fig-panel.ts` — Notizfeld synchronisieren und senden

**Files:**
- Modify: `brett/src/client/ui/fig-panel.ts`

- [ ] **Step 1: Import `sendClient` aus `ws-client.ts` sicherstellen**

Am Anfang der Datei ist bereits `import { sendAddFigure, sendUpdate } from '../ws-client';`. Ergänze:

```typescript
import { sendAddFigure, sendUpdate, sendClient } from '../ws-client';
```

- [ ] **Step 2: `syncPanelToSelection` für Notizfeld erweitern**

Ergänze in `syncPanelToSelection(id)` das Befüllen des Notizfelds:

```typescript
export function syncPanelToSelection(id: string | null): void {
  const title  = document.getElementById('fig-panel-title');
  const addBtn = document.getElementById('fig-panel-add');
  const input  = document.getElementById('fig-label-input') as HTMLInputElement | null;
  const noteArea = document.getElementById('fig-note-textarea') as HTMLTextAreaElement | null;  // NEU
  if (!title) return;
  const fig = STATE.figures.find(f => f.id === id);
  if (fig) {
    title.textContent = 'FIGUR BEARBEITEN';
    if (addBtn) addBtn.hidden = true;
    if (input) input.value = fig.label || '';
    if (noteArea) noteArea.value = (fig as any).note || '';  // NEU
  } else {
    title.textContent = 'NEUE FIGUR';
    if (addBtn) addBtn.hidden = false;
    if (input) input.value = '';
    if (noteArea) noteArea.value = '';  // NEU
  }
}
```

- [ ] **Step 3: `input`-Handler für `fig-note-textarea` in `initFigPanel` registrieren**

Nach dem `fig-label-input`-Handler in `initFigPanel`:

```typescript
  // Note textarea — sendet figure_note_set bei Eingabe (debounced via native input event)
  document.getElementById('fig-note-textarea')!.addEventListener('input', e => {
    const fig = STATE.figures.find(f => f.id === STATE.selectedId);
    if (fig) {
      const note = (e.target as HTMLTextAreaElement).value;
      (fig as any).note = note;
      sendClient({ type: 'figure_note_set', figureId: fig.id, note });
      // Billboard update (Feature-Flag sf-t000469) — lazy import to avoid hard dep
      const feats: Record<string, boolean> =
        (typeof window !== 'undefined' && (window as any).__brettFeatures) || {};
      if (feats['sf-t000469']) {
        import('./hud').then(m => {
          if (typeof (m as any).setFigureNoteBillboard === 'function') {
            (m as any).setFigureNoteBillboard(fig.id, note);
          }
        }).catch(() => {});
      }
    }
  });
```

- [ ] **Step 4: TypeScript verifizieren**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add brett/src/client/ui/fig-panel.ts
git commit -m "feat(brett): sync note textarea in fig-panel, send figure_note_set [T000469]"
```

---

### Task 3.3: `ws-client.ts` — `figure_note_changed` empfangen

**Files:**
- Modify: `brett/src/client/ws-client.ts`

- [ ] **Step 1: `figure_note_changed`-Case in `onWsMessage`-Switch hinzufügen**

Einfügen nach dem `figure_type_changed`-Case (vor `case 'error':`):

```typescript
    case 'figure_note_changed': {
      const fig = STATE.figures.find(f => f.id === msg.figureId);
      if (fig) {
        (fig as any).note = msg.note;
        // Panel aktualisieren wenn diese Figur gerade selektiert ist
        if (STATE.selectedId === msg.figureId) {
          const noteArea = document.getElementById('fig-note-textarea') as HTMLTextAreaElement | null;
          if (noteArea) noteArea.value = msg.note;
        }
        // Billboard update (Feature-Flag sf-t000469)
        const feats: Record<string, boolean> =
          (typeof window !== 'undefined' && (window as any).__brettFeatures) || {};
        if (feats['sf-t000469']) {
          import('./ui/hud').then(m => {
            if (typeof (m as any).setFigureNoteBillboard === 'function') {
              (m as any).setFigureNoteBillboard(msg.figureId, msg.note);
            }
          }).catch(() => {});
        }
      }
      break;
    }
```

- [ ] **Step 2: `snapshot`-Case um `note`-Wiederherstellung erweitern**

Im `case 'snapshot':` nach der Figur-Erstellung aus `msg.figures` (wo `appearance` schon applied wird), ergänze Notiz-Wiederherstellung:

```typescript
        // Notizen aus Snapshot wiederherstellen (Slice 5, T000469)
        if (f.note !== undefined) {
          (fig as any).note = f.note;
        }
```

Das Billboard wird nach dem `snapshot`-Case per Feature-Flag initial gesetzt; hier reicht es, `note` zu setzen — das Panel synct via `selectFigure`.

- [ ] **Step 3: TypeScript verifizieren**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add brett/src/client/ws-client.ts
git commit -m "feat(brett): handle figure_note_changed in ws-client + snapshot rehydration [T000469]"
```

---

## Meilenstein 4: 3D Billboard (Feature-Flag `sf-t000469`)

### Task 4.1: Billboard-Funktionen in `hud.ts`

**Files:**
- Modify: `brett/src/client/ui/hud.ts`
- Modify: `brett/src/client/state.ts`

- [ ] **Step 1: `noteSprites`-Map in `state.ts` exportieren**

In `brett/src/client/state.ts`, nach `export const lockSprites`:

```typescript
export const noteSprites = new Map<string, THREE.Sprite>();
```

- [ ] **Step 2: `noteSprites` in `hud.ts` importieren**

Passe den Import am Anfang von `hud.ts` an:

```typescript
import { STATE, ui, lockSprites, noteSprites, activeLocks, currentUser, getWs, isWsReady } from '../state';
```

- [ ] **Step 3: `setFigureNoteBillboard` und `clearFigureNoteBillboard` in `hud.ts` hinzufügen**

Am Ende von `hud.ts` (nach `clearLockBadgesForUser`):

```typescript
/**
 * Setzt oder aktualisiert den Notiz-Billboard-Sprite über einer Figur.
 * Feature-Flag: sf-t000469. Zeigt max. 40 Zeichen der Notiz an.
 */
export function setFigureNoteBillboard(figureId: string, note: string): void {
  clearFigureNoteBillboard(figureId);
  const feats: Record<string, boolean> =
    (typeof window !== 'undefined' && (window as any).__brettFeatures) || {};
  if (!feats['sf-t000469']) return;
  if (!note || !note.trim()) return; // Leere Notizen: kein Sprite

  const fig = STATE.figures.find(f => f.id === figureId);
  if (!fig) return;

  const preview = note.length > 40 ? note.slice(0, 40) + '…' : note;

  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 80;
  const ctx = canvas.getContext('2d')!;

  // Hintergrund: leicht transparentes Dunkel mit goldenem Rand
  ctx.fillStyle = 'rgba(11,17,28,0.82)';
  if ((ctx as any).roundRect) {
    (ctx as any).roundRect(4, 4, 312, 72, 12);
  } else {
    ctx.rect(4, 4, 312, 72);
  }
  ctx.fill();
  ctx.strokeStyle = 'rgba(200,169,110,0.7)';
  ctx.lineWidth = 2;
  if ((ctx as any).roundRect) {
    ctx.beginPath();
    (ctx as any).roundRect(4, 4, 312, 72, 12);
    ctx.stroke();
  }

  // Notiztext
  ctx.font = '500 13px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = '#e7ead0';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(preview, 160, 40);

  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(mat);
  // Breiter als Lock-Badge, höher positioniert (über dem Kopf der Figur)
  sprite.scale.set(2.0, 0.5, 1);
  sprite.position.set(0, 1.9, 0);

  fig.root.add(sprite);
  noteSprites.set(figureId, sprite);
}

/**
 * Entfernt den Notiz-Billboard-Sprite einer Figur und gibt GPU-Ressourcen frei.
 */
export function clearFigureNoteBillboard(figureId: string): void {
  const sprite = noteSprites.get(figureId);
  if (sprite) {
    const fig = STATE.figures.find(f => f.id === figureId);
    if (fig) fig.root.remove(sprite);
    if (sprite.material.map) sprite.material.map.dispose();
    sprite.material.dispose();
    noteSprites.delete(figureId);
  }
}
```

- [ ] **Step 4: TypeScript verifizieren**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add brett/src/client/state.ts brett/src/client/ui/hud.ts
git commit -m "feat(brett): note billboard sprite functions in hud.ts (sf-t000469) [T000469]"
```

---

### Task 4.2: Billboard-Cleanup bei Figur-Löschung

**Files:**
- Modify: `brett/src/client/ws-client.ts`

- [ ] **Step 1: Billboard-Cleanup im `delete`-Case sicherstellen**

Im `case 'delete':`-Block in `onWsMessage`, nach `scene.remove(STATE.figures[idx].root)`:

```typescript
    case 'delete': {
      const idx = STATE.figures.findIndex(f => f.id === msg.id);
      if (idx >= 0) {
        scene.remove(STATE.figures[idx].root);
        // Billboard-Cleanup (Feature-Flag sf-t000469)
        import('./ui/hud').then(m => {
          if (typeof (m as any).clearFigureNoteBillboard === 'function') {
            (m as any).clearFigureNoteBillboard(msg.id);
          }
        }).catch(() => {});
        STATE.figures.splice(idx, 1);
      }
      break;
    }
```

- [ ] **Step 2: Billboard-Initialisierung im `snapshot`-Case**

Am Ende des `case 'snapshot':`-Blocks (nach dem kompletten Figures-Rebuild), füge hinzu:

```typescript
      // Billboard-Wiederherstellung für alle Figuren mit Notizen (Feature-Flag sf-t000469)
      const feats: Record<string, boolean> =
        (typeof window !== 'undefined' && (window as any).__brettFeatures) || {};
      if (feats['sf-t000469']) {
        import('./ui/hud').then(m => {
          if (typeof (m as any).setFigureNoteBillboard === 'function') {
            for (const f of STATE.figures) {
              if ((f as any).note) {
                (m as any).setFigureNoteBillboard(f.id, (f as any).note);
              }
            }
          }
        }).catch(() => {});
      }
```

- [ ] **Step 3: TypeScript verifizieren**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add brett/src/client/ws-client.ts
git commit -m "feat(brett): billboard cleanup on delete + restore on snapshot [T000469]"
```

---

## Meilenstein 5: Tests

### Task 5.1: Server-Unit-Tests `figure-note.test.ts`

**Files:**
- Create: `brett/test/figure-note.test.ts`

- [ ] **Step 1: Test-Datei erstellen**

```typescript
import { test } from 'node:test';
import assert from 'node:assert';
import { applyMutation, ensureFigureMap, seedFigureMapFromState } from '../src/server/figures';
import { canMutate } from '../src/server/permissions';
import { buildStateFromMutations } from '../src/server/phases';
import { initPhases } from '../src/server/phases';
import { figureMaps } from '../src/server/figures';

// ── Test-Setup Hilfsfunktionen ────────────────────────────────────────────────

function makeRoom(roomId: string): string {
  const figs = ensureFigureMap(roomId);
  figs.clear();
  // Basis-Figur anlegen
  applyMutation(roomId, { type: 'add', figure: { id: 'fig-1', x: 0, z: 0, facingY: 0, appearance: {} } });
  applyMutation(roomId, { type: 'add', figure: { id: 'fig-2', x: 1, z: 1, facingY: 0, appearance: {}, ownerId: 'player-a' } });
  // ownerId direkt setzen (server-autoritativ)
  applyMutation(roomId, { type: 'figure_owner_set', figureId: 'fig-2', ownerId: 'player-a' });
  return roomId;
}

// ── applyMutation: figure_note_set ───────────────────────────────────────────

test('applyMutation figure_note_set: setzt note auf existierende Figur', () => {
  const room = makeRoom('note-test-1');
  applyMutation(room, { type: 'figure_note_set', figureId: 'fig-1', note: 'Ich sehe Weite.' });
  const fig = figureMaps.get(room)!.get('fig-1');
  assert.strictEqual(fig.note, 'Ich sehe Weite.');
});

test('applyMutation figure_note_set: kürzt auf 1000 Zeichen', () => {
  const room = makeRoom('note-test-2');
  const long = 'x'.repeat(2000);
  applyMutation(room, { type: 'figure_note_set', figureId: 'fig-1', note: long });
  const fig = figureMaps.get(room)!.get('fig-1');
  assert.strictEqual(fig.note!.length, 1000);
});

test('applyMutation figure_note_set: no-op bei unbekannter figureId', () => {
  const room = makeRoom('note-test-3');
  applyMutation(room, { type: 'figure_note_set', figureId: 'nonexistent', note: 'test' });
  // kein Fehler, figureMaps unverändert
  assert.ok(!figureMaps.get(room)!.has('nonexistent'));
});

test('applyMutation figure_note_set: leerer String löscht Notiz', () => {
  const room = makeRoom('note-test-4');
  applyMutation(room, { type: 'figure_note_set', figureId: 'fig-1', note: 'erste Notiz' });
  applyMutation(room, { type: 'figure_note_set', figureId: 'fig-1', note: '' });
  const fig = figureMaps.get(room)!.get('fig-1');
  assert.strictEqual(fig.note, '');
});

// ── canMutate: figure_note_set ────────────────────────────────────────────────

function ctx(overrides: Partial<Parameters<typeof canMutate>[0]>): Parameters<typeof canMutate>[0] {
  return {
    msgType: 'figure_note_set' as any,
    role: 'beobachter',
    playerId: 'me',
    figureOwnerId: null,
    allowRepresentativeAdd: false,
    ...overrides,
  };
}

test('canMutate figure_note_set: leiter → true (beliebige Figur)', () => {
  assert.strictEqual(canMutate(ctx({ role: 'leiter', figureOwnerId: null })), true);
  assert.strictEqual(canMutate(ctx({ role: 'leiter', figureOwnerId: 'other' })), true);
});

test('canMutate figure_note_set: stellvertreter eigene Figur → true', () => {
  assert.strictEqual(
    canMutate(ctx({ role: 'stellvertreter', playerId: 'me', figureOwnerId: 'me' })),
    true,
  );
});

test('canMutate figure_note_set: stellvertreter fremde Figur → false', () => {
  assert.strictEqual(
    canMutate(ctx({ role: 'stellvertreter', playerId: 'me', figureOwnerId: 'other' })),
    false,
  );
});

test('canMutate figure_note_set: stellvertreter null Owner → false', () => {
  assert.strictEqual(
    canMutate(ctx({ role: 'stellvertreter', playerId: 'me', figureOwnerId: null })),
    false,
  );
});

test('canMutate figure_note_set: beobachter → false', () => {
  assert.strictEqual(canMutate(ctx({ role: 'beobachter' })), false);
});

// ── buildStateFromMutations: note in figures ──────────────────────────────────

test('buildStateFromMutations: note erscheint in figures-Array', () => {
  // initPhases braucht figureMaps + applyMutation
  initPhases({ figureMaps, applyMutation });
  const room = makeRoom('note-build-1');
  applyMutation(room, { type: 'figure_note_set', figureId: 'fig-1', note: 'Perspektive: Norden.' });
  const state = buildStateFromMutations(room);
  const fig1 = state.figures.find((f: any) => f.id === 'fig-1');
  assert.ok(fig1, 'fig-1 muss in figures[] sein');
  assert.strictEqual(fig1.note, 'Perspektive: Norden.');
});

// ── seedFigureMapFromState: note wird re-hydriert ─────────────────────────────

test('seedFigureMapFromState: note wird korrekt re-hydriert', () => {
  const map = new Map<string, any>();
  const persistedState = {
    figures: [
      { id: 'f-1', x: 0, z: 0, facingY: 0, appearance: {}, note: 'Gespeicherte Notiz' },
      { id: 'f-2', x: 1, z: 1, facingY: 0, appearance: {} }, // keine Notiz
    ],
  };
  seedFigureMapFromState(map, persistedState);
  assert.strictEqual(map.get('f-1').note, 'Gespeicherte Notiz');
  assert.ok(map.has('f-2'));
  assert.strictEqual(map.get('f-2').note, undefined);
});

test('seedFigureMapFromState: note überlebt DB-Round-Trip ohne Verlust', () => {
  initPhases({ figureMaps, applyMutation });
  const room = makeRoom('note-seed-1');
  applyMutation(room, { type: 'figure_note_set', figureId: 'fig-1', note: 'Round-Trip Test' });
  const state = buildStateFromMutations(room);
  // Simuliere DB-Round-Trip: neues Map aus gespeichertem State
  const freshMap = new Map<string, any>();
  seedFigureMapFromState(freshMap, state);
  const rehydrated = freshMap.get('fig-1');
  assert.strictEqual(rehydrated.note, 'Round-Trip Test');
});
```

- [ ] **Step 2: Tests ausführen**

Run: `cd brett && node --test test/figure-note.test.ts`
Expected: Alle Tests PASS (grün)

- [ ] **Step 3: Commit**

```bash
git add brett/test/figure-note.test.ts
git commit -m "test(brett): figure-note unit tests — applyMutation/perms/buildState/seed [T000469]"
```

---

### Task 5.2: Message-Typ-Exhaustiveness-Test

**Files:**
- Modify: `brett/test/messages.test.ts`

- [ ] **Step 1: Sicherstellen dass `figure_note_set` und `figure_note_changed` in den Type-Unions sind**

In `brett/test/messages.test.ts` (oder entsprechende Datei), füge Assert hinzu:

```typescript
import type { ClientMessageType, ServerMessageType } from '../src/types/messages';

// Compile-time check: diese Typen müssen in den Unions enthalten sein
// (wird zur Build-Zeit durch TypeScript erzwungen)
type AssertNoteSetInClient = ClientMessageType extends infer T
  ? 'figure_note_set' extends T ? true : false
  : false;
type AssertNoteChangedInServer = ServerMessageType extends infer T
  ? 'figure_note_changed' extends T ? true : false
  : false;

// Runtime-Check
import { test } from 'node:test';
import assert from 'node:assert';

test('ClientMessageType enthält figure_note_set', () => {
  const types: ClientMessageType[] = ['figure_note_set'];
  assert.ok(types.length === 1);
});

test('ServerMessageType enthält figure_note_changed', () => {
  const types: ServerMessageType[] = ['figure_note_changed'];
  assert.ok(types.length === 1);
});
```

- [ ] **Step 2: TypeScript verifizieren**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS — TypeScript erzwingt zur Compilezeit dass die Types existieren

- [ ] **Step 3: Commit**

```bash
git add brett/test/messages.test.ts
git commit -m "test(brett): verify figure_note_set/changed in message type unions [T000469]"
```

---

### Task 5.3: Abschluss-Verifikation

**Files:**
- Keine Änderungen

- [ ] **Step 1: Alle Brett-Tests laufen**

Run: `cd brett && node --test test/figure-note.test.ts test/permissions.test.ts test/messages.test.ts`
Expected: Alle Tests PASS

- [ ] **Step 2: Gesamt-TypeScript-Check**

Run: `cd brett && npx tsc --noEmit`
Expected: PASS (keine neuen Fehler)

- [ ] **Step 3: Lint / bekannte CI-Checks**

Run: `cd /home/patrick/Bachelorprojekt && bash scripts/task-oracle.sh 'run all offline tests'`
Expected: CI-relevante Offline-Tests grün

- [ ] **Step 4: Abschluss-Commit und PR**

```bash
git add .
git commit -m "chore(brett): pre-PR verification pass [T000469]"
```

Dann PR erstellen per `gh pr create`.

---

## Zusammenfassung der Dateien

| Datei | Änderung |
|-------|----------|
| `brett/src/types/state.ts` | `note?: string` zu `Figure` |
| `brett/src/types/messages.ts` | `figure_note_set` + `figure_note_changed` |
| `brett/src/server/permissions.ts` | `MutationType` + `canMutate` |
| `brett/src/server/figures.ts` | `applyMutation` Case |
| `brett/src/server/ws-handler.ts` | Handler-Block |
| `brett/public/index.html` | DOM + CSS für `#fig-note-textarea` |
| `brett/src/client/ui/fig-panel.ts` | Panel-Sync + Input-Handler |
| `brett/src/client/ws-client.ts` | `figure_note_changed` + snapshot + delete-cleanup |
| `brett/src/client/state.ts` | `noteSprites` Map exportieren |
| `brett/src/client/ui/hud.ts` | `setFigureNoteBillboard` + `clearFigureNoteBillboard` |
| `brett/test/figure-note.test.ts` | Neue Test-Datei (erstellen) |
| `brett/test/messages.test.ts` | Type-Union-Assert ergänzen |
