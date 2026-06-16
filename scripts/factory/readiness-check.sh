#!/usr/bin/env bash
# scripts/factory/readiness-check.sh
# check_ticket_readiness <branch> <plan_path>
# Emits one-line JSON: {"ready":true|false,"reason":"ok"|"no_branch"|"no_plan_on_branch"|"missing_args"}
# Exit 0 when ready, exit 1 when not ready / bad args.
set -uo pipefail

check_ticket_readiness() {
  local branch="${1:-}" plan_path="${2:-}"

  if [[ -z "$branch" || "$branch" == "null" || -z "$plan_path" || "$plan_path" == "null" ]]; then
    printf '{"ready":false,"reason":"missing_args"}\n'
    return 1
  fi

  if ! git ls-remote --exit-code origin "refs/heads/$branch" >/dev/null 2>&1; then
    printf '{"ready":false,"reason":"no_branch"}\n'
    return 1
  fi

  if ! git show "origin/$branch:$plan_path" >/dev/null 2>&1; then
    printf '{"ready":false,"reason":"no_plan_on_branch"}\n'
    return 1
  fi

  printf '{"ready":true,"reason":"ok"}\n'
  return 0
}

# Run only when executed directly, not when sourced.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  check_ticket_readiness "$@"
fi
