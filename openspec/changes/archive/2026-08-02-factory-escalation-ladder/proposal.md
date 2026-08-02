# Proposal: factory-escalation-ladder

## Why

Currently, when a software factory pipeline gets stuck or runs into a context-limit issue, it restarts on the same hardcoded model (`qwythos-9b-v2` via local LM Studio) on every watchdog reset. This is a waste of local/cloud resources when the model itself is the bottleneck (e.g. failing to solve a task due to reasoning capacity or getting stuck in a loop). 

Furthermore, we want to scale up models dynamically to solve harder problems:
1. Attempt 1: `flash` tier (`gemma-4-12b`) - fast, lightweight.
2. Attempt 2: `haiku` tier (`deepseek-v4-flash`) - intermediate reasoning.
3. Attempt 3: `sonnet` tier (`deepseek-v4-pro`) - heavy reasoning.
4. Attempt 4+: `unfactory` terminal status (stops loop and flags for human).

By automating this model escalation ladder, the factory tries cheap models first and only invokes expensive models when previous attempts have failed.

## What

1. **`scripts/vda/factory-prep.sh`**:
   - Query the current `factory_attempt:<ext_id>` value for the ticket from `tickets.factory_control`.
   - Map the attempt count to a target tier (`flash`, `haiku`, `sonnet`).
   - Call `route-provider.sh` to obtain the model details JSON for the selected tier.
   - Attach this `model` object to the ticket launch payload under `.model`.

2. **`scripts/factory/dispatcher-bridge.sh`**:
   - Parse the `.model` object from the JSON launch row.
   - Pass the parsed model JSON to the `Workflow` arguments as `model: ...`.

3. **`scripts/factory/pipeline.mjs`**:
   - Retrieve the model configuration from `A.model`.
   - Fall back to the default `lmstudio`/`qwythos-9b-v2` configuration if no model is provided.

4. **`scripts/factory/watchdog.sh`**:
   - Update the watchdog comments to clearly name the new escalation tier and model when a reset happens.

_Ticket: T002369_
