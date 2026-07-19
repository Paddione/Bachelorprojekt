# Plan: Fix T001953 — Mishap Bundle (3 entries)

## Context
Three mishaps from recent sessions: subagent empty output, ticket.sh missing --component flag, and scripts issue.

## Tasks

1. **Fix qwen35-iq4 subagent empty output** (degraded)
   - Investigate `background-agents.ts` plugin for opencode delegation mechanism
   - Check if the issue is model context window, prompt size, or output token limit
   - Possible fix: reduce prompt size, or switch to a different model for delegation
   - Document root cause in ticket comment

2. **Add `--component` flag to `ticket.sh triage`** (degraded)
   - Current: `vda.sh ticket triage --id <ext-id> [flags]` supports `--priority`, `--severity`, `--status`, `--suggest`, `--apply`, `--no-comment`
   - Missing: `--component` flag
   - Add `--component` to the triage flags and wire it to `tickets.tickets.component`
   - Update `scripts/vda/ticket/triage.sh` to accept and apply the component

3. **Investigate third mishap** (scripts)
   - Review the third entry in the ticket description for details
   - Determine if it's a script bug, missing dependency, or configuration issue
   - Fix and verify

4. **Update ticket status**
   - Move T001953 from `triage` to `done` with `resolution: fixed`
   - Add comment documenting all fixes

## Verify
- `bash scripts/ticket.sh triage --help` shows `--component` flag
- Subagent delegation produces text output (test with a simple prompt)
- `bash scripts/health-goals-check.sh` still runs without errors
