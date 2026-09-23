#!/usr/bin/env bats
# T900338 — Executor fuer das Archivieren verwaister OpenSpec-Changes.
# SSOT: openspec/specs/openspec-workflow.md
#   "Orphaned changes are archived by a CI executor without discretionary flags"
#
# Pruefmodus (T002448-M4): command output verification. Jeder Test FUEHRT
# scripts/openspec-orphan-archive.sh gegen ein Fixture-OPENSPEC_ROOT aus und
# prueft Exit-Code, Ergebnisdateien und den Zustand des Baums danach.
#
# Run: tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/orphan-archive.bats

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  EXEC="$REPO_ROOT/scripts/openspec-orphan-archive.sh"
  ROOT="$BATS_TEST_TMPDIR/openspec"
  OUT="$BATS_TEST_TMPDIR/out"
  mkdir -p "$ROOT/specs" "$ROOT/changes/archive" "$OUT"
  printf '# ziel\n\n## Purpose\n\nx\n\n## Requirements\n' > "$ROOT/specs/ziel.md"
}

# _mk_change <slug> <ziel-spec-name> <ticket>
_mk_change() {
  mkdir -p "$ROOT/changes/$1/specs"
  printf '%s\n' "$3" > "$ROOT/changes/$1/.ticket"
  cat > "$ROOT/changes/$1/specs/$2.md" <<EOF
## ADDED Requirements

### Requirement: Anforderung aus $1

The system SHALL etwas Nachpruefbares tun.

#### Scenario: Normalfall

- **GIVEN** ein Zustand
- **WHEN** etwas geschieht
- **THEN** ein Ergebnis
EOF
}

_run_exec() {
  run env OPENSPEC_ROOT="$ROOT" bash "$EXEC" --out "$OUT" "$@"
}

@test "T900338: gueltiger Change wird archiviert und in archived.txt gemeldet" {
  _mk_change ok1 ziel T000001
  _run_exec --slugs ok1
  [ "$status" -eq 0 ]
  [ ! -d "$ROOT/changes/ok1" ]
  ls "$ROOT/changes/archive" | grep -qx '[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}-ok1'
  grep -q '### Requirement: Anforderung aus ok1' "$ROOT/specs/ziel.md"
  grep -qx 'ok1' "$OUT/archived.txt"
}

@test "T900338: fehlender Ziel-Spec wird gemeldet, nicht per --create-new erzwungen" {
  _mk_change neu1 gibt-es-nicht T000002
  _run_exec --slugs neu1
  [ "$status" -eq 0 ]
  [ -d "$ROOT/changes/neu1" ]
  [ ! -e "$ROOT/specs/gibt-es-nicht.md" ]
  grep -q $'^neu1\tT000002\t.*does not exist' "$OUT/failed.tsv"
  run grep -qx 'neu1' "$OUT/archived.txt"
  [ "$status" -ne 0 ]
}

@test "T900338: ein Fehlschlag blockiert die uebrigen Slugs nicht" {
  _mk_change neu2 gibt-es-nicht T000003
  _mk_change ok2 ziel T000004
  _run_exec --slugs neu2,ok2
  [ "$status" -eq 0 ]
  grep -qx 'ok2' "$OUT/archived.txt"
  grep -q $'^neu2\t' "$OUT/failed.tsv"
  [ ! -d "$ROOT/changes/ok2" ]
  [ -d "$ROOT/changes/neu2" ]
}

@test "T900338: Slug ohne offenes Change-Verzeichnis landet in failed.tsv" {
  _run_exec --slugs weg1
  [ "$status" -eq 0 ]
  grep -q $'^weg1\t.*not an open change' "$OUT/failed.tsv"
}

@test "T900338: --dry-run nennt den Slug und schreibt nichts" {
  _mk_change dry1 ziel T000005
  local before; before="$(cat "$ROOT/specs/ziel.md")"
  _run_exec --slugs dry1 --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *dry1* ]]
  [ -d "$ROOT/changes/dry1" ]
  [ "$(cat "$ROOT/specs/ziel.md")" = "$before" ]
}

@test "T900338: fehlendes --slugs ist ein Aufruffehler (Exit 2)" {
  _run_exec
  [ "$status" -eq 2 ]
}
