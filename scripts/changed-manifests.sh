#!/usr/bin/env bash
# changed-manifests.sh — detect if recent diff touches k8s/environment manifests.
# Args: [<base_ref> <head_ref>]  (default: HEAD~1 HEAD)
# Exit 0 (manifest paths on stdout) / 1 ("no manifest changes").
set -euo pipefail

BASE="${1:-HEAD~1}"
HEAD="${2:-HEAD}"

ALLOWLIST_DIRS=(k3d/ prod/ prod-fleet/ prod-mentolder/ prod-korczewski/ environments/)

# Collect manifest-prefix matches from the changed-file list.
MATCHES=()
while IFS= read -r path; do
  for dir in "${ALLOWLIST_DIRS[@]}"; do
    if [[ "$path" == "$dir"* ]]; then
      MATCHES+=("$path")
      break
    fi
  done
done < <(git diff --name-only "$BASE".."$HEAD" 2>/dev/null || true)

if [[ ${#MATCHES[@]} -gt 0 ]]; then
  printf '%s\n' "${MATCHES[@]}"
else
  echo "no manifest changes"
  exit 1
fi
