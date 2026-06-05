#!/usr/bin/env bats
# Tests for scripts/worktree-create.sh — a git-crypt-safe worktree creator. [T000426]
#
# Background: `git worktree add` runs the git-crypt smudge filter while checking
# out the new worktree, but the new per-worktree gitdir (.git/worktrees/<name>)
# has no git-crypt key, so the checkout fails fatally (exit 128) and the worktree
# is rolled back — even when the MAIN checkout is unlocked.
#
# This suite reproduces that failure with a faithful fake git-crypt filter (a
# smudge/clean command that fails unless a key exists in the invoking gitdir),
# then asserts the helper creates a USABLE worktree in both the unlocked
# (key present → decrypted) and locked (no key → keyless passthrough) states.
#
# RED-phase note: scripts/worktree-create.sh does not exist yet, so every
# helper-driven test fails. The "plain git worktree add fails" test passes now
# and proves the fake-git-crypt simulation is faithful to the real bug.

setup() {
  HELPER="$BATS_TEST_DIRNAME/../../scripts/worktree-create.sh"
  TMP="$(mktemp -d)"
  export HOME="$TMP/home"; mkdir -p "$HOME"           # isolate global git config
  export GIT_CONFIG_GLOBAL="$HOME/.gitconfig"; : > "$GIT_CONFIG_GLOBAL"

  # A fake git-crypt: passes bytes through with `cat`, but fails if the gitdir
  # of the repo it is invoked in has no key file — exactly how real git-crypt
  # behaves in a fresh worktree gitdir.
  FAKE="$TMP/fake-git-crypt.sh"
  cat > "$FAKE" <<'EOF'
#!/usr/bin/env bash
# usage: fake-git-crypt.sh <smudge|clean>
gd="${GIT_DIR:-$(git rev-parse --absolute-git-dir 2>/dev/null)}"
if [ ! -f "$gd/git-crypt/keys/default" ]; then
  echo "fake-git-crypt: Error: Unable to open key file" >&2
  exit 1
fi
cat
EOF
  chmod +x "$FAKE"

  MAIN="$TMP/main"
  mkdir -p "$MAIN"
  git init -q -b main "$MAIN"
  git -C "$MAIN" config user.email t@example.com
  git -C "$MAIN" config user.name  Tester
  git -C "$MAIN" config filter.git-crypt.smudge   "$FAKE smudge"
  git -C "$MAIN" config filter.git-crypt.clean    "$FAKE clean"
  git -C "$MAIN" config filter.git-crypt.required true
  printf 'secret/** filter=git-crypt diff=git-crypt\n' > "$MAIN/.gitattributes"
  mkdir -p "$MAIN/secret"
  printf 'TOPSECRET-VALUE\n' > "$MAIN/secret/data.yaml"
  # "unlock" the main checkout: install the key in the main gitdir.
  mkdir -p "$MAIN/.git/git-crypt/keys"
  printf 'FAKEKEY\n' > "$MAIN/.git/git-crypt/keys/default"
  git -C "$MAIN" add -A
  git -C "$MAIN" commit -qm init
}

teardown() { rm -rf "$TMP"; }

# ── The bug reproduces with plain git (proves the simulation is faithful) ──

@test "plain 'git worktree add' fails on the git-crypt smudge filter" {
  run git -C "$MAIN" worktree add -b bare "$TMP/wt-bare" HEAD
  [ "$status" -ne 0 ]
  echo "$output" | grep -qi 'key file'
  [ ! -e "$TMP/wt-bare/secret/data.yaml" ]
}

# ── RED: the helper does not exist yet ──────────────────────────────

@test "helper script exists and is executable" {
  [ -x "$HELPER" ]
}

# ── RED: unlocked repo → usable worktree with DECRYPTED secrets ──────

@test "helper creates a usable worktree (unlocked → decrypted secrets)" {
  run bash -c "cd '$MAIN' && bash '$HELPER' feature/x '$TMP/wt-ok' HEAD"
  [ "$status" -eq 0 ]
  # the worktree exists and the secret is present + decrypted
  [ -f "$TMP/wt-ok/secret/data.yaml" ]
  grep -q 'TOPSECRET-VALUE' "$TMP/wt-ok/secret/data.yaml"
  # the branch was created
  git -C "$TMP/wt-ok" rev-parse --abbrev-ref HEAD | grep -q 'feature/x'
}

@test "follow-up git commands in the new worktree do not hit git-crypt" {
  bash -c "cd '$MAIN' && bash '$HELPER' feature/y '$TMP/wt-y' HEAD" >/dev/null 2>&1 || true
  run git -C "$TMP/wt-y" status --porcelain
  [ "$status" -eq 0 ]
}

# ── RED: locked repo (no key) → still a usable worktree, keyless ─────

@test "helper works when the repo is locked (no key) via filter neutralization" {
  rm -f "$MAIN/.git/git-crypt/keys/default"   # simulate a locked repo
  run bash -c "cd '$MAIN' && bash '$HELPER' fix/z '$TMP/wt-z' HEAD"
  [ "$status" -eq 0 ]
  [ -d "$TMP/wt-z" ]
  # follow-up git ops must still succeed without a key
  run git -C "$TMP/wt-z" status --porcelain
  [ "$status" -eq 0 ]
}
