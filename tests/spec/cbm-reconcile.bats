#!/usr/bin/env bats
# tests/spec/cbm-reconcile.bats
# Ticket: T002430 (defect D8 — K1/K3 reconciliation)

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  RECONCILE="$REPO_ROOT/scripts/mcp/cbm-reconcile.py"
  FRESHNESS="$REPO_ROOT/scripts/mcp/cbm-freshness.py"
  TEST_DIR="$BATS_TEST_TMPDIR"
  PROJECT="home-patrick-Bachelorprojekt"
}

isolate_home() {
  export TEST_HOME="$TEST_DIR/home"
  mkdir -p "$TEST_HOME/.cache/codebase-memory-mcp"
  export HOME="$TEST_HOME"
}

make_repo() {
  local dir="$1"
  mkdir -p "$dir"
  git init -q "$dir"
  git -C "$dir" config user.email "test@example.com"
  git -C "$dir" config user.name "Test"
  git -C "$dir" config commit.gpgsign false
  mkdir -p "$dir/lib"
  echo "export const a = 1;" > "$dir/lib/a.ts"
  echo "export const b = 2;" > "$dir/lib/b.ts"
  echo "docs" > "$dir/README.md"
  git -C "$dir" add .
  git -C "$dir" commit -qm "init"
}

stub_cli() {
  local bin="$TEST_DIR/bin"
  mkdir -p "$bin"
  cat > "$bin/codebase-memory-mcp" <<STUBEOF
#!/bin/sh
# Emulates the real CLI: "cli --json <sub>" wraps the payload in an MCP
# envelope; bare "cli <sub>" returns the raw payload (cbm-reconcile.py still
# probes index_status without --json, cbm-freshness.py uses --json).
json_escape() {
  printf '%s' "\$1" | sed -e 's/\\\\/\\\\\\\\/g' -e 's/"/\\\\"/g' -e ':a' -e 'N' -e '\$!ba' -e 's/\n/\\\\n/g'
}
emit_envelope() {
  printf '{"content":[{"type":"text","text":"%s"}],"isError":false}\n' "\$(json_escape "\$1")"
}
case "\$1" in
  --version) echo "stub-cbm 0.0.0-test"; exit 0;;
  cli) shift
    use_json=""
    [ "\${1:-}" = "--json" ] && { use_json=1; shift; }
    sub="\$1"; shift
    case "\$sub" in
      index_status)
        if [ "\${STUB_MODE:-}" = "malformed-index" ]; then echo "not-json"; exit 0; fi
        inner="{\"project\":\"$PROJECT\",\"root_path\":\"$FIX_REPO\",\"git\":{\"canonical_root\":\"$FIX_REPO\"},\"status\":\"ready\",\"nodes\":10,\"edges\":20}"
        if [ -n "\$use_json" ]; then emit_envelope "\$inner"; else echo "\$inner"; fi
        exit 0;;
      get_graph_schema)
        echo '{"content":[{"type":"text","text":"{\"node_labels\":[{\"label\":\"Function\",\"count\":2,\"properties\":[\"name\",\"file_path\"]}]}"}]}'; exit 0;;
      query_graph)
        if [ -n "\${STUB_QUERY_GARBAGE:-}" ]; then printf '{"content":[{"type":"text","text":"total garbage <|>"}]}'; exit 0; fi
        { echo "rows: 0  (cols: file)"
          if [ -n "\${STUB_K3_FILESLIST:-}" ]; then
            while IFS= read -r f; do [ -n "\$f" ] && echo "  \$f"; done < "\$STUB_K3_FILESLIST"
          else
            for f in \${STUB_K3_FILES:-}; do echo "  \$f"; done
          fi
          echo "total: 0"; } | python3 -c 'import json,sys; print(json.dumps({"content":[{"type":"text","text":sys.stdin.read()}]}))'
        exit 0;;
      detect_changes)
        if [ -n "\$use_json" ]; then
          emit_envelope "base: main
direction: inbound
changed_files: 0"
        else
          echo '{"changed_count":0,"changed_files":[]}'
        fi
        exit 0;;
      *) echo "unknown sub \$sub" >&2; exit 1;;
    esac;;
  *) echo "unknown \$1" >&2; exit 1;;
esac
STUBEOF
  chmod +x "$bin/codebase-memory-mcp"
  export PATH="$bin:$PATH"
}

# Fabricate a valid fresh receipt using the production helper's own functions,
# so fingerprint/identity checks pass exactly as they would in real runs.
make_fresh_receipt() {
  local repo="$1"
  python3 - "$FRESHNESS" "$repo" "$PROJECT" <<'PYEOF'
import importlib.util, sys, os
spec = importlib.util.spec_from_file_location("cbm_freshness", sys.argv[1])
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
repo, project = sys.argv[2], sys.argv[3]
root = mod.git_toplevel(repo)
head = mod.git_head(root)
diff, _ = mod.git_diff_binary(root)
untracked, _ = mod.git_untracked_files(root)
fp = mod.fingerprint_state(root, head, diff, untracked)
receipt = {"schema_version": 1, "timestamp": mod.utc_now_iso(), "head_sha": head,
           "canonical_root": root, "project": project, "mode": "full",
           "tool_version": "stub-cbm 0.0.0-test", "state_fingerprint": fp,
           "dirty": False}
mod.atomic_write_json(mod.receipt_path(project, root), receipt)
print("receipt-written")
PYEOF
}

reconcile() {
  python3 "$RECONCILE" status --repo "$1" --project "$PROJECT" ${2:+$2}
}

@test "single JSON object with schema and verdict fields on stdout" {
  isolate_home; make_repo "$TEST_DIR/repo"; FIX_REPO="$TEST_DIR/repo"; export FIX_REPO
  stub_cli; make_fresh_receipt "$FIX_REPO"
  run reconcile "$FIX_REPO"
  [ "$status" -eq 0 ]
  echo "$output" | python3 -c '
import json, sys
d = json.load(sys.stdin)
assert isinstance(d, dict), "not a single JSON object"
for key in ("schema_version", "verdict", "verdict_reasons", "k3_freshness",
            "k1_evidence", "coverage", "repo", "project"):
    assert key in d, f"missing {key}"
'
}

@test "fresh index + full coverage -> verdict fresh" {
  isolate_home; make_repo "$TEST_DIR/repo"; FIX_REPO="$TEST_DIR/repo"; export FIX_REPO
  stub_cli; make_fresh_receipt "$FIX_REPO"
  export STUB_K3_FILES="lib/a.ts lib/b.ts README.md"
  run reconcile "$FIX_REPO"
  [ "$status" -eq 0 ]
  echo "$output" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["verdict"]=="fresh", d["verdict"]'
}

@test "tracked code file missing from graph -> diverged with code_unindexed" {
  isolate_home; make_repo "$TEST_DIR/repo"; FIX_REPO="$TEST_DIR/repo"; export FIX_REPO
  stub_cli; make_fresh_receipt "$FIX_REPO"
  export STUB_K3_FILES="lib/a.ts"
  run reconcile "$FIX_REPO"
  [ "$status" -eq 0 ]
  echo "$output" | python3 -c '
import json, sys
d = json.load(sys.stdin)
assert d["verdict"] == "diverged", d["verdict"]
cu = d["coverage"]["code_unindexed"]
assert "lib/b.ts" in cu["paths"], cu
assert cu["count"] >= 1
'
}

@test "graph file not in git -> diverged with k3_untracked" {
  isolate_home; make_repo "$TEST_DIR/repo"; FIX_REPO="$TEST_DIR/repo"; export FIX_REPO
  stub_cli; make_fresh_receipt "$FIX_REPO"
  export STUB_K3_FILES="lib/a.ts lib/b.ts README.md deleted/ghost.ts"
  run reconcile "$FIX_REPO"
  [ "$status" -eq 0 ]
  echo "$output" | python3 -c '
import json, sys
d = json.load(sys.stdin)
assert d["verdict"] == "diverged", d["verdict"]
ku = d["coverage"]["k3_untracked"]
assert "deleted/ghost.ts" in ku["paths"], ku
'
}

@test "k3 freshness unknown -> verdict unknown, exit 1, fail-closed" {
  isolate_home; make_repo "$TEST_DIR/repo"; FIX_REPO="$TEST_DIR/repo"; export FIX_REPO
  stub_cli
  export STUB_MODE="malformed-index"   # freshness helper gets malformed index_status
  run reconcile "$FIX_REPO"
  [ "$status" -eq 1 ]
  echo "$output" | python3 -c '
import json, sys
d = json.load(sys.stdin)
assert d["verdict"] == "unknown", d["verdict"]
assert d["k3_freshness"]["status"] == "unknown"
'
}

@test "k1_evidence is unavailable with reasons and surfaces (fail-closed, no guessing)" {
  isolate_home; make_repo "$TEST_DIR/repo"; FIX_REPO="$TEST_DIR/repo"; export FIX_REPO
  stub_cli; make_fresh_receipt "$FIX_REPO"
  export STUB_K3_FILES="lib/a.ts lib/b.ts README.md"
  run reconcile "$FIX_REPO"
  [ "$status" -eq 0 ]
  echo "$output" | python3 -c '
import json, sys
d = json.load(sys.stdin)
k1 = d["k1_evidence"]
assert k1["status"] == "unavailable", k1
assert len(k1["reasons"]) >= 1
assert "surfaces" in k1
'
}

@test "paths with spaces survive via NUL-delimited git listing" {
  isolate_home; make_repo "$TEST_DIR/repo"; FIX_REPO="$TEST_DIR/repo"; export FIX_REPO
  echo "x" > "$FIX_REPO/lib/weird name.ts"
  git -C "$FIX_REPO" add .
  git -C "$FIX_REPO" commit -qm "weird"
  stub_cli; make_fresh_receipt "$FIX_REPO"
  printf '%s\n' "lib/a.ts" "lib/b.ts" "lib/weird name.ts" "README.md" > "$TEST_DIR/k3files.txt"
  export STUB_K3_FILESLIST="$TEST_DIR/k3files.txt"
  run reconcile "$FIX_REPO"
  [ "$status" -eq 0 ]
  echo "$output" | python3 -c '
import json, sys
d = json.load(sys.stdin)
cu = d["coverage"]["code_unindexed"]["paths"]
assert "lib/weird name.ts" not in cu, cu
'
}

@test "query_graph garbage output -> fail-closed unknown, not silent fresh" {
  isolate_home; make_repo "$TEST_DIR/repo"; FIX_REPO="$TEST_DIR/repo"; export FIX_REPO
  stub_cli; make_fresh_receipt "$FIX_REPO"
  export STUB_K3_FILES="lib/a.ts lib/b.ts README.md"
  export STUB_QUERY_GARBAGE="1"
  run reconcile "$FIX_REPO"
  [ "$status" -eq 1 ]
  echo "$output" | python3 -c '
import json, sys
d = json.load(sys.stdin)
assert d["verdict"] == "unknown", d["verdict"]
'
}
