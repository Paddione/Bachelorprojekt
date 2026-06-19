#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# wait-for-sealed-secret.sh — fail-closed wait for a controller-decrypted Secret
# ═══════════════════════════════════════════════════════════════════
# Replaces the inline `for i in $(seq 1 30)` loop in workspace:deploy. The old
# loop ran WITHOUT a failure check: a stale sealing cert → the SealedSecret never
# decrypts → loop exits 0 → ghcr-PAT/workspace-secrets stay empty → keycloak/
# sync-db SKIP on an empty Secret → deploy reports "green" with no credentials.
# This helper FAILS CLOSED on timeout with a stale-cert diagnosis.
#
# Usage:
#   scripts/wait-for-sealed-secret.sh --context <c> --namespace <ns> \
#       --secret <name> --timeout <seconds>
#
# KUBECTL override (tests inject a fake): KUBECTL=/path/to/fake-kubectl
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

KUBECTL="${KUBECTL:-kubectl}"
CONTEXT="" ; NAMESPACE="" ; SECRET="" ; TIMEOUT="90"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --context)   CONTEXT="$2";   shift 2 ;;
    --namespace) NAMESPACE="$2"; shift 2 ;;
    --secret)    SECRET="$2";    shift 2 ;;
    --timeout)   TIMEOUT="$2";   shift 2 ;;
    *) echo "wait-for-sealed-secret: unknown arg: $1" >&2; exit 2 ;;
  esac
done

[[ -n "$NAMESPACE" ]] || { echo "wait-for-sealed-secret: --namespace required" >&2; exit 2; }
[[ -n "$SECRET"    ]] || { echo "wait-for-sealed-secret: --secret required"    >&2; exit 2; }

ctx_flag=()
[[ -n "$CONTEXT" ]] && ctx_flag=(--context "$CONTEXT")

echo "Waiting up to ${TIMEOUT}s for Secret '${SECRET}' in ns '${NAMESPACE}' to be decrypted..."
deadline=$(( $(date +%s) + TIMEOUT ))
while :; do
  if "$KUBECTL" "${ctx_flag[@]}" get secret "$SECRET" -n "$NAMESPACE" >/dev/null 2>&1; then
    echo "✓ Secret '${SECRET}' present in ns '${NAMESPACE}'."
    exit 0
  fi
  if (( $(date +%s) >= deadline )); then
    {
      echo "✗ FAIL: Secret '${SECRET}' never appeared in ns '${NAMESPACE}' within ${TIMEOUT}s."
      echo "  The SealedSecret did not decrypt — most likely a STALE sealing cert"
      echo "  (the controller keypair rotated, e.g. after a cluster reset)."
      echo "  Fix: task env:fetch-cert ENV=<env> && task env:seal ENV=<env>, then re-deploy."
    } >&2
    exit 1
  fi
  sleep 2
done
