#!/usr/bin/env bats
# wip-finish.sh — Sicherheitsmodell des abandoned-WIP-Finishers. [T900481]
#
# Diese Suite testet bewusst das FALSCHE Verhalten: dass wip-finish im
# Planlauf nichts anfasst, ohne --allow nichts ausfuehrt, fremde Arbeit nicht
# committed und eine Rail-Antwort mit nicht angebotener Aktion verwirft.

setup() {
  FINISH="$BATS_TEST_DIRNAME/../../../scripts/wip-finish.sh"
  FIX="$BATS_TEST_TMPDIR/repo"
  mkdir -p "$FIX/scripts" "$BATS_TEST_TMPDIR/locks" "$BATS_TEST_TMPDIR/bin"
  export AGENT_LOCK_DIR="$BATS_TEST_TMPDIR/locks"

  # stub agent-lock.sh: kein mine, leere Liste
  cat > "$FIX/scripts/agent-lock.sh" <<'EOS'
case "${1:-}" in
  mine) exit 1 ;;
  list) exit 0 ;;
  *)   exit 0 ;;
esac
EOS

  # stub curl: Rail antwortet, Inhalt per $STUB_RAIL_REPLY
  # Nur die 2. GPU (:1920) ist als Rail "erreichbar" — alles andere (z.B. :1)
  # bleibt bewusst unreachable, damit die fail-closed-Pfade testbar sind.
  cat > "$BATS_TEST_TMPDIR/bin/curl" <<'EOS'
case "$*" in
  *"127.0.0.1:1920/v1/models"*) printf '{"data":[{"id":"stub-4b"}]}' ;;
  *"127.0.0.1:1920/v1/chat/completions"*)
    body="${STUB_RAIL_REPLY:-ACT=none|REASON=keine}"
    jq -nc --arg c "$body" '{choices:[{message:{content:$c}}]}' ;;
  *) exit 7 ;;
esac
EOS
  chmod +x "$BATS_TEST_TMPDIR/bin/curl"
  export PATH="$BATS_TEST_TMPDIR/bin:$PATH"
}

# $1 = JSON-Fragment der worktrees
glance_stub() {
  cat > "$FIX/scripts/wip-glance.sh" <<EOS
#!/usr/bin/env bash
cat <<'JSON'
{"repo":"$FIX","stale_hours":24,
 "worktrees":[$1],
 "locks":[],"prs":[],"branches":[],"stashes":0,"stash_list":[]}
JSON
EOS
  chmod +x "$FIX/scripts/wip-glance.sh"
}

# Felder exakt wie scripts/wip-glance.sh --json sie emittiert.
wt() { printf '{"path":"%s","head":"deadbeef","branch":"%s","state":"%s","modified":%s,"deleted":0,"untracked":0,"age_hours":%s,"locked":false,"prunable":false}' "$1" "$2" "$3" "$4" "$5"; }

run_finish() { run bash "$FINISH" --repo "$FIX" --rails 127.0.0.1:1 "$@"; }

@test "wip-finish: fail-closed — unbekanntes Argument exit 2" {
  run bash "$FINISH" --repo "$FIX" --unsinn
  [ "$status" -eq 2 ]
  [[ "$output" == *"unbekanntes Argument"* ]]
}

@test "wip-finish: fail-closed — --stale-hours ohne Zahl exit 2" {
  run bash "$FINISH" --repo "$FIX" --stale-hours abc
  [ "$status" -eq 2 ]
  [[ "$output" == *"--stale-hours braucht eine Zahl"* ]]
}

@test "wip-finish: --require-rail ohne erreichbare Rail exit 1" {
  glance_stub "$(wt "$FIX" feature/x-T900481 abandoned 2 40)"
  run_finish --require-rail
  [ "$status" -eq 1 ]
  [[ "$output" == *"keine Rail erreichbar"* ]]
}

@test "wip-finish: plan-only laeuft read-only und meldet Kandidaten" {
  glance_stub "$(wt "$FIX" feature/x-T900481 abandoned 2 40),$(wt "$FIX/wt2" feature/live-T900481 live 1 1)"
  printf 'dirty
' > "$BATS_TEST_TMPDIR/marker"
  before="$(cd "$BATS_TEST_TMPDIR" && ls -A | sort)"
  run_finish --json
  [ "$status" -eq 0 ]
  [ "$(jq -r '.apply' <<< "$output")" = "0" ]
  # abandoned+dirty -> commit-dirty, live -> none
  [ "$(jq -r '.plan[]|select(.state=="abandoned")|.id' <<< "$output")" = "$FIX" ]
  [ "$(jq -r '.plan[]|select(.state=="abandoned")|.action' <<< "$output")" = "commit-dirty" ]
  [ "$(jq -r '.plan[]|select(.state=="live")|.action' <<< "$output")" = "none" ]
  after="$(cd "$BATS_TEST_TMPDIR" && ls -A | sort)"
  [ "$before" = "$after" ]
  [ "$(cat "$BATS_TEST_TMPDIR/marker")" = "dirty" ]
}

@test "wip-finish: --apply ohne --allow fuehrt nichts aus" {
  glance_stub "$(wt "$FIX" feature/x-T900481 abandoned 2 40)"
  run_finish --apply --json
  [ "$status" -eq 0 ]
  [ "$(jq -r '.plan[0].applied' <<< "$output")" = "skipped (nicht im --allow)" ]
}

@test "wip-finish: commit-dirty ohne eigenen Live-Lock wird uebersprungen" {
  glance_stub "$(wt "$FIX" feature/x-T900481 abandoned 2 40)"
  run_finish --apply --allow commit-dirty --json
  [ "$status" -eq 0 ]
  [[ "$(jq -r '.plan[0].applied' <<< "$output")" == *"kein eigener live Lock"* ]]
}

@test "wip-finish: Rail-Antwort mit nicht angebotener Aktion wird verworfen" {
  glance_stub "$(wt "$FIX" feature/x-T900481 abandoned 2 40)"
  export STUB_RAIL_REPLY="ACT=rm-rf-slash|REASON=zu riskant"
  run_finish --rails 127.0.0.1:1920 --json
  [ "$status" -eq 0 ]
  [ "$(jq -r '.plan[0].rail_action' <<< "$output")" = "none" ]
  [[ "$(jq -r '.plan[0].reason' <<< "$output")" == *"verworfen"* ]]
}

@test "wip-finish: gueltige Rail-Empfehlung ueberschreibt die Heuristik" {
  glance_stub "$(wt "$FIX" feature/x-T900481 abandoned 0 40),$(wt "$FIX/wt2" feature/y-T900481 abandoned 0 40)"
  export STUB_RAIL_REPLY="ACT=review-stash|REASON=erst Diff pruefen"
  run_finish --rails 127.0.0.1:1920 --json
  [ "$status" -eq 0 ]
  # Heuristik waere review-stash, Rail sagt dasselbe -> rail_action bestaetigt
  [ "$(jq -r '.plan[0].rail_action' <<< "$output")" = "review-stash" ]
  [ "$(jq -r '.plan[0].action' <<< "$output")" = "review-stash" ]
}

@test "wip-finish: unbrauchbare Rail-Antwort faellt auf die Heuristik zurueck" {
  glance_stub "$(wt "$FIX" feature/x-T900481 abandoned 2 40)"
  export STUB_RAIL_REPLY="Ich denke man sollte vielleicht committen, ohne ACT zu nennen."
  run_finish --rails 127.0.0.1:1920 --json
  [ "$status" -eq 0 ]
  [ "$(jq -r '.plan[0].action' <<< "$output")" = "commit-dirty" ]
  [[ "$(jq -r '.plan[0].reason' <<< "$output")" == *"unbrauchbar"* ]]
}

@test "wip-finish: Stashes landen in review-stash, nie in commit-dirty" {
  glance_stub "$(wt "$FIX" feature/x-T900481 abandoned 0 40)"
  cat > "$FIX/scripts/wip-glance.sh" <<EOS
#!/usr/bin/env bash
cat <<'JSON'
{"repo":"$FIX","stale_hours":24,"worktrees":[$1],
 "locks":[],"prs":[],"branches":[],"stashes":2,
 "stash_list":[{"index":"stash@{0}","date":"2026-09-20 10:00:00 +0200"},
               {"index":"stash@{1}","date":"2026-09-21 10:00:00 +0200"}]}
JSON
EOS
  run_finish --json
  [ "$status" -eq 0 ]
  [ "$(jq -r '.plan[]|select(.kind=="stash")|.action' <<< "$output" | sort -u)" = "review-stash" ]
}
