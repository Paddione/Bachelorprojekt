#!/usr/bin/env bash
# Nutzung: bash glimmer-d9-reasoning.sh   (gegen den laufenden Server auf :1919)
# Task 6.3 (T900365): reasoning_strength low vs Default (high) bei knappen max_tokens.
URL=http://127.0.0.1:1919/v1/chat/completions
SYS='You are a ticket triage assistant. Reply with a JSON object {"severity": "...", "summary": "..."} only.'
USR='Ticket: Nach dem Deploy liefert /api/health 502, Logs zeigen "connection refused" zur Datenbank. Seit 10 Minuten betroffen alle Nutzer.'
run() {  # <label> <max_tokens> <kwargs-json>
  local body
  body=$(jq -n --arg s "$SYS" --arg u "$USR" --argjson mt "$2" --argjson k "$3" \
    '{model:"Muse-Glimmer-30B", messages:[{role:"system",content:$s},{role:"user",content:$u}], temperature:0.2, max_tokens:$mt} + (if $k == null then {} else {chat_template_kwargs:$k} end)')
  curl -s "$URL" -H 'content-type: application/json' -d "$body" \
    | jq -c --arg l "$1" '{label:$l, finish:.choices[0].finish_reason, content_len:((.choices[0].message.content//"")|length), reasoning_len:((.choices[0].message.reasoning_content//"")|length), n:.timings.predicted_n, content:((.choices[0].message.content//"")|.[0:90])}'
}
for mt in 300 512 1500; do
  run "default(high) mt=$mt" "$mt" 'null'
  run "enable_thinking=false only mt=$mt" "$mt" '{"enable_thinking":false}'
  run "low+enable_thinking=false mt=$mt" "$mt" '{"enable_thinking":false,"reasoning_strength":"low"}'
done
