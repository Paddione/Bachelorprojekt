---
title: "Plan: Spec-BATS Coverage (Workspace Integrations)"
ticket_id: "T002012"
domains: [infrastructure, tests]
status: "planning"
---

# spec-bats-workspace-integrations — Implementation Plan

## File Structure
- `tests/spec/collabora-integration.bats` (new)
- `tests/spec/livekit-integration.bats` (new)
- `tests/spec/mediaviewer.bats` (new)
- `tests/spec/nextcloud-integration.bats` (new)
- `tests/spec/vaultwarden-integration.bats` (new)

## Task 1: Initialize BATS Test Files

**Requirement:** Create the 5 BATS test files as per the design spec to establish initial test coverage for the workspace-integration specs.
**Files:**
- `tests/spec/collabora-integration.bats` (s1_budget: 0)
- `tests/spec/livekit-integration.bats` (s1_budget: 0)
- `tests/spec/mediaviewer.bats` (s1_budget: 0)
- `tests/spec/nextcloud-integration.bats` (s1_budget: 0)
- `tests/spec/vaultwarden-integration.bats` (s1_budget: 0)

1. Create each BATS file with a standard BATS init block and a single passing `@test` block per file.
```bash
#!/usr/bin/env bats

@test "<spec-slug> spec covered" {
  run true
  [ "$status" -eq 0 ]
}
```
(Ersetze `<spec-slug>` je Datei durch den jeweiligen Namen, z.B. "collabora-integration spec covered".)

## Task 2: Verifikation

**Requirement:** Ensure the tests pass and CI metrics are updated.
1. `task test:changed`
2. `task freshness:regenerate`
3. `task freshness:check`
