#!/usr/bin/env bash
# scripts/git-safe-push.sh — wrapper around `git push` that reconciles a
# POST-push divergence of local `main` from origin/main. [T001391]
#
# Git has no native post-push hook (pre-push runs before transfer and cannot
# observe server-side follow-ups like the freshness-regen bot commit or a
# squash-merge). This wrapper pushes first, then — only when on `main` —
# re-fetches origin/main and heals a CONTENT-EQUIVALENT divergence, warning
# (never auto-discarding) on a genuine one.
set -euo pipefail

# Emergency opt-out — dedicated flag, does NOT overload SKIP_CI_CHECK.
if [[ "${SKIP_PUSH_SYNC:-0}" == "1" ]]; then
  exec git push "$@"
fi

# 1. Do the actual push first — its success is authoritative.
git push "$@"

# 2. Guard is scoped to `main`. On any other branch we are done.
current_branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"
if [[ "$current_branch" != "main" ]]; then
  exit 0
fi

# 3. Re-fetch origin/main to observe the true post-push state. A network
#    failure here must NEVER fail the already-successful push — warn, exit 0.
if ! git fetch origin main --quiet 2>/dev/null; then
  echo "git-safe-push: WARN — could not fetch origin/main after push (network?); skipping sync check." >&2
  exit 0
fi

# 4. In sync: origin/main is an ancestor of HEAD (equal or fast-forwardable) → no-op.
if git merge-base --is-ancestor origin/main HEAD 2>/dev/null; then
  exit 0
fi

# 5. Behind only: HEAD is an ancestor of origin/main → fast-forward.
if git merge-base --is-ancestor HEAD origin/main 2>/dev/null; then
  echo "git-safe-push: local main is behind origin/main — fast-forwarding." >&2
  git merge --ff-only origin/main
  exit 0
fi

# 6. Genuine divergence: neither ref is an ancestor of the other.
echo "git-safe-push: local main has DIVERGED from origin/main." >&2

# 6a. Content-equivalence via patch-id of the two-dot tree diff. An empty diff
#     means HEAD's tree introduces nothing beyond origin/main (e.g. the local
#     commit was absorbed by a squash-merge upstream) → safe to discard.
diff_patch_id="$(git diff origin/main..HEAD | git patch-id --stable | awk '{print $1}')"
working_tree_clean=true
[[ -n "$(git status --porcelain)" ]] && working_tree_clean=false

if [[ -z "$diff_patch_id" && "$working_tree_clean" == true ]]; then
  discarded="$(git rev-parse --short HEAD)"
  git reset --hard origin/main
  echo "git-safe-push: content-equivalent divergence — auto-reset local main to origin/main (discarded local ref ${discarded}; its content is already upstream)." >&2
  exit 0
fi

# 6b. Genuine divergence OR dirty working tree → warn only, never auto-discard.
echo "git-safe-push: NOT auto-resetting — genuine divergence or dirty working tree." >&2
echo "  Inspect local-only commits: git log --oneline origin/main..HEAD" >&2
echo "  If you have confirmed the local content is safe to drop, recover with: git reset --hard origin/main" >&2
exit 0
