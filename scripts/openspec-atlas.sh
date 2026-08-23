#!/usr/bin/env bash
# scripts/openspec-atlas.sh — Spec Atlas Generator [T015012]
#
# Erzeugt/regeneriert docs/spec-atlas.md (Requirement-Index, Provenance,
# In-Flight-Deltas). Wird über `task openspec:atlas` bzw. freshness:regenerate
# gefahren; Verhalten spezifiziert in openspec/specs/openspec-workflow.md.
#
# Usage:
#   bash scripts/openspec-atlas.sh [--out <pfad>]
#
# OPENSPEC_ROOT  openspec/-Root überschreiben (Tests gegen Fixtures)
set -euo pipefail

# T001997: REPO am cwd des Aufrufers verankern (git toplevel), nicht am
# physischen Skriptpfad — sonst schreibt der Generator im Worktree-Kontext
# ins falsche docs/.
REPO="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "ERROR: openspec-atlas.sh must be run from inside a git worktree (cwd is not a git repository)" >&2; exit 1; }
OPENSPEC_ROOT="${OPENSPEC_ROOT:-$REPO/openspec}"

exec node "$REPO/scripts/openspec-atlas-lib.mjs" --root "$OPENSPEC_ROOT" "$@"
