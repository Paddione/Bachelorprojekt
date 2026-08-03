#!/usr/bin/env bats
# tests/spec/e2e-test-infrastructure.bats
# SSOT: openspec/specs/e2e-test-infrastructure.md
#
# Covers: e2e-seed.ts helper module — seedAvailable, seedAdminTicket, cleanup.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  SEED="$REPO/tests/e2e/lib/e2e-seed.ts"
  SPECS="$REPO/tests/e2e/specs"
  PWCONF="$REPO/tests/e2e/playwright.config.ts"
}

# Prints the body of one project block from playwright.config.ts:
# everything from `name: '<project>'` up to the next `name: '` line.
project_block() {
  awk -v want="name: '$1'" '
    index($0, want) { inside = 1; next }
    inside && /name: '"'"'/ { exit }
    inside { print }
  ' "$PWCONF"
}

# ── Module existence ──────────────────────────────────────────────────

@test "e2e-seed.ts helper module exists" {
  [ -f "$SEED" ]
}

# ── seedAvailable gate ────────────────────────────────────────────────

@test "e2e-seed.ts exports seedAvailable function" {
  run grep -q 'seedAvailable' "$SEED"
  [ "$status" -eq 0 ]
}

@test "e2e-seed.ts checks both CRON_SECRET and SESSIONS_DATABASE_URL" {
  run grep -q 'CRON_SECRET' "$SEED"
  [ "$status" -eq 0 ]
  run grep -q 'SESSIONS_DATABASE_URL' "$SEED"
  [ "$status" -eq 0 ]
}

# ── seedAdminTicket ───────────────────────────────────────────────────

@test "e2e-seed.ts exports seedAdminTicket function" {
  run grep -q 'seedAdminTicket' "$SEED"
  [ "$status" -eq 0 ]
}

@test "e2e-seed.ts inserts with is_test_data=true by default" {
  run grep -q 'is_test_data' "$SEED"
  [ "$status" -eq 0 ]
}

@test "e2e-seed.ts uses INSERT INTO tickets.tickets" {
  run grep -q 'INSERT INTO tickets.tickets' "$SEED"
  [ "$status" -eq 0 ]
}

# ── cleanupSeedTicket ─────────────────────────────────────────────────

@test "e2e-seed.ts exports cleanupSeedTicket function" {
  run grep -q 'cleanupSeedTicket' "$SEED"
  [ "$status" -eq 0 ]
}

@test "e2e-seed.ts cleanup uses is_test_data guard" {
  run grep -q 'is_test_data' "$SEED"
  [ "$status" -eq 0 ]
}

# ── Auth-Setup fail-closed (T002199) ──────────────────────────────────
#
# Regression guard for the 2026-07-26 run: every auth-setup project logged
# "E2E_ADMIN_PASS not set — writing empty state" yet finished green, so the
# dependent projects ran unauthenticated and produced ~33 phantom failures.
# A setup that cannot authenticate MUST fail, not degrade silently.

@test "admin auth-setup specs do not write an empty state for the admin path" {
  for f in mentolder-auth-setup korczewski-auth-setup brett-mentolder-auth-setup; do
    run grep -nE "writeEmptyState\((['\"])[a-z-]*(website-admin|brett)\.json\1\)" "$SPECS/$f.spec.ts"
    [ "$status" -ne 0 ] || {
      echo "$f.spec.ts still degrades the admin path to an empty storageState:"
      echo "$output"
      return 1
    }
  done
}

@test "website admin auth-setups gate on CRON_SECRET, the value loginViaE2E actually uses" {
  # Only the website setups can actually log in. The brett setups are fixme by
  # design (oauth2-proxy → Pocket ID passkey flow, T003163), so gating them on a
  # credential would be theatre.
  for f in mentolder-auth-setup korczewski-auth-setup; do
    run grep -q 'CRON_SECRET' "$SPECS/$f.spec.ts"
    [ "$status" -eq 0 ] || {
      echo "$f.spec.ts does not reference CRON_SECRET — it gates on the wrong variable"
      return 1
    }
  done
}

@test "brett auth-setups mark themselves fixme instead of returning silently" {
  # A bare `return` leaves the setup green and lets the dependent brett project
  # run without a session; testInfo.fixme skips it visibly instead.
  for f in brett-mentolder-auth-setup korczewski-auth-setup; do
    run grep -q 'testInfo.fixme(true' "$SPECS/$f.spec.ts"
    [ "$status" -eq 0 ] || {
      echo "$f.spec.ts has no unconditional testInfo.fixme for the brett login"
      return 1
    }
  done
  # …and no code path still reads the password variable the login never used.
  # (A comment mentioning it for historical context is fine — only code counts.)
  run grep -n 'process.env.E2E_ADMIN_PASS' "$SPECS/brett-mentolder-auth-setup.spec.ts"
  [ "$status" -ne 0 ]
}

@test "mentolder auth-setup awaits the storageState write" {
  # page.context().storageState({ path }) returns a Promise. Un-awaited it
  # races the context teardown, so the file may never be written in full.
  run grep -q 'await page.context().storageState' "$SPECS/mentolder-auth-setup.spec.ts"
  [ "$status" -eq 0 ]
}

@test "korczewski auth-setup names the variable it actually reads" {
  # The spec reads TEST_ADMIN_PASSWORD but used to log "E2E_ADMIN_PASS not set",
  # sending anyone who follows the message after the wrong env var.
  run grep -n "E2E_ADMIN_PASS not set" "$SPECS/korczewski-auth-setup.spec.ts"
  [ "$status" -ne 0 ]
}

# ── Playwright project assignment (T002199 / RC3) ─────────────────────

@test "fa-51 sidekick spec runs in the authenticated mentolder project" {
  run project_block mentolder
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'fa-51'
}

@test "fa-51 sidekick spec is not in the unauthenticated website project" {
  # The website project has no storageState, but fa-51 navigates to /admin —
  # there it can never be green regardless of whether Sidekick is deployed.
  run project_block website
  [ "$status" -eq 0 ]
  ! echo "$output" | grep -q 'fa-51'
}

# ══ Deploy-drift detection (T002202) ═══════════════════════════════════
#
# An E2E run against prod measures two things at once: the code and the
# deploy state. Without telling them apart it files tickets against bugs
# that do not exist in the repo (T002192). These tests pin the machinery
# that makes the deployed commit observable and blocks auto-ticketing when
# the tested SHA and the deployed SHA disagree.

# ── R1: the deployed commit is observable ─────────────────────────────

@test "website Dockerfile declares GIT_SHA in the runtime stage" {
  # ARG is per-stage: an ARG in the build stage alone is invisible at runtime.
  # build-website.yml already warns that this Dockerfile once had no ARG line,
  # which silently turned --build-arg values into no-ops.
  local dockerfile="$REPO/website/Dockerfile"
  run awk '/^FROM .* AS runtime/ { inside = 1 } inside' "$dockerfile"
  [ "$status" -eq 0 ]
  echo "$output" | grep -qE '^ARG GIT_SHA'
  echo "$output" | grep -qE '^ENV GIT_SHA'
}

@test "website Dockerfile declares BUILT_AT in the runtime stage" {
  local dockerfile="$REPO/website/Dockerfile"
  run awk '/^FROM .* AS runtime/ { inside = 1 } inside' "$dockerfile"
  [ "$status" -eq 0 ]
  echo "$output" | grep -qE '^ARG BUILT_AT'
  echo "$output" | grep -qE '^ENV BUILT_AT'
}

@test "the website build workflow passes GIT_SHA as a build-arg" {
  # One brand-neutral image feeds both the mentolder and korczewski deploy
  # jobs (T001229/T001276), so there is a single build workflow to patch —
  # CLAUDE.md still names a build-website-korczewski.yml that does not exist.
  run grep -q 'GIT_SHA=' "$REPO/.github/workflows/build-website.yml"
  [ "$status" -eq 0 ]
}

@test "the website build workflow passes BUILT_AT as a build-arg" {
  run grep -q 'BUILT_AT=' "$REPO/.github/workflows/build-website.yml"
  [ "$status" -eq 0 ]
}

@test "health endpoint reports the built commit" {
  local health="$REPO/website/src/pages/api/health.ts"
  run grep -q 'GIT_SHA' "$health"
  [ "$status" -eq 0 ]
  run grep -q 'commit' "$health"
  [ "$status" -eq 0 ]
}

@test "health endpoint falls back to 'unknown' rather than omitting commit" {
  # A missing field would let a consumer read it as undefined and treat the
  # run as drift-free. The value must always be present.
  run grep -q "unknown" "$REPO/website/src/pages/api/health.ts"
  [ "$status" -eq 0 ]
}

# ── R2: drift is visible during the run ───────────────────────────────

@test "globalSetup compares deployed commit against tested SHA" {
  local gs="$SPECS/global-db-cleanup.ts"
  run grep -q 'DEPLOY_DRIFT' "$gs"
  [ "$status" -eq 0 ]
  run grep -qE 'GITHUB_SHA|/api/health' "$gs"
  [ "$status" -eq 0 ]
}

# ── R3: drifted runs cannot open tickets ──────────────────────────────

@test "ingest endpoint gates ticket creation on deploy drift" {
  local ingest="$REPO/website/src/pages/sdlc/api/tests/ingest-e2e.ts"
  run grep -q 'testedSha' "$ingest"
  [ "$status" -eq 0 ]
  run grep -q 'deploy-drift' "$ingest"
  [ "$status" -eq 0 ]
}

@test "ingest drift gate treats an unknown SHA as drifted" {
  # Fail closed. A gate that waves through a missing value is exactly the
  # T002199 mistake in new clothes: build-website.yml documents that this
  # build-arg chain has already snapped once.
  run grep -q "unknown" "$REPO/website/src/pages/sdlc/api/tests/ingest-e2e.ts"
  [ "$status" -eq 0 ]
}

@test "e2e workflow submits the tested SHA to the ingest endpoint" {
  run grep -q 'testedSha' "$REPO/.github/workflows/e2e.yml"
  [ "$status" -eq 0 ]
}

# ── R4: setup gates check the variable the code actually reads ────────
#
# T002199: the admin gate checked E2E_ADMIN_PASS while loginViaE2E()
# authenticates with CRON_SECRET. The run HAD the credentials and threw
# them away.
#
# Note a naive formulation of this test would NOT have caught it:
# auth.ts does reference E2E_ADMIN_PASS — in getAdminCredentials(), a
# different code path than the one the setup calls. The invariant has to
# be per-function, not per-file.

@test "loginViaE2E still authenticates via CRON_SECRET" {
  # Guards the assumption the next test relies on. If loginViaE2E ever
  # switches credentials, this fails first and points at the mapping
  # instead of letting the gate test silently check the wrong variable.
  local auth="$REPO/tests/e2e/lib/auth.ts"
  run grep -q "const CRON_SECRET = process.env.CRON_SECRET" "$auth"
  [ "$status" -eq 0 ]
  run grep -q 'export async function loginViaE2E' "$auth"
  [ "$status" -eq 0 ]
}

@test "auth setups calling loginViaE2E gate on CRON_SECRET" {
  # Match the CALL, not the import: brett-mentolder-auth-setup.spec.ts
  # imports loginViaE2E without ever calling it (it fixmes unconditionally
  # because the oauth2-proxy login is unimplemented), so a filename-wide
  # grep for the bare identifier would flag it wrongly.
  local found=0
  for f in "$SPECS"/*-auth-setup.spec.ts; do
    grep -q 'loginViaE2E(' "$f" || continue
    found=1
    grep -q 'CRON_SECRET' "$f" \
      || { echo "FAIL: $f calls loginViaE2E but never gates on CRON_SECRET"; return 1; }
  done
  [ "$found" -gt 0 ]
}

@test "no auth setup gates on a credential loginViaE2E does not read" {
  # E2E_ADMIN_PASS belongs to getAdminCredentials(), not loginViaE2E().
  # Gating the e2e-login path on it is the T002199 defect.
  for f in "$SPECS"/*-auth-setup.spec.ts; do
    grep -q 'loginViaE2E(' "$f" || continue
    if grep -qE 'if \(!\s*ADMIN_PASS\s*\)|if \(!process\.env\.E2E_ADMIN_PASS\)' "$f"; then
      echo "FAIL: $f gates the e2e-login path on E2E_ADMIN_PASS"
      return 1
    fi
  done
}
