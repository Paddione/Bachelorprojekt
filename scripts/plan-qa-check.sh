#!/usr/bin/env bash
set -euo pipefail

# === Config ===
MAX_ITERATIONS=2
DEEPSEEK_DEFAULT_BASE_URL="https://api.deepseek.com/anthropic"

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
if [[ -z "$PLAN_FILE" ]]; then
  err "Usage: $0 <plan-file>"
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

# === API Key ===
API_KEY="${DEEPSEEK_API_KEY:-${ANTHROPIC_API_KEY:-}}"
BASE_URL="${DEEPSEEK_BASE_URL:-$DEEPSEEK_DEFAULT_BASE_URL}"

if [[ -z "$API_KEY" ]]; then
  warn "No DEEPSEEK_API_KEY or ANTHROPIC_API_KEY set — skipping DeepSeek QA (advisory)."
  info "Manual check: review the plan against .claude/skills/references/plan-quality-gates.md"
  exit 0
fi

# === Prompt ===
SYSTEM_PROMPT="Du bist ein Quality-Assurance-Bot für Implementierungspläne in einem Softwareprojekt. \
Du prüfst, ob der Plan die folgenden 6 Kriterien erfüllt. \
Antworte ausschließlich im folgenden JSON-Format (kein Präfix, kein Suffix, keine Markdown-Codeblöcke):

{
  \"verdict\": \"PASS\" oder \"FAIL\",
  \"missing\": [\"Liste der Lücken\"],
  \"suggestions\": \"Vorschläge zur Behebung der Lücken in Markdown\"
}

Kriterien:
1. Jeder Task benennt konkrete Dateipfade (keine vagen Formulierungen ohne Pfad).
2. Mindestens ein Task enthält einen konkreten Test-Schritt (BATS, Vitest, Playwright oder Verifikationskommando).
3. Keine offenen Platzhalter: TODO, TBD, FIXME, ???, <ausfüllen> oder ähnliche.
4. Pro geänderter Datei mit bekannter Zeilenzahl ein S1-Budget-Kommentar (Ist X - Baseline Y -> Budget Z) oder Markierung als neue Datei.
5. Der letzte Task enthält task test:changed, task freshness:regenerate und task freshness:check als Steps.
6. Shell-Snippets im Plan sind frei von bekannten Syntax- und Argument-Fallen (z.B. jq --args darf nicht mit Input-Dateien als Positional-Arg kombiniert werden; stattdessen stdin-Umleitung `< file` nutzen)."

USER_PROMPT_PREFIX="Prüfe den folgenden Implementierungsplan gegen die 6 Kriterien und gib PASS/FAIL zurück:"

# === Backup ===
BACKUP_HASH=$(md5sum "$PLAN_FILE" | cut -d' ' -f1)
BACKUP_FILE="/tmp/plan-qa-backup-${BACKUP_HASH}.md"
cp "$PLAN_FILE" "$BACKUP_FILE"

# === Auto-Fix Loop ===
for ((ITER=1; ITER<=MAX_ITERATIONS; ITER++)); do
  PLAN_CONTENT=$(cat "$PLAN_FILE")

  info "QA iteration ${ITER}/${MAX_ITERATIONS}..."

  RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "${BASE_URL}/v1/messages" \
    -H "x-api-key: ${API_KEY}" \
    -H "anthropic-version: 2023-06-01" \
    -H "content-type: application/json" \
    -d "$(cat <<EOF
{
  "model": "deepseek-chat",
  "max_tokens": 2048,
  "messages": [
    {"role": "system", "content": ${SYSTEM_PROMPT@Q}},
    {"role": "user", "content": "${USER_PROMPT_PREFIX}\n\n${PLAN_CONTENT}"}
  ]
}
EOF
  )" 2>/dev/null || { err "curl request failed"; exit 1; })

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | sed '$d')

  if [[ "$HTTP_CODE" != "200" ]]; then
    err "DeepSeek API returned HTTP ${HTTP_CODE}: $(echo "$BODY" | head -c 500)"
    exit 1
  fi

  # Parse JSON response to extract content
  CONTENT=$(echo "$BODY" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    content = data['content'][0]['text']
    print(content)
except Exception as e:
    print(f'PARSE_ERROR: {e}', file=sys.stderr)
    sys.exit(1)
" 2>/dev/null) || {
    err "Failed to parse DeepSeek response"
    exit 1
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
