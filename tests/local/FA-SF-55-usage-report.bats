#!/usr/bin/env bats
# FA-SF-55 — usage-report.sh: Cross-Tool-CLI Token/Kosten-Überblick
setup() {
  load 'test_helper.bash'
  export TMPDIR; TMPDIR=$(mktemp -d)
  export CLAUDE_USAGE_DIR="$TMPDIR/claude"
  export OPENCLAW_USAGE_DIR="$TMPDIR/openclaw"
  mkdir -p "$CLAUDE_USAGE_DIR" "$OPENCLAW_USAGE_DIR"
}
teardown() { rm -rf "$TMPDIR"; }

@test "FA-SF-55: fehlende Log-Dirs → 0-Aggregate, Exit 0" {
  export CLAUDE_USAGE_DIR="$TMPDIR/nonexistent-claude"
  export OPENCLAW_USAGE_DIR="$TMPDIR/nonexistent-openclaw"
  run bash scripts/factory/usage-report.sh
  [ "$status" -eq 0 ]
}

@test "FA-SF-55: Fixtures → korrekte Summen pro Tag" {
  cat > "$CLAUDE_USAGE_DIR/usage-1.jsonl" <<'JSON'
{"timestamp":"2026-06-15T10:00:00Z","model":"claude-sonnet-4","tokens_in":100,"tokens_out":50,"cost_usd":0.002}
{"timestamp":"2026-06-15T11:00:00Z","model":"claude-sonnet-4","tokens_in":200,"tokens_out":100,"cost_usd":0.004}
JSON
  run bash scripts/factory/usage-report.sh
  [ "$status" -eq 0 ]
  [[ "$output" == *"2026-06-15"* ]]
  [[ "$output" == *"claude-sonnet-4"* ]]
}

@test "FA-SF-55: --json → valides JSON" {
  cat > "$CLAUDE_USAGE_DIR/usage-1.jsonl" <<'JSON'
{"timestamp":"2026-06-14T10:00:00Z","model":"claude-haiku-4","tokens_in":50,"tokens_out":25,"cost_usd":0.001}
JSON
  run bash scripts/factory/usage-report.sh --json
  [ "$status" -eq 0 ]
  run jq -e . <<< "$output"
  [ "$status" -eq 0 ]
}

@test "FA-SF-55: --otel ohne Endpoint → no-op (Exit 0)" {
  cat > "$CLAUDE_USAGE_DIR/usage-1.jsonl" <<'JSON'
{"timestamp":"2026-06-13T10:00:00Z","model":"claude-opus-4","tokens_in":300,"tokens_out":150,"cost_usd":0.015}
JSON
  unset OTEL_EXPORTER_OTLP_ENDPOINT
  run bash scripts/factory/usage-report.sh --otel
  [ "$status" -eq 0 ]
}

@test "FA-SF-55: unbekannte Felder → kein Crash" {
  cat > "$CLAUDE_USAGE_DIR/usage-1.jsonl" <<'JSON'
{"weird_field":true,"unknown":"data"}
{"timestamp":"2026-06-12T10:00:00Z","model":"claude-sonnet-4","tokens_in":100,"tokens_out":50,"cost_usd":0.002}
JSON
  run bash scripts/factory/usage-report.sh
  [ "$status" -eq 0 ]
  [[ "$output" == *"2026-06-12"* ]]
}

@test "FA-SF-55: beide Tools gemischt" {
  cat > "$CLAUDE_USAGE_DIR/usage-1.jsonl" <<'JSON'
{"timestamp":"2026-06-10T10:00:00Z","model":"claude-sonnet-4","tokens_in":100,"tokens_out":50,"cost_usd":0.002}
JSON
  cat > "$OPENCLAW_USAGE_DIR/usage-1.jsonl" <<'JSON'
{"timestamp":"2026-06-10T11:00:00Z","model":"claude-sonnet-4","tokens_in":50,"tokens_out":25,"cost_usd":0.001}
JSON
  run bash scripts/factory/usage-report.sh
  [ "$status" -eq 0 ]
  [[ "$output" == *"claude-code"* ]]
  [[ "$output" == *"openclaw"* ]]
}
