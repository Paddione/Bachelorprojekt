#!/usr/bin/env bash
# Glimmer-Benchmark gegen einen laufenden llama-server.
# Nutzung: glimmer-bench.sh <port> <label> [long_chars]
set -uo pipefail
PORT="$1"; LABEL="$2"; LONG_CHARS="${3:-480000}"
URL="http://127.0.0.1:${PORT}"
REPO="$HOME/Bachelorprojekt"
OUT="/tmp/glimmer-bench-${LABEL}.txt"
: > "$OUT"
log() { echo "$*" | tee -a "$OUT"; }

for i in $(seq 1 120); do
  curl -sf "$URL/health" >/dev/null && break; sleep 3
done
curl -sf "$URL/health" >/dev/null || { log "FAIL: server not healthy"; exit 1; }

log "== $LABEL  $(date -Is)"
log "-- VRAM nach Start:"
nvidia-smi --query-gpu=name,memory.used,memory.total --format=csv,noheader | tee -a "$OUT"
curl -s "$URL/props" | jq -c '{n_ctx: .default_generation_settings.n_ctx, model: .model_alias}' | tee -a "$OUT"

SYS='Reasoning strength: high'
short_prompt='Write a Python function that parses an ISO-8601 duration string (e.g. P3DT4H12M) into total seconds. Include type hints, docstring and three doctests. Then explain edge cases briefly.'

log "-- Kurz-Decode (3 Laeufe, max_tokens 600, temp 1.0/top_p 0.95/top_k 64):"
for r in $(seq 1 "${SHORT_RUNS:-3}"); do
  body=$(jq -n --arg s "$SYS" --arg u "$short_prompt" \
    '{messages:[{role:"system",content:$s},{role:"user",content:$u}],max_tokens:600,temperature:1.0,top_p:0.95,top_k:64}')
  curl -s "$URL/v1/chat/completions" -H 'content-type: application/json' -d "$body" \
    | jq -c '{pred_tps: .timings.predicted_per_second, n: .timings.predicted_n, draft_n: .timings.draft_n, draft_acc: .timings.draft_n_accepted, has_reasoning: ((.choices[0].message.reasoning_content // "")|length>0), content_len: ((.choices[0].message.content // "")|length)}' \
    | tee -a "$OUT"
done

log "-- Tool-Call:"
tbody=$(jq -n --arg s "$SYS" '{messages:[{role:"system",content:$s},{role:"user",content:"What is the weather in Berlin right now? Use the tool."}],
  tools:[{type:"function",function:{name:"get_weather",description:"Current weather for a city",parameters:{type:"object",properties:{city:{type:"string"}},required:["city"]}}}],
  max_tokens:800,temperature:1.0,top_p:0.95,top_k:64}')
curl -s "$URL/v1/chat/completions" -H 'content-type: application/json' -d "$tbody" \
  | jq -c '{finish: .choices[0].finish_reason, tool_calls: .choices[0].message.tool_calls, content: (.choices[0].message.content // "" | .[0:200])}' | tee -a "$OUT"

log "-- Lang-Prompt (~${LONG_CHARS} Zeichen, Needle in der Mitte):"
tmp=$(mktemp)
( cd "$REPO" && cat openspec/specs/*.md docs/adr/*.md 2>/dev/null ) | head -c "$LONG_CHARS" > "$tmp"
half=$(( $(wc -c < "$tmp") / 2 ))
needle=$'\n\nWICHTIG: Das geheime Codewort lautet GLIMMER-7741.\n\n'
{ head -c "$half" "$tmp"; printf '%s' "$needle"; tail -c +"$((half+1))" "$tmp"; } > /tmp/glimmer-long.txt
rm -f "$tmp"
jq -n --arg s "$SYS" --rawfile u /tmp/glimmer-long.txt \
  '{messages:[{role:"system",content:$s},{role:"user",content:($u + "\n\nFrage: Wie lautet das geheime Codewort im Text oben? Antworte nur mit dem Codewort.")}],max_tokens:1500,temperature:1.0,top_p:0.95,top_k:64}' \
  > /tmp/glimmer-long-body.json
curl -s "$URL/v1/chat/completions" -H 'content-type: application/json' --data-binary @/tmp/glimmer-long-body.json \
  | jq -c '{prompt_n: .timings.prompt_n, prompt_tps: .timings.prompt_per_second, pred_tps: .timings.predicted_per_second, draft_n: .timings.draft_n, draft_acc: .timings.draft_n_accepted, answer: (.choices[0].message.content // "" | .[0:120]), err: .error.message}' \
  | tee -a "$OUT"
log "-- VRAM nach Lang-Prompt:"
nvidia-smi --query-gpu=name,memory.used,memory.total --format=csv,noheader | tee -a "$OUT"
