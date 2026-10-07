#!/usr/bin/env bash
# scripts/openclaw-ask.sh — synchroner Broker-Aufruf an einen OpenClaw-Agenten. [T900538]
#
# Schickt eine Aufgabe per POST /v1/chat/completions an das lokale OpenClaw-Gateway
# (Agent-Default: task-runner) und gibt die Antwort des Agenten auf stdout aus.
# Vertrag: .agents/plans/openclaw-ops-bot/design.md, Komponente 4.
#
# Verwendung:
#   openclaw-ask.sh [--agent <id>] [--timeout <sekunden>] "<aufgabe>"
#
# Umgebung:
#   OPENCLAW_GATEWAY_TOKEN  Bearer-Token. Fehlt es, liest das Skript nur diese eine
#                           Variable aus ~/.openclaw/.env (kein source der Datei).
#   OPENCLAW_GATEWAY_URL    Basis-URL des Gateways (Default http://127.0.0.1:18789).
#
# Exit: 0 = Antwort auf stdout · 1 = Usage-Fehler · 2 = kein Token
#       · 3 = Gateway nicht erreichbar (curl 7/28) · 4 = HTTP-Fehler oder Antwort ohne Inhalt.
set -euo pipefail

DEFAULT_URL="http://127.0.0.1:18789"

usage() {
  echo "Usage: ${0##*/} [--agent <id>] [--timeout <sekunden>] \"<aufgabe>\"" >&2
  exit 1
}

# Liest OPENCLAW_GATEWAY_TOKEN aus der Umgebung, sonst die letzte passende Zeile aus
# ~/.openclaw/.env. Gibt einen leeren String aus, wenn nichts gefunden wird.
read_token() {
  if [ -n "${OPENCLAW_GATEWAY_TOKEN:-}" ]; then
    printf '%s' "$OPENCLAW_GATEWAY_TOKEN"
    return 0
  fi
  local env_file="${HOME}/.openclaw/.env" line
  [ -r "$env_file" ] || return 0
  line="$(grep -E '^[[:space:]]*(export[[:space:]]+)?OPENCLAW_GATEWAY_TOKEN=' "$env_file" | tail -n 1 || true)"
  line="${line#*=}"
  line="${line%$'\r'}"
  line="${line#\"}"
  line="${line%\"}"
  line="${line#\'}"
  line="${line%\'}"
  printf '%s' "$line"
}

agent="task-runner"
timeout_s=300
while [ $# -gt 0 ]; do
  case "$1" in
    --agent)   [ $# -ge 2 ] || usage; agent="$2"; shift 2 ;;
    --timeout) [ $# -ge 2 ] || usage; timeout_s="$2"; shift 2 ;;
    --)        shift; break ;;
    -*)        usage ;;
    *)         break ;;
  esac
done
[ $# -eq 1 ] || usage
task="$1"
[ -n "$task" ] || usage
[ -n "$agent" ] || usage
[[ "$timeout_s" =~ ^[1-9][0-9]*$ ]] || usage

token="$(read_token)"
if [ -z "$token" ]; then
  echo "FEHLER: OPENCLAW_GATEWAY_TOKEN fehlt (weder in der Umgebung noch in ~/.openclaw/.env) — Abhilfe: task openclaw:configure." >&2
  exit 2
fi

base_url="${OPENCLAW_GATEWAY_URL:-$DEFAULT_URL}"
base_url="${base_url%/}"
endpoint="${base_url}/v1/chat/completions"

body="$(jq -n \
  --arg model "openclaw/${agent}" \
  --arg user "conv:openclaw-ask-$$" \
  --arg task "$task" \
  '{model: $model, user: $user, messages: [{role: "user", content: $task}]}')"

resp_file="$(mktemp)"
trap 'rm -f "$resp_file"' EXIT

# Der Token geht per stdin an curl (-H @-), damit er nicht in der Prozessliste steht.
curl_rc=0
http_code="$(printf 'Authorization: Bearer %s\n' "$token" \
  | curl -s --max-time "$timeout_s" \
      -o "$resp_file" -w '%{http_code}' \
      -H @- -H 'Content-Type: application/json' \
      --data-binary "$body" "$endpoint")" || curl_rc=$?

if [ "$curl_rc" -eq 7 ] || [ "$curl_rc" -eq 28 ]; then
  echo "FEHLER: OpenClaw-Gateway unter ${base_url} nicht erreichbar (curl-Exit ${curl_rc}) — Abhilfe: task openclaw:status." >&2
  exit 3
fi
if [ "$curl_rc" -ne 0 ]; then
  echo "FEHLER: Anfrage an ${endpoint} fehlgeschlagen (curl-Exit ${curl_rc})." >&2
  exit 4
fi

if [ "$http_code" != "200" ]; then
  err_text="$(jq -r '.error.message // .error // empty' "$resp_file" 2>/dev/null || true)"
  [ -n "$err_text" ] || err_text="$(head -c 500 "$resp_file")"
  echo "FEHLER: HTTP ${http_code} von ${endpoint}: ${err_text}" >&2
  exit 4
fi

content="$(jq -r '.choices[0].message.content // empty' "$resp_file" 2>/dev/null || true)"
if [ -z "$content" ]; then
  echo "FEHLER: Antwort von ${endpoint} ohne .choices[0].message.content: $(head -c 500 "$resp_file")" >&2
  exit 4
fi

printf '%s\n' "$content"
