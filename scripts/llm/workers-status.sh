#!/usr/bin/env bash
# scripts/llm/workers-status.sh — Lokale LLM-Worker im Blick: Prozess, CPU, RAM,
# serviertes Modell und GPU-Totals. Quelle fuer die Worker-Zeilen sind die
# enabled Loadouts aus scripts/llm/loadouts.json plus der llm-proxy selbst.
#
# Einschraenkung (WSL): nvidia-smi meldet hier keine Per-Prozess-VRAM-Werte
# (--query-compute-apps bleibt leer), daher GPU nur als Totals pro Karte.
# Das Skript degradiert ueberall graceful (offline statt Abbruch) und ist
# damit auch ohne laufende Server ausfuehrbar (Exit 0).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOADOUTS="$ROOT/scripts/llm/loadouts.json"
PROXY_PORT="${LLM_PROXY_PORT:-18235}"

have() { command -v "$1" >/dev/null 2>&1; }

pid_on_port() {
  ss -tlnp 2>/dev/null | grep -E "[:.]$1( |$)" | grep -o -m1 'pid=[0-9]*' | cut -d= -f2
}

model_on_port() {
  local body
  body="$(curl -s -m 3 "http://127.0.0.1:$1/v1/models" 2>/dev/null)" || return 1
  [ -n "$body" ] || return 1
  if have jq; then
    printf '%s' "$body" | jq -r '.models[0].model // .data[0].id // empty' 2>/dev/null
  else
    printf '%s' "$body" | grep -o -m1 '"model"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4
  fi
}

row() { # slug port want_model
  local slug="$1" port="$2" want="$3" pid cpu rss eth model state
  pid="$(pid_on_port "$port")"
  if [ -z "$pid" ]; then
    printf '%-20s %-6s %-8s %-7s %-9s %-32s %s\n' "$slug" "$port" "-" "-" "-" "$want" "offline"
    return 0
  fi
  cpu="$(ps -o %cpu= -p "$pid" 2>/dev/null | tr -d ' ')"
  rss="$(ps -o rss= -p "$pid" 2>/dev/null | tr -d ' ')"
  eth="$(ps -o etime= -p "$pid" 2>/dev/null | tr -d ' ')"
  rss="$((rss / 1024))M"
  model="$(model_on_port "$port")"
  if [ -n "$model" ]; then state="ok ${eth}"; else model="$want"; state="kein /v1/models"; fi
  printf '%-20s %-6s %-8s %-7s %-9s %-32s %s\n' "$slug" "$port" "$pid" "${cpu}%" "$rss" "$model" "$state"
}

echo "── Worker (loadouts enabled + proxy) ──"
printf '%-20s %-6s %-8s %-7s %-9s %-32s %s\n' WORKER PORT PID CPU RAM MODELL STATUS
if have jq && [ -f "$LOADOUTS" ]; then
  while IFS=$'\t' read -r slug port model; do
    row "$slug" "$port" "$(basename "$model")"
  done < <(jq -r '.loadouts[] | select(.enabled == true) | [.slug, (.port|tostring), .model] | @tsv' "$LOADOUTS" 2>/dev/null)
else
  echo "(jq oder loadouts.json fehlt — nur Proxy-Zeile)"
fi
row "llm-proxy" "$PROXY_PORT" "-"

echo
echo "── Rollen-Ketten (loadouts roles) ──"
if have jq && [ -f "$LOADOUTS" ]; then
  while IFS=$'\t' read -r role url; do
    port="${url##*:}"; port="${port%%/*}"
    host="${url#*://}"; host="${host%%:*}"
    if [ "$host" = "127.0.0.1" ] || [ "$host" = "localhost" ]; then
      pid="$(pid_on_port "$port")"
      model="$(model_on_port "$port")"
      if [ -n "$pid" ]; then
        printf '%-8s %-45s pid=%-8s %s\n' "$role" "$url" "$pid" "${model:-kein /v1/models}"
      else
        printf '%-8s %-45s %s\n' "$role" "$url" "offline"
      fi
    else
      code="$(curl -s -m 3 -o /dev/null -w '%{http_code}' "$url/v1/models" 2>/dev/null)"
      [ "$code" = "200" ] && st="erreichbar" || st="nicht erreichbar ($code)"
      printf '%-8s %-45s %s\n' "$role" "$url" "$st"
    fi
  done < <(jq -r '.roles | to_entries[] | .key as $r | .value.chain[] | [$r, .] | @tsv' "$LOADOUTS" 2>/dev/null)
else
  echo "(jq oder loadouts.json fehlt)"
fi

echo
echo "── GPU-Totals ──"
if have nvidia-smi; then
  nvidia-smi --query-gpu=index,name,memory.used,memory.total,utilization.gpu --format=csv 2>&1 | head -n 8
  echo "(Per-Prozess-VRAM meldet nvidia-smi unter WSL nicht; siehe Skript-Kopf.)"
else
  echo "nvidia-smi nicht gefunden"
fi

echo
echo "── Proxy-Backends ──"
if have jq; then
  state="$(curl -s -m 5 "http://127.0.0.1:$PROXY_PORT/admin/state" 2>/dev/null)"
  if [ -n "$state" ]; then
    printf '%s' "$state" | jq -r '.backends[] | "\(.name) healthy=\(.healthy) models=\(.models|join(","))"' 2>/dev/null
  else
    echo "proxy nicht erreichbar"
  fi
else
  echo "(jq fehlt)"
fi
