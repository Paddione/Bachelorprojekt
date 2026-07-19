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

# ── T001977: unlocked worktree keeps REAL clean filter (encrypts on commit) ───
# The former clean=cat neutralization [T000925] silently committed PLAINTEXT
# secrets on merge/add. With the key copied into the worktree gitdir, the real
# clean filter works — and required=true makes a regression fail loudly.

@test "T001977: unlocked worktree keeps real clean/smudge filters and required=true" {
  run bash -c "cd '$MAIN' && bash '$HELPER' fix/friction1 '$TMP/wt-f1' HEAD"
  [ "$status" -eq 0 ]

  # clean has NO worktree-local override — the real (shared) filter applies,
  # so commits of git-crypt-managed files store ENCRYPTED blobs
  run git -C "$TMP/wt-f1" config --worktree filter.git-crypt.clean
  [ "$status" -ne 0 ]
  # required is true so a broken filter blocks the commit instead of silently
  # committing plaintext
  run git -C "$TMP/wt-f1" config --worktree filter.git-crypt.required
  [ "$status" -eq 0 ]
  [ "$output" = "true" ]
  # smudge has no worktree-local override either — real decryption via the key
  run git -C "$TMP/wt-f1" config --worktree filter.git-crypt.smudge
  [ "$status" -ne 0 ]
}

@test "T001977: git commit of a managed file succeeds in unlocked worktree (clean has key)" {
  run bash -c "cd '$MAIN' && bash '$HELPER' fix/f1c '$TMP/wt-f1c' HEAD"
  [ "$status" -eq 0 ]
  # Modify a git-crypt-managed file and commit — must not fail on the clean filter
  echo "modified" >> "$TMP/wt-f1c/secret/data.yaml"
  run git -C "$TMP/wt-f1c" commit -am "test: modify git-crypt-managed file"
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

# ── node_modules provisioning: worktrees share deps with the base checkout ──

@test "T000526: a fresh worktree resolves node_modules from the base checkout" {
  # The base has installed JS deps (gitignored, ~536M). git worktrees do NOT
  # share node_modules, so without provisioning `task test:all`'s node-importing
  # subtasks (test:docs-gen, test:agent-guide) die on ERR_MODULE_NOT_FOUND. The
  # helper must make the base's node_modules resolvable from the worktree root.
  mkdir -p "$MAIN/node_modules/cheerio"
  printf '{"name":"cheerio"}\n' > "$MAIN/node_modules/cheerio/package.json"
  run bash -c "cd '$MAIN' && bash '$HELPER' feature/nm '$TMP/wt-nm' HEAD"
  [ "$status" -eq 0 ]
  [ -e "$TMP/wt-nm/node_modules/cheerio/package.json" ]
  grep -q 'cheerio' "$TMP/wt-nm/node_modules/cheerio/package.json"
}

@test "T000526: node_modules provisioning is skipped cleanly when the base has none" {
  # No node_modules in the base → the helper must still succeed (no error, no
  # dangling link), so a not-yet-installed repo can still spawn worktrees.
  [ ! -e "$MAIN/node_modules" ]
  run bash -c "cd '$MAIN' && bash '$HELPER' feature/nonm '$TMP/wt-nonm' HEAD"
  [ "$status" -eq 0 ]
  [ ! -e "$TMP/wt-nonm/node_modules" ]
}

# ── Rollback: a failure AFTER the --no-checkout skeleton must not leave junk ──

@test "T001977: broken smudge filter fails worktree creation LOUDLY and rolls back" {
  # With required=true (T001977), a broken filter aborts the checkout instead of
  # silently falling back to unfiltered content (which previously meant secrets
  # could round-trip as plaintext). The rollback trap must clean up the
  # half-created worktree so a retry does not hit "<path> already exists".
  mkdir -p "$MAIN/.git/git-crypt/keys"
  printf 'FAKEKEY\n' > "$MAIN/.git/git-crypt/keys/default"
  git -C "$MAIN" config filter.git-crypt.smudge false
  run bash -c "cd '$MAIN' && bash '$HELPER' fix/smudge-broken '$TMP/wt-smudge' HEAD"
  [ "$status" -ne 0 ]
  [ ! -d "$TMP/wt-smudge" ]
}
