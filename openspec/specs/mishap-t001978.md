# mishap-t001978

## Purpose

_Purpose fehlt — beim nächsten inhaltlichen Delta zu mishap-t001978 ergänzen._

## Requirements

### Requirement: background-agents auto-retries on empty output

#### Scenario: background-agents auto-retries on empty output

WHEN a delegation via `.opencode/plugins/background-agents.ts` returns
`status: "complete"` AND `result.text` is empty
AND the originating agent is `qwen35-iq4`
THEN the plugin MUST automatically retry the delegation once with
`qwen35-hq` as the agent (preserving the original `parentId` for
traceability)
AND the original delegation record MUST remain in `running` state until
the fallback terminates
AND only if the fallback also returns empty text the delegation MUST be
marked as `error` with reason `empty_output_after_fallback`.

<!-- merged from change delta mishap-t001978.md (c4a76053311c) -->