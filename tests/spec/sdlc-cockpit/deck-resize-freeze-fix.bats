#!/usr/bin/env bats
# T011501 — Deck-Body: stabiler Scrollbar-Gutter gegen Container-Query-Oszillation.
#
# Pruefmodus: Source-Grep (Querschnitts-/Konventionstest, T002448-M4-Ausnahme) —
# die Laufzeit-Eigenschaft (kein Renderer-Stall beim Resize) ist nur im echten
# Browser messbar; der Guard sichert die strukturelle Abhilfe gegen Drift.
# Positiv-Anker (T002356-M1): Datei + Regelblock zuerst.

DECK_LEISTE="components/website/src/components/leitstand/DeckLeiste.svelte"

@test "DeckLeiste: __body reserviert stabilen Scrollbar-Gutter" {
  [ -f "$DECK_LEISTE" ]
  # Positiv-Anker fuer den awk-Range: der __body-Block existiert und traegt
  # die bekannten Deklarationen
  awk '/\.deck-leiste__body \{/,/\}/' "$DECK_LEISTE" | grep -qE 'container-type:[[:space:]]*inline-size'
  awk '/\.deck-leiste__body \{/,/\}/' "$DECK_LEISTE" | grep -qE 'overflow-y:[[:space:]]*auto'
  # Kern-Assertion: stabiler Gutter im selben Block
  awk '/\.deck-leiste__body \{/,/\}/' "$DECK_LEISTE" | grep -qE 'scrollbar-gutter:[[:space:]]*stable'
}
