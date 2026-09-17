#!/usr/bin/env bash
# scripts/lib/application-pipeline-evidence.sh
# Shared evidence-catalog functions for application pipeline dossier rendering (T900230).
#
# Provides:
#   app_pipeline_select_evidence <requirements_text>
#     Selects the most relevant evidence entries from the curated catalog
#     for a given job posting's requirements text.
#
# Returns one JSON object per line to stdout:
#   {"id":"...","label":"...","summary":"...","match_count":N}
#
# Usage:
#   source scripts/lib/application-pipeline-evidence.sh
#   app_pipeline_select_evidence "Kubernetes CI/CD testing"

_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_repo_root="$(cd "${_script_dir}/../.." && pwd)"
_evidence_catalog="${_repo_root}/scripts/vda/apply/evidence-catalog.yaml"

# app_pipeline_select_evidence <requirements_text>
# Selects evidence entries relevant to the given requirements text.
# Returns entries as JSON lines, sorted by match count descending.
# Falls back to default entries (default: true) when no keyword matches found.
app_pipeline_select_evidence() {
  local requirements_text="${1:-}"

  if [[ ! -f "$_evidence_catalog" ]]; then
    echo "Error: evidence catalog not found at $_evidence_catalog" >&2
    return 1
  fi

  if ! command -v yq >/dev/null 2>&1; then
    echo "Error: yq not found in PATH" >&2
    return 1
  fi

  # Normalise requirements text to lowercase for case-insensitive matching
  local lower_text
  lower_text="$(echo "$requirements_text" | tr '[:upper:]' '[:lower:]')"

  local total_entries
  total_entries=$(yq '.catalog | length' "$_evidence_catalog")

  local results=""
  local has_matches=false

  for (( i=0; i<total_entries; i++ )); do
    local id label summary default_flag
    id=$(yq ".catalog[$i].id" "$_evidence_catalog")
    label=$(yq ".catalog[$i].label" "$_evidence_catalog")
    summary=$(yq ".catalog[$i].summary" "$_evidence_catalog")
    default_flag=$(yq ".catalog[$i].default // false" "$_evidence_catalog")

    # Count how many keywords of this entry match the requirements text
    local kw_count score=0
    kw_count=$(yq ".catalog[$i].keywords | length" "$_evidence_catalog")

    for (( k=0; k<kw_count; k++ )); do
      local kw
      kw=$(yq ".catalog[$i].keywords[$k]" "$_evidence_catalog" | tr -d '"' | tr '[:upper:]' '[:lower:]')
      if echo "$lower_text" | grep -qio "$kw"; then
        score=$((score + 1))
      fi
    done

    if [[ $score -gt 0 ]]; then
      results+="{\"id\":\"$id\",\"label\":\"$label\",\"summary\":\"$summary\",\"match_count\":$score}"$'\n'
      has_matches=true
    elif [[ "$default_flag" == "true" ]]; then
      results+="{\"id\":\"$id\",\"label\":\"$label\",\"summary\":\"$summary\",\"match_count\":0}"$'\n'
    fi
  done

  if [[ "$has_matches" != true ]]; then
    # No matches at all — fall back to default entries only
    results=""
    for (( i=0; i<total_entries; i++ )); do
      local default_flag
      default_flag=$(yq ".catalog[$i].default // false" "$_evidence_catalog")
      if [[ "$default_flag" == "true" ]]; then
        local id label summary
        id=$(yq ".catalog[$i].id" "$_evidence_catalog")
        label=$(yq ".catalog[$i].label" "$_evidence_catalog")
        summary=$(yq ".catalog[$i].summary" "$_evidence_catalog")
        results+="{\"id\":\"$id\",\"label\":\"$label\",\"summary\":\"$summary\",\"match_count\":0}"$'\n'
      fi
    done
  fi

  if [[ -z "$results" ]]; then
    # Ultimate fallback: return all entries
    for (( i=0; i<total_entries; i++ )); do
      local id label summary
      id=$(yq ".catalog[$i].id" "$_evidence_catalog")
      label=$(yq ".catalog[$i].label" "$_evidence_catalog")
      summary=$(yq ".catalog[$i].summary" "$_evidence_catalog")
      results+="{\"id\":\"$id\",\"label\":\"$label\",\"summary\":\"$summary\",\"match_count\":0}"$'\n'
    done
  fi

  # Sort by match_count descending, limit to 5 entries
  echo "$results" | grep -v '^$' | sort -t'"' -k8 -rn | head -5
}
