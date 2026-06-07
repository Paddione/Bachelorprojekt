---
title: "Brett: Boden-Anker & Zonen (Slice 4)"
ticket_id: T000468
domains: [website]
status: active
pr_number: null
---

# Design: Brett: Boden-Anker & Zonen (Slice 4)

**Ticket:** T000468  
**Branch (vorgesehen):** feature/brett-ground-anchors

---

## 1. Überblick

### 1.1 Feature-Beschreibung

Dieses Feature erweitert den Systembrett-Board um zwei neue Entitäten auf der Bodenfläche:

**Boden-Anker (Anchors):**  
Kleine, feste Punkt-Marker auf dem Boden des Bretts. Sie markieren bedeutungsvolle Positionen – z.B. Startpositionen von Figuren, Themenbereiche, Kraftquellen oder Bedeutungsträger im systemischen Konstellationskontext. Ein Anker ist ein kleiner 3D-Marker (Zylinder oder Kegel) mit optionalem Label und wählbarer Farbe. Er sitzt fest im Raum (y=0, nicht verschiebbar durch Teilnehmer), dient als visueller Referenzpunkt.

**Zonen (Zones):**  
Rechteckige oder runde flächige Marker auf dem Boden, mit farbiger Füllung (semi-transparent) und optionalem Beschriftungs-Label. Zonen markieren Themenbereiche, Systemebenen oder Bereiche mit besonderer Bedeutung (z.B. „Ressourcen-Zone", „Konfliktfeld", „Lösungsraum"). Sie liegen als flache Flächen auf dem Boden auf (PlaneGeometry leicht über y=0) und sind ebenfalls admin-only.

### 1.2 Coaching-Nutzen

Im systemischen Coaching nach Bert Hellinger / SySt werden Konstellationen durch Aufstellung von Figuren im Raum sichtbar gemacht. Boden-Anker und Zonen ergänzen dieses Vokabular:

- **Startposition-Marker:** Coach markiert die Ausgangsposition einer Figur vor dem Umstellen – wichtiger Referenzpunkt für die Prozessreflexion.
- **Bedeutungsfelder:** Zonen können Systemebenen visualisieren (Familie, Arbeit, innere Anteile). Figuren werden in Beziehung zu diesen Feldern gesehen.
- **Kraftquellen-Marker:** Einzelne Punkte (Anker) für Ressourcen oder Werte, die räumlich verortet werden sollen, ohne eine eigene Figur zu brauchen.
- **Phasendokumentation:** Admin kann nach dem Aufstellen Zonen und Anker hinzufügen, um die aktuelle Konstellation zu kommentieren und im Snapshot zu sichern.

### 1.3 Admin-Only Constraint

Nur Admins (`ws._session.isAdmin === true`) dürfen Anker und Zonen anlegen oder löschen. Teilnehmer (Leiter, Stellvertreter, Beobachter) sehen die Anker/Zonen, können sie aber nicht verändern. Diese Entscheidung verhindert unbeabsichtigte Board-Manipulationen im laufenden Prozess.

---

## 2. Architectural Decisions

### 2.1 Sentinel-Pattern für Anker und Zonen

Anker und Zonen werden **nicht** als Figuren gespeichert. Sie sind eigene Entitäten. Sie werden als Sentinel-Keys in der `figureMaps`-Map gespeichert – analog zu `__optik__`, `__session_phase__` etc.

**Entscheidung:** Zwei neue Sentinel-Keys:
- `__anchors__`: Speichert ein Array aller Anker (`Anchor[]`)
- `__zones__`: Speichert ein Array aller Zonen (`Zone[]`)

**Begründung:**
- Kein Naming-Konflikt mit Figure-IDs (Figuren-IDs starten nie mit `__`)
- `buildStateFromMutations` kann die neuen Felder `anchors` und `zones` als Top-Level-Felder im State-Objekt ausgeben
- `seedFigureMapFromState` kann sie beim Neuladen aus der DB einfach wiederherstellen
- `persistState` / `schedulePersist` schreibt automatisch mit, ohne weitere Änderungen am DB-Schema

**Alternative erwogen:** Eigene DB-Tabellen `brett_anchors` / `brett_zones`. Verworfen, weil das Brett-Persistenz-System auf dem JSONB-Snapshot in `brett_rooms` basiert. Neue Tabellen würden transaktionale Konsistenz erschweren und die bestehende `persistState`-Infrastruktur umgehen.

### 2.2 Mutations im ADMIN_TYPES-Set

`anchor_create`, `anchor_delete`, `zone_create`, `zone_delete` werden in `ADMIN_TYPES` aufgenommen (wie `figure_type_set`). Dadurch:
- Bypassen sie `canMutate` / `gateMutation`
- Werden explizit via `ws._session.isAdmin` geprüft
- Werden im `handleAdminMessage`-Switch oder einem neuen Handler abgearbeitet

### 2.3 Neue Mutations-Typen

Vier neue Mutations-Typen im `applyMutation`-Switch:
- `anchor_create`: Fügt einen neuen Anker zum `__anchors__`-Array hinzu
- `anchor_delete`: Entfernt einen Anker per ID aus dem Array
- `zone_create`: Fügt eine neue Zone zum `__zones__`-Array hinzu
- `zone_delete`: Entfernt eine Zone per ID aus dem Array

### 2.4 Client-Side 3D-Rendering

Anker und Zonen werden clientseitig in der Three.js-Szene gerendert:

**Anker:** `THREE.CylinderGeometry(0.04, 0.12, 0.18, 8)` (kleiner Kegel/Pyramid) in der angegebenen Farbe, Position `(x, 0, z)`. Plus optionales Label als `THREE.Sprite` mit CanvasTexture.

**Zonen:**
- Rechteckig: `THREE.PlaneGeometry(width, height)` rotiert um X-Achse (-π/2), Position `(x, 0.002, z)`
- Rund: `THREE.CircleGeometry(radius, 32)` rotiert um X-Achse (-π/2), Position `(x, 0.002, z)`
- Material: `THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, side: THREE.DoubleSide })`
- Label als `THREE.Sprite` über der Fläche

### 2.5 Feature Flag

Das gesamte Feature wird unter `window.__brettFeatures['t000468-ground-anchors']` als Dark-Launch geschützt. Client-Side-Rendering und Admin-UI-Buttons werden nur angezeigt, wenn das Flag gesetzt ist. Server-Side-Handler sind immer aktiv (kein Flag-Check auf dem Server).

---

## 3. Data Model / Interface Changes

### 3.1 Neue Typen in `brett/src/types/state.ts`

```typescript
export interface Anchor {
  id: string;       // uuid-artige ID, server-seitig generiert
  x: number;        // Board-X-Koordinate
  z: number;        // Board-Z-Koordinate
  label?: string;   // Optionale Beschriftung
  color?: string;   // CSS-Farbe, z.B. '#c8a96e'
}

export type ZoneShape = 'rect' | 'circle';

export interface Zone {
  id: string;           // uuid-artige ID, server-seitig generiert
  x: number;            // Mittelpunkt X
  z: number;            // Mittelpunkt Z
  shape: ZoneShape;     // 'rect' oder 'circle'
  width?: number;       // Für 'rect' (default 2.0)
  height?: number;      // Für 'rect' (default 2.0)
  radius?: number;      // Für 'circle' (default 1.5)
  label?: string;       // Optionale Beschriftung
  color?: string;       // CSS-Farbe, z.B. '#4ea1ff'
  opacity?: number;     // 0..1, default 0.25
}
```

### 3.2 Neue ClientMessage-Typen in `brett/src/types/messages.ts`

```typescript
| { type: 'anchor_create'; anchor: Omit<Anchor, 'id'> }
| { type: 'anchor_delete'; anchorId: string }
| { type: 'zone_create'; zone: Omit<Zone, 'id'> }
| { type: 'zone_delete'; zoneId: string }
```

### 3.3 Neue ServerMessage-Typen in `brett/src/types/messages.ts`

```typescript
| { type: 'anchor_added'; anchor: Anchor }
| { type: 'anchor_removed'; anchorId: string }
| { type: 'zone_added'; zone: Zone }
| { type: 'zone_removed'; zoneId: string }
```

Außerdem muss der `snapshot`-Typ die neuen Felder tragen:

```typescript
| { type: 'snapshot'; figures: Figure[]; stiffness?: number; locks?: ServerLock[];
    phase?: Phase; sessionCode?: string | null; optik?: OptikSettings;
    participants?: Participant[];
    anchors?: Anchor[];   // NEU
    zones?: Zone[];       // NEU
  }
```

### 3.4 BoardState in `buildStateFromMutations`

`buildStateFromMutations(room)` gibt zusätzlich zurück:
- `anchors: Anchor[]` (aus `__anchors__`-Sentinel, default `[]`)
- `zones: Zone[]` (aus `__zones__`-Sentinel, default `[]`)

### 3.5 DB-Schema

Kein Schema-Change nötig. Die `brett_rooms.state` JSONB-Spalte speichert den `buildStateFromMutations`-Output bereits als JSONB. Anchors und Zones werden automatisch in `state.anchors` und `state.zones` persistiert und beim Neustart via `seedFigureMapFromState` wieder eingelesen.

---

## 4. Implementation Strategy

### 4.1 Server-Side: Mutations

Die `applyMutation`-Funktion in `brett/src/server/figures.ts` erhält vier neue Cases:

```typescript
case 'anchor_create': {
  const existing = figs.get('__anchors__')?.anchors ?? [];
  const newAnchor: Anchor = { ...msg.anchor, id: msg.anchor.id ?? generateId() };
  figs.set('__anchors__', { id: '__anchors__', anchors: [...existing, newAnchor] });
  break;
}
case 'anchor_delete': {
  const existing = figs.get('__anchors__')?.anchors ?? [];
  figs.set('__anchors__', { id: '__anchors__', anchors: existing.filter((a: Anchor) => a.id !== msg.anchorId) });
  break;
}
case 'zone_create': {
  const existing = figs.get('__zones__')?.zones ?? [];
  const newZone: Zone = { ...msg.zone, id: msg.zone.id ?? generateId() };
  figs.set('__zones__', { id: '__zones__', zones: [...existing, newZone] });
  break;
}
case 'zone_delete': {
  const existing = figs.get('__zones__')?.zones ?? [];
  figs.set('__zones__', { id: '__zones__', zones: existing.filter((z: Zone) => z.id !== msg.zoneId) });
  break;
}
```

Eine kleine `generateId()`-Hilfsfunktion (12 alphanumerische Zeichen) wird in `figures.ts` lokal definiert.

### 4.2 Server-Side: buildStateFromMutations

In der Funktion `buildStateFromMutations` in `brett/src/server/index.ts` (oder dort, wo sie definiert ist):

```typescript
anchors: figs.get('__anchors__')?.anchors ?? [],
zones: figs.get('__zones__')?.zones ?? [],
```

### 4.3 Server-Side: seedFigureMapFromState

In `seedFigureMapFromState`:

```typescript
if (state.anchors && Array.isArray(state.anchors)) {
  map.set('__anchors__', { id: '__anchors__', anchors: state.anchors });
}
if (state.zones && Array.isArray(state.zones)) {
  map.set('__zones__', { id: '__zones__', zones: state.zones });
}
```

### 4.4 Server-Side: WS-Handler

In `handleAdminMessage` (oder einem neuen Handler `handleAdminAnchorZoneMessage`) werden die vier neuen Admin-Mutations verarbeitet:

```typescript
case 'anchor_create': {
  if (!validateAnchorInput(msg.anchor)) {
    ws.send(JSON.stringify({ type: 'error', reason: 'invalid_anchor' }));
    return;
  }
  const id = generateAnchorId();
  deps.applyMutation(room, { type: 'anchor_create', anchor: { ...msg.anchor, id } });
  deps.broadcast(room, { type: 'anchor_added', anchor: { ...msg.anchor, id } });
  deps.schedulePersist(room);
  break;
}
// analog für anchor_delete, zone_create, zone_delete
```

Wichtig: Die vier neuen Typen werden zu `ADMIN_TYPES` hinzugefügt.

### 4.5 Client-Side: State

In `brett/src/client/state.ts` werden zwei neue Kollektionen hinzugefügt:

```typescript
export const anchorMeshes = new Map<string, THREE.Object3D>();
export const zoneMeshes = new Map<string, THREE.Object3D>();
```

### 4.6 Client-Side: WS-Client-Handling

In `ws-client.ts` werden die neuen ServerMessage-Typen im `switch` auf `msg.type` behandelt:

```typescript
case 'anchor_added': applyAnchorAdded(msg.anchor); break;
case 'anchor_removed': applyAnchorRemoved(msg.anchorId); break;
case 'zone_added': applyZoneAdded(msg.zone); break;
case 'zone_removed': applyZoneRemoved(msg.zoneId); break;
```

Diese Funktionen werden in einem neuen Modul `brett/src/client/ground-objects.ts` definiert.

### 4.7 Client-Side: 3D-Rendering

Das Modul `brett/src/client/ground-objects.ts` enthält:

- `applyAnchorAdded(anchor: Anchor)`: Erzeugt einen CylinderGeometry-Mesh + Label-Sprite, fügt ihn zur Szene hinzu, speichert in `anchorMeshes`
- `applyAnchorRemoved(anchorId: string)`: Entfernt Mesh aus Szene, disposed Materialien, löscht aus `anchorMeshes`
- `applyZoneAdded(zone: Zone)`: Erzeugt PlaneGeometry/CircleGeometry-Mesh + Label-Sprite, fügt zur Szene hinzu, speichert in `zoneMeshes`
- `applyZoneRemoved(zoneId: string)`: Entfernt Mesh, disposed, löscht aus `zoneMeshes`
- `initGroundObjectsFromSnapshot(anchors: Anchor[], zones: Zone[])`: Beim Join-Snapshot alle vorhandenen Anker und Zonen rendern

### 4.8 Client-Side: Snapshot-Integration

Im `snapshot`-Handler in `ws-client.ts`:

```typescript
case 'snapshot': {
  // ... bestehende Logik ...
  if (window.__brettFeatures?.['t000468-ground-anchors']) {
    initGroundObjectsFromSnapshot(msg.anchors ?? [], msg.zones ?? []);
  }
  break;
}
```

### 4.9 Client-Side: Admin-UI

In `brett/src/client/ui/hud.ts` oder einem neuen Modul `brett/src/client/ui/anchor-zone-panel.ts`:

- Kleine Admin-Toolbar (nur sichtbar wenn `isAdmin && window.__brettFeatures['t000468-ground-anchors']`)
- "Anker setzen" Button: Aktiviert einen Placement-Mode (Klick auf Boden = Anker an dieser Position)
- "Zone zeichnen" Button: Aktiviert Zone-Placement (Klick auf Boden = Zone, Dialog für Shape/Größe/Farbe/Label)
- Klick auf bestehenden Anker/Zone: Popup mit "Löschen"-Button

### 4.10 Snapshot-Broadcast beim Join

Der Join-Snapshot (in `ws-handler.ts`) muss `anchors` und `zones` einschließen:

```typescript
const state = deps.buildStateFromMutations(room);
ws.send(JSON.stringify({
  type: 'snapshot',
  figures: [...],
  // ... bestehende Felder ...
  anchors: state.anchors ?? [],   // NEU
  zones: state.zones ?? [],       // NEU
}));
```

---

## 5. Tests

### 5.1 Server-Tests

**`brett/test/anchor-zone.test.ts`** (neu):
- `applyMutation anchor_create`: Anker wird korrekt angelegt (ID vorhanden, Felder korrekt)
- `applyMutation anchor_delete`: Anker wird entfernt, andere bleiben unberührt
- `applyMutation zone_create`: Zone wird korrekt angelegt
- `applyMutation zone_delete`: Zone wird entfernt
- `buildStateFromMutations`: `anchors` und `zones` im State-Objekt vorhanden
- `seedFigureMapFromState round-trip`: Anker und Zonen überleben persist → seed → build
- Permissions: Nicht-Admin wird abgewiesen (ADMIN_TYPES-Guard)

### 5.2 Messages-Exhaustiveness

In `brett/test/messages.test.ts`: Die neuen ClientMessage- und ServerMessage-Typen werden in den Exhaustiveness-Tests berücksichtigt.

### 5.3 Permissions-Tests

In `brett/test/permissions.test.ts`: anchor_create/delete und zone_create/delete tauchen NICHT in MutationType auf (sind ADMIN_TYPES, bypassen canMutate).

---

## 6. Abgrenzung (Out of Scope für diesen Slice)

- Keine Figuren-Snapshots auf Anker-Positionen (snap-to-anchor)
- Keine Anker/Zonen-Templates
- Keine Anker/Zonen-Bearbeitung (nur create + delete)
- Kein Export von Anker/Zonen-Positionen
- Kein Drag-and-Drop zum Verschieben von Ankern/Zonen nach dem Setzen
- Kein Undo/Redo
