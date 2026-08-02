# phase-events

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu phase-events ergänzen._

## Requirements

### Requirement: Partial-done state accepted

The `ticket.sh phase` command MUST accept "partial-done" as a valid state value.

#### Scenario: Partial-done event is recorded

```gherkin
GIVEN a partial plan completes
WHEN pipeline.js records a phase event with state "partial-done"
THEN ticket.sh accepts the state
  AND the event appears in tickets.factory_phase_events
```

<!-- merged from change delta phase-events.md (e93dace1d44e) -->