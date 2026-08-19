#!/usr/bin/env bats
# T011543 — opencode-exec muss nach einem erfolgreichen Lauf den PR-Schritt ausführen
# und bereits auf dem Branch liegende Implementierung als Erfolg erkennen.
#
# Hintergrund: Im FACTORY_EXECUTOR=opencode-Pfad verbietet der Prompt dem
# Orchestrator das PR-Öffnen ("the caller does that"), aber kein Aufrufer öffnete
# je den PR. Fertig gepushte Branches blieben plan_staged, jeder Re-Dispatch fand
# "nothing to commit" (exit 6) und nach 3 Runden wurde das Ticket samt fertiger
# Arbeit auf planning zurückgesetzt (beobachtet an T007968, 2026-08-17).
#
# Prüfmodus: Output-Verifikation (T002448-M4). Die Tests FÜHREN
# scripts/factory/opencode-exec.sh AUS und prüfen Exit-Code, gh-Aufrufe (Stub-Log)
# und Push-Ergebnis im Bare-Origin — sie greppen nicht die Quelldatei.
# Formatfreie Proben ohne Zeilenanker (T002716); Negativfälle tragen einen
# Positiv-Anker (T002356-M1).
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

  BRANCH="fix/stub-T011543"
  git -C "$LAUNCH" checkout -qb "$BRANCH"
  echo anchor > "$LAUNCH/anchor.txt"
  git -C "$LAUNCH" add -A
  git -C "$LAUNCH" commit -qm "chore: anchor branch $BRANCH"
  mkdir -p "$LAUNCH/openspec/changes/stub"
  echo "- [ ] Task" > "$LAUNCH/openspec/changes/stub/tasks.md"
  git -C "$LAUNCH" add -A
  git -C "$LAUNCH" commit -qm "chore(plans): stub plan [T011543]"
  git -C "$LAUNCH" push -q -u origin "$BRANCH"

  # Stubs vor den PATH: weder echter Orchestrator noch echtes gh dürfen laufen.
  STUB_BIN="$BATS_TEST_TMPDIR/bin"
  mkdir -p "$STUB_BIN"
  export PATH="$STUB_BIN:$PATH"
  GH_LOG="$BATS_TEST_TMPDIR/gh.log"
  export GH_LOG
  _stub_gh 0

  # Ticket-DB offline halten; agent-lock in tmp isolieren.
  export TICKET_OFFLINE=1
  export AGENT_LOCK_DIR="$BATS_TEST_TMPDIR/agent-locks"
}

# gh-Stub: loggt jeden Aufruf; `pr list … length` antwortet mit $1 offenen PRs.
_stub_gh() {
  local open_prs="$1"
  cat > "$STUB_BIN/gh" <<EOF
#!/usr/bin/env bash
echo "gh \$*" >> "\$GH_LOG"
case "\$1 \$2" in
  "pr list") echo "$open_prs" ;;
  "pr create") echo "https://github.invalid/pr/1" ;;
esac
exit 0
EOF
  chmod +x "$STUB_BIN/gh"
}

# Orchestrator-Stub, der einen Implementierungs-Commit erzeugt.
_stub_opencode_commits() {
  cat > "$STUB_BIN/opencode" <<'EOF'
#!/usr/bin/env bash
echo '{"type":"step_start"}'
echo implemented >> file.txt
git add -A
git commit -qm "fix(scripts): implementiert [T011543]"
exit 0
EOF
  chmod +x "$STUB_BIN/opencode"
}

# Orchestrator-Stub, der läuft, aber nichts hinterlässt.
_stub_opencode_noop() {
  cat > "$STUB_BIN/opencode" <<'EOF'
#!/usr/bin/env bash
echo '{"type":"step_start"}'
exit 0
EOF
  chmod +x "$STUB_BIN/opencode"
}

@test "T011543: nach erfolgreichem Lauf wird der Commit gepusht und ein PR geöffnet" {
  _stub_opencode_commits
  run bash "$EXEC" T011543 "$LAUNCH" "$BRANCH" openspec/changes/stub/tasks.md
  [ "$status" -eq 0 ]
  # Der Implementierungs-Commit liegt wirklich im Origin (Push hat stattgefunden).
  run git -C "$ORIGIN" log --format=%s "refs/heads/$BRANCH"
  [[ "$output" == *"implementiert [T011543]"* ]]
  # Und der PR-Schritt wurde ausgeführt.
  run cat "$GH_LOG"
  [[ "$output" == *"pr create"* ]]
  [[ "$output" == *"$BRANCH"* ]]
}

@test "T011543: bereits gepushte Implementierung auf dem Branch zählt als Erfolg (Orphan-Rettung)" {
  # Implementierung liegt schon auf dem Branch — wie nach einem Lauf, dessen
  # Nachlauf (PR) durch systemd-Kill verloren ging.
  echo implemented >> "$LAUNCH/file.txt"
  git -C "$LAUNCH" add -A
  git -C "$LAUNCH" commit -qm "fix(scripts): implementiert [T011543]"
  git -C "$LAUNCH" push -q origin "$BRANCH"
  _stub_opencode_noop
  run bash "$EXEC" T011543 "$LAUNCH" "$BRANCH" openspec/changes/stub/tasks.md
  [ "$status" -eq 0 ]
  run cat "$GH_LOG"
  [[ "$output" == *"pr create"* ]]
}

@test "T011543: nur Plan-/Anchor-Commits ahead of main bleiben ein leerer Lauf (exit 6, kein PR)" {
  # Positiv-Anker steckt in den beiden Tests oben: mit Implementierungs-Commit
  # wird der PR-Schritt ausgeführt. Hier: Branch trägt NUR chore(plans)/anchor.
  _stub_opencode_noop
  run bash "$EXEC" T011543 "$LAUNCH" "$BRANCH" openspec/changes/stub/tasks.md
  [ "$status" -eq 6 ]
  run cat "$GH_LOG"
  [[ "$output" != *"pr create"* ]]
}

@test "T011543: existiert bereits ein offener PR, wird kein zweiter erstellt" {
  _stub_gh 1
  _stub_opencode_commits
  run bash "$EXEC" T011543 "$LAUNCH" "$BRANCH" openspec/changes/stub/tasks.md
  [ "$status" -eq 0 ]
  run cat "$GH_LOG"
  # Der PR-Bestand wurde geprüft …
  [[ "$output" == *"pr list"* ]]
  # … aber kein neuer PR erstellt.
  [[ "$output" != *"pr create"* ]]
}
