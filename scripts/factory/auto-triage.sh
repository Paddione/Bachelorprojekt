#!/usr/bin/env bash
# scripts/factory/auto-triage.sh — KI-Vorklassifizierung untriagierter Tickets [T000933]
#
# Für jede Brand prüft dieses Skript alle Tickets in status IN ('triage','backlog')
# mit triaged_at IS NULL. Pro Ticket wird DeepSeek (via route-provider) befragt;
# der validierte Vorschlag landet in grilling_meta.triage, triaged_at wird gesetzt.
# Kein Auto-Apply — der Mensch bestätigt im Planungsbüro.
#
# Usage: BRAND=<brand> bash scripts/factory/auto-triage.sh [--dry-run] [--help]
#
# Env:
#   BRAND               — mentolder|korczewski (required)
#   FACTORY_DRY_RESOLVE  — offline-test shortcut (exit 0)
#   TRIAGE_BATCH         — max tickets per run (default: 5)
#
# Rufer: wakeup.sh ruft dieses Skript nach auto-enqueue, vor dem Dispatcher-Tick.
set -euo pipefail
HERE="$(dirname "${BASH_SOURCE[0]}")"
source "$HERE/lib.sh"

DRY_RUN=false
TRIAGE_BATCH="${TRIAGE_BATCH:-5}"
ENUMS_FILE="$HERE/triage-enums.json"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --help)
      echo "Usage: BRAND=<brand> bash $(basename "${BASH_SOURCE[0]}") [--dry-run]"
      echo "  auto-triage: KI-klassifiziert untriagierte Tickets (backlog/triage)"
      exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "${BRAND:-}" ]]; then
  echo "ERROR: BRAND env var is required (mentolder|korczewski)" >&2
  exit 1
fi

if [[ -n "${FACTORY_DRY_RESOLVE:-}" ]]; then
  echo "auto-triage [DRY-RESOLVE]: ctx=dry ns=dry brand=${BRAND}"
  exit 0
fi

factory_resolve

# ── validate_triage: fail-closed validation of KI response ───────────────
validate_triage() {
  local json="$1"
  local enums; enums=$(cat "$ENUMS_FILE")

  # Must be valid JSON object
  if ! echo "$json" | jq empty 2>/dev/null; then
    echo "auto-triage: validate_triage: invalid JSON" >&2
    return 1
  fi

  # type must be valid
  local t; t=$(echo "$json" | jq -r '.type // ""')
  if [[ ! "$t" =~ ^(bug|feature|task|project)$ ]]; then
    echo "auto-triage: validate_triage: invalid type '${t}'" >&2
    return 1
  fi

  # severity must be valid
  local s; s=$(echo "$json" | jq -r '.severity // ""')
  if [[ ! "$s" =~ ^(critical|major|minor|trivial)$ ]]; then
    echo "auto-triage: validate_triage: invalid severity '${s}'" >&2
    return 1
  fi

  # priority must be in allowed values
  local p; p=$(echo "$json" | jq -r '.priority // ""')
  if [[ ! "$p" =~ ^(hoch|mittel|niedrig)$ ]]; then
    echo "auto-triage: validate_triage: invalid priority '${p}'" >&2
    return 1
  fi

  # areas must be subset of enums.areas
  local areas; areas=$(echo "$json" | jq -r '.areas // [] | join("\n")')
  local allowed_areas; allowed_areas=$(echo "$enums" | jq -r '.areas[]')
  while IFS= read -r area; do
    [[ -z "$area" ]] && continue
    if ! echo "$allowed_areas" | grep -qxF "$area"; then
      echo "auto-triage: validate_triage: unknown area '${area}'" >&2
      return 1
    fi
  done <<< "$areas"

  # component must be in enums.components or null
  local comp; comp=$(echo "$json" | jq -r '.component // ""')
  if [[ -n "$comp" && "$comp" != "null" ]]; then
    local allowed_comp; allowed_comp=$(echo "$enums" | jq -r '.components[]')
    if ! echo "$allowed_comp" | grep -qxF "$comp"; then
      echo "auto-triage: validate_triage: unknown component '${comp}'" >&2
      return 1
    fi
  fi

  # assignee_suggested must be in enums.assignees
  local assignee; assignee=$(echo "$json" | jq -r '.assignee_suggested // ""')
  if [[ -z "$assignee" || "$assignee" == "null" ]]; then
    echo "auto-triage: validate_triage: missing assignee_suggested" >&2
    return 1
  fi
  local allowed_assignees; allowed_assignees=$(echo "$enums" | jq -r '.assignees[]')
  if ! echo "$allowed_assignees" | grep -qxF "$assignee"; then
    echo "auto-triage: validate_triage: unknown assignee '${assignee}'" >&2
    return 1
  fi

  return 0
}

# ── call_llm: build prompt → route-provider → curl → response ──────────
call_llm() {
  local title="$1" description="$2" enums="$3"
  local system_prompt
  system_prompt=$(cat <<'PROMPT'
Du bist ein Ticket-Triage-Assistent. Klassifiziere das folgende Ticket und antworte AUSSCHLIESSLICH mit einem gültigen JSON-Objekt (kein Markdown, kein Codeblock, kein erklärender Text).

Das JSON MUSS dieses Schema haben:
{
  "type": "<bug|feature|task|project>",
  "priority": "<hoch|mittel|niedrig>",
  "severity": "<critical|major|minor|trivial>",
  "areas": ["<area1>", "<area2>"],
  "component": "<component> oder null",
  "assignee_suggested": "<assignee>",
  "rationale": "<kurze Begründung, 1-2 Sätze>"
}

Entscheidungsregeln:
- type: "bug" bei Fehlermeldungen/Defekten, "feature" bei neuen Funktionen/Wünschen, "task" bei technischen Arbeiten/Refactoring, "project" bei großen Epics mit mehreren Subtickets.
- priority: "hoch" wenn geschäftskritisch oder Sicherheit, "mittel" bei normaler Wichtigkeit, "niedrig" für nice-to-have.
- severity: "critical" bei Totalausfall, "major" bei stark eingeschränkter Nutzbarkeit, "minor" bei Workaround möglich, "trivial" bei kosmetischen Fehlern.
- areas: Wähle 1-3 passende Bereiche aus der erlaubten Liste.
- component: Wähle EINE passende Komponente oder null.
- assignee_suggested: Wähle EINEN Namen aus der erlaubten Liste.
- rationale: Kurze Begründung der Klassifikation in 1-2 deutschen Sätzen.
PROMPT
)

  local user_prompt="Ticket-Titel: ${title}"
  if [[ -n "$description" ]]; then
    user_prompt="${user_prompt}\n\nTicket-Beschreibung: ${description}"
  fi
  user_prompt="${user_prompt}\n\nErlaubte Werte:\n${enums}"

  # Get provider routing
  local route
  route=$(BRAND="$BRAND" bash "$HERE/route-provider.sh" triage flash 2>/dev/null) || {
    echo "auto-triage: route-provider failed" >&2
    return 1
  }
  local provider; provider=$(echo "$route" | jq -r '.provider // ""')
  local model; model=$(echo "$route" | jq -r '.modelId // ""')
  local base_url; base_url=$(echo "$route" | jq -r '.baseUrl // ""')

  if [[ -z "$provider" || -z "$model" ]]; then
    echo "auto-triage: route-provider returned empty provider/model" >&2
    return 1
  fi

  # Resolve API endpoint and key from route-provider output
  local api_url api_key
  api_url="${base_url}"
  if [[ -z "$api_url" ]]; then
    echo "auto-triage: route-provider returned empty baseUrl" >&2
    return 1
  fi
  # Append default path suffix if baseUrl has no path
  case "$api_url" in
    */v1/*|*/chat/completions|*/messages) ;;  # already has path
    *) api_url="${api_url%/}/v1/chat/completions" ;;
  esac
  case "$provider" in
    deepseek)  api_key="${DEEPSEEK_API_KEY:-}" ;;
    anthropic) api_key="${ANTHROPIC_API_KEY:-}" ;;
    openai)    api_key="${OPENAI_API_KEY:-}" ;;
    *)         api_key="" ;;
  esac

  local tmp_req tmp_resp
  tmp_req=$(mktemp) tmp_resp=$(mktemp)
  # cleanup at function exit
  trap "rm -f $tmp_req $tmp_resp 2>/dev/null" RETURN

  # Build request body. For Qwen3-family hybrid reasoners, force
  # enable_thinking=false (hard switch via chat_template_kwargs, not the
  # soft "/no_think" prompt convention) so the model doesn't burn max_tokens
  # on a <think> trace before ever emitting the JSON turn — the same failure
  # mode documented for factory_ask in scripts/factory/mcp-go/main.go.
  # response_format uses json_schema (not json_object) so llama.cpp/LM
  # Studio constrain decoding to the enum-valid schema at the sampler level,
  # instead of only validating after the fact in validate_triage().
  local schema
  schema=$(jq -n --argjson enums "$enums" '{
    name: "ticket_triage",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["type","priority","severity","areas","component","assignee_suggested","rationale"],
      properties: {
        type: { type: "string", enum: ["bug","feature","task","project"] },
        priority: { type: "string", enum: ["hoch","mittel","niedrig"] },
        severity: { type: "string", enum: ["critical","major","minor","trivial"] },
        areas: { type: "array", items: { type: "string", enum: $enums.areas }, minItems: 1, maxItems: 3 },
        component: { type: ["string","null"], enum: ($enums.components + [null]) },
        assignee_suggested: { type: "string", enum: $enums.assignees },
        rationale: { type: "string" }
      }
    }
  }')

  jq -n \
    --arg model "$model" \
    --arg sys "$system_prompt" \
    --arg user "$user_prompt" \
    --argjson schema "$schema" \
    --argjson thinking_off "$([[ "$model" == *qwen* ]] && echo true || echo false)" \
    '{
      model: $model,
      messages: [
        {role: "system", content: $sys},
        {role: "user", content: $user}
      ],
      temperature: 0.2,
      max_tokens: 512,
      response_format: {type: "json_schema", json_schema: $schema}
    }
    + (if $thinking_off then {chat_template_kwargs: {enable_thinking: false}} else {} end)' > "$tmp_req"

  local curl_args=(-s -S --max-time 60)
  if [[ -n "$api_key" ]]; then
    curl_args+=(-H "Authorization: Bearer ${api_key}")
  fi

  if ! curl "${curl_args[@]}" -H "Content-Type: application/json" -d "@$tmp_req" "$api_url" > "$tmp_resp" 2>/dev/null; then
    echo "auto-triage: curl to ${provider} failed" >&2
    return 1
  fi

  # Extract content from OpenAI-compatible response
  local content
  content=$(jq -r '.choices[0].message.content // empty' "$tmp_resp" 2>/dev/null)
  if [[ -z "$content" ]]; then
    echo "auto-triage: no content in ${provider} response" >&2
    return 1
  fi

  echo "$content"
  return 0
}

# ── Pull untriaged tickets ─────────────────────────────────────────────
UNTRIAGED_JSON=$(cat <<SQL | factory_psql 2>/dev/null || echo ""
SELECT COALESCE(json_agg(
  jsonb_build_object(
    'external_id', external_id,
    'title', title,
    'description', COALESCE(description, '')
  ) ORDER BY created_at ASC
), '[]')
FROM tickets.tickets
WHERE status IN ('triage','backlog')
  AND triaged_at IS NULL
  AND is_test_data = false
LIMIT ${TRIAGE_BATCH};
SQL
)

if [[ -z "$UNTRIAGED_JSON" || "$UNTRIAGED_JSON" == "[]" || "$UNTRIAGED_JSON" == "null" ]]; then
  echo "auto-triage: keine untriagierten Tickets für ${BRAND}" >&2
  exit 0
fi

COUNT=$(echo "$UNTRIAGED_JSON" | jq 'length')
echo "[auto-triage:${BRAND}] ${COUNT} untriagierte(s) Ticket(s) gefunden" >&2

# Load enums once
ENUMS_STR=$(jq -c '.' "$ENUMS_FILE")

# ── Process each ticket ────────────────────────────────────────────────
mapfile -t TICKETS < <(echo "$UNTRIAGED_JSON" | jq -c '.[]')

TRIAGED=0
SKIPPED=0

for ticket in "${TICKETS[@]}"; do
  ext_id=$(echo "$ticket" | jq -r '.external_id')
  title=$(echo "$ticket" | jq -r '.title')
  description=$(echo "$ticket" | jq -r '.description')

  [[ -z "$ext_id" ]] && continue

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[auto-triage:${BRAND}] DRY-RUN: würde ${ext_id} triagieren" >&2
    ((TRIAGED++)) || true
    continue
  fi

  echo "[auto-triage:${BRAND}] triagiere ${ext_id}…" >&2

  # Call LLM
  suggestion=""
  if ! suggestion=$(call_llm "$title" "$description" "$ENUMS_STR" 2>/dev/null); then
    echo "[auto-triage:${BRAND}] KI-Aufruf für ${ext_id} fehlgeschlagen — überspringe" >&2
    ((SKIPPED++)) || true
    continue
  fi

  # Validate
  if ! validate_triage "$suggestion"; then
    echo "[auto-triage:${BRAND}] Validierung für ${ext_id} fehlgeschlagen — überspringe" >&2
    ((SKIPPED++)) || true
    continue
  fi

  # Add metadata to suggestion
  model_used=$(BRAND="$BRAND" bash "$HERE/route-provider.sh" triage flash 2>/dev/null | jq -r '.modelId // "unknown"')
  timestamp=$(date -u +%FT%TZ)
  final_json=$(echo "$suggestion" | jq \
    --arg model "$model_used" \
    --arg at "$timestamp" \
    '{triage: (. + {model: $model, at: $at})}')

  # Idempotent write: only if triaged_at is still NULL
  updated=$(cat <<SQL | factory_psql -v ext_id="$ext_id" -v meta="$final_json" 2>/dev/null || echo "0"
UPDATE tickets.tickets
SET grilling_meta = COALESCE(grilling_meta, '{}'::jsonb) || :'meta'::jsonb,
    triaged_at = now()
WHERE external_id = :'ext_id'
  AND triaged_at IS NULL
RETURNING id;
SQL
  )

  if [[ -n "$updated" && "$updated" != "0" ]]; then
    echo "[auto-triage:${BRAND}] ${ext_id} triagiert" >&2
    ((TRIAGED++)) || true
  else
    echo "[auto-triage:${BRAND}] ${ext_id} bereits triagiert (Idempotenz-Skip)" >&2
    ((SKIPPED++)) || true
  fi
done

bash "$HERE/otel-emit.sh" metric factory.triage.count "${TRIAGED}" brand="${BRAND}" || true
echo "auto-triage:${BRAND} fertig (${TRIAGED} triagiert, ${SKIPPED} übersprungen, DRY_RUN=${DRY_RUN})" >&2
