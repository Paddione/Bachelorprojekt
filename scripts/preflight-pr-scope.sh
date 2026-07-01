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

# Extract scope from Conventional Commit title: type(scope): subject or type(scope)!: subject
# Only the first parenthesised token after the type prefix is treated as a scope.
SCOPE="$(echo "$TITLE" | sed -nE 's/^[a-z]+\(([a-z0-9][a-z0-9-]*?)\)[!]?:\s.*/\1/p')"

if [ -z "$SCOPE" ]; then
  echo "preflight-pr-scope: no scope detected → scope-less titles are allowed" >&2
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
