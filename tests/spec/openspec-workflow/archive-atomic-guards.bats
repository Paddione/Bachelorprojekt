#!/usr/bin/env bats
# T002581 — archive muss atomar sein: kein Schreibvorgang, bevor alle Guards durch sind.
#
# Hintergrund (T002569 Charge 6): openspec-merge.mjs legt bei --create-new die
# Skeleton-SSOT an, BEVOR die Merge-Schleife an einem spaeteren Guard scheitern
# kann. Zurueck blieb openspec/specs/auto-close-guard.md als verwaiste Datei.
# Zweite Ebene: cmd_archive merged pro Delta-Datei in einer Schleife — bricht
# Datei 2 ab, ist die SSOT von Datei 1 bereits mutiert, das Change-Verzeichnis
# aber nicht verschoben. Ein solcher Lauf ist weder vollzogen noch folgenlos.
#
# Pruefmodus (T002448-M4): command output verification. Alle Tests FUEHREN
# openspec-merge.mjs bzw. openspec.sh aus und pruefen $status sowie den
# Zustand des Dateisystems danach; keiner greppt Quelltext.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  MERGE="$REPO_ROOT/scripts/openspec-merge.mjs"
  ROOT="$BATS_TEST_TMPDIR/openspec"
  mkdir -p "$ROOT/specs" "$ROOT/changes"
}

# Legt einen Change mit beliebig vielen Delta-Dateien an.
# Aufruf: _mk_change <slug> <delta-dateiname> <inhalt> [<dateiname> <inhalt> ...]
_mk_change() {
  local slug="$1"; shift
  mkdir -p "$ROOT/changes/$slug/specs"
  while [ $# -gt 0 ]; do
    printf '%s\n' "$2" > "$ROOT/changes/$slug/specs/$1"
    shift 2
  done
}

_valid_added() {
  cat <<'EOF'
## ADDED Requirements

### Requirement: Beispielanforderung

The system SHALL etwas Nachpruefbares tun.

#### Scenario: Normalfall

- **GIVEN** ein Zustand
- **WHEN** etwas geschieht
- **THEN** ein Ergebnis
EOF
}

# ── Positiv-Anker (Pflicht nach T002356-M1) ──────────────────────────────────
# Ohne ihn waeren die Negativtests unten auch dann gruen, wenn 'check' gar
# nichts pruefte oder 'apply' generell nicht mehr schriebe.

@test "T002581: check laesst ein gueltiges Delta durch und schreibt dabei NICHT" {
  _mk_change c1 ziel.md "$(_valid_added)"
  printf '# ziel\n\n## Purpose\n\nx\n\n## Requirements\n' > "$ROOT/specs/ziel.md"
  local before; before="$(cat "$ROOT/specs/ziel.md")"

  run node "$MERGE" check "$ROOT/changes/c1/specs/ziel.md" "$ROOT/specs/ziel.md"
  [ "$status" -eq 0 ]
  [ "$(cat "$ROOT/specs/ziel.md")" = "$before" ]
}

@test "T002581: apply schreibt das gueltige Delta danach weiterhin in die SSOT" {
  _mk_change c2 ziel.md "$(_valid_added)"
  printf '# ziel\n\n## Purpose\n\nx\n\n## Requirements\n' > "$ROOT/specs/ziel.md"

  run node "$MERGE" apply "$ROOT/changes/c2/specs/ziel.md" "$ROOT/specs/ziel.md"
  [ "$status" -eq 0 ]
  grep -q '### Requirement: Beispielanforderung' "$ROOT/specs/ziel.md"
}

# ── Ebene 1: keine verwaiste SSOT bei --create-new ───────────────────────────

@test "T002581: check auf ein Delta mit nicht auffindbarem MODIFIED-Ziel schlaegt fehl" {
  _mk_change c3 ziel.md "$(printf '## MODIFIED Requirements\n\n### Requirement: Gibt es nicht\n\nThe system SHALL x.\n')"
  printf '# ziel\n\n## Purpose\n\nx\n\n## Requirements\n' > "$ROOT/specs/ziel.md"

  run node "$MERGE" check "$ROOT/changes/c3/specs/ziel.md" "$ROOT/specs/ziel.md"
  [ "$status" -ne 0 ]
  [[ "$output" == *"MODIFIED target 'Gibt es nicht' not found"* ]]
}

@test "T002581: gescheitertes --create-new hinterlaesst KEINE verwaiste SSOT-Datei" {
  # Delta ohne '### Requirement:'-Block: der --create-new-Nachweis am Ende von
  # applyDelta schlaegt fehl — vor dem Fix war die Skeleton-Datei da bereits
  # geschrieben. Das ist der Fall aus T002569 Charge 6 (auto-close-guard.md).
  _mk_change c4 neuespec.md "$(printf '## ADDED Requirements\n\nKein Requirement-Block, nur Fliesstext.\n')"

  run node "$MERGE" apply "$ROOT/changes/c4/specs/neuespec.md" "$ROOT/specs/neuespec.md" --create-new
  [ "$status" -ne 0 ]
  [ ! -e "$ROOT/specs/neuespec.md" ]
}

# ── Ebene 2: kein Teil-Merge ueber mehrere Delta-Dateien ─────────────────────

@test "T002581: archive laesst SSOT des ersten Deltas unveraendert, wenn ein zweites bricht" {
  _mk_change c5 \
    a-ziel.md "$(_valid_added)" \
    b-ziel.md "$(printf '## MODIFIED Requirements\n\n### Requirement: Gibt es nicht\n\nThe system SHALL x.\n')"
  printf '# a-ziel\n\n## Purpose\n\nx\n\n## Requirements\n' > "$ROOT/specs/a-ziel.md"
  printf '# b-ziel\n\n## Purpose\n\nx\n\n## Requirements\n' > "$ROOT/specs/b-ziel.md"
  local before_a; before_a="$(cat "$ROOT/specs/a-ziel.md")"

  run env OPENSPEC_ROOT="$ROOT" TICKET_OFFLINE=1 bash "$REPO_ROOT/scripts/openspec.sh" archive c5
  [ "$status" -ne 0 ]
  # a-ziel.md darf NICHT mutiert sein, obwohl sein Delta fuer sich gueltig ist
  [ "$(cat "$ROOT/specs/a-ziel.md")" = "$before_a" ]
  # und der Change bleibt an Ort und Stelle
  [ -d "$ROOT/changes/c5" ]
}

@test "T002581: archive vollzieht einen Change mit zwei gueltigen Deltas vollstaendig" {
  # Positiv-Anker zum Test darueber: der Zwei-Pass darf den Normalfall nicht
  # blockieren. Ohne ihn waere obiger Test auch gruen, wenn archive gar nichts
  # mehr merged.
  _mk_change c6 a2-ziel.md "$(_valid_added)" b2-ziel.md "$(_valid_added)"
  printf '# a2-ziel\n\n## Purpose\n\nx\n\n## Requirements\n' > "$ROOT/specs/a2-ziel.md"
  printf '# b2-ziel\n\n## Purpose\n\nx\n\n## Requirements\n' > "$ROOT/specs/b2-ziel.md"

  run env OPENSPEC_ROOT="$ROOT" TICKET_OFFLINE=1 bash "$REPO_ROOT/scripts/openspec.sh" archive c6
  [ "$status" -eq 0 ]
  grep -q '### Requirement: Beispielanforderung' "$ROOT/specs/a2-ziel.md"
  grep -q '### Requirement: Beispielanforderung' "$ROOT/specs/b2-ziel.md"
  [ ! -d "$ROOT/changes/c6" ]
}
