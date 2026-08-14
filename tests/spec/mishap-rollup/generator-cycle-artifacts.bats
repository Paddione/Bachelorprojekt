#!/usr/bin/env bats
#
# SSOT: openspec/specs/mishap-rollup.md
# Ticket: T005031 — Der Generator erzeugt im Zyklus-Change weder .ticket (T002836)
# noch specs/-Delta; openspec.sh validate ist fail-closed (missing specs/ delta dir,
# no .ticket link) und jeder Zyklus-PR waere CI-rot. Die Artefakt-Erzeugung wird als
# eigenes Skript `scripts/factory/mishap-rollup-artifacts.sh` testbar gemacht und vom
# Generator aufgerufen.
#
# PRUEFMODUS (T002448-M4): Command-Output-Verifikation. Der Test FUERHT das Skript
# AUS (Batch-Body wie vom Flusher geschrieben via stdin) und prueft die erzeugten
# Dateien (.ticket-Inhalt, specs/<slug>.md existiert mit ADDED-Requirements-Sektion
# und den Mishap-Titeln).

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
}

@test "T005031: Generator-Artefakt-Skript erzeugt .ticket und specs-Delta" {
  local outdir slug container batch
  outdir="$(mktemp -d)"
  slug="mishap-incident-rollup-2099-01-01-T999999"
  container="T999999"
  batch='### Mishap-Rollup — 2 Eintraege (2099-01-01 00:00 UTC)

| # | Typ | Komponente | Titel |
|---|---|---|---|
| 1 | drift | scripts/example.sh | Beispiel-Befund eins |
| 2 | suspicious | repo/worktrees | Beispiel-Befund zwei |

**1. Beispiel-Befund eins** (drift, scripts/example.sh)

Beschreibung eins.
**2. Beispiel-Befund zwei** (suspicious, repo/worktrees)

Beschreibung zwei.
'

  run bash -c 'printf "%s" "$1" | bash "$2" --slug "$3" --change-dir "$4" --container "$5"' \
    _ "$batch" "$REPO_ROOT/scripts/factory/mishap-rollup-artifacts.sh" "$slug" "$outdir" "$container"

  # Positiv-Anker: das Skript lief ueberhaupt und legte den Change-Dir an.
  [ "$status" -eq 0 ]
  [ -n "$output" ]

  # .ticket traegt die Container-ID (T002836-Konvention).
  [ -f "$outdir/.ticket" ]
  [ "$(cat "$outdir/.ticket")" = "$container" ]

  # specs/<slug>.md existiert als ADDED-Requirements-Delta mit den Mishap-Titeln.
  [ -f "$outdir/specs/$slug.md" ]
  [ "$(grep -c "## ADDED Requirements" "$outdir/specs/$slug.md")" -ge 1 ]
  [ "$(grep -c "Beispiel-Befund eins" "$outdir/specs/$slug.md")" -ge 1 ]
  [ "$(grep -c "Beispiel-Befund zwei" "$outdir/specs/$slug.md")" -ge 1 ]

  rm -rf "$outdir"
}
