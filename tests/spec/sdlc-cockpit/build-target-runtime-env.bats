#!/usr/bin/env bats
# Prüfmodus: Quelltext-Prüfung (dokumentierter Ausnahmefall der
# Output-Verifikations-Konvention) — das Ergebnis manifestiert sich
# ausschließlich in einer Konfigurationsdatei. Ein Laufzeitnachweis
# erforderte einen vollständigen Image-Build und ist offline nicht tragbar.
# [T003036]
#
# Hintergrund: `ARG` gilt in Docker pro Stage. `website/Dockerfile` deklariert
# BUILD_TARGET nur in der build-Stage; die runtime-Stage übernahm den Wert nicht,
# sodass er im laufenden Container fehlte (per `printenv` im sdlc-console-Pod
# bestätigt). Ein Request-Zeit-Check auf process.env.BUILD_TARGET wäre damit
# stiller toter Code gewesen. Exakt derselbe Defekt lag bei GIT_SHA/BUILT_AT vor
# und wurde mit T002202 behoben — dieser Guard sichert beide Fälle gemeinsam ab.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  DOCKERFILE="${REPO_ROOT}/website/Dockerfile"
  # Der Rumpf der letzten Stage: alles ab dem letzten FROM bis Dateiende.
  # Als Datei statt als Variable, damit der Inhalt auch in `run`-Subshells
  # ankommt — eine nicht exportierte Variable wäre dort leer, und jede
  # Negativ-Aussage darüber träfe trivial zu.
  RUNTIME_STAGE_FILE="${BATS_TEST_TMPDIR}/runtime-stage"
  awk '/^FROM /{buf=""} {buf = buf $0 ORS} END{printf "%s", buf}' "$DOCKERFILE" >"$RUNTIME_STAGE_FILE"
}

@test "website/Dockerfile exists and declares more than one stage" {
  [ -f "$DOCKERFILE" ]
  run bash -c "grep -c '^FROM ' '$DOCKERFILE'"
  [ "$status" -eq 0 ]
  [ "$output" -ge 2 ]
}

@test "the runtime stage is correctly identified (positive anchor: GIT_SHA)" {
  # Positiv-Anker: GIT_SHA liegt seit T002202 nachweislich in der runtime-Stage.
  # Findet die Stage-Extraktion oben es nicht, ist der Guard selbst kaputt und
  # die Aussage des nächsten Tests wertlos.
  run bash -c "grep -c 'ENV GIT_SHA' '"$RUNTIME_STAGE_FILE"'"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "the runtime stage declares ARG BUILD_TARGET" {
  run bash -c "grep -c 'ARG BUILD_TARGET' '"$RUNTIME_STAGE_FILE"'"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "the runtime stage exports BUILD_TARGET as an environment variable" {
  run bash -c "grep -c 'ENV BUILD_TARGET' '"$RUNTIME_STAGE_FILE"'"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "the sdlc console workflow passes BUILD_TARGET as a build argument" {
  # Ohne das Build-Arg bliebe der ARG-Default stehen und das sdlc-Image meldete
  # sich zur Laufzeit als prod-Build.
  run bash -c "grep -c 'BUILD_TARGET=sdlc' '${REPO_ROOT}/.github/workflows/build-sdlc-console.yml'"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}
