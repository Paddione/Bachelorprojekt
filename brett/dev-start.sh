#!/usr/bin/env bash
# brett/dev-start.sh — run Brett locally against the korczewski cluster
#
# Prerequisites (one-time manual setup):
#   1. npm install  (run once inside brett/)
#   2. Register https://brett-dev.korczewski.de/callback as a valid redirect URI
#      in the 'brett-app' OIDC client via the korczewski Keycloak admin UI:
#      https://keycloak.korczewski.de/admin → workspace realm → Clients → brett-app
#   3. Ensure the korczewski dev sish stack is running (port 32224 on korczewski.de)
#
# Usage: run from repo root
#   bash brett/dev-start.sh

set -euo pipefail

# ── prerequisite checks ───────────────────────────────────────────────────────
check_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "ERROR: '$1' not found in PATH" >&2; exit 1; }
}

check_cmd kubectl
check_cmd jq
check_cmd node
check_cmd npx
check_cmd ssh

[[ -f brett/server.js ]] || { echo "ERROR: run this script from the repo root (brett/server.js not found)" >&2; exit 1; }
[[ -d brett/node_modules ]] || { echo "ERROR: run 'npm install' inside brett/ first" >&2; exit 1; }

echo "[brett-dev] checking korczewski cluster reachability..."
kubectl --context fleet cluster-info --request-timeout=5s >/dev/null \
  || { echo "ERROR: cannot reach korczewski context — check kubectl config" >&2; exit 1; }

# ── pull secrets from cluster ─────────────────────────────────────────────────
echo "[brett-dev] pulling secrets from workspace-secrets (workspace-korczewski)..."
SECRET_JSON=$(kubectl get secret workspace-secrets \
  -n workspace-korczewski --context fleet -o json)

BRETT_OIDC_SECRET=$(echo "$SECRET_JSON" | jq -r '.data.BRETT_OIDC_SECRET | @base64d')
WEBSITE_DB_PASSWORD=$(echo "$SECRET_JSON" | jq -r '.data.WEBSITE_DB_PASSWORD | @base64d')

[[ -n "$BRETT_OIDC_SECRET" ]] \
  || { echo "ERROR: BRETT_OIDC_SECRET is empty in workspace-secrets" >&2; exit 1; }
[[ -n "$WEBSITE_DB_PASSWORD" ]] \
  || { echo "ERROR: WEBSITE_DB_PASSWORD is empty in workspace-secrets" >&2; exit 1; }

echo "[brett-dev] secrets pulled OK"

# ── port-forwards ─────────────────────────────────────────────────────────────
echo "[brett-dev] starting port-forwards..."
kubectl port-forward svc/shared-db 5432:5432 \
  -n workspace-korczewski --context fleet \
  >/tmp/brett-dev-pf-db.log 2>&1 &
PF_DB_PID=$!

kubectl port-forward svc/keycloak 8080:8080 \
  -n workspace-korczewski --context fleet \
  >/tmp/brett-dev-pf-kc.log 2>&1 &
PF_KC_PID=$!

# ── cleanup trap ──────────────────────────────────────────────────────────────
SISH_PID=""
cleanup() {
  echo ""
  echo "[brett-dev] shutting down..."
  [[ -n "$SISH_PID" ]] && kill "$SISH_PID" 2>/dev/null || true
  kill "$PF_DB_PID" 2>/dev/null || true
  kill "$PF_KC_PID" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

# ── wait for port-forwards to settle ─────────────────────────────────────────
sleep 2

if ! kill -0 "$PF_DB_PID" 2>/dev/null; then
  echo "ERROR: DB port-forward failed to start. Log:" >&2
  cat /tmp/brett-dev-pf-db.log >&2
  exit 1
fi
if ! kill -0 "$PF_KC_PID" 2>/dev/null; then
  echo "ERROR: Keycloak port-forward failed to start. Log:" >&2
  cat /tmp/brett-dev-pf-kc.log >&2
  exit 1
fi
echo "[brett-dev] port-forwards alive (DB :5432, Keycloak :8080)"

# ── sish tunnel ───────────────────────────────────────────────────────────────
echo "[brett-dev] opening sish tunnel → https://brett-dev.korczewski.de ..."
ssh -R "brett-dev:80:localhost:3000" \
  -p 32224 korczewski.de \
  -o StrictHostKeyChecking=no \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -N &
SISH_PID=$!

echo "[brett-dev] starting nodemon..."
echo "[brett-dev] local:  http://localhost:3000"
echo "[brett-dev] tunnel: https://brett-dev.korczewski.de"
echo ""

# ── start Brett ───────────────────────────────────────────────────────────────
NODE_ENV=development \
BRETT_PUBLIC_URL=https://brett-dev.korczewski.de \
KEYCLOAK_URL=http://localhost:8080 \
KEYCLOAK_REALM=workspace \
BRETT_KC_CLIENT_ID=brett-app \
BRETT_OIDC_SECRET="${BRETT_OIDC_SECRET}" \
BRETT_SESSION_SECRET="${BRETT_OIDC_SECRET}" \
DATABASE_URL="postgresql://website:${WEBSITE_DB_PASSWORD}@localhost:5432/website?sslmode=disable" \
npx nodemon brett/server.js
