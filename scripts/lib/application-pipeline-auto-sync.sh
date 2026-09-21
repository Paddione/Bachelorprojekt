#!/usr/bin/env bash
# scripts/lib/application-pipeline-auto-sync.sh
# Shared auto-sync functions for application pipeline (Phase 5, T900231).
#
# Provides:
#   app_pipeline_sync_json_file <json_path> [--dry-run]
#     Ingests job postings from a JSON file into applications.jobs.
#     Supports batch sync of multiple job postings.
#
#   app_pipeline_sync_directory <dir> [--file-pattern <pattern>] [--dry-run]
#     Scans a directory for job posting files and imports them.
#
#   app_pipeline_auto_match <job_id>
#     Computes and persists match score for a job (calls match.sh logic).
#
#   app_pipeline_auto_render <job_id> [--theme <name>]
#     Generates dossier PDFs for a job (calls render.sh logic).
#
# JSON file format (examples/job-postings.json):
#   {
#     "jobs": [
#       {
#         "company": "Acme Corp",
#         "role": "Senior DevOps Engineer",
#         "source_url": "https://acme.com/careers/...",
#         "requirements": "Kubernetes CI/CD Python Terraform",
#         "status": "found"
#       }
#     ]
#   }

_source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_repo_root="$(cd "${_source_dir}/../.." && pwd)"

# Source dependencies
source "${_repo_root}/scripts/lib/application-pipeline-db.sh"

# Alias: auto-sync uses app_pipeline_exec_sql (no underscore prefix)
app_pipeline_exec_sql() {
  _app_pipeline_exec_sql "$@"
}

# --- app_pipeline_sync_json_file ---
# Ingests job postings from a JSON file (one per line as JSON array).
# Returns 0 on success, 1 on error.
app_pipeline_sync_json_file() {
  local json_path="${1:-}"
  local dry_run="${2:-false}"

  if [[ -z "$json_path" ]]; then
    echo "Error: JSON path required" >&2
    return 1
  fi

  if [[ ! -f "$json_path" ]]; then
    echo "Error: file not found: $json_path" >&2
    return 1
  fi

  if ! command -v yq >/dev/null 2>&1; then
    echo "Error: yq not found in PATH" >&2
    return 1
  fi

  # Check top-level structure: { "jobs": [...] } or bare [ ... ]
  local top_type
  top_type="$(yq '. | type' "$json_path" | tr -d '"' | tr -d '\r')"
  local has_jobs_key=false
  if [[ "$(yq 'has("jobs")' "$json_path" | tr -d '"\r')" == "true" ]]; then
    has_jobs_key=true
  fi

  # yq returns '!!seq' for arrays, '!!map' for objects
  if [[ "$top_type" != "array" && "$top_type" != "!!seq" && "$has_jobs_key" != true ]]; then
    echo "Error: JSON must have 'jobs' key or be an array" >&2
    return 1
  fi

  local count=0
  local new=0
  local updated=0
  local duplicates=0

  # Determine which path to use
  local query="."
  if [[ "$has_jobs_key" == true ]]; then
    query=".jobs"
  fi

  local total
  total="$(yq "${query} | length" "$json_path")"

  for (( i=0; i<total; i++ )); do
    local company role source_url requirements status raw_text
    company="$(yq "${query}[$i].company // \"\"" "$json_path" | tr -d '"' | tr -d '\r')"
    role="$(yq "${query}[$i].role // ${query}[$i].role_title // \"\"" "$json_path" | tr -d '"' | tr -d '\r')"
    source_url="$(yq "${query}[$i].source_url // ${query}[$i].url // \"\"" "$json_path" | tr -d '"' | tr -d '\r')"
    requirements="$(yq "${query}[$i].requirements // ${query}[$i].description // \"\"" "$json_path" | tr -d '"' | tr -d '\r')"
    status="$(yq "${query}[$i].status // \"found\"" "$json_path" | tr -d '"' | tr -d '\r')"
    raw_text="$(yq "${query}[$i].raw_text // \"\"" "$json_path" | tr -d '"' | tr -d '\r')"

    # Trim whitespace
    company="$(echo "$company" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
    role="$(echo "$role" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"

    if [[ -z "$company" || -z "$role" ]]; then
      echo "Warning: skipping entry $i — missing company or role" >&2
      continue
    fi

    if [[ -z "$raw_text" ]]; then
      raw_text="Auto-sync: ${role} @ ${company}"
    fi

    if [[ "$dry_run" == "true" ]]; then
      echo "[DRY-RUN] Would sync: ${company} — ${role} (status=${status})"
      count=$((count + 1))
      new=$((new + 1))
      continue
    fi

    local result
    result="$(app_pipeline_upsert_job "$company" "$role" "$source_url" "$raw_text" "$requirements" "$status")"

    if [[ "$result" == "DUPLICATE" ]]; then
      echo "Duplicate: ${company}/${role} — checking if update needed"
      # Check if requirements changed
      local existing_req existing_status
      existing_req="$(app_pipeline_exec_sql "SELECT requirements FROM applications.jobs WHERE company = '${company}' AND role_title = '${role}';" 2>/dev/null || true)"
      existing_status="$(app_pipeline_exec_sql "SELECT status FROM applications.jobs WHERE company = '${company}' AND role_title = '${role}';" 2>/dev/null || true)"

      if [[ -n "$existing_req" && "$requirements" != "$existing_req" ]]; then
        app_pipeline_exec_sql "UPDATE applications.jobs SET requirements = :'req', updated_at = now() WHERE company = '${company}' AND role_title = '${role}';" -v req="$requirements" 2>/dev/null || true
        echo "Updated: ${company}/${role} — requirements changed"
        updated=$((updated + 1))
      else
        echo "Unchanged: ${company}/${role}"
        duplicates=$((duplicates + 1))
      fi
    else
      echo "Synced: ${company} — ${role} (job_id=${result})"
      new=$((new + 1))
    fi

    count=$((count + 1))
  done

  echo "Sync complete: ${count} entries processed, ${new} new, ${updated} updated, ${duplicates} unchanged."
}

# --- app_pipeline_sync_directory ---
# Scans a directory for job posting files and imports them.
# Supports .txt, .md, .json, .yml files.
app_pipeline_sync_directory() {
  local scan_dir="${1:-}"
  local file_pattern="${2:-}"
  local dry_run="${3:-false}"

  if [[ -z "$scan_dir" ]]; then
    echo "Error: directory path required" >&2
    return 1
  fi

  if [[ ! -d "$scan_dir" ]]; then
    echo "Error: directory not found: $scan_dir" >&2
    return 1
  fi

  local count=0
  local new=0
  local updated=0
  local duplicates=0

  local files
  if [[ -n "$file_pattern" ]]; then
    files="$(find "$scan_dir" -maxdepth 1 -type f -name "$file_pattern" 2>/dev/null | sort)"
  else
    files="$(find "$scan_dir" -maxdepth 1 -type f \( -iname '*.txt' -o -iname '*.md' -o -iname '*.json' -o -iname '*.yml' -o -iname '*.yaml' \) 2>/dev/null | sort)"
  fi

  while IFS= read -r file; do
    [[ -f "$file" ]] || continue
    local basename_file
    basename_file="$(basename "$file")"

    # Skip JSON files — handled by sync_json_file
    if [[ "$basename_file" == *.json ]]; then
      continue
    fi

    # Parse text/markdown files (reuse ingest logic)
    local raw_text company role source_url requirements status
    raw_text="$(cat "$file" 2>/dev/null || true)"

    if [[ -z "$raw_text" ]]; then
      echo "Warning: empty file: $basename_file" >&2
      continue
    fi

    # Try to extract company/role from first line
    local first_line
    first_line="$(echo "$raw_text" | head -n 1 | tr -d '\r')"

    company=""
    role=""

    # Pattern 1: "Role @ Company" or "Role - Company"
    if [[ "$first_line" =~ ^(.*)[[:space:]]+@[[:space:]]+(.*)$ ]]; then
      role="${BASH_REMATCH[1]}"
      company="${BASH_REMATCH[2]}"
    elif [[ "$first_line" =~ ^(.*)[[:space:]]+-[[:space:]]+(.*)$ ]]; then
      role="${BASH_REMATCH[1]}"
      company="${BASH_REMATCH[2]}"
    fi

    # Extract requirements line
    requirements="$(grep -iE '^(Requirements|Anforderungen|Skills):' "$file" 2>/dev/null | head -1 | sed -E 's/^(Requirements|Anforderungen|Skills):[[:space:]]*//' || true)"

    # Extract source URL
    source_url="$(grep -oE 'https?://[^[:space:]]+' "$file" 2>/dev/null | head -1 || true)"

    if [[ -z "$company" || -z "$role" ]]; then
      # Try filename: "Anschreiben_Company_Role.txt"
      local base_no_ext="${basename_file%.*}"
      if [[ "$base_no_ext" =~ ^.*_([^_]+)_([^.]+)$ ]]; then
        company="${BASH_REMATCH[1]}"
        role="${BASH_REMATCH[2]}"
      fi
    fi

    if [[ -z "$company" || -z "$role" ]]; then
      echo "Warning: could not determine company/role from $basename_file — skipping" >&2
      continue
    fi

    # Trim whitespace
    company="$(echo "$company" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
    role="$(echo "$role" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"

    status="found"

    if [[ "$dry_run" == "true" ]]; then
      echo "[DRY-RUN] Would sync: ${company} — ${role}"
      count=$((count + 1))
      new=$((new + 1))
      continue
    fi

    local result
    result="$(app_pipeline_upsert_job "$company" "$role" "$source_url" "$raw_text" "$requirements" "$status")"

    if [[ "$result" == "DUPLICATE" ]]; then
      local existing_req
      existing_req="$(app_pipeline_exec_sql "SELECT requirements FROM applications.jobs WHERE company = '${company}' AND role_title = '${role}';" 2>/dev/null || true)"
      if [[ -n "$existing_req" && "$requirements" != "$existing_req" ]]; then
        app_pipeline_exec_sql "UPDATE applications.jobs SET requirements = :'req', updated_at = now() WHERE company = '${company}' AND role_title = '${role}';" -v req="$requirements" 2>/dev/null || true
        echo "Updated: ${company}/${role} — requirements changed from file: $basename_file"
        updated=$((updated + 1))
      else
        echo "Unchanged: ${company}/${role} (file: $basename_file)"
        duplicates=$((duplicates + 1))
      fi
    else
      echo "Synced from file: ${company} — ${role} (job_id=${result}, file: $basename_file)"
      new=$((new + 1))
    fi

    count=$((count + 1))
  done <<< "$files"

  echo "Directory sync complete: ${count} files processed, ${new} new, ${updated} updated, ${duplicates} unchanged."
}

# --- app_pipeline_auto_match ---
# Computes match score for a job (same logic as match.sh).
app_pipeline_auto_match() {
  local job_id="${1:-}"

  if [[ -z "$job_id" ]]; then
    echo "Error: job_id required" >&2
    return 1
  fi

  # Load requirements
  local requirements
  requirements="$(app_pipeline_exec_sql "SELECT requirements FROM applications.jobs WHERE id = :'job_id'::int;" -v job_id="$job_id" 2>/dev/null | tr -d '[:space:]')"

  if [[ -z "$requirements" ]]; then
    echo "Error: job $job_id not found or has no requirements" >&2
    return 1
  fi

  # Source evidence library
  source "${_repo_root}/scripts/lib/application-pipeline-evidence.sh"

  # Run evidence selection
  local evidence_output
  evidence_output="$(app_pipeline_select_evidence "$requirements")"

  if [[ -z "$evidence_output" ]]; then
    app_pipeline_exec_sql "UPDATE applications.jobs SET match_score = 20, match_evidence_ids = ARRAY[]::TEXT[] WHERE id = :'job_id'::int;" -v job_id="$job_id" 2>/dev/null
    echo "Set match_score=20 (no evidence available)"
    return 0
  fi

  # Compute score
  local treffer_summe=0
  local evidence_ids=()

  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    local mc
    mc="$(echo "$line" | grep -o '"match_count":[0-9]*' | grep -o '[0-9]*$' || true)"
    mc="${mc:-0}"
    treffer_summe=$((treffer_summe + mc))

    local eid
    eid="$(echo "$line" | grep -o '"id":"[^"]*"' | sed 's/"id":"//;s/"$//' || true)"
    if [[ -n "$eid" ]]; then
      evidence_ids+=("$eid")
    fi
  done <<< "$evidence_output"

  local score
  if [[ $treffer_summe -eq 0 ]]; then
    score=20
  else
    score=$((treffer_summe * 20))
    [[ $score -gt 100 ]] && score=100
  fi

  # Build evidence_ids SQL array
  local sql_ids=""
  if [[ ${#evidence_ids[@]} -gt 0 ]]; then
    sql_ids="{"
    for i in "${!evidence_ids[@]}"; do
      [[ $i -gt 0 ]] && sql_ids+=","
      sql_ids+="${evidence_ids[$i]}"
    done
    sql_ids+="}"
  fi

  app_pipeline_exec_sql "UPDATE applications.jobs SET match_score = :'score', match_evidence_ids = :'evidence_ids'::text[] WHERE id = :'job_id'::int;" \
    -v score="$score" -v evidence_ids="$sql_ids" -v job_id="$job_id" 2>/dev/null

  echo "Auto-match complete for job $job_id: score=$score, hits=$treffer_summe"
}

# --- app_pipeline_auto_render ---
# Generates dossier PDFs for a job (same logic as render.sh).
app_pipeline_auto_render() {
  local job_id="${1:-}"
  local theme="${2:-default}"

  if [[ -z "$job_id" ]]; then
    echo "Error: job_id required" >&2
    return 1
  fi

  # Source render dependencies
  source "${_repo_root}/scripts/lib/application-pipeline-themes.sh"
  source "${_repo_root}/scripts/lib/application-pipeline-evidence.sh"

  # Validate theme
  local theme_path
  theme_path="$(app_pipeline_resolve_theme "$theme" 2>/dev/null)"
  if [[ $? -ne 0 || -z "$theme_path" ]]; then
    echo "Error: unknown theme '${theme}'" >&2
    return 1
  fi

  # Resolve evidence
  local COMPANY ROLE_TITLE JOB_REQUIREMENTS
  COMPANY="$(app_pipeline_exec_sql "SELECT company FROM applications.jobs WHERE id = '$job_id'::int;" 2>/dev/null || echo "Unbekannt")"
  ROLE_TITLE="$(app_pipeline_exec_sql "SELECT role_title FROM applications.jobs WHERE id = '$job_id'::int;" 2>/dev/null || echo "Offene Position")"
  JOB_REQUIREMENTS="$(app_pipeline_exec_sql "SELECT requirements FROM applications.jobs WHERE id = '$job_id'::int;" 2>/dev/null || echo "")"

  local evidence_output
  evidence_output="$(app_pipeline_select_evidence "$JOB_REQUIREMENTS" 2>/dev/null || true)"

  # Build evidence items text
  local evidence_items=""
  if [[ -n "$evidence_output" ]]; then
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      local eid esum
      eid="$(echo "$line" | grep -oP '"id":"\K[^"]*' || true)"
      esum="$(echo "$line" | grep -oP '"summary":"\K[^"]*' | sed 's/\\u0027/'"'"'/g' || true)"
      if [[ -n "$eid" && -n "$esum" ]]; then
        [[ -n "$evidence_items" ]] && evidence_items+=$'\n'
        evidence_items+="${eid}: ${esum}"
      fi
    done <<< "$evidence_output"
  fi
  [[ -z "$evidence_items" ]] && evidence_items="Evidenz: Fallback-Werte"

  # Create output directory
  local output_dir="${_repo_root}/.output/dossiers/${job_id}"
  mkdir -p "$output_dir"

  # Write metadata
  local meta_file="${output_dir}/.pdf-meta.json"
  cat > "$meta_file" <<META_EOF
{
  "theme-file": "${theme}",
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
  "evidence-items": "${evidence_items}"
}
META_EOF

  # Compile PDFs (guarded)
  if command -v typst >/dev/null 2>&1; then
    local resume_pdf="${output_dir}/resume-${job_id}.pdf"
    if typst compile --pdf-meta-file="$meta_file" "${_repo_root}/templates/application-pipeline/resume.typ" "$resume_pdf" 2>/dev/null; then
      app_pipeline_insert_dossier "$job_id" "$resume_pdf" "resume" 2>/dev/null || true
      echo "Generated: resume → ${resume_pdf}"
    else
      echo "Warning: resume.typ compilation failed" >&2
    fi

    local cover_pdf="${output_dir}/cover-letter-${job_id}.pdf"
    if typst compile --pdf-meta-file="$meta_file" "${_repo_root}/templates/application-pipeline/cover-letter.typ" "$cover_pdf" 2>/dev/null; then
      app_pipeline_insert_dossier "$job_id" "$cover_pdf" "cover_letter" 2>/dev/null || true
      echo "Generated: cover_letter → ${cover_pdf}"
    else
      echo "Warning: cover-letter.typ compilation failed" >&2
    fi
  else
    echo "typst not installed — metadata written to ${meta_file} (PDF compilation skipped)"
  fi

  echo "Auto-render complete for job $job_id (${COMPANY} — ${ROLE_TITLE})"
}

# --- app_pipeline_auto_sync_full ---
# Full auto-sync: ingest from JSON, auto-match, auto-render.
app_pipeline_auto_sync_full() {
  local json_path="${1:-}"
  local theme="${2:-default}"
  local run_match="${3:-true}"
  local run_render="${4:-true}"

  if [[ -z "$json_path" ]]; then
    echo "Error: JSON path required" >&2
    return 1
  fi

  echo "=== Auto-Sync Phase 1: Ingest ==="
  app_pipeline_sync_json_file "$json_path" || {
    echo "Error: ingestion failed" >&2
    return 1
  }

  if [[ "$run_match" == "true" ]]; then
    echo ""
    echo "=== Auto-Sync Phase 2: Match Scoring ==="
    # Re-scan all jobs (new and existing) to compute scores
    local job_ids
    job_ids="$(app_pipeline_exec_sql "SELECT id FROM applications.jobs;" 2>/dev/null || true)"
    if [[ -n "$job_ids" ]]; then
      while IFS= read -r jid; do
        [[ -z "$jid" ]] && continue
        app_pipeline_auto_match "$jid" 2>/dev/null || true
      done <<< "$job_ids"
    fi
  fi

  if [[ "$run_render" == "true" ]]; then
    echo ""
    echo "=== Auto-Sync Phase 3: Dossier Generation ==="
    local job_ids
    job_ids="$(app_pipeline_exec_sql "SELECT id FROM applications.jobs WHERE status IN ('drafting', 'applied');" 2>/dev/null || true)"
    if [[ -n "$job_ids" ]]; then
      while IFS= read -r jid; do
        [[ -z "$jid" ]] && continue
        app_pipeline_auto_render "$jid" "$theme" 2>/dev/null || true
      done <<< "$job_ids"
    else
      echo "No jobs in drafting/applied status — skipping render."
    fi
  fi

  echo ""
  echo "=== Auto-Sync Complete ==="
}
