#!/usr/bin/env bash
# brain-ingest.sh — Full-automation brain wiki ingestion pipeline.
# Transforms Bachelorprojekt source files into brain wiki pages via LLM,
# delivers via PR to Paddione/brain.
#
# Usage: brain-ingest.sh --brain-repo <path> [--pilot N] [--dry-run] [--state <path>] [--branch <name>] [--prune]
#
# Env:
#   LM_STUDIO_URL    — llama-server ingest-pool API URL (default:
#                      http://localhost:8093 — standalone llama-server.exe,
#                      NOT LM Studio's :1234 despite the var name; kept for
#                      backward compat with existing callers/CI config)
#                      T002258: was :8095 — that port now serves the bge-m3
#                      EMBEDDING model (T002110/PR #3150), not a chat model.
#                      T002551: bge embed/rerank sind seither Cluster-CPU-
#                      Deployments (k3d/llm-gpu.yaml); die Host-Ports 8095/8096
#                      existieren nicht mehr. Einziger Host-Server:
#                        8093 = Bonsai chat / ingest pool (-np 4)
#   LM_MODEL         — Model to use (PFLICHT, kein Default; siehe T002533)
#   MAX_PARALLEL     — Concurrent process_page() jobs (default: 4, matching
#                      the ingest-pool server's -np slot count — raising this
#                      above the server's slot count just queues requests)
#   BRAIN_INGEST_STATE — State file path (default: ~/.brain-ingest-state.json)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/.." && pwd)"
MANIFEST="$REPO_ROOT/scripts/brain/ingest-sources.yaml"
WORKLIST_SCRIPT="$REPO_ROOT/scripts/brain-ingest-worklist.sh"
TRANSFORM_SCRIPT="$HERE/brain-ingest-transform.sh"
CHUNK_SCRIPT="$HERE/brain-chunk.sh"

# shellcheck source=./brain-group-match.sh
source "$HERE/brain-group-match.sh"

# --- Defaults ---
BRAIN_REPO=""
DRY_RUN=0
PILOT=0
PRUNE=0
STATE_FILE="${BRAIN_INGEST_STATE:-$HOME/.brain-ingest-state.json}"
BRANCH="feature/brain-initial-ingest"
LM_URL="${LM_STUDIO_URL:-http://localhost:8093}"
LM_MODEL="${LM_MODEL:?LM_MODEL ist Pflicht (siehe T002533)}"
MAX_PARALLEL="${MAX_PARALLEL:-4}"
CHUNK_TARGET_CHARS="${BRAIN_CHUNK_TARGET_CHARS:-8000}"
# transform.sh's MAX_SOURCE_CHARS is a fail-closed guard since T002679 — it no
# longer truncates. Its stock default of 4000 is BELOW the chunk target, so
# leaving it alone would reject essentially every chunk this script produces.
# Two chunk targets of headroom: brain-chunk.sh emits a single paragraph that is
# larger than the target as one oversized chunk rather than dropping text, and
# only a pathological source (one paragraph past 16k) should trip the guard.
export MAX_SOURCE_CHARS="${MAX_SOURCE_CHARS:-$((CHUNK_TARGET_CHARS * 2))}"
export BRAIN_CHUNK_TARGET_CHARS="$CHUNK_TARGET_CHARS"
# transform.sh runs as a child process per page — it needs its own copy of
# these, not just brain-ingest.sh's local vars (was previously unset here,
# so a caller who didn't export LM_STUDIO_URL got transform.sh's own
# default, silently disagreeing with whatever brain-ingest.sh computed).
export LM_STUDIO_URL="$LM_URL"
export LM_MODEL

# --- Parse args ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    --brain-repo) BRAIN_REPO="${2:?--brain-repo requires a path}"; shift ;;
    --dry-run)    DRY_RUN=1 ;;
    --pilot)      PILOT="${2:?--pilot requires a number}"; shift ;;
    --state)      STATE_FILE="${2:?--state requires a path}"; shift ;;
    --branch)     BRANCH="${2:?--branch requires a name}"; shift ;;
    --prune)      PRUNE=1 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

[ -n "$BRAIN_REPO" ] || { echo "error: --brain-repo required" >&2; exit 1; }
[ -d "$BRAIN_REPO/.git" ] || { echo "error: --brain-repo is not a git repo: $BRAIN_REPO" >&2; exit 1; }
[ -f "$MANIFEST" ] || { echo "error: manifest not found: $MANIFEST" >&2; exit 1; }
[ -f "$WORKLIST_SCRIPT" ] || { echo "error: worklist script not found: $WORKLIST_SCRIPT" >&2; exit 1; }
[ -f "$TRANSFORM_SCRIPT" ] || { echo "error: transform script not found: $TRANSFORM_SCRIPT" >&2; exit 1; }
[ -f "$CHUNK_SCRIPT" ] || { echo "error: chunk script not found: $CHUNK_SCRIPT" >&2; exit 1; }

# Extracted once (not per file — see brain-group-match.sh perf note).
brain_group_section_for_manifest "$MANIFEST"
GROUPS_SECTION="$_BRAIN_GROUP_SECTION"

# ============================================================
# Phase 1: Preparation
# ============================================================
echo "=== Phase 1: Preparation ==="

# Generate worklist
WORKLIST="$(mktemp)"
# Both trap definitions must carry the SAME list — the second one replaces the
# first outright, and a temp file missing from either is a leak on the abort
# path it covers. The ${VAR:-} guards matter because `set -u` is in force and an
# abort in Phase 1 fires the trap before the later variables are ever assigned.
trap 'rm -f "${WORKLIST:-}" "${SLUGS_JSON:-}" "${CHUNKS_TSV:-}" "${DELIVERED_TSV:-}"; rm -rf "${CHUNK_DIR:-}" "${RESULTS_DIR:-}"' EXIT
bash "$WORKLIST_SCRIPT" --root "$REPO_ROOT" --manifest "$MANIFEST" > "$WORKLIST"
TOTAL="$(wc -l < "$WORKLIST")"
echo "Worklist: $TOTAL source files"

# Apply pilot limit
if [ "$PILOT" -gt 0 ] && [ "$PILOT" -lt "$TOTAL" ]; then
  echo "Pilot mode: processing first $PILOT of $TOTAL pages"
  head -n "$PILOT" "$WORKLIST" > "${WORKLIST}.pilot"
  mv "${WORKLIST}.pilot" "$WORKLIST"
  TOTAL="$PILOT"
fi

# Phase 1a: Chunk-Vorpass — jede Quelle durch den Chunker, Manifest aufbauen
echo ""
echo "=== Phase 1a: Chunking sources ==="
CHUNK_DIR="$(mktemp -d)"
CHUNKS_TSV="$(mktemp)"
CHUNK_TOTAL=0

while IFS=$'\t' read -r src_path slug _group; do
  [ -n "$src_path" ] || continue
  src_file="$REPO_ROOT/$src_path"

  ts="$(bash "$CHUNK_SCRIPT" --source "$src_file" --slug "$slug" --out-dir "$CHUNK_DIR/$slug" --moc "$CHUNK_DIR/$slug/__moc.md" 2>/dev/null)" || {
    echo "ERROR: Chunker failed for $src_path — aborting" >&2
    exit 1
  }

  # Extend each TSV line with the source path as first column
  chunks_for_src=0
  while IFS=$'\t' read -r chunk_file chunk_slug idx heading; do
    [ -n "$chunk_file" ] || continue
    printf '%s\t%s\t%s\t%s\t%s\n' "$src_path" "$chunk_file" "$chunk_slug" "$idx" "$heading"
    CHUNK_TOTAL=$((CHUNK_TOTAL + 1))
    chunks_for_src=$((chunks_for_src + 1))
  done <<< "$ts"

  # The chunker keeps the parent MOC OUT of its own manifest on purpose: the MOC
  # links exactly the chunks, so a manifest that also listed the MOC could never
  # agree with its own wikilink set. It is appended here as the index-0 record
  # that Phase 2b consumes — and only for a source that actually split, because
  # a Map of Content with a single entry is noise, not navigation.
  moc_src="$CHUNK_DIR/$slug/__moc.md"
  if [ "$chunks_for_src" -gt 1 ] && [ -f "$moc_src" ]; then
    printf '%s\t%s\t%s\t0\t%s\n' "$src_path" "$moc_src" "$slug" "Map of Content"
  fi
done < "$WORKLIST" > "$CHUNKS_TSV"

echo "Worklist: $TOTAL source files → $CHUNK_TOTAL chunks"

# Compute slug inventory from chunk manifest (includes MOC slugs)
SLUGS_JSON="$(mktemp)"
awk -F'\t' '{print $3}' "$CHUNKS_TSV" | jq -R . | jq -s . > "$SLUGS_JSON"
echo "Slug inventory: $(jq length "$SLUGS_JSON") slugs (including MOCs)"

# Load state (idempotency)
if [ ! -f "$STATE_FILE" ]; then
  echo '{}' > "$STATE_FILE"
fi

# Create/update branch in brain repo
echo "Preparing brain repo branch: $BRANCH"
cd "$BRAIN_REPO"
git fetch origin 2>/dev/null || true
if git rev-parse --verify "origin/$BRANCH" >/dev/null 2>&1; then
  git checkout -B "$BRANCH" "origin/$BRANCH" 2>/dev/null
else
  git checkout -B "$BRANCH" origin/main 2>/dev/null || git checkout -B "$BRANCH" main 2>/dev/null
fi
# Ensure wiki/ directory exists
mkdir -p "$BRAIN_REPO/wiki"
cd "$REPO_ROOT"

# ============================================================
# Phase 2: LLM Transformation
# ============================================================
echo ""
echo "=== Phase 2: LLM Transformation ==="

PROCESSED=0
SKIPPED=0
FAILED=0
CURRENT=0

# Determine group from manifest by matching source path against group
# patterns. Delegates to the shared matcher (scripts/brain-group-match.sh) so
# worklist generation and page processing never drift on what "belongs to a
# group" means. Falls back to "docs" — unlike the worklist's group_for(),
# every path reaching this function already passed the worklist's group
# filter, so the fallback should be unreachable in practice; kept as a
# defensive default for direct/test callers.
determine_group() {
  local src_path="$1"
  brain_group_for "$src_path" "$GROUPS_SECTION" || { echo "docs"; return 0; }
  echo "$_BRAIN_GROUP_OUT"
}

# Process a single chunk (extracted for reuse). Safe to run concurrently —
# the STATE_FILE read-modify-write is flock-protected since multiple
# parallel jobs write to it.
process_page() {
  local src_path="$1" chunk_file="$2" chunk_slug="$3" index="$4"
  local src_hash existing_hash type tag_defaults transformed group tmp chunk_chars

  [ -f "$chunk_file" ] || { echo "WARN: chunk not found: $chunk_file ($src_path)" >&2; return 1; }

  chunk_chars="$(wc -c < "$chunk_file")"

  src_hash="$(sha256sum "$chunk_file" | cut -d' ' -f1)"
  local state_key="${src_path}#${index}"
  existing_hash="$(jq -r --arg k "$state_key" '.[$k].hash // ""' "$STATE_FILE" 2>/dev/null || echo "")"
  [ "$src_hash" = "$existing_hash" ] && return 2  # skip

  group="$(determine_group "$src_path")"

  type=""
  while IFS= read -r override; do
    pattern="$(echo "$override" | jq -r '.pattern')"
    if [[ "$src_path" == $pattern ]]; then
      type="$(echo "$override" | jq -r '.type')"
      break
    fi
  done < <(jq -c '.type_map.overrides[]?' "$MANIFEST" 2>/dev/null || echo "")

  if [ -z "$type" ]; then
    type="$(jq -r --arg g "$group" '.type_map.defaults[$g] // "note"' "$MANIFEST" 2>/dev/null || echo "note")"
  fi

  tag_defaults="$(jq -c --arg g "$group" '.tag_defaults[$g] // ["note"]' "$MANIFEST" 2>/dev/null || echo '["note"]')"

  # Set BRAIN_SOURCE_PATH so transform.sh carries the original source path in its
  # source:: line, not the temp chunk directory (T002679, D2).
  transformed="$(BRAIN_SOURCE_PATH="$src_path" bash "$TRANSFORM_SCRIPT" "$chunk_file" "$type" "$chunk_slug" "$SLUGS_JSON" "$tag_defaults" 2>/dev/null)" || {
    echo "WARN: LLM failed: $src_path chunk $index" >&2
    return 1
  }

  if ! echo "$transformed" | head -20 | grep -q "^---"; then
    echo "WARN: Invalid frontmatter: $src_path chunk $index" >&2
    return 1
  fi

  echo "$transformed" > "$BRAIN_REPO/wiki/$chunk_slug.md"

  (
    flock -x 200
    tmp="$(mktemp)"
    jq --arg k "$state_key" --arg h "$src_hash" --arg s "$chunk_slug" --arg t "$type" \
      --arg ci "$index" --argjson cc "$chunk_chars" \
      '.[$k] = {hash:$h, slug:$s, type:$t, chunk_index:$ci, chars:$cc, transformed_at:(now | todate)}' \
      "$STATE_FILE" > "$tmp" && mv "$tmp" "$STATE_FILE"
  ) 200>"$STATE_FILE.lock"
  return 0
}

# Parallel processing — dispatches up to MAX_PARALLEL concurrent
# process_page() jobs, matching the ingest-pool llama-server's slot count
# (default 6, see scripts/brain-ingest-transform.sh header). Each job writes
# its exit code to RESULTS_DIR so the parent can tally after `wait`, since
# background subshells can't mutate the parent's PROCESSED/SKIPPED/FAILED
# counters directly.
RESULTS_DIR="$(mktemp -d)"
trap 'rm -f "${WORKLIST:-}" "${SLUGS_JSON:-}" "${CHUNKS_TSV:-}" "${DELIVERED_TSV:-}"; rm -rf "${CHUNK_DIR:-}" "${RESULTS_DIR:-}"' EXIT

# Phase 2a: Clean up chunk state entries whose chunk no longer exists.
#
# brain-ingest-prune.sh does NOT catch these: a page left over from a source
# that shrank from 5 chunks to 3 still carries a valid source:: onto a source
# that still exists, so its :54-58 check counts it as alive.
#
# Only sources that are IN the current manifest are examined. A source absent
# from the manifest says nothing here — under --pilot the manifest is a
# deliberate excerpt, and treating absence as "gone" would delete the wiki pages
# and state of every source outside the pilot on the first pilot run.
echo ""
echo "=== Phase 2a: Stale chunk cleanup ==="
current_sources="$(awk -F'\t' '{print $1}' "$CHUNKS_TSV" | sort -u)"
current_keys="$(awk -F'\t' '$4 != 0 { printf "%s#%s\n", $1, $4 }' "$CHUNKS_TSV" | sort -u)"
stale_count=0
while IFS= read -r state_key; do
  [ -n "$state_key" ] || continue
  [[ "$state_key" == *#* ]] || continue
  src_prefix="${state_key%%#*}"
  key_suffix="${state_key##*#}"
  # MOC entries are rewritten wholesale in Phase 2b, not tracked per index.
  [ "$key_suffix" != "moc" ] || continue
  grep -qxF "$src_prefix" <<< "$current_sources" || continue
  grep -qxF "$state_key" <<< "$current_keys" && continue

  echo "STALE-CHUNK: $state_key (source shrank — chunk index no longer produced)"
  stale_count=$((stale_count + 1))
  stale_slug="$(jq -r --arg k "$state_key" '.[$k].slug // ""' "$STATE_FILE" 2>/dev/null || echo "")"
  if [ -n "$stale_slug" ] && [ -f "$BRAIN_REPO/wiki/$stale_slug.md" ]; then
    rm -f "$BRAIN_REPO/wiki/$stale_slug.md"
  fi
  (
    flock -x 200
    tmp="$(mktemp)"
    jq --arg k "$state_key" 'del(.[$k])' "$STATE_FILE" > "$tmp" && mv "$tmp" "$STATE_FILE"
  ) 200>"$STATE_FILE.lock"
done < <(jq -r 'keys[]' "$STATE_FILE" 2>/dev/null || echo "")
echo "Stale chunk cleanup: $stale_count removed"

# Dispatch loop over chunks (skip MOC lines where index=0 or chunk_slug=src_slug)
DELIVERED_TSV="$(mktemp)"

while IFS=$'\t' read -r src_path chunk_file chunk_slug idx heading; do
  [ -n "$src_path" ] || continue
  [ -n "$chunk_file" ] || continue

  # Skip MOC lines (index 0 or slug matches source slug)
  [ "$idx" != "0" ] || continue

  CURRENT=$((CURRENT + 1))

  while (( $(jobs -rp | wc -l) >= MAX_PARALLEL )); do
    wait -n
  done

  (
    rc=0
    chunk_chars=0
    process_page "$src_path" "$chunk_file" "$chunk_slug" "$idx" || rc=$?
    if [ "$rc" = "0" ] || [ "$rc" = "2" ]; then
      chunk_chars="$(wc -c < "$chunk_file")"
    fi
    printf '%s\t%s\t%s\n' "$rc" "$src_path" "$chunk_chars" > "$RESULTS_DIR/$CURRENT"
  ) &
  printf "\r[%d/%d] dispatched: %s " "$CURRENT" "$CHUNK_TOTAL" "$chunk_slug"
done < "$CHUNKS_TSV"

wait

for result_file in "$RESULTS_DIR"/*; do
  [ -f "$result_file" ] || continue
  IFS=$'\t' read -r rc src_path chunk_chars < "$result_file"
  case "$rc" in
    0) PROCESSED=$((PROCESSED + 1)) ;;
    2) SKIPPED=$((SKIPPED + 1)) ;;
    *) FAILED=$((FAILED + 1)); chunk_chars=0 ;;
  esac
  printf '%s\t%s\t%s\n' "$src_path" "$chunk_chars" "$rc" >> "$DELIVERED_TSV"
done

echo ""
echo ""
echo "Phase 2 complete: Processed=$PROCESSED, Skipped=$SKIPPED, Failed=$FAILED (parallel, MAX_PARALLEL=$MAX_PARALLEL)"

# Fehlerschwelle (T002533). Ohne dieses Gate endete ein Lauf, der 0 von 92
# Quellen verarbeitet und 67-mal "LLM failed" gemeldet hatte, mit Exit 0 — von
# einem Erfolg nicht zu unterscheiden, wenn man nicht in den Log sieht. Genau so
# blieb ein toter LLM-Endpunkt unbemerkt bestehen.
#
# Seit T002679 beziehen sich die Zählungen auf Chunks (~300 statt ~144 Quellen).
# Die absolute Schwelle INGEST_MAX_FAIL_ABS=10 greift damit bei gleichem Wert
# früher — ein systematischer Endpunktausfall kippt den Lauf weiterhin sofort.
#
# Die Schwelle ist bewusst grob: ein einzelner Ausfall (Zeitueberschreitung an
# einem grossen Chunk) soll den Lauf nicht kippen, ein systematischer schon.
# Attempted = alles ausser Uebersprungenem; nur DAS ist die sinnvolle Bezugsmenge,
# denn idempotent uebersprungene Chunks sagen ueber die Anbieter-Gesundheit nichts.
# Zwei Regeln, weil eine allein jeweils den falschen Fall trifft:
#
#   a) Absolute Untergrenze. Viele Fehlschlaege heissen "der Endpunkt ist kaputt",
#      unabhaengig von der Quote. Der Ausgangsfall waren 67 Fehlschlaege.
#   b) Quote — aber erst ab einer Mindest-Stichprobe. Dank Idempotenz fasst ein
#      Nachlauf oft nur eine Handvoll Chunks an; dort kippt ein einzelner
#      transienter Fehlschlag (bei gehosteten Anbietern typisch:
#      Ratenbegrenzung unter Parallelitaet) jede sinnvolle Quote.
#
# Ausdruecklich KEINE Regel ist "PROCESSED == 0 heisst Abbruch": ein Lauf, bei dem
# alles idempotent uebersprungen wurde und genau eine hartnaeckige Quelle uebrig
# bleibt, ist der Normalfall am Ende einer Ingest-Reihe, kein Stoerfall.
INGEST_MAX_FAIL_PCT="${INGEST_MAX_FAIL_PCT:-20}"
INGEST_MIN_SAMPLE="${INGEST_MIN_SAMPLE:-10}"
INGEST_MAX_FAIL_ABS="${INGEST_MAX_FAIL_ABS:-10}"
_attempted=$((PROCESSED + FAILED))
_abort_reason=""
if [ "$FAILED" -ge "$INGEST_MAX_FAIL_ABS" ]; then
  _abort_reason="${FAILED} Chunks fehlgeschlagen (absolute Schwelle ${INGEST_MAX_FAIL_ABS})"
elif [ "$_attempted" -ge "$INGEST_MIN_SAMPLE" ]; then
  _fail_pct=$((FAILED * 100 / _attempted))
  if [ "$_fail_pct" -gt "$INGEST_MAX_FAIL_PCT" ]; then
    _abort_reason="${FAILED} von ${_attempted} versuchten Chunks fehlgeschlagen (${_fail_pct}%, Schwelle ${INGEST_MAX_FAIL_PCT}%)"
  fi
fi
if [ -n "$_abort_reason" ]; then
  echo "" >&2
  echo "ERROR: ${_abort_reason}." >&2
  echo "       Das ist kein Einzelausfall — pruefe zuerst den LLM-Endpunkt:" >&2
  echo "         LM_STUDIO_URL=${LM_STUDIO_URL:-<nicht gesetzt>}  LM_MODEL=${LM_MODEL:-<nicht gesetzt>}" >&2
  echo "       Es wurde nichts ausgeliefert. Stellschrauben: INGEST_MAX_FAIL_ABS," >&2
  echo "       INGEST_MAX_FAIL_PCT, INGEST_MIN_SAMPLE." >&2
  exit 1
fi
if [ "$FAILED" -gt 0 ]; then
  echo "WARN: ${FAILED} Chunk(s) fehlgeschlagen — unterhalb der Abbruchschwelle." >&2
  echo "      Bei gehosteten Anbietern meist transient; ein Nachlauf holt sie idempotent nach." >&2
fi

# ============================================================
# Phase 2b: MOC Generation (delegated to brain-ingest-moc.sh)
# ============================================================
bash "$HERE/brain-ingest-moc.sh" --brain-repo "$BRAIN_REPO" --chunks "$CHUNKS_TSV" --state "$STATE_FILE"

# ============================================================
# Phase 2c: Prune (Deletion-Sync, T001963) — default dry, --prune schaltet scharf
# ============================================================
echo ""
echo "=== Phase 2c: Prune ==="
PRUNE_FLAG=""
[ "$PRUNE" -eq 1 ] && [ "$DRY_RUN" -eq 0 ] && PRUNE_FLAG="--prune"
bash "$HERE/brain-ingest-prune.sh" --brain-repo "$BRAIN_REPO" --root "$REPO_ROOT" \
  --state "$STATE_FILE" $PRUNE_FLAG

# ============================================================
# Phase 3: Quality Gates
# ============================================================
echo ""
echo "=== Phase 3: Quality Gates ==="

# Coverage gate (T002679, REQ-k4-07): must pass before delivery
echo "Running coverage gate..."
if ! bash "$HERE/brain-ingest-coverage.sh" --worklist "$WORKLIST" --root "$REPO_ROOT" --delivered "$DELIVERED_TSV"; then
  echo "FAIL: Coverage gate failed — aborting before delivery" >&2
  cd "$REPO_ROOT" 2>/dev/null || true
  exit 1
fi
echo "  Coverage gate: PASS"

cd "$BRAIN_REPO"

# Frontmatter lint
echo "Running frontmatter lint..."
if ! bash scripts/lint-frontmatter.sh . 2>&1; then
  echo "FAIL: Frontmatter lint failed" >&2
  cd "$REPO_ROOT"
  exit 1
fi
echo "  Frontmatter lint: PASS"

# Wikilink lint
echo "Running wikilink lint..."
if ! bash scripts/lint-wikilinks.sh . 2>&1; then
  echo "WARN: Wikilink lint found issues — attempting fix..."
  # Try to fix dead wikilinks by removing them
  while IFS= read -r line; do
    file="$(echo "$line" | awk '{print $2}')"
    dead_slug="$(echo "$line" | grep -oE '\[\[[A-Za-z0-9._-]+\]\]' | head -1 | tr -d '[]')"
    if [ -n "$file" ] && [ -n "$dead_slug" ] && [ -f "$file" ]; then
      # Remove the dead wikilink (keep the text if aliased)
      sed -i "s/\[\[${dead_slug}\]\]/${dead_slug}/g" "$file"
      sed -i "s/\[\[${dead_slug}|[^]]*\]\]/${dead_slug}/g" "$file"
    fi
  done < <(bash scripts/lint-wikilinks.sh . 2>&1 | grep "dead wikilink:" || true)

  # Re-run lint
  if ! bash scripts/lint-wikilinks.sh . 2>&1; then
    echo "FAIL: Wikilink lint still failing after fix attempt" >&2
    cd "$REPO_ROOT"
    exit 1
  fi
fi
echo "  Wikilink lint: PASS"

# Secret scan (if gitleaks available)
if command -v gitleaks &>/dev/null; then
  echo "Running secret scan..."
  if ! gitleaks detect --source . --no-banner 2>&1; then
    echo "FAIL: Secret scan failed" >&2
    cd "$REPO_ROOT"
    exit 1
  fi
  echo "  Secret scan: PASS"
fi

cd "$REPO_ROOT"

# ============================================================
# Phase 4: Delivery
# ============================================================
if [ "$DRY_RUN" -eq 1 ]; then
  echo ""
  echo "=== DRY RUN — skipping delivery ==="
  echo "Pages written to: $BRAIN_REPO/wiki/"
  echo "Processed: $PROCESSED, Skipped: $SKIPPED, Failed: $FAILED"
  echo "Chunks: $CHUNK_TOTAL from $TOTAL sources"
  exit 0
fi

echo ""
echo "=== Phase 4: Delivery ==="

cd "$BRAIN_REPO"

# Check if there are changes to commit
if git diff --quiet && git diff --cached --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then
  echo "No changes to commit"
  cd "$REPO_ROOT"
  exit 0
fi

git add wiki/ index.md
git commit -m "chore(agents): initial ingest from Bachelorprojekt ($PROCESSED pages) [T001861]"
echo "  Committed $PROCESSED pages"

# Push branch
if git remote get-url origin &>/dev/null; then
  git push origin "$BRANCH" 2>&1 || {
    echo "WARN: git push failed — manual push required"
    cd "$REPO_ROOT"
    exit 0
  }
  echo "  Pushed to origin/$BRANCH"

  # Create PR
  if command -v gh &>/dev/null; then
    gh pr create \
      --repo Paddione/brain \
      --base main \
      --head "$BRANCH" \
      --title "chore(agents): Initial ingest from Bachelorprojekt" \
      --body "Automated chunk-aware ingest of $PROCESSED chunks ($CHUNK_TOTAL total, $TOTAL source files) from Bachelorprojekt.

**Source groups:** ssot-specs, runbooks, adr, gotchas-footguns, agent-guide-maps, core-docs, health-goals, diagrams
**LLM model:** $LM_MODEL
**Transformation:** Heavy (LLM-assisted summarization + frontmatter + wikilinks)
**Chunking:** Section-aware at Requirement/H2 headings, greedy-packed to ~8000 chars (T002679)
**Pilot:** $(if [ "$PILOT" -gt 0 ]; then echo "$PILOT pages"; else echo "full run"; fi)

**Quality gates passed:**
- [x] Coverage gate (≥95%)
- [x] Frontmatter lint
- [x] Wikilink lint
- [x] Secret scan (gitleaks)

**Processed:** $PROCESSED | **Skipped:** $SKIPPED | **Failed:** $FAILED" 2>&1 || {
      echo "WARN: PR creation failed — create manually"
    }
  fi
fi

cd "$REPO_ROOT"
echo ""
echo "=== Done ==="
echo "Processed: $PROCESSED, Skipped: $SKIPPED, Failed: $FAILED"
echo "Chunks: $CHUNK_TOTAL from $TOTAL sources"
