#!/usr/bin/env bats
# tests/dev-stack/dev-tls.bats
# Smoke test: dev website is reachable over TLS and the SSO gate
# redirects unauthenticated GETs to auth.${PROD_DOMAIN}.

setup() {
  : "${RUN_DEV_TESTS:?Gated tests — set RUN_DEV_TESTS=true to run}"
  DEV_WEBSITE_HOST="${DEV_WEBSITE_HOST:-web.dev.mentolder.de}"
  AUTH_HOST="${AUTH_HOST:-auth.mentolder.de}"
}

@test "dev-tls.1: GET https://\$DEV_WEBSITE_HOST returns a valid TLS response" {
  run curl -sIo /dev/null -w "%{http_code}\n" "https://$DEV_WEBSITE_HOST"
  [ "$status" -eq 0 ]
  case "$output" in
    200|301|302|307) ;;
    *) echo "Expected 2xx/3xx, got: $output"; return 1 ;;
  esac
}

@test "dev-tls.2: anonymous GET redirects to auth.\$PROD_DOMAIN" {
  run curl -sI -L --max-redirs 2 "https://$DEV_WEBSITE_HOST"
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi "location:.*$AUTH_HOST" || {
    echo "Expected redirect to $AUTH_HOST; got:"
    echo "$output"
    return 1
  }
}

@test "dev-tls.3: server cert is valid (not self-signed)" {
  run bash -c "echo | openssl s_client -servername $DEV_WEBSITE_HOST -connect $DEV_WEBSITE_HOST:443 -verify_return_error </dev/null 2>&1 | grep -q 'Verify return code: 0'"
  [ "$status" -eq 0 ]
}
