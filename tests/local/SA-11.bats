#!/usr/bin/env bats

load ../unit/lib/bats-assert.bash

setup() {
  : "${ARENA_WS_URL:?need ARENA_WS_URL pointing at arena-server}"
  : "${KEYCLOAK_BASE:=https://auth.mentolder.de}"
}

@test "SA-11: non-admin POST /lobby/open returns 403" {
  # 1. Acquire a token for a non-admin user via password grant against the public 'arena' client.
  TOKEN=$(curl -s -X POST "$KEYCLOAK_BASE/realms/workspace/protocol/openid-connect/token" \
    -d grant_type=password \
    -d client_id=arena \
    -d "username=${TEST_USER_USERNAME:?need TEST_USER_USERNAME}" \
    -d "password=${TEST_USER_PASSWORD:?need TEST_USER_PASSWORD}" \
    -d scope=openid \
    | jq -r .access_token)
  [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]

  STATUS=$(curl -s -o /tmp/sa-11.body -w '%{http_code}' \
    -X POST "$ARENA_WS_URL/lobby/open" \
    -H "authorization: Bearer $TOKEN")

  assert_equal "$STATUS" "403"
  grep -q "arena_admin" /tmp/sa-11.body
}