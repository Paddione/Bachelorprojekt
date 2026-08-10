---
title: "sdlc-dashboard-redesign — Implementation Plan"
ticket_id: T003417
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
partials: 4
---

# sdlc-dashboard-redesign — Implementation Plan

_Ticket: T003417_

## File Structure

```
website/src/
├── pages/
│   └── sdlc/
│       └── cockpit.astro              (MODIFIED: Command Bar + Overview/Fokus)
├── components/
│   ├── cockpit/
│   │   ├── CommandBar.svelte          (NEW)
│   │   ├── OverviewDashboard.svelte   (NEW)
│   │   ├── CockpitRail.svelte         (NEW)
│   │   ├── PipelinePanel.svelte       (REMOVED)
│   │   └── PipelinePanel.test.ts      (REMOVED)
│   ├── DevStatusTabs.svelte           (REMOVED — replaced by architecture)
│   ├── PlanningOffice.svelte          (PRESERVED)
│   └── sdlc/
│       ├── FactoryFloor.svelte        (PRESERVED)
│       ├── factory/
│       │   ├── FactoryKpiGrid.svelte       (REMOVED)
│       │   ├── FactoryThroughputChart.svelte (REMOVED)
│       │   ├── FactoryPhaseHeatmap.svelte   (REMOVED)
│       │   ├── FactoryShippedBar.svelte     (REMOVED)
│       │   ├── AnalyticsWindowFilter.svelte (REMOVED)
│       │   ├── InsightsTab.svelte           (NEW)
│       │   └── TraceRecorder.svelte         (NEW)
│       └── ...
tests/
└── spec/
    └── sdlc-dashboard-redesign.bats    (NEW)
```

## Manifest

| # | Partial | Agent | Files | Steps |
|---|---------|-------|-------|-------|
| p1 | Command Bar + Overview Mode | devstral | 4 | 8 |
| p2 | Fokus Mode + Living Rail + Mobile | devstral | 5 | 8 |
| p3 | Unified Panels + Insights + Cleanup | devstral | 8 | 8 |
| p4 | Tests | devstral | 2 | 5 |

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Add the BATS tests. They must FAIL before implementation.
```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-dashboard-redesign.bats
# expected: FAIL (red — the redesign is not yet implemented)
```

- [ ] **Fix-Step (GREEN).** All partials implemented. Tests pass.
```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-dashboard-redesign.bats
# expected: PASS
```

- [ ] **Final Verification.** Run CI gates:
```bash
task test:changed
task freshness:regenerate
task freshness:check
```
