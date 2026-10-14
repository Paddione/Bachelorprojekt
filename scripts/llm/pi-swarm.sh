#!/usr/bin/env bash
# pi-swarm.sh — N pi-Agenten gleichzeitig gegen denselben vLLM-Server: haelt
# der Worker paralleles Agenten-Arbeiten aus, und was kostet es den einzelnen?
#
# Jeder Agent bekommt die Fixture-Aufgabe aus harness-ctx-compare.sh in einem
# eigenen, detachten Worktree, einen eigenen Proxy (eigener Port, eigene
# Sitzung via setsid, eigenes Log — damit sind Anfragen eindeutig zuordenbar und
# ein Agent, der per bash-Tool Prozesse beendet, reisst die anderen nicht mit)
# und ein eigenes PI_CODING_AGENT_DIR mit genau diesem Proxy als Provider.
#
# Waehrend des Laufs schreibt ein Poller jede Sekunde vLLMs Last nach
# metrics.tsv: laufende/wartende Anfragen und KV-Cache-Auslastung. Daraus:
# echte Gleichzeitigkeit (running max), Warteschlange (waiting max, z. B. wenn
# N > max-num-seqs), Speicherdruck (KV max, Preemptions).
#
# Aufruf:
#   scripts/llm/pi-swarm.sh [--n 10] [--level L0|L1|L2] [--ref HEAD]
#     [--upstream http://127.0.0.1:8123] [--base-port 8130] [--timeout 900]
#     [--out <verzeichnis>]
set -euo pipefail

N=10
LEVEL="L0"
REF="HEAD"
UPSTREAM="http://127.0.0.1:8123"
BASE_PORT=8130
TIMEOUT=900
OUT=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --n) N="$2"; shift 2 ;;
    --level) LEVEL="$2"; shift 2 ;;
    --ref) REF="$2"; shift 2 ;;
    --upstream) UPSTREAM="${2%/}"; shift 2 ;;
    --base-port) BASE_PORT="$2"; shift 2 ;;
    --timeout) TIMEOUT="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
    *) echo "FEHLER: unbekannte Option '$1'" >&2; exit 1 ;;
  esac
done

case "$LEVEL" in L0|L1|L2) ;; *) echo "FEHLER: --level L0|L1|L2" >&2; exit 1 ;; esac
command -v jq >/dev/null || { echo "FEHLER: jq fehlt" >&2; exit 2; }
command -v pi >/dev/null || { echo "FEHLER: pi fehlt (npm install -g @earendil-works/pi-coding-agent@1.2.0)" >&2; exit 2; }
command -v setsid >/dev/null || { echo "FEHLER: setsid fehlt" >&2; exit 2; }
git rev-parse --git-dir >/dev/null 2>&1 || { echo "FEHLER: aus einem Bachelorprojekt-Checkout starten" >&2; exit 2; }
SHA="$(git rev-parse --verify "$REF^{commit}")" || { echo "FEHLER: --ref '$REF' unbekannt" >&2; exit 2; }
FIX="scripts/llm/measurements/2026-10-14-harness-ctx"
git cat-file -e "$SHA:$FIX/task.md" 2>/dev/null || { echo "FEHLER: $FIX/task.md fehlt in $REF" >&2; exit 2; }

OUT="${OUT:-$HOME/harness-ctx-runs/swarm-$(date +%Y%m%dT%H%M%S)}"
[ -e "$OUT/summary.json" ] && { echo "FEHLER: $OUT enthaelt schon eine Messung — neues --out waehlen" >&2; exit 1; }
mkdir -p "$OUT"
git show "$SHA:scripts/llm/ctx-proxy.mjs" > "$OUT/ctx-proxy.mjs"
git show "$SHA:$FIX/task.md" > "$OUT/task.md"
TASK_PROMPT="$(cat "$OUT/task.md")"

# ---------------------------------------------------------------- Preflight
curl -sf --max-time 5 "$UPSTREAM/v1/models" >/dev/null || { echo "FEHLER: $UPSTREAM antwortet nicht" >&2; exit 2; }
scrape() { curl -sf --max-time 5 "$UPSTREAM/metrics" || true; }
# Summe aller Serien einer Metrik; mehrere Namen = erster vorhandener (vLLM
# hat einige Metriken zwischen Versionen umbenannt).
metric_from() {
  local text="$1"; shift
  local m
  for m in "$@"; do
    if printf '%s\n' "$text" | grep -qE "^$m(\{| )"; then
      printf '%s\n' "$text" | awk -v m="$m" '$1 == m || index($1, m "{") == 1 { s += $NF } END { printf "%s", s + 0 }'
      return
    fi
  done
  printf 'null'
}
M0="$(scrape)"
[ "$(metric_from "$M0" vllm:num_requests_running)" = "0" ] || { echo "FEHLER: auf $UPSTREAM laufen schon Anfragen — Host nicht ruhig" >&2; exit 2; }
MODEL_ID="$(curl -sf "$UPSTREAM/v1/models" | jq -r '.data[0].id')"
MODEL_CTX="$(curl -sf "$UPSTREAM/v1/models" | jq -r '.data[0].max_model_len // empty')"

{
  echo "ref: $REF ($SHA)"
  echo "upstream: $UPSTREAM model: $MODEL_ID max_model_len: ${MODEL_CTX:-?}"
  echo "agents: $N level: $LEVEL timeout: ${TIMEOUT}s"
  echo "pi: $(pi --version 2>&1 | head -1)"
} | tee "$OUT/env.txt"

# ---------------------------------------------------------------- Aufraeumen
PIDS_PROXY=(); PIDS_AGENT=(); WTS=(); PIDIRS=(); POLLER=""
cleanup() {
  [ -n "$POLLER" ] && kill "$POLLER" 2>/dev/null || true
  for p in "${PIDS_AGENT[@]}"; do kill "$p" 2>/dev/null || true; done
  for p in "${PIDS_PROXY[@]}"; do kill "$p" 2>/dev/null || true; done
  for wt in "${WTS[@]}"; do git worktree remove --force "$wt" 2>/dev/null || true; done
  for d in "${PIDIRS[@]}"; do rm -rf "$d"; done
}
trap cleanup EXIT

# ---------------------------------------------------------------- Aufbau
for i in $(seq 1 "$N"); do
  port=$((BASE_PORT + i))
  setsid node "$OUT/ctx-proxy.mjs" serve --listen "$port" --upstream "$UPSTREAM" \
    --log "$OUT/agent-$i.requests.jsonl" </dev/null >/dev/null 2>>"$OUT/proxy-$i.err" &
  PIDS_PROXY+=($!)
  echo "agent-$i" > "$OUT/agent-$i.requests.jsonl.label"
done
for i in $(seq 1 "$N"); do
  port=$((BASE_PORT + i))
  for _ in $(seq 1 50); do curl -sf --max-time 1 "http://127.0.0.1:$port/v1/models" >/dev/null && break; sleep 0.2; done
  curl -sf --max-time 2 "http://127.0.0.1:$port/v1/models" >/dev/null || { echo "FEHLER: Proxy $i (:$port) startet nicht" >&2; exit 2; }
done

tools="read,write,edit,bash"; [ "$LEVEL" = "L2" ] && tools="$tools,grep,find,ls"
for i in $(seq 1 "$N"); do
  wt="$(mktemp -d "${TMPDIR:-/tmp}/pi-swarm-XXXXXX")/wt"
  git worktree add --detach --quiet "$wt" "$SHA"
  WTS+=("$wt")
  d="$(mktemp -d "${TMPDIR:-/tmp}/pi-swarm-agent-XXXXXX")"
  PIDIRS+=("$d")
  jq -n --arg base "http://127.0.0.1:$((BASE_PORT + i))/v1" --arg id "$MODEL_ID" --arg ctx "$MODEL_CTX" '
    { providers: { ctxproxy: {
        baseUrl: $base, api: "openai-completions", apiKey: "local",
        compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
        models: [ { id: $id } + (if $ctx == "" then {} else { contextWindow: ($ctx | tonumber) } end) ] } } }' \
    > "$d/models.json"
done

# ---------------------------------------------------------------- Last-Poller
printf 'ts\trunning\twaiting\tkv_usage\n' > "$OUT/metrics.tsv"
(
  while :; do
    t="$(scrape)"
    printf '%s\t%s\t%s\t%s\n' "$(date +%s.%N | cut -c1-14)" \
      "$(metric_from "$t" vllm:num_requests_running)" \
      "$(metric_from "$t" vllm:num_requests_waiting)" \
      "$(metric_from "$t" vllm:kv_cache_usage_perc vllm:gpu_cache_usage_perc)" >> "$OUT/metrics.tsv"
    sleep 1
  done
) &
POLLER=$!

# ---------------------------------------------------------------- Start
M_BEFORE="$(scrape)"
t0="$(date +%s%N)"
for i in $(seq 1 "$N"); do
  wt="${WTS[$((i - 1))]}"
  extra=(); [ "$LEVEL" != "L0" ] && extra=(--append-system-prompt "$(cat "$wt/.omp/context.md")")
  (
    s="$(date +%s%N)"
    set +e
    cd "$wt" && PI_CODING_AGENT_DIR="${PIDIRS[$((i - 1))]}" PI_OFFLINE=1 timeout "$TIMEOUT" \
      pi --mode json --no-session --no-context-files --no-extensions --no-skills \
        --no-prompt-templates --no-themes --no-approve --tools "$tools" "${extra[@]}" \
        --provider ctxproxy --model "$MODEL_ID" "$TASK_PROMPT" > "$OUT/agent-$i.out" 2>&1
    rc=$?
    printf '%s %s\n' "$rc" "$(( ($(date +%s%N) - s) / 1000000000 ))" > "$OUT/agent-$i.exit"
  ) &
  PIDS_AGENT+=($!)
done
echo "$N Agenten gestartet, warte ..."
for p in "${PIDS_AGENT[@]}"; do wait "$p" || true; done
wall="$(( ($(date +%s%N) - t0) / 1000000000 ))"
M_AFTER="$(scrape)"
kill "$POLLER" 2>/dev/null || true; POLLER=""

# ---------------------------------------------------------------- Auswertung
: > "$OUT/agents.jsonl"
for i in $(seq 1 "$N"); do
  wt="${WTS[$((i - 1))]}"
  port=$((BASE_PORT + i))
  read -r rc secs < "$OUT/agent-$i.exit"
  test_ok=false
  node --test "$wt/$FIX/sandbox/slug.test.mjs" > "$OUT/agent-$i.test.txt" 2>&1 && test_ok=true
  test_touched=false
  git -C "$wt" diff --quiet -- "$FIX/sandbox/slug.test.mjs" || test_touched=true
  git -C "$wt" diff > "$OUT/agent-$i.diff" || true
  result="$(grep -oE 'PLAN-RUNNER-RESULT: (success|failure) [^<`]' "$OUT/agent-$i.out" | tail -1 | cut -d' ' -f2 || true)"
  proxy_alive=true
  curl -sf --max-time 2 "http://127.0.0.1:$port/v1/models" >/dev/null || proxy_alive=false
  summary="$(node "$OUT/ctx-proxy.mjs" summarize "$OUT/agent-$i.requests.jsonl" --label "agent-$i" 2>/dev/null || true)"
  case "$summary" in ''|null) summary='{}' ;; esac
  jq -n -c --argjson i "$i" --argjson rc "$rc" --argjson secs "$secs" --argjson test_ok "$test_ok" \
    --argjson test_touched "$test_touched" --arg result "${result:-none}" --argjson proxy_alive "$proxy_alive" \
    --argjson s "$summary" \
    '{agent: $i, exit: $rc, secs: ($secs | floor), test_ok: $test_ok, test_touched: $test_touched,
      result_line: $result, proxy_alive: $proxy_alive} + $s' >> "$OUT/agents.jsonl"
done

delta() { awk -v a="$(metric_from "$M_BEFORE" "$@")" -v b="$(metric_from "$M_AFTER" "$@")" \
  'BEGIN { if (a == "null" || b == "null") print "null"; else printf "%d", b - a }'; }
gen="$(delta vllm:generation_tokens_total)"
prompt="$(delta vllm:prompt_tokens_total)"
preempt="$(delta vllm:num_preemptions_total)"

jq -s -c --argjson n "$N" --arg level "$LEVEL" --argjson wall "$wall" \
  --argjson gen "$gen" --argjson prompt "$prompt" --argjson preempt "$preempt" \
  --slurpfile m <(awk -F'\t' 'NR > 1 { print "{\"running\":" ($2 == "null" ? "null" : $2) ",\"waiting\":" ($3 == "null" ? "null" : $3) ",\"kv\":" ($4 == "null" ? "null" : $4) "}" }' "$OUT/metrics.tsv") '
  . as $a
  | ($m | map(.running) | map(select(. != null))) as $run
  | ($m | map(.waiting) | map(select(. != null))) as $wait
  | ($m | map(.kv) | map(select(. != null))) as $kv
  | { agents: $n, level: $level, wall_s: ($wall | floor),
      solved: ($a | map(select(.test_ok and (.test_touched | not))) | length),
      result_success: ($a | map(select(.result_line == "success")) | length),
      proxy_lost: ($a | map(select(.proxy_alive | not)) | length),
      agent_secs_median: ($a | map(.secs) | sort | .[length / 2 | floor]),
      agent_secs_max: ($a | map(.secs) | max),
      requests_total: ($a | map(.requests // 0) | add),
      start_prompt_tokens_median: ($a | map(.first_prompt_tokens) | map(select(. != null)) | sort | if length > 0 then .[length / 2 | floor] else null end),
      max_prompt_tokens: ($a | map(.max_prompt_tokens) | map(select(. != null)) | max),
      vllm_prompt_tokens: $prompt, vllm_generation_tokens: $gen,
      gen_tok_s: (if $gen == null then null else (($gen / $wall) | floor) end),
      running_max: ($run | max), waiting_max: ($wait | max),
      kv_usage_max: ($kv | max), preemptions: $preempt }' "$OUT/agents.jsonl" \
  | tee "$OUT/summary.json" \
  | jq -r '"\(.agents) Agenten (\(.level)): \(.solved)/\(.agents) geloest, \(.result_success) mit success-Zeile, Proxy verloren: \(.proxy_lost)",
           "Wanduhr \(.wall_s) s, je Agent Median \(.agent_secs_median) s / max \(.agent_secs_max) s, \(.requests_total) Anfragen",
           "Kontext: Start-Median \(.start_prompt_tokens_median) tok, Spitze \(.max_prompt_tokens) tok",
           "vLLM: \(.gen_tok_s) tok/s erzeugt, running max \(.running_max), waiting max \(.waiting_max), KV max \(.kv_usage_max), Preemptions \(.preemptions)"'
echo "Je Agent: $OUT/agents.jsonl — Last-Verlauf: $OUT/metrics.tsv"
