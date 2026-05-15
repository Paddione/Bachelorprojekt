---
title: Brett Polish-Pass — Combat-Foundation, Mobile, Reskin, Hygiene
date: 2026-05-15
status: draft
domains: [brett, frontend, game]
---

# Brett Polish-Pass

## Identität & Pivot

Brett wird mit diesem Pass zum **3D-Multiplayer-Game mit Coaching-Erbe**. Der Mayhem-Mode (Ragdoll-Vehicles, Chase-Camera, Pointer-Lock) bekommt eine echte Combat-Foundation. Coaching bleibt als Modus erhalten, ist aber nicht mehr die primäre Identität.

## Scope-Übersicht

| Strang | Inhalt |
|---|---|
| Combat-Foundation (FFA) | 5 Waffen, HP/Damage, Ragdoll-Death, Respawn, Pickups, Score |
| Mobile/Touch-Parität | Dual-Joystick, Touch-HUD, Bottom-Sheet-Editor |
| Visual-Reskin | Ink-on-brass-Tokens, Three.js-Material-Library, Beleuchtung — überall |
| Stabilität & Hygiene | WS-Reconnect, T000393-Fix, index.html-Split, Tests |

Realistisches Zeitfenster: **1.5–2 Wochen** fokussiert. Falls strikt 1 Woche: Combat + Mobile zuerst, Reskin + Split als Phase 2 im selben Plan.

## Architektur

**Mode-State-Machine (Client):**
- `coaching` (Default beim Join)
- `mayhem` (existiert; wird zu Combat erweitert)
- `mode-select` (Overlay: FFA · Teams [stub] · Coop [stub] · Coaching)

Server kennt nur `mayhem_mode: bool` pro Raum (existiert). Combat-State (HP, Waffen, Pickups) ist client-seitig; Server relayed Damage-Events und ist autoritativ für Pickups.

**Modul-Layout nach Split:**

```
brett/public/
  index.html              (Shell + <link>/<script>, ~120 Zeilen)
  assets/
    style.css             (alle <style>-Blocks extrahiert)
    main.js               (Entry, mountet alle Module)
    mode-state.js         (Mode-Machine)
    ws.js                 (Reconnect-Wrapper)
    materials.js          (Three.js-Material-Lib, single source)
    combat/{weapons,damage,pickups,combat-hud,fx}.js
    touch/{joystick,touch-hud}.js
    mayhem/...            (existiert: physics, chase-camera, player-avatar, vehicle, mayhem)
    sprites/              (Asset-Pack: blood-splat-{01..04}.png, fire-sprite.png, muzzle-flash.png, slash-arc.png, smoke-puff.png)
    hud/                  (Asset-Pack: icon-handgun.png, ..., icon-katana.png)
```

**Server-Änderungen (`brett/server.js`):**
- Neuer Message-Type `damage_event` (shooter_id, victim_id, weapon, damage, position) — Allowlist + Broadcast
- Neue Message-Types `pickup_request` / `pickup_taken` / `pickup_spawned` — Server-autoritativ
- T000393 Duplicate-`case 'stiffness'`-Block entfernen (zweite Implementierung gewinnt)
- Heartbeat: Server `ping` alle 20s, Client `pong` — Drop nach 60s ohne Antwort

## Combat-Foundation (FFA)

### Spawn-Loadout

Vor erstem Combat-Join: Modal mit zwei Spalten — **Nahkampf** (Club | Katana), **Fernkampf** (Handgun | Rifle). Wahl persistiert in `localStorage`. Im Combat: Q (Desktop) bzw. Slot-Tab (Touch) wechselt zwischen den zwei Slots.

### Waffen-Tabelle

| Waffe | Typ | DMG | Range | Cooldown | Spezial |
|---|---|---|---|---|---|
| Handgun | ranged | 25 | ∞ | 250ms | 12-Schuss-Magazin, R-Reload |
| Rifle | ranged (pickup) | 35 | ∞ | 600ms | 5-Schuss-Magazin, höhere Präzision |
| Fireball | ranged (pickup) | 70 | 30u | 1.5s | 3 Charges, Burn-DoT 5dmg/s für 3s |
| Club | melee | 50 | 2.5u | 700ms | Knockback-Impulse via Ragdoll-Physik |
| Katana | melee | 60 | 3u | 500ms | Slash-Arc-FX, Sweep-Hitbox |

### Pickups

- 3 Spots zufällig auf Brett-Boden (Spawner-Algorithmus prüft Mindestabstand zu Spielern)
- Inhalt: `Fireball` (rare, 60s Respawn) oder `Rifle` (häufig, 30s Respawn)
- Mesh: kleines schwebendes Objekt mit Brass-Glow-Ring
- Flow: Client sendet `pickup_request` → Server checkt Distanz + Cooldown → broadcast `pickup_taken`
- Pickup ersetzt passenden Slot temporär bis Tod

### Damage-Flow

1. Client A drückt Fire → lokal: raycast (ranged) bzw. AABB-Sweep (melee) gegen Spieler-Capsules
2. Bei Hit: `{type:"damage_event", victim_id, weapon, dmg}` an Server
3. Server validiert (shooter alive, weapon-cooldown, plausible Range) → broadcast inkl. Shooter
4. Alle Clients: HP-Subtract, FX (Decal an Hit-Position, Blood-Sprite, Muzzle-Flash am Shooter)
5. HP ≤ 0 → `death_event` → Ragdoll, Score-Tick beim Shooter
6. 3s Death-Cam, Respawn an zufälligem Spawn-Point mit Initial-Loadout

### Mode-Selector-Stub

- Coaching · FFA · Teams (Coming soon) · Coop (Coming soon)
- Brass-Underline auf aktiver Karte; Disabled-State für Stubs

### FFA-Score-HUD

Brass-Panel oben rechts: Top 3 mit Avatar + Kills. Mode-Indikator zentral oben ("FFA · 4–2–1").

## Mobile/Touch

**Detection:** `matchMedia('(pointer: coarse)')` + Touchstart-Listener entscheidet einmal beim Mount. Touch-Schicht als `pointer-events: none` Overlay; nur Joystick-Inseln + HUD-Buttons sind interaktiv.

**Linker Joystick (Bewegung):**
- Bottom-left, 120px, brass-Ring + ink-Knob, floating
- Output (dx, dy) ersetzt WASD in `mannequin-walk`
- Sprint: Doppel-Tap auf Zentrum oder Anschlag-Halten >1.5s

**Rechter Joystick + Fire-Button:**
- Bottom-right
- Aim dreht Player-Yaw (analog Maus-Look bei Pointer-Lock)
- Fire-Button: 80px brass-Kreis, single-tap = Schuss, hold = auto-fire mit Cooldown
- Reload-Button: kleiner R-Knopf, blinkt rot bei leerem Magazin

**Weapon-Wheel:** Long-press im HUD-Slot öffnet Radial. Desktop behält 1/2 + Q.

**Mobile HUD:**
- HP-Bar oben mitte (Safe-Area-padding für Notch)
- Score top-right kompakt
- Mode-Indikator als kleine Pill oben links
- Status-Pill min-height für Tap-Dismiss

**Coaching-Mode Touch-Polish:**
- Trägheit auf Figuren-Drag (aktuell hart → Tap-Drift)
- Figuren-Editor wird Bottom-Sheet auf Mobile, swipe-down schließt
- Tap-Pickup für Combat-Pickups im FOV

**Test-Devices:** iPhone 13/14 (Safari, Notch), Android Mittelklasse (Chrome), iPad (Landscape).

## Visual-Reskin

### CSS-Tokens (`brett/public/assets/style.css`, neu)

```css
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
}
```

Topbar, Status-Pill, Figuren-Editor, Mode-Selector, Combat-HUD ziehen alle aus diesen Tokens. Light-Mode entfällt.

### Three.js Material-Library (`brett/public/assets/materials.js`, neu)

- `inkBody` — `MeshStandardMaterial({color:0x17202e, metalness:0.55, roughness:0.65})`
- `brassDetail` — emissive Brass für Trigger, Sights, Klingen
- `woodWarm` — Keulen, Tsuka
- `concrete` — Pfeiler, Mauer, Boden-Variation
- `edgeBrass` — `LineBasicMaterial({color:0xd7b06a, opacity:0.35})` für EdgesGeometry-Wireframe-Signatur
- Helper `applySignature(mesh)` fügt automatisch Edges-Brass an

### Beleuchtung & Boden

- Aktuelle helle Szene → 30% reduziert, kühler Ton
- HemisphereLight (sky=stille-blau low, ground=ink-900)
- 1–2 SpotLights mit warmen Brass-Akzent über Spawn-Punkten
- Brett-Boden: `concrete`-Token + leichte Vignette
- Coaching-Mode: gleiche Lights, +20% Intensität (weniger dramatisch)

### Asset-Pack-Integration

- Sprites unter `brett/public/assets/sprites/`
- HUD-Icons unter `brett/public/assets/hud/`
- Asset-Pack-HTML wird Ticket-Anhang
- Extraktion: `scripts/brett/extract-asset-pack.sh` (im Plan detailliert) — parsed UUID-Refs zu data:-URLs aus Claude-Artifact-Format und schreibt PNGs raus

### Audio

Nur Specs in diesem PR. Platzhalter-API `audio.js` mit no-op-Methoden für spätere Anbindung. Files (`.ogg`) explizit OUT-OF-SCOPE.

## Stabilität & Hygiene

### WS-Reconnect (`brett/public/assets/ws.js`)

- Heartbeat-Empfang + Pong-Antwort
- `onclose` → Exponential-Backoff (1s, 2s, 4s, 8s, max 30s, cap nach 5min)
- Reconnect-Schritt: `request_state_snapshot` → Server sendet vollständiges Raum-State (Figuren + Vehicles + Pickups + lebende Spieler mit HP)
- In-flight Combat-Events während Disconnect werden verworfen
- HUD-Banner während Disconnect: brass-Border + Countdown

### T000393 Fix

Eine konkrete Stelle in `brett/server.js` mit doppeltem `case 'stiffness'`. Zweite Implementierung gewinnt; erste löschen. Exakte Zeile im Plan.

### Stale-Plan-Frontmatter

| Plan | Aktion |
|---|---|
| `2026-05-14-brett-ux-overhaul.md` | `status: done`, `pr_number: 766` |
| `2026-05-14-brett-mannequin.md` | prüfen + setzen |
| `2026-05-15-brett-ragdoll-mayhem.md` | `status: done`, `pr_number: 779` |

### Tests (`brett/test/`)

- `damage.test.js` — Damage-Tabelle, HP-Reduction, Hit-Validation
- `pickups.test.js` — Spawner-Distanz, Respawn-Timer, Take-Race
- `mode-state.test.js` — Mode-Transitions, Loadout-Persistence
- `ws-reconnect.test.js` — Backoff-Sequenz, Resync-Request
- Bestehende Tests (mayhem aus #779) bleiben grün

### CI

Bestehender `arena-server`-Test-Job ist Vorbild. Analoger `brett-server`-Job falls noch nicht da (im Plan prüfen).

## OUT-OF-SCOPE (eigene Folgepläne)

- Teams-Modus Logik
- Coop vs. KI-Vehicles
- Audio-Files (.ogg) — nur Spec im Plan
- 3D-Modelle (.glb) — Three.js-Primitive-Fallback
- Map-Editor / mehrere Maps
- Persistente Profile / Stats / Match-History
- Bundling / Sourcemaps
- T000404 brett-projectiles als separater Plan — prüfen ob durch Fireball schließbar
- Mobile-Performance-Tuning für schwache Android-Geräte (LOD, Sprite-Batching)

## Risiken & Annahmen

- **Annahme:** max 8 Spieler pro Raum reichen
- **Risiko:** Asset-Pack-Bild-Extraktion aus HTML (Claude-Artifact-Format) — ggf. manueller Schritt
- **Risiko:** iOS-Safari + WebGL + Pointer-Events Kombination — Real-Device-Test früh
- **Risiko:** Visual-Reskin auf Coaching-Mode könnte Bestandsnutzer überraschen — UX-Review vor Merge

## Open Questions & Asset-Beschaffung

Diese Liste ist Pflicht-Lektüre für Patrick **vor `dev-flow-execute`** und wird in der Ticket-Description gespiegelt.

### A — Visuelle Mockups (für Spec-Verfeinerung)

1. **Mode-Selector-Layout** — 4 Karten (Coaching · FFA · Teams · Coop), brass-on-ink, Disabled-State für Stubs
2. **Spawn-Loadout-Screen** — Zwei-Spalten-Modal mit Waffen-Icons + Hover-Stats
3. **HUD-Anordnung Desktop vs. Mobile** — Skizze für jeden Viewport (HP, Score, Weapon-Slots, Reload)
4. **Combat-Mode-Indikator** — Vignette? Pulsierender Rand? Tönung?
5. **Death-Cam / Respawn-Overlay** — Cooldown-Countdown? Killer-Name?

### B — Inhaltliche Entscheidungen

6. **Map-Hindernisse** — Säulen/Kisten für Cover? Wenn ja: prozedural oder hardcoded?
7. **Spawn-Points** — Anzahl, Algorithmus (random vs. max-Abstand zu Lebenden)?
8. **Map-Boundaries** — Was passiert beim Fallen vom Brett? Sofort-Tod, Teleport, unsichtbare Wand?
9. **Coaching ↔ Combat im selben Raum?** — Sehen sich Spieler in unterschiedlichen Modi? Separate Räume oder Mode-Layer?
10. **Self-Damage / Friendly-Fire** — Fireball-Splash trifft Shooter selbst? (Default-Vorschlag: ja, Skill-Ceiling)
11. **Ragdoll-Persistenz** — Body bleibt liegen bis Respawn-Timer oder fade-out sofort? Max-Anzahl alter Ragdolls?

### C — Zu beschaffende Assets (ergänzend zum Game-Asset-Pack)

12. **Mode-Selector-Karten-Hintergründe** — 4 ink-on-brass-Stillleben (Coaching: Figur · FFA: Crosshair · Teams: Banner · Coop: Vehicle), ~600×400, vom Pack-Stil ableitbar
13. **Audio-Files (Phase 2)**:
    - Handgun-Schuss, Rifle-Schuss, Fireball-Whoosh + Explosion, Club-Whoosh + Hit, Katana-Slash + Hit, Reload-Click, Pickup-Klang, Death-Stinger, Respawn-Stinger, Background-Drone — Specs aus dem Asset-Pack-README (CC0 Freesound / GameAudio GDC-Bundle)
14. **Mobile-Test-Devices** — mindestens 1 iOS + 1 Android in Reichweite beim Execute
15. **3D-Modelle (Phase 2, optional)** — wenn Primitive zu billig: 5 Waffen-GLBs + Pickup-Crate-GLB; CC0 von Quaternius/Kenney

### D — Entscheidungen noch offen

16. **Max-Spieler-Cap** — 8 ist Annahme; falls größere Gruppen, neu kalibrieren
17. **Respawn-Position-Algorithmus** — random vs. max-Abstand vs. Fix-Spawnpoints
18. **Pickup-Mesh-Style** — Three.js-Primitive (Oktaeder mit brass-Edges) oder Crate-Asset?
19. **Mode-Selector-Trigger** — Bei jedem Raum-Join? Toggle? Auto-vergessen-Preference?
20. **Coaching-Mode-Reskin-Subtilität** — Wie viel ink-on-brass im Coaching? Theme-Toggle als Setting?
