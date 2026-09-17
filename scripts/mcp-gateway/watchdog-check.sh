#!/usr/bin/env bash
# watchdog-check.sh — ExecStart für mcp-gateway-watchdog.service (T002543, T006996)
#
# Fuehrt den echten MCP-initialize-Probe (probe.sh) aus und startet bei Ausfall
# die betroffene Kette neu — es sei denn, der Ziel-Pod ist tot (dann hilft kein
# Tunnel-Neustart) oder der letzte Restart liegt weniger als 5 Minuten zurueck.
#
# Zwei Ketten werden getrennt geprueft:
#   - Gateway-Kette:  18080 → mcp-gateway.service (fleet dev-pod)
#   - devmesh-Kette:  13001 → devmesh-forward.service (devmesh llm-services, T900191)
#     Derselbe kubectl-Prozess traegt auch 18235 und 13005; 13001 steht stellvertretend.
#
# Exit 0 = alle verdrahteten Endpoints antworten.
# Exit 1 = mindestens ein Endpoint tot (Unit faellt → Timer feuert weiter).
#
# T006996: ersetzt die Inline-ExecStartPre-Logik der Unit. Die fruehere
# ExecStartPre-Zeile war systemd-Syntax-invalide ("/usr/bin/test: extra
# argument '&&'") — der Rate-Limit-Vorcheck lief nie, und die dokumentierte
# Restart-Logik war gar nicht implementiert.

set -euo pipefail

STAMP="$HOME/.config/systemd/user/mcp-gateway-watchdog.last_restart"
RATE_LIMIT_SEC=300
PROBE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/probe.sh"

gateway_failed=0
devmesh_failed=0

if ! "$PROBE" --port 18080 --timeout 5 >/dev/null 2>&1; then
  gateway_failed=1
fi
if ! "$PROBE" --port 13001 --timeout 5 >/dev/null 2>&1; then
  devmesh_failed=1
fi

# T900223: Token-Drift-Heal im selben Tick (Probes pruefen nur Erreichbarkeit,
# keine Tokens). Guard in if-Form, damit ein Heal-Fehlschlag den Probe-Pfad nie bricht.
HEAL_SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/token-drift-heal.sh"
if [ -x "$HEAL_SCRIPT" ]; then
  if ! "$HEAL_SCRIPT" heal 2>&1 | sed 's/^/[token-heal] /'; then
    echo "WARN: token-drift-heal fehlgeschlagen (Probe-Pfad laeuft weiter)"
  fi
fi

if [ "$gateway_failed" -eq 0 ] && [ "$devmesh_failed" -eq 0 ]; then
  echo "OK: alle verdrahteten MCP-Endpoints antworten (18080, 13001)"
  exit 0
fi

# Rate-Limit: letzter Restart < 5 min → nicht erneut eingreifen.
if [ -f "$STAMP" ]; then
  age=$(( $(date +%s) - $(stat -c %Y "$STAMP" 2>/dev/null || echo 0) ))
  if [ "$age" -lt "$RATE_LIMIT_SEC" ]; then
    echo "SKIP: Restart rate-limited (letzter vor ${age}s)"
    exit 1
  fi
fi

# Pod-Tod-Check: lebt der Ziel-Pod nicht, hilft kein Tunnel-Neustart.
# Fail-closed: eine leere/fehlgeschlagene kubectl-Antwort gilt als "nicht
# Running" — dann wird nicht neu gestartet.
restarted=0
if [ "$gateway_failed" -eq 1 ]; then
  phase=$(kubectl --context fleet -n workspace-dev get pod -l app=dev-pod \
    -o jsonpath='{.items[0].status.phase}' 2>/dev/null || true)
  if [ "$phase" = "Running" ]; then
    echo "RESTART mcp-gateway.service (Probe 18080 fehlgeschlagen, Pod Running)"
    systemctl --user restart mcp-gateway.service
    restarted=1
  else
    echo "SKIP Gateway-Restart: Monolith-Pod nicht Running (phase='${phase}')"
  fi
fi
if [ "$devmesh_failed" -eq 1 ]; then
  phase=$(kubectl --context devmesh -n workspace get pod -l app=llm-services \
    -o jsonpath='{.items[0].status.phase}' 2>/dev/null || true)
  if [ "$phase" = "Running" ]; then
    echo "RESTART devmesh-forward.service (Probe 13001 fehlgeschlagen, Pod Running)"
    systemctl --user restart devmesh-forward.service
    restarted=1
  else
    echo "SKIP devmesh-Restart: llm-services-Pod nicht Running (phase='${phase}')"
  fi
fi

if [ "$restarted" -eq 1 ]; then
  touch "$STAMP"
fi

exit 1
