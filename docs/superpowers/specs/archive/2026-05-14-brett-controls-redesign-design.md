# Brett-Controls — Redesign für Perspektivwechsel

**Status:** Approved design, ready for implementation planning
**Date:** 2026-05-14
**Author:** brainstorming session with Patrick
**Related prior work:** `2026-04-25-systemisches-brett-design.md` (initial 3D
board), `2026-05-13-brett-optik-design.md` (visual board options)

---

## 1. Background

Brett today: ein Three.js-Brett mit Top-Toolbar, in der Figur-Werkzeuge
(Typ/Farbe/Größe/Drehen/Löschen) und ein einzelner Kamera-Slider (Zoom) sich
eine Leiste teilen. Die Kamera ist ein Spherical-Orbit (`theta/phi/radius`)
um einen Boden-Pivot (`panX/panZ`). Maus-Belegung:

- LMB-Drag (auf Figur): Figur ziehen
- RMB-Drag (auf Figur): Figur drehen
- RMB-Drag (auf Fläche): Orbit
- MMB-Drag: Pan
- Wheel: Zoom

Drei Hauptschmerzpunkte (von Patrick gewichtet):

1. **Maustasten-Chaos** — RMB ist doppelt belegt; MMB für Pan ist auf
   Laptop-Touchpads kaum erreichbar.
2. **Kein Heimweg** — wer sich verdreht oder verzoomt, hat keinen 1-Klick-
   Reset; man muss raten, was die richtigen Werte sind.
3. **Toolbar-Wirrwarr** — Figur-Tools und Kamera-Tools in einer Leiste
   wirken wie eine ungeordnete Liste.

Sekundär fehlen: echte Preset-Ansichten (Top/Front/Iso/...), weiche
Übergänge, Tastatur, „Aus Sicht von Figur X"-Modus, Aufnahme­modus.

## 2. Goal

> „Top-notch way to change perspectives in every way one could wish" —
> ein redesigntes Steuerungs­system, das die Schmerzpunkte beseitigt und
> Coaches einen vollen Werkzeug­satz für Perspektivwechsel gibt, auf
> Desktop und Android gleichermaßen.

Erfolgskriterien:

- Keine doppelt belegten Maustasten; MMB optional.
- Jede Ansicht ist max. 1 Klick / 1 Taste entfernt.
- „Verirren" ist nicht mehr möglich (Kompass + Home).
- Figuren-POV („Aus den Augen von Mutter") als 1-Klick-Modus.
- Vollständige Touch-Parität auf Android (Phone + Tablet).
- Alle drei Bars unabhängig klappbar; Zustand bleibt nach Reload.

## 3. Scope decisions (aus dem Brainstorming)

| Achse | Wahl | Bedeutung |
|---|---|---|
| **Scope** | **C — Cineastisch** | Presets + Figuren-POV + Free-Fly + Auto-Orbit + Split-View + Bookmarks + Aufnahmen |
| **Layout** | **C — Side-Dock rechts** | Vertikale Dock-Leiste mit allen Kamera/Modi-Controls sichtbar |
| **Maus** | **γ — Tool-Modi (Figma-Style)** | Aktives Tool entscheidet, was LMB-Drag tut |

Out-of-Scope (bewusst): Undo/Redo, POV-Sync zwischen Teilnehmern, WebXR,
Bookmark-Thumbnails, Split-View mit mehr als 2 Viewports.

## 4. UI Anatomy

Drei klar getrennte Bars + Canvas mit zwei Overlays.

```
┌─────────────────────────────────────────────────────┐  ▾
│ Top-Toolbar  — nur Figur-Werkzeuge                  │ │
├──┬──────────────────────────────────────────────┬───┤  │
│V │                                              │   │  │
│O │                                              │ S │  │
│P │              Canvas                          │ i │  │
│R │              · Kompass (oben rechts)         │ d │  │
│F │              · Hint-Zeile (unten)            │ e │  │
│E │              · POV/Recording-Banner          │ - │  │
│  │                                              │ D │  │
│⮜ │                                              │ o │  │
│  │                                              │ c │  │
│  │                                              │ k │ ⮟
└──┴──────────────────────────────────────────────┴───┘
 Tool-Rail                                       Dock
 (links)                                        (rechts)
```

### 4.1 Top-Toolbar (figur-only)

Inhalt: **Figur** (Typ-Buttons) · **Farbe** (Swatches) · **Größe**
(S/M/L + Slider) · **Drehen** (↺ ↻ Buttons) · **Löschen** ✕ |
**Speichern** · **Laden** · **Optik** · Teilnehmer­zähler.

Zoom-Slider, Übersicht-Button (Mini-Map) und Wert-Anzeige wandern
**raus** — in den Side-Dock.

Eingeklappt: schmale Leiste mit einem „▾ Werkzeuge"-Button (öffnet
Vollscreen-Sheet auf Phone, Dropdown auf Desktop).

### 4.2 Tool-Rail (links)

Vertikale 42 px breite Leiste mit sechs Tool-Buttons:

| Key | Symbol | Tool | Wirkt auf |
|---|---|---|---|
| `V` | ↖ | Select / Move figure | LMB-Drag = Figur ziehen |
| `O` | ⟲ | Orbit | LMB-Drag = Kamera um Target drehen |
| `P` | ✋ | Pan | LMB-Drag = Target im Boden verschieben |
| `R` | ⟳ | Rotate figure | LMB-Drag horizontal = Figur drehen (snap π/4) |
| `F` | ⊕ | Focus | Klick = Animate zu Auswahl (oder Fit wenn keine) |
| `E` | 👁 | POV toggle | Enter aus Auswahl, exit zurück |

Aktives Tool gehighlightet in Brass-Akzent (#c8a96e); Cursor und Hint-Zeile
schalten mit. `Space`-hold ist **temporärer Pan** unabhängig vom aktiven
Tool (Figma-Konvention). `Esc` cancelt laufende Modi/Animationen.

Mobile-Variante: Tool-Rail wird zu Floating-Action-Button (FAB) unten
rechts mit Radial-Menü beim Long-Press.

### 4.3 Side-Dock (rechts, 220 px)

Sechs Sektionen, top-down, alle gleichzeitig sichtbar:

1. **Ansichten** — `⌂ Home` (H), `⊕ Fokus / Fit` (F), `? Hilfe`
2. **Presets** — sechs Zeilen mit Tastatur-Hint (1–6)
3. **Zoom** — Slider + numerische Anzeige
4. **Modi** — Toggles für POV (E), Auto-Orbit (A), Free-Fly (⇧F),
   Split-View (⇧S); jeder mit Zustands-Indikator
5. **Lesezeichen** — Liste der gespeicherten Bookmarks; oben Button
   „+ Aktuelle Ansicht" (B)
6. **Aufnehmen** — Screenshot (C), Video Start/Stop (⇧R), Verweis auf
   letzte Aufnahme

Jede Zeile zeigt rechts den Tastatur-Shortcut. Aktive Items (Modi,
gerade gewählter Preset) werden in Brass eingefärbt.

### 4.4 Canvas-Overlays

- **Kompass** oben rechts (48×48): N/S/E/W rotiert mit `theta`, innere
  Horizontlinie zeigt `phi`. Klick = Home.
- **Hint-Zeile** unten (~10s nach Tool-Wechsel sichtbar, dann fade): per
  Tool kontextueller Text.
- **Banner** oben Mitte (nur in Modi sichtbar): POV-Banner mit Figur-Name,
  Free-Fly-Banner mit WASD-Hint, Aufnahme-Indikator (roter Punkt + Timer).

### 4.5 Klappbare Bars

Jeder Bar-Header hat `▾`-Chevron. Eingeklappt:

- Top-Toolbar → schmale Leiste mit „▾ Werkzeuge"-Button.
- Tool-Rail → 12 px Stub am linken Rand, Klick öffnet wieder.
- Side-Dock → 18 px Griff am rechten Rand mit Text „◀ ANSICHT".

Persistenz: localStorage-Key `brett-bars` mit `{top, rail, dock}`-Booleans
pro Brett-ID. Default für Mobile: Top-Toolbar offen, Tool-Rail als FAB
(nicht klappbar — der FAB *ist* die kompakte Form), Side-Dock geschlossen
(Bottom-Sheet auf 0 %).

`\`-Shortcut toggelt alle Bars (Distraction-Free). `[` / `]` togglen Rail /
Dock einzeln. `⇧\` toggelt Top-Toolbar.

**Auto-Kollaps:** Beim Eintritt in POV oder Free-Fly werden alle Bars
automatisch eingeklappt (Fokus auf den Modus); Esc öffnet sie wieder im
zuletzt manuell gesetzten Zustand.

## 5. Camera State Machine

Eine einzige Quelle der Wahrheit (`camera`-Objekt), vier Modi:

```
        E / 👁-Dock              Esc
ORBIT ──────────────► POV ──────────────► ORBIT
  ▲                                         │
  │ A                                       │ ⇧F
  └──────► AUTO-ORBIT ◄── Geste ──────────► │
  │                                         ▼
  └──────────────────────────────────► FREE-FLY
                                            │ Esc / ⇧F
                                            ▼
                                          ORBIT
```

Split-View ist **orthogonal**: jeder der vier Modi kann auf der
sekundären Ansicht laufen.

### 5.1 State-Objekt

```js
const camera = {
  mode: 'orbit' | 'pov' | 'autoorbit' | 'freefly',

  // ORBIT / AUTO-ORBIT
  theta: 0,            // yaw, rad
  phi: 0.95,           // pitch, rad, clamped per mode
  radius: 44,          // distance, clamped [12, 75]
  target: { x:0, y:0, z:0 },  // Pivot (ersetzt panX/panZ)

  // POV
  povFigureId: null,
  povYaw: 0, povPitch: -0.087,  // ±90° / ±45° clamp
  fov: 45,             // FOV-Zoom in POV (35–75°)

  // FREE-FLY
  flyPos: { x:0, y:8, z:30 },
  flyYaw: 0, flyPitch: 0,
  flySpeed: 5,         // u/s; ⇧ × 3

  // AUTO-ORBIT
  autoSpeed: 0.15,     // rad/s; 0.02–0.5 via Slider
  autoPausedUntil: 0,  // performance.now() epoch

  // Active animation (or null)
  anim: null,          // { from, to, t0, dur, easing, onDone }
}
```

`anim` ist eine Spread-/Lerp-Snapshot-Animation: alle numerischen Felder
werden zwischen `from` und `to` via Easing interpoliert. `target` als
Vec3-Tween, `mode`-Wechsel passiert genau am Ende der Animation (für
sauberes Cross-Fade-Verhalten).

### 5.2 Sechs Presets

`fit(state)` = berechnet aus Brett-Größe (`BW × BD`) plus Bounding-Sphere
aller platzierten Figuren, sodass die Szene das Viewport mit 10 % Rand
ausfüllt.

| # | Name | theta | phi | radius | target |
|---|---|---|---|---|---|
| 1 | Top-Down | `0` | `0.05` | `fit` | `(0, 0, 0)` |
| 2 | Frontal | `0` | `π/2.05` | `fit` | `(0, 0, 0)` |
| 3 | Links | `−π/2` | `π/2.05` | `fit` | `(0, 0, 0)` |
| 4 | Rechts | `+π/2` | `π/2.05` | `fit` | `(0, 0, 0)` |
| 5 | Iso (Default) | `π/4` | `0.95` | `44` | `(0, 0, 0)` |
| 6 | 3/4-Ansicht | `π/6` | `0.70` | `50` | `(0, 0, 0)` |

Aktiver Preset wird automatisch erkannt (Tolerance `|Δtheta|<0.05`,
`|Δphi|<0.05`, `|Δradius|<1`) und im Dock + Kompass-Tooltip beschriftet;
sobald der User selbst orbitiert, verliert die Markierung.

## 6. Animations-Pipeline

Eine einzige Funktion `easeCamera(to, duration, easing)` startet eine
Animation; eine zweite überschreibt die erste glatt (neues `from` = aktueller
interpolierter Zustand).

| Trigger | Dauer | Easing |
|---|---|---|
| Preset-Klick (1–6) | 400 ms | ease-out-cubic |
| Home / Reset (H) | 500 ms | ease-in-out-cubic |
| Fit (F) | 350 ms | ease-out-cubic |
| POV betreten | 600 ms | ease-in-out-cubic |
| POV verlassen | 500 ms | ease-out-cubic |
| Free-Fly betreten/verlassen | 500 ms | ease-out-cubic |
| Bookmark wiederherstellen | 500 ms | ease-out-cubic |
| Direkte Geste (Drag/Pinch/Wheel) | 0 ms | — (cancelt anim) |
| Auto-Orbit | kontinuierlich | linear |

Animation läuft in `requestAnimationFrame`-Schleife des bestehenden
`animate()`-Loops. Cancel-Logik: jede direkte Geste (mousedown, touchstart
mit ≤2 Fingern, wheel) setzt `camera.anim = null`.

`prefers-reduced-motion: reduce` → alle Dauern auf 0 ms (instant snap).
Auto-Orbit startet nicht automatisch.

## 7. Modi im Detail

### 7.1 POV — Aus Figuren-Augen

- **Eintritt:** `E` (mit Figur-Auswahl) · Dock „POV von …" · Long-Press
  auf Figur → Kontextmenü „Aus Sicht von …"
- **Position:** `figure.position + (0, 3.0 · figure.scale, 0)` (~Augenhöhe)
- **Blick:** `figure.rotY` (forward), Pitch −5° (leichter Look-Down)
- **Interaktion:** LMB-Drag (1F-Drag) = Kopf drehen (Yaw ±90°, Pitch ±45°
  vom Default); Zoom = FOV (35°–75°) statt Radius
- **Banner:** „👁 Sicht von {figure.label} · ⎋ Verlassen" — `Verlassen`-Text ist Button, Klick = Exit
- **Follow:** Wenn die Figur via WebSocket bewegt wird, folgt die Kamera
  in Echtzeit (kein Anim — direkter Sync, weil Position pro Frame neu)
- **Andere Modi:** Auto-Orbit und Free-Fly sind im POV deaktiviert;
  Split-View kann ein POV als sekundäre Ansicht zeigen
- **Cursor:** Augen-Glyph beim Hover über Canvas; bei Geste = move

### 7.2 FREE-FLY

- **Eintritt:** `⇧F` · Dock-Toggle
- **Bewegung Desktop:** WASD strafen (camera-relativ), Space = up,
  Shift = down (Sprint × 3 bei zusätzlicher Shift-Hold während WASD —
  wird über `keyDown[]`-Map gemultiplext)
- **Bewegung Touch:** Doppel-Tap auf Brett-Punkt → 1.5 s ease-out-cubic-
  Flug zur Stelle (Augenhöhe 8 u); Long-Press = Kontextmenü „Hier landen"
- **Blick:** Maus/Finger-Drag = Yaw (unlimited) + Pitch (±85° clamp)
- **Tempo-Slider** im Dock (1–20 u/s)
- **Exit:** Esc · `⇧F` · Dock-Toggle → animiert zurück zum gemerkten
  ORBIT-Snapshot

### 7.3 AUTO-ORBIT

- **Eintritt:** `A` · Dock-Toggle
- **Verhalten:** `theta += autoSpeed · dt`, `phi/radius/target` bleiben
- **Pause:** Jede direkte Geste setzt `autoPausedUntil = now + 1500`;
  während der Pause kein Drift, danach automatisch weiter
- **Geschwindigkeit:** Slider im Dock (0.02–0.5 rad/s)
- **Indikator:** dezenter Brass-Sweep am Kompass-Außenring

### 7.4 SPLIT-VIEW

- **Eintritt:** `⇧S` · Dock-Toggle
- **Layout:** Canvas wird in zwei `<canvas>`-Elemente mit eigenen
  WebGL-Renderern aufgeteilt; horizontaler Splitter (50/50 default,
  Drag-resize zwischen 20 % und 80 %)
- **Primär** (links): alle Interaktionen + Tool-Bar
- **Sekundär** (rechts): nicht-interaktiv im ersten Wurf; Auswahl-Dropdown
  oben rechts in der zweiten Ansicht: „Top-Down / Frontal / Iso / … /
  POV {figure} / Bookmark {name}"
- **Swap-Pfeil** in der Mitte des Splitters tauscht primär ↔ sekundär
- **Exit:** Esc · `⇧S` → animierter Collapse (300 ms) zurück zu Single

### 7.5 Bookmarks

- **Speichern:** `B` oder Dock „+ Aktuelle" → snapshot des kompletten
  `camera`-State (mode + alle Felder) plus `name` und `createdAt`
- **Storage:** `localStorage["brett-bookmarks-${boardId}"]` als
  JSON-Array; max 12 Einträge, älteste werden bei Überlauf entfernt
- **Restore:** Klick im Dock · `⇧1`…`⇧9` (Index 1–9 der Liste) →
  `easeCamera()` zum Snapshot, inkl. Mode-Wechsel (Cross-Fade)
- **Umbenennen:** Doppelklick / Long-Press auf Zeile → inline edit
- **Löschen:** Long-Press → Kontextmenü „Löschen"
- **Sync:** **nicht** über WebSocket — persönliche Blickwinkel, nicht
  Brett-Zustand. Pro User + pro Brett separat.

### 7.6 Aufnahmen

- **Screenshot:** `C` · Dock-Klick → `canvas.toBlob('image/png')` →
  `<a download="brett-{timestamp}.png">` Auto-Klick
- **Video:** `⇧R` · Dock-Klick → `canvas.captureStream(30)` an
  `MediaRecorder({ mimeType: 'video/webm;codecs=vp9' })`. Auf
  `⇧R`-Toggle-Stop oder Esc: Blob speichern als
  `brett-{timestamp}.webm`
- **Indikator:** Roter Punkt + Timer (MM:SS) oben rechts während
  Aufnahme; pulsing Animation @ 1 Hz
- **Performance:** Aufnahme erzwingt 30 fps min.; falls drop, Warnung
  in Hint-Zeile

## 8. Input-Map

### 8.1 Maus (Desktop)

| Aktion | Geste | Bemerkung |
|---|---|---|
| Tool-Aktion (LMB-Drag) | Was Tool definiert | V/O/P/R |
| Figur antippen | LMB-Klick auf Figur | wenn V aktiv |
| Beschriftung öffnen | LMB-Doppelklick auf Figur | tool-agnostisch |
| Temp-Pan | `Space`-hold + LMB-Drag | tool-agnostisch |
| Kontextmenü | RMB | „Drehen / POV / Löschen" |
| Zoom (Radius oder FOV) | Wheel | tool-agnostisch |
| Werkzeug wechseln | V/O/P/R/F/E | siehe Cheatsheet |
| Reset | H · 0 · Klick auf Kompass | |
| Modus-Verlassen | Esc | beendet POV/Free-Fly/Split |

### 8.2 Touch (Android / iOS)

| Aktion | Geste | Bemerkung |
|---|---|---|
| Tool-Aktion | 1F-Drag | identisch zu LMB |
| Figur antippen | 1F-Tap | |
| Beschriftung | 1F-Doppel-Tap | |
| Pan | 2F-Drag | tool-agnostisch (ersetzt Space-hold) |
| Zoom | 2F-Pinch | stetig (ersetzt Wheel) |
| Kontextmenü | Long-Press 400 ms | ersetzt RMB |
| Werkzeug wechseln | Tool-Rail / FAB-Tap | Phone: Long-Press FAB = Radial |
| Reset | 3F-Tap · Kompass-Tap | versteckter Power-Move |
| Free-Fly-Bewegung | 1F-Doppel-Tap auf Brett-Punkt | Tap-to-Fly |

### 8.3 Tastatur

Volles Cheatsheet im `?`-Overlay; abrufbar über `?`-Taste oder Dock-Eintrag „Hilfe".

| Kategorie | Tasten |
|---|---|
| Werkzeuge | `V O P R F E` |
| Temp-Pan | `Space` (hold) |
| Presets | `1` `2` `3` `4` `5` `6` |
| Home / Reset | `H` `0` |
| Zoom-Step | `+` `−` |
| Modi | `A` Auto · `⇧F` Free-Fly · `⇧S` Split |
| Bookmarks | `B` save · `⇧1`…`⇧9` restore |
| Aufnahme | `C` Photo · `⇧R` Video |
| Bars | `\` alle · `[` Rail · `]` Dock · `⇧\` Top |
| Exit-Modus | `Esc` |
| Hilfe | `?` |

Eingabe-Modal (Beschriftung) blockt alle Shortcuts außer `Esc`.

## 9. Responsive Breakpoints

Drei Breakpoints, gesteuert per CSS Media Queries:

| Breite | Top-Toolbar | Tool-Rail | Side-Dock |
|---|---|---|---|
| ≥1024 px (Desktop) | Voll, inline | Sichtbar (42 px) | Sichtbar (220 px) |
| 640–1023 px (Tablet) | Verdichtet (weniger Swatches, „M"-only) | Sichtbar (36 px) | Eingeklappt, Griff (18 px) |
| <640 px (Phone) | „▾ Werkzeuge"-Button | FAB unten rechts | Bottom-Sheet (Griff sichtbar, Tabs) |

- **Phone Bottom-Sheet:** Vier Tabs (Ansicht / Modi / Marks / 📷); Drag
  am Griff zieht auf 60 % / 100 %; Klick außerhalb schließt auf 0 %.
- **Phone FAB:** zeigt aktuelles Tool-Icon; Tap = nächstes Tool; Long-Press
  = Radial-Menü mit allen sechs Tools.
- **Touch-Targets:** alle Buttons auf Touch ≥ 44×44 pt (`@media
  (pointer: coarse)`).

## 10. A11y

| Aspekt | Lösung |
|---|---|
| Tastatur-Navigation | Tab durch Top-Toolbar → Tool-Rail → Side-Dock; `↵` aktiviert; Focus-Outline 2 px in Brass-Akzent |
| Screen Reader | `aria-label` auf allen Buttons; `aria-live="polite"` Region meldet Mode-/Preset-Wechsel („Ansicht: Top-Down") |
| prefers-reduced-motion | Alle Animationen → 0 ms; Auto-Orbit deaktiviert |
| prefers-contrast: more | Border 1 → 2 px; aktive Buttons zusätzlich underlined |
| Farbenblindheit | Aktiv-Status immer Icon-Filled + Border, nie nur Farbe |
| Touch-Targets | ≥ 44×44 pt via `@media (pointer: coarse)` |
| Input-Modal-Konflikt | Keyboard-Listener prüft `document.activeElement`, bei `<input>`/`<textarea>` werden alle Shortcuts (außer `Esc`) ignoriert |

## 11. Implementation Notes

- **Datei:** Änderungen primär in `brett/public/index.html` (Single-Page).
  Erwartete Größenordnung: +600 LoC (CSS + JS).
- **Refactoring-Pflicht:** Der aktuelle `orbit`-State wird abgelöst durch
  das neue `camera`-State-Objekt; alle Stellen, die `orbit.theta` etc.
  lesen, müssen migrieren. WebSocket-Sync von Figur-Move/Rotate bleibt
  unangetastet (Kamera ist nicht synchronisiert).
- **CSS-Variablen:** Bestehende Brand-Variablen (`#c8a96e` Brass,
  `#16213e` Panel, `#0f3460` Border) wiederverwenden — keine neuen
  Palette-Werte einführen.
- **Keine externen Libraries:** keine OrbitControls / GUI-Bibliotheken
  einführen; bleibe bei Three.js + Vanilla-JS, wie der Rest von Brett.
- **Tests:**
  - BATS-Unit für `easeCamera`-Math (computeFit, lerp, easing-Kurven)
    falls JS-Logik extrahiert werden kann; sonst Smoke via Playwright.
  - Playwright-E2E gegen `brett.mentolder.de`: Tool-Wechsel per Tastatur,
    Preset-Klick, Reset über Kompass, Toolbar-Kollaps + Reload-Persistenz.
  - Touch-Smoke über Playwright-Device-Emulation (Pixel 7).

## 12. Open Questions for Implementation Plan

- **POV-Augenhöhe-Heuristik:** Soll die Höhe `3.0 · figure.scale` für
  alle Figur-Typen funktionieren, oder brauchen Würfel/Oktaeder einen
  eigenen Offset? Antwort beim ersten Smoke-Test entscheidbar.
- **Split-View Performance:** Zwei WebGL-Kontexte vs. ein Renderer mit
  zwei Viewports — Plan soll Option B (Single Renderer, `setViewport()`)
  als Default vorsehen, weil Browser oft nur 4–16 GL-Kontexte erlauben.
- **MediaRecorder-Codec:** webm/vp9 ist Default; Fallback `vp8` bei
  fehlender Unterstützung. mp4 wird **nicht** angeboten (Browser-Support
  inkonsistent).

## 13. Out of Scope

Wird in einem späteren Iterations­schritt betrachtet:

- Undo/Redo der Figur-Aktionen (eigenes Thema)
- POV-Sync via WebSocket („Mutter sieht jetzt aus Sicht von Kind")
- WebXR / VR-Headset-Modus
- Bookmark-Vorschau-Thumbnails (sphärische 360° im Dock)
- Split-View mit mehr als zwei Viewports
- Cloud-Sync der Bookmarks
