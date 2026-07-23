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

render_component() {
  local overlay="$1" out="$2"
  # Dynamically extract ALL ${VAR} references from kustomize output.
  # This is the same proven pattern as .github/workflows/build-website.yml (lines ~184-192)
  # and ensures the allowlist never drifts.
  local rendered
  rendered="$(kustomize build "$overlay" --load-restrictor=LoadRestrictionsNone)"
  
  local vars
  vars="$(grep -oE '\$\{[A-Za-z0-9_]+\}' <<<"$rendered" | tr -d '${}' | sort -u | tr '\n' ' ')"
  
  if [[ -z "$vars" ]]; then
    # No vars to substitute — write as-is
    echo "$rendered" > "$out"
    return
  fi
  
  # Build envsubst variable list (space-separated, each prefixed with $)
  local envsubst_vars=""
  for v in $vars; do
    envsubst_vars="${envsubst_vars}\$${v} "
  done
  
  # Wrap bare ${VAR} at end of line in double quotes (envsubst needs quoting context),
  # then substitute, then unwrap any $$ escaping envsubst introduced.
  sed -E 's/: \$\{([a-zA-Z0-9_]+)\}[[:space:]]*$/: "${\1}"/g' <<<"$rendered" \
    | envsubst "$envsubst_vars" \
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

# 1b. Dev (workspace-dev namespace)
(
  set +u
  source scripts/env-resolve.sh dev 2>/dev/null || true
  mkdir -p "${OUT_DIR}/dev"
  render_component prod-fleet/dev "${OUT_DIR}/dev/dev.yaml"
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
