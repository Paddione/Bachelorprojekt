#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# app-install.sh — Curated App Catalog Installer
# Idempotently configures domains, OIDC, secrets, and deploys via Kustomize.
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Parse arguments
APP_NAME=""
DRY_RUN=false

for arg in "$@"; do
  if [[ "$arg" == "--dry-run" ]]; then
    DRY_RUN=true
  else
    APP_NAME="$arg"
  fi
done

if [[ -z "$APP_NAME" ]]; then
  echo "Usage: $0 <app-name> [--dry-run]"
  exit 1
fi

if [[ ! "$APP_NAME" =~ ^[a-z0-9-]+$ ]]; then
  echo "❌ Error: APP_NAME must match pattern ^[a-z0-9-]+$ (got \"$APP_NAME\")"
  exit 1
fi

APP_DIR="$ROOT_DIR/apps/$APP_NAME"
MANIFEST_PATH="$APP_DIR/app.yaml"

if [[ ! -f "$MANIFEST_PATH" ]]; then
  echo "❌ Error: App manifest not found at $MANIFEST_PATH"
  exit 1
fi

# 1. Resolve environment settings
ENV="${ENV:-dev}"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/env-resolve.sh" "$ENV" "$ROOT_DIR/environments"

# 2. Validate manifest schema
echo "🔍 Validating manifest schema for $APP_NAME..."
node "$SCRIPT_DIR/validate-manifest.mjs" "$MANIFEST_PATH"

# 3. Read manifest properties
TITLE=$(node "$SCRIPT_DIR/read-manifest-field.mjs" "$MANIFEST_PATH" "title" "$APP_NAME")
KUSTOMIZE_PATH_RAW=$(node "$SCRIPT_DIR/read-manifest-field.mjs" "$MANIFEST_PATH" "kustomize")
KUSTOMIZE_PATH="$ROOT_DIR/$KUSTOMIZE_PATH_RAW"

if [[ ! -d "$KUSTOMIZE_PATH" ]]; then
  echo "❌ Error: Kustomize source directory $KUSTOMIZE_PATH does not exist"
  exit 1
fi

# 4. Merge domains
DRY_ARG=""
if [[ "$DRY_RUN" == "true" ]]; then
  DRY_ARG="--dry-run"
fi

echo "🌐 Merging domains..."
node "$SCRIPT_DIR/merge-domains.mjs" "$APP_NAME" $DRY_ARG

# 5. Process regular secrets
echo "🔑 Processing secrets..."
node "$SCRIPT_DIR/process-secrets.mjs" "$APP_NAME" "$ENV" $DRY_ARG

# 6. Process OIDC clients & OIDC client secrets
echo "🔒 Processing OIDC configuration..."
node "$SCRIPT_DIR/process-oidc.mjs" "$APP_NAME" "$ENV" $DRY_ARG

# 6b. Re-seal so the cluster mirror is not stale.
#     process-secrets.mjs / process-oidc.mjs only wrote PLAINTEXT + schema; the
#     committed SealedSecret would otherwise lack the new app secret until a
#     manual `task env:seal`. Fail-closed: a non-dev install that can't reseal
#     refuses to deploy a partial app (override APP_INSTALL_SKIP_SEAL=1).
if [[ "$DRY_RUN" != "true" ]]; then
  if [[ "${APP_INSTALL_SKIP_SEAL:-0}" == "1" ]]; then
    echo "⚠ APP_INSTALL_SKIP_SEAL=1 — skipping reseal; sealed mirror may be STALE for $APP_NAME."
  else
    echo "🔐 Re-sealing $ENV so the cluster mirror includes the new app secret..."
    if ! bash "$SCRIPT_DIR/env-seal.sh" --env "$ENV" --env-dir "$ROOT_DIR/environments"; then
      if [[ "$ENV" != "dev" ]]; then
        echo "❌ Reseal failed and sealed mirror is now STALE for $ENV — refusing to deploy a partial app." >&2
        echo "   Fix the seal (cert drift?), then re-run: task app:install -- $APP_NAME ENV=$ENV" >&2
        exit 1
      fi
      echo "⚠ Reseal failed (dev) — continuing; dev uses k3d/secrets.yaml, not the sealed mirror."
    fi
  fi
fi

# 7. Apply Kustomize manifests
KUBECTL_CMD="kubectl"
if [[ "$ENV" != "dev" ]]; then
  KUBECTL_CMD="kubectl --context ${ENV_CONTEXT}"
fi

NAMESPACE="${WORKSPACE_NAMESPACE:-workspace}"

if [[ "$DRY_RUN" == "true" ]]; then
  echo "🚀 [DRY-RUN] Simulating deploy: $KUBECTL_CMD apply -k $KUSTOMIZE_PATH -n $NAMESPACE --dry-run=client"
  $KUBECTL_CMD apply -k "$KUSTOMIZE_PATH" -n "$NAMESPACE" --dry-run=client
else
  echo "🚀 Deploying $APP_NAME: $KUBECTL_CMD apply -k $KUSTOMIZE_PATH -n $NAMESPACE"
  $KUBECTL_CMD apply -k "$KUSTOMIZE_PATH" -n "$NAMESPACE"
fi

# 8. Register as installed
echo "📝 Updating installed app registry..."
node "$SCRIPT_DIR/register-installed-app.mjs" "$APP_NAME" "$ENV" $DRY_ARG

echo "✅ App install workflow completed."
