#!/usr/bin/env bats
# T012965 — Verhalten des Guard-Plugins, nicht sein Quelltext.
#
# Die drei Defekte der ersten Fassung (exec.args statt exec.arguments,
# process.cwd() statt der Sitzungs-cwd, {action:} statt {kind:}) machten den
# Guard je fuer sich wirkungslos — und keiner davon war dem Quelltext
# anzusehen. Diese Faelle fahren die Logik ueber repo-guard-drive.mjs.
bats_require_minimum_version 1.5.0

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  DRIVER="$BATS_TEST_DIRNAME/repo-guard-drive.mjs"
  GUARD="$REPO/tools/dsh/plugins/repo-guard.mjs"
  command -v node >/dev/null 2>&1 || skip "node not installed"
}

# Eine Fallzeile aus der Treiberausgabe holen.
drive_case() { node "$DRIVER" "$GUARD" | grep "\"case\":\"$1\""; }

@test "repo-guard registriert einen tools/pre-execute-Listener" {
  run drive_case registration
  [ "$status" -eq 0 ]
  [[ "$output" == *'"ok":true'* ]]
}

@test "Schreibzugriff im Arbeitsverzeichnis wird delegiert" {
  run drive_case write-inside
  [[ "$output" == *'"delegated":true'* ]]
}

@test "Schreibzugriff ausserhalb wird mit kind=deny und Begruendung abgelehnt" {
  run drive_case write-outside
  [[ "$output" == *'"kind":"deny"'* ]]
  [[ "$output" == *'/etc/passwd'* ]]
}

@test "ein ..-Ausbruch wird aufgeloest und abgelehnt" {
  run drive_case write-escape-dotdot
  [[ "$output" == *'"kind":"deny"'* ]]
}

@test "ein Nachbarverzeichnis mit gleichem Praefix wird abgelehnt" {
  # Ohne Trennzeichen-Pruefung wuerde '/tmp/session-workspace-evil' als
  # 'innerhalb von /tmp/session-workspace' durchgehen.
  run drive_case prefix-trap
  [[ "$output" == *'"kind":"deny"'* ]]
}

@test "lesende Werkzeuge passieren ungeprueft" {
  run drive_case read-tool-outside
  [[ "$output" == *'"delegated":true'* ]]
}

@test "ohne Agent gibt es keine Grenze — es wird delegiert, nicht gegen process.cwd geprueft" {
  run drive_case no-agent
  [[ "$output" == *'"delegated":true'* ]]
}
