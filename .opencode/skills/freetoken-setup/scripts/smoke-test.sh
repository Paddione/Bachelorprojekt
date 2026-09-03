#!/usr/bin/env bash
# smoke-test.sh — quick health check for the FreeToken server on :1919.
# Usage: bash .opencode/skills/freetoken-setup/scripts/smoke-test.sh [base-url]
set -uo pipefail
BASE="${1:-http://127.0.0.1:1919}"
REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)
fail=0

echo "== FreeToken smoke test: $BASE =="

health=$(curl -sf --max-time 5 "$BASE/health") || { echo "FAIL  /health unreachable — engine down?"; exit 1; }
echo "OK    /health: $health"
health_info=$(echo "$health" | python3 -c '
import json,sys
d=json.load(sys.stdin)
print("{}\t{}".format(d.get("model", ""), d.get("version", "")))' 2>/dev/null)
health_model=${health_info%%$'\t'*}
version=${health_info#*$'\t'}
[ -n "${version:-}" ] && echo "OK    engine version: $version" || { echo "FAIL  /health has no version"; fail=1; }

models=$(curl -sf --max-time 5 "$BASE/v1/models")
id=$(echo "$models" | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"][0]["id"])' 2>/dev/null)
[ -n "${id:-}" ] && echo "OK    /v1/models serves: $id" || { echo "WARN  /v1/models unparsable: $models"; fail=1; }
if [ -n "${health_model:-}" ] && [ -n "${id:-}" ] && [ "$health_model" != "$id" ]; then
  echo "FAIL  model mismatch: /health=$health_model /v1/models=$id"
  fail=1
fi

stats=$(curl -sf --max-time 5 "$BASE/v1/stats")
if [ -n "$stats" ]; then
  echo "OK    /v1/stats reachable; key fields:"
  echo "$stats" | python3 -c '
import json,sys
d=json.load(sys.stdin)
def walk(o,p=""):
    if isinstance(o,dict):
        for k,v in o.items(): walk(v,f"{p}.{k}" if p else k)
    elif isinstance(o,(int,float)) and any(t in p.lower() for t in ("tok","vram","occup","cache","req")):
        print(f"      {p} = {o}")
walk(d)' || echo "      (unparsable stats payload)"
  stats_info=$(echo "$stats" | python3 -c '
import json,sys
d=json.load(sys.stdin)
print("{}\t{}\t{}".format(d.get("model", {}).get("id", ""), d.get("kv", {}).get("total_pages", ""), d.get("kv", {}).get("page_size", 1)))' 2>/dev/null)
  stats_model=${stats_info%%$'\t'*}
  stats_rest=${stats_info#*$'\t'}
  kv_pages=${stats_rest%%$'\t'*}
  kv_page_size=${stats_rest#*$'\t'}
  if [ -n "${id:-}" ] && [ -n "${stats_model:-}" ] && [ "$id" != "$stats_model" ]; then
    echo "FAIL  model mismatch: /v1/models=$id /v1/stats=$stats_model"
    fail=1
  fi
  if ! [[ "${kv_pages:-}" =~ ^[0-9]+$ ]] || ! [[ "${kv_page_size:-}" =~ ^[0-9]+$ ]]; then
    cache=$(curl -sf --max-time 5 "$BASE/v1/cache/status" || true)
    cache_info=$(echo "$cache" | python3 -c '
import json,sys
d=json.load(sys.stdin).get("geometry", {})
print("{}\t{}".format(d.get("num_pages", ""), d.get("page_size", 1)))' 2>/dev/null || true)
    kv_pages=${cache_info%%$'\t'*}
    kv_page_size=${cache_info#*$'\t'}
  fi
  if [[ "${kv_pages:-}" =~ ^[0-9]+$ ]] && [[ "${kv_page_size:-}" =~ ^[0-9]+$ ]]; then
    kv_tokens=$((kv_pages * kv_page_size))
    echo "OK    usable KV capacity: $kv_tokens tokens"
    expected=$(cd "$REPO" && MODEL_ID="$id" node -e '
      const fs=require("fs"), json5=require("json5");
      const d=json5.parse(fs.readFileSync(".opencode/agent-models.jsonc","utf8"));
      const m=d.provider["freetoken-local"].models[process.env.MODEL_ID];
      if (m?.limit?.context) process.stdout.write(String(m.limit.context));' 2>/dev/null || true)
    if [[ "${expected:-}" =~ ^[0-9]+$ ]] && [ "$kv_tokens" -lt "$expected" ]; then
      echo "FAIL  usable KV $kv_tokens is below agent-models.jsonc limit $expected for $id"
      fail=1
    fi
  else
    echo "FAIL  /v1/stats has no numeric KV geometry"
    fail=1
  fi
else
  echo "FAIL  /v1/stats not reachable"
  fail=1
fi

# The API does not currently report max-running-requests. On the supported Windows
# workstation, inspect the authoritative ft serve command line and enforce the
# calibrated single-request contract. Other hosts retain endpoint-only validation.
if command -v powershell.exe >/dev/null 2>&1; then
  serve_cmd=$(powershell.exe -NoProfile -Command \
    '$p=Get-CimInstance Win32_Process | Where-Object { $_.Name -eq "ft.exe" -and $_.CommandLine -match " serve " } | Select-Object -First 1 -ExpandProperty CommandLine; if ($p) { $p }' \
    2>/dev/null | tr -d '\r')
  concurrency=$(printf '%s' "$serve_cmd" | sed -nE 's/.*--max-running-requests[[:space:]]+([0-9]+).*/\1/p')
  if [ "$concurrency" = "1" ]; then
    echo "OK    --max-running-requests 1"
  else
    echo "FAIL  live ft serve must use --max-running-requests 1 (found: ${concurrency:-missing})"
    fail=1
  fi
else
  echo "NOTE  concurrency process check skipped (powershell.exe unavailable)"
fi

# Context sanity: advertised max_model_len is NOT the usable KV budget.
adv=$(curl -sf --max-time 5 "$BASE/v1/models" | python3 -c '
import json,sys
d=json.load(sys.stdin)["data"][0]
print(d.get("max_model_len",""))' 2>/dev/null)
if [ -n "${adv:-}" ]; then
  echo "NOTE  advertised max_model_len=$adv — usable context = served KV tokens (-NumTokens), keep agent-models.jsonc in sync"
fi

exit $fail
