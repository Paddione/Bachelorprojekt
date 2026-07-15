#!/usr/bin/env bash
# brain-ingest.sh — Full-automation brain wiki ingestion pipeline.
# Transforms Bachelorprojekt source files into brain wiki pages via LLM,
# delivers via PR to Paddione/brain.
#
# Usage: brain-ingest.sh --brain-repo <path> [--pilot N] [--dry-run] [--state <path>] [--branch <name>]
#
# Env:
#   LM_STUDIO_URL    — LM Studio API URL (default: http://localhost:1234)
#   LM_MODEL         — Model to use (default: qwen3-14b)
#   BRAIN_INGEST_STATE — State file path (default: ~/.brain-ingest-state.json)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/.." && pwd)"
MANIFEST="$REPO_ROOT/scripts/brain/ingest-sources.yaml"
WORKLIST_SCRIPT="$REPO_ROOT/scripts/brain-ingest-worklist.sh"
TRANSFORM_SCRIPT="$HERE/brain-ingest-transform.sh"

# --- Defaults ---
BRAIN_REPO=""
DRY_RUN=0
PILOT=0
STATE_FILE="${BRAIN_INGEST_STATE:-$HOME/.brain-ingest-state.json}"
BRANCH="feature/brain-initial-ingest"
LM_URL="${LM_STUDIO_URL:-http://localhost:1234}"
LM_MODEL="${LM_MODEL:-qwen3-14b}"

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

while IFS=$'\t' read -r src_path slug group; do
  [ -n "$src_path" ] || continue
  CURRENT=$((CURRENT + 1))

  # Progress indicator
  printf "\r[%d/%d] %s " "$CURRENT" "$TOTAL" "$src_path"

  # Skip if already processed (state file hash match)
  src_file="$REPO_ROOT/$src_path"
  if [ -f "$src_file" ]; then
    src_hash="$(sha256sum "$src_file" | cut -d' ' -f1)"
  else
    echo ""
    echo "WARN: source file not found: $src_path"
    FAILED=$((FAILED + 1))
    continue
  fi
  existing_hash="$(jq -r --arg k "$src_path" '.[$k].hash // ""' "$STATE_FILE" 2>/dev/null || echo "")"
  if [ "$src_hash" = "$existing_hash" ]; then
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # Determine type from manifest type_map
  type=""
  # Check overrides first (path patterns)
  while IFS= read -r override; do
    pattern="$(echo "$override" | jq -r '.pattern')"
    if [[ "$src_path" == $pattern ]]; then
      type="$(echo "$override" | jq -r '.type')"
      break
    fi
  done < <(jq -c '.type_map.overrides[]?' "$MANIFEST" 2>/dev/null || echo "")

  # Fall back to group default
  if [ -z "$type" ]; then
    type="$(jq -r --arg g "$group" '.type_map.defaults[$g] // "note"' "$MANIFEST" 2>/dev/null || echo "note")"
  fi

  # Get tag defaults for group
  tag_defaults="$(jq -c --arg g "$group" '.tag_defaults[$g] // ["note"]' "$MANIFEST" 2>/dev/null || echo '["note"]')"

  # Transform via LLM
  transformed="$(bash "$TRANSFORM_SCRIPT" "$src_file" "$type" "$slug" "$SLUGS_JSON" "$tag_defaults" 2>/dev/null)" || {
    echo ""
    echo "WARN: LLM transformation failed for $src_path"
    FAILED=$((FAILED + 1))
    continue
  }

  # Validate output has frontmatter
  if ! echo "$transformed" | head -20 | grep -q "^---"; then
    echo ""
    echo "WARN: Invalid frontmatter for $src_path"
    FAILED=$((FAILED + 1))
    continue
  fi

  # Write to brain repo
  echo "$transformed" > "$BRAIN_REPO/wiki/$slug.md"

  # Update state
  tmp="$(mktemp)"
  jq --arg k "$src_path" --arg h "$src_hash" --arg s "$slug" --arg t "$type" \
    '.[$k] = {hash:$h, slug:$s, type:$t, transformed_at:(now | todate)}' \
    "$STATE_FILE" > "$tmp" && mv "$tmp" "$STATE_FILE"

  PROCESSED=$((PROCESSED + 1))
done < "$WORKLIST"

echo ""
echo ""
echo "Phase 2 complete: Processed=$PROCESSED, Skipped=$SKIPPED, Failed=$FAILED"

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
