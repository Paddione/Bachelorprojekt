---
title: "Brett: Notizen & Statements pro Figur (Slice 5)"
ticket_id: T000469
domains: [website]
status: active
pr_number: null
---

# Design: Brett: Notizen & Statements pro Figur (Slice 5)

**Ticket:** T000469
**Branch (vorgesehen):** feature/brett-figure-notes

---

## Überblick

### Feature-Beschreibung

Das Systembrett dient als Werkzeug in Einzel- und Gruppencoachings, bei dem Figuren systemische Rollen repräsentieren. Bisher können Figuren lediglich durch Label, Farbe und Aussehen unterschieden werden — eine direkte Möglichkeit, Aussagen, Statements oder Notizen direkt an einer Figur zu verankern, fehlt.

Slice 5 führt ein **figurbezogenes Notizfeld** ein: Klick auf eine Figur öffnet ein Side-Panel (`fig-panel.ts`), das den Namen der Figur anzeigt und ein editierbares Textfeld für Notizen/Statements bereitstellt ("Was spricht diese Figur? Was sieht sie?"). Die Notiz wird im Serverzustand persistiert (neues Feld `note?: string` im `Figure`-Interface), über die WS-Mutation `figure_note_set` synchronisiert und ist für alle Teilnehmer live sichtbar.

Optional: Billboard-Anzeige einer gekürzten Notiz als 3D-Sprite über der Figur (analog zum Lock-Badge in `hud.ts`), gesteuert über einen Feature-Flag `sf-t000469`.

### Coaching-Nutzen

- **Systemische Arbeit:** Der Coach (oder repräsentierende Teilnehmer) kann die innere Perspektive einer Figur ("Von hier sehe ich...") direkt notieren.
- **Nachverfolgbarkeit:** Notizen bleiben im Server-Zustand erhalten und überstehen Re-Joins, Reconnects und Browser-Refreshes.
- **Co-Präsenz:** Alle Teilnehmer sehen Notizen in Echtzeit — keine Medienbrüche für Protokollierung.
- **Billboard-Visualisierung:** Ein kurzer Auszug der Notiz erscheint als 3D-Text-Sprite über der Figur und macht den Zustand im Systemblick unmittelbar sichtbar.

---

## Architectural Decision

### Option A: Notiz als Teil von `Figure.note` (gewählt)

Notizen werden direkt in das bestehende `Figure`-Interface als optionales `note?: string`-Feld aufgenommen. Die Mutation `figure_note_set { figureId, note }` schreibt dieses Feld server-autoritativ via `applyMutation`. Die `buildStateFromMutations`-Pipeline exportiert `note` als Teil jedes Figure-Objekts — kein neuer Sentinel nötig.

**Vorteile:**
- Nutzt die vorhandene Persistence-Pipeline ohne neue DB-Felder oder Sentinels.
- Notiz reist automatisch in jedem `snapshot` mit (als Teil des Figure-Arrays).
- Passt in das bestehende `seedFigureMapFromState`-Muster (Figuren werden als Objekte re-hydriert, `note` ist ein einfaches String-Feld).
- `update`-Mutation könnte prinzipiell Notizen mitführen — wir verwenden aber eine eigene Mutation für Granularität und Perms-Gating.

**Nachteile:**
- Notizen landen in jedem Snapshot-Frame (geringe Mehrbelastung bei großen Boards — vertretbar für max. 200 Figuren).

### Option B: Separater `__notes__`-Sentinel (verworfen)

Ein neuer Sentinel `Map<figureId, note>` analog zu `__roles__` würde Notizen vom Figure-Array trennen. Dieser Ansatz erzeugt unnötige Komplexität: zwei neue Felder in `buildStateFromMutations`, ein neues Seed-Case in `seedFigureMapFromState`, potentielle Inkonsistenz wenn Figuren gelöscht werden (orphane Notizen im Sentinel).

### Permissions-Entscheidung

`figure_note_set` wird als **nicht-RELAY, nicht-ADMIN**-Nachricht behandelt — analog zu `figure_possess`/`figure_release`. Es gibt eine eigene Handler-Logik im ws-handler:

- **leiter:** immer erlaubt (jede Figur).
- **stellvertreter:** nur wenn `figureOwnerId === playerId` (besitzt die Figur) — analog zur ownership-gated Move/Update-Logik.
- **beobachter:** verweigert (read-only).
- **Free-Board (kein Session-Code, keine Rollen):** REG-1-Bypass — erlaubt, genau wie alle anderen Mutationen.

Hierfür wird `MutationType` um `'figure_note_set'` erweitert und `canMutate` entsprechend ergänzt.

### Billboard-Feature-Flag

Die 3D-Billboard-Anzeige der Notiz wird hinter `window.__brettFeatures['sf-t000469']` gated, genau wie `setCameraToOrbit` hinter `sf-t000465`. Der Flag defaultet OFF (dark-launch). Das Panel-UI ist IMMER aktiv (kein Flag), nur die 3D-Visualisierung ist hinter dem Flag.

---

## Data Model / Interface Changes

### `brett/src/types/state.ts` — Figure Interface

```typescript
export interface Figure {
  // ... existing fields ...
  /**
   * Freitext-Notiz zur Figur (Aussagen, Perspektiven, Statements).
   * Gesetzt via figure_note_set (server-authoritative, via applyMutation).
   * Persistiert als Teil des Figure-Objekts im figureMaps.
   */
  note?: string;
}
```

### `brett/src/types/messages.ts` — Message Types

**ClientMessage:**
```typescript
| { type: 'figure_note_set'; figureId: string; note: string }
```

**ServerMessage:**
```typescript
| { type: 'figure_note_changed'; figureId: string; note: string }
```

**MutationType** (permissions.ts):
```typescript
export type MutationType =
  | 'add' | 'move' | 'update' | 'jump' | 'delete'
  | 'clear' | 'stiffness' | 'snapshot' | 'request_state_snapshot'
  | 'figure_lock' | 'figure_possess' | 'figure_release'
  | 'figure_note_set';  // NEU
```

### Server `applyMutation` — neuer Case

```typescript
case 'figure_note_set': {
  if (typeof msg.figureId === 'string' && figs.has(msg.figureId)) {
    const note = typeof msg.note === 'string' ? msg.note.slice(0, 1000) : '';
    figs.set(msg.figureId, { ...figs.get(msg.figureId), note });
  }
  break;
}
```

Notiz wird auf 1000 Zeichen beschränkt (serverseitige Validierung), um Missbrauch und Bloat zu verhindern.

### Kein neuer DB-Sentinel erforderlich

`note` reist als Teil des Figure-Objekts in `buildStateFromMutations → figures[]`, wird mit `persistState` in `brett_rooms.state` (JSONB) gespeichert und durch `seedFigureMapFromState` beim nächsten Join wiederhergestellt — **null Änderungen an der DB-Schicht nötig**.

---

## Implementation Strategy

### Server-Side (Meilenstein 1)

1. **types/state.ts:** `note?: string` zu `Figure` hinzufügen.
2. **types/messages.ts:** `figure_note_set` zu `ClientMessage` und `figure_note_changed` zu `ServerMessage` hinzufügen.
3. **server/permissions.ts:** `'figure_note_set'` zu `MutationType` hinzufügen; `canMutate` um den neuen Typ erweitern (leiter: immer; stellvertreter: ownerId-gated; beobachter: false).
4. **server/figures.ts:** `applyMutation`-Case für `figure_note_set` hinzufügen (note slicen auf 1000 chars).
5. **server/ws-handler.ts:** Eigenen Handler-Block für `figure_note_set` (analog zum `figure_possess`-Block), inkl. `gateMutation`-Check, `applyMutation`, `broadcast(figure_note_changed)`, `schedulePersist`.

### Client-Side Panel (Meilenstein 2)

1. **client/ui/fig-panel.ts:** `syncPanelToSelection` erweitern — neues DOM-Element `#fig-note-textarea` befüllen. Neuen Input-Handler für `fig-note-textarea` → `sendClient({ type: 'figure_note_set', figureId, note })`.
2. **public/index.html:** DOM-Elemente für das Notizfeld in `#fig-panel` einfügen (Label + `<textarea id="fig-note-textarea">`), CSS-Styles.
3. **client/ws-client.ts:** `onWsMessage`-Switch um `figure_note_changed` erweitern — lokal `fig.note` aktualisieren, Panel-Textarea aktualisieren falls Figur gerade selektiert.

### 3D Billboard (Meilenstein 3, Feature-Flag `sf-t000469`)

1. **client/ui/hud.ts:** `noteSprites: Map<string, THREE.Sprite>` analog zu `lockSprites`. Funktion `setFigureNoteBillboard(figureId, note)`: Canvas 256×80, Notentext auf 40 Zeichen kürzen, Sprite über Figur. `clearFigureNoteBillboard(figureId)` für Cleanup.
2. **client/state.ts:** `noteSprites` Map exportieren.
3. **client/ws-client.ts:** Bei `figure_note_changed` und in der `snapshot`-Verarbeitung die Billboard-Funktionen aufrufen (Feature-Flag geprüft).
4. **fig-panel.ts:** Bei Panel-Änderungen lokale Billboard-Aktualisierung anstoßen (optimistic update).

### Tests (Meilenstein 4)

1. **test/figure-note.test.ts:** Server-seitige Tests mit Node.js `node:test`:
   - `applyMutation figure_note_set`: Notiz wird gesetzt, auf 1000 Zeichen gekürzt, fehlendes figureId no-op.
   - `permissions figure_note_set`: leiter true; stellvertreter owned true / foreign false; beobachter false.
   - `buildStateFromMutations`: note überlebt den figures-Array-Export.
   - `seedFigureMapFromState`: note wird korrekt re-hydriert.
   - WS-Handler-Integration (Mock-Setup): `figure_note_set` → `figure_note_changed`-Broadcast.
2. **test/messages.test.ts:** Prüfen dass `figure_note_set` und `figure_note_changed` in den ClientMessageType/ServerMessageType-Unions enthalten sind.

### Rollout-Reihenfolge

1. Merge server-side (Typen + Perms + applyMutation + WS-Handler) — rückwärtskompatibel, da `note` optional ist.
2. Merge client-side Panel-UI — Clients ohne Reload ignorieren `figure_note_changed` (Switch default).
3. Billboard hinter Feature-Flag — Deploy separat, Flag in DB setzen wenn bereit.

---

## Edge Cases & Guards

- **Länge:** Server kürzt auf 1000 Zeichen. Client-`maxlength="1000"` im `<textarea>`.
- **Löschen einer Notiz:** `note: ''` (leerer String) ist gültig — setzt die Notiz zurück. Server speichert `''` als leeren String, Client-Panel zeigt leeres Textfeld.
- **Figur gelöscht:** `applyMutation('delete')` entfernt die Figur aus `figureMaps` — die Notiz verschwindet automatisch. Das Billboard wird durch `clearFigureNoteBillboard` in der `delete`-Verarbeitung des Clients bereinigt.
- **REG-1 Free-Board:** Ohne Session-Code und ohne Rollen gilt der Legacy-Bypass — jeder kann Notizen setzen. Dieses Verhalten ist konsistent mit allen anderen Mutationen.
- **Rollback-Sicherheit:** `note?: string` ist optional im `Figure`-Interface — alte persistierte Zustände ohne `note`-Feld funktionieren unverändert (`note` ist dann `undefined`).
- **Billboard-Text:** Kurze Vorschau: erste 40 Zeichen + `…` falls länger. Zeilenumbrüche im Billboard ignorieren (Canvas füllt erste Zeile).
- **Encoding:** `msg.note.slice(0, 1000)` ist sicher für Unicode (JavaScript-String-Indices).
