#!/usr/bin/env bats
# Regression test for T000423 (updated for the T001229 build consolidation).
#
# The website CI deploy step must actually REPOINT the Deployment to the
# freshly-built image via `kubectl set image`, not merely `rollout restart`.
# A `rollout restart` is a silent no-op when the live Deployment spec is
# pinned to an immutable @sha256 digest (which `task website:deploy` does on
# pure-amd64 clusters) — the pod just re-pulls the same old digest and the
# new code never lands. The build step builds and pushes a unique
# ${IMAGE}:${SHA_TAG} and exports IMAGE/SHA_TAG to $GITHUB_ENV, so each deploy
# step has everything it needs to do a deterministic `set image`.
#
# T001229 folded the standalone korczewski workflow into build-website.yml:
# ONE shared, brand-neutral image build (ghcr.io/paddione/website) now feeds
# TWO deploy steps — mentolder (namespace `website`) and korczewski
# (namespace `website-korczewski`). The legacy build-website-korczewski.yml
# was deleted. Both deploy steps live in build-website.yml and must each still
# `set image` to the freshly-built tag and wait for rollout.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  MENTOLDER_WF="$REPO_ROOT/.github/workflows/build-website.yml"
  # T001229: korczewski deploy now lives in the same consolidated workflow.
  KORCZEWSKI_WF="$REPO_ROOT/.github/workflows/build-website.yml"
}

@test "T000423: consolidated build-website.yml exists" {
  [ -f "$MENTOLDER_WF" ]
}

@test "T001229: standalone korczewski workflow removed; korczewski deploy folded into build-website.yml" {
  [ ! -f "$REPO_ROOT/.github/workflows/build-website-korczewski.yml" ]
  grep -Eq 'BRAND_ID:[[:space:]]*korczewski' "$KORCZEWSKI_WF"
}

@test "T000423: mentolder deploy repoints via 'kubectl set image deployment/website' (-n website)" {
  grep -Eq 'kubectl[[:space:]]+set[[:space:]]+image[[:space:]]+deployment/website[[:space:]]+website=.*-n[[:space:]]+website[[:space:]]*$' "$MENTOLDER_WF"
}

@test "T000423: mentolder set-image uses the freshly-built tag (SHA_TAG/IMAGE), not a static ref" {
  grep -E 'kubectl[[:space:]]+set[[:space:]]+image[[:space:]]+deployment/website[[:space:]]+website=.*-n[[:space:]]+website[[:space:]]*$' "$MENTOLDER_WF" \
    | grep -Eq '\$\{?SHA_TAG\}?|\$\{?IMAGE\}?'
}

@test "T001229: korczewski deploy repoints via 'kubectl set image deployment/website' (-n website-korczewski)" {
  grep -Eq 'kubectl[[:space:]]+set[[:space:]]+image[[:space:]]+deployment/website[[:space:]]+website=.*-n[[:space:]]+website-korczewski' "$KORCZEWSKI_WF"
}

@test "T001229: korczewski set-image uses the freshly-built tag (SHA_TAG/IMAGE), not a static ref" {
  grep -E 'kubectl[[:space:]]+set[[:space:]]+image[[:space:]]+deployment/website[[:space:]]+website=.*-n[[:space:]]+website-korczewski' "$KORCZEWSKI_WF" \
    | grep -Eq '\$\{?SHA_TAG\}?|\$\{?IMAGE\}?'
}

@test "T000423: both deploy steps still wait for rollout status (no regression)" {
  [ "$(grep -Ec 'kubectl[[:space:]]+rollout[[:space:]]+status[[:space:]]+deployment/website' "$MENTOLDER_WF")" -eq 2 ]
}
