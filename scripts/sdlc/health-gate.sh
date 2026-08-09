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

# ── summary ──────────────────────────────────────────────────────────────────

if [[ "$EXIT" -ne 0 ]]; then
  printf '[%s] FAIL  health-gate: %d component(s) not ready:' "$(ts)" "${#FAILED[@]}" >&2
  printf ' %s' "${FAILED[@]}" >&2
  echo >&2
else
  pass "health-gate" "all components ready" >&2
fi

exit "$EXIT"
