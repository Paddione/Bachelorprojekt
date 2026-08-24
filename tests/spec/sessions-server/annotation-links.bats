#!/usr/bin/env bats
# tests/spec/sessions-server/annotation-links.bats
# SSOT: openspec/specs/sessions-server.md — "Annotations reference existing files".
# Prüfmodus: Querschnittstest, dessen Ergebnis sich ausschließlich im Quelltext
# manifestiert (Doku-Konvention) — hier ist grep das angemessene Mittel.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  SPEC="${REPO_ROOT}/openspec/specs/sessions-server.md"
}

@test "jede bats:-Annotation in sessions-server.md resolvt zu einer existierenden Datei" {
  # Positiv-Anker: die Annotationen existieren ueberhaupt (Sonst vakuum-gruen).
  count="$(grep -c '<!-- bats:' "$SPEC")"
  [ "$count" -ge 1 ]

  missing=""
  while IFS= read -r ref; do
    [ -n "$ref" ] || continue
    if [ ! -f "${REPO_ROOT}/${ref}" ]; then
      missing="${missing}${ref}"$'\n'
    fi
  done < <(grep -o '<!-- bats: [^ ]*\.bats -->' "$SPEC" | sed 's/<!-- bats: //; s/ -->//')

  [ -z "$missing" ] || {
    echo "Annotationen zeigen auf fehlende Dateien:" >&2
    printf '%s' "$missing" >&2
    return 1
  }
}
