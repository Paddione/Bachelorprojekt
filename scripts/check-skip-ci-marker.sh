#!/usr/bin/env bash
# Reject CI skip markers in branch commits. [T002522]
#
# Why: a squash merge folds the subjects of all branch commits into the BODY of
# the resulting main commit. GitHub evaluates its workflow skip markers against
# the ENTIRE message of the head commit, not just the subject line, so a
# `[skip ci]` written on a branch silently suppresses every push-triggered
# workflow on main after the merge — no failed run, no signal, just a chain that
# stops. Measured over 25 consecutive main commits on 2026-08-02: the 17 carrying
# a marker produced 0 push runs, the 8 without produced 1 each, no counter-example.
#
# The check runs on the PULL REQUEST, deliberately — on main the trigger is
# already suppressed and the finding would be purely retrospective. It also means
# bot commits pushed straight to main (freshness-regen.yml uses the marker as
# intentional loop protection) never reach this guard, so they need no exception.
#
# Usage: check-skip-ci-marker.sh [<base-ref>] [<head-ref>]
#   defaults: origin/main HEAD
#
# Exit codes:
#   0  no marker found in <base>..<head>
#   1  at least one commit carries a marker (each is named on stdout)
#   2  the commit range could not be resolved
set -euo pipefail

BASE_REF="${1:-origin/main}"
HEAD_REF="${2:-HEAD}"

# Kept in sync with GitHub's documented set of skip markers.
MARKER_RE='\[skip ci\]|\[ci skip\]|\[no ci\]|\[skip actions\]|\[actions skip\]'

if ! git rev-parse --verify --quiet "$BASE_REF" >/dev/null 2>&1; then
    echo "check-skip-ci-marker: cannot resolve base ref '$BASE_REF'" >&2
    exit 2
fi
if ! git rev-parse --verify --quiet "$HEAD_REF" >/dev/null 2>&1; then
    echo "check-skip-ci-marker: cannot resolve head ref '$HEAD_REF'" >&2
    exit 2
fi

# Only commits AHEAD of base — anything already on main is out of scope.
offenders=""
while IFS= read -r sha; do
    [ -n "$sha" ] || continue
    if git log -1 --format=%B "$sha" | grep -qiE "$MARKER_RE"; then
        offenders="${offenders}$(git log -1 --format='  %h %s' "$sha")"$'\n'
    fi
done < <(git rev-list --no-merges "${BASE_REF}..${HEAD_REF}")

if [ -z "$offenders" ]; then
    exit 0
fi

echo "check-skip-ci-marker: CI skip marker found in branch commits"
echo
printf '%s' "$offenders"
echo
echo "A squash merge folds these subjects into the body of the main commit."
echo "GitHub reads skip markers from the whole head-commit message, so this"
echo "would suppress every push-triggered workflow on main — silently."
echo
echo "Fix: rewrite the offending messages, then force-push the branch."
echo "  git rebase -i ${BASE_REF}      # reword each commit listed above"
echo "  git commit --amend             # if only the tip commit is affected"
exit 1
