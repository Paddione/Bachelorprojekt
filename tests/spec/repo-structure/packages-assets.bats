#!/usr/bin/env bats
# tests/spec/repo-structure/packages-assets.bats — Drift-Guard fuer den Reorg-Change
# repo-structure-reorg (T006999, Partial p2-mini-moves):
#   design-system/  -> packages/design-system/
#   art-library/    -> assets/art-library/
#
# Pruefmodus: Output-Verifikation (T002448-M4) — fuehrt `test -d` aus und prueft den
# Exit-Code; keine Source-Greps. Semantik statt Darstellung (T002716).

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
}

@test "packages-assets: Zielpfade packages/design-system und assets/art-library existieren" {
  # Positiv-Anker (T002356-M1): fehlen die Moves, ist dieser Test rot.
  [ -d "${REPO_ROOT}/packages/design-system" ]
  [ -d "${REPO_ROOT}/assets/art-library" ]
}

@test "packages-assets: keine Top-Level-Ordner design-system/ und art-library/ (mit Positiv-Anker)" {
  # Positiv-Anker zuerst, dann die Negativ-Aussage — im selben Test (T002356-M1):
  # ohne Anker waere "Top-Level-Ordner fehlen" bei fehlender Implementierung trivial.
  [ -d "${REPO_ROOT}/packages/design-system" ]
  [ -d "${REPO_ROOT}/assets/art-library" ]
  [ ! -d "${REPO_ROOT}/design-system" ]
  [ ! -d "${REPO_ROOT}/art-library" ]
}
