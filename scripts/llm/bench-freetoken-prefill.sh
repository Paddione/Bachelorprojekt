#!/usr/bin/env bash
# scripts/llm/bench-freetoken-prefill.sh — Prefill- und Decode-Durchsatz eines
# FreeToken-Servers (ft serve) messen, getrennt nach kalt/Radix-Cache-Treffer.
#
# WARUM ES DAS GIBT: Bei Qwen3.6-35B-A3B-NVFP4 auf einer RTX 5070 Ti (16 GB,
# MoE-Offload) ist Decode gesund, Prefill aber um Groessenordnungen langsamer als
# der Wert, den der Server selbst unter /v1/stats als `prefill_tps` meldet.
# Gemessen 2026-08-23 gegen ft 0.1.1+g30aa89115, Default-Flags
# (`ft serve --model … --host 0.0.0.0 --num-tokens 32768`):
#
#     7.490 Tok ->  53,4 s   (7,13 ms/Tok)
#     9.576 Tok ->  67,9 s   (7,09 ms/Tok)
#    20.341 Tok -> 162,4 s   (7,98 ms/Tok)
#    26.011 Tok -> 226,1 s   (8,69 ms/Tok)
#    identischer Prompt erneut: 2,44 s  (Radix-Prefix-Cache, funktioniert)
#
# `prefill_tps` aus /v1/stats ist eine Kernel-Kennzahl und NICHT die Wanduhr —
# es meldete 10.806 Tok/s, waehrend die Wanduhr 115 Tok/s ergab. Deshalb misst
# dieses Skript ausschliesslich end-to-end und gibt die Serverzahl nur zum
# Vergleich mit aus.
#
# Vergleichbarkeit:
#   - Fester Seed -> zwei Laeufe erzeugen denselben Prompt.
#   - --tag haengt an jede Zeile, welche Servervariante lief (Flags/Env), damit
#     eine Zahl ohne ihre Konfiguration nicht in die Ablage wandert.
#   - Der kalte Lauf variiert den Prompt je --tag, sonst misst man den
#     Radix-Cache statt des Prefills.
#
# Usage:
#   bash scripts/llm/bench-freetoken-prefill.sh --tag baseline
#   bash scripts/llm/bench-freetoken-prefill.sh --tag hit-d2d --tokens 4000,8000,16000
#   bash scripts/llm/bench-freetoken-prefill.sh --help
set -euo pipefail

BASE_URL="${FT_BASE_URL:-http://127.0.0.1:1919}"
TOKENS="4000,8000,16000"
TAG="untagged"
DECODE_TOKENS=200

usage() { sed -n '2,40p' "$0" | sed 's|^# \{0,1\}||'; exit 0; }

while [ $# -gt 0 ]; do
  case "$1" in
    --help|-h) usage ;;
    --tag) TAG="$2"; shift 2 ;;
    --tokens) TOKENS="$2"; shift 2 ;;
    --base-url) BASE_URL="$2"; shift 2 ;;
    --decode-tokens) DECODE_TOKENS="$2"; shift 2 ;;
    *) echo "unbekanntes Argument: $1" >&2; exit 2 ;;
  esac
done

command -v curl >/dev/null || { echo "curl fehlt" >&2; exit 1; }
command -v python3 >/dev/null || { echo "python3 fehlt" >&2; exit 1; }

health="$(curl -sS --max-time 10 "$BASE_URL/health")" || { echo "Server auf $BASE_URL nicht erreichbar" >&2; exit 1; }
MODEL="$(printf '%s' "$health" | python3 -c 'import json,sys;print(json.load(sys.stdin)["model"])')"
FTVER="$(printf '%s' "$health" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("version","?"))')"

echo "# Messbasis"
echo "#   base_url = $BASE_URL"
echo "#   model    = $MODEL"
echo "#   version  = $FTVER"
echo "#   tag      = $TAG"
cat > /tmp/ftbench_geo.py <<'PY'
import json,sys
g=json.load(sys.stdin)["geometry"]
u=g["unit_bytes"]
tot=g["num_experts"]*g["num_moe_layers"]
mc=g["moe_cache_size"]
print("#   experten = %d/%d Slots (%.1f%% resident, %.2f GiB)" % (mc,tot,100*mc/tot,mc*u["moe_per_expert"]/2**30))
print("#   kv       = %d Tokens (%.2f GiB)" % (g["num_pages"],g["num_pages"]*u["kv_per_token"]/2**30))
print("#   mamba    = %d Slots (%.2f GiB)" % (g["num_mamba_slots"],g["num_mamba_slots"]*u["mamba_per_slot"]/2**30))
print("#   budget   = %.2f GiB" % (g["cache_budget_bytes"]/2**30))
PY
curl -sS --max-time 10 "$BASE_URL/v1/cache/status" | python3 /tmp/ftbench_geo.py
echo
printf '%-10s %-8s %10s %10s %10s %12s\n' TAG PHASE TOKENS WALL_S TOK_PER_S MS_PER_TOK

mkreq() { # $1=zieltokens $2=salt $3=max_tokens $4=prompt-praefix-modus
  cat > /tmp/ftbench_mk.py <<'PY'
import json,random,sys
target,salt,maxtok,model=int(sys.argv[1]),sys.argv[2],int(sys.argv[3]),sys.argv[4]
random.seed(hash(salt) & 0xffffffff)
w=['Ableitung','Kennwert','Vorgabe','Strecke','Beitrag','Rahmen','Vorlauf','Gewicht',
   'Schnitt','Anlage','Reaktor','Zeitplan','Messwert','Deckung','Streuung','Ertrag']
# ~1,35 Tokens je Wort bei deutschem Fuelltext -> Wortzahl daraus ableiten
words=int(target/1.35)
per=28
lines=[f"Satz {i}: "+" ".join(random.choice(w) for _ in range(per)) for i in range(words//per+1)]
body="\n".join(lines)+"\n\nAntworte nur mit OK."
json.dump({"model":model,"messages":[{"role":"user","content":body}],
           "max_tokens":maxtok,"temperature":0.0,
           "chat_template_kwargs":{"enable_thinking":False}},sys.stdout)
PY
  python3 /tmp/ftbench_mk.py "$1" "$2" "$3" "$MODEL"
}

run() { # $1=label $2=payloadfile -> setzt WALL, PTOK
  local t0 t1
  t0=$(date +%s.%N)
  curl -sS --max-time 900 "$BASE_URL/v1/chat/completions" \
    -H 'Content-Type: application/json' -d @"$2" -o /tmp/ftbench.out
  t1=$(date +%s.%N)
  WALL=$(python3 -c "print(f'{$t1-$t0:.2f}')")
  PTOK=$(python3 -c 'import json;print(json.load(open("/tmp/ftbench.out"))["usage"]["prompt_tokens"])')
  CTOK=$(python3 -c 'import json;print(json.load(open("/tmp/ftbench.out"))["usage"]["completion_tokens"])')
}

row() { printf '%-10s %-8s %10s %10s %10s %12s\n' "$TAG" "$1" "$2" "$3" \
        "$(python3 -c "print(f'{$2/$3:.1f}')")" "$(python3 -c "print(f'{1000*$3/$2:.2f}')")"; }

# Decode: kurzer Prompt, viele Ausgabetoken. Eigener Payload — der Prefill-Fuelltext
# endet auf "Antworte nur mit OK" und wuerde hier 2 statt DECODE_TOKENS Tokens erzeugen.
cat > /tmp/ftbench_dec.py <<'PY'
import json,sys
model,maxtok=sys.argv[1],int(sys.argv[2])
json.dump({"model":model,
           "messages":[{"role":"user","content":"Zaehle von 1 bis 400, nur die Zahlen, kommagetrennt, ohne weiteren Text."}],
           "max_tokens":maxtok,"temperature":0.0,"ignore_eos":True,
           "chat_template_kwargs":{"enable_thinking":False}},sys.stdout)
PY
python3 /tmp/ftbench_dec.py "$MODEL" "$DECODE_TOKENS" > /tmp/ftbench.decode.json
run decode /tmp/ftbench.decode.json
row decode "$CTOK" "$WALL"

IFS=',' read -ra SIZES <<< "$TOKENS"
for n in "${SIZES[@]}"; do
  mkreq "$n" "cold-$TAG-$n" 4 > /tmp/ftbench.p.json
  run "prefill-$n" /tmp/ftbench.p.json
  row prefill "$PTOK" "$WALL"
  # Zweiter Lauf mit identischem Prompt: muss den Radix-Cache treffen
  run "cached-$n" /tmp/ftbench.p.json
  row cached "$PTOK" "$WALL"
done

echo
echo "# Serverzahlen zum Vergleich (NICHT die Wanduhr):"
cat > /tmp/ftbench_st.py <<'PY'
import json,sys
d=json.load(sys.stdin)
print("#   throughput =",d["throughput"])
print("#   vram_bytes = %.2f GiB" % (d["vram_bytes"]/2**30))
PY
curl -sS --max-time 10 "$BASE_URL/v1/stats" | python3 /tmp/ftbench_st.py
