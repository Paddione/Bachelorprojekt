#!/usr/bin/env bats
# T900376 — Getrackte Unit-Dateien duerfen keine Symlink-Installation nach
# ~/.config/systemd/user empfehlen: ein Symlink bindet die Unit an genau den
# Checkout, aus dem installiert wurde, und zeigt nach einem Branchwechsel ohne
# diese Datei ins Leere (gesehen an glimmer.service). Installationsweg ist cp.
#
# Pruefmodus: statisch per grep ueber die getrackten Unit-Dateien — die
# Anleitung ist selbst Dokumentation, dort ist grep das angemessene Mittel.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
}

@test "T900376: keine Unit-Datei empfiehlt ln -s nach systemd/user" {
  local offenders=()
  while IFS= read -r f; do
    if grep -qE 'ln -sfn?[[:space:]].*systemd/user' "${REPO_ROOT}/${f}"; then
      offenders+=("$f")
    fi
  done < <(git -C "${REPO_ROOT}" ls-files 'scripts/**/*.service' 'scripts/**/*.timer')
  if [ "${#offenders[@]}" -ne 0 ]; then
    echo "Symlink-Installationsanleitung in: ${offenders[*]}"
    return 1
  fi
}

@test "T900376: glimmer.service dokumentiert die Kopie-Installation (Positiv-Anker)" {
  # Positiv-Anker: ohne ihn bestuende der obige Test auch, wenn die
  # Installationsanleitung ersatzlos gestrichen wuerde.
  grep -qE 'cp .*\.service ~/.config/systemd/user/' "${REPO_ROOT}/scripts/llm/glimmer.service"
}
