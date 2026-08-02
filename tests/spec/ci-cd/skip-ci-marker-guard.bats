#!/usr/bin/env bats
# T002522 — CI skip markers must never originate on a branch.
#
# Background: a squash merge folds the subjects of all branch commits into the
# BODY of the resulting main commit. GitHub evaluates its skip markers against
# the entire message of the head commit, so a `[skip ci]` written on a branch
# suppresses EVERY push-triggered workflow on main — silently, with no failed
# run to observe. Measured over 25 consecutive main commits: 17 carrying a
# marker produced 0 push runs, 8 without produced 1 each, no counter-example.
#
# Prüfmodus (T002448-M4): command output verification. The anchor-commit test
# RUNS scripts/worktree-create.sh in an ephemeral repo and reads the message it
# actually wrote; the guard tests RUN the guard and assert on its exit status
# and output. Only the last test greps a file, because its subject IS the CI
# configuration — the documented exception to the output-verification rule.

SKIP_MARKER_RE='\[skip ci\]|\[ci skip\]|\[no ci\]|\[skip actions\]|\[actions skip\]'

setup() {
  REPO_ROOT="$BATS_TEST_DIRNAME/../../.."
  HELPER="$REPO_ROOT/scripts/worktree-create.sh"
  GUARD="$REPO_ROOT/scripts/check-skip-ci-marker.sh"

  TMP="$(mktemp -d)"
  export HOME="$TMP/home"; mkdir -p "$HOME"
  export GIT_CONFIG_GLOBAL="$HOME/.gitconfig"; : > "$GIT_CONFIG_GLOBAL"
  export WT_SKIP_NAME_CHECK=1   # this suite tests commit messages, not naming

  MAIN="$TMP/main"
  mkdir -p "$MAIN"
  git init -q -b main "$MAIN"
  git -C "$MAIN" config user.email t@example.com
  git -C "$MAIN" config user.name  Tester
  printf 'seed\n' > "$MAIN/README.md"
  git -C "$MAIN" add -A
  git -C "$MAIN" commit -qm "init"
}

teardown() { rm -rf "$TMP"; }

# ── The anchor commit is the origin of the defect ────────────────────

@test "worktree-create writes an anchor commit without a CI skip marker" {
  run bash -c "cd '$MAIN' && bash '$HELPER' fix/anchor-check '$TMP/wt-anchor' HEAD"
  [ "$status" -eq 0 ]

  # Positiv-Anker (T002356-M1): the anchor commit must EXIST first. Without
  # this the negative assertion below passes vacuously whenever no commit is
  # written at all.
  run git -C "$TMP/wt-anchor" log --format=%s -1
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'anchor branch'

  # The actual claim: its full message carries no skip marker.
  run git -C "$TMP/wt-anchor" log --format=%B -1
  [ "$status" -eq 0 ]
  ! echo "$output" | grep -qiE "$SKIP_MARKER_RE"
}

# ── The guard that keeps markers off branches ────────────────────────

@test "guard script exists and is executable" {
  [ -x "$GUARD" ]
}

@test "guard rejects a branch commit carrying a skip marker and names it" {
  git -C "$MAIN" checkout -q -b fix/offender
  git -C "$MAIN" commit -q --allow-empty -m "chore: anchor branch fix/offender [skip ci]"
  git -C "$MAIN" commit -q --allow-empty -m "fix: the actual change"

  run bash -c "cd '$MAIN' && bash '$GUARD' main HEAD"
  [ "$status" -ne 0 ]
  echo "$output" | grep -q 'fix/offender'
}

@test "guard rejects every GitHub skip-marker spelling, not just [skip ci]" {
  for marker in '[ci skip]' '[no ci]' '[skip actions]' '[actions skip]'; do
    git -C "$MAIN" checkout -q main
    branch="fix/spelling-$(echo "$marker" | tr -cd 'a-z')"
    git -C "$MAIN" checkout -q -b "$branch"
    git -C "$MAIN" commit -q --allow-empty -m "chore: something ${marker}"

    run bash -c "cd '$MAIN' && bash '$GUARD' main HEAD"
    # Positiv-Anker (T002356-M1): a MISSING guard also exits non-zero (127), so
    # "failed somehow" would pass this test vacuously. Require that the guard
    # actually ran and named the branch it rejected.
    [ "$status" -ne 0 ] || {
      echo "guard accepted the marker '${marker}'" >&2
      return 1
    }
    [ "$status" -ne 127 ] || {
      echo "guard did not run at all (127) for marker '${marker}'" >&2
      return 1
    }
    echo "$output" | grep -q "$branch" || {
      echo "guard did not name the offending branch for marker '${marker}'" >&2
      return 1
    }
  done
}

@test "guard accepts a branch whose commits carry no marker" {
  git -C "$MAIN" checkout -q -b fix/clean
  git -C "$MAIN" commit -q --allow-empty -m "chore: anchor branch fix/clean"
  git -C "$MAIN" commit -q --allow-empty -m "fix: the actual change"

  run bash -c "cd '$MAIN' && bash '$GUARD' main HEAD"
  [ "$status" -eq 0 ]
}

@test "guard ignores markers that are already on main (bot commits)" {
  # freshness-regen.yml commits directly to main WITH a marker, deliberately,
  # as loop protection. It never passes through a pull request, so the guard
  # must not retroactively fail on it.
  git -C "$MAIN" commit -q --allow-empty -m "chore: auto-regenerate freshness artifacts [skip ci]"
  git -C "$MAIN" checkout -q -b fix/after-bot
  git -C "$MAIN" commit -q --allow-empty -m "fix: unrelated change"

  run bash -c "cd '$MAIN' && bash '$GUARD' main HEAD"
  [ "$status" -eq 0 ]
}

# ── Wiring: the guard has to actually run in CI ──────────────────────

@test "ci.yml invokes the skip-marker guard" {
  # Source grep is correct here: the claim IS about the CI configuration file.
  run grep -c 'check-skip-ci-marker.sh' "$REPO_ROOT/.github/workflows/ci.yml"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}
