#!/usr/bin/env bash
# NFA-07: Lizenz — all components open source
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

NAMESPACE="${NAMESPACE:-workspace}"

# T1: All images from open-source projects
IMAGES=$(kubectl get pods -n "$NAMESPACE" -o jsonpath='{.items[*].spec.containers[*].image}' 2>/dev/null)
assert_contains "$IMAGES" "keycloak" "NFA-07" "T1a" "Keycloak Image vorhanden"
assert_contains "$IMAGES" "nextcloud" "NFA-07" "T1b" "Nextcloud Image vorhanden"
assert_contains "$IMAGES" "postgres" "NFA-07" "T1c" "PostgreSQL Image vorhanden"

# T2: No proprietary images
for vendor in microsoft google amazon zoom slack; do
  assert_not_contains "$IMAGES" "$vendor" "NFA-07" "T2" "Keine ${vendor}-Images vorhanden"
done
