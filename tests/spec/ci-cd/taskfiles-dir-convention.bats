#!/usr/bin/env bats
# Guard für die taskfiles/-Verzeichniskonvention [T002700].
#
# Prüfmodus: gemischt. Die Verzeichniskonvention manifestiert sich ausschließlich
# in der Dateiablage — dafür sind Datei-Prüfungen das angemessene Mittel (Ausnahme
# der Test-Resultats-Konvention T002448-M4). Der entscheidende Test ist dennoch
# output-verifiziert: `task --list` muss die Namespaces der ausgelagerten
# Taskfiles tatsächlich auflösen.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
}

@test "T002700: task loest die ausgelagerten Taskfiles auf (Positiv-Anker)" {
  run bash -c "cd '$REPO_ROOT' && task --list 2>&1"
  [ "$status" -eq 0 ]
  # Je ein Namespace aus einem ausgelagerten Taskfile — faellt rot, sobald ein
  # include-Pfad nach dem Move ins Leere zeigt.
  for ns in llm: factory: staging: brain:; do
    echo "$output" | grep -q "^\* ${ns}" || {
      echo "Namespace '${ns}' fehlt in task --list — include-Pfad kaputt?" >&2
      return 1
    }
  done
}

@test "T002700: alle includes zeigen nach taskfiles/" {
  local stray
  stray="$(grep -nE '^\s*taskfile:\s*\./Taskfile\.[a-z-]+\.ya?ml' "$REPO_ROOT/Taskfile.yml" || true)"
  [ -z "$stray" ] || {
    echo "Taskfile.yml bindet noch aus der Wurzel ein statt aus taskfiles/:" >&2
    echo "$stray" >&2
    return 1
  }
  # Positiv-Anker: es gibt ueberhaupt includes, und sie zeigen nach taskfiles/.
  local n
  n="$(grep -cE '^\s*taskfile:\s*\./taskfiles/Taskfile\.' "$REPO_ROOT/Taskfile.yml")"
  [ "$n" -ge 14 ] || {
    echo "Erwartet >=14 includes aus taskfiles/, gefunden: $n" >&2
    return 1
  }
}

@test "T002700: die Repo-Wurzel traegt nur noch Taskfile.yml" {
  # Positiv-Anker zuerst: das Einstiegs-Taskfile liegt weiterhin in der Wurzel,
  # sonst faende `task` gar nichts.
  [ -f "$REPO_ROOT/Taskfile.yml" ]
  # Und taskfiles/ ist befuellt — ohne diesen Anker waere die Negativ-Aussage
  # unten auch dann wahr, wenn jemand die Dateien schlicht geloescht haette.
  local moved
  moved="$(find "$REPO_ROOT/taskfiles" -maxdepth 1 -name 'Taskfile.*.y*ml' | wc -l)"
  [ "$moved" -ge 14 ] || {
    echo "taskfiles/ enthaelt nur $moved Taskfiles, erwartet >=14" >&2
    return 1
  }

  local stray
  stray="$(find "$REPO_ROOT" -maxdepth 1 -name 'Taskfile.*.y*ml' -printf '%f\n')"
  [ -z "$stray" ] || {
    echo "Diese Taskfiles gehoeren nach taskfiles/ statt in die Wurzel:" >&2
    echo "$stray" >&2
    return 1
  }
}
