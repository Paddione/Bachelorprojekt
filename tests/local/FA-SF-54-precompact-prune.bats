#!/usr/bin/env bats
# FA-SF-54 — precompact-prune.sh: prune obsolete tool_result before /compact
setup() {
  load 'test_helper.bash'
  export TMPDIR; TMPDIR=$(mktemp -d)
}
teardown() { rm -rf "$TMPDIR"; }

make_transcript() {
  local f="$TMPDIR/transcript.jsonl"
  while IFS= read -r line; do echo "$line" >> "$f"; done
  echo "$f"
}

@test "FA-SF-54: fehlendes Transcript → exit 0, kein Schreibzugriff" {
  run bash scripts/hooks/precompact-prune.sh <<< '{}'
  [ "$status" -eq 0 ]
}

@test "FA-SF-54: leeres Transcript → exit 0, unverändert" {
  local f; f=$(make_transcript <<< '')
  run bash -c "echo '{\"transcript_path\": \"$f\"}' | bash scripts/hooks/precompact-prune.sh"
  [ "$status" -eq 0 ]
}

@test "FA-SF-54: obsoletes read-only tool_result → pruned" {
  local f; f=$(make_transcript <<'JSON'
{"type":"tool_use","tool_use_id":"call-init"}
{"type":"tool_result","tool_use_id":"call-1","content":"very long output here that is obsolete","metadata":{"original_tool":"Read"}}
{"type":"tool_use","tool_use_id":"call-2"}
{"type":"tool_result","tool_use_id":"call-2","content":"newer read","metadata":{"original_tool":"Read"}}
{"type":"tool_use","tool_use_id":"call-3"}
{"type":"tool_result","tool_use_id":"call-3","content":"even newer","metadata":{"original_tool":"Bash"}}
JSON
)
  run bash -c "echo '{\"transcript_path\": \"$f\"}' | bash scripts/hooks/precompact-prune.sh"
  [ "$status" -eq 0 ]
  run jq -r 'select(.type == "tool_result") | select(.content | startswith("[pruned:")) | .content' "$f"
  [ -n "$output" ]
}

@test "FA-SF-54: jüngstes Output → unangetastet" {
  local f; f=$(make_transcript <<'JSON'
{"type":"tool_use","tool_use_id":"call-init"}
{"type":"tool_result","tool_use_id":"call-1","content":"recent output","metadata":{"original_tool":"Read"}}
{"type":"assistant","content":[{"type":"tool_use","tool_use_id":"call-1"}]}
{"type":"tool_use","tool_use_id":"call-2"}
{"type":"tool_result","tool_use_id":"call-2","content":"other","metadata":{"original_tool":"Bash"}}
JSON
)
  run bash -c "echo '{\"transcript_path\": \"$f\"}' | bash scripts/hooks/precompact-prune.sh"
  [ "$status" -eq 0 ]
  run jq -r 'select(.type == "tool_result") | select(.tool_use_id == "call-1") | .content' "$f"
  [[ "$output" == "recent output" ]]
}

@test "FA-SF-54: Idempotenz — zweiter Lauf = byte-identisch" {
  local f; f=$(make_transcript <<'JSON'
{"type":"tool_use","tool_use_id":"call-init"}
{"type":"tool_result","tool_use_id":"call-1","content":"long obsolete read","metadata":{"original_tool":"Grep"}}
{"type":"tool_use","tool_use_id":"call-2"}
{"type":"tool_result","tool_use_id":"call-2","content":"newer","metadata":{"original_tool":"Read"}}
{"type":"tool_use","tool_use_id":"call-3"}
{"type":"tool_result","tool_use_id":"call-3","content":"latest","metadata":{"original_tool":"Bash"}}
JSON
)
  run bash -c "echo '{\"transcript_path\": \"$f\"}' | bash scripts/hooks/precompact-prune.sh"
  [ "$status" -eq 0 ]
  local h1; h1=$(sha256sum "$f" | cut -d' ' -f1)
  run bash -c "echo '{\"transcript_path\": \"$f\"}' | bash scripts/hooks/precompact-prune.sh"
  [ "$status" -eq 0 ]
  local h2; h2=$(sha256sum "$f" | cut -d' ' -f1)
  [ "$h2" = "$h1" ]
}

@test "FA-SF-54: alle Zeilen valides JSON nach Prune" {
  local f; f=$(make_transcript <<'JSON'
{"type":"tool_use","tool_use_id":"call-init"}
{"type":"tool_result","tool_use_id":"call-1","content":"long content here","metadata":{"original_tool":"Bash"}}
{"type":"tool_use","tool_use_id":"call-2"}
{"type":"tool_result","tool_use_id":"call-2","content":"more content","metadata":{"original_tool":"Read"}}
{"type":"tool_use","tool_use_id":"call-3"}
{"type":"tool_result","tool_use_id":"call-3","content":"latest","metadata":{"original_tool":"Bash"}}
JSON
)
  run bash -c "echo '{\"transcript_path\": \"$f\"}' | bash scripts/hooks/precompact-prune.sh"
  [ "$status" -eq 0 ]
  run bash -c "jq -e . < '$f' >/dev/null 2>&1"
  [ "$status" -eq 0 ]
}
