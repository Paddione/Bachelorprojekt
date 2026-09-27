# tests/spec/agent-bench/recorder.bats — Trace-Proxy (p2): Secrets,
# Bild-Ablage und Rollen-Zuordnung.
# Szenarien: Secret is redacted in the trace · Image is stored by content
# hash · Recorder attributes requests to its role.

setup() {
  source "$BATS_TEST_DIRNAME/fixtures/helpers.bash"
  T="$(mktemp -d "$BATS_TMPDIR/recorder-XXXXXX")"
}

teardown() {
  stop_fake
  rm -rf "$T"
}

@test "Secret is redacted in the trace" {
  start_fake
  local secret="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  cat > "$T/req.json" <<EOF
{"model": "fake", "messages": [{"role": "user", "content": "mein Token $secret bitte nutzen"}]}
EOF
  run node "$FIX/drive-recorder.mjs" "$FAKE_URL" code-worker "$T/trace.jsonl" "$T/images" "$T/req.json"
  [ "$status" -eq 0 ]
  [ -f "$T/trace.jsonl" ]
  grep -q 'REDACTED:github-token' "$T/trace.jsonl"
  leftover="$(grep -c "$secret" "$T/trace.jsonl" || true)"
  [ "$leftover" = "0" ]
}

@test "Image is stored by content hash" {
  start_fake
  node -e "require('fs').writeFileSync('$T/pixel.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64'))"
  local b64
  b64="$(base64 -w0 "$T/pixel.png")"
  local sha
  sha="$(sha256sum "$T/pixel.png" | cut -d' ' -f1)"
  cat > "$T/req.json" <<EOF
{"model": "fake", "messages": [{"role": "user", "content": [{"type": "text", "text": "was ist das?"}, {"type": "image_url", "image_url": {"url": "data:image/png;base64,$b64"}}]}]}
EOF
  run node "$FIX/drive-recorder.mjs" "$FAKE_URL" vision-worker "$T/trace.jsonl" "$T/images" "$T/req.json"
  [ "$status" -eq 0 ]
  # Positiv-Anker: Bild liegt unter dem Content-Hash, Trace referenziert ihn.
  [ -f "$T/images/$sha.png" ]
  grep -q "$sha" "$T/trace.jsonl"
  grep -q 'image_ref' "$T/trace.jsonl"
  # Kein Inline-Base64 mehr im Trace.
  leftover="$(grep -c "$b64" "$T/trace.jsonl" || true)"
  [ "$leftover" = "0" ]
}

@test "Recorder attributes requests to its role" {
  start_fake
  echo '{"model": "fake", "messages": [{"role": "user", "content": "hallo"}]}' > "$T/req.json"
  run node "$FIX/drive-recorder.mjs" "$FAKE_URL" planner "$T/a.jsonl" "$T/ia" "$T/req.json"
  [ "$status" -eq 0 ]
  run node "$FIX/drive-recorder.mjs" "$FAKE_URL" reviewer "$T/b.jsonl" "$T/ib" "$T/req.json"
  [ "$status" -eq 0 ]
  grep -q '"role":"planner"' "$T/a.jsonl"
  grep -q '"role":"reviewer"' "$T/b.jsonl"
  foreign="$(grep -c '"role":"reviewer"' "$T/a.jsonl" || true)"
  [ "$foreign" = "0" ]
}
