#!/usr/bin/env bats
# tests/spec/scripts/check-worktree-live-no-env.bats
#
# Prüfmodus: command output verification.
#
# Regression: `_worktree_is_live_claimed` las `$AGENT_LOCK_DIR` direkt statt
# `_lock_dir()`. Unter `set -u` brach `check-worktree-live` damit ab, sobald der
# Aufrufer die Variable nicht exportierte — und worktree-clean-check.sh las den
# Abbruch als "nicht live claimed", hielt also einen fremd gehaltenen Worktree
# für löschbar. Die Bestandstests bemerkten das nicht, weil sie AGENT_LOCK_DIR
# selbst setzen. Dieser Test läuft deshalb bewusst OHNE die Variable — dieselbe
# Regel, die openspec/specs/active-sessions-hub.md für die SID-Auflösung
# festhält: mindestens ein Fall darf die Variable nicht vorsetzen.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  TMP="$(mktemp -d)"
  git init -q "$TMP/r"
  git -C "$TMP/r" config user.email t@e.com
  git -C "$TMP/r" config user.name T
  git -C "$TMP/r" commit -q --allow-empty -m init
}

teardown() {
  [ -n "${TMP:-}" ] && rm -rf "$TMP"
}

@test "check-worktree-live antwortet ohne gesetztes AGENT_LOCK_DIR" {
  run env -u AGENT_LOCK_DIR bash -c \
    "cd '$TMP/r' && bash '$REPO_ROOT/scripts/agent-lock.sh' check-worktree-live '$TMP/r'"

  # Die Zusicherung ist die Antwort selbst: 'free' oder 'live', nicht ein
  # Bash-Fehler. Vor dem Fix stand hier "AGENT_LOCK_DIR: unbound variable".
  [ "$output" = "free" ] || [ "$output" = "live" ]
  [[ "$output" != *"unbound variable"* ]]
}

@test "check-worktree-live meldet einen fremd gehaltenen Worktree als live (Positiv-Anker)" {
  lockdir="$TMP/r/.git/agent-locks"
  mkdir -p "$lockdir"
  cat > "$lockdir/branch__probe.json" <<JSON
{
  "scope": "branch",
  "id": "probe",
  "owner_sid": "fremde-session",
  "owner_pid": "$$",
  "tool": "claude",
  "label": "test",
  "worktree": "$TMP/r",
  "branch": "probe",
  "ticket": "",
  "host": "testhost",
  "created_at": "$(date +%s)",
  "heartbeat_at": "$(date +%s)"
}
JSON

  run env -u AGENT_LOCK_DIR bash -c \
    "cd '$TMP/r' && bash '$REPO_ROOT/scripts/agent-lock.sh' check-worktree-live '$TMP/r'"
  [ "$output" = "live" ]
  [ "$status" -eq 0 ]
}
