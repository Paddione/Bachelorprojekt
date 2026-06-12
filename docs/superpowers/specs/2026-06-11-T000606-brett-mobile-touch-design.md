# Brett: Mobile-Touch-Steuerung — Design Spec

**Ticket:** T000606  
**Branch:** feature/T000606-brett-mobile-touch  
**Datum:** 2026-06-11  
**Status:** staged  
**Autor:** dev-flow-plan (autonom, keine interaktiven Fragen)

---

## Kontext & Problemstellung

Das Brett-System (3D Systembrett, `brett/src/client/`) ist ausschließlich auf Maus-Interaktion ausgelegt. Auf mobilen Geräten funktioniert:

- **Drag & Drop von Figuren** — gar nicht (nur `mousedown/mousemove/mouseup`, kein Touch)
- **Kamera-Orbit** — gar nicht (nur `mousedown` mit Shift/Mitteltaste, kein Ein-Finger-Wisch)
- **Pinch-to-Zoom** — gar nicht (nur `wheel`, kein Zwei-Finger-Pinch)
- **Buttons/Touch-Targets** — zu klein für zuverlässige Bedienung (kein 44×44px Minimum)

Der vorhandene Code (`scene.ts`, `board-boot.ts`, `mannequin.ts`) verwendet Raw-MouseEvents ohne Pointer-API-Abstraktionsschicht. Touch-Events sind komplett abwesend.

Der aktive Plan "Brett Mayhem · Polished 1v1 with Spectators" tangiert diese Dateien nicht direkt — die Milestones M1/M2/M3 betreffen server-seitige Logik und Website-UI. Dieser Plan ist konfliktfrei parallel ausführbar.

---

## Ziele

1. **Touch-Drag & Drop** für Mannequin-Figuren — Ein-Finger-Drag löst `pickContact()` + IK-Drag aus (funktional äquivalent zu Maus-Drag)
2. **Pinch-to-Zoom** — Zwei-Finger-Pinch steuert `cameraOrbit.dist` (Range 2–40, identisch zu Wheel)
3. **Ein-Finger-Orbit** — Ein Finger ohne Figur-Hit dreht/kippt die Kamera (äquivalent zu Shift+Maus-Drag)
4. **Touch-Target-Größen** — Alle interaktiven Buttons ≥44×44px auf Mobile
5. **Touch-Action CSS** — `touch-action: none` auf Canvas verhindert Scroll-Konflikte; `touch-action: manipulation` auf Buttons verhindert Double-Tap-Zoom

---

## Architektur-Entscheidungen

### A. Unified Pointer Events statt doppelter Mouse+Touch Handler

**Entscheidung:** Wir verwenden **Pointer Events API** (`pointerdown/pointermove/pointerup`) statt separat Mouse und Touch zu behandeln.

**Begründung:**
- Pointer Events unified funktionieren mit Maus, Touch und Stylus aus einer API
- `pointerId` ermöglicht Multi-Touch-Tracking ohne separate Touch-Event-Arrays
- `setPointerCapture()` ersetzt das fragile `window.mousemove`-Pattern des aktuellen Codes
- Bereits in allen modernen Browsern (inkl. iOS Safari 13.4+) verfügbar

**Migration:** Die bestehenden `mousedown/mousemove/mouseup` in `scene.ts` und `board-boot.ts` werden durch Pointer Events ersetzt. Das `mousemove` auf `window` (orbit-Drag) wird durch `pointercapture` auf dem Canvas-Element ersetzt — sauberer und kein globales Listener-Leak.

### B. Pinch-Zoom via Pointer-Abstandsberechnung

**Entscheidung:** Pinch wird durch Tracking von zwei aktiven Pointer-IDs implementiert, **nicht** via GestureEvent (iOS-proprietär) oder Touch Events.

```
pinchStart: { id1, id2, startDist }
pinchCurrent: { id1, id2, currentDist }
zoomFactor = startDist / currentDist
newDist = clamp(orbitDistAtPinchStart * zoomFactor, 2, 40)
```

**Begründung:** GestureEvent ist nur Safari; TouchEvent parallel zu PointerEvent führt zu doppelten Callbacks. Zwei Pointer IDs über `activePointers: Map<number, PointerEvent>` zu tracken ist die sauberste Cross-Browser-Lösung.

### C. Touch-Intent-Disambiguation (Touch → Orbit vs. Touch → Figur-Drag)

**Problem:** Ein Finger auf dem Canvas kann Kamera-Orbit ODER Figur-Drag auslösen — je nachdem ob ein Figur-Kontakt getroffen wird.

**Entscheidung:** Raycasting beim `pointerdown` entscheidet Intent:
1. `pointerdown` → `pickContact(normalizedPointer)` mit Pointer-Koordinaten (nicht mehr `MouseEvent`)
2. **Hit** → Figur-Drag-Modus (sperrt Orbit)
3. **Miss** → Orbit-Modus

Technisch: `setNdc(ev)` in `mannequin.ts` wird generalisiert auf `setNdcFromPoint(x: number, y: number)` — nimmt Client-Koordinaten statt `MouseEvent`, so dass Pointer Events und Mouse Events beide funktionieren.

### D. Separate Touch-Modul-Datei

**Entscheidung:** Neues Modul `brett/src/client/touch-handler.ts` — kapselt die gesamte Touch/Pointer-Event-Logik. `scene.ts` und `board-boot.ts` rufen `initTouchHandler(renderer, sceneApi, mannequin, ...)` auf.

**Begründung:** Kein Aufblähen von `scene.ts` (schon 220 Zeilen). Touch-Logik ist klar trennbar — sie koordiniert zwischen Kamera und Figur-Drag, hat aber keine eigene 3D-Logik.

### E. CSS: touch-action + Touch-Target-Größen

**Entscheidung:** Inline-CSS in `brett/public/index.html` wird erweitert:

```css
/* Canvas: browser soll kein Scroll/Pan/Zoom selbst machen */
canvas { touch-action: none; }

/* Buttons: min 44×44px auf mobil, kein Double-Tap-Zoom */
@media (pointer: coarse) {
  .preset-btn, #fig-panel-btn, #appearance-btn,
  #btn-export-png, #btn-export-json, #btn-export-pdf,
  #btn-release-possession { 
    min-height: 44px;
    min-width: 44px;
    touch-action: manipulation;
    padding: 10px 14px;
  }
  #stiffness { height: 44px; }
}
```

`pointer: coarse` trifft präzise Touch-Geräte ohne Desktop-Maus zu vergrößern.

---

## Technische Spezifikation

### Modul: `brett/src/client/touch-handler.ts`

```typescript
export interface TouchHandlerDeps {
  renderer: THREE.WebGLRenderer;
  sceneApi: SceneApi;
  camera: THREE.PerspectiveCamera;
  mannequin: MannequinApi;
  ui: UiState;
  wsClient: WsClient;
  activeLocks: Map<string, Lock>;
  currentUser: CurrentUser;
  currentModerationState: ModerationState;
}

export function initTouchHandler(deps: TouchHandlerDeps): void
```

**Interner State des Moduls:**

```typescript
// Aktive Pointer für Multi-Touch
const activePointers = new Map<number, PointerEvent>();

// Orbit-State (gespiegelt aus scene.ts — via Getter/Setter-API)
type OrbitMode = { kind: 'orbit'; pointerId: number; lastX: number; lastY: number };

// Figur-Drag-State (gespiegelt aus board-boot.ts)
type FigureDragMode = { kind: 'figure'; pointerId: number; figId: string; boneName: string; plane: THREE.Plane };

// Pinch-State
type PinchMode = { kind: 'pinch'; id1: number; id2: number; startDist: number; startOrbitDist: number };

type TouchMode = OrbitMode | FigureDragMode | PinchMode | null;
let touchMode: TouchMode = null;
```

**Event-Flow:**

```
pointerdown(canvas)
  → activePointers.set(e.pointerId, e)
  → if activePointers.size === 2 → startPinch()
  → else if activePointers.size === 1:
      → pickContact(e) → hit? → startFigureDrag() : startOrbit()
  → canvas.setPointerCapture(e.pointerId)

pointermove(canvas)
  → activePointers.set(e.pointerId, e)  // update
  → switch touchMode.kind:
    → 'orbit'  → updateOrbit(dx, dy)
    → 'figure' → updateFigureDrag(e)
    → 'pinch'  → updatePinch()

pointerup / pointercancel(canvas)
  → activePointers.delete(e.pointerId)
  → if touchMode matches this pointer → endMode()
  → if activePointers.size === 1 && touchMode === 'pinch':
      → transition zu single-finger orbit mit verbliebenem Pointer
```

**Pinch-Update-Logik:**

```typescript
function updatePinch(): void {
  const p1 = activePointers.get(pinch.id1)!;
  const p2 = activePointers.get(pinch.id2)!;
  const currentDist = Math.hypot(p2.clientX - p1.clientX, p2.clientY - p1.clientY);
  const ratio = pinch.startDist / currentDist;
  cameraOrbit.dist = Math.max(2, Math.min(40, pinch.startOrbitDist * ratio));
  updateCameraFromOrbit();
}
```

**Orbit-Sensitivität für Touch:**

Touch braucht höhere Sensitivität als Maus (Finger bewegt größere Distanzen):
```typescript
const TOUCH_ORBIT_SENSITIVITY = 0.007; // vs. 0.005 bei Maus
```

### Änderungen in `mannequin.ts`

`setNdc(ev: MouseEvent)` → `setNdcFromPoint(clientX: number, clientY: number)` + Wrapper:

```typescript
export function setNdcFromPoint(clientX: number, clientY: number): void {
  const { renderer } = getScene();
  const rect = renderer.domElement.getBoundingClientRect();
  ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
}

/** Backward-compat wrapper für bestehende mousedown-Calls */
export function setNdc(ev: { clientX: number; clientY: number }): void {
  setNdcFromPoint(ev.clientX, ev.clientY);
}
```

`pickContact(ev: MouseEvent)` → `pickContact(ev: { clientX: number; clientY: number })` — da nur `.clientX/.clientY` genutzt werden, reicht ein Duck-Type.

`pickFloor(ev: MouseEvent)` analog generalisieren.

### Änderungen in `scene.ts`

Bestehende `mousedown`-Handler für Orbit bleiben — sie funktionieren via Pointer Events nativ.

**Aber:** Das globale `window.addEventListener('mousemove', ...)` für Orbit-Drag wird **nicht** durch Touch-Equivalent benötigt — `touch-handler.ts` übernimmt mit `setPointerCapture`.

**Export erweitern:** `SceneApi` bekommt `getCameraOrbit(): { dist: number; theta: number; phi: number }` und `setCameraOrbitDist(d: number): void` damit `touch-handler.ts` lesen/schreiben kann ohne direkte Kopplung.

### Änderungen in `board-boot.ts`

Nach `initScene()` und `mannequin`-Setup: `initTouchHandler(deps)` aufrufen.

Die bestehenden `mousedown/mousemove/mouseup` für Figur-Drag bleiben für Desktop — `touch-handler.ts` ergänzt Touch-Äquivalente. Kein Duplizieren der Drag-Logik: `touch-handler.ts` ruft dieselben Mannequin-API-Funktionen auf (`ccdIK`, `sendUpdate`, etc.).

### CSS-Änderungen in `brett/public/index.html`

In den `<style>`-Block hinzufügen:

```css
/* T000606: Mobile Touch */
canvas { touch-action: none; }

@media (pointer: coarse) {
  .preset-btn {
    min-height: 44px;
    padding: 8px 12px;
    touch-action: manipulation;
  }
  #fig-panel-btn, #appearance-btn,
  #btn-export-png, #btn-export-json, #btn-export-pdf,
  #btn-release-possession {
    min-height: 44px;
    min-width: 44px;
    touch-action: manipulation;
  }
  #stiffness {
    height: 44px;
    accent-color: var(--color-accent, #4a9eff);
  }
  /* Topbar: mehr vertikaler Raum auf Touch-Geräten */
  #topbar {
    min-height: 48px;
  }
  /* Renderer-Canvas muss Topbar-Höhe kennen */
  /* (JS-seitig: topbarHeight = 48 auf pointer:coarse) */
}
```

**Viewport-Meta:** Prüfen ob `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">` vorhanden ist — verhindert Browser-Zoom auf Double-Tap. Falls nicht, hinzufügen.

---

## Tests

### Unit-Tests (brett/test/)

**Neue Datei: `brett/test/touch-handler.test.ts`**

Test-Cases (Node.js test runner, jsdom):
1. `pinch zoom reduces orbit dist when fingers move apart`
2. `pinch zoom increases orbit dist when fingers pinch together`  
3. `pinch dist clamped to [2, 40]`
4. `single pointer on figure → figure drag mode`
5. `single pointer on floor → orbit mode`
6. `two pointers → pinch mode (figure drag cancelled)`
7. `pointer release when only one left → orbit mode`
8. `setNdcFromPoint computes correct NDC for canvas center`

Da jsdom kein echtes Canvas/WebGL hat: `renderer.domElement.getBoundingClientRect()` wird gemockt.

### Playwright E2E (tests/e2e/)

**Playwright-Projekt:** `brett` (Mobile-Chrome, `hasTouch: true`, Viewport 390×844)

**Neue Datei: `tests/e2e/brett/touch-controls.spec.ts`**

Test-Cases:
1. `pinch zoom zooms camera in` — Simuliere zwei Pointer annähern, prüfe `window.__brettDebug.orbitDist` kleiner
2. `orbit drag rotates camera` — Simuliere einen Finger-Sweep, prüfe `theta`-Änderung
3. `buttons are at least 44px tall on mobile` — `getBoundingClientRect()` auf alle `.preset-btn`

**Playwright-Projekt zuweisen:** `brett-mobile` (neues Project in `playwright.config.ts` mit `use: { hasTouch: true, viewport: { width: 390, height: 844 } }`). 

> **Playwright-Projekt-Gate (Schritt 3.5):** Neues Projekt `brett-mobile` braucht Eintrag in `playwright.config.ts` unter `projects`. E2E-Tests laufen via `e2e.yml` nightly — das neue Projekt wird dort eingebunden.

---

## Dark-Launch

**Kein Dark-Launch nötig.** Touch-Handler ist additiv — Desktop-Maus-Events werden nicht geändert, nur Touch-Events hinzugefügt. Regression-Risiko auf Desktop: minimal.

---

## Out-of-Scope

- **Haptic Feedback** (Vibration API) — nice-to-have, kein MVP
- **Portrait/Landscape-Orientierungshandling** — CSS `resize`-Listener reicht für MVP
- **Mayhem-Mode Touch** — Mayhem hat eigene Event-Logik; separates Ticket wenn nötig
- **POV-Mode Touch** — `free-fly-camera.ts` bleibt unberührt (touch für FPS-Camera ist komplexer, kein MVP)
- **Accessibility/VoiceOver** — separates Ticket

---

## Risiken

| Risiko | Wahrscheinlichkeit | Mitigation |
|--------|-------------------|-----------|
| iOS Safari Pointer Events incomplete | Niedrig | iOS 13.4+ OK; Fallback-Test im E2E |
| Konflikt mit bestehendem Orbit-MouseEvent wenn TouchEvent und MouseEvent feuern beide | Mittel | `touch-action: none` auf Canvas unterdrückt Browser-generierte Mouse-Events aus Touch |
| setPointerCapture blockiert andere Pointer in Pinch | Niedrig | Beide Pointer separat capturen; Release bei `pointerup` |
| Topbar 48px bricht Renderer-Canvas-Höhe | Niedrig | JS-Check auf `window.matchMedia('(pointer: coarse)')` für `topbarHeight` |

---

## Implementierungsreihenfolge

1. **Phase A** — `mannequin.ts` refactoring (`setNdcFromPoint` + Duck-Type für `pickContact/pickFloor`)
2. **Phase B** — `scene.ts` API-Erweiterung (`getCameraOrbit`, `setCameraOrbitDist`)
3. **Phase C** — `touch-handler.ts` neu (Pinch + Orbit + Figur-Drag Touch)
4. **Phase D** — `board-boot.ts` Integration (`initTouchHandler` aufrufen)
5. **Phase E** — CSS + Viewport-Meta (`index.html`)
6. **Phase F** — Unit-Tests (`brett/test/touch-handler.test.ts`)
7. **Phase G** — Playwright E2E + Playwright-Projekt `brett-mobile`
8. **Phase H** — TypeScript Build-Check + CI-Verifikation
