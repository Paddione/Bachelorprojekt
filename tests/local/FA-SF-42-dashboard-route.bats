#!/usr/bin/env bats
# FA-SF-42: /api/factory-metrics enforces the getSession+isAdmin 401 gate.
setup() { load 'test_helper.bash'; }

ROUTE="${BATS_TEST_DIRNAME}/../../website/src/pages/api/factory-metrics.ts"

@test "FA-SF-42: route exists and is server-rendered" {
  [ -f "$ROUTE" ]
  grep -q 'export const prerender = false' "$ROUTE"
}

@test "FA-SF-42: gate returns 401 when session is absent or non-admin" {
  grep -q "getSession(request.headers.get('cookie'))" "$ROUTE"
  grep -q '!session || !isAdmin(session)' "$ROUTE"
  grep -q 'status: 401' "$ROUTE"
}

@test "FA-SF-42: brand is resolved per-pod, never hardcoded" {
  grep -q "process.env.BRAND_ID ?? process.env.BRAND" "$ROUTE"
}

@test "FA-SF-42: live preview rejects an unauthenticated request" {
  [ -n "${WEBSITE_BASE_URL:-}" ] || skip "no WEBSITE_BASE_URL preview target"
  run curl -s -o /dev/null -w '%{http_code}' "${WEBSITE_BASE_URL}/api/factory-metrics"
  [ "$status" -eq 0 ]
  [ "$output" = "401" ]
}
