#!/usr/bin/env bash
set -euo pipefail

# === Config ===
MAX_ITERATIONS=2
MODEL="${PLAN_QA_MODEL:-gemma26-factory}"
GATEWAY_BASE_URL="${GATEWAY_BASE_URL:-http://127.0.0.1:18235}"

# === Helpers ===
err() { echo "[plan-qa] ERROR: $*" >&2; }
warn() { echo "[plan-qa] WARNING: $*" >&2; }
info() { echo "[plan-qa] $*"; }

cleanup() {
  if [[ -n "${BACKUP_FILE:-}" && -f "$BACKUP_FILE" ]]; then
    rm -f "$BACKUP_FILE"
  fi
}
trap cleanup EXIT

# === Argument ===
PLAN_FILE="${1:-}"
EMIT_PAYLOAD=0
if [[ "${1:-}" == "--emit-payload" ]]; then
  EMIT_PAYLOAD=1
  PLAN_FILE="${2:-}"
fi

if [[ -z "$PLAN_FILE" ]]; then
  err "Usage: $0 [--emit-payload] <plan-file>"
  exit 1
fi

# Resolve relative path to absolute
if [[ "$PLAN_FILE" != /* ]]; then
  PLAN_FILE="$(cd "$(dirname "$0")/.." && pwd)/$PLAN_FILE"
fi

if [[ ! -f "$PLAN_FILE" ]]; then
  err "Plan file not found: $PLAN_FILE"
  exit 1
fi

# === Pre-checks ===
LINE_COUNT=$(wc -l < "$PLAN_FILE")
if [[ "$LINE_COUNT" -lt 10 ]]; then
  err "Plan too short (${LINE_COUNT} lines, minimum 10) for meaningful QA."
  exit 1
fi

if ! grep -q "^---" "$PLAN_FILE"; then
  err "Plan file has no YAML frontmatter (---...---). Cannot validate."
  exit 1
fi

# === Prompt ===
SYSTEM_PROMPT=$(cat <<'EOF'
Du bist ein Quality-Assurance-Bot für Implementierungspläne in einem Softwareprojekt.
Du prüfst, ob der Plan die folgenden 6 Kriterien erfüllt.
Antworte ausschließlich im folgenden JSON-Format (kein Präfix, kein Suffix, keine Markdown-Codeblöcke):

{
  "verdict": "PASS" oder "FAIL",
  "missing": ["Liste der Lücken"],
  "suggestions": "Vorschläge zur Behebung der Lücken in Markdown"
}

Kriterien:
1. Jeder Task benennt konkrete Dateipfade (keine vagen Formulierungen ohne Pfad).
2. Mindestens ein Task enthält einen konkreten Test-Schritt (BATS, Vitest, Playwright oder Verifikationskommando).
3. Keine offenen Platzhalter: TODO, TBD, FIXME, ???, <ausfüllen> oder ähnliche.
4. Pro geänderter Datei mit bekannter Zeilenzahl ein S1-Budget-Kommentar (Ist X - Baseline Y -> Budget Z) oder Markierung als neue Datei.
5. Der letzte Task enthält task test:changed, task freshness:regenerate und task freshness:check als Steps.
6. Shell-Snippets im Plan sind frei von bekannten Syntax- und Argument-Fallen (z.B. jq --args darf nicht mit Input-Dateien als Positional-Arg kombiniert werden; stattdessen stdin-Umleitung `< file` nutzen).
EOF
)

USER_PROMPT_PREFIX="Prüfe den folgenden Implementierungsplan gegen die 6 Kriterien und gib PASS/FAIL zurück:"

# === Build payload (offline, no network) ===
# Als Funktion, damit die Auto-Fix-Loop in Iteration 2+ den nach Append
# angereicherten Plan neu liest (Original-Semantik, siehe T002595).
build_payload() {
  local plan_content
  plan_content=$(cat "$PLAN_FILE")
  # Echte Newlines (nicht die Literale "\n"): bash expandiert \n in
  # Doppelquotes nicht, jq --arg würde die 2-Zeichen-Sequenz sonst 1:1
  # übernehmen. Die Trennzeile zwischen Prefix und Plan soll ankommen.
  local usr_content
  usr_content="$(printf '%s\n\n%s' "$USER_PROMPT_PREFIX" "$plan_content")"
  jq -n \
    --arg model "$MODEL" \
    --arg sys "$SYSTEM_PROMPT" \
    --arg usr "$usr_content" \
    --argjson et false \
    '{model: $model, max_tokens: 2048, enable_thinking: $et, chat_template_kwargs: {enable_thinking: $et}, messages: [{role: "system", content: $sys}, {role: "user", content: $usr}]}'
}

# Payload ungültig (z.B. jq nicht installiert) → deutliche stderr-Warnung,
# weiterhin exit 0 (advisory Charakter, siehe T002595 Task 4).
PAYLOAD=$(build_payload) || {
  err "Failed to build JSON payload — skipping QA (advisory)."
  exit 0
}

# === --emit-payload mode: print payload and exit (no gateway/network) ===
if [[ "$EMIT_PAYLOAD" -eq 1 ]]; then
  echo "$PAYLOAD"
  exit 0
fi

# === Gateway reachability ===
# -f: degraded (503) gilt als nicht erreichbar — sonst würde curl einen 503
# als Erfolg werten und erst der POST-Call fiele in den Skip-Pfad (T002595).
if ! curl -sf --max-time 3 -o /dev/null "${GATEWAY_BASE_URL}/health"; then
  warn "Gateway ${GATEWAY_BASE_URL} not reachable — skipping QA (advisory)."
  info "Manual check: review the plan against .claude/skills/references/plan-quality-gates.md"
  exit 0
fi

# === Backup ===
BACKUP_HASH=$(md5sum "$PLAN_FILE" | cut -d' ' -f1)
BACKUP_FILE="/tmp/plan-qa-backup-${BACKUP_HASH}.md"
cp "$PLAN_FILE" "$BACKUP_FILE"

# === Auto-Fix Loop ===
for ((ITER=1; ITER<=MAX_ITERATIONS; ITER++)); do
  info "QA iteration ${ITER}/${MAX_ITERATIONS}..."

  # Payload pro Iteration neu bauen: nach FAIL-Append enthält der Plan die
  # QA-Ergänzungen, die Iteration 2+ dem Modell mitgeben muss.
  PAYLOAD=$(build_payload)

  RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "${GATEWAY_BASE_URL}/v1/chat/completions" \
    -H "content-type: application/json" \
    --max-time 120 \
    -d "$PAYLOAD" 2>/dev/null) || {
    warn "curl request to gateway failed — skipping QA (advisory)."
    exit 0
  }

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | sed '$d')

  if [[ "$HTTP_CODE" != "200" ]]; then
    warn "Gateway returned HTTP ${HTTP_CODE}: $(echo "$BODY" | head -c 500) — skipping QA (advisory)."
    exit 0
  fi

  # Parse JSON response to extract content
  CONTENT=$(echo "$BODY" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    content = data['choices'][0]['message']['content']
    print(content)
except Exception as e:
    print(f'PARSE_ERROR: {e}', file=sys.stderr)
    sys.exit(1)
" 2>/dev/null) || {
    warn "Failed to parse gateway response — skipping QA (advisory)."
    exit 0
  }

  # Extract verdict from JSON in content
  VERDICT=$(echo "$CONTENT" | python3 -c "
import sys, json
try:
    data = json.loads(sys.stdin.read())
    print(data.get('verdict', 'FAIL'))
except Exception:
    print('FAIL')
" 2>/dev/null) || VERDICT="FAIL"

  MISSING=$(echo "$CONTENT" | python3 -c "
import sys, json
try:
    data = json.loads(sys.stdin.read())
    items = data.get('missing', [])
    for item in items:
        print(f'- {item}')
except Exception:
    print('- Could not parse missing items')
" 2>/dev/null)

  SUGGESTIONS=$(echo "$CONTENT" | python3 -c "
import sys, json
try:
    data = json.loads(sys.stdin.read())
    print(data.get('suggestions', ''))
except Exception:
    print('')
" 2>/dev/null)

  if [[ "$VERDICT" == "PASS" ]]; then
    info "PASS — All quality criteria met."
    rm -f "$BACKUP_FILE"
    exit 0
  fi

  info "FAIL — Missing criteria:"
  echo "$MISSING" | while IFS= read -r line; do info "  $line"; done

  if [[ "$ITER" -lt "$MAX_ITERATIONS" ]]; then
    info "Auto-fix attempt ${ITER}/${MAX_ITERATIONS}: appending suggestions..."
    {
      echo ""
      echo "## QA-Ergänzungen (Iteration ${ITER}/${MAX_ITERATIONS})"
      echo ""
      echo "$SUGGESTIONS"
    } >> "$PLAN_FILE"

    if ! grep -q "^---" "$PLAN_FILE"; then
      err "Frontmatter lost after auto-fix iteration ${ITER}! Restoring backup."
      cp "$BACKUP_FILE" "$PLAN_FILE"
      exit 1
    fi
  fi
done

# === FAIL after max iterations ===
info "FAIL — QA failed after ${MAX_ITERATIONS} iterations. Remaining gaps:"
echo "$MISSING" | while IFS= read -r line; do info "  $line"; done

cp "$BACKUP_FILE" "$PLAN_FILE"
exit 1
