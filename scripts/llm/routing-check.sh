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
# shellcheck source=/dev/null
source "$HERE/../factory/lib.sh"; factory_resolve

FAILED=0
AVAILABLE=""
for url in http://127.0.0.1:18235 http://127.0.0.1:1234; do
  models=$(curl -s -m 5 "${url}/v1/models" 2>/dev/null | jq -r '.data[].id' 2>/dev/null) || continue
  AVAILABLE="${AVAILABLE}"$'\n'"${models}"
done

if [[ -z "${AVAILABLE//[[:space:]]/}" ]]; then
  echo "routing-check: kein lokales Backend erreichbar — uebersprungen." >&2
  exit 0
fi

while IFS=$'\t' read -r model burl; do
  [[ -z "$model" ]] && continue
  case "$burl" in https://*) continue ;; esac   # Cloud-Provider nicht pruefbar
  if ! grep -qiF -- "$model" <<< "$AVAILABLE"; then
    echo "routing-check: FEHLT — '$model' (${burl:-kein base_url}) wird von keinem lokalen Backend serviert." >&2
    FAILED=1
  fi
done < <(factory_psql <<'SQL'
SELECT model_id||E'\t'||COALESCE(base_url,'') FROM tickets.provider_config WHERE enabled = true
UNION
SELECT model_id||E'\t'||COALESCE(base_url,'') FROM tickets.factory_model_slots;
SQL
)

# Die Factory-Env ist die ZWEITE Quelle von Modell-IDs — und war die, an der der Drift
# real haftete: provider_config zeigte laengst auf gemma-4-12b, waehrend ANTHROPIC_MODEL
# in autopilot.env noch ternary-bonsai-27b nannte. Eine reine DB-Pruefung haette den
# Ausgangsfall dieses Tickets nicht gesehen. Die Datei liegt ausserhalb des Repos; fehlt
# sie, wird der Abschnitt uebersprungen.
FACTORY_ENV_FILE="${FACTORY_ENV_FILE:-${HOME}/.config/factory/autopilot.env}"
if [[ -f "$FACTORY_ENV_FILE" ]]; then
  while IFS='=' read -r var val; do
    val="${val%\"}"; val="${val#\"}"; val="${val/\[1m\]/}"
    [[ -z "$val" ]] && continue
    if ! grep -qiF -- "$val" <<< "$AVAILABLE"; then
      echo "routing-check: FEHLT — ${var}='${val}' aus ${FACTORY_ENV_FILE} hat kein Backend." >&2
      FAILED=1
    fi
  done < <(grep -E '^ANTHROPIC_(DEFAULT_[A-Z]+_)?MODEL=' "$FACTORY_ENV_FILE" 2>/dev/null || true)
fi

[[ $FAILED -eq 0 ]] && echo "routing-check: alle lokalen Modell-IDs haben ein Backend."
exit $FAILED
