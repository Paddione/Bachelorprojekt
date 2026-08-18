#!/usr/bin/env bash
# bench-guff.sh — Benchmark einer GGUF-Quant mit llama-server (llama.cpp)
#
# Misst Prompt-Processing (pp) und Generation (gen) in Tokens/s ueber die
# OpenAI-kompatible API, inkl. VRAM-Belegung des Server-Prozesses und
# optionalem MTP (--spec-type draft-mtp).
#
# Nutzung:
#   LLAMA_DIR=$HOME/opt/llama-b10442/llama-b10442 bash scripts/llm/bench-guff.sh <modell.gguf>
#
# Env-Parameter:
#   PORT       Server-Port (Default 8090)
#   CTX        Kontextfenster in Tokens (Default 32768)
#   KV_T       KV-Cache-Quantisierung fuer -ctk/-ctv (Default q8_0)
#   MTP        Speculative-Draft-Tiefe, 0 = aus (Default 0)
#   PP_TOKENS  Laenge des PP-Prompts in Zeichen, ~4 Zeichen/Token (Default 16384)
#   GEN_TOKENS max_tokens fuer die Generation (Default 256)
#   TEMP       Sampling-Temperatur (Default 0)
#
# Ausgabe: eine JSON-Zeile mit quant, mtp, ctx, kv_t, pp_tps, gen_tps, vram_mb
set -euo pipefail

: "${LLAMA_DIR:=$HOME/opt/llama-b10442/llama-b10442}"
: "${PORT:=8090}"
: "${CTX:=32768}"
: "${KV_T:=q8_0}"
: "${MTP:=0}"
: "${PP_TOKENS:=16384}"
: "${GEN_TOKENS:=256}"
: "${TEMP:=0}"
: "${NGL:=999}"   # NGL=auto laesst llama.cpp-Auto-Fit entscheiden

MODEL="${1:?Nutzung: $0 <modell.gguf>}"
QUANT="$(basename "$MODEL" .gguf)"
API="http://127.0.0.1:${PORT}"
LOG="/tmp/bench-guff-server-${PORT}.log"

command -v jq >/dev/null || { echo "jq fehlt" >&2; exit 1; }
[ -f "$MODEL" ] || { echo "Modell nicht gefunden: $MODEL" >&2; exit 1; }

# Port-Konflikt frueh erkennen — sonst benchmarkt man still gegen einen fremden Server
if curl -sf -m 1 "$API/health" >/dev/null 2>&1; then
  echo "Port $PORT ist schon belegt — laeuft dort ein fremder Server?" >&2
  exit 1
fi

# ---- Prompt-Geruest ---------------------------------------------------------
# Fuelltext fuer den langen PP-Prompt, am Ende eine Frage, damit die
# 1-Token-Completion nicht leer laeuft.
fill="The quick brown fox jumps over the lazy dog while the sun shines brightly on the meadow. "
PP_PROMPT=""
for ((i = 0; i < PP_TOKENS / 84 + 1; i++)); do PP_PROMPT+="$fill"; done
PP_PROMPT="${PP_PROMPT:0:PP_TOKENS} What is the square of 17?"

# ---- Server starten ---------------------------------------------------------
ARGS=(-m "$MODEL" --port "$PORT" --ctx-size "$CTX" -fa on
      -ctk "$KV_T" -ctv "$KV_T" -np 1 -b 2048 -ub 512 --jinja -rea off --metrics)
if [ "$NGL" != "auto" ]; then ARGS+=(-ngl "$NGL"); fi
if [ "$MTP" -gt 0 ]; then
  ARGS+=(--spec-type draft-mtp --spec-draft-n-max "$MTP" --spec-draft-ngl all)
fi
"$LLAMA_DIR/llama-server" "${ARGS[@]}" >"$LOG" 2>&1 &
SRV=$!
# TERM reicht bei haengenden Servern nicht — erst TERM, dann hart KILL
trap 'kill "$SRV" 2>/dev/null; sleep 2; kill -KILL "$SRV" 2>/dev/null || true' EXIT

# ---- Auf Health warten ------------------------------------------------------
for _ in $(seq 1 240); do
  curl -sf -m 1 "$API/health" >/dev/null 2>&1 && break
  sleep 1
done
curl -sf -m 2 "$API/health" >/dev/null || { echo "Server wurde nicht gesund — siehe $LOG" >&2; exit 1; }

# ---- VRAM des Server-Prozesses ----------------------------------------------
VRAM_MB="$(nvidia-smi --query-compute-apps=pid,used_memory --format=csv,noheader,nounits 2>/dev/null \
  | awk -F', ' -v p="$SRV" '$1==p && $2!="[N/A]" {print $2; exit}' || true)"
[ -n "$VRAM_MB" ] || VRAM_MB="-1"

# ---- Offload-Info aus dem Server-Log (zuverlaessiger als nvidia-smi) --------
# || true in den Substitutionen: grep mit Exit 1 wuerde mit set -e das Script abbrechen
OFFLOAD="$(grep -E 'offloaded [0-9]+/[0-9]+ layers to GPU' "$LOG" | tail -1 | grep -oE '[0-9]+/[0-9]+ layers to GPU' || true)"
[ -n "$OFFLOAD" ] || OFFLOAD="keine GPU-Offload-Zeile"
MODEL_MB="$(grep -oE 'model size = [0-9.]+ MiB' "$LOG" | tail -1 | grep -oE '[0-9.]+' || true)"
[ -n "$MODEL_MB" ] || MODEL_MB="-1"

# ---- API-Helfer -------------------------------------------------------------
post() { # <prompt> <max_tokens> — liefert das Antwort-JSON
  [ -n "${2:-}" ] || { echo "post(): max_tokens (\$2) ist leer" >&2; return 1; }
  jq -nc --arg p "$1" --argjson m "$2" \
    '{messages:[{role:"system",content:"You are a helpful assistant."},
                {role:"user",content:$p}],
      max_tokens:$m, temperature:('"$TEMP"'), stream:false}' \
    | curl -sf -m 300 -H 'Content-Type: application/json' -H 'Authorization: Bearer no-key' \
        --data-binary @- "$API/v1/chat/completions" | tee -a /tmp/bench-guff-last-resp.json
}

# ---- Prompt-Processing (langer Prompt, 1 Token Output) ----------------------
PP_RESP="$(post "$PP_PROMPT" 1)"
PP_TOK="$(jq -r '.usage.prompt_tokens' <<<"$PP_RESP")"
[ -n "$PP_TOK" ] || { echo "PP-Antwort ohne usage — siehe /tmp/bench-guff-last-resp.json" >&2; exit 1; }
# Server-seitige timings statt Wandzeit: die Wandzeit enthaelt Slot-Queueing
PP_TPS="$(jq -r '.timings.prompt_ms' <<<"$PP_RESP" | awk -v n="$PP_TOK" '{printf "%.1f", n/($1/1000)}')"

# ---- Generation (kurzer Prompt, viele Tokens) -------------------------------
# Essay-artiger Prompt, damit die Generation nicht nach wenigen Tokens per EOS stoppt
GEN_RESP="$(post "Write a detailed essay on the history and cultural impact of coffee, covering its origins, global spread, and modern significance." "$GEN_TOKENS")"
GEN_TOK="$(jq -r '.usage.completion_tokens' <<<"$GEN_RESP")"
[ -n "$GEN_TOK" ] || { echo "GEN-Antwort ohne usage — siehe /tmp/bench-guff-last-resp.json" >&2; exit 1; }
GEN_TPS="$(jq -r '.timings.predicted_ms' <<<"$GEN_RESP" | awk -v n="$GEN_TOK" '{printf "%.1f", n/($1/1000)}')"

# printf statt jq: kann bei leeren Werten nicht crashen, Defaults machen Fehler sichtbar
printf '{"quant":"%s","mtp":%s,"ctx":%s,"kv_t":"%s","pp_tokens":%s,"pp_tps":%s,"gen_tokens":%s,"gen_tps":%s,"vram_mb":%s,"offload":"%s","model_mb":%s}\n' \
  "$QUANT" "${MTP:-0}" "${CTX:-0}" "$KV_T" "${PP_TOK:-0}" "${PP_TPS:-0}" \
  "${GEN_TOK:-0}" "${GEN_TPS:-0}" "${VRAM_MB:--1}" "${OFFLOAD:-?}" "${MODEL_MB:--1}"
