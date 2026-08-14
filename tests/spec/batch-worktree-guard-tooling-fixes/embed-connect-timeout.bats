#!/usr/bin/env bats

# PRUEFMODUS: Output-Verifikation
# Fix: T003988 (p4)

setup() {
  REPO="$(pwd)"
  BATS_TMPDIR=$(mktemp -d)
  
  # Create dummy openspec repo
  OPENSPEC_EMBED_REPO="$BATS_TMPDIR/openspec_repo"
  mkdir -p "$OPENSPEC_EMBED_REPO/openspec/changes/demo-slug"
  touch "$OPENSPEC_EMBED_REPO/openspec/changes/demo-slug/proposal.md"
  
  cd "$OPENSPEC_EMBED_REPO"
  git init -b main
  git config user.email "test@example.com"
  git config user.name "Test User"
  git add openspec/changes/demo-slug/proposal.md
  git commit -m "chore: init openspec"
  
  export OPENSPEC_EMBED_REPO="$OPENSPEC_EMBED_REPO"
}

teardown() {
  rm -rf "$BATS_TMPDIR"
}

@test "Test 1: connection error -> status == 0 + output contains best-effort failure" {
  # Port 1 is almost certainly closed
  URL="postgres://x:x@127.0.0.1:1/db"
  
  run env SESSIONS_DATABASE_URL="$URL" OPENSPEC_EMBED_REPO="$OPENSPEC_EMBED_REPO" \
    node "$REPO/scripts/openspec-embed.mjs" --slug demo-slug
  
  [ "$status" == 0 ]
  [[ "$output" =~ "best-effort failure" ]]
}

@test "Test 2: connection timeout -> status == 0 + output contains best-effort failure" {
  # Start a silent TCP server on a random port
  PORT_FILE="$BATS_TMPDIR/port"

  # Node script to listen on port 0 and write port to file.
  # .cjs-Erweiterung: .mjs wuerde als ES-Module geparst und `require` ist dort
  # undefiniert — der Server kaeme nie zum listen und die Warteschleife haengte.
  cat <<'NODE' > "$BATS_TMPDIR/server.cjs"
const net = require('net');
const fs = require('fs');
const server = net.createServer(() => {});
server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  fs.writeFileSync(process.argv[2], port.toString());
  console.log('listening on ' + port);
});
process.on('SIGINT', () => server.close());
NODE

  node "$BATS_TMPDIR/server.cjs" "$PORT_FILE" &
  SERVER_PID=$!

  # Wait for server to actually be listening (mit Timeout-Guard, damit ein
  # Server-Crash den Test nicht ewig haengen laesst)
  for _i in $(seq 1 50); do
    [ -f "$PORT_FILE" ] && break
    sleep 0.1
  done
  [ -f "$PORT_FILE" ] || { kill $SERVER_PID 2>/dev/null || true; echo "FAIL: Server kam nie zum listen" >&2; return 1; }

  PORT=$(cat "$PORT_FILE")
  URL="postgres://x:x@127.0.0.1:$PORT/db"

  start=$(date +%s)
  # Use timeout to prevent hanging indefinitely in case of failure
  run timeout 15 env SESSIONS_DATABASE_URL="$URL" OPENSPEC_EMBED_REPO="$OPENSPEC_EMBED_REPO" \
    node "$REPO/scripts/openspec-embed.mjs" --slug demo-slug
  end=$(date +%s)

  # Teardown server
  kill $SERVER_PID 2>/dev/null || true

  [ "$status" == 0 ]
  # Elapsed should be around 10s (the timeout)
  [ $((end - start)) -lt 15 ]
  [[ "$output" =~ "best-effort failure" ]]
}
