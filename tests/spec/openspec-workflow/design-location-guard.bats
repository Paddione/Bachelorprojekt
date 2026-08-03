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
# Skelett-Artefakte enthielten. Diese Datei zieht den Guard eine Stufe nach vorn:
# ein Change mit aktiver Design-Anforderung MUSS design.md tragen.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
}

@test "design-location: Regressions-Anker — die drei betroffenen Changes tragen design.md" {
  # Positiv-Anker [T002356-M1]: die drei am 2026-08-03 fälschlich in
  # docs/superpowers/specs/ abgelegten Designs müssen in ihren Change-Ordnern
  # liegen. Ohne diesen Anker bestünde der Test vakuos grün, wenn der Guard
  # nie greift.
  for slug in agentic-resource-lookup skill-path-guard web-audit; do
    [ -f "$REPO/openspec/changes/$slug/design.md" ] \
      || { echo "design.md fehlt fuer change $slug" >&2; return 1; }
  done
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
