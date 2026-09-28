#!/usr/bin/env bats
# Regression test for T000423 (updated for the T001229 build consolidation,
# re-scoped for the Flux steady state in T900810).
#
# Intent (T000423): the website CI pipeline must actually LAND the freshly-built
# image in prod — not silently keep serving the old one. Pre-Flux that meant a
# deterministic `kubectl set image` to the fresh tag (a bare `rollout restart`
# is a silent no-op against a digest-pinned Deployment spec). Since Flux is
# steady state, the mechanism is the render-artifact job: it re-renders the
# fleet manifests with the exact image digest from build-image outputs and Flux
# reconciles it. These tests pin THAT wiring instead of the removed kubectl path.
#
# History: T001229 folded the standalone korczewski workflow into
# build-website.yml; T001276 split it into build-image → deploy-mentolder +
# deploy-korczewski (parallel). T900810 removed deploy-mentolder (pre-Flux,
# dead); deploy-korczewski stays only because guards pin its existence
# (Guard-Entscheid T900810) — it never fires. The legacy
# build-website-korczewski.yml stays deleted.

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

@test "T000423/T900810: website deploy pins the fresh image via render-artifact digest input (Flux)" {
  # Flux successor of the mentolder set-image assertion: the render-artifact job
  # must receive the exact digest built above — a static ref would silently
  # keep serving the old image (the T000423 failure mode in Flux terms).
  grep -Eq 'website_image_digest:[[:space:]]*\$\{\{[[:space:]]*needs\.build-image\.outputs\.digest' "$MENTOLDER_WF"
}

@test "T000423/T900810: build-image exports the digest output the Flux render consumes" {
  run python3 - "$MENTOLDER_WF" <<'PY'
import sys, yaml
jobs = (yaml.safe_load(open(sys.argv[1])) or {}).get('jobs', {})
outs = (jobs.get('build-image') or {}).get('outputs') or {}
assert 'digest' in outs, 'build-image hat kein digest output (render-artifact liefe mit leerem Pin)'
PY
  [ "$status" -eq 0 ]
}

@test "T001229: korczewski deploy repoints via 'kubectl set image deployment/website' (-n website-korczewski)" {
  grep -Eq 'kubectl[[:space:]]+set[[:space:]]+image[[:space:]]+deployment/website[[:space:]]+website=.*-n[[:space:]]+website-korczewski' "$KORCZEWSKI_WF"
}

@test "T001229: korczewski set-image uses the freshly-built tag (SHA_TAG/IMAGE), not a static ref" {
  grep -E 'kubectl[[:space:]]+set[[:space:]]+image[[:space:]]+deployment/website[[:space:]]+website=.*-n[[:space:]]+website-korczewski' "$KORCZEWSKI_WF" \
    | grep -Eq '\$\{?SHA_TAG\}?|\$\{?IMAGE\}?'
}

@test "T000423/T900810: the remaining deploy job still waits for rollout status (no regression)" {
  # T900810: deploy-mentolder entfernt — genau EIN rollout-wait (korczewski).
  [ "$(grep -Ec 'kubectl[[:space:]]+rollout[[:space:]]+status[[:space:]]+deployment/website' "$MENTOLDER_WF")" -eq 1 ]
}
