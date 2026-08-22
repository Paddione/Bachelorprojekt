#!/usr/bin/env bats

setup() {
  export TEST_BIN="$BATS_TEST_TMPDIR/bin"
  mkdir -p "$TEST_BIN"
  cat >"$TEST_BIN/curl" <<'EOF'
#!/usr/bin/env bash
printf '%s' "${FACTORY_PIN_RESPONSE:-}"
EOF
  chmod +x "$TEST_BIN/curl"
  export PATH="$TEST_BIN:$PATH"
}

@test "locked pin overrides sonnet and opus without claiming a slot" {
  export FACTORY_PIN_RESPONSE='{"model":"gemma12-vision","locked":true}'
  for tier in sonnet opus; do
    run bash scripts/factory/route-provider.sh factory-implement "$tier"
    [ "$status" -eq 0 ]
    [ "$(printf '%s' "$output" | tail -1 | jq -r .modelId)" = gemma12-vision ]
    [ "$(printf '%s' "$output" | tail -1 | jq -r .slotId)" = null ]
    [[ "$output" == *gemma12-vision* ]]
  done
}

@test "factory pin reader fails soft when proxy returns nothing" {
  export FACTORY_PIN_RESPONSE=''
  run bash -c 'source scripts/factory/lib.sh; factory_model_pin'
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "dispatcher and pipeline propagate the locked local model" {
  run grep -q 'export FACTORY_MODEL_LOCKED=1' scripts/factory/dispatcher-bridge.sh
  [ "$status" -eq 0 ]
  run grep -q "process.env.FACTORY_MODEL_LOCKED === '1'" scripts/factory/pipeline.mjs
  [ "$status" -eq 0 ]
}
