#!/usr/bin/env bats
# SSOT: openspec/specs/chat-inbox.md
# T001456: E2E-Testdaten dürfen weder im Admin-Postfach auftauchen noch als
# unmarkierte Meetings/Kunden in Prod persistieren.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
}

@test "T001456: listInboxItems versteckt is_test_data-Zeilen per Default" {
  grep -q "is_test_data = false" "$REPO_ROOT/website/src/lib/messaging-db.ts"
}

@test "T001456: countPendingByType zählt keine Test-Zeilen" {
  grep -q "status = 'pending' AND is_test_data = false" \
    "$REPO_ROOT/website/src/lib/messaging-db.ts"
}

@test "T001456: fa-20 finalize-Spec nutzt [TEST]-meetingType (Sweep-fähig)" {
  grep -q "meetingType: '\[TEST\] Erstgesprach'" \
    "$REPO_ROOT/tests/e2e/specs/fa-20-finalize.spec.ts"
}

@test "T001456: fa-20 finalize-Spec nutzt keine real aussehende Kundenmail mehr" {
  ! grep -q "test@example\.de" "$REPO_ROOT/tests/e2e/specs/fa-20-finalize.spec.ts"
}

@test "T001456: inbox-delete-Spec nutzt den includeTest-Schalter" {
  grep -q "includeTest=1" "$REPO_ROOT/tests/e2e/specs/fa-admin-inbox-delete.spec.ts"
}
