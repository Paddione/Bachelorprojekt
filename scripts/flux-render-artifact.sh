#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# scripts/flux-render-artifact.sh — Render offline OCI artifact tree
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

OUT_DIR="out"
WEBSITE_IMAGE_OVERRIDE=""
BRETT_IMAGE_OVERRIDE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out)
      OUT_DIR="$2"
      shift 2
      ;;
    --website-image)
      WEBSITE_IMAGE_OVERRIDE="$2"
      shift 2
      ;;
    --brett-image)
      BRETT_IMAGE_OVERRIDE="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

mkdir -p "${OUT_DIR}"
OUT_DIR="$(cd "${OUT_DIR}" && pwd)"

# ENVSUBST Allowlist for offline render (non-secret vars only)
FLUX_RENDER_ENVSUBST_VARS='
$AGENT_PUSH_API
$AGENT_PUSH_LINK_BASE
$BRAIN_EXTERNAL_URL
$BRAND_ID
$BRAND_NAME
$BRETT_DOMAIN
$BRETT_IMAGE
$COMFY_HOST_IP
$COMFY_PORT
$CONTACT_EMAIL
$DEV_BRETT_HOST
$DEV_DOMAIN
$DEV_NODE
$DEV_WEBSITE_HOST
$INFRA_NAMESPACE
$KC_USER1_EMAIL
$KC_USER1_USERNAME
$KC_USER2_EMAIL
$KC_USER2_USERNAME
$LIVEKIT_DOMAIN
$LLM_EMBED_URL
$LLM_ENABLED
$LLM_HOST_IP
$LLM_RERANK_ENABLED
$LLM_ROUTER_URL
$MAIL_FROM_DOMAIN
$MAIL_FROM_LOCAL
$NTFY_BASE_URL
$OTEL_DOMAIN
$POCKET_ID_DOMAIN
$POCKET_ID_FRONTEND_URL
$POCKET_ID_SMTP_TLS
$POCKET_ID_URL
$PROD_DOMAIN
$RECOVER_DOMAIN
$RIGGER_HOST_IP
$RIGGER_PORT
$SMTP_FROM
$SMTP_HOST
$SMTP_PORT
$SMTP_USER
$STREAM_DOMAIN
$STUDIO_DOMAIN
$STUDIO_IMAGE
$STUDIO_IMAGE_DIGEST
$SYSTEMTEST_LOOP_ENABLED
$TERMINAL_OVERLAY_IP
$TLS_SECRET_NAME
$TURN_NODE
$TURN_OVERLAY_IP
$TURN_PUBLIC_IP
$WEBSITE_IMAGE
$WEBSITE_NAMESPACE
$WHISPER_URL
$WORKSPACE_NAMESPACE
'

render_component() {
  local overlay="$1" out="$2"
  kustomize build "$overlay" --load-restrictor=LoadRestrictionsNone \
    | sed -E 's/: \$\{([a-zA-Z0-9_]+)\}[[:space:]]*$/: "${\1}"/g' \
    | envsubst "$FLUX_RENDER_ENVSUBST_VARS" \
    | sed -E 's/\$\$([a-zA-Z0-9_]|\{)/$\1/g' \
    > "$out"
}

cd "$PROJECT_DIR"

# 1. Platform
(
  set +u
  source scripts/env-resolve.sh fleet-mentolder 2>/dev/null
  if [[ -n "$WEBSITE_IMAGE_OVERRIDE" ]]; then export WEBSITE_IMAGE="$WEBSITE_IMAGE_OVERRIDE"; fi
  if [[ -n "$BRETT_IMAGE_OVERRIDE" ]]; then export BRETT_IMAGE="$BRETT_IMAGE_OVERRIDE"; fi
  mkdir -p "${OUT_DIR}/platform"
  render_component prod-fleet/platform "${OUT_DIR}/platform/platform.yaml"
)

# 2. Mentolder
(
  set +u
  source scripts/env-resolve.sh fleet-mentolder 2>/dev/null
  if [[ -n "$WEBSITE_IMAGE_OVERRIDE" ]]; then export WEBSITE_IMAGE="$WEBSITE_IMAGE_OVERRIDE"; fi
  if [[ -n "$BRETT_IMAGE_OVERRIDE" ]]; then export BRETT_IMAGE="$BRETT_IMAGE_OVERRIDE"; fi
  mkdir -p "${OUT_DIR}/mentolder"
  render_component prod-fleet/mentolder "${OUT_DIR}/mentolder/mentolder.yaml"
)

# 3. Korczewski
(
  set +u
  source scripts/env-resolve.sh fleet-korczewski 2>/dev/null
  if [[ -n "$WEBSITE_IMAGE_OVERRIDE" ]]; then export WEBSITE_IMAGE="$WEBSITE_IMAGE_OVERRIDE"; fi
  if [[ -n "$BRETT_IMAGE_OVERRIDE" ]]; then export BRETT_IMAGE="$BRETT_IMAGE_OVERRIDE"; fi
  mkdir -p "${OUT_DIR}/korczewski"
  render_component prod-fleet/korczewski "${OUT_DIR}/korczewski/korczewski.yaml"
)

# 4. Website Mentolder
(
  set +u
  source scripts/env-resolve.sh fleet-mentolder 2>/dev/null
  if [[ -n "$WEBSITE_IMAGE_OVERRIDE" ]]; then export WEBSITE_IMAGE="$WEBSITE_IMAGE_OVERRIDE"; fi
  if [[ -n "$BRETT_IMAGE_OVERRIDE" ]]; then export BRETT_IMAGE="$BRETT_IMAGE_OVERRIDE"; fi
  mkdir -p "${OUT_DIR}/website-mentolder"
  render_component prod-fleet/website-mentolder "${OUT_DIR}/website-mentolder/website-mentolder.yaml"
)

# 5. Website Korczewski
(
  set +u
  source scripts/env-resolve.sh fleet-korczewski 2>/dev/null
  if [[ -n "$WEBSITE_IMAGE_OVERRIDE" ]]; then export WEBSITE_IMAGE="$WEBSITE_IMAGE_OVERRIDE"; fi
  if [[ -n "$BRETT_IMAGE_OVERRIDE" ]]; then export BRETT_IMAGE="$BRETT_IMAGE_OVERRIDE"; fi
  mkdir -p "${OUT_DIR}/website-korczewski"
  render_component prod-fleet/website-korczewski "${OUT_DIR}/website-korczewski/website-korczewski.yaml"
)

# 6. Sealed Secrets (copied static, filtered per brand if needed)
mkdir -p "${OUT_DIR}/sealed-secrets"
cp environments/sealed-secrets/fleet-mentolder.yaml "${OUT_DIR}/sealed-secrets/fleet-mentolder.yaml"
cp environments/sealed-secrets/fleet-korczewski.yaml "${OUT_DIR}/sealed-secrets/fleet-korczewski.yaml"

# 7. Cluster CRs (top-level only under flux/clusters/fleet/, excluding bootstrap/)
mkdir -p "${OUT_DIR}/clusters/fleet"
find flux/clusters/fleet -maxdepth 1 -name "*.yaml" -exec cp {} "${OUT_DIR}/clusters/fleet/" \;

echo "Successfully rendered Flux OCI artifact tree to ${OUT_DIR}"
