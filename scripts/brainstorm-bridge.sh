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
BRIDGE_PORT="${BRAINSTORM_BRIDGE_PORT:-47600}"   # fester kanonischer Port -> stabile serve/funnel-URL
BOARD_DIR="$BRAINSTORM_ROOT/board"               # fester Session-Dir des Dauer-Service
SERVICE_NAME="brainstorm-board.service"
UNIT_FILE="$HOME/.config/systemd/user/$SERVICE_NAME"
# systemctl --user aus einer Nicht-Login-Shell erreichbar machen
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=${XDG_RUNTIME_DIR}/bus}"
service_active() { systemctl --user is-active --quiet "$SERVICE_NAME" 2>/dev/null; }
# Wenn der Dauer-Service läuft, zielen show/choice/urls auf dessen festen Board-Dir.
target_session() { if service_active; then echo "$BOARD_DIR/"; else active_session; fi; }

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

serve_active_root() {  # ist eine port-lose HTTPS-Root-Map aktiv (serve ODER funnel)?
  local ts magic out; ts="$(ts_exe)"; magic="$(ts_magicdns)"
  [[ -n "$ts" && -n "$magic" ]] || return 1
  # In eine Variable einlesen (kein Pipe-Producer) — sonst SIGPIPE+pipefail = falsch negativ.
  out="$({ "$ts" funnel status 2>/dev/null; "$ts" serve status 2>/dev/null; } || true)"
  grep -qE "https://${magic}([[:space:]]|/|$)" <<<"$out"
}

print_urls() {
  local port="$1" magic ip lan
  magic="$(ts_magicdns)"; ip="$(ts_ip4)"
  lan="$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^(192\.168|10\.|172\.(1[6-9]|2[0-9]|3[01]))\.' | grep -v '^10\.255\.' | head -1)"
  echo "── Brainstorm-Board erreichbar unter ────────────────────────"
  echo "  Desktop (hier):         http://localhost:$port"
  if serve_active_root; then
  echo "  Handy/Laptop (überall): https://$magic/   ← Tailscale (HTTPS, KEINE Ports nötig)"
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

# Companion DIREKT starten (nicht via start-server.sh), mit BRAINSTORM_OWNER_PID=1 —
# sonst bindet der Companion seine Lebensdauer an den Harness-Prozess und stirbt beim
# Zug-Wechsel ("server-stopped: owner process exited"). owner=1 (init, immer da) ->
# überlebt, bis 30-min-Idle-Timeout oder 'stop'. nohup in Subshell -> sauber detached.
launch_companion() {
  local port="$1" magic sess i
  magic="$(ts_magicdns)"; magic="${magic:-localhost}"
  sess="$BRAINSTORM_ROOT/$$-$(date +%s)/"
  mkdir -p "${sess}content" "${sess}state"
  ( cd "$COMP" && { nohup env \
      BRAINSTORM_DIR="${sess%/}" BRAINSTORM_HOST=0.0.0.0 BRAINSTORM_URL_HOST="$magic" \
      BRAINSTORM_PORT="$port" BRAINSTORM_OWNER_PID=1 \
      node server.cjs > "${sess}state/server.log" 2>&1 & echo $! > "${sess}state/server.pid"; } )
  for i in $(seq 1 30); do
    curl -sS --max-time 2 -o /dev/null "http://127.0.0.1:$port/" 2>/dev/null && { echo "$sess"; return 0; }
    sleep 0.2
  done
  return 1
}

cmd_start() {
  local port session pid t
  "$SELF_DIR/superpowers-submit-patch.sh" >/dev/null 2>&1 || true   # Submit-Kanal idempotent in den Cache patchen
  # Dauer-Service aktiv? Dann nicht konkurrieren — auf dessen Board verweisen.
  if service_active; then
    echo "Dauer-Service '$SERVICE_NAME' läuft bereits auf :$BRIDGE_PORT (Board-Dir $BOARD_DIR)."
    echo "→ 'show'/'choice' zielen automatisch darauf; 'service status' für Details."
    print_urls "$BRIDGE_PORT"
    "$SELF_DIR/wsl-open.sh" "http://localhost:$BRIDGE_PORT" >/dev/null 2>&1 && echo "→ Windows-Browser (localhost) geöffnet." || true
    return 0
  fi
  # Laufende Bridge-Session auf dem festen Port sauber beenden (Neustart).
  session="$(active_session)"
  if [[ -n "$session" && "$(session_port "$session")" == "$BRIDGE_PORT" ]]; then
    pid="$(cat "${session}state/server.pid" 2>/dev/null || true)"
    [[ -n "$pid" ]] && kill "$pid" 2>/dev/null || true
  fi
  # Auf den festen Port warten, bis er frei ist (stale socket / TIME_WAIT), max ~4s.
  port="$BRIDGE_PORT"
  for t in 1 2 3 4 5 6 7 8; do port_free "$port" && break; sleep 0.5; done
  if ! port_free "$port"; then
    port="$(free_port)"; echo "⚠  Port $BRIDGE_PORT belegt → nutze $port (funnel/serve neu zeigen)." >&2
  fi

  session="$(launch_companion "$port")" || {
    echo "brainstorm-bridge: Server-Start auf $port fehlgeschlagen." >&2
    return 1; }

  pid="$(cat "${session}state/server.pid" 2>/dev/null || true)"
  echo "Companion läuft (PID $pid) auf 0.0.0.0:$port — überlebt Zug-Wechsel (owner=1)"
  echo "screen_dir=${session}content"
  echo "state_dir=${session}state"
  wire_serve "$port"
  print_urls "$port"
  "$SELF_DIR/wsl-open.sh" "http://localhost:$port" >/dev/null 2>&1 \
    && echo "→ Windows-Browser (localhost) geöffnet." \
    || echo "→ Browser-Auto-Open fehlgeschlagen; URL oben manuell öffnen."
}

cmd_urls() {
  local s; s="$(target_session)"; [[ -n "$s" ]] || { echo "keine aktive Session" >&2; exit 1; }
  local p; p="$(session_port "$s")"; [[ -n "$p" ]] || p="$BRIDGE_PORT"
  print_urls "$p"
}

cmd_show() {
  local file="${1:?usage: brainstorm-bridge.sh show <file>}"
  [[ -f "$file" ]] || { echo "Datei nicht gefunden: $file" >&2; exit 2; }
  local s; s="$(target_session)"; [[ -n "$s" ]] || { echo "keine aktive Session" >&2; exit 1; }
  local dest="${s}content/$(basename "${file%.html}")-$(date +%s).html"
  cp "$file" "$dest"; echo "→ $dest (Board lädt neu)"
}

cmd_choice() {
  local s; s="$(target_session)"; [[ -n "$s" ]] || { echo "keine aktive Session" >&2; exit 1; }
  "$SELF_DIR/brainstorm-extract-choice.sh" "${s}state"
}

cmd_submission() {
  local s; s="$(target_session)"; [[ -n "$s" ]] || { echo "keine aktive Session" >&2; exit 1; }
  local f="${s}state/submission.json"
  [[ -f "$f" ]] && cat "$f" || { echo "keine submission (Knopf noch nicht gedrückt)" >&2; exit 1; }
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

# ── Dauer-Service (systemd --user) für ein immer-erreichbares, öffentliches Board ──
gen_unit() {
  local magic; magic="$(ts_magicdns)"; magic="${magic:-localhost}"
  mkdir -p "$(dirname "$UNIT_FILE")"
  cat > "$UNIT_FILE" <<UNIT
[Unit]
Description=Brainstorm Companion board (fixed public port ${BRIDGE_PORT})
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${COMP}
ExecStartPre=/usr/bin/mkdir -p ${BOARD_DIR}/content ${BOARD_DIR}/state
ExecStart=$(command -v node) ${COMP}/server.cjs
Environment=BRAINSTORM_DIR=${BOARD_DIR}
Environment=BRAINSTORM_HOST=0.0.0.0
Environment=BRAINSTORM_URL_HOST=${magic}
Environment=BRAINSTORM_PORT=${BRIDGE_PORT}
Environment=BRAINSTORM_OWNER_PID=1
Environment=BRAINSTORM_PUBLIC=1
Restart=always
RestartSec=2
NoNewPrivileges=true

[Install]
WantedBy=default.target
UNIT
  echo "→ Unit: $UNIT_FILE (node=$(command -v node), port=$BRIDGE_PORT, public=read-only)"
}

cmd_service() {
  local sub="${1:-status}" ts s pid
  case "$sub" in
    install)
      "$SELF_DIR/brainstorm-companion-harden.sh" || true          # 1) härten (idempotent)
      "$SELF_DIR/superpowers-submit-patch.sh" || true             # 1b) Submit-Kanal (idempotent)
      for s in "$BRAINSTORM_ROOT"/*/; do                          # 2) ad-hoc Server beenden -> Port frei
        [[ "$s" == "$BOARD_DIR/" || ! -d "$s" ]] && continue
        pid="$(cat "${s}state/server.pid" 2>/dev/null || true)"
        [[ -n "$pid" ]] && kill "$pid" 2>/dev/null || true
      done
      gen_unit                                                    # 3) Unit + linger + enable
      loginctl enable-linger "$USER" 2>/dev/null || sudo -n loginctl enable-linger "$USER" 2>/dev/null || \
        echo "⚠ enable-linger nicht gesetzt — Service startet evtl. erst nach Login. Manuell: sudo loginctl enable-linger $USER" >&2
      systemctl --user daemon-reload
      systemctl --user enable "$SERVICE_NAME"
      systemctl --user restart "$SERVICE_NAME"
      ts="$(ts_exe)"                                              # 4) Funnel (öffentlich) auf festen Port
      [[ -n "$ts" ]] && "$ts" funnel --bg --https=443 "http://127.0.0.1:$BRIDGE_PORT" >/dev/null 2>&1 \
        && echo "→ Funnel (öffentlich) → 127.0.0.1:$BRIDGE_PORT" \
        || echo "⚠ Funnel nicht gesetzt — manuell: tailscale.exe funnel --bg --https=443 http://127.0.0.1:$BRIDGE_PORT" >&2
      echo; cmd_service status
      ;;
    remove)
      systemctl --user disable --now "$SERVICE_NAME" 2>/dev/null && echo "Service entfernt" || echo "Service war nicht aktiv"
      ts="$(ts_exe)"
      if [[ -n "$ts" ]]; then "$ts" funnel --https=443 off >/dev/null 2>&1 && echo "Funnel (443) aus"; "$ts" serve --https=443 off >/dev/null 2>&1 || true; fi
      ;;
    status)
      systemctl --user status "$SERVICE_NAME" --no-pager 2>&1 | head -6 || true
      echo
      curl -sS --max-time 4 -o /dev/null -w "localhost:$BRIDGE_PORT -> HTTP %{http_code}\n" "http://127.0.0.1:$BRIDGE_PORT/" || true
      print_urls "$BRIDGE_PORT"
      ;;
    *) echo "usage: brainstorm-bridge.sh service {install|remove|status}" >&2; exit 2 ;;
  esac
}

case "${1:-}" in
  start)   cmd_start ;;
  urls)    cmd_urls ;;
  show)    shift; cmd_show "$@" ;;
  choice)  cmd_choice ;;
  submission) cmd_submission ;;
  funnel)  cmd_funnel ;;
  service) shift; cmd_service "$@" ;;
  stop)    cmd_stop ;;
  *) echo "usage: $0 {start|urls|show <file>|choice|submission|funnel|service <install|remove|status>|stop}" >&2; exit 2 ;;
esac
