#!/usr/bin/env bash
# Register the "Systemisches Brett" Nextcloud Talk bot.
# Idempotent: if the bot is already installed, exits 0 with a notice.
#
# Usage: ENV=<env> bash scripts/brett-bot-setup.sh
set -euo pipefail

if [[ -z "${ENV:-}" ]]; then
  echo "ERROR: ENV= must be set (dev|mentolder|korczewski)" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "${REPO_ROOT}/scripts/env-resolve.sh" "${ENV}"

WEBSITE_HOST="${WEB_DOMAIN:-web.${PROD_DOMAIN:-localhost}}"
if [[ "${ENV}" == "dev" ]]; then
  WEBHOOK_URL="http://web.localhost/api/brett/bot"
else
  WEBHOOK_URL="https://${WEBSITE_HOST}/api/brett/bot"
fi

# Pull the live secret from the cluster (works for both dev plaintext and prod sealed).
SECRET="$(kubectl get secret -n workspace --context "${ENV_CONTEXT}" \
            workspace-secrets -o jsonpath='{.data.BRETT_BOT_SECRET}' | base64 -d)"

if [[ -z "${SECRET}" ]]; then
  echo "ERROR: BRETT_BOT_SECRET not present in workspace-secrets for ${ENV}" >&2
  exit 1
fi

echo "Registering Talk bot for ${ENV} → ${WEBHOOK_URL}"

INSTALL_OUT="$(kubectl exec -n workspace deploy/nextcloud --context "${ENV_CONTEXT}" -- \
  php occ talk:bot:install \
    "Systemisches Brett" \
    "${SECRET}" \
    "${WEBHOOK_URL}" \
    "Stellt das Systemische Brett auf /brett bereit" \
    "webhook" 2>&1)" || true

if echo "${INSTALL_OUT}" | grep -qiE 'already.*exists|installiert'; then
  echo "Bot already installed — skipping install."
else
  echo "${INSTALL_OUT}"
fi

# Enable globally for all conversations.
echo "Enabling bot for all conversations..."
LIST_OUT="$(kubectl exec -n workspace deploy/nextcloud --context "${ENV_CONTEXT}" -- \
  php occ talk:bot:list)"
BOT_ID="$(echo "${LIST_OUT}" | awk '/Systemisches Brett/ {print $1; exit}')"

if [[ -z "${BOT_ID}" ]]; then
  echo "ERROR: could not find bot id after install" >&2
  exit 1
fi

kubectl exec -n workspace deploy/nextcloud --context "${ENV_CONTEXT}" -- \
  php occ talk:bot:setup "${BOT_ID}" --feature all || true

echo "Done. Bot ID: ${BOT_ID}"
