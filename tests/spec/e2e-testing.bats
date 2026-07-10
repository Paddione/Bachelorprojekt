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
