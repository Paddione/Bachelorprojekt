#!/usr/bin/env bash
# smoke-test.sh — quick health check for the FreeToken server on :1919.
# Usage: bash .opencode/skills/freetoken-setup/scripts/smoke-test.sh [base-url]
set -uo pipefail
BASE="${1:-http://127.0.0.1:1919}"
fail=0

echo "== FreeToken smoke test: $BASE =="

health=$(curl -sf --max-time 5 "$BASE/health") || { echo "FAIL  /health unreachable — engine down?"; exit 1; }
echo "OK    /health: $health"

models=$(curl -sf --max-time 5 "$BASE/v1/models")
id=$(echo "$models" | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"][0]["id"])' 2>/dev/null)
[ -n "${id:-}" ] && echo "OK    /v1/models serves: $id" || { echo "WARN  /v1/models unparsable: $models"; fail=1; }

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
else
  echo "WARN  /v1/stats not reachable"
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
