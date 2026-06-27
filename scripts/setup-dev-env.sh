#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# setup-dev-env.sh — Per-developer dev-env setup (signing + identity)
# ═══════════════════════════════════════════════════════════════════
#
# This script configures the *local* git environment so that every commit
# you make on this checkout is GPG/SSH-signed. It is intentionally a setup
# script (not a one-shot CI hook) because commit signing keys are
# personal — they must live in the developer's ~/.ssh/, not in the repo.
#
# Why this exists (G-SEC05): the G-SEC05 health gate (scripts/health-goals-check.sh)
# tracks `git log -50 --pretty='%G?' main | grep -c N` (unsignierte Commits in den
# letzten 50 main-Commits) against a hard target. Without local signing
# configuration, every new commit adds an N to that window and the gate
# never improves. This script gets a new dev to a clean state in one call.
#
# Usage:
#   bash scripts/setup-dev-env.sh           # idempotent setup
#   bash scripts/setup-dev-env.sh --check   # verify configuration
#   bash scripts/setup-dev-env.sh --key PATH # use a specific SSH key
#
# Idempotent: safe to re-run. Re-running with the same key is a no-op;
# re-running with --key swaps the signing key.
#
# After this script:
#   - commit.gpgsign=true         (every commit is signed)
#   - tag.gpgsign=true            (every tag is signed)
#   - gpg.format=ssh              (use SSH ed25519 keys for signing)
#   - user.signingkey=<chosen>    (path to the SSH key)
#   - gpg.ssh.allowedSignersFile  (so `%G?` reports G, not U/unknown)
#   - Per-worktree copies of allowed_signers (worktrees share the main .git,
#     so we mirror the file into each worktree's gitdir)
#
# Add the matching PUBLIC key to your GitHub account under
# https://github.com/settings/keys  (type: "Signing Key") so GitHub renders
# the "Verified" badge on your PRs.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "✗ Must run inside a git repo" >&2; exit 2; }
GITDIR="$(git rev-parse --git-dir)"
# Normalise: worktree gitdir is absolute, main .git is relative
case "$GITDIR" in
  /*) ;;
  *)  GITDIR="$REPO_ROOT/$GITDIR" ;;
esac

KEY_PATH=""
MODE="setup"
for a in "$@"; do case "$a" in
  --check)  MODE="check" ;;
  --key)    shift; KEY_PATH="${1:-}" ;;
  --key=*)  KEY_PATH="${a#--key=}" ;;
  -h|--help)
    sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
  *) echo "✗ Unknown flag: $a" >&2; exit 2 ;;
esac; done

# ── helpers ─────────────────────────────────────────────────────────────
have() { command -v "$1" >/dev/null 2>&1; }

ensure_key() {
  if [ -n "$KEY_PATH" ]; then
    if [ ! -f "$KEY_PATH" ]; then
      echo "✗ --key $KEY_PATH not found" >&2; exit 2
    fi
    echo "$KEY_PATH"
    return
  fi
  # Default: ~/.ssh/id_ed25519 (or id_rsa fallback for older boxes)
  for candidate in "$HOME/.ssh/id_ed25519" "$HOME/.ssh/id_rsa"; do
    if [ -f "$candidate" ]; then echo "$candidate"; return; fi
  done
  # No key found — generate one
  if ! have ssh-keygen; then
    echo "✗ No SSH key found at ~/.ssh/id_ed25519 and ssh-keygen not available" >&2
    echo "  Generate one with: ssh-keygen -t ed25519 -C \"<your-email>\"" >&2
    exit 2
  fi
  mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
  local email
  email="$(git config --get user.email 2>/dev/null || echo "${USER}@$(hostname)")"
  local newkey="$HOME/.ssh/id_ed25519"
  echo "→ Generating new ed25519 key at $newkey (label: $email)"
  ssh-keygen -t ed25519 -C "$email" -f "$newkey" -N ""
  echo "$newkey"
}

write_allowed_signers() {
  local key="$1" pub
  pub="${key}.pub"
  if [ ! -f "$pub" ]; then
    echo "✗ Public key $pub missing — re-generate the keypair" >&2; exit 2
  fi
  local email
  email="$(git config --get user.email 2>/dev/null || true)"
  if [ -z "$email" ]; then
    email="$(whoami)@$(hostname)"
  fi
  # allowedSigners line format: "<principal>[,<p2>...] <keytype> <key-body>"
  # where <keytype> is the literal key algorithm as it appears in the .pub
  # file (e.g. "ssh-ed25519", "ssh-rsa", "ecdsa-sha2-nistp256"). Git rejects
  # the bare algorithm name (e.g. "ED25519") — must include the "ssh-" prefix.
  local keytype keybody
  keytype="$(awk '{print $1}' "$pub")"
  keybody="$(awk '{print $2}' "$pub")"
  printf '%s %s %s\n' "$email" "$keytype" "$keybody" > "$GITDIR/allowed_signers"
  # Also keep a top-level copy in the worktree-shared location so future
  # worktrees can reference it without re-deriving.
  if [ "$GITDIR" != "$REPO_ROOT/.git" ] && [ -d "$REPO_ROOT/.git" ]; then
    cp "$GITDIR/allowed_signers" "$REPO_ROOT/.git/allowed_signers" 2>/dev/null || true
  fi
}

# ── check mode ──────────────────────────────────────────────────────────
if [ "$MODE" = "check" ]; then
  fail=0
  echo "Checking local commit-signing configuration…"
  for k in gpg.format user.signingkey commit.gpgsign gpg.ssh.allowedSignersFile; do
    v="$(git config --local --get "$k" 2>/dev/null || true)"
    if [ -n "$v" ]; then
      echo "  [OK]  $k = $v"
    else
      echo "  [MISS] $k is unset"
      fail=1
    fi
  done
  if [ -f "$GITDIR/allowed_signers" ]; then
    echo "  [OK]  allowed_signers at $GITDIR/allowed_signers"
  else
    echo "  [MISS] $GITDIR/allowed_signers not present"
    fail=1
  fi
  if [ $fail -eq 0 ]; then
    echo ""
    echo "✓ Commit signing is configured."
    exit 0
  fi
  echo ""
  echo "✗ Commit signing is NOT fully configured. Run: bash scripts/setup-dev-env.sh" >&2
  exit 1
fi

# ── setup mode ──────────────────────────────────────────────────────────
echo "Configuring commit-signing for this checkout…"

# 1. Identity (only set if missing — never override the developer's choice)
if [ -z "$(git config --local --get user.name 2>/dev/null || true)" ]; then
  if [ -n "${GIT_AUTHOR_NAME:-}" ]; then
    git config --local user.name "$GIT_AUTHOR_NAME"
    echo "  → user.name = $GIT_AUTHOR_NAME (from env)"
  else
    echo "✗ user.name is unset. Run: git config --local user.name \"Your Name\"" >&2
    exit 2
  fi
fi
if [ -z "$(git config --local --get user.email 2>/dev/null || true)" ]; then
  if [ -n "${GIT_AUTHOR_EMAIL:-}" ]; then
    git config --local user.email "$GIT_AUTHOR_EMAIL"
    echo "  → user.email = $GIT_AUTHOR_EMAIL (from env)"
  else
    echo "✗ user.email is unset. Run: git config --local user.email \"you@example.com\"" >&2
    exit 2
  fi
fi

# 2. SSH key
KEY_PATH="$(ensure_key)"
# Expand ~ to $HOME for the git config
case "$KEY_PATH" in
  "~/"*) KEY_PATH="$HOME/${KEY_PATH#~/}" ;;
esac
echo "  → user.signingkey = $KEY_PATH"

# 3. git config: format=ssh, sign on commit+tag
git config --local gpg.format ssh
git config --local user.signingkey "$KEY_PATH"
git config --local commit.gpgsign true
git config --local tag.gpgsign true

# 4. allowedSignersFile (so `%G?` returns G, not U)
write_allowed_signers "$KEY_PATH"
git config --local gpg.ssh.allowedSignersFile "$GITDIR/allowed_signers"
echo "  → gpg.ssh.allowedSignersFile = $GITDIR/allowed_signers"

# 5. Sanity check — make a throwaway signed commit and verify
test_commit="$(mktemp -d)/verify-signing"
git -C "$REPO_ROOT" commit --allow-empty -m "chore: verify commit-signing setup" --no-verify >/dev/null
verdict="$(git -C "$REPO_ROOT" log -1 --pretty='%G?' HEAD 2>/dev/null || echo "?")"
if [ "$verdict" = "G" ]; then
  echo "  → test commit verified (signature GOOD)"
else
  echo "  ✗ test commit signature is '$verdict' (expected G)" >&2
  exit 1
fi
# Roll the verification commit back so it does not pollute the working branch
git -C "$REPO_ROOT" reset --hard HEAD~1 >/dev/null

echo ""
echo "✓ Commit signing configured. Future commits in this checkout will be signed."
echo ""
echo "  Reminder: also add the matching PUBLIC key to GitHub as a 'Signing Key'"
echo "  (https://github.com/settings/keys → 'New SSH key' → Authentication: Signing Key)"
echo "  so GitHub renders the 'Verified' badge on your PRs."
