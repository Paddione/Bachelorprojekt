#!/usr/bin/env bats
# tests/spec/toolset-registry/tool-level.bats — Tool-Ebene der Toolset-Kette [T900983]
#
# Pruefmodus: command output verification (T002448-M4). probe.mjs, check.mjs und
# toolset-context.sh werden gegen Fixtures AUSGEFUEHRT; geprueft werden $status, $output und
# der geschriebene Lock — nicht der Quelltext.
#
# Isolation: TOOLSET_MCP_REGISTRY / TOOLSET_LOCK / TOOLSET_REGISTRY / TOOLSET_OUT_DIR zeigen
# auf $BATS_TEST_TMPDIR, sonst schriebe der Probe den echten Lock des Entwicklers.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  FAKE="${BATS_TEST_DIRNAME}/fixtures/fake-mcp.mjs"
  T="$BATS_TEST_TMPDIR"
  mkdir -p "$T/out/.claude"
  echo '{}' > "$T/out/.claude/settings.json"
  export TOOLSET_MCP_REGISTRY="$T/mcp.yaml"
  export TOOLSET_LOCK="$T/toolset.lock.yaml"
  export TOOLSET_REGISTRY="$T/capabilities.yaml"
  export TOOLSET_OUT_DIR="$T/out"
  export FAKE_MCP_TOOLS='[
    {"name":"pods_list","description":"List pods","annotations":{"readOnlyHint":true}},
    {"name":"pods_exec","description":"Exec in pod","annotations":{"destructiveHint":true}},
    {"name":"resources_delete","description":"Delete resource","annotations":{"destructiveHint":true}},
    {"name":"resources_get","description":"Get resource"}
  ]'
  cat > "$TOOLSET_MCP_REGISTRY" <<EOF
clients:
  fake-k8s:
    transport: stdio
    command: node
    args: [$FAKE]
  gone-server:
    transport: stdio
    command: /nonexistent/bin/gone-mcp
    args: []
EOF
  cat > "$TOOLSET_REGISTRY" <<'EOF'
capabilities:
  cluster:
    mcp:fake-k8s:
      state: canonical
      use_when: "Cluster lesen"
      roles: [bp-run]
      tier: safe
      tool_tiers:
        pods_exec: dangerous
        "resources_*": caution
EOF
}

probe() { run node "$REPO_ROOT/scripts/toolset/probe.mjs" "$@"; }
check() { run node "$REPO_ROOT/scripts/toolset/check.mjs"; }
ctx() { run bash "$REPO_ROOT/scripts/toolset-context.sh" "$@"; }

@test "tool-level: probe schreibt die Tools eines stdio-Servers in den Lock" {
  probe
  [ "$status" -eq 0 ]
  run node -e '
    const y = require(process.argv[1]); const fs = require("fs");
    const l = y.load(fs.readFileSync(process.env.TOOLSET_LOCK, "utf8"));
    const s = l.servers["fake-k8s"];
    console.log(`status=${s.status} count=${s.tool_count} destr=${s.tools.pods_exec.destructive} ro=${s.tools.pods_list.read_only}`);
  ' "$REPO_ROOT/node_modules/js-yaml"
  [[ "$output" == *"status=ok count=4 destr=true ro=true"* ]]
}

@test "tool-level: unerreichbarer Server behaelt seine bisherigen Tools" {
  cat > "$TOOLSET_LOCK" <<'EOF'
lock_version: 2
servers:
  gone-server:
    status: ok
    tool_count: 1
    tools:
      old_tool: {hash: abc123}
EOF
  probe
  [ "$status" -eq 0 ]
  run cat "$TOOLSET_LOCK"
  [[ "$output" == *"old_tool"* ]]
  [[ "$output" == *"status: unreachable"* ]]
}

@test "tool-level: probe --ack uebernimmt den gemessenen Stand als geprueft und probe erhaelt ihn" {
  probe --ack fake-k8s
  [ "$status" -eq 0 ]
  probe
  [ "$status" -eq 0 ]
  run node -e '
    const y = require(process.argv[1]); const fs = require("fs");
    const s = y.load(fs.readFileSync(process.env.TOOLSET_LOCK, "utf8")).servers["fake-k8s"];
    console.log("reviewed=" + Object.keys(s.reviewed || {}).sort().join(","));
  ' "$REPO_ROOT/node_modules/js-yaml"
  [[ "$output" == *"reviewed=pods_exec,pods_list,resources_delete,resources_get"* ]]
}

@test "tool-level: check meldet neue Tools als unreviewed, ohne zu brechen" {
  probe --ack fake-k8s
  export FAKE_MCP_TOOLS='[{"name":"pods_list","description":"List pods"},{"name":"pods_exec","description":"Exec in pod"},{"name":"resources_delete","description":"Delete resource"},{"name":"resources_get","description":"Get resource"},{"name":"nodes_drain","description":"Drain node"}]'
  probe
  check
  [ "$status" -eq 0 ]
  [[ "$output" == *"fake-k8s"* ]]
  [[ "$output" == *"nodes_drain"* ]]
  [[ "$output" == *"unreviewed"* ]]
}

@test "tool-level: tool_tiers-Glob ohne passendes Tool faellt fail-closed" {
  probe --ack fake-k8s
  check
  [ "$status" -eq 0 ]
  cat >> "$TOOLSET_REGISTRY" <<'EOF'
        "helm_*": dangerous
EOF
  check
  [ "$status" -ne 0 ]
  [[ "$output" == *"helm_*"* ]]
}

@test "tool-level: ungueltiger Tier in tool_tiers faellt fail-closed" {
  probe --ack fake-k8s
  sed -i 's/pods_exec: dangerous/pods_exec: lethal/' "$TOOLSET_REGISTRY"
  check
  [ "$status" -ne 0 ]
  [[ "$output" == *"lethal"* ]]
}

@test "tool-level: check warnt bei destructiveHint auf einem safe-Tool" {
  sed -i '/pods_exec: dangerous/d' "$TOOLSET_REGISTRY"
  probe --ack fake-k8s
  check
  [ "$status" -eq 0 ]
  [[ "$output" == *"pods_exec"* ]]
  [[ "$output" == *"destructiveHint"* ]]
}

@test "tool-level: Werkzeug-Block nennt riskante Tools einzeln und zaehlt den Rest" {
  probe --ack fake-k8s
  ctx bp-run
  [ "$status" -eq 0 ]
  [[ "$output" == *"pods_exec"*"dangerous"* ]]
  [[ "$output" == *"resources_delete"*"caution"* ]]
  [[ "$output" == *"+1 safe"* ]]
  # pods_list ist safe und wird nicht einzeln aufgezaehlt.
  [[ "$output" != *"pods_list"* ]]
}

@test "tool-level: --json liefert jedes Tool mit aufgeloestem Tier" {
  probe --ack fake-k8s
  run bash -c "bash '$REPO_ROOT/scripts/toolset-context.sh' bp-run --json | node -e '
    const d = JSON.parse(require(\"fs\").readFileSync(0, \"utf8\"));
    const t = Object.fromEntries(d[0].tools.map(x => [x.name, x.tier]));
    console.log(t.pods_exec + \" \" + t.resources_get + \" \" + t.pods_list);
  '"
  [ "$status" -eq 0 ]
  [[ "$output" == *"dangerous caution safe"* ]]
}
