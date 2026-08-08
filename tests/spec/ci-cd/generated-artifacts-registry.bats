#!/usr/bin/env bats
# Drift-Guard fuer die Register generierter Artefakte [T002686].
#
# Pruefmodus: Diese Datei prueft Konfigurationszustand, nicht Laufzeitverhalten —
# der zulaessige Ausnahmefall der Test-Resultats-Konvention (T002448-M4), weil
# sich das Ergebnis ausschliesslich in Konfigurationsdateien manifestiert. Wo es
# geht, wird trotzdem der echte Mechanismus befragt statt Text gegreppt:
# `git check-attr` liefert das Attribut, das git TATSAECHLICH anwendet, und
# faengt damit auch Eintraege, die auf einen nicht existierenden Pfad zeigen.
#
# Hintergrund: Die Menge "generierte Artefakte" ist an vier Stellen dupliziert —
# freshness:regenerate (welche Generatoren laufen), die FILES-Liste in
# freshness:check (was geprueft wird), .gitattributes (was merge-geschuetzt ist)
# und einzelne BATS-Tests. Zwei Drifts waren die Folge:
#
#   - .gitattributes listete website/src/lib/goals-data.generated.json, waehrend
#     der Generator nach website/src/lib/sdlc/goals-data.generated.json schreibt.
#     Die real erzeugte Datei hatte damit merge: unspecified.
#   - docs/agent-guide/maps/agents-map.md fehlte in BEIDEN Registern, obwohl die
#     drei Schwesterdateien vollstaendig erfasst sind. Staleness fiel dadurch in
#     einem anderen CI-Job auf als die uebrigen Artefakte (PR #3813).

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  cd "$REPO_ROOT" || return 1
}

# Die Pfade aus der FILES-Liste von freshness:check.
# `grep -v '^\s*#'` ist nicht kosmetisch: die Liste enthaelt erklaerende
# Kommentare, in denen Dateinamen vorkommen. Ohne den Filter zieht die
# Extraktion einen Dateinamen aus dem Fliesstext und meldet ihn als
# ungeschuetzten Pfad — beobachtet beim Bau dieses Guards.
_gate_files() {
  sed -n '/freshness:check:/,/^  [a-z][a-z:-]*:$/p' Taskfile.yml \
    | sed -n '/FILES="/,/^\s*"$/p' \
    | grep -v '^\s*#' \
    | grep -oE "[a-zA-Z0-9/._-]+/[a-zA-Z0-9/._-]+\.(json|md)" \
    | LC_ALL=C sort -u
}

# Die Pfade, die .gitattributes als generiert markiert (ohne Glob-Muster: fuer
# die kann check-attr keinen konkreten Pfad pruefen).
_attr_files() {
  grep -E "merge=ours" .gitattributes \
    | grep -oE "^[a-zA-Z0-9/._-]+\.(json|md)" \
    | LC_ALL=C sort -u
}

@test "freshness: jede Datei im Gate ist auch merge=ours geschuetzt" {
  local missing=""
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    # git check-attr statt grep: liefert das effektiv angewandte Attribut.
    if [ "$(git check-attr merge -- "$f" | sed 's/.*: //')" != "ours" ]; then
      missing="${missing}${f}"$'\n'
    fi
  done < <(_gate_files)

  # Positiv-Anker: die Gate-Liste darf nicht leer sein, sonst ist die
  # Negativ-Aussage oben vakuos erfuellt.
  [ "$(_gate_files | wc -l)" -gt 5 ]

  [ -z "$missing" ] || {
    echo "Im freshness:check-Gate, aber ohne merge=ours in .gitattributes:"
    echo "$missing"
    echo "Folge: parallele Branches kollidieren auf einer generierten Datei."
    return 1
  }
}

@test "freshness: die FILES-Liste enthaelt ausschliesslich existierende Pfade" {
  # FILES ist ein Shell-String, der per Wortsplitting durchlaufen wird. Ein
  # hineingeschriebener Kommentar wird damit zu Pfaden: beim Bau dieses Fixes
  # erzeugte eine Erklaerzeile die Phantom-Eintraege "an", "PR" und "#3813." und
  # das Gate meldete 40 fehlende Artefakte. Deshalb wird hier roh extrahiert —
  # OHNE den Kommentarfilter aus _gate_files, der genau diesen Fehler kaschiert.
  local raw missing=""
  raw="$(sed -n '/freshness:check:/,/^  [a-z][a-z:-]*:$/p' Taskfile.yml \
        | sed -n '/FILES="/,/^\s*"$/p' \
        | sed '1d;$d' | tr -d '\r' | xargs -n1 2>/dev/null || true)"

  while IFS= read -r f; do
    [ -n "$f" ] || continue
    [ -e "$f" ] || missing="${missing}${f}"$'\n'
  done <<< "$raw"

  # Positiv-Anker: es muessen ueberhaupt Eintraege extrahiert worden sein.
  [ "$(printf '%s\n' "$raw" | grep -c .)" -gt 5 ]

  [ -z "$missing" ] || {
    echo "FILES-Liste enthaelt Woerter, die keine Datei sind:"
    echo "$missing"
    echo "Vermutlich ein Kommentar in der Liste — Erklaerungen gehoeren ueber die Zuweisung."
    return 1
  }
}

@test "gitattributes: kein merge=ours-Eintrag zeigt auf einen nicht existierenden Pfad" {
  local dead=""
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    [ -e "$f" ] || dead="${dead}${f}"$'\n'
  done < <(_attr_files)

  # Positiv-Anker: es muessen ueberhaupt Eintraege gefunden worden sein.
  [ "$(_attr_files | wc -l)" -gt 5 ]

  [ -z "$dead" ] || {
    echo "merge=ours zeigt auf nicht existierende Pfade:"
    echo "$dead"
    echo "Der Schutz greift dort ins Leere — die echte Datei bleibt ungeschuetzt."
    return 1
  }
}

@test "agent-guide: alle vier maps sind im Gate und merge=ours" {
  # Die vier Karten entstehen aus EINEM Generator (scripts/agent-guide/emit-maps.mjs)
  # und muessen deshalb identisch behandelt werden. agents-map.md fehlte in beiden
  # Registern, waehrend die drei Schwestern erfasst waren.
  local gate; gate="$(_gate_files)"
  local bad=""
  for m in goals-map tools-map danger-map agents-map; do
    local p="docs/agent-guide/maps/${m}.md"
    echo "$gate" | grep -qx "$p" || bad="${bad}${p} (nicht im Gate)"$'\n'
    [ "$(git check-attr merge -- "$p" | sed 's/.*: //')" = "ours" ] \
      || bad="${bad}${p} (kein merge=ours)"$'\n'
  done

  # Positiv-Anker: der Generator existiert und erzeugt wirklich vier Karten.
  [ -f scripts/agent-guide/emit-maps.mjs ]

  [ -z "$bad" ] || { echo "$bad"; return 1; }
}
