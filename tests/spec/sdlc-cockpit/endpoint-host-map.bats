#!/usr/bin/env bats
# tests/spec/sdlc-cockpit/endpoint-host-map.bats
# Misst die Endpunkt-Karte aus K4 (T002463) IM LAUF, nicht im Quelltext: ein
# node-Aufruf laedt adapter.js mit document/window/fetch-Attrappe und gibt fuer
# jeden Schluessel eine Zeile "<key> <host-oder-unavailable>" aus.
# SSOT: openspec/changes/cockpit-auth-schnitt/specs/sdlc-cockpit.md

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  ADAPTER_FILE="$REPO/.lavish/kit/adapter.js"
  DUMP_JS="$BATS_TEST_TMPDIR/dump-map.cjs"
  cat > "$DUMP_JS" <<'EOF'
const fs = require('node:fs');
const path = require('node:path');
const adapterPath = process.argv[2];
const src = fs.readFileSync(adapterPath, 'utf8');

const noop = () => {};
const win = {};
const document = { addEventListener: noop, hidden: false };
const location = { protocol: 'http:', port: '' }; // Admin-Kontext (eigene Origin)
const fetch = async () => ({ ok: true, json: async () => ({}) });
global.window = win;
global.document = document;
global.location = location;
global.fetch = fetch;
global.EventSource = function () {};

// eslint-disable-next-line no-new-func
new Function('window', 'document', 'location', 'fetch', 'EventSource', src)(win, document, location, fetch, EventSource);

const keys = ['portfolio', 'pods-list', 'factory-control', 'ticket-status', 'audit',
  'epics', 'styles', 'ci', 'agents', 'models'];
for (const key of keys) {
  const r = win.data.resolveEndpoint(key);
  if (!r.available) {
    console.log(`${key} unavailable`);
  } else {
    console.log(`${key} ${r.host}`);
  }
}
EOF
}

@test "K4 portfolio loest im Admin-Kontext auf die eigene Origin auf" {
  run node "$DUMP_JS" "$ADAPTER_FILE"
  echo "$output" | grep '^portfolio ' | grep -c '^portfolio $' | grep -q '^1$'
}

@test "K4 agents und models melden im Admin-Kontext nicht verfuegbar" {
  run node "$DUMP_JS" "$ADAPTER_FILE"
  echo "$output" | grep '^agents ' | grep -c 'unavailable' | grep -q '^1$'
  echo "$output" | grep '^models ' | grep -c 'unavailable' | grep -q '^1$'
}

@test "K4 website-gestuetzte Endpunkte sind im Admin-Kontext verfuegbar" {
  run node "$DUMP_JS" "$ADAPTER_FILE"
  for key in portfolio pods-list factory-control ticket-status audit; do
    echo "$output" | grep "^${key} " | grep -c 'unavailable' | grep -q '^0$' || {
      echo "$key sollte im Admin-Kontext verfuegbar sein"
      return 1
    }
  done
}
