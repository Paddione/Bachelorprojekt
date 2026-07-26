#!/usr/bin/env bats
# tests/spec/t001582-mishap-bundle.bats
# SSOT: docs/superpowers/specs/2026-07-03-t001582-mishap-bundle-design.md
# T001582 — Mishap-Bundle: scripts/agent-lock.sh, scripts/ticket.sh, scripts/vda.sh (3 Einträge).
#
# Consolidates the failing-test contract for all three mishaps in the bundle.
# Each M1/M2/M3 "must fail before fix" test must FAIL on the current
# `fix/t001582-mishap-scripts` branch and PASS after the corresponding fix lands.
#
#   M1 — scripts/agent-lock.sh: _reapable() must use heartbeat_at (not created_at)
#        as the age reference for the pid-dead/sid-dead reap paths, so a claim
#        that was recently refreshed is never reaped just because its original
#        created_at is old and its (transient) owner_pid has since exited.
#   M2 — scripts/vda/ticket/create.sh: an invalid --severity value must be
#        rejected client-side (exit 2, listing the enum) BEFORE any DB access,
#        so a failed create never burns a sequence id.
#   M3 — scripts/vda/ticket/get.sh: _ticket_offline_refuse_read must be reachable
#        via _ticket-core.sh so `vda.sh ticket get` never prints
#        "command not found" to stderr.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  LOCK="$REPO/scripts/agent-lock.sh"
  TICKET_SH="$REPO/scripts/ticket.sh"
  CREATE_SH="$REPO/scripts/vda/ticket/create.sh"
  GET_SH="$REPO/scripts/vda/ticket/get.sh"
  CORE_SH="$REPO/scripts/vda/ticket/_ticket-core.sh"
}

# ── Mishap 1: agent-lock reap uses created_at instead of heartbeat_at ──────#

@test "T001582-M1: agent-lock does not pid-dead-reap a claim that was recently refreshed, even though created_at is old" {
  AGENT_LOCK_DIR="$(mktemp -d)"; export AGENT_LOCK_DIR
  # Numeric SID bypasses the harness "always alive" fast path so the
  # pid-dead branch of _reapable() is actually exercised (mirrors T001415-M1).
  AGENT_LOCK_SID="555555" \
    bash "$LOCK" claim ticket t001582-m1-refreshed --label mishap1
  LF="$AGENT_LOCK_DIR/ticket__t001582-m1-refreshed.json"
  # Simulate: claim originally created long ago (past AGENT_LOCK_GRACE=120s),
  # but heartbeat_at reflects a refresh that just happened (now), and the
  # owner_pid recorded at that refresh has since exited (guaranteed-dead pid).
  NOW="$(date +%s)"
  OLD=$(( NOW - 100000 ))
  sed -i "s/\"created_at\": \"[0-9]*\"/\"created_at\": \"$OLD\"/" "$LF"
  sed -i "s/\"heartbeat_at\": \"[0-9]*\"/\"heartbeat_at\": \"$NOW\"/" "$LF"
  sed -i 's/"owner_pid": "[0-9]*"/"owner_pid": "999999"/' "$LF"
  bash "$LOCK" reap
  # A recently-heartbeated claim must survive the sweep — this is the bug:
  # the current implementation measures age against created_at and reaps it.
  run bash "$LOCK" list
  [[ "$output" == *"t001582-m1-refreshed"* ]]
  rm -rf "$AGENT_LOCK_DIR"
}

@test "T001582-M1 (regression guard): agent-lock still reaps a claim whose heartbeat is ALSO stale" {
  AGENT_LOCK_DIR="$(mktemp -d)"; export AGENT_LOCK_DIR
  AGENT_LOCK_SID="555556" \
    bash "$LOCK" claim ticket t001582-m1-stale --label mishap1
  LF="$AGENT_LOCK_DIR/ticket__t001582-m1-stale.json"
  NOW="$(date +%s)"
  OLD=$(( NOW - 100000 ))
  sed -i "s/\"created_at\": \"[0-9]*\"/\"created_at\": \"$OLD\"/" "$LF"
  sed -i "s/\"heartbeat_at\": \"[0-9]*\"/\"heartbeat_at\": \"$OLD\"/" "$LF"
  sed -i 's/"owner_pid": "[0-9]*"/"owner_pid": "999999"/' "$LF"
  bash "$LOCK" reap
  run bash "$LOCK" list
  [[ "$output" != *"t001582-m1-stale"* ]]
  rm -rf "$AGENT_LOCK_DIR"
}

# ── Mishap 2: ticket.sh create burns a sequence id on invalid --severity ───#

@test "T001582-M2: create.sh rejects an invalid --severity value before any DB access" {
  [ -f "$CREATE_SH" ]
  # [T002224] TICKET_OFFLINE=1 is the sanctioned way to keep a write off the
  # cluster. The previous PATH="/nonexistent-…:$PATH" only prepended an empty
  # directory and left the real kubectl resolvable — see the sibling test below.
  run env TICKET_OFFLINE=1 \
    bash "$CREATE_SH" create --type bug --title "x" --description "y" --severity hoch
  [ "$status" -eq 2 ]
  [[ "$output" == *"critical"* && "$output" == *"major"* && "$output" == *"minor"* && "$output" == *"trivial"* ]]
  # The severity check must still run ahead of the offline guard, so no
  # "OFFLINE: skipped" may appear — the call is rejected on validation alone.
  [[ "$output" != *"OFFLINE: skipped"* ]]
}

@test "T001582-M2: create.sh still allows an empty --severity (optional field)" {
  [ -f "$CREATE_SH" ]
  # No --severity at all must never trip the validation (it must only run when
  # the flag is present with a non-matching value). Past the validation the call
  # must stop at the offline guard and never touch the database.
  #
  # [T002224] This test used to write a real `title=x, description=y` bug ticket
  # into the live database on every single suite run — ~130 rows accumulated
  # between 2026-07-03 and 2026-07-26. The guard was
  # PATH="/nonexistent-path-so-kubectl-cannot-be-found:$PATH", which prepends a
  # directory that does not exist but keeps $PATH intact, so /usr/local/bin/kubectl
  # stayed resolvable and create.sh reached _pgpod and INSERTed for real.
  run env TICKET_OFFLINE=1 bash "$CREATE_SH" create --type bug --title "x" --description "y"
  [ "$status" -eq 0 ]
  [[ "$output" != *"Invalid --severity"* ]]
  [[ "$output" == *"OFFLINE: skipped create"* ]]
}

@test "T002224: create.sh honours TICKET_OFFLINE=1 and performs no cluster write" {
  # Regression guard for the ~130 stray x/y tickets. A mock kubectl records any
  # invocation; with TICKET_OFFLINE=1 the recorder must stay empty, proving
  # create.sh short-circuits before _pgpod rather than relying on kubectl being
  # absent from PATH.
  local mockdir cap
  mockdir="$(mktemp -d)"; cap="$mockdir/invoked"
  cat > "$mockdir/kubectl" <<'MOCKEOF'
#!/usr/bin/env bash
echo "kubectl $*" >> "$CAP"
echo "pod/shared-db-0"
exit 0
MOCKEOF
  chmod +x "$mockdir/kubectl"
  run env PATH="$mockdir:$PATH" CAP="$cap" TICKET_OFFLINE=1 \
    bash "$CREATE_SH" create --type bug --title "x" --description "y"
  [ "$status" -eq 0 ]
  [[ "$output" == *"OFFLINE: skipped create"* ]]
  [ ! -s "$cap" ]
  rm -rf "$mockdir"
}

@test "T002224: _ticket-core repoints CTX away from the live cluster under BATS" {
  # Fail-closed backstop: even a future test that forgets TICKET_OFFLINE must not
  # reach the real cluster. Under BATS (and without TICKET_TEST_DB_OK=1) the
  # sourced core rewrites CTX to a sentinel that cannot resolve.
  run bash -c "source '$REPO/scripts/vda/ticket/_ticket-core.sh'; echo \"\$CTX\""
  [ "$status" -eq 0 ]
  [[ "$output" == "bats-no-cluster-t002224" ]]
  [[ "$output" != "fleet" ]]
}

@test "T002224: TICKET_TEST_DB_OK=1 opts a test back into the configured context" {
  run env TICKET_TEST_DB_OK=1 TICKET_CTX=fleet \
    bash -c "source '$REPO/scripts/vda/ticket/_ticket-core.sh'; echo \"\$CTX\""
  [ "$status" -eq 0 ]
  [[ "$output" == "fleet" ]]
}

@test "T001582-M2: ticket.sh usage text lists the valid --severity enum values" {
  grep -Eq 'severity.*critical.*major.*minor.*trivial|critical\|major\|minor\|trivial' "$TICKET_SH"
}

# ── Mishap 3: vda.sh ticket get prints 'command not found' for the offline guard ─#

@test "T001582-M3: _ticket_offline_refuse_read is defined in the shared _ticket-core.sh" {
  grep -q '_ticket_offline_refuse_read()' "$CORE_SH"
}

@test "T001582-M3: get.sh no longer errors with 'command not found' when invoked" {
  # get.sh will still fail (no cluster reachable in this offline test env / bad id),
  # but it must never emit the "command not found" shell error for the missing
  # offline-guard function.
  run bash "$GET_SH" --id T000001
  [[ "$output" != *"command not found"* ]]
}
