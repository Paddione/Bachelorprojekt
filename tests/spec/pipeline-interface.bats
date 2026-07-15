#!/usr/bin/env bats
# tests/spec/pipeline-interface.bats
# SSOT: openspec/specs/pipeline-interface.md

STORE="website/src/lib/stores/factory-floor-store.ts"
FLOOR="website/src/components/FactoryFloor.svelte"
TABS="website/src/components/DevStatusTabs.svelte"
CTRL="website/src/components/factory/ControlPanel.svelte"
STRIP="website/src/components/factory/StatusStrip.svelte"
DAG="website/src/components/DependencyGraph.svelte"
SIDEKICK="website/src/components/PortalSidekick.svelte"
PIPEVIEW="website/src/components/assistant/PipelineSidekickView.svelte"
NAV="website/src/components/admin/AdminSidebarNav.astro"
BUDGETAPI="website/src/pages/api/factory-budget.ts"

@test "D1: shared floor store exists and exports the public surface" {
  [ -f "$STORE" ]
  grep -q "export const floorStore" "$STORE"
  grep -q "export function seedFloor" "$STORE"
  grep -q "export function acquireFloor" "$STORE"
  grep -q "export function floorSubscriberCount" "$STORE"
}

@test "D1: read-only consumers subscribe to the store" {
  for f in "$STRIP" \
           "website/src/components/factory/FactoryPhaseHeatmap.svelte" \
           "website/src/components/factory/FactoryShippedBar.svelte" \
           "$FLOOR" "$PIPEVIEW" "$DAG"; do
    grep -q "factory-floor-store" "$f"
  done
}

@test "D3: KI provider editor extracted; FactoryFloor drops KiProviderDrawer" {
  [ -f "website/src/components/factory/KiRoutingPanel.svelte" ]
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
  run grep -rq -- "--pb-" website/src/components/PlanningOffice.svelte \
      website/src/components/PlanningOfficeItem.svelte \
      website/src/components/PlanningOfficeDetail.svelte \
      website/src/components/PlanningOfficeTriage.svelte \
      website/src/components/PlanningOfficeQueue.svelte \
      website/src/components/factory/PhaseBadge.svelte
  [ "$status" -ne 0 ]
}

@test "D4: shared analytics window filter component exists" {
  [ -f "website/src/components/factory/AnalyticsWindowFilter.svelte" ]
}

@test "D7.3: orphan ViewSwitcher is deleted and unreferenced" {
  [ ! -f "website/src/components/factory/ViewSwitcher.svelte" ]
  run grep -rq "ViewSwitcher" website/src
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
