#!/usr/bin/env bash
# SA-23: offline rendering contract for dormant, GitOps-activatable AI services.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
start=$(_now_ms)
if bash "${REPO_ROOT}/scripts/pytest-run.sh" \
  "${REPO_ROOT}/tests/py/spec/fleet/test_ai_services_scale_zero.py" -q; then
  _log_result SA-23 T1 "AI manifests default to zero and support GitOps activation" \
    pass "$(( $(_now_ms) - start ))"
else
  _log_result SA-23 T1 "AI manifests default to zero and support GitOps activation" \
    fail "$(( $(_now_ms) - start ))" "Offline rendering contract failed; see pytest output"
  exit 1
fi
