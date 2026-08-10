#!/usr/bin/env bats
#
# T003270 — factory-prep: Worktree-Pre-Create scheitert dauerhaft, wenn der
# Branch anderswo ausgecheckt ist.
#
# Pruefmodus: OUTPUT-VERIFIKATION (T002448-M4). Der Test fuehrt das echte
# scripts/vda/factory-prep.sh aus und misst dessen stdout — er greppt nicht die
# Quelle. Damit das ohne Cluster und ohne Mutation echter Tickets geht, laeuft
# das Original in einem Fake-REPO: factory-prep.sh berechnet REPO aus seinem
# eigenen Pfad, also genuegt eine Kopie unter <fake>/scripts/vda/ plus Stubs an
# genau den Pfaden, die es aufruft.
#
# Kernzusicherung (V1): Ist der Ziel-Branch bereits in einem anderen Worktree
# ausgecheckt (realer Zustand: .worktrees/mishap-incident-rollup haelt
# chore/mishap-incident-rollup), darf der Pre-Create NICHT mehr mit
# worktree_failed scheitern — er erkennt den bestehenden Worktree per
# `git worktree list --porcelain` und verwendet ihn als worktree_path weiter,
# sofern (a) keine live Session den Branch haelt und (b) der Worktree sauber
# ist. Der fremde Dirty-/Live-Worktree bleibt weiterhin SKIP.
#
# Zweitzusicherung (V4): Wiederholte worktree_failed-SKIPs eskalieren nach 3
# Versuchen ueber `ticket.sh unfactory` statt still jeden Tick zu loopen.

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

  # Genau ein schedulebares Ticket fuer mentolder, Slot 1. Der Branch ist
  # bewusst ein real-belegter Kandidat (chore/… wie der Mishap-Rollup).
  cat > "${FAKE}/scripts/factory/schedule.sh" <<'EOF'
#!/usr/bin/env bash
if [[ "${BRAND:-}" == "mentolder" ]]; then
  echo '[{"brand":"mentolder","external_id":"T009902","slot":1}]'
else
  echo '[]'
fi
EOF

  # agent-lock: `check ticket` => frei (rc!=3), `check-branch-live` steuerbar
  # ueber FAKE_BRANCH_LIVE: free (rc 1) oder live (rc 0).
  cat > "${FAKE}/scripts/agent-lock.sh" <<'EOF'
#!/usr/bin/env bash
if [[ "$1" == "check-branch-live" ]]; then
  if [[ "${FAKE_BRANCH_LIVE:-0}" == "1" ]]; then
    echo "live"; exit 0
  fi
  echo "free"; exit 1
fi
exit 0
EOF

  # ticket.sh-Stub: protokolliert jeden Aufruf; get liefert einen plan_ref mit
  # dem belegten Branch; factory-control get/set steuert den prep_skip-Zaehler.
  cat > "${FAKE}/scripts/ticket.sh" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "${TICKET_LOG}"
case "\$1" in
  get)
    echo '{"external_id":"T009902","title":"Fake ticket","plan_ref":"branch=chore/reuse-target-T009902 plan=openspec/changes/reuse/tasks.md","status":"in_progress"}'
    ;;
  factory-control)
    case "\$2" in
      get) echo "\${FAKE_PREP_SKIP:-0}";;
      set) echo "factory-control set: \$4=\$6";;
    esac
    ;;
  release-slot)
    echo "pipeline_slot released for ticket \$3"
    ;;
  update-status)
    echo "status updated"
    ;;
  unfactory)
    echo "unfactory: \$3"
    ;;
esac
exit 0
EOF

  chmod +x "${FAKE}"/scripts/*.sh "${FAKE}"/scripts/factory/*.sh "${FAKE}"/scripts/vda/*.sh
}

# Legt im TMP ein Wegwerf-Git-Repo mit zwei Worktrees an: $WT_CLEAN (sauber,
# auf dem Ziel-Branch) und $WT_DIRTY (uncommittete Aenderung auf dem Branch).
# Der Reuse-Detect von factory-prep liest `git worktree list --porcelain` —
# dafuer braucht er ein echtes Repo im FAKE-Verzeichnis.
_make_worktrees() {
  FAKE="${BATS_TEST_TMPDIR}/fake-repo"
  git init -q -b main "$FAKE" 2>/dev/null
  git -C "$FAKE" config user.email t@example.invalid
  git -C "$FAKE" config user.name  Tester
  printf 'base\n' > "$FAKE/base.txt"
  git -C "$FAKE" add -A && git -C "$FAKE" commit -qm init

  git -C "$FAKE" branch chore/reuse-target-T009902 main
  git -C "$FAKE" worktree add -q "$FAKE/wt-clean" chore/reuse-target-T009902
  git -C "$FAKE" worktree add -q "$FAKE/wt-dirty" chore/reuse-target-T009902 2>/dev/null || {
    # Ein Branch kann nur in EINEM Worktree ausgecheckt sein — fuer den
    # dirty-Fall legen wir einen zweiten Branch an.
    git -C "$FAKE" branch chore/reuse-dirty-T009902 main
    git -C "$FAKE" worktree add -q "$FAKE/wt-dirty" chore/reuse-dirty-T009902
  }
  printf 'dirty\n' >> "$FAKE/wt-dirty/base.txt"
}

@test "T003270 Positiv-Anker: unbelegter Branch launcht weiterhin normal" {
  cat > "${BATS_TEST_TMPDIR}/fake-repo/scripts/worktree-create.sh" <<'EOF'
#!/usr/bin/env bash
echo "ready on branch $1"
exit 0
EOF
  chmod +x "${BATS_TEST_TMPDIR}/fake-repo/scripts/worktree-create.sh"

  run bash -c "bash '${FAKE}/scripts/vda/factory-prep.sh' 2>/dev/null"
  [ "$status" -eq 0 ]
  echo "$output" | jq -e . >/dev/null
  [ "$(echo "$output" | jq -r '.launch | length')" -eq 1 ]
  [ "$(echo "$output" | jq -r '.launch[0].worktree_path')" != "null" ]
}

@test "T003270 V1: belegter Branch wird wiederverwendet statt worktree_failed zu loopen" {
  _make_worktrees
  # Der (echte) worktree-create.sh wuerde auf dem belegten Branch mit exit 3
  # scheitern — genau der heutige Bug-Pfad. FAKE_BRANCH_LIVE=0 => Session frei.
  cp "${REPO_ROOT}/scripts/worktree-create.sh" "${FAKE}/scripts/worktree-create.sh"

  run bash -c "cd '${FAKE}' && FAKE_BRANCH_LIVE=0 bash '${FAKE}/scripts/vda/factory-prep.sh' 2>/dev/null"
  [ "$status" -eq 0 ]
  echo "$output" | jq -e . >/dev/null
  [ "$(echo "$output" | jq -r '.launch | length')" -eq 1 ]
  [ "$(echo "$output" | jq -r '.launch[0].worktree_path')" = "${FAKE}/wt-clean" ]
  [ "$(echo "$output" | jq -r '.skipped | length')" -eq 0 ]
}

@test "T003270 V1: Live-Session haelt den Branch -> weiterhin sauberer SKIP" {
  _make_worktrees
  cp "${REPO_ROOT}/scripts/worktree-create.sh" "${FAKE}/scripts/worktree-create.sh"

  run bash -c "cd '${FAKE}' && FAKE_BRANCH_LIVE=1 bash '${FAKE}/scripts/vda/factory-prep.sh' 2>/dev/null"
  [ "$status" -eq 0 ]
  echo "$output" | jq -e . >/dev/null
  [ "$(echo "$output" | jq -r '.launch | length')" -eq 0 ]
  [ "$(echo "$output" | jq -r '.skipped[0].reason')" = "worktree_failed" ]
}

@test "T003270 V1: dirty Worktree wird NICHT wiederverwendet -> SKIP" {
  _make_worktrees
  cp "${REPO_ROOT}/scripts/worktree-create.sh" "${FAKE}/scripts/worktree-create.sh"

  # schedule liefert den dirty-Branch; get liefert passenden plan_ref.
  cat > "${FAKE}/scripts/factory/schedule.sh" <<'EOF'
#!/usr/bin/env bash
if [[ "${BRAND:-}" == "mentolder" ]]; then
  echo '[{"brand":"mentolder","external_id":"T009903","slot":1}]'
else
  echo '[]'
fi
EOF
  cat > "${FAKE}/scripts/ticket.sh" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "${TICKET_LOG}"
case "\$1" in
  get)
    echo '{"external_id":"T009903","title":"Dirty fake","plan_ref":"branch=chore/reuse-dirty-T009902 plan=openspec/changes/reuse/tasks.md","status":"in_progress"}'
    ;;
  factory-control)
    case "\$2" in
      get) echo "\${FAKE_PREP_SKIP:-0}";;
      set) echo "factory-control set: \$4=\$6";;
    esac
    ;;
  release-slot) echo "pipeline_slot released for ticket \$3";;
  update-status) echo "status updated";;
esac
exit 0
EOF
  chmod +x "${FAKE}"/scripts/*.sh

  run bash -c "cd '${FAKE}' && FAKE_BRANCH_LIVE=0 bash '${FAKE}/scripts/vda/factory-prep.sh' 2>/dev/null"
  [ "$status" -eq 0 ]
  echo "$output" | jq -e . >/dev/null
  [ "$(echo "$output" | jq -r '.launch | length')" -eq 0 ]
  [ "$(echo "$output" | jq -r '.skipped[0].reason')" = "worktree_failed" ]
}

@test "T003270 V4: dritter worktree_failed-SKIP eskaliert das Ticket statt zu loopen" {
  cat > "${FAKE}/scripts/worktree-create.sh" <<'EOF'
#!/usr/bin/env bash
echo "worktree-create: branch in use — $1" >&2
exit 3
EOF
  chmod +x "${FAKE}/scripts/worktree-create.sh"

  # FAKE_PREP_SKIP=2: der Zaehler steht schon auf 2, der dritte Fehlversuch
  # muss unfactory ausloesen (blocked + needs_human), nicht nur SKIP + restore.
  run bash -c "FAKE_PREP_SKIP=2 bash '${FAKE}/scripts/vda/factory-prep.sh' 2>/dev/null"
  [ "$status" -eq 0 ]
  echo "$output" | jq -e . >/dev/null
  [ "$(echo "$output" | jq -r '.skipped[0].reason')" = "worktree_failed" ]
  grep -q 'unfactory' "$TICKET_LOG"
  grep -q 'update-status' "$TICKET_LOG"
}

@test "T003270 V4: erfolgreicher Pre-Create setzt den prep_skip-Zaehler zurueck" {
  cat > "${FAKE}/scripts/worktree-create.sh" <<'EOF'
#!/usr/bin/env bash
echo "ready on branch $1"
exit 0
EOF
  chmod +x "${FAKE}/scripts/worktree-create.sh"

  run bash -c "FAKE_PREP_SKIP=2 bash '${FAKE}/scripts/vda/factory-prep.sh' 2>/dev/null"
  [ "$status" -eq 0 ]
  # Der Zaehler-Reset geht als factory-control set mit Wert 0 in den Log.
  grep -q 'factory-control set: prep_skip:T009902=0' "$TICKET_LOG"
}
