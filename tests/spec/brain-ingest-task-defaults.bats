#!/usr/bin/env bats

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  TASKFILE="$REPO_ROOT/taskfiles/Taskfile.brain.yaml"
  FAKE_BIN="$BATS_TEST_TMPDIR/bin"
  mkdir -p "$FAKE_BIN"
  cat > "$FAKE_BIN/bash" <<'EOF'
#!/bin/sh
printf '%s\n' \
  "$LM_STUDIO_URL" "$LM_MODEL" "$LM_DISABLE_THINKING" "$LM_MAX_TOKENS" \
  "$LM_TIMEOUT" "$MAX_SOURCE_CHARS" "$MAX_PARALLEL"
EOF
  chmod +x "$FAKE_BIN/bash"
}

@test "T013042 brain ingest task supplies local Gemma defaults" {
  run env -u LM_STUDIO_URL -u LM_MODEL -u LM_DISABLE_THINKING \
    -u LM_MAX_TOKENS -u LM_TIMEOUT -u MAX_SOURCE_CHARS -u MAX_PARALLEL \
    PATH="$FAKE_BIN:$PATH" task --taskfile "$TASKFILE" ingest:run

  [ "$status" -eq 0 ]
  [[ "$output" == *$'http://127.0.0.1:8089\ngemma12-vision\n1\n65536\n3600\n150000\n1' ]]
}

@test "T013042 pre-set brain ingest values override every default" {
  run env PATH="$FAKE_BIN:$PATH" \
    LM_STUDIO_URL=http://example.test:9999 LM_MODEL=custom-model \
    LM_DISABLE_THINKING=0 LM_MAX_TOKENS=42 LM_TIMEOUT=43 \
    MAX_SOURCE_CHARS=44 MAX_PARALLEL=2 \
    task --taskfile "$TASKFILE" ingest:run

  [ "$status" -eq 0 ]
  [[ "$output" == *$'http://example.test:9999\ncustom-model\n0\n42\n43\n44\n2' ]]
}

@test "T013042 run pilot and dry share the same fallback block" {
  for task_name in ingest:run ingest:pilot ingest:dry; do
    run env -u LM_STUDIO_URL -u LM_MODEL -u LM_DISABLE_THINKING \
      -u LM_MAX_TOKENS -u LM_TIMEOUT -u MAX_SOURCE_CHARS -u MAX_PARALLEL \
      PATH="$FAKE_BIN:$PATH" task --taskfile "$TASKFILE" "$task_name"
    [ "$status" -eq 0 ]
    [[ "$output" == *$'http://127.0.0.1:8089\ngemma12-vision\n1\n65536\n3600\n150000\n1' ]]
  done
}
