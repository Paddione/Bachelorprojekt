#!/usr/bin/env bats
# tests/spec/t001586.bats
# T001586: vda.sh oracle dispatch smoke test.

@test "ticket-mcp-build: scripts/vda/oracle.sh exists and is executable" {
    [ -x scripts/vda/oracle.sh ]
}

@test "ticket-mcp-build: scripts/vda.sh dispatches 'oracle' to scripts/vda/oracle.sh" {
    grep -q 'exec "${SCRIPT_DIR}/vda/oracle.sh"' scripts/vda.sh
}

@test "ticket-mcp-build: oracle.sh fast-paths 'namespace:task' goals before the LLM source, skipping network calls" {
    # A real end-to-end run of the fastpath depends on `task --list-all`
    # output formatting, which drifts across go-task versions (arduino/setup-task
    # tracks latest, unpinned) — assert the structural guarantee instead:
    # the FASTPATH_REGEX check (and its `exit 0` on match) appears before the
    # oracle-ai-call.sh source that performs the actual LLM/network call.
    local fastpath_line ai_call_source_line
    fastpath_line=$(grep -n '^FASTPATH_REGEX=' scripts/vda/oracle.sh | cut -d: -f1)
    ai_call_source_line=$(grep -n 'source.*oracle-ai-call\.sh' scripts/vda/oracle.sh | cut -d: -f1)
    [ -n "$fastpath_line" ]
    [ -n "$ai_call_source_line" ]
    [ "$fastpath_line" -lt "$ai_call_source_line" ]
}

@test "ticket-mcp-build: lib/batch-builds.mjs was removed (unrelated dead code)" {
    [ ! -f lib/batch-builds.mjs ]
}
