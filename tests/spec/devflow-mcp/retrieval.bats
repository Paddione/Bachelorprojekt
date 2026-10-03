#!/usr/bin/env bats
# tests/spec/devflow-mcp/retrieval.bats — search_code, context_for_task, recommend_tools [T900985]
#
# Pruefmodus: command output verification (T002448-M4). Der Server wird ueber stdio gestartet
# (fixtures/call.mjs) und gegen Fixture-Backends abgefragt; geprueft wird das Ergebnis-JSON.

setup() {
  load helpers
  devflow_setup
  devflow_index >/dev/null
}

@test "retrieval: der Server bietet die devflow-Tools an" {
  devflow_call list
  [ "$status" -eq 0 ]
  for t in context_for_task recommend_tools search_code graph_status plan_stage plan_lint lock collision_check ci_status task_oracle; do
    [[ " $output " == *" $t "* ]]
  done
}

@test "retrieval: search_code findet das passende Symbol zuerst" {
  devflow_call search_code '{"query":"which tool tier does resolveToolTier return","k":2}'
  [ "$status" -eq 0 ]
  run json 'd.results[0].qualified_name + " " + d.results[0].file + ":" + d.results[0].line'
  [[ "$output" == *"resolveToolTier src/tiers.mjs:2"* ]]
}

@test "retrieval: context_for_task liefert Code, Plaene und Werkzeuge in einem Aufruf" {
  devflow_call context_for_task '{"task":"resolve the tool tier for pods","role":"bp-run"}'
  [ "$status" -eq 0 ]
  run json '[d.code.length > 0, d.plans[0].title, d.tools.length > 0, d.role].join(" ")'
  [[ "$output" == "true toolset-tool-level true bp-run" ]]
}

@test "retrieval: recommend_tools filtert nach Rolle, Unterdrueckung und Tier" {
  devflow_call recommend_tools '{"task":"read pod logs and stage a plan","role":"bp-run","k":10}'
  [ "$status" -eq 0 ]
  run json 'd.tools.map(t => t.server + "." + t.tool).join(",")'
  # Positiv-Anker zuerst: das passende Lese-Tool ist da.
  [[ "$output" == *"fake-k8s.pods_log"* ]]
  # stage_plan ist unterdrueckt, pods_exec liegt ueber max_tier (Default assisted).
  [[ "$output" != *"stage_plan"* ]]
  [[ "$output" != *"pods_exec"* ]]
}

@test "retrieval: recommend_tools mit max_tier dangerous nimmt pods_exec auf" {
  devflow_call recommend_tools '{"task":"execute a command inside a pod","role":"bp-run","max_tier":"dangerous"}'
  [ "$status" -eq 0 ]
  run json 'd.tools[0].tool + " " + d.tools[0].tier'
  [[ "$output" == "pods_exec dangerous" ]]
}

@test "retrieval: Rerank-Ausfall degradiert statt zu scheitern" {
  export FAKE_BGE_FAIL_RERANK=1
  devflow_call search_code '{"query":"claim a lock for a worktree","k":1}'
  [ "$status" -eq 0 ]
  run json 'd.results.length + " " + d.degraded.join(",")'
  [[ "$output" == "1 rerank" ]]
}

@test "retrieval: ohne Rerank sortiert recommend_tools lexikalisch statt in Registry-Reihenfolge" {
  export FAKE_BGE_FAIL_RERANK=1
  devflow_call recommend_tools '{"task":"read the logs of a pod","role":"bp-run","k":3}'
  [ "$status" -eq 0 ]
  run json 'd.tools[0].tool + " " + d.degraded.join(",")'
  [ "$output" = "pods_log rerank" ]
}

@test "retrieval: Bearer-Token kommt aus server.env, wenn die Umgebung keinen hat" {
  mkdir -p "$T/home/.config/bge-mcp" "$T/home/.config/mcp-postgres"
  printf 'BGE_MCP_TOKEN="from-file"\n# Kommentar\n' > "$T/home/.config/bge-mcp/server.env"
  printf 'MCP_POSTGRES_TOKEN=pg-file\n' > "$T/home/.config/mcp-postgres/server.env"
  run env -u BGE_MCP_TOKEN -u MCP_POSTGRES_TOKEN node -e '
    import(process.argv[1]).then(({ withTokens }) => {
      const e = withTokens({ MCP_POSTGRES_TOKEN: "from-env" }, process.argv[2]);
      console.log(e.BGE_MCP_TOKEN + " " + e.MCP_POSTGRES_TOKEN);
    });
  ' "$REPO_ROOT/scripts/devflow-mcp/lib/backends.mjs" "$T/home"
  [ "$status" -eq 0 ]
  # Umgebung gewinnt, die Datei fuellt nur Luecken.
  [ "$output" = "from-file from-env" ]
}

@test "retrieval: unbekannte Rolle ist ein Tool-Fehler" {
  devflow_call recommend_tools '{"task":"x","role":"db"}'
  [ "$status" -eq 0 ]
  run json 'String(d.isError) + " " + d.error'
  [[ "$output" == "true "*"db"* ]]
}

@test "retrieval: graph_status meldet einen veralteten Index" {
  devflow_call graph_status '{}'
  [ "$status" -eq 0 ]
  run json 'd.count + " " + d.stale'
  [ "$output" = "3 false" ]
  git -C "$DEVFLOW_REPO_ROOT" -c user.email=t@t -c user.name=t commit -q --allow-empty -m next
  devflow_call graph_status '{}'
  run json 'String(d.stale)'
  [ "$output" = "true" ]
}
