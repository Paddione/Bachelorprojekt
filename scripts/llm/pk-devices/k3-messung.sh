#!/usr/bin/env bash
# K3-Messung: tok/s (prompt/decode) je Unterstuetzermodell ueber den llm-proxy.
# MESSUNG (T002717): Befehl + Repo-Stand dokumentieren; Ergebnisse als
# Ticket-Kommentar (T006842).
#
# Aufruf:
#   k3-messung.sh qwen3.5-4b@q6_k            # PK-L-1 (Qwen3.5-4B Q6_K)
#   k3-messung.sh gemma-4-12b@ud-iq3_xxs     # PK-Tablet (Gemma 4 12B IQ3_XXS)
#
# Vorbedingungen: llm-proxy auf :18235 laeuft, lmstudio-Backend enabled
# (tickets.llm_proxy_backends), Modell auf dem Geraet geladen.
set -euo pipefail

MODEL="${1:?Modell-Slot-ID fehlt (qwen3.5-4b@q6_k | gemma-4-12b@ud-iq3_xxs)}"
LAEUFE="${2:-5}"
PROXY="${LLM_PROXY_URL:-http://localhost:18235}"

HEAD=$(git -C "$(git rev-parse --show-toplevel 2>/dev/null || pwd)" rev-parse HEAD 2>/dev/null || echo "n/a")
echo "REPO-HEAD=$HEAD"
echo "MODELL=$MODEL VIA=$PROXY (Alias -> lmstudio/1234 -> Geraet)"
echo "THINKING=default (enable_thinking per chat_template_kwargs wurde vom Geraete-Server ignoriert - Befund 2026-08-15)"
echo "PROMPT=~60 Tokens fix, MAX_TOKENS=128, $LAEUFE Laeufe"

for i in $(seq 1 "$LAEUFE"); do
  start=$(date +%s.%N)
  curl -s -X POST "$PROXY/v1/chat/completions" \
    -H 'Content-Type: application/json' \
    -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"Erklaere kurz in drei Saetzen, was ein Transformer-Sprachmodell ist und wie es Text generiert. Antworte auf Deutsch.\"}],\"max_tokens\":128,\"stream\":false}" \
    -o "/tmp/k3-${MODEL//[^a-zA-Z0-9]/_}-$i.json"
  end=$(date +%s.%N)
  wall=$(echo "$end - $start" | bc)
  pt=$(jq '.usage.prompt_tokens // 0' "/tmp/k3-${MODEL//[^a-zA-Z0-9]/_}-$i.json")
  ct=$(jq '.usage.completion_tokens // 0' "/tmp/k3-${MODEL//[^a-zA-Z0-9]/_}-$i.json")
  rt=$(jq '.usage.completion_tokens_details.reasoning_tokens // 0' "/tmp/k3-${MODEL//[^a-zA-Z0-9]/_}-$i.json")
  fr=$(jq -r '.choices[0].finish_reason // "?"' "/tmp/k3-${MODEL//[^a-zA-Z0-9]/_}-$i.json")
  echo "Lauf$i: wall=${wall}s prompt=${pt}tok completion=${ct}tok reasoning=${rt}tok finish=${fr}"
done
