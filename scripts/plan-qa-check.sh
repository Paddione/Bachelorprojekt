#!/usr/bin/env bash
set -euo pipefail

# === Config ===
MAX_ITERATIONS=2
MODEL="${PLAN_QA_MODEL:-gemma26-throughput}"
GATEWAY_BASE_URL="${GATEWAY_BASE_URL:-http://127.0.0.1:18235}"

# === Helpers ===
err() { echo "[plan-qa] ERROR: $*" >&2; }
warn() { echo "[plan-qa] WARNING: $*" >&2; }
info() { echo "[plan-qa] $*"; }

# Ergebniszeile: genau eine maschinenlesbare Zeile pro Lauf (T003112).
# SKIPPED und ERROR sind damit weder als PASS noch als inhaltliches FAIL lesbar.
result() { info "RESULT: $1${2:+ — $2}"; }

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
# Kriterium 5 wird [T003381] deterministisch vor dem Gateway-Kontakt geprueft
# (grep, identisch zu plan-lint STRUCT3) und ist deshalb NICHT mehr Teil der
# LLM-Kriterienliste — sie bleibt eine 5er-Liste (1,2,3,4,6). Das Wort
# "Kriterien" und das Kriterium-6-Beispiel bleiben fuer plan-qa-payload.bats (T002595).
SYSTEM_PROMPT=$(cat <<'EOF'
Du bist ein Quality-Assurance-Bot für Implementierungspläne in einem Softwareprojekt.
Du prüfst, ob der Plan die folgenden 5 Kriterien erfüllt.
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
5. Shell-Snippets im Plan sind frei von bekannten Syntax- und Argument-Fallen (z.B. jq --args darf nicht mit Input-Dateien als Positional-Arg kombiniert werden; stattdessen stdin-Umleitung `< file` nutzen).
EOF
)

# --- Kriterium 5 wird deterministisch geprueft (oben); die LLM-Kriterienliste
# ist eine 5er-Liste geworden. Der Prefix nennt die verbliebenen Kriterien.
USER_PROMPT_PREFIX="Prüfe den folgenden Implementierungsplan gegen die Kriterien und gib PASS/FAIL zurück:"

# === Deterministic Kriterium 5 pre-check [T003381] ===
# plan-lint STRUCT3 (scripts/plan-lint.sh Zeile 358) prueft die drei
# Abschluss-Kommandos per `grep -qE "task[[:space:]]+$cmd"`. Identische Eingabe
# darf nicht mehr plan-lint-PASS und plan-qa-FAIL ergeben — dieselbe grep-Regel
# wird hier VOR dem Gateway-Kontakt ausgefuehrt. Ein Plan, der STRUCT3 verfehlt,
# kann nicht QA-gruen sein: sofort FAIL, kein LLM-Aufruf.
MISSING_CMDS=""
for cmd in test:changed freshness:regenerate freshness:check; do
  if ! grep -qE "task[[:space:]]+$cmd" "$PLAN_FILE"; then
    MISSING_CMDS="${MISSING_CMDS:+$MISSING_CMDS, }$cmd"
  fi
done
if [[ -n "$MISSING_CMDS" ]]; then
  result FAIL "Kriterium 5 (deterministisch): fehlende Abschluss-Kommandos: ${MISSING_CMDS}"
  exit 1
fi


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
  result SKIPPED "Payload not buildable"
  exit 0
}

# === --emit-payload mode: print payload and exit (no gateway/network) ===
if [[ "$EMIT_PAYLOAD" -eq 1 ]]; then
  echo "$PAYLOAD"
  exit 0
fi

# === Gateway reachability ===
# /livez (liveness) misst "Prozess antwortet" — /health (readiness) meldet 503,
# sobald ein Prio-1-Backend fehlt. /livez ist das richtige Signal für Port-Belegung
# und Erreichbarkeit (gleiche Lehre wie T002336 in Taskfile.llm.yml).
# -f bleibt: "Prozess antwortet" vs. "niemand da" (T002595).
if ! curl -sf --max-time 3 -o /dev/null "${GATEWAY_BASE_URL}/livez"; then
  warn "Gateway ${GATEWAY_BASE_URL} not reachable — skipping QA (advisory)."
  info "Manual check: review the plan against .claude/skills/references/plan-quality-gates.md"
  result SKIPPED "Gateway not reachable"
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
    result SKIPPED "curl request failed"
    exit 0
  }

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | sed '$d')

  if [[ "$HTTP_CODE" != "200" ]]; then
    warn "Gateway returned HTTP ${HTTP_CODE}: $(echo "$BODY" | head -c 500) — skipping QA (advisory)."
    result SKIPPED "HTTP ${HTTP_CODE}"
    exit 0
  fi

  # Stufe 1: Modell-Content aus dem OpenAI-Envelope ziehen. Scheitert das, ist
  # der Gateway-Envelope unlesbar — eine Stoerung des Pruefwegs, kein Verdict.
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
    result ERROR "Gateway envelope unparseable"
    exit 0
  }

  # Stufe 2: verdict/missing/suggestions in EINEM Durchgang aus dem Content
  # extrahieren (T003112). Ein Modell, das seine JSON-Antwort in einen
  # Markdown-Fence legt oder ihr einen Satz voranstellt, darf den Parse nicht
  # brechen. Exit 42 = "nicht interpretierbar" (Parse gescheitert ODER verdict
  # fehlt) — wird NIEMALS still als FAIL verbucht.
  CONTENT_JSON=$(printf '%s' "$CONTENT" | python3 -c "
import sys, json, re

raw = sys.stdin.read()

def parse():
    # 1) Content als Ganzes
    try:
        return json.loads(raw)
    except Exception:
        pass

    # 2) Einen Markdown-Fence (optionaler Sprach-Tag json) entfernen
    m = re.search(r'\x60\x60\x60(?:json)?\s*(.*?)\s*\x60\x60\x60', raw, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1))
        except Exception:
            pass

    # 3) Erstes balanciertes {…}-Objekt isolieren
    start = raw.find('{')
    end = raw.rfind('}')
    if start != -1 and end > start:
        try:
            return json.loads(raw[start:end + 1])
        except Exception:
            pass

    return None

res = parse()
if res is not None and isinstance(res, dict) and 'verdict' in res:
    # JSON-Objekt (kein String) ausgeben; mehrzeilige suggestions/missing
    # bleiben durch die JSON-Kodierung unbeschadet erhalten.
    print(json.dumps(res))
else:
    sys.exit(42)
" 2>/dev/null) || {
    # Content nicht interpretierbar: sofort RESULT: ERROR, kein Append, keine
    # Folge-Iteration. Ein Auszug des tatsaechlichen Contents (einzeilig
    # normalisiert) macht den Ausfall untersuchbar.
    SNIPPET=$(printf '%s' "$CONTENT" | head -c 300 | tr '\n' ' ')
    result ERROR "Content not interpretable: ${SNIPPET}"
    exit 0
  }

  # Feld-Extraktion aus dem geparsten Objekt (kein eval auf Modell-Output).
  VERDICT=$(echo "$CONTENT_JSON" | jq -r '.verdict // ""')
  MISSING=$(echo "$CONTENT_JSON" | jq -r '.missing | if type == "array" then map("- " + .) | join("\n") else "" end')
  SUGGESTIONS=$(echo "$CONTENT_JSON" | jq -r '.suggestions // ""')

  if [[ "$VERDICT" == "PASS" ]]; then
    # [T003621] PASS-nach-Append-Pfad: nach einer Auto-Fix-Iteration haengt die
    # '## QA-Ergänzungen'-Sektion am Plan, obwohl die Folge-Iteration gruen ist.
    # Ein gruener Lauf muss das Artefakt byte-identisch zum Eingang zuruecklassen —
    # Backup zurueckspielen (die FAIL-Pfade tun das bereits). Der Trapperaeumt
    # die Backup-Datei anschliessend auf.
    cp "$BACKUP_FILE" "$PLAN_FILE"
    info "PASS — All quality criteria met."
    result PASS "Kriterium 5 deterministisch geprueft (Abschluss-Kommandos vorhanden)"
    rm -f "$BACKUP_FILE"
    exit 0
  fi

  info "FAIL — Missing criteria:"
  if [[ -n "$MISSING" ]]; then
    echo "$MISSING" | while IFS= read -r line; do info "  $line"; done
  else
    info "  (Modell hat keine Positionen genannt)"
  fi

  if [[ "$ITER" -lt "$MAX_ITERATIONS" ]]; then
    if [[ -z "$SUGGESTIONS" ]]; then
      # FAIL ohne Vorschlaege: nichts anzuhaengen, zweite Iteration ueberspringen.
      result FAIL "No suggestions provided by model"
      cp "$BACKUP_FILE" "$PLAN_FILE"
      exit 1
    fi
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
if [[ -n "$MISSING" ]]; then
  echo "$MISSING" | while IFS= read -r line; do info "  $line"; done
else
  info "  (Modell hat keine Positionen genannt)"
fi

result FAIL "QA failed after ${MAX_ITERATIONS} iterations"
cp "$BACKUP_FILE" "$PLAN_FILE"
exit 1
