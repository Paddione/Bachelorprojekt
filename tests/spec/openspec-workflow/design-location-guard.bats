#!/usr/bin/env bats
# tests/spec/openspec-workflow/design-location-guard.bats — T002611/T002612/T002613
#
# Pruefmodus: OUTPUT-VERIFIKATION [T002448-M4]. Die Tests fuchren die Suche nach
# Design-Dateien tatsaechlich aus und pruefen $output — sie greppen keine
# Implementierung.
#
# Hintergrund: Die SSOT-Regel (openspec/specs/dev-flow-plan.md "design.md is the
# SSOT location for brainstorm designs") verlangt, dass Brainstorm-Designs in
# `openspec/changes/<slug>/design.md` geschrieben werden — NICHT in
# `docs/superpowers/specs/<date>-<slug>-design.md` (Legacy-Dateien dort bleiben
# liegen, neue Designs duerfen dort nicht mehr landen).
#
# Am 2026-08-03 landeten drei Designs (agentic-resource-lookup, skill-path-guard,
# web-audit) dennoch in docs/superpowers/specs/, waehrend ihre Change-Ordner nur
# Skelett-Artefakte enthielten.
#
# Bewacht wird NICHT "jeder Change traegt ein design.md" — das waere falsch:
# design.md ist optional, nur brainstormte Vorgaenge haben eines (am 2026-08-03
# 7 von 36 aktiven Changes). Bewacht wird die Ablage: liegt ein Design fuer einen
# AKTIVEN Change im Legacy-Pfad, ist das ein Verstoss gegen die SHALL-Anforderung.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
}

@test "design-location: Positiv-Anker — die SSOT-Ablage wird tatsaechlich benutzt" {
  # Positiv-Anker [T002356-M1] fuer den Negativtest weiter unten. Er belegt, dass
  # die ERKENNUNG greift: mindestens ein design.md liegt am SSOT-Ort, der Glob
  # findet es, und der Pfadaufbau in diesem Test stimmt. Ohne ihn bestuende der
  # Negativtest vakuos gruen, falls der Glob ins Leere zeigt.
  #
  # Bewusst NICHT an einen konkreten Bestand gekoppelt (etwa "die drei Changes
  # vom 2026-08-03 tragen design.md"): design.md ist optional — nur brainstormte
  # Vorgaenge haben eines, am 2026-08-03 waren es 7 von 36 aktiven Changes. Ein
  # bestandsgebundener Anker wuerde bei jeder Archivierung rot, ohne dass die
  # bewachte Eigenschaft verletzt waere, und er schluege in jedem Worktree fehl,
  # der nur seinen eigenen Change traegt.
  run bash -c "ls '$REPO'/openspec/changes/*/design.md 2>/dev/null | wc -l"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "design-location: kein neues Design in docs/superpowers/specs/ fuer aktives Change" {
  # Ein Design fuer einen aktiven Change darf nicht mehr in docs/superpowers/specs/
  # liegen. Gefunden wird ueber den Slug: docs/superpowers/specs/<date>-<slug>-design.md
  # mit passendem openspec/changes/<slug>/.
  local found=0
  for f in "$REPO"/docs/superpowers/specs/*-design.md; do
    [[ -f "$f" ]] || continue
    base="$(basename "$f")"                     # 2026-08-03-agentic-resource-lookup-design.md
    slug="${base#*-}"; slug="${slug%-design.md}" # agentic-resource-lookup-design.md -> agentic-resource-lookup
    if [[ -d "$REPO/openspec/changes/$slug" ]]; then
      echo "Design liegt im Legacy-Pfad fuer aktiven change $slug: $f" >&2
      found=1
    fi
  done
  [ "$found" -eq 0 ]
}
