#!/usr/bin/env bats
# tests/spec/ci-cd/pre-push-artifact-guard.bats [T002672]
#
# PRÜFMODUS: Output-Verifikation. Jeder Test legt ein echtes temporäres Git-Repo
# an, erzeugt darin Commits und ruft `scripts/hooks/check-freshness-artifacts.sh`
# als Kommando auf. Geprüft werden dessen stdout und Exit-Status — nicht der
# Quelltext des Skripts.
#
# HINTERGRUND: .githooks/pre-push ermittelte die Artefakt-Lage mit einem
# einzigen ODER-grep:
#   CHANGED_INDEX=$(git diff --name-only … | grep 'repo-index\.json\|test-inventory\.json')
#   if [[ -z "$CHANGED_INDEX" ]]; then  … warnen …  fi
# Lag EINE der beiden Dateien im Push, war CHANGED_INDEX nicht leer und der
# gesamte Warnblock wurde übersprungen — auch wenn die andere fehlte. Real
# aufgetreten bei PR #3794: test-inventory.json war dabei, repo-index.json
# nicht, der Hook schwieg, CI fiel darüber.
#
# Der Guard belohnte damit Halbwissen mit Stille: wären BEIDE Dateien vergessen
# worden, hätte er gewarnt.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  SCRIPT="${REPO_ROOT}/scripts/hooks/check-freshness-artifacts.sh"
  TESTREPO="${BATS_TEST_TMPDIR}/repo"

  mkdir -p "$TESTREPO"
  cd "$TESTREPO" || return 1
  git init -q -b main .
  git config user.email "test@example.invalid"
  git config user.name "Test"
  git config commit.gpgsign false

  # Basis-Commit: beide generierten Artefakte existieren bereits.
  mkdir -p docs/code-quality website/src/data tests/spec
  echo '{}' > docs/code-quality/repo-index.json
  echo '[]' > website/src/data/test-inventory.json
  echo '@test "alt" { true; }' > tests/spec/alt.bats
  git add -A
  git commit -qm "base"
  BASE_SHA="$(git rev-parse HEAD)"
}

# Legt einen Commit an, der eine .bats-Datei ändert plus die übergebenen Artefakte.
_commit_bats_with() {
  echo '@test "neu" { true; }' > tests/spec/neu.bats
  git add tests/spec/neu.bats
  for artifact in "$@"; do
    echo "{\"changed\":true}" > "$artifact"
    git add "$artifact"
  done
  git commit -qm "change bats"
  git rev-parse HEAD
}

@test "check-freshness-artifacts: meldet repo-index, wenn nur test-inventory im Push liegt" {
  local head
  head="$(_commit_bats_with website/src/data/test-inventory.json)"

  run bash "$SCRIPT" "$BASE_SHA" "$head"

  # Positiv-Anker [T002356-M1]: erst belegen, dass das Skript überhaupt lief und
  # etwas ausgab — sonst wäre jede Aussage über die Ausgabe trivial wahr.
  [ -n "$output" ]

  [[ "$output" == *"repo-index.json"* ]]
  [[ "$output" != *"test-inventory.json"* ]]
  [ "$status" -ne 0 ]
}

@test "check-freshness-artifacts: meldet test-inventory, wenn nur repo-index im Push liegt" {
  local head
  head="$(_commit_bats_with docs/code-quality/repo-index.json)"

  run bash "$SCRIPT" "$BASE_SHA" "$head"

  [ -n "$output" ]
  [[ "$output" == *"test-inventory.json"* ]]
  [[ "$output" != *"repo-index.json"* ]]
  [ "$status" -ne 0 ]
}

@test "check-freshness-artifacts: meldet beide, wenn keines im Push liegt" {
  local head
  head="$(_commit_bats_with)"

  run bash "$SCRIPT" "$BASE_SHA" "$head"

  [ -n "$output" ]
  [[ "$output" == *"repo-index.json"* ]]
  [[ "$output" == *"test-inventory.json"* ]]
  [ "$status" -ne 0 ]
}

@test "check-freshness-artifacts: schweigt, wenn beide im Push liegen" {
  local head
  head="$(_commit_bats_with docs/code-quality/repo-index.json website/src/data/test-inventory.json)"

  run bash "$SCRIPT" "$BASE_SHA" "$head"

  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "check-freshness-artifacts: schweigt, wenn gar keine .bats-Datei geändert wurde" {
  echo "irgendwas" > README.md
  git add README.md
  git commit -qm "no bats"
  local head
  head="$(git rev-parse HEAD)"

  run bash "$SCRIPT" "$BASE_SHA" "$head"

  [ "$status" -eq 0 ]
  [ -z "$output" ]
}
