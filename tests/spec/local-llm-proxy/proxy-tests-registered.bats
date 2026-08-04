#!/usr/bin/env bats
# T002638 — jede Testdatei unter scripts/llm-proxy/ muss in einem Runner stehen.
#
# Pruefmodus: Source-Grep auf CI-Konfiguration. Das ist die dokumentierte
# Ausnahme von der Output-Verifikation [T002448-M4]: das Ergebnis "laeuft diese
# Datei in CI" manifestiert sich ausschliesslich im Quelltext von Taskfile.yml
# und .github/workflows/ci.yml. Ein Laufzeit-Nachweis muesste den CI-Job selbst
# starten.
#
# Warum ueberhaupt: die Dateiliste in beiden Runnern ist handgepflegt und damit
# strukturell unvollstaendig. T002336 hat dieses Muster schon einmal repariert
# ("diese Suite existierte seit T002102, lief aber in KEINEM Target und in
# KEINEM CI-Job"), ohne es gegen Wiederholung abzusichern. Am 2026-08-04 lagen
# erneut drei Dateien mit zusammen 19 Tests ausserhalb jedes Runners:
# exclusive-conflict, fixups, strip-markers.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  TASKFILE="${REPO_ROOT}/Taskfile.yml"
  CI="${REPO_ROOT}/.github/workflows/ci.yml"
}

# Die Zeilen beider Runner, die Proxy-Testdateien nennen.
_runner_lines() {
  { grep -h 'scripts/llm-proxy/[a-z0-9-]*\.test\.mjs' "$TASKFILE" || true
    grep -h 'scripts/llm-proxy/[a-z0-9-]*\.test\.mjs' "$CI" || true
  }
}

@test "T002638: beide Runner-Dateien existieren und nennen ueberhaupt Proxy-Tests" {
  # Positiv-Anker [T002356-M1]: ohne ihn waere die Negativ-Aussage unten vakuos
  # erfuellt, sobald ein Pfad sich aendert und die Greps ins Leere laufen.
  [ -f "$TASKFILE" ]
  [ -f "$CI" ]

  run bash -c "grep -c 'scripts/llm-proxy/[a-z0-9-]*\.test\.mjs' '$TASKFILE'"
  [ "$status" -eq 0 ]
  [ "$output" -gt 0 ]

  run bash -c "grep -c 'scripts/llm-proxy/[a-z0-9-]*\.test\.mjs' '$CI'"
  [ "$status" -eq 0 ]
  [ "$output" -gt 0 ]
}

@test "T002638: eine bekannt registrierte Datei wird als registriert erkannt" {
  # Zweiter Positiv-Anker: belegt, dass der Erkennungsmechanismus ueberhaupt
  # anschlaegt, bevor er unten fuer die Vollstaendigkeitsaussage benutzt wird.
  run bash -c "_r() { { grep -h 'scripts/llm-proxy/[a-z0-9-]*\.test\.mjs' '$TASKFILE' || true; grep -h 'scripts/llm-proxy/[a-z0-9-]*\.test\.mjs' '$CI' || true; }; }; _r | grep -c 'server\.test\.mjs'"
  [ "$status" -eq 0 ]
  [ "$output" -gt 0 ]
}

@test "T002638: JEDE scripts/llm-proxy/*.test.mjs steht in Taskfile UND ci.yml" {
  local lines missing_task=() missing_ci=() count=0
  lines="$(_runner_lines)"

  for f in "${REPO_ROOT}"/scripts/llm-proxy/*.test.mjs; do
    [ -e "$f" ] || continue
    count=$((count + 1))
    local base="$(basename "$f")"
    grep -q "$base" "$TASKFILE" || missing_task+=("$base")
    grep -q "$base" "$CI"       || missing_ci+=("$base")
  done

  # Dritter Positiv-Anker: es gibt ueberhaupt Dateien zu pruefen. Ohne ihn
  # bestuende der Test, wenn das Verzeichnis leer waere oder umbenannt wurde.
  [ "$count" -gt 0 ]

  if [ "${#missing_task[@]}" -gt 0 ]; then
    echo "Nicht in Taskfile.yml (Target test:llm-proxy): ${missing_task[*]}" >&2
    echo "  -> Datei dort in die node --test / vitest Zeile aufnehmen." >&2
  fi
  if [ "${#missing_ci[@]}" -gt 0 ]; then
    echo "Nicht in .github/workflows/ci.yml (Schritt 'llm-proxy routing + readiness'): ${missing_ci[*]}" >&2
    echo "  -> Datei dort in dieselbe Kommandozeile aufnehmen." >&2
  fi

  [ "${#missing_task[@]}" -eq 0 ]
  [ "${#missing_ci[@]}" -eq 0 ]
}
