#!/usr/bin/env bats
#
# T003269 — factory-prep: stdout muss fuer sich genommen gueltiges JSON sein.
#
# Pruefmodus: OUTPUT-VERIFIKATION (T002448-M4). Der Test fuehrt das echte
# scripts/vda/factory-prep.sh aus und misst dessen stdout — er greppt nicht die
# Quelle. Damit das ohne Cluster und ohne Mutation echter Tickets geht, laeuft
# das Original in einem Fake-REPO: factory-prep.sh berechnet REPO aus seinem
# eigenen Pfad, also genuegt eine Kopie unter <fake>/scripts/vda/ plus Stubs an
# genau den Pfaden, die es aufruft. Die laufende Factory wird nicht beruehrt.
#
# Zusicherung an der SEMANTIK, nicht am Wortlaut (T002716): geprueft wird, dass
# `jq -e .` das stdout mit Exit 0 parst — nicht, welche Meldung release-slot
# ausgibt. Der Stub reproduziert bewusst das reale Verhalten von
# `ticket.sh release-slot` (Erfolgsmeldung auf stdout, scripts/ticket.sh:442):
# genau daran zerbrach der Launch-Plan in wakeup.sh:188.
#
# Positiv-Anker im selben Test (T002356-M1): der unbelegte Fall muss einen
# Launch-Eintrag liefern. Ohne ihn bestuende die JSON-Zusicherung vakuos, sobald
# factory-prep aus irgendeinem Grund gar nichts mehr ausgibt.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  FAKE="${BATS_TEST_TMPDIR}/fake-repo"
  mkdir -p "${FAKE}/scripts/vda" "${FAKE}/scripts/lib" "${FAKE}/scripts/factory"

  cp "${REPO_ROOT}/scripts/vda/factory-prep.sh" "${FAKE}/scripts/vda/factory-prep.sh"

  TICKET_LOG="${BATS_TEST_TMPDIR}/ticket-calls.log"
  : > "$TICKET_LOG"

  cat > "${FAKE}/scripts/lib/vda-core.sh" <<'EOF'
vda_error() { echo "ERROR: $*" >&2; }
EOF

  # Guards: kein Killswitch, kein Daily-Cap, Dry-Run-Check ok.
  cat > "${FAKE}/scripts/factory/guards.sh" <<'EOF'
guard_killswitch_on() { return 1; }
guard_daily_cap_reached() { return 1; }
guard_dryrun_ok() { return 0; }
EOF

  cat > "${FAKE}/scripts/factory/watchdog.sh" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF

  # Genau ein schedulebares Ticket fuer mentolder, Slot 1.
  cat > "${FAKE}/scripts/factory/schedule.sh" <<'EOF'
#!/usr/bin/env bash
if [[ "${BRAND:-}" == "mentolder" ]]; then
  echo '[{"brand":"mentolder","external_id":"T009901","slot":1}]'
else
  echo '[]'
fi
EOF

  # agent-lock: kein interaktiver Claim (rc 3 waere "claimed").
  cat > "${FAKE}/scripts/agent-lock.sh" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF

  # ticket.sh-Stub: bildet das reale stdout-Verhalten ab und protokolliert
  # jeden Aufruf, damit der Status-Restore (D2) messbar ist.
  cat > "${FAKE}/scripts/ticket.sh" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "${TICKET_LOG}"
case "\$1" in
  get)
    echo '{"external_id":"T009901","title":"Fake ticket","plan_ref":"branch=fix/fake-T009901 plan=openspec/changes/fake/tasks.md","status":"in_progress"}'
    ;;
  factory-control)
    echo "0"
    ;;
  release-slot)
    # identisch zu scripts/ticket.sh:442 — Erfolgsmeldung auf stdout
    echo "pipeline_slot released for ticket \$3"
    ;;
  update-status)
    echo "status updated"
    ;;
esac
exit 0
EOF

  # worktree-create: Erfolg/Fehlschlag ueber FAKE_WT_FAIL steuerbar; im
  # Fehlerfall schreibt das Original ebenfalls auf stderr, nicht auf stdout.
  cat > "${FAKE}/scripts/worktree-create.sh" <<'EOF'
#!/usr/bin/env bash
if [[ "${FAKE_WT_FAIL:-0}" == "1" ]]; then
  echo "worktree-create: branch in use — $1 ist bereits ausgecheckt" >&2
  exit 1
fi
exit 0
EOF

  chmod +x "${FAKE}"/scripts/*.sh "${FAKE}"/scripts/factory/*.sh "${FAKE}"/scripts/vda/*.sh
}

@test "T003269: factory-prep stdout ist gueltiges JSON — auch wenn der Worktree-Pre-Create fehlschlaegt" {
  # ── Positiv-Anker: unbelegter Branch, Pre-Create gelingt ────────────────────
  run bash -c "FAKE_WT_FAIL=0 bash '${FAKE}/scripts/vda/factory-prep.sh' 2>/dev/null"
  [ "$status" -eq 0 ]
  echo "$output" | jq -e . >/dev/null
  [ "$(echo "$output" | jq -r '.launch | length')" -eq 1 ]
  [ "$(echo "$output" | jq -r '.launch[0].external_id')" = "T009901" ]

  # ── Kernzusicherung: SKIP-Pfad darf den JSON-Stream nicht zerstoeren ────────
  : > "$TICKET_LOG"
  run bash -c "FAKE_WT_FAIL=1 bash '${FAKE}/scripts/vda/factory-prep.sh' 2>/dev/null"
  [ "$status" -eq 0 ]
  echo "$output" | jq -e . >/dev/null
  [ "$(echo "$output" | jq -r '.launch | length')" -eq 0 ]
  [ "$(echo "$output" | jq -r '.skipped[0].reason')" = "worktree_failed" ]

  # ── D2: der freigegebene Slot darf das Ticket nicht auf in_progress stranden
  # lassen — queue.sh liest nur backlog/plan_staged.
  grep -q 'release-slot' "$TICKET_LOG"
  run grep -E 'update-status .*T009901' "$TICKET_LOG"
  [ "$status" -eq 0 ]
  [[ "$output" == *"plan_staged"* ]]
}
