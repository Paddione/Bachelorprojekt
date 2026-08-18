---
ticket_id: T011499
plan_ref: openspec/changes/sdlc-deck-leiste-resize/tasks.md
status: active
date: 2026-08-17
---

# Design: sdlc-deck-leiste-resize

_Ticket: T011499_

## Intent

User-Wunsch: Die rechte Z5-Deck-Leiste im SDLC-Leitstand soll sich per Drag nach links
verbreitern lassen; der Inhalt skaliert automatisch mit („content autoscaling").

## Entscheidungen

1. **Resize-Handle** am linken Rand der DeckLeiste (8 px Hitzone, visuell dezente
   Linie mit Hover-Akzent). Interaktion über **Pointer Events + `setPointerCapture`** —
   dieselbe Konvention, die die SSOT-Spec für Panel-Drag im Leitstand bereits
   festschreibt (`openspec/specs/sdlc-cockpit.md`, „SHALL NOT use the HTML5
   drag-and-drop API").
2. **Eine CSS-Custom-Property als Schnittstelle:** Der Handle setzt `--ls-deck-width`
   auf `#cockpit-root`; `cockpit.astro` ändert die Grid-Spalte von
   `minmax(240px, 320px)` auf `clamp(240px, var(--ls-deck-width, 320px), 640px)`.
   Kein Layout-Recompute in JS, kein Prop-Drilling.
3. **Content-Autoscaling** kommt aus T011498: Die DeckLeiste ist Query-Container;
   unter 480 px Container-Breite rendern die Deck-Komponenten einspaltig, darüber
   mehrspaltig. Der Resize aktiviert damit automatisch das breite Layout.
4. **Klemm-Logik als reine Funktion** `clampDeckWidth(px)` in
   `src/lib/sdlc/deck-resize.ts` (min 240, max 640, Default 320) — dort auch
   `widthFromPointer(clientX, innerWidth)`. Reine Funktionen sind Vitest-testbar,
   die Svelte-Komponente bleibt dünn.
5. **Persistenz:** `localStorage['ls-deck-width']`; beim Mount gelesen und geklemmt
   angewendet. **Doppelklick** auf den Handle = Reset auf 320 px (Eintrag entfernt).
6. **A11y:** Handle ist `role="separator"`, `aria-orientation="vertical"`,
   `tabindex="0"`, Pfeiltasten links/rechts ±16 px, `aria-valuenow/-valuemin/-valuemax`.
7. **Mobil** (< 768 px, Zonen gestapelt): Handle wird nicht gerendert bzw. per
   Media-Query ausgeblendet; die gespeicherte Breite bleibt wirkungslos, weil die
   Grid-Spalte dort `1fr` ist.

### Verworfene Alternativen

- **HTML5-Drag-API:** von der Spec für Leitstand-Interaktionen explizit verworfen.
- **`resize: horizontal` (CSS):** Handle sitzt rechts unten, resized das Element
  selbst statt der Grid-Spalte, keine Persistenz/A11y-Kontrolle.
- **Breite in Svelte-State + Inline-Style auf .ls-main:** .ls-main liegt in Astro,
  nicht in der Komponente; die CSS-Var auf `#cockpit-root` ist die schmalste Brücke.

## Risiken

- `transition: width` auf `.drawer`/Grid könnte Dragging träge machen — während des
  Drags wird keine Transition auf der Grid-Spalte definiert (es gibt dort keine),
  nur die CSS-Var ändert sich; kein Handlungsbedarf.
- `localStorage` kann in Privacy-Modi werfen → try/catch, Fallback Default.
