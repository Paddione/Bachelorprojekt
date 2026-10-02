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
    ':!tests/spec/os-retirement-*.bats' ':!tests/fixtures/os-retirement' \
    ':!tests/fixtures/sf-retirement' \
    ':!tests/spec/neovim-dashboard.bats' \
    ':!.opencode/skills/code-graph-interpretation/evals/results-*'
  # Datei-Ausnahmen: neovim-dashboard.bats ist ein Absence-Guard wie os-retirement-*
  # (das Pattern steht im Test selbst); fixtures/sf-retirement listet A3-Pfade mit
  # openspec-Namen (Absence-Guard-Korpus wie tests/fixtures/os-retirement);
  # results-* sind unveraenderliche Eval-Evidenz.
  # Zeilen-Ausnahmen (exakt): ci.yml Aggregator-Name (faellt mit A3b),
  # gitlab-restore.md DR-Kommando (Pfad im eingefrorenen archive/gitlab-ci-Branch).
  [ -z "$output" ] && return 0
  local offenders=""
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    case "$f" in
      .github/workflows/ci.yml)
        git -C "$REPO" grep -h -i openspec -- "$f" | grep -qvFx "    name: Factory + OpenSpec + Guards" && offenders="$offenders $f(ci-extra)"
        ;;
      docs/runbooks/gitlab-restore.md)
        git -C "$REPO" grep -h -i openspec -- "$f" | grep -qv 'archive/gitlab-ci:openspec/specs/ci-cd.md' && offenders="$offenders $f(restore-extra)"
        ;;
      *) offenders="$offenders $f" ;;
    esac
  done <<< "$output"
  [ -z "$offenders" ] || { echo "unerlaubte Verweise in:$offenders"; return 1; }
}
