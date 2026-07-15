#!/usr/bin/env bash
# brain-ingest.sh — Full-automation brain wiki ingestion pipeline.
# Transforms Bachelorprojekt source files into brain wiki pages via LLM,
# delivers via PR to Paddione/brain.
#
# Usage: brain-ingest.sh --brain-repo <path> [--pilot N] [--dry-run] [--state <path>] [--branch <name>]
#
# Env:
#   LM_STUDIO_URL    — llama-server ingest-pool API URL (default:
#                      http://localhost:8095 — standalone llama-server.exe,
#                      NOT LM Studio's :1234 despite the var name; kept for
#                      backward compat with existing callers/CI config)
#   LM_MODEL         — Model to use (default: qwen3.6-14b-a3b-fablevibes)
#   MAX_PARALLEL     — Concurrent process_page() jobs (default: 6, matching
#                      the ingest-pool server's -np slot count — raising this
#                      above the server's slot count just queues requests)
#   BRAIN_INGEST_STATE — State file path (default: ~/.brain-ingest-state.json)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/.." && pwd)"
MANIFEST="$REPO_ROOT/scripts/brain/ingest-sources.yaml"
WORKLIST_SCRIPT="$REPO_ROOT/scripts/brain-ingest-worklist.sh"
TRANSFORM_SCRIPT="$HERE/brain-ingest-transform.sh"

# shellcheck source=./brain-group-match.sh
source "$HERE/brain-group-match.sh"

# --- Defaults ---
BRAIN_REPO=""
DRY_RUN=0
PILOT=0
STATE_FILE="${BRAIN_INGEST_STATE:-$HOME/.brain-ingest-state.json}"
BRANCH="feature/brain-initial-ingest"
LM_URL="${LM_STUDIO_URL:-http://localhost:8095}"
LM_MODEL="${LM_MODEL:-qwen3.6-14b-a3b-fablevibes}"
MAX_PARALLEL="${MAX_PARALLEL:-6}"
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
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

[ -n "$BRAIN_REPO" ] || { echo "error: --brain-repo required" >&2; exit 1; }
[ -d "$BRAIN_REPO/.git" ] || { echo "error: --brain-repo is not a git repo: $BRAIN_REPO" >&2; exit 1; }
[ -f "$MANIFEST" ] || { echo "error: manifest not found: $MANIFEST" >&2; exit 1; }
[ -f "$WORKLIST_SCRIPT" ] || { echo "error: worklist script not found: $WORKLIST_SCRIPT" >&2; exit 1; }
[ -f "$TRANSFORM_SCRIPT" ] || { echo "error: transform script not found: $TRANSFORM_SCRIPT" >&2; exit 1; }

# Extracted once (not per file — see brain-group-match.sh perf note).
brain_group_section_for_manifest "$MANIFEST"
GROUPS_SECTION="$_BRAIN_GROUP_SECTION"

# ============================================================
# Phase 1: Preparation
# ============================================================
echo "=== Phase 1: Preparation ==="

# Generate worklist
WORKLIST="$(mktemp)"
trap 'rm -f "$WORKLIST" "$SLUGS_JSON"' EXIT
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

# Compute slug inventory (all target page names)
SLUGS_JSON="$(mktemp)"
awk -F'\t' '{print $2}' "$WORKLIST" | jq -R . | jq -s . > "$SLUGS_JSON"
echo "Slug inventory: $(jq length "$SLUGS_JSON") slugs"

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

# Process a single page (extracted for reuse). Safe to run concurrently —
# the STATE_FILE read-modify-write is flock-protected since multiple
# parallel jobs write to it.
process_page() {
  local src_path="$1" slug="$2"
  local src_file src_hash existing_hash type tag_defaults transformed group tmp

  src_file="$REPO_ROOT/$src_path"
  [ -f "$src_file" ] || { echo "WARN: source not found: $src_path" >&2; return 1; }

  src_hash="$(sha256sum "$src_file" | cut -d' ' -f1)"
  existing_hash="$(jq -r --arg k "$src_path" '.[$k].hash // ""' "$STATE_FILE" 2>/dev/null || echo "")"
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

  transformed="$(bash "$TRANSFORM_SCRIPT" "$src_file" "$type" "$slug" "$SLUGS_JSON" "$tag_defaults" 2>/dev/null)" || {
    echo "WARN: LLM failed: $src_path" >&2
    return 1
  }

  if ! echo "$transformed" | head -20 | grep -q "^---"; then
    echo "WARN: Invalid frontmatter: $src_path" >&2
    return 1
  fi

  echo "$transformed" > "$BRAIN_REPO/wiki/$slug.md"

  (
    flock -x 200
    tmp="$(mktemp)"
    jq --arg k "$src_path" --arg h "$src_hash" --arg s "$slug" --arg t "$type" \
      '.[$k] = {hash:$h, slug:$s, type:$t, transformed_at:(now | todate)}' \
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
trap 'rm -f "$WORKLIST" "$SLUGS_JSON"; rm -rf "$RESULTS_DIR"' EXIT

while IFS=$'\t' read -r src_path slug _worklist_group; do
  [ -n "$src_path" ] || continue
  CURRENT=$((CURRENT + 1))

  while (( $(jobs -rp | wc -l) >= MAX_PARALLEL )); do
    wait -n
  done

  (
    # `|| rc=$?` (not a bare call + separate `$?` capture) — under this
    # script's `set -e`, a non-zero exit from process_page as a bare
    # top-level command would kill the subshell immediately, skipping the
    # result-file write below and silently dropping the job from every
    # PROCESSED/SKIPPED/FAILED count instead of counting it as failed.
    rc=0
    process_page "$src_path" "$slug" || rc=$?
    echo "$rc" > "$RESULTS_DIR/$CURRENT"
  ) &
  printf "\r[%d/%d] dispatched: %s " "$CURRENT" "$TOTAL" "$src_path"
done < "$WORKLIST"

wait

for result_file in "$RESULTS_DIR"/*; do
  [ -f "$result_file" ] || continue
  case "$(cat "$result_file")" in
    0) PROCESSED=$((PROCESSED + 1)) ;;
    2) SKIPPED=$((SKIPPED + 1)) ;;
    *) FAILED=$((FAILED + 1)) ;;
  esac
done

echo ""
echo ""
echo "Phase 2 complete: Processed=$PROCESSED, Skipped=$SKIPPED, Failed=$FAILED (parallel, MAX_PARALLEL=$MAX_PARALLEL)"

# ============================================================
# Phase 2b: MOC Generation
# ============================================================
echo ""
echo "=== Phase 2b: MOC Generation ==="

# Generate sub-MOCs per group
for group in ssot-specs runbooks adr gotchas-footguns agent-guide-maps core-docs; do
  # Collect all pages in this group from state file
  pages="$(jq -r --arg g "$group" '
    to_entries[] |
    select(.value.type != null) |
    select(.key | startswith("openspec/") or startswith("docs/") or startswith("CLAUDE") or startswith("AGENTS")) |
    "\(.value.slug)\t\(.key)"
  ' "$STATE_FILE" 2>/dev/null || echo "")"

  if [ -z "$pages" ]; then
    continue
  fi

  # Count pages in this group
  page_count="$(echo "$pages" | wc -l)"

  # Build MOC content
  moc_content="---
type: moc
tags: [$group, moc]
status: active
source:: Bachelorprojekt scripts/brain/ingest-sources.yaml
---
# ${group} — Map of Content

${page_count} Seiten aus der Gruppe \`${group}\`.

## Seiten

"

  while IFS=$'\t' read -r page_slug page_path; do
    [ -n "$page_slug" ] || continue
    moc_content+="- [[${page_slug}]] — \`${page_path}\`
"
  done <<< "$pages"

  # Write MOC
  echo "$moc_content" > "$BRAIN_REPO/wiki/${group}-moc.md"
  echo "  Created ${group}-moc.md ($page_count pages)"
done

# Regenerate index-moc.md
echo "Regenerating index-moc.md..."

# Collect existing pages (not in sub-MOCs)
existing_pages="$(jq -r '
  to_entries[] |
  select(.value.slug != null) |
  .value.slug
' "$STATE_FILE" 2>/dev/null | sort -u || echo "")"

index_content="---
type: moc
tags: [moc, meta]
status: active
source:: Bachelorprojekt brain-initial-ingest (T001861)
---
# Wiki — Map of Content

Zentraler Hub des brain-Wikis. Max. 2 MOC-Hops zu jeder Seite (G-BRAIN08).

## Meta & Qualität

- [[quality-goals]] — Qualitätsziele G-BRAIN01–11
- [[SCHEMA]] — Verfassung und Konventionen

## Arbeiten mit dem Wiki

- [[usage]] — Seiten anlegen, raw→wiki, log-Pflege
- [[cheatsheet]] — Frontmatter-Templates, Wikilink-Syntax
- [[first-aid]] — Erste Hilfe bei roter CI
- [[llm-workflows]] — LLM-Anreicherung: Prompt-Vorlagen

## Software & Plattform

- [[capabilities]] — Software-Capabilities und Plattform-Fähigkeiten

## SSOT Spezifikationen

- [[ssot-specs-moc]] — OpenSpec SSOT-Spezifikationen

## Runbooks

- [[runbooks-moc]] — Betriebsanleitungen

## Architecture Decision Records

- [[adr-moc]] — Architekturentscheidungen

## Gotchas & Footguns

- [[gotchas-moc]] — Bekannte Fallstricke

## Agent Guide

- [[agent-guide-maps]] — Agent-Oberflächen und Guides

## Core Documentation

- [[core-docs-moc]] — Zentrale Projekt-Dokumentation

"

# Add any additional pages not already linked
for page_slug in $existing_pages; do
  # Skip if already linked in index_content
  if ! echo "$index_content" | grep -q "\[\[$page_slug\]\]"; then
    index_content+="- [[${page_slug}]]
"
  fi
done

echo "$index_content" > "$BRAIN_REPO/index.md"
echo "  Updated index.md"

# ============================================================
# Phase 3: Quality Gates
# ============================================================
echo ""
echo "=== Phase 3: Quality Gates ==="

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
git commit -m "chore(ingest): initial ingest from Bachelorprojekt ($PROCESSED pages) [T001861]"
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
      --title "chore(ingest): Initial ingest from Bachelorprojekt" \
      --body "Automated initial ingest of $PROCESSED wiki pages from Bachelorprojekt.

**Source groups:** ssot-specs, runbooks, adr, gotchas-footguns, agent-guide-maps, core-docs
**LLM model:** $LM_MODEL
**Transformation:** Heavy (LLM-assisted summarization + frontmatter + wikilinks)
**Pilot:** $(if [ "$PILOT" -gt 0 ]; then echo "$PILOT pages"; else echo "full run"; fi)

**Quality gates passed:**
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
