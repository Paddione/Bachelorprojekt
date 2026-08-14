#!/usr/bin/env bats
# tests/spec/scripts/agent-lock-stale-holder.bats
# Failing Test für T005560: `agent-lock.sh check ticket` unterscheidet heute
# nicht zwischen lebendigem und totem Halter (immer rc=3/"held"). Ein Lock mit
# totem owner_pid ist aber kein Schutz gegen Doppelbearbeitung — der Write-Guard
# von ticket.sh soll solche Stale-Holder mit Warnung durchlassen. Erwartung:
# rc=4 + Ausgabe "held-stale".

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  AGENT_LOCK_DIR="$(mktemp -d)"
  export AGENT_LOCK_DIR
  NOW="$(date +%s)"
  export NOW
}

teardown() {
  rm -rf "${AGENT_LOCK_DIR}"
}

@test "check ticket meldet held-stale (rc=4) bei totem owner_pid (T005560)" {
  # Fixture wie der T005029-Vorfall: lebende (non-numerische) SID, frischer
  # Heartbeat, aber toter owner_pid; Worktree existiert und Branch matcht.
  cat > "${AGENT_LOCK_DIR}/ticket__T999999.json" <<EOF
{"scope":"ticket","id":"T999999","owner_sid":"dead-session-fixture-uuid","owner_pid":"999999","tool":"claude","label":"dev-flow-plan","worktree":"${REPO_ROOT}/.worktrees/ticket-lock-stale-pass","branch":"fix/ticket-lock-stale-pass-T005560","ticket":"","host":"x","created_at":"${NOW}","heartbeat_at":"${NOW}"}
EOF

  # Positiv-Anker (T002356-M1): der Lock ist vorhanden und NICHT reapable —
  # check darf ihn nicht als "free" melden (sonst wäre der Test trivial grün).
  [ -f "${AGENT_LOCK_DIR}/ticket__T999999.json" ]

  run bash "${REPO_ROOT}/scripts/agent-lock.sh" check ticket T999999
  [ "$status" -eq 4 ]
  echo "$output" | grep -qF 'held-stale'
}
