---
name: fix-phase-event-whitelist
description: Add partial-done to ticket.sh state whitelist and make pipeline-runner errors visible
---

# Capability: fix-phase-event-whitelist

## Purpose

Fix silent loss of partial-completion telemetry by adding "partial-done" to the
ticket.sh state whitelist and making pipeline-runner.js errors visible in logs.

## ADDED Requirements

### Requirement: Partial-done state accepted

The `ticket.sh phase` command MUST accept "partial-done" as a valid state value.

#### Scenario: Partial-done event is recorded

```gherkin
GIVEN a partial plan completes
WHEN pipeline.js records a phase event with state "partial-done"
THEN ticket.sh accepts the state
  AND the event appears in tickets.factory_phase_events
```
