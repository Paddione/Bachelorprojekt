#!/usr/bin/env bash
# Tests the committed Systembrett template file structure.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEMPLATE="${REPO_ROOT}/website/public/systembrett/systembrett.whiteboard"

echo "=== systembrett.whiteboard validator ==="

test -f "${TEMPLATE}" || { echo "FAIL: template not found at ${TEMPLATE}"; exit 1; }
echo "  ✓ template file exists"

jq empty "${TEMPLATE}" || { echo "FAIL: template is not valid JSON"; exit 1; }
echo "  ✓ valid JSON"

TYPE=$(jq -r '.type' "${TEMPLATE}")
test "${TYPE}" = "excalidraw" || { echo "FAIL: type=${TYPE}, want excalidraw"; exit 1; }
echo "  ✓ type=excalidraw"

VERSION=$(jq -r '.version' "${TEMPLATE}")
test "${VERSION}" = "2" || { echo "FAIL: version=${VERSION}, want 2"; exit 1; }
echo "  ✓ version=2"

# Count elements marked with groupIds starting with 'piece-' (our tray pieces)
PIECE_COUNT=$(jq '[.elements[] | .groupIds[]? | select(startswith("piece-"))] | unique | length' "${TEMPLATE}")
test "${PIECE_COUNT}" = "15" || { echo "FAIL: piece group count=${PIECE_COUNT}, want 15"; exit 1; }
echo "  ✓ 15 distinct tray piece groups"

# Expect 5 category header text elements
HEADER_COUNT=$(jq '[.elements[] | select(.type == "text" and .customData.role == "category-header")] | length' "${TEMPLATE}")
test "${HEADER_COUNT}" = "5" || { echo "FAIL: category headers=${HEADER_COUNT}, want 5"; exit 1; }
echo "  ✓ 5 category header labels"

# Expect specific category names
EXPECTED_CATEGORIES=("PERSONEN" "SELBST" "THEMEN" "RAHMEN" "VERBINDUNGEN")
for cat in "${EXPECTED_CATEGORIES[@]}"; do
  found=$(jq --arg c "${cat}" '[.elements[] | select(.type == "text" and .customData.role == "category-header" and .text == $c)] | length' "${TEMPLATE}")
  test "${found}" = "1" || { echo "FAIL: category header '${cat}' missing"; exit 1; }
done
echo "  ✓ all 5 category names present"

echo ""
echo "=== all validator checks passed ==="
