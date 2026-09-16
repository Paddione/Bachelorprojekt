#!/usr/bin/env bash
# scripts/lib/openspec-archive-args.sh — Archiv-Flags fuer `openspec.sh archive`
# [T900105].
#
# Herausgeloest aus scripts/devflow-post-merge-finalize.sh (Schritt 8), damit
# das Hauptskript sein S1-Zeilenbudget haelt (wirksame Schwelle .sh = 800,
# docs/code-quality/gates.yaml) — derselbe Grund wie scripts/lib/
# finalize-frontmatter.sh [T015916]. Wird vom Hauptskript gesourct; beim
# Sourcen entstehen keine Seiteneffekte (nur Funktionsdefinition).
#
# Hintergrund T900105 (entdeckt bei T900104/work-vm-shared-dev, neue
# SSOT-Komponente): Schritt 8 baute archive_args nur mit --no-merge fuer
# mishap-incident-rollup-Slugs, kannte aber KEIN --create-new. Bei einer
# genuin neuen SSOT-Komponente schlug der Archiv-Merge fail-closed fehl
# ("Target ... does not exist. ... pass --create-new", openspec-merge.mjs).

# Bestimmt die Archiv-Flags fuer einen Change-Slug und legt sie im globalen
# Array ARCHIVE_ARGS ab.
# Usage: openspec_archive_args <slug> [repo-root]   (Default root: .)
#   mishap-incident-rollup-*  -> --no-merge (kein Merge, keine Guards)
#   Delta ohne SSOT-Target    -> --create-new (genuin neue Komponente)
#   sonst                     -> leer (Standard-Merge mit Guards)
openspec_archive_args() {
  local slug="${1:-}" root="${2:-.}"
  ARCHIVE_ARGS=()
  [[ -n "$slug" ]] || return 0
  if [[ "$slug" == mishap-incident-rollup-* ]]; then
    ARCHIVE_ARGS+=(--no-merge)
    return 0
  fi
  local delta
  for delta in "$root/openspec/changes/$slug/specs/"*.md; do
    [[ -e "$delta" ]] || continue
    if [[ ! -e "$root/openspec/specs/$(basename "$delta")" ]]; then
      ARCHIVE_ARGS+=(--create-new)
      break
    fi
  done
}
