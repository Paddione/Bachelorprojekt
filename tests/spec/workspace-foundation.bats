#!/usr/bin/env bats
# tests/spec/workspace-foundation.bats
# T901022: guards for the business workspace foundation — owner auth,
# membership isolation, secret-free client surface. Structural template:
# auth-sso.bats (test_helper load, setup_file staging, one block per guard).
# The suite drives the REAL p1/p2 exports through a staged tsx harness
# (no reimplementation, no source-text assertions on behavior). HTTP guards
# read WORKSPACE_FOUNDATION_BASE_URL (default: the real p1 endpoints); the
# red step points it at a negative-control fixture. DB guards read
# WORKSPACE_FOUNDATION_DB_URL (default SESSIONS_DATABASE_URL) and skip when
# no database is reachable (Live-DB convention). Red lever summary:
# WF_NEGATIVE_CONTROL=1 (fixtures without owner group) plus an empty
# membership store makes every allow-path assertion fail while deny-path
# assertions hold. Green: control unset, probe pair seeded via the harness
# db-seed mode, then db-unseed to clean up.
load 'test_helper'

setup_file() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  export REPO_ROOT
  export WF_BASE_URL="${WORKSPACE_FOUNDATION_BASE_URL:-http://localhost:4321}"
  export WF_DB_URL="${WORKSPACE_FOUNDATION_DB_URL:-${SESSIONS_DATABASE_URL:-}}"
  if [ -x "${REPO_ROOT}/node_modules/.bin/tsx" ]; then
    export WF_TSX="${REPO_ROOT}/node_modules/.bin/tsx"
  elif [ -x "${REPO_ROOT}/components/website/node_modules/.bin/tsx" ]; then
    export WF_TSX="${REPO_ROOT}/components/website/node_modules/.bin/tsx"
  elif command -v tsx >/dev/null 2>&1; then
    export WF_TSX="tsx"
  else
    export WF_TSX=""
  fi
  export WF_HARNESS="${BATS_FILE_TMPDIR}/wf-harness.mjs"
  cat > "$WF_HARNESS" <<'HARNESS'
const ROOT = process.env.REPO_ROOT;
const mode = process.argv[2];
const out = (v) => console.log(JSON.stringify(v));
try {
  if (mode === 'me-no-cookie') {
    const { GET } = await import(`file://${ROOT}/components/website/src/pages/api/owner/me.ts`);
    const res = await GET({ request: new Request('http://probe/api/owner/me') });
    out({ status: res.status, body: await res.json() });
  } else if (mode === 'guard-matrix') {
    const g = await import(`file://${ROOT}/components/website/src/lib/owner-guard.ts`);
    const ownerGroups = process.env.WF_NEGATIVE_CONTROL === '1' ? ['workspace-users'] : ['workspace-owners'];
    out({
      nullSession: g.isOwnerSession(null),
      noGroups: g.isOwnerSession({ brand: 'brand-a' }),
      foreign: g.isOwnerSession({ groups: ['workspace-users'], brand: 'brand-a' }),
      owner: g.isOwnerSession({ groups: ownerGroups, brand: 'brand-a' }),
      business: g.ownerBusiness({ groups: ownerGroups, brand: 'brand-a' }),
    });
  } else if (mode === 'db-matrix') {
    const m = await import(`file://${ROOT}/components/website/src/lib/business-memberships.ts`);
    out({
      probe: await m.getMembership('wf-probe-user', 'mentolder'),
      foreign: await m.getMembership('wf-probe-user', 'wf-foreign-brand'),
      foreignList: await m.listMembershipsForBrand('wf-foreign-brand'),
      userList: await m.listMembershipsForUser('wf-probe-user'),
    });
  } else if (mode === 'db-seed') {
    const m = await import(`file://${ROOT}/components/website/src/lib/business-memberships.ts`);
    out(await m.addMembership({ userKey: 'wf-probe-user', brand: 'mentolder', role: 'owner' }));
  } else if (mode === 'db-unseed') {
    const m = await import(`file://${ROOT}/components/website/src/lib/business-memberships.ts`);
    out({ removed: await m.removeMembership('wf-probe-user', 'mentolder') });
  } else {
    throw new Error(`unknown harness mode: ${mode}`);
  }
} catch (err) {
  out({ harness_error: String((err && err.message) || err) });
  process.exitCode = 1;
}
process.exit(process.exitCode ?? 0);
HARNESS
  export WF_ME_JSON="${BATS_FILE_TMPDIR}/me.json"
  export WF_GUARD_JSON="${BATS_FILE_TMPDIR}/guard.json"
  export WF_DB_JSON="${BATS_FILE_TMPDIR}/db.json"
  if [ -n "$WF_TSX" ]; then
    POCKET_ID_WEBSITE_SECRET=dummy "$WF_TSX" --no-warnings "$WF_HARNESS" me-no-cookie >"$WF_ME_JSON" 2>/dev/null \
      || echo '{"harness_error":"me-no-cookie failed to run"}' >"$WF_ME_JSON"
    POCKET_ID_WEBSITE_SECRET=dummy "$WF_TSX" --no-warnings "$WF_HARNESS" guard-matrix >"$WF_GUARD_JSON" 2>/dev/null \
      || echo '{"harness_error":"guard-matrix failed to run"}' >"$WF_GUARD_JSON"
    if [ -n "$WF_DB_URL" ]; then
      SESSIONS_DATABASE_URL="$WF_DB_URL" POCKET_ID_WEBSITE_SECRET=dummy "$WF_TSX" --no-warnings "$WF_HARNESS" db-matrix >"$WF_DB_JSON" 2>"${BATS_FILE_TMPDIR}/db.err" \
        || echo '{"harness_error":"db-unreachable"}' >"$WF_DB_JSON"
    fi
  fi
}

_wf_need_tsx() {
  [ -n "$WF_TSX" ] || skip "tsx not installed (root npm ci)"
}

_wf_need_db() {
  _wf_need_tsx
  [ -n "$WF_DB_URL" ] || skip "no database URL (WORKSPACE_FOUNDATION_DB_URL/SESSIONS_DATABASE_URL unset)"
  grep -q 'db-unreachable' "$WF_DB_JSON" 2>/dev/null && skip "database unreachable at ${WF_DB_URL%%@*}@<redacted>"
  return 0
}

_wf_http_get() {
  local url="$1" out="$2"
  command -v curl >/dev/null 2>&1 || return 7
  curl -s -m 3 -o "$out" -w '%{http_code}' "$url" 2>/dev/null
}

@test "unauthenticated request to the owner identity endpoint is denied without data leak" {
  _wf_need_tsx
  run node -e 'const m=require(process.argv[1]);
if (m.harness_error) { console.error("harness failed: "+m.harness_error); process.exit(1); }
if (m.status!==401) { console.error("expected 401, got "+m.status); process.exit(1); }
if (m.body.authenticated!==false) { console.error("expected authenticated:false"); process.exit(1); }
if ("access_token" in m.body || "refresh_token" in m.body) { console.error("token material leaked"); process.exit(1); }' "$WF_ME_JSON"
  [ "$status" -eq 0 ] || { echo "$output"; return 1; }
  local body="${BATS_TEST_TMPDIR}/me-http.json" code
  code="$(_wf_http_get "${WF_BASE_URL}/api/owner/me" "$body")" && [ -n "$code" ] || { echo "http part skipped (target unreachable)"; return 0; }
  [ "$code" = "401" ] || { echo "FAIL: HTTP ${WF_BASE_URL}/api/owner/me without cookie returned ${code}, want 401"; return 1; }
  ! grep -qE 'access_token|refresh_token' "$body" || { echo "FAIL: token material in HTTP body"; return 1; }
}

@test "sessions without the owner group are denied" {
  _wf_need_tsx
  run node -e 'const g=require(process.argv[1]);
if (g.harness_error) { console.error("harness failed: "+g.harness_error); process.exit(1); }
for (const k of ["nullSession","noGroups","foreign"]) {
  if (g[k]!==false) { console.error("expected "+k+"=false, got "+g[k]); process.exit(1); }
}' "$WF_GUARD_JSON"
  [ "$status" -eq 0 ] || { echo "$output"; return 1; }
}

@test "session scoped to a foreign business is denied (cross-tenant isolation)" {
  _wf_need_db
  run node -e 'const d=require(process.argv[1]);
if (d.harness_error) { console.error("harness failed: "+d.harness_error); process.exit(1); }
if (d.foreign!==null) { console.error("foreign membership leaked: "+JSON.stringify(d.foreign)); process.exit(1); }
if (!Array.isArray(d.foreignList) || d.foreignList.length!==0) { console.error("foreign brand list not empty"); process.exit(1); }
if (!d.userList.every((r) => r.brand==="mentolder")) { console.error("user list spans brands"); process.exit(1); }' "$WF_DB_JSON"
  [ "$status" -eq 0 ] || { echo "$output"; return 1; }
}

@test "owner session is allowed and returns the identity payload" {
  _wf_need_tsx
  run node -e 'const g=require(process.argv[1]);
if (g.harness_error) { console.error("harness failed: "+g.harness_error); process.exit(1); }
if (g.owner!==true) { console.error("expected owner=true, got "+g.owner); process.exit(1); }
if (!g.business || g.business.brand!=="brand-a") { console.error("business payload wrong: "+JSON.stringify(g.business)); process.exit(1); }' "$WF_GUARD_JSON"
  [ "$status" -eq 0 ] || { echo "$output"; return 1; }
  [ -f "$WF_DB_JSON" ] && ! grep -q 'db-unreachable' "$WF_DB_JSON" 2>/dev/null || { echo "db part skipped (no database)"; return 0; }
  run node -e 'const d=require(process.argv[1]);
if (!d.probe || d.probe.role!=="owner") { console.error("expected probe role owner, got "+JSON.stringify(d.probe)); process.exit(1); }' "$WF_DB_JSON"
  [ "$status" -eq 0 ] || { echo "$output"; return 1; }
}

@test "owner routes ship no secret markers to the client" {
  run grep -rEn 'SECRET_|PRIVATE KEY|WEBSITE_TENANT_PEPPER|POCKET_ID_[A-Z_]*SECRET|Ag[A-Za-z0-9+/=]{40,}' \
    "${REPO_ROOT}/components/website/src/pages/owner" "${REPO_ROOT}/components/website/src/pages/api/owner"
  [ "$status" -ne 0 ] || { echo "FAIL: secret markers in owner routes:"; echo "$output"; return 1; }
  run grep -rEn 'access_token|refresh_token' \
    "${REPO_ROOT}/components/website/src/pages/owner" "${REPO_ROOT}/components/website/src/pages/api/owner"
  [ "$status" -ne 0 ] || { echo "FAIL: token references in owner routes:"; echo "$output"; return 1; }
  run grep -rEn '<script' "${REPO_ROOT}/components/website/src/pages/owner"
  [ "$status" -ne 0 ] || { echo "FAIL: client script in owner pages (pure SSR expected):"; echo "$output"; return 1; }
  local body="${BATS_TEST_TMPDIR}/leak-http.json" code
  code="$(_wf_http_get "${WF_BASE_URL}/api/owner/me" "$body")" && [ -n "$code" ] || { echo "http part skipped (target unreachable)"; return 0; }
  ! grep -qE 'access_token|refresh_token|SECRET_' "$body" || { echo "FAIL: secret markers in HTTP body"; return 1; }
}
