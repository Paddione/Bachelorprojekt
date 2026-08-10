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
source "$HERE/triage-body.sh"

# [T003492] Umgebung respektieren statt unbedingt zu ueberschreiben. Vorher stand
# hier `DRY_RUN=false`, weshalb `DRY_RUN=true bash auto-triage.sh` real schrieb und
# am Ende trotzdem "DRY_RUN=false" meldete. Der Factory-Pfad ist davon nicht
# betroffen: wakeup.sh haelt zwar eine eigene DRY_RUN-Variable (Default true),
# exportiert sie aber nicht und ruft dieses Skript nur mit BRAND= auf.
DRY_RUN="${DRY_RUN:-false}"
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

# ── normalize_triage_type: deprecated Alias → Conventional Commit ────────
#
# [T003492] Ein Provider ohne json_schema-Unterstuetzung (Cloud-Fallback) kann
# weiterhin bug/feature/task liefern. Die werden angenommen und hier auf das
# aktuelle Vokabular abgebildet, statt das Ticket zu verwerfen — ticket-mcp
# fuehrt die alten Werte als deprecated, nicht als ungueltig.
normalize_triage_type() {
  local t="$1"
  jq -rn --slurpfile e "$ENUMS_FILE" --arg t "$t" \
    '($e[0].type_aliases // {})[$t] // $t'
}

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
  #
  # [T003492] Die erlaubten Werte kommen aus triage-enums.json, nicht mehr aus
  # einem hier eingebauten Regex. Der lautete `^(bug|feature|task|project)$` und
  # widersprach dem JSON-Schema weiter unten, das beim Sampling Conventional-
  # Commit-Vokabular erzwingt. Die Schnittmenge war genau `project`, weshalb die
  # Triage jedes Nicht-Epic verwarf — sichtbar als "invalid type 'fix'" fuer
  # jedes Ticket. Ein zweiter Ort fuer dieselbe Liste ist die Ursache, nicht der
  # falsche Inhalt des Regex; deshalb gibt es jetzt nur noch die Enum-Datei.
  local t; t=$(echo "$json" | jq -r '.type // ""')
  if ! echo "$enums" | jq -e --arg t "$t" \
       '((.types // []) + ((.type_aliases // {}) | keys)) | index($t)' >/dev/null; then
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

# ── Slot-Freigabe [T002281] ────────────────────────────────────────────
# route-provider.sh claimt atomar (active_agents + 1) und liefert slotId. Dieses
# Skript las slotId frueher nicht einmal aus - und da es pro Ticket einmal claimt,
# stand deepseek nach drei Laeufen auf active_agents=3 = max_concurrent und wurde
# von der Kandidaten-Kette still uebersprungen, ohne jede Fehlermeldung.
#
# WARUM EIN WRAPPER UND KEIN 'trap RETURN': _call_llm_inner hat fuenf Ruecksprung-
# pfade (route-provider failed, leere Felder, leere baseUrl, curl failed, kein
# content, Erfolg). Ein Release an jedem einzelnen waere genau die Stelle, an der
# der naechste Patch einen vergisst. Der Wrapper faengt alle ab.
#
# WARUM KEIN 'trap EXIT' WIE IN scout-llm-fallback.sh: jenes Skript claimt EINMAL
# pro Lauf, hier wird pro Ticket geclaimt. Ein EXIT-Trap gaebe nur den letzten Slot
# frei und liesse alle vorherigen stehen.
CURRENT_ROUTE_JSON=""
# Modell des letzten erfolgreichen Routings — ueberlebt release_current_slot bewusst,
# weil die Triage-Metadaten es NACH der Slot-Freigabe brauchen [T002359].
LAST_MODEL_USED=""

release_current_slot() {
  [[ -z "$CURRENT_ROUTE_JSON" ]] && return 0
  local slot ctx
  slot="$(printf '%s' "$CURRENT_ROUTE_JSON" | jq -r '.slotId // empty' 2>/dev/null)"
  ctx="$(printf '%s' "$CURRENT_ROUTE_JSON" | jq -r '.ctx // 0' 2>/dev/null)"
  CURRENT_ROUTE_JSON=""   # vor dem Aufruf leeren: macht die Funktion idempotent
  [[ -z "$slot" || "$slot" == "null" ]] && return 0
  # ctx mitgeben, sonst bleibt reserved_tokens stehen (release-slot.sh Zeile 5).
  bash "$HERE/release-slot.sh" "$slot" true "${ctx:-0}" >/dev/null 2>&1 || true
}
# Netz fuer Abbrueche mitten im Lauf (Ctrl-C, Timeout, set -e).
trap release_current_slot EXIT

call_llm() {
  local rc=0
  _call_llm_inner "$@" || rc=$?
  release_current_slot
  return $rc
}

# ── find_similar_tickets: retrieve top-N similar tickets (fail-soft) ─────
REPO_ROOT="${REPO_ROOT:-$(cd "$HERE/../.." && pwd)}"
find_similar_tickets() {
  local title="$1" description="$2" limit="${3:-5}"
  if ! command -v npx >/dev/null 2>&1; then
    return 0
  fi
  if [[ ! -f "$REPO_ROOT/website/scripts/find-similar-tickets.mjs" ]]; then
    return 0
  fi
  local raw
  raw="$(cd "$REPO_ROOT/website" \
    && timeout 15 npx tsx scripts/find-similar-tickets.mjs "$title $description" "$limit" \
       2>/dev/null)" || return 0
  [[ -z "$raw" ]] && return 0
  printf '%s' "$raw"
}

# ── _call_llm_inner: build prompt → route-provider → curl → response ────
_call_llm_inner() {
  local title="$1" description="$2" enums="$3"
  local system_prompt
  system_prompt=$(cat <<'PROMPT'
Du bist ein Ticket-Triage-Assistent. Klassifiziere das folgende Ticket und antworte AUSSCHLIESSLICH mit einem gültigen JSON-Objekt (kein Markdown, kein Codeblock, kein erklärender Text).

Das JSON MUSS dieses Schema haben:
{
  "type": "<fix|feat|chore|project|docs|refactor|perf|test|ci|build>",
  "priority": "<hoch|mittel|niedrig>",
  "severity": "<critical|major|minor|trivial>",
  "areas": ["<area1>", "<area2>"],
  "component": "<component> oder null",
  "assignee_suggested": "<assignee>",
  "rationale": "<kurze Begründung, 1-2 Sätze>"
}

Entscheidungsregeln:
- type: Conventional-Commit-Vokabular. "fix" bei Fehlermeldungen/Defekten, "feat" bei neuen Funktionen/Wünschen, "chore" bei technischen Arbeiten ohne Verhaltensänderung, "refactor" bei Umbauten mit gleichem Verhalten, "docs" bei reiner Dokumentation, "perf" bei Performance-Arbeit, "test" bei reiner Testarbeit, "ci" bei Build-/Pipeline-Konfiguration, "build" bei Abhängigkeiten/Bundling, "project" bei großen Epics mit mehreren Subtickets.
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

  # STUFE 1: Append similar tickets as grounding context (fail-soft)
  local similar_json
  similar_json="$(find_similar_tickets "$title" "$description" 5 2>/dev/null)" || similar_json=""
  if [[ -n "$similar_json" && "$similar_json" != "[]" && "$similar_json" != "null" ]]; then
    local similar_block
    similar_block="$(printf '%s' "$similar_json" | jq -r '
      if type == "array" then
        [.[] | select(.external_id != null) |
         "  - \(.external_id): \(.title // "?") (type=\(.type // "?"), areas=\(.areas // [] | join(",")))"]
        | join("\n")
      else empty end
    ' 2>/dev/null)" || similar_block=""
    if [[ -n "$similar_block" ]]; then
      user_prompt="${user_prompt}\n\nÄhnliche Vorgänge (zur Orientierung — kopiere deren Klassifikation nur, wenn das neue Ticket inhaltlich übereinstimmt):\n${similar_block}"
    fi
  fi

  # Get provider routing
  local route
  route=$(BRAND="$BRAND" bash "$HERE/route-provider.sh" triage flash 2>/dev/null) || {
    echo "auto-triage: route-provider failed" >&2
    return 1
  }
  # Ab hier haelt dieser Aufruf einen Slot — der Wrapper call_llm gibt ihn auf
  # jedem Ruecksprungpfad wieder frei [T002281].
  CURRENT_ROUTE_JSON="$route"
  local provider; provider=$(echo "$route" | jq -r '.provider // ""')
  local model; model=$(echo "$route" | jq -r '.modelId // ""')
  # Fuer die Triage-Metadaten weiter unten festhalten, WELCHES Modell wirklich
  # geantwortet hat. Frueher wurde dafuer route-provider.sh ein zweites Mal
  # aufgerufen — das claimte pro Ticket einen weiteren Slot, den niemand freigab
  # (der Wrapper deckt nur _call_llm_inner ab), und lieferte nach einem Fallback
  # ausserdem den falschen Namen. Genau der Leak aus RC3, nur an anderer Stelle.
  LAST_MODEL_USED="$model"
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
  # Welche Env-Variable den Key traegt, entscheidet die DB-Zeile — nicht dieses Skript
  # [T002359]. Vorher stand hier eine Fallunterscheidung ueber den Provider-Namen, die
  # fuer deepseek DEEPSEEK_API_KEY las: den Coaching-Key, nicht den Factory-Key
  # (Account pk-deepseek, DEEPSEEK_API_KEY_PK). Ein Provider-Name kann nicht zwischen
  # zwei Accounts desselben Anbieters unterscheiden — die Routing-Zeile kann es.
  # Der Name wird vor der indirekten Expansion gegen die Env-Variablen-Syntax geprueft:
  # bash wertet in ${!v} einen Array-Subscript arithmetisch aus, ein api_key_env der Form
  # x[$(...)] wuerde also den Inhalt der DB-Spalte ausfuehren. Der Guard laesst nur
  # gewoehnliche Variablennamen durch.
  local key_env
  key_env=$(echo "$route" | jq -r '.apiKeyEnv // ""')
  if [[ -n "$key_env" ]] && ! [[ "$key_env" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    echo "auto-triage: apiKeyEnv '$key_env' ist kein gueltiger Variablenname — ignoriert." >&2
    key_env=""
  fi
  if [[ -n "$key_env" ]]; then
    api_key="${!key_env:-}"
    if [[ -z "$api_key" ]]; then
      echo "auto-triage: $key_env ist nicht gesetzt — Provider $provider ohne Key." >&2
    fi
  else
    api_key=""
  fi

  local tmp_req tmp_resp
  tmp_req=$(mktemp) tmp_resp=$(mktemp)
  # cleanup at function exit
  trap "rm -f $tmp_req $tmp_resp 2>/dev/null" RETURN

  # Das json_schema (nicht json_object) laesst llama.cpp/LM Studio schon beim
  # Sampling auf die enum-gueltigen Werte constrainen, statt erst hinterher in
  # validate_triage() zu pruefen.
  #
  # Der Body selbst wird von _build_triage_body (triage-body.sh) gebaut. Dort
  # sitzt auch das enable_thinking-Gate: es haengt seit T002501 an der baseUrl,
  # nicht mehr am Modellnamen. Der fruehere Test [[ $model == *qwen* ]] traf
  # Gemma 4 nicht — seit dem Factory-Cutover ist Gemma aber genau das Modell,
  # das hier antwortet, und es verbrennt max_tokens im reasoning_content,
  # bevor content beginnt (gemessen: 512 Tokens reichen dann nicht).
  local schema
  schema=$(jq -n --argjson enums "$enums" '{
    name: "ticket_triage",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["type","priority","severity","areas","component","assignee_suggested","rationale"],
      properties: {
        type: { type: "string", enum: $enums.types },
        priority: { type: "string", enum: ["hoch","mittel","niedrig"] },
        severity: { type: "string", enum: ["critical","major","minor","trivial"] },
        areas: { type: "array", items: { type: "string", enum: $enums.areas }, minItems: 1, maxItems: 3 },
        component: { type: ["string","null"], enum: ($enums.components + [null]) },
        assignee_suggested: { type: "string", enum: $enums.assignees },
        rationale: { type: "string" }
      }
    }
  }')

  _build_triage_body "$model" "$base_url" "$system_prompt" "$user_prompt" "$schema" > "$tmp_req"

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

  # Strip Markdown code fences in case the LLM wraps its JSON despite the prompt.
  # Removes leading ```json / ``` and trailing ``` lines.
  content=$(printf '%s' "$content" | sed -e '1s/^```[a-zA-Z]*[[:space:]]*//' -e '1s/^```//' -e '$s/[[:space:]]*```[[:space:]]*$//')
  # Trim surrounding whitespace/newlines.
  content=$(printf '%s' "$content" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')

  echo "$content"
  return 0
}

# [T003492] Testbarkeits-Ausstieg: mit AUTO_TRIAGE_LIB_ONLY=1 endet das Skript
# hier, nachdem alle Funktionen definiert sind, aber bevor die Datenbank
# angefasst wird. Damit laesst sich validate_triage in BATS direkt aufrufen und
# an Exit-Code und stderr messen, statt den Quelltext zu greppen
# (Test-Resultats-Konvention T002448-M4). Alles oberhalb ist offline: lib.sh und
# triage-body.sh definieren nur Funktionen, factory_resolve setzt bloss
# Variablen. Kein `exit` verwenden — beim source wuerde das die aufrufende Shell
# beenden.
if [[ -n "${AUTO_TRIAGE_LIB_ONLY:-}" ]]; then
  return 0 2>/dev/null || exit 0
fi

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
  #
  # [T003492] KEIN `2>/dev/null` mehr. call_llm schreibt die eigentliche Diagnose
  # auf stderr ("no content in llamacpp response", "curl to … failed", "route-provider
  # returned empty baseUrl"); das Verwerfen liess wochenlang nur die nichtssagende
  # Sammelmeldung unten im Journal stehen. Der auslösende Defekt — eine baseUrl mit
  # doppeltem /v1, die in einen HTTP 404 lief — war dadurch von aussen nicht von
  # einem Modellfehler zu unterscheiden.
  suggestion=""
  if ! suggestion=$(call_llm "$title" "$description" "$ENUMS_STR"); then
    echo "[auto-triage:${BRAND}] KI-Aufruf für ${ext_id} fehlgeschlagen — überspringe (Grund siehe stderr-Zeile darüber)" >&2
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
  #
  # [T003492] Der type wird vor dem Schreiben auf das aktuelle Vokabular
  # normalisiert, damit ein Provider ohne json_schema-Unterstuetzung keine
  # deprecated Werte in die Tabelle traegt.
  model_used="${LAST_MODEL_USED:-unknown}"
  timestamp=$(date -u +%FT%TZ)
  normalized_type=$(normalize_triage_type "$(echo "$suggestion" | jq -r '.type')")
  final_json=$(echo "$suggestion" | jq \
    --arg model "$model_used" \
    --arg at "$timestamp" \
    --arg type "$normalized_type" \
    '{triage: (. + {type: $type, model: $model, at: $at})}')

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
