---
title: "mishap-t001978 — qwen35-iq4 empty-output fallback to qwen35-hq"
ticket_id: T001978
---

## ADDED Requirements

### Requirement: background-agents auto-retries on empty output

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
