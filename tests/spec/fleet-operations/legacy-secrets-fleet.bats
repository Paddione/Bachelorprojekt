#!/usr/bin/env bats
# tests/spec/fleet-operations/legacy-secrets-fleet.bats — T900789
# ENV=mentolder/korczewski duerfen keine eigenen Secret-Dateien mehr lesen oder anwenden;
# sie loesen ueber `secrets_env` auf fleet-<brand> auf.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  HELPER="${REPO_ROOT}/scripts/lib/secrets-env.sh"
}

@test "T900789: secrets_env_for loest Legacy-ENVs auf fleet-<brand> auf" {
  [ -f "$HELPER" ]
  run bash -c "source '$HELPER' && cd '$REPO_ROOT' && secrets_env_for mentolder"
  [ "$status" -eq 0 ]
  [ "$output" = "fleet-mentolder" ]
  run bash -c "source '$HELPER' && cd '$REPO_ROOT' && secrets_env_for korczewski"
  [ "$output" = "fleet-korczewski" ]
}

@test "T900789: secrets_env_for ohne Feld liefert den ENV-Namen selbst" {
  [ -f "$HELPER" ]
  run bash -c "source '$HELPER' && cd '$REPO_ROOT' && secrets_env_for dev && secrets_env_for fleet-mentolder"
  [ "$status" -eq 0 ]
  [ "$output" = $'dev\nfleet-mentolder' ]
}

@test "T900789: Legacy-Secret-Dateien existieren nicht mehr" {
  for f in .secrets/mentolder.yaml .secrets/korczewski.yaml \
           sealed-secrets/mentolder.yaml sealed-secrets/korczewski.yaml; do
    [ ! -e "${REPO_ROOT}/environments/$f" ] || { echo "noch vorhanden: environments/$f"; return 1; }
  done
}

@test "T900789: kein Task/Skript bildet Secret-Pfade direkt aus dem ENV-Namen" {
  cd "$REPO_ROOT"
  # Erlaubt: dev-stack (nur ENV=dev) und der Helper selbst.
  run git grep -nE '(\.secrets|sealed-secrets)/(\{\{\.ENV\}\}|\$\{?ENV(_NAME)?\}?)\.yaml' -- \
    taskfiles Taskfile.yml scripts ':!taskfiles/Taskfile.dev-stack.yml' ':!scripts/lib/secrets-env.sh' \
    ':!scripts/lib/seal-extra-namespaces.sh'
  [ "$status" -ne 0 ] || { echo "$output"; return 1; }
  run git grep -n 'environments/.secrets/mentolder.yaml' -- scripts
  [ "$status" -ne 0 ] || { echo "$output"; return 1; }
}

@test "T900789: env-generate/env-seal/secret-rotate loesen ueber secrets_env auf" {
  cd "$REPO_ROOT"
  for f in scripts/env-generate.sh scripts/env-seal.sh scripts/secret-rotate.sh; do
    grep -q 'lib/secrets-env.sh' "$f" || { echo "ohne Helper: $f"; return 1; }
  done
  run bash scripts/env-generate.sh --env mentolder --env-dir environments
  [ "$status" -ne 0 ]
  [[ "$output" == *"fleet-mentolder"* ]]
  [ ! -e environments/.secrets/mentolder.yaml ]
}
