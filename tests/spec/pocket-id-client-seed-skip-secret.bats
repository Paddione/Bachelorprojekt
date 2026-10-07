#!/usr/bin/env bats
# tests/spec/pocket-id-client-seed-skip-secret.bats
#
# T901061: pocket-id-client-seed: Flux postBuild rendert eval-Zeile zu $env,
# Skip "no secret configured" greift nie.
#
# Wenn fuer einen Client in ROWS kein Secret in der Umgebung definiert ist
# (bzw. leer ist), muss upsert() diesen Client ueberspringen:
#   "skip <cid> (no secret configured)"
# und darf weder PUT noch POST aufrufen.
# Wenn ein Secret gesetzt ist, muss der Client wie gewohnt verarbeitet werden.

REPO_ROOT="${REPO_ROOT:-$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)}"
MANIFEST="${REPO_ROOT}/k3d/pocket-id-client-seed.yaml"

CLIENT_V214='{"id":"%s","name":"%s","description":"","hasLogo":false,"launchURL":null,"callbackURLs":["https://x.example.test/oauth2/callback"],"logoutCallbackURLs":[],"isPublic":false,"credentials":{"secrets":[{"id":"7f3e","isActive":true}]},"isGroupRestricted":false}'
GROUPS_V214='{"data":[{"id":"2535036c-15fc-439d-811a-89805b41e19e","friendlyName":"Workspace Users","name":"workspace-users","customClaims":[],"userCount":0,"ldapId":null,"createdAt":"2026-08-23T17:18:24.820535Z"}],"pagination":{"totalPages":1,"totalItems":1,"currentPage":1,"itemsPerPage":20}}'

clients_fixture() {
  local objs="" name
  for name in $ROW_NAMES; do
    objs="${objs:+$objs,}$(printf "$1" "$name" "$name")"
  done
  printf '{"data":[%s],"pagination":{"totalPages":1,"totalItems":19,"currentPage":1,"itemsPerPage":20}}' "$objs"
}

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

@test "T901061: client without configured secret is skipped and never called via PUT or POST" {
  # NUR SECRET_docs ist gesetzt, SECRET_downloads ist ungesetzt.
  run env PATH="${STUB_DIR}:${PATH}" \
    FIXTURE_CLIENTS="$(clients_fixture "$CLIENT_V214")" FIXTURE_GROUPS="$GROUPS_V214" \
    POCKET_ID_FRONTEND_URL="https://auth.example.test" WEBSITE_NS="" \
    API="http://pocket-id:1411" POCKET_ID_API_KEY="test-key" \
    SECRET_docs="s3cret" \
    sh -ec "$(cat "${STUB_DIR}/seed.sh")"

  echo "$output"
  [ "$status" -eq 0 ]

  # downloads muss uebersprungen werden
  echo "$output" | grep -q 'skip downloads (no secret configured)'

  # Fuer downloads darf kein PUT oder POST an die Client-API erfolgt sein
  calls="$(grep -E '(PUT|POST) .*/api/oidc/clients/downloads' "$CURL_LOG" || true)"
  [ -z "$calls" ]
}

@test "T901061: client with configured secret is processed normally" {
  run env PATH="${STUB_DIR}:${PATH}" \
    FIXTURE_CLIENTS="$(clients_fixture "$CLIENT_V214")" FIXTURE_GROUPS="$GROUPS_V214" \
    POCKET_ID_FRONTEND_URL="https://auth.example.test" WEBSITE_NS="" \
    API="http://pocket-id:1411" POCKET_ID_API_KEY="test-key" \
    SECRET_docs="s3cret" \
    sh -ec "$(cat "${STUB_DIR}/seed.sh")"

  echo "$output"
  [ "$status" -eq 0 ]

  # docs hat ein Secret und muss aktualisiert werden
  echo "$output" | grep -q 'updated docs (id=docs), secret unchanged'

  # PUT fuer docs muss stattgefunden haben
  grep -q 'PUT http://pocket-id:1411/api/oidc/clients/docs' "$CURL_LOG"
}
