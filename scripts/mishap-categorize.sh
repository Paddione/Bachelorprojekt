#!/usr/bin/env bash
# scripts/mishap-categorize.sh — Mishap Auto-Kategorisierung via Keyword-Matching + DeepSeek-Fallback
# Usage: mishap-categorize.sh <external_id> <title> <description>
# Exit-Code immer 0 (best-effort) — Fehler auf stderr.

set -euo pipefail

# Retiriert 2026-10-14: kein Ticket-Backend mehr (tickets.*-Schema dropped auf
# fleet + devmesh). Die Kategorie wird nur noch gemeldet (stderr) — Persistenz
# gibt es keine; die DB-Zugangsdaten (CTX/NS) entfielen mit.
_db_update() {
  local ext_id="$1" category="$2"
  echo "mishap-categorize: category='${category}' computed for ${ext_id} (no ticket backend — not persisted)" >&2
}

_fetch_existing_categories() {
  # Keine DB mehr: direkt die statische Enum-Liste liefern.
  _build_enum_fallback
}

_build_enum_fallback() {
  printf '%s\n' 'CI-Konflikt' 'Gate-Fehler' 'API-Fehler' 'Scout-Qualität' 'Deploy-Fehler' 'Spec-Lücke' 'Test-Lücke' 'Sonstige'
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

# Fetch existing categories from DB for context grounding
existing_categories=$(_fetch_existing_categories 2>/dev/null || true)
if [[ -z "$existing_categories" ]]; then
  existing_categories=$(_build_enum_fallback)
  echo "mishap-categorize: using enum fallback for existing categories" >&2
fi

if [[ -n "${DEEPSEEK_API_KEY:-}" ]]; then
  base_url="${DEEPSEEK_BASE_URL:-https://api.deepseek.com/v1}"
  prompt="You are categorizing a mishap report. Below are existing categories already in use. Choose exactly ONE from this list — do NOT invent new category names.

[EXISTING_CATEGORIES]
$(echo "$existing_categories" | while read -r c; do echo "- $c"; done)

Classify this mishap into exactly one of the EXISTING_CATEGORIES above. If none fits perfectly, pick the closest match. Reply with only the category name, no punctuation, no explanation.

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
    valid=()
    while IFS= read -r vc; do
      [[ -n "$vc" ]] && valid+=("$vc")
    done <<< "$existing_categories"
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
