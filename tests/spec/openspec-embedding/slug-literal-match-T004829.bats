#!/usr/bin/env bats
# tests/spec/openspec-embedding/slug-literal-match-T004829.bats
# SSOT: openspec/specs/openspec-embedding.md (delta in openspec/changes/openspec-embed-slug-pcre/)
#
# Reproduces T004829: embed_output_is_success interpoliert den übergebenen Slug
# unescaped in eine PCRE (`grep -qP "(^|, )${slug}(,|$)"`). Ein Slug mit
# Regex-Metazeichen kann die missing-List-Prüfung fail-open umgehen
# (grep-Syntaxfehler => Erfolg bleibt) oder False-Positives erzeugen
# ('.*' matcht jede Liste und negiert Erfolg fälschlich).
#
# Test mode: command output verification (run/$status) against the real
# helper in scripts/openspec-embed-lib.sh — no source-grep. Every negative
# assertion carries a positive anchor in the same file (T002356-M1).

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  LIB="$REPO/scripts/openspec-embed-lib.sh"
  source "$LIB"
}

# Baut einen Embed-Output mit Erfolgsmarker und Completeness-Gate-WARN.
# $1 = Slug im Marker, $2 = missing-Liste in der WARN-Zeile.
build_output() {
  printf "indexed slug='%s' chunks=4\nWARN: completeness gate — collection covers 1/3 local active plans, missing 1 (> 10%% tolerance): %s\n" "$1" "$2"
}

@test "Positiv-Anker: Slug in missing-Liste negiert Erfolg (exit 1)" {
  run embed_output_is_success "$(build_output demo 'demo, other-slug-1')" demo
  [ "$status" -eq 1 ]
}

@test "Regex-Metazeichen '.*' matcht literal — nicht in Liste => Erfolg bleibt (exit 0)" {
  run embed_output_is_success "$(build_output demo 'other-slug-1, other-slug-2')" '.*'
  [ "$status" -eq 0 ]
}

@test "Slug mit unbalancierter Klammer 'demo(' in Liste => negiert Erfolg (exit 1)" {
  run embed_output_is_success "$(build_output demo 'demo(, other-slug-1')" 'demo('
  [ "$status" -eq 1 ]
}

@test "Exakter Listeneintrag bleibt erhalten: demo matcht demo2 nicht (exit 0)" {
  run embed_output_is_success "$(build_output demo 'demo2, other-slug-1')" demo
  [ "$status" -eq 0 ]
}
