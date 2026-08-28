#!/usr/bin/env bats
# T016596 — Generatoren duerfen keine OS-nativen Pfadtrenner in die
# erzeugten Artefakte schreiben.
#
# WARUM: Node liefert aus path.join/path.relative unter Windows Backslashes.
# Landen die in einem committeten Artefakt, ist es fuer alle Nicht-Windows-
# Nutzer und fuer CI unbrauchbar — und der Diff verdeckt jede echte Aenderung.
#
# Belegt (2026-08-28, Node v26.7.0, Windows 11):
#
#   node scripts/build-api-map.mjs
#   git diff --stat docs/generated/api-map.json docs/generated/api-surface.md
#   # 584 geaenderte Zeilen ueber alle 291 Endpunkte, Form:
#   # | `/api/admin/art-library` | GET | admin | `components\website\src\pages\api\admin\art-library.ts` |
#
# Beim Lauf zu T016592 mussten die beiden Dateien deshalb bewusst aus dem
# Commit herausgehalten werden.
#
# Die Idiomatik im Repo ist bereits vorhanden — scripts/sdlc/api-inventory.mjs
# normalisiert mit .split(sep).join('/'). Dieser Guard haelt sie fest.
#
# PRUEFMODUS: zweigeteilt. Der Daten-Test prueft die committeten Artefakte
# (wirkt auf jeder Plattform und faengt einen schlechten Commit). Der
# Quelltext-Test haelt die Normalisierung an der Quelle fest — ein
# Laufzeitbeweis braeuchte einen Windows-Host, was CI nicht bietet.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
}

@test "T016596: die generierten Artefakte existieren (Positiv-Anker)" {
  # Ohne diesen Anker bestuende der Negativtest vakuos, sobald die Pfade sich
  # aendern: eine leere Dateimenge erfuellt "kein Backslash" trivial.
  [ -f "$REPO_ROOT/docs/generated/api-map.json" ]
  [ -f "$REPO_ROOT/docs/generated/api-surface.md" ]
  [ -f "$REPO_ROOT/docs/agent-guide/maps/networks-map.md" ]
}

@test "T016596: kein generiertes Artefakt traegt Backslash-Pfade" {
  run bash -c "grep -rlE '[A-Za-z0-9_-]+\\\\\\\\[A-Za-z0-9_-]+\\\\\\\\' \
    '$REPO_ROOT/docs/generated/api-map.json' \
    '$REPO_ROOT/docs/generated/api-surface.md' \
    '$REPO_ROOT/docs/agent-guide/maps/networks-map.md' || true"
  [ -z "$output" ] || {
    echo "Backslash-Pfade in generierten Artefakten:"
    echo "$output"
    return 1
  }
}

@test "T016596: jedes relative() der Generatoren wird auf POSIX normalisiert" {
  # Quelltext-Anker an der Quelle. Geprueft wird, dass kein relative()-Ergebnis
  # ohne .split(sep).join('/') in die Ausgabe geht.
  local offenders=""
  for f in scripts/build-api-map.mjs scripts/sdlc/api-inventory.mjs; do
    while IFS= read -r line; do
      [[ "$line" == *"split(sep)"* ]] && continue
      [[ "$line" == *"replace(/\\\\/g"* ]] && continue
      offenders+="$f: $line"$'\n'
    done < <(grep -nE '=[[:space:]]*relative\(' "$REPO_ROOT/$f" 2>/dev/null || true)
  done
  [ -z "$offenders" ] || {
    echo "relative() ohne POSIX-Normalisierung:"
    echo "$offenders"
    echo "Abhilfe: relative(a, b).split(sep).join('/')"
    return 1
  }
}

@test "T016596: networks-check normalisiert den Registry-Pfad im Kartenkopf" {
  # Gezielter Anker auf den zweiten Fundort: dort entsteht der relative Pfad
  # nicht ueber relative(), sondern per slice() auf dem absoluten Pfad — und
  # erbt dessen Trenner.
  run grep -n "split(sep).join('/')" "$REPO_ROOT/scripts/networks-check.mjs"
  [ "$status" -eq 0 ]
}
