---
title: Brett Polish-Pass Implementation Plan
date: 2026-05-15
ticket_id: T000405
status: draft
domains: [brett, frontend, game]
pr_number: null
spec: docs/superpowers/specs/2026-05-15-brett-polish-pass-design.md
---

# Brett Polish-Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Brett vom Coaching-Tool zum 3D-Multiplayer-Game evolvieren — Combat-Foundation (FFA) + Mobile-Touch-Parität + Visual-Reskin + Stabilität in einem PR-Bündel.

**Architecture:** Client-seitige Mode-State-Machine (`coaching` / `mayhem-combat` / `mode-select`); Server bleibt relay-zentrisch (autoritativ nur für Pickups + Damage-Validation). Modularer Split von `index.html` (1126 Zeilen → Shell + Module unter `brett/public/assets/`). Visual-Reskin via CSS-Tokens + zentrale Three.js-Material-Library.

**Tech Stack:** Vanilla JS (ES-Modules, kein Bundler), Three.js (existiert), WebSocket (`ws` npm), Node.js Test-Runner (`node --test`), Playwright für E2E (existiert).

---

## ⚠️ Vor Execute: Open Questions Checkliste

Diese Liste **vor `dev-flow-execute`** durchgehen — Antworten landen entweder im Plan-Update oder werden während der Implementierung als Default angenommen (Defaults stehen in der Spec).

### A — Visuelle Mockups (idealerweise vor Phase 4)
- [ ] Mode-Selector-Layout (4 Karten, Disabled-Stubs)
- [ ] Spawn-Loadout-Screen (Zwei-Spalten-Modal)
- [ ] HUD-Anordnung Desktop + Mobile separat
- [ ] Combat-Mode-Indikator (Vignette? Rand? Tönung?)
- [ ] Death-Cam / Respawn-Overlay

### B — Inhaltliche Entscheidungen (vor Phase 3 nötig)
- [ ] Map-Hindernisse: ja/nein, prozedural/hardcoded
- [ ] Spawn-Points: Anzahl + Algorithmus
- [ ] Map-Boundaries: Sofort-Tod / Teleport / Wand
- [ ] Coaching-↔-Combat im selben Raum: getrennt oder Mode-Layer
- [ ] Self-Damage / Friendly-Fire bei Fireball
- [ ] Ragdoll-Persistenz nach Tod: Dauer + Max-Anzahl

### C — Zu beschaffende Assets
- [ ] Mode-Selector-Karten-Hintergründe (4 ink-on-brass)
- [ ] Audio-Files (Phase 2, separates Ticket): siehe Spec C.13
- [ ] Mobile-Test-Devices in Reichweite (iOS + Android)
- [ ] Optional Phase 2: 5 Waffen-GLBs + Pickup-Crate-GLB

### D — Entscheidungen noch offen
- [ ] Max-Spieler-Cap (Default: 8)
- [ ] Respawn-Position-Algorithmus
- [ ] Pickup-Mesh-Style (Primitive vs. Crate)
- [ ] Mode-Selector-Trigger (Join / Toggle / Auto-Preference)
- [ ] Coaching-Mode-Reskin-Intensität (Theme-Toggle als Setting?)

---

## File Structure (Ziel)

```
brett/
  server.js                                 (modify: damage_event, pickup_*, heartbeat)
  test/
    damage.test.js                          (new)
    pickups.test.js                         (new)
    mode-state.test.js                      (new — client-state-machine, run as JSDOM)
    ws-reconnect.test.js                    (new — server side)
    server.test.js                          (existing, may extend)
  public/
    index.html                              (modify: ~120 lines, only shell)
    assets/
      style.css                             (new — tokens + all extracted styles)
      main.js                               (new — entry, wires modules)
      mode-state.js                         (new)
      ws.js                                 (new — reconnect wrapper)
      materials.js                          (new — Three.js material lib)
      audio.js                              (new — no-op API placeholder)
      combat/
        weapons.js                          (new)
        damage.js                           (new)
        pickups.js                          (new)
        combat-hud.js                       (new)
        fx.js                               (new — decals, sprites)
      touch/
        joystick.js                         (new)
        touch-hud.js                        (new)
      sprites/                              (new — from asset pack)
        blood-splat-{01..04}.png
        fire-sprite.png
        muzzle-flash.png
        slash-arc.png
        smoke-puff.png
      hud/                                  (new — from asset pack)
        icon-{handgun,rifle,fireball,club,katana}.png
      mayhem/                               (existing)
        physics.js
        chase-camera.js
        player-avatar.js
        vehicle.js
        mayhem.js
scripts/
  brett/
    extract-asset-pack.sh                   (new — parses Claude-Artifact HTML)
docs/
  superpowers/
    plans/
      2026-05-14-brett-ux-overhaul.md       (modify: frontmatter status→done)
      2026-05-14-brett-mannequin.md         (modify: prüfen + ggf. status→done)
      2026-05-15-brett-ragdoll-mayhem.md    (modify: frontmatter status→done)
.github/workflows/
  ci.yml                                    (modify: brett-server test job hinzu falls fehlt)
```

---

## Phase 1 — Foundation & Hygiene

**Ziel:** index.html zerlegen, WS-Reconnect, alte Pläne aufräumen, CSS-Tokens etablieren. Bricht keine Funktionalität — nur Umstrukturierung.

### Task 1.1: Stale-Plan-Frontmatter

**Files:**
- Modify: `docs/superpowers/plans/2026-05-14-brett-ux-overhaul.md`
- Modify: `docs/superpowers/plans/2026-05-14-brett-mannequin.md`
- Modify: `docs/superpowers/plans/2026-05-15-brett-ragdoll-mayhem.md`

- [ ] **Step 1: Read each plan's frontmatter**
- [ ] **Step 2: Set `status: done` and correct `pr_number`**
  - brett-ux-overhaul.md → `pr_number: 766`
  - brett-ragdoll-mayhem.md → `pr_number: 779`
  - brett-mannequin.md → check git log for the matching PR (#742 or #748 or #761) and set
- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-05-14-brett-*.md docs/superpowers/plans/2026-05-15-brett-ragdoll-mayhem.md
git commit -m "docs(plans): mark merged brett plans as done"
```

### Task 1.2: T000393 Ticket-Closure (no code)

T000393 ist bereits gefixt (Duplicate-Case wurde mit T000388/PR #779 entfernt — Verifikation: `grep -c "case 'stiffness'" brett/server.js` → 1).

- [ ] **Step 1: Verify single occurrence**

```bash
test "$(grep -c "case 'stiffness'" brett/server.js)" = "1" && echo OK || echo FAIL
```

- [ ] **Step 2: Close ticket via SQL**

```bash
PGPOD=$(kubectl get pod -n workspace --context mentolder -l app=shared-db -o name | head -1)
kubectl exec "$PGPOD" -n workspace --context mentolder -- psql -U website -d website -c \
  "UPDATE tickets.tickets SET status='done', resolution='Already fixed in PR #779 via T000388' WHERE external_id='T000393';"
```

### Task 1.3: CSS-Tokens und style.css anlegen

**Files:**
- Create: `brett/public/assets/style.css`

- [ ] **Step 1: Tokens-Header schreiben**

```css
/* brett/public/assets/style.css */
:root {
  --ink-900: #0b111c;
  --ink-800: #17202e;
  --brass:    #d7b06a;
  --brass-hi: #f0d28c;
  --brass-mute: rgba(215,176,106,0.35);
  --stille-blau: #6fa8d8;
  --blood-core: #a83a30;
  --blood-deep: #5a1a14;
  --fire-tip:  #fff5c8;
  --line:      rgba(215,176,106,0.18);

  --font-ui: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

html, body {
  background: var(--ink-900);
  color: var(--brass-hi);
  font-family: var(--font-ui);
  margin: 0;
  height: 100%;
  overflow: hidden;
}
```

- [ ] **Step 2: Existing inline `<style>` aus index.html lesen und vollständig hier rein kopieren** — danach Selektoren auf die Tokens umstellen (Color-Literals → `var(--...)`)
- [ ] **Step 3: Smoke-Test im Browser** (`task brett:deploy ENV=dev` → http://brett.localhost)
- [ ] **Step 4: Commit**

```bash
git add brett/public/assets/style.css
git commit -m "feat(brett): extract style.css with ink-on-brass tokens"
```

### Task 1.4: index.html splitten — Shell + main.js

**Files:**
- Modify: `brett/public/index.html`
- Create: `brett/public/assets/main.js`

Schritt-für-Schritt: jeden `<script>`-Block aus index.html in eine Datei unter `assets/` verschieben. Reihenfolge respektieren. ESM-Imports nutzen.

- [ ] **Step 1: index.html in Shell verwandeln** — alles zwischen `<script>...</script>` extrahieren

```html
<!-- brett/public/index.html nach Split, Skelett -->
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>Brett</title>
  <link rel="stylesheet" href="assets/style.css">
</head>
<body>
  <div id="topbar">…</div>
  <canvas id="canvas"></canvas>
  <div id="hud"></div>
  <div id="status-pill">…</div>
  <div id="fig-panel-wrap">…</div>
  <div id="overlay-root"></div>
  <script src="three.min.js"></script>
  <script type="module" src="assets/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: main.js als Entry anlegen**

```js
// brett/public/assets/main.js
import { connect } from './ws.js';
import { initModeState } from './mode-state.js';
import { mountMaterials } from './materials.js';
import { initAudio } from './audio.js';
import { initSceneAndPlayers } from './scene.js';
// combat + touch werden lazy von mode-state geladen

const ws = connect();
mountMaterials();
initAudio();
initSceneAndPlayers({ ws });
initModeState({ ws });
```

- [ ] **Step 3: Bestehende Skriptblöcke nach `scene.js` migrieren** (alles was Three.js-Setup, Figuren-Mutation, Topbar-Logic enthält — bleibt monolithisch in scene.js bis Phase 3 sinnvoll weiter splittet)
- [ ] **Step 4: Mayhem-Module bleiben unverändert** unter `assets/mayhem/*` — werden in main.js noch nicht explizit importiert, behalten ihre globale `window.Mayhem`-API
- [ ] **Step 5: Smoke-Test:** `task brett:deploy ENV=dev`, im Browser zwei Figuren bewegen, Mayhem togglen → muss alles wie vorher funktionieren
- [ ] **Step 6: Commit**

```bash
git add brett/public/index.html brett/public/assets/main.js brett/public/assets/scene.js
git commit -m "refactor(brett): split index.html into ES modules"
```

### Task 1.5: ws.js — Reconnect-Wrapper + Heartbeat

**Files:**
- Create: `brett/public/assets/ws.js`
- Modify: `brett/server.js` (heartbeat senden, pong-Timeout)

- [ ] **Step 1: Test für Backoff-Sequenz schreiben** (run mit Node-Test-Runner gegen Pure-JS-Modul, Mock-WebSocket)

```js
// brett/test/ws-reconnect.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backoffSequence } from '../public/assets/ws.js';

test('backoff: 1s, 2s, 4s, 8s, 16s, 30s cap', () => {
  const seq = [];
  for (let i = 0; i < 8; i++) seq.push(backoffSequence(i));
  assert.deepEqual(seq, [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
});
```

- [ ] **Step 2: Test laufen lassen — muss failen**

```bash
node --test brett/test/ws-reconnect.test.js
```

- [ ] **Step 3: ws.js implementieren**

```js
// brett/public/assets/ws.js
const HEARTBEAT_TIMEOUT_MS = 60_000;
const MAX_BACKOFF = 30_000;
const SESSION_CAP_MS = 5 * 60_000;

export function backoffSequence(attempt) {
  return Math.min(1000 * 2 ** attempt, MAX_BACKOFF);
}

export function connect({ url = location.origin.replace(/^http/, 'ws') } = {}) {
  const listeners = new Map();
  let socket, attempt = 0, sessionStart = Date.now(), heartbeatTimer = null;

  function emit(type, payload) {
    (listeners.get(type) || []).forEach(fn => fn(payload));
  }

  function resetHeartbeat() {
    clearTimeout(heartbeatTimer);
    heartbeatTimer = setTimeout(() => {
      try { socket.close(); } catch {}
    }, HEARTBEAT_TIMEOUT_MS);
  }

  function open() {
    socket = new WebSocket(url);
    socket.addEventListener('open', () => {
      attempt = 0;
      resetHeartbeat();
      emit('open');
      socket.send(JSON.stringify({ type: 'request_state_snapshot' }));
    });
    socket.addEventListener('message', e => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.type === 'ping') {
        socket.send(JSON.stringify({ type: 'pong', t: msg.t }));
        resetHeartbeat();
        return;
      }
      emit(msg.type, msg);
    });
    socket.addEventListener('close', () => {
      clearTimeout(heartbeatTimer);
      emit('close');
      if (Date.now() - sessionStart > SESSION_CAP_MS) return;
      const delay = backoffSequence(attempt++);
      emit('reconnect-pending', { delay });
      setTimeout(open, delay);
    });
  }

  open();

  return {
    on(type, fn) {
      const arr = listeners.get(type) || [];
      arr.push(fn);
      listeners.set(type, arr);
    },
    send(msg) { socket?.readyState === 1 && socket.send(JSON.stringify(msg)); },
    close() { socket?.close(); }
  };
}
```

- [ ] **Step 4: Tests laufen lassen — muss grün sein**
- [ ] **Step 5: Server-Heartbeat in `brett/server.js`** — ergänzen am WSS-Setup:

```js
// brett/server.js, im wss.on('connection', ...) Block:
ws.isAlive = true;
ws.on('message', (raw) => {
  // ... existing message handling ...
  let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }
  if (msg.type === 'pong') { ws.isAlive = true; return; }
  // ... bestehender code ...
});

// Globaler Heartbeat-Interval (einmal beim Server-Start):
setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) { try { ws.terminate(); } catch {} return; }
    ws.isAlive = false;
    try { ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch {}
  });
}, 20_000);
```

- [ ] **Step 6: `request_state_snapshot` Handler im Server**

```js
// in der wss message handler, neuer case:
if (msg.type === 'request_state_snapshot' && ws.room) {
  const state = buildStateFromMutations(ws.room);
  ws.send(JSON.stringify({ type: 'snapshot', ...state }));
  return;
}
```

- [ ] **Step 7: Reconnect-Banner-UI** in scene.js (oder neuer reconnect-banner.js)

```js
// In main.js nach ws-init:
ws.on('reconnect-pending', ({ delay }) => {
  const el = document.getElementById('reconnect-banner');
  el.hidden = false;
  el.textContent = `Verbindung verloren · reconnect in ${Math.ceil(delay/1000)}s …`;
});
ws.on('open', () => {
  document.getElementById('reconnect-banner').hidden = true;
});
```

- [ ] **Step 8: Smoke-Test:** Im Browser DevTools → Network → Offline → Online; Banner muss sichtbar werden und beim Reconnect verschwinden
- [ ] **Step 9: Commit**

```bash
git add brett/public/assets/ws.js brett/server.js brett/test/ws-reconnect.test.js
git commit -m "feat(brett): WS reconnect wrapper + server heartbeat"
```

### ✅ Phase 1 Checkpoint

- [ ] Smoke-Test: Brett funktioniert unverändert, Figuren bewegen sich, Mayhem togglet, Style sieht aus wie vorher (CSS-Tokens passen)
- [ ] WS-Disconnect-Test im DevTools: Banner erscheint + Reconnect
- [ ] `node --test brett/test/` grün
- [ ] PR könnte hier theoretisch schon shippen ("Brett Foundation Cleanup")

---

## Phase 2 — Materials & Reskin

**Ziel:** Zentrale Three.js-Material-Library, Beleuchtung anpassen, Asset-Pack extrahieren.

### Task 2.1: Asset-Pack-Extraction-Script

**Files:**
- Create: `scripts/brett/extract-asset-pack.sh`

- [ ] **Step 1: Script anlegen**

```bash
#!/usr/bin/env bash
# scripts/brett/extract-asset-pack.sh
# Usage: bash scripts/brett/extract-asset-pack.sh <pack.html> <out-dir>
set -euo pipefail
PACK="${1:?Usage: $0 <pack.html> <out-dir>}"
OUT="${2:?}"
mkdir -p "$OUT/sprites" "$OUT/hud"

python3 - "$PACK" "$OUT" <<'PY'
import sys, re, base64, json
pack_path, out_dir = sys.argv[1], sys.argv[2]
raw = open(pack_path).read()

# Filename → UUID mapping aus den img-Tags im inneren Doc
inner = None
for line in raw.split('\n'):
    if '<!DOCTYPE' in line and len(line) > 200:
        inner = line; break
if not inner: sys.exit('no inner doc found')

inner = inner.replace('\\u003C','<').replace('\\u003E','>').replace('\\u002F','/').replace('\\"','"').replace('\\n','\n')

# Map filename to UUID via the file/uuid pairs in the layout
pattern = re.compile(r'<img src="([0-9a-f-]{36})"[^>]*>.*?(icon-[a-z]+\.png|blood-splat-\d{2}\.png|fire-sprite\.png|muzzle-flash\.png|slash-arc\.png|smoke-puff\.png)', re.DOTALL)
mapping = {}
for m in pattern.finditer(inner):
    mapping[m.group(2)] = m.group(1)
print(f'found {len(mapping)} asset filename→uuid pairs', file=sys.stderr)

# UUID → data:-URL mapping from the outer JSON
uuid_url = re.compile(r'"([0-9a-f-]{36})"\s*:\s*"(data:image/[a-z]+;base64,[^"]+)"')
url_for = dict(uuid_url.findall(raw))
print(f'found {len(url_for)} uuid→dataurl entries', file=sys.stderr)

import os
for fname, uuid in mapping.items():
    url = url_for.get(uuid)
    if not url:
        print(f'skip {fname}: no data url for uuid {uuid}', file=sys.stderr); continue
    b64 = url.split(',', 1)[1]
    sub = 'hud' if fname.startswith('icon-') else 'sprites'
    path = os.path.join(out_dir, sub, fname)
    open(path, 'wb').write(base64.b64decode(b64))
    print(f'wrote {path}')
PY
```

- [ ] **Step 2: Ausführbar machen**

```bash
chmod +x scripts/brett/extract-asset-pack.sh
```

- [ ] **Step 3: Script gegen vom User attached Pack laufen lassen**

```bash
bash scripts/brett/extract-asset-pack.sh \
  "/mnt/c/Users/Patrick/OneDrive - Core-IT/Desktop/Mentolder Game Asset Pack.html" \
  brett/public/assets
```

- [ ] **Step 4: Falls Mapping-Regex nicht greift** (Claude-Artifact-Format kann variieren): manuell PNGs aus dem HTML extrahieren und per Hand in `brett/public/assets/{sprites,hud}/` ablegen. Filenames-Konvention siehe File Structure.
- [ ] **Step 5: Verify alle 14 Files vorhanden**

```bash
ls brett/public/assets/sprites/ | wc -l   # erwartet: 7 (4 blood + fire + muzzle + slash + smoke; smoke ist in sprites)
ls brett/public/assets/hud/ | wc -l       # erwartet: 5
```

- [ ] **Step 6: Commit**

```bash
git add scripts/brett/extract-asset-pack.sh brett/public/assets/sprites brett/public/assets/hud
git commit -m "feat(brett): asset pack extraction script + sprites/HUD icons"
```

### Task 2.2: materials.js

**Files:**
- Create: `brett/public/assets/materials.js`

- [ ] **Step 1: Material-Lib anlegen**

```js
// brett/public/assets/materials.js
const M = {};

export function mountMaterials() {
  M.inkBody = new THREE.MeshStandardMaterial({
    color: 0x17202e, metalness: 0.55, roughness: 0.65,
  });
  M.brassDetail = new THREE.MeshStandardMaterial({
    color: 0xd7b06a, metalness: 0.85, roughness: 0.25,
    emissive: 0x5a4220, emissiveIntensity: 0.15,
  });
  M.woodWarm = new THREE.MeshStandardMaterial({
    color: 0x6a4a28, roughness: 0.85, metalness: 0.05,
  });
  M.concrete = new THREE.MeshStandardMaterial({
    color: 0x5a5852, roughness: 0.95, metalness: 0.0,
  });
  M.edgeBrass = new THREE.LineBasicMaterial({
    color: 0xd7b06a, transparent: true, opacity: 0.35,
  });
}

export function get(name) { return M[name]; }

export function applySignature(mesh) {
  if (!mesh.geometry) return;
  const edges = new THREE.EdgesGeometry(mesh.geometry, 35);
  const line = new THREE.LineSegments(edges, M.edgeBrass);
  mesh.add(line);
  return mesh;
}
```

- [ ] **Step 2: In main.js mounten** (existiert bereits aus Phase 1)
- [ ] **Step 3: Smoke-Test im Browser** — Materials werden initialisiert, keine Konsolen-Errors
- [ ] **Step 4: Commit**

```bash
git add brett/public/assets/materials.js
git commit -m "feat(brett): central Three.js material library"
```

### Task 2.3: Beleuchtung & Boden umstellen

**Files:**
- Modify: `brett/public/assets/scene.js` (oder wo aktuell die Lights initialisiert werden)

- [ ] **Step 1: Bestehende Lights identifizieren**

```bash
grep -nE "AmbientLight|DirectionalLight|HemisphereLight|SpotLight" brett/public/assets/scene.js
```

- [ ] **Step 2: Lights ersetzen**

```js
// in scene init, ersetzt vorhandene Lights:
scene.add(new THREE.HemisphereLight(0x6fa8d8, 0x0b111c, 0.35)); // stille-blau / ink
const key = new THREE.DirectionalLight(0xf0d28c, 0.5);
key.position.set(8, 12, 6);
scene.add(key);
const fill = new THREE.DirectionalLight(0x6fa8d8, 0.15);
fill.position.set(-6, 4, -8);
scene.add(fill);
```

- [ ] **Step 3: Brett-Boden-Material auf `concrete` Token umstellen** (sucht aktuelle Bodendefinition; ersetze MeshBasic… durch `materials.get('concrete')`)
- [ ] **Step 4: Coaching-Mode-Brightness-Modifier** vorbereiten

```js
// in scene.js:
export function setLightIntensity(mode) {
  // mode === 'coaching' → +20% Intensität
  const factor = mode === 'coaching' ? 1.2 : 1.0;
  scene.traverse(o => {
    if (o.isLight) o.intensity = o.userData.baseIntensity * factor;
  });
}
```

(In Phase 4 wird das beim Mode-Wechsel aufgerufen.)

- [ ] **Step 5: Smoke-Test im Browser:** Atmosphäre soll dunkler/wärmer wirken, Brett-Boden mit Beton-Look + Brass-Edges
- [ ] **Step 6: Commit**

```bash
git add brett/public/assets/scene.js
git commit -m "feat(brett): ink-on-brass lighting + concrete floor"
```

### ✅ Phase 2 Checkpoint

- [ ] Brett sieht im Browser deutlich anders aus (dunkler Hintergrund, Brass-Akzente)
- [ ] Sprites und HUD-Icons unter `brett/public/assets/{sprites,hud}/`
- [ ] Bestehende Figuren-/Mayhem-Funktionalität nicht regressed
- [ ] PR-Schnittpunkt: "Brett Visual Reskin" — alternativ alles bis Phase 4 in EINEN PR

---

## Phase 3 — Combat-Core (Desktop)

**Ziel:** 5 Waffen, Hit-Detection, HP, Death/Respawn, Pickups, FX. Mode-Wechsel kommt erst in Phase 4 — bis dahin: Combat über einen Debug-Toggle (`?combat=1` URL-Param).

### Task 3.1: weapons.js — Waffen-Tabelle

**Files:**
- Create: `brett/public/assets/combat/weapons.js`

- [ ] **Step 1: Stats-Tabelle als Single Source of Truth**

```js
// brett/public/assets/combat/weapons.js
export const WEAPONS = Object.freeze({
  handgun:  { type: 'ranged', dmg: 25, range: Infinity, cooldownMs: 250,  mag: 12, reloadMs: 1100, slot: 'ranged' },
  rifle:    { type: 'ranged', dmg: 35, range: Infinity, cooldownMs: 600,  mag: 5,  reloadMs: 1500, slot: 'ranged', pickupOnly: true },
  fireball: { type: 'ranged', dmg: 70, range: 30,       cooldownMs: 1500, mag: 3,  reloadMs: 0,    slot: 'ranged', pickupOnly: true, burn: { dps: 5, durMs: 3000 } },
  club:     { type: 'melee',  dmg: 50, range: 2.5,      cooldownMs: 700,  slot: 'melee', knockback: 8 },
  katana:   { type: 'melee',  dmg: 60, range: 3.0,      cooldownMs: 500,  slot: 'melee', sweepArcDeg: 90 },
});

export const STARTER_LOADOUT = { melee: 'club', ranged: 'handgun' };
```

- [ ] **Step 2: Commit**

```bash
git add brett/public/assets/combat/weapons.js
git commit -m "feat(brett): weapons stats table"
```

### Task 3.2: damage.js — Test-First

**Files:**
- Create: `brett/test/damage.test.js`
- Create: `brett/public/assets/combat/damage.js`

- [ ] **Step 1: Tests schreiben**

```js
// brett/test/damage.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDamageEvent, applyDamage } from '../public/assets/combat/damage.js';
import { WEAPONS } from '../public/assets/combat/weapons.js';

test('applyDamage reduces HP', () => {
  const victim = { hp: 100 };
  applyDamage(victim, WEAPONS.handgun.dmg);
  assert.equal(victim.hp, 75);
});

test('applyDamage clamps at 0', () => {
  const v = { hp: 10 };
  applyDamage(v, 999);
  assert.equal(v.hp, 0);
});

test('validateDamageEvent rejects unknown weapon', () => {
  const r = validateDamageEvent({ weapon: 'nuke', shooter: { hp: 50, lastShotAt: 0 }, victim: { hp: 100, x: 0, y: 0, z: 0 }, shooterPos: { x:0,y:0,z:1 }, now: 1000 });
  assert.equal(r.ok, false);
});

test('validateDamageEvent rejects shooter on cooldown', () => {
  const r = validateDamageEvent({
    weapon: 'handgun',
    shooter: { hp: 50, lastShotAt: 900 },
    victim: { hp: 100, x: 0, y: 0, z: 0 },
    shooterPos: { x: 0, y: 0, z: 1 },
    now: 1000, // 100ms after last shot, cooldown is 250ms
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /cooldown/);
});

test('validateDamageEvent rejects out-of-range melee', () => {
  const r = validateDamageEvent({
    weapon: 'club',
    shooter: { hp: 50, lastShotAt: 0 },
    victim: { hp: 100, x: 0, y: 0, z: 0 },
    shooterPos: { x: 10, y: 0, z: 0 }, // 10u away, club range is 2.5
    now: 10000,
  });
  assert.equal(r.ok, false);
});
```

- [ ] **Step 2: Tests laufen — alle fail erwartet**

```bash
node --test brett/test/damage.test.js
```

- [ ] **Step 3: damage.js implementieren**

```js
// brett/public/assets/combat/damage.js
import { WEAPONS } from './weapons.js';

export function applyDamage(victim, dmg) {
  victim.hp = Math.max(0, (victim.hp ?? 0) - dmg);
  return victim.hp;
}

function dist3(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.sqrt(dx*dx + dy*dy + dz*dz);
}

export function validateDamageEvent({ weapon, shooter, victim, shooterPos, now }) {
  const w = WEAPONS[weapon];
  if (!w) return { ok: false, reason: 'unknown weapon' };
  if ((shooter.hp ?? 0) <= 0) return { ok: false, reason: 'shooter dead' };
  if ((victim.hp ?? 0) <= 0) return { ok: false, reason: 'victim already dead' };
  const sinceShot = now - (shooter.lastShotAt ?? 0);
  if (sinceShot < w.cooldownMs) return { ok: false, reason: `cooldown ${w.cooldownMs - sinceShot}ms left` };
  if (w.type === 'melee') {
    const d = dist3(shooterPos, victim);
    if (d > w.range * 1.4) return { ok: false, reason: `melee out of range (${d.toFixed(1)} > ${w.range})` };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Tests laufen — alle grün**
- [ ] **Step 5: Commit**

```bash
git add brett/test/damage.test.js brett/public/assets/combat/damage.js
git commit -m "feat(brett): damage validation + HP application"
```

### Task 3.3: pickups.js — Test-First

**Files:**
- Create: `brett/test/pickups.test.js`
- Create: `brett/public/assets/combat/pickups.js`

- [ ] **Step 1: Tests**

```js
// brett/test/pickups.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSpawnPosition, canTakePickup } from '../public/assets/combat/pickups.js';

test('computeSpawnPosition keeps min distance from players', () => {
  const players = [{ x: 0, y: 0, z: 0 }];
  const pos = computeSpawnPosition({ players, boardRadius: 20, minDist: 5, rng: () => 0.5 });
  const d = Math.hypot(pos.x, pos.z);
  assert.ok(d >= 5, `picked ${d}, expected >= 5`);
});

test('canTakePickup rejects out-of-range', () => {
  const r = canTakePickup({ player: { x: 0, z: 0 }, pickup: { x: 5, z: 0, takeRadius: 1.5 } });
  assert.equal(r, false);
});

test('canTakePickup accepts in-range', () => {
  const r = canTakePickup({ player: { x: 0, z: 0 }, pickup: { x: 1, z: 0, takeRadius: 1.5 } });
  assert.equal(r, true);
});
```

- [ ] **Step 2: pickups.js implementieren**

```js
// brett/public/assets/combat/pickups.js
export function computeSpawnPosition({ players, boardRadius, minDist, rng = Math.random }) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * boardRadius;
    const pos = { x: Math.cos(a) * r, y: 0.5, z: Math.sin(a) * r };
    if (players.every(p => Math.hypot(pos.x - p.x, pos.z - p.z) >= minDist)) return pos;
  }
  return { x: 0, y: 0.5, z: 0 };
}

export function canTakePickup({ player, pickup }) {
  return Math.hypot(player.x - pickup.x, player.z - pickup.z) <= pickup.takeRadius;
}

export const PICKUP_TABLE = {
  rifle:    { respawnMs: 30_000, takeRadius: 1.5, mesh: 'octahedron-brass' },
  fireball: { respawnMs: 60_000, takeRadius: 1.5, mesh: 'octahedron-fire' },
};
```

- [ ] **Step 3: Tests grün, commit**

```bash
git add brett/test/pickups.test.js brett/public/assets/combat/pickups.js
git commit -m "feat(brett): pickup spawn logic + range check"
```

### Task 3.4: Server — damage_event + pickup_* Handler

**Files:**
- Modify: `brett/server.js`

- [ ] **Step 1: Allowlist erweitern**

Aktuelle Allowlist sucht: `grep -nE "'add'.*'move'.*'update'" brett/server.js` — den Array um folgende Types ergänzen: `'damage_event', 'death_event', 'pickup_request', 'pickup_taken', 'pickup_spawned', 'snapshot', 'request_state_snapshot'`.

- [ ] **Step 2: Server-Pickup-State pro Raum**

```js
// in brett/server.js, neben figureMaps:
const pickupState = new Map(); // room -> Map<pickupId, {kind, pos, takenBy, respawnAt}>

function ensurePickups(room) {
  if (!pickupState.has(room)) pickupState.set(room, new Map());
  return pickupState.get(room);
}

function spawnPickup(room, id, kind, pos) {
  const m = ensurePickups(room);
  m.set(id, { id, kind, pos, takenBy: null, respawnAt: null });
  broadcast(room, { type: 'pickup_spawned', id, kind, pos });
}
```

- [ ] **Step 3: damage_event Handler**

```js
// in der wss message handler:
if (msg.type === 'damage_event') {
  // Minimal validation: shooter alive (client trusted for now), broadcast
  // (Stricter validation lives client-side via damage.js — server is relay-with-allowlist)
  broadcast(ws.room, msg, ws);
  return;
}
if (msg.type === 'death_event') {
  broadcast(ws.room, msg, ws);
  return;
}
```

- [ ] **Step 4: pickup_request Handler**

```js
if (msg.type === 'pickup_request') {
  const pickups = ensurePickups(ws.room);
  const p = pickups.get(msg.id);
  if (!p || p.takenBy) return;
  p.takenBy = ws.userId;
  p.respawnAt = Date.now() + (msg.respawnMs || 30_000);
  broadcast(ws.room, { type: 'pickup_taken', id: msg.id, by: ws.userId });
  setTimeout(() => {
    p.takenBy = null;
    p.respawnAt = null;
    broadcast(ws.room, { type: 'pickup_spawned', id: p.id, kind: p.kind, pos: p.pos });
  }, msg.respawnMs || 30_000);
  return;
}
```

- [ ] **Step 5: Smoke-Test:** zwei Browser-Tabs, einer feuert `ws.send({type:'damage_event',…})` aus der Console — anderer empfängt
- [ ] **Step 6: Commit**

```bash
git add brett/server.js
git commit -m "feat(brett): server damage_event + pickup state"
```

### Task 3.5: fx.js — Decals & Sprites

**Files:**
- Create: `brett/public/assets/combat/fx.js`

- [ ] **Step 1: Sprite-Helper + Decal-Spawner**

```js
// brett/public/assets/combat/fx.js
const loader = new THREE.TextureLoader();
const cache = {};
function tex(path) { return cache[path] ??= loader.load(path); }

const BLOOD_VARIANTS = [1,2,3,4].map(i => `assets/sprites/blood-splat-0${i}.png`);

export function spawnBloodDecal(scene, hitPoint, hitNormal) {
  const variant = BLOOD_VARIANTS[Math.floor(Math.random() * 4)];
  const mat = new THREE.MeshBasicMaterial({
    map: tex(variant), transparent: true, depthWrite: false,
    blending: THREE.NormalBlending,
  });
  const geo = new THREE.PlaneGeometry(1.2, 1.2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(hitPoint).addScaledVector(hitNormal, 0.01);
  mesh.lookAt(hitPoint.clone().add(hitNormal));
  mesh.rotation.z = Math.random() * Math.PI * 2;
  scene.add(mesh);
  setTimeout(() => scene.remove(mesh), 30_000);
}

export function spawnMuzzleFlash(scene, originPos, dir) {
  const mat = new THREE.SpriteMaterial({
    map: tex('assets/sprites/muzzle-flash.png'),
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.set(0.6, 0.6, 0.6);
  s.position.copy(originPos);
  s.material.rotation = Math.random() * Math.PI * 2;
  scene.add(s);
  setTimeout(() => scene.remove(s), 80);
}

export function spawnSlashArc(scene, originPos, forward) {
  const mat = new THREE.SpriteMaterial({
    map: tex('assets/sprites/slash-arc.png'),
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.set(2, 1, 1);
  s.position.copy(originPos).addScaledVector(forward, 1.2);
  scene.add(s);
  const start = Date.now();
  function fade() {
    const t = (Date.now() - start) / 150;
    if (t >= 1) { scene.remove(s); return; }
    s.material.opacity = 1 - t;
    requestAnimationFrame(fade);
  }
  fade();
}

export function spawnSmokePuff(scene, pos) {
  const mat = new THREE.SpriteMaterial({
    map: tex('assets/sprites/smoke-puff.png'),
    transparent: true, depthWrite: false,
  });
  const s = new THREE.Sprite(mat);
  s.position.copy(pos);
  scene.add(s);
  const start = Date.now();
  function tick() {
    const t = (Date.now() - start) / 600;
    if (t >= 1) { scene.remove(s); return; }
    s.scale.setScalar(0.5 + t * 1.5);
    s.material.opacity = 0.8 * (1 - t);
    requestAnimationFrame(tick);
  }
  tick();
}

export function spawnFireSprite(scene, pos) {
  const t = tex('assets/sprites/fire-sprite.png');
  t.repeat.x = 0.25;
  const mat = new THREE.SpriteMaterial({
    map: t, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.set(1, 1, 1);
  s.position.copy(pos);
  scene.add(s);
  const start = Date.now();
  function tick() {
    const elapsed = Date.now() - start;
    if (elapsed > 3000) { scene.remove(s); return; }
    const frame = Math.floor(elapsed / (1000/12)) % 4;
    t.offset.x = frame * 0.25;
    requestAnimationFrame(tick);
  }
  tick();
}
```

- [ ] **Step 2: Smoke-Test:** aus Browser-Console manuell `import('./assets/combat/fx.js').then(m => m.spawnBloodDecal(scene, new THREE.Vector3(0,0.5,0), new THREE.Vector3(0,1,0)))`
- [ ] **Step 3: Commit**

```bash
git add brett/public/assets/combat/fx.js
git commit -m "feat(brett): combat FX — decals, sprites, fire animation"
```

### Task 3.6: combat-hud.js — Desktop-HUD

**Files:**
- Create: `brett/public/assets/combat/combat-hud.js`

- [ ] **Step 1: HUD-Markup + Render-API**

```js
// brett/public/assets/combat/combat-hud.js
export function mountCombatHud(root) {
  root.innerHTML = `
    <div id="combat-hud" hidden>
      <div class="hp-wrap"><div class="hp-fill"></div><span class="hp-text">100</span></div>
      <div class="weapon-slots">
        <div class="slot" data-slot="melee"><img alt=""><span class="key">1</span></div>
        <div class="slot active" data-slot="ranged"><img alt=""><span class="key">2</span></div>
      </div>
      <div class="ammo"><span class="cur">12</span> / <span class="max">12</span></div>
      <div class="score-board" id="score-board"></div>
      <div class="mode-indicator">FFA</div>
      <div class="crosshair">+</div>
    </div>
  `;
}

export function setHP(root, hp) {
  root.querySelector('.hp-fill').style.width = `${Math.max(0, Math.min(100, hp))}%`;
  root.querySelector('.hp-text').textContent = Math.round(hp);
}

export function setSlot(root, slot, weaponKey) {
  const el = root.querySelector(`.slot[data-slot="${slot}"] img`);
  el.src = `assets/hud/icon-${weaponKey}.png`;
}

export function setActiveSlot(root, slot) {
  root.querySelectorAll('.slot').forEach(el => el.classList.toggle('active', el.dataset.slot === slot));
}

export function setAmmo(root, cur, max) {
  root.querySelector('.ammo .cur').textContent = cur;
  root.querySelector('.ammo .max').textContent = max ?? '∞';
}

export function setScores(root, scores) {
  const board = root.querySelector('#score-board');
  board.innerHTML = scores.slice(0, 3).map((s,i) => `
    <div class="score-row"><span class="rank">${i+1}</span><span class="name">${s.name}</span><span class="kills">${s.kills}</span></div>
  `).join('');
}

export function setVisible(root, on) {
  root.querySelector('#combat-hud').hidden = !on;
}
```

- [ ] **Step 2: CSS für combat-hud in style.css ergänzen**

```css
/* style.css append */
#combat-hud {
  position: fixed; inset: 0;
  pointer-events: none; color: var(--brass-hi);
  font-family: var(--font-ui);
}
#combat-hud .hp-wrap {
  position: absolute; top: 16px; left: 50%; transform: translateX(-50%);
  width: 280px; height: 18px;
  background: var(--ink-800); border: 1px solid var(--brass-mute);
  border-radius: 9px; overflow: hidden;
}
#combat-hud .hp-fill {
  background: linear-gradient(90deg, var(--blood-deep), var(--blood-core), var(--brass-hi));
  height: 100%; width: 100%; transition: width 120ms ease-out;
}
#combat-hud .hp-text {
  position: absolute; inset: 0; display: grid; place-items: center;
  font-weight: 600; text-shadow: 0 0 2px var(--ink-900);
}
#combat-hud .weapon-slots {
  position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%);
  display: flex; gap: 8px;
}
#combat-hud .weapon-slots .slot {
  width: 64px; height: 64px;
  background: var(--ink-800); border: 1px solid var(--brass-mute); border-radius: 8px;
  display: grid; place-items: center; position: relative;
}
#combat-hud .weapon-slots .slot.active { border-color: var(--brass-hi); box-shadow: 0 0 12px var(--brass-mute); }
#combat-hud .weapon-slots .slot img { width: 48px; height: 48px; }
#combat-hud .weapon-slots .slot .key {
  position: absolute; top: 2px; right: 4px; font-size: 11px; color: var(--brass);
}
#combat-hud .ammo {
  position: absolute; bottom: 100px; left: 50%; transform: translateX(-50%);
  font-size: 18px; color: var(--brass-hi);
}
#combat-hud .score-board {
  position: absolute; top: 16px; right: 16px;
  background: var(--ink-800); border: 1px solid var(--brass-mute); border-radius: 8px;
  padding: 8px 12px; min-width: 160px;
}
#combat-hud .score-row { display: flex; gap: 8px; font-size: 13px; }
#combat-hud .score-row .name { flex: 1; }
#combat-hud .mode-indicator {
  position: absolute; top: 40px; left: 50%; transform: translateX(-50%);
  font-size: 12px; letter-spacing: 0.15em; color: var(--brass); text-transform: uppercase;
}
#combat-hud .crosshair {
  position: absolute; inset: 0; display: grid; place-items: center;
  font-size: 18px; color: var(--brass); opacity: 0.6;
}
```

- [ ] **Step 3: Smoke-Test:** im Browser `?combat=1` → HUD muss sichtbar werden (Initialwerte: 100 HP, 12/12, Score-leer)
- [ ] **Step 4: Commit**

```bash
git add brett/public/assets/combat/combat-hud.js brett/public/assets/style.css
git commit -m "feat(brett): combat HUD — HP, weapon slots, score"
```

### Task 3.7: Combat-Wiring & Debug-Toggle

**Files:**
- Modify: `brett/public/assets/main.js`
- Create: `brett/public/assets/combat/controller.js` (wires inputs → weapons → damage → fx → hud)

- [ ] **Step 1: controller.js**

```js
// brett/public/assets/combat/controller.js
import { WEAPONS, STARTER_LOADOUT } from './weapons.js';
import { validateDamageEvent, applyDamage } from './damage.js';
import * as Hud from './combat-hud.js';
import * as Fx from './fx.js';

export function startCombat({ scene, camera, players, self, ws, hudRoot }) {
  const state = {
    self, loadout: { ...STARTER_LOADOUT }, active: 'ranged',
    ammo: { handgun: 12, rifle: 0, fireball: 0 },
    lastShotAt: 0,
  };

  Hud.setHP(hudRoot, self.hp ?? 100);
  Hud.setSlot(hudRoot, 'melee', state.loadout.melee);
  Hud.setSlot(hudRoot, 'ranged', state.loadout.ranged);
  Hud.setActiveSlot(hudRoot, state.active);
  Hud.setAmmo(hudRoot, state.ammo[state.loadout.ranged], WEAPONS[state.loadout.ranged].mag);
  Hud.setVisible(hudRoot, true);

  window.addEventListener('keydown', e => {
    if (e.code === 'Digit1') { state.active = 'melee'; Hud.setActiveSlot(hudRoot, 'melee'); }
    if (e.code === 'Digit2') { state.active = 'ranged'; Hud.setActiveSlot(hudRoot, 'ranged'); }
    if (e.code === 'KeyQ')   { state.active = state.active === 'melee' ? 'ranged' : 'melee'; Hud.setActiveSlot(hudRoot, state.active); }
    if (e.code === 'KeyR')   reload(state);
  });

  window.addEventListener('mousedown', () => fire(state, { scene, camera, players, ws, hudRoot }));

  ws.on('damage_event', msg => {
    const victim = players.find(p => p.id === msg.victim_id);
    if (!victim) return;
    applyDamage(victim, msg.damage);
    Fx.spawnBloodDecal(scene, new THREE.Vector3(...msg.position), new THREE.Vector3(0,1,0));
    if (victim.id === self.id) Hud.setHP(hudRoot, victim.hp);
    if (victim.hp <= 0) ws.send({ type: 'death_event', victim_id: victim.id, killer_id: msg.shooter_id });
  });

  ws.on('death_event', msg => {
    // Ragdoll-Trigger lebt im player-avatar Modul; hier nur Score-Tick
    // (Score-Map kommt in Phase 6)
  });

  return state;
}

function fire(state, { scene, camera, players, ws, hudRoot }) {
  const weaponKey = state.loadout[state.active];
  const w = WEAPONS[weaponKey];
  const now = Date.now();
  if (now - state.lastShotAt < w.cooldownMs) return;
  if (w.type === 'ranged' && (state.ammo[weaponKey] ?? 0) <= 0) return;

  state.lastShotAt = now;

  if (w.type === 'ranged') {
    state.ammo[weaponKey]--;
    Hud.setAmmo(hudRoot, state.ammo[weaponKey], w.mag);
    Fx.spawnMuzzleFlash(scene, state.self.muzzlePos(), state.self.forward());
    const hit = raycastPlayers(camera, players, state.self);
    if (hit) {
      const ev = {
        type: 'damage_event', shooter_id: state.self.id, victim_id: hit.player.id,
        weapon: weaponKey, damage: w.dmg,
        position: [hit.point.x, hit.point.y, hit.point.z],
      };
      ws.send(ev);
      applyDamage(hit.player, w.dmg);
      Fx.spawnBloodDecal(scene, hit.point, hit.normal);
    }
  } else {
    Fx.spawnSlashArc(scene, state.self.muzzlePos(), state.self.forward());
    const targets = meleeSweep(state.self, players, w.range);
    for (const t of targets) {
      const ev = {
        type: 'damage_event', shooter_id: state.self.id, victim_id: t.id,
        weapon: weaponKey, damage: w.dmg,
        position: [t.x, t.y, t.z],
      };
      ws.send(ev);
      applyDamage(t, w.dmg);
    }
  }
}

function reload(state) {
  const key = state.loadout.ranged;
  const w = WEAPONS[key];
  if (!w.mag) return;
  setTimeout(() => { state.ammo[key] = w.mag; }, w.reloadMs);
}

function raycastPlayers(camera, players, self) {
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  for (const p of players) {
    if (p.id === self.id || (p.hp ?? 0) <= 0) continue;
    const hit = raycaster.intersectObject(p.mesh, true)[0];
    if (hit) return { player: p, point: hit.point, normal: hit.face?.normal ?? new THREE.Vector3(0,1,0) };
  }
  return null;
}

function meleeSweep(self, players, range) {
  return players.filter(p => p.id !== self.id && (p.hp ?? 0) > 0 &&
    Math.hypot(p.x - self.x, p.z - self.z) <= range);
}
```

- [ ] **Step 2: Debug-Toggle in main.js**

```js
// brett/public/assets/main.js append
if (new URLSearchParams(location.search).get('combat') === '1') {
  import('./combat/combat-hud.js').then(Hud => Hud.mountCombatHud(document.getElementById('overlay-root')));
  import('./combat/controller.js').then(C => {
    C.startCombat({ scene, camera, players, self: localPlayer, ws, hudRoot: document.getElementById('overlay-root') });
  });
}
```

- [ ] **Step 3: Smoke-Test mit zwei Tabs (`?combat=1`)** — Schuss/Schlag muss bei zweitem Tab HP-Reduktion auslösen + Blood-Decal sehen
- [ ] **Step 4: Commit**

```bash
git add brett/public/assets/combat/controller.js brett/public/assets/main.js
git commit -m "feat(brett): combat controller — fire, raycast, melee sweep"
```

### ✅ Phase 3 Checkpoint

- [ ] Mit `?combat=1` in zwei Tabs: feuern/schlagen funktioniert, HP reduziert, Decals erscheinen
- [ ] Cooldowns funktionieren (rapid-fire respektiert)
- [ ] Tests grün (`node --test brett/test/`)
- [ ] PR-Schnittpunkt: "Brett Combat Foundation" — Mobile + Mode-Selector noch nicht

---

## Phase 4 — Mode-Selector + Spawn-Loadout

**Ziel:** Saubere Mode-State-Machine, ersetzt den Debug-Toggle aus Phase 3.

### Task 4.1: mode-state.js + Test

**Files:**
- Create: `brett/test/mode-state.test.js`
- Create: `brett/public/assets/mode-state.js`

- [ ] **Step 1: Tests**

```js
// brett/test/mode-state.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createModeState } from '../public/assets/mode-state.js';

test('default mode is coaching', () => {
  const ms = createModeState({ storage: new Map() });
  assert.equal(ms.current(), 'coaching');
});

test('persisted loadout overrides defaults', () => {
  const storage = new Map([['brett.loadout', JSON.stringify({ melee: 'katana', ranged: 'handgun' })]]);
  const ms = createModeState({ storage });
  assert.equal(ms.loadout().melee, 'katana');
});

test('setMode emits change event', () => {
  let last = null;
  const ms = createModeState({ storage: new Map() });
  ms.on('change', m => { last = m; });
  ms.setMode('ffa');
  assert.equal(last, 'ffa');
});
```

- [ ] **Step 2: Implementierung**

```js
// brett/public/assets/mode-state.js
const VALID = new Set(['coaching', 'ffa', 'mode-select']);
const STUB = new Set(['teams', 'coop']);
const KEY_LOADOUT = 'brett.loadout';

export function createModeState({ storage = window.localStorage } = {}) {
  let mode = 'coaching';
  const listeners = new Map();
  function emit(type, payload) { (listeners.get(type) || []).forEach(fn => fn(payload)); }

  function readLoadout() {
    try { return JSON.parse(storage.get?.(KEY_LOADOUT) ?? storage.getItem?.(KEY_LOADOUT)); } catch { return null; }
  }
  function writeLoadout(l) {
    const v = JSON.stringify(l);
    storage.set ? storage.set(KEY_LOADOUT, v) : storage.setItem(KEY_LOADOUT, v);
  }

  return {
    current: () => mode,
    setMode(m) {
      if (STUB.has(m)) { emit('stub-attempted', m); return false; }
      if (!VALID.has(m)) return false;
      mode = m;
      emit('change', mode);
      return true;
    },
    loadout: () => readLoadout() ?? { melee: 'club', ranged: 'handgun' },
    setLoadout(l) { writeLoadout(l); emit('loadout-change', l); },
    on(type, fn) {
      const arr = listeners.get(type) || [];
      arr.push(fn); listeners.set(type, arr);
    },
  };
}
```

- [ ] **Step 3: Tests grün, commit**

```bash
git add brett/test/mode-state.test.js brett/public/assets/mode-state.js
git commit -m "feat(brett): mode state machine + loadout persistence"
```

### Task 4.2: mode-select Overlay

**Files:**
- Create: `brett/public/assets/mode-select.js`

- [ ] **Step 1: Markup + Logik**

```js
// brett/public/assets/mode-select.js
export function showModeSelect(modeState) {
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'mode-select-overlay';
    el.innerHTML = `
      <div class="mode-select-card">
        <h2>Wähle deinen Modus</h2>
        <div class="mode-grid">
          <button class="mode-card" data-mode="coaching">
            <div class="title">Coaching</div>
            <div class="sub">Systemische Aufstellung</div>
          </button>
          <button class="mode-card" data-mode="ffa">
            <div class="title">FFA</div>
            <div class="sub">Jeder gegen jeden</div>
          </button>
          <button class="mode-card disabled" data-mode="teams" disabled>
            <div class="title">Teams</div>
            <div class="sub">Coming soon</div>
          </button>
          <button class="mode-card disabled" data-mode="coop" disabled>
            <div class="title">Coop</div>
            <div class="sub">Coming soon</div>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    el.addEventListener('click', e => {
      const card = e.target.closest('.mode-card');
      if (!card || card.disabled) return;
      const mode = card.dataset.mode;
      modeState.setMode(mode);
      el.remove();
      resolve(mode);
    });
  });
}
```

- [ ] **Step 2: CSS in style.css**

```css
.mode-select-overlay {
  position: fixed; inset: 0; background: rgba(11,17,28,0.85);
  display: grid; place-items: center; z-index: 100;
}
.mode-select-card {
  background: var(--ink-800); border: 1px solid var(--brass-mute);
  padding: 32px; border-radius: 12px; max-width: 720px; width: 90%;
}
.mode-select-card h2 { margin-top: 0; color: var(--brass-hi); }
.mode-grid {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;
  margin-top: 24px;
}
.mode-card {
  background: var(--ink-900); border: 1px solid var(--brass-mute);
  border-radius: 8px; padding: 24px; cursor: pointer; color: inherit;
  text-align: left; transition: border-color 120ms, transform 120ms;
}
.mode-card:hover:not(.disabled) { border-color: var(--brass-hi); transform: translateY(-2px); }
.mode-card.disabled { opacity: 0.4; cursor: not-allowed; }
.mode-card .title { font-size: 20px; color: var(--brass-hi); }
.mode-card .sub { font-size: 13px; color: var(--brass); margin-top: 4px; }
```

- [ ] **Step 3: Commit**

```bash
git add brett/public/assets/mode-select.js brett/public/assets/style.css
git commit -m "feat(brett): mode-select overlay with FFA active, Teams/Coop stubs"
```

### Task 4.3: Spawn-Loadout-Modal

**Files:**
- Create: `brett/public/assets/loadout-modal.js`

- [ ] **Step 1: Implementierung**

```js
// brett/public/assets/loadout-modal.js
const MELEE = ['club', 'katana'];
const RANGED = ['handgun']; // only handgun is starter; rifle/fireball are pickups

export function showLoadoutModal(modeState) {
  const current = modeState.loadout();
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'mode-select-overlay';
    el.innerHTML = `
      <div class="mode-select-card">
        <h2>Wähle deine Startausrüstung</h2>
        <div class="loadout-cols">
          <div>
            <h3>Nahkampf</h3>
            ${MELEE.map(w => `<button class="weapon-pick ${current.melee===w?'active':''}" data-slot="melee" data-w="${w}">
              <img src="assets/hud/icon-${w}.png" alt="">
              <span>${w}</span>
            </button>`).join('')}
          </div>
          <div>
            <h3>Fernkampf</h3>
            ${RANGED.map(w => `<button class="weapon-pick ${current.ranged===w?'active':''}" data-slot="ranged" data-w="${w}">
              <img src="assets/hud/icon-${w}.png" alt="">
              <span>${w}</span>
            </button>`).join('')}
          </div>
        </div>
        <button class="confirm">Spielen</button>
      </div>
    `;
    document.body.appendChild(el);
    const sel = { ...current };
    el.addEventListener('click', e => {
      const w = e.target.closest('.weapon-pick');
      if (w) {
        sel[w.dataset.slot] = w.dataset.w;
        el.querySelectorAll(`[data-slot="${w.dataset.slot}"]`).forEach(b => b.classList.toggle('active', b === w));
        return;
      }
      if (e.target.classList.contains('confirm')) {
        modeState.setLoadout(sel);
        el.remove();
        resolve(sel);
      }
    });
  });
}
```

- [ ] **Step 2: CSS in style.css**

```css
.loadout-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 16px 0; }
.loadout-cols h3 { color: var(--brass); font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; }
.weapon-pick {
  display: flex; gap: 12px; align-items: center; width: 100%;
  background: var(--ink-900); border: 1px solid var(--brass-mute);
  padding: 8px 12px; margin: 4px 0; border-radius: 6px;
  cursor: pointer; color: inherit;
}
.weapon-pick.active { border-color: var(--brass-hi); background: var(--ink-800); }
.weapon-pick img { width: 32px; height: 32px; }
.confirm {
  background: var(--brass); color: var(--ink-900); border: 0;
  padding: 10px 24px; border-radius: 6px; cursor: pointer; font-weight: 600;
}
.confirm:hover { background: var(--brass-hi); }
```

- [ ] **Step 3: Commit**

```bash
git add brett/public/assets/loadout-modal.js brett/public/assets/style.css
git commit -m "feat(brett): spawn loadout modal"
```

### Task 4.4: Wire main.js — Mode-Flow

**Files:**
- Modify: `brett/public/assets/main.js`

- [ ] **Step 1: Mode-Flow ersetzt Debug-Toggle**

```js
// brett/public/assets/main.js
import { createModeState } from './mode-state.js';
import { showModeSelect } from './mode-select.js';
import { showLoadoutModal } from './loadout-modal.js';
import { setLightIntensity } from './scene.js';
import * as Hud from './combat/combat-hud.js';

// ... existing imports + ws + scene init ...

const modeState = createModeState();
modeState.on('change', mode => {
  setLightIntensity(mode);
  if (mode === 'ffa') startCombat();
  if (mode === 'coaching') stopCombat();
});

async function startCombat() {
  await showLoadoutModal(modeState);
  Hud.mountCombatHud(document.getElementById('overlay-root'));
  const { startCombat: start } = await import('./combat/controller.js');
  start({ scene, camera, players, self: localPlayer, ws, hudRoot: document.getElementById('overlay-root') });
}
function stopCombat() {
  Hud.setVisible(document.getElementById('overlay-root'), false);
}

// Auf Start: Mode-Select zeigen
showModeSelect(modeState);
```

- [ ] **Step 2: Smoke-Test:** Browser-Reload → Mode-Select erscheint → FFA wählen → Loadout-Modal → Spielen → HUD da
- [ ] **Step 3: Commit**

```bash
git add brett/public/assets/main.js
git commit -m "feat(brett): wire mode-select → loadout → combat flow"
```

### ✅ Phase 4 Checkpoint

- [ ] Mode-Select beim Page-Load
- [ ] Loadout-Persistenz über Reload hinweg (localStorage)
- [ ] Teams/Coop-Karten disabled
- [ ] PR-Schnittpunkt: "Brett Mode Flow"

---

## Phase 5 — Mobile/Touch

**Ziel:** Dual-Joystick, Touch-HUD, Bottom-Sheet-Editor.

### Task 5.1: joystick.js — Wiederverwendbar

**Files:**
- Create: `brett/public/assets/touch/joystick.js`

- [ ] **Step 1: Implementierung**

```js
// brett/public/assets/touch/joystick.js
export function mountJoystick({ side, onMove, onSprint, onTap }) {
  const el = document.createElement('div');
  el.className = `joystick joystick-${side}`;
  el.innerHTML = `<div class="ring"></div><div class="knob"></div>`;
  document.body.appendChild(el);
  const ring = el.querySelector('.ring');
  const knob = el.querySelector('.knob');

  let active = null;
  let originX = 0, originY = 0;
  const radius = 60;
  let sprintTimer = 0;
  let lastTap = 0;

  function onStart(e) {
    if (active !== null) return;
    const t = e.touches?.[0] ?? e;
    active = t.identifier ?? 'mouse';
    originX = t.clientX; originY = t.clientY;
    el.style.left = (originX - 70) + 'px';
    el.style.top = (originY - 70) + 'px';
    el.classList.add('visible');
    sprintTimer = Date.now();
    e.preventDefault();
  }
  function onMoveEvt(e) {
    if (active === null) return;
    const t = [...(e.touches ?? [e])].find(x => (x.identifier ?? 'mouse') === active);
    if (!t) return;
    let dx = t.clientX - originX, dy = t.clientY - originY;
    const d = Math.hypot(dx, dy);
    if (d > radius) { dx = dx/d * radius; dy = dy/d * radius; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const nx = dx / radius, ny = dy / radius;
    onMove?.({ x: nx, y: ny });
    if (d >= radius * 0.95 && Date.now() - sprintTimer > 1500) onSprint?.(true);
  }
  function onEnd(e) {
    const t = [...(e.changedTouches ?? [e])].find(x => (x.identifier ?? 'mouse') === active);
    if (!t || active === null) return;
    knob.style.transform = '';
    onMove?.({ x: 0, y: 0 });
    onSprint?.(false);
    const dur = Date.now() - sprintTimer;
    if (dur < 200) {
      if (Date.now() - lastTap < 300) onTap?.({ doubleTap: true });
      else onTap?.({ doubleTap: false });
      lastTap = Date.now();
    }
    active = null;
    el.classList.remove('visible');
  }

  el.addEventListener('touchstart', onStart, { passive: false });
  el.addEventListener('touchmove', onMoveEvt, { passive: false });
  el.addEventListener('touchend', onEnd);
  el.addEventListener('touchcancel', onEnd);

  return { destroy: () => el.remove() };
}
```

- [ ] **Step 2: CSS**

```css
.joystick {
  position: fixed; width: 140px; height: 140px;
  background: rgba(11,17,28,0.4); border: 1px solid var(--brass-mute);
  border-radius: 50%; display: none; pointer-events: auto;
}
.joystick.visible { display: block; }
.joystick-left { bottom: 24px; left: 24px; display: block; }
.joystick-right { bottom: 24px; right: 24px; display: block; }
.joystick .ring { position: absolute; inset: 10px; border: 1px dashed var(--brass-mute); border-radius: 50%; }
.joystick .knob {
  position: absolute; top: 50%; left: 50%; width: 50px; height: 50px;
  margin: -25px 0 0 -25px; background: var(--brass); border-radius: 50%;
  transition: transform 60ms ease-out;
}
@media (pointer: fine) { .joystick { display: none !important; } }
```

- [ ] **Step 3: Commit**

```bash
git add brett/public/assets/touch/joystick.js brett/public/assets/style.css
git commit -m "feat(brett): touch joystick component"
```

### Task 5.2: touch-hud.js — Fire + Reload + Weapon-Wheel

**Files:**
- Create: `brett/public/assets/touch/touch-hud.js`

- [ ] **Step 1: Implementierung**

```js
// brett/public/assets/touch/touch-hud.js
export function mountTouchHud({ onFireStart, onFireEnd, onReload, onWeaponSwitch }) {
  const wrap = document.createElement('div');
  wrap.id = 'touch-hud';
  wrap.innerHTML = `
    <button class="fire-btn" aria-label="Fire">●</button>
    <button class="reload-btn" aria-label="Reload">R</button>
  `;
  document.body.appendChild(wrap);

  const fire = wrap.querySelector('.fire-btn');
  fire.addEventListener('touchstart', e => { onFireStart?.(); e.preventDefault(); });
  fire.addEventListener('touchend', e => { onFireEnd?.(); e.preventDefault(); });
  wrap.querySelector('.reload-btn').addEventListener('touchend', () => onReload?.());

  return { destroy: () => wrap.remove() };
}
```

- [ ] **Step 2: CSS**

```css
#touch-hud { pointer-events: none; }
#touch-hud .fire-btn {
  position: fixed; bottom: 200px; right: 32px;
  width: 80px; height: 80px; border-radius: 50%;
  background: var(--brass); color: var(--ink-900);
  border: 0; font-size: 24px; pointer-events: auto;
}
#touch-hud .reload-btn {
  position: fixed; bottom: 290px; right: 50px;
  width: 50px; height: 50px; border-radius: 50%;
  background: var(--ink-800); color: var(--brass-hi);
  border: 1px solid var(--brass); pointer-events: auto;
}
@media (pointer: fine) { #touch-hud { display: none; } }
```

- [ ] **Step 3: Commit**

```bash
git add brett/public/assets/touch/touch-hud.js brett/public/assets/style.css
git commit -m "feat(brett): touch fire + reload buttons"
```

### Task 5.3: Wire Touch in main + Combat-Controller

**Files:**
- Modify: `brett/public/assets/combat/controller.js` (Fire-API extrahieren)
- Modify: `brett/public/assets/main.js`

- [ ] **Step 1: Fire-Funktion exportierbar machen** in controller.js — `startCombat` returnt `{ fire, reload, toggleSlot, destroy }`
- [ ] **Step 2: Touch-Detection in main.js**

```js
// in startCombat() in main.js:
const isTouch = matchMedia('(pointer: coarse)').matches;
const ctl = start({ … });
if (isTouch) {
  const { mountJoystick } = await import('./touch/joystick.js');
  const { mountTouchHud } = await import('./touch/touch-hud.js');
  const leftStick = mountJoystick({ side: 'left', onMove: ({x,y}) => localPlayer.setMoveInput(x, y) });
  const rightStick = mountJoystick({ side: 'right', onMove: ({x,y}) => localPlayer.setAimDelta(x, y) });
  const touchHud = mountTouchHud({
    onFireStart: () => ctl.startFire(), onFireEnd: () => ctl.stopFire(),
    onReload: () => ctl.reload(),
  });
}
```

- [ ] **Step 3: localPlayer.setMoveInput / setAimDelta** in player-avatar.js ergänzen (existiert; analog zu WASD)
- [ ] **Step 4: Real-Device-Smoke-Test auf iPhone + Android** — beide Sticks bewegen, Feuer-Button feuert, kein Scroll-Lock-Problem
- [ ] **Step 5: Commit**

```bash
git add brett/public/assets/combat/controller.js brett/public/assets/main.js brett/public/assets/mayhem/player-avatar.js
git commit -m "feat(brett): wire dual joystick + touch fire button to combat"
```

### Task 5.4: Bottom-Sheet für Figuren-Editor + Drag-Trägheit

**Files:**
- Modify: `brett/public/assets/style.css` (mobile-Layout für `#fig-panel`)
- Modify: `brett/public/assets/scene.js` (Drag-Inertia)

- [ ] **Step 1: CSS-Mediaquery für Bottom-Sheet**

```css
@media (pointer: coarse) {
  #fig-panel {
    position: fixed; bottom: 0; left: 0; right: 0; top: auto;
    border-radius: 16px 16px 0 0; max-height: 60vh;
    transform: translateY(100%); transition: transform 200ms ease-out;
  }
  #fig-panel.open { transform: translateY(0); }
  /* Swipe-Indicator */
  #fig-panel::before {
    content: ''; display: block; width: 40px; height: 4px;
    margin: 8px auto; background: var(--brass-mute); border-radius: 2px;
  }
}
```

- [ ] **Step 2: Swipe-Down-Handler für Bottom-Sheet** in scene.js (oder dedicated fig-panel.js)
- [ ] **Step 3: Drag-Trägheit für Figuren** — bei pointerup velocity behalten, exponential decay (~150ms)
- [ ] **Step 4: Commit**

```bash
git add brett/public/assets/style.css brett/public/assets/scene.js
git commit -m "feat(brett): mobile bottom-sheet editor + drag inertia"
```

### ✅ Phase 5 Checkpoint

- [ ] iPhone: Mode-Select touch-fähig, FFA spielbar mit Dual-Joystick
- [ ] Android: gleiches
- [ ] Coaching-Mode auf Mobile: Figuren-Editor als Bottom-Sheet, Drag mit Trägheit
- [ ] Desktop unverändert (kein Joystick sichtbar)

---

## Phase 6 — Tests, Polish, CI

### Task 6.1: Death-Cam + Respawn-Overlay

**Files:**
- Create: `brett/public/assets/combat/respawn.js`
- Modify: `brett/public/assets/combat/controller.js`

- [ ] **Step 1: Overlay-Komponente**

```js
// brett/public/assets/combat/respawn.js
export function showRespawnOverlay({ killerName, durationMs = 3000 }) {
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'respawn-overlay';
    el.innerHTML = `
      <div class="card">
        <div class="msg">Eliminiert ${killerName ? 'von ' + killerName : ''}</div>
        <div class="countdown">3</div>
      </div>
    `;
    document.body.appendChild(el);
    const cdEl = el.querySelector('.countdown');
    let left = Math.ceil(durationMs / 1000);
    const tick = setInterval(() => {
      left--;
      if (left <= 0) { clearInterval(tick); el.remove(); resolve(); }
      else cdEl.textContent = left;
    }, 1000);
  });
}
```

- [ ] **Step 2: CSS**

```css
.respawn-overlay {
  position: fixed; inset: 0; background: rgba(168,58,48,0.15);
  backdrop-filter: blur(4px); display: grid; place-items: center; z-index: 200;
}
.respawn-overlay .card {
  background: var(--ink-800); border: 1px solid var(--brass);
  padding: 32px 64px; border-radius: 12px; text-align: center;
}
.respawn-overlay .msg { color: var(--brass-hi); font-size: 18px; margin-bottom: 12px; }
.respawn-overlay .countdown { color: var(--brass); font-size: 64px; font-weight: 700; }
```

- [ ] **Step 3: Wiring in controller.js bei death_event für lokalen Spieler**
- [ ] **Step 4: Commit**

### Task 6.2: Score-Map + Score-Updates

**Files:**
- Modify: `brett/public/assets/combat/controller.js`

- [ ] **Step 1: In-Memory-Score-Map per Raum** (Map<player_id, kills>), incrementiert beim death_event mit killer_id
- [ ] **Step 2: Hud.setScores nach jedem Update aufrufen**
- [ ] **Step 3: Smoke-Test mit 2-3 Tabs**
- [ ] **Step 4: Commit**

### Task 6.3: Pickups visualisieren + auto-spawn

**Files:**
- Modify: `brett/public/assets/combat/controller.js`
- Modify: `brett/server.js` (initial-spawn on first FFA-join)

- [ ] **Step 1: Drei Pickup-Mesh-Slots auf dem Brett-Boden anlegen** (Three.js Octahedron mit applySignature, Brass-Glow via PointLight darüber)
- [ ] **Step 2: Server spawnt initial 3 Pickups** beim ersten ffa-join in einem Raum: 2× rifle, 1× fireball
- [ ] **Step 3: Client: pickup_spawned / pickup_taken Events handhaben**
- [ ] **Step 4: Commit**

### Task 6.4: CI-Job für brett-server

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Prüfen ob bereits brett-Test-Job existiert**

```bash
grep -nE "brett.*test|node.*--test.*brett" .github/workflows/ci.yml
```

- [ ] **Step 2: Falls fehlt — Job analog zu arena-server-Job ergänzen**

```yaml
brett-server-test:
  name: Brett Server Tests
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: '20' }
    - run: npm ci --prefix brett
    - run: cd brett && node --test test/
```

- [ ] **Step 3: Commit**

### Task 6.5: Final Smoke + Workspace-Deploy

- [ ] **Step 1: `task test:all` muss grün sein**
- [ ] **Step 2: `task brett:deploy ENV=dev` und alle Modi durchklicken**
- [ ] **Step 3: Real-Device-Test iOS + Android**
- [ ] **Step 4: `task brett:build && task feature:brett`** (beide Prod-Cluster)
- [ ] **Step 5: Verify https://brett.mentolder.de und https://brett.korczewski.de**
- [ ] **Step 6: PR-Body schreiben mit Screenshots Desktop + Mobile + Mode-Selector**

### ✅ Phase 6 Checkpoint

- [ ] Vollständiger Smoke: Mode-Select → FFA → Loadout → Combat → Tod → Respawn
- [ ] Tests + CI grün
- [ ] PR offen oder gemerged

---

## Out-of-Scope-Reminders (für separate Folge-Pläne)

- Teams-Modus Logik
- Coop vs. KI-Vehicles
- Audio-Files (.ogg) — die Specs aus Asset-Pack-README sammeln und als eigenen Plan
- 3D-Modelle (.glb) statt Primitive
- Map-Editor / mehrere Maps
- Persistente Profile / Match-Stats
- Mobile-Performance-Tuning für schwache Android-Geräte
- T000404 brett-projectiles — nach Phase 3 prüfen ob Fireball es ersetzt, ggf. Ticket schließen

## Risiken & Watchpoints

- **Asset-Pack-Extraction-Script** kann am variierenden Claude-Artifact-Format scheitern → Plan B: manuelle Extraktion, Filenames-Konvention beibehalten
- **iOS-Safari + WebGL + Pointer-Events** kann zicken (z.B. AudioContext nur nach User-Gesture, Pointer-Lock nicht unterstützt) — früh testen
- **Visual-Reskin auf Coaching-Mode**: Patrick noch nicht überzeugt; ggf. Theme-Toggle als Setting nachziehen
- **Mode-Switch im selben Raum**: Spec hat das offen gelassen (Open Question B.9) — Default-Implementierung ist „selber Raum, Mode-Layer", d.h. man sieht beide Modi gleichzeitig. Falls Patrick getrennte Räume will, muss `mayhem_mode`-Boolean durch `mode`-String ersetzt werden auf Server-Seite.
