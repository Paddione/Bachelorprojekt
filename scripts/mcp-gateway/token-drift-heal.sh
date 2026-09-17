#!/usr/bin/env bash
# token-drift-heal.sh — MCP-Token-Drift erkennen (check) und heilen (heal). [T900223]
# Aus watchdog-check.sh im selben 60-s-Tick aufgerufen (Tick, Rate-Limit-STAMP
# und fail-closed geteilt); Heal laeuft ueber `mcp-sync.sh render` (cmd_render).
# Redaction: nur sha256-Fingerprints werden verglichen; Werte nur ueber
# stdin/Pipes (builtin-printf | sha256sum), Output nur Key-Namen + match|drift|skip.
# Precedents: verify-deployment.sh _secret_key_in_sync, mcp-sync.sh
# harden_secret_file (chmod 600), doctor.sh probe-Ports/Units.
# Test-Hooks (BATS-Fixtures): MCP_LIVE_SECRET_FILE, MCP_SYNC_SCRIPT,
# AGENT_MSG_SCRIPT, MCP_DOCTOR_SCRIPT, KUBECTL_BIN, MCP_WATCHDOG_STAMP.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

SYNC_SCRIPT="${MCP_SYNC_SCRIPT:-$REPO_ROOT/scripts/mcp-sync.sh}"
MSG_SCRIPT="${AGENT_MSG_SCRIPT:-$REPO_ROOT/scripts/agent-msg.sh}"
DOCTOR_SCRIPT="${MCP_DOCTOR_SCRIPT:-$REPO_ROOT/scripts/mcp-gateway/doctor.sh}"
KUBECTL_BIN="${KUBECTL_BIN:-kubectl}"
STAMP="${MCP_WATCHDOG_STAMP:-$HOME/.config/systemd/user/mcp-gateway-watchdog.last_restart}"
RATE_LIMIT_SEC=300
LIVE_SECRET_FILE="${MCP_LIVE_SECRET_FILE:-}"

KEYS="BGE_MCP_TOKEN MCP_POSTGRES_TOKEN FACTORY_MCP_TOKEN"

key_env_file() { # <KEY> -> server.env-Pfad
  case "$1" in
    BGE_MCP_TOKEN) printf '%s' "$HOME/.config/bge-mcp/server.env" ;;
    MCP_POSTGRES_TOKEN) printf '%s' "$HOME/.config/mcp-postgres/server.env" ;;
    FACTORY_MCP_TOKEN) printf '%s' "$HOME/.config/factory-mcp-node/server.env" ;;
  esac
}

key_unit() { # <KEY> -> systemd-User-Unit bei Drift
  case "$1" in
    BGE_MCP_TOKEN) printf 'bge-mcp' ;;
    MCP_POSTGRES_TOKEN) printf 'mcp-postgres-local' ;;
    FACTORY_MCP_TOKEN) printf 'factory-mcp' ;;
  esac
}

read_key_from_file() { # <file> <KEY> -> letzte ^KEY=-Zeile (Wert), rc 1 wenn fehlt
  local f="$1" k="$2" line key val="" hit=1
  if [ ! -r "$f" ]; then return 1; fi
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in '#'*) continue ;; esac
    key="${line%%=*}"
    key="$(printf '%s' "$key" | tr -d '[:space:]')"
    if [ "$key" = "$k" ]; then val="${line#*=}"; hit=0; fi
  done < "$f"
  if [ "$hit" -eq 0 ]; then printf '%s' "$val"; fi
  return "$hit"
}

live_value() { # <KEY> -> Live-Wert; rc 1 = nicht lesbar (fail-closed SKIP)
  local k="$1" v
  if [ -n "$LIVE_SECRET_FILE" ]; then
    if ! v="$(read_key_from_file "$LIVE_SECRET_FILE" "$k")" || [ -z "$v" ]; then return 1; fi
    printf '%s' "$v"
    return 0
  fi
  if ! v="$("$KUBECTL_BIN" --context devmesh -n workspace get secret workspace-secrets \
      -o "jsonpath={.data.$k}" 2>/dev/null | base64 -d 2>/dev/null)" || [ -z "$v" ]; then return 1; fi
  printf '%s' "$v"
}

fingerprint() { sha256sum | cut -d' ' -f1; } # liest den Wert NUR von stdin

key_status() { # <KEY> -> match|drift|skip (nie ein Token-Wert)
  local k="$1" live envv
  if ! live="$(live_value "$k")"; then printf 'skip'; return 0; fi
  if ! envv="$(read_key_from_file "$(key_env_file "$k")" "$k")" || [ -z "$envv" ]; then
    printf 'drift'
    return 0
  fi
  if [ "$(printf '%s' "$live" | fingerprint)" = "$(printf '%s' "$envv" | fingerprint)" ]; then
    printf 'match'
  else
    printf 'drift'
  fi
  return 0
}

cmd_check() { # read-only Detect; Exit non-zero sobald ein Key driftet
  local k st drift=0
  for k in $KEYS; do
    st="$(key_status "$k")"
    printf '%s: %s\n' "$k" "$st"
    if [ "$st" = "drift" ]; then drift=1; fi
  done
  return "$drift"
}

rewrite_env_key() { # <file> <KEY> <Wert> — atomar (mktemp + mv), Modus 600
  local f="$1" k="$2" v="$3" d tmp
  d="$(dirname "$f")"
  mkdir -p "$d"
  tmp="$(mktemp "$d/.server.env.tmp.XXXXXX")"
  if [ -f "$f" ]; then
    grep -v "^${k}=" "$f" > "$tmp" || true
  else
    : > "$tmp"
  fi
  printf '%s=%s\n' "$k" "$v" >> "$tmp"
  chmod 600 "$tmp" # harden_secret_file-Muster aus scripts/mcp-sync.sh:58
  mv "$tmp" "$f"
}

cmd_heal() { # nur driftete Keys: Rewrite, Render, Restart, Notify, Verify
  local k st drifted="" now mtime age val msg
  if [ -f "$STAMP" ]; then
    mtime="$(stat -c %Y "$STAMP" 2>/dev/null || echo 0)"
    now="$(date +%s)"
    age=$(( now - mtime ))
    if [ "$age" -lt "$RATE_LIMIT_SEC" ]; then
      echo "HEAL-SKIP: rate-limited (letzter Heal vor ${age}s)"
      return 0
    fi
  fi
  for k in $KEYS; do
    st="$(key_status "$k")"
    printf '%s: %s\n' "$k" "$st"
    if [ "$st" = "drift" ]; then drifted="$drifted $k"; fi
  done
  if [ -z "$drifted" ]; then return 0; fi
  for k in $drifted; do
    if ! val="$(live_value "$k")"; then continue; fi
    rewrite_env_key "$(key_env_file "$k")" "$k" "$val"
  done
  bash "$SYNC_SCRIPT" render # genau ein Render-Lauf pro Heal
  for k in $drifted; do
    systemctl --user restart "$(key_unit "$k")" # nur betroffene Units
  done
  msg="Token $(printf '%s' "$drifted" | tr -s ' ' | sed 's/^ //;s/ /,/g') rotiert, Dateien geheilt — Harness einmal neu starten"
  bash "$MSG_SCRIPT" post "$msg" || true
  echo "$msg" # Journal-Echo derselben Zeile
  mkdir -p "$(dirname "$STAMP")" && touch "$STAMP"
  if ! bash "$DOCTOR_SCRIPT" >/dev/null 2>&1; then
    bash "$MSG_SCRIPT" post "Token-Heal-Verifikation fehlgeschlagen — doctor.sh pruefen, kein erneuter Heal (Rate-Limit)" || true
  fi
  return 0
}

case "${1:-}" in
  check) cmd_check ;;
  heal) cmd_heal ;;
  *) echo "Usage: $0 check|heal" >&2; exit 2 ;;
esac
