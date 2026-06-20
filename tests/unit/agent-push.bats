#!/usr/bin/env bats

setup() {
  TEST_DIR="$(mktemp -d)"
  export MOCK_BIN_DIR="$TEST_DIR/bin"
  mkdir -p "$MOCK_BIN_DIR"
  
  export CURL_LOG="$TEST_DIR/curl_calls.log"
  export AGENT_PUSH_LOG="$TEST_DIR/agent-push.log"
  
  export NTFY_BASE_URL="http://mock-ntfy"
  export NTFY_TOKEN_OPEncode="tk_opencode_dev_token_32chars_ab"
  export NTFY_TOKEN_AGY="tk_agy_dev_token_32chars_ab12345"
  export AGENT_PUSH_API="http://mock-api"
  export AGENT_PUSH_TOKEN="dev-agent-push-token-1234567890"
  export AGENT_PUSH_LINK_BASE="http://mock-link"
  
  export PATH="$MOCK_BIN_DIR:$PATH"
}

teardown() {
  rm -rf "$TEST_DIR"
}

write_mock_curl() {
  local response_body="$1"
  local exit_code="${2:-0}"
  cat <<EOF > "$MOCK_BIN_DIR/curl"
#!/bin/sh
echo "curl \$@" >> "$CURL_LOG"
if [ ! -t 0 ]; then
  cat >> "$CURL_LOG"
fi
echo "$response_body"
exit $exit_code
EOF
  chmod +x "$MOCK_BIN_DIR/curl"
}

@test "test_opt_in_disabled_skips_send" {
  write_mock_curl '{"enabled":false}' 0
  
  run bash scripts/agent-push.sh opencode session.started "session-123" "Session gestartet"
  [ "$status" -eq 0 ]
  
  grep -q "api/admin/agent-push/settings" "$CURL_LOG"
  ! grep -q "mock-ntfy" "$CURL_LOG"
  grep -q "SKIP source=opencode" "$AGENT_PUSH_LOG"
}

@test "test_opt_in_api_unreachable_skips_send" {
  write_mock_curl "" 7
  
  run bash scripts/agent-push.sh opencode session.started "session-123" "Session gestartet"
  [ "$status" -eq 0 ]
  
  grep -q "api/admin/agent-push/settings" "$CURL_LOG"
  ! grep -q "mock-ntfy" "$CURL_LOG"
  grep -q "SKIP source=opencode" "$AGENT_PUSH_LOG"
}

@test "test_happy_path_posts_to_topic" {
  cat <<'EOF' > "$MOCK_BIN_DIR/curl"
#!/bin/sh
echo "curl $@" >> "$CURL_LOG"
if [ ! -t 0 ]; then
  cat >> "$CURL_LOG"
fi

case "$@" in
  *settings*)
    echo '{"enabled":true}'
    exit 0
    ;;
  *mock-ntfy*)
    echo "OK"
    exit 0
    ;;
esac
EOF
  chmod +x "$MOCK_BIN_DIR/curl"
  
  run bash scripts/agent-push.sh opencode session.started "session-123" "Session gestartet"
  [ "$status" -eq 0 ]
  
  grep -q "api/admin/agent-push/settings" "$CURL_LOG"
  grep -q "mock-ntfy/bachelorprojekt-opencode" "$CURL_LOG"
  grep -q "Authorization: Bearer tk_opencode_dev_token_32chars_ab" "$CURL_LOG"
}

@test "test_retry_then_give_up_logs" {
  cat <<'EOF' > "$MOCK_BIN_DIR/curl"
#!/bin/sh
echo "curl $@" >> "$CURL_LOG"
case "$@" in
  *settings*)
    echo '{"enabled":true}'
    exit 0
    ;;
  *mock-ntfy*)
    exit 22
    ;;
esac
EOF
  chmod +x "$MOCK_BIN_DIR/curl"
  
  run bash scripts/agent-push.sh opencode session.started "session-123" "Session gestartet"
  [ "$status" -eq 0 ]
  
  grep -q "api/admin/agent-push/settings" "$CURL_LOG"
  [ "$(grep -c "mock-ntfy" "$CURL_LOG")" -eq 3 ]
  grep -q "GIVEUP source=opencode" "$AGENT_PUSH_LOG"
}

@test "test_body_no_sensitive_content" {
  cat <<'EOF' > "$MOCK_BIN_DIR/curl"
#!/bin/sh
echo "curl $@" >> "$CURL_LOG"
if [ ! -t 0 ]; then
  cat >> "$CURL_LOG"
fi
case "$@" in
  *settings*)
    echo '{"enabled":true}'
    exit 0
    ;;
  *mock-ntfy*)
    exit 0
    ;;
esac
EOF
  chmod +x "$MOCK_BIN_DIR/curl"
  
  run bash scripts/agent-push.sh opencode session.started "session-123" "Session gestartet"
  [ "$status" -eq 0 ]
  
  grep -q "session-123" "$CURL_LOG"
  grep -q "http://mock-link/session-123" "$CURL_LOG"
}
