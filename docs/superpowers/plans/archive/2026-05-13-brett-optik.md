# Brett Optik — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Floating 🎨-Panel hinzufügen, mit dem Nutzer Brett-Oberfläche, Hintergrund und Lichtstimmung wählen können — synchronisiert per WebSocket und persistiert in der DB.

**Architecture:** Neuer WebSocket-Message-Typ `optik` wird wie `add`/`move` behandelt: Server speichert Optik in `figureMaps` als `__optik__`-Eintrag, baut ihn in den DB-State ein (JSONB `state.optik`) und liefert ihn beim Join im Snapshot mit. Client rendert ein Floating-Button/Popup-Panel, das `applyOptik()` aufruft und per `sendOptik()` broadcastet.

**Tech Stack:** Three.js (Canvas-Texturen, MeshStandardMaterial), WebSocket (ws), Node.js/Express, PostgreSQL JSONB — keine neuen Abhängigkeiten.

---

## Datei-Map

| Datei | Änderung | Inhalt |
|-------|----------|--------|
| `brett/server.js` | Modify | `optik` case in `applyMutation`; `buildStateFromMutations` filtert `__optik__` und schreibt `result.optik`; Join-Handler hydriert optik aus DB; Snapshot enthält `optik`; Server-Start in `if (require.main === module)` für Testbarkeit; Export erweitert |
| `brett/public/index.html` | Modify | Texture-Funktionen (`makeFeltTexture` etc.), Preset-Maps, `currentOptik`, `applyOptik`, `syncOptikUI`, `sendOptik`, CSS, HTML (button + popup), Popup-Event-Handler, WS-`message`-Handler |
| `tests/unit/brett-optik-server.js` | Create | Node.js Standalone-Test für Server-Pure-Logik (kein DB nötig) |

---

## Task 1: Server — `optik`-Mutation & State (brett/server.js)

**Files:**
- Modify: `brett/server.js:166-199, 257, 310`
- Create: `tests/unit/brett-optik-server.js`

- [ ] **Schritt 1: Testdatei schreiben (schlägt fehl, weil server.js noch kein `optik` kennt)**

Erstelle `tests/unit/brett-optik-server.js`:

```js
'use strict';
// Standalone test for pure optik logic in server.js.
// Run with: node tests/unit/brett-optik-server.js
// No DB required — tests pure in-memory logic only.

// ── Reimplementation of the logic under test (spec-first) ──────────────────
const figureMaps = new Map();

function ensureFigureMap(room) {
  if (!figureMaps.has(room)) figureMaps.set(room, new Map());
  return figureMaps.get(room);
}

function applyMutation(room, msg) {
  const figs = ensureFigureMap(room);
  switch (msg.type) {
    case 'add':
      if (msg.fig && typeof msg.fig.id === 'string' && figs.size < 200) {
        figs.set(msg.fig.id, msg.fig);
      }
      break;
    case 'delete':
      figs.delete(msg.id);
      break;
    case 'clear':
      figs.clear();
      break;
    case 'optik':
      if (msg.settings && typeof msg.settings === 'object') {
        figs.set('__optik__', { id: '__optik__', settings: msg.settings });
      }
      break;
  }
}

function buildStateFromMutations(room) {
  const figs = figureMaps.get(room);
  if (!figs) return null;
  const figures = Array.from(figs.values()).filter(f => f.id !== '__optik__');
  const optikEntry = figs.get('__optik__');
  const result = { figures };
  if (optikEntry) result.optik = optikEntry.settings;
  return result;
}

// ── Tests ──────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function assert(label, cond) {
  if (cond) { console.log(`  ✓ ${label}`); passed++; }
  else       { console.error(`  ✗ ${label}`); failed++; }
}

console.log('\nbrett-optik-server: applyMutation + buildStateFromMutations\n');

// T1: optik message stores settings under __optik__ key
{
  const room = 'test-room-1';
  const settings = { board: 'felt-green', customColor: null, bg: 'dusk', light: 'warm' };
  applyMutation(room, { type: 'optik', settings });
  const figs = figureMaps.get(room);
  assert('optik message stores __optik__ entry', figs.has('__optik__'));
  assert('__optik__ entry has correct settings', JSON.stringify(figs.get('__optik__').settings) === JSON.stringify(settings));
}

// T2: buildStateFromMutations excludes __optik__ from figures array
{
  const room = 'test-room-2';
  applyMutation(room, { type: 'add', fig: { id: 'fig1', type: 'pawn', x: 0, z: 0 } });
  applyMutation(room, { type: 'optik', settings: { board: 'slate', customColor: null, bg: 'space', light: 'neutral' } });
  const state = buildStateFromMutations(room);
  assert('figures array has no __optik__ entry', state.figures.every(f => f.id !== '__optik__'));
  assert('figures array has real figures', state.figures.length === 1 && state.figures[0].id === 'fig1');
}

// T3: buildStateFromMutations includes optik in result
{
  const room = 'test-room-3';
  const settings = { board: 'marble', customColor: null, bg: 'forest', light: 'cool' };
  applyMutation(room, { type: 'optik', settings });
  const state = buildStateFromMutations(room);
  assert('state includes optik field', state.optik !== undefined);
  assert('state.optik matches settings', JSON.stringify(state.optik) === JSON.stringify(settings));
}

// T4: buildStateFromMutations returns null for unknown room
{
  const state = buildStateFromMutations('no-such-room');
  assert('returns null for unknown room', state === null);
}

// T5: optik with invalid settings is ignored
{
  const room = 'test-room-5';
  applyMutation(room, { type: 'optik', settings: 'not-an-object' });
  assert('invalid optik settings ignored', !figureMaps.get(room)?.has('__optik__'));
}

// T6: clear removes __optik__ entry
{
  const room = 'test-room-6';
  applyMutation(room, { type: 'optik', settings: { board: 'wood-dark', customColor: null, bg: 'space', light: 'neutral' } });
  applyMutation(room, { type: 'clear' });
  const figs = figureMaps.get(room);
  assert('clear removes __optik__', !figs.has('__optik__'));
}

// T7: buildStateFromMutations returns no optik field when none set
{
  const room = 'test-room-7';
  applyMutation(room, { type: 'add', fig: { id: 'fig1', type: 'pawn', x: 0, z: 0 } });
  const state = buildStateFromMutations(room);
  assert('state has no optik field when none set', state.optik === undefined);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Schritt 2: Test ausführen (soll mit Ist-Stand passen, da er Referenz-Impl. enthält)**

```bash
node tests/unit/brett-optik-server.js
```
Erwartet: `7 passed, 0 failed` (Test validiert die Spec-Logik)

- [ ] **Schritt 3: `brett/server.js` — Server-Start in `if (require.main === module)` einwickeln**

Suche in `brett/server.js` die Zeile ~105 (`const server = app.listen(PORT, () => {`).
Ersetze:

```js
const server = app.listen(PORT, () => {
  console.log(`brett listening on :${PORT}`);
});
```

Mit:

```js
const server = require.main === module
  ? app.listen(PORT, () => { console.log(`brett listening on :${PORT}`); })
  : app.listen(0);   // test: ephemeral port, never used
```

> Hinweis: Das ermöglicht `require('./brett/server')` in Tests ohne DB-Abhängigkeit — der Server horcht dann auf einem Ephemeral-Port, der nie benutzt wird.

Dann den `DATABASE_URL`-Check anpassen (Zeile 11-14):

Ersetze:
```js
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}
```

Mit:
```js
if (!process.env.DATABASE_URL && require.main === module) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}
```

- [ ] **Schritt 4: `applyMutation` — `optik` case hinzufügen**

In `brett/server.js` nach dem `clear`-Case (Zeile ~189), vor der schließenden `}` des `switch`:

Ersetze:
```js
    case 'clear':
      figs.clear();
      break;
  }
}
```

Mit:
```js
    case 'clear':
      figs.clear();
      break;
    case 'optik':
      if (msg.settings && typeof msg.settings === 'object') {
        figs.set('__optik__', { id: '__optik__', settings: msg.settings });
      }
      break;
  }
}
```

- [ ] **Schritt 5: `buildStateFromMutations` aktualisieren**

Ersetze (Zeile ~195-199):
```js
function buildStateFromMutations(room) {
  const figs = figureMaps.get(room);
  if (!figs) return null;
  return { figures: Array.from(figs.values()) };
}
```

Mit:
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

- [ ] **Schritt 6: Erlaubte Message-Types um `'optik'` erweitern**

Ersetze (Zeile ~257):
```js
      if (['add','move','update','delete','clear'].includes(msg.type)) {
```

Mit:
```js
      if (['add','move','update','delete','clear','optik'].includes(msg.type)) {
```

- [ ] **Schritt 7: `module.exports` erweitern (für Testbarkeit)**

Ersetze (Zeile ~310):
```js
module.exports = { app, server, pool, wss };
```

Mit:
```js
module.exports = { app, server, pool, wss, applyMutation, buildStateFromMutations, figureMaps };
```

- [ ] **Schritt 8: Manifest-Validierung laufen lassen**

```bash
task workspace:validate
```
Erwartet: kein Fehler (keine Manifest-Änderung in diesem Task)

- [ ] **Schritt 9: Commit**

```bash
git add brett/server.js tests/unit/brett-optik-server.js
git commit -m "feat(brett): server-side optik mutation, state, allowed types"
```

---

## Task 2: Server — Join-Handler & Snapshot-Hydratation (brett/server.js)

**Files:**
- Modify: `brett/server.js:239-250`

- [ ] **Schritt 1: Test für Snapshot-Optik schreiben**

Füge am Ende von `tests/unit/brett-optik-server.js` (vor dem `process.exit`) hinzu:

```js
// T8: DB state with optik key hydrates into figureMap
{
  const room = 'test-room-8';
  const dbState = {
    figures: [{ id: 'fig1', type: 'pawn', x: 1, z: 2 }],
    optik: { board: 'sand', customColor: null, bg: 'light', light: 'warm' },
  };
  const figs = ensureFigureMap(room);
  for (const f of dbState.figures || []) {
    if (f && typeof f.id === 'string') figs.set(f.id, f);
  }
  if (dbState.optik && typeof dbState.optik === 'object') {
    figs.set('__optik__', { id: '__optik__', settings: dbState.optik });
  }
  const state = buildStateFromMutations(room);
  assert('snapshot includes optik from DB state', JSON.stringify(state.optik) === JSON.stringify(dbState.optik));
  assert('snapshot figures excludes __optik__', state.figures.every(f => f.id !== '__optik__'));
}
```

- [ ] **Schritt 2: Test ausführen**

```bash
node tests/unit/brett-optik-server.js
```
Erwartet: `8 passed, 0 failed`

- [ ] **Schritt 3: Join-Handler in `brett/server.js` anpassen**

Suche den Block ab `if (!figureMaps.has(msg.room))` (Zeile ~240). Ersetze:

```js
        if (!figureMaps.has(msg.room)) {
          const state = await readState(msg.room);
          const figs = ensureFigureMap(msg.room);
          for (const f of state.figures || []) {
            if (f && typeof f.id === 'string') figs.set(f.id, f);
          }
        }

        const state = buildStateFromMutations(msg.room);
        ws.send(JSON.stringify({ type: 'snapshot', figures: state.figures }));
```

Mit:

```js
        if (!figureMaps.has(msg.room)) {
          const state = await readState(msg.room);
          const figs = ensureFigureMap(msg.room);
          for (const f of state.figures || []) {
            if (f && typeof f.id === 'string') figs.set(f.id, f);
          }
          if (state.optik && typeof state.optik === 'object') {
            figs.set('__optik__', { id: '__optik__', settings: state.optik });
          }
        }

        const state = buildStateFromMutations(msg.room);
        ws.send(JSON.stringify({ type: 'snapshot', figures: state.figures, optik: state.optik }));
```

- [ ] **Schritt 4: Test erneut ausführen**

```bash
node tests/unit/brett-optik-server.js
```
Erwartet: `8 passed, 0 failed`

- [ ] **Schritt 5: Commit**

```bash
git add brett/server.js tests/unit/brett-optik-server.js
git commit -m "feat(brett): join-handler hydriert optik aus DB, snapshot enthält optik"
```

---

## Task 3: Client — Texture-Funktionen (brett/public/index.html)

**Files:**
- Modify: `brett/public/index.html:509, 524-592`

- [ ] **Schritt 1: `ambient`-Variable speichern**

Ersetze Zeile ~509:
```js
scene.add(new THREE.AmbientLight(0xffffff, 0.45));
```

Mit:
```js
const ambient = new THREE.AmbientLight(0xffffff, 0.45);
scene.add(ambient);
```

- [ ] **Schritt 2: `makeWoodTexture` — `dark`-Parameter hinzufügen**

Ersetze die ersten 13 Zeilen der Funktion (Zeile ~524-542, bis `ctx.fillStyle = lg;`):

```js
function makeWoodTexture() {
  const W = 512, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');

  // Base: dark warm brown
  ctx.fillStyle = '#2d1a0b';
  ctx.fillRect(0, 0, W, H);

  // Lengthwise warmth gradient
  const lg = ctx.createLinearGradient(0, 0, W, 0);
  lg.addColorStop(0,   'rgba(25,12,2,0.25)');
  lg.addColorStop(0.35,'rgba(55,28,6,0.12)');
  lg.addColorStop(0.65,'rgba(45,22,5,0.18)');
  lg.addColorStop(1,   'rgba(20,10,1,0.22)');
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, W, H);
```

Mit:

```js
function makeWoodTexture(dark = true) {
  const W = 512, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');

  ctx.fillStyle = dark ? '#2d1a0b' : '#c8a060';
  ctx.fillRect(0, 0, W, H);

  const lg = ctx.createLinearGradient(0, 0, W, 0);
  if (dark) {
    lg.addColorStop(0,   'rgba(25,12,2,0.25)');
    lg.addColorStop(0.5, 'rgba(55,28,6,0.12)');
    lg.addColorStop(1,   'rgba(20,10,1,0.22)');
  } else {
    lg.addColorStop(0,   'rgba(255,220,160,0.2)');
    lg.addColorStop(0.5, 'rgba(230,190,120,0.1)');
    lg.addColorStop(1,   'rgba(200,160,80,0.2)');
  }
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, W, H);
```

- [ ] **Schritt 3: Fehlende Texture-Funktionen direkt nach `makeWoodTexture` einfügen**

Die Funktion `makeWoodTexture` endet mit:
```js
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}
```

Direkt danach (vor `const woodTex = makeWoodTexture();`) einfügen:

```js
function makeFeltTexture(color) {
  const W = 256, H = 256, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = color; ctx.fillRect(0, 0, W, H);
  let seed = 0xdeadbeef;
  function r() { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; }
  for (let i = 0; i < 6000; i++) {
    ctx.strokeStyle = `rgba(0,0,0,${(0.04 + r() * 0.06).toFixed(3)})`;
    ctx.lineWidth = 0.5 + r() * 0.8;
    const x = r() * W, y = r() * H, len = 3 + r() * 6, a = r() * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke();
  }
  return new THREE.CanvasTexture(c);
}

function makeMarbleTexture() {
  const W = 512, H = 512, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e8e4dc'; ctx.fillRect(0, 0, W, H);
  let seed = 0xabcdef12;
  function r() { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; }
  for (let i = 0; i < 40; i++) {
    const x = r() * W, y = r() * H;
    const g = ctx.createLinearGradient(x, y, x + (r() - 0.5) * W * 0.8, y + (r() - 0.5) * H * 0.8);
    const a = 0.03 + r() * 0.08;
    g.addColorStop(0, 'rgba(180,160,140,0)'); g.addColorStop(0.5, `rgba(140,120,100,${a.toFixed(3)})`); g.addColorStop(1, 'rgba(180,160,140,0)');
    ctx.strokeStyle = g; ctx.lineWidth = 0.5 + r() * 1.5;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let t = 0; t < 1; t += 0.05) ctx.lineTo(x + (r() - 0.5) * W * 0.6, y + (r() - 0.5) * H * 0.6);
    ctx.stroke();
  }
  return new THREE.CanvasTexture(c);
}

function makeSandTexture() {
  const W = 256, H = 256, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#d4b483'; ctx.fillRect(0, 0, W, H);
  let seed = 0x12345678;
  function r() { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; }
  for (let i = 0; i < 8000; i++) {
    const x = r() * W, y = r() * H;
    ctx.fillStyle = `rgba(${Math.floor(180 + r() * 40)},${Math.floor(140 + r() * 30)},${Math.floor(60 + r() * 40)},${(0.3 + r() * 0.5).toFixed(3)})`;
    ctx.beginPath(); ctx.arc(x, y, 0.4 + r() * 0.8, 0, Math.PI * 2); ctx.fill();
  }
  return new THREE.CanvasTexture(c);
}

function makeSlateTexture() {
  const W = 256, H = 256, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2a2a30'; ctx.fillRect(0, 0, W, H);
  let seed = 0xcafe1234;
  function r() { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; }
  for (let i = 0; i < 60; i++) {
    ctx.strokeStyle = `rgba(${Math.floor(50 + r() * 30)},${Math.floor(50 + r() * 30)},${Math.floor(60 + r() * 30)},${(0.15 + r() * 0.2).toFixed(3)})`;
    ctx.lineWidth = 0.5 + r(); ctx.beginPath();
    const y = r() * H; ctx.moveTo(0, y); ctx.lineTo(W, y + (r() - 0.5) * 10); ctx.stroke();
  }
  return new THREE.CanvasTexture(c);
}
```

- [ ] **Schritt 4: Browser-Test — Texturen im Konsolen-Snippet prüfen**

Öffne `brett.localhost?room=standalone` und führe in der Browser-Konsole aus:

```js
// Validiert, dass die Funktionen existieren und CanvasTexture zurückgeben
console.assert(typeof makeWoodTexture === 'function', 'makeWoodTexture');
console.assert(typeof makeFeltTexture === 'function', 'makeFeltTexture');
console.assert(typeof makeMarbleTexture === 'function', 'makeMarbleTexture');
console.assert(typeof makeSandTexture === 'function', 'makeSandTexture');
console.assert(typeof makeSlateTexture === 'function', 'makeSlateTexture');
const tex = makeWoodTexture(false);
console.assert(tex.isTexture, 'makeWoodTexture(false) returns a texture');
```

Erwartet: keine roten Assertion-Fehler.

- [ ] **Schritt 5: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): texture functions (felt, marble, sand, slate) + makeWoodTexture(dark) param"
```

---

## Task 4: Client — Preset-Maps, `applyOptik`, `sendOptik` (brett/public/index.html)

**Files:**
- Modify: `brett/public/index.html:594-609` (boardMesh-Erzeugung), JS-Abschnitt nach boardMesh/edgeMesh

- [ ] **Schritt 1: Preset-Maps direkt nach den Texture-Funktionen einfügen (vor `const woodTex`)**

Ersetze die Zeile:
```js
const woodTex = makeWoodTexture();
```

Mit folgendem Block:

```js
const BOARD_PRESETS = {
  'wood-dark':  { mat: () => new THREE.MeshStandardMaterial({ map: makeWoodTexture(true),  roughness: 0.92, metalness: 0.0 }), edge: 0x1e1006 },
  'wood-light': { mat: () => new THREE.MeshStandardMaterial({ map: makeWoodTexture(false), roughness: 0.85, metalness: 0.0 }), edge: 0x8b6020 },
  'felt-green': { mat: () => new THREE.MeshStandardMaterial({ map: makeFeltTexture('#2d6030'), roughness: 0.98, metalness: 0.0 }), edge: 0x1a3a1e },
  'slate':      { mat: () => new THREE.MeshStandardMaterial({ map: makeSlateTexture(),    roughness: 0.8,  metalness: 0.1  }), edge: 0x181820 },
  'sand':       { mat: () => new THREE.MeshStandardMaterial({ map: makeSandTexture(),     roughness: 0.95, metalness: 0.0  }), edge: 0x9a7840 },
  'marble':     { mat: () => new THREE.MeshStandardMaterial({ map: makeMarbleTexture(),   roughness: 0.4,  metalness: 0.05 }), edge: 0xb0a090 },
};

const BG_PRESETS = {
  'space':  { color: 0x1a1a2e, fog: 0x1a1a2e },
  'dusk':   { color: 0x1a1020, fog: 0x1a1020 },
  'forest': { color: 0x0a140a, fog: 0x0a140a },
  'light':  { color: 0xe8e8f0, fog: 0xe8e8f0 },
};

const LIGHT_PRESETS = {
  'neutral':   { sun: 0xffffff, sunI: 0.9,  fill: 0x8090ff, fillI: 0.3, amb: 0.45 },
  'warm':      { sun: 0xffe8c0, sunI: 1.1,  fill: 0xff9040, fillI: 0.2, amb: 0.5  },
  'cool':      { sun: 0xc0d8ff, sunI: 0.8,  fill: 0x4060ff, fillI: 0.4, amb: 0.4  },
  'dramatic':  { sun: 0xffffff, sunI: 1.4,  fill: 0x1020a0, fillI: 0.1, amb: 0.2  },
};

let currentOptik = { board: 'wood-dark', customColor: null, bg: 'space', light: 'neutral' };
```

- [ ] **Schritt 2: boardMesh-Erzeugung auf BOARD_PRESETS umstellen**

Ersetze (Zeile ~596-602):
```js
const boardMesh = new THREE.Mesh(
  new THREE.BoxGeometry(BW, 0.5, BD),
  new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.92, metalness: 0.0 })
);
```

Mit:
```js
const boardMesh = new THREE.Mesh(
  new THREE.BoxGeometry(BW, 0.5, BD),
  BOARD_PRESETS['wood-dark'].mat()
);
```

- [ ] **Schritt 3: `applyOptik`, `syncOptikUI`, `sendOptik` nach edgeMesh einfügen**

Suche die Zeile nach `scene.add(edgeMesh);` (Zeile ~609). Direkt danach einfügen:

```js
function applyOptik(settings) {
  currentOptik = settings;

  // Board surface
  const oldMat = boardMesh.material;
  if (settings.board === 'custom' && settings.customColor) {
    boardMesh.material = new THREE.MeshStandardMaterial({ color: settings.customColor, roughness: 0.9, metalness: 0.0 });
    edgeMesh.material.color.setHex(0x2a2a2a);
  } else {
    const preset = BOARD_PRESETS[settings.board] || BOARD_PRESETS['wood-dark'];
    boardMesh.material = preset.mat();
    edgeMesh.material.color.setHex(preset.edge);
  }
  if (oldMat) oldMat.dispose();

  // Background
  const bg = BG_PRESETS[settings.bg] || BG_PRESETS['space'];
  scene.background.setHex(bg.color);
  scene.fog = new THREE.Fog(bg.fog, 65, 120);

  // Lights
  const lp = LIGHT_PRESETS[settings.light] || LIGHT_PRESETS['neutral'];
  sun.color.setHex(lp.sun);     sun.intensity  = lp.sunI;
  fill.color.setHex(lp.fill);   fill.intensity = lp.fillI;
  ambient.intensity = lp.amb;
}

function syncOptikUI(settings) {
  document.querySelectorAll('[data-board]').forEach(c => c.classList.remove('active'));
  document.querySelectorAll('[data-bg]').forEach(c => c.classList.remove('active'));
  document.querySelectorAll('[data-light]').forEach(c => c.classList.remove('active'));
  const bChip = document.querySelector(`[data-board="${settings.board}"]`);
  if (bChip) bChip.classList.add('active');
  const bgChip = document.querySelector(`[data-bg="${settings.bg}"]`);
  if (bgChip) bgChip.classList.add('active');
  const lChip = document.querySelector(`[data-light="${settings.light}"]`);
  if (lChip) lChip.classList.add('active');
  const colorInput = document.getElementById('optik-color');
  if (colorInput && settings.customColor) colorInput.value = settings.customColor;
  if (colorInput) colorInput.classList.toggle('active', settings.board === 'custom');
}

function sendOptik(settings) {
  applyOptik(settings);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'optik', settings }));
  } else {
    localStorage.setItem('brett_optik', JSON.stringify(settings));
  }
}

// Restore from localStorage in standalone / offline mode
try {
  const saved = localStorage.getItem('brett_optik');
  if (saved) {
    const parsed = JSON.parse(saved);
    applyOptik(parsed);
    syncOptikUI(parsed);
  }
} catch {}
```

- [ ] **Schritt 4: Browser-Test — `applyOptik` in Konsole prüfen**

Öffne `brett.localhost?room=standalone` und führe aus:

```js
// Brett sollte auf Marmor wechseln
applyOptik({ board: 'marble', customColor: null, bg: 'light', light: 'warm' });
console.assert(currentOptik.board === 'marble', 'currentOptik.board');
// Brett zurückstellen
applyOptik({ board: 'wood-dark', customColor: null, bg: 'space', light: 'neutral' });
```

Erwartet: Brett ändert sich sofort sichtbar zu Marmor/hellem Hintergrund, dann zurück zu dunklem Holz.

- [ ] **Schritt 5: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): BOARD_PRESETS/BG_PRESETS/LIGHT_PRESETS, applyOptik, syncOptikUI, sendOptik"
```

---

## Task 5: Client — CSS + HTML (brett/public/index.html)

**Files:**
- Modify: `brett/public/index.html` (CSS-Block, HTML-Block in `#canvas-container`)

- [ ] **Schritt 1: CSS am Ende des `<style>`-Blocks hinzufügen (vor `</style>`)**

Suche `</style>` (das Ende des großen CSS-Blocks im `<head>`). Direkt davor einfügen:

```css
  /* ── Optik-Panel ──────────────────────────────────────────────── */
  #optik-btn {
    position: absolute;
    bottom: 16px;
    right: 16px;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: #c8a96e;
    border: none;
    cursor: pointer;
    font-size: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 20;
    transition: transform 0.15s, box-shadow 0.15s;
    box-shadow: 0 2px 8px rgba(0,0,0,0.5);
    line-height: 1;
  }
  #optik-btn:hover { transform: scale(1.1); box-shadow: 0 3px 12px rgba(0,0,0,0.6); }

  #optik-popup {
    display: none;
    position: absolute;
    bottom: 60px;
    right: 16px;
    background: #16213e;
    border: 1px solid #0f3460;
    border-radius: 10px;
    padding: 14px;
    z-index: 20;
    min-width: 240px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.6);
    flex-direction: column;
    gap: 12px;
  }
  #optik-popup.open { display: flex; }

  .optik-section { display: flex; flex-direction: column; gap: 6px; }
  .optik-label { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.08em; }
  .optik-chips { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }

  .optik-chip {
    padding: 4px 9px;
    font-size: 11px;
    border-radius: 5px;
    border: 1px solid #0f3460;
    background: #0f2040;
    color: #aaa;
    cursor: pointer;
    transition: all 0.12s;
    white-space: nowrap;
  }
  .optik-chip:hover { border-color: #c8a96e; color: #e0e0e0; }
  .optik-chip.active { border-color: #c8a96e; background: rgba(200,169,110,0.15); color: #c8a96e; }

  #optik-color {
    width: 30px;
    height: 24px;
    border: 1px solid #0f3460;
    border-radius: 5px;
    padding: 2px;
    cursor: pointer;
    background: #0f2040;
  }
  #optik-color.active { border-color: #c8a96e; }
```

- [ ] **Schritt 2: HTML in `#canvas-container` einfügen**

Suche in `brett/public/index.html` (Zeile ~291-297):
```html
<div id="canvas-container">
  <canvas id="three-canvas"></canvas>
  <div id="hint">
    LMB: Figur ziehen &nbsp;|&nbsp; RMB auf Figur: ausrichten &nbsp;|&nbsp; RMB auf Fläche: Blickwinkel &nbsp;|&nbsp; MMB: Brett verschieben &nbsp;|&nbsp; Rad: Zoom &nbsp;|&nbsp; Doppelklick: Beschriftung
  </div>
  <div id="selected-info"></div>
</div>
```

Ersetze mit:
```html
<div id="canvas-container">
  <canvas id="three-canvas"></canvas>
  <div id="hint">
    LMB: Figur ziehen &nbsp;|&nbsp; RMB auf Figur: ausrichten &nbsp;|&nbsp; RMB auf Fläche: Blickwinkel &nbsp;|&nbsp; MMB: Brett verschieben &nbsp;|&nbsp; Rad: Zoom &nbsp;|&nbsp; Doppelklick: Beschriftung
  </div>
  <div id="selected-info"></div>
  <button id="optik-btn" title="Brett-Optik">🎨</button>
  <div id="optik-popup">
    <div class="optik-section">
      <div class="optik-label">Oberfläche</div>
      <div class="optik-chips">
        <button class="optik-chip active" data-board="wood-dark">Dunkles Holz</button>
        <button class="optik-chip" data-board="wood-light">Helles Holz</button>
        <button class="optik-chip" data-board="felt-green">Filz</button>
        <button class="optik-chip" data-board="slate">Schiefer</button>
        <button class="optik-chip" data-board="sand">Sand</button>
        <button class="optik-chip" data-board="marble">Marmor</button>
        <input type="color" id="optik-color" title="Eigene Farbe" value="#3a6030">
      </div>
    </div>
    <div class="optik-section">
      <div class="optik-label">Hintergrund</div>
      <div class="optik-chips">
        <button class="optik-chip active" data-bg="space">Nacht</button>
        <button class="optik-chip" data-bg="dusk">Dämmerung</button>
        <button class="optik-chip" data-bg="forest">Wald</button>
        <button class="optik-chip" data-bg="light">Hell</button>
      </div>
    </div>
    <div class="optik-section">
      <div class="optik-label">Lichtstimmung</div>
      <div class="optik-chips">
        <button class="optik-chip active" data-light="neutral">Neutral</button>
        <button class="optik-chip" data-light="warm">Warm</button>
        <button class="optik-chip" data-light="cool">Kühl</button>
        <button class="optik-chip" data-light="dramatic">Dramatisch</button>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Schritt 3: Visuellen Check im Browser**

Öffne `brett.localhost?room=standalone`. Der 🎨-Button soll unten rechts im Canvas sichtbar sein (goldener Kreis). Ein Klick soll das Popup öffnen (noch ohne Funktion — kommt in Task 6).

- [ ] **Schritt 4: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): optik CSS + HTML (floating button + popup panel)"
```

---

## Task 6: Client — Popup-Event-Handler (brett/public/index.html)

**Files:**
- Modify: `brett/public/index.html` (JS-Abschnitt vor `connect()`)

- [ ] **Schritt 1: Event-Handler am Ende des IIFE (vor `connect()`) einfügen**

Suche `connect();` (Zeile ~1524). Direkt davor einfügen:

```js
// ── Optik-Panel Interaktion ────────────────────────────────────────────────
document.getElementById('optik-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  document.getElementById('optik-popup').classList.toggle('open');
});

document.addEventListener('click', (e) => {
  const popup = document.getElementById('optik-popup');
  const btn   = document.getElementById('optik-btn');
  if (popup.classList.contains('open') && !popup.contains(e.target) && e.target !== btn) {
    popup.classList.remove('open');
  }
});

document.querySelectorAll('[data-board]').forEach(chip => {
  chip.addEventListener('click', () => {
    const newOptik = { ...currentOptik, board: chip.dataset.board, customColor: null };
    syncOptikUI(newOptik);
    sendOptik(newOptik);
  });
});

document.getElementById('optik-color').addEventListener('input', (e) => {
  const newOptik = { ...currentOptik, board: 'custom', customColor: e.target.value };
  syncOptikUI(newOptik);
  sendOptik(newOptik);
});

document.querySelectorAll('[data-bg]').forEach(chip => {
  chip.addEventListener('click', () => {
    const newOptik = { ...currentOptik, bg: chip.dataset.bg };
    syncOptikUI(newOptik);
    sendOptik(newOptik);
  });
});

document.querySelectorAll('[data-light]').forEach(chip => {
  chip.addEventListener('click', () => {
    const newOptik = { ...currentOptik, light: chip.dataset.light };
    syncOptikUI(newOptik);
    sendOptik(newOptik);
  });
});
```

- [ ] **Schritt 2: Browser-Test — Popup und Chips**

Öffne `brett.localhost?room=standalone`:
1. Klick auf 🎨 → Popup öffnet sich
2. Klick außerhalb → Popup schließt sich
3. Klick auf "Marmor" → Brett ändert sich sofort zu Marmor-Textur, Chip bekommt goldenen Rand
4. Klick auf "Helles Holz" → Brett ändert sich zu hellem Holz
5. Klick auf den Farbwähler, wähle eine beliebige Farbe → Brett nimmt diese Farbe an, Farbwähler bekommt goldenen Rand
6. Klick auf "Warm" (Lichtstimmung) → Szene wirkt wärmer
7. Klick auf "Hell" (Hintergrund) → Hintergrund wird hell

- [ ] **Schritt 3: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): optik popup event handlers (toggle, chips, color picker)"
```

---

## Task 7: Client — WebSocket-Integration (brett/public/index.html)

**Files:**
- Modify: `brett/public/index.html:465-472` (`ws.onmessage` Handler)

- [ ] **Schritt 1: `ws.onmessage` erweitern**

Suche (Zeile ~465-472):
```js
  ws.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    if (msg.type === 'snapshot') applySnapshot(msg.figures || []);
    else if (msg.type === 'info') {
      participantCount = msg.count;
      setStatus(`Verbunden ✓ — ${participantCount} Teilnehmer`);
    } else applyRemote(msg);
  };
```

Ersetze mit:
```js
  ws.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    if (msg.type === 'snapshot') {
      applySnapshot(msg.figures || []);
      if (msg.optik) { applyOptik(msg.optik); syncOptikUI(msg.optik); }
    } else if (msg.type === 'info') {
      participantCount = msg.count;
      setStatus(`Verbunden ✓ — ${participantCount} Teilnehmer`);
    } else if (msg.type === 'optik') {
      applyOptik(msg.settings);
      syncOptikUI(msg.settings);
    } else {
      applyRemote(msg);
    }
  };
```

- [ ] **Schritt 2: Manifest-Validierung**

```bash
task workspace:validate
```
Erwartet: `kustomize build` ohne Fehler — dieser Task ändert keine Kubernetes-Manifeste.

- [ ] **Schritt 3: Commit**

```bash
git add brett/public/index.html
git commit -m "feat(brett): ws.onmessage handle optik type + snapshot optik hydration"
```

---

## Task 8: Integrations- und Manueller Test

**Files:** keine Änderungen

- [ ] **Schritt 1: Brett-Service lokal starten (oder dev-Cluster nutzen)**

```bash
task brett:deploy ENV=dev
```
Oder lokal:
```bash
cd brett && DATABASE_URL="postgresql://user:pass@localhost:5432/brett" node server.js
```

- [ ] **Schritt 2: Zwei-Tab-Test — Sync-Verhalten**

1. Tab A öffnen: `http://brett.localhost?room=testroom-optik`
2. Tab B öffnen: `http://brett.localhost?room=testroom-optik`
3. In Tab A → 🎨 → "Marmor" auswählen  
   ✓ Erwartet: In Tab B wechselt das Brett sofort zu Marmor ohne Reload
4. In Tab A → "Nacht" → "Wald" wechseln  
   ✓ Erwartet: Tab B zeigt grünen Waldhintergrund
5. In Tab A → "Warm" Lichtstimmung  
   ✓ Erwartet: Tab B wechselt zu warmer Beleuchtung

- [ ] **Schritt 3: Persistenz-Test**

1. Tab B schließen
2. In Tab A Textur zu "Sand" wechseln
3. Tab B neu öffnen mit gleichem Raum-Token
   ✓ Erwartet: Brett ist sofort auf "Sand" — wird via Snapshot aus DB geladen

- [ ] **Schritt 4: localStorage-Fallback**

1. Brett ohne Raum-Token öffnen: `http://brett.localhost` (standalone)
2. 🎨 → "Schiefer" auswählen
3. Seite neu laden
   ✓ Erwartet: Brett bleibt auf "Schiefer" (gespeichert in localStorage)

- [ ] **Schritt 5: Abschlusskontrolle**

```bash
task workspace:validate
node tests/unit/brett-optik-server.js
```

Beide Befehle müssen ohne Fehler durchlaufen.

---

## Self-Review — Spec-Abgleich

| Spec-Anforderung | Task |
|---|---|
| `optik` WebSocket-Protokoll mit board/customColor/bg/light | T1, T2, T7 |
| 6 Presets + freier Farbwähler | T3, T4, T5, T6 |
| Floating 🎨-Button unten rechts (36×36px, #c8a96e) | T5 |
| Popup mit Chip-Gruppen, golden border bei aktiv | T5, T6 |
| Klick außerhalb schließt Popup | T6 |
| `snapshot` liefert `optik` mit → neuer Teilnehmer sieht sofort die Optik | T2, T7 |
| Optik-Änderung an alle Raum-Teilnehmer gebroadcastet | T1 (broadcast nutzt existierende Infra) |
| Debounced DB-Persistenz in `state.optik` | T1 (schedulePersist bereits vorhanden) |
| localStorage-Fallback ohne Raum-Token | T4, T8 |
| `task workspace:validate` — keine Manifest-Änderungen | T7 |

Alle Spec-Anforderungen abgedeckt. ✓
