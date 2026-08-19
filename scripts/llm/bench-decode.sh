#!/usr/bin/env bash
# bench-decode.sh — Misst Prefill- und Decode-Durchsatz eines laufenden
# llama-server und weist bei spekulativem Dekodieren die Annahmequote aus.
#
# Warum nicht die Web-UI oder ein Gefuehl: llama.cpp liefert auf /completion
# einen `timings`-Block mit prompt_per_second und predicted_per_second sowie
# draft_n/draft_n_accepted. Das ist die Zahl, die zaehlt — alles andere ist
# Wanduhr plus Netzwerk.
#
# Aufruf:
#     scripts/llm/bench-decode.sh <port> [label]
#
# Beispiel:
#     scripts/llm/bench-decode.sh 8089 "mtp-n4-f16kv"
set -euo pipefail

PORT="${1:?port}"
LABEL="${2:-unbenannt}"
BASE="http://127.0.0.1:${PORT}"
N_PREDICT="${N_PREDICT:-512}"

command -v jq >/dev/null || { echo "jq fehlt" >&2; exit 1; }

# Ein langer Prompt fuer die Prefill-Messung: llama.cpp meldet prompt_per_second
# erst dann aussagekraeftig, wenn genug Token durch den Batch laufen.
_long_prompt() {
  local n="${1:-6000}" i=0 out=""
  while [ "$i" -lt "$n" ]; do
    out+="Der Zustand des Systems wird durch die Menge aller Beobachtungen bestimmt, die zum Zeitpunkt der Messung vorliegen. "
    i=$((i + 20))
  done
  printf '%s' "$out"
}

# run <name> <prompt> <temp>
run() {
  local name="$1" prompt="$2" temp="$3"
  local body resp
  body="$(jq -n --arg p "$prompt" --argjson n "$N_PREDICT" --argjson t "$temp" \
    '{prompt:$p, n_predict:$n, temperature:$t, cache_prompt:false, stream:false}')"
  resp="$(curl -s --max-time 900 -H 'content-type: application/json' \
    -d "$body" "${BASE}/completion")"

  printf '%s' "$resp" | jq -r --arg name "$name" --arg label "$LABEL" '
    .timings as $t
    | [
        "\($label) | \($name)",
        "  prefill : \($t.prompt_n) tok in \($t.prompt_ms | floor) ms = \($t.prompt_per_second | floor) tok/s",
        "  decode  : \($t.predicted_n) tok in \($t.predicted_ms | floor) ms = \($t.predicted_per_second | floor) tok/s",
        (if ($t.draft_n // 0) > 0
         then "  draft   : \($t.draft_n_accepted)/\($t.draft_n) angenommen = \((($t.draft_n_accepted / $t.draft_n) * 100) | floor)%"
         else "  draft   : kein spekulatives Dekodieren aktiv"
         end)
      ] | .[]'
}

echo "== $LABEL =="
curl -s --max-time 10 "${BASE}/props" \
  | jq -r '"modell: \(.model_path // .default_generation_settings.model // "?")\nkontext: \(.default_generation_settings.n_ctx // "?")"' \
  2>/dev/null || echo "(props nicht lesbar)"

# Aufwaermen: der erste Lauf traegt Kernel-Kompilierung und Allokationen.
curl -s --max-time 300 -H 'content-type: application/json' \
  -d '{"prompt":"Hallo","n_predict":16,"stream":false}' "${BASE}/completion" >/dev/null

run "prosa (greedy)" \
  "Schreibe eine zusammenhaengende Erklaerung ueber die Funktionsweise von Kuehlkreislaeufen in Rechenzentren." 0
run "prosa (temp 1.0)" \
  "Schreibe eine zusammenhaengende Erklaerung ueber die Funktionsweise von Kuehlkreislaeufen in Rechenzentren." 1
run "code (greedy)" \
  "Schreibe eine vollstaendige Python-Klasse fuer einen LRU-Cache mit Typannotationen und Docstrings." 0
run "prefill (langer prompt)" "$(_long_prompt 6000)" 0
