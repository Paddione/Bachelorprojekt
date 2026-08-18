# Proposal: sdlc-deck-leiste-resize

## Why

Die Z5-Deck-Leiste im SDLC-Leitstand ist fix 240–320 px breit. Seit T011498 skaliert
ihr Inhalt containerbreiten-adaptiv — aber die Breite selbst ist nicht beeinflussbar.
Der User möchte die Leiste per Drag nach links aufziehen können, z. B. um Tabellen im
Plattform-Deck oder das Budget-Deck zweispaltig zu sehen, ohne in die Vollbild-Ansicht
zu wechseln.

## What

- Resize-Handle am linken Rand der DeckLeiste (Pointer Events + pointer capture,
  Spec-Konvention; kein HTML5-DnD).
- Grid-Spalte in `cockpit.astro` wird `clamp(240px, var(--ls-deck-width, 320px), 640px)`;
  der Handle setzt die CSS-Var auf `#cockpit-root`.
- Klemm-/Berechnungslogik als reine Funktionen in `src/lib/sdlc/deck-resize.ts`.
- Persistenz in `localStorage`, Doppelklick-Reset, Keyboard-Bedienung
  (`role="separator"`, Pfeiltasten), mobil ausgeblendet.
- Tests: Vitest für die reine Logik, BATS-Struktur-Guard für die Verdrahtung.

_Ticket: T011499_
