#!/usr/bin/env bash
# feature-promote.sh — promote a service from dev → prod.
#
# Usage:
#   SERVICE=website TARGET=both bash scripts/feature-promote.sh
#   bash scripts/feature-promote.sh                  # prompts for SERVICE & TARGET
#
# Inputs:
#   SERVICE             website | brett | arena | docs
#   TARGET              mentolder | korczewski | both
#   PROMOTE_TAG         override the auto-generated image tag
#   SMOKE_GREP          override the Playwright --grep pattern for this run
#   ROLLBACK_TIMEOUT    kubectl rollout timeout (default: 180s); rollback uses 120s
#   DRY_RUN=1           print docker/kubectl/task/playwright commands without
#                       executing them; safe to run against prod.
#
# ── Spec ─────────────────────────────────────────────────────────────────────
#
# 1. BUILD-ONCE-DEPLOY-MANY
#    One image tag (PROMOTE_TAG) is built and pushed to ghcr, then applied to
#    dev *and* prod via `kubectl set image`. No rebuild between stages — what
#    smoke verifies on dev is byte-for-byte what ships to prod.
#
#    Exception: `website` builds per-brand because mentolder and korczewski use
#    different image names (mentolder-website vs korczewski-website, brand-baked
#    at build time). For TARGET=both this means two builds, one per brand —
#    each still build-once within its own dev→prod lineage.
#
# 2. CONFIGURABLE SMOKE SPECS
#    Playwright --grep pattern resolves in this priority:
#      a) $SMOKE_GREP env var (per-run override)
#      b) tests/e2e/smoke/<service>.txt (one pattern per non-comment line;
#         joined with | into a single regex)
#      c) built-in default below
#    Empty pattern → smoke skipped (currently the case for `docs`).
#
# 3. AUTO-ROLLBACK ON FAILED ROLLOUT
#    Every `kubectl set image` is followed by `kubectl rollout status` with
#    $ROLLBACK_TIMEOUT. On failure we run `kubectl rollout undo` against that
#    same deployment, wait up to 120s for the previous ReplicaSet to come back,
#    and exit non-zero. Dev failures abort before prod. Prod failures roll back
#    on the failing cluster only — other clusters already rolled out stay rolled
#    out (no cross-cluster rollback; that'd need a coordinator and isn't the
#    scope here).
#
# ── Per-service quirks ───────────────────────────────────────────────────────
#   - arena: korczewski-only (TARGET=mentolder rejected; TARGET=both → korczewski).
#            Migrations & bootstrap Job are NOT promoted; run `task arena:deploy
#            ENV=korczewski` for those before/after as needed.
#   - docs:  no dev stage; image deploys straight to both prods via set-image
#            on both clusters. TARGET=both is implied.

set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"

# shellcheck disable=SC1091
source "$REPO/scripts/lib/notify.sh"
# shellcheck disable=SC1091
source "$REPO/scripts/lib/post-deploy-watch.sh"

SERVICE="${SERVICE:-}"
TARGET="${TARGET:-}"
PROMOTE_TAG="${PROMOTE_TAG:-promote-$(git rev-parse --short HEAD 2>/dev/null || echo nogit)-$(date +%s)}"
ROLLBACK_TIMEOUT="${ROLLBACK_TIMEOUT:-180s}"
SMOKE_GREP_OVERRIDE="${SMOKE_GREP:-}"
DRY_RUN="${DRY_RUN:-0}"

source "$(dirname "${BASH_SOURCE[0]}")/lib/promote-phases.sh"

# ── Orchestration ────────────────────────────────────────────────────────────
echo "═══ Promote ${SERVICE} → ${TARGET}  tag=${PROMOTE_TAG} ═══"

# Phase 1 — build + push.
# website builds per-brand; brett/arena/docs share one image across clusters.
declare -A IMG
echo ""
echo "▶ Phase 1/4 — build + push"
if [[ "$SERVICE" == "website" ]]; then
  for c in "${CLUSTERS[@]}"; do
    IMG[$c]=$(promote_phase_build "$SERVICE" "$c" "$PROMOTE_TAG")
    promote_phase_push "${IMG[$c]}"
  done
else
  shared=$(promote_phase_build "$SERVICE" "${CLUSTERS[0]}" "$PROMOTE_TAG")
  promote_phase_push "$shared"
  for c in "${CLUSTERS[@]}"; do IMG[$c]="$shared"; done
fi

# Phase 2 — dev rollout (skip for docs).
if [[ "$SERVICE" != "docs" ]]; then
  echo ""
  echo "▶ Phase 2/4 — dev rollout"
  for c in "${CLUSTERS[@]}"; do
    promote_phase_dev_deploy "$SERVICE" "$c" "${IMG[$c]}" || { echo "✗ Dev rollout failed. Aborting." >&2; exit 1; }
  done

  # Phase 3 — smoke.
  PW_FILTER=$(resolve_smoke_grep "$SERVICE")
  echo ""
  if [[ -n "$PW_FILTER" ]]; then
    echo "▶ Phase 3/4 — Playwright smoke"
    for c in "${CLUSTERS[@]}"; do
      if ! promote_phase_smoke "$SERVICE" "$c"; then
        echo "✗ Smoke FAILED on dev/${c}. Aborting before prod." >&2
        echo "  Dev is still on tag ${PROMOTE_TAG}; revert with: kubectl --context $(dev_ctx "$c") -n $(dev_ns "$c") rollout undo deploy/$(svc_deployment "$SERVICE")" >&2
        exit 1
      fi
    done
  else
    echo "▶ Phase 3/4 — smoke skipped (no pattern for ${SERVICE})"
  fi
else
  echo ""
  echo "▶ Phase 2-3/4 — skipped (docs has no dev stage)"
fi

# Phase 4 — prod rollout.
echo ""
echo "▶ Phase 4/4 — prod rollout"
PROD_CLUSTERS=("${CLUSTERS[@]}")
[[ "$SERVICE" == "docs" ]] && PROD_CLUSTERS=(mentolder korczewski)   # docs always both

FAIL=0
for c in "${PROD_CLUSTERS[@]}"; do
  promote_phase_prod_deploy "$SERVICE" "$c" "${IMG[$c]:-${IMG[${CLUSTERS[0]}]}}" || FAIL=1
done

if (( FAIL )); then
  echo ""
  echo "✗ At least one prod cluster rolled back. Investigate before retrying." >&2
  exit 1
fi

echo ""
echo "✓ Promoted ${SERVICE} → ${TARGET} as ${PROMOTE_TAG}"
