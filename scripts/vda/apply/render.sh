#!/usr/bin/env bash
# scripts/vda/apply/render.sh — Render-Pipeline für personalisierte Dossier-PDFs (Phase 3, T900230)

set -euo pipefail

# scripts/vda/apply/ → three levels up = repo root
_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_REPO_ROOT="$(pwd)"

# Source helpers from Phase 1 + Phase 3
source "${_REPO_ROOT}/scripts/lib/application-pipeline-db.sh"
source "${_REPO_ROOT}/scripts/lib/application-pipeline-themes.sh"
source "${_REPO_ROOT}/scripts/lib/application-pipeline-evidence.sh"

JOB_ID=""
THEME_NAME="default"
OUTPUT_DIR=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --job-id)     JOB_ID="$2"; shift 2 ;;
    --theme)      THEME_NAME="$2"; shift 2 ;;
    --output-dir) OUTPUT_DIR="$2"; shift 2 ;;
    *) echo "Error: unknown option $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$JOB_ID" ]]; then
  echo "Error: --job-id is required" >&2
  exit 1
fi

if [[ -z "$OUTPUT_DIR" ]]; then
  OUTPUT_DIR="${_REPO_ROOT}/.output/dossiers/${JOB_ID}"
  mkdir -p "$OUTPUT_DIR"
fi

# Resolve theme (Task 2)
if ! app_pipeline_resolve_theme "$THEME_NAME" > /dev/null 2>&1; then
  echo "Error: unknown theme '${THEME_NAME}' — renderer cannot proceed without a valid theme." >&2
  app_pipeline_list_themes >&2
  exit 1
fi
THEME_PATH=$(app_pipeline_resolve_theme "$THEME_NAME")

# Resolve evidence (Task 1)
EVIDENCE_JSON=$(app_pipeline_select_evidence "" 2>/dev/null || echo "")

EVIDENCE_ITEMS=""
if [[ -n "$EVIDENCE_JSON" ]]; then
  while IFS= read -r line; do
    local_id=$(echo "$line" | grep -oP '"id":"\K[^"]*')
    local_summary=$(echo "$line" | grep -oP '"summary":"\K[^"]*' | sed 's/\\u0027/'"'"'/g')
    if [[ -n "$local_id" && -n "$local_summary" ]]; then
      [[ -n "$EVIDENCE_ITEMS" ]] && EVIDENCE_ITEMS+=$'\n'
      EVIDENCE_ITEMS+="${local_id}: ${local_summary}"
    fi
  done <<< "$EVIDENCE_JSON"
fi
[[ -z "$EVIDENCE_ITEMS" ]] && EVIDENCE_ITEMS="Evidenz: Fallback-Werte werden verwendet"

# Job metadata
COMPANY=$(app_pipeline_exec_sql "SELECT company FROM applications.jobs WHERE id = '$JOB_ID'::int;" 2>/dev/null || echo "Unbekannt")
ROLE_TITLE=$(app_pipeline_exec_sql "SELECT role_title FROM applications.jobs WHERE id = '$JOB_ID'::int;" 2>/dev/null || echo "Offene Position")
JOB_REQUIREMENTS=$(app_pipeline_exec_sql "SELECT requirements FROM applications.jobs WHERE id = '$JOB_ID'::int;" 2>/dev/null || echo "")

# Typst metadata JSON
METADATA_FILE="${OUTPUT_DIR}/.pdf-meta.json"
cat > "$METADATA_FILE" <<META_EOF
{
  "theme-file": "${THEME_NAME}",
  "candidate-name": "Max Mustermann",
  "candidate-role": "${ROLE_TITLE}",
  "candidate-contact": "max@beispiel.de  |  +49 123 456789  |  github.com/maxmustermann",
  "company": "${COMPANY}",
  "role": "${ROLE_TITLE}",
  "salutation": "Sehr geehrte Damen und Herren,",
  "closing": "Ich freue mich auf ein persönliches Gespräch und stehe Ihnen gerne zur Verfügung.",
  "motivation": "Mit Erfahrung in Kubernetes, CI/CD-Pipelines, DevOps-Architekturen und LLM-Infrastruktur.",
  "education": "Bachelor Informatik, TU Beispielstadt",
  "skills": "$(echo "$JOB_REQUIREMENTS" | head -c 200)",
  "evidence-items": "${EVIDENCE_ITEMS}"
}
META_EOF

# Render PDFs (guarded)
if command -v typst >/dev/null 2>&1; then
  echo "Typst found — compiling PDFs..."

  RESUME_PDF="${OUTPUT_DIR}/resume-${JOB_ID}.pdf"
  typst compile \
    --pdf-meta-file="$METADATA_FILE" \
    "${_REPO_ROOT}/templates/application-pipeline/resume.typ" \
    "$RESUME_PDF" 2>/dev/null || {
      echo "Warning: resume.typ compilation failed (non-fatal)" >&2
      RESUME_PDF=""
    }

  COVER_PDF="${OUTPUT_DIR}/cover-letter-${JOB_ID}.pdf"
  typst compile \
    --pdf-meta-file="$METADATA_FILE" \
    "${_REPO_ROOT}/templates/application-pipeline/cover-letter.typ" \
    "$COVER_PDF" 2>/dev/null || {
      echo "Warning: cover-letter.typ compilation failed (non-fatal)" >&2
      COVER_PDF=""
    }
else
  echo "typst binary not installed — skipping PDF compilation (T002820)"
  RESUME_PDF=""
  COVER_PDF=""
fi

# Register dossiers
if [[ -n "$RESUME_PDF" ]]; then
  app_pipeline_insert_dossier "$JOB_ID" "$RESUME_PDF" "resume" 2>/dev/null || true
  echo "Registered: resume → $RESUME_PDF"
fi
if [[ -n "$COVER_PDF" ]]; then
  app_pipeline_insert_dossier "$JOB_ID" "$COVER_PDF" "cover_letter" 2>/dev/null || true
  echo "Registered: cover_letter → $COVER_PDF"
fi

echo "Render complete for job ${JOB_ID}, theme=${THEME_NAME}, output=${OUTPUT_DIR}"
