---
title: "t001592 — Implementation Plan"
ticket_id: T001592
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# t001592 — Implementation Plan

_Ticket: T001592_

## File Structure

```
website/src/pages/api/admin/factory-control.ts  (Modify to support new global settings)
website/src/components/PortalSidekick.svelte    (Modify to add agent-settings view)
website/src/components/assistant/SidekickHome.svelte (Modify to add agent-settings item)
website/src/components/FactoryFloor.svelte      (Modify to render badge and handle drawer for stations)
website/src/components/factory/StationColumn.svelte (Modify to render the Agent/Modell badge)
website/src/components/PortalSidekick.test.ts   (Modify to add test cases)
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Write a Vitest test in `PortalSidekick.test.ts` verifying that navigating to `'agent-settings'` shows the correct globals panel, but it will fail since `'agent-settings'` is not yet implemented.
      `expected: FAIL`

```bash
npx vitest run website/src/components/PortalSidekick.test.ts
```

- [ ] **Fix-Step (GREEN).** Implement all the backend, API, Sidekick settings view, and Factory Floor badges, ensuring the test now passes.

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
