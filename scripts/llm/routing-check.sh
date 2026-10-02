#!/usr/bin/env bash
# scripts/llm/routing-check.sh — prueft, ob jede konfigurierte Modell-ID ein Backend hat.
#
# WARUM ES DAS GIBT [T002359]: resolveModel() im llm-proxy biegt unbekannte Modelle still
# auf das erste gesunde Backend um. Dadurch lief das Routing nach dem Gemma-Cutover
# monatelang auf Modell-IDs, die auf keinem Backend existierten (ternary-bonsai-27b,
# qwythos-9b-v2), ohne dass irgendwo ein Fehler auftauchte. Ein Routing, das nur deshalb
# funktioniert, weil ein Fallback jeden Tippfehler auffaengt, ist kein Routing — und der
# naechste Cutover haette denselben stillen Drift erzeugt.
#
# FAIL-SOFT OHNE BACKEND, FAIL-CLOSED MIT: ist kein lokales Backend erreichbar (CI, Laptop
# ohne GPU-Host), kann das Skript nichts aussagen und beendet sich mit 0. Antwortet
# mindestens ein Backend, ist eine nicht servierte Modell-ID ein harter Fehler.
#
# Cloud-Provider (https://) werden uebersprungen — ihre Modell-Kataloge sind nicht ohne
# API-Key abfragbar, und ein Key gehoert nicht in einen Health-Check.
#
# Usage:
#   bash scripts/llm/routing-check.sh      # oder: task llm:routing:check
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# DB-Zugang (T900728): ersetzt die entfernte Factory-lib (Resolve- und
# PSQL-Helfer). WORKSPACE_PG_URL gewinnt, sonst kubectl exec gegen den
# shared-db-Pod. Ohne DB-Zugang rc!=0 — der Aufrufer unten faellt dann
# fail-soft auf die anderen Quellen zurueck.
WS_CTX="${WORKSPACE_CTX:-fleet}"
WS_NS="${WORKSPACE_NS:-workspace}"
_ws_psql() {  # SQL via stdin, TSV auf stdout
  if [[ -n "${WORKSPACE_PG_URL:-}" ]]; then
    psql "$WORKSPACE_PG_URL" -qtA -v ON_ERROR_STOP=1 "$@"
    return
  fi
  command -v kubectl >/dev/null 2>&1 || return 3
  local pod
  pod="$(kubectl get pod -n "$WS_NS" --context "$WS_CTX" -l app=shared-db \
    --field-selector status.phase=Running \
    -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)" || return 3
  [[ -n "$pod" ]] || return 3
  kubectl exec -i "$pod" -n "$WS_NS" --context "$WS_CTX" -c postgres -- \
    psql -U website -d website -qtA -v ON_ERROR_STOP=1 "$@"
}

FAILED=0
AVAILABLE=""
# [T900213] FreeToken-native (:1919) ist seit T900208 das einzige lokale
# Generierungs-Backend. Geprobt werden FreeToken (:1919) und LM Studio
# (:1234, Embedding/Rerank). Ohne die Liste wuerden dort servierte Modell-IDs
# als FEHLT gemeldet, sobald irgendein anderes Backend antwortet (fail-closed
# mit erreichbarem Backend).
for url in http://127.0.0.1:1919 http://127.0.0.1:1234; do
  models=$(curl -s -m 5 "${url}/v1/models" 2>/dev/null | jq -r '.data[].id' 2>/dev/null) || continue
  AVAILABLE="${AVAILABLE}"$'\n'"${models}"
done

if [[ -z "${AVAILABLE//[[:space:]]/}" ]]; then
  echo "routing-check: kein lokales Backend erreichbar — uebersprungen." >&2
  exit 0
fi

# ERSTE Quelle: provider_config aus der Workspace-DB. Ohne DB-Zugang (kein
# kubectl/Cluster) wird die Quelle uebersprungen — Laptops ohne Cluster
# duerfen nicht rot laufen (fail-soft wie bei fehlendem Backend).
if DB_MODELS="$(_ws_psql <<'SQL' 2>/dev/null
SELECT model_id||E'\t'||COALESCE(base_url,'') FROM tickets.provider_config WHERE enabled = true;
SQL
)"; then
  while IFS=$'\t' read -r model burl; do
    [[ -z "$model" ]] && continue
    case "$burl" in https://*) continue ;; esac   # Cloud-Provider nicht pruefbar
    if ! grep -qiF -- "$model" <<< "$AVAILABLE"; then
      echo "routing-check: FEHLT — '$model' (${burl:-kein base_url}) wird von keinem lokalen Backend serviert." >&2
      FAILED=1
    fi
  done <<< "$DB_MODELS"
else
  echo "routing-check: DB-Quelle nicht erreichbar — uebersprungen." >&2
fi

# ZWEITE Quelle [T900213]: Top-Level-Standardmodell aus .opencode/opencode.jsonc.
# Kommentar-robust auslesen (JSONC). Provider-Präfix strippen, Cloud-Werte
# überspringen.
OPENCODE_CONFIG="${REPO_ROOT:-$HERE/../..}/.opencode/opencode.jsonc"
if [[ -f "$OPENCODE_CONFIG" ]]; then
  cfg_model=$(python3 -c "
import re
with open('${OPENCODE_CONFIG}') as f:
    text = f.read()
m = re.search(r'^\s*\"model\"\s*:\s*\"([^\"]+)\"', text, re.MULTILINE)
if m:
    val = m.group(1)
    if not any(val.startswith(p) for p in ('zen', 'deepseek', 'https://', 'http://')):
        if '/' in val:
            val = val.split('/', 1)[1]
        print(val)
" 2>/dev/null || true)
  if [[ -n "$cfg_model" ]]; then
    if ! grep -qiF -- "$cfg_model" <<< "$AVAILABLE"; then
      echo "routing-check: FEHLT — model='${cfg_model}' aus .opencode/opencode.jsonc hat kein Backend." >&2
      FAILED=1
    fi
  fi
fi

[[ $FAILED -eq 0 ]] && echo "routing-check: alle lokalen Modell-IDs haben ein Backend."
exit $FAILED
