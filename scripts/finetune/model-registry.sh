#!/usr/bin/env bash
# model-registry.sh — T002629
# CLI-Tool zur Verwaltung der Model Registry (Adapter-Registrierung, Evaluation & Stats)
#
# Aufrufbeispiele:
#   ./model-registry.sh register my-adapter gpt-4o --quant q4_k_m --corpus "wiki"
#   ./model-registry.sh eval my-adapter reasoning --testset tests/eval.json
#   ./model-registry.sh list --role reasoning --min-score 0.8
#   ./model-registry.sh export-loadout my-adapter

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- Helper & DB ---

registry_psql() {
    if [[ -n "${MODEL_REGISTRY_DB_URL:-}" ]]; then
        psql "$MODEL_REGISTRY_DB_URL" "$@"
    else
        kubectl --context k3d-mentolder-dev exec -i -n workspace deploy/shared-db -- psql -U website -d website "$@"
    fi
}

usage() {
    cat <<EOF
Usage: $(basename "$0") <command> [arguments]

Commands:
  register <name> <base_model> [--quant Q] [--corpus c] [--lora-rank r] [--lora-alpha a] [--git-commit sha] [--training-config json] [--db-url url]
    Registriert einen neuen Adapter in der Registry.
  eval <adapter> <role> [--testset path] [--endpoint url] [--dry-run] [--db-url url]
    Startet die Evaluation eines Adapters.
  stats <adapter> [--dry-run] [--db-url url]
    Zeigt Statistiken für einen Adapter an.
  list [--role X] [--min-score 0.X] [--db-url url]
    Listet Adapter auf.
  export-loadout <adapter> [--db-url url]
    Generiert einen loadouts.json-Block für den Operator.
  --help | -h
    Zeige Hilfe an.

EOF
    exit "${1:-1}"
}

# --- Subcommands ---

cmd_register() {
    local name="" base_model="" quant="" corpus="" lora_rank="" lora_alpha="" git_commit="" training_config="" db_url=""

    # Simple argument parsing (positional first)
    if [[ $# -lt 2 ]]; then usage; fi
    name="$1"; shift
    base_model="$1"; shift

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --quant) quant="$2"; shift 2 ;;
            --corpus) corpus="$2"; shift 2 ;;
            --lora-rank) lora_rank="$2"; shift 2 ;;
            --lora-alpha) lora_alpha="$2"; shift 2 ;;
            --git-commit) git_commit="$2"; shift 2 ;;
            --training-config) training_config="$2"; shift 2 ;;
            --db-url) db_url="$2"; shift 2 ;;
            *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
        esac
    done

    # Handle DB URL
    export MODEL_REGISTRY_DB_URL="${db_url:-${MODEL_REGISTRY_DB_URL:-}}"

    # 1. Insert Adapter — Werte als psql-Variablen, SQL ueber stdin (psql
    # ersetzt :'var' nur bei stdin/-f, nicht bei -c; T004445 Review-Fix).
    # NULLIF(:'quant','') => NULL bei ungesetztem --quant.
    local adapter_id
    adapter_id=$(registry_psql -t -A \
      -v name="$name" -v base_model="$base_model" -v quant="${quant:-}" <<'SQL' || { echo "DB error during adapter insertion" >&2; exit 1; }
SELECT model_registry.insert_adapter(:'name', :'base_model', NULLIF(:'quant',''));
SQL
    )

    if [[ -z "$adapter_id" ]]; then
        echo "Error: Failed to get adapter ID." >&2
        exit 1
    fi

    # 2. Provenance (if any) — ebenfalls über psql-Variablen
    if [[ -n "$corpus" || -n "$lora_rank" || -n "$lora_alpha" || -n "$git_commit" || -n "$training_config" ]]; then
        if ! registry_psql \
          -v adapter_id="$adapter_id" \
          -v corpus="${corpus:-}" -v rank="${lora_rank:-}" -v alpha="${lora_alpha:-}" \
          -v git_commit="${git_commit:-}" -v config="${training_config:-}" <<'SQL'
SELECT model_registry.upsert_provenance(:'adapter_id'::int, NULLIF(:'corpus',''), NULLIF(:'rank','')::int, NULLIF(:'alpha','')::int, NULLIF(:'git_commit',''), NULLIF(:'config','')::jsonb);
SQL
        then
            echo "DB error during provenance upsert" >&2
            exit 1
        fi
    fi

    echo "Registered adapter $name (id=$adapter_id, base_model=$base_model, quant=${quant:-NULL})"
}

cmd_eval() {
    if [[ $# -lt 2 ]]; then usage; fi
    local adapter="$1"; shift
    local role="$1"; shift
    local testset="" endpoint="" dry_run="" db_url=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --testset) testset="$2"; shift 2 ;;
            --endpoint) endpoint="$2"; shift 2 ;;
            --dry-run) dry_run="true"; shift ;;
            --db-url) db_url="$2"; shift 2 ;;
            *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
        esac
    done

    export MODEL_REGISTRY_DB_URL="${db_url:-${MODEL_REGISTRY_DB_URL:-}}"

    local args=("--adapter" "$adapter" "--role" "$role")
    [[ -n "$testset" ]] && args+=("--testset" "$testset")
    [[ -n "$endpoint" ]] && args+=("--endpoint" "$endpoint")
    [[ "$dry_run" == "true" ]] && args+=("--dry-run")
    [[ -n "$db_url" ]] && args+=("--db-url" "$db_url")

    exec "$SCRIPT_DIR/eval-runner.sh" "${args[@]}"
}

cmd_stats() {
    if [[ $# -lt 1 ]]; then usage; fi
    local adapter="$1"; shift
    local dry_run="" db_url=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --dry-run) dry_run="true"; shift ;;
            --db-url) db_url="$2"; shift 2 ;;
            *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
        esac
    done

    export MODEL_REGISTRY_DB_URL="${db_url:-${MODEL_REGISTRY_DB_URL:-}}"

    local args=("--adapter" "$adapter" "--json")
    [[ "$dry_run" == "true" ]] && args+=("--dry-run")
    [[ -n "$db_url" ]] && args+=("--db-url" "$db_url")

    exec "$SCRIPT_DIR/stat-collector.sh" "${args[@]}"
}

cmd_list() {
    local role="" min_score="" db_url=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --role) role="$2"; shift 2 ;;
            --min-score) min_score="$2"; shift 2 ;;
            --db-url) db_url="$2"; shift 2 ;;
            *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
        esac
    done

    export MODEL_REGISTRY_DB_URL="${db_url:-${MODEL_REGISTRY_DB_URL:-}}"

    # Filter als psql-Variablen (injection-sicher; NULLIF => ungesetzte Filter = NULL)
    if ! registry_psql -v role="${role:-}" -v min_score="${min_score:-}" <<'SQL'
SELECT * FROM model_registry.list_adapters(NULLIF(:'role',''), NULLIF(:'min_score','')::float);
SQL
    then
        echo "Error: DB query (list_adapters) failed" >&2
        exit 1
    fi
}

cmd_export_loadout() {
    if [[ $# -lt 1 ]]; then usage; fi
    local adapter="$1"; shift
    local db_url=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --db-url) db_url="$2"; shift 2 ;;
            *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
        esac
    done

    export MODEL_REGISTRY_DB_URL="${db_url:-${MODEL_REGISTRY_DB_URL:-}}"

    # Get data in clean format — Adapter-Name als psql-Variable (injection-sicher)
    local data
    data=$(registry_psql -t -A -F'|' -v adapter="$adapter" <<'SQL' || { echo "Error: Could not fetch adapter data" >&2; exit 1; }
SELECT id, name, base_model, quantization, vram_mb, max_context, throughput_toks, load_time_ms, best_score, best_role FROM model_registry.get_adapter(:'adapter');
SQL
    )

    if [[ -z "$data" ]]; then
        echo "Error: Adapter '$adapter' not found." >&2
        exit 1
    fi

    # Parse the pipe-separated line
    IFS='|' read -r id name base_model quant vram max_ctx throughput load_time best_score best_role <<< "$data"

    # Format JSON template
    cat <<EOF
{
  "slug": "$adapter",          // TODO: Operator setzt Loadout-Slug
  "label": "Adapter $adapter (basiert auf $base_model)",
  "model": "$adapter.gguf",     // TODO: GGUF-Pfad setzen
  "port": 0,                      // TODO: Port setzen
  "fit": {
    "enabled": true,
    "targetMarginMib": 256,
    "minCtx": ${max_ctx:-32768}
  },
  "args": {
    "ctx": ${max_ctx:-32768},
    "parallel": 1,
    "flashAttention": true
  },
  "notes": "Registry: best_score=$best_score (Rolle $best_role), throughput=$throughput tok/s, VRAM=$vram MB — Werte gemessen am $(date +%Y-%m-%d)"
}
EOF
}

# --- Main Dispatch ---

if [[ $# -eq 0 ]]; then
    usage
    exit 1
fi

case "$1" in
    register)      shift; cmd_register "$@" ;;
    eval)          shift; cmd_eval "$@" ;;
    stats)         shift; cmd_stats "$@" ;;
    list)          shift; cmd_list "$@" ;;
    export-loadout) shift; cmd_export_loadout "$@" ;;
    --help|-h)     usage 0 ;;
    *)             echo "Unknown command: $1" >&2; usage; exit 1 ;;
esac

