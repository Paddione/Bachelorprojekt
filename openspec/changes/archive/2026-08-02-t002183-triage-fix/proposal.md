# Proposal: t002183-triage-fix

## Why

Mishap: `scripts/ticket-mcp/go/internal/tools/triage.go` has a bug where an empty `status`
parameter defaults to `"triage"`, silently resetting a ticket's status. This clobbers
`plan_staged` or `in_progress` tickets when only `attention_mode` or other fields are being
patched.

## Fix

Remove the `status = "triage"` default (lines 46-49) and only pass `--status` to the CLI when
it was explicitly provided (same pattern as `priority`, `severity`, `type` etc.). Remove
stale debug output in lines 70-72.

## Trade-offs

- Minimal risk. Only changes the Go wrapper — the underlying shell script (`triage.sh`) already
  handles empty `--status` correctly via `COALESCE`.

## Risks

- None identified.
