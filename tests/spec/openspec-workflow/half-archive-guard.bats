#!/usr/bin/env bats
# tests/spec/openspec-workflow/half-archive-guard.bats — halbe Archivierungen [T002428]
#
# Vorgang: pr-refresh-T002413 lag auf main gleichzeitig unter openspec/changes/ UND unter
# openspec/changes/archive/2026-07-28-…, waehrend openspec/specs/ci-cd.md das Delta nicht
# enthielt. Entstanden, weil `openspec.sh archive` in einem fremden Worktree (#3447/T002382)
# lief und nur ein Teil des Ergebnisses committet wurde: der Archivordner ja, der
# Delta-Merge und das Entfernen der Quelle nicht.
#
# Zwei Luecken werden hier abgesichert:
#   1. `mv "$dir" "$dest"` verschachtelt still, wenn $dest schon existiert
#   2. der Halbzustand selbst war nirgends pruefbar
#
# ACHTUNG $0-Falle (CLAUDE.md): der Worktree heisst T002428. Assertions sind auf konkrete
# Ausgabezeilen verengt, nicht auf blosse Begriffe.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  OPENSPEC_SH="${REPO_ROOT}/scripts/openspec.sh"
}

# ── Guard 1: archive darf nicht in ein bestehendes Ziel hinein verschieben ──────

@test "T002428: archive verweigert, wenn das Archivziel schon existiert" {
  # Sandbox mit eigenem OPENSPEC_ROOT, damit das echte openspec/ unberuehrt bleibt.
  root="${BATS_TEST_TMPDIR}/openspec"
  mkdir -p "${root}/specs" "${root}/changes/demo/specs"
  printf '# Spec: demo\n\n## Requirements\n' > "${root}/specs/demo.md"
  cat > "${root}/changes/demo/specs/demo.md" <<'DELTA'
## ADDED Requirements

### Requirement: Demo requirement

The system SHALL do a demo thing.

#### Scenario: Demo scenario

- **GIVEN** a demo
- **WHEN** it runs
- **THEN** it works
DELTA
  # Das Archivziel existiert bereits — genau die Lage auf main.
  mkdir -p "${root}/changes/archive/$(date +%F)-demo"

  run env TICKET_OFFLINE=1 OPENSPEC_ROOT="$root" bash "$OPENSPEC_SH" archive demo

  # Positiv-Anker: das Skript hat den Change ueberhaupt gefunden und ist bis zum
  # Zielkonflikt gekommen — ohne ihn koennte der Test auch bei "no such change" bestehen.
  [ "$status" -ne 0 ]
  printf '%s\n' "$output" | grep -q 'Archivziel existiert bereits'

  # Kern: die Quelle steht noch da und wurde NICHT hineinverschachtelt.
  [ -d "${root}/changes/demo" ]
  [ ! -d "${root}/changes/archive/$(date +%F)-demo/demo" ]
}

@test "T002428: archive laeuft bei freiem Ziel weiterhin durch" {
  # Gegenprobe zum Guard oben: der Normalfall darf nicht beschaedigt sein.
  root="${BATS_TEST_TMPDIR}/openspec2"
  mkdir -p "${root}/specs" "${root}/changes/demo2/specs"
  printf '# Spec: demo2\n\n## Requirements\n' > "${root}/specs/demo2.md"
  cat > "${root}/changes/demo2/specs/demo2.md" <<'DELTA'
## ADDED Requirements

### Requirement: Second demo requirement

The system SHALL do a second demo thing.

#### Scenario: Second demo scenario

- **GIVEN** a demo
- **WHEN** it runs
- **THEN** it works
DELTA

  run env TICKET_OFFLINE=1 OPENSPEC_ROOT="$root" bash "$OPENSPEC_SH" archive demo2
  [ "$status" -eq 0 ]

  # Quelle weg, Archiv da, Delta in der SSOT — alle drei Teilschritte.
  [ ! -d "${root}/changes/demo2" ]
  [ -d "${root}/changes/archive/$(date +%F)-demo2" ]
  grep -q 'Second demo requirement' "${root}/specs/demo2.md"
}

# ── Guard 2: der Halbzustand selbst ist pruefbar ────────────────────────────────

@test "T002428: half-archive-Check meldet einen Slug, der in changes/ UND im Archiv liegt" {
  CHECK="${REPO_ROOT}/scripts/openspec-half-archive-check.sh"
  [ -x "$CHECK" ]

  root="${BATS_TEST_TMPDIR}/openspec3"
  mkdir -p "${root}/changes/doppelt" "${root}/changes/archive/2026-07-28-doppelt"

  run env OPENSPEC_ROOT="$root" bash "$CHECK"
  [ "$status" -ne 0 ]
  printf '%s\n' "$output" | grep -q 'doppelt'
}

@test "T002428: half-archive-Check ist gruen, wenn kein Slug doppelt liegt" {
  # Positiv-Anker gegen vakuoses Bestehen: der Check muss den sauberen Fall wirklich
  # durchlassen, sonst waere der Test oben auch ohne Implementierung erfuellbar.
  CHECK="${REPO_ROOT}/scripts/openspec-half-archive-check.sh"
  root="${BATS_TEST_TMPDIR}/openspec4"
  mkdir -p "${root}/changes/nur-offen" "${root}/changes/archive/2026-07-28-nur-archiviert"

  run env OPENSPEC_ROOT="$root" bash "$CHECK"
  [ "$status" -eq 0 ]
}

@test "T002428: das echte openspec/ enthaelt keinen halb archivierten Slug" {
  # Der eigentliche Vorgang: pr-refresh-T002413 lag doppelt. Dieser Test faellt rot,
  # solange der Zustand nicht geheilt ist.
  run bash "${REPO_ROOT}/scripts/openspec-half-archive-check.sh"
  [ "$status" -eq 0 ]
}
