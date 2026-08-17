#!/usr/bin/env bats
# T011498 — Z5 DeckLeiste: Deck-Inhalte muessen containerbreiten-adaptiv sein.
#
# Pruefmodus: Source-Grep (Querschnitts-/Konventionstest, T002448-M4-Ausnahme).
# Das zu pruefende Ergebnis — welche CSS-Regeln eine Komponente traegt —
# manifestiert sich ausschliesslich im Quelltext; ein Laufzeit-Layout-Test
# braeuchte einen echten Browser (jsdom rendert kein Layout). Der spaetere
# E2E-Beleg laeuft ueber dev-flow-e2e/Playwright.
#
# Positiv-Anker (T002356-M1): jeder Negativ-/Konventionstest verankert zuerst,
# dass die Zieldatei und der Ziel-Selektor existieren — fehlt die Komponente,
# wird der Test rot statt vakuos gruen.

WEBSITE_SRC="components/website/src"
DECK_LEISTE="$WEBSITE_SRC/components/leitstand/DeckLeiste.svelte"
CONTROL_PANEL="$WEBSITE_SRC/components/sdlc/factory/ControlPanel.svelte"
OBSERVABILITY="$WEBSITE_SRC/components/sdlc/factory/FactoryObservability.svelte"
BUDGET_PAGE="$WEBSITE_SRC/components/sdlc/factory/FactoryBudgetPage.svelte"

@test "DeckLeiste: __body ist CSS-Query-Container (container-type: inline-size)" {
  # Positiv-Anker: Datei + Selektor existieren
  [ -f "$DECK_LEISTE" ]
  grep -qF -e '.deck-leiste__body' "$DECK_LEISTE"
  # Kern-Assertion: der Body ist ein inline-size-Container
  grep -qE 'container-type:[[:space:]]*inline-size' "$DECK_LEISTE"
}

@test "ControlPanel: @container-Regel kollabiert das 2-Spalten-Grid" {
  [ -f "$CONTROL_PANEL" ]
  grep -qF -e '.control-panel__grid' "$CONTROL_PANEL"
  grep -qF -e 'repeat(2, 1fr)' "$CONTROL_PANEL"
  # Kern-Assertion: Container-Query vorhanden
  grep -qF -e '@container' "$CONTROL_PANEL"
}

@test "FactoryObservability: @container-Regel fuer kpi-row vorhanden" {
  [ -f "$OBSERVABILITY" ]
  grep -qF -e '.kpi-row' "$OBSERVABILITY"
  grep -qF -e '@container' "$OBSERVABILITY"
}

@test "FactoryBudgetPage: @container-Regel fuer Kompakt-Layout vorhanden" {
  [ -f "$BUDGET_PAGE" ]
  grep -qF -e '.dashboard-grid' "$BUDGET_PAGE"
  grep -qF -e '@container' "$BUDGET_PAGE"
}
