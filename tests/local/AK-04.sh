#!/usr/bin/env bash
# AK-04: Prototyp-Betrieb — setup.sh --check, no proprietary deps
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

NAMESPACE="${NAMESPACE:-workspace}"

# T2: setup.sh --check passes
SETUP_SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/scripts/setup.sh"
if [[ -x "$SETUP_SCRIPT" ]]; then
  assert_cmd "${SETUP_SCRIPT} --check" "AK-04" "T2" "setup.sh --check besteht"
else
  skip_test "AK-04" "T2" "setup.sh --check" "setup.sh nicht gefunden"
fi

# T3: No proprietary images
IMAGES=$(kubectl get pods -n "$NAMESPACE" -o jsonpath='{.items[*].spec.containers[*].image}' 2>/dev/null)
for vendor in microsoft google amazon zoom slack; do
  assert_not_contains "$IMAGES" "$vendor" "AK-04" "T3" "Keine ${vendor}-Images vorhanden"
done
