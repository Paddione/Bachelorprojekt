#!/usr/bin/env bash
# Wrapper that overrides kubectl with a stub function, then runs factory-prep
set -euo pipefail

# Override kubectl with a shell function (takes precedence over PATH)
kubectl() {
  local args=("$@")
  # Don't use stderr debug output to avoid confusing the script

  # Handle get pod queries for shared-db
  if [[ "${args[*]}" == *"get pod"* && "${args[*]}" == *"shared-db"* ]]; then
    echo "pod/shared-db-0"
    return 0
  fi

  # Handle psql queries - return empty for all factory queries
  if [[ "${args[*]}" == *"psql"* ]]; then
    return 0
  fi

  # All other kubectl calls return empty success
  return 0
}
export -f kubectl

# Set env vars
export FACTORY_DAILY_DEPLOY_CAP=5
export FACTORY_GLOBAL_CAP=3

# Run the factory-prep
cd /home/patrick/Bachelorprojekt
bash scripts/vda.sh factory-prep
