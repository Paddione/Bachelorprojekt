#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# collect-debug-logs.sh — Debug-Logs aller Services sammeln und auf
#                         fehlende Implementierungen durchsuchen [T900018]
#
# Der Debug-Log-LEVEL wird deklarativ gesetzt (prod-fleet/components/
# debug-logging) und ist nach dem naechsten Rollout aktiv. Dieses Skript
# deckt die drei Schritte danach ab:
#
#   --runtime   Log-Level fuer die Container setzen, die keinen Env-Schalter
#               haben (nextcloud/occ, redis, postgres).
#   --restart   Rollout-Restart aller Deployments, damit die Env-Patches
#               greifen. Wartet auf Ready.
#   (default)   Logs aller Pods sammeln, nach Mustern fehlender
#               Implementierung durchsuchen, Report ausgeben.
#
# Usage:  ENV=staging bash scripts/collect-debug-logs.sh --restart
#         ENV=staging bash scripts/collect-debug-logs.sh
#         ENV=staging bash scripts/collect-debug-logs.sh --since 30m --out ./logs
#
# ACHTUNG: Nur fuer staging/dev gedacht. Gegen einen Prod-Namespace
# ausgefuehrt sammelt es personenbezogene Daten aus Request-Logs — der
# Guard weiter unten bricht deshalb bei Prod-Namespaces ab.
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV="${ENV:-staging}"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/env-resolve.sh" "$ENV" "$SCRIPT_DIR/../environments"

CTX="${ENV_CONTEXT:-fleet}"
WS_NS="${WORKSPACE_NAMESPACE:-workspace-staging}"
WEB_NS="${WEBSITE_NAMESPACE:-website-staging}"
SINCE="1h"
OUT_DIR=""
MODE="collect"

while [ $# -gt 0 ]; do
  case "$1" in
    --runtime) MODE="runtime"; shift ;;
    --restart) MODE="restart"; shift ;;
    --since)   SINCE="${2:?--since braucht einen Wert, z.B. 30m}"; shift 2 ;;
    --out)     OUT_DIR="${2:?--out braucht ein Verzeichnis}"; shift 2 ;;
    -h|--help) sed -n '2,24p' "$0"; exit 0 ;;
    *) echo "Unbekannte Option: $1" >&2; exit 1 ;;
  esac
done

# ── Prod-Guard ────────────────────────────────────────────────────────
# Debug-Logs fuehren Request-Bodies, Header und User-IDs. Gegen einen
# Prod-Namespace ist das Sammeln ein DSGVO-Vorfall, kein Debugging.
case "$WS_NS" in
  workspace|workspace-korczewski)
    echo "FATAL: $WS_NS ist ein Prod-Namespace. Dieses Skript sammelt Debug-Logs" >&2
    echo "       mit potenziell personenbezogenen Daten und ist nur fuer" >&2
    echo "       staging/dev vorgesehen. Nutze ENV=staging." >&2
    exit 1 ;;
esac

KUBECTL=(kubectl --context "$CTX")

# ── Muster fuer fehlende Implementierungen ────────────────────────────
# Bewusst breit gefasst — der Report wird von Hand gesichtet. Ein
# Fehlalarm kostet eine Zeile, ein uebersehener Stub kostet einen Bug.
PATTERNS="not[ _-]?implemented|unimplemented|NotImplementedError|501 |HTTP 501"
PATTERNS="$PATTERNS|no such (handler|route|endpoint|method)|route not found"
PATTERNS="$PATTERNS|no handler (for|registered)|unknown (command|action|endpoint|method)"
PATTERNS="$PATTERNS|unsupported (operation|method|provider)|TODO|FIXME|STUB"
PATTERNS="$PATTERNS|stub(bed)? (out|implementation)|placeholder"
PATTERNS="$PATTERNS|MODULE_NOT_FOUND|Cannot find module|ImportError"
PATTERNS="$PATTERNS|is not a function|missing (required )?(env|environment|config|handler)"
PATTERNS="$PATTERNS|ENOTSUP|ENOSYS"

collect() {
  local ts dir total pods conts f report hits m n
  ts="$(date +%Y%m%d-%H%M%S)"
  dir="${OUT_DIR:-./debug-logs-$ts}"
  mkdir -p "$dir"
  echo "Sammle Logs (seit $SINCE) nach $dir"

  total=0
  for ns in "$WS_NS" "$WEB_NS"; do
    pods="$("${KUBECTL[@]}" -n "$ns" get pods -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || true)"
    if [ -z "$pods" ]; then
      echo "  ! keine Pods in $ns"
      continue
    fi
    for pod in $pods; do
      conts="$("${KUBECTL[@]}" -n "$ns" get pod "$pod" -o jsonpath='{.spec.containers[*].name}' 2>/dev/null || true)"
      for c in $conts; do
        f="$dir/${ns}__${pod}__${c}.log"
        # --since begrenzt die Menge; ohne Begrenzung laeuft ein
        # langlaufender Pod das Verzeichnis voll.
        if "${KUBECTL[@]}" -n "$ns" logs "$pod" -c "$c" --since="$SINCE" \
             --timestamps > "$f" 2>/dev/null; then
          total=$((total + 1))
        else
          rm -f "$f"
        fi
      done
    done
  done
  echo "  $total Container-Logs geschrieben"

  # ── Report ──────────────────────────────────────────────────────────
  report="$dir/00-REPORT-missing-implementation.txt"
  {
    echo "Missing-Implementation-Scan — ENV=$ENV, Namespaces: $WS_NS + $WEB_NS"
    echo "Zeitfenster: seit $SINCE   Erstellt: $(date -Iseconds)"
    echo "Suchmuster (ERE):"
    echo "  $PATTERNS"
    echo
    echo "════════════════════════════════════════════════════════════"
  } > "$report"

  hits=0
  for f in "$dir"/*.log; do
    [ -e "$f" ] || continue
    m="$(grep -inE "$PATTERNS" "$f" 2>/dev/null || true)"
    if [ -n "$m" ]; then
      hits=$((hits + 1))
      {
        echo
        echo "── $(basename "$f" .log)"
        printf '%s\n' "$m" | head -40
        n="$(printf '%s\n' "$m" | wc -l)"
        if [ "$n" -gt 40 ]; then
          echo "   ... ($((n - 40)) weitere Treffer, siehe $(basename "$f"))"
        fi
      } >> "$report"
    fi
  done

  {
    echo
    echo "════════════════════════════════════════════════════════════"
    echo "$hits von $total Container-Logs mit Treffern."
  } >> "$report"

  echo
  cat "$report"
  echo
  echo "Vollstaendige Logs: $dir"
}

restart() {
  local deps
  echo "Rollout-Restart aller Deployments in $WS_NS und $WEB_NS (Kontext $CTX)"
  for ns in "$WS_NS" "$WEB_NS"; do
    "${KUBECTL[@]}" -n "$ns" rollout restart deployment --all || true
  done
  echo "Warte auf Ready ..."
  for ns in "$WS_NS" "$WEB_NS"; do
    deps="$("${KUBECTL[@]}" -n "$ns" get deploy -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || true)"
    for d in $deps; do
      # Ein einzelnes haengendes Deployment darf den Lauf nicht abbrechen —
      # genau so ein Pod ist oft der interessante Befund.
      "${KUBECTL[@]}" -n "$ns" rollout status deploy/"$d" --timeout=180s \
        || echo "  ! $ns/$d wurde nicht Ready (Befund, kein Abbruch)"
    done
  done
}

runtime() {
  local nc rd pg
  echo "Setze Log-Level fuer Container ohne Env-Schalter (Kontext $CTX, ns $WS_NS)"

  # Nextcloud: loglevel 0 = DEBUG. occ persistiert in config.php auf dem PVC,
  # ueberlebt also einen Pod-Neustart.
  nc="$("${KUBECTL[@]}" -n "$WS_NS" get pod -l app=nextcloud \
        -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)"
  if [ -n "$nc" ]; then
    "${KUBECTL[@]}" -n "$WS_NS" exec "$nc" -c nextcloud -- \
      php occ config:system:set loglevel --value=0 --type=integer \
      && echo "  nextcloud: loglevel=0 (DEBUG)" \
      || echo "  ! nextcloud: occ fehlgeschlagen"
  else
    echo "  ! nextcloud: kein Pod gefunden"
  fi

  # Redis: CONFIG SET ist fluechtig — nach einem Pod-Neustart erneut noetig.
  rd="$("${KUBECTL[@]}" -n "$WS_NS" get pod -l app=nextcloud-redis \
        -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)"
  if [ -n "$rd" ]; then
    "${KUBECTL[@]}" -n "$WS_NS" exec "$rd" -c redis -- \
      redis-cli CONFIG SET loglevel debug \
      && echo "  nextcloud-redis: loglevel=debug (fluechtig)" \
      || echo "  ! nextcloud-redis: CONFIG SET fehlgeschlagen"
  fi

  # Postgres: ALTER SYSTEM schreibt postgresql.auto.conf auf das PVC.
  # log_statement=all ist bewusst NICHT gesetzt — das protokolliert jede
  # Query samt Parameterwerten und laeuft das Volume in Stunden voll.
  pg="$("${KUBECTL[@]}" -n "$WS_NS" get pod -l app=shared-db \
        -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)"
  if [ -n "$pg" ]; then
    "${KUBECTL[@]}" -n "$WS_NS" exec "$pg" -c postgres -- \
      psql -U postgres -c "ALTER SYSTEM SET log_min_messages='debug1';" \
      && "${KUBECTL[@]}" -n "$WS_NS" exec "$pg" -c postgres -- \
         psql -U postgres -c "SELECT pg_reload_conf();" > /dev/null \
      && echo "  shared-db: log_min_messages=debug1" \
      || echo "  ! shared-db: ALTER SYSTEM fehlgeschlagen"
  fi

  echo
  echo "Nicht abgedeckt (Config-Datei im Image, nur per Rebuild aenderbar):"
  echo "  nats, spreed-signaling, talk-recording, sessions-server"
}

case "$MODE" in
  runtime) runtime ;;
  restart) restart ;;
  collect) collect ;;
esac
