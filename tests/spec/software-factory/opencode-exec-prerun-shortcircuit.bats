#!/usr/bin/env bats
# tests/spec/software-factory/opencode-exec-prerun-shortcircuit.bats
# SSOT: openspec/specs/software-factory.md
# T011581 — Pre-Run-Orphan-Kurzschluss: liegt der Implementierungs-Commit [EXT_ID]
# bereits gepusht auf dem Branch und ist der Worktree sauber, darf opencode-exec.sh
# KEINEN Orchestrator-Lauf mehr starten, sondern geht direkt zum PR-Schritt.
#
# Hintergrund: Die Orphan-Rettung aus T011543 sitzt im Ergebnis-Check HINTER dem
# opencode-Aufruf — ein fertig gepushtes Ticket verbrannte erst einen kompletten
# serialisierten Orchestrator-Lauf (max_inflight=1), bevor die fertige Arbeit
# erkannt wurde. Beobachtet 2026-08-17 an T008014: Commit seit 20:34 auf origin,
# danach zwei volle Re-Implement-Läufe.
#
# Prüfmodus: Output-Verifikation (T002448-M4). Die Tests FÜHREN
# scripts/factory/opencode-exec.sh AUS und prüfen Exit-Code, das
# Orchestrator-Stub-Log (wurde das LLM aufgerufen?) und das gh-Stub-Log —
# sie greppen nicht die Quelldatei. Negativfälle tragen einen Positiv-Anker
# (T002356-M1): ohne vorliegende Implementierung WIRD der Orchestrator gestartet.
#
# Orchestrator (opencode) und gh sind gestubbt — kein Modell, kein Netz.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  EXEC="$REPO_ROOT/scripts/factory/opencode-exec.sh"

  # Bare-Origin + Arbeits-Klon: origin/main existiert, Feature-Branch ist gepusht.
  ORIGIN="$BATS_TEST_TMPDIR/origin.git"
  git init -q --bare "$ORIGIN"
  LAUNCH="$BATS_TEST_TMPDIR/launch"
  git init -q -b main "$LAUNCH"
  git -C "$LAUNCH" config user.email t@example.invalid
  git -C "$LAUNCH" config user.name Test
  echo base > "$LAUNCH/file.txt"
  git -C "$LAUNCH" add -A
  git -C "$LAUNCH" commit -qm "base"
  git -C "$LAUNCH" remote add origin "$ORIGIN"
  git -C "$LAUNCH" push -q origin main

  BRANCH="fix/stub-T011581"
  git -C "$LAUNCH" checkout -qb "$BRANCH"
  mkdir -p "$LAUNCH/openspec/changes/stub"
  echo "- [ ] Task" > "$LAUNCH/openspec/changes/stub/tasks.md"
  git -C "$LAUNCH" add -A
  git -C "$LAUNCH" commit -qm "chore(plans): stub plan [T011581]"
  git -C "$LAUNCH" push -q -u origin "$BRANCH"

  # Stubs vor den PATH: weder echter Orchestrator noch echtes gh dürfen laufen.
  STUB_BIN="$BATS_TEST_TMPDIR/bin"
  mkdir -p "$STUB_BIN"
  export PATH="$STUB_BIN:$PATH"
  GH_LOG="$BATS_TEST_TMPDIR/gh.log"
  export GH_LOG
  OC_LOG="$BATS_TEST_TMPDIR/opencode.log"
  export OC_LOG
  _stub_gh
  _stub_opencode

  # Ticket-DB offline halten; agent-lock in tmp isolieren.
  export TICKET_OFFLINE=1
  export AGENT_LOCK_DIR="$BATS_TEST_TMPDIR/agent-locks"
}

# gh-Stub: loggt jeden Aufruf; `pr list … length` meldet 0 offene PRs.
_stub_gh() {
  cat > "$STUB_BIN/gh" <<'EOF'
#!/usr/bin/env bash
echo "gh $*" >> "$GH_LOG"
case "$1 $2" in
  "pr list") echo "0" ;;
  "pr create") echo "https://github.invalid/pr/1" ;;
esac
exit 0
EOF
  chmod +x "$STUB_BIN/gh"
}

# Orchestrator-Stub: loggt den Aufruf (DAS ist die Messgröße dieses Tests) und
# erzeugt einen Implementierungs-Commit, damit der Positiv-Anker-Lauf als done endet.
_stub_opencode() {
  cat > "$STUB_BIN/opencode" <<'EOF'
#!/usr/bin/env bash
echo "opencode $*" >> "$OC_LOG"
echo implemented >> file.txt
git add -A
git commit -qm "fix(scripts): implementiert [T011581]"
exit 0
EOF
  chmod +x "$STUB_BIN/opencode"
}

@test "T011581: gepushte Implementierung + sauberer Worktree => kein Orchestrator-Lauf, PR-Schritt läuft" {
  # Implementierung liegt schon gepusht auf dem Branch (wie nach einem Lauf,
  # dessen Nachlauf durch systemd-Kill verloren ging).
  echo implemented >> "$LAUNCH/file.txt"
  git -C "$LAUNCH" add -A
  git -C "$LAUNCH" commit -qm "fix(scripts): implementiert [T011581]"
  git -C "$LAUNCH" push -q origin "$BRANCH"

  run env OPENCODE_BIN="$STUB_BIN/opencode" bash "$EXEC" T011581 "$LAUNCH" "$BRANCH" openspec/changes/stub/tasks.md
  [ "$status" -eq 0 ]
  # Kernaussage: der Orchestrator wurde NICHT gestartet …
  [ ! -s "$OC_LOG" ]
  # … der PR-Schritt aber sehr wohl ausgeführt.
  run cat "$GH_LOG"
  [[ "$output" == *"pr create"* ]]
}

@test "T011581: Positiv-Anker — ohne vorliegende Implementierung WIRD der Orchestrator gestartet" {
  run env OPENCODE_BIN="$STUB_BIN/opencode" bash "$EXEC" T011581 "$LAUNCH" "$BRANCH" openspec/changes/stub/tasks.md
  [ "$status" -eq 0 ]
  run cat "$OC_LOG"
  [[ "$output" == *"opencode"* ]]
}

@test "T011581: schmutziger Worktree verhindert den Kurzschluss — Orchestrator läuft" {
  # Implementierung gepusht, aber der Worktree trägt uncommittete Reste eines
  # abgebrochenen Laufs: der Kurzschluss darf NICHT greifen (der Orchestrator
  # muss die Reste bewerten/zu Ende bringen).
  echo implemented >> "$LAUNCH/file.txt"
  git -C "$LAUNCH" add -A
  git -C "$LAUNCH" commit -qm "fix(scripts): implementiert [T011581]"
  git -C "$LAUNCH" push -q origin "$BRANCH"
  echo halbfertig > "$LAUNCH/rest.txt"

  run env OPENCODE_BIN="$STUB_BIN/opencode" bash "$EXEC" T011581 "$LAUNCH" "$BRANCH" openspec/changes/stub/tasks.md
  [ "$status" -eq 0 ]
  run cat "$OC_LOG"
  [[ "$output" == *"opencode"* ]]
}
