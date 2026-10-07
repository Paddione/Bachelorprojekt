#!/usr/bin/env bats
# tests/spec/pocket-id-client-seed-group-lookup.bats
#
# T900804: find_group_id()/find_client_id() in pocket-id-client-seed.yaml
# matched `"id":"…","name":"<name>"` as ADJACENT fields. Pocket ID v2.14.0
# returns user groups as {"id":…,"friendlyName":…,"name":…} -- the existing
# `workspace-users` group was never found, ensure_group() POSTed it again,
# Pocket ID answered 409 and `set -e` killed the Job (flux-staging stalled
# since 2026-09-28; captured live via a diag copy of the Job).
#
# These tests run the REAL seed script (extracted from the manifest) against
# a curl stub that emulates Pocket ID: GET returns the fixtures, PUT succeeds,
# every POST answers 409 like a duplicate create does live.
#
# Run: tests/unit/lib/bats-core/bin/bats tests/spec/pocket-id-client-seed-group-lookup.bats
# or:  task test:unit SPEC=pocket-id-client-seed-group-lookup

REPO_ROOT="${REPO_ROOT:-$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)}"
MANIFEST="${REPO_ROOT}/k3d/pocket-id-client-seed.yaml"

# Live shapes from fleet/workspace-staging, pocket-id v2.14.0 (2026-10-05).
# The seed upserts EVERY row of ROWS (Flux turns `\$$env` into `\$env`, so
# the "no secret configured" skip never fires live) -- the client fixtures are
# therefore generated for all row names, in a given field order.
clients_fixture() { # $1 = object template with %s for the client name
  local objs="" name
  for name in $ROW_NAMES; do
    objs="${objs:+$objs,}$(printf "$1" "$name" "$name")"
  done
  printf '{"data":[%s],"pagination":{"totalPages":1,"totalItems":19,"currentPage":1,"itemsPerPage":20}}' "$objs"
}
# v2.14.0: id, name adjacent, nested credentials object after both.
CLIENT_V214='{"id":"%s","name":"%s","description":"","hasLogo":false,"launchURL":null,"callbackURLs":["https://x.example.test/oauth2/callback"],"logoutCallbackURLs":[],"isPublic":false,"credentials":{"secrets":[{"id":"7f3e","prefix":"","createdAt":"2026-08-23T17:20:42Z","expiresAt":null,"isActive":true}]},"isGroupRestricted":false}'
# "name" NOT directly after "id" (robustness, find_client_id).
CLIENT_REORDERED='{"id":"%s","description":"","hasLogo":false,"name":"%s","callbackURLs":[],"credentials":{"secrets":[{"id":"7f3e","isActive":true}]}}'
GROUPS_V214='{"data":[{"id":"2535036c-15fc-439d-811a-89805b41e19e","friendlyName":"Workspace Users","name":"workspace-users","customClaims":[],"userCount":0,"ldapId":null,"createdAt":"2026-08-23T17:18:24.820535Z"},{"id":"7a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9","friendlyName":"Workspace Owners","name":"workspace-owners","customClaims":[],"userCount":0,"ldapId":null,"createdAt":"2026-10-07T00:00:00Z"}],"pagination":{"totalPages":1,"totalItems":2,"currentPage":1,"itemsPerPage":20}}'
# Pre-v2.14 order (id directly followed by name) must keep working.
GROUPS_LEGACY='{"data":[{"id":"g-legacy","name":"workspace-users","friendlyName":"Workspace Users"},{"id":"g-legacy-owners","name":"workspace-owners","friendlyName":"Workspace Owners"}],"pagination":{"totalPages":1,"totalItems":2,"currentPage":1,"itemsPerPage":20}}'

setup() {
  load 'test_helper'
  STUB_DIR="$(mktemp -d)"
  export CURL_LOG="${STUB_DIR}/curl.log"
  : > "$CURL_LOG"

  # Seed script = everything from the SCHEME line to "seed complete",
  # de-indented; `$$` is the Flux postBuild escape for a literal `$`.
  awk '/SCHEME="\$\{POCKET_ID_FRONTEND_URL%%:\/\/\*\}"/{on=1} on{print} /echo "seed complete"/{exit}' "$MANIFEST" \
    | sed -e 's/^              //' -e 's/\$\$/$/g' > "${STUB_DIR}/seed.sh"
  [ -s "${STUB_DIR}/seed.sh" ]
  ROW_NAMES="$(sed -n '/^ROWS="/,/^"/p' "${STUB_DIR}/seed.sh" | grep '|' | cut -d'|' -f1)"
  [ -n "$ROW_NAMES" ]

  cat > "${STUB_DIR}/curl" <<'STUB'
#!/usr/bin/env bash
method=GET; url=""; wcode=0
while [ $# -gt 0 ]; do
  case "$1" in
    -X) method="$2"; shift ;;
    -w) wcode=1; shift ;;
    -H|-d|-o|--retry|--retry-delay|--connect-timeout|--cacert) shift ;;
    http*) url="$1" ;;
  esac
  shift
done
echo "$method $url" >> "$CURL_LOG"
case "$method $url" in
  "GET "*/api/oidc/clients*)
    if [ "$wcode" = 1 ]; then printf 200; exit 0; fi
    printf '%s' "$FIXTURE_CLIENTS" ;;
  "PUT "*/api/oidc/clients/*) printf '{}' ;;
  "GET "*/api/user-groups*) printf '%s' "$FIXTURE_GROUPS" ;;
  "POST "*) echo "curl: (22) The requested URL returned error: 409" >&2; exit 22 ;;
  *) echo "stub: unexpected $method $url" >&2; exit 99 ;;
esac
STUB
  chmod +x "${STUB_DIR}/curl"
}

teardown() {
  rm -rf "$STUB_DIR"
}

run_seed() {
  run env PATH="${STUB_DIR}:${PATH}" \
    FIXTURE_CLIENTS="$1" FIXTURE_GROUPS="$2" \
    POCKET_ID_FRONTEND_URL="https://auth.example.test" WEBSITE_NS="" \
    API="http://pocket-id:1411" POCKET_ID_API_KEY="test-key" SECRET_docs="s3cret" \
    sh -ec "$(cat "${STUB_DIR}/seed.sh")"
}

@test "T900804: existing group is found with pocket-id v2.14.0 field order (id, friendlyName, name)" {
  run_seed "$(clients_fixture "$CLIENT_V214")" "$GROUPS_V214"
  echo "$output"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'group workspace-users exists (id=2535036c-15fc-439d-811a-89805b41e19e)'
  posts="$(grep '^POST ' "$CURL_LOG" || true)"; [ -z "$posts" ]
}

@test "T900804: existing client is found when name does not directly follow id" {
  run_seed "$(clients_fixture "$CLIENT_REORDERED")" "$GROUPS_LEGACY"
  echo "$output"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'updated docs (id=docs), secret unchanged'
  posts="$(grep '^POST ' "$CURL_LOG" || true)"; [ -z "$posts" ]
}

@test "T900804: legacy field order (name directly after id) still resolves group and client" {
  run_seed "$(clients_fixture "$CLIENT_V214")" "$GROUPS_LEGACY"
  echo "$output"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'updated docs (id=docs), secret unchanged'
  echo "$output" | grep -q 'group workspace-users exists (id=g-legacy)'
  posts="$(grep '^POST ' "$CURL_LOG" || true)"; [ -z "$posts" ]
}
