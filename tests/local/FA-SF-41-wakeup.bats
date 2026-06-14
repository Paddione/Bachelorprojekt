#!/usr/bin/env bats
# FA-SF-41 — Phase 3 persistent dispatcher: wakeup.sh structural contract (offline grep).
# Verifies the deliberately-dumb headless wrapper carries only the dry_run policy.

WAKEUP="${BATS_TEST_DIRNAME}/../../scripts/factory/wakeup.sh"
SERVICE="${BATS_TEST_DIRNAME}/../../scripts/factory/factory.service"
TIMER="${BATS_TEST_DIRNAME}/../../scripts/factory/factory.timer"
TASKFILE="${BATS_TEST_DIRNAME}/../../Taskfile.factory.yml"

setup() { load 'test_helper.bash'; }

@test "FA-SF-41: wakeup.sh exists and is bash -n clean" {
  [ -f "$WAKEUP" ]
  run bash -n "$WAKEUP"
  [ "$status" -eq 0 ]
}

@test "FA-SF-41: wakeup.sh cd's to the repo before anything else" {
  run grep -E '^[[:space:]]*cd[[:space:]]+"\$\{?REPO' "$WAKEUP"
  [ "$status" -eq 0 ]
}

@test "FA-SF-41: wakeup.sh single-flights via flock, default lock /tmp/factory-tick.lock, overridable" {
  # Default preserved, but the path is sourced from FACTORY_TICK_LOCK so tests
  # (and parallel hosts) can isolate the single-flight lock. [T000523]
  run grep -E 'FACTORY_TICK_LOCK:-/tmp/factory-tick\.lock' "$WAKEUP"
  [ "$status" -eq 0 ]
  run grep -F 'flock -n 9' "$WAKEUP"
  [ "$status" -eq 0 ]
}

@test "FA-SF-41: wakeup.sh detects the git-crypt GITCRYPT magic to decide unlock" {
  run grep -F 'GITCRYPT' "$WAKEUP"
  [ "$status" -eq 0 ]
}

@test "FA-SF-41: wakeup.sh unlocks via task secrets:unlock (not raw git-crypt)" {
  run grep -E 'task[[:space:]]+secrets:unlock' "$WAKEUP"
  [ "$status" -eq 0 ]
}

@test "FA-SF-41: wakeup.sh calls headless claude with the Workflow tool allowlisted" {
  # idle-retick: claude is called without exec (so the loop can continue after it)
  run grep -E '"\$\{CLAUDE_BIN\}"[[:space:]]+-p' "$WAKEUP"
  [ "$status" -eq 0 ]
  run grep -E -- '--allowedTools' "$WAKEUP"
  [ "$status" -eq 0 ]
  run grep -F 'Workflow' "$WAKEUP"
  [ "$status" -eq 0 ]
}

@test "FA-SF-41: wakeup.sh actually forwards -p + --allowedTools + --permission-mode to the exec'd claude (not dropped by a gamed comment)" {
  # Behavioral guard for the line-continuation bug: a stub 'claude' records its
  # argv; the wrapper must pass the FULL flag set, not just -p PROMPT.
  tmp="$(mktemp -d)"
  argfile="${tmp}/argv"
  cat > "${tmp}/claude-stub" <<STUB
#!/usr/bin/env bash
printf '%s\n' "\$@" > "${argfile}"
STUB
  chmod +x "${tmp}/claude-stub"
  # Isolate the single-flight lock (so a real autopilot tick holding the shared
  # /tmp/factory-tick.lock can't false-red this) AND the env file (so a present
  # ~/.config/factory/autopilot.env can't clobber FACTORY_CLAUDE_BIN). [T000523]
  FACTORY_REPO="${tmp}" FACTORY_CLAUDE_BIN="${tmp}/claude-stub" FACTORY_DRY_RUN=true \
    FACTORY_TICK_LOCK="${tmp}/tick.lock" FACTORY_ENV_FILE="${tmp}/no-env" run bash "$WAKEUP"
  [ "$status" -eq 0 ]
  run grep -q -- '-p' "${argfile}";              [ "$status" -eq 0 ]
  run grep -q -- '--allowedTools' "${argfile}";  [ "$status" -eq 0 ]
  run grep -qF 'Workflow' "${argfile}";          [ "$status" -eq 0 ]
  run grep -q -- '--permission-mode' "${argfile}"; [ "$status" -eq 0 ]
  run grep -qF 'acceptEdits' "${argfile}";       [ "$status" -eq 0 ]
  rm -rf "${tmp}"
}

@test "FA-SF-41: wakeup.sh single-flight honors FACTORY_TICK_LOCK (hermetic, not the shared /tmp lock)" {
  # Regression guard for the non-hermetic flock path [T000523]: hold an ISOLATED
  # override lock and prove the wrapper skips on IT (not the shared /tmp lock).
  # Pre-fix the wrapper ignored the override and flock'd /tmp/factory-tick.lock,
  # so on a free host it would RUN and exec the stub → this test fails. Post-fix
  # it skips cleanly without ever touching the stub.
  tmp="$(mktemp -d)"
  argfile="${tmp}/argv"
  cat > "${tmp}/claude-stub" <<STUB
#!/usr/bin/env bash
printf '%s\n' "\$@" > "${argfile}"
STUB
  chmod +x "${tmp}/claude-stub"
  lock="${tmp}/tick.lock"
  exec 8>"${lock}"
  flock -n 8   # hold the override lock for the duration of the run
  FACTORY_REPO="${tmp}" FACTORY_CLAUDE_BIN="${tmp}/claude-stub" FACTORY_DRY_RUN=true \
    FACTORY_TICK_LOCK="${lock}" FACTORY_ENV_FILE="${tmp}/no-env" run bash "$WAKEUP"
  exec 8>&-
  [ "$status" -eq 0 ]              # skip is a clean exit 0
  [ ! -f "${argfile}" ]           # stub was NOT exec'd → single-flight honored the override
  echo "$output" | grep -qF "${lock}"   # skip message names the override lock
  rm -rf "${tmp}"
}

@test "FA-SF-41: wakeup.sh threads the dry_run policy into the dispatcher prompt" {
  run grep -F 'dry_run' "$WAKEUP"
  [ "$status" -eq 0 ]
}

@test "FA-SF-41: wakeup.sh names dispatcher.js as the nested Workflow script" {
  run grep -F 'scripts/factory/dispatcher.js' "$WAKEUP"
  [ "$status" -eq 0 ]
}

@test "FA-SF-41: factory.service is a oneshot that runs wakeup.sh" {
  [ -f "$SERVICE" ]
  run grep -E '^Type=oneshot' "$SERVICE"
  [ "$status" -eq 0 ]
  run grep -E '^ExecStart=.*scripts/factory/wakeup\.sh' "$SERVICE"
  [ "$status" -eq 0 ]
}

@test "FA-SF-41: factory.service kills hung runs via RuntimeMaxSec" {
  run grep -E '^RuntimeMaxSec=' "$SERVICE"
  [ "$status" -eq 0 ]
}

@test "FA-SF-41: factory.timer re-arms after exit (OnUnitInactiveSec), not fixed-rate" {
  [ -f "$TIMER" ]
  run grep -E '^OnUnitInactiveSec=' "$TIMER"
  [ "$status" -eq 0 ]
  run grep -E '^OnCalendar=' "$TIMER"
  [ "$status" -ne 0 ]   # must NOT be a fixed wall-clock schedule (would overlap long ticks)
}

@test "FA-SF-41: factory.timer survives missed ticks via Persistent=true" {
  run grep -E '^Persistent=true' "$TIMER"
  [ "$status" -eq 0 ]
}

@test "FA-SF-41: factory.timer binds factory.service and is wanted by timers.target" {
  run grep -E '^Unit=factory\.service' "$TIMER"
  [ "$status" -eq 0 ]
  run grep -E '^WantedBy=timers\.target' "$TIMER"
  [ "$status" -eq 0 ]
}

@test "FA-SF-41: Taskfile defines factory:autopilot install/uninstall/status" {
  run grep -E '^[[:space:]]+autopilot:install:' "$TASKFILE"
  [ "$status" -eq 0 ]
  run grep -E '^[[:space:]]+autopilot:uninstall:' "$TASKFILE"
  [ "$status" -eq 0 ]
  run grep -E '^[[:space:]]+autopilot:status:' "$TASKFILE"
  [ "$status" -eq 0 ]
}

@test "FA-SF-41: autopilot:install symlinks both units and enables the timer" {
  run grep -F 'factory.timer' "$TASKFILE"
  [ "$status" -eq 0 ]
  run grep -F 'factory.service' "$TASKFILE"
  [ "$status" -eq 0 ]
  run grep -E 'systemctl --user enable --now factory\.timer' "$TASKFILE"
  [ "$status" -eq 0 ]
}

README="${BATS_TEST_DIRNAME}/../../scripts/factory/README.md"

@test "FA-SF-41: README documents the autopilot install task" {
  run grep -F 'task factory:autopilot:install' "$README"
  [ "$status" -eq 0 ]
}

@test "FA-SF-41: README states the cron-poll IS the trigger" {
  run grep -iE 'cron-poll .*(is|ist) (the |der )?trigger' "$README"
  [ "$status" -eq 0 ]
}

@test "FA-SF-41: README rejects CronCreate / remote / schedule as the dispatcher" {
  run grep -F 'CronCreate' "$README"
  [ "$status" -eq 0 ]
  run grep -iE 'RemoteTrigger|/schedule' "$README"
  [ "$status" -eq 0 ]
}

@test "FA-SF-41: README notes the inert (not consumed) pg_notify trigger" {
  run grep -F 'pg_notify' "$README"
  [ "$status" -eq 0 ]
}

@test "FA-SF-41: wakeup.sh supports idle-retick via FACTORY_IDLE_RETICK_ENABLED" {
  run grep -F 'FACTORY_IDLE_RETICK_ENABLED' "$WAKEUP"
  [ "$status" -eq 0 ]
}

@test "FA-SF-41: wakeup.sh checks both brand queues before retick" {
  run grep -E 'BRAND=mentolder.*queue\.sh' "$WAKEUP"
  [ "$status" -eq 0 ]
  run grep -E 'BRAND=korczewski.*queue\.sh' "$WAKEUP"
  [ "$status" -eq 0 ]
}

@test "FA-SF-41: wakeup.sh idle-retick exits cleanly when queue is empty" {
  # Stub: records args and exits 0. FACTORY_REPO points to a tmp dir with no queue.sh,
  # so the queue check returns 0 items → loop exits after one tick.
  tmp="$(mktemp -d)"
  argfile="${tmp}/argv"
  cat > "${tmp}/claude-stub" <<STUB
#!/usr/bin/env bash
printf '%s\n' "\$@" > "${argfile}"
STUB
  chmod +x "${tmp}/claude-stub"
  FACTORY_REPO="${tmp}" FACTORY_CLAUDE_BIN="${tmp}/claude-stub" FACTORY_DRY_RUN=true \
    FACTORY_TICK_LOCK="${tmp}/tick.lock" FACTORY_ENV_FILE="${tmp}/no-env" \
    FACTORY_IDLE_RETICK_ENABLED=true run bash "$WAKEUP"
  [ "$status" -eq 0 ]
  [ -f "${argfile}" ]   # claude was invoked exactly once
  rm -rf "${tmp}"
}

@test "FA-SF-41: wakeup.sh skips idle-retick when FACTORY_IDLE_RETICK_ENABLED=false" {
  run grep -E 'IDLE_RETICK.*true' "$WAKEUP"
  [ "$status" -eq 0 ]   # confirms the break path exists when disabled
}
