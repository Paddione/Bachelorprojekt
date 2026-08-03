#!/usr/bin/env bats
# T002577 — `--no-merge`-Archivierungspfad in cmd_archive.
#
# Hintergrund: 24 der 51 Nachzuegler aus T002569 sind mishap-*-Bundles, deren
# Delta ein nie ausgefuellter Skeleton-Stub ist. Sie sind Prozess-Notizen, kein
# Spec-Inhalt — ein Autor soll keine Requirements erfinden muessen, nur um eine
# Notiz zu archivieren. `openspec.sh archive <slug> --no-merge` verschiebt das
# Change-Verzeichnis ins Archiv, ohne das Delta in die SSOT zu mergen. Ohne das
# Flag bleibt der fail-closed Stub-/Target-Guard unveraendert aktiv.
#
# Pruefmodus (T002448-M4): command output verification. Alle Tests FUEHREN
# openspec.sh aus und pruefen $status sowie den Zustand des Dateisystems danach;
# keiner greppt Quelltext.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
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

_skeleton_stub() {
  cat <<'EOF'
## ADDED Requirements

### Requirement: TODO

The system SHALL …

#### Scenario: TODO

- **GIVEN** …
- **WHEN** …
- **THEN** …
EOF
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
# Ohne ihn waeren die Negativtests unten auch dann gruen, wenn --no-merge gar
# nichts archivierte oder der Merge-Pfad generell nicht mehr schriebe.

@test "T002577: --no-merge archiviert ein Skeleton-Stub-Delta ohne SSOT-Merge" {
  _mk_change m1 ziel.md "$(_skeleton_stub)"
  printf '# ziel\n\n## Purpose\n\nx\n\n## Requirements\n' > "$ROOT/specs/ziel.md"
  local before; before="$(cat "$ROOT/specs/ziel.md")"

  run env OPENSPEC_ROOT="$ROOT" TICKET_OFFLINE=1 bash "$REPO_ROOT/scripts/openspec.sh" archive m1 --no-merge
  [ "$status" -eq 0 ]
  # Change ist ins Archiv verschoben
  [ ! -d "$ROOT/changes/m1" ]
  [ -d "$ROOT/changes/archive/"*m1 ]
  # SSOT ist unveraendert — kein Delta wurde gemergt
  [ "$(cat "$ROOT/specs/ziel.md")" = "$before" ]
  grep -q 'no delta merged into SSOT' <<<"$output"
}

@test "T002577: --no-merge laesst die SSOT unveraendert, auch wenn das Delta ein MODIFIED-Ziel referenziert" {
  # Ein --no-merge-Lauf darf NICHT an einem Target-Guard scheitern, weil kein
  # Merge stattfindet — das Delta wird nie gegen die SSOT geprueft.
  _mk_change m2 ziel.md "$(printf '## MODIFIED Requirements\n\n### Requirement: Gibt es nicht\n\nThe system SHALL x.\n')"
  printf '# ziel\n\n## Purpose\n\nx\n\n## Requirements\n' > "$ROOT/specs/ziel.md"
  local before; before="$(cat "$ROOT/specs/ziel.md")"

  run env OPENSPEC_ROOT="$ROOT" TICKET_OFFLINE=1 bash "$REPO_ROOT/scripts/openspec.sh" archive m2 --no-merge
  [ "$status" -eq 0 ]
  [ ! -d "$ROOT/changes/m2" ]
  [ "$(cat "$ROOT/specs/ziel.md")" = "$before" ]
}

# ── Negativ: ohne --no-merge bleibt fail-closed ──────────────────────────────

@test "T002577: ohne --no-merge bricht ein Skeleton-Stub weiterhin fail-closed ab" {
  _mk_change m3 ziel.md "$(_skeleton_stub)"
  printf '# ziel\n\n## Purpose\n\nx\n\n## Requirements\n' > "$ROOT/specs/ziel.md"

  run env OPENSPEC_ROOT="$ROOT" TICKET_OFFLINE=1 bash "$REPO_ROOT/scripts/openspec.sh" archive m3
  [ "$status" -ne 0 ]
  [[ "$output" == *"contains unedited skeleton stub"* ]]
  # Change bleibt an Ort und Stelle, nichts archiviert
  [ -d "$ROOT/changes/m3" ]
  [ ! -e "$ROOT/changes/archive/"*m3 ]
}

@test "T002577: ohne --no-merge bricht ein fehlendes MODIFIED-Ziel weiterhin fail-closed ab" {
  _mk_change m4 ziel.md "$(printf '## MODIFIED Requirements\n\n### Requirement: Gibt es nicht\n\nThe system SHALL x.\n')"
  printf '# ziel\n\n## Purpose\n\nx\n\n## Requirements\n' > "$ROOT/specs/ziel.md"

  run env OPENSPEC_ROOT="$ROOT" TICKET_OFFLINE=1 bash "$REPO_ROOT/scripts/openspec.sh" archive m4
  [ "$status" -ne 0 ]
  [[ "$output" == *"MODIFIED target 'Gibt es nicht' not found"* ]]
  [ -d "$ROOT/changes/m4" ]
}

# ── Atomaritaet ueber den --no-merge-Pfad ────────────────────────────────────

@test "T002577: --no-merge mit mehreren Deltas archiviert alle, ohne eine SSOT zu beruehren" {
  _mk_change m5 \
    a-ziel.md "$(_skeleton_stub)" \
    b-ziel.md "$(_skeleton_stub)"
  printf '# a-ziel\n\n## Purpose\n\nx\n\n## Requirements\n' > "$ROOT/specs/a-ziel.md"
  printf '# b-ziel\n\n## Purpose\n\nx\n\n## Requirements\n' > "$ROOT/specs/b-ziel.md"
  local before_a; before_a="$(cat "$ROOT/specs/a-ziel.md")"
  local before_b; before_b="$(cat "$ROOT/specs/b-ziel.md")"

  run env OPENSPEC_ROOT="$ROOT" TICKET_OFFLINE=1 bash "$REPO_ROOT/scripts/openspec.sh" archive m5 --no-merge
  [ "$status" -eq 0 ]
  [ ! -d "$ROOT/changes/m5" ]
  [ -d "$ROOT/changes/archive/"*m5 ]
  [ "$(cat "$ROOT/specs/a-ziel.md")" = "$before_a" ]
  [ "$(cat "$ROOT/specs/b-ziel.md")" = "$before_b" ]
}

# ── Positiv-Anker fuer den Merge-Pfad (bleibt intakt) ────────────────────────

@test "T002577: ohne --no-merge merged ein gueltiges Delta weiterhin in die SSOT" {
  _mk_change m6 ziel.md "$(_valid_added)"
  printf '# ziel\n\n## Purpose\n\nx\n\n## Requirements\n' > "$ROOT/specs/ziel.md"

  run env OPENSPEC_ROOT="$ROOT" TICKET_OFFLINE=1 bash "$REPO_ROOT/scripts/openspec.sh" archive m6
  [ "$status" -eq 0 ]
  grep -q '### Requirement: Beispielanforderung' "$ROOT/specs/ziel.md"
  [ ! -d "$ROOT/changes/m6" ]
  grep -q 'delta merged into SSOT' <<<"$output"
}
