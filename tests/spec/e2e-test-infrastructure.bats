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
