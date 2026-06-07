---
title: "Brett: Beziehungs-/Spannungslinien (Slice 4)"
ticket_id: T000467
domains: [website]
status: active
pr_number: null
---

# Design: Brett — Beziehungs-/Spannungslinien (Slice 4)

**Ticket:** T000467
**Branch (vorgesehen):** feature/brett-relationship-lines

---

## 1. Überblick

### Feature-Beschreibung

Dieses Slice erweitert das Brett um persistente, bidirektionale **Linien** zwischen je zwei Figuren. Linien visualisieren systemische Beziehungen und Dynamiken, die in der Aufstellungsarbeit zwischen Personen oder Elementen bestehen. Drei Linientypen werden unterschieden:

| Typ | Farbe | Strichart | Bedeutung |
|-----|-------|-----------|-----------|
| `relationship` | Blau (#4ea1ff) | Solid | Neutraler Bezug, Bindung, Beziehung |
| `tension` | Rot (#e05555) | Dashed (gestrichelt) | Konflikt, Spannung, Abgrenzung |
| `resource` | Grün (#55bb77) | Solid | Unterstützung, Ressource, Hilfe |

### Coaching-Nutzen

In systemischen Aufstellungen fehlt bislang die Möglichkeit, Beziehungsqualitäten sichtbar zu machen, ohne Figuren zu verschieben. Mit Linien kann der Leiter:
- Konflikte zwischen Subgruppen markieren (rot)
- Ressourcenflüsse kennzeichnen (grün)
- Generelle Beziehungsachsen visualisieren (blau)

Linien sind rein informativ — sie erzeugen keine physikalischen Constraints und beeinflussen die Figurenbewegung nicht.

---

## 2. Architectural Decisions

### A1 — Linien als eigenständige Entität (nicht Figure-Attribute)

**Entscheidung:** Linien werden als separate `Line`-Entität verwaltet, nicht als `figure.relations[]` auf einer Figur.

**Begründung:**
- Linien existieren zwischen zwei Figuren — keiner der beiden Figuren zu "gehören" vermeidet Konsistenzprobleme beim Löschen.
- Eigene IDs erlauben `line_delete` ohne die Figuren anzufassen.
- `line_type_set` kann gezielt auf eine Linie wirken, ohne Figure-Updates zu broadcasten.
- Die Sentinel-Architektur des figureMaps (`__lines__` Schlüssel) passt sauber ins bestehende Muster.

### A2 — Sentinel-Key `__lines__` im figureMap

**Entscheidung:** Alle Linien werden als einzelner Sentinel `__lines__` gespeichert, der eine `Record<string, BrettLine>` Map enthält. Dies folgt dem Muster von `__roles__`, `__lobby_settings__` etc.

**Begründung:** Vermeidet `figureMaps.get(room).forEach` Filter-Logik; ein einziger `.get('__lines__')` reicht für Snapshot/Persistence. Die DB-Persistenz via `brett_rooms.state` (JSONB) bleibt unverändert.

### A3 — Linien sind ADMIN_TYPES (leiter- und admin-exklusiv)

**Entscheidung:** `line_create`, `line_delete`, `line_type_set` werden in `ADMIN_TYPES` aufgenommen und zusätzlich per Rolle auf `leiter` eingeschränkt.

**Begründung:** Spannungslinien sind analytische Annotationen des Leiters, keine Teilnehmeraktionen. Stellvertreter und Beobachter sollen keine Linien anlegen oder löschen können. Die `isAdmin`-Gate in ADMIN_TYPES schützt gegen XSS/anonyme Clients; innerhalb einer Session wird zusätzlich die `leiter`-Rolle geprüft.

Konkret: Die drei neuen Nachrichten kommen in `ADMIN_TYPES`; der Handler prüft zusätzlich `resolveRole(ws, roles) === 'leiter'` (oder entfernt die isAdmin-Bindung zugunsten eines Role-Checks — letzterer ist sauberer für nicht-OIDC-Boards). Da bestehende Tests `isAdmin` für ADMIN_TYPES voraussetzen, bleiben die Nachrichten in ADMIN_TYPES, und der Handler prüft **zusätzlich** die Rolle.

### A4 — 3D-Darstellung via CatmullRomCurve3 + LineSegments

**Entscheidung:** Linien werden mit `THREE.CatmullRomCurve3` als Kurve durch drei Punkte geführt (Startfigur → Mittelpunkt bei Y=0.5 → Endfigur), dargestellt mit `THREE.Line` (solid) bzw. manuell gebauten Segmenten (dashed). Die Linie wird bei jedem Frame-Update an die aktuelle Figurenposition angepasst.

**Begründung:**
- `CatmullRomCurve3` erzeugt eine leicht geschwungene Linie, die optisch vom Boden abhebt.
- `THREE.Line` ist hochperformant (kein Raycast-Overhead).
- Für Dashes simulieren wir Segment-Abstände manuell (THREE.js `LineDashedMaterial` benötigt `computeLineDistances()` bei jeder Positionsänderung — das ist teurer als ein manuelles Segment-Array bei wenigen Linien).
- Alternativ: `THREE.LineDashedMaterial` mit `computeLineDistances()` im Frame-Loop — einfacher Code, akzeptabler Performance-Overhead bei <= 50 Linien.

### A5 — Feature Flag `sf-t000467`

**Entscheidung:** Das gesamte Linien-Feature wird hinter dem Feature Flag `window.__brettFeatures['sf-t000467']` versteckt. Dark Launch: alles Ship-ready, aber erst aktiv wenn der DB-Eintrag gesetzt ist.

### A6 — Keine Linienpersistenz im Snapshot-Format (nur Sentinel)

**Entscheidung:** Der Join-Snapshot sendet Linien als zusätzliches Feld `lines?: BrettLine[]` im `snapshot` ServerMessage. Die Linien werden beim Client aus `STATE.lines` verwaltet, analog zu `STATE.figures`.

---

## 3. Data Model

### 3.1 Neue Typen in `brett/src/types/state.ts`

```typescript
export type LineType = 'relationship' | 'tension' | 'resource';

export interface BrettLine {
  id: string;            // nanoid(8) — server-generated
  fromId: string;        // figureId of source figure
  toId: string;          // figureId of target figure
  lineType: LineType;    // visual style
  createdBy?: string;    // playerId des Erstellers (optional, für Anzeige)
}
```

### 3.2 Neue ClientMessage-Typen in `brett/src/types/messages.ts`

```typescript
| { type: 'line_create'; fromId: string; toId: string; lineType: LineType }
| { type: 'line_delete'; lineId: string }
| { type: 'line_type_set'; lineId: string; lineType: LineType }
```

### 3.3 Neue ServerMessage-Typen in `brett/src/types/messages.ts`

```typescript
| { type: 'line_created'; line: BrettLine }
| { type: 'line_deleted'; lineId: string }
| { type: 'line_type_changed'; lineId: string; lineType: LineType }
```

Außerdem: `snapshot` bekommt ein optionales Feld `lines?: BrettLine[]`.

### 3.4 Sentinel im figureMap

Schlüssel: `__lines__`

Wert-Shape: `{ id: '__lines__', lines: Record<string, BrettLine> }`

Beispiel nach `line_create`:
```json
{
  "id": "__lines__",
  "lines": {
    "abc12345": { "id": "abc12345", "fromId": "fig-1", "toId": "fig-2", "lineType": "tension" }
  }
}
```

### 3.5 buildStateFromMutations — neues Feld `lines`

`buildStateFromMutations` gibt neu `lines: BrettLine[]` zurück (Array, leer wenn keine Linien).

### 3.6 seedFigureMapFromState — Round-Trip

`seedFigureMapFromState` liest `state.lines` (Array) und befüllt den `__lines__` Sentinel.

### 3.7 DB-Schema

Kein Schema-Change. Linien werden im bestehenden `brett_rooms.state JSONB` als Teil des `buildStateFromMutations`-Ergebnisses persistiert. Das Feld `lines` wird einfach mit serialisiert.

---

## 4. Implementation Strategy

### 4.1 Server-Side

#### 4.1.1 applyMutation — drei neue Cases

```typescript
case 'line_create': {
  const lines = ensureLines(figs);
  if (msg.id && msg.fromId && msg.toId && msg.lineType) {
    lines[msg.id] = { id: msg.id, fromId: msg.fromId, toId: msg.toId, lineType: msg.lineType, createdBy: msg.createdBy };
    figs.set('__lines__', { id: '__lines__', lines });
  }
  break;
}
case 'line_delete': {
  const lines = ensureLines(figs);
  delete lines[msg.lineId];
  figs.set('__lines__', { id: '__lines__', lines });
  break;
}
case 'line_type_set': {
  const lines = ensureLines(figs);
  if (lines[msg.lineId]) {
    lines[msg.lineId] = { ...lines[msg.lineId], lineType: msg.lineType };
    figs.set('__lines__', { id: '__lines__', lines });
  }
  break;
}
```

Helper: `function ensureLines(figs: Map<string, any>): Record<string, BrettLine> { return { ...(figs.get('__lines__')?.lines ?? {}) }; }`

#### 4.1.2 ws-handler — neue ADMIN_TYPES + Handler

Die drei Nachrichten kommen in `ADMIN_TYPES`. Im `handleAdminMessage` switch werden sie behandelt:

```typescript
case 'line_create': {
  const role = deps.resolveRole(ws, state.roles || {});
  if (role !== 'leiter') { ws.send(error('forbidden')); return; }
  // Validate: fromId + toId müssen existierende Figuren sein
  const figMap = deps.figureMaps.get(adminRoom);
  if (!figMap?.has(msg.fromId) || !figMap?.has(msg.toId)) { ws.send(error('invalid-figure')); return; }
  const lineId = nanoid(8);
  const createdBy = resolvePlayerId(ws);
  deps.applyMutation(adminRoom, { type: 'line_create', id: lineId, fromId: msg.fromId, toId: msg.toId, lineType: msg.lineType ?? 'relationship', createdBy });
  const newLine: BrettLine = { id: lineId, fromId: msg.fromId, toId: msg.toId, lineType: msg.lineType ?? 'relationship', createdBy };
  deps.broadcast(adminRoom, { type: 'line_created', line: newLine });
  deps.schedulePersist(adminRoom);
  break;
}
```

Analog für `line_delete` und `line_type_set`.

#### 4.1.3 Join-Snapshot

Im `join`-Handler wird `freshState.lines` (aus `buildStateFromMutations`) in den Snapshot-Payload aufgenommen.

#### 4.1.4 Validierung

- `fromId !== toId` (keine Selbst-Linien)
- Beide Figuren müssen im figureMap des Rooms existieren
- `lineType` muss gültig sein: `'relationship' | 'tension' | 'resource'`
- Max-Linien-Cap: 100 pro Room (verhindert Spam)

### 4.2 Client-Side

#### 4.2.1 STATE erweitern

`STATE.lines: BrettLine[]` — analog zu `STATE.figures`.

#### 4.2.2 ws-client.ts — drei neue Server-Message-Handler

```typescript
case 'line_created': {
  if (!feats['sf-t000467']) break;
  STATE.lines.push(msg.line);
  renderLine(msg.line);
  break;
}
case 'line_deleted': {
  if (!feats['sf-t000467']) break;
  const idx = STATE.lines.findIndex(l => l.id === msg.lineId);
  if (idx !== -1) STATE.lines.splice(idx, 1);
  removeLineFromScene(msg.lineId);
  break;
}
case 'line_type_changed': {
  if (!feats['sf-t000467']) break;
  const l = STATE.lines.find(l => l.id === msg.lineId);
  if (l) { l.lineType = msg.lineType; rerenderLine(msg.lineId); }
  break;
}
```

Im `snapshot`-Handler: alle vorhandenen Linien entfernen und neu aus `msg.lines` aufbauen.

#### 4.2.3 3D-Rendering (client/scene-lines.ts — neue Datei)

```typescript
export function renderLine(line: BrettLine): void {
  const fromFig = STATE.figures.find(f => f.id === line.fromId);
  const toFig = STATE.figures.find(f => f.id === line.toId);
  if (!fromFig || !toFig) return;

  const from = new THREE.Vector3(fromFig.root.position.x, 0.5, fromFig.root.position.z);
  const to = new THREE.Vector3(toFig.root.position.x, 0.5, toFig.root.position.z);
  const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 0.3, 0));

  const curve = new THREE.CatmullRomCurve3([from, mid, to]);
  const points = curve.getPoints(50);
  const geometry = new THREE.BufferGeometry().setFromPoints(points);

  let material: THREE.LineBasicMaterial | THREE.LineDashedMaterial;
  if (line.lineType === 'tension') {
    material = new THREE.LineDashedMaterial({ color: LINE_COLORS[line.lineType], dashSize: 0.15, gapSize: 0.1 });
  } else {
    material = new THREE.LineBasicMaterial({ color: LINE_COLORS[line.lineType] });
  }

  const mesh = new THREE.Line(geometry, material);
  if (line.lineType === 'tension') mesh.computeLineDistances();
  getScene().scene.add(mesh);
  lineObjects.set(line.id, mesh);
}
```

Frame-Loop Update: `updateLinePositions()` wird im Render-Loop von `main.ts` aufgerufen, aktualisiert die Buffer-Geometrien wenn sich Figuren bewegt haben (dirty-check über lastPos Map).

Farbkonstanten:
```typescript
export const LINE_COLORS: Record<LineType, number> = {
  relationship: 0x4ea1ff,  // Blau
  tension:      0xe05555,  // Rot
  resource:     0x55bb77,  // Grün
};
```

#### 4.2.4 UI — Linien-Panel in hud.ts

Hinter Feature-Flag: Ein einfaches HTML-Panel (Button-Gruppe) zum Anlegen von Linien. Workflow:
1. Leiter wählt eine Figur aus (selektiert via `STATE.selectedId`)
2. Klickt auf "Linie anlegen" Button
3. Mauszeiger wechselt in "Verbindungsmodus" (Cursor + Pill-Anzeige)
4. Leiter klickt auf zweite Figur
5. Liniendialog: Typ auswählen (relationship / tension / resource)
6. `send({ type: 'line_create', fromId, toId, lineType })` wird ausgeführt

Lösch-Workflow: Linie anklicken (Raycast im render loop) → Delete-Button im Panel.

### 4.3 Tests

#### 4.3.1 Unit-Tests: `brett/test/lines.test.ts`

Neue Testdatei nach dem Muster von `permissions.test.ts`:
- `applyMutation line_create` → Linie in `__lines__` Sentinel
- `applyMutation line_delete` → Linie entfernt
- `applyMutation line_type_set` → Typ geändert
- `buildStateFromMutations` enthält `lines: BrettLine[]`
- `seedFigureMapFromState` rehydriert Linien korrekt (Round-Trip)
- Validierungen: Selbst-Linie abgelehnt, ungültige Figur abgelehnt
- Cap: mehr als 100 Linien werden nicht gespeichert

#### 4.3.2 Erweiterung `messages.test.ts`

Die drei neuen ClientMessage-Typen und drei neuen ServerMessage-Typen müssen in den Exhaustiveness-Routers und `HANDLED_SERVER_TYPES` aufgenommen werden.

#### 4.3.3 Erweiterung `relay-gate.test.ts`

Neue Tests:
- `line_create` von `leiter` → allowed
- `line_create` von `beobachter` → forbidden (via isAdmin-Gate)
- `line_delete` von `leiter` → allowed

### 4.4 Dependency Injection

Da `ws-admin-commands.ts` `nanoid` verwenden soll, muss es entweder importiert oder via dep injected werden. Einfachster Weg: direkter `import { nanoid } from 'nanoid'` (bereits als Dependency im Brett-Projekt vorhanden oder über `crypto.randomUUID().slice(0,8)` ohne externe Dep).

---

## 5. Security & Invariants

| Invariante | Wo erzwungen |
|-----------|-------------|
| Nur `leiter` darf Linien anlegen/löschen | ws-handler: Role-Check nach isAdmin-Gate |
| Keine Selbst-Linien (`fromId === toId`) | ws-handler: Validierung vor applyMutation |
| Beide Figuren müssen existieren | ws-handler: figureMap.has() Check |
| Wenn eine Figur gelöscht wird (`delete`), werden ihre Linien gelöscht | applyMutation `delete` case: Linien-Cleanup |
| Max 100 Linien pro Room | ws-handler: Cap-Check vor applyMutation |
| Feature Flag schützt Client-Rendering | ws-client + scene-lines: Flag-Check |

---

## 6. Open Questions / Deferred

- **Linie-Klick Raycast**: THREE.js Line-Raycast ist ungenau ohne `THREE.Line2` (fat lines). Für Slice 4 ist ein "Linie anklicken zum Löschen" optional; Löschen über Panel-Button mit Auswahl-Dropdown ist ausreichend.
- **Animations-Interpolation**: Wenn eine Figur bewegt wird, aktualisiert sich die Linie frame-by-frame. Für sanfte Übergänge könnte die Linie den Position-Lerp der Figur spiegeln — deferred to Slice 5.
- **Linien im Template**: Beim Anwenden eines Templates (`admin_set_template`) werden bestehende Linien gecleared (keine Linien in Templates). Spätere Erweiterung möglich.
