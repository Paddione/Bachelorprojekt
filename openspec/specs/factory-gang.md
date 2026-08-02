# factory-gang

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu factory-gang ergänzen._

## Requirements

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

<!-- merged from change delta factory-gang.md (d45712f3ae2c) -->