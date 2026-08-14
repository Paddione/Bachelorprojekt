#!/usr/bin/env bash
# eval-runner.sh — T002629
# Adapter gegen Eval-Harness messen -> Scores in DB schreiben.
#
# Aufruf:
# eval-runner.sh --adapter <adapter> --role <role> [--testset <path>] [--endpoint <url>] [--model <slug>] [--db-url <url>] [--dry-run]

set -euo pipefail

# --- Basis-Pfade (VOR der ersten Nutzung berechnen — CWD-unabhängig, T004445 Review-Fix) ---
FINETUNE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- Defaults ---
TESTSET="$FINETUNE_DIR/testsets/agent-actions.jsonl"
ENDPOINT="http://127.0.0.1:18235/v1"
MODEL=""
DB_URL=""
DRY_RUN=false

# --- Helper ---
usage() {
    cat <<EOF
Usage: $(basename "$0") --adapter <name> --role <role> [options]

Options:
  --adapter <name>   Name des Adapters in der Registry (Pflicht)
  --role <role>      Eine der Rollen: scout|review-lens|commit-msg|triage (Pflicht)
  --testset <path>   Pfad zum Testset (Default: $TESTSET)
  --endpoint <url>   LLM-Endpunkt (Default: $ENDPOINT)
  --model <slug>     Modell-Slug am Endpunkt (Default: <adapter>-Name)
  --db-url <url>     MODEL_REGISTRY_DB_URL setzen
  --dry-run          Keine DB-Schreibzugriffe
  --help             Zeige Hilfe
EOF
    exit "${1:-1}"
}

# Rollen-Whitelist (T004445 Review-Fix: Tippfehler statt stiller Speicherung)
VALID_ROLES=" scout review-lens commit-msg triage "
validate_role() {
    [[ "$VALID_ROLES" == *" $1 "* ]]
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
        --role) ROLE="$2"; shift 2 ;;
        --testset) TESTSET="$2"; shift 2 ;;
        --endpoint) ENDPOINT="$2"; shift 2 ;;
        --model) MODEL="$2"; shift 2 ;;
        --db-url) DB_URL="$2"; shift 2 ;;
        --dry-run) DRY_RUN=true; shift ;;
        --help) usage 0 ;;
        *) echo "Unknown option: $1" >&2; usage ;;
    esac
done

# Validierung Pflichtfelder
[[ -z "${ADAPTER:-}" ]] && { echo "Error: --adapter is required" >&2; usage; }
[[ -z "${ROLE:-}" ]] && { echo "Error: --role is required" >&2; usage; }
validate_role "$ROLE" || { echo "Error: invalid role '$ROLE' — erlaubt: scout|review-lens|commit-msg|triage" >&2; usage; }
[[ -z "${MODEL:-}" ]] && MODEL="$ADAPTER"
export MODEL_REGISTRY_DB_URL="${DB_URL:-${MODEL_REGISTRY_DB_URL:-}}"

# 1. Testset Validierung
python3 "$FINETUNE_DIR/eval_scoring.py" validate-testset "$TESTSET" || {
    echo "Error: Testset validation failed" >&2
    exit 1
}

# 2. Generierungs-Schritt (Python Heredoc)
# Erzeugt den Report als JSON auf stdout. Analog zu gen_fixtures.py.
PY_OUT="$(mktemp)"
set +e
python3 - "$TESTSET" "$ENDPOINT" "$MODEL" "$ADAPTER" "$ROLE" "$DRY_RUN" "$FINETUNE_DIR" >"$PY_OUT" <<'PYEOF'
import json
import sys
import urllib.request
import urllib.error
from pathlib import Path

# Werte kommen als argv (kein Shell-Interpolation-Risiko im Heredoc)
TESTSET_PATH, ENDPOINT, MODEL, ADAPTER, ROLE, DRY_RUN, FINETUNE_DIR = sys.argv[1:8]
ENDPOINT = ENDPOINT.rstrip("/")

sys.path.insert(0, FINETUNE_DIR)
try:
    from eval_harness import MAX_NEW_TOKENS, build_prompt, parse_action_output
    from eval_scoring import score_case, load_testset
except ImportError as e:
    print(f"Import Error: {e}", file=sys.stderr)
    sys.exit(1)

MAX_TOKENS = MAX_NEW_TOKENS

def post_json(url, payload, timeout=60):
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))

def extract_text(response):
    choices = response.get("choices") or []
    if not choices:
        raise ValueError("Antwort ohne choices")
    choice = choices[0]

    # T002277: Reasoning-Fall (finish_reason=length + leerer content)
    if choice.get("finish_reason") == "length" and not (choice.get("message") or {}).get("content"):
        raise ValueError("leerer content bei finish_reason=length — max_tokens zu klein")

    if "message" in choice:
        return (choice.get("message") or {}).get("content") or ""
    return choice.get("text") or ""

def run():
    try:
        cases = load_testset(TESTSET_PATH)
    except Exception as e:
        print(f"Error loading testset: {e}", file=sys.stderr)
        sys.exit(1)

    results = []
    partitions = {}  # class -> [scores]

    for case in cases:
        payload = {
            "model": MODEL,
            "prompt": build_prompt(case),
            "temperature": 0,
            "max_tokens": MAX_TOKENS,
        }
        url = f"{ENDPOINT}/completions"

        try:
            resp = post_json(url, payload)
            actual_text = extract_text(resp)

            actual_actions = parse_action_output(actual_text)

            score_res = score_case(case, actual_actions)
            score = score_res["score"]

            results.append(score)
            cls = case.get("class", "unknown")
            if cls not in partitions:
                partitions[cls] = []
            partitions[cls].append(score)

        except urllib.error.URLError as e:
            print(f"Error: Endpunkt nicht erreichbar ({e})", file=sys.stderr)
            sys.exit(2)
        except ValueError as e:
            print(f"Error: {e}", file=sys.stderr)
            sys.exit(1)
        except Exception as e:
            print(f"Error during generation: {e}", file=sys.stderr)
            sys.exit(1)

    if not results:
        print("Error: No cases processed", file=sys.stderr)
        sys.exit(1)

    overall_score = sum(results) / len(results)
    by_partition = {cls: (sum(s) / len(s)) for cls, s in partitions.items()}

    report = {
        "adapter": ADAPTER,
        "role": ROLE,
        "testset": TESTSET_PATH,
        "cases_total": len(cases),
        "score": round(overall_score, 4),
        "by_partition": by_partition,
        "harness_version": "eval-harness-1",
        "dry_run": DRY_RUN == "true",
    }
    print(json.dumps(report, indent=2))

if __name__ == "__main__":
    run()
PYEOF
PY_RET=$?
set -e
REPORT="$(cat "$PY_OUT")"
rm -f "$PY_OUT"
if [ "$PY_RET" -ne 0 ]; then
    echo "Error: Generation/Scoring failed (python exit $PY_RET)" >&2
    exit "$PY_RET"
fi

# 3. DB-Update (wenn nicht --dry-run)
if [[ "$DRY_RUN" == "false" ]]; then
    # a. insert_adapter — get-or-create (existierende Metadaten bleiben erhalten).
    # Werte als psql-Variablen (:'var'), SQL ueber stdin: psql ersetzt :'var'
    # NUR bei stdin/-f, nicht bei -c (T004445 Review-Fix). Quoting macht psql.
    ADAPTER_ID=$(registry_psql -t -A -v adapter="$ADAPTER" <<'SQL'
SELECT model_registry.insert_adapter(:'adapter', 'unknown', NULL);
SQL
    ) || {
        echo "Error: DB update (insert_adapter) failed" >&2
        exit 1
    }

    # b. upsert_eval_score
    # Wir extrahieren den Score aus dem JSON Report
    SCORE=$(echo "$REPORT" | python3 -c "import sys, json; print(json.load(sys.stdin)['score'])")

    if ! registry_psql -v adapter_id="$ADAPTER_ID" -v role="$ROLE" -v score="$SCORE" <<'SQL'
SELECT model_registry.upsert_eval_score(:'adapter_id'::int, :'role', :'score'::float, 'eval-harness-1');
SQL
    then
        echo "Error: DB update (upsert_eval_score) failed" >&2
        exit 1
    fi
fi

echo "$REPORT"
exit 0
