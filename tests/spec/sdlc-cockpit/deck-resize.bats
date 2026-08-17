#!/usr/bin/env bats
# T011499 — Z5 DeckLeiste: Drag-Resize mit Content-Autoscaling.
#
# Pruefmodus: Source-Grep (Querschnitts-/Konventionstest, T002448-M4-Ausnahme).
# Die Laufzeit-Geometrie (Drag → Spaltenbreite) braucht einen echten Browser;
# der Laufzeit-Beleg laeuft ueber die Vitest-Suite der reinen Klemm-Logik
# (deck-resize.test.ts, CI-Job "Vitest (website)") und dev-flow-e2e.
# Positiv-Anker (T002356-M1): Existenz von Datei + Ziel-Selektor zuerst.

WEBSITE_SRC="components/website/src"
DECK_LEISTE="$WEBSITE_SRC/components/leitstand/DeckLeiste.svelte"
COCKPIT="$WEBSITE_SRC/pages/sdlc/cockpit.astro"
RESIZE_LIB="$WEBSITE_SRC/lib/sdlc/deck-resize.ts"
RESIZE_TEST="$WEBSITE_SRC/lib/sdlc/deck-resize.test.ts"

@test "deck-resize: reine Klemm-Logik existiert samt Vitest-Suite" {
  [ -f "$RESIZE_LIB" ]
  grep -qE 'export function clampDeckWidth' "$RESIZE_LIB"
  [ -f "$RESIZE_TEST" ]
  grep -qF -e 'clampDeckWidth' "$RESIZE_TEST"
}

@test "cockpit.astro: Grid-Spalte konsumiert --ls-deck-width mit clamp" {
  # Positiv-Anker: Datei + Grid-Definition existieren
  [ -f "$COCKPIT" ]
  grep -qF -e 'grid-template-columns' "$COCKPIT"
  # Kern-Assertion: CSS-Var + clamp statt fixer minmax-Spalte
  grep -qF -e '--ls-deck-width' "$COCKPIT"
  grep -qF -e 'clamp(240px' "$COCKPIT"
}

@test "DeckLeiste: Resize-Handle mit Pointer-Capture und Separator-Rolle" {
  [ -f "$DECK_LEISTE" ]
  grep -qF -e 'deck-leiste' "$DECK_LEISTE"
  # Kern-Assertionen: Handle-Element, Pointer-Capture (Spec-Konvention,
  # kein HTML5-DnD), A11y-Rolle
  grep -qF -e 'setPointerCapture' "$DECK_LEISTE"
  grep -qF -e 'role="separator"' "$DECK_LEISTE"
  grep -qF -e 'aria-valuenow' "$DECK_LEISTE"
}

@test "DeckLeiste: Persistenz ueber localStorage-Key ls-deck-width" {
  [ -f "$DECK_LEISTE" ]
  grep -qF -e 'ls-deck-width' "$DECK_LEISTE"
}
