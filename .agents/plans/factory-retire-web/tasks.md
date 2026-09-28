---
title: "factory-retire-web — Implementation Plan"
ticket_id: T900727
domains: [repo-reorg, test]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: [openspec-retire-code]
---

# factory-retire-web — Implementation Plan

Die Software Factory ist seit T900399 stillgelegt. Dieser Plan entfernt die verbliebenen Reste in `components/website`. `FACTORY-PLAN-REF` bleibt, das Plan-Staging hängt daran.

_Ticket: T900727_

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `tests/spec/sf-retirement-web.bats` | 0 (neu) | n/a (S1-ungated) |
| `tests/fixtures/sf-retirement/web.txt` | 0 (neu) | n/a (S1-ungated) |

Die 116 Zieldateien stehen je Partial in `tasks.d/` und gesammelt in den Dateilisten.
Die Änderungen entfernen nur Zeilen oder Dateien, S1-Budgets werden nicht belastet.

<!-- vitest: kein neuer Test nötig, weil nur Verweise und stillgelegte Module entfernt werden; betroffene bestehende Vitest-Dateien laufen im Partial -->

## Partials

| id | file | role | target_files | depends_on | min_tier | ctx_tokens |
|----|------|------|--------------|------------|----------|------------|
| p1 | tasks.d/p1-sf.md | impl | components/website/all_files.txt, components/website/public/cockpit/MANIFEST.md, components/website/public/cockpit/icons/enqueue-factory.svg, components/website/public/factory/MANIFEST.md, components/website/src/components/DependencyGraph.svelte, components/website/src/components/PlanningOffice.svelte, components/website/src/components/PortalSidekick.svelte, components/website/src/components/PortalSidekick.test.ts, components/website/src/components/assistant/PipelineSidekickView.svelte, components/website/src/components/assistant/PipelineSidekickView.test.ts, components/website/src/components/leitstand/Kontextzone.svelte, components/website/src/components/leitstand/LeitstandStatusband.svelte, components/website/src/components/leitstand/decks/DeckKi.svelte, components/website/src/components/leitstand/decks/DeckPlattform.svelte, components/website/src/components/sdlc/FactoryFloor.svelte, components/website/src/components/sdlc/FactoryFloorLane.svelte, components/website/src/components/sdlc/factory/AttentionStrip.svelte, components/website/src/components/sdlc/factory/AwaitingDeployLane.svelte, components/website/src/components/sdlc/factory/ContextBudgetCard.svelte, components/website/src/components/sdlc/factory/ControlCard.svelte, components/website/src/components/sdlc/factory/ControlPanel.svelte, components/website/src/components/sdlc/factory/ConveyorBelt.svelte, components/website/src/components/sdlc/factory/DailyCapCard.svelte, components/website/src/components/sdlc/factory/DetailPanel.svelte, components/website/src/components/sdlc/factory/DetailPanelSidebar.svelte, components/website/src/components/sdlc/factory/DryRunCard.svelte, components/website/src/components/sdlc/factory/FactoryBudgetPage.svelte, components/website/src/components/sdlc/factory/FactoryKpiCard.svelte, components/website/src/components/sdlc/factory/FactoryObservability.svelte | | 27b-local | 64000 |
| p2 | tasks.d/p2-sf.md | impl | components/website/src/components/sdlc/factory/FloorControlCard.svelte, components/website/src/components/sdlc/factory/InsightsTab.svelte, components/website/src/components/sdlc/factory/KiRoutingPanel.svelte, components/website/src/components/sdlc/factory/KillSwitchCard.svelte, components/website/src/components/sdlc/factory/LavishDelegationCard.svelte, components/website/src/components/sdlc/factory/LlmLoadoutPanel.svelte, components/website/src/components/sdlc/factory/LlmProxyPanel.svelte, components/website/src/components/sdlc/factory/MobileTabBar.svelte, components/website/src/components/sdlc/factory/PhaseBadge.svelte, components/website/src/components/sdlc/factory/PhaseStepper.svelte, components/website/src/components/sdlc/factory/PilotLight.svelte, components/website/src/components/sdlc/factory/ShippedColumn.svelte, components/website/src/components/sdlc/factory/ShippedColumn.test.ts, components/website/src/components/sdlc/factory/SlotCapCard.svelte, components/website/src/components/sdlc/factory/SpawnHarnessCard.svelte, components/website/src/components/sdlc/factory/StagedColumn.svelte, components/website/src/components/sdlc/factory/StationColumn.svelte, components/website/src/components/sdlc/factory/StatusStrip.svelte, components/website/src/components/sdlc/factory/SuggestedFiles.svelte, components/website/src/components/sdlc/factory/WorkpieceCard.svelte, components/website/src/components/sdlc/factory/factory-chart-colors.ts, components/website/src/components/sdlc/factory/mobile-tab-bar-constants.ts, components/website/src/components/sdlc/factory/types.ts, components/website/src/db/migrations/20260804_cockpit_notify_triggers.sql, components/website/src/lib/factory-constants.test.ts, components/website/src/lib/factory-constants.ts, components/website/src/lib/factory-floor-lanes.test.ts, components/website/src/lib/factory-floor-lanes.ts, components/website/src/lib/factory-floor-types.ts | | 27b-local | 64000 |
| p3 | tasks.d/p3-sf.md | impl | components/website/src/lib/markdown.ts, components/website/src/lib/parallel-status.ts, components/website/src/lib/qa-dal.ts, components/website/src/lib/sdlc/factory-budget.test.ts, components/website/src/lib/sdlc/factory-budget.ts, components/website/src/lib/sdlc/factory-ci.test.ts, components/website/src/lib/sdlc/factory-ci.ts, components/website/src/lib/sdlc/factory-floor-client.test.ts, components/website/src/lib/sdlc/factory-floor-client.ts, components/website/src/lib/sdlc/factory-floor-filters.ts, components/website/src/lib/sdlc/factory-floor.order.test.ts, components/website/src/lib/sdlc/factory-floor.test.ts, components/website/src/lib/sdlc/factory-floor.ts, components/website/src/lib/sdlc/factory-metrics-derive.test.ts, components/website/src/lib/sdlc/factory-metrics-derive.ts, components/website/src/lib/sdlc/factory-metrics.test.ts, components/website/src/lib/sdlc/factory-metrics.ts, components/website/src/lib/sdlc/factory-observability.test.ts, components/website/src/lib/sdlc/factory-observability.ts, components/website/src/lib/sdlc/health-goal-tickets.ts, components/website/src/lib/sdlc/leitstand-purpose-registry.ts, components/website/src/lib/sdlc/llm-proxy-factory.ts, components/website/src/lib/sdlc/tickets/cockpit-db.ts, components/website/src/lib/session-agent-factory.test.ts, components/website/src/lib/session-agent-factory.ts, components/website/src/lib/stores/factory-floor-store.test.ts, components/website/src/lib/stores/factory-floor-store.ts, components/website/src/lib/stores/help-overlay-store.ts, components/website/src/lib/tickets-db.test.ts | | 27b-local | 64000 |
| p4 | tasks.d/p4-sf.md | impl | components/website/src/lib/tickets-schema.ts, components/website/src/lib/tickets/cockpit-labels.ts, components/website/src/lib/tickets/migrations.ts, components/website/src/lib/tickets/pipeline-order.ts, components/website/src/lib/tickets/tables/factory-control.ts, components/website/src/lib/tickets/tables/tickets.ts, components/website/src/middleware/redirect-map.test.ts, components/website/src/middleware/redirect-map.ts, components/website/src/pages/sdlc/api/cockpit/actions.test.ts, components/website/src/pages/sdlc/api/cockpit/actions.ts, components/website/src/pages/sdlc/api/factory-budget.ts, components/website/src/pages/sdlc/api/factory-control.ts, components/website/src/pages/sdlc/api/factory-floor.ts, components/website/src/pages/sdlc/api/factory-floor/[extId].ts, components/website/src/pages/sdlc/api/factory-floor/[extId]/ci.ts, components/website/src/pages/sdlc/api/factory-floor/[extId]/deploy.ts, components/website/src/pages/sdlc/api/factory-floor/[extId]/inject.ts, components/website/src/pages/sdlc/api/factory-floor/[extId]/release.ts, components/website/src/pages/sdlc/api/factory-floor/ci.test.ts, components/website/src/pages/sdlc/api/factory-floor/inject.test.ts, components/website/src/pages/sdlc/api/factory-floor/stream.ts, components/website/src/pages/sdlc/api/factory-metrics.ts, components/website/src/pages/sdlc/api/factory-observability.ts, components/website/src/pages/sdlc/api/factory/force-tick.ts, components/website/src/pages/sdlc/api/factory/parallel-status.ts, components/website/src/pages/sdlc/api/llm-proxy/factory.test.ts, components/website/src/pages/sdlc/api/llm-proxy/factory.ts, components/website/src/pages/sdlc/cockpit.astro, components/website/vitest.config.ts | | 27b-local | 64000 |
| p5 | tasks.d/p5-tests.md | tests | tests/spec/sf-retirement-web.bats, tests/fixtures/sf-retirement/web.txt | p1, p2, p3, p4 | 4b-local | 8000 |

## Task: Failing Test bestätigen

```bash
bats tests/spec/sf-retirement-web.bats
```

expected: FAIL (vor den impl-Partials).

## Task: Finale Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
