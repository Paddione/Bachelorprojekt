#!/usr/bin/env bats
# tests/spec/toolset-registry/lock-summary.bats — Tool-Kurzbeschreibung im Lock [T900985]
#
# Pruefmodus: command output verification (T002448-M4). probe.mjs laeuft gegen den
# Fake-MCP-Server; geprueft wird das summary-Feld im geschriebenen Lock. devflow-mcp
# recommend_tools rankt gegen dieses Feld.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  T="$BATS_TEST_TMPDIR"
  export TOOLSET_MCP_REGISTRY="$T/mcp.yaml"
  export TOOLSET_LOCK="$T/toolset.lock.yaml"
  cat > "$TOOLSET_MCP_REGISTRY" <<EOF
clients:
  fake:
    transport: stdio
    command: node
    args: [${BATS_TEST_DIRNAME}/fixtures/fake-mcp.mjs]
EOF
}

@test "lock-summary: probe schreibt die erste Beschreibungszeile, gekuerzt auf 200 Zeichen" {
  long="$(printf 'x%.0s' $(seq 1 300))"
  export FAKE_MCP_TOOLS="[{\"name\":\"pods_log\",\"description\":\"Read the logs of a pod.\\nSecond line is dropped.\"},{\"name\":\"big\",\"description\":\"$long\"}]"
  run node "$REPO_ROOT/scripts/toolset/probe.mjs"
  [ "$status" -eq 0 ]
  run node -e '
    const y=require(process.argv[1]); const l=y.load(require("fs").readFileSync(process.env.TOOLSET_LOCK,"utf8"));
    const t=l.servers.fake.tools; console.log(t.pods_log.summary + "|" + t.big.summary.length);
  ' "$REPO_ROOT/node_modules/js-yaml"
  [ "$output" = "Read the logs of a pod.|200" ]
}
