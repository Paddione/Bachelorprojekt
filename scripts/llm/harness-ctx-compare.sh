#!/usr/bin/env bash
# harness-ctx-compare.sh — gleiche Aufgabe, gleiches Modell, verschiedene Harnesses:
# wie viel Kontext schickt jeder Harness, und loest er die Aufgabe?
#
# Varianten:
#   pi-L0 .. pi-L2     pi (@earendil-works/pi-coding-agent, Node >= 22.19) direkt, gleiche
#                      Stufen wie omp-run.sh: L0 read/write/edit/bash, L1 +
#                      .omp/context.md, L2 + grep/find/ls; ohne Kontextdateien,
#                      Skills, Extensions, Prompt-Templates
#   omp-L0 .. omp-L3   scripts/omp-run.sh mit der jeweiligen Kontextstufe
#   opencode           opencode run --agent plan-worker-vllm (wie der plan-runner)
#
# Jede Variante laeuft in einem frischen, detachten Worktree von --ref, damit
# kein Lauf den naechsten oder den Checkout des Aufrufers beeinflusst. Zwischen
# Harness und vLLM sitzt scripts/llm/ctx-proxy.mjs und protokolliert je Anfrage
# die Prompt-Tokens. Die Zaehler aus vLLMs /metrics laufen als Gegenprobe mit:
# weichen sie von der Proxy-Summe ab, ist Verkehr am Proxy vorbeigegangen.
#
# Aufruf:
#   scripts/llm/harness-ctx-compare.sh [--ref <git-ref>] [--variants pi-L0,pi-L1,pi-L2,opencode]
#     [--reps 1] [--upstream http://127.0.0.1:8123] [--proxy-port 8124]
#     [--timeout 900] [--out <verzeichnis>]
#
# --ref muss den Fixture-Ordner scripts/llm/measurements/2026-10-14-harness-ctx/
# und scripts/llm/ctx-proxy.mjs enthalten. Proxy und Aufgabe werden aus --ref
# gelesen, das Skript laesst sich also aus jedem Checkout starten.
#
# Sandbox: pi laeuft mit --no-approve und bash-Tool, deshalb jeder Agent in
# einer bubblewrap-Sandbox (scripts/lib/agent-sandbox.sh): schreibbar nur der
# eigene Worktree, $HOME und Umgebung leer, Netz offen. Ohne bwrap bricht das
# Skript ab; AGENT_SANDBOX=off schaltet die Sandbox bewusst ab.
set -euo pipefail

# shellcheck source=scripts/lib/agent-sandbox.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)/agent-sandbox.sh"

REF="HEAD"
VARIANTS="pi-L0,pi-L1,pi-L2,opencode"
REPS=1
UPSTREAM="http://127.0.0.1:8123"
PROXY_PORT=8124
TIMEOUT=900
OUT=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --ref) REF="$2"; shift 2 ;;
    --variants) VARIANTS="$2"; shift 2 ;;
    --reps) REPS="$2"; shift 2 ;;
    --upstream) UPSTREAM="${2%/}"; shift 2 ;;
    --proxy-port) PROXY_PORT="$2"; shift 2 ;;
    --timeout) TIMEOUT="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
    *) echo "FEHLER: unbekannte Option '$1'" >&2; exit 1 ;;
  esac
done

command -v jq >/dev/null || { echo "FEHLER: jq fehlt" >&2; exit 2; }
# Nur pi-Varianten laufen in der Sandbox (omp/opencode brauchen ihre Config unter $HOME).
case ",$VARIANTS," in *,pi-*) agent_sandbox_check || exit 3 ;; esac
git rev-parse --git-dir >/dev/null 2>&1 || { echo "FEHLER: aus einem Bachelorprojekt-Checkout starten" >&2; exit 2; }
SHA="$(git rev-parse --verify "$REF^{commit}")" || { echo "FEHLER: --ref '$REF' unbekannt" >&2; exit 2; }
FIX="scripts/llm/measurements/2026-10-14-harness-ctx"
git cat-file -e "$SHA:$FIX/task.md" 2>/dev/null || { echo "FEHLER: $FIX/task.md fehlt in $REF" >&2; exit 2; }

OUT="${OUT:-$HOME/harness-ctx-runs/$(date +%Y%m%dT%H%M%S)}"
mkdir -p "$OUT"
LOG="$OUT/requests.jsonl"
# Ein schon benutztes Verzeichnis wuerde an alte Protokolle anhaengen und die
# Zaehlung je Label verfaelschen (gleiche Labels aus einem frueheren Aufruf).
if [ -e "$LOG" ] || [ -e "$OUT/results.jsonl" ]; then
  echo "FEHLER: $OUT enthaelt schon eine Messung — neues --out waehlen" >&2; exit 1
fi
RESULTS="$OUT/results.jsonl"
git show "$SHA:scripts/llm/ctx-proxy.mjs" > "$OUT/ctx-proxy.mjs"
git show "$SHA:$FIX/task.md" > "$OUT/task.md"
PROXY="http://127.0.0.1:$PROXY_PORT"

# Preflight: Upstream da und leer — sonst misst man fremde Last mit.
curl -sf --max-time 5 "$UPSTREAM/v1/models" >/dev/null || { echo "FEHLER: $UPSTREAM antwortet nicht" >&2; exit 2; }
metric() {  # Summe aller Serien einer Metrik
  curl -sf --max-time 5 "$UPSTREAM/metrics" | awk -v m="$1" '$1 == m || index($1, m "{") == 1 { s += $NF } END { printf "%d", s }'
}
running="$(curl -sf --max-time 5 "$UPSTREAM/metrics" | awk '/^vllm:num_requests_running/ { s += $NF } END { printf "%d", s }')"
[ "$running" = "0" ] || { echo "FEHLER: auf $UPSTREAM laufen $running Anfragen — Host nicht ruhig" >&2; exit 2; }

# Fehlende Harness-Binaries vor dem ersten Lauf melden, nicht als leere Messung
# durchlaufen lassen.
case ",$VARIANTS," in
  *,pi-L*) command -v pi >/dev/null || { echo "FEHLER: pi fehlt (npm install -g @earendil-works/pi-coding-agent@1.2.0) — oder pi-Varianten aus --variants nehmen" >&2; exit 2; } ;;
esac
case ",$VARIANTS," in
  *,omp-L*) command -v omp >/dev/null || { echo "FEHLER: omp fehlt (task omp:install) — oder omp-Varianten aus --variants nehmen" >&2; exit 2; } ;;
esac
case ",$VARIANTS," in
  *,opencode,*) command -v opencode >/dev/null || { echo "FEHLER: opencode fehlt — oder 'opencode' aus --variants nehmen" >&2; exit 2; } ;;
esac

{
  echo "ref: $REF ($SHA)"
  echo "upstream: $UPSTREAM"
  curl -sf --max-time 5 "$UPSTREAM/v1/models" | jq -c '.data[] | {id, max_model_len}'
  command -v pi >/dev/null && echo "pi: $(pi --version 2>&1 | head -1)" || echo "pi: nicht installiert"
  command -v omp >/dev/null && echo "omp: $(omp --version 2>&1 | head -1)" || echo "omp: nicht installiert"
  command -v opencode >/dev/null && echo "opencode: $(opencode --version 2>&1 | head -1)" || echo "opencode: nicht installiert"
} | tee "$OUT/env.txt"

# Frischer Proxy je Lauf, in eigener Sitzung (setsid): Ein Harness, dessen
# Modell per bash-Tool Prozesse beendet, hat den gemeinsamen Proxy sonst
# mitgerissen (2026-10-14: nach pi-L1-r1 erreichte kein Lauf mehr :8124).
PROXY_PID=""
stop_proxy() {
  [ -n "$PROXY_PID" ] && kill "$PROXY_PID" 2>/dev/null || true
  for _ in $(seq 1 25); do curl -sf --max-time 1 "$PROXY/v1/models" >/dev/null || break; sleep 0.2; done
  PROXY_PID=""
}
start_proxy() {
  stop_proxy
  setsid node "$OUT/ctx-proxy.mjs" serve --listen "$PROXY_PORT" --upstream "$UPSTREAM" --log "$LOG" \
    </dev/null >/dev/null 2>>"$OUT/proxy.err" &
  PROXY_PID=$!
  for _ in $(seq 1 50); do curl -sf --max-time 1 "$PROXY/v1/models" >/dev/null && return 0; sleep 0.2; done
  echo "FEHLER: Proxy startet nicht, siehe $OUT/proxy.err" >&2; exit 2
}
WTS=()
cleanup() {
  stop_proxy
  for wt in "${WTS[@]}"; do git worktree remove --force "$wt" 2>/dev/null || true; done
}
trap cleanup EXIT
start_proxy

TASK_PROMPT="$(cat "$OUT/task.md")"
MODEL_ID="$(curl -sf --max-time 5 "$UPSTREAM/v1/models" | jq -r '.data[0].id')"
MODEL_CTX="$(curl -sf --max-time 5 "$UPSTREAM/v1/models" | jq -r '.data[0].max_model_len // empty')"

# pi bekommt je Lauf ein eigenes Agent-Verzeichnis mit genau einem Provider
# (dem Proxy) — keine Nutzer-Config, keine Sessions, keine Update-Checks.
pi_agent_dir() {
  local dir; dir="$(mktemp -d "${TMPDIR:-/tmp}/harness-ctx-pi-XXXXXX")"
  jq -n --arg base "$PROXY/v1" --arg id "$MODEL_ID" --arg ctx "$MODEL_CTX" '
    { providers: { ctxproxy: {
        baseUrl: $base, api: "openai-completions", apiKey: "local",
        compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
        models: [ { id: $id } + (if $ctx == "" then {} else { contextWindow: ($ctx | tonumber) } end) ] } } }' \
    > "$dir/models.json"
  printf '%s' "$dir"
}

for rep in $(seq 1 "$REPS"); do
  for variant in ${VARIANTS//,/ }; do
    label="$variant-r$rep"
    echo "$label" > "$LOG.label"
    wt="$(mktemp -d "${TMPDIR:-/tmp}/harness-ctx-XXXXXX")/wt"
    git worktree add --detach --quiet "$wt" "$SHA"
    WTS+=("$wt")

    start_proxy
    p0="$(metric 'vllm:prompt_tokens_total')"; r0="$(metric 'vllm:request_success_total')"
    t0="$(date +%s)"
    set +e
    case "$variant" in
      pi-L[0-2])
        level="${variant#pi-}"
        tools="read,write,edit,bash"; [ "$level" = "L2" ] && tools="$tools,grep,find,ls"
        extra=(); [ "$level" != "L0" ] && extra=(--append-system-prompt "$(cat "$wt/.omp/context.md")")
        pidir="$(pi_agent_dir)"
        ( PI_CODING_AGENT_DIR="$pidir" PI_OFFLINE=1 \
            agent_sandbox_run "$wt" --rw "$pidir" --env PI_CODING_AGENT_DIR --env PI_OFFLINE \
              --timeout "$TIMEOUT" -- \
            pi --mode json --no-session --no-context-files --no-extensions --no-skills \
              --no-prompt-templates --no-themes --no-approve --tools "$tools" "${extra[@]}" \
              --provider ctxproxy --model "$MODEL_ID" "$TASK_PROMPT" ) \
          > "$OUT/$label.out" 2>&1
        rm -rf "$pidir"
        ;;
      omp-L[0-3])
        # omp-run.sh haengt /v1 selbst an — Basis-URL ohne /v1.
        ( cd "$wt" && OMP_LOCAL_BASE_URL="$PROXY" timeout "$TIMEOUT" \
            bash scripts/omp-run.sh "$FIX/task.md" --level "${variant#omp-}" --skip-tests ) \
          > "$OUT/$label.out" 2>&1
        ;;
      opencode)
        # Provider vllm-local lebt in der globalen opencode-Config; nur die
        # Basis-URL wird fuer diesen Lauf auf den Proxy umgebogen.
        ( cd "$wt" && PWD="$wt" \
            OPENCODE_CONFIG_CONTENT="{\"provider\":{\"vllm-local\":{\"options\":{\"baseURL\":\"$PROXY/v1\"}}}}" \
            timeout "$TIMEOUT" opencode run --agent plan-worker-vllm --model vllm-local/w4a4 "$TASK_PROMPT" ) \
          > "$OUT/$label.out" 2>&1
        ;;
      *) echo "WARNUNG: unbekannte Variante '$variant' — uebersprungen" >&2; set -e; continue ;;
    esac
    exit_code=$?
    set -e
    secs=$(( $(date +%s) - t0 ))
    # Lebte der Proxy bis zum Ende? Wenn nicht, ist der Lauf ab dem Ausfall
    # keine Messung des Harness mehr.
    proxy_alive=true
    curl -sf --max-time 2 "$PROXY/v1/models" >/dev/null || proxy_alive=false
    p1="$(metric 'vllm:prompt_tokens_total')"; r1="$(metric 'vllm:request_success_total')"

    test_ok=false
    # Nach einem pi-Lauf ist der Worktree unvertrauenswuerdig: Tests nur in der Sandbox.
    case "$variant" in
      pi-*) agent_sandbox_run "$wt" --timeout 300 -- node --test "$FIX/sandbox/slug.test.mjs" \
              > "$OUT/$label.test.txt" 2>&1 && test_ok=true ;;
      *) node --test "$wt/$FIX/sandbox/slug.test.mjs" > "$OUT/$label.test.txt" 2>&1 && test_ok=true ;;
    esac
    test_touched=false
    git -C "$wt" diff --quiet -- "$FIX/sandbox/slug.test.mjs" || test_touched=true
    changed="$(git -C "$wt" status --porcelain --untracked-files=all | grep -vc '^?? .omp/runs/' || true)"
    # omp-run.sh schreibt die omp-Ausgabe nach .omp/runs/ im Worktree, nicht auf stdout.
    for f in "$wt"/.omp/runs/*.jsonl; do [ -f "$f" ] && cp "$f" "$OUT/$label.omp.jsonl"; done
    result_line="$(cat "$OUT/$label.out" "$OUT/$label.omp.jsonl" 2>/dev/null \
      | grep -oE 'PLAN-RUNNER-RESULT: (success|failure) [^<`]' | tail -1 | cut -d' ' -f2 || true)"
    # Das Muster schliesst die Vorlage aus task.md aus ("success <kurzfassung>"),
    # die pi im JSON-Modus als Teil des Prompts wieder ausgibt.
    git -C "$wt" diff > "$OUT/$label.diff" || true

    summary="$(node "$OUT/ctx-proxy.mjs" summarize "$LOG" --label "$label" 2>/dev/null || true)"
    case "$summary" in ''|null) summary='{}' ;; esac
    jq -n -c --arg label "$label" --arg variant "$variant" --argjson rep "$rep" \
      --argjson exit "$exit_code" --argjson secs "$secs" --argjson test_ok "$test_ok" \
      --argjson test_touched "$test_touched" --argjson changed "${changed:-0}" \
      --argjson proxy_alive "$proxy_alive" \
      --arg result "${result_line:-none}" \
      --argjson metrics_prompt "$(( p1 - p0 ))" --argjson metrics_requests "$(( r1 - r0 ))" \
      --argjson proxy "$summary" \
      '{label: $label, variant: $variant, rep: $rep, exit: $exit, secs: $secs,
        test_ok: $test_ok, test_touched: $test_touched, changed_files: $changed, result_line: $result,
        proxy_alive: $proxy_alive,
        metrics_prompt_tokens: $metrics_prompt, metrics_requests: $metrics_requests} + $proxy' \
      | tee -a "$RESULTS" \
      | jq -r '"\(.label): start \(.first_prompt_tokens // "-") tok, max \(.max_prompt_tokens // "-") tok, " +
               "\(.requests // 0) Anfragen (metrics \(.metrics_requests)), Test \(if .test_ok then "gruen" else "rot" end)" +
               "\(if .test_touched then " [TEST VERAENDERT]" else "" end), Ergebnis \(.result_line), " +
               "exit \(.exit), \(.secs) s\(if .proxy_alive then "" else " [PROXY WAR TOT]" end)"'

    git worktree remove --force "$wt" 2>/dev/null || true
  done
done

echo "Ergebnisse: $RESULTS"
