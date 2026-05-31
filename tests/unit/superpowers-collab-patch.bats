#!/usr/bin/env bats
# superpowers-collab-patch.bats — the collab patch is idempotent and re-appliable.

setup() {
  ROOT="${BATS_TEST_TMPDIR}/cache/x/superpowers/y/skills/brainstorming/scripts"
  mkdir -p "$ROOT"
  # minimal stand-ins carrying the anchors the patch looks for
  cp "${BATS_TEST_DIRNAME}/../../scripts/superpowers-collab/helper-collab.js" "${BATS_TEST_TMPDIR}/helper-collab.js" 2>/dev/null || true
  cat > "$ROOT/helper.js" <<'EOF'
(function(){ function sendEvent(event){ event.timestamp = Date.now(); } connect(); })();
EOF
  cat > "$ROOT/server.cjs" <<'EOF'
function handleMessage(text){ let event; event=JSON.parse(text);
  if (event.choice) {
    const eventsFile = path.join(STATE_DIR, 'events');
    fs.appendFileSync(eventsFile, JSON.stringify(event) + '\n');
  }
}
EOF
  export HOME="${BATS_TEST_TMPDIR}"   # patch driver scans $HOME/.claude/plugins/cache
  mkdir -p "${BATS_TEST_TMPDIR}/.claude/plugins"
  ln -s "${BATS_TEST_TMPDIR}/cache" "${BATS_TEST_TMPDIR}/.claude/plugins/cache"
  SCRIPT="${BATS_TEST_DIRNAME}/../../scripts/superpowers-collab-patch.sh"
}

@test "applies the collab block + who-tag + server relay" {
  run bash "$SCRIPT"
  [ "$status" -eq 0 ]
  grep -q "brainstorm-collab v1" "$ROOT/helper.js"
  grep -q "event.who" "$ROOT/helper.js"
  grep -q "broadcast(event)" "$ROOT/server.cjs"
}

@test "re-running is a no-op (idempotent)" {
  bash "$SCRIPT"
  cp "$ROOT/helper.js" "$ROOT/helper.js.1"; cp "$ROOT/server.cjs" "$ROOT/server.cjs.1"
  bash "$SCRIPT"
  diff "$ROOT/helper.js" "$ROOT/helper.js.1"
  diff "$ROOT/server.cjs" "$ROOT/server.cjs.1"
}

@test "--check exits non-zero before patching, zero after" {
  run bash "$SCRIPT" --check
  [ "$status" -ne 0 ]
  bash "$SCRIPT"
  run bash "$SCRIPT" --check
  [ "$status" -eq 0 ]
}
