#!/usr/bin/env bats
# T002872 — ui-config-seed.bats waehlte bislang per `find … | head -n 1`
# nichtdeterministisch die ERSTE gefundene GGUF-Datei als Kurzlebig-Testserver-
# Modell (aktuell zufaellig ein 12B-Modell), ohne Ruecksicht auf Dateigroesse.
# Das macht Ladezeit und damit den Health-Wait-Erfolg abhaengig vom
# Dateisystem-Cache-Zustand statt von einer bewusst kleinen Testfixture.
#
# PRUEFMODUS: Output-Verifikation (T002448-M4). Der Test RUFT die Funktion
# pick_small_test_model() aus tests/spec/local-llm-proxy/lib/pick-small-model.sh
# in einer temporaeren Fixture-Verzeichnisstruktur AUF und prueft die
# tatsaechliche Rueckgabe — er greppt nicht den Helper-Quelltext. Die Fixture
# ist absichtlich unabhaengig von echten Modell-Dateien auf der Platte, damit
# der Test auch ohne GPU-Host deterministisch rot/gruen wird.
#
# STATUS: RED — tests/spec/local-llm-proxy/lib/pick-small-model.sh existiert
# noch nicht (Teil dieses Plans, nicht dieses Commits).

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  HELPER="${REPO_ROOT}/tests/spec/local-llm-proxy/lib/pick-small-model.sh"

  FIXTURE_DIR="$(mktemp -d)"
  mkdir -p "${FIXTURE_DIR}/root_a" "${FIXTURE_DIR}/root_b"

  # Groesste Datei zuerst angelegt (widerlegt "erste gefundene Datei gewinnt").
  head -c 5000000 /dev/zero > "${FIXTURE_DIR}/root_a/big-model.gguf"       # ~5 MB
  head -c 100000  /dev/zero > "${FIXTURE_DIR}/root_b/small-model.gguf"    # ~100 KB
  head -c 1       /dev/zero > "${FIXTURE_DIR}/root_a/mmproj-tiny.gguf"    # Nebendatei, ausgeschlossen
  head -c 1       /dev/zero > "${FIXTURE_DIR}/root_b/draft-tiny.gguf"     # Nebendatei, ausgeschlossen
}

teardown() {
  rm -rf "${FIXTURE_DIR}"
}

@test "T002872: pick_small_test_model waehlt die kleinste Nicht-Hilfsdatei" {
  [ -f "${HELPER}" ]

  run bash -c "source '${HELPER}' && pick_small_test_model '${FIXTURE_DIR}/root_a' '${FIXTURE_DIR}/root_b'"
  [ "$status" -eq 0 ]

  # POSITIV-ANKER (T002356-M1) ZUERST: die kleine Datei (100 KB) muss gewaehlt
  # werden, nicht die grosse (5 MB) und nicht die erste im Verzeichnisbaum.
  [ "${output}" = "${FIXTURE_DIR}/root_b/small-model.gguf" ]
}

@test "T002872: pick_small_test_model schliesst mmproj-/draft-Dateien aus" {
  [ -f "${HELPER}" ]

  # Nur die Nebendatei-Fixtures anbieten — ohne Ausschluss waere die 1-Byte
  # mmproj-/draft-Datei die kleinste und wuerde faelschlich gewaehlt.
  rm "${FIXTURE_DIR}/root_a/big-model.gguf" "${FIXTURE_DIR}/root_b/small-model.gguf"

  run bash -c "source '${HELPER}' && pick_small_test_model '${FIXTURE_DIR}/root_a' '${FIXTURE_DIR}/root_b'"
  [ "$status" -eq 1 ]
  [ -z "${output}" ]
}
