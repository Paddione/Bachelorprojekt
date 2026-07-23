#!/usr/bin/env bash
# health-goals-llm-fill.sh — LLM-gestützter Fill für deterministisch nicht abgedeckte Ziele.
#
# Ermittelt Kandidaten (Ziel-IDs aus goals-data.generated.json minus IDs im Mess-Wertefile),
# dispatht pro Kandidat einen Call an den Unified-LLM-Gateway (T002102) und erwartet
# strukturiertes JSON {id,value,unit,confidence,evidence,reproducible_cmd_suggestion}.
#
# Default: report-only. --apply schreibt Prio-C-"Aktuell"-Zellen mit (LLM)-Provenance-Marker.
# confidence < 0.7 → immer report-only, auch mit --apply.
#
# Usage: bash scripts/health-goals-llm-fill.sh [--apply] [--strict] [--only=ID,ID] [-h|--help]
#   --apply        schreibt Prio-C-Aktuell mit (LLM)-Marker (confidence >= 0.7)
#   --strict       exit 1 bei nicht erreichbarem Gateway (Default: exit 0 mit Warnung)
#   --only=ID,ID   schränkt Kandidaten auf komma-separierte IDs ein
#   -h, --help     zeigt diese Hilfe
set -euo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "kein git-Repo" >&2; exit 2; }

APPLY=0
STRICT=0
ONLY_FILTER=""

for a in "$@"; do case "$a" in
  --apply) APPLY=1 ;;
  --strict) STRICT=1 ;;
  --only=*) ONLY_FILTER="${a#--only=}" ;;
  -h|--help) sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  *) echo "unbekanntes Flag: $a" >&2; exit 2 ;;
esac; done

GOALS_FILE="${HG_GOALS_FILE:-.claude/lib/goals.md}"
GEN_JSON="${HG_GEN_JSON:-website/src/lib/goals-data.generated.json}"
LLM_URL="${HG_LLM_URL:-http://localhost:18235/v1}"
LLM_MODEL="${HG_LLM_MODEL:-bonsai}"
DATE_SUFFIX="$(date +%Y%m%d-%H%M%S)"
OUTPUT_FILE="tmp/claude-scratch/health-goals-llm-fill-${DATE_SUFFIX}.md"

CLEANUP_FILES=()
trap 'rm -f "${CLEANUP_FILES[@]}"' EXIT

# --- Messwerte ---
if [ -n "${HG_VALUES_FILE:-}" ] && [ -s "${HG_VALUES_FILE:-}" ]; then
  VALUES_FILE="$HG_VALUES_FILE"
else
  VALUES_FILE="$(mktemp)"
  CLEANUP_FILES+=("$VALUES_FILE")
  HG_VALUES_FILE="$VALUES_FILE" bash scripts/health-goals-check.sh --fast --quiet >/dev/null || true
fi

if [ ! -s "$VALUES_FILE" ]; then
  echo "keine Messwerte erhalten — abgebrochen" >&2
  exit 1
fi

if [ ! -f "$GEN_JSON" ]; then
  echo "⚠ $GEN_JSON nicht gefunden — keine Kandidatenbasis." >&2
  exit 0
fi

# --- Kandidaten ermitteln ---
# Lese gemessene IDs aus VALUES_FILE
declare -A MEASURED_IDS
while read -r gid _; do
  MEASURED_IDS["$gid"]=1
done < <(awk '{print $1}' "$VALUES_FILE")

# Lese alle Prio-C-IDs aus GEN_JSON, filtere gemessene raus
CANDIDATES=()
while IFS=$'\t' read -r raw_id raw_title; do
  gid="${raw_id%%[$'\n\r']*}"
  if [ -z "$gid" ]; then continue; fi
  if [ -n "${MEASURED_IDS[$gid]:-}" ]; then continue; fi
  CANDIDATES+=("$gid")
done < <(python3 -c "
import json, sys
with open('$GEN_JSON') as f:
    data = json.load(f)
for entry in data:
    if entry.get('priority') == 'C':
        print(f\"{entry['id']}\t{entry.get('title','')}\")
" 2>/dev/null || true)

# --only Filter
if [ -n "$ONLY_FILTER" ]; then
  IFS=',' read -ra ONLY_IDS <<< "$ONLY_FILTER"
  FILTERED=()
  for c in "${CANDIDATES[@]}"; do
    for o in "${ONLY_IDS[@]}"; do
      if [ "$c" = "$o" ]; then
        FILTERED+=("$c"); break
      fi
    done
  done
  CANDIDATES=("${FILTERED[@]}")
fi

if [ ${#CANDIDATES[@]} -eq 0 ]; then
  echo "Keine LLM-Kandidaten — alle Prio-C-Ziele sind bereits gemessen."
  exit 0
fi

echo "LLM-Fill-Kandidaten (${#CANDIDATES[@]}):"
for c in "${CANDIDATES[@]}"; do echo "  $c"; done
echo ""

# --- LLM-Dispatch ---
# Gateway-Test
if ! curl -sf --max-time 5 "${LLM_URL}/models" >/dev/null 2>&1; then
  echo "⚠ Gateway unter ${LLM_URL} nicht erreichbar."
  if [ "$STRICT" = "1" ]; then exit 1; fi
  echo "  (--strict nicht gesetzt → exit 0 mit Warnung)"
  exit 0
fi

RESULTS=()
mkdir -p "$(dirname "$OUTPUT_FILE")"

echo "# LLM-Fill-Report $DATE_SUFFIX" > "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "Kandidaten: ${#CANDIDATES[@]}" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

for gid in "${CANDIDATES[@]}"; do
  printf "  → %s ... " "$gid"

  # Prompt: hole Kontext aus goals.md Sektion
  CONTEXT=$(python3 -c "
import re, sys
with open('$GOALS_FILE') as f:
    text = f.read()
# Finde Sektion für gid
pattern = r'##\s+' + re.escape('$gid') + r'.*?(?=\n##\s|\Z)'
m = re.search(pattern, text, re.DOTALL)
if m: print(m.group(0)[:1500])
else: print('(kein Kontext gefunden)')
" 2>/dev/null || echo "(Kontext-Fehler)")

  JSON_PAYLOAD=$(cat <<JSON
{
  "model": "${LLM_MODEL}",
  "messages": [
    {"role": "user", "content": "Du bekommst ein Health-Goal aus .claude/lib/goals.md. Liefere eine strukturierte Bewertung als JSON. Goal-ID: ${gid}. Kontext: ${CONTEXT}. Antworte NUR als JSON: {\"id\":\"${gid}\",\"value\":\"<aktueller Wert>\",\"unit\":\"<Einheit>\",\"confidence\":0.0,\"evidence\":\"<Begründung>\",\"reproducible_cmd_suggestion\":\"<reproduzierbarer Messbefehl>\"}"}
  ],
  "response_format": {"type": "json_object"},
  "max_tokens": 300
}
JSON
  )

  RESP=$(curl -s --max-time 30 \
    -H "Content-Type: application/json" \
    -d "$JSON_PAYLOAD" \
    "${LLM_URL}/chat/completions" 2>/dev/null || echo "CURL_FAILED")

  if [ "$RESP" = "CURL_FAILED" ]; then
    echo "curl-Fehler"
    echo "### $gid — CURL_FAILED" >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"
    continue
  fi

  CHOICE=$(echo "$RESP" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    content = data['choices'][0]['message']['content']
    # Strip markdown code fences if present
    content = content.strip().removeprefix('\`\`\`json').removeprefix('\`\`\`').removesuffix('\`\`\`').strip()
    parsed = json.loads(content)
    print(json.dumps(parsed))
except Exception:
    print('PARSE_FAILED')
" 2>/dev/null || echo "PARSE_FAILED")

  if [ "$CHOICE" = "PARSE_FAILED" ]; then
    echo "Parse-Fehler (unfillable)"
    echo "### $gid — unfillable (Parse-Fehler)" >> "$OUTPUT_FILE"
    echo '```'"\n${RESP}\n"'```' >> "$OUTPUT_FILE"
    echo "" >> "$OUTPUT_FILE"
    continue
  fi

  VALUE=$(echo "$CHOICE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('value',''))" 2>/dev/null || echo "")
  UNIT=$(echo "$CHOICE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('unit',''))" 2>/dev/null || echo "")
  CONFIDENCE=$(echo "$CHOICE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('confidence',0))" 2>/dev/null || echo "0")
  EVIDENCE=$(echo "$CHOICE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('evidence',''))" 2>/dev/null || echo "")
  CMD_SUGGESTION=$(echo "$CHOICE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('reproducible_cmd_suggestion',''))" 2>/dev/null || echo "")

  echo "value=$VALUE confidence=$CONFIDENCE"

  {
    echo "### $gid"
    echo "- **Wert:** $VALUE $UNIT"
    echo "- **Confidence:** $CONFIDENCE"
    echo "- **Evidenz:** $EVIDENCE"
    echo "- **Messbefehl:** $CMD_SUGGESTION"
    echo ""
  } >> "$OUTPUT_FILE"

  RESULTS+=("$gid|$VALUE|$UNIT|$CONFIDENCE|$EVIDENCE|$CMD_SUGGESTION")
done

# --- Report-only oder --apply ---
echo ""
echo "---"
echo ""

if [ "$APPLY" = "1" ]; then
  echo "LLM-Fill --apply: schreibe Prio-C-Zellen mit (LLM)-Marker"
  python3 - "$GOALS_FILE" "$GEN_JSON" "$OUTPUT_FILE" <<'PY_APPLY'
import json, sys, re

goals_file, gen_json_file = sys.argv[1], sys.argv[2]
output_lines = []

with open(goals_file) as f:
    lines = f.readlines()

# Ergebnis aus output_file parsen (stammt aus RESULTS, per Apply übertragen)
results_raw = open(sys.argv[3]).read()

row_re = re.compile(r'^\|\s*\*\*(G-[A-Z0-9]+)\*\*\s*\|([^|]*)\|([^|]*)\|([^|]*)\|(.*)\|\s*$')

applied = 0
for i, line in enumerate(lines):
    m = row_re.match(line.rstrip("\n"))
    if not m:
        continue
    gid = m.group(1)
    if not gid:
        continue
    # Suche Ergebnis in results_raw
    pat = re.compile(r'### ' + re.escape(gid) + r'.*?\*\*Wert:\*\* ([^\n]+).*?\*\*Confidence:\*\* ([^\n]+)', re.DOTALL)
    rm = pat.search(results_raw)
    if not rm:
        continue
    raw_value = rm.group(1).strip()
    raw_conf = rm.group(2).strip()
    try:
        conf = float(raw_conf)
    except ValueError:
        continue
    if conf < 0.7:
        continue
    value = raw_value.split()[0] if raw_value else ""
    if not value:
        continue
    ziel_cell, aktuell_cell, target_cell, rest_cell = m.group(2), m.group(3), m.group(4), m.group(5)
    if "LLM" in aktuell_cell:
        continue
    lines[i] = f"| **{gid}** |{ziel_cell}| {value} (LLM) ✓ |{target_cell}|{rest_cell}|\n"
    applied += 1

if applied:
    with open(goals_file, "w") as f:
        f.writelines(lines)
    print(f"✅ {applied} Prio-C-Zellen mit (LLM)-Marker geschrieben.")
else:
    print("Keine Zellen geschrieben (keine Candidates mit confidence >= 0.7).")
PY_APPLY
else:
  echo "Report-only (--apply nicht gesetzt). Ergebnisse in $OUTPUT_FILE"
fi
