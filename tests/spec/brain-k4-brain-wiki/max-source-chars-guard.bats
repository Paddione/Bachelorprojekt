#!/usr/bin/env bats
# tests/spec/brain-k4-brain-wiki/max-source-chars-guard.bats
# Ticket: T002679
# SSOT-Spec: openspec/specs/brain-k4-brain-wiki.md
# Pruefmodus: Output-Verifikation — fuehrt brain-ingest-transform.sh gegen
#   einen stub LLM-Endpunkt aus und prueft Exit-Code, Fehlermeldung und
#   Prompt-Inhalt. Positiv-Anker-Pflicht (T002356-M1): jeder Negativtest
#   prueft IM SELBEN @test zuerst den gueltigen Fall.

setup() {
  # Use a small MAX_SOURCE_CHARS so we don't need huge fixtures
  export MAX_SOURCE_CHARS=500
  export LM_MODEL="test-model"
  export LM_TIMEOUT=5
  TRANSFORM="scripts/brain-ingest-transform.sh"

  STUB_DIR="$BATS_TEST_TMPDIR/stub"
  mkdir -p "$STUB_DIR"
  STUB_LOG="$STUB_DIR/body.txt"

  # Stub HTTP endpoint that records every request BODY, so the prompt content is
  # observable. Modelled on tests/spec/brain-foundation/ingest-llm-endpoint.bats:
  # the server must run in the FOREGROUND of its own background process. A
  # daemon thread inside a `python3 -c` that then falls off the end of the script
  # dies with the interpreter, and every request afterwards fails to connect.
  # The port is handed back through a FILE — BATS occupies FD 3, so reading it
  # from a process substitution would block the run instead of failing it.
  cat > "$STUB_DIR/server.py" <<'PYEOF'
import http.server, socketserver, sys
BODY = open(sys.argv[1], 'rb').read()
class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        with open(sys.argv[2], 'ab') as f:
            f.write(body + b"\n---END---\n")
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(BODY)))
        self.end_headers()
        self.wfile.write(BODY)
    def log_message(self, *a):
        pass
with socketserver.TCPServer(('127.0.0.1', 0), H) as s:
    with open(sys.argv[3], 'w') as f:
        f.write(str(s.server_address[1]))
    s.serve_forever()
PYEOF

  printf '%s' '{"choices":[{"message":{"content":"---\ntype: note\ntags: [test]\nstatus: active\n---\n\n# Seite\n\nsource:: Bachelorprojekt test/path.md\n\nSiehe [[andere-seite]].\n"},"finish_reason":"stop"}]}' \
    > "$STUB_DIR/response.json"
  : > "$STUB_LOG"
  rm -f "$STUB_DIR/port"

  python3 "$STUB_DIR/server.py" "$STUB_DIR/response.json" "$STUB_LOG" "$STUB_DIR/port" &
  STUB_PID=$!

  local waited=0
  while [ ! -s "$STUB_DIR/port" ]; do
    sleep 0.1
    waited=$((waited + 1))
    [ "$waited" -lt 100 ] || { echo "stub did not come up" >&2; return 1; }
  done
  export LM_STUDIO_URL="http://127.0.0.1:$(cat "$STUB_DIR/port")"
}

teardown() {
  [ -n "${STUB_PID:-}" ] && kill "$STUB_PID" 2>/dev/null
  return 0
}

@test "oversized source is rejected and produces no page" {
  # Positiv-Anker: small source (under limit) succeeds
  local small_src="$BATS_TEST_TMPDIR/small.md"
  local big_src="$BATS_TEST_TMPDIR/big.md"
  local slugs='["test"]'
  local tags='["note"]'

  # Small source: well under 500 chars
  printf '# Small Doc\n\nThis is a small document.\nENDMARKER_SMALL\n' > "$small_src"

  > "$STUB_LOG"  # clear log
  run bash "$TRANSFORM" "$small_src" "note" "small-test" "$slugs" "$tags"
  [ "$status" -eq 0 ]
  # Should have produced output
  [ -n "$output" ]

  # Now big source: comfortably over MAX_SOURCE_CHARS=500.
  # 120 x 7 chars of filler plus the heading lands near 850 — the margin is
  # deliberate, a fixture that only just clears the limit turns a rounding
  # change into a phantom test failure.
  printf '# Big Doc\n\n' > "$big_src"
  for i in $(seq 1 120); do printf 'L%-5d ' "$i" >> "$big_src"; done
  printf '\n' >> "$big_src"
  [ "$(wc -c < "$big_src")" -gt "$MAX_SOURCE_CHARS" ]

  > "$STUB_LOG"
  run bash "$TRANSFORM" "$big_src" "note" "big-test" "$slugs" "$tags"
  [ "$status" -ne 0 ]

  # Verify no output file was created for the big source
  # (transform.sh writes to stdout, so we check exit code)
  local err_lines
  err_lines="$(printf '%s\n' "$output" | grep -ci 'MAX_SOURCE_CHARS' || true)"
  [ "$err_lines" -gt 0 ] || {
    echo "Expected error message mentioning MAX_SOURCE_CHARS, got: $output" >&2
    false
  }

  # Check the error line mentions brain-chunk.sh
  local chunk_ref
  chunk_ref="$(printf '%s\n' "$output" | grep -i 'MAX_SOURCE_CHARS' | grep -c 'brain-chunk.sh' || true)"
  [ "$chunk_ref" -gt 0 ] || {
    echo "Error message should mention brain-chunk.sh" >&2
    false
  }
}

@test "source within the limit reaches the prompt untruncated" {
  local src="$BATS_TEST_TMPDIR/within-limit.md"
  local slugs='["test"]'
  local tags='["note"]'

  # Source with unique end-marker at the VERY END
  printf '# Within Limit\n\nSome content here.\n\nUNIQUE_END_MARKER_XYZZY\n' > "$src"

  > "$STUB_LOG"
  run bash "$TRANSFORM" "$src" "note" "within-test" "$slugs" "$tags"
  # May fail or succeed depending on stub response; we care about the prompt content
  # But we need exit 0 for the positive case
  [ "$status" -eq 0 ]

  # The stub captured the request body; check it contains our end marker
  [ -s "$STUB_LOG" ] || {
    echo "Stub did not capture any request body" >&2
    false
  }

  grep -q 'UNIQUE_END_MARKER_XYZZY' "$STUB_LOG" || {
    echo "End marker not found in prompt body — may be truncated" >&2
    false
  }

  # And the word "truncated" should NOT appear
  if grep -qi 'truncated' "$STUB_LOG"; then
    echo "Prompt body contains 'truncated' — truncation still active" >&2
    false
  fi
}
