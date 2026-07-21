---
ticket_id: T002050
plan_ref: openspec/changes/brett-fig-panel-drag-rotate/tasks.md
status: active
date: 2026-07-21
---

# Design: Systembrett — Fig-Panel als Edge-Drawer, Ganzkörper-Drag & 360°-Rotation

## Problem

Im Systembrett (`brett/`) klappt das Figuren-Menü (`#fig-panel`, Zustände „NEUE FIGUR" /
„FIGUR BEARBEITEN") unterhalb des Topbar-Buttons auf und kann auf schmalen Viewports mit dem
horizontal scrollenden Topbar aus dem sichtbaren Bereich rutschen. Außerdem:

- Es gibt keinen Weg, eine **ganze Figur** zu verschieben — draggable sind nur die
  IK-Kontaktpunkte (`CONTACT_POINTS` in `mannequin.ts`, ohne `hips`).
- `facingY` (Blickrichtung) ist im Datenmodell frei (Radiant, kein Raster, Server-Pass-Through),
  aber **keine einzige UI-Interaktion setzt es** — Figuren sind faktisch nicht drehbar.
- Beim Selektieren einer Figur gibt es keinen kontextuellen Weg, das Bearbeiten-Menü zu öffnen
  (nur der Topbar-Button).

## Ziele

1. `#fig-panel` erscheint als **Edge-Drawer fest am rechten Viewport-Rand** (unterhalb des
   Topbars), unabhängig vom Scroll-Zustand des Topbars; bleibt schließbar (X existiert).
2. Das Panel **schließt sich automatisch, wenn eine Figur abgesetzt wird** — für beide
   Platzierungspfade (Placing-Mode-Klick und Doppelklick-Spawn).
3. Bei **selektierter Figur und geschlossenem Panel** erscheint ein Edge-Tab-Button
   „Figur bearbeiten" am rechten Rand, der das Panel öffnet.
4. Figuren sind als Ganzes **frei draggable** (Bodenebene) und **frei in 360° um Y drehbar** —
   per Ring-Drag und per Grad-Slider im Panel.

## Nicht-Ziele

- Keine i18n-Umstellung der hardcodierten Panel-Titel (separater Chore).
- Kein Rotations-Snapping/-Magnet, kein Pitch/Roll (nur Y = Blickrichtung).
- Keine Server-/Protokoll-Änderung: `move`-Message trägt `facingY` bereits.
- Keine Zwei-Finger-Rotationsgeste (Touch rotiert über den Ring wie Maus).

## Entscheidungen (mit Alternativen)

| # | Entscheidung | Verworfene Alternativen |
|---|---|---|
| D1 | Panel `position:fixed`, rechts, top unterhalb Topbar (Edge-Drawer); Toggle/X/Click-outside bleiben | frei draggables Fenster (Overkill); linker Rand (Button-Anker ist rechts) |
| D2 | `addFigure()` ruft `closeFigPanel()` — deckt beide Spawn-Pfade zentral ab | Close nur im Placing-Callback (Doppelklick-Pfad bliebe offen) |
| D3 | Edge-Tab „Figur bearbeiten": sichtbar wenn `STATE.selectedId != null` **und** Panel hidden; Klick → `openFigPanel()` | 3D-projizierter Button an der Figur (Projektion/Occlusion/Mobile-Aufwand); Auto-Open bei Selektion (nervt bei schnellem Umselektieren) |
| D4 | Neuer Drag-Modus `body`: mousedown auf Körper-Mesh (non-contact) einer entsperrten Figur → Root-Drag auf Bodenebene; laufend throttled `sendMove` | eigener `hips`-Kontaktpunkt (bricht IK-Semantik der Spheres); Drag nur am Ring (zu kleiner Trefferbereich) |
| D5 | Rotation: Drag am Selektionsring (`fig.ring`) dreht frei um Y; zusätzlich Grad-Slider 0–360 im Panel | Shift+Drag (nicht entdeckbar, nicht touch-fähig); nur Slider (unpräzise) |

## Architektur / Komponenten

### 1. Panel-Positionierung (CSS, `brett/public/index.html`)

`#fig-panel` wird aus dem `#fig-panel-wrap`-Anker gelöst: `position:fixed; right:12px;`
`top:<Topbar-Höhe + 8px>; z-index:200; max-height:calc(100vh - <offset>); overflow-y:auto`.
Mobile-Media-Query (`max-width:600px`): volle Breite am unteren Rand oder `right:8px` mit
reduzierter Breite. Der `#fig-panel-wrap`-Container und der Topbar-Button bleiben (Toggle).
Click-outside-Handler (`fig-panel.ts:159–163`) bleibt funktional, da er auf `contains()` prüft,
nicht auf Layout.

### 2. Auto-Close beim Absetzen (`fig-panel.ts`)

`addFigure()` (`fig-panel.ts:16–30`) ruft nach erfolgreichem Spawn `closeFigPanel()` auf.
Damit ist der Placing-Pfad (schließt schon beim Klick auf „＋") doppelt abgesichert und der
Doppelklick-Spawn-Pfad (`board-boot.ts:325–347`) erstmals abgedeckt.

### 3. Edge-Tab-Button (`index.html` + `fig-panel.ts`)

Neues Element `#fig-panel-edge-tab` (fixed, rechter Rand, vertikal mittig oder unter dem
Panel-Slot). Sichtbarkeits-Logik in einer neuen Funktion `syncEdgeTab()`:
sichtbar ⇔ `STATE.selectedId !== null && figPanel.hidden`. Aufgerufen aus `selectFigure()`,
`openFigPanel()`, `closeFigPanel()`. Klick → `openFigPanel()` (zeigt „FIGUR BEARBEITEN",
weil `syncPanelToSelection` bereits selektionsabhängig rendert).

### 4. Ganzkörper-Drag (`state.ts`, `board-boot.ts`, `mannequin.ts`, `ws-connection-client.ts`)

- `state.ts`: `ui.dragging` wird diskriminiert:
  `{ kind:'bone', figId, boneName, plane } | { kind:'body', figId, plane, grabOffset }`.
- `mannequin.ts`: bestehendes `pickMannequinBody(e)` liefert bereits Körper-Treffer (heute nur
  für Hover genutzt) — wird im mousedown-Pfad wiederverwendet.
- `board-boot.ts` mousedown: Reihenfolge Kontaktpunkt-Pick (IK, wie bisher) → sonst Körper-Pick
  → Lock-/Freeze-Gates wie beim bestehenden Pfad → `selectFigure` + `figure_lock` +
  Drag-Modus `body` mit Bodenebenen-Plane und Grab-Offset (Klickpunkt − Root, damit die Figur
  nicht springt).
- mousemove (`kind:'body'`): Raycast auf Bodenebene → `fig.root.position.x/z` setzen
  (Magnet-Snapping via `snap()` nur bei aktivem Magnet, wie beim Platzieren) →
  throttled (~33 ms, analog Kollisions-Throttle) `sendMove(fig.id, x, z, fig.facingY)`.
- mouseup: finaler `sendMove` + `figure_unlock` (bestehender Pfad).

### 5. 360°-Rotation (`board-boot.ts`, `fig-panel.ts`, `mannequin.ts`)

- **Ring-Drag:** mousedown-Pick auf `fig.ring` (nur bei selektierter Figur sichtbar) startet
  Drag-Modus `{ kind:'rotate', figId, startAngle, startFacing }`. mousemove: Winkel des
  Bodenebenen-Treffpunkts relativ zum Figuren-Root → `facingY = startFacing + Δangle`
  (Radiant, unbegrenzt/frei) → `fig.root.rotation.y` setzen + throttled `sendMove`.
  Der Ring braucht dafür Raycast-Tauglichkeit (ggf. unsichtbaren, breiteren Hit-Torus/Disk
  als Kind des Root, damit der dünne Ring bedienbar ist — auch für Touch).
- **Panel-Slider:** Range-Input 0–360 (Grad) im „FIGUR BEARBEITEN"-Zustand;
  `input`-Event → Radiant → gleicher Update-Pfad. `syncPanelToSelection` initialisiert den
  Slider aus `fig.facingY` (mod 2π, in Grad).
- Eingehende `move`-Messages wenden `facingY` bereits an (`ws-client.ts:292–294`) — Multiuser-
  Sync funktioniert ohne Änderung.

### 6. Touch (`touch-handler.ts`)

`TouchDeps` um Körper-/Ring-Pick erweitern, sodass Single-Touch-Drag auf Körper = Body-Drag
und auf Ring = Rotation auslöst — gleiche State-Maschine wie Maus (gemeinsame Helfer, kein
Copy-Paste der Drag-Logik).

## Datenfluss

```
mousedown ─► pickContact? ──ja──► IK-Drag (bestehend, unverändert)
     │
     ├─► pickRing? ─────ja──► rotate-Drag ─► facingY setzen ─► sendMove (throttled)
     │
     └─► pickMannequinBody? ─ja─► body-Drag ─► root.position ─► sendMove (throttled)

addFigure() ─► spawn + selectFigure + sendAddFigure ─► closeFigPanel()
selectFigure() ─► syncPanelToSelection + syncEdgeTab()
```

Server bleibt unverändert: `move` (x, z, facingY) existiert und ist Pass-Through
(`rooms.ts:287–300`); Locks/Permissions greifen über den bestehenden `figure_lock`-Pfad.

## Fehlerbehandlung

- Gesperrte/eingefrorene Figuren: Body-Drag und Rotation durchlaufen dieselben Lock-/
  Freeze-Gates wie der bestehende Kontaktpunkt-Pfad (kein neuer Bypass).
- Offline (WS zu): Verhalten wie bisher — lokale Mutation + `spawnOfflineNotice()`-Muster;
  `sendMove` wird nur bei `readyState === OPEN` gesendet.
- Drag-Abbruch (pointer verlässt Fenster / `mouseup` außerhalb): bestehender
  `mouseup`-auf-`window`-Pfad beendet den Drag und sendet den finalen Zustand.

## Teststrategie

- **Unit (vitest, `brett/test/`):** reine Logik extrahieren und testen —
  Winkelberechnung (Δangle → facingY, Wrap um 2π), Grab-Offset-Mathe,
  Sichtbarkeitsprädikat des Edge-Tabs (selectedId × panelHidden),
  Auto-Close-Aufruf in `addFigure` (DOM-frei via Dependency-Injection oder jsdom).
- **Rot→Grün:** Der Test „addFigure schließt das Panel" schlägt vor der Implementierung fehl.
- **Bestehende Guards:** `brett/test/no-hardcoded-brand-css.test.ts` läuft bei CSS-Änderungen mit.
- **Manuell/E2E (nicht Teil dieses Changes):** Multiuser-Sync von Drag/Rotation über zwei
  Browser-Tabs.

## Betroffene Dateien (S1-Budgets, main@HEAD)

| Datei | LOC | wirksame Schwelle | Budget |
|---|---|---|---|
| `brett/public/index.html` | 482 | ungated (.html) | — |
| `brett/src/client/ui/fig-panel.ts` | 255 | 600 | 345 |
| `brett/src/client/board-boot.ts` | 526 | 600 | **74** → Drag-Logik in neues Modul `brett/src/client/figure-drag.ts` extrahieren statt board-boot wachsen zu lassen |
| `brett/src/client/mannequin.ts` | 417 | 600 | 183 |
| `brett/src/client/state.ts` | 73 | 600 | 527 |
| `brett/src/client/touch-handler.ts` | 211 | 600 | 389 |
| `brett/src/client/ws-connection-client.ts` | 120 | 600 | 480 |
