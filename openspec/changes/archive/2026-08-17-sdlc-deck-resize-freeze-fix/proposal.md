# Proposal: sdlc-deck-resize-freeze-fix

## Why

Beim Resize der Z5-Deck-Leiste (T011499/T011500) friert der Renderer sekundenlang
ein — 2× reproduziert beim Keyboard-Resize durch die kritische Breakpoint-Zone.
`.deck-leiste__body` ist zugleich CSS-Query-Container (`container-type:
inline-size`) und Scroll-Container (`overflow-y: auto`): das Erscheinen bzw.
Verschwinden der klassischen Scrollbar ändert die Container-Inline-Size, kippt
nahe 480 px die `@container`-Regeln (1↔2 Spalten), ändert damit Inhaltshöhe und
Scrollbar-Notwendigkeit erneut — eine Layout-Oszillation.

## What

`scrollbar-gutter: stable` auf `.deck-leiste__body`: die Gutter-Breite wird
konstant reserviert, das Scrollbar-Erscheinen ändert die Container-Inline-Size
nicht mehr — die Rückkopplung ist strukturell unterbrochen. BATS-Guard sichert
die Deklaration gegen Drift.

_Ticket: T011501_
