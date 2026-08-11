#!/usr/bin/env bats
#
# SSOT-Spec: openspec/specs/sdlc-cockpit.md — Change: sdlc-dashboard-redesign [T003417]
#
# Pruefmodus: Quelltext-Guards (dokumentierte Ausnahme in CLAUDE.md
# "Test-Resultats-Konvention" [T002448-M4]). Geprueft wird ausschliesslich, was
# sich NUR im Quellbaum manifestiert: dass geloeschte Komponenten wirklich weg
# sind und niemand sie mehr importiert. Das Laufzeitverhalten des Cockpits
# (Modus-Umschaltung, kontextsensitive Rail) haengt NICHT hier, sondern in den
# Vitest-Komponententests unter website/src/components/cockpit/*.test.ts — dort
# wird gerendert und geklickt statt gegreppt.
#
# Bewusst NICHT hier: curl-Proben gegen einen laufenden Dev-Server. Die koennen
# in CI nie gruen werden (dort laeuft kein Astro auf :4321) und sind als
# E2E-Faelle in Playwright aufgehoben.

setup() {
  REPO_ROOT="$BATS_TEST_DIRNAME/../../.."
  COCKPIT_PAGE="$REPO_ROOT/website/src/pages/sdlc/cockpit.astro"
  COCKPIT_DIR="$REPO_ROOT/website/src/components/cockpit"
  FACTORY_DIR="$REPO_ROOT/website/src/components/sdlc/factory"
}

# Die im Redesign entfernten Komponenten. Jeder Eintrag muss aus dem Quellbaum
# verschwunden sein UND darf nirgends mehr importiert werden — ein
# zurueckbleibender Import bricht den Build erst zur Laufzeit.
REMOVED_COMPONENTS=(
  "cockpit/PipelinePanel.svelte"
  "sdlc/factory/AnalyticsWindowFilter.svelte"
  "sdlc/factory/FactoryKpiGrid.svelte"
  "sdlc/factory/FactoryPhaseHeatmap.svelte"
  "sdlc/factory/FactoryShippedBar.svelte"
  "sdlc/factory/FactoryThroughputChart.svelte"
)

@test "SDLC-COCKPIT: die Nachfolger-Komponenten des Redesigns existieren" {
  # Positiv-Anker fuer die Loesch-Guards unten: waeren die Ersatzkomponenten
  # nicht da, wuerde "die alten sind weg" vakuos bestehen — ein leeres
  # Verzeichnis erfuellt jede Abwesenheitsaussage.
  [ -f "$COCKPIT_DIR/CommandBar.svelte" ]
  [ -f "$COCKPIT_DIR/CockpitRail.svelte" ]
  [ -f "$COCKPIT_DIR/OverviewDashboard.svelte" ]
  [ -f "$FACTORY_DIR/InsightsTab.svelte" ]
}

@test "SDLC-COCKPIT: die ersetzten Komponenten sind aus dem Quellbaum entfernt" {
  # Positiv-Anker: der Pfad, unter dem gesucht wird, existiert ueberhaupt.
  [ -d "$COCKPIT_DIR" ]
  [ -d "$FACTORY_DIR" ]

  local missing=0
  for comp in "${REMOVED_COMPONENTS[@]}"; do
    if [ -f "$REPO_ROOT/website/src/components/$comp" ]; then
      echo "noch vorhanden: $comp"
      missing=1
    fi
  done
  [ "$missing" -eq 0 ]
}

@test "SDLC-COCKPIT: keine verwaisten Importe auf entfernte Komponenten" {
  # Positiv-Anker: die Suche findet im selben Baum einen Import, den es geben
  # MUSS. Ohne ihn koennte ein kaputtes grep-Kommando "nichts gefunden" melden
  # und der Test bestuende, waehrend verwaiste Importe unbemerkt blieben.
  run grep -rF "CommandBar" "$REPO_ROOT/website/src/pages/sdlc/cockpit.astro"
  [ "$status" -eq 0 ]

  local orphans=0
  for comp in "${REMOVED_COMPONENTS[@]}"; do
    local name="${comp##*/}"; name="${name%.svelte}"
    # Nur IMPORT-STATEMENTS matchen (T003615), nicht den nackten Namen: Ein
    # Kommentar, der die Komponente historisch erwaehnt ("WICHTIG (wie
    # PipelinePanel, E22)"), ist kein Import. Gematcht wird eine Zeile, die
    # `import` + Namen traegt (Import-Name oder Dynamik-Import) oder ein
    # `from '<pfad>'`, dessen Pfad den Komponentennamen enthaelt — deckt auch
    # mehrzeilige Imports ab, deren Name in einer Folgezeile steht.
    if grep -rnE --include='*.svelte' --include='*.astro' --include='*.ts' \
        "import[[:space:]{(].*$name|from[[:space:]]+['\"][^'\"]*$name" \
        "$REPO_ROOT/website/src" >/dev/null 2>&1; then
      echo "verwaiste Referenz auf $name:"
      grep -rlnE --include='*.svelte' --include='*.astro' --include='*.ts' \
        "import[[:space:]{(].*$name|from[[:space:]]+['\"][^'\"]*$name" \
        "$REPO_ROOT/website/src"
      orphans=1
    fi
  done
  [ "$orphans" -eq 0 ]
}

@test "SDLC-COCKPIT: PlanningOffice und FactoryFloor ueberleben das Redesign" {
  [ -f "$REPO_ROOT/website/src/components/PlanningOffice.svelte" ]
  [ -f "$REPO_ROOT/website/src/components/sdlc/FactoryFloor.svelte" ]

  # Existenz allein genuegt nicht — sie muessen auch weiterhin eingebunden sein.
  run grep -cF "PlanningOffice" "$COCKPIT_PAGE"
  [ "$status" -eq 0 ]
  [ "$output" -gt 0 ]

  run grep -cF "FactoryFloor" "$COCKPIT_PAGE"
  [ "$status" -eq 0 ]
  [ "$output" -gt 0 ]
}

@test "SDLC-COCKPIT: das Laufzeitverhalten ist in Vitest abgedeckt" {
  # Guard gegen die Luecke aus T002657: eine Testdatei, die in keinem Runner
  # registriert ist, faellt lokal nicht auf. Die Cockpit-Komponententests
  # muessen existieren und vom `components`-Projekt der vitest.config erfasst
  # sein (dessen Glob src/components/**/*.test.ts sie einschliesst).
  [ -f "$COCKPIT_DIR/CommandBar.test.ts" ]
  [ -f "$COCKPIT_DIR/CockpitRail.test.ts" ]

  run grep -F "src/components/**/*.{test,spec}.ts" "$REPO_ROOT/website/vitest.config.ts"
  [ "$status" -eq 0 ]
}
