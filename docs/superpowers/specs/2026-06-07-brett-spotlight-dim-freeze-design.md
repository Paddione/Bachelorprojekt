---
title: "Brett: Spotlight/Dim/Freeze (Slice 2)"
ticket_id: T000471
domains: [website]
status: active
pr_number: null
---

# Design: Brett: Spotlight/Dim/Freeze (Slice 2)

**Ticket:** T000471
**Branch (vorgesehen):** feature/brett-spotlight-dim-freeze

---

## Ueberblick

### Feature-Beschreibung

Spotlight/Dim/Freeze sind Admin-Moderationswerkzeuge fuer das Systembrett. Sie ermoeglichen dem Leiter (Admin), waehrend einer Coaching-Session gezielt die Aufmerksamkeit aller Teilnehmer zu steuern:

- **Spotlight** (`admin_spotlight_set`): Eine einzelne Figur wird hervorgehoben — alle anderen erscheinen abgedunkelt/ausgegraut. Sichtbar fuer alle Session-Teilnehmer global.
- **Dim** (`admin_dim_set`): Alle Figuren ausser einer werden abgetoent. Semantisch aehnlich wie Spotlight, aber mit umgekehrter Prioritaet (die "ausgeschlossene" Figur ist das Zentrum).
- **Freeze** (`admin_freeze_set`): Alle Figurbewegungen werden eingefroren — Figuren koennen von Teilnehmern nicht mehr bewegt werden. Ein visueller Indikator (blaue Toenung + Eis-Sprite uber der Figur) signalisiert den Freeze-Zustand.

### Coaching-Nutzen

In systemischen Konstellationen ist es entscheidend, dass der Leiter die kollektive Aufmerksamkeit lenken kann:

- **Spotlight** ermoeglicht "Jetzt sprechen wir ueber diese Figur" — alle anderen treten optisch in den Hintergrund.
- **Dim** ist dasselbe Konzept aus der Gegenrichtung — "alles ausser X ist gerade nicht relevant".
- **Freeze** gibt dem Leiter Kontrolle ueber die Bewegungsfreiheit — nuetzlich in strukturierten Reflexionsphasen, in denen keine spontanen Veraenderungen erwuenscht sind.

Alle drei Werkzeuge sind **session-global** — jeder Teilnehmer sieht dieselbe Moderation, sobald der Leiter sie aktiviert.

---

## Architectural Decision

### Entscheidung: Sentinel-basierter Session-State

**Option A (gewaehlte Loesung):** Neuen Session-State via Sentinel-Schluessel in `figureMaps` speichern (`__spotlight__`, `__dim__`, `__freeze__`), analog zu `__optik__`, `__stiffness__`, etc. Die Werte werden in `buildStateFromMutations` exponiert und in `seedFigureMapFromState` rehydriert.

**Option B (verworfen):** Spotlight/Dim als Figure-Felder (`figure.spotlighted`, `figure.dimmed`) — haette bedeutet, dass eine Statusaenderung N Figur-Mutations erfordert (eine pro Figur), und dass Freeze als verteiltes Flag auf allen Figuren laege. Das waere sowohl broadcast-aufwendig als auch semantisch falsch (es handelt sich um einen Raum-globalen Zustand, nicht um einen Figur-Zustand).

**Begruendung fuer Sentinel-Ansatz:**
- Eine einzige Mutation aendert den gesamten Raumzustand — O(1) statt O(N) Broadcasts.
- Konsistent mit dem bestehenden Pattern (`__optik__`, `__lobby_settings__` etc.).
- Late-Joiners erhalten den State automatisch via Snapshot, da `buildStateFromMutations` ihn exponiert.
- Freeze-Gate in `gateMutation` ist zentral und sauber — kein verteiltes Check pro Figur.

### Entscheidung: Material-Override via Three.js traverse

Fuer die visuelle Umsetzung (Spotlight-Glow, Dim-Opacity, Freeze-Toenung) wird `fig.root.traverse()` genutzt, um alle `MeshStandardMaterial`/`MeshLambertMaterial`-Meshes zu erreichen und deren `emissive`/`opacity`/`color` zu ueberschreiben. Dies wird pro Frame in der `updateModerationVisuals()`-Funktion (analog zu `updatePossessionVisuals()`) ausgefuehrt.

**Override-Strategie:**
- Originalfarben werden beim ersten Moderation-Frame in `fig._originalMaterials` gecacht (Map von Mesh-UUID zu `{color, emissive, opacity, transparent}`).
- Beim Deaktivieren der Moderation werden die Originalwerte restauriert.
- Ein `fig._moderationDirty`-Flag markiert, ob ein Restore notwendig ist.

---

## Data Model / Interface Changes

### Neue Typen in `brett/src/types/state.ts`

```typescript
/** Moderation-State: welche Figur ist im Spotlight / Dim (null = deaktiviert). */
export interface ModerationState {
  spotlight: string | null;   // figureId oder null
  dim: string | null;         // figureId oder null
  freeze: boolean;
}
```

### Neue Client-Messages in `brett/src/types/messages.ts`

```typescript
// ClientMessage (Admin-only, via ws-admin-commands.ts):
| { type: 'admin_spotlight_set'; figureId: string | null }
| { type: 'admin_dim_set'; figureId: string | null }
| { type: 'admin_freeze_set'; frozen: boolean }

// ServerMessage:
| { type: 'moderation_state'; spotlight: string | null; dim: string | null; freeze: boolean }
```

### Neue Sentinel-Schluessel in `figures.ts` (applyMutation)

```
__moderation__  →  { id: '__moderation__', spotlight: string|null, dim: string|null, freeze: boolean }
```

### Erweiterung `buildStateFromMutations` (phases.ts)

```typescript
const moderationEntry = figs.get('__moderation__');
if (moderationEntry) result.moderation = {
  spotlight: moderationEntry.spotlight ?? null,
  dim: moderationEntry.dim ?? null,
  freeze: moderationEntry.freeze ?? false,
};
```

### Erweiterung `seedFigureMapFromState` (figures.ts)

```typescript
if (state.moderation && typeof state.moderation === 'object') {
  map.set('__moderation__', { id: '__moderation__', ...state.moderation });
}
```

### Freeze-Gate in `gateMutation` (ws-handler.ts)

Wenn `state.moderation?.freeze === true` werden Mutationstypen `move`, `update`, `jump` fuer Nicht-Leiter geblockt. Leiter duerfen auch im Freeze-Zustand bewegen (damit der Leiter demonstrieren kann).

```typescript
// Freeze-Gate: block figure movement for non-leaders when room is frozen
if (state.moderation?.freeze) {
  const freezeBlocked: MutationType[] = ['move', 'update', 'jump'];
  if (freezeBlocked.includes(msgType)) {
    const role = deps.resolveRole(ws, roles);
    if (role !== 'leiter') return false;
  }
}
```

### Erweiterung `ADMIN_TYPES` (ws-handler.ts)

```typescript
'admin_spotlight_set', 'admin_dim_set', 'admin_freeze_set'
```

### Erweiterung `handleAdminMessage` (ws-admin-commands.ts)

Drei neue Cases:
- `admin_spotlight_set`: applyMutation moderation_spotlight_set + broadcast moderation_state
- `admin_dim_set`: applyMutation moderation_dim_set + broadcast moderation_state
- `admin_freeze_set`: applyMutation moderation_freeze_set + broadcast moderation_state + schedulePersist

---

## Implementation Strategy

### Server-Seite

**Phase 1 — Typen:**
Keine Aenderungen an `state.ts` notwenig (kein Figure-Feld, alles Sentinel). Neue Messages in `messages.ts` eintragen. `messages.test.ts` braucht neue Eintraege in `HANDLED_SERVER_TYPES` und `routeServer`/`routeClient`.

**Phase 2 — Mutation + State:**
In `figures.ts`:
- `applyMutation`: 3 neue Cases: `moderation_spotlight_set`, `moderation_dim_set`, `moderation_freeze_set`. Jeder Case liest den vorhandenen `__moderation__`-Sentinel (oder Defaults) und schreibt ihn zurueck mit dem geaenderten Feld.
- `seedFigureMapFromState`: neuer Branch fuer `state.moderation`.

In `phases.ts`:
- `buildStateFromMutations`: neuer Branch fuer `__moderation__`.

**Phase 3 — Admin-Handler:**
In `ws-admin-commands.ts`:
- 3 neue Cases in `handleAdminMessage`.
- Jeder broadcastet `moderation_state` an alle Teilnehmer.

In `ws-handler.ts`:
- `ADMIN_TYPES` erweitern.
- `gateMutation` um Freeze-Gate erweitern.

### Client-Seite

**Phase 4 — WS-Client:**
In `ws-client.ts`:
- Neuer `case 'moderation_state'` in `onWsMessage`.
- Modulvariable `let moderationState: { spotlight: string|null; dim: string|null; freeze: boolean }`.
- State wird gesetzt und `updateModerationVisuals()` aufgerufen (oder via injected callback).

**Phase 5 — Visuelle Umsetzung (mannequin.ts / scene.ts):**
Neue Funktion `updateModerationVisuals(figures, moderationState)` in `mannequin.ts`:
- Iteriert alle Figuren.
- **Spotlight**: Spotlight-Figur bekommt `emissive = 0xc8a96e` (brass-glow), `emissiveIntensity = 0.6`. Alle anderen: `opacity = 0.25`, `transparent = true`.
- **Dim**: identisch zu Spotlight (die nicht-dim-Figur leuchtet, alle anderen abgedunkelt).
- **Freeze**: alle Figuren erhalten eine blaue Toenung (`color.lerp(blueIce, 0.35)`). Zusaetzlich wird ueber jeder Figur ein kleines Eis-Sprite angezeigt (analog zu `possessionRing` / `labelSprite`).
- **Kein Moderation**: Originalfarben wiederherstellen.

**Phase 6 — Freeze-HUD:**
In `board-boot.ts`:
- Freeze-Indikator-Banner: schmales div `id="freeze-indicator"` oben am Board, sichtbar wenn `freeze === true`.
- Text: "EINGEFROREN — Figuren koennen nicht bewegt werden".

**Phase 7 — Admin-UI (optional, Dark-Launch):**
In `brett/src/client/ui/menu.ts` oder einem neuen `moderation.ts`-Modul:
- Drei Buttons fuer Spotlight/Dim/Freeze (gated hinter `window.__brettFeatures['sf-t000471']`).
- Spotlight/Dim: Figur-Picker (Dropdown mit allen aktuellen Figuren) oder Klick auf Figur im Board.

### Test-Strategie

**Einheitstests (Node.js built-in test runner):**

`brett/test/admin-spotlight.test.ts` — neue Testdatei:
- `applyMutation moderation_spotlight_set`: Sentinel wird korrekt gesetzt.
- `applyMutation moderation_dim_set`: separates Feld, unabhaengig von spotlight.
- `applyMutation moderation_freeze_set`: boolean wird korrekt gesetzt.
- `buildStateFromMutations`: `state.moderation` exponiert alle drei Felder.
- `seedFigureMapFromState`: Moderation-State ueberlebt DB-Roundtrip.
- `gateMutation` mit Freeze: Bewegungen fuer Nicht-Leiter werden geblockt.
- `gateMutation` mit Freeze: Leiter kann trotzdem bewegen.
- `handleAdminMessage admin_spotlight_set`: broadcastet `moderation_state`.
- `handleAdminMessage admin_freeze_set`: broadcastet `moderation_state` und schedulePersist.

`brett/test/messages.test.ts` — Erweiterung:
- `routeServer` muss `moderation_state` handlen (Compile-time exhaustiveness).
- `routeClient` muss `admin_spotlight_set`, `admin_dim_set`, `admin_freeze_set` handlen.
- `HANDLED_SERVER_TYPES` wird um `moderation_state` erweitert.

`brett/test/permissions.test.ts` — Erweiterung:
- Freeze-Gate-Tests: leiter darf, stellvertreter und beobachter werden geblockt.

---

## Sicherheits- und Konsistenzueberlegungen

- **Nur Leiter darf Moderation aktivieren:** `admin_spotlight_set`, `admin_dim_set`, `admin_freeze_set` sind in `ADMIN_TYPES` — werden daher `isAdmin`-gegated (ws._session?.isAdmin). Kein Stellvertreter-Bypass.
- **Freeze-Gate ist server-side:** Clients koennen den Freeze-State nicht umgehen. Das Gate sitzt in `gateMutation` — der einzigen Schnittstelle vor `applyMutation`/broadcast.
- **Leiter-Bypass bei Freeze:** Der Leiter muss auch im Freeze demonstrieren koennen. `gateMutation` prueft `role === 'leiter'` und laesst durch.
- **Late-Join:** `buildStateFromMutations` exponiert `state.moderation`; der Join-Snapshot traegt es. `ws-client.ts` wendet `updateModerationVisuals` beim `snapshot`-Event an.
- **Persistenz:** Spotlight/Dim/Freeze werden persistiert (schedulePersist) damit der Zustand ueber Reconnects stabil bleibt. Beim naechsten `seedFigureMapFromState` wird er restauriert.
- **Deaktivierung:** `admin_spotlight_set { figureId: null }` loescht den Spotlight. `admin_freeze_set { frozen: false }` hebt den Freeze auf. Alle Originalfarben werden im Client restauriert.
