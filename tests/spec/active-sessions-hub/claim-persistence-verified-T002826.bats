#!/usr/bin/env bats
# SSOT: openspec/specs/active-sessions-hub.md
# Ticket: T002826 — `agent-lock.sh claim` returns exit 0 while the lock is NOT held.
#
# cmd_claim ends in `CREATED="$(_now)"; _write_lock "$f"; return 0` — the return
# value is unconditional, so every way the write can fail is reported as success:
#   (a) the lock directory is not writable / not creatable  (reproduced below)
#   (b) _lock_dir() silently falls back to /tmp/agent-locks when `git rev-parse`
#       fails, so the claim lands in a different registry than the later check
#       reads (reproduced below)
# Both produce the reported symptom exactly: claim rc=0, `check` says "free".
#
# Prüfmodus: command output verification (T002448-M4) — jeder Test FÜHRT
# agent-lock.sh AUS und prüft Exit-Code plus die Existenz der Lock-Datei.
# Kein grep auf den Skript-Quelltext.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  AGENT_LOCK="$REPO_ROOT/scripts/agent-lock.sh"
  export AGENT_LOCK_SID="session-persist-$$"
  # Kein Netz-/Reap-Aufwand im Test: cmd_claim ruft cmd_reap vor jedem Claim.
  export AGENT_LOCK_FETCH_TTL=99999
}

teardown() {
  rm -f /tmp/agent-locks/ticket__TPERSIST3-$$.json 2>/dev/null || true
}

@test "claim reports a non-zero exit when the lock file cannot be persisted" {
  # Positiv-Anker: derselbe Claim in ein schreibbares Lock-Dir MUSS gelingen und
  # die Lock-Datei MUSS danach existieren. Ohne diesen Anker wäre die
  # Negativ-Aussage unten vakuos (ein generell kaputtes claim bestünde sie).
  export AGENT_LOCK_DIR="$BATS_TEST_TMPDIR/ok"
  run bash "$AGENT_LOCK" claim ticket TPERSIST1 --label probe --worktree "$BATS_TEST_TMPDIR"
  [ "$status" -eq 0 ]
  [ -f "$AGENT_LOCK_DIR/ticket__TPERSIST1.json" ]

  # Negativfall: das Lock-Dir liegt unterhalb einer regulären Datei, `mkdir -p`
  # und die Umleitung in die .tmp-Datei scheitern also zwangsläufig (ENOTDIR —
  # wirkt auch als root, anders als ein chmod-basierter Aufbau).
  touch "$BATS_TEST_TMPDIR/blocker"
  export AGENT_LOCK_DIR="$BATS_TEST_TMPDIR/blocker/locks"
  run bash "$AGENT_LOCK" claim ticket TPERSIST2 --label probe --worktree "$BATS_TEST_TMPDIR"
  [ "$status" -ne 0 ]
  # Und der Zustand bestätigt es: es gibt keinen Lock, den irgendwer halten könnte.
  [ ! -f "$AGENT_LOCK_DIR/ticket__TPERSIST2.json" ]
}

@test "claim makes the /tmp/agent-locks fallback visible instead of diverging silently" {
  # Positiv-Anker: innerhalb eines Git-Repos landet der Claim im Repo-Registry
  # und die Ausgabe nennt den /tmp-Fallback NICHT.
  local repo="$BATS_TEST_TMPDIR/repo"
  mkdir -p "$repo"
  git -C "$repo" init -q
  git -C "$repo" config user.email t@example.com
  git -C "$repo" config user.name test
  git -C "$repo" commit -q --allow-empty -m init
  unset AGENT_LOCK_DIR
  run bash -c "cd '$repo' && bash '$AGENT_LOCK' claim ticket TPERSIST3-$$ --label probe"
  [ "$status" -eq 0 ]
  [ -f "$repo/.git/agent-locks/ticket__TPERSIST3-$$.json" ]
  ! grep -qF '/tmp/agent-locks' <<<"$output"

  # Negativfall: aus einem Nicht-Git-Verzeichnis fällt _lock_dir auf
  # /tmp/agent-locks zurück. Der Claim darf dann nicht wortlos "erfolgreich"
  # sein — er MUSS das abweichende Registry benennen, sonst liest ein späteres
  # `check` aus dem Repo-Registry und meldet "free" (der gemeldete Befund).
  local nogit="$BATS_TEST_TMPDIR/nogit"
  mkdir -p "$nogit"
  run bash -c "cd '$nogit' && GIT_CEILING_DIRECTORIES='$BATS_TEST_TMPDIR' bash '$AGENT_LOCK' claim ticket TPERSIST3-$$ --label probe"
  grep -qF '/tmp/agent-locks' <<<"$output"
}
