#!/usr/bin/env bats
# T012309 — Der GitLab-Job bats-unit muss die Werkzeuge mitbringen, die
# ubuntu-latest den GitHub-Jobs vorinstalliert liefert.
#
# PRUEFMODUS: Quelltext-Grep gegen .gitlab-ci.yml. Das ist hier das angemessene
# Mittel und die dokumentierte Ausnahme der Test-Resultats-Konvention: die
# Zusicherung ist eine CI-Konfigurationsaussage, ihr Resultat manifestiert sich
# ausschliesslich im Quelltext. Den Laufzeitbeweis liefert die Pipeline selbst
# (39 Fehlschlaege ohne, 1 mit den Werkzeugen, bei 875 Tests) — er ist in einem
# Repo-Test nicht reproduzierbar, ohne den Job zu fahren.
#
# Bewusst NICHT festgeschrieben: Paketreihenfolge, Zeilenumbrueche, die exakte
# apt-Aufrufform. Geprueft wird, DASS das Werkzeug beschafft wird (T002716:
# Semantik statt Darstellung).

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  CI="$REPO_ROOT/.gitlab-ci.yml"
  # Nur der bats-unit-Job, nicht die ganze Datei: ein Treffer im manifests-Job
  # wuerde die Aussage sonst falsch erfuellen.
  BATS_UNIT_BLOCK="$(awk '/^bats-unit:/{f=1} /^manifests:/{f=0} f' "$CI")"
}

@test "T012309: .gitlab-ci.yml existiert und enthaelt den bats-unit-Job" {
  # Positiv-Anker vor den Werkzeug-Zusicherungen: ohne ihn wuerden die Tests
  # unten bei leerem Block schweigend anders scheitern statt hier klar.
  [ -f "$CI" ]
  [ -n "$BATS_UNIT_BLOCK" ]
  printf '%s' "$BATS_UNIT_BLOCK" | grep -qF -e 'image: node:22'
}

@test "T012309: bats-unit installiert PyYAML (python3-yaml)" {
  # tests/unit/scripts.bats laedt Taskfile.yml und kustomization.yaml per
  # `python3 -c "import yaml"`. node:22 bringt das Modul nicht mit.
  printf '%s' "$BATS_UNIT_BLOCK" | grep -qF -e 'python3-yaml'
}

@test "T012309: bats-unit installiert envsubst (gettext-base)" {
  # tests/unit/flux-render-runtime-vars.bats ruft envsubst direkt auf.
  printf '%s' "$BATS_UNIT_BLOCK" | grep -qF -e 'gettext-base'
}

@test "T012309: bats-unit beschafft yq als mikefarah-Binary, nicht per apt" {
  # Das apt-Paket 'yq' ist ein Python-jq-Wrapper mit anderer Syntax;
  # tests/unit/plan-lint.bats nutzt `yq -r ... @tsv` (mikefarah v4).
  printf '%s' "$BATS_UNIT_BLOCK" | grep -qF -e 'mikefarah/yq/releases'
  # ... und der Download bricht bei totem Host ab, statt still ohne das
  # Werkzeug weiterzulaufen (dieselbe Begruendung wie beim task-Binary).
  printf '%s' "$BATS_UNIT_BLOCK" | grep -F -e 'mikefarah/yq/releases' | grep -qF -e '--fail'
}

@test "T012309: yq wird NICHT ueber apt-get install bezogen" {
  # Negativ-Aussage mit dem Positiv-Anker aus dem Test darueber: der
  # mikefarah-Download ist dort bereits zugesichert, diese Zeile darf also
  # nicht zusaetzlich das apt-Paket ziehen.
  # Kein `run bash -c`: BATS_UNIT_BLOCK ist nicht exportiert, in einer Subshell
  # waere es leer und die Zaehlung 0 — der Test bestuende vakuos.
  apt_lines="$(printf '%s' "$BATS_UNIT_BLOCK" | grep -E '^[[:space:]]*- apt-get')"
  [ -n "$apt_lines" ]                     # Positiv-Anker: es GIBT apt-get-Zeilen
  printf '%s' "$apt_lines" | grep -qF -e 'python3-yaml'   # ... und sie sind die gemeinten
  ! printf '%s' "$apt_lines" | grep -qE '(^| )yq( |$)' 
}
