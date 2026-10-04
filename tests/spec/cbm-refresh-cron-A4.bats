#!/usr/bin/env bats
# tests/spec/cbm-refresh-cron-A4.bats
# Ticket: T900993 (A4 — cron embed-sync hook)
#
# The cron calls the sync CLI via python3 with an absolute path, so PATH
# stubbing cannot intercept it. CBM_EMBED_SYNC is the test seam (production
# default: scripts/mcp/cbm-embed-sync.py); tests point it at a stub python
# script that records its argv and exits with $SYNC_EXIT_CODE.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  CRON="$REPO_ROOT/scripts/cbm-refresh-cron.sh"
  WRAPPER="$REPO_ROOT/scripts/mcp/cbm-single-flight.sh"
}

isolate_home() {
  export TEST_HOME="$BATS_TEST_TMPDIR/home"
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
  echo "hello" > "$dir/file.txt"
  git -C "$dir" add .
  git -C "$dir" commit -qm "init"
}

stub_cli() {
  local bin="$BATS_TEST_TMPDIR/bin"
  mkdir -p "$bin"
  cat > "$bin/codebase-memory-mcp" <<'STUBEOF'
#!/bin/sh
case "$1" in
  --version)
    echo "stub-cbm 0.0.0-test"
    exit 0
    ;;
  cli)
    shift
    sub="$1"; shift
    case "$sub" in
      index_status)
        proj=""
        while [ "$#" -gt 0 ]; do case "$1" in --project) proj="$2"; shift 2;; *) shift;; esac; done
        root="${STUB_ROOT:-/tmp/repo}"
        echo "{\"project\":\"$proj\",\"root_path\":\"$root\",\"git\":{\"canonical_root\":\"$root\",\"worktree_root\":\"$root\"},\"status\":\"ready\",\"nodes\":1,\"edges\":1}"
        exit 0
        ;;
      detect_changes)
        echo '{"changed_count":0,"changed_files":[]}'
        exit 0
        ;;
      index_repository)
        echo '{"ok":true}'
        exit 0
        ;;
      *) echo "unknown subcommand" >&2; exit 2;;
    esac
    ;;
  *) echo "unknown" >&2; exit 2;;
esac
STUBEOF
  chmod +x "$bin/codebase-memory-mcp"
  export PATH="$bin:/usr/bin:/bin"
}

# Point CBM_EMBED_SYNC at a stub python script recording argv to $SYNC_LOG.
make_sync_stub() {
  local stub="$BATS_TEST_TMPDIR/sync-stub.py"
  cat > "$stub" <<'STUBEOF'
import os, sys
log = os.environ.get("SYNC_LOG", "")
if log:
    with open(log, "a") as f:
        f.write(" ".join(sys.argv[1:]) + "\n")
sys.exit(int(os.environ.get("SYNC_EXIT_CODE", "0")))
STUBEOF
  export CBM_EMBED_SYNC="$stub"
  export SYNC_LOG="$BATS_TEST_TMPDIR/sync.log"
  : > "$SYNC_LOG"
}

# Fresh receipt first, then HEAD drift -> helper reports stale, refresh allowed.
# Sets $STALE_ROOT (no command substitution: exports must survive to the caller).
make_stale_repo() {
  local repo="$BATS_TEST_TMPDIR/repo"
  make_repo "$repo"
  STALE_ROOT="$(realpath "$repo")"
  export STUB_ROOT="$STALE_ROOT"
  stub_cli
  run bash "$WRAPPER" "{\"repo_path\": \"$STALE_ROOT\", \"mode\": \"fast\", \"persistence\": true}"
  [ "$status" -eq 0 ]
  echo "drift" >> "$repo/file.txt"
  git -C "$repo" commit -qam "drift"
}

@test "T900993-A4: dry-run (would-refresh) never invokes embed sync" {
  isolate_home
  local root
  make_stale_repo
  local root="$STALE_ROOT"
  make_sync_stub
  export SYNC_EXIT_CODE="0"
  run bash "$CRON" --dry-run --repo "$root"
  [ "$status" -eq 0 ]
  printf '%s' "$output" | jq -e '.status == "would-refresh"' >/dev/null
  [ ! -s "$SYNC_LOG" ]
}

@test "T900993-A4: successful refresh invokes embed sync with repo context" {
  isolate_home
  local root
  make_stale_repo
  local root="$STALE_ROOT"
  make_sync_stub
  export SYNC_EXIT_CODE="0"
  run bash "$CRON" --repo "$root"
  [ "$status" -eq 0 ]
  printf '%s' "$output" | tail -n 1 | jq -e '.status == "refreshed"' >/dev/null
  [ -s "$SYNC_LOG" ]
  grep -q '^sync ' "$SYNC_LOG"
  grep -qF -- "--repo $root" "$SYNC_LOG"
  grep -qF -- "--project home-patrick-Bachelorprojekt" "$SYNC_LOG"
}

@test "T900993-A4: sync failure is non-fatal, refresh stays valid" {
  isolate_home
  local root
  make_stale_repo
  local root="$STALE_ROOT"
  make_sync_stub
  export SYNC_EXIT_CODE="1"
  run bash "$CRON" --repo "$root"
  [ "$status" -eq 0 ]
  printf '%s' "$output" | tail -n 1 | jq -e '.status == "refreshed"' >/dev/null
  [ -s "$SYNC_LOG" ]
}
