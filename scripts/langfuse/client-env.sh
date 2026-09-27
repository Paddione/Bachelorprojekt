#!/usr/bin/env bash
# Fetch devmesh Langfuse client credentials into a private local env file.
# Usage: bash scripts/langfuse/client-env.sh [--print-path]
# Exit codes: 0 success, 1 missing secret key, 2 missing prerequisite/context.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
print_path=false
[[ "${1:-}" == "--print-path" ]] && print_path=true
config_home="${XDG_CONFIG_HOME:-$HOME/.config}"
out="$config_home/langfuse/agent-tracing.env"
if $print_path; then echo "$out"; exit 0; fi
command -v kubectl >/dev/null || { echo "kubectl is required" >&2; exit 2; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 2; }
kubectl config get-contexts -o name 2>/dev/null | grep -qx devmesh || { echo "kubectl context devmesh is required" >&2; exit 2; }
# shellcheck source=scripts/env-resolve.sh
source "$ROOT/scripts/env-resolve.sh" dev
domain="${DEVMESH_DOMAIN:-}"
[[ -n "$domain" ]] || { echo "DEVMESH_DOMAIN is missing from environments/dev.yaml" >&2; exit 2; }
secret="$(kubectl --context devmesh -n workspace get secret workspace-secrets -o json 2>/dev/null)" || { echo "workspace-secrets is unavailable on devmesh" >&2; exit 2; }
public_key="$(jq -r '.data.LANGFUSE_INIT_PROJECT_PUBLIC_KEY // empty' <<<"$secret" | base64 -d 2>/dev/null || true)"
secret_key="$(jq -r '.data.LANGFUSE_INIT_PROJECT_SECRET_KEY // empty' <<<"$secret" | base64 -d 2>/dev/null || true)"
[[ -n "$public_key" && -n "$secret_key" ]] || { echo "Langfuse API keys are missing; run task env:seal ENV=dev and task devmesh:deploy" >&2; exit 1; }
umask 077
mkdir -p "$(dirname "$out")"
tmp="$(mktemp "$(dirname "$out")/.agent-tracing.XXXXXX")"
trap 'rm -f "$tmp"' EXIT
printf 'LANGFUSE_PUBLIC_KEY=%q\nLANGFUSE_SECRET_KEY=%q\nLANGFUSE_BASE_URL=%q\n' \
  "$public_key" "$secret_key" "https://langfuse.$domain" > "$tmp"
mv "$tmp" "$out"
trap - EXIT
chmod 600 "$out"
echo "Langfuse client credentials written to $out"
