#!/usr/bin/env bash
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"

# shellcheck disable=SC1091
source "$REPO/scripts/lib/notify.sh"
# shellcheck disable=SC1091
source "$REPO/scripts/lib/post-deploy-watch.sh"

ENV="${1:-}"
if [[ -z "$ENV" ]]; then
  echo "Usage: $0 <env>" >&2
  echo "  e.g. $0 mentolder" >&2
  exit 1
fi

# shellcheck disable=SC1091
source "$REPO/scripts/env-resolve.sh" "$ENV"

DRY_RUN="${DRY_RUN:-0}"
CTX="${ENV_CONTEXT}"
WS_NS="${WORKSPACE_NAMESPACE:-workspace}"

if [[ "$WS_NS" == "workspace" ]]; then
  WEB_NS="website"
else
  WEB_NS="website-${WS_NS#workspace-}"
fi

case "$ENV" in
  mentolder|fleet-mentolder)
    HEALTH_URL="https://web.mentolder.de/api/health"
    BRAND="mentolder"
    ;;
  korczewski|fleet-korczewski)
    HEALTH_URL="https://web.korczewski.de/api/health"
    BRAND="korczewski"
    ;;
  *)
    echo "✗ Unsupported ENV='${ENV}'" >&2
    exit 1
    ;;
esac

FAIL=0

echo "═══ Post-deploy watch for ${ENV} ═══"

DEPLOYMENTS=(
  "pocket-id:${WS_NS}"
  "nextcloud:${WS_NS}"
  "shared-db:${WS_NS}"
  "website:${WEB_NS}"
)

for entry in "${DEPLOYMENTS[@]}"; do
  deploy="${entry%%:*}"
  ns="${entry##*:}"
  if ! post_deploy_watch "$BRAND" "$deploy" "$ns" "$CTX" "$HEALTH_URL"; then
    FAIL=1
  fi
done

if [[ "$FAIL" -eq 1 ]]; then
  echo ""
  echo "✗ At least one post-deploy watch failed for ${ENV}" >&2
  exit 1
fi

echo ""
echo "✓ All post-deploy watches passed for ${ENV}"
