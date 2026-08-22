#!/usr/bin/env bats
# tests/spec/e2e-test-infrastructure/no-wrong-reporoot-resolution.bats — Repo-Root-Guard [T013329]
#
# Prüfmodus: Querschnitts-Source-Konvention (grep ist hier das angemessene Mittel,
# siehe tests/CLAUDE.md "Test-Resultats-Konvention").
#
# Hintergrund [T013329 F4]: `path.resolve(__dirname, '../../../../')` in einer Spec
# unter tests/e2e/specs landet eine Ebene ÜBER dem Repo-Root. Jeder darauf bauende
# Repo-Datei-Assert müsste fehlschlagen; der Gruppen-Modifier hatte das bisher nur
# verdeckt. Repo-Zustand gehört nicht in eine E2E-Suite (Kustomize-Strukturtest in
# `task test:all` deckt die Existenz von prod//k3d/ bereits ab).

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  SPECS_DIR="${REPO_ROOT}/tests/e2e/specs"
}

@test "e2e-infra: keine Spec loest den Repo-Root neben dem Repository auf" {
  # Positiv-Anker 1 [T002356-M1]: der Spec-Bestand existiert ueberhaupt.
  run bash -c "find '${SPECS_DIR}' -maxdepth 1 -name '*.spec.ts' -type f | wc -l"
  [ "$status" -eq 0 ]
  [ "$output" -gt 0 ]

  # Positiv-Anker 2: der Detektor erkennt das Muster nachweislich.
  run bash -c "printf \"const repoRoot = path.resolve(__dirname, '../../../../');\\n\" | grep -cF \"path.resolve(__dirname, '../../../../')\""
  [ "$status" -eq 0 ]
  [ "$output" -eq 1 ]

  # Die eigentliche Zusicherung: kein Bestandstreffer.
  run bash -c "grep -rnF \"path.resolve(__dirname, '../../../../')\" '${SPECS_DIR}'/*.spec.ts"
  if [ "$status" -eq 0 ]; then
    echo "Falsche Repo-Root-Aufloesung gefunden (zeigt eine Ebene ueber das Repo):" >&2
    printf '%s\n' "$output" >&2
    false
  fi
}
