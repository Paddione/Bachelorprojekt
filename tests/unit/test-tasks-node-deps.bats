#!/usr/bin/env bats
# Regression test for T000427.
#
# A fresh git worktree created by scripts/worktree-create.sh has NO root
# node_modules (the wrapper never installs JS deps). When
# `task test:all` then runs its dep `test:agent-guide`, that task executes node
# scripts which `import ... from 'yaml'` — a third-party package that lives in
# the root node_modules. So the offline suite dies on a fresh checkout with
#   Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'yaml'
#
# Fix: every test task that runs a third-party-importing node script must lazily
# install deps first, using the pattern already established by the Playwright
# tasks in this Taskfile:
#   [ -d node_modules ] || npm ci
# The guard is a no-op in CI (ci.yml runs `npm ci` before `task test:all`) and
# on any tree that is already installed, so it only ever fires on a fresh local
# worktree — exactly the broken case.
#
# RED until Taskfile.yml guards test:agent-guide (+ defensively test:docs-gen);
# GREEN after.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  TASKFILE="$REPO_ROOT/Taskfile.yml"
  GUARD_RE='\[ -d node_modules \] \|\| npm ci'
  # A real `node` invocation in a cmd: "      - node ..." (NOT "node_modules").
  NODE_RE='-[[:space:]]+node[[:space:]]'
}

# Print the YAML block of a top-level task ("  <name>:") up to (but excluding)
# the next top-level task — a line that begins with exactly two spaces then a
# letter. Continuation/cmd lines are indented 4+ spaces, so they stay inside.
task_block() {
  awk -v t="  $1:" '
    index($0, t) == 1 { f = 1; print; next }
    f && /^  [a-zA-Z]/ { exit }
    f { print }
  ' "$TASKFILE"
}

# 1-based line number of the first regex match in stdin, or empty if none.
# `--` stops option parsing: NODE_RE begins with '-' and would otherwise be
# mistaken for a grep flag.
first_match_line() {
  grep -nE -- "$1" | head -1 | cut -d: -f1
}

@test "T000427: Taskfile.yml exists" {
  [ -f "$TASKFILE" ]
}

@test "T000427: test:agent-guide block is extractable and runs node" {
  block="$(task_block test:agent-guide)"
  [ -n "$block" ]
  echo "$block" | grep -qE -- "$NODE_RE"
}

@test "T000427: test:agent-guide lazily installs node deps before any node call" {
  block="$(task_block test:agent-guide)"
  echo "$block" | grep -qE -- "$GUARD_RE"
  guard_ln="$(echo "$block" | first_match_line "$GUARD_RE")"
  node_ln="$(echo "$block" | first_match_line "$NODE_RE")"
  [ -n "$guard_ln" ]
  [ -n "$node_ln" ]
  [ "$guard_ln" -lt "$node_ln" ]
}

@test "T000427: test:docs-gen lazily installs node deps before any node call (defensive)" {
  block="$(task_block test:docs-gen)"
  echo "$block" | grep -qE -- "$GUARD_RE"
  guard_ln="$(echo "$block" | first_match_line "$GUARD_RE")"
  node_ln="$(echo "$block" | first_match_line "$NODE_RE")"
  [ -n "$guard_ln" ]
  [ -n "$node_ln" ]
  [ "$guard_ln" -lt "$node_ln" ]
}

@test "T000427: the lazy-install guard reuses the existing Taskfile convention" {
  # 3 pre-existing Playwright guards + the 2 we add here = at least 5.
  run grep -cE "$GUARD_RE" "$TASKFILE"
  [ "$status" -eq 0 ]
  [ "$output" -ge 5 ]
}
