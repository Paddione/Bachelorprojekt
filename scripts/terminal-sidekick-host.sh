#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# scripts/terminal-sidekick-host.sh
# Idempotent host setup: install ttyd, create sidekick tmux session
# with four agent windows, register systemd user unit binding only
# the wg-fleet overlay IP (never 0.0.0.0).
#
# Prerequisites:
#   - WireGuard tunnel to the fleet mesh is up (wg show wg-fleet)
#   - WG_MESH_TERMINAL_PRIVATE_KEY + WG_MESH_TERMINAL_PUBLIC_KEY set
#     in the env or provided by the fleet-provisioning workflow
#
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE_NAME="terminal-sidekick"
SYSTEMD_UNIT="${HOME}/.config/systemd/user/${SERVICE_NAME}.service"
TMUX_SESSION="sidekick"
TTYD_PORT="${TTYD_PORT:-7681}"
WG_INTERFACE="${WG_INTERFACE:-wg-fleet}"
OVERLAY_IP="${TERMINAL_OVERLAY_IP:-10.20.0.10}"

# ── Install ttyd if missing ──────────────────────────────────────
install_ttyd() {
  if command -v ttyd &>/dev/null; then
    echo "✓ ttyd already installed ($(ttyd --version))"
    return 0
  fi
  if [[ "$(uname -s)" != Linux ]]; then
    echo "✗ ttyd auto-install is Linux-only. Install manually: https://github.com/tsl0922/ttyd"
    return 1
  fi
  echo "→ Installing ttyd via APT ..."
  sudo apt-get update -qq
  sudo apt-get install -y -qq ttyd
  command -v ttyd &>/dev/null || {
    echo "✗ ttyd install failed. Try: sudo apt-get install ttyd"
    return 1
  }
  echo "✓ ttyd installed"
}

# ── Create tmux session (idempotent) ──────────────────────────────
create_tmux_session() {
  if tmux has-session -t "$TMUX_SESSION" 2>/dev/null; then
    echo "✓ tmux session '${TMUX_SESSION}' already exists"
    return 0
  fi
  echo "→ Creating tmux session '${TMUX_SESSION}' ..."
  tmux new-session -d -s "$TMUX_SESSION" -n opencode -c "$REPO_ROOT"
  tmux new-window  -t "${TMUX_SESSION}:" -n hermes   -c "$REPO_ROOT"
  tmux new-window  -t "${TMUX_SESSION}:" -n claude   -c "$REPO_ROOT"
  tmux new-window  -t "${TMUX_SESSION}:" -n agy      -c "$REPO_ROOT"
  echo "✓ Session created with windows: opencode, hermes, claude, agy"
}

# ── Register systemd user unit ────────────────────────────────────
install_systemd_unit() {
  if [ -f "$SYSTEMD_UNIT" ]; then
    echo "✓ systemd unit already exists at ${SYSTEMD_UNIT}"
    return 0
  fi
  echo "→ Creating systemd user unit ..."
  mkdir -p "$(dirname "$SYSTEMD_UNIT")"

  cat > "$SYSTEMD_UNIT" <<UNIT
[Unit]
Description=Terminal Sidekick — ttyd fronting tmux session
Documentation=https://github.com/tsl0922/ttyd
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/ttyd --interface ${OVERLAY_IP} --port ${TTYD_PORT} --writable tmux attach -t ${TMUX_SESSION}
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
UNIT

  systemctl --user daemon-reload
  echo "✓ systemd unit created"
}

enable_and_start() {
  if systemctl --user is-enabled --quiet "$SERVICE_NAME" 2>/dev/null; then
    echo "✓ systemd unit already enabled"
  else
    echo "→ Enabling systemd unit ..."
    systemctl --user enable "$SERVICE_NAME"
  fi
  if systemctl --user is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    echo "✓ systemd unit already running"
  else
    echo "→ Starting systemd unit ..."
    systemctl --user start "$SERVICE_NAME"
  fi
}

# ── Main ──────────────────────────────────────────────────────────
main() {
  echo "═══ Terminal Sidekick Host Setup ═══"
  install_ttyd
  create_tmux_session
  install_systemd_unit
  enable_and_start
  echo "═══ Done ═══"
  echo "ttyd PID: $(systemctl --user show -p MainPID --value "$SERVICE_NAME" 2>/dev/null || echo 'not running')"
  echo "tmux sessions:"
  tmux list-sessions 2>/dev/null | grep "$TMUX_SESSION" || echo "(sidekick session not found)"
}

main "$@"
