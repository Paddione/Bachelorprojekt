#!/usr/bin/env bats

load ../unit/lib/bats-assert.bash

setup() {
  : "${ARENA_WS_URL:?need ARENA_WS_URL}"
  : "${KEYCLOAK_KORCZEWSKI:=https://auth.korczewski.de}"
}

@test "SA-12: korczewski-realm JWT accepted by arena-server" {
  TOKEN=$(curl -s -X POST "$KEYCLOAK_KORCZEWSKI/realms/workspace/protocol/openid-connect/token" \
    -d grant_type=password \
    -d client_id=arena \
    -d "username=${KORCZ_USER_USERNAME:?need KORCZ_USER_USERNAME}" \
    -d "password=${KORCZ_USER_PASSWORD:?need KORCZ_USER_PASSWORD}" \
    -d scope=openid \
    | jq -r .access_token)
  [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]

  STATUS=$(curl -s -o /tmp/sa-12.body -w '%{http_code}' \
    "$ARENA_WS_URL/lobby/active" -H "authorization: Bearer $TOKEN")

  assert_equal "$STATUS" "200"
  grep -q '"active"' /tmp/sa-12.body
}