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
    ':!scripts/migrations'
    ':!tests/fixtures/mishap-dedupe-korpus.json'
    ':!tests/spec/local-dev-mesh/migrate-from-k3d.bats'
    # Generiert aus den Specs, fuehrt Requirement-Titel woertlich — auch die entfernter
    # Requirements. Dauerhaft ausgenommen, nicht an eine Change-Verzeichnis-Existenz gebunden.
    ':!docs/spec-atlas.md'
    # Nennt den Dateinamen des archivierten Dumps, nicht einen Kubeconfig-Context (T900120).
    ':!scripts/devmesh/migrate-from-k3d.sh'
  )
  if [ -d "$REPO_ROOT/openspec/changes/devmesh-k3d-residue-cleanup" ]; then
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
