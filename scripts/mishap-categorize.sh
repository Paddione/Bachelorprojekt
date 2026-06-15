#!/usr/bin/env bash
# scripts/mishap-categorize.sh — Mishap Auto-Kategorisierung via Keyword-Matching + DeepSeek-Fallback
# Usage: mishap-categorize.sh <external_id> <title> <description>
# Exit-Code immer 0 (best-effort) — Fehler auf stderr.

set -euo pipefail

CTX="${TICKET_CTX:-fleet}"
NS="${TICKET_NS:-workspace}"
DB="website"
USER="website"

_db_update() {
  local ext_id="$1" category="$2"
  local pod
  pod=$(kubectl get pod -n "$NS" --context "$CTX" -l 'app in (shared-db, shared-db-dev)' -o name 2>/dev/null | head -1) || true
  if [[ -z "$pod" ]]; then
    echo "mishap-categorize: ERROR no shared-db pod found in namespace $NS (context $CTX)" >&2
    return
  fi
  kubectl exec -i "$pod" -n "$NS" --context "$CTX" -c postgres -- \
    psql -U "$USER" -d "$DB" -qtA -v ON_ERROR_STOP=1 \
    -v ext_id="$ext_id" \
    -v cat="$category" <<'SQL' 2>/dev/null || true
UPDATE tickets.tickets SET category = :'cat' WHERE external_id = :'ext_id';
SQL
  echo "mishap-categorize: category='${category}' set for ${ext_id}" >&2
}

if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <external_id> <title> <description>" >&2
  exit 0
fi

ext_id="$1"
title="$2"
desc="$3"
category="Sonstige"

if [[ -z "${title}${desc}" ]]; then
  echo "mishap-categorize: empty title+description → Sonstige" >&2
  _db_update "$ext_id" "$category"
  exit 0
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
keywords_file="$script_dir/mishap-keywords.json"

if [[ ! -f "$keywords_file" ]]; then
  echo "mishap-categorize: WARN keywords file not found → Sonstige" >&2
  _db_update "$ext_id" "$category"
  exit 0
fi

combined="${title} ${desc}"
best_category=""
best_count=0

while IFS= read -r cat; do
  count=0
  while IFS= read -r kw; do
    if grep -Fqi "$kw" <<< "$combined" 2>/dev/null; then
      count=$((count + 1))
    fi
  done < <(jq -r ".[\"$cat\"][]" "$keywords_file")
  if [[ "$count" -gt "$best_count" ]]; then
    best_count="$count"
    best_category="$cat"
  fi
done < <(jq -r 'keys[]' "$keywords_file")

if [[ "$best_count" -gt 0 ]]; then
  category="$best_category"
  echo "mishap-categorize: keyword match → ${category} (${best_count} Treffer)" >&2
  _db_update "$ext_id" "$category"
  exit 0
fi

if [[ -n "${DEEPSEEK_API_KEY:-}" ]]; then
  base_url="${DEEPSEEK_BASE_URL:-https://api.deepseek.com/v1}"
  prompt="Classify this mishap into exactly one category: CI-Konflikt, Gate-Fehler, API-Fehler, Scout-Qualität, Deploy-Fehler, Spec-Lücke, Test-Lücke, Sonstige. Reply with only the category name, no punctuation, no explanation.

Title: ${title}
Description: ${desc}"

  llm_response=$(curl -s --max-time 10 "${base_url}/chat/completions" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${DEEPSEEK_API_KEY}" \
    -d "$(jq -n --arg prompt "$prompt" '{
      model: "deepseek-chat",
      messages: [{role: "user", content: $prompt}],
      temperature: 0,
      max_tokens: 20
    }')" 2>/dev/null | jq -r '.choices[0].message.content // empty' 2>/dev/null || true)

  if [[ -n "$llm_response" ]]; then
    llm_response="$(echo "$llm_response" | tr -d '[:punct:]' | xargs)"
    valid=('CI-Konflikt' 'Gate-Fehler' 'API-Fehler' 'Scout-Qualität' 'Deploy-Fehler' 'Spec-Lücke' 'Test-Lücke' 'Sonstige')
    for vc in "${valid[@]}"; do
      if [[ "${llm_response,,}" == "${vc,,}" ]]; then
        category="$vc"
        echo "mishap-categorize: DeepSeek → ${category}" >&2
        break
      fi
    done
    if [[ "$category" == "Sonstige" ]]; then
      echo "mishap-categorize: DeepSeek returned unknown '${llm_response}' → Sonstige" >&2
    fi
  else
    echo "mishap-categorize: DeepSeek unavailable → Sonstige" >&2
  fi
else
  echo "mishap-categorize: DEEPSEEK_API_KEY not set → Sonstige" >&2
fi

_db_update "$ext_id" "$category"
