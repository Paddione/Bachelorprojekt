#!/usr/bin/env bats
# tests/spec/repo-structure/website-moved.bats
# SSOT: openspec/specs/repo-structure.md
#
# Drift-Guard fuer den Move components/website/ -> components/components/website/ (T006999, Partial p4).
# Pruefmodus (T002448-M4-Ausnahme, dokumentiert): Querschnitts-Struktur-Guard —
# das Ergebnis manifestiert sich ausschliesslich im Quelltext (Taskfiles,
# Workflows), es gibt kein Laufzeit-Verhalten. Deshalb git-grep.
#
# Reihenfolge T002356-M1: erst der Positiv-Anker (components/components/website/package.json
# muss existieren — ohne den Move schlaegt er fehl), dann die Negativ-Aussagen.
# Ohne den Anker bestuenden die Negativ-Pruefungen ueber leere Listen vakuos.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
}

@test "T006999: components/website existiert (Positiv-Anker)" {
  [ -f "$REPO_ROOT/components/components/website/package.json" ] \
    || { echo "FEHLT: components/components/website/package.json — Move nicht ausgefuehrt"; return 1; }
}

@test "T006999: kein Top-Level-Verzeichnis components/website/ mehr" {
  [ ! -d "$REPO_ROOT/website" ] \
    || { echo "FEHLT: Top-Level-Ordner components/website/ existiert noch"; return 1; }
}

@test "T006999: keine stale components/website/-Referenzen in Querschnitts-Dateien" {
  # 'components/website/' ist Substring von 'components/components/website/' — Zeilen mit dem neuen
  # Praefix sind erlaubt und werden gefiltert.
  local stale=0
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    case "$line" in
      *components/components/website/*) continue ;;
    esac
    echo "STALE: $line" >&2
    stale=1
  done < <(git -C "$REPO_ROOT" grep -F -n 'components/website/' -- \
    Taskfile.yml taskfiles .github/workflows || true)

  [ "$stale" -eq 0 ] || return 1
}
