#!/usr/bin/env bats
# tests/spec/openspec-embedding/port-forward-identity-T002870.bats
# SSOT: openspec/specs/openspec-embedding.md (delta in openspec/changes/openspec-embed-collection-T002870/)
#
# Reproduces T002870/T002877: scripts/openspec-embed-local.sh probes port
# 15432 for ANY listener instead of verifying it is its own port-forward,
# so a colliding, unrelated port-forward silently absorbs the traffic and
# embeddings land in the wrong database. Also covers the two companion
# fixes bundled in the same root cause: the wrapper's success-check must
# fail on a completeness-gate warning, and .githooks/post-commit-embed must
# not fire mid-rebase.
#
# Test mode: command output verification (run/$status/$output) against the
# real helper functions in scripts/openspec-embed-lib.sh — no source-grep.
# Every negative assertion carries a positive anchor in the same test file
# (T002356-M1).

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  LIB="$REPO/scripts/openspec-embed-lib.sh"
}

# --- pf_listener_pid ---------------------------------------------------

start_decoy_listener() {
  local port="$1"
  python3 -c "
import socket, time
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(('127.0.0.1', $port))
s.listen(1)
time.sleep(8)
" &
  DECOY_PID=$!
  for _ in $(seq 1 30); do
    (exec 9<>"/dev/tcp/127.0.0.1/${port}") 2>/dev/null && { exec 9>&- 9<&-; return 0; } || sleep 0.25
  done
  return 1
}

@test "pf_listener_pid returns the real listener PID (positive anchor)" {
  # expected: FAIL — scripts/openspec-embed-lib.sh does not exist yet.
  [ -f "$LIB" ]
  source "$LIB"
  PORT=$((20000 + RANDOM % 10000))
  start_decoy_listener "$PORT"
  run pf_listener_pid "$PORT"
  [ "$status" -eq 0 ]
  [ -n "$output" ]
  [ "$output" = "$DECOY_PID" ]
  kill "$DECOY_PID" 2>/dev/null || true
}

@test "pf_listener_pid does NOT report a mismatched PID as the listener (negative case)" {
  # expected: FAIL — scripts/openspec-embed-lib.sh does not exist yet.
  [ -f "$LIB" ]
  source "$LIB"
  PORT=$((20000 + RANDOM % 10000))
  start_decoy_listener "$PORT"
  WRONG_PID=$((DECOY_PID + 12345))
  run pf_listener_pid "$PORT"
  [ "$status" -eq 0 ]
  [ "$output" != "$WRONG_PID" ]
  kill "$DECOY_PID" 2>/dev/null || true
}

# --- embed_output_is_success --------------------------------------------

@test "embed_output_is_success accepts a clean success (positive anchor)" {
  # expected: FAIL — function does not exist yet.
  source "$LIB"
  run embed_output_is_success "indexed slug='demo' chunks=12"
  [ "$status" -eq 0 ]
}

@test "embed_output_is_success rejects success text alongside a completeness-gate warning" {
  # expected: FAIL — function does not exist yet.
  source "$LIB"
  run embed_output_is_success "$(printf "indexed slug='demo' chunks=4\nWARN: completeness gate — collection has 4 docs but 55 local active plans")"
  [ "$status" -eq 1 ]
}

# --- T004598: Slug-spezifische WARN-Behandlung -------------------------------
# Der post-commit-Hook laeuft in jedem Worktree; das completeness gate zaehlt
# aktive Plaene aus dem HAUPT-CHECKOUT (listLocalActivePlans liest nur
# <repoRoot>/openspec/changes). Plaene in anderen Worktrees fehlen dann in der
# Collection, die WARN nennt sie als missing — obwohl der KONKRETE Slug des
# Commits sauber indiziert wurde. Der Hook behandelte jede solche WARN als
# harten Fehler: 3x5s Retry + "FEHLER: Embedding wurde NICHT indiziert" pro
# Commit (beobachtet 2026-08-14, 20/31 fehlende Plaene). Die WARN darf den
# Erfolg des eigenen Slugs nur negieren, wenn DER Slug selbst fehlt.

@test "T004598: WARN mit fremden missing-Slugs negiert den Erfolg des eigenen Slugs NICHT" {
  source "$LIB"
  run embed_output_is_success "$(printf "indexed slug='demo' chunks=10\nWARN: completeness gate — collection covers 11/31 local active plans, missing 20 (> 10%% tolerance): other-slug-1, other-slug-2")" demo
  [ "$status" -eq 0 ]
}

@test "T004598: WARN mit dem eigenen Slug in der missing-Liste failt weiterhin (echter Defekt)" {
  source "$LIB"
  run embed_output_is_success "$(printf "indexed slug='demo' chunks=10\nWARN: completeness gate — collection covers 11/31 local active plans, missing 20 (> 10%% tolerance): demo, other-slug-1")" demo
  [ "$status" -eq 1 ]
}

@test "T004598: Aufruf ohne Slug-Parameter behaelt das bisherige Verhalten bei (rueckwaertskompatibel)" {
  source "$LIB"
  run embed_output_is_success "$(printf "indexed slug='demo' chunks=4\nWARN: completeness gate — collection has 4 docs but 55 local active plans")"
  [ "$status" -eq 1 ]
}

# --- in_rebase ------------------------------------------------------------

@test "in_rebase returns false outside a rebase (positive anchor)" {
  # expected: FAIL — scripts/openspec-embed-lib.sh does not exist yet, so
  # this assertion on the lib's presence must fail first (a bare `source`
  # of a missing file would coincidentally also exit 1 and mask the gap).
  [ -f "$LIB" ]
  TMPGIT="$(mktemp -d)"
  git -C "$TMPGIT" init -q
  run bash -c "cd '$TMPGIT' && source '$LIB' && in_rebase"
  [ "$status" -eq 1 ]
  rm -rf "$TMPGIT"
}

@test "in_rebase detects an active rebase-merge marker" {
  # expected: FAIL — function does not exist yet.
  TMPGIT="$(mktemp -d)"
  git -C "$TMPGIT" init -q
  mkdir -p "$TMPGIT/.git/rebase-merge"
  run bash -c "cd '$TMPGIT' && source '$LIB' && in_rebase"
  [ "$status" -eq 0 ]
  rm -rf "$TMPGIT"
}

@test "in_rebase detects an active rebase-apply marker" {
  # expected: FAIL — function does not exist yet.
  TMPGIT="$(mktemp -d)"
  git -C "$TMPGIT" init -q
  mkdir -p "$TMPGIT/.git/rebase-apply"
  run bash -c "cd '$TMPGIT' && source '$LIB' && in_rebase"
  [ "$status" -eq 0 ]
  rm -rf "$TMPGIT"
}

# --- .githooks/post-commit-embed integration ------------------------------

setup_hook_repo() {
  TMPGIT="$(mktemp -d)"
  git -C "$TMPGIT" init -q
  git -C "$TMPGIT" config user.email test@example.com
  git -C "$TMPGIT" config user.name test
  mkdir -p "$TMPGIT/scripts"
  MARKER="$TMPGIT/marker.log"
  : > "$MARKER"
  cat > "$TMPGIT/scripts/openspec-embed-lib.sh" <<'LIBEOF'
#!/usr/bin/env bash
# Stub — minimal implementations for test isolation.
pf_listener_pid() { :; }
embed_output_is_success() { return 0; }
in_rebase() {
  [[ -d "$(git rev-parse --git-path rebase-merge 2>/dev/null)" ]] && return 0
  [[ -d "$(git rev-parse --git-path rebase-apply 2>/dev/null)" ]] && return 0
  return 1
}
LIBEOF
  cat > "$TMPGIT/scripts/openspec-embed-local.sh" <<EOF
#!/usr/bin/env bash
echo "CALLED" >> "$MARKER"
EOF
  chmod +x "$TMPGIT/scripts/openspec-embed-local.sh"
  # Root commit first (diff-tree needs a parent to diff against; a root
  # commit is otherwise invisible to `git diff-tree HEAD` without --root —
  # unrelated to this fix, so keep the tested commit non-root instead of
  # widening scope to that).
  : > "$TMPGIT/README.md"
  ( cd "$TMPGIT" && git add -A && git commit -q -m "root" )
  mkdir -p "$TMPGIT/openspec/changes/demo"
  : > "$TMPGIT/openspec/changes/demo/tasks.md"
  ( cd "$TMPGIT" && git add -A && git commit -q -m "seed openspec change" )
}

@test "post-commit-embed skips the wrapper while a rebase is in progress" {
  # expected: FAIL — the hook has no rebase-marker check yet, so it still
  # calls the (stubbed) wrapper and the marker file gets written.
  setup_hook_repo
  mkdir -p "$TMPGIT/.git/rebase-merge"
  run bash -c "cd '$TMPGIT' && unset CI && bash '$REPO/.githooks/post-commit-embed'"
  [ "$status" -eq 0 ]
  [ ! -s "$MARKER" ]
  rm -rf "$TMPGIT"
}

@test "post-commit-embed still calls the wrapper outside a rebase (positive anchor)" {
  setup_hook_repo
  run bash -c "cd '$TMPGIT' && unset CI && bash '$REPO/.githooks/post-commit-embed'"
  [ "$status" -eq 0 ]
  [ -s "$MARKER" ]
  grep -q CALLED "$MARKER"
  rm -rf "$TMPGIT"
}
