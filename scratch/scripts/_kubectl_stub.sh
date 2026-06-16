#!/usr/bin/env bash
# Stub for kubectl that returns mock data for factory-prep dry-run
# This is used when running in isolated/sandboxed environments

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Parse args to figure out what's being asked
if [[ "$*" == *"get pod"* && "$*" == *"-l"* && "$*" == *"shared-db"* ]]; then
  # Return a mock pod name
  echo "pod/shared-db-0"
  exit 0
fi

if [[ "$*" == *"psql"* ]]; then
  # For factory-control queries, return mock values
  # Returns empty output which means: killswitch OFF, daily cap NOT reached
  exit 0
fi

# Default: fail
echo "kubectl stub: unhandled command: $*" >&2
exit 1
