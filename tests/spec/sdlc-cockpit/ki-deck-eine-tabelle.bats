#!/usr/bin/env bats
# tests/spec/sdlc-cockpit/ki-deck-eine-tabelle.bats
# T013302 — KI-Deck konsolidieren: genau eine Phase->Modell-Tabelle.
#
# Prueft den beobachtbaren Zustand der Quellen, nicht die Implementierung:
#   (a) FactoryModelSlots.svelte existiert nicht mehr (auch nicht getrackt)
#   (b) kein getrackter Pfad unter components/website/src und scripts/
#       nennt die Tabelle factory_model_slots
#   (c) DeckKi.svelte mountet KiKonfiguration und FactoryModelSlots nicht mehr
#
# Jede Zusicherung traegt einen Positiv-Anker: zuerst wird geprueft, dass die
# Suche ueberhaupt Treffer produzieren kann — sonst ist ein leeres Suchergebnis
# nicht von "Guard greift" zu unterscheiden.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SRC="$REPO/components/website/src"
}

@test "(a) Positiv-Anker: das Factory-Komponentenverzeichnis enthaelt Svelte-Dateien" {
  anchor="$(find "$SRC/components/sdlc/factory" -name '*.svelte' 2>/dev/null | wc -l | tr -d ' ')"
  [ "$anchor" -gt 0 ]
}

@test "(a) FactoryModelSlots.svelte existiert nicht mehr" {
  [ ! -e "$SRC/components/sdlc/factory/FactoryModelSlots.svelte" ]
}

@test "(a) FactoryModelSlots ist nowhere tracked im Repo" {
  run git -C "$REPO" ls-files
  [ "$status" -eq 0 ]
  anchor="$(grep -c '\.svelte$' <<< "$output" || true)"
  [ "$anchor" -gt 0 ]
  refuted="$(grep -c 'FactoryModelSlots' <<< "$output" || true)"
  [ "$refuted" -eq 0 ]
}

@test "(b) Positiv-Anker: die Quellensuche findet provider_config als verbleibende Quelle" {
  run git -C "$REPO" grep -l "provider_config" -- components/website/src scripts/
  [ "$status" -eq 0 ]
  [ "${lines[0]}" != "" ]
}

@test "(b) kein getrackter Pfad nennt factory_model_slots" {
  run git -C "$REPO" grep -l "factory_model_slots" -- components/website/src scripts/
  [ "$status" -ne 0 ]
}

@test "(c) Positiv-Anker: DeckKi.svelte bindet weiterhin seine Module ein" {
  grep -q "import LlmProxyPanel" "$SRC/components/leitstand/decks/DeckKi.svelte"
  grep -q "import KiRoutingPanel" "$SRC/components/leitstand/decks/DeckKi.svelte"
}

@test "(c) DeckKi.svelte mountet KiKonfiguration nicht mehr" {
  ! grep -q "KiKonfiguration" "$SRC/components/leitstand/decks/DeckKi.svelte"
}

@test "(c) DeckKi.svelte mountet FactoryModelSlots nicht mehr" {
  ! grep -q "FactoryModelSlots" "$SRC/components/leitstand/decks/DeckKi.svelte"
}
