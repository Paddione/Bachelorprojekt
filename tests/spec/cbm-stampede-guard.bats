#!/usr/bin/env bats
# tests/spec/cbm-stampede-guard.bats
# Ticket: T900450, T900805 (conservative freshness + receipts)

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  WRAPPER="$REPO_ROOT/scripts/mcp/cbm-single-flight.sh"
  CRON="$REPO_ROOT/scripts/cbm-refresh-cron.sh"
  HELPER="$REPO_ROOT/scripts/mcp/cbm-freshness.py"
  RUNBOOK="$REPO_ROOT/docs/runbooks/cbm-index-stampede.md"
  TASKFILE="$REPO_ROOT/taskfiles/Taskfile.data.yml"
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
# Emulates the real CLI: `cli --json <sub>` wraps the payload in an MCP
# envelope {"content":[{"type":"text","text":<payload>}]}; index_status
# inner text is JSON, detect_changes inner text is plain text.
json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e ':a' -e 'N' -e '$!ba' -e 's/\n/\\n/g'
}
emit_envelope() {
  printf '{"content":[{"type":"text","text":"%s"}],"isError":false}\n' "$(json_escape "$1")"
}
if [ -n "${STUB_LOG:-}" ]; then printf '%s\n' "$*" >> "$STUB_LOG"; fi
case "$1" in
  --version)
    if [ "${STUB_MODE:-ok}" = "timeout-version" ]; then sleep 5; fi
    if [ "${STUB_MODE:-ok}" = "fail" ]; then exit 1; fi
    echo "stub-cbm 0.0.0-test"
    exit 0
    ;;
  cli)
    shift
    if [ "${1:-}" = "--json" ]; then use_json=1; shift; else use_json=""; fi
    sub="$1"; shift
    case "$sub" in
      index_status)
        proj=""
        while [ "$#" -gt 0 ]; do case "$1" in --project) proj="$2"; shift 2;; *) shift;; esac; done
        case "${STUB_MODE:-ok}" in
          fail) exit 1;;
          malformed) echo "not-json"; exit 0;;
          tool-error)
            if [ -n "$use_json" ]; then emit_envelope '{"error":"boom"}'; else echo '{"error":"boom"}'; fi
            exit 0;;
          timeout) sleep 5; echo '{}'; exit 0;;
          mismatch)
            inner="{\"project\":\"$proj\",\"root_path\":\"/wrong/root\",\"git\":{\"canonical_root\":\"/wrong/root\"},\"status\":\"ready\"}"
            if [ -n "$use_json" ]; then emit_envelope "$inner"; else echo "$inner"; fi
            exit 0;;
          project-mismatch)
            inner="{\"project\":\"other-project\",\"root_path\":\"${STUB_ROOT:-/tmp}\",\"git\":{\"canonical_root\":\"${STUB_ROOT:-/tmp}\"},\"status\":\"ready\"}"
            if [ -n "$use_json" ]; then emit_envelope "$inner"; else echo "$inner"; fi
            exit 0;;
          *)
            root="${STUB_ROOT:-/tmp/repo}"
            inner="{\"project\":\"$proj\",\"root_path\":\"$root\",\"git\":{\"canonical_root\":\"$root\",\"worktree_root\":\"$root\"},\"status\":\"ready\",\"nodes\":1,\"edges\":1}"
            if [ -n "$use_json" ]; then emit_envelope "$inner"; else echo "$inner"; fi
            exit 0;;
        esac
        ;;
      detect_changes)
        case "${STUB_MODE:-ok}" in
          fail) exit 1;;
          malformed) echo "not-json"; exit 0;;
          tool-error)
            if [ -n "$use_json" ]; then echo '{"content":[{"type":"text","text":"boom"}],"isError":true}'; else echo '{"error":"boom"}'; fi
            exit 0;;
          timeout) sleep 5; echo '{}'; exit 0;;
          *)
            if [ -n "$use_json" ]; then
              emit_envelope "base: main
merge_base: 0000000000000000000000000000000000000000
direction: inbound
changed_files: 0"
            else
              echo '{"changed_count":0,"changed_files":[]}'
            fi
            exit 0;;
        esac
        ;;
      index_repository)
        if [ -n "${STUB_TOUCH_FILE:-}" ]; then echo "touched" >> "$STUB_TOUCH_FILE" 2>/dev/null || true; fi
        case "${STUB_MODE:-ok}" in
          fail-index) exit 1;;
          tool-error) echo '{"error":"index-failed"}'; exit 0;;
          malformed) echo "not-json"; exit 0;;
          *) echo '{"ok":true}'; exit 0;;
        esac
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

@test "T900450-W1: Wrapper existiert, ist ausfuehrbar, enthaelt flock + Lockpfad + Timeout 3000 + Exit-3-Zweig" {
  [ -f "$WRAPPER" ] || { echo "MISSING wrapper: $WRAPPER"; return 1; }
  [ -x "$WRAPPER" ] || { echo "NOT-EXECUTABLE: $WRAPPER"; return 1; }
  grep -q 'flock' "$WRAPPER"
  grep -qF '.cache/codebase-memory-mcp/cbm-index.lock' "$WRAPPER"
  grep -q '3000' "$WRAPPER"
  grep -q 'exit 3' "$WRAPPER"
}

@test "T900450-W2: Wrapper ohne Argumente beendet sich mit Exit 2 (kein MCP-Aufruf erreicht)" {
  run bash "$WRAPPER"
  [ "$status" -eq 2 ]
}

@test "T900450-C1: Cron-Skript referenziert den Wrapper, traegt fresh-skip-Zweig und dokumentierten Cron-Eintrag" {
  [ -f "$CRON" ] || { echo "MISSING cron: $CRON"; return 1; }
  grep -q 'cbm-single-flight.sh' "$CRON"
  grep -q 'fresh-skip' "$CRON"
  grep -qE '0 (\*/4)? \* \* \*' "$CRON"
}

@test "T900450-A1: Kein direktes index_repository in Automation (nur Wrapper-Passthrough)" {
  [ "$(grep -c 'index_repository' "$WRAPPER")" -eq 1 ]
  ! grep -v '^#' "$CRON" | grep -q 'index_repository'
  ! grep -q 'codebase-memory-mcp cli index_repository' "$TASKFILE"
  [ "$(grep -c 'cbm-single-flight' "$TASKFILE")" -eq 2 ]
}

@test "T900450-R1: Runbook enthaelt index_status + detect_changes + Wrapper + Task-Referenz" {
  [ -f "$RUNBOOK" ] || { echo "MISSING runbook: $RUNBOOK"; return 1; }
  [ "$(grep -c 'index_status' "$RUNBOOK")" -ge 1 ]
  [ "$(grep -c 'detect_changes' "$RUNBOOK")" -ge 1 ]
  [ "$(grep -c 'cbm-single-flight.sh' "$RUNBOOK")" -ge 1 ]
  [ "$(grep -c 'codebase:index' "$RUNBOOK")" -ge 1 ]
}

@test "T900805: failed graph probe reports unknown instead of fresh-skip" {
  mkdir -p "$BATS_TEST_TMPDIR/bin"
  printf '#!/bin/sh\nexit 1\n' > "$BATS_TEST_TMPDIR/bin/codebase-memory-mcp"
  chmod +x "$BATS_TEST_TMPDIR/bin/codebase-memory-mcp"
  export PATH="$BATS_TEST_TMPDIR/bin:$PATH"

  run bash "$CRON" --dry-run
  [ "$status" -ne 0 ]
  printf '%s' "$output" | jq -e '.status == "unknown"' >/dev/null
}

@test "T900805-C2: cron dry-run emits single JSON with status for stubbed fresh" {
  isolate_home
  local repo="$BATS_TEST_TMPDIR/repo"
  make_repo "$repo"
  local root
  root="$(realpath "$repo")"
  export STUB_ROOT="$root" STUB_MODE="ok"
  stub_cli
  run bash "$WRAPPER" "{\"repo_path\": \"$root\", \"mode\": \"fast\", \"persistence\": true}"
  [ "$status" -eq 0 ]
  run bash "$CRON" --dry-run --repo "$root"
  [ "$status" -eq 0 ]
  [ "$(printf '%s' "$output" | wc -l)" -le 1 ]
  printf '%s' "$output" | jq -e '.status == "fresh-skip"' >/dev/null
}

@test "T900805-status: clean indexed snapshot reports fresh" {
  isolate_home
  local repo="$BATS_TEST_TMPDIR/repo"
  make_repo "$repo"
  local root
  root="$(realpath "$repo")"
  export STUB_ROOT="$root" STUB_MODE="ok"
  stub_cli
  run bash "$WRAPPER" "{\"repo_path\": \"$root\", \"mode\": \"fast\", \"persistence\": true}"
  [ "$status" -eq 0 ]
  run python3 "$HELPER" status --repo "$root" --project home-patrick-Bachelorprojekt --timeout 10
  [ "$status" -eq 0 ]
  printf '%s' "$output" | jq -e '.status == "fresh"' >/dev/null
  printf '%s' "$output" | jq -e '.refresh_allowed == false' >/dev/null
}

@test "T900805-status: HEAD drift reports stale with refresh allowed" {
  isolate_home
  local repo="$BATS_TEST_TMPDIR/repo"
  make_repo "$repo"
  local root
  root="$(realpath "$repo")"
  export STUB_ROOT="$root" STUB_MODE="ok"
  stub_cli
  run bash "$WRAPPER" "{\"repo_path\": \"$root\", \"mode\": \"fast\", \"persistence\": true}"
  [ "$status" -eq 0 ]
  echo "change" >> "$repo/file.txt"
  git -C "$repo" commit -qam "second"
  run python3 "$HELPER" status --repo "$root" --project home-patrick-Bachelorprojekt --timeout 10
  [ "$status" -eq 0 ]
  printf '%s' "$output" | jq -e '.status == "stale"' >/dev/null
  printf '%s' "$output" | jq -e '.refresh_allowed == true' >/dev/null
  printf '%s' "$output" | jq -e '.reasons | index("head-drift")' >/dev/null
}

@test "T900805-status: missing receipt reports unknown with initial refresh allowed" {
  isolate_home
  local repo="$BATS_TEST_TMPDIR/repo"
  make_repo "$repo"
  local root
  root="$(realpath "$repo")"
  export STUB_ROOT="$root" STUB_MODE="ok"
  stub_cli
  run python3 "$HELPER" status --repo "$root" --project home-patrick-Bachelorprojekt --timeout 10
  [ "$status" -ne 0 ]
  printf '%s' "$output" | jq -e '.status == "unknown"' >/dev/null
  printf '%s' "$output" | jq -e '.refresh_allowed == true' >/dev/null
  printf '%s' "$output" | jq -e '.reasons | index("receipt-missing")' >/dev/null
}

@test "T900805-status: wrong root reports unknown without refresh" {
  isolate_home
  local repo="$BATS_TEST_TMPDIR/repo"
  make_repo "$repo"
  local root
  root="$(realpath "$repo")"
  export STUB_ROOT="$root" STUB_MODE="mismatch"
  stub_cli
  run python3 "$HELPER" status --repo "$root" --project home-patrick-Bachelorprojekt --timeout 10
  [ "$status" -ne 0 ]
  printf '%s' "$output" | jq -e '.status == "unknown"' >/dev/null
  printf '%s' "$output" | jq -e '.refresh_allowed == false' >/dev/null
  printf '%s' "$output" | jq -e '.reasons | index("root-mismatch")' >/dev/null
}

@test "T900805-status: wrong project reports unknown without refresh" {
  isolate_home
  local repo="$BATS_TEST_TMPDIR/repo"
  make_repo "$repo"
  local root
  root="$(realpath "$repo")"
  export STUB_ROOT="$root" STUB_MODE="project-mismatch"
  stub_cli
  run python3 "$HELPER" status --repo "$root" --project home-patrick-Bachelorprojekt --timeout 10
  [ "$status" -ne 0 ]
  printf '%s' "$output" | jq -e '.status == "unknown"' >/dev/null
  printf '%s' "$output" | jq -e '.reasons | index("project-mismatch")' >/dev/null
}

@test "T900805-status: missing CLI reports unknown without refresh" {
  isolate_home
  local repo="$BATS_TEST_TMPDIR/repo"
  make_repo "$repo"
  local root
  root="$(realpath "$repo")"
  export PATH="/usr/bin:/bin"
  run python3 "$HELPER" status --repo "$root" --project home-patrick-Bachelorprojekt --timeout 5
  [ "$status" -ne 0 ]
  printf '%s' "$output" | jq -e '.status == "unknown"' >/dev/null
  printf '%s' "$output" | jq -e '.reasons | index("tool-missing")' >/dev/null
}

@test "T900805-status: probe timeout reports unknown" {
  isolate_home
  local repo="$BATS_TEST_TMPDIR/repo"
  make_repo "$repo"
  local root
  root="$(realpath "$repo")"
  export STUB_ROOT="$root" STUB_MODE="timeout"
  stub_cli
  run python3 "$HELPER" status --repo "$root" --project home-patrick-Bachelorprojekt --timeout 1
  [ "$status" -ne 0 ]
  printf '%s' "$output" | jq -e '.status == "unknown"' >/dev/null
  printf '%s' "$output" | jq -e '.reasons | index("probe-timeout")' >/dev/null
}

@test "T900805-status: malformed probe reports unknown" {
  isolate_home
  local repo="$BATS_TEST_TMPDIR/repo"
  make_repo "$repo"
  local root
  root="$(realpath "$repo")"
  export STUB_ROOT="$root" STUB_MODE="malformed"
  stub_cli
  run python3 "$HELPER" status --repo "$root" --project home-patrick-Bachelorprojekt --timeout 10
  [ "$status" -ne 0 ]
  printf '%s' "$output" | jq -e '.status == "unknown"' >/dev/null
  printf '%s' "$output" | jq -e '.reasons | index("probe-malformed")' >/dev/null
}

@test "T900805-status: tool error envelope reports unknown" {
  isolate_home
  local repo="$BATS_TEST_TMPDIR/repo"
  make_repo "$repo"
  local root
  root="$(realpath "$repo")"
  export STUB_ROOT="$root" STUB_MODE="tool-error"
  stub_cli
  run python3 "$HELPER" status --repo "$root" --project home-patrick-Bachelorprojekt --timeout 10
  [ "$status" -ne 0 ]
  printf '%s' "$output" | jq -e '.status == "unknown"' >/dev/null
  printf '%s' "$output" | jq -e '.reasons | index("tool-error")' >/dev/null
}

@test "T900805-status: dirty and untracked paths are unique with counts" {
  isolate_home
  local repo="$BATS_TEST_TMPDIR/repo"
  make_repo "$repo"
  local root
  root="$(realpath "$repo")"
  export STUB_ROOT="$root" STUB_MODE="ok"
  stub_cli
  echo "dirty" >> "$repo/file.txt"
  echo "new" > "$repo/untracked.txt"
  run python3 "$HELPER" status --repo "$root" --project home-patrick-Bachelorprojekt --timeout 10
  [ "$status" -ne 0 ]
  printf '%s' "$output" | jq -e '.dirty.count == 1' >/dev/null
  printf '%s' "$output" | jq -e '.untracked.count == 1' >/dev/null
  printf '%s' "$output" | jq -e '.dirty.paths | index("file.txt")' >/dev/null
  printf '%s' "$output" | jq -e '.untracked.paths | index("untracked.txt")' >/dev/null
}

@test "T900805-status: unusual paths with spaces and renames stay unique" {
  isolate_home
  local repo="$BATS_TEST_TMPDIR/repo"
  make_repo "$repo"
  local root
  root="$(realpath "$repo")"
  export STUB_ROOT="$root" STUB_MODE="ok"
  stub_cli
  echo "x" > "$repo/spaced name.txt"
  git -C "$repo" add .
  git -C "$repo" commit -qm "spaced"
  git -C "$repo" mv "spaced name.txt" "renamed.txt"
  echo "dirty" >> "$repo/renamed.txt"
  run python3 "$HELPER" status --repo "$root" --project home-patrick-Bachelorprojekt --timeout 10
  [ "$status" -ne 0 ]
  printf '%s' "$output" | jq -e '.dirty.paths | map(select(. == "renamed.txt")) | length == 1' >/dev/null
}

@test "T900805-status: checkout behind local upstream stays fresh without reindex" {
  isolate_home
  local repo="$BATS_TEST_TMPDIR/repo"
  make_repo "$repo"
  local root
  root="$(realpath "$repo")"
  export STUB_ROOT="$root" STUB_MODE="ok"
  stub_cli
  run bash "$WRAPPER" "{\"repo_path\": \"$root\", \"mode\": \"fast\", \"persistence\": true}"
  [ "$status" -eq 0 ]
  local head
  head="$(git -C "$repo" rev-parse HEAD)"
  echo "ahead" > "$repo/ahead.txt"
  git -C "$repo" add .
  git -C "$repo" commit -qm "ahead-commit"
  local ahead
  ahead="$(git -C "$repo" rev-parse HEAD)"
  git -C "$repo" update-ref refs/remotes/origin/main "$ahead"
  git -C "$repo" reset -q --hard "$head"
  git -C "$repo" clean -fdq
  run python3 "$HELPER" status --repo "$root" --project home-patrick-Bachelorprojekt --timeout 10
  [ "$status" -eq 0 ]
  printf '%s' "$output" | jq -e '.status == "fresh"' >/dev/null
  printf '%s' "$output" | jq -e '.upstream.relation == "behind"' >/dev/null
  printf '%s' "$output" | jq -e '.refresh_allowed == false' >/dev/null
}

@test "T900805-receipt: failed index preserves previous valid receipt" {
  isolate_home
  local repo="$BATS_TEST_TMPDIR/repo"
  make_repo "$repo"
  local root
  root="$(realpath "$repo")"
  export STUB_ROOT="$root" STUB_MODE="ok"
  stub_cli
  run bash "$WRAPPER" "{\"repo_path\": \"$root\", \"mode\": \"fast\", \"persistence\": true}"
  [ "$status" -eq 0 ]
  local cache="$TEST_HOME/.cache/codebase-memory-mcp"
  local receipt
  receipt="$(ls "$cache"/cbm-receipt-*.json)"
  local before
  before="$(cat "$receipt")"
  export STUB_MODE="fail-index"
  run bash "$WRAPPER" "{\"repo_path\": \"$root\", \"mode\": \"fast\", \"persistence\": true}"
  [ "$status" -ne 0 ]
  local after
  after="$(cat "$receipt")"
  [ "$before" = "$after" ]
  run python3 "$HELPER" status --repo "$root" --project home-patrick-Bachelorprojekt --timeout 10
  [ "$status" -ne 0 ]
  printf '%s' "$output" | jq -e '.status == "unknown"' >/dev/null
}

@test "T900805-receipt: unstable repo during index preserves receipt" {
  isolate_home
  local repo="$BATS_TEST_TMPDIR/repo"
  make_repo "$repo"
  local root
  root="$(realpath "$repo")"
  export STUB_ROOT="$root" STUB_MODE="ok"
  stub_cli
  run bash "$WRAPPER" "{\"repo_path\": \"$root\", \"mode\": \"fast\", \"persistence\": true}"
  [ "$status" -eq 0 ]
  export STUB_TOUCH_FILE="$repo/file.txt"
  run bash "$WRAPPER" "{\"repo_path\": \"$root\", \"mode\": \"fast\", \"persistence\": true}"
  [ "$status" -ne 0 ]
  unset STUB_TOUCH_FILE
}

@test "T900805-receipt: dirty successful index stays fresh without reindex loop" {
  isolate_home
  local repo="$BATS_TEST_TMPDIR/repo"
  make_repo "$repo"
  local root
  root="$(realpath "$repo")"
  export STUB_ROOT="$root" STUB_MODE="ok"
  stub_cli
  echo "dirty" >> "$repo/file.txt"
  echo "new" > "$repo/untracked.txt"
  run bash "$WRAPPER" "{\"repo_path\": \"$root\", \"mode\": \"fast\", \"persistence\": true}"
  [ "$status" -eq 0 ]
  run python3 "$HELPER" status --repo "$root" --project home-patrick-Bachelorprojekt --timeout 10
  [ "$status" -eq 0 ]
  printf '%s' "$output" | jq -e '.status == "fresh"' >/dev/null
  printf '%s' "$output" | jq -e '.receipt.dirty == true' >/dev/null
  printf '%s' "$output" | jq -e '.refresh_allowed == false' >/dev/null
}

@test "T900805-wrapper: JSON target root differing from cwd is used" {
  isolate_home
  local repo="$BATS_TEST_TMPDIR/repo"
  make_repo "$repo"
  local root
  root="$(realpath "$repo")"
  export STUB_ROOT="$root" STUB_MODE="ok"
  stub_cli
  mkdir -p "$BATS_TEST_TMPDIR/other"
  run bash -c "cd '$BATS_TEST_TMPDIR/other' && bash '$WRAPPER' '{\"repo_path\": \"$root\", \"mode\": \"fast\", \"persistence\": true}'"
  [ "$status" -eq 0 ]
  run python3 "$HELPER" status --repo "$root" --project home-patrick-Bachelorprojekt --timeout 10
  [ "$status" -eq 0 ]
  printf '%s' "$output" | jq -e '.status == "fresh"' >/dev/null
}

@test "T900805-wrapper: lock timeout exits 3" {
  isolate_home
  export CBMSF_TIMEOUT=1
  local lock="$TEST_HOME/.cache/codebase-memory-mcp/cbm-index.lock"
  mkdir -p "$(dirname "$lock")"
  touch "$lock"
  (
    exec 9>"$lock"
    flock -x 9
    sleep 3
  ) &
  local holder=$!
  sleep 0.3
  run bash "$WRAPPER" '{"repo_path": "/tmp", "mode": "fast", "persistence": true}'
  [ "$status" -eq 3 ]
  wait "$holder" || true
  unset CBMSF_TIMEOUT
}

@test "T900805-status: no fetch or index is triggered by status" {
  isolate_home
  local repo="$BATS_TEST_TMPDIR/repo"
  make_repo "$repo"
  local root
  root="$(realpath "$repo")"
  export STUB_ROOT="$root" STUB_MODE="ok" STUB_LOG="$BATS_TEST_TMPDIR/cli.log"
  stub_cli
  : > "$STUB_LOG"
  run python3 "$HELPER" status --repo "$root" --project home-patrick-Bachelorprojekt --timeout 10
  [ "$status" -ne 0 ]
  ! grep -q 'index_repository' "$STUB_LOG"
  ! grep -q 'fetch' "$STUB_LOG"
}

@test "T900805-cron: dry-run never indexes even when refresh allowed" {
  isolate_home
  local repo="$BATS_TEST_TMPDIR/repo"
  make_repo "$repo"
  local root
  root="$(realpath "$repo")"
  export STUB_ROOT="$root" STUB_MODE="ok" STUB_LOG="$BATS_TEST_TMPDIR/cli.log"
  stub_cli
  : > "$STUB_LOG"
  run bash "$CRON" --dry-run --repo "$root"
  [ "$status" -eq 0 ]
  printf '%s' "$output" | jq -e '.status == "would-refresh"' >/dev/null
  ! grep -q 'index_repository' "$STUB_LOG"
}
