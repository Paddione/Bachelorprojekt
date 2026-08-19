#!/usr/bin/env bats
# T011543 — Doppel-Dispatch-Schutz: läuft für dasselbe Ticket bereits ein
# Orchestrator-Prozess, darf opencode-exec keinen zweiten in denselben Worktree
# starten (beobachtet 2026-08-17: T008635-Läufe von 20:27 und 20:45 gleichzeitig
# im selben Worktree — der Branch-Lock griff nicht, weil der Eltern-Prozess des
# ersten Laufs tot war, der Orchestrator aber weiterlief).
#
# Prüfmodus: Output-Verifikation (T002448-M4) — das Skript wird AUSGEFÜHRT;
# geprüft werden Exit-Code und dass der Stub-Orchestrator NICHT lief.
# Positiv-Anker (T002356-M1): ohne laufenden Fremdprozess startet derselbe
# Aufruf durch und der Stub hinterlässt seine Marker-Datei.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  EXEC="$REPO_ROOT/scripts/factory/opencode-exec.sh"

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
  BRANCH="fix/stub-run-T011543"
  git -C "$LAUNCH" checkout -qb "$BRANCH"
  mkdir -p "$LAUNCH/openspec/changes/stub"
  echo "- [ ] Task" > "$LAUNCH/openspec/changes/stub/tasks.md"
  git -C "$LAUNCH" add -A
  git -C "$LAUNCH" commit -qm "chore(plans): stub plan [T011543]"
  git -C "$LAUNCH" push -q -u origin "$BRANCH"

  STUB_BIN="$BATS_TEST_TMPDIR/bin"
  mkdir -p "$STUB_BIN"
  export PATH="$STUB_BIN:$PATH"
  MARKER="$BATS_TEST_TMPDIR/orchestrator-ran"
  export MARKER
  cat > "$STUB_BIN/opencode" <<'EOF'
#!/usr/bin/env bash
touch "$MARKER"
echo implemented >> file.txt
git add -A
git commit -qm "fix(scripts): implementiert [T011543]"
exit 0
EOF
  chmod +x "$STUB_BIN/opencode"
  # gh-Stub, damit der PR-Schritt offline bleibt.
  cat > "$STUB_BIN/gh" <<'EOF'
#!/usr/bin/env bash
case "$1 $2" in "pr list") echo 0 ;; esac
exit 0
EOF
  chmod +x "$STUB_BIN/gh"

  export TICKET_OFFLINE=1
  export AGENT_LOCK_DIR="$BATS_TEST_TMPDIR/agent-locks"
}

@test "T011543: Positiv-Anker — ohne laufenden Fremdprozess startet der Orchestrator" {
  run bash "$EXEC" TSTUB901 "$LAUNCH" "$BRANCH" openspec/changes/stub/tasks.md
  [ "$status" -eq 0 ]
  [ -f "$MARKER" ]
}

@test "T011543: läuft bereits ein Orchestrator für das Ticket, wird NICHT erneut gestartet" {
  # Fremdprozess, dessen cmdline die Orchestrator-Signatur dieses Tickets trägt.
  # `sleep 30; :` statt `sleep 30`: ein Einzelkommando würde bash per exec
  # ersetzen und der Marker ($0) verschwände aus der cmdline.
  bash -c 'sleep 30; :' "Implement ticket TSTUB902 from its staged plan" &
  BLOCKER=$!
  run bash "$EXEC" TSTUB902 "$LAUNCH" "$BRANCH" openspec/changes/stub/tasks.md
  kill "$BLOCKER" 2>/dev/null || true
  [ "$status" -ne 0 ]
  [ ! -f "$MARKER" ]
}
