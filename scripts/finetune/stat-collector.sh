#!/usr/bin/env bash
# stat-collector.sh — T002629
# Stat-Requirements messen (VRAM, max. Kontext, Durchsatz, Ladezeit) -> in die DB schreiben.
#
# Aufruf:
# stat-collector.sh --adapter <adapter> [--endpoint <url>] [--db-url <url>] [--dry-run] [--json]

set -euo pipefail

# --- Defaults ---
ENDPOINT="http://127.0.0.1:18235/v1"
DB_URL=""
DRY_RUN=false
JSON_OUTPUT=false

# --- Helper ---
usage() {
    cat <<EOF
Usage: $(basename "$0") --adapter <name> [options]

Options:
  --adapter <name>   Name des Adapters in der Registry (Pflicht)
  --endpoint <url>   LLM-Endpunkt (Default: $ENDPOINT)
  --db-url <url>     MODEL_REGISTRY_DB_URL setzen
  --dry-run          Keine DB-Schreibzugriffe
  --json             Report als JSON auf stdout (Default: menschenlesbar)
  --help             Zeige Hilfe
EOF
    exit 1
}

registry_psql() {
    if [[ -n "${MODEL_REGISTRY_DB_URL:-}" ]]; then
        psql "$MODEL_REGISTRY_DB_URL" "$@"
    else
        # [T002626] SDLC-Daten liegen lokal im k3d-Cluster; die fleet-Kopie ist
        # eingefroren. Ohne --context landen Schreibzugriffe in der falschen DB.
        kubectl --context k3d-mentolder-dev exec -i -n workspace deploy/shared-db -- psql -U website -d website "$@"
    fi
}

# --- Parse Args ---
while [[ $# -gt 0 ]]; do
    case "$1" in
        --adapter) ADAPTER="$2"; shift 2 ;;
        --endpoint) ENDPOINT="$2"; shift 2 ;;
        --db-url) DB_URL="$2"; shift 2 ;;
        --dry-run) DRY_RUN=true; shift ;;
        --json) JSON_OUTPUT=true; shift ;;
        --help) usage ;;
        *) echo "Unknown option: $1" >&2; usage ;;
    esac
done

# Validierung
[[ -z "${ADAPTER:-}" ]] && { echo "Error: --adapter is required" >&2; usage; }
export MODEL_REGISTRY_DB_URL="${DB_URL:-${MODEL_REGISTRY_DB_URL:-}}"

# --- Messungen ---

# 1. Durchsatz (tok/s)
# Kleine Completion: "print the numbers 1 to 200 one per line"
# --dry-run ueberspringt die Messung komplett (kein Netzwerkzugriff) — der
# Test-Pfad darf nie gegen einen echten Endpunkt messen.
FINETUNE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
THROUGHPUT="null"
if [[ "$DRY_RUN" == "false" ]]; then
THROUGHPUT=$(python3 - "$ENDPOINT" "$ADAPTER" <<'PYEOF' || echo "null"
import json
import sys
import time
import urllib.request

ENDPOINT, MODEL = sys.argv[1:3]
ENDPOINT = ENDPOINT.rstrip("/")
PROMPT = "print the numbers 1 to 200 one per line"
MAX_TOKENS = 200

def run_test():
    url = f"{ENDPOINT}/completions"
    payload = {
        "model": MODEL,
        "prompt": PROMPT,
        "temperature": 0,
        "max_tokens": MAX_TOKENS,
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        start = time.time()
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        end = time.time()

        usage = data.get("usage", {}).get("completion_tokens", MAX_TOKENS)
        duration = end - start
        if duration > 0:
            return round(usage / duration, 2)
        return None
    except Exception:
        return None

res = run_test()
if res is not None:
    print(res)
else:
    print("null")
PYEOF
)
fi

# 2. max_context (NULL lassen, wird später manuell/via loadouts.json gesetzt)
MAX_CONTEXT="null"

# 3. VRAM (MB)
VRAM="null"
if command -v nvidia-smi >/dev/null 2>&1; then
    VRAM=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits | head -n 1 || echo "null")
fi

# 4. load_time_ms (NULL lassen, da Server-Neustart nötig)
LOAD_TIME="null"

# --- Report Erstellung ---
if [[ "$JSON_OUTPUT" == "true" ]]; then
    # JSON Output
    printf '{"adapter": "%s", "throughput_toks": %s, "vram_mb": %s, "max_context": %s, "load_time_ms": %s, "dry_run": %s}\n' \
        "$ADAPTER" \
        "${THROUGHPUT:-null}" \
        "${VRAM:-null}" \
        "${MAX_CONTEXT:-null}" \
        "${LOAD_TIME:-null}" \
        "$DRY_RUN"
else
    # Menschenlesbar
    echo "--- Stat-Collector Report ($ADAPTER) ---"
    echo "Throughput: ${THROUGHPUT:-NULL} tok/s"
    echo "VRAM:       ${VRAM:-NULL} MB"
    echo "Max Context: ${MAX_CONTEXT:-NULL}"
    echo "Load Time:  ${LOAD_TIME:-NULL} ms"
    echo "Dry Run:    $DRY_RUN"
fi

# --- DB-Update (wenn nicht --dry-run) ---
if [[ "$DRY_RUN" == "false" ]]; then
    # a. insert_adapter
    ADAPTER_ID=$(registry_psql -t -A -c "SELECT model_registry.insert_adapter('$ADAPTER', 'unknown', NULL);" || echo "")
    if [[ -z "$ADAPTER_ID" ]]; then
        echo "Error: DB update (insert_adapter) failed" >&2
        exit 1
    fi

    # b. upsert_stat_requirements
    to_sql_val() {
        if [[ "$1" == "null" || "$1" == "NULL" ]]; then echo "NULL"; else echo "$1"; fi
    }

    SQL_VRAM=$(to_sql_val "$VRAM")
    SQL_THROUGHPUT=$(to_sql_val "$THROUGHPUT")
    SQL_MAX_CTX=$(to_sql_val "$MAX_CONTEXT")
    SQL_LOAD=$(to_sql_val "$LOAD_TIME")

    registry_psql -c "SELECT model_registry.upsert_stat_requirements('$ADAPTER_ID', $SQL_VRAM, $SQL_MAX_CTX, $SQL_THROUGHPUT, $SQL_LOAD);" || {
        echo "Error: DB update (upsert_stat_requirements) failed" >&2
        exit 1
    }
fi

exit 0
