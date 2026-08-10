#!/usr/bin/env bats
# T003335 — opencode-exec darf `implement/done` nicht allein aus dem Exit-Code ableiten.
#
# Pruefmodus: Output-Verifikation (T002448-M4). Der Test FUEHRT
# scripts/factory/opencode-exec.sh AUS und prueft dessen Exit-Code und Meldung —
# er greppt nicht die Quelldatei.
#
# Die Zusicherung haengt an der Semantik (entsteht ein Commit oder nicht), nicht am
# Wortlaut einer Meldung (T002716). Jeder Negativfall traegt einen Positiv-Anker
# (T002356-M1): ohne ihn bestuende "leerer Lauf wird abgelehnt" vakuos, sobald das
# Skript aus beliebigem Grund alles ablehnt.
#
# Der Orchestrator wird gestubbt — kein echter `opencode`-Aufruf, kein Modell, kein Netz.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  EXEC="$REPO_ROOT/scripts/factory/opencode-exec.sh"

  # Wegwerf-Worktree als LAUNCH_DIR: eigenes git-Repo, ein Basis-Commit.
  LAUNCH="$BATS_TEST_TMPDIR/launch"
  mkdir -p "$LAUNCH"
  git -C "$LAUNCH" init -q -b main
  git -C "$LAUNCH" config user.email t@example.invalid
  git -C "$LAUNCH" config user.name Test
  echo base > "$LAUNCH/file.txt"
  git -C "$LAUNCH" add -A
  git -C "$LAUNCH" commit -qm "base"

  # Stub-Verzeichnis vor den PATH — der echte Orchestrator darf nie laufen.
  STUB_BIN="$BATS_TEST_TMPDIR/bin"
  mkdir -p "$STUB_BIN"
  export PATH="$STUB_BIN:$PATH"

  # phase_event schreibt in die Ticket-DB; offline halten, es ist ohnehin `|| true`.
  export TICKET_OFFLINE=1
}

# Stub, der laeuft und mit 0 endet, aber KEINEN Commit erzeugt.
_stub_noop() {
  cat > "$STUB_BIN/opencode" <<'EOF'
#!/usr/bin/env bash
echo '{"type":"step_start"}'
exit 0
EOF
  chmod +x "$STUB_BIN/opencode"
}

# Stub, der einen echten Commit im cwd erzeugt und mit 0 endet.
_stub_commits() {
  cat > "$STUB_BIN/opencode" <<'EOF'
#!/usr/bin/env bash
echo '{"type":"step_start"}'
echo implemented >> file.txt
git add -A
git commit -qm "fix(scripts): implementiert [T003335]"
exit 0
EOF
  chmod +x "$STUB_BIN/opencode"
}

@test "T003335: Positiv-Anker — ein Lauf MIT Commit gilt weiterhin als erfolgreich" {
  _stub_commits
  run bash "$EXEC" T003335 "$LAUNCH" fix/stub-T003335 openspec/changes/stub/tasks.md
  [ "$status" -eq 0 ]
  # Der Commit ist wirklich entstanden — sonst prueft der Anker nichts.
  run git -C "$LAUNCH" log --oneline -1
  [[ "$output" == *"implementiert"* ]]
}

@test "T003335: ein Lauf OHNE Commit gilt NICHT als erfolgreich" {
  _stub_noop
  run bash "$EXEC" T003335 "$LAUNCH" fix/stub-T003335 openspec/changes/stub/tasks.md
  # Gegenprobe zuerst: der Stub hat tatsaechlich nichts committet.
  run git -C "$LAUNCH" log --oneline
  [ "$(printf '%s\n' "$output" | wc -l)" -eq 1 ]
  # Und der Executor darf das nicht als Erfolg melden.
  run bash "$EXEC" T003335 "$LAUNCH" fix/stub-T003335 openspec/changes/stub/tasks.md
  [ "$status" -ne 0 ]
}

@test "T003335: der leere Lauf wird diagnostiziert, das Run-Log nicht verschluckt" {
  _stub_noop
  run bash "$EXEC" T003335 "$LAUNCH" fix/stub-T003335 openspec/changes/stub/tasks.md
  [ "$status" -ne 0 ]
  # Formatfreie Probe: irgendeine Diagnose muss den Ticketbezug tragen.
  # Kein Zeilenanker, kein festgeschriebener Wortlaut (T002716).
  [[ "$output" == *"T003335"* ]]
  # Und die Ausgabe des Orchestrators muss erhalten bleiben, statt geloescht zu werden.
  [[ "$output" == *"step_start"* ]]
}
