#!/usr/bin/env bats
# tests/spec/cbm-health-goals.bats
# Ticket: T002430 (defects D5/D6 — K3 health goals + failover semantics)

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  CHECK="$REPO_ROOT/scripts/health-goals-check.sh"
  MEASURE="$REPO_ROOT/scripts/lib/health-goals-measure.sh"
  TEST_DIR="$BATS_TEST_TMPDIR"
  mkdir -p "$TEST_DIR"
}

stub_freshness() {
  # $1 = status to report (fresh | stale | unknown), emitted as helper JSON
  cat > "$TEST_DIR/stub-cbm-freshness.py" <<PYEOF
#!/usr/bin/env python3
import json, sys
print(json.dumps({"status": "$1", "reasons": ["stub"],
                  "refresh_allowed": False, "receipt": None}))
PYEOF
  chmod +x "$TEST_DIR/stub-cbm-freshness.py"
  export CBM_FRESHNESS_BIN="$TEST_DIR/stub-cbm-freshness.py"
}

stub_cli_index() {
  # $1 = nodes, $2 = edges, $3 = status (emulate index_status JSON)
  local bin="$TEST_DIR/bin"
  mkdir -p "$bin"
  cat > "$bin/codebase-memory-mcp" <<STUBEOF
#!/bin/sh
if [ "\$1" = "--version" ]; then echo "stub-cbm 0.0.0-test"; exit 0; fi
if [ "\$1" = "cli" ]; then
  echo "{\"project\":\"home-patrick-Bachelorprojekt\",\"nodes\":$1,\"edges\":$2,\"status\":\"$3\",\"root_path\":\"/tmp\",\"git\":{\"canonical_root\":\"/tmp\"}}"
  exit 0
fi
exit 1
STUBEOF
  chmod +x "$bin/codebase-memory-mcp"
  export PATH="$bin:$PATH"
}

run_row() {
  # $1 = goal id; runs the check filtered to that row, values into a tempfile
  VALUES="$TEST_DIR/values.txt"
  rm -f "$VALUES"
  HG_VALUES_FILE="$VALUES" bash "$CHECK" --only="$1" --quiet >/dev/null 2>&1
}

@test "G-K3FRESH row exists in the health check" {
  grep -q "G-K3FRESH" "$CHECK"
}

@test "G-K3FRESH: fresh receipt verdict -> green (1 eq 1)" {
  stub_freshness fresh
  run_row G-K3FRESH
  grep -q "^G-K3FRESH 1 eq 1$" "$VALUES"
}

@test "G-K3FRESH: unknown verdict -> not green (0), fail-closed, never fake-pass" {
  stub_freshness unknown
  run_row G-K3FRESH
  grep -q "^G-K3FRESH 0 eq 1$" "$VALUES"
}

@test "G-K3FRESH: broken helper output -> SKIP (n/a), not a fake pass" {
  stub_freshness fresh
  printf '#!/bin/sh\necho not-json\n' > "$TEST_DIR/broken.py"
  chmod +x "$TEST_DIR/broken.py"
  CBM_FRESHNESS_BIN="$TEST_DIR/broken.py" run_row G-K3FRESH
  ! grep -q "^G-K3FRESH" "$VALUES"
}

@test "G-K3PROJ row exists in the health check" {
  grep -q "G-K3PROJ" "$CHECK"
}

@test "G-K3PROJ: indexed project with nodes/edges -> green" {
  stub_cli_index 1000 2000 ready
  run_row G-K3PROJ
  grep -q "^G-K3PROJ 1 eq 1$" "$VALUES"
}

@test "G-K3PROJ: probe failure -> not green (0), fail-closed" {
  local bin="$TEST_DIR/bin-broken"
  mkdir -p "$bin"
  printf '#!/bin/sh\nexit 1\n' > "$bin/codebase-memory-mcp"
  chmod +x "$bin/codebase-memory-mcp"
  PATH="$bin:$PATH" run_row G-K3PROJ
  grep -q "^G-K3PROJ 0 eq 1$" "$VALUES"
}

@test "cbm-freshness: text-only detect_changes output is non-fatal (T002430)" {
  # tool 0.10.8 has no JSON mode for detect_changes; it must not force unknown
  local root="$TEST_DIR/repo"
  make_repo "$root"
  stub_cli_text_detect
  python3 - "$REPO_ROOT/scripts/mcp/cbm-freshness.py" "$root" <<'PYEOF'
import importlib.util, sys
spec = importlib.util.spec_from_file_location("cbm_freshness", sys.argv[1])
mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
root, project = sys.argv[2], "home-patrick-Bachelorprojekt"
head = mod.git_head(root)
diff, _ = mod.git_diff_binary(root)
untracked, _ = mod.git_untracked_files(root)
receipt = {"schema_version": 1, "timestamp": mod.utc_now_iso(), "head_sha": head,
           "canonical_root": root, "project": project, "mode": "full",
           "tool_version": "stub", "state_fingerprint":
               mod.fingerprint_state(root, head, diff, untracked), "dirty": False}
mod.atomic_write_json(mod.receipt_path(project, root), receipt)
PYEOF
  run python3 "$REPO_ROOT/scripts/mcp/cbm-freshness.py" status --repo "$root" \
      --project home-patrick-Bachelorprojekt
  [ "$status" -eq 0 ]
  printf '%s' "$output" | jq -e '.status == "fresh"' >/dev/null
  printf '%s' "$output" | jq -e '.reasons | index("detect-changes-nonjson")' >/dev/null
}

@test "cbm-freshness: worktree checkout accepted against main-root index (T002430)" {
  local main="$TEST_DIR/main" wt="$TEST_DIR/wt"
  make_repo "$main"
  git -C "$main" worktree add -q "$wt" >/dev/null 2>&1
  stub_cli_main_root "$main"
  python3 - "$REPO_ROOT/scripts/mcp/cbm-freshness.py" "$main" "$wt" <<'PYEOF'
import importlib.util, sys
spec = importlib.util.spec_from_file_location("cbm_freshness", sys.argv[1])
mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
main, wt, project = sys.argv[2], sys.argv[3], "home-patrick-Bachelorprojekt"
head = mod.git_head(wt)
diff, _ = mod.git_diff_binary(wt)
untracked, _ = mod.git_untracked_files(wt)
# wrapper writes the receipt keyed by the worktree root, but the tool
# canonicalizes the root to the main checkout — that is the T002430 defect
receipt = {"schema_version": 1, "timestamp": mod.utc_now_iso(), "head_sha": head,
           "canonical_root": main, "project": project, "mode": "full",
           "tool_version": "stub", "state_fingerprint":
               mod.fingerprint_state(wt, head, diff, untracked), "dirty": False}
mod.atomic_write_json(mod.receipt_path(project, wt), receipt)
PYEOF
  run python3 "$REPO_ROOT/scripts/mcp/cbm-freshness.py" status --repo "$wt" \
      --project home-patrick-Bachelorprojekt
  [ "$status" -eq 0 ]
  printf '%s' "$output" | jq -e '.status == "fresh"' >/dev/null
  printf '%s' "$output" | jq -e '.reasons | index("root-mismatch") | not' >/dev/null
}

# ── fixture helpers (repo + CLI stubs) ───────────────────────────────────────

make_repo() {
  local dir="$1"
  mkdir -p "$dir"
  git init -q "$dir"
  git -C "$dir" config user.email "test@example.com"
  git -C "$dir" config user.name "Test"
  git -C "$dir" config commit.gpgsign false
  echo "hello" > "$dir/file.txt"
  git -C "$dir" add .
  git -C "$dir" commit -qm "init"
}

stub_cli_text_detect() {
  local bin="$TEST_DIR/bin-text" root
  root="$(git -C "$TEST_DIR/repo" rev-parse --show-toplevel)"
  mkdir -p "$bin"
  cat > "$bin/codebase-memory-mcp" <<STUBEOF
#!/bin/sh
if [ "\$1" = "--version" ]; then echo "stub-cbm 0.0.0-test"; exit 0; fi
if [ "\$1" = "cli" ]; then
  sub="\$2"
  if [ "\$sub" = "index_status" ]; then
    echo '{"project":"home-patrick-Bachelorprojekt","nodes":10,"edges":20,"status":"ready","root_path":"'$root'","git":{"canonical_root":"'$root'"}}'
    exit 0
  fi
  # real tool 0.10.8: detect_changes is human-readable text, even via --json
  printf '%s\n' "base: main" "merge_base: abc" "direction: inbound" "changed_files: 0"
  exit 0
fi
exit 1
STUBEOF
  chmod +x "$bin/codebase-memory-mcp"
  export PATH="$bin:$PATH"
}

stub_cli_main_root() {
  local main_root="$1"
  local bin="$TEST_DIR/bin-main"
  mkdir -p "$bin"
  cat > "$bin/codebase-memory-mcp" <<STUBEOF
#!/bin/sh
if [ "\$1" = "--version" ]; then echo "stub-cbm 0.0.0-test"; exit 0; fi
if [ "\$1" = "cli" ]; then
  sub="\$2"
  if [ "\$sub" = "index_status" ]; then
    echo "{\"project\":\"home-patrick-Bachelorprojekt\",\"nodes\":10,\"edges\":20,\"status\":\"ready\",\"root_path\":\"$main_root\",\"git\":{\"canonical_root\":\"$main_root\"}}"
    exit 0
  fi
  echo '{"changed_count":0,"changed_files":[]}'; exit 0
fi
exit 1
STUBEOF
  chmod +x "$bin/codebase-memory-mcp"
  export PATH="$bin:$PATH"
}
