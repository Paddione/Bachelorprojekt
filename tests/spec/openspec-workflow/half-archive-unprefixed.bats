#!/usr/bin/env bats
# tests/spec/openspec-workflow/half-archive-unprefixed.bats — undatierte Archiveintraege [T013715]
#
# Vorgang: neun Eintraege in openspec/changes/archive/ trugen kein <YYYY-MM-DD>-Praefix
# (T002471-Bulk-Archiv 2026-07-29, t001537 aus #2589, ein Stray neben
# 2026-07-11-factory-provider-baseurl-routing). Der half-archive-Check uebersprang sie
# stillschweigend — ein undatierter Eintrag mit dem Slug eines offenen Changes haette
# eine halbe Archivierung verdeckt. Seit T013715 meldet der Check sie und failt.
#
# ACHTUNG $0-Falle (CLAUDE.md): Assertions sind auf konkrete Ausgabezeilen verengt,
# nicht auf blosse Begriffe.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  CHECK="${REPO_ROOT}/scripts/openspec-half-archive-check.sh"
  [ -x "$CHECK" ]
}

@test "T013715: Check failt und nennt einen Archiveintrag ohne Datumspraefix" {
  root="${BATS_TEST_TMPDIR}/unprefixed1"
  mkdir -p "${root}/changes/offen-alt" \
           "${root}/changes/archive/k1-vektorspeicher" \
           "${root}/changes/archive/2026-01-01-regulaer"

  run env OPENSPEC_ROOT="$root" bash "$CHECK"
  [ "$status" -ne 0 ]
  printf '%s\n' "$output" | grep -q "OHNE DATUMSPRAEFIX: 'k1-vektorspeicher'"
  # Positiv-Anker: der regulaere datierte Eintrag wird NICHT beanstandet.
  printf '%s\n' "$output" | grep -vq 'OHNE DATUMSPRAEFIX.*regulaer'
}

@test "T013715: Heilen-Hinweis nennt git mv und die Historie-Fundstelle" {
  root="${BATS_TEST_TMPDIR}/unprefixed2"
  mkdir -p "${root}/changes/archive/altlast"

  run env OPENSPEC_ROOT="$root" bash "$CHECK"
  [ "$status" -ne 0 ]
  printf '%s\n' "$output" | grep -q 'git mv "openspec/changes/archive/<eintrag>"'
  printf '%s\n' "$output" | grep -q -- '--diff-filter=A'
}

@test "T013715: undatierter Eintrag verdeckt keine halbe Archivierung mehr — beide Befunde kommen" {
  root="${BATS_TEST_TMPDIR}/unprefixed3"
  mkdir -p "${root}/changes/doppelt" \
           "${root}/changes/archive/2026-02-02-doppelt" \
           "${root}/changes/archive/undatiert"

  run env OPENSPEC_ROOT="$root" bash "$CHECK"
  [ "$status" -ne 0 ]
  printf '%s\n' "$output" | grep -q "HALB ARCHIVIERT: 'doppelt'"
  printf '%s\n' "$output" | grep -q "OHNE DATUMSPRAEFIX: 'undatiert'"
}

@test "T013715: sauberes Archiv bleibt gruen (datierte Eintraege + offene Changes)" {
  root="${BATS_TEST_TMPDIR}/unprefixed4"
  mkdir -p "${root}/changes/nur-offen" \
           "${root}/changes/archive/2026-03-03-nur-archiviert"

  run env OPENSPEC_ROOT="$root" bash "$CHECK"
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" | grep -q 'kein halb archivierter Change'
}

@test "T013715: das echte openspec/ enthaelt keinen undatierten Archiveintrag" {
  # Der eigentliche Vorgang: die neun Altlasten wurden in derselben Aenderung
  # umbenannt bzw. entfernt. Dieser Test faellt rot, sobald ein neuer Strippenzieher
  # einen undatierten Eintrag hinterlaesst.
  run bash "$CHECK"
  [ "$status" -eq 0 ]
}
