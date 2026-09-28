#!/usr/bin/env bats
# tests/spec/toolset-registry/harness-specialization.bats — Harness-Guards und Adapter-Dry-Run [T900791]
#
# Pruefmodus: command output verification. Jeder Test fuehrt `node scripts/toolset/check.mjs`
# bzw. `node scripts/toolset/sync.mjs` gegen eine Fixture-Registry AUS und prueft $status und
# $output — es wird nicht der Quelltext gegreppt (Konvention T002448-M4).
#
# Die Fixtures liegen in $BATS_TEST_TMPDIR und werden ueber TOOLSET_REGISTRY / TOOLSET_OUT_DIR
# angezogen. Ohne diese beiden Overrides wuerde der Test die echte Konfiguration des
# Entwicklers ueberschreiben.

load '../test_helper.bash'

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  OUT_DIR="${BATS_TEST_TMPDIR}/out"
  REGISTRY="${BATS_TEST_TMPDIR}/capabilities.yaml"
  mkdir -p "$OUT_DIR/.opencode"
}

# Schreibt eine Fixture-Registry mit einem kanonischen mcp:a (roles: [orchestrator]), einem
# harnesses-Block (opencode, roles: [orchestrator]) und forbidden_providers: [deepseek],
# plus die passende .opencode/opencode.jsonc in TOOLSET_OUT_DIR.
# $1 = provider der opencode-Harness, $2 = Rollenliste (YAML-Flow), $3 = enabled-Wert fuer a.
write_harness_fixture() {
  local provider="$1" roles="$2" enabled="$3"
  cat > "$REGISTRY" <<YAML
capabilities:
  demo-cap:
    mcp:a:
      state: canonical
      use_when: "Fixture-Zweck"
      roles: [orchestrator]
harnesses:
  opencode:
    job: "Fixture-Harness"
    provider: ${provider}
    default_model: fixture-model
    roles: [${roles}]
    config: .opencode/opencode.jsonc
forbidden_providers: [deepseek]
YAML
  cat > "$OUT_DIR/.opencode/opencode.jsonc" <<JSONC
{
  // keep me
  "mcp": {
    "a": {
      "type": "local",
      "command": ["echo", "a"],
      "enabled": ${enabled}
    }
  }
}
JSONC
}

@test "check: forbidden provider fails" {
  write_harness_fixture deepseek orchestrator true
  run env TOOLSET_REGISTRY="$REGISTRY" TOOLSET_OUT_DIR="$OUT_DIR" \
    node "$REPO_ROOT/scripts/toolset/check.mjs"
  [ "$status" -eq 1 ]
  [[ "$output" == *"forbidden provider deepseek"* ]]
}

@test "check: unknown harness role fails" {
  write_harness_fixture local orchestrater true
  run env TOOLSET_REGISTRY="$REGISTRY" TOOLSET_OUT_DIR="$OUT_DIR" \
    node "$REPO_ROOT/scripts/toolset/check.mjs"
  [ "$status" -eq 1 ]
  [[ "$output" == *"unknown role 'orchestrater'"* ]]
}

@test "check: drift fails" {
  write_harness_fixture local orchestrator false
  run env TOOLSET_REGISTRY="$REGISTRY" TOOLSET_OUT_DIR="$OUT_DIR" \
    node "$REPO_ROOT/scripts/toolset/check.mjs"
  [ "$status" -eq 1 ]
  [[ "$output" == *"DRIFT opencode"* ]]
}

@test "check: clean fixture passes" {
  write_harness_fixture local orchestrator true
  run env TOOLSET_REGISTRY="$REGISTRY" TOOLSET_OUT_DIR="$OUT_DIR" \
    node "$REPO_ROOT/scripts/toolset/check.mjs"
  [ "$status" -eq 0 ] || { echo "$output"; return 1; }
}

@test "sync: dry-run writes nothing" {
  write_harness_fixture local orchestrator false
  local before; before="$(sha256sum "$OUT_DIR/.opencode/opencode.jsonc" | cut -d' ' -f1)"
  run env TOOLSET_REGISTRY="$REGISTRY" TOOLSET_OUT_DIR="$OUT_DIR" \
    node "$REPO_ROOT/scripts/toolset/sync.mjs" --dry-run
  [ "$status" -eq 0 ]
  local after; after="$(sha256sum "$OUT_DIR/.opencode/opencode.jsonc" | cut -d' ' -f1)"
  [ "$before" = "$after" ] || { echo "dry-run must not write"; return 1; }
  [[ "$output" == *'"enabled": true'* ]]
}
