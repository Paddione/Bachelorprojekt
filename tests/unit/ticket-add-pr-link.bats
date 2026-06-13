#!/usr/bin/env bats
# Offline test: `ticket.sh add-pr-link` builds the correct INSERT into
# tickets.ticket_links (from_id = ticket uuid, kind='pr', pr_number=<int>).
# Verifies arg-parsing + SQL shape WITHOUT a live cluster (kubectl is mocked).

setup() {
  TICKET="$BATS_TEST_DIRNAME/../../scripts/ticket.sh"
  MOCKDIR="$(mktemp -d)"
  CAP="$MOCKDIR/captured.sql"
  cat > "$MOCKDIR/kubectl" <<EOF
#!/usr/bin/env bash
# get pod → fake pod name; exec → record stdin SQL to \$CAP
if [[ "\$*" == *"get pod"* ]]; then echo "pod/shared-db-0"; exit 0; fi
if [[ "\$*" == *"exec"* ]]; then cat >> "$CAP"; echo "fake-uuid-1234"; exit 0; fi
exit 0
EOF
  chmod +x "$MOCKDIR/kubectl"
  PATH="$MOCKDIR:$PATH"
  export PATH CAP
}

teardown() { rm -rf "$MOCKDIR"; }

@test "add-pr-link requires --id and --pr" {
  run bash "$TICKET" add-pr-link --id T000123
  [ "$status" -ne 0 ]
  [[ "$output" == *"--id and --pr are required"* ]]
}

@test "add-pr-link rejects a non-numeric --pr" {
  run bash "$TICKET" add-pr-link --id T000123 --pr abc
  [ "$status" -ne 0 ]
  [[ "$output" == *"--pr must be an integer"* ]]
}

@test "add-pr-link inserts into ticket_links with kind='pr' and pr_number" {
  run bash "$TICKET" add-pr-link --id T000123 --pr 1234
  [ "$status" -eq 0 ]
  # Both SQL calls (UUID SELECT + INSERT) are appended to $CAP; assert both present
  grep -q "SELECT id FROM tickets.tickets" "$CAP"
  grep -q "INSERT INTO tickets.ticket_links" "$CAP"
  grep -q "kind" "$CAP"
  grep -qi "pr_number" "$CAP"
  # MUST NOT reference the non-existent columns from the spec snippet
  ! grep -qE "\bref\b|\burl\b" "$CAP"
}
