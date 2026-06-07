# Brett Slice 4 — Beziehungs-/Spannungslinien Design

**Ticket:** T000467  
**Branch:** feature/brett-slice4-relations  
**Datum:** 2026-06-08

---

## Überblick

Slice 4 fügt dem Systembrett sichtbare Relationen (Linien) zwischen Figuren hinzu.
Ein Leiter kann Beziehungen vom Typ Bindung, Spannung, Distanz oder Neutral anlegen,
ändern und löschen. Die Linien werden als Three.js-Geometrie live gerendert und
synchron über alle Clients übertragen. Relationen sind persistent (JSONB-Snapshot)
und in den Undo/Redo-Stack integriert.

---

## 1. Typen & State

### `src/types/state.ts`

```typescript
export type RelationType = 'binding' | 'tension' | 'distance' | 'neutral';

export interface BrettRelation {
  id: string;        // uuid
  fromId: string;    // figure id
  toId: string;      // figure id
  type: RelationType;
  createdAt: number; // ms timestamp
}
```

`AppState` bekommt ein optionales Feld `relations?: BrettRelation[]`.

### `src/types/messages.ts`

6 neue WS-Message-Typen (3 Client→Server, 3 Server→alle Clients):

| Client-Message | Server-Broadcast |
|----------------|-----------------|
| `relation_add { fromId, toId, type }` | `relation_added { relation: BrettRelation }` |
| `relation_type_set { id, type }` | `relation_type_changed { id, type }` |
| `relation_remove { id }` | `relation_removed { id }` |

Der bestehende `snapshot`-ServerMessage-Typ erhält das optionale Feld `relations?: BrettRelation[]`.

### Server-State-Sentinel

`__relations__` in der `figureMap` (analog zu `__anchors__`, `__zones__`):

```typescript
{ id: '__relations__', relations: Record<string, BrettRelation> }
```

Speicherung als Record (nicht Array) für O(1)-Lookup bei `relation_type_set` und `relation_remove`.

**DB-Persistenz:** Kein neues Schema. `buildStateFromMutations` schreibt `state.relations: BrettRelation[]`
ins JSONB-Snapshot; `persistState` speichert es automatisch. `seedFigureMapFromState` liest das Array
zurück und konvertiert es in den Record-Sentinel.

---

## 2. Server-Logik

### `src/server/ws-handler.ts`

`ADMIN_TYPES` um die 3 Relationstypen erweitern:
```typescript
'relation_add', 'relation_type_set', 'relation_remove'
```

Zusätzlicher Rollen-Guard im Admin-Dispatch-Block (nach dem `isAdmin`-Gate):
```typescript
if (['relation_add','relation_type_set','relation_remove'].includes(msg.type)) {
  const role = resolveRole(ws, getRoles(room));
  if (role !== 'leiter') return;
}
```

Der Join-Snapshot (`buildStateFromMutations`) enthält bereits `relations` — kein separater
Snapshot-Patch nötig.

### `src/server/ws-admin-commands.ts`

Drei neue Cases im `handleAdminMessage`-Switch:

**`relation_add`:**
1. UUID generieren, `BrettRelation` aufbauen
2. `applyMutation(room, { type: 'relation_add', relation })` aufrufen
3. `broadcast(room, { type: 'relation_added', relation })`
4. `tryRecordMutation(room, 'relation_add', applyFn)` für Undo
5. `schedulePersist(room)`

**`relation_type_set`:**
1. Relation aus `__relations__`-Record laden (404-Guard: return wenn nicht gefunden)
2. `applyMutation(room, { type: 'relation_type_set', id, type })`
3. `broadcast(room, { type: 'relation_type_changed', id, type })`
4. `tryRecordMutation` + `schedulePersist`

**`relation_remove`:**
1. `applyMutation(room, { type: 'relation_remove', id })`
2. `broadcast(room, { type: 'relation_removed', id })`
3. `tryRecordMutation` + `schedulePersist`

### `src/server/figures.ts` — `applyMutation`

3 neue Cases:
- `relation_add`: Eintrag in `__relations__.relations[id]` anlegen (create-or-update)
- `relation_type_set`: `__relations__.relations[id].type` setzen
- `relation_remove`: `delete __relations__.relations[id]`

`seedFigureMapFromState`: `state.relations?.forEach(r => relationsRecord[r.id] = r)` → in Sentinel schreiben.

### `src/server/phases.ts` — `buildStateFromMutations`

`'__relations__'` in das `SPECIAL`-Array aufnehmen.
```typescript
const relationsEntry = figureMap.get('__relations__');
result.relations = relationsEntry ? Object.values(relationsEntry.relations) : [];
```

### `src/server/undo-stack.ts` — Undo/Redo-Integration

`UNDOABLE_TYPES` um `'relation_add'`, `'relation_type_set'`, `'relation_remove'` erweitern.

`captureBeforeSnapshot` erfasst den kompletten `__relations__`-Sentinel (shallow copy des Records).
Da Relationen `ADMIN_TYPES` sind, ruft jeder Admin-Handler `tryRecordMutation` **explizit** auf
(automatisches Erfassen via `RELAY_TYPES`-Pipeline greift hier nicht).

---

## 3. Client-Rendering

### Neue Datei: `src/client/scene-lines.ts`

Exportierte API (exakt nach `ground-objects.ts`-Muster):

```typescript
export function applyRelationAdded(rel: BrettRelation): void
export function applyRelationRemoved(id: string): void
export function applyRelationTypeChanged(id: string, type: RelationType): void
export function initRelationsFromSnapshot(relations: BrettRelation[]): void
export function clearAllRelations(): void
export function updateLinePositions(): void   // im Render-Loop aufgerufen
```

**Interner State:** `lineMeshes: Map<string, THREE.Line>`, `lineLabels: Map<string, HTMLElement>`.
`clearAllRelations` entfernt alle Meshes aus der Scene, disposed sie, entfernt alle Label-DOM-Elemente und leert beide Maps.

**Visuelles Mapping:**

| Typ | Material | Farbe |
|-----|----------|-------|
| `binding` | `LineBasicMaterial` | `#4ade80` |
| `tension` | `LineDashedMaterial` | `#f87171` |
| `distance` | `LineDashedMaterial` | `#94a3b8` |
| `neutral` | `LineBasicMaterial` | `#f8fafc` |

**Geometrie:** `CatmullRomCurve3` mit drei Punkten (from, mid bei Y=0.4, to) → 20 Segmente.
Bei `LineDashedMaterial` nach jeder Geometrieänderung `mesh.computeLineDistances()` aufrufen.

**Render-Loop (`updateLinePositions`):**
- Für jede Relation: aktuelle Positionen von `fromId`/`toId` aus `STATE.figures` lesen
- Dirty-Check via `lastPositions: Map<string, THREE.Vector3>` — Geometrie nur neu bauen wenn
  sich eine der beiden Figuren bewegt hat
- Label-Position: `toScreenPosition(midPoint)` → CSS `left`/`top` setzen

**Feature-Flag:** `(window as any).__brettFeatures?.['sf-t000467']` (analog zu `sf-t000468`).

### `src/client/ws-client.ts`

- Snapshot-Handler: `clearAllRelations()` + `initRelationsFromSnapshot(snapshot.relations ?? [])`
- 3 neue Cases im `onWsMessage`-Switch:
  - `relation_added` → `applyRelationAdded(msg.relation)`
  - `relation_removed` → `applyRelationRemoved(msg.id)`
  - `relation_type_changed` → `applyRelationTypeChanged(msg.id, msg.type)`

### `src/client/board-boot.ts`

`updateLinePositions()` nach dem mannequin-Tick im `requestAnimationFrame`-Loop einhängen.

---

## 4. Kontext-Menü & UI

### Rechtsklick-Flow (Leiter-only)

1. Rechtsklick auf eine Figur → `resolveRole` prüfen — bei `beobachter`/`stellvertreter`: kein Menü
2. Menü-Item „Verbinden mit…" erscheint
3. Cursor-Wechsel zu Crosshair; nächster Figurenklick wählt Ziel
4. Typ-Auswahl-Popup (4 Buttons): Bindung / Spannung / Distanz / Neutral
5. WS `relation_add` senden; Popup schließt sich

**Rechtsklick auf bestehende Linie** (Raycasting gegen `lineMeshes`):
- „Typ ändern" → Typ-Auswahl-Popup → `relation_type_set`
- „Löschen" → `relation_remove`

**UI-Implementierung:** Absolut-positioniertes `<div id="relation-menu">` im `#hud`-Container.
CSS-Tokens aus `theme.ts` (Hintergrundfarbe, Border, Font). Schließt bei Klick außerhalb
(globaler `mousedown`-Listener) und nach Auswahl.

### Distanz/Blickwinkel-Readout

**Format:** `3.2m  ↔ 45°`

- **Distanz:** `from.position.distanceTo(to.position)` — 1 Three.js-Unit = 1m, auf 1 Dezimalstelle gerundet
- **Blickwinkel-Differenz:** `Math.abs(fromRotY - toRotY) % Math.PI` in Grad, auf ganze Grad gerundet, Range 0–180°

**Darstellung:** CSS-Label (`<div class="line-label">`) zentriert auf der Linie,
Position via `THREE.Vector3.project(camera)` → Viewport-Koordinaten.
Update: jeder Frame in `updateLinePositions()`.
Unsichtbar wenn `STATE.replayMode === true` (optionales Feld, standardmäßig `false`; Slice 5 setzt es).

---

## 5. Tests

### Neue Datei: `brett/test/lines.test.ts`

**Server-seitig (~10 Tests):**
- `applyMutation('relation_add')` legt Eintrag in `__relations__` an
- `applyMutation('relation_type_set')` überschreibt nur den Typ
- `applyMutation('relation_remove')` entfernt Eintrag
- `buildStateFromMutations` gibt `relations: BrettRelation[]` aus
- `seedFigureMapFromState` round-trip ist stabil (Array → Record → Array)
- Undo-Snapshot erfasst `__relations__`-Zustand vor Mutation
- Leiter-Gate: `relation_add` ohne Leiter-Rolle wird blockiert

**Client-seitig (~5 Tests, jsdom):**
- `applyRelationAdded` → `lineMeshes.size` wächst
- `applyRelationRemoved` → Mesh disposed + Map-Eintrag weg
- `clearAllRelations` → Map leer, alle Meshes disposed
- `initRelationsFromSnapshot` → idempotent bei Doppelaufruf

### Erweiterungen bestehender Tests

- `brett/test/messages.test.ts` — Exhaustiveness-Router um 6 neue Typen erweitern
- `brett/test/relay-gate.test.ts` — Relationstypen sind in `ADMIN_TYPES`, nicht in `RELAY_TYPES`

### Manuelle Akzeptanzkriterien

- Relation anlegen → Seite neu laden → Relation bleibt erhalten
- Client B sieht Relation sofort nach Client A's `relation_add`
- Beobachter sieht kein „Verbinden mit…"-Menü
- Undo nach `relation_add` → Linie verschwindet auf allen Clients
- Distanz/Blickwinkel-Readout aktualisiert sich bei Figurenbewegung

---

## 6. Nicht im Scope

- Relation zwischen mehr als 2 Figuren (Gruppen-Relationen)
- Freitext-Labels auf Linien
- Export der Relationen im PNG/PDF (Slice-5-Bereich)
- Mobile/Touch-Unterstützung für das Kontext-Menü
