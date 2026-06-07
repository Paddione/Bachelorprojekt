---
title: Brett D — Possession-System & Observer-Modus
ticket_id: null
domains: [website]
status: active
pr_number: null
---

# Brett D — Possession-System & Observer-Modus

**Datum:** 2026-06-07  
**Branch:** feature/brett-d-possession-observer  
**Ticket:** null  
**Status:** design — bereit zur Implementierung

---

## Überblick

Erweiterung von Systembrett um ein **Possession-Modell**: Teilnehmer können Figuren "verkörpern" (besessen halten) und sehen die Szene aus deren Perspektive. Observer treten explizit als Zuschauer bei. Das bestehende Lock-/Rollen-System bleibt parallel erhalten.

Reconnect-Grace-Window ist explizit **außer Scope** — Sessions sind kurz genug, dass ein 409 bei Wiederverbindung akzeptabel ist.

---

## Entscheidungen

| Frage | Entscheidung |
|---|---|
| Possession-Architektur | Figur-zentriert: `figure.possessor` Feld |
| Observer-Join | Inline-Toggle im bestehenden Lobby-Dialog |
| Figur-Typen | 5 Typen: Coachee, Team·aktiv, Team·passiv, Saboteur, Ressource |
| POV-Kamera | Automatisch beim Possessen (600ms Lerp); Orbit = temporärer Ausstieg |
| Reconnect | Kein Grace-Window — außer Scope |
| Leiter-Kontrolle | Bleibt intakt (layered on top von Possession) |

---

## Figur-Typen

Fünf semantische Typen aus dem Design-System (2026-06-07):

| Typ | Farbe Body | Farbe Skin | Größe |
|---|---|---|---|
| Coachee | `#c2b27e` (parchment-warm) | `#d9c89b` | 92px (größer) |
| Team · aktiv | `#b8c0a8` (figureSage) | `#d9c89b` | 78px |
| Team · passiv | `#8e9a7c` (figureSageDeep) | `#d9c89b` | 78px |
| Saboteur | `#9c7e6b` (warm-brown) | `#d9c89b` | 78px |
| Ressource | `#9aa886` (figureSageSoft) | `#d9c89b` | 78px |

Typ wird im Roster-Item als Dropdown gewählt. Leiter kann Typ jederzeit ändern.

---

## Server-Änderungen

### Neue Mutations

**`figure_possess` `{ figureId: string }`**
- Setzt `figure.possessor = playerId` (der sendende Spieler)
- Gate: Figur darf noch keinen `possessor` haben; Beobachter dürfen senden (Transition Observer → Besitzer)
- Broadcast an alle: `{ type: 'figure_possessed', figureId, playerId }`

**`figure_release` `{ figureId?: string }`**
- Löscht `figure.possessor` (figureId optional — ohne figureId: alle eigenen)
- Gate: Nur eigene Figur (oder Leiter kann jede freigeben)
- Broadcast an alle: `{ type: 'figure_released', figureId, playerId }`

### Auto-Release bei Disconnect

Im `ws.on('close')`-Handler: alle vom Spieler besessenen Figuren werden automatisch freigegeben (analog zur bestehenden `ownerId`-Freigabe).

### Snapshot-Erweiterung

Der Join-Snapshot (`type: 'snapshot'`) enthält `possessor: string | null` pro Figur — Late-Join sieht sofort den aktuellen Possession-State.

### canMutate-Update

`figure_possess` wird in `RELAY_TYPES` aufgenommen. `canMutate` erlaubt die Mutation für `beobachter`-Rolle (Transition: Beobachter kann Figur nehmen und wird damit de facto Teilnehmer).

### Figur-Typ im State

Neues Feld `figureType: FigureType` auf der Figur-State-Struktur. Neuer Mutations-Typ `figure_type_set { figureId, figureType }` — Leiter-Only.

---

## Client-Änderungen

### 1. Lobby — Observer-Toggle & Figur-Typ

**Observer-Toggle** im bestehenden Join-Dialog (neben Name-Eingabe):
```
[x] Als Beobachter beitreten
```
Setzt ein lokales Flag, das beim Join den Server anweist, `beobachter`-Rolle zuzuweisen.

**Figur-Typ-Dropdown** im Roster-Item (sichtbar für alle):
- Dropdown mit 5 Typen; nur Leiter kann ändern
- Farb-Swatch links vom Namen zeigt den aktuellen Typ

**Roster-Eintrag Observer:**
```
👁  Anna   Beobachterin
```

### 2. Board — Figur-Zustände (visuell)

**Freie Figur:**
- Pulsierender dashed brass-Ring außen (`border: 1px dashed rgba(200,169,110,0.5)`, Animation `pulse 2s infinite`)
- Cursor: `pointer`; Klick → `figure_possess` senden

**Eigene Possession:**
- `box-shadow: 0 0 0 2px var(--brett-brass), 0 0 18px rgba(200,169,110,0.35)`
- Eigener Name als Floating-Label über dem Kopf (brass, Mono 9px UPPERCASE)

**Fremde Possession:**
- `box-shadow: 0 0 0 2px var(--brett-sage), 0 0 14px rgba(127,163,122,0.3)`
- Name des Besitzers als Floating-Label (sage)

**Besetzt (Leiter-Lock, kein Possessor):**
- Bestehende `ownerId`-Darstellung unverändert

### 3. HUD — State-abhängige Buttons

**Observer-State:**
```
[ Klicke eine freie Figur, um sie zu verkörpern ]   ← brass dashed hint bar
```

**Possession-State:**
```
[ 👁 POV aktiv ]   [ 🚶 Loslassen ]
```
- `[Loslassen]` → sendet `figure_release` → Kamera zurück zur Vogelperspektive

### 4. POV-Kamera

Bei bestätigtem `figure_possess`:
1. Lese Kopf-Knochen-Position + Rotation aus dem Mannequin-Rig
2. 600ms `lerp`-Animation: Kamera bewegt sich vom aktuellen Standpunkt zur Kopf-Position
3. Kamera schaut in dieselbe Richtung wie der Facing-Nub der Figur
4. Shift+Drag → OrbitControls temporär re-enabled (exit POV)
5. `figure_release` → Kamera lerpt zurück zur Standard-Vogelperspektive

POV ist **rein client-lokal** — andere Teilnehmer sehen weiterhin die Außenperspektive.

---

## Assets (bereits geliefert)

Aus dem mentolder Design-System (2026-06-07) wurden folgende Assets hinzugefügt:

**SVG Characters** → `brett/public/assets/characters/`
- `coachee.figurine.svg`, `coachee.portrait.svg`, `saboteur.svg`, `team-member-active.svg`, `team-member-passive.svg`

**SVG Props** → `brett/public/assets/props/`
- `prop-balance.svg`, `prop-barrier.svg`, `prop-shield.svg`, `prop-target.svg`

**SVG Terrain** → `brett/public/assets/terrain/`
- `focus-circle.svg`, `fog-wash.svg`

**CSS-Tokens** → `brett/src/client/ui/theme.ts` (bereits committed)
- `slate-0…3`, `figureSage{|Deep|Soft}`, `figureSkin{|Deep}`, `figureInk`, `parchment`
- `jointWrist/Ankle/Knee/Elbow/Head` (semantische Gelenkfarben, feste Bedeutung)
- `brassDeep`, `radiusMd/Sm/Pill`, `motion.easeSoft/durFast/durBase/durSlow`

---

## Tests

Jede neue Server-Mutation braucht einen Unit-Test (node:test Pattern wie bestehende Tests):

- `figure_possess`: Gate-Test (Doppel-Possession → reject), Success-Test (Broadcast + State-Update)
- `figure_release`: Eigene-Figur-Test, Leiter-fremd-Test, Auto-Release-bei-Disconnect-Test
- Snapshot-Test: `possessor`-Feld in Late-Join-Snapshot vorhanden
- `canMutate`-Test: `beobachter` darf `figure_possess` senden

Client-Tests (tsx/jsdom):
- HUD zeigt Observer-Hint wenn `possessor === null`
- HUD zeigt Loslassen-Button wenn `possessor === self`
- Figur-Visual korrekte CSS-Klassen pro State

---

## Abgrenzung (außer Scope)

- Reconnect-Grace-Window
- Kamera-Sharing (andere sehen POV eines Teilnehmers)
- Observer darf eigene Kamera-Orbit-Controls einschränken
- Mobile-Touch für POV-Ausstieg (Shift+Drag → Touch-Geste)
- Figur-Typ-Wahl im Observer-Join (kann später ergänzt werden)
