#!/usr/bin/env bats
# tests/spec/software-factory/wakeup.bats
# SSOT: openspec/specs/software-factory.md
#
# [T002503] Aufgeteilt aus tests/spec/software-factory.bats. Jene Sammeldatei hielt
# 495 der ~2300 Spec-Tests in einer Datei und war mit --no-parallelize-within-files
# unteilbar: sie bildete mit 115s den Boden jedes CI-Shards, in dem sie lag.
#
# Der Split ist ein VERSCHIEBEN, kein Kopieren — die Quelldatei ist entfernt.
# T002427/T002421: eine frueher zurueckgelassene Kopie erzeugte doppelte Testnamen,
# ein gefilterter Lauf sah gruen aus, waehrend `task test:factory` ueber die
# veraltete Fassung rot lief.
#
# Gemeinsame Variablen, _skip_if_no_db und Setup/Teardown liegen in _sf_common.bash.

load '_sf_common'

setup()    { _sf_setup; }
teardown() { _sf_teardown; }

# ── FA-SF-41-wakeup ─────────────────────────────────────────────#
# FA-SF-41 — Phase 3 persistent dispatcher: wakeup.sh structural contract (offline grep).
# Verifies the deliberately-dumb headless wrapper carries only the dry_run policy.

WAKEUP="${BATS_TEST_DIRNAME}/../../../scripts/factory/wakeup.sh"
SERVICE="${BATS_TEST_DIRNAME}/../../../scripts/factory/factory.service"
TIMER="${BATS_TEST_DIRNAME}/../../../scripts/factory/factory.timer"
TASKFILE="${BATS_TEST_DIRNAME}/../../../Taskfile.factory.yml"

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

@test "FA-SF-41: wakeup.sh dispatches the tick via dispatcher-bridge.sh (overridable via FACTORY_DISPATCHER_BRIDGE)" {
  # T001845: the tick itself no longer calls claude/Workflow directly — that
  # moved into dispatcher-bridge.sh, invoked here as a plain bash subprocess.
  run grep -F 'FACTORY_DISPATCHER_BRIDGE' "$WAKEUP"
  [ "$status" -eq 0 ]
  run grep -E 'bash "\$\{DISPATCHER_BRIDGE\}"' "$WAKEUP"
  [ "$status" -eq 0 ]
}

@test "T001845: dispatcher-bridge.sh still allowlists the Workflow tool for its own per-ticket pipeline launches" {
  # Only the outer dispatcher-tick call moved off Workflow (T001845). The inner
  # per-ticket pipeline.js launch inside dispatcher-bridge.sh is a separate,
  # not-yet-fixed instance of the same failure class — it must still exist and
  # still be allowlisted correctly, so this asserts it wasn't silently dropped.
  BRIDGE="${BATS_TEST_DIRNAME}/../../../scripts/factory/dispatcher-bridge.sh"
  run grep -E '"\$\{CLAUDE_BIN:-claude\}"[[:space:]]+-p' "$BRIDGE"
  [ "$status" -eq 0 ]
  run grep -E -- '--allowedTools' "$BRIDGE"
  [ "$status" -eq 0 ]
  run grep -F 'Workflow' "$BRIDGE"
  [ "$status" -eq 0 ]
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

@test "T001845: wakeup.sh dispatches the tick via dispatcher-bridge.sh instead of forcing the model to call Workflow(dispatcher.js)" {
  # qwythos-9b-v2 (local model backing ANTHROPIC_MODEL) emits tool calls in a
  # non-standard XML form the harness's tool-call parser chokes on ("import
  # call expects one or two arguments"), causing the Workflow(dispatcher.js)
  # tick call to retry uselessly. dispatcher-bridge.sh (already built,
  # previously unwired) makes the tick itself pure bash for an empty queue —
  # no LLM/tool-call round trip at all.
  tmp="$(mktemp -d)"
  bridgefile="${tmp}/bridge-invoked"
  claudefile="${tmp}/claude-invoked"
  cat > "${tmp}/bridge-stub" <<STUB
#!/usr/bin/env bash
printf '%s\n' "\$@" > "${bridgefile}"
STUB
  chmod +x "${tmp}/bridge-stub"
  cat > "${tmp}/claude-stub" <<STUB
#!/usr/bin/env bash
printf '%s\n' "\$@" > "${claudefile}"
STUB
  chmod +x "${tmp}/claude-stub"
  FACTORY_REPO="${tmp}" FACTORY_CLAUDE_BIN="${tmp}/claude-stub" \
    FACTORY_DISPATCHER_BRIDGE="${tmp}/bridge-stub" FACTORY_DRY_RUN=true \
    FACTORY_TICK_LOCK="${tmp}/tick.lock" FACTORY_ENV_FILE="${tmp}/no-env" run bash "$WAKEUP"
  [ "$status" -eq 0 ]
  [ -f "${bridgefile}" ]
  [ ! -f "${claudefile}" ]
  rm -rf "${tmp}"
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

README="${BATS_TEST_DIRNAME}/../../../scripts/factory/README.md"

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
  cat > "${tmp}/bridge-stub" <<STUB
#!/usr/bin/env bash
exit 0
STUB
  chmod +x "${tmp}/bridge-stub"
  FACTORY_REPO="${tmp}" FACTORY_CLAUDE_BIN="${tmp}/claude-stub" \
    FACTORY_DISPATCHER_BRIDGE="${tmp}/bridge-stub" FACTORY_DRY_RUN=true \
    FACTORY_TICK_LOCK="${tmp}/tick.lock" FACTORY_ENV_FILE="${tmp}/no-env" \
    FACTORY_IDLE_RETICK_ENABLED=true run bash "$WAKEUP"
  [ "$status" -eq 0 ]
  [ ! -f "${argfile}" ]   # claude was NOT invoked — the tick is pure bash via dispatcher-bridge.sh
  rm -rf "${tmp}"
}

@test "FA-SF-41: wakeup.sh skips idle-retick when FACTORY_IDLE_RETICK_ENABLED=false" {
  run grep -E 'IDLE_RETICK.*true' "$WAKEUP"
  [ "$status" -eq 0 ]   # confirms the break path exists when disabled
}

# ── FA-SF-47-wakeup-reasoning-effort ────────────────────────────#
# FA-SF-47: wakeup.sh must NOT set reasoning_effort. [T000519]
# The Workflow harness forces thinking.type=disabled for nested agent() spawns.
# If reasoning_effort is ALSO set (via --effort or CLAUDE_CODE_EFFORT_LEVEL=<level>),
# the Anthropic-compatible endpoint (e.g. DeepSeek) returns:
#   400 thinking options type cannot be disabled when reasoning_effort is set
# which crashes the dispatcher PREP step. The fix is to leave reasoning_effort UNSET
# (not "low"). These cases are pure static greps — offline/CI-safe.
WAKEUP_SCRIPT="scripts/factory/wakeup.sh"

@test "FA-SF-47: wakeup.sh exists and is valid bash" {
  [ -f "$WAKEUP_SCRIPT" ]
  run bash -n "$WAKEUP_SCRIPT"
  [ "$status" -eq 0 ]
}

@test "FA-SF-47: claude is NOT invoked with --effort" {
  run grep -Eq -- '--effort' "$WAKEUP_SCRIPT"
  [ "$status" -ne 0 ]
}

@test "FA-SF-47: CLAUDE_CODE_EFFORT_LEVEL is never assigned a non-empty level" {
  # Allowed: `unset CLAUDE_CODE_EFFORT_LEVEL` or `CLAUDE_CODE_EFFORT_LEVEL=` (empty).
  # Forbidden: `CLAUDE_CODE_EFFORT_LEVEL=low|medium|high|max|...`.
  run grep -Eq 'CLAUDE_CODE_EFFORT_LEVEL=[A-Za-z]' "$WAKEUP_SCRIPT"
  [ "$status" -ne 0 ]
}

@test "FA-SF-47: wakeup.sh actively neutralizes any inherited effort level" {
  # autopilot.env may set CLAUDE_CODE_EFFORT_LEVEL; wakeup.sh must unset it.
  run grep -Eq 'unset[[:space:]]+CLAUDE_CODE_EFFORT_LEVEL' "$WAKEUP_SCRIPT"
  [ "$status" -eq 0 ]
}
