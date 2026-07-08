#!/usr/bin/env bash
# validate-commit-msg.sh — reject commits whose subject line is not a valid
# Conventional Commit header, using commitlint.config.cjs as the single
# source of truth for allowed types/scopes.
#
# Regression (T001356 / G-GIT02): CI only validates the *PR title*
# (amannn/action-semantic-pull-request in .github/workflows/ci.yml). Nothing
# validates the individual commit messages that actually land on `main`
# (squash-merge commit body, direct pushes, merge commits). A commit with a
# non-conventional subject (e.g. literal template placeholder text) can slip
# through untouched and pollute tracking/timeline data derived from commit
# history.
#
# This script is the shared validator called by both:
#   - .githooks/pre-push (local, blocking)
#   - .github/workflows/ci.yml commit-lint job (CI, blocking, catches bypasses)
#
# Usage:
#   validate-commit-msg.sh range <base>..<head>   # validate every non-merge commit in range
#   validate-commit-msg.sh head                    # validate just HEAD's subject
#   validate-commit-msg.sh message <file>          # validate literal subject text from file
#   validate-commit-msg.sh scopes                  # print every allowed scope, one per line
#
# Exit codes: 0 = all validated commits conform, 1 = at least one violation, 2 = usage error.
set -uo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$repo_root/commitlint.config.cjs"

# Allowed conventional-commit types — mirrors the `types:` list in the
# commit-lint CI job (.github/workflows/ci.yml) and @commitlint/config-conventional.
ALLOWED_TYPES="feat fix chore docs refactor test build ci perf revert style"

# Header length limit — mirrors commitlint.config.cjs `header-max-length`.
MAX_HEADER_LEN=150

# Commit subjects that are always allowed regardless of conventional-commit
# shape (git-generated, not authored).
is_exempt_subject() {
  case "$1" in
    "Merge "*|"Revert \""*) return 0 ;;
    *) return 1 ;;
  esac
}

# Ticket number pattern — any T + 6 digits is a valid scope.
TICKET_SCOPE_RE='^T[0-9]{6}$'

# Health-goal scope pattern — G-<UPPERCASE_IDENT> (e.g. G-SIZE02, G-CQ07, G-AGENTIC01).
# Mirrors commitlint.config.cjs HEALTH_GOAL_SCOPE_RE. Health goals are tracked
# in .claude/lib/goals.md and the OpenSpec spec openspec/specs/agentic-tooling-quality-goals.md
# (and the G-RH01–G-RH07 anchors in the goals doc).
HEALTH_GOAL_SCOPE_RE='^G-[A-Z][A-Z0-9]+$'

# Load the named scope list from commitlint.config.cjs (single source of truth).
load_allowed_scopes() {
  if command -v node >/dev/null 2>&1 && [ -f "$CONFIG" ]; then
    node -e "
      const cfg = require('$CONFIG');
      const scopes = cfg.namedScopes || [];
      process.stdout.write(scopes.join(' '));
    " 2>/dev/null
  fi
}

ALLOWED_SCOPES="$(load_allowed_scopes)"

# Validate a single subject line. Prints a diagnostic and returns 1 on violation.
validate_subject() {
  local subject="$1" sha="${2:-}"
  local label="${sha:+[$sha] }"

  if is_exempt_subject "$subject"; then
    return 0
  fi

  if [ "${#subject}" -gt "$MAX_HEADER_LEN" ]; then
    echo "  ✗ ${label}header exceeds ${MAX_HEADER_LEN} chars: ${subject}" >&2
    return 1
  fi

  # Conventional Commits header shape: type(scope)?!?: subject
  if [[ ! "$subject" =~ ^([a-z]+)(\(([a-zA-Z0-9_-]+)\))?!?:\ .+ ]]; then
    echo "  ✗ ${label}not a Conventional Commit header: ${subject}" >&2
    return 1
  fi

  local type="${BASH_REMATCH[1]}"
  local scope="${BASH_REMATCH[3]:-}"

  if ! grep -qw "$type" <<<"$ALLOWED_TYPES"; then
    echo "  ✗ ${label}unknown type '${type}': ${subject}" >&2
    return 1
  fi

  if [ -n "$scope" ] && [ -n "$ALLOWED_SCOPES" ]; then
    # Ticket number scopes (e.g. T001449) are always allowed.
    if [[ "$scope" =~ $TICKET_SCOPE_RE ]]; then
      : # ok
    elif [[ "$scope" =~ $HEALTH_GOAL_SCOPE_RE ]]; then
      : # ok — health-goal scopes (G-SIZE02, G-CQ07, G-AGENTIC01, …) are tracked in .claude/lib/goals.md
    else
      local ok=1
      for s in $ALLOWED_SCOPES; do
        if [ "$s" = "$scope" ]; then
          ok=0
          break
        fi
      done
      if [ "$ok" -ne 0 ]; then
        echo "  ✗ ${label}unknown scope '${scope}': ${subject}" >&2
        return 1
      fi
    fi
  fi

  return 0
}

validate_range() {
  local range="$1"
  local failures=0 checked=0

  while IFS=$'\t' read -r sha subject; do
    [ -z "$sha" ] && continue
    checked=$((checked + 1))
    if ! validate_subject "$subject" "$sha"; then
      failures=$((failures + 1))
    fi
  done < <(git -C "$repo_root" log --no-merges --format='%h%x09%s' "$range" 2>/dev/null)

  if [ "$checked" -eq 0 ]; then
    echo "validate-commit-msg: no commits in range '$range' (nothing to check)" >&2
    return 0
  fi

  if [ "$failures" -gt 0 ]; then
    echo "validate-commit-msg: ${failures}/${checked} commit(s) failed Conventional Commit validation" >&2
    return 1
  fi

  echo "validate-commit-msg: ${checked} commit(s) OK"
  return 0
}

main() {
  local mode="${1:-}"
  case "$mode" in
    range)
      local range="${2:-}"
      [ -z "$range" ] && { echo "usage: validate-commit-msg.sh range <base>..<head>" >&2; exit 2; }
      validate_range "$range"
      exit $?
      ;;
    head)
      local subject
      subject="$(git -C "$repo_root" log -1 --format='%s')"
      local sha
      sha="$(git -C "$repo_root" log -1 --format='%h')"
      if validate_subject "$subject" "$sha"; then
        echo "validate-commit-msg: HEAD OK"
        exit 0
      fi
      exit 1
      ;;
    message)
      local file="${2:-}"
      if [ -z "$file" ] || [ ! -f "$file" ]; then
        echo "usage: validate-commit-msg.sh message <file>" >&2
        exit 2
      fi
      local subject
      subject="$(head -1 "$file")"
      if validate_subject "$subject"; then
        echo "validate-commit-msg: message OK"
        exit 0
      fi
      exit 1
      ;;
    scopes)
      local scopes
      scopes="$(load_allowed_scopes)"
      if [ -z "$scopes" ]; then
        echo "validate-commit-msg: could not load scopes from $CONFIG" >&2
        exit 1
      fi
      # load_allowed_scopes() returns a space-joined string; emit one per line.
      printf '%s\n' $scopes
      exit 0
      ;;
    *)
      echo "usage: validate-commit-msg.sh {range <base>..<head>|head|message <file>|scopes}" >&2
      exit 2
      ;;
  esac
}

main "$@"
