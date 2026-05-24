# Mayhem Duel-Mode mit 4 Helden — Design Spec

**Branch:** `feature/mayhem-duel-heroes`
**Grilling-Ticket:** T000248
**Datum:** 2026-05-24
**Umsetzungsstrategie:** Vertikale Scheiben (Patrick → Tina → Martina → Oskar → PvAI)

---

## 1. Überblick

Der bestehende Mayhem-Mode wird um einen 1v1-Duel-Mode mit 4 einzigartigen Helden erweitert. Zwei Spieler kämpfen, zwei schauen zu (Spectators). Vor jeder Runde wählen die Kämpfer ihren Helden (gesperrt für diese Runde). Best-of-3-Rundenformat. PvAI-Modus erlaubt Einzelspieler-Training gegen eine rule-based KI.

**Neue Dateien:**
- `brett/public/assets/mayhem/heroes.js` — Hero-Datendefinitionen + HeroSystem
- `brett/public/assets/mayhem/hero-select.js` — Hero-Select-Modal DOM-Baukasten

**Modifizierte Dateien:**
- `brett/public/assets/mayhem/game-mode.js` — DUEL-Mode, Phase-State, Best-of-3
- `brett/public/assets/mayhem/mayhem.js` — Crosshair, Duel-Lifecycle, Spectator-Cam
- `brett/public/assets/mayhem/obstacles.js` — `buildDuelArena()`
- `brett/public/assets/mayhem/weapons.js` — 10 neue Ability-Weapon-Defs
- `brett/public/assets/mayhem/projectiles.js` — 3 neue Projektil-Mesh-Factories
- `brett/public/assets/mayhem/player-avatar.js` — `heroId`, `speedMultiplier`, `resetHero()`
- `brett/public/assets/mayhem/effects.js` — Frostnova-Burst, Kettenblitz-Arc
- `brett/public/assets/mayhem/audio.js` — 8 neue SFX-Map-Einträge
- `brett/public/assets/mayhem/ai-bot.js` — Hero-spezifische KI-Profile
- `brett/public/assets/mayhem/physics.js` — `aabbRay()` für Sichtlinie
- `brett/server.js` — `'duel'` zur Whitelist, `duelRooms`-Map, neue Relay-Types

---

## 2. Architektur

### Datenfluss

```
User wählt Duel-Mode (G-Taste oder Admin-Panel)
  → GameModeManager.setMode('duel')
  → phase = 'hero-select'
  → buildHeroSelectModal() gerendert

Kämpfer wählt Hero
  → hero_select { heroId } → Server relay → alle Clients
  → assignHero(avatar, heroId)

Beide gewählt (Host erkennt)
  → duel_start { playerA, playerB } → Server relay
  → phase = 'fighting'
  → buildDuelArena() aufgerufen
  → Runde startet

Spieler stirbt
  → hit → processLocalHit → hp = 0 → duel_round_end { winner, winsA, winsB }
  → winsA oder winsB < 2: 3s Pause → neue Runde, gleiche Helden
  → winsA oder winsB === 2: duel_match_end { winner } → Sieger-Screen

Spectator
  → player_join { spectator: true }
  → kein Avatar, kein Hero-Select (read-only Modal)
  → Follow-Cam oder Fly-Cam
```

### Kern-Invariante

Der Server bleibt ein reiner Relay. Siege werden client-seitig beim Host gezählt. Der Host ist autorisiert für `duel_round_end` und `duel_match_end`. Bei Host-Disconnect sendet der Server `duel_match_end { winner: null, reason: 'disconnect' }`.

---

## 3. Crosshair-System

**Ansatz:** Horizontaler Raycast auf `y=0`-Plane. Entkoppelt Schussrichtung von Bewegungsrichtung.

### Neue Variablen in `mayhem.js`

```js
_crosshairMesh  // RingGeometry(0.18, 0.25, 32), brass-game Farbe, y=0.05
_aimPlane       // THREE.Plane(new THREE.Vector3(0,1,0), 0)
_aimDir         // THREE.Vector3 — wird jede Frame neu berechnet
_aimPoint       // THREE.Vector3 — Kreuzungspunkt Maus-Ray / Plane
```

### Tick-Update (vor dem Schuss)

```
MouseEvent → raycaster.setFromCamera(mouseNDC, camera)
           → raycaster.ray.intersectPlane(_aimPlane, _aimPoint)
           → _aimDir = normalize(_aimPoint - localAvatar.pos)
           → _crosshairMesh.position.copy(_aimPoint)
```

Alle `onFire()`-Aufrufe erhalten `_aimDir` statt des aus `facingY` abgeleiteten Vektors. `facingY` bleibt für die Bewegungs-Animation.

**Mobile:** `touchmove`-Event → normalisierte Touch-Position → gleicher Raycaster-Pfad.

**Spectators:** `_crosshairMesh` und Aim-Input deaktiviert wenn `_isSpectator = true`.

---

## 4. Duel-Mode Lifecycle

### `game-mode.js` — Erweiterungen

```js
MODES = { WARMUP, DEATHMATCH, LMS, COOP, DUEL }

// Neuer Zustand:
duelState = { winsA: 0, winsB: 0, bestOf: 3, playerA: null, playerB: null }
phase = 'hero-select' | 'fighting'
```

- `MODES_CYCLE` in `mayhem.js` — `'duel'` anhängen: `['warmup', 'deathmatch', 'lms', 'coop', 'duel']`
- `setMode('duel')` → setzt `phase = 'hero-select'`, ruft `onHeroSelectStart()`
- `handleDuelDeath(deadId)` → erhöht Sieger-Wins
  - Wins < 2: `onRoundEnd()` (3s Ergebnis-Anzeige, neue Runde, gleiche Helden)
  - Wins === 2: `onMatchEnd(winnerId)`
- Neuer Callback: `onDuelEnd(result)` analog zu `onLmsEnd`

### `server.js` — Änderungen

```js
// Zeile 718 — Whitelist erweitern:
['warmup', 'deathmatch', 'lms', 'coop', 'duel']

// RELAY_TYPES hinzufügen:
'hero_select', 'duel_start', 'duel_round_end', 'duel_match_end',
'hero_stealth', 'hero_teleport', 'minion_spawn', 'minion_update', 'minion_die'

// TRANSIENT_TYPES (kein DB-Persist):
'hero_select', 'duel_start', 'hero_stealth', 'hero_teleport',
'minion_update'

// Neue duelRooms Map (analog zu lmsAlive):
const duelRooms = new Map()  // room → { playerA, playerB, winsA, winsB }
```

### WebSocket-Nachrichten

| Message | Felder | Transient |
|---|---|---|
| `hero_select` | `{ heroId }` | ja |
| `duel_start` | `{ playerA, playerB }` | ja |
| `duel_round_end` | `{ winner, winsA, winsB }` | nein |
| `duel_match_end` | `{ winner, reason? }` | nein |
| `hero_stealth` | `{ active: bool }` | ja |
| `hero_teleport` | `{ x, z }` | ja |
| `minion_spawn` | `{ minionId, x, z, ownerId }` | nein |
| `minion_update` | `{ minionId, x, z }` | ja |
| `minion_die` | `{ minionId }` | nein |

---

## 5. Hero-Select UI

**Neues Modul:** `hero-select.js` — `buildHeroSelectModal(heroes, myHeroLocked, onSelect)`

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  WÄHLE DEINEN HELDEN          · 2 / 2 gewählt           │
│                                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ [Gesicht]│ │ [Gesicht]│ │ [Gesicht]│ │ [Gesicht]│  │
│  │  Tina    │ │ Martina  │ │  Oskar   │ │ Patrick  │  │
│  │ ·Frost   │ │ ·Minion  │ │ ·Motorrad│ │ ·Katana  │  │
│  │ ·Feuer   │ │ ·Shield  │ │ ·Auto    │ │ ·Pistole │  │
│  │ ·Blitz   │ │ ·Raserei │ │ ·Repair  │ │ ·Rifle   │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│                                                         │
│  Gegner wählt noch …                     [Spielen ›]   │
└─────────────────────────────────────────────────────────┘
```

### Visuelle Regeln (Design-System)

- Substrate: `--ink-800`, Border: `1px solid var(--line)`, Radius: `var(--r-card)` (14px)
- Heading: Geist Mono, `letter-spacing: 0.18em`, brass-game
- Aktive Karte (eigene Wahl): `border-color: var(--brass-game)` + `box-shadow: var(--shadow-ring-brass)`
- Gesperrte Karte (Gegner hat gewählt): `opacity: 0.35`, `pointer-events: none`
- Figuren-Preview: figure-pack PNGs gestapelt (Gesicht + Haar + Kleidung) als `<img>`-Layer
- Ability-Liste: Geist Mono 11px, `color: var(--parchment-2)`, middle-dot-getrennt (`·`)
- Spectator-Modal: alle Karten `opacity: 0.35`, kein "Spielen"-Button

### Hero-Figurendaten (figure-pack)

| Hero | Gesicht | Haar | Kleidung | Haar-Tint |
|---|---|---|---|---|
| Tina | `curious` | `hair-long` | `robe` | `hue-rotate(320deg) saturate(180%)` → rot |
| Martina | `resolved` | `hair-long` | `coat` | `sepia(60%) hue-rotate(30deg)` → blond |
| Oskar | `observing` | `hair-short` | `vest` | `sepia(40%) hue-rotate(30deg)` → blond |
| Patrick | `present` | `hair-short` | — | Standard |

### Scheibe-1-Einschränkung

Tina, Martina, Oskar erscheinen im Hero-Select als `[Bald verfügbar]`-Karten (ausgegraut, nicht wählbar) bis ihre jeweilige Scheibe implementiert ist.

---

## 6. Arena-Design

**Neue Funktion:** `buildDuelArena(THREE, scene)` in `obstacles.js`
**Rückgabe:** `{ obstacles: AABB[], meshes: Mesh[] }` — identisches Interface wie `buildObstacles()`

### Grundriss (symmetrisch, FIELD_HALF = 9)

```
╔═══════════════════════════════╗
║  [Säule]           [Säule]   ║
║                               ║
║     ┌───┐       ┌───┐        ║
║     │ C │       │ C │        ║   C = Deckungsbox (2×1.5×1)
║     └───┘       └───┘        ║
║                               ║
║  ┌────────┐ ┌────────┐       ║
║  │   L    │ │   L    │       ║   L = L-förmige Mitteldeckung
║  └────────┘ └────────┘       ║
║                               ║
║     ┌───┐       ┌───┐        ║
║     │ C │       │ C │        ║
║     └───┘       └───┘        ║
║  [Säule]           [Säule]   ║
╚═══════════════════════════════╝
```

### Geometrie-Elemente

| Element | Geometrie | Material | Anzahl |
|---|---|---|---|
| Außenwände | `BoxGeometry(18, 3, 0.4)` | transparent, nur AABB | 4 |
| Ecksäulen | `CylinderGeometry(0.4, 0.4, 3)` | `color: 0x2a3040` + `EdgesGeometry` brass-game | 4 |
| Deckungsboxen | `BoxGeometry(2, 1.5, 1)` | `color: 0x17202e` | 4 |
| L-Mitteldeckungen | zusammengesetzte Box | `color: 0x17202e` | 2 |
| Boden-Markierung | `RingGeometry` Mitte | brass-game, `opacity: 0.3` | 1 |
| Ambiente-Lichter | `PointLight` | brass-game `#d7b06a`, Intensität 0.4 | 4 Ecken |

**Sichtlinie-Blockierung:** Alle Wände und Deckungsboxen sind solide Meshes mit AABBs. Neue `aabbRay(from, to, obstacles)` in `physics.js` (Slab-Method) für PvAI Line-of-Sight.

---

## 7. Spectator-System

### Erkennung

Beim Betreten eines Duel-Rooms mit bereits 2 Kämpfern: `_isSpectator = true`. Kein Avatar gespawnt. Server erhält `player_join { spectator: true }`.

### Kamera-Modi

**Modus 1 — Follow-Cam (Standard)**
- Nutzt bestehende `chase-camera.js` direkt
- Tab-Taste: `_spectatorTarget` wechselt zwischen playerA / playerB
- Mobile: Tap auf Spieler-Portrait im HUD
- Spectator sieht HP-Bar und Ability-Cooldowns des gefolgten Spielers

**Modus 2 — Freie Fly-Cam (F-Taste toggle)**
- Chase-Camera deaktiviert, Pointer-Lock angefragt
- WASD = horizontale Bewegung, Q/E = hoch/runter, Maus = Blickrichtung
- Geclampt auf `FIELD_HALF + 4` in jede Richtung, max Höhe 8
- F erneut → zurück zu Follow-Cam, Pointer-Lock freigegeben

### Spectator-HUD

```
[Tina ████░░ 60HP]              [Patrick ██████ 90HP]   ← Portraits oben
         RUNDE 2 · TINA 1 — 0 PATRICK                   ← Mitte oben
    ZUSCHAUER · Tab = wechseln · F = freie Kamera        ← Unten, Geist Mono
```

Kein Waffen-Slot, keine Ammo-Anzeige.

---

## 8. Hero-System & `heroes.js`

```js
export const HEROES = {
  patrick: {
    id: 'patrick', name: 'Patrick',
    description: 'Softwareentwickler · Katana · Pistole · Rifle',
    color: 0x6f8db8,           // joint-knee blau
    figure: { face: 'present', hair: 'hair-short', clothing: null },
    abilities: ['katana', 'handgun', 'rifle'],
    passive: null,
    special: {
      stealth:   { key: 4, durationMs: 2000, cooldownMs: 8000 },
      teleport:  { key: 5, rangeTiles: 5,    cooldownMs: 6000 }
    }
  },
  tina: {
    id: 'tina', name: 'Tina',
    description: 'Hexe · Frostnova · Feuerball · Kettenblitz',
    color: 0xa83a30,           // blood-core rot
    figure: { face: 'curious', hair: 'hair-long', clothing: 'robe' },
    abilities: ['frostnova', 'fireball', 'chainlightning'],
    passive: null
  },
  martina: {
    id: 'martina', name: 'Martina',
    description: 'Teamleiterin · Minion · Shield · Raserei',
    color: 0xb8c0a8,           // sage
    figure: { face: 'resolved', hair: 'hair-long', clothing: 'coat' },
    abilities: ['summon_minion', 'shield_minion', 'frenzy_minion'],
    passive: { maxMinions: 2 }
  },
  oskar: {
    id: 'oskar', name: 'Oskar',
    description: 'Mechaniker · Motorrad · Auto · Reparatur',
    color: 0xc8a96e,           // brass (Mechaniker-Messing)
    figure: { face: 'observing', hair: 'hair-short', clothing: 'vest' },
    abilities: ['vehicle_switch', 'vehicle_repair', 'motorcycle_sprint'],
    passive: { startsInVehicle: 'motorcycle' }
  }
}

export function assignHero(avatar, heroId) {
  const h = HEROES[heroId]
  avatar.heroId = heroId
  avatar.heroColor = h.color
  avatar.weaponSystem = new WeaponSystem(h.abilities)
  avatar.setTorsoColor(h.color)
  if (h.passive?.startsInVehicle) {
    Vehicle.spawn(h.passive.startsInVehicle, avatar.pos, avatar)
  }
}
```

### `player-avatar.js` — Erweiterungen

| Neues Feld | Typ | Zweck |
|---|---|---|
| `heroId` | string\|null | Hero-Identität, mitgesendet in `getStatePayload()` |
| `speedMultiplier` | number (1.0) | Slow-Debuff (Frostnova), Sprint-Boost |
| `shielded` | bool (false) | Martinas Shield-Minion absorbiert nächsten Hit |

- `resetHero()` — wie `resetHp()` aber setzt auch Ability-Cooldowns zurück
- `getStatePayload()` — `heroId` hinzugefügt (für Late-Join-Sync)
- `setTorsoColor(hex)` — setzt `mannequin.body.material.color`

---

## 9. Scheibe 1 — Patrick

Patrick nutzt ausschließlich bestehende Waffen (`katana`, `handgun`, `rifle`). Zwei neue Spezialfähigkeiten:

### Unsichtbarkeit (Taste 4)

- Avatar-Mesh: `opacity → 0.15` (transluzent, lokal noch sichtbar)
- Remote-Clients: `hero_stealth { active: true }` → Avatar `visible = false`
- Nach 2000ms: automatisch aufgehoben, `hero_stealth { active: false }`
- Cooldown 8000ms, Cooldown-Ring im HUD

### Teleportation (Taste 5)

- Ziel: Crosshair-Position, geclampt auf 5 Tiles Distanz
- `avatar.position.copy(clampedAimPoint)`
- `hero_teleport { x, z }` → Remote-Clients springen Avatar sofort an Position
- Partikel: bestehender `smoke-puff` Sprite an alter + neuer Position
- Cooldown 6000ms

---

## 10. Scheibe 2 — Tina (Hexe)

### Neue Weapon-Defs in `weapons.js`

```js
frostnova: {
  damage: 40, cooldownMs: 5000,
  projectileType: 'frostnova',
  aoeRadius: 2.5, slowFactor: 0.4, slowDurationMs: 2000
},
// fireball: bereits vorhanden — Tina erbt direkt
chainlightning: {
  damage: 55, cooldownMs: 4000,
  projectileType: 'chain',
  projectileSpeed: 22
}
```

### Frostnova

Kein fliegendes Projektil — sofortiger AoE-Burst:
- Prüft alle Avatare in `aoeRadius` per `capsuleCapsule()`
- Trifft → `hit`-Message + `avatar.speedMultiplier = 0.4` für 2000ms
- Visuell: `TorusGeometry` expandiert von r=0 → r=2.5 in 300ms, dann fade-out (`--stille-blau` #6fa8d8)

### Kettenblitz

- Neuer `mkChainMesh()` in `projectiles.js` — `CylinderGeometry(0.04, 0.04, 1)`, stille-blau Farbe
- Trifft direkt (kein Bounce im 1v1)
- Visuell: Arc via `CatmullRomCurve3` mit leichtem Zufalls-Jitter

---

## 11. Scheibe 3 — Martina (Teamleiterin)

### Neue Weapon-Defs in `weapons.js`

```js
summon_minion:  { damage: 0, cooldownMs: 4000, projectileType: 'summon' },
shield_minion:  { damage: 0, cooldownMs: 6000, projectileType: 'buff' },
frenzy_minion:  { damage: 0, cooldownMs: 8000, projectileType: 'buff' }
```

### MinionManager (in `heroes.js`)

**Spawn:** Kleiner Mannequin (scale 0.6), sage-Farbe, max 2 gleichzeitig aktiv. Minions greifen immer den Gegner an — niemals Martina selbst oder andere Minions.

**Minion-Tick (rule-based):**
```
dist > 1.5  → bewegt sich auf Gegner zu (normalize(enemy.pos - minion.pos))
dist ≤ 1.5  → Melee-Attack (15 dmg, 800ms cooldown) → sendet 'hit'-Message
getötet     → Mesh entfernen, MinionManager.count--
```

**shield_minion:** Ältester aktiver Minion bekommt `shielded = true`. Nächster Hit absorbiert → `shielded = false`. Visuell: brass-game Ring um den Minion.

**frenzy_minion:** Ältester Minion: `speedMult = 2.0`, `damage = 30` für 3000ms. Visuell: `fire-sprite` Partikel am Minion.

**WS-Sync:** `minion_spawn`, `minion_update` (15 Hz), `minion_die`

---

## 12. Scheibe 4 — Oskar (Mechaniker)

### Neue Weapon-Defs in `weapons.js`

```js
vehicle_switch:    { damage: 0,  cooldownMs: 3000, projectileType: 'vehicle_switch' },
vehicle_repair:    { damage: -40, cooldownMs: 8000, projectileType: 'repair', target: 'self' },
motorcycle_sprint: { damage: 20, cooldownMs: 2000, projectileType: 'sprint',
                     durationMs: 1500, speedBoost: 2.5 }
```

### Fahrzeug-Integration

- Duel-Start mit Oskar: Motorrad automatisch gespawnt via `vehicle.js`
- **vehicle_switch:** Aktuelles Fahrzeug despawnt (Wrack 5s) → neues spawnt an selber Position
  - Motorrad: `speedMultiplier = 2.5`, kein Turm
  - Auto: `+50% HP`, AutoTurret aktiv
- **motorcycle_sprint:** `speedMultiplier = 2.5` für 1500ms. Kollision mit Gegner-Avatar → 20 dmg + Knockback. `vehicle.damagesOnContact = true` während Sprint.
- **vehicle_repair:** Fahrzeug-HP `+40` (geclampt auf maxHP). Visuell: `muzzle-flash` Sprite in brass-game getinted.

### AutoTurret (Auto-Modus)

```
AutoTurret.tick(dt):
  → nächsten Gegner in Range 4 finden (distance check)
  → Turm-Mesh smooth zur Richtung drehen (lerp)
  → 'handgun'-Projektil alle 600ms abfeuern (bestehend)
  → deaktiviert wenn Fahrzeug zerstört oder gewechselt
```

---

## 13. Scheibe 5 — PvAI (Rule-Based KI)

**Erweiterung von `ai-bot.js`** — Hero-aware.

### Neue Methode: `aabbRay(from, to, obstacles)` in `physics.js`

Slab-Method Ray-AABB-Intersection. Iteriert über alle Arena-AABBs (~12 Hindernisse). Gibt `true` zurück wenn Sichtlinie frei.

### KI-Grundverhalten

```
tick(dt):
  1. aabbRay(bot.pos, enemy.pos) → Sichtlinie?
  2. Sichtbar + in Range → angreifen (hero-spezifische Ability)
  3. Nicht sichtbar → zu letzter bekannter Position navigieren
  4. HP < 30% → Rückzug (weg vom Gegner, Deckung suchen)
```

### Hero-spezifische KI-Profile

**KI-Tina:**
- `dist < 2.5` → frostnova
- `dist < 8` → chainlightning
- `dist > 4` → fireball (burn DoT)
- `HP < 30%` → Rückzug + frostnova wenn verfolgt

**KI-Martina:**
- Immer → summon_minion wenn < 2 aktive Minions
- Wenn Minion kämpft → Distanz halten
- Minion HP niedrig → shield_minion
- Gegner `dist < 3` → frenzy_minion

**KI-Oskar:**
- Start → Motorrad-Modus
- `dist > 5` → motorcycle_sprint Richtung Gegner
- `dist < 3` → vehicle_switch zu Auto + Turm übernimmt
- `HP < 40%` → vehicle_repair

**KI-Patrick:**
- `dist < 1.5` → katana
- `dist < 6` → handgun
- `dist > 6` → rifle
- `HP < 40%` → stealth (2s) + reposition

### PvAI-Aktivierung

Im Hero-Select: Toggle-Button "Gegen KI spielen" — nur sichtbar wenn genau 1 Mensch im Raum (kein zweiter `player_join` empfangen). Klick → setzt `_pvAiMode = true`, Hero-Select-Modal zeigt Gegner-Slot als "KI" (ausgefüllt, nicht wählbar). Host wählt dann den KI-Helden via zweite Karte im Modal. Server erhält keinen zweiten menschlichen `player_join`. Host instanziert lokal `new AIBot(heroId, difficulty='normal')` wenn `duel_start` gesendet wird.

---

## 14. Asset-Strategie

### SVG HUD-Icons (10 neue)

Inline-SVG, gleicher Stil wie bestehende Icons: `viewBox="0 0 64 64"`, Brass-Stroke 1.4px, `stroke-linecap="round"`, Cropmarks `opacity: 0.35`.

| Icon | Beschreibung |
|---|---|
| `icon-frostnova` | Sternburst 8 Zacken + Ring |
| `icon-chainlightning` | Zick-Zack-Blitz-Pfad |
| `icon-summon-minion` | Kleine Figur + Pfeil nach oben |
| `icon-shield-minion` | Schild-Silhouette |
| `icon-frenzy-minion` | Figur + Flammen-Marker |
| `icon-vehicle-switch` | ↔ Pfeil zwischen Motorrad/Auto-Silhouette |
| `icon-repair` | Schraubenschlüssel |
| `icon-sprint` | Blitz + Bewegungslinien |
| `icon-stealth` | Auge mit Diagonalstrich |
| `icon-teleport` | Gestrichelter Kreis + Pfeil |

### Sprites (Three.js Geometrie — kein PNG nötig)

| Effekt | Implementierung |
|---|---|
| Frostnova-Burst | `TorusGeometry` expandiert, `--stille-blau`, fade-out 300ms |
| Kettenblitz-Arc | `CatmullRomCurve3` + Jitter → `TubeGeometry`, stille-blau |
| Minion | Skalierter Standard-Mannequin (scale 0.6), sage-Farbe |

### SFX (Platzhalter — silent fail)

```js
SFX_MAP['frostnova']         = SFX_ROOT + 'frostnova.ogg'
SFX_MAP['chainlightning']    = SFX_ROOT + 'chainlightning.ogg'
SFX_MAP['summon-minion']     = SFX_ROOT + 'summon-minion.ogg'
SFX_MAP['shield-minion']     = SFX_ROOT + 'shield-minion.ogg'
SFX_MAP['frenzy-minion']     = SFX_ROOT + 'frenzy-minion.ogg'
SFX_MAP['motorcycle-engine'] = SFX_ROOT + 'motorcycle-engine.ogg'
SFX_MAP['vehicle-switch']    = SFX_ROOT + 'vehicle-switch.ogg'
SFX_MAP['vehicle-repair']    = SFX_ROOT + 'vehicle-repair.ogg'
```

Audio-Dateien werden als separate Chore nachgeliefert.

---

## 15. Akzeptanzkriterien

- [ ] Alle 4 Helden im Hero-Select auswählbar (Scheibe 1: nur Patrick aktiv)
- [ ] PvP-Duel spielbar, vollständig bis zum Sieg einer Seite (Best-of-3)
- [ ] PvAI-Duel spielbar, KI nutzt Basisbewegung + mind. eine Ability pro Held
- [ ] 2 Spectator-Slots: Follow-Cam (Tab) + Fly-Cam (F) funktionieren
- [ ] Crosshair zeigt Mausrichtung; Projektil fliegt dorthin auch beim Rückwärtslaufen
- [ ] Arenawände: kein Durchlaufen, kein Durchschießen, kein Durchschauen
- [ ] Oskars Fahrzeuge: alle Spieler sehen und können damit kollidieren
- [ ] Auf Desktop (Maus) und Mobile (Touch-Crosshair) spielbar
- [ ] Scheibe-1-Sieger-Screen zeigt korrekten Spielernamen und Rundenstand

## 16. Explizit Out-of-Scope

- Kein persistentes Ranking / Elo
- Kein In-Game-Shop
- Kein Matchmaking-System
- Keine weiteren Maps (nur die eine Arena)
- Keine komplexe KI (nur rule-based, kein Pathfinding/Navmesh)
- Keine echten Audio-Dateien für neue SFX (werden als Chore nachgeliefert)
