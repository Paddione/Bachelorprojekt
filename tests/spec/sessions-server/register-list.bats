#!/usr/bin/env bats
# tests/spec/sessions-server/register-list.bats
# SSOT: openspec/specs/sessions-server.md — Session Registration, Session
# Listing, Idempotent Re-Registration. Prüfmodus: command output verification.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  HUB="bash ${REPO_ROOT}/scripts/session-hub.sh"
  TMP_DIR="$(mktemp -d)"
  export SESSION_HUB_REGISTRY="${TMP_DIR}/active-sessions.json"
  export SESSION_HUB_DOMAIN="sessions.example.test"
  export SESSION_HUB_NO_TUNNEL=1
}

teardown() { rm -rf "${TMP_DIR:-}"; }

@test "register schreibt Eintrag in leere Registry und leitet public_url ab" {
  run $HUB register --name foo --port 18080 --type brainstorm --title "Foo Board"
  [ "$status" -eq 0 ]
  [ "$(jq 'length' "$SESSION_HUB_REGISTRY")" -eq 1 ]
  [ "$(jq -r '.[0].slug' "$SESSION_HUB_REGISTRY")" = "foo" ]
  [ "$(jq -r '.[0].public_url' "$SESSION_HUB_REGISTRY")" = "https://session-foo.sessions.example.test" ]
}

@test "list gibt die volle Registry als JSON aus" {
  $HUB register --name bar --port 18081 --type form --title "Bar" >/dev/null
  run $HUB list
  [ "$status" -eq 0 ]
  [ "$(printf '%s' "$output" | jq -r '.[] | select(.slug=="bar") | .title')" = "Bar" ]
}

@test "doppelte Registrierung ersetzt den bestehenden Eintrag (idempotent pro Slug)" {
  $HUB register --name dup --port 1 --type form --title v1 >/dev/null
  run $HUB register --name dup --port 2 --type form --title v2
  [ "$status" -eq 0 ]
  [ "$(jq 'length' "$SESSION_HUB_REGISTRY")" -eq 1 ]
  [ "$(jq -r '.[0].port' "$SESSION_HUB_REGISTRY")" = "2" ]
}

@test "register ohne Pflichtargumente scheitert mit Exit 2" {
  run $HUB register --name onlyname
  [ "$status" -eq 2 ]
}
