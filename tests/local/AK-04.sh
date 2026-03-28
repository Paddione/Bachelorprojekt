#!/usr/bin/env bash
# AK-04: Prototyp-Betrieb — setup.sh --check, no proprietary deps
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

# T2: setup.sh --check passes
if [[ -x "${COMPOSE_DIR}/scripts/setup.sh" ]]; then
  assert_cmd "${COMPOSE_DIR}/scripts/setup.sh --check" "AK-04" "T2" "setup.sh --check besteht"
else
  skip_test "AK-04" "T2" "setup.sh --check" "setup.sh nicht gefunden"
fi

# T3: No proprietary images
IMAGES=$(docker compose -f "${COMPOSE_DIR}/docker-compose.yml" config --images 2>/dev/null)
for vendor in microsoft google amazon zoom slack; do
  assert_not_contains "$IMAGES" "$vendor" "AK-04" "T3" "Keine ${vendor}-Images vorhanden"
done
