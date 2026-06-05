#!/usr/bin/env bats
# Regression test for T000423.
#
# The website CI deploy step must actually REPOINT the Deployment to the
# freshly-built image via `kubectl set image`, not merely `rollout restart`.
# A `rollout restart` is a silent no-op when the live Deployment spec is
# pinned to an immutable @sha256 digest (which `task website:deploy` does on
# pure-amd64 clusters) — the pod just re-pulls the same old digest and the
# new code never lands. Both build-website workflows already build and push a
# unique ${IMAGE}:${SHA_TAG} and export IMAGE/SHA_TAG to $GITHUB_ENV, so the
# deploy step has everything it needs to do a deterministic `set image`.
#
# RED until .github/workflows/build-website.yml and
# build-website-korczewski.yml are fixed; GREEN after.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  MENTOLDER_WF="$REPO_ROOT/.github/workflows/build-website.yml"
  KORCZEWSKI_WF="$REPO_ROOT/.github/workflows/build-website-korczewski.yml"
}

@test "T000423: mentolder build-website.yml exists" {
  [ -f "$MENTOLDER_WF" ]
}

@test "T000423: korczewski build-website-korczewski.yml exists" {
  [ -f "$KORCZEWSKI_WF" ]
}

@test "T000423: mentolder deploy repoints via 'kubectl set image deployment/website'" {
  grep -Eq 'kubectl[[:space:]]+set[[:space:]]+image[[:space:]]+deployment/website[[:space:]]+website=' "$MENTOLDER_WF"
}

@test "T000423: mentolder set-image uses the freshly-built tag (SHA_TAG/IMAGE), not a static ref" {
  grep -E 'kubectl[[:space:]]+set[[:space:]]+image[[:space:]]+deployment/website' "$MENTOLDER_WF" \
    | grep -Eq '\$\{?SHA_TAG\}?|\$\{?IMAGE\}?'
}

@test "T000423: korczewski deploy repoints via 'kubectl set image deployment/website'" {
  grep -Eq 'kubectl[[:space:]]+set[[:space:]]+image[[:space:]]+deployment/website[[:space:]]+website=' "$KORCZEWSKI_WF"
}

@test "T000423: korczewski set-image uses the freshly-built tag (SHA_TAG/IMAGE), not a static ref" {
  grep -E 'kubectl[[:space:]]+set[[:space:]]+image[[:space:]]+deployment/website' "$KORCZEWSKI_WF" \
    | grep -Eq '\$\{?SHA_TAG\}?|\$\{?IMAGE\}?'
}

@test "T000423: both deploy steps still wait for rollout status (no regression)" {
  grep -Eq 'kubectl[[:space:]]+rollout[[:space:]]+status[[:space:]]+deployment/website' "$MENTOLDER_WF"
  grep -Eq 'kubectl[[:space:]]+rollout[[:space:]]+status[[:space:]]+deployment/website' "$KORCZEWSKI_WF"
}
