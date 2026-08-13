#!/usr/bin/env bash
# scripts/sdlc/llm-up.sh — T002656
# Idempotenter Start/Stopp des konfigurierten Chat-Loadouts ueber die
# Proxy-Admin-API. Der llm-proxy startet Loadouts nur on-demand beim ersten
# passenden Request (T002336/T002616); sdlc:up startet das konfigurierte
# Loadout deshalb explizit, bevor der Health-Gate laeuft.
#
# Usage:
#   scripts/sdlc/llm-up.sh [up|down]
#
# Modus up (Default):  Loadout starten, falls es nicht laeuft; warten, bis es
#                      running + healthy ist. Exit 1, wenn der Proxy nicht
#                      erreichbar ist oder der Start fehlschlaegt.
# Modus down:          Loadout stoppen (best-effort — Exit 0 auch bei nicht
#                      erreichbarem Proxy oder bereits gestopptem Loadout).
#
# Exit 0 auf Erfolg; non-zero auf Fehler. Ausgaben als einzelne Zeilen mit
# Prefix [llm-up]; Fehler gehen nach stderr.
# Externe Abhaengigkeiten: nur curl, jq, grep.

set -euo pipefail

# Umgebung (Defaults wie in scripts/sdlc/health-gate.sh)
LLM_PROXY_PORT="${LLM_PROXY_PORT:-18235}"
SDLC_LLM_LOADOUT="${SDLC_LLM_LOADOUT:-gemma26-throughput}"

PROXY_BASE="http://127.0.0.1:${LLM_PROXY_PORT}"
POLL_TIMEOUT_S=120
POLL_INTERVAL_S=2

MODE="${1:-up}"

log() { printf '[llm-up] %s\n' "$*"; }
err() { printf '[llm-up] %s\n' "$*" >&2; }

# Proxy lebt? (Liveness, nicht Readiness — der Gate prueft Readiness.)
proxy_live() {
  curl -fsS --max-time 3 "${PROXY_BASE}/livez" >/dev/null 2>&1
}

# Status-JSON der Admin-API holen (leer bei Transportfehler).
loadout_status_json() {
  curl -fsS --max-time 5 "${PROXY_BASE}/admin/loadouts/status" 2>/dev/null || true
}

# Zustand des konfigurierten Loadouts aus dem Status-JSON:
#   "running <bool> <port>"  — Loadout existiert
#   "missing"                — Slug nicht im Status (unbekanntes Loadout)
loadout_state() {
  local json="$1"
  printf '%s' "$json" | jq -r --arg slug "$SDLC_LLM_LOADOUT" '
    [.status[] | select(.slug == $slug)][0]
    | if . == null then "missing" else "\(.running) \(.port)" end
  ' 2>/dev/null || echo "missing"
}

# Loadout-Gesundheit: die Admin-API meldet kein healthy-Feld — wie der Proxy
# selbst (waitHealthy in server.mjs) pruefen wir den Port des Loadouts.
port_healthy() {
  local port="$1"
  curl -fsS --max-time 5 "http://127.0.0.1:${port}/health" >/dev/null 2>&1
}

# Antwortet das konfigurierte Loadout running + healthy?
# Parameter: Status-JSON. Echo: "true"/"false".
loadout_running_healthy() {
  local json="$1" state running port
  state="$(loadout_state "$json")"
  [[ "$state" == "missing" ]] && { echo "false"; return; }
  running="${state%% *}"
  port="${state##* }"
  if [[ "$running" == "true" ]] && port_healthy "$port"; then
    echo "true"
  else
    echo "false"
  fi
}

# Auf running + healthy pollen (Timeout 120 s, Intervall 2 s).
# Echo: "ok" oder "timeout <letzter Zustand>".
poll_until_healthy() {
  local deadline=$(( $(date +%s) + POLL_TIMEOUT_S ))
  local json state
  while :; do
    json="$(loadout_status_json)"
    if [[ "$(loadout_running_healthy "$json")" == "true" ]]; then
      echo "ok"
      return
    fi
    state="$(loadout_state "$json")"
    if [[ "$(date +%s)" -ge "$deadline" ]]; then
      echo "timeout ${state}"
      return
    fi
    sleep "$POLL_INTERVAL_S"
  done
}

# ── Modus up ──────────────────────────────────────────────────────────────────

cmd_up() {
  if ! proxy_live; then
    err "llm-proxy not reachable at ${PROXY_BASE}/livez (LLM_PROXY_PORT=${LLM_PROXY_PORT})"
    exit 1
  fi

  local json state
  json="$(loadout_status_json)"
  state="$(loadout_state "$json")"

  if [[ "$state" == "missing" ]]; then
    err "loadout '${SDLC_LLM_LOADOUT}' unbekannt — nicht in /admin/loadouts/status"
    exit 1
  fi

  if [[ "$(loadout_running_healthy "$json")" == "true" ]]; then
    log "loadout '${SDLC_LLM_LOADOUT}' laeuft bereits (running + healthy) — ueberspringe start"
    exit 0
  fi

  log "starte loadout '${SDLC_LLM_LOADOUT}' via ${PROXY_BASE}/admin/loadouts/${SDLC_LLM_LOADOUT}/start"
  local body rc
  body="$(curl -sS --max-time 10 -w '\n%{http_code}' \
    -X POST "${PROXY_BASE}/admin/loadouts/${SDLC_LLM_LOADOUT}/start" || true)"
  rc="$(printf '%s' "$body" | tail -1)"
  body="$(printf '%s' "$body" | sed '$d')"

  case "$rc" in
    201)
      ;;
    409)
      # Konflikt — das fremde Loadout wird NICHT gestoppt (SSOT-Szenario).
      local code message
      code="$(printf '%s' "$body" | jq -r '.error.code // "conflict"' 2>/dev/null || echo conflict)"
      message="$(printf '%s' "$body" | jq -r '.error.message // ""' 2>/dev/null || true)"
      if [[ "$code" == "exclusive_conflict" ]]; then
        err "start fehlgeschlagen: exclusiveGroup belegt — ${message}"
      else
        err "start fehlgeschlagen (${code}): ${message:-siehe Proxy-Antwort}"
      fi
      exit 1
      ;;
    404)
      err "start fehlgeschlagen: loadout '${SDLC_LLM_LOADOUT}' unbekannt (404)"
      exit 1
      ;;
    *)
      err "start fehlgeschlagen: unerwartete HTTP-Antwort ${rc:-keine}"
      exit 1
      ;;
  esac

  log "warte auf running + healthy (Timeout ${POLL_TIMEOUT_S}s)"
  local result
  result="$(poll_until_healthy)"
  case "$result" in
    ok)
      log "loadout '${SDLC_LLM_LOADOUT}' running + healthy"
      ;;
    timeout*)
      err "timeout: loadout '${SDLC_LLM_LOADOUT}' nicht healthy geworden (letzter Status: ${result#timeout })"
      exit 1
      ;;
  esac
}

# ── Modus down ────────────────────────────────────────────────────────────────

cmd_down() {
  if ! proxy_live; then
    log "warn: llm-proxy not reachable at ${PROXY_BASE} — nichts zu stoppen (best-effort)"
    exit 0
  fi

  local json state running
  json="$(loadout_status_json)"
  state="$(loadout_state "$json")"

  if [[ "$state" == "missing" ]]; then
    log "warn: loadout '${SDLC_LLM_LOADOUT}' unbekannt — nichts zu stoppen (best-effort)"
    exit 0
  fi

  running="${state%% *}"
  if [[ "$running" != "true" ]]; then
    log "warn: loadout '${SDLC_LLM_LOADOUT}' laeuft nicht — nichts zu stoppen (best-effort)"
    exit 0
  fi

  log "stoppe loadout '${SDLC_LLM_LOADOUT}' via ${PROXY_BASE}/admin/loadouts/${SDLC_LLM_LOADOUT}/stop"
  local body rc
  body="$(curl -sS --max-time 10 -w '\n%{http_code}' \
    -X POST "${PROXY_BASE}/admin/loadouts/${SDLC_LLM_LOADOUT}/stop" || true)"
  rc="$(printf '%s' "$body" | tail -1)"
  if [[ "$rc" != "200" ]]; then
    log "warn: stop antwortete mit HTTP ${rc:-keine Antwort} — best-effort weiter"
  else
    log "loadout '${SDLC_LLM_LOADOUT}' gestoppt"
  fi
  exit 0
}

# ── Dispatch ──────────────────────────────────────────────────────────────────

case "$MODE" in
  up)   cmd_up ;;
  down) cmd_down ;;
  *)
    err "unbekannter Modus '${MODE}' — erwartet: up|down"
    exit 2
    ;;
esac
