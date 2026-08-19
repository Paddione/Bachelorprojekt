#!/usr/bin/env bats
# T012309 / T012313 — Die GitLab-Jobs muessen die Werkzeuge mitbringen, die
# ubuntu-latest den GitHub-Jobs vorinstalliert liefert.
#
# PRUEFMODUS: Quelltext-Grep gegen .gitlab-ci.yml. Das ist hier das angemessene
# Mittel und die dokumentierte Ausnahme der Test-Resultats-Konvention: die
# Zusicherung ist eine CI-Konfigurationsaussage, ihr Resultat manifestiert sich
# ausschliesslich im Quelltext. Den Laufzeitbeweis liefert die Pipeline selbst
# (bats-unit: 39 Fehlschlaege ohne, 1 mit den Werkzeugen, bei 875 Tests;
# manifests: 3 ohne, 0 mit) — er ist in einem Repo-Test nicht reproduzierbar,
# ohne den Job zu fahren.
#
# LEHRE AUS T012313: Die erste Fassung prueft nur den bats-unit-Block. Die
# Eingrenzung auf einen Job war richtig (ein Treffer im anderen Job darf die
# Aussage nicht falsch erfuellen) — der Fehler war, die Zusicherung nur fuer
# EINEN der beiden Jobs aufzustellen, die das Werkzeug brauchen. Deshalb laufen
# die Werkzeug-Tests hier ueber beide Bloecke.
#
# Bewusst NICHT festgeschrieben: Paketreihenfolge, Zeilenumbrueche, die exakte
# apt-Aufrufform. Geprueft wird, DASS das Werkzeug beschafft wird (T002716:
# Semantik statt Darstellung).

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  CI="$REPO_ROOT/.gitlab-ci.yml"
  BATS_UNIT_BLOCK="$(awk '/^bats-unit:/{f=1} /^manifests:/{f=0} f' "$CI")"
  MANIFESTS_BLOCK="$(awk '/^manifests:/{f=1} /^gitleaks:/{f=0} f' "$CI")"
}

@test "T012309: .gitlab-ci.yml enthaelt die Jobs bats-unit und manifests" {
  # Positiv-Anker vor den Werkzeug-Zusicherungen: ohne ihn wuerden die Tests
  # unten bei leerem Block schweigend anders scheitern statt hier klar.
  [ -f "$CI" ]
  [ -n "$BATS_UNIT_BLOCK" ]
  [ -n "$MANIFESTS_BLOCK" ]
  # [T012899] Geprueft wird die TOOLCHAIN-Familie, nicht der Image-Literal.
  # Bis #4823 standen hier 'node:22' und 'ubuntu:24.04'. Dieser PR stellte auf
  # vorgebaute CI-Images um (ci-node22 / ci-ubuntu, ~75s Setup-Ersparnis je Job),
  # zog den Guard aber nicht nach. Aufgefallen ist das erst jetzt, weil der
  # gleichzeitig eingebrachte Anker-Defekt die ganze Datei unparsebar machte und
  # dieser Test schon vorher aus einem anderen Grund rot war.
  #
  # Auf die Familie zu pruefen statt auf den Literal haelt die Zusicherung am
  # Zweck: der Job muss node22 bzw. ubuntu mitbringen. Ein erneuter Wechsel des
  # Bezugswegs (Registry, Tag) bricht den Guard dann nicht wieder.
  printf '%s' "$BATS_UNIT_BLOCK" | grep -qE 'image:.*(node:22|ci-node22)'
  printf '%s' "$MANIFESTS_BLOCK" | grep -qE 'image:.*(ubuntu:24\.04|ci-ubuntu)'
}

@test "T012309: bats-unit installiert PyYAML (python3-yaml)" {
  # tests/unit/scripts.bats laedt Taskfile.yml und kustomization.yaml per
  # `python3 -c "import yaml"`. node:22 bringt das Modul nicht mit.
  printf '%s' "$BATS_UNIT_BLOCK" | grep -qF -e 'python3-yaml'
}

@test "T012313: manifests installiert PyYAML (python3-yaml)" {
  # tests/unit/dead-node-affinity.bats wertet gerenderte Manifeste per
  # python3/yaml aus (zwei Tests).
  printf '%s' "$MANIFESTS_BLOCK" | grep -qF -e 'python3-yaml'
}

@test "T012309: bats-unit installiert envsubst (gettext-base)" {
  # tests/unit/flux-render-runtime-vars.bats ruft envsubst direkt auf.
  printf '%s' "$BATS_UNIT_BLOCK" | grep -qF -e 'gettext-base'
}

@test "T012313: manifests installiert envsubst (gettext-base)" {
  # setup_file in tests/unit/manifests.bats leitet das gerenderte Office-Stack-
  # Kustomize durch envsubst. Fehlt es, bricht setup_file mit Status 127 ab und
  # reisst die gesamte Datei mit — der teuerste Einzelfall der Serie.
  printf '%s' "$MANIFESTS_BLOCK" | grep -qF -e 'gettext-base'
}

@test "T012309: bats-unit beschafft yq als mikefarah-Binary, nicht per apt" {
  # Das apt-Paket 'yq' ist ein Python-jq-Wrapper mit anderer Syntax;
  # tests/unit/plan-lint.bats nutzt `yq -r ... @tsv` (mikefarah v4).
  printf '%s' "$BATS_UNIT_BLOCK" | grep -qF -e 'mikefarah/yq/releases'
  # ... und der Download bricht bei totem Host ab, statt still ohne das
  # Werkzeug weiterzulaufen (dieselbe Begruendung wie beim task-Binary).
  printf '%s' "$BATS_UNIT_BLOCK" | grep -F -e 'mikefarah/yq/releases' | grep -qF -e '--fail'
}

@test "T012309: yq wird in keinem Job ueber apt-get install bezogen" {
  # Kein `run bash -c`: die Block-Variablen sind nicht exportiert, in einer
  # Subshell waeren sie leer und die Zaehlung 0 — der Test bestuende vakuos.
  apt_lines="$(printf '%s\n%s' "$BATS_UNIT_BLOCK" "$MANIFESTS_BLOCK" | grep -E '^[[:space:]]*- apt-get')"
  [ -n "$apt_lines" ]                                      # Positiv-Anker: es GIBT apt-get-Zeilen
  printf '%s' "$apt_lines" | grep -qF -e 'python3-yaml'    # ... und sie sind die gemeinten
  ! printf '%s' "$apt_lines" | grep -qE '(^| )yq( |$)'
}
