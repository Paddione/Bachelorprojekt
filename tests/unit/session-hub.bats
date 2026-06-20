#!/usr/bin/env bats
setup() {
  export SESSION_HUB_REGISTRY="$BATS_TEST_TMPDIR/active-sessions.json"
  export SESSION_HUB_NO_TUNNEL=1
  export SESSION_HUB_DOMAIN="sessions.example.test"
  SCRIPT="$BATS_TEST_DIRNAME/../../scripts/session-hub.sh"
}

@test "register adds a session to an empty registry" {
  run bash "$SCRIPT" register --name foo --port 18080 --type brainstorm --title "Foo Board"
  [ "$status" -eq 0 ]
  run jq -r '.[0].slug' "$SESSION_HUB_REGISTRY"
  [ "$output" = "foo" ]
  run jq -r '.[0].public_url' "$SESSION_HUB_REGISTRY"
  [ "$output" = "https://session-foo.sessions.example.test" ]
}

@test "list prints the registry JSON" {
  bash "$SCRIPT" register --name bar --port 18081 --type form --title "Bar"
  run bash "$SCRIPT" list
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.[] | select(.slug=="bar")'
}

@test "deregister removes a session by name" {
  bash "$SCRIPT" register --name baz --port 18082 --type form --title "Baz"
  run bash "$SCRIPT" deregister --name baz
  [ "$status" -eq 0 ]
  run jq -r 'length' "$SESSION_HUB_REGISTRY"
  [ "$output" = "0" ]
}

@test "reap drops entries whose pids are dead" {
  bash "$SCRIPT" register --name dead --port 18083 --type form --title "Dead"
  jq '(.[0].tunnel_pid)=999999 | (.[0].server_pid)=999999' "$SESSION_HUB_REGISTRY" > "$SESSION_HUB_REGISTRY.t" && mv "$SESSION_HUB_REGISTRY.t" "$SESSION_HUB_REGISTRY"
  run bash "$SCRIPT" reap
  [ "$status" -eq 0 ]
  run jq -r 'length' "$SESSION_HUB_REGISTRY"
  [ "$output" = "0" ]
}

@test "register is idempotent on slug (replaces, no duplicate)" {
  bash "$SCRIPT" register --name dup --port 1 --type form --title "v1"
  bash "$SCRIPT" register --name dup --port 2 --type form --title "v2"
  run jq -r '[.[] | select(.slug=="dup")] | length' "$SESSION_HUB_REGISTRY"
  [ "$output" = "1" ]
  run jq -r '.[] | select(.slug=="dup") | .port' "$SESSION_HUB_REGISTRY"
  [ "$output" = "2" ]
}

@test "start-form --ticket-id stores ticket_id in registry and injects placeholder" {
  local tmphtml="$BATS_TEST_TMPDIR/form.html"
  printf '<html><body data-ticket-id="__SESSION_TICKET_ID__">test</body></html>' > "$tmphtml"
  run bash "$SCRIPT" start-form --file "$tmphtml" --name tkform --ticket-id T000123
  [ "$status" -eq 0 ]
  run jq -r '.[] | select(.slug=="tkform") | .ticket_id' "$SESSION_HUB_REGISTRY"
  [ "$output" = "T000123" ]
}

@test "start-form stores source_file path in registry" {
  local tmphtml="$BATS_TEST_TMPDIR/srcform.html"
  printf '<html><body>no placeholders</body></html>' > "$tmphtml"
  run bash "$SCRIPT" start-form --file "$tmphtml" --name srcform
  [ "$status" -eq 0 ]
  run jq -r '.[] | select(.slug=="srcform") | .source_file' "$SESSION_HUB_REGISTRY"
  [ "$output" = "$tmphtml" ]
}

@test "regen re-uploads from stored source_file" {
  local tmphtml="$BATS_TEST_TMPDIR/regenform.html"
  printf '<html><body data-ticket-id="__SESSION_TICKET_ID__">v1</body></html>' > "$tmphtml"
  bash "$SCRIPT" start-form --file "$tmphtml" --name regentest --ticket-id T000999
  run bash "$SCRIPT" regen --name regentest
  [ "$status" -eq 0 ]
  [[ "$output" == *"done"* ]]
}

@test "regen fails when source_file is missing" {
  bash "$SCRIPT" register --name noregen --port 19999 --type form --title "no src"
  run bash "$SCRIPT" regen --name noregen
  [ "$status" -ne 0 ]
}
