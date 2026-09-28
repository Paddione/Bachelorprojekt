#!/usr/bin/env bats
# T900725: OpenSpec-Abriss A1b — Code, CI, Skills entkoppeln (ADR-010).
# Pruefmodus: Ausgabe von git grep/ls ueber die Dateilisten [T002448-M4].

setup() {
  REPO="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
}

_offenders() {
  local f
  while IFS= read -r f; do
    [[ -n "$f" && -e "$REPO/$f" ]] || continue
    grep -qiE "openspec|opsx" "$REPO/$f" && echo "$f"
  done < "$1"
  return 0
}

@test "T900725: Code-Dateien der Liste ohne OpenSpec-Bezug" {
  run _offenders "$REPO/tests/fixtures/os-retirement/code.txt"
  [ -z "$output" ] || { echo "$output" | head -40; return 1; }
}

@test "T900725: Skill-/Command-Dateien der Liste ohne OpenSpec-Bezug" {
  run _offenders "$REPO/tests/fixtures/os-retirement/skills.txt"
  [ -z "$output" ] || { echo "$output" | head -40; return 1; }
}

@test "T900725: openspec-Skills und opsx-Commands sind geloescht" {
  run bash -c "cd '$REPO' && ls -d .opencode/skills/openspec-* .claude/skills/openspec-* .claude/commands/opsx .opencode/commands/opsx-* 2>/dev/null"
  [ -z "$output" ]
}
