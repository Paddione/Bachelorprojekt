# Brett Optik — Design Spec

**Datum:** 2026-05-13  
**Scope:** `brett/public/index.html` + `brett/server.js`  
**Feature:** Konfigurierbare Textur- und Farbeinstellungen für das 3D-Brett, synchronisiert über WebSocket für alle Raum-Teilnehmer.

---

## Zusammenfassung

`index.html` (das aktive Brett unter `brett.mentolder.de` und eingebettet per `/admin/brett`) bekommt ein floating "🎨 Optik"-Panel. Nutzer können Brett-Oberfläche (6 Presets + freier Farbwähler), Hintergrundstimmung und Lichtstimmung wählen. Einstellungen werden per WebSocket an alle Teilnehmer im Raum gesendet und als Teil des Raum-States in der DB persistiert.

---

## Architektur

### WebSocket-Protokoll

Neuer Message-Type `optik` — gleiche Behandlung wie `add`/`move`:

```json
{ "type": "optik", "settings": { "board": "wood-dark", "customColor": null, "bg": "space", "light": "neutral" } }
```

**Felder in `settings`:**

| Feld | Typ | Mögliche Werte |
|---|---|---|
| `board` | string | `"wood-dark"`, `"wood-light"`, `"felt-green"`, `"slate"`, `"sand"`, `"marble"`, `"custom"` |
| `customColor` | string \| null | Hex-Farbe z.B. `"#3a6030"`, nur wenn `board === "custom"` |
| `bg` | string | `"space"`, `"dusk"`, `"forest"`, `"light"` |
| `light` | string | `"neutral"`, `"warm"`, `"cool"`, `"dramatic"` |

### Persistenz

`brett_rooms.state` (JSONB) wird um einen `optik`-Key erweitert — kein DB-Schema-Change nötig:

```json
{
  "figures": [...],
  "optik": { "board": "wood-dark", "customColor": null, "bg": "space", "light": "neutral" }
}
```

**Sync-Logik:**
- Beim `snapshot` (Join) liefert der Server `state.optik` mit — neuer Teilnehmer sieht sofort die aktuelle Optik.
- Jede Optik-Änderung wird sofort an alle Raum-Teilnehmer gebroadcastet und debounced in die DB geschrieben.
- **Fallback localStorage:** Wenn kein Raum-Token gesetzt ist, werden Einstellungen in `localStorage` unter `brett_optik` gespeichert und beim nächsten Öffnen wiederhergestellt.

---

## UI

### Floating Button

- Fester `🎨`-Kreis-Button (36×36px, goldener Hintergrund `#c8a96e`) unten rechts im Canvas
- Position: `position: absolute; bottom: 16px; right: 16px`
- Klick togglet das Popup (öffnen/schließen)
- Klick außerhalb des Popups schließt es

### Popup

Erscheint über dem Button (nach links/oben ausgerichtet), `position: absolute; bottom: 60px; right: 16px`:

```
┌──────────────────────────────────┐
│ OBERFLÄCHE                       │
│ [Dunkles Holz✓] [Helles Holz]   │
│ [Filz] [Schiefer] [Sand] [Marmor]│
│ [🎨 Eigene Farbe ████]           │
│                                  │
│ HINTERGRUND                      │
│ [Nacht✓] [Dämmerung] [Wald][Hell]│
│                                  │
│ LICHTSTIMMUNG                    │
│ [Neutral✓] [Warm] [Kühl][Dramat.]│
└──────────────────────────────────┘
```

**Preset-Chips:** Rechteckige Buttons mit aktivem Golden-Border (`border: 1px solid #c8a96e`).  
**Farbwähler:** `<input type="color">` als letzter Eintrag in der Oberflächen-Reihe — bei Auswahl wird `board: "custom"` + `customColor: <hex>` gesetzt.

---

## Implementierung

### `brett/public/index.html`

**CSS (neu):**
- `#optik-btn` — floating circle button
- `#optik-popup` — popup panel (hidden by default, `.open` class zeigt es)
- `.optik-section` — label + chips-Gruppe
- `.optik-chip` — preset button, `.active` state mit gold border
- `.optik-color` — color input styling

**HTML (neu, im `#canvas-container`):**
```html
<button id="optik-btn" title="Brett-Optik">🎨</button>
<div id="optik-popup">
  <div class="optik-section">
    <div class="optik-label">OBERFLÄCHE</div>
    <div class="optik-chips">
      <button class="optik-chip active" data-board="wood-dark">Dunkles Holz</button>
      <!-- weitere Presets ... -->
      <input type="color" id="optik-color" title="Eigene Farbe">
    </div>
  </div>
  <!-- Hintergrund + Licht analog -->
</div>
```

**JS (neu/geändert):**

1. **Texture-Funktionen portieren** aus `brett-v2.html`:
   - `makeFeltTexture(color)`
   - `makeSlateTexture()`
   - `makeSandTexture()`
   - `makeMarbleTexture()`
   - `makeWoodTexture(dark)` — bereits vorhanden, ggf. anpassen

2. **`BOARD_PRESETS`-Map:**
   ```js
   const BOARD_PRESETS = {
     'wood-dark':  { mat: () => new THREE.MeshStandardMaterial({map: makeWoodTexture(true),  roughness:.92}), edge: 0x1e1006 },
     'wood-light': { mat: () => new THREE.MeshStandardMaterial({map: makeWoodTexture(false), roughness:.85}), edge: 0x8b6020 },
     'felt-green': { mat: () => new THREE.MeshStandardMaterial({map: makeFeltTexture('#2d6030'), roughness:.98}), edge: 0x1a3a1e },
     'slate':      { mat: () => new THREE.MeshStandardMaterial({map: makeSlateTexture(),    roughness:.8, metalness:.1}), edge: 0x181820 },
     'sand':       { mat: () => new THREE.MeshStandardMaterial({map: makeSandTexture(),     roughness:.95}), edge: 0x9a7840 },
     'marble':     { mat: () => new THREE.MeshStandardMaterial({map: makeMarbleTexture(),   roughness:.4,  metalness:.05}), edge: 0xb0a090 },
   };
   ```

3. **`BACKGROUND_PRESETS`- und `LIGHT_PRESETS`-Maps** analog aus brett-v2.html portieren.

4. **`applyOptik(settings)`** — wendet alle Einstellungen auf die Three.js-Szene an:
   - `settings.board === 'custom'` → `THREE.MeshStandardMaterial({ color: settings.customColor })`
   - Sonst: Preset aus `BOARD_PRESETS` anwenden
   - `boardMesh.material` + `edgeMesh.material` tauschen
   - Hintergrund + Fog + Licht setzen

5. **Popup-Logik:** Toggle-Handler, Chip-Klick setzt active-Klasse + ruft `sendOptik()` auf, Color-Picker `change`-Event.

6. **`sendOptik(settings)`:**
   ```js
   function sendOptik(settings) {
     currentOptik = settings;
     applyOptik(settings);
     if (ws && ws.readyState === WebSocket.OPEN) {
       ws.send(JSON.stringify({ type: 'optik', settings }));
     } else {
       localStorage.setItem('brett_optik', JSON.stringify(settings));
     }
   }
   ```

7. **WebSocket `message`-Handler erweitern:**
   - `snapshot`: `if (msg.optik) applyOptik(msg.optik)` + UI-Chips sync
   - `optik`: `applyOptik(msg.settings)` + UI-Chips sync

### `brett/server.js`

**`applyMutation(room, msg)`** — neuer Case (`__optik__` als reservierter Key in `figureMaps`):
```js
case 'optik':
  if (msg.settings && typeof msg.settings === 'object') {
    figs.set('__optik__', { id: '__optik__', settings: msg.settings });
  }
  break;
```

**`buildStateFromMutations(room)`** — `optik` einbauen, `__optik__`-Eintrag aus figures filtern:
```js
function buildStateFromMutations(room) {
  const figs = figureMaps.get(room);
  if (!figs) return null;
  const figures = Array.from(figs.values()).filter(f => f.id !== '__optik__');
  const optikEntry = figs.get('__optik__');
  const result = { figures };
  if (optikEntry) result.optik = optikEntry.settings;
  return result;
}
```

**`ws.on('message')` erlaubte Types** — `'optik'` ergänzen:
```js
if (['add','move','update','delete','clear','optik'].includes(msg.type)) {
```

**`snapshot`-Antwort** — `optik` mitsenden:
```js
const state = buildStateFromMutations(msg.room);
ws.send(JSON.stringify({ type: 'snapshot', figures: state.figures, optik: state.optik }));
```

---

## Nicht im Scope

- Größen- und Neigungsslider (vorerst nicht)
- Upload eigener Textur-Bilder
- Per-User-Einstellungen (alle im Raum sehen dasselbe)
- Änderungen an `brett-v2.html`

---

## Testplan

1. Zwei Browser-Tabs im selben Raum öffnen
2. In Tab 1 Textur wechseln → Tab 2 muss sofort reagieren
3. Tab 2 schließen und neu öffnen → Brett-Optik muss persistiert sein (aus DB via snapshot)
4. Raum ohne Token öffnen → localStorage-Fallback prüfen
5. `task workspace:validate` — keine Manifest-Änderungen erwartet
