#!/usr/bin/env bats
# Prüfmodus: COMMAND OUTPUT VERIFICATION
#
# SSOT read-back verification guard [T015668].  After every critical
# write verb (update-status, enqueue, stage-plan, archive-plan) the CLI
# re-reads the ticket row from the SSOT pod and aborts — exit 1 — when
# the persisted value does not match the written intent.  This catches
# the "psql rc=0 but the row landed in a ghost pod" class of silent
# failure.
#
# Stub kubectl follows the PAT-ID from tests/spec/software-factory/enqueue-preserves-plan-staged.bats:
#   - `$SQLLOG` and `$reported_status` are interpolated at stub-creation time (they
#     come from the BATS shell and are NOT exported to the subprocess — same as the
#     enqueue reference test).
#   - `\$sql` is escaped so `cat` runs inside the stub.
#
# The stub returns the SAME status for every SELECT…status query.  This is
# intentional: the pre-UPDATE transition guard reads the same stub value as the
# post-UPDATE read-back, so a stale value (Test B) simulates a write that did
# not persist.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  STUBDIR="$BATS_TEST_TMPDIR/stub"
  SQLLOG="$BATS_TEST_TMPDIR/sql.log"
  mkdir -p "$STUBDIR"
  : > "$SQLLOG"
}

# make_kubectl_stub <reported-status>
#
# Stub answers:
#   kubectl config view …  → fake LAN server (ctx-guard safety; skipped under BATS sentinel)
#   kubectl get …           → one pod name so _pgpod resolves
#   kubectl exec … psql …   → reads SQL from stdin, logs to $SQLLOG (path baked in),
#                              returns $reported_status for every SELECT…status query
make_kubectl_stub() {
  local reported_status="$1"
  cat > "$STUBDIR/kubectl" <<STUB
#!/usr/bin/env bash
if [[ "\$*" == *"config view"* ]]; then
  if [[ "\$*" == *".contexts["* ]]; then echo "stub-cluster"; else echo "https://10.0.33.1:6443"; fi
  exit 0
fi
for a in "\$@"; do
  if [[ "\$a" == "get" ]]; then echo "pod/shared-db-stub"; exit 0; fi
done
sql="\$(cat)"
printf '%s\n---\n' "\$sql" >> "$SQLLOG"
if [[ "\$sql" == *"SELECT"* && "\$sql" == *"status"* ]]; then
  printf '%s\n' "$reported_status"
fi
exit 0
STUB
  chmod +x "$STUBDIR/kubectl"
}

@test "T015668-A: update-status read-back passes when SSOT is consistent" {
  make_kubectl_stub "in_progress"

  run env PATH="$STUBDIR:$PATH" bash "$REPO_ROOT/scripts/ticket.sh" update-status --id T015668 --status in_progress

  [ "$status" -eq 0 ]
  [[ "$output" == *"status updated"* ]]
}

@test "T015668-B: update-status aborts on stale read-back mismatch" {
  make_kubectl_stub "triage"

  run env PATH="$STUBDIR:$PATH" bash "$REPO_ROOT/scripts/ticket.sh" update-status --id T015668 --status in_progress

  # Positiv-Anker (T002356): beweist, dass der UPDATE ausgeführt wurde
  # (nicht schon der Transition-Guard oder _pgpod vorher abgebrochen ist).
  [ -s "$SQLLOG" ]
  grep -q "UPDATE" "$SQLLOG"

  # Negativ-Assertion: Read-back erkennt den Stale-Status
  [ "$status" -ne 0 ]
  [[ "$output" == *"MISMATCH"* ]]
  [[ "$output" == *"T015668"* ]]
}

@test "T015668-C: update-status with TICKET_OFFLINE=1 skips read-back" {
  # Stub returns "triage" — würde einen Mismatch erzeugen, wenn die Verifikation
  # laufen würde.  Da TICKET_OFFLINE=1 gesetzt ist, muss der Skip die
  # Verifikation vermeiden, obwohl der Stub "falsch" antwortet.
  make_kubectl_stub "triage"

  run env PATH="$STUBDIR:$PATH" TICKET_OFFLINE=1 bash "$REPO_ROOT/scripts/ticket.sh" update-status --id T015668 --status in_progress

  [ "$status" -eq 0 ]
  [[ "$output" == *"OFFLINE: skipped"* ]]
}
