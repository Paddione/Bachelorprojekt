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

# [T002687] repo-index.json wird nicht mehr eingefordert — es gehoert nicht mehr
# in PRs (file_count-Kollisionen zwischen parallelen PRs; nirgends gelesen;
# freshness-regen.yml haelt es auf main aktuell). Die frueheren Tests
# "meldet repo-index, wenn nur test-inventory im Push liegt" und
# "meldet beide, wenn keines im Push liegt" kodierten das alte Verhalten und
# sind durch die beiden folgenden ersetzt.
@test "check-freshness-artifacts: schweigt, wenn test-inventory im Push liegt" {
  local head
  head="$(_commit_bats_with website/src/data/test-inventory.json)"

  run bash "$SCRIPT" "$BASE_SHA" "$head"

  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "check-freshness-artifacts: fordert repo-index NIE ein" {
  # Negativaussage mit Positiv-Anker [T002356-M1]: der erste Teil belegt, dass
  # das Skript ueberhaupt anschlaegt und etwas ausgibt. Ohne ihn waere
  # "repo-index kommt nicht vor" bei jeder leeren Ausgabe trivial wahr — auch
  # wenn der Hook gar nicht mehr liefe.
  local head
  head="$(_commit_bats_with)"

  run bash "$SCRIPT" "$BASE_SHA" "$head"

  [ -n "$output" ]
  [[ "$output" == *"test-inventory.json"* ]]
  [ "$status" -ne 0 ]

  [[ "$output" != *"repo-index.json"* ]]
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

# [T002687] Der Test "meldet beide, wenn keines im Push liegt" stand hier. Seit
# nur noch test-inventory eingefordert wird, deckt ihn "fordert repo-index NIE
# ein" oben vollstaendig ab — dieselbe Ausgangslage (kein Artefakt im Push),
# dieselbe Assertion plus die Negativaussage. Ein zweiter Test mit identischem
# Aufbau haette keinen eigenen Erkenntniswert.

@test "check-freshness-artifacts: schweigt, wenn beide im Push liegen" {
  local head
  head="$(_commit_bats_with docs/code-quality/repo-index.json website/src/data/test-inventory.json)"

  run bash "$SCRIPT" "$BASE_SHA" "$head"

  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

# [T002686] Frueher lautete dieser Test "schweigt, wenn gar keine .bats-Datei
# geaendert wurde" und legte dazu eine NEUE Datei an. Genau das ist der Fall, in
# dem der Hook nicht mehr schweigen darf: repo-index.json zaehlt alle getrackten
# Dateien und wird von jedem Hinzufuegen stale. Die Bedingung ist jetzt pro
# Artefakt getrennt — dieser Test prueft den unveraenderten Teil (test-inventory
# bleibt bei einer Nicht-Test-Datei stumm), die beiden folgenden den neuen.
@test "check-freshness-artifacts: fordert bei reiner Aenderung einer Nicht-Test-Datei nichts" {
  # docs/code-quality/repo-index.json existiert im Fixture -> Modify, kein Add.
  # Zugleich ist es selbst eines der Artefakte, liegt also im Push.
  echo '{"x":1}' > docs/code-quality/repo-index.json
  git add docs/code-quality/repo-index.json
  git commit -qm "modify only"
  local head
  head="$(git rev-parse HEAD)"

  run bash "$SCRIPT" "$BASE_SHA" "$head"

  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

# [T002687] Frueher forderte dieser Fall repo-index.json ein. Seit repo-index
# nicht mehr in PRs gehoert, ist eine hinzugefuegte Nicht-Test-Datei fuer den
# Hook belanglos — genau das entlastet PRs von der Kollisionsquelle.
@test "check-freshness-artifacts: schweigt bei NEUER Nicht-Test-Datei" {
  mkdir -p website/src/lib
  echo "export const x = 1;" > website/src/lib/neu.test.ts
  git add website/src/lib/neu.test.ts
  git commit -qm "add non-bats file"
  local head
  head="$(git rev-parse HEAD)"

  run bash "$SCRIPT" "$BASE_SHA" "$head"

  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "check-freshness-artifacts: fordert test-inventory bei NEUER .bats-Datei" {
  # Der positive Gegenpol zu den beiden Schweige-Tests: ohne ihn koennte der
  # Hook vollstaendig kaputt sein und alle "schweigt"-Aussagen blieben wahr.
  mkdir -p tests/spec
  echo '@test "neu" { true; }' > tests/spec/neu.bats
  git add tests/spec/neu.bats
  git commit -qm "add bats file"
  local head
  head="$(git rev-parse HEAD)"

  run bash "$SCRIPT" "$BASE_SHA" "$head"

  [ "$status" -eq 1 ]
  [[ "$output" == *"website/src/data/test-inventory.json"* ]]
  [[ "$output" != *"repo-index.json"* ]]
}

@test "check-freshness-artifacts: fordert test-inventory beim LOESCHEN einer .bats-Datei" {
  # tests/spec/alt.bats stammt aus dem Fixture-Setup. Loeschen entfernt ihre
  # Eintraege aus dem Inventar — hier bleibt die Forderung also bestehen,
  # anders als bei repo-index (T002687).
  git rm -q tests/spec/alt.bats
  git commit -qm "delete file"
  local head
  head="$(git rev-parse HEAD)"

  run bash "$SCRIPT" "$BASE_SHA" "$head"

  [ "$status" -eq 1 ]
  [[ "$output" == *"website/src/data/test-inventory.json"* ]]
  [[ "$output" != *"repo-index.json"* ]]
}
