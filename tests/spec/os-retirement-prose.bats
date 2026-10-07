#!/usr/bin/env bats
# T900724: OpenSpec-Abriss A1a — Prosa-/Kommentar-Verweise (ADR-010).
# Pruefmodus: Ausgabe von git grep ueber die Dateiliste tests/fixtures/os-retirement/prose.txt [T002448-M4].

setup() {
  REPO="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  LIST="$REPO/tests/fixtures/os-retirement/prose.txt"
}

_offenders() {
  local f
  while IFS= read -r f; do
    [[ -n "$f" && -e "$REPO/$f" ]] || continue
    grep -qi "openspec" "$REPO/$f" && echo "$f"
  done < "$LIST"
  return 0
}

@test "T900724: keine Datei der Liste enthaelt noch einen Verweis" {
  [ -s "$LIST" ]
  run _offenders
  [ "$status" -eq 0 ]
  [ -z "$output" ] || { echo "$output" | head -40; echo "gesamt: $(wc -l <<<"$output")"; return 1; }
}
