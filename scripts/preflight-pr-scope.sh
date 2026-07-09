#!/usr/bin/env bash
# preflight-pr-scope.sh — validate the scope in a Conventional-Commit PR title
# against the semantic-PR allowlist in ci.yml BEFORE `gh pr create`. [T000925]
#
# Usage:  preflight-pr-scope.sh "<PR title>" [<ci_workflow_path>]
#   ci_workflow_path  defaults to .github/workflows/ci.yml
#
# Exit: 0 = scope valid or no scope; 1 = scope not in allowlist; 2 = usage error.

set -euo pipefail

TITLE="${1:?Usage: preflight-pr-scope.sh '<PR title>' [<ci_workflow_path>]}"
CI_WORKFLOW="${2:-.github/workflows/ci.yml}"

# ── Branch and Worktree Validation [T001592] ──────────────────────────────────
CURRENT_BRANCH="$(git symbolic-ref --short HEAD 2>/dev/null || echo "")"

if [ -z "$CURRENT_BRANCH" ]; then
  echo "preflight-pr-scope: FATAL: Not on any branch (detached HEAD)" >&2
  exit 1
fi

if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
  echo "preflight-pr-scope: FATAL: Cannot create a PR from the '$CURRENT_BRANCH' branch" >&2
  exit 1
fi

# Extract ticket ID from title if present (format: type(scope): [TXXXXXX] subject)
# Matches [T123456] or T123456
TICKET_ID="$(echo "$TITLE" | grep -oP '\[T\d{6}\]|T\d{6}' | tr -d '[]' | head -n 1 || true)"
if [ -n "$TICKET_ID" ]; then
  # Verify current branch contains the ticket ID
  if [[ ! "$CURRENT_BRANCH" =~ $TICKET_ID ]]; then
    echo "preflight-pr-scope: FATAL: PR title ticket ID '$TICKET_ID' does not match current branch name '$CURRENT_BRANCH'" >&2
    exit 1
  fi
fi

# Worktree verification
CURRENT_WORKTREE="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
EXPECTED_WORKTREE="$(git worktree list | grep -F "[$CURRENT_BRANCH]" | awk '{print $1}' || echo "")"

if [ -n "$EXPECTED_WORKTREE" ]; then
  ABS_CURRENT="$(cd "$CURRENT_WORKTREE" && pwd -P)"
  ABS_EXPECTED="$(cd "$EXPECTED_WORKTREE" && pwd -P)"
  if [ "$ABS_CURRENT" != "$ABS_EXPECTED" ]; then
    echo "preflight-pr-scope: FATAL: Current directory is not the correct worktree for branch '$CURRENT_BRANCH'" >&2
    echo "  Current:  $ABS_CURRENT" >&2
    echo "  Expected: $ABS_EXPECTED" >&2
    exit 1
  fi
fi

# Enforce worktree usage for feature/* and fix/* branches
if [[ "$CURRENT_BRANCH" =~ ^(feature|fix)/ ]]; then
  if [[ "$CURRENT_WORKTREE" != *"/worktrees/"* ]] && [[ "$CURRENT_WORKTREE" != *"/.worktrees/"* ]]; then
    echo "preflight-pr-scope: FATAL: PRs for feature/fix branches must be created from an isolated worktree under '.worktrees/'" >&2
    echo "  Current worktree path: $CURRENT_WORKTREE" >&2
    exit 1
  fi
fi

# Extract scope from Conventional Commit title: type(scope): subject or type(scope)!: subject
# Only the first parenthesised token after the type prefix is treated as a scope.
SCOPE="$(echo "$TITLE" | sed -nE 's/^[a-z]+\(([a-zA-Z0-9][a-zA-Z0-9-]*?)\)[!]?:\s.*/\1/p')"

if [ -z "$SCOPE" ]; then
  echo "preflight-pr-scope: no scope detected → scope-less titles are allowed" >&2
  exit 0
fi

# Ticket number scopes (e.g. T001449) are always allowed.
if [[ "$SCOPE" =~ ^T[0-9]{6}$ ]]; then
  echo "preflight-pr-scope: ticket-number scope '$SCOPE' ✓ (bypasses allowlist)" >&2
  exit 0
fi

if [ ! -f "$CI_WORKFLOW" ]; then
  echo "preflight-pr-scope: workflow file '$CI_WORKFLOW' not found" >&2
  exit 2
fi

# Parse the scopes list from ci.yml: find the `scopes: |` line inside the
# commit-lint job, then collect every indented line (containing a bare word)
# until the next dedent or end-of-file.
_allowed="$(awk '
  /^[ ]*scopes:[ ]*\|/ { in_scopes=1; next }
  in_scopes && /^[ ]+[a-z][a-z0-9-]*$/ { gsub(/^[ ]+/,""); print; next }
  in_scopes && /^[ ]+[a-z]/ { exit }
  in_scopes && /^[ ]*$/ { next }
  in_scopes && /^[^ ]/ { exit }
' "$CI_WORKFLOW")"

if [ -z "$_allowed" ]; then
  _ssot_script="$(dirname "$0")/validate-commit-msg.sh"
  if [ -x "$_ssot_script" ]; then
    _allowed="$("$_ssot_script" scopes 2>/dev/null || true)"
  fi
fi

if [ -z "$_allowed" ]; then
  echo "preflight-pr-scope: could not parse scope allowlist from '$CI_WORKFLOW' and SSOT fallback failed" >&2
  exit 2
fi

if echo "$_allowed" | grep -qxF "$SCOPE"; then
  echo "preflight-pr-scope: scope '$SCOPE' ✓" >&2
  exit 0
fi

echo "preflight-pr-scope: scope '$SCOPE' is NOT in the semantic-PR allowlist" >&2
echo "Allowed scopes (from $CI_WORKFLOW):" >&2
echo "$_allowed" | sed 's/^/  /' >&2
exit 1
