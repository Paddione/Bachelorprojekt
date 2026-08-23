#!/usr/bin/env bash
# freetoken-kv-ladder.sh -- Wachsender KV-Pool fuer FreeToken auf :1919.
#
# IDEE (2026-08-23): Statt statisch -NumTokens 131072 zu servieren (kostet
# dauerhaft Expert-Cache), klein starten und den KV-Pool stufig vergroessern,
# sobald eine Session tatsaechlich lang wird. Expert-Slots weichen dabei
# budget-konform -- sie sind nur LRU-Cache, die Gewichte bleiben im Host-RAM
# streambar. Kurz-Aufgaben behalten volle Decode-Geschwindigkeit, lange
# Aufgaben zahlen erst dann, wenn sie es sind.
#
# Der Client (opencode) friert limit.context beim Start ein -- deshalb gilt:
#   .opencode/agent-models.jsonc  ->  limit.context = LADDER_CEILING setzen!
# Die Stufen liegen immer UNTER der Decke, damit nie ein Request an der
# Engine-Kapazitaet scheitert ("Input sequence length exceeds").
#
# API-Kontrakt (api_server.py):
#   GET  /v1/cache/status  -> geometry: num_pages/page_size/moe_cache_size/
#                             unit_bytes/cache_budget_bytes
#   POST /v1/cache/rebuild {num_pages, moe_cache_size, mode:"if_idle"}
#                          -> wird abgelehnt, solange der Scheduler arbeitet;
#                             wir retry beim naechsten Poll.
#
# Usage (aus WSL):
#   nohup bash scripts/llm/freetoken-kv-ladder.sh --dry-run &   # beobachten
#   nohup bash scripts/llm/freetoken-kv-ladder.sh &             # aktiv
#
# Env/Flags: --dry-run | --once | --interval S | --ceiling T | --threshold F
set -uo pipefail

BASE="${FREETOKEN_BASE:-http://127.0.0.1:1919}"
INTERVAL="${LADDER_INTERVAL:-5}"          # Sekunden zwischen Polls
CEILING="${LADDER_CEILING:-200000}"       # obere KV-Grenze (= jsonc limit.context)
THRESHOLD="${LADDER_THRESHOLD:-0.5}"      # wachsen ab ctx >= threshold * aktuell
HWM_WINDOW="${LADDER_HWM_WINDOW:-60}"     # High-Water-Mark ueber letzte N Polls
MOE_FLOOR_FRAC="${LADDER_MOE_FLOOR:-0.10}" # Expert-Slots nie unter 10% des Bestands
DRY_RUN=0; ONCE=0
while [ $# -gt 0 ]; do case "$1" in
  --dry-run) DRY_RUN=1;; --once) ONCE=1;;
  --interval) INTERVAL="$2"; shift;; --ceiling) CEILING="$2"; shift;;
  --threshold) THRESHOLD="$2"; shift;;
  *) echo "unbekanntes Flag: $1"; exit 2;; esac; shift; done

log() { echo "[$(date +%H:%M:%S)] $*"; }

# --- State-Snapshot: Geometrie + Einheitskosten + aktuelles Context-HWM ------
read_state() { python3 - "$BASE" "$HWM_WINDOW" <<'PYEOF'
import json, sys, urllib.request
base, win = sys.argv[1], int(sys.argv[2])
def get(p):
    with urllib.request.urlopen(base + p, timeout=5) as r: return json.load(r)
try: st = get("/v1/cache/status")
except Exception as e: print(json.dumps({"error": f"status: {e}"})); sys.exit(0)
g = st.get("geometry") or {}
ub = g.get("unit_bytes") or {}
out = {
  "pages": g.get("num_pages"), "page_size": g.get("page_size") or 1,
  "moe": g.get("moe_cache_size"), "mamba_slots": g.get("num_mamba_slots"),
  "kv_b": ub.get("kv_per_token"), "moe_b": ub.get("moe_per_expert"),
  "mamba_b": ub.get("mamba_per_slot"), "budget_b": g.get("cache_budget_bytes"),
  "state": st.get("state"), "model": None, "ctx_seen": 0,
}
try: out["model"] = get("/v1/stats").get("model", {}).get("id")
except Exception: pass
# Context-HWM: Requests-Ring defensiv parsen (Feldnamen nicht fest verankert).
try:
    reqs = get("/v1/requests?limit=32").get("entries", [])
    vals = []
    def hunt(o):
        if isinstance(o, dict):
            for k, v in o.items():
                if isinstance(v, (int, float)) and any(t in k.lower() for t in
                    ("prompt", "input", "context")) and "total" not in k.lower():
                    vals.append(int(v))
                elif isinstance(v, (dict, list)): hunt(v)
        elif isinstance(o, list):
            for i in o: hunt(i)
    hunt(reqs); out["ctx_seen"] = max(vals) if vals else 0
except Exception: pass
print(json.dumps(out))
PYEOF
}

# --- Ziel-Partition: KV auf naechste Stufe, MoE budget-konform zurueck -------
plan_step() { python3 - "$1" "$CEILING" "$THRESHOLD" "$MOE_FLOOR_FRAC" <<'PYEOF'
import json, sys, math
s, ceiling, thr, moe_floor_frac = json.loads(sys.argv[1]), int(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4])
if s.get("error"): print(json.dumps({"action": "wait", "why": s["error"]})); sys.exit(0)
ps = s["page_size"] or 1
kv_now = (s["pages"] or 0) * ps
need = int((s["ctx_seen"] or 0) > thr * kv_now)
budget = s["budget_b"] or 0; kb, mb, sb = s["kv_b"] or 0, s["moe_b"] or 0, s["mamba_b"] or 0
fixed = (s["mamba_slots"] or 0) * sb
moe_max_fit = max(0, int((budget - fixed - kv_now * kb) // mb)) if mb else 0
moe_floor = max(1, int((s["moe"] or 1) * moe_floor_frac))
if not need or not kb or not budget:
    print(json.dumps({"action": "hold", "kv_now": kv_now, "ctx_seen": s["ctx_seen"],
                      "thr_at": int(thr * kv_now)})); sys.exit(0)
target = min(ceiling, kv_now * 2)              # verdoppeln, Decke respektieren
target = min(target, int((budget - fixed - moe_floor * mb) // kb))  # hart budget-konform
if target <= kv_now:
    print(json.dumps({"action": "cap", "kv_now": kv_now, "why": "kein VRAM-Spielraum ueber Floor"})); sys.exit(0)
moe_new = max(moe_floor, min(s["moe"] or 0, int((budget - fixed - target * kb) // mb)))
print(json.dumps({"action": "grow", "from": kv_now, "to": target,
                  "moe_from": s["moe"], "moe_to": moe_new,
                  "frees_gb": round(((s["moe"] or 0) - moe_new) * mb / 1e9, 2)}))
PYEOF
}

apply() { # $1=num_pages $2=moe_cache_size
  [ "$DRY_RUN" = 1 ] && { log "DRY-RUN wuerde setzen: num_pages=$1 moe=$2"; return 0; }
  code=$(curl -s -o /tmp/opencode/ladder-rebuild.json -w '%{http_code}' --max-time 310 \
    -X POST "$BASE/v1/cache/rebuild" -H 'Content-Type: application/json' \
    -d "{\"num_pages\": $1, \"moe_cache_size\": $2, \"mode\": \"if_idle\"}")
  if [ "$code" = 200 ]; then log "OK   Pool neu gesetzt: kv_tokens=$1 moe_slots=$2"
  else log "REJECT ($code) -- Scheduler busy oder Floor verletzt; Retry naechster Poll: $(head -c 200 /tmp/opencode/ladder-rebuild.json)"; fi
}

log "FreeToken KV-Ladder startet: base=$BASE ceiling=$CEILING threshold=$THRESHOLD interval=${INTERVAL}s dry_run=$DRY_RUN"
log "WICHTIG: .opencode/agent-models.jsonc limit.context muss >= $CEILING sein (Plugin liest sie beim opencode-Start)."
while true; do
  state=$(read_state); plan=$(plan_step "$state")
  action=$(echo "$plan" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("action","wait"))' 2>/dev/null || echo wait)
  case "$action" in
    grow) to=$(echo "$plan" | python3 -c 'import json,sys; print(json.load(sys.stdin)["to"])')
          mo=$(echo "$plan" | python3 -c 'import json,sys; print(json.load(sys.stdin)["moe_to"])')
          fr=$(echo "$plan" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("frees_gb","?"))')
          log "WACHSTUM: ctx-HWM hat Schwelle erreicht -> kv -> $to (moe -> $mo, gibt ${fr} GB frei)"
          apply "$to" "$mo" ;;
    hold) : ;;   # ruhig bleiben, kein Spam
    cap)  once_cap=$((once_cap++)); [ "${once_cap:-0}" -le 1 ] && log "GRENZE: $(echo "$plan" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("why",""))')";;
    *)    log "WARTE: $(echo "$plan" | head -c 160)";;
  esac
  [ "$ONCE" = 1 ] && { log "STATE: $(echo "$state" | head -c 220)"; log "PLAN:  $plan"; }
  [ "$ONCE" = 1 ] && { log "--once: fertig."; break; }
  sleep "$INTERVAL"
done
