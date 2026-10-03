#!/usr/bin/env bats
# tests/spec/devflow-mcp/graph-index.bats — Graph-Korpus-Indexer [T900985]
#
# Pruefmodus: command output verification (T002448-M4). graph-index.mjs laeuft gegen Fixture-
# Server (fake-cbm, fake-bge); geprueft werden Exit, Ausgabe und der geschriebene Cache.

setup() {
  load helpers
  devflow_setup
}

cache_dir() { echo "$DEVFLOW_CACHE_DIR/fixture-proj"; }

@test "graph-index: baut den Cache mit einem Chunk je Symbol" {
  devflow_index
  [ "$status" -eq 0 ]
  [ -f "$(cache_dir)/meta.json" ]
  run node -e '
    const fs = require("fs"); const d = process.argv[1];
    const meta = JSON.parse(fs.readFileSync(d + "/meta.json", "utf8"));
    const lines = fs.readFileSync(d + "/symbols.jsonl", "utf8").trim().split("\n");
    const bytes = fs.statSync(d + "/vectors.f32").size;
    console.log(`count=${meta.count} lines=${lines.length} ok=${bytes === meta.count * meta.dims * 4}`);
  ' "$(cache_dir)"
  [[ "$output" == *"count=3 lines=3 ok=true"* ]]
}

@test "graph-index: Chunk enthaelt Signatur, Rumpf und Aufrufkanten" {
  devflow_index
  [ "$status" -eq 0 ]
  run grep -F 'resolveToolTier' "$(cache_dir)/symbols.jsonl"
  [[ "$output" == *"src/tiers.mjs:2"* ]]
  [[ "$output" == *"(name, instCfg)"* ]]
  [[ "$output" == *"return instCfg.tier"* ]]
  [[ "$output" == *"called by: PromptRenderer"* ]]
}

@test "graph-index: zweiter Lauf bettet nur geaenderte Symbole neu ein" {
  devflow_index
  [ "$status" -eq 0 ]
  : > "$FAKE_BGE_LOG"
  printf '// geaendert\n' >> "$DEVFLOW_REPO_ROOT/src/locks.mjs"
  sed -i 's/return writeLockFile(scope, id);/return writeLockFile(scope, id, true);/' "$DEVFLOW_REPO_ROOT/src/locks.mjs"
  devflow_index
  [ "$status" -eq 0 ]
  [[ "$output" == *"reused 2"* ]]
  run cat "$FAKE_BGE_LOG"
  [ "$output" = "embed 1" ]
}

@test "graph-index: ohne erreichbares bge endet der Lauf mit Exit 0 und schreibt nichts" {
  export DEVFLOW_BGE_STDIO="/nonexistent/fake-bge"
  devflow_index
  [ "$status" -eq 0 ]
  [[ "$output" == *"bge"* ]]
  [ ! -f "$(cache_dir)/meta.json" ]
}
