#!/usr/bin/env bats
# T016594 — Taskfile-Kommandos duerfen Skripte nicht per Shebang ausfuehren.
#
# WARUM: go-task benutzt den eingebauten mvdan/sh-Interpreter, keinen externen
# Shell-Prozess. Fuehrt dieser eine Datei direkt aus (./pfad), muss er ihren
# Shebang selbst aufloesen. Unter Windows behandelt er den absoluten
# POSIX-Pfad /usr/bin/env als relativ zum Arbeitsverzeichnis:
#
#   GetFileAttributesEx C:\...\usr\bin\env: Das System kann den angegebenen
#   Pfad nicht finden.
#
# Ergebnis ist ein nacktes "not found" mit Exit 127 — ohne Hinweis auf die
# Ursache. Das echte MSYS-bash loest denselben Shebang korrekt auf.
#
# Belegt (2026-08-28, Windows 11, go-task 3.53.1), im selben Arbeitsverzeichnis:
#
#   ./tests/unit/lib/bats-core/bin/bats --version    -> exit 127
#   bash tests/unit/lib/bats-core/bin/bats --version -> Bats 1.13.0
#
# Betroffen waren alle drei Pflicht-Gates aus dev-flow-execute
# (test:changed, freshness:regenerate, freshness:check) und damit der gesamte
# dev-flow unter Windows. Der Interpreter-Praefix ist auf Linux/macOS/CI
# identisch gueltig und aendert dort kein Verhalten.
#
# PRUEFMODUS: Quelltext-Scan. Die Zusicherung ist eine Portabilitaetsaussage
# ueber die Taskfiles selbst; ein Laufzeitbeweis braeuchte go-task auf einem
# Windows-Host, was nicht vorausgesetzt werden kann.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  TASKFILES=("$REPO_ROOT/Taskfile.yml" "$REPO_ROOT/taskfiles")
}

# Kommandozeilen, die ein repo-eigenes Skript in Kommandoposition per Shebang
# starten. Erwaehnungen in echo-Strings und Kommentaren sind Dokumentation,
# keine Ausfuehrung, und bleiben ausgenommen.
_shebang_invocations() {
  grep -rnE '(^|[;&|(]|&&|\|\|)[[:space:]]*(-[[:space:]]+)?\./(scripts|tests|tools)/' \
    "${TASKFILES[@]}" 2>/dev/null \
    | grep -vE '^[^:]+:[0-9]+:[[:space:]]*#' \
    | grep -vE 'echo|printf' \
    || true
}

@test "T016594: der Scan erfasst ueberhaupt Taskfile-Kommandos (Positiv-Anker)" {
  # Ohne diesen Anker bestuende der Negativtest unten vakuos, sobald sich die
  # Taskfile-Pfade oder die Struktur aendern: eine leere Kandidatenmenge
  # erfuellt "kein Treffer" trivial.
  run bash -c "grep -rcE '^[[:space:]]+-[[:space:]]' '$REPO_ROOT/Taskfile.yml'"
  [ "$status" -eq 0 ]
  [ "$output" -gt 100 ]
}

@test "T016594: der BATS-Runner wird ueber den Interpreter gestartet (Positiv-Anker)" {
  # Gezielter Anker auf den haeufigsten Fall: der Runner muss im Taskfile
  # vorkommen, und zwar mit bash-Praefix.
  run bash -c "grep -rc 'bash tests/unit/lib/bats-core/bin/bats' '$REPO_ROOT/Taskfile.yml'"
  [ "$status" -eq 0 ]
  [ "$output" -gt 0 ]
}

@test "T016594: kein Taskfile-Kommando startet ein Skript per Shebang" {
  run _shebang_invocations
  [ -z "$output" ] || {
    echo "Shebang-Direktaufruf im Taskfile gefunden (unter Windows Exit 127):"
    echo "$output"
    echo "Abhilfe: Interpreter voranstellen, z. B. 'bash tests/...' statt './tests/...'."
    return 1
  }
}
