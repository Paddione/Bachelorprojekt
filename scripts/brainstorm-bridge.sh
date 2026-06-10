#!/usr/bin/env bash
# brainstorm-bridge.sh — robustes Front-End für den superpowers Visual Companion,
# damit Brainstorming-Visuals/Auswahl zuverlässig kommuniziert werden — MIT und OHNE
# localhost. Der Dev-Node ist diese WSL-Maschine (mirrored networking mode):
#
#   • Server bindet 0.0.0.0  -> gleichzeitig erreichbar über localhost, Tailscale
#     (MagicDNS + IP), wg-mesh und LAN.
#   • localhost wird auf DIESEM Desktop automatisch im Windows-Browser geöffnet.
#   • FESTER Port + 'tailscale serve' -> stabile, port-lose HTTPS-URL
#       https://<magicdns>/   ── von Handy/Laptop ÜBERALL, ohne irgendeinen Port zu
#     öffnen (Tailscale tunnelt durch NAT/Firewall; serve terminiert im TS-Prozess).
#
# Subcommands:
#   start              Companion (0.0.0.0, fester Port) starten, 'tailscale serve' verdrahten,
#                      localhost auto-öffnen, volles URL-Menü drucken. screen_dir/state_dir ausgeben.
#   urls               URL-Menü der aktiven Session erneut drucken (z. B. für's Handy).
#   show <file>        HTML-Inhalt in screen_dir der aktiven Session legen (auto-reload).
#   choice             Letzte vom Nutzer geklickte {"choice":...} ausgeben.
#   funnel             Aktive Session ÖFFENTLICH über HTTPS anbieten (tailscale funnel).
#   stop               Server der aktiven Session stoppen + serve-Map (443) entfernen.
#
# Port überschreibbar via BRAINSTORM_BRIDGE_PORT.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
BRAINSTORM_ROOT="$REPO/.superpowers/brainstorm"
SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
BRIDGE_PORT="${BRAINSTORM_BRIDGE_PORT:-47600}"   # fester kanonischer Port -> stabile serve-URL

find_companion() {
  local matches=( "$HOME"/.claude/plugins/cache/claude-plugins-official/superpowers/*/skills/brainstorming/scripts )
  [[ -d "${matches[-1]:-}" ]] || { echo "brainstorm-bridge: Companion-Skripte nicht gefunden" >&2; exit 1; }
  echo "${matches[-1]}"
}
COMP="$(find_companion)"

ts_exe() { command -v tailscale.exe >/dev/null 2>&1 && echo tailscale.exe || { command -v tailscale >/dev/null 2>&1 && echo tailscale || true; }; }
active_session() { ls -dt "$BRAINSTORM_ROOT"/*/ 2>/dev/null | head -1; }
session_port() { grep -o '"port":[0-9]*' "$1/state/server-info" 2>/dev/null | grep -o '[0-9]*' | head -1; }

ts_magicdns() { local ts; ts="$(ts_exe)"; [[ -n "$ts" ]] || return 0
  "$ts" status --json 2>/dev/null | python3 -c 'import sys,json
try:
  d=json.load(sys.stdin); print(d["Self"]["DNSName"].rstrip("."))
except Exception: pass' 2>/dev/null; }
ts_ip4() { local ts; ts="$(ts_exe)"; [[ -n "$ts" ]] || return 0; "$ts" ip -4 2>/dev/null | head -1 | tr -d '\r'; }

port_free() { python3 -c 'import socket,sys
s=socket.socket()
try: s.bind(("0.0.0.0",int(sys.argv[1])))
except OSError: sys.exit(1)
finally: s.close()' "$1"; }
free_port() { python3 -c 'import socket
s=socket.socket(); s.bind(("0.0.0.0",0)); print(s.getsockname()[1]); s.close()'; }

serve_active_root() {  # ist 'serve' mit port-loser HTTPS-Root-Map aktiv?
  local ts magic; ts="$(ts_exe)"; magic="$(ts_magicdns)"
  [[ -n "$ts" && -n "$magic" ]] || return 1
  "$ts" serve status 2>/dev/null | grep -qE "https://${magic}([[:space:]]|/|$)"
}

print_urls() {
  local port="$1" magic ip lan
  magic="$(ts_magicdns)"; ip="$(ts_ip4)"
  lan="$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^(192\.168|10\.|172\.(1[6-9]|2[0-9]|3[01]))\.' | grep -v '^10\.255\.' | head -1)"
  echo "── Brainstorm-Board erreichbar unter ────────────────────────"
  echo "  Desktop (hier):         http://localhost:$port"
  if serve_active_root; then
  echo "  Handy/Laptop (überall): https://$magic/   ← Tailscale serve, KEINE Ports nötig, HTTPS"
  elif [[ -n "$magic" ]]; then
  echo "  Handy/Laptop (überall): http://$magic:$port   ← Tailscale MagicDNS"
  fi
  [[ -n "$ip"  ]] && echo "  Tailnet-IP:             http://$ip:$port"
  [[ -n "$lan" ]] && echo "  Gleiches Netz:          http://$lan:$port"
  echo "─────────────────────────────────────────────────────────────"
}

wire_serve() {  # tailscale serve (HTTPS:443, tailnet-only) -> 127.0.0.1:<port>; idempotent, non-destruktiv
  local port="$1" ts; ts="$(ts_exe)"; [[ -n "$ts" ]] || return 0
  "$ts" serve --bg --https=443 "http://127.0.0.1:$port" >/dev/null 2>&1 \
    && echo "→ tailscale serve: https://$(ts_magicdns)/ → 127.0.0.1:$port" \
    || echo "→ (tailscale serve nicht verdrahtet — roher Port/IP-Weg bleibt nutzbar)"
}

cmd_start() {
  local magic url session port pid
  magic="$(ts_magicdns)"; magic="${magic:-localhost}"

  # Alte Bridge-Session auf dem festen Port sauber beenden (Neustart).
  session="$(active_session)"
  if [[ -n "$session" && "$(session_port "$session")" == "$BRIDGE_PORT" ]]; then
    pid="$(cat "${session}state/server.pid" 2>/dev/null || true)"
    [[ -n "$pid" ]] && kill "$pid" 2>/dev/null || true
    sleep 1
  fi

  # Port wählen: bevorzugt der feste; sonst freier (serve muss dann ggf. neu zeigen).
  if port_free "$BRIDGE_PORT"; then port="$BRIDGE_PORT"
  else port="$(free_port)"; echo "⚠  Port $BRIDGE_PORT belegt → nutze $port (serve zeigt evtl. auf alten Port)." >&2; fi

  for _ in 1 2 3; do
    BRAINSTORM_PORT="$port" "$COMP/start-server.sh" \
      --project-dir "$REPO" --host 0.0.0.0 --url-host "$magic" >/dev/null 2>&1 || true
    session="$(active_session)"
    if [[ -n "$session" && "$(session_port "$session")" == "$port" ]]; then
      pid="$(cat "${session}state/server.pid" 2>/dev/null || true)"
      if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
        echo "Companion läuft (PID $pid) auf 0.0.0.0:$port"
        echo "screen_dir=${session}content"
        echo "state_dir=${session}state"
        wire_serve "$port"
        print_urls "$port"
        "$SELF_DIR/wsl-open.sh" "http://localhost:$port" >/dev/null 2>&1 \
          && echo "→ Windows-Browser (localhost) geöffnet." \
          || echo "→ Browser-Auto-Open fehlgeschlagen; URL oben manuell öffnen."
        return 0
      fi
    fi
    port="$(free_port)"   # Race -> nächster Versuch mit frischem Port
  done
  echo "brainstorm-bridge: Server-Start fehlgeschlagen (3 Versuche)." >&2
  [[ -n "${session:-}" ]] && { echo "--- log ---" >&2; cat "${session}state/server.log" >&2 2>/dev/null || true; }
  return 1
}

cmd_urls() {
  local s; s="$(active_session)"; [[ -n "$s" ]] || { echo "keine aktive Session" >&2; exit 1; }
  print_urls "$(session_port "$s")"
}

cmd_show() {
  local file="${1:?usage: brainstorm-bridge.sh show <file>}"
  [[ -f "$file" ]] || { echo "Datei nicht gefunden: $file" >&2; exit 2; }
  local s; s="$(active_session)"; [[ -n "$s" ]] || { echo "keine aktive Session" >&2; exit 1; }
  local dest="${s}content/$(basename "${file%.html}")-$(date +%s).html"
  cp "$file" "$dest"; echo "→ $dest (Board lädt neu)"
}

cmd_choice() {
  local s; s="$(active_session)"; [[ -n "$s" ]] || { echo "keine aktive Session" >&2; exit 1; }
  "$SELF_DIR/brainstorm-extract-choice.sh" "${s}state"
}

cmd_funnel() {
  local ts; ts="$(ts_exe)"; [[ -n "$ts" ]] || { echo "tailscale nicht gefunden" >&2; exit 1; }
  local s; s="$(active_session)"; [[ -n "$s" ]] || { echo "keine aktive Session" >&2; exit 1; }
  local port; port="$(session_port "$s")"
  echo "⚠  ÖFFENTLICHE Exposition via Tailscale Funnel für 127.0.0.1:$port"
  "$ts" funnel --bg --https=443 "http://127.0.0.1:$port"
  echo "→ https://$(ts_magicdns)/  (öffentlich). Zurücksetzen: $ts funnel reset"
}

cmd_stop() {
  local s; s="$(active_session)"
  if [[ -n "$s" ]]; then
    local pid; pid="$(cat "${s}state/server.pid" 2>/dev/null || true)"
    [[ -n "$pid" ]] && kill "$pid" 2>/dev/null && echo "Server gestoppt (PID $pid)" || echo "kein laufender Server"
  fi
  local ts; ts="$(ts_exe)"
  if [[ -n "$ts" ]]; then
    "$ts" funnel --https=443 off >/dev/null 2>&1 && echo "funnel (443) deaktiviert (öffentliche Exposition aus)" || true
    "$ts" serve  --https=443 off >/dev/null 2>&1 && echo "serve-Map (443) entfernt" || true
  fi
}

case "${1:-}" in
  start)   cmd_start ;;
  urls)    cmd_urls ;;
  show)    shift; cmd_show "$@" ;;
  choice)  cmd_choice ;;
  funnel)  cmd_funnel ;;
  stop)    cmd_stop ;;
  *) echo "usage: $0 {start|urls|show <file>|choice|funnel|stop}" >&2; exit 2 ;;
esac
