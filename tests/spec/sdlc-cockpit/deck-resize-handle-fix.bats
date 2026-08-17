#!/usr/bin/env bats
# T011500 — Deck-Resize-Handle: Scroll-Kontext + Panel-Geometrie.
#
# Pruefmodus: Source-Grep (Querschnitts-/Konventionstest, T002448-M4-Ausnahme) —
# die Laufzeit-Geometrie (Handle sichtbar trotz Scroll, Kante folgt Cursor bei
# Scrollbar) braucht einen echten Browser; Laufzeit-Beleg via Vitest der reinen
# Logik (CI "Vitest (website)") und dev-flow-e2e.
# Positiv-Anker (T002356-M1): Existenz von Datei + Ziel-Selektor zuerst.

WEBSITE_SRC="components/website/src"
DECK_LEISTE="$WEBSITE_SRC/components/leitstand/DeckLeiste.svelte"
RESIZE_LIB="$WEBSITE_SRC/lib/sdlc/deck-resize.ts"

# Finding 1+2: Der Scroll-Container muss der __body sein, nicht die Leiste
# selbst — sonst scrollt/clippt der absolut positionierte Handle.
@test "DeckLeiste: __body ist der Scroll-Container, nicht .deck-leiste" {
  [ -f "$DECK_LEISTE" ]
  grep -qF -e '.deck-leiste__body' "$DECK_LEISTE"
  # Kern-Assertion: overflow-y: auto im __body-Regelblock
  awk '/\.deck-leiste__body \{/,/\}/' "$DECK_LEISTE" | grep -qE 'overflow-y:[[:space:]]*auto'
  # Negativ mit Anker oben: der .deck-leiste-Regelblock traegt KEIN overflow-y mehr
  ! awk '/^  \.deck-leiste \{/,/^  \}/' "$DECK_LEISTE" | grep -qE 'overflow-y'
}

# Finding 3: Breite aus der Panel-Geometrie, nicht aus window.innerWidth.
@test "deck-resize.ts: widthFromPointer rechnet gegen rightEdge statt innerWidth" {
  [ -f "$RESIZE_LIB" ]
  grep -qE 'export function widthFromPointer' "$RESIZE_LIB"
  # Kern-Assertion: Parametername rightEdge in der Signatur
  grep -qE 'widthFromPointer\(clientX: number, rightEdge: number\)' "$RESIZE_LIB"
}

@test "DeckLeiste: Drag-Aufruf nutzt getBoundingClientRect().right" {
  [ -f "$DECK_LEISTE" ]
  grep -qF -e 'widthFromPointer' "$DECK_LEISTE"
  # Kern-Assertionen: Panel-Geometrie statt Fensterbreite im Drag-Pfad
  grep -qF -e 'getBoundingClientRect().right' "$DECK_LEISTE"
  ! grep -qF -e 'widthFromPointer(e.clientX, window.innerWidth)' "$DECK_LEISTE"
}
