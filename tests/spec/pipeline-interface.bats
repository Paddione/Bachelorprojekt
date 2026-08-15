#!/usr/bin/env bats
# tests/spec/pipeline-interface.bats
# SSOT: openspec/specs/pipeline-interface.md

STORE="components/website/src/lib/stores/factory-floor-store.ts"
FLOOR="components/website/src/components/sdlc/FactoryFloor.svelte"
TABS="components/website/src/components/DevStatusTabs.svelte"
CTRL="components/website/src/components/sdlc/factory/ControlPanel.svelte"
STRIP="components/website/src/components/sdlc/factory/StatusStrip.svelte"
DAG="components/website/src/components/DependencyGraph.svelte"
SIDEKICK="components/website/src/components/PortalSidekick.svelte"
PIPEVIEW="components/website/src/components/assistant/PipelineSidekickView.svelte"
NAV="components/website/src/components/admin/AdminSidebarNav.astro"
BUDGETAPI="components/website/src/pages/sdlc/api/factory-budget.ts"

@test "D1: shared floor store exists and exports the public surface" {
  [ -f "$STORE" ]
  grep -q "export const floorStore" "$STORE"
  grep -q "export function seedFloor" "$STORE"
  grep -q "export function acquireFloor" "$STORE"
  grep -q "export function floorSubscriberCount" "$STORE"
}

@test "D1: read-only consumers subscribe to the store" {
  # [T003417] FactoryPhaseHeatmap und FactoryShippedBar sind aus dieser Liste
  # entfernt: der Change "sdlc-dashboard-redesign" löscht sie (REMOVED
  # Requirement "Alte Analytics-KPIs"). Ohne die Streichung schlug der Test mit
  # `grep: … No such file or directory` fehl — also an einer fehlenden Datei
  # statt an einer fehlenden Store-Anbindung.
  for f in "$STRIP" "$FLOOR" "$PIPEVIEW" "$DAG"; do
    grep -q "factory-floor-store" "$f"
  done
}

@test "D3: KI provider editor extracted; FactoryFloor drops KiProviderDrawer" {
  [ -f "components/website/src/components/sdlc/factory/KiRoutingPanel.svelte" ]
  run grep -q "KiProviderDrawer" "$FLOOR"
  [ "$status" -ne 0 ]
}

@test "D2: ControlPanel models all 7 control fields" {
  grep -q "contextBudget" "$CTRL"
  grep -q "spawnHarness" "$CTRL"
  grep -q "lavishDelegation" "$CTRL"
}

@test "D2: PortalSidekick drops control-edit UI, links to Steuerung tab" {
  run grep -q "bind:value={settings.contextBudget}" "$SIDEKICK"
  [ "$status" -ne 0 ]
  run grep -q "bind:checked={settings.spawnHarness}" "$SIDEKICK"
  [ "$status" -ne 0 ]
  grep -q "tab=control" "$SIDEKICK"
}

@test "D5: DependencyGraph has no setInterval poll" {
  run grep -q "setInterval" "$DAG"
  [ "$status" -ne 0 ]
}

@test "D1: StatusStrip drops the hardcoded 30s poll" {
  run grep -q "setInterval(pollWatchdog, 30000)" "$STRIP"
  [ "$status" -ne 0 ]
}

@test "D7.2: DevStatusTabs prefers the URL tab over localStorage" {
  grep -q "urlTab" "$TABS"
}

@test "D6: no --pb-* palette remains in Planungsbüro components" {
  run grep -rq -- "--pb-" components/website/src/components/PlanningOffice.svelte \
      components/website/src/components/PlanningOfficeItem.svelte \
      components/website/src/components/PlanningOfficeDetail.svelte \
      components/website/src/components/PlanningOfficeTriage.svelte \
      components/website/src/components/PlanningOfficeQueue.svelte \
      components/website/src/components/sdlc/factory/PhaseBadge.svelte
  [ "$status" -ne 0 ]
}

# [T003417] D4 ist aufgehoben: der Change "sdlc-dashboard-redesign" entfernt
# AnalyticsWindowFilter zusammen mit den vier Analytics-Komponenten, die ihn als
# einzige nutzten (REMOVED Requirement "Alte Analytics-KPIs"). Ein geteilter
# Fensterfilter ohne Konsumenten hat keinen Inhalt mehr, den er teilen könnte.
# Dass die Komponente wirklich weg ist UND niemand sie mehr importiert, prüft
# tests/spec/sdlc-cockpit/redesign-struktur.bats.
@test "D4: der geteilte Analytics-Fensterfilter ist mitsamt seinen Konsumenten entfernt" {
  # Positiv-Anker: der Pfad, unter dem gesucht wird, existiert überhaupt —
  # sonst bestünde die Abwesenheitsaussage vakuos.
  [ -d "components/website/src/components/sdlc/factory" ]
  [ ! -f "components/website/src/components/sdlc/factory/AnalyticsWindowFilter.svelte" ]
}

@test "D7.3: orphan ViewSwitcher is deleted and unreferenced" {
  [ ! -f "components/website/src/components/sdlc/factory/ViewSwitcher.svelte" ]
  run grep -rq "ViewSwitcher" components/website/src
  [ "$status" -ne 0 ]
}

@test "D7.4: dead /dev-status nav match removed" {
  run grep -q "dev-status" "$NAV"
  [ "$status" -ne 0 ]
}

@test "D7.6: /api/factory-budget auth unified to 401 (no 403)" {
  run grep -q "status: 403" "$BUDGETAPI"
  [ "$status" -ne 0 ]
}
