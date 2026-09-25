#!/usr/bin/env bash
# brain-ingest-restamp.sh — Provenienz-Frontmatter chunk-identischer Seiten
# erneuern, ohne LLM-Transformation (T900401).
#
# Hintergrund: Der Ingest ist chunk-idempotent (unveränderte Chunks werden
# übersprungen), das Lifecycle-Audit vergleicht aber Datei-Revisionen. Ändert
# sich eine Quelldatei außerhalb eines Chunks, bleibt dessen Seite inhaltlich
# korrekt, trägt aber eine veraltete source_revision (stale_source). Ebenso
# behalten Seiten aus früheren Pipeline-Generationen ihr Altschema
# (metadata_unknown), obwohl ihr Inhalt aktuell ist. Ein From-Scratch-Lauf
# würde alle Chunks neu transformieren (Stunden GPU); dieses Skript stempelt
# nur das Frontmatter neu — aber NUR nach Verifikation, dass der Chunk-Bytes
# nach wie vor dem State-Hash entspricht. Abweichende Seiten werden als
# NEEDS-RETRANSFORM gemeldet, nicht gestempelt.
#
# Usage: brain-ingest-restamp.sh --brain-repo <path> [--root <dir>]
#          [--state <path>] [--apply]
# Default: dry (nur STAMP-CANDIDATE-Zeilen listen). --apply schreibt scharf.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_ROOT="$(cd "$HERE/.." && pwd)"
MANIFEST="$DEFAULT_ROOT/scripts/brain/ingest-sources.yaml"
CHUNK_SCRIPT="$HERE/brain-chunk.sh"
METADATA_SCRIPT="$HERE/brain-page-metadata.py"

# shellcheck source=./brain-group-match.sh
source "$HERE/brain-group-match.sh"
# shellcheck source=./brain-source-provenance.sh
source "$HERE/brain-source-provenance.sh"

BRAIN_REPO=""
ROOT="$DEFAULT_ROOT"
STATE_FILE="${BRAIN_INGEST_STATE:-$HOME/.brain-ingest-state.json}"
DO_APPLY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --brain-repo) BRAIN_REPO="${2:?--brain-repo requires a path}"; shift ;;
    --root)       ROOT="${2:?--root requires a path}"; shift ;;
    --state)      STATE_FILE="${2:?--state requires a path}"; shift ;;
    --apply)      DO_APPLY=1 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

[ -n "$BRAIN_REPO" ] || { echo "error: --brain-repo required" >&2; exit 1; }
[ -d "$BRAIN_REPO/wiki" ] || { echo "error: no wiki/ dir under --brain-repo: $BRAIN_REPO" >&2; exit 1; }
[ -f "$STATE_FILE" ] || { echo "error: state file not found: $STATE_FILE" >&2; exit 1; }
[ -f "$MANIFEST" ] || { echo "error: manifest not found: $MANIFEST" >&2; exit 1; }
[ -f "$CHUNK_SCRIPT" ] || { echo "error: chunk script not found: $CHUNK_SCRIPT" >&2; exit 1; }
[ -f "$METADATA_SCRIPT" ] || { echo "error: metadata helper not found: $METADATA_SCRIPT" >&2; exit 1; }

brain_group_section_for_manifest "$MANIFEST"
GROUPS_SECTION="$_BRAIN_GROUP_SECTION"

OBSERVED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
VALID_FROM="${OBSERVED_AT%%T*}"

source_kind_for_group() {
  case "$1" in
    ssot-specs) echo openspec ;;
    runbooks) echo runbook ;;
    adr) echo adr ;;
    gotchas-footguns) echo gotcha ;;
    agent-guide-maps) echo agent-guide ;;
    core-docs) echo core-doc ;;
    health-goals) echo health-goal ;;
    diagrams) echo diagram ;;
    github-reviewed) echo github-reviewed ;;
    *) return 1 ;;
  esac
}

frontmatter_value() {
  brain_source_frontmatter_value "$1" "$2" 2>/dev/null || echo ""
}

CHUNK_CACHE="$(mktemp -d)"
trap 'rm -rf "$CHUNK_CACHE"' EXIT

# Chunket eine Quelle genau einmal in den Cache (Manifest: Chunkdatei pro Index).
chunk_source() {
  local src_path="$1" slug="$2" out_dir ts
  out_dir="$CHUNK_CACHE/$slug"
  [ -d "$out_dir" ] && return 0
  mkdir -p "$out_dir"
  ts="$(bash "$CHUNK_SCRIPT" --source "$ROOT/$src_path" --slug "$slug" \
    --out-dir "$out_dir" 2>/dev/null)" || return 1
  printf '%s\n' "$ts" > "$out_dir/__manifest.tsv"
}

STAMPED=0
SKIPPED_FRESH=0
NEEDS_RETRANSFORM=0

for page in "$BRAIN_REPO"/wiki/*.md; do
  [ -e "$page" ] || continue
  slug="$(basename "$page" .md)"

  # Nur State-Produkte (Meta-, Gruppen-MOC- und Löschkandidat-Seiten haben
  # keinen State-Eintrag und fallen hier heraus).
  state_key="$(jq -r --arg s "$slug" \
    'to_entries[] | select(.value.slug == $s) | .key' "$STATE_FILE" | head -1)"
  [ -n "$state_key" ] || continue
  src_path="${state_key%%#*}"
  chunk_index="${state_key##*#}"
  # MOCs schreibt der Ingest selbst neu — nie stempeln.
  [ "$chunk_index" != "moc" ] || continue

  [ -f "$ROOT/$src_path" ] || continue
  brain_group_for "$src_path" "$GROUPS_SECTION" || continue
  group="$_BRAIN_GROUP_OUT"
  source_kind="$(source_kind_for_group "$group")" || continue

  # Bereits frisch? Alle vier Lifecycle-Felder + Datei-Revision aktuell.
  recorded="$(frontmatter_value "$page" "source_revision")"
  recorded="${recorded%\"}"; recorded="${recorded#\"}"
  if [ -n "$recorded" ] && [ -n "$(frontmatter_value "$page" "source_kind")" ] \
      && [ -n "$(frontmatter_value "$page" "observed_at")" ] \
      && [ -n "$(frontmatter_value "$page" "valid_from")" ]; then
    current_rev="$(sha256sum "$ROOT/$src_path" | cut -d' ' -f1)"
    if [ "$recorded" = "$current_rev" ]; then
      SKIPPED_FRESH=$((SKIPPED_FRESH + 1))
      continue
    fi
  fi

  # Verifikation: Chunk-Bytes müssen dem State-Hash entsprechen, sonst ist der
  # Seiteninhalt NICHT mehr aktuell und Stempeln wäre gelogen.
  page_slug_base="${slug%-*}"
  chunk_source "$src_path" "$page_slug_base" || {
    echo "NEEDS-RETRANSFORM: wiki/$slug.md (chunker failed: $src_path)"
    NEEDS_RETRANSFORM=$((NEEDS_RETRANSFORM + 1))
    continue
  }
  chunk_file="$(awk -F'\t' -v idx="$chunk_index" '$3 == idx {print $1; exit}' \
    "$CHUNK_CACHE/$page_slug_base/__manifest.tsv")"
  if [ -z "$chunk_file" ] || [ ! -f "$chunk_file" ]; then
    echo "NEEDS-RETRANSFORM: wiki/$slug.md (chunk $chunk_index gone: $src_path)"
    NEEDS_RETRANSFORM=$((NEEDS_RETRANSFORM + 1))
    continue
  fi
  state_hash="$(jq -r --arg k "$state_key" '.[$k].hash // ""' "$STATE_FILE")"
  current_hash="$(sha256sum "$chunk_file" | cut -d' ' -f1)"
  if [ "$current_hash" != "$state_hash" ]; then
    echo "NEEDS-RETRANSFORM: wiki/$slug.md (chunk content changed: $src_path#$chunk_index)"
    NEEDS_RETRANSFORM=$((NEEDS_RETRANSFORM + 1))
    continue
  fi

  echo "STAMP-CANDIDATE: wiki/$slug.md (source: $src_path#$chunk_index)"
  if [ "$DO_APPLY" -eq 1 ]; then
    target_tmp="$(mktemp "$BRAIN_REPO/wiki/.${slug}.XXXXXX")"
    if python3 "$METADATA_SCRIPT" --source "$ROOT/$src_path" \
        --source-kind "$source_kind" --observed-at "$OBSERVED_AT" \
        --valid-from "$VALID_FROM" < "$page" > "$target_tmp"; then
      mv "$target_tmp" "$page"
      echo "STAMPED: wiki/$slug.md"
    else
      rm -f "$target_tmp"
      echo "WARN: metadata filter failed: wiki/$slug.md" >&2
      continue
    fi
  fi
  STAMPED=$((STAMPED + 1))
done

if [ "$DO_APPLY" -eq 1 ]; then
  echo "Restamp: $STAMPED gestempelt, $SKIPPED_FRESH frisch übersprungen, $NEEDS_RETRANSFORM brauchen Re-Transformation"
else
  echo "Restamp: $STAMPED Kandidaten (dry), $SKIPPED_FRESH frisch übersprungen, $NEEDS_RETRANSFORM brauchen Re-Transformation"
fi
exit 0
