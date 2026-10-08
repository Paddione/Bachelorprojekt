#!/usr/bin/env bats
setup() {
  LIB="$BATS_TEST_DIRNAME/../../../scripts/lib/finalize-step-guards.sh"
  ROOT="$BATS_TEST_TMPDIR/repo"
  git init -q -b master "$ROOT"
  git -C "$ROOT" config user.email fixture@example.invalid
  git -C "$ROOT" config user.name Fixture
  echo base > "$ROOT/file"
  git -C "$ROOT" add .; git -C "$ROOT" commit -qm base
  git init -q --bare "$BATS_TEST_TMPDIR/remote"
  git -C "$ROOT" remote add origin "$BATS_TEST_TMPDIR/remote"
  git -C "$ROOT" push -q -u origin master
  git -C "$ROOT" remote set-head origin master
  WT="$BATS_TEST_TMPDIR/worktree"
  git -C "$ROOT" worktree add -q -b fix/example "$WT"
  echo feature >> "$WT/file"
  git -C "$WT" commit -qam feature
  TIP="$(git -C "$WT" rev-parse HEAD)"
  git -C "$ROOT" merge --squash fix/example >/dev/null
  git -C "$ROOT" commit -qm squash
  MERGE="$(git -C "$ROOT" rev-parse HEAD)"
  git -C "$ROOT" push -q origin master
  mkdir "$BATS_TEST_TMPDIR/bin"
  export PR_JSON="{\"state\":\"MERGED\",\"headRefName\":\"fix/example\",\"headRefOid\":\"$TIP\",\"baseRefName\":\"master\",\"mergeCommit\":{\"oid\":\"$MERGE\"}}"
  printf '#!/usr/bin/env bash\nprintf "%%s\\n" "$PR_JSON"\n' > "$BATS_TEST_TMPDIR/bin/gh"
  chmod +x "$BATS_TEST_TMPDIR/bin/gh"
  export PATH="$BATS_TEST_TMPDIR/bin:$PATH"
  mkdir -p "$ROOT/scripts"
  printf '#!/usr/bin/env bash\necho free\n' > "$ROOT/scripts/agent-lock.sh"
  printf '#!/usr/bin/env bash\nexit 0\n' > "$ROOT/scripts/worktree-clean-check.sh"
}
@test "verified squash on actual master accepts exact head" {
  run bash -c 'source "$1"; finalize_branch_fully_merged "$2" fix/example 123' _ "$LIB" "$ROOT"
  [ "$status" -eq 0 ]
}
@test "later feature commit survives squash evidence" {
  echo later >> "$WT/file"; git -C "$WT" commit -qam later
  run bash -c 'source "$1"; finalize_branch_fully_merged "$2" fix/example 123' _ "$LIB" "$ROOT"
  [ "$status" -ne 0 ]
}
@test "dirty tracked worktree blocks cleanup" {
  echo dirty >> "$WT/file"
  run bash -c 'source "$1"; finalize_cleanup_safe "$2" fix/example "$3" T901525' _ "$LIB" "$ROOT" "$WT"
  [ "$status" -eq 1 ]
}
@test "untracked allowlist path blocks cleanup" {
  mkdir -p "$WT/.agents/plans/local"; echo precious > "$WT/.agents/plans/local/tasks.md"
  run bash -c 'source "$1"; finalize_cleanup_safe "$2" fix/example "$3" T901525' _ "$LIB" "$ROOT" "$WT"
  [ "$status" -eq 1 ]
}
@test "foreign claim blocks cleanup" {
  printf '#!/usr/bin/env bash\necho held\nexit 3\n' > "$ROOT/scripts/agent-lock.sh"
  run bash -c 'source "$1"; finalize_cleanup_safe "$2" fix/example "$3" T901525' _ "$LIB" "$ROOT" "$WT"
  [ "$status" -eq 1 ]
}
@test "unknown claim blocks cleanup" {
  printf '#!/usr/bin/env bash\nexit 2\n' > "$ROOT/scripts/agent-lock.sh"
  run bash -c 'source "$1"; finalize_cleanup_safe "$2" fix/example "$3" T901525' _ "$LIB" "$ROOT" "$WT"
  [ "$status" -eq 1 ]
}
@test "clean unclaimed registered worktree passes" {
  run bash -c 'source "$1"; finalize_cleanup_safe "$2" fix/example "$3" T901525' _ "$LIB" "$ROOT" "$WT"
  [ "$status" -eq 0 ]
}
@test "unmerged PR rejects squash" {
  export PR_JSON="${PR_JSON/MERGED/OPEN}"
  run bash -c 'source "$1"; finalize_branch_fully_merged "$2" fix/example 123' _ "$LIB" "$ROOT"
  [ "$status" -ne 0 ]
}
@test "wrong head branch rejects squash" {
  export PR_JSON="${PR_JSON/fix\/example/fix\/foreign}"
  run bash -c 'source "$1"; finalize_branch_fully_merged "$2" fix/example 123' _ "$LIB" "$ROOT"
  [ "$status" -ne 0 ]
}
@test "unreachable merge commit rejects squash" {
  export PR_JSON="${PR_JSON/$MERGE/$TIP}"
  run bash -c 'source "$1"; finalize_branch_fully_merged "$2" fix/example 123' _ "$LIB" "$ROOT"
  [ "$status" -ne 0 ]
}
@test "GitHub outage keeps squash" {
  printf '#!/usr/bin/env bash\nexit 1\n' > "$BATS_TEST_TMPDIR/bin/gh"
  run bash -c 'source "$1"; finalize_branch_fully_merged "$2" fix/example 123' _ "$LIB" "$ROOT"
  [ "$status" -ne 0 ]
}
@test "ticket-only foreign claim blocks cleanup" {
  printf '#!/usr/bin/env bash\nif [[ "$2" == ticket ]]; then echo held; exit 3; fi\necho free\n' > "$ROOT/scripts/agent-lock.sh"
  run bash -c 'source "$1"; finalize_cleanup_safe "$2" fix/example "$3" T901525' _ "$LIB" "$ROOT" "$WT"
  [ "$status" -eq 1 ]
}
@test "wrong worktree branch cannot be removed" {
  run bash -c 'source "$1"; finalize_cleanup_safe "$2" fix/foreign "$3" T901525' _ "$LIB" "$ROOT" "$WT"
  [ "$status" -eq 1 ]
}
@test "strict removal preserves edits arriving after precheck" {
  echo precious > "$WT/late-file"
  run bash -c 'source "$1"; finalize_remove_clean_worktree "$2" "$3"' _ "$LIB" "$ROOT" "$WT"
  [ "$status" -ne 0 ]; [ -f "$WT/late-file" ]
}
@test "normal ancestor merge accepts actual master" {
  git -C "$ROOT" merge -q fix/example
  git -C "$ROOT" push -q origin master
  run bash -c 'source "$1"; finalize_branch_fully_merged "$2" fix/example' _ "$LIB" "$ROOT"
  [ "$status" -eq 0 ]
}
@test "failed fetch cannot authorize cleanup" {
  git -C "$ROOT" remote set-url origin "$BATS_TEST_TMPDIR/missing"
  run bash -c 'source "$1"; finalize_branch_fully_merged "$2" fix/example 123' _ "$LIB" "$ROOT"
  [ "$status" -ne 0 ]
}
