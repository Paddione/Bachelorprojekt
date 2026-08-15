#!/usr/bin/env bats
#
# SSOT-Spec: openspec/specs/sdlc-cockpit.md — Change: sdlc-dashboard-redesign [T003417]
#
# Pruefmodus: Quelltext-Guards (dokumentierte Ausnahme in CLAUDE.md
# "Test-Resultats-Konvention" [T002448-M4]). Geprueft wird ausschliesslich, was
# sich NUR im Quellbaum manifestiert: dass geloeschte Komponenten wirklich weg
# sind und niemand sie mehr importiert. Das Laufzeitverhalten des Cockpits
# (Modus-Umschaltung, kontextsensitive Rail) haengt NICHT hier, sondern in den
# Vitest-Komponententests unter components/website/src/components/cockpit/*.test.ts — dort
# wird gerendert und geklickt statt gegreppt.
#
# Bewusst NICHT hier: curl-Proben gegen einen laufenden Dev-Server. Die koennen
# in CI nie gruen werden (dort laeuft kein Astro auf :4321) und sind als
# E2E-Faelle in Playwright aufgehoben.
#
# Befund 4 [T007957/E3] — Anpassung ausserhalb des Plan-Scope, im Geiste von p3 geloest:
# Vier der fuenf Tests haengten an Komponenten, die die E3-Leitstand-Shell ersatzlos
# loescht (CommandBar/CockpitRail/OverviewDashboard + deren kollokierte Vitest-Tests).
# Die gesicherten Aussagen bleiben erhalten und werden auf die Nachfolger re-verankert:
#   - T1 (Nachfolger existieren): LeitstandStatusband/Kontextzone/DeckLeiste statt
#     CommandBar/CockpitRail/OverviewDashboard; InsightsTab ueberlebt unveraendert.
#   - T3 (Positiv-Anker): cockpit.astro importiert weiterhin die Z4 Kontextzone.
#   - T4 (PlanningOffice/FactoryFloor ueberleben): Mount-Punkt ist jetzt Kontextzone.svelte.
#   - T5 (Laufzeit-Coverage in Vitest): die drei neuen lib-Suites
#     leitstand-{url,purpose-registry,metrics}.test.ts statt der geloeschten
#     Komponententests; Registrierungs-Glob ist das node-Projekt
#     (src/**/*.{test,spec}.ts), das src/lib/**/*.test.ts einschliesst.

setup() {
  REPO_ROOT="$BATS_TEST_DIRNAME/../../.."
  COCKPIT_PAGE="$REPO_ROOT/components/website/src/pages/sdlc/cockpit.astro"
  COCKPIT_DIR="$REPO_ROOT/components/website/src/components/cockpit"
  FACTORY_DIR="$REPO_ROOT/components/website/src/components/sdlc/factory"
  LEITSTAND_DIR="$REPO_ROOT/components/website/src/components/leitstand"
  LIB_TESTS_DIR="$REPO_ROOT/components/website/src/lib/sdlc/__tests__"
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
  # [T007957/E3] CommandBar/CockpitRail/OverviewDashboard sterben ersatzlos; die
  # Nachfolge-Zonen sind LeitstandStatusband (Z1), Kontextzone (Z4) und
  # DeckLeiste (Z5) unter components/leitstand/ (design.md § Zonen-Vertrag).
  [ -f "$LEITSTAND_DIR/LeitstandStatusband.svelte" ]
  [ -f "$LEITSTAND_DIR/Kontextzone.svelte" ]
  [ -f "$LEITSTAND_DIR/DeckLeiste.svelte" ]
  [ -f "$FACTORY_DIR/InsightsTab.svelte" ]
}

@test "SDLC-COCKPIT: die ersetzten Komponenten sind aus dem Quellbaum entfernt" {
  # Positiv-Anker: der Pfad, unter dem gesucht wird, existiert ueberhaupt.
  [ -d "$COCKPIT_DIR" ]
  [ -d "$FACTORY_DIR" ]

  local missing=0
  for comp in "${REMOVED_COMPONENTS[@]}"; do
    if [ -f "$REPO_ROOT/components/website/src/components/$comp" ]; then
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
  # [T007957/E3] Anker ist jetzt die Kontextzone (Z4-Router), die cockpit.astro
  # als Kernzone der Shell einbindet.
  run grep -rF "Kontextzone" "$REPO_ROOT/components/website/src/pages/sdlc/cockpit.astro"
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
        "$REPO_ROOT/components/website/src" >/dev/null 2>&1; then
      echo "verwaiste Referenz auf $name:"
      grep -rlnE --include='*.svelte' --include='*.astro' --include='*.ts' \
        "import[[:space:]{(].*$name|from[[:space:]]+['\"][^'\"]*$name" \
        "$REPO_ROOT/components/website/src"
      orphans=1
    fi
  done
  [ "$orphans" -eq 0 ]
}

@test "SDLC-COCKPIT: PlanningOffice und FactoryFloor ueberleben das Redesign" {
  [ -f "$REPO_ROOT/components/website/src/components/PlanningOffice.svelte" ]
  [ -f "$REPO_ROOT/components/website/src/components/sdlc/FactoryFloor.svelte" ]

  # Existenz allein genuegt nicht — sie muessen auch weiterhin eingebunden sein.
  # [T007957/E3] Mount-Punkt ist jetzt die Kontextzone (Z4): sie haengt die
  # Fertigungsstationen an FactoryFloor und triage/planung an PlanningOffice
  # (p1 Task 10). cockpit.astro importiert die Zonen selbst nicht mehr einzeln.
  run grep -cF "PlanningOffice" "$LEITSTAND_DIR/Kontextzone.svelte"
  [ "$status" -eq 0 ]
  [ "$output" -gt 0 ]

  run grep -cF "FactoryFloor" "$LEITSTAND_DIR/Kontextzone.svelte"
  [ "$status" -eq 0 ]
  [ "$output" -gt 0 ]
}

@test "SDLC-COCKPIT: das Laufzeitverhalten ist in Vitest abgedeckt" {
  # Guard gegen die Luecke aus T002657: eine Testdatei, die in keinem Runner
  # registriert ist, faellt lokal nicht auf. [T007957/E3] Die Komponententests
  # der geloeschten Komponenten (CommandBar/CockpitRail) sterben mit ihnen; die
  # extrahierte Logik lebt als pure lib-Funktionen und ist unter
  # src/lib/sdlc/__tests__/ vitest-abgedeckt (node-Projekt). Registriert sind
  # sie ueber den Include-Glob src/**/*.{test,spec}.ts der vitest.config.
  [ -f "$LIB_TESTS_DIR/leitstand-url.test.ts" ]
  [ -f "$LIB_TESTS_DIR/leitstand-purpose-registry.test.ts" ]
  [ -f "$LIB_TESTS_DIR/leitstand-metrics.test.ts" ]

  run grep -F "src/**/*.{test,spec}.ts" "$REPO_ROOT/components/website/vitest.config.ts"
  [ "$status" -eq 0 ]
}
