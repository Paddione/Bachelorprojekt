#!/usr/bin/env bats
# tests/spec/sdlc-cockpit/write-token-removed.bats
# K4 (T002463): Der browser-seitige Zugriff auf die Daemon-Schreib-Stubs ist
# entfernt — agentAction und getToken existieren im Adapter nicht mehr.
# SSOT: openspec/changes/cockpit-auth-schnitt/specs/sdlc-cockpit.md

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  ADAPTER_FILE="$REPO/.lavish/kit/adapter.js"
  DUMP_JS="$BATS_TEST_TMPDIR/dump-api.cjs"
  cat > "$DUMP_JS" <<'EOF'
const fs = require('node:fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const noop = () => {};
const win = {};
const document = { addEventListener: noop, hidden: false };
const location = { protocol: 'file:', port: '39152' };
const fetch = async () => ({ ok: true, json: async () => ({}) });
global.window = win;
global.document = document;
global.location = location;
global.fetch = fetch;
global.EventSource = function () {};
// eslint-disable-next-line no-new-func
new Function('window', 'document', 'location', 'fetch', 'EventSource', src)(win, document, location, fetch, EventSource);
console.log('ticketAction=' + typeof win.data.ticketAction);
console.log('agentAction=' + typeof win.data.agentAction);
console.log('getToken=' + typeof win.data.getToken);
EOF
}

@test "K4 POSITIV-ANCHOR: ticketAction ist eine Funktion" {
  run node "$DUMP_JS" "$ADAPTER_FILE"
  echo "$output" | grep '^ticketAction=' | grep -c 'function' | grep -q '^1$'
}

@test "K4 agentAction ist entfernt (undefined)" {
  run node "$DUMP_JS" "$ADAPTER_FILE"
  echo "$output" | grep '^agentAction=' | grep -c 'undefined' | grep -q '^1$'
}

@test "K4 getToken ist entfernt (undefined)" {
  run node "$DUMP_JS" "$ADAPTER_FILE"
  echo "$output" | grep '^getToken=' | grep -c 'undefined' | grep -q '^1$'
}
