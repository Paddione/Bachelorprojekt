# Proposal: sdlc-deck-resize-handle-fix

## Why

Drei bestätigte Post-Merge-Review-Findings zu PR #4694 (Deck-Resize, T011499):
Der Resize-Handle ist in `.deck-leiste` verankert, die zugleich der Scroll-Container
ist — er scrollt mit dem Deck-Inhalt aus dem Sichtfeld und wird horizontal geclippt
(halbe Grab-Zone, halber Fokus-Indikator). Zusätzlich rechnet `widthFromPointer` mit
`window.innerWidth` (inklusive vertikaler Scrollbar), wodurch die gezogene Kante bei
sichtbarer Seiten-Scrollbar ~15 px hinter dem Cursor hängt.

## What

- Scroll-Kontext verschieben: `.deck-leiste` verliert `overflow-y: auto`,
  `.deck-leiste__body` erhält es — der Handle liegt damit außerhalb der Overflow-Box
  (nicht mehr weggescrollt, nicht mehr geclippt).
- `widthFromPointer(clientX, rightEdge)` statt `(clientX, innerWidth)`: Breite aus
  der Panel-Geometrie (`nav.getBoundingClientRect().right`), Vitest angepasst.
- BATS-Guard erweitert die bestehende Struktur-Absicherung.

_Ticket: T011500 — Findings aus /code-review zu PR #4694, alle CONFIRMED._
