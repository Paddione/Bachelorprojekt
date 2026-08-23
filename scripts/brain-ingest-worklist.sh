#!/usr/bin/env bash
# brain-ingest-worklist.sh — Generator für Brain-Doku Worklist (TAB-separated)
#
# Usage: brain-ingest-worklist.sh [--root <dir>] [--manifest <file>]
#        brain-ingest-worklist.sh --pending [--state <file>] [--root <dir>]
#
# --pending gibt STATT der Zeilenliste eine einzelne Zahl aus: die Menge der
# Chunks, die beim naechsten Ingest-Lauf tatsaechlich Arbeit waeren. [T013916]
#
# Warum das ein eigener Modus ist und keine Ableitung der Zeilenzahl: die
# Worklist ist eine reine Manifest-Expansion. Sie zaehlt ALLE Quellen, nicht die
# offenen. G-BRAIN14 las diese Zahl als "Backlog" und blieb damit bei Ziel 0
# dauerhaft rot — unabhaengig von jeder erledigten Arbeit (172 gemeldet, 17
# tatsaechlich offen).
#
# Die Pending-Semantik ist dieselbe wie in brain-ingest.sh process_page: der
# sha256 des QUELL-Chunks (vor jeder Transformation) gegen den State-Eintrag
# '<src_path>#<index>'. Deshalb braucht dieser Modus weder LLM noch Netz —
# brain-chunk.sh ist ausdruecklich "no LLM, no network". brain-ingest.sh
# --dry-run waere keine Alternative: es verlangt LM_MODEL (T002533) auch im
# Dry-Run, und CI hat keine LLM-Konfiguration.
#
# Emits TAB-separated rows "<relative-path>\t<slug>\t<group>" for every
# candidate source file under --root, honoring the `exclude:` prefix list
# and the `groups:` map/list in the manifest (scripts/brain/ingest-sources.yaml
# by default). See tests/spec/brain-initial-ingest.bats (T001570).
set -euo pipefail

ROOT="."
MANIFEST="scripts/brain/ingest-sources.yaml"
PENDING_MODE=0
STATE_FILE="${BRAIN_INGEST_STATE:-$HOME/.brain-ingest-state.json}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root)     ROOT="${2:?--root requires a value}"; shift ;;
    --manifest) MANIFEST="${2:?--manifest requires a value}"; shift ;;
    --pending)  PENDING_MODE=1 ;;
    --state)    STATE_FILE="${2:?--state requires a value}"; shift ;;
    --help|-h)  sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

if [[ ! -f "$MANIFEST" ]]; then
  echo "Fehler: Manifest fehlt ($MANIFEST)" >&2
  exit 1
fi

if [[ ! -d "$ROOT" ]]; then
  echo "Fehler: Root-Verzeichnis fehlt ($ROOT)" >&2
  exit 1
fi
ROOT="$(cd "$ROOT" && pwd)"

# --- exclude: list of prefix/substring patterns ---
exclude_patterns=()
while IFS= read -r line; do
  line="${line#"${line%%[![:space:]]*}"}"  # ltrim
  [[ "$line" =~ ^-\ (.+)$ ]] || continue
  p="${BASH_REMATCH[1]}"
  p="${p%\"}"; p="${p#\"}"
  exclude_patterns+=("$p")
done < <(awk '/^exclude:/{flag=1; next} /^[A-Za-z]/{flag=0} flag{print}' "$MANIFEST")

is_excluded() {
  local rel="$1"
  for pattern in "${exclude_patterns[@]}"; do
    [[ "$rel" == *"$pattern"* ]] && return 0
  done
  return 1
}

# shellcheck source=./brain-group-match.sh
source "$(dirname "${BASH_SOURCE[0]}")/brain-group-match.sh"

# Extracted once (not per file — see brain-group-match.sh perf note).
brain_group_section_for_manifest "$MANIFEST"
GROUPS_SECTION="$_BRAIN_GROUP_SECTION"

# Files that don't match any group's patterns are not brain-wiki sources —
# skip them rather than defaulting to a catch-all "docs" group (T001608:
# defaulting swept in the whole repo tree, ~1921 unrelated files).
group_for() {
  local rel="$1"
  brain_group_for "$rel" "$GROUPS_SECTION" || return 1
  echo "$_BRAIN_GROUP_OUT"
}

slugify() {
  local rel="$1"
  rel="${rel%.*}"
  rel="${rel#\.}"
  echo "$rel" | tr '/_ ' '---' | tr '[:upper:]' '[:lower:]'
}

WORKLIST_TMP="$(mktemp)"
trap 'rm -f "$WORKLIST_TMP"' EXIT

find "$ROOT" \
  \( -name .git \
     -o -name node_modules \
     -o -name .astro \
     -o -name .taskmaster \
     -o -name .agy \
     -o -name .antigravitycli \
     -o -name .design-sync \
     -o -name dist \
     -o -name .venv \
     -o -name __pycache__ \
     -o -name generated \
     -o -name archive \
     -o -name legacy-html \
     -o -name drift-reports \
     -o -name .worktrees \
     -o -name website \
     -o -name mentolder-web \
     -o -name brett \
     -o -name tui \
     -o -name tests \
     -o -name scripts \
     -o -name k3d \
     -o -name packages \
     -o -name VideoVault \
     -o -name art-library \
     -o -name studio-server \
     -o -name mediaviewer-widget \
     -o -name design-system \) -prune \
  -o -type f \( \
  -name '*.md' -o -name '*.yaml' -o -name '*.yml' -o \
  -name '*.sh' -o -name '*.bats' -o -name '*.json' -o \
  -name '*.toml' \) -print 2>/dev/null | sort | while read -r file; do
  rel="${file#"$ROOT"/}"
  is_excluded "$rel" && continue
  grp="$(group_for "$rel")" || true
  [[ -z "$grp" ]] && continue
  slug="$(slugify "$rel")"
  printf '%s\t%s\t%s\n' "$rel" "$slug" "$grp"
done > "$WORKLIST_TMP"

# [T013916] --pending: statt der Zeilenliste die Zahl der Chunks ausgeben, die
# beim naechsten Ingest wirklich Arbeit waeren. Semantik-Zwilling von
# brain-ingest.sh process_page (sha256 des Quell-Chunks gegen '<src>#<idx>').
if [[ "$PENDING_MODE" -eq 1 ]]; then
  _chunk_script="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/brain-chunk.sh"
  if [[ ! -x "$_chunk_script" ]]; then
    echo "Fehler: brain-chunk.sh fehlt ($_chunk_script)" >&2
    exit 1
  fi
  _tmpdir="$(mktemp -d)"
  trap 'rm -rf "$_tmpdir"' EXIT
  _pending=0
  while IFS=$'\t' read -r _src _slug _grp; do
    [[ -n "${_src:-}" ]] || continue
    [[ -f "$ROOT/$_src" ]] || continue
    _out="$_tmpdir/$(printf '%s' "$_slug" | tr -c 'a-zA-Z0-9' '_')"
    mkdir -p "$_out"
    while IFS=$'\t' read -r _cf _cslug _idx _heading; do
      [[ -n "${_cf:-}" ]] || continue
      _h="$(sha256sum "$_cf" | cut -d' ' -f1)"
      _e="$(jq -r --arg k "${_src}#${_idx}" '.[$k].hash // ""' "$STATE_FILE" 2>/dev/null || echo "")"
      [[ "$_h" == "$_e" ]] || _pending=$((_pending + 1))
    done < <(bash "$_chunk_script" --source "$ROOT/$_src" --slug "$_slug" --out-dir "$_out" 2>/dev/null || true)
  done < "$WORKLIST_TMP"
  # Fehlt das State-File, ist ALLES pending — das ist die ehrliche Antwort und
  # kein Fehler: ein frischer Rechner hat den Ingest noch nie gefahren.
  printf '%s\n' "$_pending"
  exit 0
fi

cat "$WORKLIST_TMP"

# Drift detection: warn (stderr, exit stays 0) about any manifest-declared
# group with zero matches anywhere in the walked tree — this is how the
# 78%-dead ssot-specs list went unnoticed for weeks (T001884).
declared_groups="$(awk '/^groups:/{flag=1; next} /^[A-Za-z]/{flag=0} flag && /^  [A-Za-z0-9_-]+:/{gsub(/^  /,""); gsub(/:.*/,""); print}' "$MANIFEST")"
observed_groups="$(cut -f3 "$WORKLIST_TMP" | sort -u)"
while IFS= read -r g; do
  [[ -z "$g" ]] && continue
  if ! grep -qxF "$g" <<< "$observed_groups"; then
    echo "Warnung: Manifest-Gruppe '$g' hat 0 Treffer (Drift?)" >&2
  fi
done <<< "$declared_groups"
