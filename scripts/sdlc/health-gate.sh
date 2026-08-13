#!/usr/bin/env bash
# scripts/sdlc/health-gate.sh — T002655
# Health gate for the SDLC local stack. Checks every component the stack
# depends on and fails-fast with the name of the first failing component.
#
# Usage:
#   scripts/sdlc/health-gate.sh [--context <name>] [--timeout <seconds>]
#
# Exit 0 if all components are ready; non-zero otherwise.
# Output: one line per component with its observed state.
# Idempotent — safe to run repeatedly; no side effects.

set -euo pipefail

# Defaults
CTX="${CTX:-k3d-mentolder-dev}"
TIMEOUT="${TIMEOUT:-60}"
LLM_PROXY_PORT="${LLM_PROXY_PORT:-18235}"
LLM_PROXY_LIVEZ="${LLM_PROXY_LIVEZ:-http://127.0.0.1:${LLM_PROXY_PORT}/livez}"
LLM_PROXY_HEALTH="${LLM_PROXY_HEALTH:-http://127.0.0.1:${LLM_PROXY_PORT}/health}"
LLM_PROXY_STATUS="${LLM_PROXY_STATUS:-http://127.0.0.1:${LLM_PROXY_PORT}/admin/loadouts/status}"
SDLC_LLM_LOADOUT="${SDLC_LLM_LOADOUT:-gemma26-throughput}"

declare -a FAILED=()
EXIT=0

# ── helpers ──────────────────────────────────────────────────────────────────

ts() { date -u '+%H:%M:%S'; }

fail() {
  local component="$1"; shift
  printf '[%s] FAIL  %-22s %s\n' "$(ts)" "$component" "$*" >&2
  FAILED+=("$component")
  EXIT=1
}

pass() {
  local component="$1"; shift
  printf '[%s]  OK   %-22s %s\n' "$(ts)" "$component" "$*" >&2
}

# ── argument parsing ─────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    --context) CTX="${2:?missing --context value}"; shift 2;;
    --timeout) TIMEOUT="${2:?missing --timeout value}"; shift 2;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: $0 [--context <name>] [--timeout <seconds>]" >&2
      exit 2
      ;;
  esac
done

# ── cluster reachability ─────────────────────────────────────────────────────

msg="context=$CTX, timeout=${TIMEOUT}s"
if kubectl --context "$CTX" get nodes --request-timeout="${TIMEOUT}s" >/dev/null 2>&1; then
  pass "cluster" "$msg"
else
  fail "cluster" "$msg"
  # No point continuing — every subsequent check depends on the cluster
  printf '%s\n' "${FAILED[@]}"
  exit 1
fi

# ── kubelet-cert check (T002999) ─────────────────────────────────────────────
# Prueft das Kubelet-Serving-Zertifikat JEDES Nodes. Exit 2 (Vorbedingung fehlt,
# z.B. openssl nicht im PATH) ist eine Warnung, kein Gate-Fehlschlag — sonst
# scheitert das Gate auf Maschinen ohne openssl an der eigenen Ausstattung.
# Der Check kommt VOR den Deployment-Prüfungen: kubectl rollout status läuft
# über den API-Server und bleibt grün, während jedes kubectl exec scheitert.
CERT_CHECK="$(cd "$(dirname "$0")" && pwd)/kubelet-cert-check.sh"
if [[ -x "$CERT_CHECK" ]]; then
  if "$CERT_CHECK" --context "$CTX" 2>/dev/null; then
    pass "kubelet-cert" "SAN matches InternalIP on all nodes"
  else
    cert_rc=$?
    if [[ $cert_rc -eq 2 ]]; then
      echo "[$(ts)] WARN  kubelet-cert           Vorbedingung fehlt (z.B. openssl) — uebersprungen" >&2
    else
      fail "kubelet-cert" "SAN mismatch detected — run scripts/sdlc/kubelet-cert-check.sh --repair"
    fi
  fi
fi

# ── deployments (namespace: workspace) ───────────────────────────────────────

declare -A DEPLOYMENTS=(
  ["shared-db"]="workspace"
  ["pocket-id"]="workspace"
  ["sdlc-console"]="workspace"
  ["bge-embed"]="workspace"
  ["bge-rerank"]="workspace"
)

for depl in "${!DEPLOYMENTS[@]}"; do
  ns="${DEPLOYMENTS[$depl]}"
  if kubectl --context "$CTX" rollout status "deployment/$depl" -n "$ns" --timeout="${TIMEOUT}s" >/dev/null 2>&1; then
    pass "$depl" "deployment ready in ns/$ns"
  else
    fail "$depl" "deployment not ready in ns/$ns"
  fi
done

# ── llm-proxy liveness ───────────────────────────────────────────────────────

if curl -fsS --max-time 5 "$LLM_PROXY_LIVEZ" >/dev/null 2>&1; then
  pass "llm-proxy" "livez OK"
else
  fail "llm-proxy" "not reachable at $LLM_PROXY_LIVEZ"
fi

# ── llm-proxy readiness (/health) ────────────────────────────────────────────
# Readiness, nicht Liveness: /health beantwortet "kann ich bedient werden"
# (T002336). Nach einem Kaltstart liest die Backend-Registry bis zu 30 s nach —
# deshalb Poll, kein Einzelversuch. Antwortet der Proxy aber mit einer
# definitiven Readiness-Aussage (ready:false, HTTP 503), ist das sofort ein
# Fehler, der die degraded-Backends aus der Antwort nennt.

READINESS_DEADLINE=$(( $(date +%s) + TIMEOUT ))
READINESS_DONE=0
while [[ "$READINESS_DONE" -eq 0 ]]; do
  if READINESS_BODY="$(curl -fsS --max-time 5 "$LLM_PROXY_HEALTH" 2>/dev/null)"; then
    if [[ "$(printf '%s' "$READINESS_BODY" | jq -r '.ready // empty' 2>/dev/null || true)" == "true" ]]; then
      pass "llm-proxy-readiness" "ready=true at $LLM_PROXY_HEALTH"
      READINESS_DONE=1
    else
      degraded="$(printf '%s' "$READINESS_BODY" | jq -r '[.degraded[]?.name] | join(", ")' 2>/dev/null || true)"
      fail "llm-proxy-readiness" "ready=false (degraded: ${degraded:-none})"
      READINESS_DONE=1
    fi
  elif [[ "$(date +%s)" -ge "$READINESS_DEADLINE" ]]; then
    fail "llm-proxy-readiness" "not reachable at $LLM_PROXY_HEALTH within ${TIMEOUT}s"
    READINESS_DONE=1
  else
    sleep 2
  fi
done

# ── chat loadout (admin API) ─────────────────────────────────────────────────
# Das konfigurierte Loadout (SDLC_LLM_LOADOUT) muss running + healthy sein.
# Die Admin-API meldet kein healthy-Feld — wie der Proxy selbst (waitHealthy
# in server.mjs) pruefen wir den Port des Loadouts.

if LOADOUT_BODY="$(curl -fsS --max-time 5 "$LLM_PROXY_STATUS" 2>/dev/null)"; then
  LOADOUT_STATE="$(printf '%s' "$LOADOUT_BODY" | jq -r --arg slug "$SDLC_LLM_LOADOUT" '
    [.status[] | select(.slug == $slug)][0]
    | if . == null then "missing" else "\(.running) \(.port)" end
  ' 2>/dev/null || true)"
  if [[ "$LOADOUT_STATE" == "missing" ]]; then
    fail "llm-loadout" "slug '$SDLC_LLM_LOADOUT' not found in loadouts/status"
  else
    LOADOUT_RUNNING="${LOADOUT_STATE%% *}"
    LOADOUT_PORT="${LOADOUT_STATE##* }"
    if [[ "$LOADOUT_RUNNING" == "true" ]] \
        && curl -fsS --max-time 5 "http://127.0.0.1:${LOADOUT_PORT}/health" >/dev/null 2>&1; then
      pass "llm-loadout" "running+healthy ($SDLC_LLM_LOADOUT, port $LOADOUT_PORT)"
    else
      fail "llm-loadout" "$SDLC_LLM_LOADOUT state: running=$LOADOUT_RUNNING (port $LOADOUT_PORT not healthy)"
    fi
  fi
else
  fail "llm-loadout" "admin status not reachable at $LLM_PROXY_STATUS"
fi

# ── summary ──────────────────────────────────────────────────────────────────

if [[ "$EXIT" -ne 0 ]]; then
  printf '[%s] FAIL  health-gate: %d component(s) not ready:' "$(ts)" "${#FAILED[@]}" >&2
  printf ' %s' "${FAILED[@]}" >&2
  echo >&2
else
  pass "health-gate" "all components ready" >&2
fi

exit "$EXIT"
