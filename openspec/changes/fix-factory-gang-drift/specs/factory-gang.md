---
name: fix-factory-gang-drift
description: Port parallel gang logic to pipeline.mjs and fix dispatcher-bridge drift
---

# Capability: fix-factory-gang-drift

## Purpose

Restore parallel partial-plan execution in the factory pipeline by porting the
orphaned gang logic from pipeline.js into pipeline.mjs, and fixing the
dispatcher-bridge entrypoint drift.

## ADDED Requirements

### Requirement: Parallel Gang Execution in pipeline.mjs

The pipeline MUST execute partial plans in parallel using the gang/parallel
logic currently stranded in pipeline.js.

#### Scenario: Parallel execution is enabled

```gherkin
GIVEN multiple partials are ready for execution
WHEN dispatcher-bridge invokes pipeline.mjs
THEN partials are executed in parallel
  AND slot_count reflects actual concurrency
```
