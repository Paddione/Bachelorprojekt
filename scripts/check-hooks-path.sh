#!/usr/bin/env bash
# scripts/check-hooks-path.sh
# Verifies that git hooks are properly configured via core.hooksPath.
# Skipped in CI runners where git hooks are not used. [T900050]

set -euo pipefail

if [ "${CI:-}" = "true" ] || [ -n "${GITHUB_ACTIONS:-}" ] || [ "${SKIP_HOOKS_PATH_CHECK:-0}" = "1" ]; then
  exit 0
fi

HOOKS_PATH="$(git config core.hooksPath 2>/dev/null || true)"
if [ -z "$HOOKS_PATH" ]; then
  echo "ERROR: git core.hooksPath is not set." >&2
  echo "       Security and workflow guards in .githooks/ are currently INACTIVE." >&2
  echo "       To activate, run:" >&2
  echo "         task hooks:install" >&2
  echo "       or:" >&2
  echo "         task secrets:install-hooks" >&2
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
RESOLVED=""
if [ -d "$REPO_ROOT/$HOOKS_PATH" ]; then
  RESOLVED="$REPO_ROOT/$HOOKS_PATH"
elif [ -d "$HOOKS_PATH" ]; then
  RESOLVED="$HOOKS_PATH"
fi

if [ -z "$RESOLVED" ]; then
  echo "ERROR: git core.hooksPath is set to '$HOOKS_PATH', but directory does not exist relative to $REPO_ROOT." >&2
  echo "       Security guards in .githooks/ cannot execute." >&2
  echo "       To fix, run:" >&2
  echo "         task hooks:install" >&2
  exit 1
fi

if [ ! -f "$RESOLVED/pre-commit" ]; then
  echo "ERROR: core.hooksPath points to '$RESOLVED', but pre-commit hook is missing." >&2
  exit 1
fi

echo "✓ git core.hooksPath is configured and active ($HOOKS_PATH -> $RESOLVED)"
exit 0