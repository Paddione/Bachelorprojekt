#!/usr/bin/env bats
# tests/dev-stack/dev-sso.bats
# End-to-end SSO check via Direct Access Grants on a separate test
# client (workspace-dev-test) with a test user in /dev-access.
# A valid Bearer token must be accepted by oauth2-proxy-dev's
# --pass-authorization-header path, reaching the website upstream.

setup() {
  : "${RUN_DEV_TESTS:?Gated tests — set RUN_DEV_TESTS=true to run}"
  : "${KC_TEST_USER:?KC_TEST_USER required}"
  : "${KC_TEST_PASSWORD:?KC_TEST_PASSWORD required}"
  KC_TEST_CLIENT_ID="${KC_TEST_CLIENT_ID:-workspace-dev-test}"
  : "${KC_TEST_CLIENT_SECRET:?KC_TEST_CLIENT_SECRET required}"
  AUTH="${AUTH_HOST:-auth.mentolder.de}"
  DEV="${DEV_WEBSITE_HOST:-web.dev.mentolder.de}"
}

@test "dev-sso.1: Direct Access Grant returns an access token" {
  run curl -sS -X POST "https://$AUTH/realms/workspace/protocol/openid-connect/token" \
    -d "client_id=$KC_TEST_CLIENT_ID" \
    -d "client_secret=$KC_TEST_CLIENT_SECRET" \
    -d "grant_type=password" \
    -d "username=$KC_TEST_USER" \
    -d "password=$KC_TEST_PASSWORD"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '"access_token"' || {
    echo "$output"
    return 1
  }
}

@test "dev-sso.2: Bearer-authenticated request reaches the website upstream" {
  TOKEN=$(curl -sS -X POST "https://$AUTH/realms/workspace/protocol/openid-connect/token" \
    -d "client_id=$KC_TEST_CLIENT_ID" \
    -d "client_secret=$KC_TEST_CLIENT_SECRET" \
    -d "grant_type=password" \
    -d "username=$KC_TEST_USER" \
    -d "password=$KC_TEST_PASSWORD" | jq -r .access_token)
  [ -n "$TOKEN" ]

  run curl -sIo /dev/null -w "%{http_code}\n" \
    -H "Authorization: Bearer $TOKEN" \
    "https://$DEV/api/health"
  [ "$status" -eq 0 ]
  [[ "$output" == "200" ]] || {
    echo "Expected 200 (auth passed → website upstream), got: $output"
    return 1
  }
}
