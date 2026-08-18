#!/usr/bin/env bats
# tests/spec/ci-cd/ci-diff-base.bats — Vertrag von scripts/ci-diff-base.sh [T012405]
#
# PRUEFMODUS: Output-Verifikation. Anders als die uebrigen Dateien in diesem Verzeichnis
# prueft dieser Guard kein Konfigurationsdokument, sondern ein ausfuehrbares Skript — es
# wird also wirklich aufgerufen und an Exit-Code UND stdout gemessen.
#
# Warum beides: Der einzige Fehlermodus, der im Betrieb still danebengeht, ist "Exit 0,
# aber der falsche SHA". Eine Zusicherung nur auf den Exit-Code kann ihn nicht sehen.
#
# Warum die Fehlerfaelle verschiedene Codes haben (design.md D2): Exit 3 heisst
# "diff-skopierte Auswahl ist hier nicht anwendbar, nimm die Vollmenge", Exit 4 heisst
# "die Umgebung ist kaputt, brich ab". Ein einziger Fehler-Code liesse beide im Aufrufer
# zusammenfallen — und der Aufrufer waehlt daraus die Testmenge. Ein Job, der eine
# kaputte Umgebung als "keine Basis, also volle Menge" liest, meldet gruen fuer einen
# Commit, den nichts geprueft hat.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  SCRIPT="${REPO_ROOT}/scripts/ci-diff-base.sh"
}

# Ruft das Skript in einer definierten Umgebung auf. Die CI-Variablen beider Plattformen
# werden zuerst geleert, damit ein real gesetztes CI_COMMIT_BRANCH der Entwicklungsumgebung
# den Testfall nicht ueberschreibt.
# stderr wird bewusst verworfen: bats' `run` fuehrt stdout und stderr in $output
# zusammen, und dieses Skript schreibt seine Diagnosen nach stderr. Ohne das
# Verwerfen pruefte jeder Vergleich gegen $output die Diagnose mit statt den Wert.
# Dass die Trennung stdout/stderr wirklich eingehalten wird, prueft der letzte Test
# dieser Datei gesondert — dort ohne `run` und damit ohne die Zusammenfuehrung.
_run_clean() {
  env -u CI_MERGE_REQUEST_DIFF_BASE_SHA -u CI_COMMIT_BRANCH -u CI_DEFAULT_BRANCH \
      -u GITHUB_REF_NAME -u GITHUB_BASE_REF \
      "$@" bash "$SCRIPT" 2>/dev/null
}

@test "ci-diff-base: Skript existiert und ist ausfuehrbar" {
  # Positiv-Anker [T002356-M1]: Ohne diesen Test wuerden alle folgenden Faelle bei einem
  # fehlenden Skript mit Exit 127 scheitern — was von einem echten Vertragsbruch nicht
  # zu unterscheiden waere.
  [ -f "$SCRIPT" ]
  [ -x "$SCRIPT" ]
}

@test "ci-diff-base: Shell-Syntax ist gueltig" {
  run bash -n "$SCRIPT"
  [ "$status" -eq 0 ]
}

@test "ci-diff-base: vorgegebene Merge-Request-Basis wird unveraendert durchgereicht" {
  sha="$(git -C "$REPO_ROOT" rev-parse HEAD)"
  run _run_clean CI_MERGE_REQUEST_DIFF_BASE_SHA="$sha"
  [ "$status" -eq 0 ]
  # Der Wert selbst, nicht nur "irgendeine Ausgabe" — das ist der Fall, den ein
  # reiner Exit-Code-Test nicht sehen wuerde.
  [ "$output" = "$sha" ]
}

@test "ci-diff-base: main-Push meldet fehlende Basis mit Exit 3 und leerer Ausgabe" {
  run _run_clean CI_COMMIT_BRANCH=main
  [ "$status" -eq 3 ]
  [ -z "$output" ]
}

@test "ci-diff-base: main-Push auch ueber die GitHub-Variable erkannt" {
  # Dieselbe Semantik, andere Plattform-Variable. Ohne diesen Fall waere die
  # main-Erkennung an GitLab gebunden, obwohl beide Pipelines das Skript rufen.
  run _run_clean GITHUB_REF_NAME=main
  [ "$status" -eq 3 ]
  [ -z "$output" ]
}

@test "ci-diff-base: Arbeits-Branch liefert einen aufloesbaren Commit mit Exit 0" {
  run _run_clean CI_COMMIT_BRANCH=feature/irgendein-branch
  [ "$status" -eq 0 ]
  [ -n "$output" ]
  # Die Ausgabe muss ein real aufloesbares Objekt sein — eine Zeichenkette, die nur
  # wie ein SHA aussieht, bestuende einen Formatvergleich, waere aber unbrauchbar.
  git -C "$REPO_ROOT" rev-parse --verify --quiet "${output}^{commit}"
}

@test "ci-diff-base: Diagnosen gehen nach stderr, nicht nach stdout" {
  # Der Aufrufer verwendet BASE="$(bash scripts/ci-diff-base.sh)". Landete auch nur eine
  # Diagnosezeile auf stdout, enthielte BASE zwei Zeilen und jeder git-Aufruf damit
  # scheiterte — mit einer Fehlermeldung, die auf git zeigt statt auf die Ursache.
  sha="$(git -C "$REPO_ROOT" rev-parse HEAD)"
  out="$(env -u CI_COMMIT_BRANCH -u GITHUB_REF_NAME \
        CI_MERGE_REQUEST_DIFF_BASE_SHA="$sha" bash "$SCRIPT" 2>/dev/null)"
  [ "$(printf '%s' "$out" | wc -l)" -le 1 ]
  [ "$out" = "$sha" ]
}
