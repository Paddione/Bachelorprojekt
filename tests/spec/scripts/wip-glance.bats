#!/usr/bin/env bats
# wip-glance.sh — WIP-Uebersicht (read-only, fail-closed). [T900481]

setup() {
  GLANCE="$BATS_TEST_DIRNAME/../../../scripts/wip-glance.sh"
  FIX="$BATS_TEST_TMPDIR/fixture"
  BIN="$BATS_TEST_TMPDIR/bin"
  LOCKS="$BATS_TEST_TMPDIR/locks"
  WT_DIR="$BATS_TEST_TMPDIR/wt"
  mkdir -p "$FIX/scripts" "$BIN" "$LOCKS" "$WT_DIR"
  cat > "$FIX/scripts/agent-lock.sh" <<'STUB'
#!/usr/bin/env bash
# Stub: emuliert agent-lock.sh list mit einem deterministischen Zustand.
printf '%-14s %-24s %-8s %-10s %-6s %-20s %s\n' SCOPE ID TOOL SID STATE LABEL FILE
for f in "$AGENT_LOCK_DIR"/*.json; do
  [ -e "$f" ] || continue
  name="$(basename "$f" .json)"
  printf '%-14s %-24s %-8s %-10s %-6s %-20s %s\n' \
    "$(jq -r '.scope // ""' "$f")" "$(jq -r '.id // ""' "$f")" "$(jq -r '.tool // ""' "$f")" \
    "$(jq -r '.owner_sid // ""' "$f")" "$(jq -r '.fake_state // "live"' "$f")" \
    "$(jq -r '.label // ""' "$f")" "$name"
done
STUB
  cat > "$BIN/git" <<'STUB'
#!/usr/bin/env bash
# Stub-git: beantwortet nur die Aufrufe, die wip-glance.sh tatsaechlich braucht.
args="$*"
case "$args" in
  "rev-parse --show-toplevel") echo "$FIX_REPO" ;;
  "rev-parse --git-common-dir") echo "$BATS_TEST_TMPDIR/cgd" ;;
  "rev-parse --verify origin/main") exit 0 ;;
  "worktree list --porcelain") cat "$FIX_WT" ;;
  "for-each-ref --format=%(refname:short) refs/heads/") cat "$FIX_BRANCHES" 2>/dev/null || true ;;
  "stash list --format=%gd|%ci") cat "$FIX_STASHES" 2>/dev/null || true ;;
  *"-C $WT_DIR status --porcelain"*) cat "$FIX_STATUS" ;;
  *"-C $WT_DIR log -1 --format=%ct"*) cat "$FIX_HEAD_TS" ;;
  *) exit 0 ;;
esac
STUB
  chmod +x "$BIN/git" "$FIX/scripts/agent-lock.sh"
  export FIX_REPO="$FIX" FIX_WT="$BATS_TEST_TMPDIR/porcelain" WT_DIR="$WT_DIR" \
         FIX_STATUS="$BATS_TEST_TMPDIR/status" FIX_HEAD_TS="$BATS_TEST_TMPDIR/headts" \
         FIX_BRANCHES="$BATS_TEST_TMPDIR/branches" FIX_STASHES="$BATS_TEST_TMPDIR/stashes"
  export AGENT_LOCK_DIR="$LOCKS" PATH="$BIN:$PATH"
  { printf 'worktree %s\n' "$WT_DIR"; printf 'HEAD %040d\n' 0; printf 'branch refs/heads/feature/x\n'; } > "$FIX_WT"
  : > "$FIX_STATUS"
  : > "$FIX_STASHES"
  : > "$FIX_BRANCHES"
  date +%s > "$FIX_HEAD_TS"
}

@test "wip-glance: --json liefert parsebares JSON mit worktrees-Array" {
  run bash "$GLANCE" --json --repo "$FIX_REPO"
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.worktrees | length == 1' > /dev/null
  echo "$output" | jq -e '.worktrees[0] | has("path") and has("state") and has("age_hours")' > /dev/null
  echo "$output" | jq -e 'has("locks") and has("prs") and has("stashes")' > /dev/null
}

@test "wip-glance: --quiet gibt genau eine Zusammenfassungszeile" {
  run bash "$GLANCE" --quiet --repo "$FIX_REPO"
  [ "$status" -eq 0 ]
  [ "${#lines[@]}" -eq 1 ]
  [[ "$output" == abandoned=* ]]
  [[ "$output" == *"stashes="* ]]
}

@test "wip-glance: read-only — Legt keine Lock-Datei an und veraendert die Lock-Liste nicht" {
  printf '%s\n' '{"scope":"branch","id":"feature/x","label":"dev","fake_state":"live"}' > "$LOCKS/branch__feature-x.json"
  before_list="$(bash "$FIX/scripts/agent-lock.sh" list)"
  before_files="$(ls -1 "$LOCKS" | sort | tr '\n' ' ')"
  run bash "$GLANCE" --json --repo "$FIX_REPO"
  [ "$status" -eq 0 ]
  after_list="$(bash "$FIX/scripts/agent-lock.sh" list)"
  after_files="$(ls -1 "$LOCKS" | sort | tr '\n' ' ')"
  [ "$before_list" = "$after_list" ]
  [ "$before_files" = "$after_files" ]
}

@test "wip-glance: Worktree mit live-Lock ist 'live', ohne Lock 'idle'" {
  printf ' M scripts/foo.sh\n' > "$FIX_STATUS"
  date -d '2 days ago' +%s > "$FIX_HEAD_TS"
  printf '%s\n' '{"scope":"branch","id":"feature/x","label":"dev","fake_state":"live"}' > "$LOCKS/branch__feature-x.json"
  run bash "$GLANCE" --json --repo "$FIX_REPO"
  [ "$status" -eq 0 ]
  [ "$(echo "$output" | jq -r '.worktrees[0].state')" = live ]

  rm "$LOCKS/branch__feature-x.json"
  run bash "$GLANCE" --json --repo "$FIX_REPO" --stale-hours 999999
  [ "$status" -eq 0 ]
  [ "$(echo "$output" | jq -r '.worktrees[0].state')" = unlocked-dirty ]
}

@test "wip-glance: dirty + alter Commit jenseits --stale-hours = 'abandoned'" {
  printf '?? neu.txt\n M scripts/foo.sh\n' > "$FIX_STATUS"
  date -d '3 days ago' +%s > "$FIX_HEAD_TS"
  run bash "$GLANCE" --json --repo "$FIX_REPO" --stale-hours 24
  [ "$status" -eq 0 ]
  [ "$(echo "$output" | jq -r '.worktrees[0].state')" = abandoned ]
  [ "$(echo "$output" | jq -r '.worktrees[0].untracked')" = 1 ]
  [ "$(echo "$output" | jq -r '.worktrees[0].modified')" = 1 ]
}

@test "wip-glance: fail-closed bei kaputten Argumenten (exit 2, keine Ausgabe)" {
  run bash "$GLANCE" --unsinn --repo "$FIX_REPO"
  [ "$status" -eq 2 ]
  run bash "$GLANCE" --stale-hours abc --repo "$FIX_REPO"
  [ "$status" -eq 2 ]
  run bash "$GLANCE" --stale-hours --repo "$FIX_REPO"
  [ "$status" -eq 2 ]
}
