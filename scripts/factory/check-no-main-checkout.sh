#!/usr/bin/env bash
# scripts/factory/check-no-main-checkout.sh — static session-coordination guard. [T001383]
# Fails (exit 1) if any script under scripts/factory/ issues a raw `git checkout`/
# `git switch` against the shared main checkout. Worktree-scoped calls
# (`git -C "$WORK_WT" ...`, or commands run after `cd` into a dedicated worktree)
# are permitted. Reused by the factory-branch-switch-guard BATS test and CI.
set -uo pipefail
root="${1:-scripts/factory}"
# grep output is path:lineno:content. Keep only real raw checkout/switch:
#   - drop comment lines (content starts with #)
#   - drop worktree-scoped `git -C ...` forms
#   - drop this guard's own file (its comments/regex mention the tokens)
hits="$(grep -rnE 'git[[:space:]]+(checkout|switch)([[:space:]]|$)' \
          "$root" --include='*.sh' --include='*.js' --include='*.mjs' --include='*.cjs' \
          2>/dev/null \
        | grep -vE '^[^:]+:[0-9]+:[[:space:]]*#' \
        | grep -vE 'git[[:space:]]+-C[[:space:]]' \
        | grep -v 'check-no-main-checkout.sh' \
        | grep -v 'worktree-create.sh' || true)"
if [ -n "$hits" ]; then
  echo "FACTORY-GUARD: raw git checkout/switch in the shared main checkout:" >&2
  printf '%s\n' "$hits" >&2
  exit 1
fi
exit 0
