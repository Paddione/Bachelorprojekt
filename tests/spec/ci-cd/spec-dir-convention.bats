#!/usr/bin/env bats
# tests/spec/ci-cd/spec-dir-convention.bats — Verzeichniskonvention fuer tests/spec [T002416]
#
# Diese Datei liegt selbst schon in der neuen Struktur. Das ist Absicht: solange der Runner
# nur `tests/spec/*.bats` globt, wird sie gar nicht erst gefunden — der Nachweis, dass die
# Umstellung wirkt, ist damit die blosse Tatsache, dass diese Tests laufen.
#
# Hintergrund: Die Konvention "eine .bats-Datei pro SSOT-Spec" laesst Parallelarbeit
# strukturell am Dateiende kollidieren (T002351-M2). Gemessen am 2026-07-28 lag
# tests/spec/ci-cd.bats gleichzeitig in drei offenen PRs.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
}

@test "spec-dir: Runner erfasst Unterverzeichnisse (bats -r)" {
  # Positiv-Anker: der test:spec-Task existiert ueberhaupt und ruft bats auf ...
  run grep -A12 '^  test:spec:$' "${REPO_ROOT}/Taskfile.yml"
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" | grep -q 'bats-core/bin/bats'
  # ... und tut das rekursiv statt per *.bats-Glob, der Unterverzeichnisse auslaesst.
  printf '%s\n' "$output" | grep -qE 'bats .*-r .*tests/spec'
}

@test "spec-dir: Zaehl-Logik in test:spec:changed zaehlt auch Unterverzeichnisse" {
  # Positiv-Anker: die Zaehlung existiert ...
  run grep -n 'TOTAL=' "${REPO_ROOT}/Taskfile.yml"
  [ "$status" -eq 0 ]
  # ... und benutzt nicht mehr den flachen ls-Glob, der Unterverzeichnisse unterschlaegt.
  # Waere TOTAL zu klein, meldete der Task faelschlich "FULL spec suite".
  run bash -c "grep 'TOTAL=' '${REPO_ROOT}/Taskfile.yml' | grep -c 'ls tests/spec/\*\.bats'"
  [ "$output" -eq 0 ]
}

@test "spec-dir: find-changed-tests findet Tests in Unterverzeichnissen" {
  # Positiv-Anker: das Skript laeuft und liefert fuer eine bekannte Datei etwas ...
  run bash "${REPO_ROOT}/scripts/find-changed-tests.sh" spec
  [ "$status" -eq 0 ]
  # ... und seine Pfad-Probe durchsucht tests/spec rekursiv, nicht nur flach.
  # Der flache Glob "$BASE_DIR"/*.bats wuerde jeden Test im Unterverzeichnis uebersehen,
  # d.h. eine Aenderung an scripts/* wuerde ihren eigenen Test nicht mehr ausloesen.
  #
  # Geprueft wird gezielt der grep-Aufruf der Probe, NICHT das ganze Skript: Zeile 77
  # nutzt `[[ "$file" == "$BASE_DIR"/*.bats ]]` und ist korrekt so — im Pattern-Match von
  # [[ == ]] matcht `*` auch Slashes, anders als beim Datei-Glob der Shell. Dieselbe
  # Syntax, zwei Semantiken; ein pauschaler grep ueber die Datei wuerde diese Stelle
  # faelschlich anmahnen. Kommentarzeilen sind ebenfalls ausgenommen.
  run bash -c "grep -v '^\s*#' '${REPO_ROOT}/scripts/find-changed-tests.sh' | grep 'grep -lF' | grep -c 'BASE_DIR\"/\*\.bats'"
  [ "$output" -eq 0 ]
  # Positiv-Gegenprobe: die Probe existiert ueberhaupt noch und sucht rekursiv.
  run bash -c "grep -v '^\s*#' '${REPO_ROOT}/scripts/find-changed-tests.sh' | grep -c 'find \"\$BASE_DIR\".*grep -lF'"
  [ "$output" -ge 1 ]
}

@test "spec-dir: Test-Inventar erfasst Unterverzeichnisse" {
  # Ergebnisprüfung statt Implementierungsdetail [T002445]: dieser Test prüfte zuvor nur,
  # dass "maxdepth 2" im Skripttext steht — der `find` fand Unterverzeichnis-Dateien schon
  # vorher, sie fielen erst bei der ID-Extraktion durch. Ein grüner Test bei falscher
  # Titelaussage. Jetzt wird das tatsächliche Inventar-Ergebnis geprüft.
  #
  # Positiv-Anker: die Beispieldatei liegt wirklich unter einem tests/spec-Unterverzeichnis
  # — sonst wäre die folgende Suche trivial leer.
  [ -f "${REPO_ROOT}/tests/spec/ci-cd/spec-dir-convention.bats" ]
  local sandbox="${BATS_TEST_TMPDIR}/inventory.json"
  run bash -c "TEST_INVENTORY_OUT='$sandbox' bash '${REPO_ROOT}/scripts/build-test-inventory.sh'"
  [ "$status" -eq 0 ]
  run jq --arg p 'tests/spec/ci-cd/spec-dir-convention.bats' \
    '[.[] | select(.file == $p)] | length' "$sandbox"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "spec-dir: merge=union ist fuer .bats NICHT gesetzt" {
  # merge=union arbeitet zeilenweise und kennt keine Blockstruktur. Zwei angehaengte
  # @test-Bloecke ergeben eine syntaktisch kaputte Datei — OHNE Konfliktmarker, der Merge
  # gilt als erfolgreich. Die Falle ist verlockend (sie loest scheinbar genau dieses
  # Ticket) und der Schaden still, deshalb hier festgenagelt.
  #
  # Positiv-Anker: .gitattributes existiert und setzt ueberhaupt Merge-Strategien ...
  run grep -c 'merge=' "${REPO_ROOT}/.gitattributes"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
  # ... aber fuer keine .bats-Datei.
  run bash -c "grep -E '^[^#]*\.bats.*merge=union' '${REPO_ROOT}/.gitattributes' | wc -l"
  [ "$output" -eq 0 ]
}

@test "spec-dir: CLAUDE.md dokumentiert die Verzeichniskonvention" {
  # Positiv-Anker: der BATS-Konventionsblock existiert ...
  run grep -c 'BATS convention' "${REPO_ROOT}/CLAUDE.md"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
  # ... und nennt die Verzeichnisform. Ohne Doku wandern neue Tests weiter in die
  # Sammeldateien und die Konflikte kommen zurueck.
  block="$(sed -n '/BATS convention/,/^- \*\*BATS .output/p' "${REPO_ROOT}/CLAUDE.md")"
  [ -n "$block" ]
  printf '%s\n' "$block" | grep -q 'tests/spec/<spec-slug>/'
}
