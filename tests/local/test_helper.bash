#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# test_helper.bash — Shared setup for BATS integration tests (local)
# ═══════════════════════════════════════════════════════════════════

LOCAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${LOCAL_DIR}/../.." && pwd)"

# Source our assertion and k3d libraries
# We use the existing libraries so results still go to $RESULTS_FILE
source "${PROJECT_DIR}/tests/lib/assert.sh"
source "${PROJECT_DIR}/tests/lib/k3d.sh"

# Load BATS standard libraries if they exist
if [[ -f "${PROJECT_DIR}/tests/unit/lib/bats-support/load" ]]; then
  load "${PROJECT_DIR}/tests/unit/lib/bats-support/load"
  load "${PROJECT_DIR}/tests/unit/lib/bats-assert/load"
fi

NAMESPACE="${NAMESPACE:-workspace}"
