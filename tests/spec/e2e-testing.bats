#!/usr/bin/env bats
# tests/spec/e2e-testing.bats
# SSOT: openspec/specs/e2e-testing.md (created via this change, T001754)
#
# Regression coverage for the FA-bug-notify E2E fixture-leak fix: the test
# must seed its ticket via a direct DB insert (not the public bug-report
# API) and must clean it up in afterEach regardless of test outcome, so the
# fixture never sits visible in the real triage queue between nightly runs.

SPEC_FILE="${BATS_TEST_DIRNAME}/../e2e/specs/fa-bugs-notifications.spec.ts"

@test "FA-bug-notify does not seed via the public /api/bug-report route" {
  run grep -n "createTestBugReport" "$SPEC_FILE"
  [ "$status" -ne 0 ]
}

@test "FA-bug-notify has an afterEach that deletes the seeded ticket row" {
  run grep -n "afterEach" "$SPEC_FILE"
  [ "$status" -eq 0 ]
  run grep -n "DELETE FROM tickets.tickets" "$SPEC_FILE"
  [ "$status" -eq 0 ]
}

# --- T000254: korczewski landmark + text expectations -------------------------
# The korczewski page rendered TWO <footer> elements: KoreHomepage's `w-foot`
# inside <main>, plus the layout's `site-foot`. A <footer> nested in <main> is a
# landmark inside a landmark, and it makes Playwright's getByRole('contentinfo')
# ambiguous under strict mode — the likely source of the "flaky" runs in the
# ticket. The outer layout footer stays; the inner one must not be a <footer>.

KORE_HOMEPAGE="${BATS_TEST_DIRNAME}/../../website/src/components/kore/KoreHomepage.svelte"
KORCZEWSKI_SPEC="${BATS_TEST_DIRNAME}/../e2e/specs/korczewski-home.spec.ts"

@test "T000254: KoreHomepage renders no nested <footer> landmark" {
  run grep -n '<footer' "$KORE_HOMEPAGE"
  [ "$status" -ne 0 ]
}

@test "T000254: korczewski footer expectation is case-insensitive" {
  # The layout footer spells the brand lowercase ("korczewski."); a literal
  # 'Korczewski' can only ever match the inner w-foot, which is going away.
  run grep -n "toContainText('Korczewski')" "$KORCZEWSKI_SPEC"
  [ "$status" -ne 0 ]
}

@test "T000254: the brand link is addressable by an accessible name" {
  # T2 must not key off a string that was never in the DOM (see proposal.md):
  # the accessible name of <a class="brand"> is content-derived ("korczewski."),
  # T002053 deliberately keeps it aria-label-free.
  run grep -n 'korczewski startseite' "$KORCZEWSKI_SPEC"
  [ "$status" -ne 0 ]
  # And T2 must still actually select the brand link via role+name, not just
  # drop the assertion — a deleted test would satisfy the check above too.
  run grep -n "getByRole('link', { name: /\^korczewski" "$KORCZEWSKI_SPEC"
  [ "$status" -eq 0 ]
}

# --- T002730: FA-59 systemtest purge endpoint positive assertions -----------
PURGE_SPEC="${BATS_TEST_DIRNAME}/../e2e/specs/fa-59-systemtest-purge-endpoint.spec.ts"

@test "T002730: FA-59 systemtest purge endpoint spec does not use negative assertion (not.toBe)" {
  run grep -n "not\.toBe" "$PURGE_SPEC"
  [ "$status" -ne 0 ]
}

@test "T002730: FA-59 systemtest purge endpoint spec asserts positive 403 status" {
  run grep -n "toBe(403)" "$PURGE_SPEC"
  [ "$status" -eq 0 ]
}

