#!/usr/bin/env bats
# tests/spec/local-dev-mesh/no-k3d-context.bats — T900145
setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  PAT="k3d-mentolder""-dev"
}

_active_hits() {
  local ex=(
    ':!openspec/changes'
    ':!docs/superpowers/plans'
    ':!docs/superpowers/specs/archive'
    ':!docs/adr'
    ':!k3d/docs-content-built'
    ':!scripts/migrations'
    ':!tests/fixtures/mishap-dedupe-korpus.json'
  )
  if [ -d "$REPO_ROOT/openspec/changes/devmesh-k3d-decommission" ]; then
    ex+=(':!openspec/specs')
  fi
  git -C "$REPO_ROOT" grep -l -F -e "$PAT" -- . "${ex[@]}" || true
}

@test "search finds the pattern in an excluded path (positive anchor)" {
  run git -C "$REPO_ROOT" grep -l -F -e "$PAT" -- docs/adr
  [ "$status" -eq 0 ]
  [ -n "$output" ]
}

@test "no active reference to the k3d dev context remains" {
  local anchor hits
  anchor="$(git -C "$REPO_ROOT" grep -l -F -e "$PAT" -- docs/adr || true)"
  [ -n "$anchor" ]
  hits="$(_active_hits)"
  [ -z "$hits" ] || { echo "aktive Verweise:"; echo "$hits"; return 1; }
}
