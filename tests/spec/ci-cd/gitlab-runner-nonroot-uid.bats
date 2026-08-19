#!/usr/bin/env bats
# tests/spec/ci-cd/gitlab-runner-nonroot-uid.bats — non-root-UID der Job-Pods [T012644]
# SSOT: openspec/specs/ci-cd.md
#
# PRUEFMODUS: Quelltext-Inspektion des gerenderten Manifests. Ausnahme nach
# CLAUDE.md §Test-Resultats-Konvention [T002448-M4] fuer Deploy-Konfiguration — die Wirkung
# zeigt sich erst beim Start eines Job-Pods im Cluster.
#
# Hintergrund: Der Namespace erzwingt restricted, das verlangt runAsNonRoot fuer jeden
# Container. Sowohl das Helper-Image (init-permissions) als auch das Default-Job-Image
# ubuntu:24.04 starten als UID 0. Ohne eigene UID blieb jeder Job-Pod Pending, bis der
# Executor mit "timed out waiting for pod to start" abbrach — das Kubelet meldete
# "container has runAsNonRoot and image will run as root".
#
# Geprueft wird beides, was den Ausfall verhindert: eine UID ungleich 0, und dass
# run_as_user, run_as_group und fs_group denselben Wert tragen. Weichen sie voneinander
# ab, laeuft init-permissions unter einer UID, der das Build-Volume nicht gehoert, und der
# Pod haengt aus einem anderen Grund genauso.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  RENDERED="${REPO_ROOT}/k3d/gitlab-runner-stack/gitlab-runner-rendered.yaml"
}

# Wert eines TOML-Schluessels im gerenderten config.template.toml-Block.
_toml_val() {
  grep -oE "^\s*$1 = [0-9]+" "$RENDERED" | grep -oE '[0-9]+$'
}

@test "T012644: pod_security_context traegt run_as_user, run_as_group und fs_group" {
  [ -f "$RENDERED" ]
  for key in run_as_user run_as_group fs_group; do
    run _toml_val "$key"
    [ "$status" -eq 0 ]
    [ -n "$output" ]
  done
}

@test "T012644: die gesetzte UID ist nicht 0 — sonst greift runAsNonRoot nicht" {
  uid="$(_toml_val run_as_user | head -1)"
  # Positiv-Anker: es gibt ueberhaupt einen Wert. Ohne ihn bestuende der Vergleich
  # unten auch dann, wenn der Schluessel fehlte und $uid leer waere.
  [ -n "$uid" ]
  [ "$uid" -ne 0 ]
}

@test "T012644: run_as_user, run_as_group und fs_group stimmen ueberein" {
  u="$(_toml_val run_as_user | head -1)"
  g="$(_toml_val run_as_group | head -1)"
  f="$(_toml_val fs_group | head -1)"
  [ -n "$u" ]
  [ "$u" = "$g" ]
  [ "$u" = "$f" ]
}

@test "T012644: init-permissions traegt die UID selbst, nicht nur geerbt" {
  # Der Container ist derjenige, der ohne eigene UID nachweislich nicht startete.
  # Der Block wird bis zur naechsten [runners.…]-Sektion gelesen statt ueber eine
  # feste Zeilenzahl: zwischen Header und Schluessel stehen Kommentarzeilen, deren
  # Anzahl sich beim naechsten Redigieren aendert.
  block="$(awk '/init_permissions_container_security_context\]/{f=1;next} /^\s*\[runners\.kubernetes\.[a-z_]+\]/{f=0} f' "$RENDERED")"

  # Positiv-Anker: der Block wurde ueberhaupt gefunden.
  [ -n "$block" ]
  [[ "$block" == *"allow_privilege_escalation"* ]]

  [[ "$block" == *"run_as_user"* ]]
  [[ "$block" == *"run_as_group"* ]]
}
