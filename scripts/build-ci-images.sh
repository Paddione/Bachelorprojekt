#!/usr/bin/env bash
# build-ci-images.sh — Build and push prebuilt CI images to GitLab registry (T012411)
#
# Usage:
#   CI_REGISTRY_IMAGE=registry.gitlab.com/p.korczewski/bachelorprojekt/ci bash scripts/build-ci-images.sh
#
# The script builds all four profiles and pushes them to the GitLab container registry.
# Each image is tagged with the profile name and a date-based tag for rollback.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
IMAGE_DIR="$REPO_ROOT/.gitlab-ci-images"

# Default registry (override via CI_REGISTRY_IMAGE env var)
: "${CI_REGISTRY_IMAGE:=registry.gitlab.com/p.korczewski/bachelorprojekt/ci}"
TAG="${CI_BUILD_TAG:-$(date +%Y%m%d)}"

PROFILES=(
  "ci-node22:ci-node22.Dockerfile"
  "ci-node22-heavy:ci-node22-heavy.Dockerfile"
  "ci-node24:ci-node24.Dockerfile"
  "ci-ubuntu:ci-ubuntu.Dockerfile"
)

echo "Building CI images with tag: ${TAG}"
echo "Registry: ${CI_REGISTRY_IMAGE}"

for entry in "${PROFILES[@]}"; do
  name="${entry%%:*}"
  dockerfile="${entry##*:}"
  image="${CI_REGISTRY_IMAGE}/${name}"
  
  echo ""
  echo "── Building ${name} ──"
  docker build \
    -t "${image}:${TAG}" \
    -t "${image}:latest" \
    -f "${IMAGE_DIR}/${dockerfile}" \
    "${IMAGE_DIR}"
  
  echo "── Pushing ${name} ──"
  docker push "${image}:${TAG}"
  docker push "${image}:latest"
  
  echo "✓ ${name} pushed as ${image}:${TAG}"
done

echo ""
echo "All CI images built and pushed."
echo "Update .gitlab-ci.yml image: tags to ${TAG} when ready."
