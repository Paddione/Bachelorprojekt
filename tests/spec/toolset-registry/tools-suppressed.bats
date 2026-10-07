#!/usr/bin/env bats
# tests/spec/toolset-registry/tools-suppressed.bats — Tool-Unterdrueckung (tools_suppressed) [T900985]
#
# Pruefmodus: command output verification (T002448-M4). check.mjs, sync.mjs und
# toolset-context.sh laufen gegen Fixtures in $BATS_TEST_TMPDIR; geprueft werden Exit, Ausgabe
# und die geschriebene .claude/settings.json.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  T="$BATS_TEST_TMPDIR"
  mkdir -p "$T/out/.claude"
  export TOOLSET_REGISTRY="$T/capabilities.yaml"
  export TOOLSET_LOCK="$T/toolset.lock.yaml"
  export TOOLSET_OUT_DIR="$T/out"
  cat > "$TOOLSET_REGISTRY" <<'EOF'
capabilities:
  tickets:
    mcp:fake-tickets:
      state: canonical
      use_when: "Tickets lesen"
      roles: [bp-run]
      tier: caution
      tools_suppressed: [stage_plan]
EOF
  cat > "$TOOLSET_LOCK" <<'EOF'
lock_version: 2
servers:
  fake-tickets:
    status: ok
    tool_count: 2
    tools:
      get_ticket: {hash: aaaaaaaaaaaa}
      stage_plan: {hash: bbbbbbbbbbbb}
    reviewed:
      get_ticket: aaaaaaaaaaaa
      stage_plan: bbbbbbbbbbbb
EOF
  echo '{"mcpServers":{"fake-tickets":{"command":"node"}}}' > "$T/out/.mcp.json"
  cat > "$T/out/.claude/settings.json" <<'EOF'
{
  "permissions": { "deny": ["Bash(rm -rf /:*)", "mcp__fake-tickets__old_tool"] },
  "disabledMcpjsonServers": []
}
EOF
}

@test "tools-suppressed: sync setzt permissions.deny und laesst fremde Regeln stehen" {
  run node "$REPO_ROOT/scripts/toolset/sync.mjs"
  [ "$status" -eq 0 ]
  run node -e 'const s=require(process.argv[1]); console.log(s.permissions.deny.join(","))' "$T/out/.claude/settings.json"
  [[ "$output" == *"mcp__fake-tickets__stage_plan"* ]]
  [[ "$output" == *"Bash(rm -rf /:*)"* ]]
  # Verwaltete Eintraege eines Registry-Servers, die nicht mehr unterdrueckt sind, verschwinden.
  [[ "$output" != *"old_tool"* ]]
}

@test "tools-suppressed: check meldet fehlende Durchsetzung als Drift" {
  run node "$REPO_ROOT/scripts/toolset/check.mjs"
  [ "$status" -ne 0 ]
  [[ "$output" == *"permissions.deny"* ]]
  run node "$REPO_ROOT/scripts/toolset/sync.mjs"
  run node "$REPO_ROOT/scripts/toolset/check.mjs"
  [ "$status" -eq 0 ]
}

@test "tools-suppressed: Glob ohne Treffer faellt fail-closed" {
  sed -i 's/tools_suppressed: \[stage_plan\]/tools_suppressed: [stage_plan, "helm_*"]/' "$TOOLSET_REGISTRY"
  node "$REPO_ROOT/scripts/toolset/sync.mjs" >/dev/null
  run node "$REPO_ROOT/scripts/toolset/check.mjs"
  [ "$status" -ne 0 ]
  [[ "$output" == *"helm_*"* ]]
}

@test "tools-suppressed: der Werkzeug-Block laesst unterdrueckte Tools weg" {
  run bash "$REPO_ROOT/scripts/toolset-context.sh" bp-run --json
  [ "$status" -eq 0 ]
  run node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8")); console.log(d[0].tools.map(t=>t.name).join(","))' <<< "$output"
  # Positiv-Anker: das nicht unterdrueckte Tool ist da.
  [[ "$output" == *"get_ticket"* ]]
  [[ "$output" != *"stage_plan"* ]]
}
