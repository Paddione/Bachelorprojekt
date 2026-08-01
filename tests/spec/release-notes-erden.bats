#!/usr/bin/env bats
# tests/spec/release-notes-erden.bats
# Ticket: T002403 / openspec/changes/release-notes-erden/tasks.md

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  SCRIPT="$REPO_ROOT/scripts/vda/release-notes.sh"
}

@test "release-notes: deepseek narrative prompt includes ticket context when [T00XXX] tag is present" {
  TEST_DIR="$(mktemp -d)"
  MOCK_BIN="$TEST_DIR/bin"
  mkdir -p "$MOCK_BIN"

  cat <<'EOF' > "$MOCK_BIN/ticket.sh"
#!/usr/bin/env bash
if [[ "$1" == "get" && "$3" == "T002403" ]]; then
  echo '{"id":"c307b1fb","external_id":"T002403","type":"chore","title":"release-notes erden: Ticket-Kontext","description":"Detailed ticket description here","areas":["scripts","tools"]}'
  exit 0
fi
echo '{}'
EOF
  chmod +x "$MOCK_BIN/ticket.sh"

  run bash -c "
    export PATH=\"$MOCK_BIN:\$PATH\"
    export SCRIPT_DIR=\"$MOCK_BIN\"
    pr_titles=\"feat(scripts): add feature [T002403]\"
    DEEPSEEK_API_KEY=\"mock-key\"
    DEEPSEEK_BASE_URL=\"http://127.0.0.1:59999\"
    
    # Mock vda-core.sh inside MOCK_BIN/lib
    mkdir -p \"$MOCK_BIN/lib\"
    cat <<'INNEREOF' > \"$MOCK_BIN/lib/vda-core.sh\"
vda_header() { :; }
vda_error() { echo \"[ERROR] \$*\" >&2; }
vda_warn() { echo \"[WARN] \$*\" >&2; }
vda_success() { echo \"[OK] \$*\"; }
vda_dry_run() { echo \"[DRY_RUN] \$*\"; }
INNEREOF

    source \"$SCRIPT\"

    curl() {
      shift
      local payload=\"\"
      while [[ \$# -gt 0 ]]; do
        if [[ \"\$1\" == \"-d\" ]]; then
          payload=\"\$2\"
          break
        fi
        shift
      done

      if [[ \"\$payload\" =~ \"[TICKET_CONTEXT]\" ]]; then
        echo '{\"choices\":[{\"message\":{\"content\":\"Captured prompt with ticket context\"}}]}'
      else
        echo '{\"choices\":[{\"message\":{\"content\":\"No ticket context found\"}}]}'
      fi
    }

    _deepseek_narrative \"\$pr_titles\"
  "

  [ "$status" -eq 0 ]
  [[ "$output" == *"Captured prompt with ticket context"* ]]

  rm -rf "$TEST_DIR"
}

@test "release-notes: PR without [T00XXX] tag handles gracefully without context" {
  TEST_DIR="$(mktemp -d)"
  MOCK_BIN="$TEST_DIR/bin"
  mkdir -p "$MOCK_BIN"

  cat <<'EOF' > "$MOCK_BIN/ticket.sh"
#!/usr/bin/env bash
echo '{}'
EOF
  chmod +x "$MOCK_BIN/ticket.sh"

  run bash -c "
    export PATH=\"$MOCK_BIN:\$PATH\"
    export SCRIPT_DIR=\"$MOCK_BIN\"
    pr_titles=\"feat(scripts): add feature without tag\"
    DEEPSEEK_API_KEY=\"mock-key\"
    DEEPSEEK_BASE_URL=\"http://127.0.0.1:59999\"

    mkdir -p \"$MOCK_BIN/lib\"
    cat <<'INNEREOF' > \"$MOCK_BIN/lib/vda-core.sh\"
vda_header() { :; }
vda_error() { echo \"[ERROR] \$*\" >&2; }
vda_warn() { echo \"[WARN] \$*\" >&2; }
vda_success() { echo \"[OK] \$*\"; }
vda_dry_run() { echo \"[DRY_RUN] \$*\"; }
INNEREOF
    
    source \"$SCRIPT\"

    curl() {
      shift
      local payload=\"\"
      while [[ \$# -gt 0 ]]; do
        if [[ \"\$1\" == \"-d\" ]]; then
          payload=\"\$2\"
          break
        fi
        shift
      done

      if [[ \"\$payload\" =~ \"[TICKET_CONTEXT]\" ]]; then
        echo '{\"choices\":[{\"message\":{\"content\":\"FAIL: context found\"}}]}'
      else
        echo '{\"choices\":[{\"message\":{\"content\":\"SUCCESS: no ticket context\"}}]}'
      fi
    }

    _deepseek_narrative \"\$pr_titles\"
  "

  [ "$status" -eq 0 ]
  [[ "$output" == *"SUCCESS: no ticket context"* ]]

  rm -rf "$TEST_DIR"
}

@test "release-notes: ticket lookup DB error handles gracefully without context or failing script" {
  TEST_DIR="$(mktemp -d)"
  MOCK_BIN="$TEST_DIR/bin"
  mkdir -p "$MOCK_BIN"

  cat <<'EOF' > "$MOCK_BIN/ticket.sh"
#!/usr/bin/env bash
echo "DB Connection Error: database unreachable" >&2
exit 1
EOF
  chmod +x "$MOCK_BIN/ticket.sh"

  run bash -c "
    export PATH=\"$MOCK_BIN:\$PATH\"
    export SCRIPT_DIR=\"$MOCK_BIN\"
    pr_titles=\"fix(db): handle failure [T009999]\"
    DEEPSEEK_API_KEY=\"mock-key\"
    DEEPSEEK_BASE_URL=\"http://127.0.0.1:59999\"

    mkdir -p \"$MOCK_BIN/lib\"
    cat <<'INNEREOF' > \"$MOCK_BIN/lib/vda-core.sh\"
vda_header() { :; }
vda_error() { echo \"[ERROR] \$*\" >&2; }
vda_warn() { echo \"[WARN] \$*\" >&2; }
vda_success() { echo \"[OK] \$*\"; }
vda_dry_run() { echo \"[DRY_RUN] \$*\"; }
INNEREOF
    
    source \"$SCRIPT\"

    curl() {
      shift
      local payload=\"\"
      while [[ \$# -gt 0 ]]; do
        if [[ \"\$1\" == \"-d\" ]]; then
          payload=\"\$2\"
          break
        fi
        shift
      done

      if [[ \"\$payload\" =~ \"[TICKET_CONTEXT]\" ]]; then
        echo '{\"choices\":[{\"message\":{\"content\":\"FAIL: context found\"}}]}'
      else
        echo '{\"choices\":[{\"message\":{\"content\":\"SUCCESS: fallback without context\"}}]}'
      fi
    }

    _deepseek_narrative \"\$pr_titles\"
  "

  [ "$status" -eq 0 ]
  [[ "$output" == *"SUCCESS: fallback without context"* ]]

  rm -rf "$TEST_DIR"
}
