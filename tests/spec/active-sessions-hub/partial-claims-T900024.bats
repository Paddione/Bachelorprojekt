#!/usr/bin/env bats

# PRUEFMODUS: Output-Verifikation
# Spec: active-sessions-hub.md
# Feature: T900024 — kooperative Partial-Claims (Dateiliste am Claim)
#
# Geprueft wird ausschliesslich der Exit-Code und die Fehlerausgabe von
# `scripts/hooks/worktree-write-guard.sh` bei echter JSON-Eingabe auf stdin
# sowie der Exit-Code von `scripts/agent-lock.sh claim` — nicht der Quelltext
# der beiden Skripte (Konvention T002448-M4).

setup() {
  REPO_ROOT="$(pwd)"
  GUARD="$REPO_ROOT/scripts/hooks/worktree-write-guard.sh"
  LOCK="$REPO_ROOT/scripts/agent-lock.sh"

  BATS_TMPDIR=$(mktemp -d)
  REPO="$BATS_TMPDIR/repo"
  mkdir -p "$REPO/src"

  cd "$REPO"
  git init -b main >/dev/null
  git config user.email "test@example.com"
  git config user.name "Test User"
  printf 'a\n' > src/fileA.txt
  printf 'b\n' > src/fileB.txt
  git add -A >/dev/null
  git commit -q -m "chore: init"

  export AGENT_LOCK_DIR="$BATS_TMPDIR/locks"
  mkdir -p "$AGENT_LOCK_DIR"

  SID_A="sid-partial-a"
  SID_B="sid-partial-b"

  FILE_A="$REPO/src/fileA.txt"
  FILE_B="$REPO/src/fileB.txt"
}

teardown() {
  cd "$REPO_ROOT" 2>/dev/null || true
  rm -rf "$BATS_TMPDIR"
}

_guard() {  # <sid> <zielpfad>
  AGENT_LOCK_SID="$1" bash "$GUARD" \
    <<< "$(printf '{"tool_input":{"file_path":"%s"}}' "$2")"
}

_claim_a_on_fileA() {
  AGENT_LOCK_SID="$SID_A" bash "$LOCK" claim partial p1 \
    --worktree "$REPO" --branch main --label "partial p1" \
    --files "src/fileA.txt"
}

@test "agent-lock claim: --files wird akzeptiert und persistiert die Dateiliste" {
  run _claim_a_on_fileA
  [ "$status" -eq 0 ]

  run cat "$AGENT_LOCK_DIR/partial__p1.json"
  [ "$status" -eq 0 ]
  [[ "$output" == *"target_files"* ]]
  [[ "$output" == *"src/fileA.txt"* ]]
}

@test "guard: fremder Partial-Claim laesst die NICHT geclaimte Datei zu" {
  _claim_a_on_fileA

  run _guard "$SID_B" "$FILE_B"
  [ "$status" -eq 0 ]
}

@test "guard: Session B darf ein zweites Partial im selben Worktree claimen" {
  _claim_a_on_fileA

  run env AGENT_LOCK_SID="$SID_B" bash "$LOCK" claim partial p2 \
    --worktree "$REPO" --branch main --label "partial p2" \
    --files "src/fileB.txt"
  [ "$status" -eq 0 ]
}

@test "guard: Zugriff auf die fremd geclaimte Datei wird unter Nennung des Halters abgelehnt" {
  _claim_a_on_fileA
  AGENT_LOCK_SID="$SID_B" bash "$LOCK" claim partial p2 \
    --worktree "$REPO" --branch main --label "partial p2" \
    --files "src/fileB.txt"

  run _guard "$SID_B" "$FILE_A"
  [ "$status" -eq 2 ]
  [[ "$output" == *"$SID_A"* ]]
  [[ "$output" == *"src/fileA.txt"* ]]
}

@test "guard: eigene Datei bleibt schreibbar, waehrend das fremde Partial lebt" {
  _claim_a_on_fileA
  AGENT_LOCK_SID="$SID_B" bash "$LOCK" claim partial p2 \
    --worktree "$REPO" --branch main --label "partial p2" \
    --files "src/fileB.txt"

  run _guard "$SID_B" "$FILE_B"
  [ "$status" -eq 0 ]
}

@test "guard: Claim OHNE Dateiliste bleibt worktree-weit sperrend (Rueckfallebene)" {
  AGENT_LOCK_SID="$SID_A" bash "$LOCK" claim branch main-worktree \
    --worktree "$REPO" --branch main --label "ganzer worktree"

  run _guard "$SID_B" "$FILE_B"
  [ "$status" -eq 2 ]
  [[ "$output" == *"$SID_A"* ]]
}
