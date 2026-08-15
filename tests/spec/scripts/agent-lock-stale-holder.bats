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
  # [T005560] Grace-Frist klein setzen (Muster wie T002849): der held-stale-
  # Zweig greift erst nach AGENT_LOCK_GRACE — ein frischer Claim mit totem
  # owner_pid ist ein Resume-Fenster (T002849) und bleibt "held" (rc=3).
  export AGENT_LOCK_GRACE=5
}

teardown() {
  rm -rf "${AGENT_LOCK_DIR}"
}

@test "check ticket meldet held-stale (rc=4) bei totem owner_pid (T005560)" {
  # Fixture wie der T005029-Vorfall: lebende (non-numerische) SID, Heartbeat
  # unter der TTL, aber toter owner_pid und Claim älter als die Grace-Frist
  # (nachweislich beendet, kein Resume-Fenster mehr); Worktree EXISTIERT und
  # Branch matcht. Die non-numerische SID verhindert das Reapen durch
  # _reapable (Block 0: SID gilt als lebendig, vor Block 0b) — genau die
  # T005029-Lücke: der Lock bleibt ewig "held", obwohl der Halter tot ist.
  # Ohne existierenden Worktree würde _reapable (Block 0a, worktree-missing)
  # den Lock nach der Grace-Frist als "free" räumen — der Vorfall braucht den
  # worktree-matching Fall, der nicht reapbar ist.
  FIXTURE_WT="${BATS_TEST_TMPDIR}/fixture-wt"
  mkdir -p "${FIXTURE_WT}"
  git -C "${FIXTURE_WT}" init -q
  git -C "${FIXTURE_WT}" checkout -q -b fix/ticket-lock-stale-pass-T005560
  cat > "${AGENT_LOCK_DIR}/ticket__T999999.json" <<EOF
{"scope":"ticket","id":"T999999","owner_sid":"dead-session-fixture-uuid","owner_pid":"999999","tool":"claude","label":"dev-flow-plan","worktree":"${FIXTURE_WT}","branch":"fix/ticket-lock-stale-pass-T005560","ticket":"","host":"x","created_at":"$(( NOW - 30 ))","heartbeat_at":"$(( NOW - 30 ))"}
EOF

  # Positiv-Anker (T002356-M1): der Lock ist vorhanden und NICHT reapable —
  # check darf ihn nicht als "free" melden (sonst wäre der Test trivial grün).
  [ -f "${AGENT_LOCK_DIR}/ticket__T999999.json" ]

  run bash "${REPO_ROOT}/scripts/agent-lock.sh" check ticket T999999
  [ "$status" -eq 4 ]
  echo "$output" | grep -qF 'held-stale'
}
