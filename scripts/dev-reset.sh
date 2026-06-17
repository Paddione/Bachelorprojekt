#!/bin/bash
set -euo pipefail

CLUSTER_NAME="${CLUSTER_NAME:?CLUSTER_NAME is required}"
CONFIRM="${CONFIRM:-}"
REBUILD="${REBUILD:-}"

echo "═══ dev-reset: one-click cluster reset ═══"
echo "  Target cluster: $CLUSTER_NAME"
echo ""

# ── Prod Guard ──────────────────────────────────────────────────────
KNOWN_PROD_CONTEXTS=("fleet" "prod" "production")
CURRENT_CTX=$(kubectl config current-context 2>/dev/null || true)
for ctx in "${KNOWN_PROD_CONTEXTS[@]}"; do
  if [ "$CURRENT_CTX" = "$ctx" ]; then
    echo "❌ Aborting: active kubectl context is '$ctx' (production). This script is for dev only." >&2
    exit 1
  fi
done

# ── Docker Reachability ─────────────────────────────────────────────
docker info >/dev/null 2>&1 || {
  echo "❌ Docker is not running. Start Docker first." >&2
  exit 1
}

# ── Confirmation ────────────────────────────────────────────────────
if [ "$CONFIRM" != "yes" ]; then
  if [ -t 0 ]; then
    read -r -p "Reset cluster '$CLUSTER_NAME'? This will destroy and recreate everything. [yes/NO] " reply
    case "$reply" in
      [yY]|[yY][eE][sS]) ;;
      *) echo "Aborted."; exit 1 ;;
    esac
  else
    echo "Non-interactive shell: set CONFIRM=yes to skip the prompt." >&2
    exit 1
  fi
fi

# ── Step 1: Delete cluster ──────────────────────────────────────────
echo "→ Step 1/6: Deleting cluster..."
task cluster:delete || true
echo ""

# ── Step 2: Create cluster ──────────────────────────────────────────
echo "→ Step 2/6: Creating cluster..."
task cluster:create
echo ""

# ── Step 3: cert-manager CRDs ───────────────────────────────────────
echo "→ Step 3/6: Installing cert-manager CRDs..."
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.16.3/cert-manager.crds.yaml
echo ""

# ── Image Snapshot ──────────────────────────────────────────────────
IMAGES=(
  "ghcr.io/paddione/workspace-website:latest"
  "ghcr.io/paddione/workspace-brett:latest"
  "ghcr.io/paddione/workspace-docs:latest"
)

MISSING_IMAGES=()
for img in "${IMAGES[@]}"; do
  if docker image inspect "$img" >/dev/null 2>&1; then
    echo "  ✓ Image exists locally: $img"
  else
    echo "  ⚠ Image not found locally: $img"
    MISSING_IMAGES+=("$img")
  fi
done
echo ""

# ── Step 4: Image import/rebuild ────────────────────────────────────
if [ "$REBUILD" = "1" ]; then
  echo "→ Step 4/6: REBUILD=1 — building all images..."
  task website:build:import ENV=dev
  task brett:build ENV=dev
  task docs:build:import ENV=dev
else
  echo "→ Step 4/6: Re-importing existing images into cluster..."
  for img in "${IMAGES[@]}"; do
    if docker image inspect "$img" >/dev/null 2>&1; then
      echo "  → Re-importing $img"
      k3d image import "$img" -c "$CLUSTER_NAME"
    fi
  done

  if [ ${#MISSING_IMAGES[@]} -gt 0 ]; then
    echo "  ── Building missing images ──"
    for img in "${MISSING_IMAGES[@]}"; do
      echo "  ⚠ Building missing image: $img"
      case "$img" in
        *workspace-website*) task website:build:import ENV=dev ;;
        *workspace-brett*)   task brett:build ENV=dev ;;
        *workspace-docs*)    task docs:build:import ENV=dev ;;
      esac
    done
  fi
fi
echo ""

# ── Step 5: Deploy workspace ────────────────────────────────────────
echo "→ Step 5/6: Deploying workspace..."
task workspace:deploy ENV=dev
echo ""

# ── Step 6: Deploy office stack ─────────────────────────────────────
echo "→ Step 6/6: Deploying office stack..."
task workspace:office:deploy ENV=dev
echo ""

# ── Done ────────────────────────────────────────────────────────────
echo "═══ Cluster reset complete ═══"
echo "  Cluster: $CLUSTER_NAME"
echo "  URL: http://localhost:8080"
echo "  Run 'kubectl get pods -A' to check pod status."
