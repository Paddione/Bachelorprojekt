#!/usr/bin/env bash
# devflow-post-merge-deploy.sh — Auto-detect deploy targets from merged PR files
# Aus dev-flow-execute Schritt 8 extrahiert (Chore T001007).
set -u

TICKET_ID="${1:-}"
MERGE_COMMIT=$(git log origin/main -1 --format="%H")
CHANGED=$(git diff-tree --no-commit-id -r --name-only "$MERGE_COMMIT")

DEPLOY_WEBSITE=false
DEPLOY_BRETT=false
DEPLOY_K8S=false
DEPLOY_DOCS=false

echo "$CHANGED" | grep -qE '^website/' && DEPLOY_WEBSITE=true
echo "$CHANGED" | grep -qE '^brett/' && DEPLOY_BRETT=true
echo "$CHANGED" | grep -qE '^docs/' && DEPLOY_DOCS=true
echo "$CHANGED" | grep -qE '^(k3d/|prod|prod-fleet|prod-mentolder|prod-korczewski|environments/)' \
  && DEPLOY_K8S=true

if [[ "$DEPLOY_WEBSITE" == false && "$DEPLOY_BRETT" == false \
      && "$DEPLOY_K8S" == false && "$DEPLOY_DOCS" == false ]]; then
  echo "⚠ Keine bekannten Deploy-Trigger in den geänderten Dateien erkannt."
  echo "Geänderte Dateien:"; echo "$CHANGED"
  echo "Bitte manuell deployen."
  exit 0
fi

FAILED_TASKS=()
if [[ "$DEPLOY_WEBSITE" == true ]]; then
  echo "🚀 Deploye Website (beide Brands)..."
  task feature:website || { rc=$?; FAILED_TASKS+=("feature:website=$rc"); }
fi
if [[ "$DEPLOY_BRETT" == true ]]; then
  echo "🚀 Deploye Brett (beide Brands)..."
  task feature:brett || { rc=$?; FAILED_TASKS+=("feature:brett=$rc"); }
fi
if [[ "$DEPLOY_DOCS" == true ]]; then
  echo "🚀 Deploye Docs..."
  task docs:deploy || { rc=$?; FAILED_TASKS+=("docs:deploy=$rc"); }
fi
if [[ "$DEPLOY_K8S" == true ]]; then
  echo "🚀 Deploye K8s-Manifeste (beide Brands)..."
  task feature:deploy || { rc=$?; FAILED_TASKS+=("feature:deploy=$rc"); }
fi

if [[ ${#FAILED_TASKS[@]} -eq 0 ]]; then
  ./scripts/ticket.sh phase "$TICKET_ID" deploy done --driver devflow \
    --detail "deployed (post-merge)" 2>/dev/null || true
else
  DETAIL="deploy blocked: $(IFS=,; echo "${FAILED_TASKS[*]}")"
  ./scripts/ticket.sh phase "$TICKET_ID" deploy blocked --driver devflow \
    --detail "$DETAIL" 2>/dev/null || true
  echo "❌ $DETAIL" >&2
  exit 1
fi
