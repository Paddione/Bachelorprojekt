#!/usr/bin/env bats
# Guard: GitHub-Actions-Workflows werden gelintet [T003008].
#
# Prüfmodus: output-verifiziert (T002448-M4). Die Tests führen den Lint-Pfad
# tatsächlich AUS und prüfen Exit-Code plus semantischen Inhalt der Ausgabe —
# sie greppen nicht die Implementierung des Skripts. Ausnahme ist die
# CI-Verdrahtung: dass ci.yml den Lint aufruft, manifestiert sich ausschließlich
# in der Workflow-Datei; dort ist die Datei-Prüfung das angemessene Mittel.
#
# Semantik statt Darstellung (T002716): geprüft werden Exit-Codes und
# format-freie Substrings (`grep -qF`, keine Zeilenanker), nicht der Wortlaut
# oder das Tabellenformat einer Werkzeugausgabe.
#
# Hintergrund: In PR #3979 stand `if: steps.detect.outputs.count != '0' &&
# secrets.ARBITRATION_KUBECONFIG != ''`. Der `secrets`-Kontext ist in
# `steps.*.if` nicht verfügbar — die Bedingung ist nicht ungültig, sondern
# IMMER falsch. Der Schritt wird `skipped`, der Job bleibt grün, und ein
# legitimer Skip ist davon nicht zu unterscheiden.
#
# SSOT: openspec/specs/ci-cd.md

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  LINT_SCRIPT="${REPO_ROOT}/scripts/lint-workflows.sh"
  CI_WORKFLOW="${REPO_ROOT}/.github/workflows/ci.yml"
}

# actionlint ist ein externes Binary und in CI derzeit NICHT eingerichtet.
# Ohne diesen Guard misst der Test die Ausstattung des Runners statt den
# Zustand des Codes — "rot, weil Implementierung fehlt" und "rot, weil das
# Binary fehlt" wären nicht unterscheidbar. Muster: T002820 /
# tests/spec/sealed-secret-cluster-drift.bats.
require_actionlint() {
  command -v actionlint >/dev/null 2>&1 || skip "actionlint binary not installed"
}

require_lint_script() {
  [ -f "$LINT_SCRIPT" ] || {
    echo "scripts/lint-workflows.sh fehlt — Workflow-Lint ist nicht implementiert"
    return 1
  }
}

# Baut ein wegwerfbares Git-Repo mit einer einzigen Workflow-Datei.
# actionlint verlangt ein Git-Repo als Projektwurzel.
make_fixture_repo() {
  local dir="$1"
  mkdir -p "${dir}/.github/workflows"
  cat > "${dir}/.github/workflows/fixture.yml"
  # Die Repo-eigene actionlint-Konfiguration mitnehmen, damit das Fixture
  # dieselben Regeln sieht wie das echte Repo (self-hosted-Labels).
  if [ -f "${REPO_ROOT}/.github/actionlint.yaml" ]; then
    cp "${REPO_ROOT}/.github/actionlint.yaml" "${dir}/.github/actionlint.yaml"
  fi
  git -C "$dir" init -q .
}

@test "T003008: Workflow-Lint-Skript existiert und ist ausfuehrbar" {
  # Positiv-Anker fuer die gesamte Datei: ohne dieses Skript ist jede
  # nachfolgende Aussage gegenstandslos (T002356-M1).
  [ -f "$LINT_SCRIPT" ]
  [ -x "$LINT_SCRIPT" ]
}

@test "T003008: Workflow-Lint laeuft sauber ueber die echten Repo-Workflows" {
  require_actionlint
  require_lint_script

  run bash -c "cd '$REPO_ROOT' && bash scripts/lint-workflows.sh 2>&1"
  [ "$status" -eq 0 ] || {
    echo "Lint meldete Befunde auf dem aktuellen Stand:"
    echo "$output"
    return 1
  }
}

@test "T003008: Lint faengt den secrets-Kontext in steps.*.if (Positiv-Anker: sauberes Fixture ist gruen)" {
  require_actionlint
  require_lint_script

  # Positiv-Anker ZUERST: das saubere Fixture muss durchlaufen. Ohne ihn
  # bestuende die Negativ-Aussage vakuos, sobald das Skript alles ablehnt.
  local clean_dir="${BATS_TEST_TMPDIR}/clean"
  make_fixture_repo "$clean_dir" <<'YAML'
name: Fixture
on: push
jobs:
  a:
    runs-on: ubuntu-latest
    steps:
      - id: detect
        run: echo "count=1" >> "$GITHUB_OUTPUT"
      - if: steps.detect.outputs.count != '0'
        run: echo ok
YAML
  run bash -c "cd '$clean_dir' && bash '$LINT_SCRIPT' 2>&1"
  [ "$status" -eq 0 ] || {
    echo "Sauberes Fixture wurde faelschlich beanstandet:"
    echo "$output"
    return 1
  }

  # Negativ-Aussage: derselbe Workflow mit dem secrets-Kontext im step-if
  # MUSS beanstandet werden.
  local broken_dir="${BATS_TEST_TMPDIR}/broken"
  make_fixture_repo "$broken_dir" <<'YAML'
name: Fixture
on: push
jobs:
  a:
    runs-on: ubuntu-latest
    steps:
      - id: detect
        run: echo "count=1" >> "$GITHUB_OUTPUT"
      - if: steps.detect.outputs.count != '0' && secrets.FOO != ''
        run: echo ok
YAML
  run bash -c "cd '$broken_dir' && bash '$LINT_SCRIPT' 2>&1"
  [ "$status" -ne 0 ] || {
    echo "Der secrets-Kontext in steps.*.if blieb unbeanstandet — genau der Fehler aus PR #3979:"
    echo "$output"
    return 1
  }
  echo "$output" | grep -qF 'secrets'
}

@test "T003008: Lint beanstandet das self-hosted-Label fleet-gpu nicht" {
  require_actionlint
  require_lint_script

  local dir="${BATS_TEST_TMPDIR}/selfhosted"
  make_fixture_repo "$dir" <<'YAML'
name: Fixture
on: push
jobs:
  a:
    runs-on: [self-hosted, fleet-gpu]
    steps:
      - run: echo ok
YAML
  run bash -c "cd '$dir' && bash '$LINT_SCRIPT' 2>&1"
  [ "$status" -eq 0 ] || {
    echo "fleet-gpu wurde beanstandet — .github/actionlint.yaml deklariert das Label nicht:"
    echo "$output"
    return 1
  }
}

@test "T003008: task-Target lint:workflows ist registriert" {
  # Semantik statt Darstellung (T002716): geprueft wird der Exit-Code der
  # Aufloesung, nicht das Ausgabeformat von `task --list`. Ein unbekanntes
  # Target liefert einen Fehler-Exit, ein bekanntes 0.
  run bash -c "cd '$REPO_ROOT' && task --summary test:all >/dev/null 2>&1"
  [ "$status" -eq 0 ] || skip "task-Binary nicht verfuegbar oder Taskfile defekt (Anker rot)"

  run bash -c "cd '$REPO_ROOT' && task --summary lint:workflows >/dev/null 2>&1"
  [ "$status" -eq 0 ]
}

@test "T003008: CI ruft den Workflow-Lint auf" {
  # Konfigurationspruefung: dass CI den Lint aufruft, manifestiert sich
  # ausschliesslich in ci.yml. Format-frei (grep -qF, kein Zeilenanker), damit
  # eine Umformatierung des Workflows den Guard nicht rot faerbt.
  [ -f "$CI_WORKFLOW" ]                                    # Positiv-Anker
  grep -qF 'BATS Unit + Quality Gates' "$CI_WORKFLOW"      # Positiv-Anker: Job vorhanden
  grep -qF 'lint-workflows.sh' "$CI_WORKFLOW"
}

@test "T003008: actionlint ist in CI auf eine Version gepinnt" {
  # Begruendung wie bei gitleaks (T002506/T002554): lokal und CI muessen
  # dieselbe Version pruefen, sonst weichen die Befunde auseinander.
  [ -f "$CI_WORKFLOW" ]                                    # Positiv-Anker
  grep -qF 'actionlint' "$CI_WORKFLOW"                     # Positiv-Anker: ueberhaupt erwaehnt
  run bash -c "grep -F 'actionlint' '$CI_WORKFLOW' | grep -Eo 'actionlint[/_-]v?[0-9]+\.[0-9]+\.[0-9]+'"
  [ "$status" -eq 0 ]
  [ -n "$output" ]
}
