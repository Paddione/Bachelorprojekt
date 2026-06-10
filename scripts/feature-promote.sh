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

SERVICE="${SERVICE:-}"
TARGET="${TARGET:-}"
PROMOTE_TAG="${PROMOTE_TAG:-promote-$(git rev-parse --short HEAD 2>/dev/null || echo nogit)-$(date +%s)}"
ROLLBACK_TIMEOUT="${ROLLBACK_TIMEOUT:-180s}"
SMOKE_GREP_OVERRIDE="${SMOKE_GREP:-}"
DRY_RUN="${DRY_RUN:-0}"

# In dry-run mode, side-effect commands are echoed with a [dry-run] prefix
# instead of executed. Read-only commands (kubectl get, etc.) still run so
# diagnostic output stays accurate.
run() {
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "  [dry-run] $*"
  else
    "$@"
  fi
}

# ── Prompts ───────────────────────────────────────────────────────────────────
if [[ -z "$SERVICE" ]]; then
  echo "Which service to promote?"
  PS3=$'\nService: '
  select s in website brett arena docs; do
    [[ -n "$s" ]] && SERVICE="$s" && break
  done
fi
if [[ -z "$TARGET" ]]; then
  echo ""
  echo "Which prod target?"
  PS3=$'\nTarget: '
  select t in mentolder korczewski both; do
    [[ -n "$t" ]] && TARGET="$t" && break
  done
fi

# ── Guards ────────────────────────────────────────────────────────────────────
case "$SERVICE" in
  website|brett|arena|docs) ;;
  *) echo "✗ Unknown SERVICE='$SERVICE'" >&2; exit 1 ;;
esac
case "$TARGET" in
  mentolder|korczewski|both) ;;
  *) echo "✗ Unknown TARGET='$TARGET'" >&2; exit 1 ;;
esac
if [[ "$SERVICE" == "arena" ]]; then
  [[ "$TARGET" == "mentolder" ]] && { echo "✗ arena is korczewski-only" >&2; exit 1; }
  [[ "$TARGET" == "both" ]] && { echo "ℹ arena: TARGET=both → korczewski" >&2; TARGET=korczewski; }
fi

case "$TARGET" in
  mentolder)  CLUSTERS=(mentolder) ;;
  korczewski) CLUSTERS=(korczewski) ;;
  both)       CLUSTERS=(mentolder korczewski) ;;
esac

# ── Per-service metadata ──────────────────────────────────────────────────────
svc_image_repo() {
  local svc="$1" cluster="$2"
  case "$svc" in
    website)
      case "$cluster" in
        mentolder)  echo "ghcr.io/paddione/mentolder-website" ;;
        korczewski) echo "ghcr.io/paddione/korczewski-website" ;;
      esac ;;
    brett) echo "ghcr.io/paddione/workspace-brett" ;;
    arena) echo "ghcr.io/paddione/arena-server" ;;
    docs)  echo "ghcr.io/paddione/workspace-docs" ;;
  esac
}

svc_deployment() {
  case "$1" in
    website) echo "website" ;;
    brett)   echo "brett" ;;
    arena)   echo "arena-server" ;;
    docs)    echo "docs" ;;
  esac
}

# Dev context/namespace per cluster.
dev_ctx() { case "$1" in mentolder) echo "k3d-mentolder-dev" ;; korczewski) echo "k3d-mentolder-dev" ;; esac; }
dev_ns()  { case "$1" in mentolder) echo "workspace-dev"    ;; korczewski) echo "workspace-korczewski-dev" ;; esac; }

# Prod context resolved via env-resolve.sh → always "fleet" (both brands share the fleet cluster).
# shellcheck disable=SC2120
prod_ctx() { # shellcheck disable=SC1091
  source "$REPO/scripts/env-resolve.sh" "$1" >/dev/null 2>&1; echo "${ENV_CONTEXT:-fleet}"; }
prod_ns() {
  local svc="$1" cluster="$2"
  if [[ "$svc" == "website" ]]; then
    [[ "$cluster" == "mentolder" ]] && echo "website" || echo "website-korczewski"
  else
    [[ "$cluster" == "mentolder" ]] && echo "workspace" || echo "workspace-korczewski"
  fi
}

# ── Smoke spec resolution (#2) ────────────────────────────────────────────────
default_smoke_grep() {
  case "$1" in
    website) echo 'fa-fragebogen|.*-auth-setup|fa-07-' ;;
    brett)   echo 'brett-duel-mode|fa-27-brett' ;;
    arena)   echo 'nfa-10-arena|fa-28-arena|fa-29-arena' ;;
    docs)    echo '' ;;
  esac
}
resolve_smoke_grep() {
  local svc="$1" cfg="tests/e2e/smoke/$1.txt"
  if [[ -n "$SMOKE_GREP_OVERRIDE" ]]; then echo "$SMOKE_GREP_OVERRIDE"; return; fi
  if [[ -f "$cfg" ]]; then
    # Lines that aren't blank/comments, joined with | into a single regex.
    grep -vE '^\s*(#|$)' "$cfg" | paste -sd '|' -
    return
  fi
  default_smoke_grep "$svc"
}

# ── Build + push the pinned tag (#1) ──────────────────────────────────────────
# Returns the fully-qualified image (repo:tag) on stdout.
build_and_push() {
  local svc="$1" cluster="$2"
  local repo full
  repo=$(svc_image_repo "$svc" "$cluster")
  full="${repo}:${PROMOTE_TAG}"

  echo "▸ Build ${full}" >&2
  case "$svc" in
    website) run docker build -t "$full" website/ >&2 ;;
    brett)   run docker build -t "$full" brett/ >&2 ;;
    arena)   run docker build -t "$full" arena-server/ >&2 ;;
    docs)
      run node scripts/build-docs.mjs >&2
      run docker build -t "$full" -f scripts/docs.Dockerfile . >&2
      ;;
  esac

  echo "▸ Push ${full}" >&2
  run docker push "$full" >&2
  echo "$full"
}

# ── kubectl set-image with auto-rollback (#3) ─────────────────────────────────
# Args: <stage:dev|prod> <cluster> <full_image>
roll() {
  local stage="$1" cluster="$2" full="$3"
  local ctx ns deploy=$(svc_deployment "$SERVICE")
  if [[ "$stage" == "dev" ]]; then
    ctx=$(dev_ctx "$cluster"); ns=$(dev_ns "$cluster")
  else
    ctx=$(prod_ctx "$cluster"); ns=$(prod_ns "$SERVICE" "$cluster")
  fi

  echo "▸ ${stage}/${cluster}: set image deploy/${deploy} → ${full}"
  if ! run kubectl --context "$ctx" -n "$ns" set image "deploy/${deploy}" "${deploy}=${full}"; then
    echo "✗ set image failed on ${stage}/${cluster} (deploy/${deploy} may not exist yet — run full task ${SERVICE}:deploy first)" >&2
    return 1
  fi

  if run kubectl --context "$ctx" -n "$ns" rollout status "deploy/${deploy}" --timeout="$ROLLBACK_TIMEOUT"; then
    return 0
  fi

  echo "✗ Rollout FAILED on ${stage}/${cluster} — auto-rolling back…" >&2
  run kubectl --context "$ctx" -n "$ns" rollout undo "deploy/${deploy}" || true
  run kubectl --context "$ctx" -n "$ns" rollout status "deploy/${deploy}" --timeout=120s || true
  echo "↩ Rolled back ${stage}/${cluster} to previous ReplicaSet." >&2
  return 1
}

# ── Layer-4 live-prod canary + capture-revision rollback (Phase 1D) ───────────
# observe_prod <cluster> <full_image>
# Precondition: the prod set-image for <cluster> already ran (via roll prod …).
# Captures the pre-deploy revision FIRST, re-probes the LIVE web.<brand>.de site
# (unauth grep from tests/e2e/smoke/website.txt) for ~5 min, and on red rolls the
# deployment back to the captured revision. Context is resolved STRICTLY via
# env-resolve.sh (ENV_CONTEXT=fleet); prod_ctx() also resolves via env-resolve.sh now.
observe_prod() {
  local cluster="$1" full="$2"
  local deploy ns ctx prev_rev live grep_pat
  deploy=$(svc_deployment "$SERVICE")

  # Context strictly via env-resolve.sh → ENV_CONTEXT=fleet (same as prod_ctx() does).
  # shellcheck disable=SC1091
  source "$REPO/scripts/env-resolve.sh" "$cluster" >/dev/null
  ctx="$ENV_CONTEXT"
  ns=$(prod_ns "$SERVICE" "$cluster")

  case "$cluster" in
    mentolder)  live="https://web.mentolder.de" ;;
    korczewski) live="https://web.korczewski.de" ;;
  esac

  # Pre-deploy revision = current minus one (the set-image already bumped it).
  prev_rev=$(run kubectl --context "$ctx" -n "$ns" rollout history "deploy/${deploy}" \
              2>/dev/null | awk 'NF && $1 ~ /^[0-9]+$/ {r=$1} END{print r-1}')
  [[ -z "$prev_rev" || "$prev_rev" -lt 1 ]] && prev_rev=""

  echo "▸ Canary observe prod/${cluster}: re-probe ${live} for ~5 min (rev to keep=${full}, fallback rev=${prev_rev:-<none>})"

  grep_pat=$(resolve_smoke_grep "$SERVICE")
  local ok=1 i
  for i in 1 2 3 4 5; do
    # readiness gate first: /api/health must answer 200 on the live site.
    if [[ "$DRY_RUN" == "1" ]]; then
      echo "  [dry-run] canary probe $i/5: curl -fsS ${live}/api/health && playwright --grep '${grep_pat}'"
    else
      if curl -fsS -o /dev/null --max-time 20 "${live}/api/health"; then
        if [[ -z "$grep_pat" ]] || smoke_one "$cluster" "$grep_pat"; then ok=0; break; fi
      fi
      [[ "$i" -lt 5 ]] && sleep 60
    fi
  done
  [[ "$DRY_RUN" == "1" ]] && return 0

  if (( ok == 0 )); then
    echo "✓ Canary GREEN on prod/${cluster}."
    return 0
  fi

  echo "✗ Canary RED on prod/${cluster} — rolling back ${deploy} to revision ${prev_rev:-previous}…" >&2
  if [[ -n "$prev_rev" ]]; then
    run kubectl --context "$ctx" -n "$ns" rollout undo "deploy/${deploy}" --to-revision="$prev_rev" || true
  else
    run kubectl --context "$ctx" -n "$ns" rollout undo "deploy/${deploy}" || true
  fi
  run kubectl --context "$ctx" -n "$ns" rollout status "deploy/${deploy}" --timeout=120s || true
  echo "↩ Canary rolled prod/${cluster} back (rev=${prev_rev:-previous})." >&2
  return 1
}

# ── Playwright smoke ─────────────────────────────────────────────────────────
smoke_one() {
  local cluster="$1" grep_pat="$2"
  [[ -z "$grep_pat" ]] && return 0
  local url
  case "$cluster" in
    mentolder)  url="https://dev.mentolder.de" ;;
    korczewski) url="https://dev.korczewski.de" ;;
  esac
  echo "▸ Smoke ${url} (grep: ${grep_pat})"
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "  [dry-run] (cd tests/e2e && WEBSITE_URL=$url playwright test --grep '$grep_pat' --reporter=line)"
    return 0
  fi
  if [[ ! -d tests/e2e/node_modules ]]; then
    ( cd tests/e2e && npm ci && ./node_modules/.bin/playwright install chromium )
  fi
  ( cd tests/e2e && WEBSITE_URL="$url" \
      ./node_modules/.bin/playwright test --grep "$grep_pat" --reporter=line )
}

# ── Orchestration ────────────────────────────────────────────────────────────
echo "═══ Promote ${SERVICE} → ${TARGET}  tag=${PROMOTE_TAG} ═══"

# Phase 1 — build + push.
# website builds per-brand; brett/arena/docs share one image across clusters.
declare -A IMG
echo ""
echo "▶ Phase 1/4 — build + push"
if [[ "$SERVICE" == "website" ]]; then
  for c in "${CLUSTERS[@]}"; do
    IMG[$c]=$(build_and_push "$SERVICE" "$c")
  done
else
  shared=$(build_and_push "$SERVICE" "${CLUSTERS[0]}")
  for c in "${CLUSTERS[@]}"; do IMG[$c]="$shared"; done
fi

# Phase 2 — dev rollout (skip for docs).
if [[ "$SERVICE" != "docs" ]]; then
  echo ""
  echo "▶ Phase 2/4 — dev rollout"
  for c in "${CLUSTERS[@]}"; do
    roll dev "$c" "${IMG[$c]}" || { echo "✗ Dev rollout failed. Aborting." >&2; exit 1; }
  done

  # Phase 3 — smoke.
  PW_FILTER=$(resolve_smoke_grep "$SERVICE")
  echo ""
  if [[ -n "$PW_FILTER" ]]; then
    echo "▶ Phase 3/4 — Playwright smoke"
    for c in "${CLUSTERS[@]}"; do
      if ! smoke_one "$c" "$PW_FILTER"; then
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
  roll prod "$c" "${IMG[$c]:-${IMG[${CLUSTERS[0]}]}}" || FAIL=1
done

if (( FAIL )); then
  echo ""
  echo "✗ At least one prod cluster rolled back. Investigate before retrying." >&2
  exit 1
fi

echo ""
echo "✓ Promoted ${SERVICE} → ${TARGET} as ${PROMOTE_TAG}"
