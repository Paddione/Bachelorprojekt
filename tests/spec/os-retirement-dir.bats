#!/usr/bin/env bats
# T900726: OpenSpec-Abriss A2 — Verzeichnis geloescht, repo-weiter Guard (ADR-010, C7b).
# Pruefmodus: Ausgabe von git ls-files/git grep [T002448-M4].

setup() {
  REPO="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
}

@test "T900726: openspec/ ist nicht mehr getrackt" {
  run git -C "$REPO" ls-files -- openspec
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "T900726: openspec kommt nur noch in der Allowlist vor" {
  run git -C "$REPO" grep -l -i openspec -- . \
    ':!docs/superpowers' ':!docs/adr' ':!.agents/docs/reorg-phase2' ':!.agents/plans' ':!.agents/memory' \
    ':!scripts/migrations' ':!**/CHANGELOG.md' ':!CHANGELOG.md' ':!docs/generated' ':!docs/code-quality/repo-index.json' \
    ':!tests/spec/os-retirement-*.bats' ':!tests/fixtures/os-retirement'
  [ -z "$output" ] || { echo "$output" | head -40; return 1; }
}
