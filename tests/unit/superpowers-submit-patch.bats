#!/usr/bin/env bats
# superpowers-submit-patch.bats — submit patch is idempotent, marker-guarded, anchor-safe.

setup() {
  ROOT="${BATS_TEST_TMPDIR}/cache/x/superpowers/y/skills/brainstorming/scripts"
  mkdir -p "$ROOT"
  cat > "$ROOT/helper.js" <<'EOF'
(function(){ window.brainstorm = { send: 1 }; connect(); })();
EOF
  # server.cjs stand-in carrying all four anchors verbatim.
  cat > "$ROOT/server.cjs" <<'EOF'
const http = require('http');
const PORT = 47600;
let ownerPid = process.env.BRAINSTORM_OWNER_PID ? Number(process.env.BRAINSTORM_OWNER_PID) : null;
function handleRequest(req, res) {
    if (html.includes('</body>')) {
      html = html.replace('</body>', helperInjection + '\n</body>');
    } else {
      html += helperInjection;
    }
}
function startServer() {
  if (!fs.existsSync(CONTENT_DIR)) fs.mkdirSync(CONTENT_DIR, { recursive: true });
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
      if (!knownFiles.has(filename)) {
        knownFiles.add(filename);
        const eventsFile = path.join(STATE_DIR, 'events');
        if (fs.existsSync(eventsFile)) fs.unlinkSync(eventsFile);
        console.log('screen-added');
      }
}
EOF
  export HOME="${BATS_TEST_TMPDIR}"
  mkdir -p "${BATS_TEST_TMPDIR}/.claude/plugins"
  ln -s "${BATS_TEST_TMPDIR}/cache" "${BATS_TEST_TMPDIR}/.claude/plugins/cache"
  SCRIPT="${BATS_TEST_DIRNAME}/../../scripts/superpowers-submit-patch.sh"
}

@test "applies helper block + server submit listener" {
  run bash "$SCRIPT"
  [ "$status" -eq 0 ]
  grep -q "brainstorm-submit v1" "$ROOT/helper.js"
  grep -q "__brainstormSubmit" "$ROOT/helper.js"
  grep -qF "/* brainstorm-submit-server v1 */" "$ROOT/server.cjs"
  grep -q "startSubmitListener" "$ROOT/server.cjs"
  grep -q "127.0.0.1" "$ROOT/server.cjs"
  grep -q "__BRAINSTORM_SUBMIT_PORT" "$ROOT/server.cjs"
  grep -q "submission.json" "$ROOT/server.cjs"
}

@test "re-running is a no-op (idempotent)" {
  bash "$SCRIPT"
  cp "$ROOT/helper.js" "$ROOT/helper.js.1"; cp "$ROOT/server.cjs" "$ROOT/server.cjs.1"
  bash "$SCRIPT"
  diff "$ROOT/helper.js" "$ROOT/helper.js.1"
  diff "$ROOT/server.cjs" "$ROOT/server.cjs.1"
}

@test "--check exits non-zero before patch, zero after" {
  run bash "$SCRIPT" --check
  [ "$status" -eq 1 ]
  bash "$SCRIPT"
  run bash "$SCRIPT" --check
  [ "$status" -eq 0 ]
}

@test "aborts (exit 2) when a server anchor is missing/duplicated" {
  echo "// drifted: no anchors here" > "$ROOT/server.cjs"
  run bash "$SCRIPT"
  [ "$status" -eq 2 ]
}
