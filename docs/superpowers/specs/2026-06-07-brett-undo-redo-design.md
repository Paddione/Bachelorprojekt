---
title: "Brett: Undo/Redo Mutations-Stack (Slice 3)"
ticket_id: T000470
domains: [website]
status: active
pr_number: null
---

# Design: Brett Undo/Redo Mutations-Stack (Slice 3)

**Ticket:** T000470
**Branch (vorgesehen):** feature/brett-undo-redo

---

## 1. Überblick

### Feature-Beschreibung

Das Systembrett ermöglicht Coaching-Sitzungen, in denen Figuren bewegt, gelöscht, hinzugefügt und
konfiguriert werden. Fehler passieren: eine Figur landet an der falschen Position, eine versehentliche
Löschung muss rückgängig gemacht werden, oder eine Pose-Anpassung soll widerrufen werden. Ohne Undo/Redo
muss der Leiter die Sitzung manuell zurücksetzen — eine unterbrechende Erfahrung in einem Coach-Klienten-
Kontext.

**Slice 3** führt einen **server-seitigen Undo/Redo-Mutations-Stack** ein, der es dem Admin (Leiter mit
`isAdmin === true`) erlaubt, bis zu 20 Board-Mutationen rückgängig zu machen und wiederherzustellen:

- `session_undo` — macht die letzte Mutation rückgängig (bis zu 20 Schritte tief)
- `session_redo` — wiederholt die zuletzt rückgängig gemachte Mutation
- Undo/Redo-Buttons im HUD (nur für isAdmin-User sichtbar)
- Teilnehmer-Joins und -Leaves sowie Phasenübergänge sind **nicht undo-bar**

### Coaching-Nutzen

Im Coaching-Kontext erlaubt Undo/Redo eine fließende, nicht-lineare Explorationsarbeit:
- Systemische Aufstellungen können schrittweise rückgängig gemacht werden, um alternative
  Konfigurationen zu vergleichen
- Akkzidentelle Aktionen (Drag, Delete) werden sofort korrigiert ohne Unterbrechung des Gesprächsflusses
- Redo erlaubt das "Vorwärtsspielen" einer revidierten Aufstellung

---

## 2. Architectural Decision

### Entscheidung: Server-seitiger Stack mit invertiertem Snapshot-Diff

**Ansatz:** Der Server hält pro Raum einen `UndoStack` (Array von `UndoEntry`). Jede undo-bare Mutation
speichert einen **Snapshot des vorherigen Zustands** der betroffenen Figuren als invertierbare Diff
(Vorher-Zustand). Beim Undo wird dieser Zustand re-appliziert; beim Redo wird der Nachher-Zustand
re-appliziert.

**Alternativen verworfen:**

| Ansatz | Grund der Verwerfung |
|--------|---------------------|
| Client-seitiger Stack | Verliert Zustand bei Reload; inkonsistent bei Multi-User-Boards |
| Event-Sourcing / volles Replay | Zu komplex, zu viel Latenz bei 20 Schritten und 200 Figuren |
| Diff-basiert mit Patch/Inverse-Patch | Notwendig nur für komplexe partielle Updates; bei Figur-Operationen reicht ein Vorher/Nachher-Snapshot der betroffenen Figure IDs |

**Gewählter Ansatz — Begründung:**

Der Server ist die SSOT (Single Source of Truth). Der `figureMaps` In-Memory-Store speichert bereits den
vollständigen Board-Zustand. Ein Undo-Eintrag speichert für jede betroffene Figur den Zustand **vor** der
Mutation als Plain-Object-Snapshot:

```typescript
interface UndoEntry {
  // Zustand VOR der Mutation, pro Figur-ID
  // null = Figur existierte nicht (z.B. vor einem 'add' → Undo löscht sie)
  before: Map<string, any | null>;
  // Zustand NACH der Mutation (für Redo)
  after: Map<string, any | null>;
  // Typ der ursprünglichen Mutation (zur Anzeige)
  mutationType: string;
  // Zeitstempel
  ts: number;
}
```

**Welche Mutationen sind undo-bar:**

| Mutation | Undo-bar | Begründung |
|----------|----------|------------|
| `add` | ✅ | Figur-Snapshot vorher = null (existierte nicht) |
| `move` | ✅ | x/z/facingY vorher gespeichert |
| `update` | ✅ | Gesamter Figure-State vorher gespeichert |
| `delete` | ✅ | Figur-Snapshot vorher = vollständige Figur |
| `clear` | ✅ | Alle Figuren vorher gespeichert |
| `stiffness` | ✅ | Stiffness-Wert vorher gespeichert |
| `snapshot` | ✅ | Gesamter Board-Zustand vorher gespeichert |
| `figure_type_set` | ✅ | figureType vorher gespeichert |
| `figure_possess` | ❌ | Ephemeral — Possessor-Zustand ist flüchtig |
| `figure_release` | ❌ | Ephemeral |
| `figure_lock` | ❌ | Ephemeral |
| Phasenübergänge | ❌ | Sitzungssteuerung — kein Undo |
| Teilnehmer-Join/Leave | ❌ | Presence-Ereignisse — kein Undo |
| `figure_owner_set` | ❌ | Admin-Operation über separate Route |
| `admin_*` | ❌ | Sitzungs-/Konfigurationsoperationen |

**Stack-Semantik:**

- Stack-Größe: max. 20 Einträge (älteste werden verworfen wenn Limit erreicht)
- `session_undo`: poppt letzten Eintrag, appliziert `before`, schiebt auf `redo`-Stack
- `session_redo`: poppt letzten Redo-Eintrag, appliziert `after`, schiebt zurück auf `undo`-Stack
- Jede neue undo-bare Mutation **löscht den Redo-Stack** (standard Undo/Redo-Semantik)

**Isolierung pro Raum:** `undoStacks` und `redoStacks` sind `Map<string, UndoEntry[]>` (room → Stack).
Cleanup bei Last-Leave (analog zu `figureMaps.delete(room)`).

**Sentinels nicht undo-bar:** `__session_phase__`, `__session_code__`, `__admin_token_holder__`,
`__roles__`, `__lobby_settings__` sind Sitzungs-Sentinels und werden nicht in Undo-Einträge aufgenommen.
Nur Figuren (IDs ohne `__`-Prefix) und der `__stiffness__`-Sentinel sind undo-bar.

---

## 3. Data Model / Interface Changes

### 3.1 Neue Typen (brett/src/server/undo-stack.ts — neue Datei)

```typescript
export interface UndoEntry {
  before: Map<string, any | null>;  // figureId → Zustand vorher (null = nicht existiert)
  after:  Map<string, any | null>;  // figureId → Zustand nachher (null = gelöscht)
  mutationType: string;
  ts: number;
}

export interface UndoStackState {
  undo: UndoEntry[];
  redo: UndoEntry[];
}

// Pro Raum
export const undoStacks = new Map<string, UndoEntry[]>();
export const redoStacks = new Map<string, UndoEntry[]>();

export const UNDO_LIMIT = 20;

// Undo-bare Mutations (alle anderen werden ignoriert)
export const UNDOABLE_TYPES = new Set([
  'add', 'move', 'update', 'delete', 'clear', 'stiffness', 'snapshot', 'figure_type_set'
]);
```

### 3.2 Neue ClientMessage-Typen (brett/src/types/messages.ts)

```typescript
| { type: 'session_undo' }
| { type: 'session_redo' }
```

### 3.3 Neue ServerMessage-Typen (brett/src/types/messages.ts)

```typescript
| { type: 'undo_stack_changed'; canUndo: boolean; canRedo: boolean; undoCount: number; redoCount: number }
```

Das `undo_stack_changed`-Event wird nach jeder undo-baren Mutation, nach jedem Undo und nach jedem Redo
an ALLE Clients im Raum gesendet, damit der HUD-Zustand synchron bleibt.

### 3.4 Neue MutationType-Einträge (brett/src/server/permissions.ts)

```typescript
| 'session_undo' | 'session_redo'
```

`session_undo` und `session_redo` werden in `ADMIN_TYPES` aufgenommen (nur isAdmin), nicht in
`canMutate` (keine Permissions-Matrix-Prüfung notwendig — isAdmin-Gate reicht).

### 3.5 Neue WsDeps-Felder (brett/src/server/ws-handler.ts)

```typescript
pushUndoEntry: (room: string, entry: UndoEntry) => void;
applyUndoEntry: (room: string, entry: UndoEntry, direction: 'undo' | 'redo') => void;
getUndoStatus: (room: string) => { canUndo: boolean; canRedo: boolean; undoCount: number; redoCount: number };
clearUndoStacks: (room: string) => void;
```

### 3.6 Kein neues DB-Schema

Der Undo-Stack ist **rein in-memory** (nicht persistiert). Beim Server-Neustart ist er leer. Dies ist
absichtlich: Undo-History über Server-Neustarts hinweg ist im Coaching-Kontext nicht sinnvoll.

### 3.7 Snapshot-Capture-Zeitpunkt

Die Snapshot-Capture passiert **vor** dem `applyMutation`-Aufruf in einem neuen
`captureUndoSnapshot(room, msg)`-Aufruf, der die betroffenen Figuren aus `figureMaps` liest:

```
captureUndoSnapshot(room, msg)  →  applyMutation(room, msg)  →  captureAfterSnapshot(room, msg, entry)
→  pushUndoEntry(room, entry)   →  broadcast(...)            →  broadcast undo_stack_changed
```

---

## 4. Implementation Strategy

### 4.1 Server: undo-stack.ts (neue Datei)

Isolierte, pure Utility-Datei:

- `captureBeforeSnapshot(room, msg, figureMaps)`: liest betroffene Figuren aus `figureMaps` vor der Mutation;
  gibt `Map<string, any | null>` zurück
- `captureAfterSnapshot(room, msg, figureMaps, before)`: liest betroffene Figuren nach der Mutation;
  ergibt `UndoEntry`
- `pushUndo(room, entry)`: schiebt auf `undoStacks[room]`, trimmt auf UNDO_LIMIT, löscht `redoStacks[room]`
- `performUndo(room, figureMaps)`: poppt `undoStacks`, appliziert `before`, schiebt auf `redoStacks`
- `performRedo(room, figureMaps)`: poppt `redoStacks`, appliziert `after`, schiebt auf `undoStacks`
- `getUndoStatus(room)`: gibt `{ canUndo, canRedo, undoCount, redoCount }` zurück
- `clearStacks(room)`: löscht beide Stacks (aufgerufen beim Last-Leave)

### 4.2 Server: figures.ts (Erweiterung)

`applyMutation` bleibt unverändert. **Kein Undo-Stack-Aufruf in figures.ts** — dies ist Aufgabe
des ws-handlers (Separation of Concerns). Der ws-handler koordiniert: capture before → applyMutation →
capture after → pushUndo → broadcast undo_stack_changed.

### 4.3 Server: ws-handler.ts (Erweiterung)

Im RELAY_TYPES-Block, vor `applyMutation`:

```typescript
if (UNDOABLE_TYPES.has(msg.type)) {
  const before = deps.captureBeforeSnapshot(room, msg);
  deps.applyMutation(room, msg);
  deps.broadcast(room, msg, ws);
  deps.pushUndoEntry(room, msg, before);
  deps.broadcast(room, deps.getUndoStatus(room));  // undo_stack_changed
} else {
  deps.applyMutation(room, msg);
  deps.broadcast(room, msg, ws);
}
```

Neuer ADMIN_TYPES-Eintrag: `session_undo`, `session_redo`.

Handler in ws-admin-commands.ts (oder ws-handler.ts):

```typescript
case 'session_undo': {
  const result = deps.performUndo(room);
  if (result.applied) {
    deps.broadcast(room, { type: 'snapshot', figures: ... });  // re-snapshot
    deps.broadcast(room, { type: 'undo_stack_changed', ...deps.getUndoStatus(room) });
    deps.schedulePersist(room);
  }
  break;
}
```

### 4.4 Client: ws-client.ts (Erweiterung)

Neue Handler für `undo_stack_changed`:

```typescript
case 'undo_stack_changed':
  setUndoState(msg.canUndo, msg.canRedo, msg.undoCount, msg.redoCount);
  break;
```

`setUndoState` aktualisiert den HUD (Undo/Redo-Buttons enabled/disabled + Counter).

### 4.5 Client: hud.ts (Erweiterung)

Zwei neue Buttons (nur für isAdmin sichtbar):

```html
<button id="btn-undo" class="brett-btn brett-btn--ghost" disabled>↩ Rückgängig</button>
<button id="btn-redo" class="brett-btn brett-btn--ghost" disabled>↪ Wiederholen</button>
```

- Enabled/Disabled-Zustand folgt `canUndo` / `canRedo` aus `undo_stack_changed`
- Tastaturkürzel: `Ctrl+Z` → Undo, `Ctrl+Y` / `Ctrl+Shift+Z` → Redo
- Feature-Flag-Dark-Launch: `window.__brettFeatures['undo-redo']`

### 4.6 Tests

**Server-seitige Unit-Tests** (`brett/test/undo-redo.test.ts`):

- `pushUndo`: Stack wächst auf max 20, älteste Einträge werden verworfen
- `performUndo`: Figur-Zustand wird zurückgesetzt, Stack-Pointer korrekt
- `performRedo`: Redo-Eintrag wird re-appliziert
- `performUndo` auf leerem Stack: kein Fehler, false return
- `clear` Undo-bar: Alle Figuren werden gespeichert und können restauriert werden
- `delete` Undo: Figur wird wiederhergestellt
- `add` Undo: Figur wird gelöscht (Vorher-Zustand = null)
- Redo-Stack wird bei neuer Mutation gelöscht
- `stiffness` Undo-bar
- Nicht undo-bare Mutationen (figure_possess, session_phase_set) lösen keinen Stack-Eintrag aus
- `getUndoStatus` gibt korrekte Counts zurück

**Permissions-Tests** (`brett/test/permissions.test.ts` Ergänzung):

- `session_undo` ist nicht in `canMutate` MutationType (nicht in Matrix)
- `session_undo` / `session_redo` sind in `ADMIN_TYPES`

**HUD-Tests** (`brett/test/undo-redo-hud.test.ts`):

- Button wird enabled wenn `canUndo: true`
- Button bleibt disabled wenn `canUndo: false`
- Keyboard-Shortcut feuert `session_undo` WS-Nachricht

---

## 5. Nicht im Scope (Slice 3)

- Persistenz des Undo-Stacks über DB-Runden-Trips hinweg
- Per-User Undo-Stack (nur Admin-globaler Stack)
- Undo von Phasenübergängen
- Undo von Teilnehmer-Rollen-Zuweisungen
- Undo von Admin-Token-Handoffs
- Animiertes Feedback bei Undo (kein Undo-Anim)
- Undo-History-Panel (Anzeige der Schritte)
