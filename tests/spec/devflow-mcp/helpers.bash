# tests/spec/devflow-mcp/helpers.bash — gemeinsames Setup der devflow-mcp-Tests [T900985]
#
# Alle Backends zeigen auf Fixture-Server (stdio), der Cache und das Fixture-Repo liegen in
# $BATS_TEST_TMPDIR. Kein Test erreicht Cluster, bge oder den echten Cache des Entwicklers.

devflow_setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  FIX="${BATS_TEST_DIRNAME}/fixtures"
  T="$BATS_TEST_TMPDIR"
  export DEVFLOW_BGE_STDIO="node $FIX/fake-bge.mjs"
  export DEVFLOW_PG_STDIO="node $FIX/fake-pg.mjs"
  export DEVFLOW_CBM_STDIO="node $FIX/fake-cbm.mjs"
  export DEVFLOW_CACHE_DIR="$T/cache"
  export FAKE_BGE_LOG="$T/bge.log"

  # Fixture-Repo mit drei Quelldateien; die Symbole unten verweisen auf ihre Zeilen.
  FREPO="$T/repo"
  mkdir -p "$FREPO/src"
  cat > "$FREPO/src/locks.mjs" <<'EOF'
// Agent-Locks: Claim und Release fuer Worktrees.
export function claimLock(scope, id) {
  // schreibt agent-locks/<scope>__<id>.json
  return writeLockFile(scope, id);
}
EOF
  cat > "$FREPO/src/tiers.mjs" <<'EOF'
// Tool-Tiers: erste passende tool_tiers-Zeile gewinnt.
export function resolveToolTier(name, instCfg) {
  return instCfg.tier;
}
EOF
  cat > "$FREPO/src/render.mjs" <<'EOF'
// Prompt-Block rendern.
export class PromptRenderer {
  render(block) { return block; }
}
EOF
  git -C "$FREPO" init -q && git -C "$FREPO" add . && git -C "$FREPO" -c user.email=t@t -c user.name=t commit -qm init
  export DEVFLOW_REPO_ROOT="$FREPO"

  export FAKE_CBM_SYMBOLS='[
    {"qn":"fixture-proj.src.locks.claimLock","file":"src/locks.mjs","s":2,"e":5,"sig":"(scope, id)","doc":"// Agent-Locks: Claim und Release fuer Worktrees.","label":"Function"},
    {"qn":"fixture-proj.src.tiers.resolveToolTier","file":"src/tiers.mjs","s":2,"e":4,"sig":"(name, instCfg)","doc":"","label":"Function"},
    {"qn":"fixture-proj.src.render.PromptRenderer","file":"src/render.mjs","s":2,"e":4,"sig":"","doc":"","label":"Class"}
  ]'
  export FAKE_CBM_CALLS='[["fixture-proj.src.render.PromptRenderer","fixture-proj.src.tiers.resolveToolTier"]]'
  export FAKE_PG_ROWS='[
    {"source":"specs_plans","title":"toolset-tool-level","uri":"file:.agents/plans/toolset-tool-level/tasks.md","text":"tool_tiers resolve tier per tool, first matching glob wins","score":0.8},
    {"source":"bug_tickets","title":"T900984","uri":"ticket:T900984","text":"ticket-mcp-node lists tools twice","score":0.5}
  ]'

  # Toolset-Fixture: Registry + Lock fuer recommend_tools.
  export TOOLSET_REGISTRY="$T/capabilities.yaml"
  export TOOLSET_LOCK="$T/toolset.lock.yaml"
  cat > "$TOOLSET_REGISTRY" <<'EOF'
capabilities:
  cluster:
    mcp:fake-k8s:
      state: canonical
      use_when: "Pods und Ressourcen im Cluster lesen"
      roles: [bp-run]
      tier: safe
      tool_tiers:
        pods_exec: dangerous
  tickets:
    mcp:fake-tickets:
      state: canonical
      use_when: "Tickets lesen und Status setzen"
      roles: [bp-run, bp-ship]
      tier: caution
      tools_suppressed: [stage_plan]
EOF
  cat > "$TOOLSET_LOCK" <<'EOF'
lock_version: 2
servers:
  fake-k8s:
    status: ok
    tool_count: 2
    tools:
      pods_log: {hash: aaaaaaaaaaaa, summary: "Read the logs of a pod"}
      pods_exec: {hash: bbbbbbbbbbbb, summary: "Execute a command inside a pod"}
  fake-tickets:
    status: ok
    tool_count: 2
    tools:
      get_ticket: {hash: cccccccccccc, summary: "Read a ticket by id"}
      stage_plan: {hash: dddddddddddd, summary: "Stage a plan for a ticket"}
EOF
}

# Indexer gegen das Fixture-Repo laufen lassen.
devflow_index() {
  run node "$REPO_ROOT/scripts/devflow-mcp/graph-index.mjs" --repo "$DEVFLOW_REPO_ROOT" "$@"
}

# Ein Tool des Servers aufrufen; Ergebnis-JSON in $output.
devflow_call() {
  run node "$FIX/call.mjs" "$REPO_ROOT" "$@"
}

# Feld aus dem JSON in $output lesen (Node-Ausdruck mit Variable d).
json() {
  printf '%s' "$output" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log($1)"
}
