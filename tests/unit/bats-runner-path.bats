#!/usr/bin/env bats
# tests/unit/bats-runner-path.bats
# T002265: Verify CLAUDE.md documents the correct vendored BATS runner path.

# Beide Orte gelten: Die Test- und BATS-Konventionen wurden am 2026-08-18 aus der
# Wurzel-CLAUDE.md nach tests/CLAUDE.md ausgelagert (laedt automatisch bei Arbeit
# unter tests/). Gemeint ist die Absicht — der Runner-Pfad ist dort dokumentiert,
# wo ein Agent ihn findet — nicht ein bestimmter Dateiname. Der Guard hing am
# Dateinamen und wurde durch die Auslagerung rot, obwohl die Zusicherung erfuellt
# blieb (T012314).
CLAUDE_FILES=("CLAUDE.md" "tests/CLAUDE.md")
BATS_PATH="tests/unit/lib/bats-core/bin/bats"

@test "the BATS runner path is documented in a CLAUDE.md an agent loads" {
  # Positiv-Anker: mindestens eine der Dateien muss ueberhaupt existieren, sonst
  # wuerde die Schleife unten ins Leere laufen und der Fehlschlag den falschen
  # Grund nennen.
  local existing=0
  for f in "${CLAUDE_FILES[@]}"; do [ -f "$f" ] && existing=$((existing + 1)); done
  [ "$existing" -gt 0 ] || { echo "keine der CLAUDE.md-Dateien existiert: ${CLAUDE_FILES[*]}"; return 1; }

  for f in "${CLAUDE_FILES[@]}"; do
    [ -f "$f" ] || continue
    grep -q "$BATS_PATH" "$f" && return 0
  done
  echo "keine CLAUDE.md nennt den BATS-Runner-Pfad: $BATS_PATH"
  echo "geprueft: ${CLAUDE_FILES[*]}"
  return 1
}

@test "vendored BATS runner path exists and is executable" {
  [ -x "$BATS_PATH" ] || {
    echo "BATS runner not found or not executable at: $BATS_PATH"
    return 1
  }
}
