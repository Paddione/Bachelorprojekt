#!/usr/bin/env bash
set -euo pipefail
# ci-dummy-secrets.sh — writes PLACEHOLDER secret files for offline CI/kustomize
# validation. Fail-closed precondition: this MUST NOT run in a prod context, or a
# later deploy from the same tree could ship the placeholder as a real secret.
#
# Contract: proceed ONLY if CI=true OR ENV ∈ {dev, ""}. Defense-in-depth: also
# refuse if the active kube-context is a prod brand and ENV is unset.

KUBECTL="${KUBECTL:-kubectl}"
_env="${ENV:-}"
if [[ "${CI:-}" != "true" && -n "$_env" && "$_env" != "dev" ]]; then
  echo "✗ ci-dummy-secrets: refusing to write placeholder secrets (ENV=$_env, CI unset)." >&2
  echo "  This script is for offline CI/dev only. Use 'task env:seal ENV=$_env' for real secrets." >&2
  exit 1
fi
# Defense-in-depth: empty ENV + prod kube-context → refuse.
if [[ "${CI:-}" != "true" && -z "$_env" ]]; then
  _ctx="$("$KUBECTL" config current-context 2>/dev/null || echo "")"
  if [[ -n "$_ctx" && "$_ctx" != *k3d* ]]; then
    if [[ "$_ctx" == "fleet" || "$_ctx" == *mentolder* || "$_ctx" == *korczewski* ]]; then
      echo "✗ ci-dummy-secrets: active kube-context '$_ctx' looks like prod — refusing." >&2
      exit 1
    fi
  fi
fi

for f in k3d/secrets.yaml k3d/backup-secrets.yaml; do
  if [ ! -f "$f" ]; then
    name="$(basename "$f" .yaml)"
    printf 'apiVersion: v1\nkind: Secret\nmetadata:\n  name: %s\ntype: Opaque\nstringData:\n  PLACEHOLDER: ci-dummy\n' "$name" > "$f"
  fi
done
